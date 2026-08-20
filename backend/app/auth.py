from datetime import datetime, timedelta, timezone
import logging
from typing import Annotated

import jwt
from fastapi import Header, HTTPException, Request, status
from ldap3 import ALL, SUBTREE, Connection, Server
from ldap3.utils.conv import escape_filter_chars

from .config import settings
from .database import execute, fetch_one


HORAS_DURACION_SESION = 8
logger = logging.getLogger("uvicorn.error")


def normalizar_nombre_usuario(nombre_usuario: str) -> str:
    usuario = nombre_usuario.strip()
    if "\\" in usuario:
        usuario = usuario.rsplit("\\", 1)[-1]
    if "@" in usuario:
        usuario = usuario.split("@", 1)[0]
    return usuario.lower()


def candidatos_usuario_directorio(nombre_usuario: str) -> list[str]:
    usuario = nombre_usuario.strip()
    if not settings.ldap_domain or "\\" in usuario or "@" in usuario:
        return [usuario]

    candidatos = [usuario, f"{settings.ldap_domain}\\{usuario}", f"{usuario}@{settings.ldap_domain}"]
    dominio_netbios = settings.ldap_domain.split(".", 1)[0]
    if dominio_netbios and dominio_netbios != settings.ldap_domain:
        candidatos.append(f"{dominio_netbios}\\{usuario}")
    return list(dict.fromkeys(candidatos))


def buscar_dn_usuario(servidor: Server, nombre_usuario: str) -> tuple[str | None, str]:
    if not settings.ldap_bind_user or not settings.ldap_bind_password or not settings.ldap_base_dn:
        return None, "Busqueda DN omitida: falta LDAP_BIND_USER, LDAP_BIND_PASSWORD o LDAP_BASE_DN"

    login = normalizar_nombre_usuario(nombre_usuario)
    filtro = settings.ldap_user_filter.format(login=escape_filter_chars(login))

    with Connection(
        servidor,
        user=settings.ldap_bind_user,
        password=settings.ldap_bind_password,
        auto_bind=True,
    ) as conexion:
        if not conexion.search(
            search_base=settings.ldap_base_dn,
            search_filter=filtro,
            search_scope=SUBTREE,
            attributes=["distinguishedName"],
            size_limit=1,
        ):
            descripcion = conexion.result.get("description", "sin descripcion")
            mensaje = conexion.result.get("message", "")
            return None, f"Busqueda LDAP sin resultado: {descripcion} {mensaje}".strip()
        if not conexion.entries:
            return None, f"Usuario no encontrado con base '{settings.ldap_base_dn}' y filtro '{filtro}'"
        return conexion.entries[0].entry_dn, "Usuario encontrado por busqueda LDAP"


def rechazar_validacion(motivo: str) -> bool:
    logger.warning("Validacion LDAP rechazada: %s", motivo)
    if settings.ad_show_exceptions:
        raise HTTPException(status_code=401, detail=motivo)
    return False


def validar_directorio_activo(nombre_usuario: str, clave: str) -> bool:
    usuario_normalizado = normalizar_nombre_usuario(nombre_usuario)
    if settings.usuarios_permitidos and usuario_normalizado not in settings.usuarios_permitidos:
        return rechazar_validacion(
            f"Usuario '{usuario_normalizado}' no esta en USUARIOS_PERMITIDOS"
        )

    if not settings.ldap_enabled:
        if clave == "admin":
            return True
        return rechazar_validacion("LDAP deshabilitado: solo se acepta la clave de prueba")

    try:
        servidor = Server(settings.ad_url, get_info=ALL)
        dn_usuario, resultado_busqueda = buscar_dn_usuario(servidor, nombre_usuario)
        if dn_usuario:
            conexion = Connection(servidor, user=dn_usuario, password=clave, auto_bind=False)
            if conexion.bind():
                return True
            descripcion = conexion.result.get("description", "sin descripcion")
            mensaje = conexion.result.get("message", "")
            return rechazar_validacion(
                f"Bind fallido para DN encontrado: {descripcion} {mensaje}".strip()
            )

        errores_bind = []
        for usuario_directorio in candidatos_usuario_directorio(nombre_usuario):
            conexion = Connection(servidor, user=usuario_directorio, password=clave, auto_bind=False)
            if conexion.bind():
                return True
            descripcion = conexion.result.get("description", "sin descripcion")
            mensaje = conexion.result.get("message", "")
            errores_bind.append(f"{usuario_directorio}: {descripcion} {mensaje}".strip())
        return rechazar_validacion(
            f"{resultado_busqueda}. Bind directo fallido: {' | '.join(errores_bind)}"
        )
    except Exception as exc:
        logger.exception("Error AD/LDAP durante validacion")
        if settings.ad_show_exceptions:
            raise HTTPException(status_code=502, detail=f"Error AD/LDAP: {exc}") from exc
        return False


def asegurar_usuario(nombre_usuario: str) -> dict:
    usuario = fetch_one(
        """
        SELECT id, nombre_usuario, nombre_completo, rol, activo
        FROM usuarios_app
        WHERE nombre_usuario = %s
        """,
        (nombre_usuario,),
    )
    if usuario:
        if not usuario["activo"]:
            raise HTTPException(status_code=403, detail="Usuario inactivo")
        return usuario

    return execute(
        """
        INSERT INTO usuarios_app (nombre_usuario, nombre_completo, rol)
        VALUES (%s, %s, 'operador')
        RETURNING id, nombre_usuario, nombre_completo, rol, activo
        """,
        (nombre_usuario, nombre_usuario),
    )


def crear_llave_sesion(usuario: dict) -> str:
    ahora = datetime.now(timezone.utc)
    datos = {
        "sub": usuario["nombre_usuario"],
        "nombre": usuario["nombre_completo"],
        "rol": usuario["rol"],
        "iat": int(ahora.timestamp()),
        "exp": int((ahora + timedelta(hours=HORAS_DURACION_SESION)).timestamp()),
    }
    return jwt.encode(datos, settings.secret_key, algorithm="HS256")


def usuario_actual(authorization: Annotated[str | None, Header()] = None) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No autenticado")

    llave_sesion = authorization.removeprefix("Bearer ").strip()
    try:
        datos = jwt.decode(llave_sesion, settings.secret_key, algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail="Sesion invalida") from exc

    usuario = fetch_one(
        """
        SELECT id, nombre_usuario, nombre_completo, rol, activo
        FROM usuarios_app
        WHERE nombre_usuario = %s
        """,
        (datos["sub"],),
    )
    if not usuario or not usuario["activo"]:
        raise HTTPException(status_code=401, detail="Usuario no autorizado")
    return usuario


def registrar_auditoria(
    solicitud: Request,
    nombre_usuario: str,
    accion: str,
    entidad: str,
    entidad_id: int | None = None,
    detalles=None,
):
    execute(
        """
        INSERT INTO auditoria_sistema (nombre_usuario, accion, entidad, entidad_id, direccion_ip, agente_usuario, detalles)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        """,
        (
            nombre_usuario,
            accion,
            entidad,
            entidad_id,
            solicitud.client.host if solicitud.client else None,
            solicitud.headers.get("user-agent"),
            detalles,
        ),
    )

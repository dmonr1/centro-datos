from datetime import datetime, timedelta, timezone
from typing import Annotated

import jwt
from fastapi import Header, HTTPException, Request, status
from ldap3 import ALL, Connection, Server

from .config import settings
from .database import execute, fetch_one


HORAS_DURACION_SESION = 8


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


def validar_directorio_activo(nombre_usuario: str, clave: str) -> bool:
    usuario_normalizado = normalizar_nombre_usuario(nombre_usuario)
    if settings.usuarios_permitidos and usuario_normalizado not in settings.usuarios_permitidos:
        return False

    if not settings.ldap_enabled:
        return clave == "admin"

    try:
        servidor = Server(settings.ad_url, get_info=ALL)
        for usuario_directorio in candidatos_usuario_directorio(nombre_usuario):
            conexion = Connection(servidor, user=usuario_directorio, password=clave, auto_bind=False)
            if conexion.bind():
                return True
        return False
    except Exception as exc:
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

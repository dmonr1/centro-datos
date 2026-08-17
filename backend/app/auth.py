from datetime import datetime, timedelta, timezone
from typing import Annotated

import jwt
from fastapi import Header, HTTPException, Request, status
from ldap3 import ALL, Connection, Server

from .config import settings
from .database import execute, fetch_one


HORAS_DURACION_SESION = 8


def validar_directorio_activo(nombre_usuario: str, clave: str) -> bool:
    if not settings.ldap_enabled:
        return nombre_usuario == "admin" and clave == "admin"

    usuario_directorio = nombre_usuario
    if settings.ldap_domain and "\\" not in nombre_usuario and "@" not in nombre_usuario:
        usuario_directorio = f"{settings.ldap_domain}\\{nombre_usuario}"

    try:
        servidor = Server(settings.ad_url, get_info=ALL)
        conexion = Connection(servidor, user=usuario_directorio, password=clave, auto_bind=False)
        return bool(conexion.bind())
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

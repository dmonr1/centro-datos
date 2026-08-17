import base64
from datetime import date, time

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .auth import (
    asegurar_usuario,
    crear_llave_sesion,
    registrar_auditoria,
    usuario_actual,
    validar_directorio_activo,
)
from .config import PROJECT_DIR, settings
from .database import execute, fetch_all, fetch_one


app = FastAPI(title=settings.app_name)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class SolicitudIngreso(BaseModel):
    nombre_usuario: str = Field(min_length=2, max_length=80)
    clave: str = Field(min_length=1)


class RegistroAccesoEntrada(BaseModel):
    fecha_acceso: date
    nombres_visitante: str = Field(min_length=3, max_length=180)
    documento_visitante: str | None = Field(default=None, max_length=30)
    empresa_o_area: str = Field(min_length=2, max_length=180)
    area_destino: str | None = Field(default=None, max_length=160)
    motivo_acceso: str = Field(min_length=2, max_length=120)
    hora_ingreso: time
    hora_salida: time | None = None
    personal_ogitic: str = Field(min_length=3, max_length=160)
    observaciones: str | None = None


@app.post("/api/autenticacion/ingreso")
def ingresar(datos: SolicitudIngreso, solicitud: Request):
    if not validar_directorio_activo(datos.nombre_usuario, datos.clave):
        raise HTTPException(status_code=401, detail="Credenciales invalidas")

    usuario = asegurar_usuario(datos.nombre_usuario)
    registrar_auditoria(solicitud, usuario["nombre_usuario"], "INGRESO", "autenticacion")
    return {"llave_sesion": crear_llave_sesion(usuario), "usuario": usuario}


@app.get("/api/usuario-actual")
def obtener_usuario_actual(usuario=Depends(usuario_actual)):
    return usuario


@app.get("/api/panel")
def obtener_panel(usuario=Depends(usuario_actual)):
    resumen = fetch_one(
        """
        SELECT
            COUNT(*) FILTER (WHERE fecha_acceso = CURRENT_DATE) AS ingresos_hoy,
            COUNT(*) FILTER (WHERE fecha_acceso = CURRENT_DATE AND estado = 'DENTRO') AS dentro_centro_datos,
            COUNT(*) FILTER (WHERE fecha_acceso = CURRENT_DATE AND estado = 'SALIO') AS salidas_hoy,
            COUNT(*) FILTER (WHERE fecha_acceso = CURRENT_DATE AND estado = 'PENDIENTE') AS pendientes_salida
        FROM registros_acceso
        """
    )
    recientes = fetch_all(
        """
        SELECT id, codigo, nombres_visitante, documento_visitante, empresa_o_area,
               hora_ingreso, hora_salida, estado
        FROM registros_acceso
        ORDER BY fecha_creacion DESC
        LIMIT 6
        """
    )
    return {"resumen": resumen, "recientes": recientes}


@app.get("/api/registros-acceso")
def listar_registros(
    busqueda: str | None = None,
    estado: str | None = None,
    fecha_desde: date | None = None,
    fecha_hasta: date | None = None,
    usuario=Depends(usuario_actual),
):
    condiciones = ["TRUE"]
    parametros = []
    if busqueda:
        condiciones.append("(nombres_visitante ILIKE %s OR empresa_o_area ILIKE %s OR documento_visitante ILIKE %s)")
        termino = f"%{busqueda}%"
        parametros.extend([termino, termino, termino])
    if estado:
        condiciones.append("estado = %s")
        parametros.append(estado.upper())
    if fecha_desde:
        condiciones.append("fecha_acceso >= %s")
        parametros.append(fecha_desde)
    if fecha_hasta:
        condiciones.append("fecha_acceso <= %s")
        parametros.append(fecha_hasta)

    return fetch_all(
        f"""
        SELECT id, codigo, fecha_acceso, nombres_visitante, documento_visitante,
               empresa_o_area, area_destino, motivo_acceso, hora_ingreso,
               hora_salida, personal_ogitic, estado, fecha_creacion
        FROM registros_acceso
        WHERE {' AND '.join(condiciones)}
        ORDER BY fecha_acceso DESC, hora_ingreso DESC, id DESC
        LIMIT 100
        """,
        tuple(parametros),
    )


@app.post("/api/registros-acceso")
def crear_registro(datos: RegistroAccesoEntrada, solicitud: Request, usuario=Depends(usuario_actual)):
    estado = "SALIO" if datos.hora_salida else "DENTRO"
    creado = execute(
        """
        INSERT INTO registros_acceso (
            codigo, fecha_acceso, nombres_visitante, documento_visitante, empresa_o_area,
            area_destino, motivo_acceso, hora_ingreso, hora_salida, personal_ogitic,
            observaciones, estado, creado_por
        )
        VALUES (
            'ACC-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(nextval('secuencia_codigo_acceso')::text, 6, '0'),
            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
        )
        RETURNING id, codigo
        """,
        (
            datos.fecha_acceso,
            datos.nombres_visitante,
            datos.documento_visitante,
            datos.empresa_o_area,
            datos.area_destino,
            datos.motivo_acceso,
            datos.hora_ingreso,
            datos.hora_salida,
            datos.personal_ogitic,
            datos.observaciones,
            estado,
            usuario["nombre_usuario"],
        ),
    )
    registrar_auditoria(solicitud, usuario["nombre_usuario"], "CREAR", "registros_acceso", creado["id"])
    return obtener_registro(creado["id"], usuario)


@app.get("/api/registros-acceso/{registro_id}")
def obtener_registro(registro_id: int, usuario=Depends(usuario_actual)):
    registro = fetch_one(
        """
        SELECT id, codigo, fecha_acceso, nombres_visitante, documento_visitante,
               empresa_o_area, area_destino, motivo_acceso, hora_ingreso,
               hora_salida, personal_ogitic, observaciones, estado, creado_por,
               actualizado_por, fecha_creacion, fecha_actualizacion,
               firma_visitante IS NOT NULL AS tiene_firma_visitante,
               firma_ogitic IS NOT NULL AS tiene_firma_ogitic
        FROM registros_acceso
        WHERE id = %s
        """,
        (registro_id,),
    )
    if not registro:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    firmas = fetch_one(
        """
        SELECT firma_visitante, tipo_firma_visitante, firma_ogitic, tipo_firma_ogitic
        FROM registros_acceso
        WHERE id = %s
        """,
        (registro_id,),
    )
    registro["firma_visitante_base64"] = archivo_a_data_url(
        firmas["firma_visitante"],
        firmas["tipo_firma_visitante"],
    )
    registro["firma_ogitic_base64"] = archivo_a_data_url(
        firmas["firma_ogitic"],
        firmas["tipo_firma_ogitic"],
    )
    return registro


def archivo_a_data_url(archivo, tipo_contenido: str | None):
    if not archivo or not tipo_contenido or not tipo_contenido.startswith("image/"):
        return None
    contenido = base64.b64encode(bytes(archivo)).decode("ascii")
    return f"data:{tipo_contenido};base64,{contenido}"


@app.patch("/api/registros-acceso/{registro_id}/salida")
def marcar_salida(
    registro_id: int,
    solicitud: Request,
    hora_salida: time = Form(...),
    usuario=Depends(usuario_actual),
):
    actualizado = execute(
        """
        UPDATE registros_acceso
        SET hora_salida = %s, estado = 'SALIO', actualizado_por = %s, fecha_actualizacion = NOW()
        WHERE id = %s
        RETURNING id
        """,
        (hora_salida, usuario["nombre_usuario"], registro_id),
    )
    if not actualizado:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    registrar_auditoria(solicitud, usuario["nombre_usuario"], "MARCAR_SALIDA", "registros_acceso", registro_id)
    return obtener_registro(registro_id, usuario)


@app.post("/api/registros-acceso/{registro_id}/firmas")
async def subir_firmas(
    registro_id: int,
    solicitud: Request,
    firma_visitante: UploadFile | None = File(default=None),
    firma_ogitic: UploadFile | None = File(default=None),
    usuario=Depends(usuario_actual),
):
    bytes_firma_visitante = await firma_visitante.read() if firma_visitante else None
    bytes_firma_ogitic = await firma_ogitic.read() if firma_ogitic else None
    actualizado = execute(
        """
        UPDATE registros_acceso
        SET firma_visitante = COALESCE(%s, firma_visitante),
            tipo_firma_visitante = COALESCE(%s, tipo_firma_visitante),
            firma_ogitic = COALESCE(%s, firma_ogitic),
            tipo_firma_ogitic = COALESCE(%s, tipo_firma_ogitic),
            actualizado_por = %s,
            fecha_actualizacion = NOW()
        WHERE id = %s
        RETURNING id
        """,
        (
            bytes_firma_visitante,
            firma_visitante.content_type if firma_visitante else None,
            bytes_firma_ogitic,
            firma_ogitic.content_type if firma_ogitic else None,
            usuario["nombre_usuario"],
            registro_id,
        ),
    )
    if not actualizado:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    registrar_auditoria(solicitud, usuario["nombre_usuario"], "SUBIR_FIRMAS", "registros_acceso", registro_id)
    return obtener_registro(registro_id, usuario)


@app.get("/api/registros-acceso/{registro_id}/firmas/{tipo_firma}")
def obtener_firma(registro_id: int, tipo_firma: str, usuario=Depends(usuario_actual)):
    if tipo_firma not in {"visitante", "ogitic"}:
        raise HTTPException(status_code=404, detail="Firma no encontrada")

    columnas = {
        "visitante": ("firma_visitante", "tipo_firma_visitante"),
        "ogitic": ("firma_ogitic", "tipo_firma_ogitic"),
    }[tipo_firma]
    registro = fetch_one(
        f"""
        SELECT {columnas[0]} AS archivo, {columnas[1]} AS tipo_contenido
        FROM registros_acceso
        WHERE id = %s
        """,
        (registro_id,),
    )
    if not registro or not registro["archivo"]:
        raise HTTPException(status_code=404, detail="Firma no encontrada")

    return Response(
        content=bytes(registro["archivo"]),
        media_type=registro["tipo_contenido"] or "application/octet-stream",
    )


carpeta_frontend = PROJECT_DIR / "frontend"
carpeta_recursos = carpeta_frontend / "assets"
if carpeta_recursos.exists():
    app.mount("/assets", StaticFiles(directory=carpeta_recursos), name="assets")


@app.get("/{ruta:path}")
def frontend(ruta: str):
    archivo = carpeta_frontend / ruta
    if ruta and archivo.is_file():
        return FileResponse(archivo)
    return FileResponse(carpeta_frontend / "index.html")

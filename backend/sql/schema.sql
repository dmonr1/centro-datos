CREATE TABLE IF NOT EXISTS usuarios_app (
    id BIGSERIAL PRIMARY KEY,
    nombre_usuario VARCHAR(80) NOT NULL UNIQUE,
    nombre_completo VARCHAR(160) NOT NULL,
    rol VARCHAR(30) NOT NULL DEFAULT 'operador',
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE SEQUENCE IF NOT EXISTS secuencia_codigo_acceso START WITH 1 INCREMENT BY 1;

CREATE TABLE IF NOT EXISTS registros_acceso (
    id BIGSERIAL PRIMARY KEY,
    codigo VARCHAR(30) NOT NULL UNIQUE,
    fecha_acceso DATE NOT NULL,
    nombres_visitante VARCHAR(180) NOT NULL,
    documento_visitante VARCHAR(30),
    empresa_o_area VARCHAR(180) NOT NULL,
    area_destino VARCHAR(160),
    motivo_acceso VARCHAR(120) NOT NULL,
    hora_ingreso TIME NOT NULL,
    hora_salida TIME,
    personal_ogitic VARCHAR(160) NOT NULL,
    observaciones TEXT,
    estado VARCHAR(20) NOT NULL DEFAULT 'DENTRO',
    firma_visitante BYTEA,
    tipo_firma_visitante VARCHAR(80),
    firma_ogitic BYTEA,
    tipo_firma_ogitic VARCHAR(80),
    creado_por VARCHAR(80) NOT NULL,
    actualizado_por VARCHAR(80),
    fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_estado_registro_acceso CHECK (estado IN ('DENTRO', 'SALIO', 'PENDIENTE'))
);

CREATE INDEX IF NOT EXISTS idx_registros_acceso_fecha ON registros_acceso(fecha_acceso);
CREATE INDEX IF NOT EXISTS idx_registros_acceso_estado ON registros_acceso(estado);
CREATE INDEX IF NOT EXISTS idx_registros_acceso_visitante ON registros_acceso(nombres_visitante);

CREATE TABLE IF NOT EXISTS auditoria_sistema (
    id BIGSERIAL PRIMARY KEY,
    nombre_usuario VARCHAR(80) NOT NULL,
    accion VARCHAR(80) NOT NULL,
    entidad VARCHAR(80) NOT NULL,
    entidad_id BIGINT,
    direccion_ip VARCHAR(80),
    agente_usuario TEXT,
    detalles JSONB,
    fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO usuarios_app (nombre_usuario, nombre_completo, rol)
VALUES ('admin', 'Admin Sistema', 'administrador')
ON CONFLICT (nombre_usuario) DO NOTHING;

-- =============================================================================
-- SIPREF Reservas · V001 · Esquema inicial (ADITIVO)
-- -----------------------------------------------------------------------------
-- ESTADO: BORRADOR PARA REVISIÓN. NO EJECUTAR CONTRA LA BASE COMPARTIDA SIN
--         APROBACIÓN DEL EQUIPO DE SIPREF PRINCIPAL.
-- Motor:  PostgreSQL >= 13 (usa gen_random_uuid() nativo).
-- Reglas: - Solo CREA objetos con prefijo "reservas_".
--         - No contiene ALTER / DROP / RENAME sobre tablas de SIPREF principal.
--         - No crea llaves foráneas físicas hacia tablas de SIPREF principal
--           (las referencias a espacios/administradores son lógicas y se
--           validan en el backend) para no bloquear operaciones del principal.
--         - Idempotente: se puede revisar con "IF NOT EXISTS".
-- Ejecutar con el rol: sipref_reservas_migrator (ver db/roles).
-- Reversa: V001__reservas_esquema_inicial.down.sql
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Configuración propia
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reservas_configuracion (
    clave           TEXT        PRIMARY KEY,
    valor           JSONB       NOT NULL,
    descripcion     TEXT,
    actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 2. Cuentas Google (clave principal = "sub" de Google, nunca el correo)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reservas_usuarios (
    google_sub        TEXT        PRIMARY KEY,
    correo            TEXT        NOT NULL,
    correo_verificado BOOLEAN     NOT NULL DEFAULT FALSE,
    nombre            TEXT        NOT NULL,
    foto_url          TEXT,
    rol               TEXT        CHECK (rol IN ('DOCENTE', 'PERSONAL', 'ADMIN_ESPACIOS')),
    estado            TEXT        NOT NULL DEFAULT 'PENDIENTE'
                      CHECK (estado IN ('PENDIENTE', 'APROBADA', 'RECHAZADA', 'REVOCADA', 'EXPIRADA')),
    creado_en         TIMESTAMPTZ NOT NULL DEFAULT now(),
    actualizado_en    TIMESTAMPTZ NOT NULL DEFAULT now(),
    ultimo_acceso_en  TIMESTAMPTZ,
    CONSTRAINT reservas_usuarios_rol_si_aprobada
        CHECK (estado <> 'APROBADA' OR rol IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS reservas_usuarios_correo_idx ON reservas_usuarios (lower(correo));
CREATE INDEX IF NOT EXISTS reservas_usuarios_estado_idx ON reservas_usuarios (estado);

-- -----------------------------------------------------------------------------
-- 3. Solicitudes de acceso (historial completo; una sola PENDIENTE por cuenta)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reservas_solicitudes_acceso (
    id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    google_sub           TEXT        NOT NULL REFERENCES reservas_usuarios (google_sub),
    correo               TEXT        NOT NULL,          -- copia al momento del intento
    nombre               TEXT        NOT NULL,
    foto_url             TEXT,
    estado               TEXT        NOT NULL DEFAULT 'PENDIENTE'
                         CHECK (estado IN ('PENDIENTE', 'APROBADA', 'RECHAZADA', 'REVOCADA', 'EXPIRADA')),
    intentado_en         TIMESTAMPTZ NOT NULL DEFAULT now(),
    ultimo_intento_en    TIMESTAMPTZ NOT NULL DEFAULT now(),
    intentos             INTEGER     NOT NULL DEFAULT 1 CHECK (intentos >= 1),
    expira_en            TIMESTAMPTZ NOT NULL,
    rol_asignado         TEXT        CHECK (rol_asignado IN ('DOCENTE', 'PERSONAL', 'ADMIN_ESPACIOS')),
    resuelto_por_id      TEXT,       -- ID del administrador en SIPREF principal (referencia lógica)
    resuelto_por_nombre  TEXT,
    resuelto_en          TIMESTAMPTZ,
    motivo               TEXT,
    ip_origen            TEXT,
    user_agent           TEXT,
    CONSTRAINT reservas_solicitudes_resolucion_coherente CHECK (
        (estado = 'PENDIENTE' AND resuelto_en IS NULL)
        OR (estado = 'EXPIRADA')
        OR (estado IN ('APROBADA', 'RECHAZADA', 'REVOCADA') AND resuelto_en IS NOT NULL)
    ),
    CONSTRAINT reservas_solicitudes_rol_si_aprobada
        CHECK (estado <> 'APROBADA' OR rol_asignado IS NOT NULL)
);
-- Evita notificaciones duplicadas: solo puede existir UNA solicitud pendiente por cuenta.
CREATE UNIQUE INDEX IF NOT EXISTS reservas_solicitudes_una_pendiente_uq
    ON reservas_solicitudes_acceso (google_sub) WHERE estado = 'PENDIENTE';
CREATE INDEX IF NOT EXISTS reservas_solicitudes_estado_idx
    ON reservas_solicitudes_acceso (estado, intentado_en DESC);

-- -----------------------------------------------------------------------------
-- 4. Sesiones de servidor (revocables). Se guarda el HASH del token, nunca el token.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reservas_sesiones (
    token_hash    TEXT        PRIMARY KEY,
    google_sub    TEXT        NOT NULL REFERENCES reservas_usuarios (google_sub),
    creado_en     TIMESTAMPTZ NOT NULL DEFAULT now(),
    expira_en     TIMESTAMPTZ NOT NULL,
    revocada_en   TIMESTAMPTZ,
    ip            TEXT,
    user_agent    TEXT
);
CREATE INDEX IF NOT EXISTS reservas_sesiones_sub_idx ON reservas_sesiones (google_sub);

-- -----------------------------------------------------------------------------
-- 5. Catálogo de recursos
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reservas_recursos_catalogo (
    id              SERIAL      PRIMARY KEY,
    nombre          TEXT        NOT NULL,
    unidad          TEXT        NOT NULL DEFAULT 'pieza',
    activo          BOOLEAN     NOT NULL DEFAULT TRUE,
    es_predefinido  BOOLEAN     NOT NULL DEFAULT FALSE,
    creado_por      TEXT        REFERENCES reservas_usuarios (google_sub),
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS reservas_recursos_catalogo_nombre_uq
    ON reservas_recursos_catalogo (lower(nombre));

-- -----------------------------------------------------------------------------
-- 6. Reservaciones
--    estado almacenado: PROGRAMADA | CANCELADA.
--    "REALIZADA" se deriva (estado = PROGRAMADA y fin < now()).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reservas_reservaciones (
    id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo                TEXT        NOT NULL,
    tipo_evento           TEXT        NOT NULL
                          CHECK (tipo_evento IN ('CONFERENCIA', 'TALLER', 'JUNTA', 'EXAMEN', 'OTRO')),
    espacio_id            TEXT        NOT NULL,  -- referencia lógica al espacio en SIPREF principal
    espacio_nombre        TEXT        NOT NULL,  -- copia informativa para el expediente
    nombre_evento         TEXT        NOT NULL CHECK (length(trim(nombre_evento)) > 0),
    inicio                TIMESTAMPTZ NOT NULL,
    fin                   TIMESTAMPTZ NOT NULL,
    responsable           TEXT        NOT NULL,
    correo_responsable    TEXT,
    descripcion           TEXT,
    observaciones         TEXT,
    asistentes_estimados  INTEGER     CHECK (asistentes_estimados IS NULL OR asistentes_estimados >= 0),
    estado                TEXT        NOT NULL DEFAULT 'PROGRAMADA'
                          CHECK (estado IN ('PROGRAMADA', 'CANCELADA')),
    creado_por            TEXT        NOT NULL REFERENCES reservas_usuarios (google_sub),
    creado_en             TIMESTAMPTZ NOT NULL DEFAULT now(),
    actualizado_en        TIMESTAMPTZ NOT NULL DEFAULT now(),
    cancelado_por         TEXT        REFERENCES reservas_usuarios (google_sub),
    cancelado_en          TIMESTAMPTZ,
    motivo_cancelacion    TEXT,
    version               INTEGER     NOT NULL DEFAULT 1,  -- control de concurrencia optimista
    CONSTRAINT reservas_reservaciones_rango_valido CHECK (fin > inicio),
    CONSTRAINT reservas_reservaciones_duracion_maxima CHECK (fin - inicio <= INTERVAL '24 hours'),
    CONSTRAINT reservas_reservaciones_cancelacion_coherente
        CHECK (estado <> 'CANCELADA' OR cancelado_en IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS reservas_reservaciones_codigo_uq ON reservas_reservaciones (codigo);
CREATE INDEX IF NOT EXISTS reservas_reservaciones_espacio_rango_idx
    ON reservas_reservaciones (espacio_id, inicio, fin) WHERE estado = 'PROGRAMADA';
CREATE INDEX IF NOT EXISTS reservas_reservaciones_inicio_idx ON reservas_reservaciones (inicio);
CREATE INDEX IF NOT EXISTS reservas_reservaciones_creado_por_idx ON reservas_reservaciones (creado_por);

-- -----------------------------------------------------------------------------
-- 7. Recursos asignados a cada evento
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reservas_recursos_evento (
    reservacion_id  UUID    NOT NULL REFERENCES reservas_reservaciones (id) ON DELETE CASCADE,
    recurso_id      INTEGER NOT NULL REFERENCES reservas_recursos_catalogo (id),
    cantidad        INTEGER NOT NULL CHECK (cantidad > 0 AND cantidad <= 10000),
    notas           TEXT,
    PRIMARY KEY (reservacion_id, recurso_id)
);

-- -----------------------------------------------------------------------------
-- 8. Recordatorios
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reservas_recordatorios (
    id              BIGSERIAL   PRIMARY KEY,
    reservacion_id  UUID        NOT NULL REFERENCES reservas_reservaciones (id) ON DELETE CASCADE,
    canal           TEXT        NOT NULL CHECK (canal IN ('SIPREF', 'CORREO')),
    anticipacion    INTEGER     NOT NULL CHECK (anticipacion > 0),
    unidad          TEXT        NOT NULL CHECK (unidad IN ('MINUTOS', 'HORAS', 'DIAS')),
    enviar_en       TIMESTAMPTZ NOT NULL,
    enviado_en      TIMESTAMPTZ,
    intentos        INTEGER     NOT NULL DEFAULT 0,
    ultimo_error    TEXT
);
CREATE INDEX IF NOT EXISTS reservas_recordatorios_pendientes_idx
    ON reservas_recordatorios (enviar_en) WHERE enviado_en IS NULL;

-- -----------------------------------------------------------------------------
-- 9. Bandeja de salida de notificaciones hacia SIPREF principal (patrón outbox)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reservas_notificaciones_salida (
    id                  BIGSERIAL   PRIMARY KEY,
    tipo                TEXT        NOT NULL,   -- p. ej. 'solicitud_acceso.creada'
    clave_idempotencia  TEXT        NOT NULL,
    payload             JSONB       NOT NULL,
    creado_en           TIMESTAMPTZ NOT NULL DEFAULT now(),
    entregado_en        TIMESTAMPTZ,
    intentos            INTEGER     NOT NULL DEFAULT 0,
    proximo_intento_en  TIMESTAMPTZ NOT NULL DEFAULT now(),
    ultimo_error        TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS reservas_notificaciones_salida_idem_uq
    ON reservas_notificaciones_salida (clave_idempotencia);
CREATE INDEX IF NOT EXISTS reservas_notificaciones_salida_pendientes_idx
    ON reservas_notificaciones_salida (proximo_intento_en) WHERE entregado_en IS NULL;

-- -----------------------------------------------------------------------------
-- 10. Auditoría (solo inserción; el rol de la app NO tiene UPDATE ni DELETE)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reservas_auditoria (
    id             BIGSERIAL   PRIMARY KEY,
    ocurrido_en    TIMESTAMPTZ NOT NULL DEFAULT now(),
    actor_tipo     TEXT        NOT NULL CHECK (actor_tipo IN ('USUARIO_RESERVAS', 'ADMIN_PRINCIPAL', 'SISTEMA')),
    actor_id       TEXT,
    actor_nombre   TEXT,
    accion         TEXT        NOT NULL,  -- p. ej. 'reservacion.crear', 'solicitud.aprobar'
    entidad        TEXT        NOT NULL,  -- p. ej. 'reservas_reservaciones'
    entidad_id     TEXT,
    datos_antes    JSONB,
    datos_despues  JSONB,
    ip             TEXT,
    user_agent     TEXT
);
CREATE INDEX IF NOT EXISTS reservas_auditoria_entidad_idx ON reservas_auditoria (entidad, entidad_id, ocurrido_en DESC);
CREATE INDEX IF NOT EXISTS reservas_auditoria_fecha_idx ON reservas_auditoria (ocurrido_en DESC);

-- -----------------------------------------------------------------------------
-- 11. Datos iniciales (solo en tablas propias)
-- -----------------------------------------------------------------------------
INSERT INTO reservas_configuracion (clave, valor, descripcion) VALUES
    ('solicitud_expiracion_dias', '30',         'Días tras los cuales una solicitud PENDIENTE expira'),
    ('buffer_minutos',            '15',         'Minutos de separación obligatoria entre eventos en un mismo espacio'),
    ('ciclo_actual',              '"2026-B"',   'Ciclo escolar mostrado en el encabezado'),
    ('dominios_permitidos',       '[]',         'Lista de dominios de correo permitidos; vacía = cualquier cuenta Google'),
    ('zona_horaria',              '"America/Mexico_City"', 'Zona horaria institucional')
ON CONFLICT (clave) DO NOTHING;

INSERT INTO reservas_recursos_catalogo (nombre, unidad, es_predefinido) VALUES
    ('Micrófono', 'pieza', TRUE),
    ('Sillas', 'pieza', TRUE),
    ('Mesas', 'pieza', TRUE),
    ('Proyector', 'pieza', TRUE),
    ('Computadora', 'pieza', TRUE),
    ('Bocina', 'pieza', TRUE),
    ('Extensión eléctrica', 'pieza', TRUE),
    ('Mampara', 'pieza', TRUE),
    ('Pizarra', 'pieza', TRUE),
    ('Pantalla de proyección', 'pieza', TRUE)
ON CONFLICT DO NOTHING;

COMMIT;

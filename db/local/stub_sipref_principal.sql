-- =============================================================================
-- SOLO LOCAL – simula SIPREF principal
-- -----------------------------------------------------------------------------
-- Estas tablas NO existen con estos nombres en producción. Representan, para
-- desarrollo local, las tablas de espacios y reservaciones de SIPREF principal.
-- El adaptador apps/api/src/principal/adaptador.ts las consulta por defecto
-- (ver constantes al inicio del adaptador; TODO(SIPREF): ajustar a nombres reales).
-- NUNCA ejecutar este script contra la base compartida.
-- =============================================================================

CREATE TABLE IF NOT EXISTS sipref_espacios (
    id         TEXT    PRIMARY KEY,
    nombre     TEXT    NOT NULL,
    capacidad  INTEGER NOT NULL,
    tipo       TEXT    NOT NULL,
    edificio   TEXT    NOT NULL,
    activo     BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS sipref_reservaciones (
    id            TEXT        PRIMARY KEY,
    espacio_id    TEXT        NOT NULL REFERENCES sipref_espacios (id),
    titulo        TEXT        NOT NULL,
    responsable   TEXT        NOT NULL,
    fecha_inicio  TIMESTAMPTZ NOT NULL,
    fecha_fin     TIMESTAMPTZ NOT NULL,
    estado        TEXT        NOT NULL DEFAULT 'CONFIRMADA'  -- CONFIRMADA | CANCELADA
);

INSERT INTO sipref_espacios (id, nombre, capacidad, tipo, edificio, activo) VALUES
    ('A-101', 'Aula 101',                  40,  'Aula',        'Edificio A', TRUE),
    ('A-102', 'Aula 102',                  40,  'Aula',        'Edificio A', TRUE),
    ('A-201', 'Aula 201',                  35,  'Aula',        'Edificio A', TRUE),
    ('B-105', 'Aula 105',                  30,  'Aula',        'Edificio B', TRUE),
    ('AUD-1', 'Auditorio Principal',       250, 'Auditorio',   'Edificio Central', TRUE),
    ('SJ-1',  'Sala de Juntas',            14,  'Sala',        'Rectoría', TRUE),
    ('LAB-C1','Laboratorio de Cómputo',    30,  'Laboratorio', 'Edificio C', TRUE),
    ('LAB-C2','Laboratorio de Cómputo 2',  25,  'Laboratorio', 'Edificio C', FALSE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO sipref_reservaciones (id, espacio_id, titulo, responsable, fecha_inicio, fecha_fin, estado) VALUES
    ('P-1001', 'AUD-1', 'Ceremonia de inicio de semestre', 'Rectoría',
        '2026-11-20T09:00:00-06:00', '2026-11-20T12:00:00-06:00', 'CONFIRMADA'),
    ('P-1002', 'A-101', 'Clase de Cálculo I (reposición)', 'Dr. Ramírez',
        '2026-11-23T16:00:00-06:00', '2026-11-23T18:00:00-06:00', 'CONFIRMADA'),
    ('P-1003', 'SJ-1',  'Consejo Académico', 'Secretaría Académica',
        '2026-11-25T10:00:00-06:00', '2026-11-25T13:00:00-06:00', 'CONFIRMADA'),
    ('P-1004', 'LAB-C1','Examen de certificación', 'Coordinación de TI',
        '2026-12-02T08:00:00-06:00', '2026-12-02T11:00:00-06:00', 'CONFIRMADA'),
    ('P-1005', 'AUD-1', 'Posada institucional', 'Recursos Humanos',
        '2026-12-11T17:00:00-06:00', '2026-12-11T21:00:00-06:00', 'CONFIRMADA'),
    ('P-1006', 'A-102', 'Asesoría grupal (cancelada)', 'Mtra. Torres',
        '2026-11-27T12:00:00-06:00', '2026-11-27T14:00:00-06:00', 'CANCELADA'),
    -- Evento lejano, usado por las pruebas de integración para verificar
    -- conflictos contra SIPREF principal sin depender de la fecha actual.
    ('P-9001', 'AUD-1', 'Ceremonia de graduación 2032 (fixture de pruebas)', 'Rectoría',
        '2032-06-15T10:00:00-06:00', '2032-06-15T13:00:00-06:00', 'CONFIRMADA')
ON CONFLICT (id) DO NOTHING;

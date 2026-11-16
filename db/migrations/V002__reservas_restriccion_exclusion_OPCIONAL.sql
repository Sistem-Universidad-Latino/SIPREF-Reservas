-- =============================================================================
-- SIPREF Reservas · V002 · Restricción de exclusión de horarios (OPCIONAL)
-- -----------------------------------------------------------------------------
-- ESTADO: BORRADOR. REQUIERE APROBACIÓN ESPECÍFICA.
-- Motivo de aprobación aparte: requiere la extensión btree_gist, que es un objeto
-- a nivel de base de datos (no de tabla) y la debe instalar un DBA.
-- Efecto: la base de datos rechaza, aun ante un error del backend, dos
-- reservaciones PROGRAMADAS de SIPREF Reservas que se traslapen en el mismo
-- espacio considerando 15 minutos de buffer. Solo afecta a reservas_reservaciones.
-- Sin esta migración, el backend sigue protegido por candado transaccional
-- (pg_advisory_xact_lock) + verificación dentro de la transacción.
-- =============================================================================
BEGIN;

CREATE EXTENSION IF NOT EXISTS btree_gist;  -- lo ejecuta el DBA

ALTER TABLE reservas_reservaciones           -- tabla PROPIA de SIPREF Reservas
    ADD CONSTRAINT reservas_reservaciones_sin_traslape
    EXCLUDE USING gist (
        espacio_id WITH =,
        tstzrange(inicio, fin + INTERVAL '15 minutes', '[)') WITH &&
    ) WHERE (estado = 'PROGRAMADA');

COMMIT;

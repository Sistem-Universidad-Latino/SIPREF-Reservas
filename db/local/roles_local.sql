-- =============================================================================
-- SOLO LOCAL – rol de la aplicación con privilegio mínimo (espejo de
-- db/roles/R001__roles_sipref_reservas.sql). Contraseña de desarrollo local.
-- =============================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sipref_reservas_app') THEN
        CREATE ROLE sipref_reservas_app LOGIN PASSWORD 'app_local_dev' NOSUPERUSER NOCREATEDB NOCREATEROLE
            CONNECTION LIMIT 40;
    END IF;
END $$;

GRANT CONNECT ON DATABASE sipref TO sipref_reservas_app;
GRANT USAGE ON SCHEMA public TO sipref_reservas_app;
ALTER ROLE sipref_reservas_app SET statement_timeout = '15s';
ALTER ROLE sipref_reservas_app SET idle_in_transaction_session_timeout = '30s';

-- Solo lectura sobre las tablas que simulan SIPREF principal
GRANT SELECT ON sipref_espacios, sipref_reservaciones TO sipref_reservas_app;

-- Escritura solo sobre tablas propias
GRANT SELECT, INSERT, UPDATE, DELETE ON
    reservas_configuracion,
    reservas_usuarios,
    reservas_solicitudes_acceso,
    reservas_sesiones,
    reservas_recursos_catalogo,
    reservas_reservaciones,
    reservas_recursos_evento,
    reservas_recordatorios,
    reservas_notificaciones_salida
TO sipref_reservas_app;

-- Auditoría: solo agregar y leer
GRANT SELECT, INSERT ON reservas_auditoria TO sipref_reservas_app;

GRANT USAGE, SELECT ON SEQUENCE
    reservas_recursos_catalogo_id_seq,
    reservas_recordatorios_id_seq,
    reservas_notificaciones_salida_id_seq,
    reservas_auditoria_id_seq
TO sipref_reservas_app;

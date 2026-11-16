-- =============================================================================
-- SIPREF Reservas · Roles de base de datos con privilegio mínimo
-- -----------------------------------------------------------------------------
-- ESTADO: BORRADOR. Lo ejecuta un DBA de SIPREF principal, NO esta aplicación.
-- Reemplazar los marcadores <...> antes de ejecutar. No guardar contraseñas en Git.
-- =============================================================================

-- 1) Rol para migraciones (lo usa una persona, solo al aplicar migraciones aprobadas)
CREATE ROLE sipref_reservas_migrator LOGIN PASSWORD '<CONTRASENA_MIGRATOR>' NOSUPERUSER NOCREATEDB NOCREATEROLE;
GRANT CONNECT ON DATABASE <NOMBRE_BD> TO sipref_reservas_migrator;
GRANT USAGE, CREATE ON SCHEMA public TO sipref_reservas_migrator;
--  Nota: CREATE en el esquema permite crear objetos nuevos, pero NO modificar
--  tablas de SIPREF principal (para eso se requiere ser su dueño).
--  Alternativa recomendada: un esquema exclusivo "reservas" (ver docs/MODELO_DATOS_PROPUESTO.md).

-- 2) Rol de la aplicación (lo usa el backend en Render)
CREATE ROLE sipref_reservas_app LOGIN PASSWORD '<CONTRASENA_APP>' NOSUPERUSER NOCREATEDB NOCREATEROLE
    CONNECTION LIMIT 20;
GRANT CONNECT ON DATABASE <NOMBRE_BD> TO sipref_reservas_app;
GRANT USAGE ON SCHEMA public TO sipref_reservas_app;
ALTER ROLE sipref_reservas_app SET statement_timeout = '15s';
ALTER ROLE sipref_reservas_app SET idle_in_transaction_session_timeout = '30s';

-- 2a) SOLO LECTURA sobre las tablas de SIPREF principal que se necesitan.
--     Ajustar a los nombres reales (pendiente de confirmar con el equipo):
-- GRANT SELECT ON <tabla_espacios>       TO sipref_reservas_app;
-- GRANT SELECT ON <tabla_reservaciones>  TO sipref_reservas_app;
-- (Opcional, para mostrar nombre del admin) GRANT SELECT (id, nombre) ON <tabla_usuarios_admin> TO sipref_reservas_app;

-- 2b) Escritura SOLO sobre tablas propias (ejecutar después de V001)
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

-- Auditoría: solo agregar y leer (inmutable para la app)
GRANT SELECT, INSERT ON reservas_auditoria TO sipref_reservas_app;

GRANT USAGE, SELECT ON SEQUENCE
    reservas_recursos_catalogo_id_seq,
    reservas_recordatorios_id_seq,
    reservas_notificaciones_salida_id_seq,
    reservas_auditoria_id_seq
TO sipref_reservas_app;

-- 3) Restricción de red (pg_hba.conf o firewall del proveedor) — ver README:
--    hostssl <NOMBRE_BD> sipref_reservas_app <IP_SALIDA_RENDER>/32 scram-sha-256

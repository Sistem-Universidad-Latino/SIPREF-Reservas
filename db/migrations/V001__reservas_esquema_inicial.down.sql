-- =============================================================================
-- SIPREF Reservas · V001 · REVERSA
-- Solo elimina objetos propios con prefijo "reservas_". No toca nada de SIPREF principal.
-- ADVERTENCIA: borra los datos de SIPREF Reservas. Respaldar antes.
-- =============================================================================
BEGIN;
DROP TABLE IF EXISTS reservas_auditoria;
DROP TABLE IF EXISTS reservas_notificaciones_salida;
DROP TABLE IF EXISTS reservas_recordatorios;
DROP TABLE IF EXISTS reservas_recursos_evento;
DROP TABLE IF EXISTS reservas_reservaciones;
DROP TABLE IF EXISTS reservas_recursos_catalogo;
DROP TABLE IF EXISTS reservas_sesiones;
DROP TABLE IF EXISTS reservas_solicitudes_acceso;
DROP TABLE IF EXISTS reservas_usuarios;
DROP TABLE IF EXISTS reservas_configuracion;
COMMIT;

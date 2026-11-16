BEGIN;
ALTER TABLE reservas_reservaciones DROP CONSTRAINT IF EXISTS reservas_reservaciones_sin_traslape;
-- La extensión btree_gist NO se elimina aquí: otros sistemas podrían usarla.
COMMIT;

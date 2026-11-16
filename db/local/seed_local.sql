-- =============================================================================
-- SOLO LOCAL – datos de ejemplo para desarrollo (opcional)
-- =============================================================================

INSERT INTO reservas_usuarios (google_sub, correo, correo_verificado, nombre, rol, estado)
VALUES
    ('dev-admin', 'admin.espacios@ulatino.edu.mx', TRUE, 'Admin de Espacios (local)', 'ADMIN_ESPACIOS', 'APROBADA'),
    ('dev-docente', 'ana.lopez@ulatino.edu.mx', TRUE, 'Mtra. Ana López (local)', 'DOCENTE', 'APROBADA')
ON CONFLICT (google_sub) DO NOTHING;

INSERT INTO reservas_reservaciones
    (codigo, tipo_evento, espacio_id, espacio_nombre, nombre_evento, inicio, fin,
     responsable, correo_responsable, descripcion, asistentes_estimados, creado_por)
VALUES
    ('RES-2026-000001', 'CONFERENCIA', 'AUD-1', 'Auditorio Principal', 'Foro de Innovación',
     '2026-11-26T10:00:00-06:00', '2026-11-26T12:00:00-06:00',
     'Mtra. Ana López', 'ana.lopez@ulatino.edu.mx', 'Foro anual de proyectos', 180, 'dev-docente'),
    ('RES-2026-000002', 'TALLER', 'LAB-C1', 'Laboratorio de Cómputo', 'Taller de Python',
     '2026-12-03T16:00:00-06:00', '2026-12-03T19:00:00-06:00',
     'Mtra. Ana López', 'ana.lopez@ulatino.edu.mx', NULL, 25, 'dev-docente')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO reservas_recursos_evento (reservacion_id, recurso_id, cantidad)
SELECT r.id, c.id, x.cantidad
FROM (VALUES ('RES-2026-000001', 'Micrófono', 2), ('RES-2026-000001', 'Proyector', 1),
             ('RES-2026-000002', 'Computadora', 25)) AS x(codigo, recurso, cantidad)
JOIN reservas_reservaciones r ON r.codigo = x.codigo
JOIN reservas_recursos_catalogo c ON c.nombre = x.recurso
ON CONFLICT DO NOTHING;

# Propuesta de cambios para SIPREF principal

> [!IMPORTANT]
> **Este documento NO se ha aplicado.** Es una propuesta para que el equipo responsable de SIPREF principal la revise y, si la aprueba, la implemente en su propio código. Todos los cambios son **aditivos**: no se modifica, renombra ni elimina nada existente (inicio de sesión, registro, calendario, historial, gestión de espacios ni bitácora).

## Resumen

| # | Cambio | Tipo | Prioridad |
|---|---|---|---|
| P1 | Cliente de la API de integración de SIPREF Reservas | Módulo nuevo (backend) | Alta |
| P2 | Notificación "Solicitud de acceso a SIPREF Reservas" con botones Permitir / Rechazar | Componente nuevo en el centro de notificaciones | Alta |
| P3 | Pantalla "Solicitudes de SIPREF Reservas" con filtros y bitácora | Ruta y pantalla nuevas | Alta |
| P4 | Considerar las reservaciones de SIPREF Reservas al validar conflictos y mostrarlas en el calendario | Lógica adicional (opt-in) | Media |
| P5 | Receptor de webhook (opcional) | Endpoint nuevo | Baja |
| P6 | Permisos de base de datos para el usuario dedicado | Tarea del DBA | Alta |

---

## P1. Cliente de la API de integración

- **Qué:** un módulo nuevo en el backend del principal (por ejemplo `integraciones/sipref-reservas/cliente.*`) que firme las peticiones con HMAC según [CONTRATOS_API.md §2](CONTRATOS_API.md).
- **Dónde:** carpeta nueva; no se toca ningún archivo existente salvo el registro de la ruta nueva de P3, si su framework lo exige (una línea aditiva).
- **Variables de entorno nuevas** en el principal (no se cambia ninguna existente):
  - `SIPREF_RESERVAS_API_URL` (por ejemplo `https://sipref-reservas-api.onrender.com/api/integracion/v1`)
  - `SIPREF_RESERVAS_KEY_ID`
  - `SIPREF_RESERVAS_SECRET` (el mismo valor que `INTEGRACION_SECRET` en Render, intercambiado por un canal seguro)
- **Por qué:** SIPREF Reservas es el dueño de las solicitudes. El principal solo las consulta y las resuelve, y así no necesita permisos de escritura sobre tablas ajenas.

Ejemplo de firma (pseudocódigo):

```text
ts   = segundos_unix_actuales()
body = json(cuerpo) o ""
base = ts + "." + METODO + "." + ruta_con_query + "." + sha256_hex(body)
firma = hmac_sha256_hex(SIPREF_RESERVAS_SECRET, base)
Encabezados: X-SIPREF-Key-Id, X-SIPREF-Timestamp: ts, X-SIPREF-Signature: firma
```

## P2. Notificación con Permitir / Rechazar

- **Qué:** un tipo de notificación nuevo en el centro de notificaciones existente.
- **Origen de los datos** (una de las dos):
  - webhook `solicitud_acceso.creada` (P5), o
  - consulta periódica a `GET /solicitudes/conteo` y `GET /solicitudes?estado=PENDIENTE` (por ejemplo cada minuto, o al abrir el centro de notificaciones).
- **Contenido:** foto, nombre y correo de Google, y fecha y hora del intento.
- **Botones:**
  - **Permitir** → selector de rol (Docente, Personal, Administrador de espacios) → `POST /solicitudes/:id/aprobar` con `{ rol, admin: { id, nombre } }` del administrador en sesión.
  - **Rechazar** → motivo opcional → `POST /solicitudes/:id/rechazar`.
- **Duplicados:** SIPREF Reservas garantiza una sola solicitud pendiente por cuenta. El principal debe usar `solicitudId` (o `idEvento` del webhook) como clave para no mostrar duplicados.
- **Bitácora:** al resolver, registrar en la bitácora existente del principal, con su mecanismo actual, quién, cuándo, acción y solicitud. SIPREF Reservas también lo registra en `reservas_auditoria`.
- **Errores:** si la API responde `409 ESTADO_INVALIDO` (otro admin ya la resolvió), refrescar y mostrar "Esta solicitud ya fue atendida".

## P3. Pantalla "Solicitudes de SIPREF Reservas"

- **Qué:** ruta nueva (por ejemplo `/administracion/sipref-reservas/solicitudes`), visible solo para los administradores del principal, y una entrada nueva en el menú de administración.
- **Filtros:** Todas, Pendientes, Aprobadas, Rechazadas, Revocadas (y Expiradas, opcional), más un buscador por nombre o correo.
- **Tabla:** foto, nombre, correo, fecha de solicitud, intentos, estado, rol, resuelto por y fecha de resolución.
- **Acciones:**
  - Permitir o Rechazar (si está pendiente);
  - **Revocar** (si está aprobada; no borra la cuenta) → `POST /usuarios/:sub/revocar`;
  - **Reactivar** (si está revocada).
- **Pestaña "Bitácora":** `GET /bitacora` con filtros de fecha y acción.
- **Por qué:** cumple los puntos 5 y 7 del flujo de acceso (rol, revocación sin borrado, trazabilidad).

## P4. Conflictos de horario entre ambos sistemas (recomendado)

Hoy SIPREF Reservas ya evita choques con las reservaciones del principal, pero el principal no conoce las de SIPREF Reservas. Hay dos opciones aditivas, a elegir por el equipo:

- **Opción A (sin acceso a base):** antes de guardar una reservación, el principal llama a `GET /ocupacion?desde&hasta&espacioId` y rechaza los traslapes, considerando 15 minutos de buffer.
- **Opción B (base de datos):**
  - otorgar `SELECT` sobre `reservas_reservaciones` al usuario de base del principal;
  - dentro de la transacción de guardado, ejecutar primero `SELECT pg_advisory_xact_lock(hashtext('reservas:espacio:' || :espacio_id))` y luego verificar traslapes también en `reservas_reservaciones WHERE estado='PROGRAMADA'`.

  Esta opción cierra por completo la ventana de concurrencia (ver ARQUITECTURA.md §3).
- **Calendario del principal (opcional):** mostrar los eventos de SIPREF Reservas como solo lectura, con la etiqueta "SIPREF Reservas".

## P5. Receptor de webhook (opcional)

- **Qué:** endpoint nuevo, por ejemplo `POST /api/integraciones/sipref-reservas/webhook`.
- **Verificación:** firma HMAC con un secreto compartido, que en SIPREF Reservas es `PRINCIPAL_WEBHOOK_SECRET`.
- **Deduplicación** por `idEvento`.
- **Respuesta:** `2xx` rápido; si falla, SIPREF Reservas reintenta.
- **Eventos:** `solicitud_acceso.creada` crea la notificación de P2; `solicitud_acceso.expirada` la marca como expirada.
- **Si existe un endpoint de bitácora** en el principal, compartir su contrato. SIPREF Reservas puede enviar ahí sus eventos (`PRINCIPAL_BITACORA_URL`) sin que el principal cambie nada.

## P6. Tareas del DBA

1. Revisar y ejecutar `db/roles/R001__roles_sipref_reservas.sql`, primero en staging.
2. Confirmar los nombres de las tablas de espacios y reservaciones, y otorgar **solo `SELECT`** a `sipref_reservas_app`.
3. Restringir el acceso de red (`pg_hba.conf` o el firewall del proveedor) a las IP de salida de Render, con `hostssl` y `scram-sha-256`.
4. Aplicar `V001` y, si se aprueba, `V002` (requiere `btree_gist`).
5. (Opción B de P4) `GRANT SELECT ON reservas_reservaciones TO <usuario_principal>`.

## Lo que SIPREF Reservas necesita del equipo del principal

- [ ] Esquema (solo estructura) de las tablas de espacios, reservaciones y usuarios administradores.
- [ ] Contrato del endpoint de bitácora, si existe.
- [ ] Decisión entre webhook o consulta periódica para las notificaciones (P2/P5).
- [ ] Decisión sobre P4 (opción A o B).
- [ ] Acceso a un entorno de staging con una copia de la base.

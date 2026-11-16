# Contratos de API — SIPREF Reservas

Versión 1 · Todas las rutas cuelgan de `/api`. JSON en UTF-8. Fechas en ISO 8601 con zona (`2026-11-16T10:00:00-06:00`); el servidor guarda en `timestamptz`.

Hay tres superficies:

1. **API de la aplicación** (navegador ↔ backend), autenticada con cookie de sesión.
2. **API de integración** (SIPREF principal ↔ SIPREF Reservas), servidor a servidor, firmada con HMAC.
3. **Webhook saliente** (SIPREF Reservas → SIPREF principal), opcional.

## Convenciones

**Errores** (todas las superficies):

```json
{ "error": { "codigo": "CONFLICTO_HORARIO", "mensaje": "Texto en español para el usuario", "detalles": {} } }
```

| HTTP | `codigo` típico |
|---|---|
| 400 | `VALIDACION` (en `detalles.campos`: `{ campo: mensaje }`) |
| 401 | `NO_AUTENTICADO` |
| 403 | `ACCESO_NO_APROBADO`, `PROHIBIDO`, `DOMINIO_NO_PERMITIDO`, `FIRMA_INVALIDA` |
| 404 | `NO_ENCONTRADO` |
| 409 | `CONFLICTO_HORARIO`, `VERSION_DESACTUALIZADA`, `ESTADO_INVALIDO`, `DUPLICADO` |
| 429 | `DEMASIADAS_SOLICITUDES` |
| 500 | `ERROR_INTERNO` (nunca expone detalles internos) |

**Paginación:** `?pagina=1&tamano=20` (máx. 100) → `{ "datos": [...], "pagina": 1, "tamano": 20, "total": 134 }`.

**Enumeraciones**

- `EstadoAcceso`: `PENDIENTE | APROBADA | RECHAZADA | REVOCADA | EXPIRADA`
- `Rol`: `DOCENTE | PERSONAL | ADMIN_ESPACIOS`
- `TipoEvento`: `CONFERENCIA | TALLER | JUNTA | EXAMEN | OTRO`
- `EstadoReservacion` (mostrado): `PENDIENTE | REALIZADA | CANCELADA`. Se guarda `PROGRAMADA | CANCELADA`; se muestra `PENDIENTE` si es `PROGRAMADA` y no ha terminado, y `REALIZADA` si es `PROGRAMADA` y `fin < ahora`.
- `CanalRecordatorio`: `SIPREF | CORREO`
- `UnidadAnticipacion`: `MINUTOS | HORAS | DIAS`

---

## 1. API de la aplicación

### Cookies

| Cookie | Contenido | Atributos |
|---|---|---|
| `sr_sesion` | Token opaco de sesión (en BD se guarda su SHA-256) | `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=8h` |
| `sr_estado` | Token firmado (HMAC) con `{ sub, solicitudId }` que **solo** permite consultar el estado de la solicitud | `HttpOnly; Secure; SameSite=Lax; Path=/api/auth; Max-Age=30d` |
| `sr_oauth` | `state` + `code_verifier` (PKCE) firmados, válidos 10 min | `HttpOnly; Secure; SameSite=Lax; Path=/api/auth/google` |

El frontend siempre llama a `/api/...` en **su propio dominio**: Vercel reenvía (rewrite) a Render, y en local lo hace el proxy de Vite. Así las cookies son de primera parte.

### 1.1 Salud

`GET /api/salud` → `200 { "ok": true, "version": "1.0.0" }` (no consulta datos sensibles).

### 1.2 Autenticación con Google (flujo de código de autorización + PKCE)

**`GET /api/auth/google/iniciar`** → `302` a Google con `scope=openid email profile`, `state`, `code_challenge` y `prompt=select_account`. Escribe la cookie `sr_oauth`.

**`GET /api/auth/google/callback?code&state`** (URI de redirección registrada en Google: `{FRONTEND_URL}/api/auth/google/callback`)

1. Valida `state` contra `sr_oauth` e intercambia el `code` usando el client secret (solo en Render).
2. Verifica el `id_token` (firma, `aud`, `iss`, `exp`) y exige `email_verified`.
3. Si `DOMINIOS_PERMITIDOS` no está vacío y el dominio no coincide → `302 /ingresar?error=dominio`.
4. Hace upsert en `reservas_usuarios` por `sub` (actualiza nombre, correo y foto).
5. Según el estado:
   - `APROBADA` → crea sesión, cookie `sr_sesion`, `302 /calendario`.
   - Cuenta nueva o `EXPIRADA` → crea una solicitud `PENDIENTE`, encola `solicitud_acceso.creada` en el outbox (idempotente por id de solicitud), audita, cookie `sr_estado`, `302 /acceso/estado`.
   - `PENDIENTE` → **no** crea solicitud ni notificación nuevas; incrementa `intentos` y `ultimo_intento_en`, cookie `sr_estado`, `302 /acceso/estado`.
   - `RECHAZADA` o `REVOCADA` → cookie `sr_estado`, `302 /acceso/estado`.
6. Cualquier error → `302 /ingresar?error=google`.

**`GET /api/auth/estado-solicitud`** (cookie `sr_estado` o `sr_sesion`) → `200`:

```json
{
  "estado": "PENDIENTE",
  "solicitud": {
    "id": "uuid",
    "nombre": "Ana López",
    "correo": "ana@gmail.com",
    "fotoUrl": "https://...",
    "intentadoEn": "2026-11-15T21:00:00-06:00",
    "expiraEn": "2026-12-15T21:00:00-06:00",
    "resueltoEn": null,
    "rolAsignado": null
  },
  "puedeEntrar": false
}
```

`puedeEntrar` es `true` cuando el estado es `APROBADA`. En ese caso el frontend manda al usuario a `/api/auth/google/iniciar` (o, si ya tiene sesión, a `/calendario`). Sin cookie válida → `401`.

**`GET /api/auth/yo`** → `200 { "sub", "nombre", "correo", "fotoUrl", "rol", "estado" }`. Responde `401` sin sesión y `403 ACCESO_NO_APROBADO` si la cuenta ya no está `APROBADA` (en ese caso también revoca la sesión).

**`POST /api/auth/salir`** → `204`. Revoca la sesión y borra las cookies.

**`POST /api/auth/dev`** — **solo existe si `NODE_ENV !== 'production'` y `AUTH_DEV_BYPASS=true`.** Body `{ "sub", "nombre", "correo", "estado"?, "rol"? }`. Simula el callback de Google para pruebas locales. El servidor se niega a arrancar si esta variable está activa en producción.

### 1.3 Catálogos y configuración (requieren sesión `APROBADA`)

**`GET /api/configuracion/publica`** → `{ "ciclo": "2026-B", "bufferMinutos": 15, "zonaHoraria": "America/Mexico_City" }`

**`GET /api/espacios`** → lectura de SIPREF principal a través del adaptador:

```json
[{ "id": "A-101", "nombre": "Aula 101", "capacidad": 40, "tipo": "Aula", "edificio": "Edificio A" }]
```

**`GET /api/recursos`** → `[{ "id": 1, "nombre": "Micrófono", "unidad": "pieza", "esPredefinido": true }]`

**`POST /api/recursos`** con body `{ "nombre": "Atril", "unidad": "pieza" }`:

- `201` con el recurso creado.
- Si ya existe (sin distinguir mayúsculas) → `200` con el existente.
- Siempre se audita.

### 1.4 Calendario

**`GET /api/calendario?desde&hasta&espacioId?`** (rango máximo de 62 días) → eventos de **ambos** sistemas:

```json
[{
  "id": "uuid-o-id-principal",
  "origen": "RESERVAS",
  "tipoEvento": "CONFERENCIA",
  "nombreEvento": "Foro de Innovación",
  "espacioId": "A-101",
  "espacioNombre": "Aula 101",
  "inicio": "...",
  "fin": "...",
  "responsable": "Mtra. Ana López",
  "estado": "PENDIENTE",
  "resumenRecursos": "Micrófono ×2, Proyector ×1",
  "editable": true
}]
```

- `origen` es `RESERVAS` o `SIPREF`.
- Los eventos con origen `SIPREF` son de solo lectura (`editable: false`, `tipoEvento: "OTRO"` si no se puede mapear).

### 1.5 Reservaciones

**Permisos:** `DOCENTE` y `PERSONAL` pueden ver el calendario completo (ocupación), pero solo modifican y ven el expediente de las reservaciones que ellos crearon. `ADMIN_ESPACIOS` puede todo. *(Supuesto pendiente de confirmar.)*

**`GET /api/reservaciones`** — parámetros `q`, `espacioId`, `estado` (`PENDIENTE|REALIZADA|CANCELADA`), `desde`, `hasta`, `pagina`, `tamano`, `orden` (`inicio_desc` por defecto) → página de `ReservacionResumen`:

```json
{
  "id": "uuid",
  "codigo": "RES-2026-000123",
  "tipoEvento": "TALLER",
  "nombreEvento": "...",
  "espacioId": "A-101",
  "espacioNombre": "Aula 101",
  "inicio": "...",
  "fin": "...",
  "responsable": "...",
  "estado": "PENDIENTE",
  "resumenRecursos": "Sillas ×30"
}
```

**`GET /api/reservaciones/exportar?formato=csv|xlsx&...mismos filtros`** → archivo (`Content-Disposition: attachment`). El CSV va en UTF-8 con BOM para que Excel lo abra bien.

**`GET /api/reservaciones/:id`** → `ReservacionDetalle`: el resumen más los campos siguientes.

```json
{
  "correoResponsable": "...",
  "descripcion": "...",
  "observaciones": "...",
  "asistentesEstimados": 30,
  "recursos": [{ "recursoId": 1, "nombre": "Micrófono", "cantidad": 2, "unidad": "pieza" }],
  "recordatorios": [{ "id": 1, "canal": "CORREO", "anticipacion": 1, "unidad": "DIAS", "enviarEn": "...", "enviadoEn": null }],
  "creadoPor": { "sub": "...", "nombre": "..." },
  "creadoEn": "...",
  "actualizadoEn": "...",
  "cancelacion": null,
  "version": 3
}
```

Cuando la reservación está cancelada, `cancelacion` vale `{ "por": "...", "en": "...", "motivo": "..." }`.

**`GET /api/reservaciones/:id/historial`** → entradas de auditoría de esa reservación:

```json
[{ "ocurridoEn": "...", "actorNombre": "...", "accion": "reservacion.crear", "descripcion": "Creó la reservación" }]
```

**`POST /api/reservaciones/disponibilidad`** con body `{ "espacioId", "inicio", "fin", "excluirId"? }`:

```json
{ "disponible": false, "bufferMinutos": 15, "conflictos": [{ "origen": "SIPREF", "nombreEvento": "...", "inicio": "...", "fin": "..." }] }
```

Solo es informativo: la validación definitiva ocurre al crear.

**`POST /api/reservaciones`** — body `ReservacionEntrada`:

```json
{
  "tipoEvento": "CONFERENCIA",
  "espacioId": "A-101",
  "nombreEvento": "Foro de Innovación",
  "codigo": "RES-2026-000123",
  "inicio": "2026-11-20T10:00:00-06:00",
  "fin": "2026-11-20T12:00:00-06:00",
  "responsable": "Mtra. Ana López",
  "correoResponsable": "ana@ulatino.edu.mx",
  "descripcion": "",
  "observaciones": "",
  "asistentesEstimados": 30,
  "recursos": [{ "recursoId": 1, "cantidad": 2 }],
  "recordatorios": [{ "canal": "CORREO", "anticipacion": 1, "unidad": "DIAS" }]
}
```

- `codigo` es opcional: si se omite, el servidor genera `RES-AAAA-NNNNNN`.
- Validaciones: `fin > inicio`, duración ≤ 24 h, `inicio` en el futuro, el espacio existe en SIPREF principal, `asistentesEstimados` ≤ capacidad (solo advertencia), recursos existentes, máximo 5 recordatorios.

Algoritmo en el servidor, todo dentro de **una transacción**:

1. `SELECT pg_advisory_xact_lock(hashtext('reservas:espacio:' || espacioId))`.
2. Busca traslapes con buffer en `reservas_reservaciones` (`PROGRAMADA`):
   `inicio < :fin + buffer AND fin + buffer > :inicio`.
3. Busca traslapes en las reservaciones de SIPREF principal (lectura, adaptador).
4. Si hay conflicto → `ROLLBACK` y `409 CONFLICTO_HORARIO`, con `detalles.conflictos` igual que en disponibilidad.
5. Inserta la reservación, sus recursos y recordatorios (`enviar_en = inicio − anticipación`), y la entrada de auditoría.
6. `COMMIT` → `201 ReservacionDetalle`.

**`PATCH /api/reservaciones/:id/reagendar`** con body `{ "inicio", "fin", "espacioId"?, "version" }` → mismo algoritmo excluyendo la propia reservación.

- Si `version` no coincide → `409 VERSION_DESACTUALIZADA`.
- Recalcula `enviar_en` de los recordatorios no enviados y audita con antes y después.

**`POST /api/reservaciones/:id/cancelar`** con body `{ "motivo" }` → `200 ReservacionDetalle`.

- Es una cancelación lógica: el registro nunca se borra.
- Si ya está cancelada → `409 ESTADO_INVALIDO`.
- La acción "eliminar" de la agenda usa este mismo endpoint.

**`GET /api/reservaciones/:id/reimprimir`** → HTML imprimible del expediente oficial, sin QR ni sello digital.

---

## 2. API de integración (SIPREF principal → SIPREF Reservas)

Prefijo `/api/integracion/v1`. No usa cookies.

### Autenticación por firma HMAC

Encabezados obligatorios:

```
X-SIPREF-Key-Id:    <INTEGRACION_KEY_ID>
X-SIPREF-Timestamp: <segundos Unix>
X-SIPREF-Signature: hex(HMAC_SHA256(INTEGRACION_SECRET, `${timestamp}.${METHOD}.${path_con_query}.${hex(SHA256(body_crudo))}`))
```

- La firma se rechaza si el timestamp se desvía más de 300 s, y se compara en tiempo constante.
- Cuerpo vacío → `SHA256("")`.
- Se puede limitar además por IP con `INTEGRACION_IPS_PERMITIDAS`.

Todas las acciones de escritura exigen `admin: { "id": "<id en SIPREF principal>", "nombre": "<nombre>" }`. Ese dato se guarda en `resuelto_por_*` y en `reservas_auditoria` con `actor_tipo = ADMIN_PRINCIPAL`.

| Método y ruta | Body | Respuesta |
|---|---|---|
| `GET /solicitudes?estado=&q=&pagina=&tamano=` | — | Página de `SolicitudAcceso` |
| `GET /solicitudes/conteo` | — | `{ "PENDIENTE": 3, "APROBADA": 10, "RECHAZADA": 1, "REVOCADA": 0, "EXPIRADA": 2 }` (para badge) |
| `GET /solicitudes/:id` | — | `SolicitudAcceso` |
| `POST /solicitudes/:id/aprobar` | `{ "rol": "DOCENTE", "admin": {...} }` | `200 SolicitudAcceso`; envía correo de aviso. `409 ESTADO_INVALIDO` si no está `PENDIENTE` |
| `POST /solicitudes/:id/rechazar` | `{ "motivo"?, "admin": {...} }` | `200 SolicitudAcceso` |
| `POST /usuarios/:sub/revocar` | `{ "motivo"?, "admin": {...} }` | `200`. Pasa la cuenta y su última solicitud a `REVOCADA` y revoca sus sesiones |
| `POST /usuarios/:sub/reactivar` | `{ "rol", "admin": {...} }` | `200`. De `REVOCADA` vuelve a `APROBADA` |
| `GET /usuarios?estado=&q=` | — | Página de usuarios |
| `GET /bitacora?desde&hasta&accion&pagina` | — | Página de entradas de `reservas_auditoria` |
| `GET /ocupacion?desde&hasta&espacioId?` | — | Reservaciones `PROGRAMADA` de SIPREF Reservas, para que el principal valide conflictos |

`SolicitudAcceso`:

```json
{
  "id": "uuid",
  "googleSub": "1098...",
  "nombre": "...",
  "correo": "...",
  "fotoUrl": "...",
  "estado": "PENDIENTE",
  "intentadoEn": "...",
  "ultimoIntentoEn": "...",
  "intentos": 2,
  "expiraEn": "...",
  "rolAsignado": null,
  "resueltoPor": null,
  "resueltoEn": null,
  "motivo": null
}
```

Cuando ya fue resuelta, `resueltoPor` vale `{ "id", "nombre" }`.

Las operaciones son **idempotentes ante reintentos**: aprobar dos veces con el mismo rol devuelve `200` con el mismo resultado. Aprobar algo ya rechazado devuelve `409`.

---

## 3. Webhook saliente (opcional, si `PRINCIPAL_WEBHOOK_URL` está configurada)

`POST {PRINCIPAL_WEBHOOK_URL}` con la misma firma HMAC (usando `PRINCIPAL_WEBHOOK_SECRET`) y el encabezado `X-SIPREF-Evento`.

```json
{
  "evento": "solicitud_acceso.creada",
  "idEvento": "<clave de idempotencia>",
  "ocurridoEn": "...",
  "datos": { "solicitudId": "...", "nombre": "...", "correo": "...", "fotoUrl": "...", "intentadoEn": "..." }
}
```

- Eventos: `solicitud_acceso.creada`, `solicitud_acceso.expirada`.
- Se considera entregado con cualquier `2xx`. Si falla, se reintenta con espera exponencial (1, 5, 15, 60 min…, hasta 10 intentos) desde el outbox.
- El receptor debe deduplicar por `idEvento`.
- Si no hay webhook, el principal puede consultar `GET /solicitudes/conteo` y `GET /solicitudes?estado=PENDIENTE` periódicamente.

**Bitácora del principal (opcional):** si existe un endpoint de bitácora (`PRINCIPAL_BITACORA_URL`), cada entrada de auditoría también se envía ahí vía outbox, con el tipo `bitacora.registrar`. `reservas_auditoria` sigue siendo la fuente de verdad.

---

## 4. Tareas programadas (Render Cron Job)

`POST /api/tareas/ejecutar` con el encabezado `X-Cron-Secret: <CRON_SECRET>`. Hace lo siguiente:

- Expira las solicitudes `PENDIENTE` con `expira_en < now()` (auditado y con evento `solicitud_acceso.expirada`).
- Envía los recordatorios con `enviar_en <= now()` que no se han enviado.
- Procesa el outbox.
- Purga las sesiones expiradas.

Es idempotente y usa `pg_try_advisory_lock` para que no corran dos ejecuciones a la vez.

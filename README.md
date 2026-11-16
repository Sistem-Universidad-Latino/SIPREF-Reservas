# SIPREF Reservas — Sistema secundario de reservación de espacios (Universidad Latino)

Aplicación web secundaria de reservación de aulas y espacios de la Universidad Latino. Comparte la base de datos con **SIPREF principal** sin duplicar su lógica ni alterar ninguna de sus tablas, rutas, funciones o configuraciones existentes.

---

## Reglas de oro sobre SIPREF principal y base de datos compartida

1. **Cero modificaciones a SIPREF principal:** ningún archivo, esquema, tabla, restricción, migración o variable de entorno del sistema principal es modificado por este repositorio.
2. **Integración estrictamente aditiva:** todas las tablas propias llevan el prefijo `reservas_` (`reservas_usuarios`, `reservas_solicitudes_acceso`, `reservas_sesiones`, `reservas_recursos_catalogo`, `reservas_reservaciones`, `reservas_recursos_evento`, `reservas_recordatorios`, `reservas_notificaciones_salida`, `reservas_auditoria`, `reservas_configuracion`).
3. **Usuario de base de datos dedicado con privilegio mínimo (`sipref_reservas_app`):**
   - `SELECT` únicamente sobre las tablas de espacios y reservaciones de SIPREF principal.
   - `SELECT, INSERT, UPDATE, DELETE` únicamente sobre tablas `reservas_*` (y solo `SELECT, INSERT` sobre `reservas_auditoria`).
   - Prohibido usar el usuario administrador de SIPREF principal.
4. **Migraciones versionadas y revisables:** ubicadas en `db/migrations/`. **No se ejecutan automáticamente.** Requieren revisión y ejecución manual por el DBA primero en un entorno de *staging* (copia de la base de datos) y luego en producción.
5. **Validación de conflictos en el servidor dentro de transacciones:** usa `pg_advisory_xact_lock` por espacio + verificación de traslapes con buffer de 15 minutos tanto en `reservas_reservaciones` como en las reservaciones de SIPREF principal.
6. **Propuesta para SIPREF principal documentada por separado:** ver [`docs/PROPUESTA_CAMBIOS_SIPREF_PRINCIPAL.md`](docs/PROPUESTA_CAMBIOS_SIPREF_PRINCIPAL.md).

---

## Estructura del repositorio

```text
sipref-reservas/
├─ apps/
│  ├─ api/          Backend Node.js 20 + TypeScript + Fastify (despliegue en Render)
│  └─ web/          Frontend React 18 + Vite + TypeScript + Tailwind (despliegue en Vercel)
├─ db/
│  ├─ migrations/   Scripts SQL aditivos versionados (V001, V002 opcional) y sus reversas (.down.sql)
│  ├─ roles/        Script SQL de creación de roles con privilegios mínimos (R001)
│  └─ local/        Docker Compose + tablas stub de SIPREF principal solo para desarrollo local
├─ docs/
│  ├─ ARQUITECTURA.md
│  ├─ CONTRATOS_API.md
│  ├─ MODELO_DATOS_PROPUESTO.md
│  └─ PROPUESTA_CAMBIOS_SIPREF_PRINCIPAL.md
└─ package.json     Workspaces de npm
```

---

## Requisitos previos

- **Node.js** >= 20 y **npm** >= 10
- **Docker** (opcional pero recomendado para levantar PostgreSQL 16 local con el esquema stub y migraciones)

---

## Ejecución en entorno local

### Opción A: Desarrollo completo con base de datos local en Docker

1. **Instalar dependencias** (desde la raíz del repositorio):
   ```powershell
   npm install
   ```

2. **Levantar PostgreSQL local** (puerto `5433`, carga automáticamente el stub de SIPREF principal, las migraciones `V001` y `V002`, los permisos mínimos `sipref_reservas_app` y datos semilla):
   ```powershell
   npm run db:local:up
   ```

3. **Configurar variables de entorno del backend**:
   ```powershell
   Copy-Item apps/api/.env.example apps/api/.env
   ```
   En desarrollo local puedes dejar `AUTH_DEV_BYPASS=true` para simular el inicio de sesión con Google en distintos estados (`PENDIENTE`, `APROBADA`, `RECHAZADA`, `REVOCADA`) sin credenciales reales de Google OAuth.

4. **Configurar variables de entorno del frontend**:
   ```powershell
   Copy-Item apps/web/.env.example apps/web/.env.local
   ```

5. **Iniciar backend y frontend** (en dos terminales):
   ```powershell
   npm run dev:api   # http://localhost:4000
   npm run dev:web   # http://localhost:5173 (proxea /api -> localhost:4000)
   ```

### Opción B: Frontend autónomo con datos simulados (`VITE_USE_MOCKS=true`)

Si deseas probar todas las pantallas del frontend sin levantar Docker ni el backend:

```powershell
npm --workspace apps/web run dev -- --mode mocks
```

---

## Configuración de Google OAuth 2.0

1. Entra a [Google Cloud Console](https://console.cloud.google.com/) → **APIs y servicios** → **Pantalla de consentimiento de OAuth**:
   - Tipo: **Externo** (los usuarios de SIPREF Reservas usan cuentas Google personales o externas y pasan por aprobación administrativa).
   - Scopes: `openid`, `email`, `profile`.
2. Ve a **Credenciales** → **Crear credenciales** → **ID de cliente de OAuth** → **Aplicación web**:
   - **Orígenes de JavaScript autorizados**:
     - Local: `http://localhost:5173`
     - Producción (Vercel): `https://<tu-dominio-vercel>.vercel.app`
   - **URI de redirección autorizados**:
     - Local: `http://localhost:5173/api/auth/google/callback`
     - Producción (Vercel): `https://<tu-dominio-vercel>.vercel.app/api/auth/google/callback`
     *(Como Vercel reenvía `/api/*` a Render en el mismo dominio, la URI de redirección pertenece al dominio de Vercel).*
3. Guarda el **Client ID** y el **Client Secret** en las variables de entorno de Render (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`).
4. **Identificador estable (`sub`)**: el backend utiliza siempre el campo `sub` del ID token de Google como clave primaria en `reservas_usuarios`, nunca el correo electrónico.

---

## Variables de entorno

### Backend (`apps/api` — Render)

| Variable | Obligatoria | Descripción |
|---|---|---|
| `PORT` | No (`4000`) | Puerto HTTP |
| `NODE_ENV` | Sí | `development`, `test` o `production` |
| `DATABASE_URL` | Sí | Cadena de conexión PostgreSQL usando el rol dedicado `sipref_reservas_app` |
| `DATABASE_SSL` | No (`true` en prod) | `true`, `false` o `no-verify` |
| `GOOGLE_CLIENT_ID` | Sí | Client ID de Google OAuth |
| `GOOGLE_CLIENT_SECRET` | Sí | Client Secret de Google OAuth (solo en el servidor) |
| `FRONTEND_URL` | Sí | URL pública del frontend en Vercel (ej. `https://sipref-reservas.vercel.app`) |
| `SESSION_SECRET` | Sí | Secreto de >= 32 caracteres para firmar cookies y estados OAuth |
| `INTEGRACION_KEY_ID` | Sí | Identificador de llave para la API de integración con SIPREF principal |
| `INTEGRACION_SECRET` | Sí | Secreto compartido (>= 32 caracteres) para verificar firmas HMAC-SHA256 |
| `INTEGRACION_IPS_PERMITIDAS` | No | Lista de IPs separadas por coma autorizadas para llamar a `/api/integracion/v1/*` |
| `PRINCIPAL_WEBHOOK_URL` | No | URL del webhook en SIPREF principal para recibir eventos de nuevas solicitudes |
| `PRINCIPAL_WEBHOOK_SECRET` | No | Secreto HMAC para firmar webhooks salientes hacia SIPREF principal |
| `PRINCIPAL_BITACORA_URL` | No | Endpoint existente de bitácora en SIPREF principal (opcional) |
| `CRON_SECRET` | Sí | Secreto requerido en el encabezado `X-Cron-Secret` para `POST /api/tareas/ejecutar` |
| `DOMINIOS_PERMITIDOS` | No | Lista opcional de dominios de Google permitidos (ej. `gmail.com,ulatino.edu.mx`); vacío = cualquiera |
| `SOLICITUD_EXPIRACION_DIAS` | No (`30`) | Días para expirar solicitudes en estado `PENDIENTE` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | No | Configuración SMTP para correos de aprobación y recordatorios |
| `AUTH_DEV_BYPASS` | No (`false`) | **Solo desarrollo/pruebas.** El servidor se niega a iniciar si es `true` en producción |
| `TRUST_PROXY` | No (`true`) | Confiar en encabezados de proxy inverso (Render / Vercel) |

### Frontend (`apps/web` — Vercel)

| Variable | Entorno | Descripción |
|---|---|---|
| `API_URL` | Vercel (servidor) | URL pública del servicio en Render (ej. `https://sipref-reservas-api.onrender.com`), usada por `middleware.ts` para reenviar `/api/*` |
| `VITE_GOOGLE_CLIENT_ID` | Público (opcional) | Identificador público de Google OAuth (informativo; el flujo OAuth se inicia en `/api/auth/google/iniciar`) |
| `VITE_USE_MOCKS` | Solo desarrollo | `true` activa los datos simulados en memoria sin backend |

---

## Despliegue en Render y Vercel (paso a paso)

1. **Preparar base de datos (primero en Staging, nunca directo en Producción):**
   - El DBA revisa [`docs/MODELO_DATOS_PROPUESTO.md`](docs/MODELO_DATOS_PROPUESTO.md), [`db/roles/R001__roles_sipref_reservas.sql`](db/roles/R001__roles_sipref_reservas.sql) y [`db/migrations/V001__reservas_esquema_inicial.sql`](db/migrations/V001__reservas_esquema_inicial.sql).
   - Ajusta los nombres reales de las tablas de espacios y reservaciones de SIPREF principal en `db/roles/R001__roles_sipref_reservas.sql` y en `apps/api/src/principal/adaptador.ts`.
   - Restringe en el firewall de la base de datos o `pg_hba.conf` las IP de salida estáticas de Render.
2. **Desplegar Backend en Render:**
   - Conecta el repositorio y usa el blueprint [`apps/api/render.yaml`](apps/api/render.yaml) (crea el Web Service + el Cron Job cada 5 minutos para expiración de solicitudes, recordatorios y outbox).
   - Configura las variables de entorno en el panel de Render.
3. **Desplegar Frontend en Vercel:**
   - Importa el repositorio con **Root Directory** = `apps/web`.
   - Configura `API_URL` apuntando a la URL pública de Render y `VITE_GOOGLE_CLIENT_ID`.
   - `middleware.ts` y `vercel.json` reenviarán automáticamente `/api/*` al backend en Render manteniendo cookies de primera parte.

---

## Pruebas

```powershell
npm test
npm run build
```

---

## Documentación técnica adicional

- [Arquitectura general y decisiones de seguridad](docs/ARQUITECTURA.md)
- [Modelo de datos propuesto (tablas `reservas_*` y permisos)](docs/MODELO_DATOS_PROPUESTO.md)
- [Contratos de API (aplicación, integración HMAC, webhooks y cron)](docs/CONTRATOS_API.md)
- [Propuesta de cambios aditivos para SIPREF principal](docs/PROPUESTA_CAMBIOS_SIPREF_PRINCIPAL.md)

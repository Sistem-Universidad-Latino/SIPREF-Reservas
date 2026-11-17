import { ApiError } from '../api/cliente';
import type {
  Conflicto,
  ConfiguracionPublica,
  DevLoginEntrada,
  DisponibilidadEntrada,
  DisponibilidadRespuesta,
  EntradaHistorial,
  Espacio,
  EstadoAcceso,
  EstadoReservacion,
  EstadoSolicitudRespuesta,
  EventoCalendario,
  Pagina,
  ReagendarEntrada,
  Recurso,
  ReservacionDetalle,
  ReservacionEntrada,
  ReservacionResumen,
  Rol,
  Yo,
} from '../api/tipos';
import { formatearFechaCompleta, formatearFechaHora, formatearRangoHorario } from '../utilidades/fechas';
import { obtenerInfoEstadoReservacion, obtenerInfoTipoEvento } from '../utilidades/catalogos';

const BUFFER_MINUTOS = 15;
const CLAVE_SESION_MOCK = 'sipref_reservas_mock_auth_v1';

interface EstadoAuthMock {
  autenticado: boolean;
  sub: string;
  nombre: string;
  correo: string;
  fotoUrl: string | null;
  rol: Rol;
  estado: EstadoAcceso;
  intentadoEn: string;
  expiraEn: string;
}

const AUTH_POR_DEFECTO: EstadoAuthMock = {
  autenticado: false,
  sub: '',
  nombre: '',
  correo: '',
  fotoUrl: null,
  rol: 'DOCENTE',
  estado: 'PENDIENTE',
  intentadoEn: '',
  expiraEn: '',
};

function leerAuthMock(): EstadoAuthMock {
  try {
    const raw = window.localStorage.getItem(CLAVE_SESION_MOCK);
    if (!raw) return { ...AUTH_POR_DEFECTO };
    return { ...AUTH_POR_DEFECTO, ...JSON.parse(raw) };
  } catch {
    return { ...AUTH_POR_DEFECTO };
  }
}

function guardarAuthMock(nuevo: EstadoAuthMock): void {
  try {
    window.localStorage.setItem(CLAVE_SESION_MOCK, JSON.stringify(nuevo));
  } catch {
    // Ignorar en entornos sin localStorage
  }
}

export function activarSesionGoogleMock(): EstadoAcceso {
  const actual = leerAuthMock();
  const actualizado: EstadoAuthMock = {
    ...actual,
    autenticado: true,
    estado: actual.estado || 'APROBADA',
  };
  guardarAuthMock(actualizado);
  return actualizado.estado;
}

const CONFIGURACION_MOCK: ConfiguracionPublica = {
  ciclo: '2026-B',
  bufferMinutos: BUFFER_MINUTOS,
  zonaHoraria: 'America/Mexico_City',
};

const ESPACIOS_MOCK: Espacio[] = [
  {
    "id": "120018",
    "nombre": "A-CCPA",
    "capacidad": 0,
    "tipo": "",
    "edificio": ""
  },
  {
    "id": "120004",
    "nombre": "A10",
    "capacidad": 0,
    "tipo": "",
    "edificio": ""
  },
  {
    "id": "120005",
    "nombre": "A11",
    "capacidad": 0,
    "tipo": "",
    "edificio": ""
  },
  {
    "id": "120006",
    "nombre": "A12",
    "capacidad": 0,
    "tipo": "",
    "edificio": "Planta B"
  },
  {
    "id": "120007",
    "nombre": "A13",
    "capacidad": 0,
    "tipo": "",
    "edificio": "Planta B"
  },
  {
    "id": "120008",
    "nombre": "A14",
    "capacidad": 0,
    "tipo": "",
    "edificio": ""
  },
  {
    "id": "120019",
    "nombre": "A15",
    "capacidad": 0,
    "tipo": "",
    "edificio": ""
  },
  {
    "id": "120009",
    "nombre": "A16",
    "capacidad": 0,
    "tipo": "",
    "edificio": ""
  },
  {
    "id": "120010",
    "nombre": "A17",
    "capacidad": 0,
    "tipo": "",
    "edificio": ""
  },
  {
    "id": "120011",
    "nombre": "A18",
    "capacidad": 0,
    "tipo": "",
    "edificio": ""
  },
  {
    "id": "120012",
    "nombre": "A19",
    "capacidad": 0,
    "tipo": "",
    "edificio": ""
  },
  {
    "id": "120013",
    "nombre": "A20",
    "capacidad": 0,
    "tipo": "",
    "edificio": ""
  },
  {
    "id": "120014",
    "nombre": "A21",
    "capacidad": 0,
    "tipo": "",
    "edificio": ""
  },
  {
    "id": "120015",
    "nombre": "A22",
    "capacidad": 0,
    "tipo": "",
    "edificio": ""
  },
  {
    "id": "120020",
    "nombre": "A23",
    "capacidad": 0,
    "tipo": "",
    "edificio": ""
  },
  {
    "id": "120016",
    "nombre": "A24",
    "capacidad": 0,
    "tipo": "",
    "edificio": ""
  },
  {
    "id": "120017",
    "nombre": "A25",
    "capacidad": 0,
    "tipo": "",
    "edificio": ""
  },
  {
    "id": "120001",
    "nombre": "A6",
    "capacidad": 0,
    "tipo": "",
    "edificio": ""
  },
  {
    "id": "120002",
    "nombre": "A7",
    "capacidad": 0,
    "tipo": "",
    "edificio": ""
  },
  {
    "id": "120003",
    "nombre": "A9",
    "capacidad": 0,
    "tipo": "",
    "edificio": ""
  },
  {
    "id": "120021",
    "nombre": "Lab.Elect",
    "capacidad": 0,
    "tipo": "",
    "edificio": ""
  },
  {
    "id": "150004",
    "nombre": "Lab.Enf.1",
    "capacidad": 0,
    "tipo": "",
    "edificio": ""
  },
  {
    "id": "150003",
    "nombre": "Lab.Enf.2",
    "capacidad": 0,
    "tipo": "",
    "edificio": ""
  },
  {
    "id": "150002",
    "nombre": "Lab.Enf.3",
    "capacidad": 0,
    "tipo": "",
    "edificio": ""
  },
  {
    "id": "150005",
    "nombre": "Lab.Gas",
    "capacidad": 0,
    "tipo": "",
    "edificio": ""
  },
  {
    "id": "150001",
    "nombre": "Lab.Nut",
    "capacidad": 0,
    "tipo": "",
    "edificio": ""
  },
  {
    "id": "180001",
    "nombre": "SA1 - Salón Audiovisual 1",
    "capacidad": 0,
    "tipo": "",
    "edificio": "Planta B"
  },
  {
    "id": "180002",
    "nombre": "SA2 - Salón Audiovisual 2",
    "capacidad": 0,
    "tipo": "",
    "edificio": "Planta C"
  }
];

let recursosMock: Recurso[] = [
  { id: 1, nombre: 'Micrófono inalámbrico', unidad: 'pieza', esPredefinido: true },
  { id: 2, nombre: 'Proyector láser HDMI', unidad: 'pieza', esPredefinido: true },
  { id: 3, nombre: 'Sillas adicionales', unidad: 'pieza', esPredefinido: true },
  { id: 4, nombre: 'Atril institucional', unidad: 'pieza', esPredefinido: true },
  { id: 5, nombre: 'Bocina amplificada', unidad: 'pieza', esPredefinido: true },
  { id: 6, nombre: 'Adaptador USB-C / HDMI', unidad: 'pieza', esPredefinido: true },
  { id: 7, nombre: 'Pizarrón blanco móvil', unidad: 'pieza', esPredefinido: true },
  { id: 8, nombre: 'Servicio de cafetería', unidad: 'servicio', esPredefinido: true },
];

/** Eventos de horario académico provenientes de SIPREF principal (solo lectura). */
const EVENTOS_SIPREF_MOCK: EventoCalendario[] = [];

interface SemillaReservacion {
  id: string;
  codigo: string;
  tipoEvento: ReservacionDetalle['tipoEvento'];
  nombreEvento: string;
  espacioId: string;
  inicio: string;
  fin: string;
  responsable: string;
  correoResponsable: string;
  estado: EstadoReservacion;
  asistentesEstimados: number;
  descripcion: string;
  observaciones: string;
  recursos: { recursoId: number; cantidad: number }[];
  cancelacion?: { por: string; en: string; motivo: string } | null;
}

const SEMILLAS_RESERVACIONES: SemillaReservacion[] = [];

function construirDetalleDesdeSemilla(s: SemillaReservacion): ReservacionDetalle {
  const espacio = ESPACIOS_MOCK.find((e) => e.id === s.espacioId) ?? ESPACIOS_MOCK[0];
  const recursosAsignados = s.recursos.map((item) => {
    const cat = recursosMock.find((r) => r.id === item.recursoId) ?? {
      id: item.recursoId,
      nombre: `Recurso #${item.recursoId}`,
      unidad: 'pieza',
    };
    return {
      recursoId: cat.id,
      nombre: cat.nombre,
      cantidad: item.cantidad,
      unidad: cat.unidad,
    };
  });

  const resumenRecursos =
    recursosAsignados.length > 0
      ? recursosAsignados.map((r) => `${r.nombre} ×${r.cantidad}`).join(', ')
      : 'Sin recursos adicionales';

  const inicioMs = new Date(s.inicio).getTime();
  const enviarEnIso = new Date(inicioMs - 24 * 60 * 60 * 1000).toISOString();

  return {
    id: s.id,
    codigo: s.codigo,
    tipoEvento: s.tipoEvento,
    nombreEvento: s.nombreEvento,
    espacioId: espacio.id,
    espacioNombre: espacio.nombre,
    inicio: s.inicio,
    fin: s.fin,
    responsable: s.responsable,
    correoResponsable: s.correoResponsable,
    estado: s.estado,
    resumenRecursos,
    descripcion: s.descripcion,
    observaciones: s.observaciones,
    asistentesEstimados: s.asistentesEstimados,
    recursos: recursosAsignados,
    recordatorios: [
      {
        id: 1,
        canal: 'CORREO',
        anticipacion: 1,
        unidad: 'DIAS',
        enviarEn: enviarEnIso,
        enviadoEn: s.estado === 'REALIZADA' ? enviarEnIso : null,
      },
    ],
    creadoPor: {
      sub: 'google-oauth2|109823471928374',
      nombre: 'Mtra. Ana Sofía López Hernández',
    },
    creadoEn: '2026-11-01T10:00:00-06:00',
    actualizadoEn: s.cancelacion ? s.cancelacion.en : '2026-11-01T10:00:00-06:00',
    cancelacion: s.cancelacion ?? null,
    version: 1,
  };
}

let reservacionesMock: ReservacionDetalle[] = SEMILLAS_RESERVACIONES.map(construirDetalleDesdeSemilla);

const historialMockPorId: Record<string, EntradaHistorial[]> = {};
for (const r of reservacionesMock) {
  const entradas: EntradaHistorial[] = [
    {
      ocurridoEn: r.creadoEn,
      actorNombre: r.creadoPor.nombre,
      accion: 'reservacion.crear',
      descripcion: `Creó la reservación ${r.codigo} en ${r.espacioNombre}.`,
    },
  ];
  if (r.cancelacion) {
    entradas.push({
      ocurridoEn: r.cancelacion.en,
      actorNombre: r.cancelacion.por,
      accion: 'reservacion.cancelar',
      descripcion: `Canceló la reservación. Motivo: ${r.cancelacion.motivo}`,
    });
  }
  historialMockPorId[r.id] = entradas;
}

function detectarConflictos(
  espacioId: string,
  inicioIso: string,
  finIso: string,
  excluirId?: string,
): Conflicto[] {
  const inicioMs = new Date(inicioIso).getTime();
  const finMs = new Date(finIso).getTime();
  const bufferMs = BUFFER_MINUTOS * 60 * 1000;

  const conflictos: Conflicto[] = [];

  for (const ev of EVENTOS_SIPREF_MOCK) {
    if (ev.espacioId !== espacioId) continue;
    const evIni = new Date(ev.inicio).getTime();
    const evFin = new Date(ev.fin).getTime();
    if (inicioMs < evFin + bufferMs && finMs + bufferMs > evIni) {
      conflictos.push({
        origen: 'SIPREF',
        nombreEvento: ev.nombreEvento,
        inicio: ev.inicio,
        fin: ev.fin,
      });
    }
  }

  for (const res of reservacionesMock) {
    if (res.espacioId !== espacioId) continue;
    if (res.estado === 'CANCELADA') continue;
    if (excluirId && res.id === excluirId) continue;
    const rIni = new Date(res.inicio).getTime();
    const rFin = new Date(res.fin).getTime();
    if (inicioMs < rFin + bufferMs && finMs + bufferMs > rIni) {
      conflictos.push({
        origen: 'RESERVAS',
        nombreEvento: res.nombreEvento,
        inicio: res.inicio,
        fin: res.fin,
      });
    }
  }

  return conflictos;
}

function aResumen(r: ReservacionDetalle): ReservacionResumen {
  return {
    id: r.id,
    codigo: r.codigo,
    tipoEvento: r.tipoEvento,
    nombreEvento: r.nombreEvento,
    espacioId: r.espacioId,
    espacioNombre: r.espacioNombre,
    inicio: r.inicio,
    fin: r.fin,
    responsable: r.responsable,
    estado: r.estado,
    resumenRecursos: r.resumenRecursos,
  };
}

export async function manejarPeticionMock<T>(
  ruta: string,
  method: string,
  body?: unknown,
): Promise<T> {
  const url = new URL(ruta, 'http://localhost');
  const pathname = url.pathname;
  const params = url.searchParams;
  const auth = leerAuthMock();

  // 1. Salud
  if (pathname === '/api/salud' && method === 'GET') {
    return { ok: true, version: '1.0.0' } as T;
  }

  // 2. Auth: POST /api/auth/dev
  if (pathname === '/api/auth/dev' && method === 'POST') {
    const entrada = (body ?? {}) as DevLoginEntrada;
    const nuevo: EstadoAuthMock = {
      autenticado: true,
      sub: entrada.sub || AUTH_POR_DEFECTO.sub,
      nombre: entrada.nombre || AUTH_POR_DEFECTO.nombre,
      correo: entrada.correo || AUTH_POR_DEFECTO.correo,
      fotoUrl: null,
      rol: entrada.rol ?? 'ADMIN_ESPACIOS',
      estado: entrada.estado ?? 'APROBADA',
      intentadoEn: new Date().toISOString(),
      expiraEn: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    };
    guardarAuthMock(nuevo);
    return { ok: true, estado: nuevo.estado, rol: nuevo.rol } as T;
  }

  // 3. Auth: POST /api/auth/salir
  if (pathname === '/api/auth/salir' && method === 'POST') {
    guardarAuthMock({ ...auth, autenticado: false });
    return undefined as T;
  }

  // 4. Auth: GET /api/auth/estado-solicitud
  if (pathname === '/api/auth/estado-solicitud' && method === 'GET') {
    if (!auth.autenticado) {
      throw new ApiError(401, 'NO_AUTENTICADO', 'Tu sesión expiró. Vuelve a iniciar sesión.');
    }
    const resp: EstadoSolicitudRespuesta = {
      estado: auth.estado,
      solicitud: {
        id: 'sol-mock-2026-001',
        nombre: auth.nombre,
        correo: auth.correo,
        fotoUrl: auth.fotoUrl,
        intentadoEn: auth.intentadoEn,
        expiraEn: auth.expiraEn,
        resueltoEn: auth.estado === 'PENDIENTE' ? null : new Date().toISOString(),
        rolAsignado: auth.estado === 'APROBADA' ? auth.rol : null,
      },
      puedeEntrar: auth.estado === 'APROBADA',
    };
    return resp as T;
  }

  // 5. Auth: GET /api/auth/yo
  if (pathname === '/api/auth/yo' && method === 'GET') {
    if (!auth.autenticado) {
      throw new ApiError(401, 'NO_AUTENTICADO', 'Tu sesión expiró. Vuelve a iniciar sesión.');
    }
    if (auth.estado !== 'APROBADA') {
      throw new ApiError(403, 'ACCESO_NO_APROBADO', 'Tu acceso aún no está aprobado.');
    }
    const yo: Yo = {
      sub: auth.sub,
      nombre: auth.nombre,
      correo: auth.correo,
      fotoUrl: auth.fotoUrl,
      rol: auth.rol,
      estado: auth.estado,
    };
    return yo as T;
  }

  // 5b. Auth: PATCH /api/auth/yo
  if (pathname === '/api/auth/yo' && method === 'PATCH') {
    if (!auth.autenticado) {
      throw new ApiError(401, 'NO_AUTENTICADO', 'Tu sesión expiró. Vuelve a iniciar sesión.');
    }
    if (auth.estado !== 'APROBADA') {
      throw new ApiError(403, 'ACCESO_NO_APROBADO', 'Tu acceso aún no está aprobado.');
    }
    const entrada = (body ?? {}) as { nombre?: string };
    const nombreLimpio = (entrada.nombre ?? '').trim();
    if (nombreLimpio.length < 2) {
      throw new ApiError(400, 'VALIDACION', 'El nombre completo debe tener al menos 2 caracteres.', {
        campos: { nombre: 'Ingresa tu nombre completo.' },
      });
    }
    const actualizado: EstadoAuthMock = {
      ...auth,
      nombre: nombreLimpio,
    };
    guardarAuthMock(actualizado);
    const yo: Yo = {
      sub: actualizado.sub,
      nombre: actualizado.nombre,
      correo: actualizado.correo,
      fotoUrl: actualizado.fotoUrl,
      rol: actualizado.rol,
      estado: actualizado.estado,
    };
    return yo as T;
  }

  // 5c. Auth: DELETE /api/auth/yo
  if (pathname === '/api/auth/yo' && method === 'DELETE') {
    const sesionVacia: EstadoAuthMock = {
      ...AUTH_POR_DEFECTO,
      autenticado: false,
      estado: 'PENDIENTE',
    };
    guardarAuthMock(sesionVacia);
    return undefined as T;
  }

  // Verificar sesión aprobada para el resto de endpoints
  if (!auth.autenticado) {
    throw new ApiError(401, 'NO_AUTENTICADO', 'Tu sesión expiró. Vuelve a iniciar sesión.');
  }
  if (auth.estado !== 'APROBADA') {
    throw new ApiError(403, 'ACCESO_NO_APROBADO', 'Tu acceso no está aprobado.');
  }

  // 6. Catálogos
  if (pathname === '/api/configuracion/publica' && method === 'GET') {
    return CONFIGURACION_MOCK as T;
  }
  if (pathname === '/api/espacios' && method === 'GET') {
    return ESPACIOS_MOCK as T;
  }
  if (pathname === '/api/recursos' && method === 'GET') {
    return recursosMock as T;
  }
  if (pathname === '/api/recursos' && method === 'POST') {
    const entrada = (body ?? {}) as { nombre?: string; unidad?: string };
    const nombreLimpio = (entrada.nombre ?? '').trim();
    if (!nombreLimpio) {
      throw new ApiError(400, 'VALIDACION', 'El nombre del recurso es obligatorio.', {
        campos: { nombre: 'Ingresa el nombre del recurso.' },
      });
    }
    const existente = recursosMock.find((r) => r.nombre.toLowerCase() === nombreLimpio.toLowerCase());
    if (existente) return existente as T;
    const nuevo: Recurso = {
      id: recursosMock.reduce((max, r) => Math.max(max, r.id), 0) + 1,
      nombre: nombreLimpio,
      unidad: (entrada.unidad ?? 'pieza').trim() || 'pieza',
      esPredefinido: false,
    };
    recursosMock = [...recursosMock, nuevo];
    return nuevo as T;
  }

  // 7. Calendario
  if (pathname === '/api/calendario' && method === 'GET') {
    const desde = params.get('desde');
    const hasta = params.get('hasta');
    const espacioId = params.get('espacioId');

    const desdeMs = desde ? new Date(desde).getTime() : 0;
    const hastaMs = hasta ? new Date(hasta).getTime() : Number.MAX_SAFE_INTEGER;

    const eventosReservas: EventoCalendario[] = reservacionesMock.map((r) => ({
      id: r.id,
      origen: 'RESERVAS',
      tipoEvento: r.tipoEvento,
      nombreEvento: r.nombreEvento,
      espacioId: r.espacioId,
      espacioNombre: r.espacioNombre,
      inicio: r.inicio,
      fin: r.fin,
      responsable: r.responsable,
      estado: r.estado,
      resumenRecursos: r.resumenRecursos,
      editable: r.estado === 'PENDIENTE',
    }));

    const todos = [...EVENTOS_SIPREF_MOCK, ...eventosReservas].filter((ev) => {
      if (espacioId && ev.espacioId !== espacioId) return false;
      const ini = new Date(ev.inicio).getTime();
      const fin = new Date(ev.fin).getTime();
      return fin >= desdeMs && ini <= hastaMs;
    });

    todos.sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime());
    return todos as T;
  }

  // 8. Disponibilidad
  if (pathname === '/api/reservaciones/disponibilidad' && method === 'POST') {
    const entrada = (body ?? {}) as DisponibilidadEntrada;
    const conflictos = detectarConflictos(
      entrada.espacioId,
      entrada.inicio,
      entrada.fin,
      entrada.excluirId,
    );
    const resp: DisponibilidadRespuesta = {
      disponible: conflictos.length === 0,
      bufferMinutos: BUFFER_MINUTOS,
      conflictos,
    };
    return resp as T;
  }

  // 9. Listado paginado de reservaciones
  if (pathname === '/api/reservaciones' && method === 'GET') {
    const q = (params.get('q') ?? '').trim().toLowerCase();
    const espacioId = params.get('espacioId') ?? '';
    const estado = params.get('estado') ?? '';
    const desde = params.get('desde') ?? '';
    const hasta = params.get('hasta') ?? '';
    const pagina = Math.max(1, Number(params.get('pagina') ?? '1'));
    const tamano = Math.min(100, Math.max(1, Number(params.get('tamano') ?? '10')));

    const filtradas = reservacionesMock.filter((r) => {
      if (espacioId && r.espacioId !== espacioId) return false;
      if (estado && r.estado !== estado) return false;
      if (desde) {
        const desdeMs = new Date(desde.length === 10 ? `${desde}T00:00:00-06:00` : desde).getTime();
        if (new Date(r.inicio).getTime() < desdeMs) return false;
      }
      if (hasta) {
        const hastaMs = new Date(hasta.length === 10 ? `${hasta}T23:59:59-06:00` : hasta).getTime();
        if (new Date(r.inicio).getTime() > hastaMs) return false;
      }
      if (q) {
        const texto = `${r.codigo} ${r.nombreEvento} ${r.responsable} ${r.espacioNombre}`.toLowerCase();
        if (!texto.includes(q)) return false;
      }
      return true;
    });

    filtradas.sort((a, b) => new Date(b.inicio).getTime() - new Date(a.inicio).getTime());

    const total = filtradas.length;
    const inicioIdx = (pagina - 1) * tamano;
    const datos = filtradas.slice(inicioIdx, inicioIdx + tamano).map(aResumen);

    const resultado: Pagina<ReservacionResumen> = {
      datos,
      pagina,
      tamano,
      total,
    };
    return resultado as T;
  }

  // 10. Crear reservación
  if (pathname === '/api/reservaciones' && method === 'POST') {
    const entrada = (body ?? {}) as ReservacionEntrada;
    const camposError: Record<string, string> = {};

    if (!entrada.nombreEvento?.trim()) camposError.nombreEvento = 'El nombre del evento es obligatorio.';
    if (!entrada.espacioId) camposError.espacioId = 'Selecciona un aula o espacio.';
    if (!entrada.responsable?.trim()) camposError.responsable = 'Indica el nombre del responsable.';
    if (!entrada.correoResponsable?.trim() || !entrada.correoResponsable.includes('@')) {
      camposError.correoResponsable = 'Ingresa un correo institucional válido.';
    }
    if (!entrada.inicio || !entrada.fin) {
      camposError.inicio = 'Especifica la fecha y horario del evento.';
    } else if (new Date(entrada.fin).getTime() <= new Date(entrada.inicio).getTime()) {
      camposError.fin = 'La hora de fin debe ser posterior a la hora de inicio.';
    }
    if ((entrada.recordatorios?.length ?? 0) > 5) {
      camposError.recordatorios = 'Se permiten como máximo 5 recordatorios por reservación.';
    }

    if (Object.keys(camposError).length > 0) {
      throw new ApiError(400, 'VALIDACION', 'Revisa los campos marcados en el formulario.', {
        campos: camposError,
      });
    }

    const conflictos = detectarConflictos(entrada.espacioId, entrada.inicio, entrada.fin);
    if (conflictos.length > 0) {
      throw new ApiError(
        409,
        'CONFLICTO_HORARIO',
        'El espacio seleccionado presenta un conflicto de horario (considerando los 15 minutos de preparación).',
        { conflictos, bufferMinutos: BUFFER_MINUTOS },
      );
    }

    const espacio = ESPACIOS_MOCK.find((e) => e.id === entrada.espacioId) ?? ESPACIOS_MOCK[0];
    const consecutivo = reservacionesMock.length + 101;
    const codigo =
      entrada.codigo && entrada.codigo.trim().length > 0
        ? entrada.codigo.trim().toUpperCase()
        : `RES-2026-${String(consecutivo).padStart(6, '0')}`;

    const recursosAsignados = (entrada.recursos ?? []).map((item) => {
      const cat = recursosMock.find((r) => r.id === item.recursoId) ?? {
        id: item.recursoId,
        nombre: `Recurso #${item.recursoId}`,
        unidad: 'pieza',
      };
      return {
        recursoId: cat.id,
        nombre: cat.nombre,
        cantidad: item.cantidad,
        unidad: cat.unidad,
      };
    });

    const resumenRecursos =
      recursosAsignados.length > 0
        ? recursosAsignados.map((r) => `${r.nombre} ×${r.cantidad}`).join(', ')
        : 'Sin recursos adicionales';

    const ahoraIso = new Date().toISOString();
    const nueva: ReservacionDetalle = {
      id: `res-${Date.now()}`,
      codigo,
      tipoEvento: entrada.tipoEvento,
      nombreEvento: entrada.nombreEvento.trim(),
      espacioId: espacio.id,
      espacioNombre: espacio.nombre,
      inicio: entrada.inicio,
      fin: entrada.fin,
      responsable: entrada.responsable.trim(),
      correoResponsable: entrada.correoResponsable.trim(),
      estado: 'PENDIENTE',
      resumenRecursos,
      descripcion: entrada.descripcion?.trim() ?? '',
      observaciones: entrada.observaciones?.trim() ?? '',
      asistentesEstimados: entrada.asistentesEstimados,
      recursos: recursosAsignados,
      recordatorios: (entrada.recordatorios ?? []).map((rec, idx) => ({
        id: idx + 1,
        canal: rec.canal,
        anticipacion: rec.anticipacion,
        unidad: rec.unidad,
        enviarEn: entrada.inicio,
        enviadoEn: null,
      })),
      creadoPor: {
        sub: auth.sub,
        nombre: auth.nombre,
      },
      creadoEn: ahoraIso,
      actualizadoEn: ahoraIso,
      cancelacion: null,
      version: 1,
    };

    reservacionesMock = [nueva, ...reservacionesMock];
    historialMockPorId[nueva.id] = [
      {
        ocurridoEn: ahoraIso,
        actorNombre: auth.nombre,
        accion: 'reservacion.crear',
        descripcion: `Agendó el evento "${nueva.nombreEvento}" en ${nueva.espacioNombre}.`,
      },
    ];

    return nueva as T;
  }

  // 11. Rutas con :id (/api/reservaciones/:id, /historial, /reagendar, /cancelar)
  const matchHist = /^\/api\/reservaciones\/([^/]+)\/historial$/.exec(pathname);
  if (matchHist && method === 'GET') {
    const id = decodeURIComponent(matchHist[1]);
    return (historialMockPorId[id] ?? []) as T;
  }

  const matchCancelar = /^\/api\/reservaciones\/([^/]+)\/cancelar$/.exec(pathname);
  if (matchCancelar && method === 'POST') {
    const id = decodeURIComponent(matchCancelar[1]);
    const idx = reservacionesMock.findIndex((r) => r.id === id);
    if (idx === -1) {
      throw new ApiError(404, 'NO_ENCONTRADO', 'No se encontró la reservación.');
    }
    const actual = reservacionesMock[idx];
    if (actual.estado === 'CANCELADA') {
      throw new ApiError(409, 'ESTADO_INVALIDO', 'La reservación ya se encuentra cancelada.');
    }
    const motivo = ((body as { motivo?: string })?.motivo ?? '').trim();
    if (!motivo) {
      throw new ApiError(400, 'VALIDACION', 'Debes indicar el motivo de cancelación.', {
        campos: { motivo: 'El motivo de cancelación es obligatorio.' },
      });
    }
    const ahoraIso = new Date().toISOString();
    const actualizada: ReservacionDetalle = {
      ...actual,
      estado: 'CANCELADA',
      actualizadoEn: ahoraIso,
      version: actual.version + 1,
      cancelacion: {
        por: auth.nombre,
        en: ahoraIso,
        motivo,
      },
    };
    reservacionesMock[idx] = actualizada;
    historialMockPorId[id] = [
      ...(historialMockPorId[id] ?? []),
      {
        ocurridoEn: ahoraIso,
        actorNombre: auth.nombre,
        accion: 'reservacion.cancelar',
        descripcion: `Canceló la reservación. Motivo: ${motivo}`,
      },
    ];
    return actualizada as T;
  }

  const matchReagendar = /^\/api\/reservaciones\/([^/]+)\/reagendar$/.exec(pathname);
  if (matchReagendar && method === 'PATCH') {
    const id = decodeURIComponent(matchReagendar[1]);
    const idx = reservacionesMock.findIndex((r) => r.id === id);
    if (idx === -1) {
      throw new ApiError(404, 'NO_ENCONTRADO', 'No se encontró la reservación.');
    }
    const actual = reservacionesMock[idx];
    const entrada = (body ?? {}) as ReagendarEntrada;

    if (entrada.version !== actual.version) {
      throw new ApiError(
        409,
        'VERSION_DESACTUALIZADA',
        'La reservación fue modificada por otro usuario. Recarga el expediente e intenta de nuevo.',
      );
    }

    const nuevoEspacioId = entrada.espacioId || actual.espacioId;
    const conflictos = detectarConflictos(nuevoEspacioId, entrada.inicio, entrada.fin, actual.id);
    if (conflictos.length > 0) {
      throw new ApiError(
        409,
        'CONFLICTO_HORARIO',
        'El nuevo horario presenta conflictos de disponibilidad.',
        { conflictos, bufferMinutos: BUFFER_MINUTOS },
      );
    }

    const espacio = ESPACIOS_MOCK.find((e) => e.id === nuevoEspacioId) ?? ESPACIOS_MOCK[0];
    const ahoraIso = new Date().toISOString();
    const actualizada: ReservacionDetalle = {
      ...actual,
      espacioId: espacio.id,
      espacioNombre: espacio.nombre,
      inicio: entrada.inicio,
      fin: entrada.fin,
      actualizadoEn: ahoraIso,
      version: actual.version + 1,
    };
    reservacionesMock[idx] = actualizada;
    historialMockPorId[id] = [
      ...(historialMockPorId[id] ?? []),
      {
        ocurridoEn: ahoraIso,
        actorNombre: auth.nombre,
        accion: 'reservacion.reagendar',
        descripcion: `Reagendó para ${espacio.nombre} (${formatearRangoHorario(entrada.inicio, entrada.fin)}).`,
      },
    ];
    return actualizada as T;
  }

  const matchDetalle = /^\/api\/reservaciones\/([^/]+)$/.exec(pathname);
  if (matchDetalle && method === 'GET') {
    const id = decodeURIComponent(matchDetalle[1]);
    const encontrada = reservacionesMock.find((r) => r.id === id);
    if (!encontrada) {
      throw new ApiError(404, 'NO_ENCONTRADO', 'No se encontró la reservación solicitada.');
    }
    return encontrada as T;
  }

  throw new ApiError(404, 'NO_ENCONTRADO', `Ruta no encontrada: ${method} ${pathname}`);
}

/**
 * Genera y abre en nueva pestaña el documento HTML imprimible del expediente oficial
 * cuando VITE_USE_MOCKS=true (sin códigos QR ni sellos digitales).
 */
export function abrirReimpresionMock(id: string): void {
  const r = reservacionesMock.find((x) => x.id === id);
  if (!r) return;
  const infoTipo = obtenerInfoTipoEvento(r.tipoEvento);
  const infoEstado = obtenerInfoEstadoReservacion(r.estado);

  const html = `<!doctype html>
<html lang="es-MX">
<head>
  <meta charset="utf-8" />
  <title>Expediente ${r.codigo} · SIPREF Reservas</title>
  <style>
    body { font-family: 'Inter', Arial, sans-serif; color: #1E293B; margin: 32px; line-height: 1.5; }
    .encabezado { border-bottom: 3px solid #17304F; padding-bottom: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-start; }
    .titulo { font-size: 20px; font-weight: 700; color: #17304F; margin: 0; }
    .subtitulo { font-size: 13px; color: #64748B; margin: 4px 0 0; }
    .codigo { font-size: 16px; font-weight: 700; color: #17304F; background: #FEF7E7; border: 1px solid #F5B73B; padding: 6px 12px; border-radius: 8px; }
    .seccion { margin-bottom: 20px; border: 1px solid #E3E8EF; border-radius: 10px; padding: 16px; }
    .seccion h2 { font-size: 13px; text-transform: uppercase; color: #64748B; margin: 0 0 12px; letter-spacing: 0.05em; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 14px; }
    .etiqueta { color: #64748B; font-size: 12px; display: block; }
    .valor { font-weight: 600; color: #1E293B; }
    .acciones { margin-bottom: 20px; }
    button { background: #17304F; color: #fff; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 600; }
    @media print { .acciones { display: none; } body { margin: 12px; } }
  </style>
</head>
<body>
  <div class="acciones">
    <button onclick="window.print()">Imprimir expediente oficial</button>
  </div>
  <div class="encabezado">
    <div>
      <p class="titulo">UNIVERSIDAD LATINO · SIPREF RESERVAS</p>
      <p class="subtitulo">Expediente Oficial de Reservación de Espacio Académico</p>
    </div>
    <div class="codigo">${r.codigo} · ${infoEstado.etiqueta.toUpperCase()}</div>
  </div>
  <div class="seccion">
    <h2>Datos del Evento</h2>
    <div class="grid">
      <div><span class="etiqueta">Evento</span><span class="valor">${r.nombreEvento}</span></div>
      <div><span class="etiqueta">Tipo de evento</span><span class="valor">${infoTipo.etiqueta}</span></div>
      <div><span class="etiqueta">Aula / Espacio</span><span class="valor">${r.espacioNombre} (${r.espacioId})</span></div>
      <div><span class="etiqueta">Fecha</span><span class="valor">${formatearFechaCompleta(r.inicio)}</span></div>
      <div><span class="etiqueta">Horario</span><span class="valor">${formatearRangoHorario(r.inicio, r.fin)}</span></div>
      <div><span class="etiqueta">Asistentes estimados</span><span class="valor">${r.asistentesEstimados ?? 'No especificado'}</span></div>
      <div><span class="etiqueta">Responsable</span><span class="valor">${r.responsable}</span></div>
      <div><span class="etiqueta">Correo institucional</span><span class="valor">${r.correoResponsable}</span></div>
    </div>
  </div>
  <div class="seccion">
    <h2>Recursos Asignados y Observaciones</h2>
    <p><strong>Recursos:</strong> ${r.resumenRecursos}</p>
    <p><strong>Descripción:</strong> ${r.descripcion || 'Sin descripción registrada.'}</p>
    <p><strong>Observaciones:</strong> ${r.observaciones || 'Sin observaciones adicionales.'}</p>
  </div>
  <p style="font-size: 12px; color: #64748B;">Impreso el ${formatearFechaHora(new Date().toISOString())} · Ciclo ${CONFIGURACION_MOCK.ciclo}</p>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * Descarga un archivo CSV con BOM UTF-8 cuando VITE_USE_MOCKS=true.
 */
export function descargarExportacionMock(formato: 'csv' | 'xlsx'): void {
  const encabezados = ['Código', 'Evento', 'Tipo', 'Espacio', 'Inicio', 'Fin', 'Responsable', 'Correo', 'Estado', 'Recursos'];
  const filas = reservacionesMock.map((r) => [
    r.codigo,
    `"${r.nombreEvento.replace(/"/g, '""')}"`,
    r.tipoEvento,
    `"${r.espacioNombre}"`,
    r.inicio,
    r.fin,
    `"${r.responsable}"`,
    r.correoResponsable,
    r.estado,
    `"${r.resumenRecursos}"`,
  ]);
  const contenido = '\uFEFF' + [encabezados.join(','), ...filas.map((f) => f.join(','))].join('\r\n');
  const blob = new Blob([contenido], {
    type: formato === 'xlsx' ? 'application/vnd.ms-excel;charset=utf-8' : 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `reservaciones-sipref.${formato}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

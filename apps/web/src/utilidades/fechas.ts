export const ZONA_MEXICO = 'America/Mexico_City';

export interface ResultadoDuracion {
  minutos: number;
  texto: string;
  valida: boolean;
}

/**
 * Calcula la duración entre dos horas en formato HH:mm (24 h).
 * Ej.: calcularDuracion('10:00', '12:30') -> { minutos: 150, texto: '2 h 30 min', valida: true }
 */
export function calcularDuracion(horaInicio: string, horaFin: string): ResultadoDuracion {
  const regex = /^([01]\d|2[0-3]):([0-5]\d)$/;
  const mIni = regex.exec(horaInicio.trim());
  const mFin = regex.exec(horaFin.trim());

  if (!mIni || !mFin) {
    return { minutos: 0, texto: 'Horario incompleto', valida: false };
  }

  const minIni = Number(mIni[1]) * 60 + Number(mIni[2]);
  const minFin = Number(mFin[1]) * 60 + Number(mFin[2]);
  const diff = minFin - minIni;

  if (diff <= 0) {
    return { minutos: diff, texto: 'La hora de fin debe ser posterior a la de inicio', valida: false };
  }

  const horas = Math.floor(diff / 60);
  const mins = diff % 60;

  const partes: string[] = [];
  if (horas > 0) partes.push(`${horas} h`);
  if (mins > 0) partes.push(`${mins} min`);

  return {
    minutos: diff,
    texto: partes.join(' '),
    valida: true,
  };
}

/**
 * Construye una cadena ISO 8601 con desplazamiento -06:00 (America/Mexico_City)
 * a partir de una fecha YYYY-MM-DD y hora HH:mm.
 */
export function construirIsoMexico(fecha: string, hora: string): string {
  const h = hora.length === 5 ? `${hora}:00` : hora;
  return `${fecha}T${h}-06:00`;
}

/**
 * Extrae la fecha YYYY-MM-DD en la zona America/Mexico_City desde un ISO string o Date.
 */
export function extraerFechaMexico(entrada: string | Date): string {
  const d = typeof entrada === 'string' ? new Date(entrada) : entrada;
  if (Number.isNaN(d.getTime())) return '';
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_MEXICO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const y = partes.find((p) => p.type === 'year')?.value ?? '2026';
  const m = partes.find((p) => p.type === 'month')?.value ?? '01';
  const day = partes.find((p) => p.type === 'day')?.value ?? '01';
  return `${y}-${m}-${day}`;
}

/**
 * Extrae la hora HH:mm (24h) en la zona America/Mexico_City desde un ISO string o Date.
 */
export function extraerHoraMexico(entrada: string | Date): string {
  const d = typeof entrada === 'string' ? new Date(entrada) : entrada;
  if (Number.isNaN(d.getTime())) return '00:00';
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: ZONA_MEXICO,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const hh = partes.find((p) => p.type === 'hour')?.value ?? '00';
  const mm = partes.find((p) => p.type === 'minute')?.value ?? '00';
  return `${hh === '24' ? '00' : hh}:${mm}`;
}

/**
 * Formatea una fecha completa en español de México:
 * ej. "domingo, 15 de noviembre de 2026"
 */
export function formatearFechaCompleta(fechaYmdOIso: string): string {
  const d = fechaYmdOIso.length === 10 ? new Date(`${fechaYmdOIso}T12:00:00-06:00`) : new Date(fechaYmdOIso);
  if (Number.isNaN(d.getTime())) return fechaYmdOIso;
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: ZONA_MEXICO,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d);
}

/**
 * Formatea una fecha corta en español de México:
 * ej. "15 nov 2026"
 */
export function formatearFechaCorta(fechaYmdOIso: string): string {
  const d = fechaYmdOIso.length === 10 ? new Date(`${fechaYmdOIso}T12:00:00-06:00`) : new Date(fechaYmdOIso);
  if (Number.isNaN(d.getTime())) return fechaYmdOIso;
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: ZONA_MEXICO,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

/**
 * Formatea fecha y hora en español de México:
 * ej. "15 nov 2026, 10:00"
 */
export function formatearFechaHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const fecha = formatearFechaCorta(iso);
  const hora = extraerHoraMexico(d);
  return `${fecha}, ${hora} h`;
}

/**
 * Formatea un rango horario desde dos cadenas ISO:
 * ej. "10:00 – 12:00"
 */
export function formatearRangoHorario(inicioIso: string, finIso: string): string {
  return `${extraerHoraMexico(inicioIso)} – ${extraerHoraMexico(finIso)}`;
}

/**
 * Formatea el título del mes y año: ej. "noviembre de 2026"
 */
export function formatearTituloMes(fechaYmd: string): string {
  const d = new Date(`${fechaYmd}T12:00:00-06:00`);
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: ZONA_MEXICO,
    month: 'long',
    year: 'numeric',
  }).format(d);
}

/**
 * Suma o resta días a una fecha YYYY-MM-DD y devuelve YYYY-MM-DD.
 */
export function sumarDiasYmd(fechaYmd: string, dias: number): string {
  const [y, m, d] = fechaYmd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + dias, 12, 0, 0));
  return dt.toISOString().slice(0, 10);
}

/**
 * Suma o resta meses a una fecha YYYY-MM-DD y devuelve el día 01 (o equivalente) en YYYY-MM-DD.
 */
export function sumarMesesYmd(fechaYmd: string, meses: number): string {
  const [y, m, d] = fechaYmd.split('-').map(Number);
  const destinoMes = m - 1 + meses;
  const ultimoDiaDestino = new Date(Date.UTC(y, destinoMes + 1, 0, 12, 0, 0)).getUTCDate();
  const diaSeguro = Math.min(d, ultimoDiaDestino);
  const dt = new Date(Date.UTC(y, destinoMes, diaSeguro, 12, 0, 0));
  return dt.toISOString().slice(0, 10);
}

/**
 * Obtiene el lunes de la semana a la que pertenece fechaYmd (semana Lunes-Domingo).
 */
export function obtenerInicioSemanaLunes(fechaYmd: string): string {
  const [y, m, d] = fechaYmd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const diaSemana = dt.getUTCDay(); // 0=Dom, 1=Lun, ..., 6=Sab
  const desplazamiento = diaSemana === 0 ? -6 : 1 - diaSemana;
  return sumarDiasYmd(fechaYmd, desplazamiento);
}

export interface CeldaDiaMes {
  fechaYmd: string;
  diaMes: number;
  esMesActual: boolean;
}

/**
 * Genera las 42 celdas (6 semanas x 7 días, Lunes a Domingo) para la cuadrícula mensual,
 * además del rango ISO [desde, hasta] para consultar `/api/calendario` (<= 62 días).
 */
export function construirCuadriculaMes(fechaYmd: string): {
  celdas: CeldaDiaMes[];
  desdeIso: string;
  hastaIso: string;
} {
  const [y, m] = fechaYmd.split('-').map(Number);
  const primerDiaMes = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-01`;
  const inicioCuadricula = obtenerInicioSemanaLunes(primerDiaMes);

  const celdas: CeldaDiaMes[] = [];
  for (let i = 0; i < 42; i++) {
    const f = sumarDiasYmd(inicioCuadricula, i);
    const [, mesCelda, diaCelda] = f.split('-').map(Number);
    celdas.push({
      fechaYmd: f,
      diaMes: diaCelda,
      esMesActual: mesCelda === m,
    });
  }

  const ultimaFecha = celdas[celdas.length - 1].fechaYmd;
  return {
    celdas,
    desdeIso: `${inicioCuadricula}T00:00:00-06:00`,
    hastaIso: `${ultimaFecha}T23:59:59-06:00`,
  };
}

/**
 * Devuelve los 7 días YYYY-MM-DD (Lunes a Domingo) de la semana de fechaYmd.
 */
export function construirDiasSemana(fechaYmd: string): {
  dias: string[];
  desdeIso: string;
  hastaIso: string;
} {
  const lunes = obtenerInicioSemanaLunes(fechaYmd);
  const dias = Array.from({ length: 7 }, (_, i) => sumarDiasYmd(lunes, i));
  return {
    dias,
    desdeIso: `${dias[0]}T00:00:00-06:00`,
    hastaIso: `${dias[6]}T23:59:59-06:00`,
  };
}

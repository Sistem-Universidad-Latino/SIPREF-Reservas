import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  Bell,
  CalendarCheck,
  CheckCircle2,
  Loader2,
  Trash2,
  X,
} from 'lucide-react';
import {
  consultarDisponibilidad,
  useConfiguracion,
  useCrearReservacion,
  useEspacios,
  useYo,
} from '../api/consultas';
import { esApiError, mensajeDeError } from '../api/cliente';
import type {
  Conflicto,
  DisponibilidadRespuesta,
  UnidadAnticipacion,
} from '../api/tipos';
import { OPCIONES_UNIDAD_ANTICIPACION } from '../utilidades/catalogos';
import {
  calcularDuracion,
  construirIsoMexico,
  extraerFechaMexico,
  formatearRangoHorario,
  sumarDiasYmd,
} from '../utilidades/fechas';
import {
  MAX_RECORDATORIOS,
  convertirFilasRecordatorios,
  crearFilaRecordatorioPorDefecto,
  type FilaRecordatorio,
} from '../utilidades/recordatorios';
import { useToast } from '../componentes/Toast';

const LABEL_CLASS =
  'block text-xs font-bold text-[#1c355e] uppercase tracking-wider mb-2';
const INPUT_CLASS =
  'w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:bg-white focus:ring-2 focus:ring-[#1c355e]/20 outline-none transition-colors';

export function PaginaNuevaReservacion() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();

  const { data: yo } = useYo();
  const { data: config } = useConfiguracion();
  const { data: espacios = [] } = useEspacios();

  const crearReservacionMut = useCrearReservacion();

  const fechaPorDefecto = useMemo(() => {
    const param = searchParams.get('fecha');
    if (param && /^\d{4}-\d{2}-\d{2}$/.test(param)) return param;
    return sumarDiasYmd(extraerFechaMexico(new Date()), 1);
  }, [searchParams]);

  // Campos principales del formulario
  const [tipoEvento, setTipoEvento] = useState<string>('');
  const [espacioId, setEspacioId] = useState<string>('');
  const [nombreEvento, setNombreEvento] = useState<string>('');
  const [fecha, setFecha] = useState<string>(fechaPorDefecto);
  const [horaInicio, setHoraInicio] = useState<string>('10:00');
  const [horaFin, setHoraFin] = useState<string>('12:30');
  const [responsable, setResponsable] = useState<string>('');
  const [correoResponsable, setCorreoResponsable] = useState<string>('');
  const [descripcion, setDescripcion] = useState<string>('');

  // Prellenar responsable y correo con el usuario autenticado y el primer espacio
  useEffect(() => {
    if (yo && !responsable && !correoResponsable) {
      setResponsable(yo.nombre);
      setCorreoResponsable(yo.correo);
    }
  }, [yo, responsable, correoResponsable]);

  useEffect(() => {
    if (!espacioId && espacios.length > 0) {
      setEspacioId(espacios[0].id);
    }
  }, [espacios, espacioId]);

  // Recordatorios: por defecto 1 fila con Correo y 1 día
  const [filasRecordatorios, setFilasRecordatorios] = useState<FilaRecordatorio[]>([
    crearFilaRecordatorioPorDefecto('fila-inicial'),
  ]);

  // Disponibilidad en vivo y errores
  const [disponibilidad, setDisponibilidad] = useState<DisponibilidadRespuesta | null>(null);
  const [verificandoDisponibilidad, setVerificandoDisponibilidad] = useState(false);
  const [conflictosEnvio, setConflictosEnvio] = useState<Conflicto[]>([]);
  const [erroresCampo, setErroresCampo] = useState<Record<string, string>>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);

  const duracion = useMemo(
    () => calcularDuracion(horaInicio, horaFin),
    [horaInicio, horaFin],
  );

  // Verificación de disponibilidad con debounce (300 ms)
  useEffect(() => {
    setConflictosEnvio([]);
    if (!espacioId || !fecha || !duracion.valida) {
      setDisponibilidad(null);
      return;
    }

    const controlador = new AbortController();
    const timer = window.setTimeout(async () => {
      setVerificandoDisponibilidad(true);
      try {
        const res = await consultarDisponibilidad(
          {
            espacioId,
            inicio: construirIsoMexico(fecha, horaInicio),
            fin: construirIsoMexico(fecha, horaFin),
          },
          controlador.signal,
        );
        setDisponibilidad(res);
      } catch {
        // Ignorar abortos
      } finally {
        setVerificandoDisponibilidad(false);
      }
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controlador.abort();
    };
  }, [espacioId, fecha, horaInicio, horaFin, duracion.valida]);

  const agregarFilaRecordatorio = () => {
    setFilasRecordatorios((prev) => [
      ...prev,
      {
        id: `fila-${Date.now()}-${prev.length}`,
        sipref: false,
        correo: true,
        anticipacion: 30,
        unidad: 'MINUTOS',
      },
    ]);
  };

  const actualizarFilaRecordatorio = (
    id: string,
    parcial: Partial<FilaRecordatorio>,
  ) => {
    setFilasRecordatorios((prev) =>
      prev.map((f) => (f.id === id ? { ...f, ...parcial } : f)),
    );
  };

  const eliminarFilaRecordatorio = (id: string) => {
    setFilasRecordatorios((prev) => prev.filter((f) => f.id !== id));
  };

  const recordatoriosPayload = useMemo(
    () => convertirFilasRecordatorios(filasRecordatorios),
    [filasRecordatorios],
  );

  const manejarSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErroresCampo({});
    setErrorGeneral(null);
    setConflictosEnvio([]);

    const nuevosErrores: Record<string, string> = {};
    if (!tipoEvento.trim()) {
      nuevosErrores.tipoEvento = 'Ingresa el tipo de evento.';
    }
    if (!nombreEvento.trim()) {
      nuevosErrores.nombreEvento = 'Ingresa el nombre del evento.';
    }
    if (!espacioId) {
      nuevosErrores.espacioId = 'Selecciona un aula o espacio.';
    }
    if (!duracion.valida) {
      nuevosErrores.fin = duracion.texto;
    }
    if (!responsable.trim()) {
      nuevosErrores.responsable = 'Ingresa el nombre del responsable.';
    }
    if (!correoResponsable.trim() || !correoResponsable.includes('@')) {
      nuevosErrores.correoResponsable = 'Ingresa un correo electrónico válido.';
    }
    if (recordatoriosPayload.length > MAX_RECORDATORIOS) {
      nuevosErrores.recordatorios = `Puedes configurar hasta ${MAX_RECORDATORIOS} envíos de recordatorio en total.`;
    }

    if (Object.keys(nuevosErrores).length > 0) {
      setErroresCampo(nuevosErrores);
      setErrorGeneral('Por favor corrige los campos señalados antes de continuar.');
      return;
    }

    try {
      await crearReservacionMut.mutateAsync({
        tipoEvento,
        espacioId,
        nombreEvento: nombreEvento.trim(),
        inicio: construirIsoMexico(fecha, horaInicio),
        fin: construirIsoMexico(fecha, horaFin),
        responsable: responsable.trim(),
        correoResponsable: correoResponsable.trim(),
        descripcion: descripcion.trim(),
        observaciones: '',
        asistentesEstimados: null,
        recursos: [],
        recordatorios: recordatoriosPayload,
      });

      toast.exito('Evento agendado correctamente');
      navigate(`/calendario?fecha=${fecha}`);
    } catch (err) {
      if (esApiError(err)) {
        if (err.status === 400 && Object.keys(err.campos).length > 0) {
          setErroresCampo(err.campos);
        }
        if (err.status === 409 && err.codigo === 'CONFLICTO_HORARIO') {
          const conf = (err.detalles?.conflictos as Conflicto[] | undefined) ?? [];
          setConflictosEnvio(conf);
        }
        setErrorGeneral(err.message);
      } else {
        setErrorGeneral(mensajeDeError(err));
      }
    }
  };

  const bufferMinutos = disponibilidad?.bufferMinutos ?? config?.bufferMinutos ?? 15;
  const conflictosActivos =
    conflictosEnvio.length > 0 ? conflictosEnvio : (disponibilidad?.conflictos ?? []);
  const limiteRecordatoriosAlcanzado =
    filasRecordatorios.length >= MAX_RECORDATORIOS ||
    recordatoriosPayload.length >= MAX_RECORDATORIOS;

  return (
    <div className="max-w-2xl mx-auto bg-white rounded-3xl p-6 sm:p-8 shadow-xl border border-slate-100">
      {/* 1. Cabecera limpia */}
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4 mb-6">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-[#1c355e]/10 text-[#1c355e] flex items-center justify-center shrink-0">
            <CalendarCheck className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[#1c355e] leading-tight">
              Agendar Evento en Aula
            </h1>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Reserva de espacios para conferencias, juntas y exámenes en SIPREF
            </p>
          </div>
        </div>

        <Link
          to="/calendario"
          aria-label="Volver al calendario"
          title="Volver al calendario"
          className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors shrink-0"
        >
          <X className="w-4 h-4" />
        </Link>
      </div>

      {/* 2. Alerta de disponibilidad / conflicto */}
      {(conflictosActivos.length > 0 || errorGeneral) && (
        <div
          role="alert"
          className="rounded-2xl bg-red-50 border border-red-200 p-4 text-red-800 mb-5 space-y-2"
        >
          <div className="flex items-center gap-2 font-bold text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
            <span>
              {conflictosActivos.length > 0
                ? 'Reserva Bloqueada — Aula Ocupada'
                : 'No se pudo completar la reservación'}
            </span>
          </div>

          {errorGeneral && (
            <p className="text-xs font-medium text-red-700">{errorGeneral}</p>
          )}

          {conflictosActivos.length > 0 && (
            <ul className="space-y-1.5 pt-1">
              {conflictosActivos.map((c, idx) => (
                <li
                  key={`${c.origen}-${c.nombreEvento}-${idx}`}
                  className="text-xs bg-white/70 border border-red-200/80 rounded-xl px-3 py-2 flex flex-wrap items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-red-100 text-red-800 font-bold text-[10px] uppercase tracking-wide shrink-0">
                      {c.origen}
                    </span>
                    <span className="font-semibold text-red-900 truncate">
                      {c.nombreEvento}
                    </span>
                  </div>
                  <span className="font-semibold text-red-700 shrink-0">
                    {formatearRangoHorario(c.inicio, c.fin)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!verificandoDisponibilidad &&
        disponibilidad?.disponible &&
        duracion.valida &&
        conflictosActivos.length === 0 && (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3.5 py-2 text-xs font-semibold text-emerald-800 mb-5 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              Aula disponible en el horario seleccionado (buffer de {bufferMinutos} min respetado).
            </span>
          </div>
        )}

      {verificandoDisponibilidad && (
        <div className="rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-600 mb-5 flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-[#1c355e]" />
          <span>Verificando disponibilidad en tiempo real...</span>
        </div>
      )}

      {/* 3. Campos del formulario */}
      <form onSubmit={manejarSubmit} noValidate className="space-y-5">
        {/* Fila 1: Tipo de evento y Aula / Espacio */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="campo-tipo-evento" className={LABEL_CLASS}>
              TIPO DE EVENTO *
            </label>
            <input
              id="campo-tipo-evento"
              type="text"
              value={tipoEvento}
              onChange={(e) => setTipoEvento(e.target.value)}
              placeholder="Ej. Conferencia, Junta, Examen, Taller..."
              className={INPUT_CLASS}
              required
            />
            {erroresCampo.tipoEvento && (
              <p className="mt-1 text-xs font-medium text-red-600">
                {erroresCampo.tipoEvento}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="campo-espacio" className={LABEL_CLASS}>
              AULA / ESPACIO *
            </label>
            <select
              id="campo-espacio"
              value={espacioId}
              onChange={(e) => setEspacioId(e.target.value)}
              className={INPUT_CLASS}
              required
            >
              {espacios.map((esp) => (
                <option key={esp.id} value={esp.id}>
                  {esp.nombre} {esp.edificio ? `(${esp.edificio})` : ''}
                </option>
              ))}
            </select>
            {erroresCampo.espacioId && (
              <p className="mt-1 text-xs font-medium text-red-600">
                {erroresCampo.espacioId}
              </p>
            )}
          </div>
        </div>

        {/* Fila 2: Nombre del evento */}
        <div>
          <label htmlFor="campo-nombre-evento" className={LABEL_CLASS}>
            NOMBRE DEL EVENTO *
          </label>
          <input
            id="campo-nombre-evento"
            type="text"
            value={nombreEvento}
            onChange={(e) => setNombreEvento(e.target.value)}
            placeholder="Ej. Conferencia Magistral de Ingeniería de Software"
            className={INPUT_CLASS}
            required
          />
          {erroresCampo.nombreEvento && (
            <p className="mt-1 text-xs font-medium text-red-600">
              {erroresCampo.nombreEvento}
            </p>
          )}
        </div>

        {/* Fila 3: Fecha, Hora inicio, Hora fin */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor="campo-fecha" className={LABEL_CLASS}>
              FECHA *
            </label>
            <input
              id="campo-fecha"
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className={INPUT_CLASS}
              required
            />
          </div>

          <div>
            <label htmlFor="campo-hora-inicio" className={LABEL_CLASS}>
              HORA INICIO *
            </label>
            <input
              id="campo-hora-inicio"
              type="time"
              value={horaInicio}
              onChange={(e) => setHoraInicio(e.target.value)}
              className={INPUT_CLASS}
              required
            />
          </div>

          <div>
            <label htmlFor="campo-hora-fin" className={LABEL_CLASS}>
              HORA FIN *
            </label>
            <input
              id="campo-hora-fin"
              type="time"
              value={horaFin}
              onChange={(e) => setHoraFin(e.target.value)}
              className={INPUT_CLASS}
              required
            />
            {(erroresCampo.fin || !duracion.valida) && (
              <p className="mt-1 text-xs font-medium text-red-600">
                {erroresCampo.fin ?? duracion.texto}
              </p>
            )}
          </div>
        </div>

        {/* Fila 4: Responsable y Correo */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="campo-responsable" className={LABEL_CLASS}>
              RESPONSABLE DEL EVENTO *
            </label>
            <input
              id="campo-responsable"
              type="text"
              value={responsable}
              onChange={(e) => setResponsable(e.target.value)}
              placeholder="Ej. Dr. Juan Pérez"
              className={INPUT_CLASS}
              required
            />
            {erroresCampo.responsable && (
              <p className="mt-1 text-xs font-medium text-red-600">
                {erroresCampo.responsable}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="campo-correo-responsable" className={LABEL_CLASS}>
              CORREO ELECTRÓNICO (PARA AVISO) *
            </label>
            <input
              id="campo-correo-responsable"
              type="email"
              value={correoResponsable}
              onChange={(e) => setCorreoResponsable(e.target.value)}
              placeholder="ejemplo@correo.com"
              className={INPUT_CLASS}
              required
            />
            {erroresCampo.correoResponsable && (
              <p className="mt-1 text-xs font-medium text-red-600">
                {erroresCampo.correoResponsable}
              </p>
            )}
          </div>
        </div>

        {/* Fila 5: Descripción opcional */}
        <div>
          <label htmlFor="campo-descripcion" className={LABEL_CLASS}>
            DESCRIPCIÓN DEL EVENTO (OPCIONAL)
          </label>
          <textarea
            id="campo-descripcion"
            rows={2}
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Detalles sobre proyector, micrófonos, asistentes previstos, etc."
            className={`${INPUT_CLASS} resize-none`}
          />
        </div>

        {/* 4. Bloque compacto de Recordatorios */}
        <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-[#1c355e]" />
              <span className="text-xs font-bold uppercase tracking-wider text-[#1c355e]">
                CONFIGURACIÓN DE RECORDATORIOS
              </span>
            </div>

            <button
              type="button"
              onClick={agregarFilaRecordatorio}
              disabled={limiteRecordatoriosAlcanzado}
              className="text-xs font-bold text-[#1c355e] hover:underline disabled:opacity-40 disabled:no-underline cursor-pointer"
            >
              + Agregar otro
            </button>
          </div>

          <div className="space-y-2">
            {filasRecordatorios.map((fila, idx) => (
              <div
                key={fila.id}
                className="flex flex-wrap items-center gap-2 bg-white p-2.5 rounded-xl border border-slate-200 text-xs"
              >
                <label className="inline-flex items-center gap-1.5 font-semibold text-slate-700 cursor-pointer mr-1">
                  <input
                    type="checkbox"
                    checked={fila.correo}
                    onChange={(e) =>
                      actualizarFilaRecordatorio(fila.id, { correo: e.target.checked })
                    }
                    className="rounded border-slate-300 text-[#1c355e] focus:ring-[#1c355e]/20"
                  />
                  <span>Correo</span>
                </label>

                <span className="text-slate-400 font-bold">Anticipación:</span>

                <input
                  type="number"
                  min={1}
                  value={fila.anticipacion}
                  onChange={(e) =>
                    actualizarFilaRecordatorio(fila.id, {
                      anticipacion: Math.max(1, Number(e.target.value) || 1),
                    })
                  }
                  aria-label="Cantidad de anticipación"
                  className="w-16 text-center font-bold px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 outline-none focus:bg-white focus:ring-2 focus:ring-[#1c355e]/20"
                />

                <select
                  value={fila.unidad}
                  onChange={(e) =>
                    actualizarFilaRecordatorio(fila.id, {
                      unidad: e.target.value as UnidadAnticipacion,
                    })
                  }
                  aria-label="Unidad de anticipación"
                  className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg font-semibold text-slate-700 outline-none focus:bg-white focus:ring-2 focus:ring-[#1c355e]/20"
                >
                  {OPCIONES_UNIDAD_ANTICIPACION.map((op) => (
                    <option key={op.valor} value={op.valor}>
                      {op.etiqueta}
                    </option>
                  ))}
                </select>

                {idx > 0 && (
                  <button
                    type="button"
                    onClick={() => eliminarFilaRecordatorio(fila.id)}
                    aria-label="Eliminar recordatorio"
                    className="ml-auto text-slate-400 hover:text-red-600 p-1 rounded-lg transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {erroresCampo.recordatorios && (
            <p className="text-xs font-medium text-red-600">
              {erroresCampo.recordatorios}
            </p>
          )}
        </div>

        {/* 5. Botonera inferior */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
          <Link
            to="/calendario"
            className="border border-slate-200 rounded-xl px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Cancelar
          </Link>

          <button
            type="submit"
            disabled={crearReservacionMut.isPending}
            className="bg-[#1c355e] hover:bg-[#152847] text-white rounded-xl px-6 py-2.5 text-sm font-bold shadow-sm transition-colors disabled:opacity-60 cursor-pointer"
          >
            {crearReservacionMut.isPending ? 'Agendando...' : 'Agendar Evento'}
          </button>
        </div>
      </form>
    </div>
  );
}

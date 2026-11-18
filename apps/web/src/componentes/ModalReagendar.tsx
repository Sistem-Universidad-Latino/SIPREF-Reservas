import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import { Modal } from './Modal';
import {
  consultarDisponibilidad,
  useConfiguracion,
  useEspacios,
  useReagendarReservacion,
} from '../api/consultas';
import { esApiError, mensajeDeError } from '../api/cliente';
import type { Conflicto, DisponibilidadRespuesta, ReservacionDetalle } from '../api/tipos';
import { esEspacioExclusivoReservas } from '../utilidades/catalogos';
import {
  calcularDuracion,
  construirIsoMexico,
  extraerFechaMexico,
  extraerHoraMexico,
  formatearRangoHorario,
} from '../utilidades/fechas';
import { useToast } from './Toast';

interface PropiedadesModalReagendar {
  abierto: boolean;
  alCerrar: () => void;
  reservacion: ReservacionDetalle | null;
  alCompletar?: () => void;
}

export function ModalReagendar({
  abierto,
  alCerrar,
  reservacion,
  alCompletar,
}: PropiedadesModalReagendar) {
  const { data: espaciosRaw = [] } = useEspacios();
  const espacios = React.useMemo(
    () =>
      espaciosRaw.filter(
        (esp) =>
          esEspacioExclusivoReservas(esp) ||
          (reservacion !== null && esp.id === reservacion.espacioId),
      ),
    [espaciosRaw, reservacion],
  );
  const { data: config } = useConfiguracion();
  const reagendarMut = useReagendarReservacion();
  const toast = useToast();

  const [espacioId, setEspacioId] = useState('');
  const [fecha, setFecha] = useState('');
  const [horaInicio, setHoraInicio] = useState('');
  const [horaFin, setHoraFin] = useState('');

  const [disponibilidad, setDisponibilidad] = useState<DisponibilidadRespuesta | null>(null);
  const [verificando, setVerificando] = useState(false);
  const [conflictosServidor, setConflictosServidor] = useState<Conflicto[]>([]);
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);

  useEffect(() => {
    if (reservacion && abierto) {
      setEspacioId(reservacion.espacioId);
      setFecha(extraerFechaMexico(reservacion.inicio));
      setHoraInicio(extraerHoraMexico(reservacion.inicio));
      setHoraFin(extraerHoraMexico(reservacion.fin));
      setConflictosServidor([]);
      setErrorGeneral(null);
    }
  }, [reservacion, abierto]);

  const duracion = calcularDuracion(horaInicio, horaFin);

  useEffect(() => {
    if (!abierto || !reservacion || !espacioId || !fecha || !duracion.valida) {
      setDisponibilidad(null);
      return;
    }

    const controlador = new AbortController();
    const timer = window.setTimeout(async () => {
      setVerificando(true);
      try {
        const res = await consultarDisponibilidad(
          {
            espacioId,
            inicio: construirIsoMexico(fecha, horaInicio),
            fin: construirIsoMexico(fecha, horaFin),
            excluirId: reservacion.id,
          },
          controlador.signal,
        );
        setDisponibilidad(res);
      } catch {
        // Ignorar cancelación o error transitorio de red en pre-chequeo
      } finally {
        setVerificando(false);
      }
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controlador.abort();
    };
  }, [abierto, reservacion, espacioId, fecha, horaInicio, horaFin, duracion.valida]);

  if (!reservacion) return null;

  const manejarEnvio = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!duracion.valida) {
      setErrorGeneral(duracion.texto);
      return;
    }
    setErrorGeneral(null);
    setConflictosServidor([]);

    try {
      await reagendarMut.mutateAsync({
        id: reservacion.id,
        espacioId,
        inicio: construirIsoMexico(fecha, horaInicio),
        fin: construirIsoMexico(fecha, horaFin),
        version: reservacion.version,
      });
      toast.exito('Reservación reagendada correctamente');
      alCerrar();
      alCompletar?.();
    } catch (err) {
      if (esApiError(err) && err.status === 409 && err.codigo === 'CONFLICTO_HORARIO') {
        const conf = (err.detalles?.conflictos as Conflicto[] | undefined) ?? [];
        setConflictosServidor(conf);
        setErrorGeneral(err.message);
      } else {
        setErrorGeneral(mensajeDeError(err));
      }
    }
  };

  const bufferMin = disponibilidad?.bufferMinutos ?? config?.bufferMinutos ?? 15;
  const conflictosMostrar =
    conflictosServidor.length > 0 ? conflictosServidor : (disponibilidad?.conflictos ?? []);

  return (
    <Modal
      abierto={abierto}
      alCerrar={() => {
        if (!reagendarMut.isPending) alCerrar();
      }}
      titulo="Reagendar reservación"
      subtitulo={`${reservacion.codigo} · ${reservacion.nombreEvento}`}
      anchoMax="lg"
    >
      <form onSubmit={manejarEnvio} className="space-y-4">
        <div>
          <label htmlFor="reagendar-espacio" className="label-base">
            Aula o espacio asignado
          </label>
          <select
            id="reagendar-espacio"
            value={espacioId}
            onChange={(e) => setEspacioId(e.target.value)}
            className="input-base"
            required
          >
            {espacios.map((esp) => (
              <option key={esp.id} value={esp.id}>
                {esp.nombre}
                {esp.edificio ? ` (${esp.edificio})` : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label htmlFor="reagendar-fecha" className="label-base">
              Nueva fecha
            </label>
            <input
              id="reagendar-fecha"
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="input-base"
              required
            />
          </div>
          <div>
            <label htmlFor="reagendar-inicio" className="label-base">
              Hora de inicio
            </label>
            <input
              id="reagendar-inicio"
              type="time"
              value={horaInicio}
              onChange={(e) => setHoraInicio(e.target.value)}
              className="input-base"
              required
            />
          </div>
          <div>
            <label htmlFor="reagendar-fin" className="label-base">
              Hora de fin
            </label>
            <input
              id="reagendar-fin"
              type="time"
              value={horaFin}
              onChange={(e) => setHoraFin(e.target.value)}
              className="input-base"
              required
            />
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-texto-suave">
          <Clock className="h-4 w-4 text-navy" />
          {duracion.valida ? (
            <span>
              Duración: <strong className="text-texto">{duracion.texto}</strong>
            </span>
          ) : (
            <span className="text-rose-600 font-medium">{duracion.texto}</span>
          )}
        </div>

        {verificando && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-texto-suave">
            Verificando disponibilidad del espacio...
          </div>
        )}

        {!verificando && duracion.valida && disponibilidad?.disponible && conflictosServidor.length === 0 && (
          <div className="flex items-center gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-800">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>
              Aula disponible (se respetan {bufferMin} minutos entre eventos)
            </span>
          </div>
        )}

        {conflictosMostrar.length > 0 && (
          <div
            role="alert"
            className="rounded-lg border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-800 space-y-2"
          >
            <div className="flex items-center gap-2 font-semibold text-rose-900">
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
              <span>
                Conflicto de horario detectado (buffer de {bufferMin} min entre eventos):
              </span>
            </div>
            <ul className="space-y-1.5 pl-6 list-disc">
              {conflictosMostrar.map((c, i) => (
                <li key={i}>
                  <span className="inline-block rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold uppercase mr-1.5">
                    {c.origen}
                  </span>
                  <strong>{c.nombreEvento}</strong> ({formatearRangoHorario(c.inicio, c.fin)})
                </li>
              ))}
            </ul>
          </div>
        )}

        {errorGeneral && conflictosMostrar.length === 0 && (
          <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700">
            {errorGeneral}
          </div>
        )}

        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={alCerrar}
            disabled={reagendarMut.isPending}
            className="btn-secundario"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={reagendarMut.isPending || !duracion.valida}
            className="btn-primario"
          >
            {reagendarMut.isPending ? 'Guardando cambios...' : 'Guardar nuevo horario'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

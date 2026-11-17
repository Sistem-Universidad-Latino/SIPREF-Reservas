import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Building2,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  Lock,
  Package,
  Plus,
  Trash2,
  User,
} from 'lucide-react';
import { useCalendario, useConfiguracion, useEspacios } from '../api/consultas';
import type { EventoCalendario } from '../api/tipos';
import {
  LISTA_TIPOS_EVENTO,
  obtenerInfoEstadoReservacion,
  obtenerInfoTipoEvento,
} from '../utilidades/catalogos';
import {
  construirCuadriculaMes,
  construirDiasSemana,
  extraerFechaMexico,
  extraerHoraMexico,
  formatearFechaCompleta,
  formatearFechaCorta,
  formatearRangoHorario,
  formatearTituloMes,
  sumarDiasYmd,
  sumarMesesYmd,
} from '../utilidades/fechas';
import { ModalCancelar } from '../componentes/ModalCancelar';
import { PanelExpediente } from '../componentes/PanelExpediente';

type VistaCalendario = 'mes' | 'semana' | 'dia';

const DIAS_SEMANA_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const HORAS_AGENDA = Array.from({ length: 14 }, (_, i) => i + 7); // 07:00 a 20:00

export function PaginaCalendario() {
  const [searchParams] = useSearchParams();
  const fechaInicialParam = searchParams.get('fecha');
  const hoyYmd = useMemo(() => extraerFechaMexico(new Date()), []);

  const [fechaSeleccionada, setFechaSeleccionada] = useState<string>(
    fechaInicialParam && /^\d{4}-\d{2}-\d{2}$/.test(fechaInicialParam)
      ? fechaInicialParam
      : hoyYmd,
  );
  const [vista, setVista] = useState<VistaCalendario>('mes');
  const [espacioFiltro, setEspacioFiltro] = useState<string>('');
  const [expedienteId, setExpedienteId] = useState<string | null>(null);
  const [eventoACancelar, setEventoACancelar] = useState<EventoCalendario | null>(null);

  const { data: config } = useConfiguracion();
  const { data: espacios = [] } = useEspacios();

  const cuadriculaMes = useMemo(
    () => construirCuadriculaMes(fechaSeleccionada),
    [fechaSeleccionada],
  );
  const datosSemana = useMemo(
    () => construirDiasSemana(fechaSeleccionada),
    [fechaSeleccionada],
  );

  const rangoConsulta = useMemo(() => {
    if (vista === 'semana') {
      return { desde: datosSemana.desdeIso, hasta: datosSemana.hastaIso };
    }
    if (vista === 'dia') {
      return {
        desde: `${fechaSeleccionada}T00:00:00-06:00`,
        hasta: `${fechaSeleccionada}T23:59:59-06:00`,
      };
    }
    return { desde: cuadriculaMes.desdeIso, hasta: cuadriculaMes.hastaIso };
  }, [vista, cuadriculaMes, datosSemana, fechaSeleccionada]);

  const { data: eventos = [], isLoading } = useCalendario(
    rangoConsulta.desde,
    rangoConsulta.hasta,
    espacioFiltro || undefined,
  );

  // Agrupar eventos por YYYY-MM-DD en zona America/Mexico_City
  const eventosPorDia = useMemo(() => {
    const mapa = new Map<string, EventoCalendario[]>();
    for (const ev of eventos) {
      const f = extraerFechaMexico(ev.inicio);
      const lista = mapa.get(f) ?? [];
      lista.push(ev);
      mapa.set(f, lista);
    }
    return mapa;
  }, [eventos]);

  const eventosDiaSeleccionado = useMemo(
    () => eventosPorDia.get(fechaSeleccionada) ?? [],
    [eventosPorDia, fechaSeleccionada],
  );

  const navegarAnterior = () => {
    if (vista === 'mes') setFechaSeleccionada((f) => sumarMesesYmd(f, -1));
    else if (vista === 'semana') setFechaSeleccionada((f) => sumarDiasYmd(f, -7));
    else setFechaSeleccionada((f) => sumarDiasYmd(f, -1));
  };

  const navegarSiguiente = () => {
    if (vista === 'mes') setFechaSeleccionada((f) => sumarMesesYmd(f, 1));
    else if (vista === 'semana') setFechaSeleccionada((f) => sumarDiasYmd(f, 7));
    else setFechaSeleccionada((f) => sumarDiasYmd(f, 1));
  };

  const irAHoy = () => {
    setFechaSeleccionada(hoyYmd);
  };

  const tituloPeriodo = useMemo(() => {
    if (vista === 'mes') return formatearTituloMes(fechaSeleccionada);
    if (vista === 'semana') {
      const ini = datosSemana.dias[0];
      const fin = datosSemana.dias[6];
      return `${formatearFechaCorta(ini)} – ${formatearFechaCorta(fin)}`;
    }
    return formatearFechaCompleta(fechaSeleccionada);
  }, [vista, fechaSeleccionada, datosSemana]);

  return (
    <div className="space-y-5">
      {/* Encabezado superior */}
      <div className="tarjeta p-4 sm:p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center rounded-lg bg-navy px-3 py-1 text-xs font-bold tracking-wider text-amber uppercase">
              CICLO {config?.ciclo ?? '2026-B'}
            </span>
            <h1 className="text-xl sm:text-2xl font-bold text-navy">
              Calendario de Aulas y Espacios
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Filtro por espacio */}
            <div className="relative min-w-[220px]">
              <select
                aria-label="Filtrar por aula o espacio"
                value={espacioFiltro}
                onChange={(e) => setEspacioFiltro(e.target.value)}
                className="input-base py-2 pr-8 text-xs font-medium"
              >
                <option value="">Todas las aulas y espacios</option>
                {espacios.map((esp) => (
                  <option key={esp.id} value={esp.id}>
                    {esp.nombre}
                    {esp.edificio ? ` (${esp.edificio})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <Link to={`/reservaciones/nueva?fecha=${fechaSeleccionada}`} className="btn-primario py-2 text-xs">
              <Plus className="h-4 w-4" />
              <span>Nueva reservación</span>
            </Link>
          </div>
        </div>

        {/* Controles de periodo, selector de vista y leyenda */}
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3 border-t border-borde pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center rounded-lg border border-borde bg-white p-0.5">
              <button
                type="button"
                onClick={navegarAnterior}
                aria-label="Periodo anterior"
                className="rounded-md p-1.5 text-texto hover:bg-slate-100"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="px-3 text-sm font-bold text-navy capitalize min-w-[165px] text-center">
                {tituloPeriodo}
              </span>
              <button
                type="button"
                onClick={navegarSiguiente}
                aria-label="Periodo siguiente"
                className="rounded-md p-1.5 text-texto hover:bg-slate-100"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={irAHoy}
              className="btn-secundario py-1.5 px-3 text-xs font-semibold"
            >
              Hoy
            </button>

            {/* Conmutador Día / Semana / Mes */}
            <div
              role="group"
              aria-label="Cambiar vista del calendario"
              className="inline-flex rounded-lg border border-borde bg-slate-100 p-0.5 text-xs font-semibold"
            >
              {(
                [
                  { id: 'dia', etiqueta: 'Día' },
                  { id: 'semana', etiqueta: 'Semana' },
                  { id: 'mes', etiqueta: 'Mes' },
                ] as const
              ).map((op) => (
                <button
                  key={op.id}
                  type="button"
                  onClick={() => setVista(op.id)}
                  className={`rounded-md px-3 py-1.5 transition ${
                    vista === op.id
                      ? 'bg-navy text-white shadow-sm'
                      : 'text-texto-suave hover:text-texto'
                  }`}
                >
                  {op.etiqueta}
                </button>
              ))}
            </div>
          </div>

          {/* Leyenda de tipos de evento */}
          <div className="flex flex-wrap items-center gap-3 text-xs">
            {LISTA_TIPOS_EVENTO.map((t) => (
              <span key={t.tipo} className="inline-flex items-center gap-1.5 text-texto-suave font-medium">
                <span className={`h-2.5 w-2.5 rounded-full ${t.clasesPunto}`} />
                {t.etiqueta}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5 rounded border border-dashed border-navy/50 bg-navy-50 px-2 py-0.5 text-[11px] font-semibold text-navy">
              SIPREF (horario fijo)
            </span>
          </div>
        </div>
      </div>

      {/* Cuerpo principal: Calendario (izquierda) + Reservaciones del día (derecha) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        {/* Columna izquierda: Cuadrícula según vista */}
        <div className="xl:col-span-8 tarjeta overflow-hidden">
          {isLoading && (
            <div className="p-6 space-y-3 animate-pulse">
              <div className="h-8 rounded bg-slate-100" />
              <div className="h-96 rounded-xl bg-slate-100" />
            </div>
          )}

          {!isLoading && vista === 'mes' && (
            <div>
              {/* Cabecera Lun - Dom */}
              <div className="grid grid-cols-7 border-b border-borde bg-slate-50 text-center text-xs font-bold uppercase tracking-wider text-texto-suave">
                {DIAS_SEMANA_CORTOS.map((d) => (
                  <div key={d} className="py-2.5">
                    {d}
                  </div>
                ))}
              </div>

              {/* 42 celdas del mes */}
              <div className="grid grid-cols-7 divide-x divide-y divide-borde">
                {cuadriculaMes.celdas.map((celda) => {
                  const evs = eventosPorDia.get(celda.fechaYmd) ?? [];
                  const esSeleccionado = celda.fechaYmd === fechaSeleccionada;
                  const esHoy = celda.fechaYmd === hoyYmd;

                  return (
                    <div
                      key={celda.fechaYmd}
                      role="button"
                      tabIndex={0}
                      onClick={() => setFechaSeleccionada(celda.fechaYmd)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setFechaSeleccionada(celda.fechaYmd);
                        }
                      }}
                      aria-label={`${formatearFechaCompleta(celda.fechaYmd)}, ${evs.length} eventos`}
                      className={`min-h-[108px] p-1.5 sm:p-2 text-left transition cursor-pointer select-none ${
                        !celda.esMesActual ? 'bg-slate-50/70 text-texto-suave/60' : 'bg-white'
                      } ${
                        esSeleccionado
                          ? 'ring-2 ring-inset ring-navy bg-amber-50/30'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span
                          className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                            esHoy
                              ? 'bg-amber text-navy-900'
                              : esSeleccionado
                                ? 'bg-navy text-white'
                                : celda.esMesActual
                                  ? 'text-texto'
                                  : 'text-texto-suave/60'
                          }`}
                        >
                          {celda.diaMes}
                        </span>
                        {evs.length > 0 && (
                          <span className="text-[10px] font-semibold text-texto-suave">
                            {evs.length}
                          </span>
                        )}
                      </div>

                      <div className="space-y-1">
                        {evs.slice(0, 3).map((ev) => {
                          const infoTipo = obtenerInfoTipoEvento(ev.tipoEvento);
                          const cancelado = ev.estado === 'CANCELADA';
                          if (ev.origen === 'SIPREF') {
                            return (
                              <div
                                key={ev.id}
                                className="truncate rounded border border-dashed border-navy/50 bg-navy-50 px-1.5 py-0.5 text-[10px] font-semibold text-navy"
                                title={`[SIPREF] ${ev.nombreEvento} (${ev.espacioNombre})`}
                              >
                                <span className="font-bold mr-1">SIPREF</span>
                                {extraerHoraMexico(ev.inicio)} {ev.nombreEvento}
                              </div>
                            );
                          }
                          return (
                            <div
                              key={ev.id}
                              className={`truncate rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                cancelado
                                  ? 'bg-slate-200 text-slate-500 line-through'
                                  : infoTipo.clasesChip
                              }`}
                              title={`${ev.nombreEvento} (${ev.espacioNombre})`}
                            >
                              {extraerHoraMexico(ev.inicio)} {ev.nombreEvento}
                            </div>
                          );
                        })}
                        {evs.length > 3 && (
                          <p className="text-[10px] font-semibold text-navy pl-1">
                            +{evs.length - 3} más
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {!isLoading && vista === 'semana' && (
            <div className="overflow-x-auto">
              <div className="min-w-[720px]">
                {/* Cabecera de los 7 días de la semana */}
                <div className="grid grid-cols-8 border-b border-borde bg-slate-50">
                  <div className="p-2.5 text-center text-[11px] font-bold uppercase text-texto-suave border-r border-borde">
                    Hora
                  </div>
                  {datosSemana.dias.map((diaYmd, idx) => {
                    const activo = diaYmd === fechaSeleccionada;
                    const numeroDia = Number(diaYmd.slice(8, 10));
                    return (
                      <button
                        key={diaYmd}
                        type="button"
                        onClick={() => setFechaSeleccionada(diaYmd)}
                        className={`p-2 text-center border-r border-borde last:border-r-0 transition ${
                          activo ? 'bg-navy text-white' : 'hover:bg-slate-100'
                        }`}
                      >
                        <span className="block text-[11px] font-semibold uppercase opacity-80">
                          {DIAS_SEMANA_CORTOS[idx]}
                        </span>
                        <span className="text-sm font-bold">{numeroDia}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Cuadrícula horaria semanal */}
                <div className="divide-y divide-borde">
                  {HORAS_AGENDA.map((hora) => {
                    const prefijoHora = String(hora).padStart(2, '0');
                    return (
                      <div key={hora} className="grid grid-cols-8 min-h-[56px]">
                        <div className="border-r border-borde bg-slate-50/60 px-2 py-1.5 text-right text-[11px] font-semibold text-texto-suave">
                          {prefijoHora}:00
                        </div>
                        {datosSemana.dias.map((diaYmd) => {
                          const evsDia = eventosPorDia.get(diaYmd) ?? [];
                          const evsEnHora = evsDia.filter((ev) => {
                            const hIni = Number(extraerHoraMexico(ev.inicio).slice(0, 2));
                            return hIni === hora;
                          });
                          return (
                            <div
                              key={diaYmd}
                              onClick={() => setFechaSeleccionada(diaYmd)}
                              className={`border-r border-borde last:border-r-0 p-1 space-y-1 cursor-pointer ${
                                diaYmd === fechaSeleccionada ? 'bg-amber-50/20' : ''
                              }`}
                            >
                              {evsEnHora.map((ev) => {
                                const infoTipo = obtenerInfoTipoEvento(ev.tipoEvento);
                                return (
                                  <div
                                    key={ev.id}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setFechaSeleccionada(diaYmd);
                                      if (ev.origen === 'RESERVAS') setExpedienteId(ev.id);
                                    }}
                                    className={`rounded p-1 text-[10px] leading-tight ${
                                      ev.origen === 'SIPREF'
                                        ? 'border border-dashed border-navy/60 bg-navy-50 text-navy font-semibold'
                                        : infoTipo.clasesChip
                                    }`}
                                  >
                                    <p className="font-bold truncate">
                                      {ev.origen === 'SIPREF' ? '[SIPREF] ' : ''}
                                      {ev.nombreEvento}
                                    </p>
                                    <p className="opacity-90 truncate">
                                      {ev.espacioNombre} · {formatearRangoHorario(ev.inicio, ev.fin)}
                                    </p>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {!isLoading && vista === 'dia' && (
            <div>
              <div className="border-b border-borde bg-slate-50 px-4 py-3 flex items-center justify-between">
                <span className="text-sm font-bold text-navy capitalize">
                  Agenda por hora · {formatearFechaCompleta(fechaSeleccionada)}
                </span>
                <span className="text-xs text-texto-suave">
                  {eventosDiaSeleccionado.length} evento(s) programados
                </span>
              </div>
              <div className="divide-y divide-borde">
                {HORAS_AGENDA.map((hora) => {
                  const prefijoHora = String(hora).padStart(2, '0');
                  const evsEnHora = eventosDiaSeleccionado.filter((ev) => {
                    const hIni = Number(extraerHoraMexico(ev.inicio).slice(0, 2));
                    return hIni === hora;
                  });
                  return (
                    <div key={hora} className="flex min-h-[60px]">
                      <div className="w-20 shrink-0 border-r border-borde bg-slate-50/70 px-3 py-2 text-right text-xs font-semibold text-texto-suave">
                        {prefijoHora}:00
                      </div>
                      <div className="flex-1 p-2 space-y-2">
                        {evsEnHora.map((ev) => {
                          const infoTipo = obtenerInfoTipoEvento(ev.tipoEvento);
                          return (
                            <div
                              key={ev.id}
                              onClick={() => {
                                if (ev.origen === 'RESERVAS') setExpedienteId(ev.id);
                              }}
                              className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border border-borde border-l-4 p-2.5 text-xs shadow-sm cursor-pointer ${
                                ev.origen === 'SIPREF'
                                  ? 'border-l-navy bg-navy-50/60'
                                  : `${infoTipo.clasesBordeIzq} bg-white hover:bg-slate-50`
                              }`}
                            >
                              <div>
                                <div className="flex items-center gap-2">
                                  {ev.origen === 'SIPREF' ? (
                                    <span className="rounded bg-navy px-1.5 py-0.5 text-[10px] font-bold text-amber">
                                      SIPREF
                                    </span>
                                  ) : (
                                    <span
                                      className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${infoTipo.clasesBadge}`}
                                    >
                                      {infoTipo.etiqueta}
                                    </span>
                                  )}
                                  <span className="font-bold text-texto">{ev.nombreEvento}</span>
                                </div>
                                <p className="mt-1 text-texto-suave">
                                  {ev.espacioNombre} · {formatearRangoHorario(ev.inicio, ev.fin)} ·{' '}
                                  {ev.responsable}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Columna derecha: Tarjeta navy "Reservaciones del día" */}
        <aside className="xl:col-span-4 rounded-card bg-navy p-5 text-white shadow-card space-y-4">
          <div className="border-b border-navy-600 pb-3.5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-bold tracking-tight text-white">
                Reservaciones del día
              </h2>
              <span className="rounded-full bg-amber/20 border border-amber/40 px-2.5 py-0.5 text-xs font-bold text-amber-200">
                {eventosDiaSeleccionado.length}
              </span>
            </div>
            <p className="mt-1 text-xs font-medium text-amber-300 capitalize">
              {formatearFechaCompleta(fechaSeleccionada)}
            </p>
          </div>

          {eventosDiaSeleccionado.length === 0 ? (
            <div className="rounded-xl border border-navy-600 bg-navy-800/60 p-6 text-center space-y-3">
              <CalendarIcon className="h-8 w-8 text-amber mx-auto opacity-80" />
              <div>
                <p className="text-sm font-semibold text-white">
                  Sin reservaciones para este día
                </p>
                <p className="mt-1 text-xs text-navy-200">
                  Las aulas seleccionadas están disponibles para agendar actividades.
                </p>
              </div>
              <Link
                to={`/reservaciones/nueva?fecha=${fechaSeleccionada}`}
                className="btn-primario w-full py-2 text-xs"
              >
                <Plus className="h-4 w-4" />
                <span>Agendar en esta fecha</span>
              </Link>
            </div>
          ) : (
            <div className="space-y-3 max-h-[680px] overflow-y-auto pr-1">
              {eventosDiaSeleccionado.map((ev) => {
                const infoTipo = obtenerInfoTipoEvento(ev.tipoEvento);
                const infoEstado = obtenerInfoEstadoReservacion(ev.estado);

                return (
                  <article
                    key={ev.id}
                    className="rounded-xl bg-white p-4 text-texto shadow-sm border border-borde space-y-3"
                  >
                    {/* Badges y rango horario */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {ev.origen === 'SIPREF' ? (
                          <span className="inline-flex items-center gap-1 rounded-md border border-dashed border-navy bg-navy-50 px-2 py-0.5 text-[11px] font-bold text-navy">
                            <Lock className="h-3 w-3" />
                            SIPREF
                          </span>
                        ) : (
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${infoTipo.clasesBadge}`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${infoTipo.clasesPunto}`} />
                            {infoTipo.etiqueta}
                          </span>
                        )}

                        {ev.estado === 'CANCELADA' && (
                          <span
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${infoEstado.clasesBadge}`}
                          >
                            Cancelada
                          </span>
                        )}
                      </div>

                      <span className="inline-flex items-center gap-1 text-xs font-bold text-navy">
                        <Clock className="h-3.5 w-3.5 text-amber-600" />
                        {formatearRangoHorario(ev.inicio, ev.fin)}
                      </span>
                    </div>

                    {/* Nombre del evento */}
                    <h3
                      className={`text-sm font-bold leading-snug ${
                        ev.estado === 'CANCELADA' ? 'line-through text-texto-suave' : 'text-navy'
                      }`}
                    >
                      {ev.nombreEvento}
                    </h3>

                    {/* Datos de aula, responsable y recursos */}
                    <div className="space-y-1.5 text-xs text-texto-suave border-t border-slate-100 pt-2.5">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-3.5 w-3.5 text-navy shrink-0" />
                        <span className="font-semibold text-texto">{ev.espacioNombre}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <User className="h-3.5 w-3.5 text-navy shrink-0" />
                        <span className="truncate">{ev.responsable}</span>
                      </div>
                      {ev.resumenRecursos && (
                        <div className="flex items-start gap-2">
                          <Package className="h-3.5 w-3.5 text-navy shrink-0 mt-0.5" />
                          <span className="line-clamp-2">{ev.resumenRecursos}</span>
                        </div>
                      )}
                    </div>

                    {/* Acciones */}
                    <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
                      {ev.origen === 'RESERVAS' ? (
                        <>
                          <button
                            type="button"
                            onClick={() => setExpedienteId(ev.id)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-navy-50 px-3 py-1.5 text-xs font-semibold text-navy transition hover:bg-navy-100"
                          >
                            <FileText className="h-3.5 w-3.5" />
                            <span>Detalle / Historial</span>
                          </button>

                          {ev.editable && ev.estado === 'PENDIENTE' && (
                            <button
                              type="button"
                              onClick={() => setEventoACancelar(ev)}
                              aria-label={`Cancelar reservación ${ev.nombreEvento}`}
                              title="Cancelar reservación"
                              className="rounded-lg border border-rose-200 bg-rose-50 p-1.5 text-rose-600 transition hover:bg-rose-100"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </>
                      ) : (
                        <span className="text-[11px] italic text-texto-suave">
                          Horario oficial SIPREF · Solo lectura
                        </span>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </aside>
      </div>

      {/* Panel lateral de expediente oficial */}
      <PanelExpediente
        reservacionId={expedienteId}
        alCerrar={() => setExpedienteId(null)}
      />

      {/* Diálogo para cancelar reservación desde la agenda */}
      <ModalCancelar
        abierto={!!eventoACancelar}
        alCerrar={() => setEventoACancelar(null)}
        reservacion={
          eventoACancelar
            ? {
                id: eventoACancelar.id,
                nombreEvento: eventoACancelar.nombreEvento,
                espacioNombre: eventoACancelar.espacioNombre,
              }
            : null
        }
      />
    </div>
  );
}

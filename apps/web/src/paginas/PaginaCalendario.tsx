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
    <div className="space-y-6">
      {/* Encabezado superior */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm p-5 sm:p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center rounded-full bg-[#1c355e] px-3.5 py-1 text-[11px] font-extrabold tracking-wider text-[#fdbb11] uppercase shadow-sm">
              CICLO {config?.ciclo ?? '2026-B'}
            </span>
            <h1 className="text-xl sm:text-2xl font-extrabold text-[#1c355e] tracking-tight">
              Calendario de Aulas y Espacios
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Filtro por espacio */}
            <div className="relative min-w-[230px] flex-1 sm:flex-initial">
              <Building2 className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select
                aria-label="Filtrar por aula o espacio"
                value={espacioFiltro}
                onChange={(e) => setEspacioFiltro(e.target.value)}
                className="w-full pl-9 pr-8 py-2.5 bg-slate-50/90 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:bg-white focus:border-[#1c355e] focus:ring-4 focus:ring-[#1c355e]/10 outline-none transition-all cursor-pointer"
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

            <Link
              to={`/reservaciones/nueva?fecha=${fechaSeleccionada}`}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#fdbb11] to-[#e8a906] hover:brightness-105 px-4 py-2.5 text-xs font-extrabold text-[#0e2045] shadow-md shadow-[#fdbb11]/20 transition-all"
            >
              <Plus className="h-4 w-4 stroke-[2.5]" />
              <span>Nueva reservación</span>
            </Link>
          </div>
        </div>

        {/* Controles de periodo, selector de vista y leyenda */}
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 border-t border-slate-100 pt-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="inline-flex items-center rounded-xl border border-slate-200 bg-slate-50/70 p-1">
              <button
                type="button"
                onClick={navegarAnterior}
                aria-label="Periodo anterior"
                className="rounded-lg p-1.5 text-slate-600 hover:bg-white hover:text-[#1c355e] hover:shadow-xs transition-all cursor-pointer"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="px-3.5 text-sm font-extrabold text-[#1c355e] capitalize min-w-[170px] text-center">
                {tituloPeriodo}
              </span>
              <button
                type="button"
                onClick={navegarSiguiente}
                aria-label="Periodo siguiente"
                className="rounded-lg p-1.5 text-slate-600 hover:bg-white hover:text-[#1c355e] hover:shadow-xs transition-all cursor-pointer"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={irAHoy}
              className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-3.5 py-2 text-xs font-bold text-[#1c355e] transition-colors cursor-pointer"
            >
              Hoy
            </button>

            {/* Conmutador Día / Semana / Mes */}
            <div
              role="group"
              aria-label="Cambiar vista del calendario"
              className="inline-flex rounded-xl border border-slate-200 bg-slate-100/90 p-1 text-xs font-bold"
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
                  className={`rounded-lg px-3.5 py-1.5 transition-all cursor-pointer ${
                    vista === op.id
                      ? 'bg-[#1c355e] text-white shadow-sm'
                      : 'text-slate-500 hover:text-[#1c355e]'
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
              <span
                key={t.tipo}
                className="inline-flex items-center gap-1.5 text-slate-600 font-semibold"
              >
                <span className={`h-2.5 w-2.5 rounded-full ${t.clasesPunto}`} />
                {t.etiqueta}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-[#1c355e]/40 bg-[#1c355e]/5 px-2.5 py-1 text-[11px] font-bold text-[#1c355e]">
              <Lock className="w-3 h-3" />
              SIPREF (horario fijo)
            </span>
          </div>
        </div>
      </div>

      {/* Cuerpo principal: Calendario (izquierda) + Reservaciones del día (derecha) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Columna izquierda: Cuadrícula según vista */}
        <div className="xl:col-span-8 bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
          {isLoading && (
            <div className="p-6 space-y-3 animate-pulse">
              <div className="h-9 rounded-xl bg-slate-100" />
              <div className="h-[440px] rounded-2xl bg-slate-100" />
            </div>
          )}

          {!isLoading && vista === 'mes' && (
            <div>
              {/* Cabecera Lun - Dom */}
              <div className="grid grid-cols-7 border-b border-slate-200/80 bg-slate-50/90 text-center text-[11px] font-extrabold uppercase tracking-widest text-slate-500">
                {DIAS_SEMANA_CORTOS.map((d) => (
                  <div key={d} className="py-3">
                    {d}
                  </div>
                ))}
              </div>

              {/* 42 celdas del mes */}
              <div className="grid grid-cols-7 divide-x divide-y divide-slate-200/70">
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
                      className={`min-h-[112px] p-2 text-left transition-colors cursor-pointer select-none ${
                        !celda.esMesActual ? 'bg-slate-50/60 text-slate-400' : 'bg-white'
                      } ${
                        esSeleccionado
                          ? 'ring-2 ring-inset ring-[#1c355e] bg-[#1c355e]/[0.03]'
                          : 'hover:bg-slate-50/90'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span
                          className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-extrabold transition-transform ${
                            esHoy
                              ? 'bg-[#fdbb11] text-[#0e2045] shadow-sm'
                              : esSeleccionado
                                ? 'bg-[#1c355e] text-white'
                                : celda.esMesActual
                                  ? 'text-slate-700'
                                  : 'text-slate-400'
                          }`}
                        >
                          {celda.diaMes}
                        </span>
                        {evs.length > 0 && (
                          <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-slate-100 text-[10px] font-bold text-slate-600">
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
                                className="truncate rounded-lg border border-dashed border-[#1c355e]/40 bg-[#1c355e]/5 px-1.5 py-0.5 text-[10px] font-semibold text-[#1c355e]"
                                title={`[SIPREF] ${ev.nombreEvento} (${ev.espacioNombre})`}
                              >
                                <span className="font-extrabold mr-1">SIPREF</span>
                                {extraerHoraMexico(ev.inicio)} {ev.nombreEvento}
                              </div>
                            );
                          }
                          return (
                            <div
                              key={ev.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                setFechaSeleccionada(celda.fechaYmd);
                                setExpedienteId(ev.id);
                              }}
                              className={`truncate rounded-lg px-1.5 py-0.5 text-[10px] font-semibold transition-opacity hover:opacity-90 ${
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
                          <p className="text-[10px] font-bold text-[#1c355e] pl-1">
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
                <div className="grid grid-cols-8 border-b border-slate-200/80 bg-slate-50/90">
                  <div className="p-3 text-center text-[11px] font-extrabold uppercase tracking-wider text-slate-500 border-r border-slate-200/70">
                    Hora
                  </div>
                  {datosSemana.dias.map((diaYmd, idx) => {
                    const activo = diaYmd === fechaSeleccionada;
                    const esHoyDia = diaYmd === hoyYmd;
                    const numeroDia = Number(diaYmd.slice(8, 10));
                    return (
                      <button
                        key={diaYmd}
                        type="button"
                        onClick={() => setFechaSeleccionada(diaYmd)}
                        className={`p-2.5 text-center border-r border-slate-200/70 last:border-r-0 transition-colors cursor-pointer ${
                          activo
                            ? 'bg-[#1c355e] text-white'
                            : 'hover:bg-slate-100/80 text-slate-700'
                        }`}
                      >
                        <span className="block text-[10px] font-bold uppercase opacity-75">
                          {DIAS_SEMANA_CORTOS[idx]}
                        </span>
                        <span
                          className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-sm font-extrabold mt-0.5 ${
                            esHoyDia && !activo ? 'bg-[#fdbb11] text-[#0e2045]' : ''
                          }`}
                        >
                          {numeroDia}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Cuadrícula horaria semanal */}
                <div className="divide-y divide-slate-200/70">
                  {HORAS_AGENDA.map((hora) => {
                    const prefijoHora = String(hora).padStart(2, '0');
                    return (
                      <div key={hora} className="grid grid-cols-8 min-h-[58px]">
                        <div className="border-r border-slate-200/70 bg-slate-50/60 px-2.5 py-2 text-right text-[11px] font-bold text-slate-500">
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
                              className={`border-r border-slate-200/70 last:border-r-0 p-1 space-y-1 cursor-pointer transition-colors ${
                                diaYmd === fechaSeleccionada
                                  ? 'bg-[#1c355e]/[0.03]'
                                  : 'hover:bg-slate-50/70'
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
                                    className={`rounded-lg p-1.5 text-[10px] leading-tight shadow-xs ${
                                      ev.origen === 'SIPREF'
                                        ? 'border border-dashed border-[#1c355e]/50 bg-[#1c355e]/5 text-[#1c355e] font-semibold'
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
              <div className="border-b border-slate-200/80 bg-slate-50/90 px-5 py-3.5 flex items-center justify-between">
                <span className="text-sm font-extrabold text-[#1c355e] capitalize">
                  Agenda por hora · {formatearFechaCompleta(fechaSeleccionada)}
                </span>
                <span className="inline-flex items-center rounded-full bg-[#1c355e]/10 px-2.5 py-0.5 text-xs font-bold text-[#1c355e]">
                  {eventosDiaSeleccionado.length} evento(s)
                </span>
              </div>
              <div className="divide-y divide-slate-200/70">
                {HORAS_AGENDA.map((hora) => {
                  const prefijoHora = String(hora).padStart(2, '0');
                  const evsEnHora = eventosDiaSeleccionado.filter((ev) => {
                    const hIni = Number(extraerHoraMexico(ev.inicio).slice(0, 2));
                    return hIni === hora;
                  });
                  return (
                    <div key={hora} className="flex min-h-[62px]">
                      <div className="w-20 shrink-0 border-r border-slate-200/70 bg-slate-50/60 px-3 py-2.5 text-right text-xs font-bold text-slate-500">
                        {prefijoHora}:00
                      </div>
                      <div className="flex-1 p-2.5 space-y-2">
                        {evsEnHora.map((ev) => {
                          const infoTipo = obtenerInfoTipoEvento(ev.tipoEvento);
                          return (
                            <div
                              key={ev.id}
                              onClick={() => {
                                if (ev.origen === 'RESERVAS') setExpedienteId(ev.id);
                              }}
                              className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200/80 border-l-4 p-3 text-xs shadow-xs cursor-pointer transition-colors ${
                                ev.origen === 'SIPREF'
                                  ? 'border-l-[#1c355e] bg-[#1c355e]/[0.03]'
                                  : `${infoTipo.clasesBordeIzq} bg-white hover:bg-slate-50`
                              }`}
                            >
                              <div>
                                <div className="flex items-center gap-2">
                                  {ev.origen === 'SIPREF' ? (
                                    <span className="rounded-md bg-[#1c355e] px-2 py-0.5 text-[10px] font-bold text-[#fdbb11]">
                                      SIPREF
                                    </span>
                                  ) : (
                                    <span
                                      className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${infoTipo.clasesBadge}`}
                                    >
                                      {infoTipo.etiqueta}
                                    </span>
                                  )}
                                  <span className="font-bold text-slate-800">{ev.nombreEvento}</span>
                                </div>
                                <p className="mt-1 text-slate-500 font-medium">
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
        <aside className="xl:col-span-4 rounded-3xl bg-gradient-to-b from-[#1c355e] to-[#132645] p-5 sm:p-6 text-white shadow-xl shadow-[#1c355e]/15 space-y-4 xl:sticky xl:top-24">
          <div className="border-b border-white/10 pb-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <h2 className="text-base font-extrabold tracking-tight text-white">
                  Reservaciones del día
                </h2>
                <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-2 rounded-full bg-[#fdbb11] text-xs font-extrabold text-[#0e2045] shadow-sm">
                  {eventosDiaSeleccionado.length}
                </span>
              </div>

              {eventosDiaSeleccionado.length > 0 && (
                <Link
                  to={`/reservaciones/nueva?fecha=${fechaSeleccionada}`}
                  title="Agendar otro evento en esta fecha"
                  className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-white/10 hover:bg-[#fdbb11] text-white hover:text-[#0e2045] transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </Link>
              )}
            </div>
            <p className="mt-1 text-xs font-semibold text-[#fdbb11] capitalize">
              {formatearFechaCompleta(fechaSeleccionada)}
            </p>
          </div>

          {eventosDiaSeleccionado.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-6 text-center space-y-3.5">
              <div className="w-12 h-12 rounded-2xl bg-[#fdbb11]/15 border border-[#fdbb11]/30 flex items-center justify-center mx-auto">
                <CalendarIcon className="h-6 w-6 text-[#fdbb11]" />
              </div>
              <div>
                <p className="text-sm font-bold text-white">
                  Sin reservaciones para este día
                </p>
                <p className="mt-1 text-xs text-slate-300 leading-relaxed">
                  Las aulas seleccionadas están disponibles para agendar actividades.
                </p>
              </div>
              <Link
                to={`/reservaciones/nueva?fecha=${fechaSeleccionada}`}
                className="inline-flex items-center justify-center gap-2 w-full rounded-xl bg-gradient-to-r from-[#fdbb11] to-[#e8a906] hover:brightness-105 px-4 py-2.5 text-xs font-extrabold text-[#0e2045] shadow-md transition-all"
              >
                <Plus className="h-4 w-4 stroke-[2.5]" />
                <span>Agendar en esta fecha</span>
              </Link>
            </div>
          ) : (
            <div className="space-y-3 max-h-[660px] overflow-y-auto pr-1">
              {eventosDiaSeleccionado.map((ev) => {
                const infoTipo = obtenerInfoTipoEvento(ev.tipoEvento);
                const infoEstado = obtenerInfoEstadoReservacion(ev.estado);

                return (
                  <article
                    key={ev.id}
                    className="rounded-2xl bg-white p-4 text-slate-800 shadow-md border border-white/10 space-y-3 hover:shadow-lg transition-shadow"
                  >
                    {/* Badges y rango horario */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {ev.origen === 'SIPREF' ? (
                          <span className="inline-flex items-center gap-1 rounded-lg border border-dashed border-[#1c355e]/50 bg-[#1c355e]/5 px-2.5 py-0.5 text-[11px] font-bold text-[#1c355e]">
                            <Lock className="h-3 w-3" />
                            SIPREF
                          </span>
                        ) : (
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${infoTipo.clasesBadge}`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${infoTipo.clasesPunto}`} />
                            {infoTipo.etiqueta}
                          </span>
                        )}

                        {ev.estado === 'CANCELADA' && (
                          <span
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${infoEstado.clasesBadge}`}
                          >
                            Cancelada
                          </span>
                        )}
                      </div>

                      <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-[#1c355e]">
                        <Clock className="h-3 w-3 text-[#d99a00]" />
                        {formatearRangoHorario(ev.inicio, ev.fin)}
                      </span>
                    </div>

                    {/* Nombre del evento */}
                    <h3
                      className={`text-[15px] font-extrabold leading-snug ${
                        ev.estado === 'CANCELADA' ? 'line-through text-slate-400' : 'text-[#1c355e]'
                      }`}
                    >
                      {ev.nombreEvento}
                    </h3>

                    {/* Datos de aula, responsable y recursos */}
                    <div className="space-y-1.5 text-xs text-slate-600 border-t border-slate-100 pt-2.5">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-3.5 w-3.5 text-[#1c355e] shrink-0" />
                        <span className="font-bold text-slate-800">{ev.espacioNombre}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <User className="h-3.5 w-3.5 text-[#1c355e] shrink-0" />
                        <span className="truncate font-medium">{ev.responsable}</span>
                      </div>
                      {ev.resumenRecursos && (
                        <div className="flex items-start gap-2">
                          <Package className="h-3.5 w-3.5 text-[#1c355e] shrink-0 mt-0.5" />
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
                            className="inline-flex items-center gap-1.5 rounded-xl bg-[#1c355e]/5 hover:bg-[#1c355e]/10 px-3 py-1.5 text-xs font-bold text-[#1c355e] transition-colors cursor-pointer"
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
                              className="rounded-xl border border-rose-200 bg-rose-50 p-1.5 text-rose-600 transition-colors hover:bg-rose-100 cursor-pointer"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </>
                      ) : (
                        <span className="text-[11px] italic text-slate-400">
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

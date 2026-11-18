import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  Building2,
  Calendar,
  CalendarClock,
  Clock,
  FileText,
  History,
  Mail,
  Package,
  Printer,
  Trash2,
  User,
  Users,
  X,
} from 'lucide-react';
import { useHistorial, useReservacion, useYo } from '../api/consultas';
import { usarMocks } from '../api/cliente';
import { abrirReimpresionMock } from '../mocks/servidorMock';
import {
  obtenerInfoEstadoReservacion,
  obtenerInfoTipoEvento,
} from '../utilidades/catalogos';
import {
  calcularDuracion,
  extraerHoraMexico,
  formatearFechaCompleta,
  formatearFechaHora,
  formatearRangoHorario,
} from '../utilidades/fechas';
import { formatearAnticipacionRecordatorio } from '../utilidades/recordatorios';
import { ModalCancelar } from './ModalCancelar';
import { ModalReagendar } from './ModalReagendar';

interface PropiedadesPanelExpediente {
  reservacionId: string | null;
  alCerrar: () => void;
}

export function PanelExpediente({ reservacionId, alCerrar }: PropiedadesPanelExpediente) {
  const { data: yo } = useYo();
  const { data: detalle, isLoading, isError } = useReservacion(reservacionId);
  const { data: historial = [], isLoading: cargandoHistorial } = useHistorial(reservacionId);
  const esAdminEspacios = yo?.rol === 'ADMIN_ESPACIOS';

  const [mostrarReagendar, setMostrarReagendar] = useState(false);
  const [mostrarCancelar, setMostrarCancelar] = useState(false);

  useEffect(() => {
    if (!reservacionId) return;
    const manejarTecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !mostrarReagendar && !mostrarCancelar) {
        alCerrar();
      }
    };
    window.addEventListener('keydown', manejarTecla);
    return () => window.removeEventListener('keydown', manejarTecla);
  }, [reservacionId, mostrarReagendar, mostrarCancelar, alCerrar]);

  if (!reservacionId) return null;

  const manejarReimprimir = () => {
    if (!detalle) return;
    if (usarMocks()) {
      abrirReimpresionMock(detalle.id);
    } else {
      window.open(
        `/api/reservaciones/${encodeURIComponent(detalle.id)}/reimprimir`,
        '_blank',
        'noopener,noreferrer',
      );
    }
  };

  const infoTipo = detalle ? obtenerInfoTipoEvento(detalle.tipoEvento) : null;
  const infoEstado = detalle ? obtenerInfoEstadoReservacion(detalle.estado) : null;
  const duracion = detalle
    ? calcularDuracion(extraerHoraMexico(detalle.inicio), extraerHoraMexico(detalle.fin))
    : null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 flex justify-end bg-navy-900/50 backdrop-blur-[1px]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-expediente"
        onClick={(e) => {
          if (e.target === e.currentTarget) alCerrar();
        }}
      >
        <div className="relative flex h-full w-full max-w-xl flex-col bg-white shadow-flotante border-l border-borde">
          {/* Encabezado navy */}
          <div className="bg-navy px-6 py-5 text-white shrink-0">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-amber/20 border border-amber/40 px-2.5 py-0.5 text-xs font-bold tracking-wide text-amber-200">
                    <FileText className="h-3.5 w-3.5" />
                    Expediente oficial
                  </span>
                  {detalle && (
                    <span className="rounded-md bg-navy-600 px-2.5 py-0.5 font-mono text-xs font-semibold text-navy-100">
                      {detalle.codigo}
                    </span>
                  )}
                </div>
                <h2 id="titulo-expediente" className="text-lg font-bold leading-snug">
                  {isLoading ? 'Cargando expediente...' : (detalle?.nombreEvento ?? 'Reservación')}
                </h2>
              </div>
              <button
                type="button"
                onClick={alCerrar}
                aria-label="Cerrar expediente"
                className="rounded-lg p-1.5 text-navy-100 hover:bg-navy-600 hover:text-white transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {detalle && infoTipo && infoEstado && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${infoTipo.clasesBadge}`}
                >
                  <span className={`h-2 w-2 rounded-full ${infoTipo.clasesPunto}`} />
                  {infoTipo.etiqueta}
                </span>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${infoEstado.clasesBadge}`}
                >
                  <span className={`h-2 w-2 rounded-full ${infoEstado.clasesPunto}`} />
                  {infoEstado.etiqueta}
                </span>
                <span className="text-xs text-navy-200 ml-auto">Versión {detalle.version}</span>
              </div>
            )}
          </div>

          {/* Cuerpo desplazable */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {isLoading && (
              <div className="space-y-4 animate-pulse">
                <div className="h-24 rounded-xl bg-slate-100" />
                <div className="h-36 rounded-xl bg-slate-100" />
                <div className="h-28 rounded-xl bg-slate-100" />
              </div>
            )}

            {isError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
                No fue posible cargar el expediente oficial de esta reservación.
              </div>
            )}

            {detalle && (
              <>
                {/* Alerta de cancelación */}
                {detalle.cancelacion && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-900 space-y-1">
                    <div className="flex items-center gap-2 font-bold text-rose-800 text-sm">
                      <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
                      <span>Reservación cancelada</span>
                    </div>
                    <p>
                      <strong>Motivo:</strong> {detalle.cancelacion.motivo}
                    </p>
                    <p className="text-rose-700">
                      Cancelada por <strong>{detalle.cancelacion.por}</strong> el{' '}
                      {formatearFechaHora(detalle.cancelacion.en)}.
                    </p>
                  </div>
                )}

                {/* Datos principales */}
                <section className="rounded-xl border border-borde bg-fondo/60 p-4 space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-texto-suave">
                    Información general y ubicación
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-sm">
                    <div className="flex items-start gap-2.5">
                      <Building2 className="h-4 w-4 text-navy shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs text-texto-suave">Aula / Espacio</p>
                        <p className="font-semibold text-texto">
                          {detalle.espacioNombre}{' '}
                          <span className="text-xs font-normal text-texto-suave">
                            ({detalle.espacioId})
                          </span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-2.5">
                      <Calendar className="h-4 w-4 text-navy shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs text-texto-suave">Fecha programada</p>
                        <p className="font-semibold text-texto capitalize">
                          {formatearFechaCompleta(detalle.inicio)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-2.5">
                      <Clock className="h-4 w-4 text-navy shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs text-texto-suave">Horario y duración</p>
                        <p className="font-semibold text-texto">
                          {formatearRangoHorario(detalle.inicio, detalle.fin)}
                          {duracion?.valida && (
                            <span className="ml-1.5 text-xs font-normal text-texto-suave">
                              ({duracion.texto})
                            </span>
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-2.5">
                      <Users className="h-4 w-4 text-navy shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs text-texto-suave">Asistentes estimados</p>
                        <p className="font-semibold text-texto">
                          {detalle.asistentesEstimados !== null
                            ? `${detalle.asistentesEstimados} personas`
                            : 'No especificado'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-2.5">
                      <User className="h-4 w-4 text-navy shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs text-texto-suave">Responsable</p>
                        <p className="font-semibold text-texto">{detalle.responsable}</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-2.5">
                      <Mail className="h-4 w-4 text-navy shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-xs text-texto-suave">Correo institucional</p>
                        <p className="font-semibold text-texto truncate">
                          {detalle.correoResponsable}
                        </p>
                      </div>
                    </div>
                  </div>
                </section>

                {/* Descripción y observaciones */}
                <section className="space-y-3">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-texto-suave mb-1">
                      Descripción académica / operativa
                    </h4>
                    <p className="rounded-lg border border-borde bg-white p-3 text-sm text-texto">
                      {detalle.descripcion || 'Sin descripción registrada.'}
                    </p>
                  </div>
                  {detalle.observaciones && (
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-texto-suave mb-1">
                        Observaciones especiales
                      </h4>
                      <p className="rounded-lg border border-borde bg-amber-50/40 p-3 text-sm text-texto">
                        {detalle.observaciones}
                      </p>
                    </div>
                  )}
                </section>

                {/* Recursos asignados */}
                <section className="space-y-2.5">
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-navy" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-texto-suave">
                      Recursos y equipamiento solicitado ({detalle.recursos.length})
                    </h3>
                  </div>
                  {detalle.recursos.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-borde p-3 text-xs text-texto-suave">
                      No se solicitaron recursos adicionales para esta reservación.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {detalle.recursos.map((rec) => (
                        <div
                          key={rec.recursoId}
                          className="flex items-center justify-between rounded-lg border border-borde bg-white px-3 py-2 text-xs"
                        >
                          <span className="font-medium text-texto">{rec.nombre}</span>
                          <span className="rounded-md bg-navy-50 px-2 py-0.5 font-semibold text-navy">
                            {rec.cantidad} {rec.unidad}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {(detalle.acomodoMobiliario || (detalle.sillasMesaPanel ?? 0) > 0) && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      {detalle.acomodoMobiliario && (
                        <div className="rounded-lg border border-borde bg-slate-50/80 px-3 py-2 text-xs">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-texto-suave block">
                            Acomodo de mesas y sillas
                          </span>
                          <span className="font-semibold text-texto">
                            {detalle.acomodoMobiliario}
                          </span>
                        </div>
                      )}
                      {(detalle.sillasMesaPanel ?? 0) > 0 && (
                        <div className="rounded-lg border border-borde bg-slate-50/80 px-3 py-2 text-xs">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-texto-suave block">
                            Sillas para mesa panel
                          </span>
                          <span className="font-semibold text-texto">
                            {detalle.sillasMesaPanel} sillas
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </section>

                {/* Recordatorios */}
                <section className="space-y-2.5">
                  <div className="flex items-center gap-2">
                    <Bell className="h-4 w-4 text-navy" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-texto-suave">
                      Recordatorios programados ({detalle.recordatorios.length})
                    </h3>
                  </div>
                  {detalle.recordatorios.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-borde p-3 text-xs text-texto-suave">
                      Sin recordatorios configurados.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {detalle.recordatorios.map((rec) => (
                        <div
                          key={rec.id}
                          className="flex items-center justify-between rounded-lg border border-borde bg-white px-3 py-2 text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <span className="rounded bg-navy-50 px-2 py-0.5 font-bold text-navy">
                              {rec.canal === 'CORREO' ? 'Correo' : 'SIPREF'}
                            </span>
                            <span className="text-texto">
                              {formatearAnticipacionRecordatorio(rec.anticipacion, rec.unidad)}
                            </span>
                          </div>
                          <span className="text-texto-suave">
                            {rec.enviadoEn ? 'Enviado' : 'Programado'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                {/* Línea de tiempo de auditoría */}
                <section className="space-y-3">
                  <div className="flex items-center gap-2">
                    <History className="h-4 w-4 text-navy" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-texto-suave">
                      Bitácora de auditoría del expediente
                    </h3>
                  </div>
                  {cargandoHistorial ? (
                    <p className="text-xs text-texto-suave">Cargando bitácora...</p>
                  ) : historial.length === 0 ? (
                    <p className="text-xs text-texto-suave">
                      Aún no hay movimientos registrados en la bitácora.
                    </p>
                  ) : (
                    <ol className="relative border-l-2 border-navy-100 ml-2.5 space-y-4 pl-4">
                      {historial.map((item, idx) => (
                        <li key={idx} className="relative text-xs">
                          <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-navy ring-4 ring-white" />
                          <div className="flex flex-wrap items-center justify-between gap-1">
                            <span className="font-semibold text-texto">{item.actorNombre}</span>
                            <span className="text-[11px] text-texto-suave">
                              {formatearFechaHora(item.ocurridoEn)}
                            </span>
                          </div>
                          <p className="mt-0.5 text-texto-suave">{item.descripcion}</p>
                        </li>
                      ))}
                    </ol>
                  )}
                </section>
              </>
            )}
          </div>

          {/* Aviso de inmutabilidad para solicitantes */}
          {detalle && !esAdminEspacios && detalle.estado === 'PENDIENTE' && (
            <div className="border-t border-amber-200 bg-amber-50/80 px-6 py-2.5 text-xs font-medium text-amber-900">
              Solicitud registrada. Una vez enviada, la reservación y sus materiales ya no pueden modificarse; para ajustes contacte a Prefectura.
            </div>
          )}

          {/* Pie de acciones */}
          {detalle && (
            <div className="border-t border-borde bg-slate-50 px-6 py-4 flex flex-wrap items-center justify-between gap-2 shrink-0">
              <button
                type="button"
                onClick={manejarReimprimir}
                className="btn-secundario"
              >
                <Printer className="h-4 w-4 text-navy" />
                <span>Reimprimir</span>
              </button>

              {detalle.estado === 'PENDIENTE' && (
                <div className="flex flex-wrap items-center gap-2">
                  {esAdminEspacios && (
                    <button
                      type="button"
                      onClick={() => setMostrarReagendar(true)}
                      className="btn-navy"
                    >
                      <CalendarClock className="h-4 w-4" />
                      <span>Reagendar</span>
                    </button>
                  )}
                  {(esAdminEspacios || detalle.creadoPor.sub === yo?.sub) && (
                    <button
                      type="button"
                      onClick={() => setMostrarCancelar(true)}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
                    >
                      <Trash2 className="h-4 w-4" />
                      <span>Cancelar reservación</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <ModalReagendar
        abierto={mostrarReagendar}
        alCerrar={() => setMostrarReagendar(false)}
        reservacion={detalle ?? null}
      />

      <ModalCancelar
        abierto={mostrarCancelar}
        alCerrar={() => setMostrarCancelar(false)}
        reservacion={
          detalle
            ? {
                id: detalle.id,
                nombreEvento: detalle.nombreEvento,
                espacioNombre: detalle.espacioNombre,
                codigo: detalle.codigo,
              }
            : null
        }
      />
    </>
  );
}

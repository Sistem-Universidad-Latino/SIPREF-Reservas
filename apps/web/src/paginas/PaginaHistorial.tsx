import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  FileText,
  FilterX,
  Plus,
  Search,
} from 'lucide-react';
import {
  queryReservaciones,
  useEspacios,
  useReservaciones,
} from '../api/consultas';
import { usarMocks } from '../api/cliente';
import type { EstadoReservacion, FiltrosReservaciones } from '../api/tipos';
import { descargarExportacionMock } from '../mocks/servidorMock';
import {
  obtenerInfoEstadoReservacion,
  obtenerInfoTipoEvento,
} from '../utilidades/catalogos';
import {
  formatearFechaCorta,
  formatearRangoHorario,
} from '../utilidades/fechas';
import { PanelExpediente } from '../componentes/PanelExpediente';

const TAMANO_PAGINA = 10;

export function PaginaHistorial() {
  const [busqueda, setBusqueda] = useState('');
  const [espacioId, setEspacioId] = useState('');
  const [estado, setEstado] = useState<EstadoReservacion | ''>('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [pagina, setPagina] = useState(1);

  const [menuExportarAbierto, setMenuExportarAbierto] = useState(false);
  const [expedienteSeleccionadoId, setExpedienteSeleccionadoId] = useState<string | null>(null);

  const { data: espacios = [] } = useEspacios();

  const filtrosActuales: FiltrosReservaciones = {
    q: busqueda.trim() || undefined,
    espacioId: espacioId || undefined,
    estado: estado || undefined,
    desde: desde || undefined,
    hasta: hasta || undefined,
    pagina,
    tamano: TAMANO_PAGINA,
    orden: 'inicio_desc',
  };

  const { data: paginaDatos, isLoading } = useReservaciones(filtrosActuales);

  const reservaciones = paginaDatos?.datos ?? [];
  const total = paginaDatos?.total ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(total / TAMANO_PAGINA));

  const limpiarFiltros = () => {
    setBusqueda('');
    setEspacioId('');
    setEstado('');
    setDesde('');
    setHasta('');
    setPagina(1);
  };

  const hayFiltrosActivos = Boolean(busqueda || espacioId || estado || desde || hasta);

  const manejarExportar = (formato: 'xlsx' | 'csv') => {
    setMenuExportarAbierto(false);
    if (usarMocks()) {
      descargarExportacionMock(formato);
      return;
    }
    const qs = queryReservaciones({
      q: busqueda.trim() || undefined,
      espacioId: espacioId || undefined,
      estado: estado || undefined,
      desde: desde || undefined,
      hasta: hasta || undefined,
    });
    const separador = qs ? '&' : '?';
    window.location.href = `/api/reservaciones/exportar${qs}${separador}formato=${formato}`;
  };

  const pillsRapidas: { valor: EstadoReservacion | ''; etiqueta: string }[] = [
    { valor: '', etiqueta: 'Todos' },
    { valor: 'REALIZADA', etiqueta: 'Realizadas' },
    { valor: 'PENDIENTE', etiqueta: 'Pendientes' },
    { valor: 'CANCELADA', etiqueta: 'Canceladas' },
  ];

  return (
    <div className="space-y-5">
      {/* Breadcrumbs y cabecera */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <nav aria-label="Ruta de navegación" className="text-xs font-medium text-texto-suave mb-1">
            <Link to="/calendario" className="hover:text-navy">
              Inicio
            </Link>
            <span className="mx-2">/</span>
            <span className="text-navy font-semibold">Historial de reservaciones</span>
          </nav>
          <h1 className="text-xl sm:text-2xl font-bold text-navy">
            Historial de reservaciones
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Dropdown Exportar Excel / CSV */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuExportarAbierto((v) => !v)}
              aria-expanded={menuExportarAbierto}
              className="btn-secundario"
            >
              <Download className="h-4 w-4 text-navy" />
              <span>Exportar Excel / CSV</span>
              <ChevronDown className="h-4 w-4 text-texto-suave" />
            </button>

            {menuExportarAbierto && (
              <div
                role="menu"
                className="absolute right-0 mt-1.5 w-52 rounded-xl border border-borde bg-white py-1.5 shadow-flotante z-30"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => manejarExportar('xlsx')}
                  className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-xs font-medium text-texto hover:bg-slate-50"
                >
                  <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                  <span>Excel (.xlsx)</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => manejarExportar('csv')}
                  className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-xs font-medium text-texto hover:bg-slate-50"
                >
                  <FileText className="h-4 w-4 text-navy" />
                  <span>CSV (.csv)</span>
                </button>
              </div>
            )}
          </div>

          <Link to="/reservaciones/nueva" className="btn-primario">
            <Plus className="h-4 w-4" />
            <span>+ Nueva reservación</span>
          </Link>
        </div>
      </div>

      {/* Barra de filtros y píldoras rápidas */}
      <div className="tarjeta p-4 sm:p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Búsqueda */}
          <div className="lg:col-span-2">
            <label htmlFor="filtro-busqueda" className="label-base">
              Buscar por código, evento o responsable
            </label>
            <div className="relative">
              <Search className="h-4 w-4 text-texto-suave absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="filtro-busqueda"
                type="search"
                value={busqueda}
                onChange={(e) => {
                  setBusqueda(e.target.value);
                  setPagina(1);
                }}
                placeholder="Ej. RES-2026, Foro, Dra. Elena..."
                className="input-base pl-9"
              />
            </div>
          </div>

          {/* Aula / Espacio */}
          <div>
            <label htmlFor="filtro-aula" className="label-base">
              Aula o espacio
            </label>
            <select
              id="filtro-aula"
              value={espacioId}
              onChange={(e) => {
                setEspacioId(e.target.value);
                setPagina(1);
              }}
              className="input-base"
            >
              <option value="">Todas las aulas</option>
              {espacios.map((esp) => (
                <option key={esp.id} value={esp.id}>
                  {esp.nombre} ({esp.edificio})
                </option>
              ))}
            </select>
          </div>

          {/* Estado */}
          <div>
            <label htmlFor="filtro-estado" className="label-base">
              Estado
            </label>
            <select
              id="filtro-estado"
              value={estado}
              onChange={(e) => {
                setEstado(e.target.value as EstadoReservacion | '');
                setPagina(1);
              }}
              className="input-base"
            >
              <option value="">Todos los estados</option>
              <option value="PENDIENTE">Pendientes</option>
              <option value="REALIZADA">Realizadas</option>
              <option value="CANCELADA">Canceladas</option>
            </select>
          </div>

          {/* Rango de fechas */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="filtro-desde" className="label-base">
                Desde
              </label>
              <input
                id="filtro-desde"
                type="date"
                value={desde}
                onChange={(e) => {
                  setDesde(e.target.value);
                  setPagina(1);
                }}
                className="input-base px-2 text-xs"
              />
            </div>
            <div>
              <label htmlFor="filtro-hasta" className="label-base">
                Hasta
              </label>
              <input
                id="filtro-hasta"
                type="date"
                value={hasta}
                onChange={(e) => {
                  setHasta(e.target.value);
                  setPagina(1);
                }}
                className="input-base px-2 text-xs"
              />
            </div>
          </div>
        </div>

        {/* Píldoras rápidas + botón limpiar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-borde pt-3">
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtro rápido por estado">
            {pillsRapidas.map((p) => {
              const activa = estado === p.valor;
              return (
                <button
                  key={p.etiqueta}
                  type="button"
                  onClick={() => {
                    setEstado(p.valor);
                    setPagina(1);
                  }}
                  className={`rounded-full px-3.5 py-1 text-xs font-semibold transition ${
                    activa
                      ? 'bg-navy text-white shadow-sm'
                      : 'bg-slate-100 text-texto-suave hover:bg-slate-200 hover:text-texto'
                  }`}
                >
                  {p.etiqueta}
                </button>
              );
            })}
          </div>

          {hayFiltrosActivos && (
            <button
              type="button"
              onClick={limpiarFiltros}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-navy hover:underline"
            >
              <FilterX className="h-3.5 w-3.5" />
              <span>Limpiar filtros</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabla de reservaciones */}
      <div className="tarjeta overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-borde bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-texto-suave">
                <th className="py-3.5 px-4">Código</th>
                <th className="py-3.5 px-4">Evento</th>
                <th className="py-3.5 px-4">Tipo</th>
                <th className="py-3.5 px-4">Espacio</th>
                <th className="py-3.5 px-4">Fecha</th>
                <th className="py-3.5 px-4">Horario</th>
                <th className="py-3.5 px-4">Responsable</th>
                <th className="py-3.5 px-4">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde text-sm">
              {isLoading &&
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={8} className="py-4 px-4">
                      <div className="h-5 rounded bg-slate-100" />
                    </td>
                  </tr>
                ))}

              {!isLoading && reservaciones.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 px-4 text-center">
                    <p className="text-sm font-semibold text-navy">
                      No se encontraron reservaciones con los criterios seleccionados
                    </p>
                    <p className="mt-1 text-xs text-texto-suave">
                      Ajusta los filtros de búsqueda o agenda una nueva reservación.
                    </p>
                  </td>
                </tr>
              )}

              {!isLoading &&
                reservaciones.map((r) => {
                  const infoTipo = obtenerInfoTipoEvento(r.tipoEvento);
                  const infoEstado = obtenerInfoEstadoReservacion(r.estado);

                  return (
                    <tr
                      key={r.id}
                      onClick={() => setExpedienteSeleccionadoId(r.id)}
                      tabIndex={0}
                      role="button"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setExpedienteSeleccionadoId(r.id);
                        }
                      }}
                      className="cursor-pointer transition hover:bg-amber-50/40 focus:bg-amber-50/40"
                    >
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="rounded-md bg-navy-50 px-2 py-1 font-mono text-xs font-bold text-navy">
                          {r.codigo}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-texto max-w-[260px]">
                        <p className="truncate">{r.nombreEvento}</p>
                        {r.resumenRecursos && (
                          <p className="text-xs font-normal text-texto-suave truncate">
                            {r.resumenRecursos}
                          </p>
                        )}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${infoTipo.clasesBadge}`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${infoTipo.clasesPunto}`} />
                          {infoTipo.etiqueta}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap text-xs font-medium text-texto">
                        {r.espacioNombre}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap text-xs text-texto-suave">
                        {formatearFechaCorta(r.inicio)}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap text-xs font-semibold text-navy">
                        {formatearRangoHorario(r.inicio, r.fin)}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-texto max-w-[180px] truncate">
                        {r.responsable}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${infoEstado.clasesBadge}`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${infoEstado.clasesPunto}`} />
                          {infoEstado.etiqueta}
                        </span>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-borde bg-slate-50 px-4 py-3 text-xs text-texto-suave">
          <span>
            Mostrando{' '}
            <strong className="text-texto">
              {total === 0 ? 0 : (pagina - 1) * TAMANO_PAGINA + 1}
            </strong>{' '}
            –{' '}
            <strong className="text-texto">
              {Math.min(pagina * TAMANO_PAGINA, total)}
            </strong>{' '}
            de <strong className="text-texto">{total}</strong> reservaciones
          </span>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPagina((p) => Math.max(1, p - 1))}
              disabled={pagina <= 1}
              className="btn-secundario py-1 px-2.5 text-xs"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span>Anterior</span>
            </button>
            <span className="px-2.5 font-semibold text-navy">
              Página {pagina} de {totalPaginas}
            </span>
            <button
              type="button"
              onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
              disabled={pagina >= totalPaginas}
              className="btn-secundario py-1 px-2.5 text-xs"
            >
              <span>Siguiente</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Panel lateral "Expediente oficial" */}
      <PanelExpediente
        reservacionId={expedienteSeleccionadoId}
        alCerrar={() => setExpedienteSeleccionadoId(null)}
      />
    </div>
  );
}

import { Navigate, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock,
  LogOut,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import { salir, useEstadoSolicitud } from '../api/consultas';
import { esApiError, esperarServidorActivo, usarMocks } from '../api/cliente';
import { formatearFechaHora } from '../utilidades/fechas';
import { obtenerEtiquetaRol } from '../utilidades/catalogos';
import { activarSesionGoogleMock } from '../mocks/servidorMock';
import logoUlatino from '../assets/logo.png';

export function PaginaEstadoAcceso() {
  const { data, isLoading, isFetching, error, refetch } = useEstadoSolicitud();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-fondo flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 rounded-full border-4 border-navy/20 border-t-amber animate-spin" />
          <p className="text-sm font-medium text-texto-suave">
            Consultando estado de tu solicitud...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    if (esApiError(error) && error.status === 401) {
      return <Navigate to="/ingresar" replace />;
    }
    return <Navigate to="/ingresar" replace />;
  }

  if (!data) {
    return <Navigate to="/ingresar" replace />;
  }

  const { estado, solicitud } = data;

  const manejarUsarOtraCuenta = async () => {
    try {
      await salir();
    } catch {
      // Continuar hacia /ingresar
    } finally {
      queryClient.clear();
      navigate('/ingresar', { replace: true });
    }
  };

  const manejarIniciarGoogle = async () => {
    if (usarMocks()) {
      activarSesionGoogleMock();
      queryClient.clear();
      navigate('/calendario');
      return;
    }
    await esperarServidorActivo();
    window.location.href = '/api/auth/google/iniciar';
  };

  const iniciales = solicitud.nombre
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <div className="min-h-screen bg-fondo flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-lg tarjeta overflow-hidden">
        <div className="bg-navy px-6 py-5 text-white flex items-center gap-3">
          <img src={logoUlatino} alt="Universidad Latino" className="h-10 w-auto shrink-0 drop-shadow-sm" />
          <div>
            <h1 className="text-base font-bold">SIPREF Reservas · Control de Acceso</h1>
            <p className="text-xs text-navy-200">Universidad Latino</p>
          </div>
        </div>

        <div className="p-6 sm:p-7 space-y-6">
          {/* Indicador de 3 pasos para PENDIENTE y APROBADA */}
          {(estado === 'PENDIENTE' || estado === 'APROBADA') && (
            <ol
              aria-label="Progreso de la solicitud de acceso"
              className="grid grid-cols-3 gap-2 text-center text-xs"
            >
              <li className="rounded-xl border border-emerald-200 bg-emerald-50 px-2.5 py-2.5 font-semibold text-emerald-800">
                <span className="block text-[11px] uppercase tracking-wider text-emerald-600">
                  Paso 1
                </span>
                Solicitud enviada ✓
              </li>
              <li
                className={`rounded-xl border px-2.5 py-2.5 font-semibold ${
                  estado === 'PENDIENTE'
                    ? 'border-amber bg-amber-50 text-amber-800 ring-2 ring-amber/30'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-800'
                }`}
              >
                <span className="block text-[11px] uppercase tracking-wider">Paso 2</span>
                {estado === 'APROBADA' ? 'En revisión ✓' : 'En revisión'}
              </li>
              <li
                className={`rounded-xl border px-2.5 py-2.5 font-semibold ${
                  estado === 'APROBADA'
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-200'
                    : 'border-borde bg-slate-50 text-texto-suave'
                }`}
              >
                <span className="block text-[11px] uppercase tracking-wider">Paso 3</span>
                {estado === 'APROBADA' ? 'Acceso concedido ✓' : 'Acceso concedido'}
              </li>
            </ol>
          )}

          {/* Mensaje principal según variante */}
          {estado === 'PENDIENTE' && (
            <div className="flex items-start gap-3.5 rounded-xl border border-amber-200 bg-amber-50/70 p-4">
              <Clock className="h-6 w-6 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h2 className="text-base font-bold text-navy">
                  Tu solicitud está en revisión
                </h2>
                <p className="mt-1 text-xs text-texto-suave leading-relaxed">
                  Un administrador de SIPREF principal revisará tu solicitud para asignarte los permisos correspondientes.
                </p>
              </div>
            </div>
          )}

          {estado === 'APROBADA' && (
            <div className="flex items-start gap-3.5 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <h2 className="text-base font-bold text-emerald-900">
                  Tu acceso ha sido aprobado
                </h2>
                <p className="mt-1 text-xs text-emerald-800">
                  Ya puedes ingresar al sistema de reservaciones de aulas y espacios.
                  {solicitud.rolAsignado && (
                    <span className="block mt-1 font-semibold">
                      Rol asignado: {obtenerEtiquetaRol(solicitud.rolAsignado)}
                    </span>
                  )}
                </p>
              </div>
            </div>
          )}

          {estado === 'RECHAZADA' && (
            <div
              role="alert"
              className="flex items-start gap-3.5 rounded-xl border border-rose-200 bg-rose-50 p-4"
            >
              <Ban className="h-6 w-6 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <h2 className="text-base font-bold text-rose-900">Solicitud no aprobada</h2>
                <p className="mt-1 text-sm font-medium text-rose-800">
                  No fue posible otorgarte acceso. Contacta a la administración.
                </p>
              </div>
            </div>
          )}

          {estado === 'REVOCADA' && (
            <div
              role="alert"
              className="flex items-start gap-3.5 rounded-xl border border-rose-200 bg-rose-50 p-4"
            >
              <ShieldAlert className="h-6 w-6 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <h2 className="text-base font-bold text-rose-900">Acceso suspendido</h2>
                <p className="mt-1 text-sm font-medium text-rose-800">
                  Tu acceso fue suspendido. Contacta a la administración.
                </p>
              </div>
            </div>
          )}

          {estado === 'EXPIRADA' && (
            <div
              role="alert"
              className="flex items-start gap-3.5 rounded-xl border border-amber-300 bg-amber-50 p-4"
            >
              <AlertTriangle className="h-6 w-6 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h2 className="text-base font-bold text-amber-900">Solicitud vencida</h2>
                <p className="mt-1 text-sm font-medium text-amber-800">
                  Tu solicitud expiró. Puedes enviar una nueva.
                </p>
              </div>
            </div>
          )}

          {/* Tarjeta con los datos de la solicitud */}
          <div className="rounded-xl border border-borde bg-fondo/70 p-4 space-y-3">
            <div className="flex items-center gap-3">
              {solicitud.fotoUrl ? (
                <img
                  src={solicitud.fotoUrl}
                  alt={solicitud.nombre}
                  className="h-11 w-11 rounded-full object-cover ring-2 ring-navy/20"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-navy text-white text-sm font-bold">
                  {iniciales || 'UL'}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm font-bold text-texto truncate">{solicitud.nombre}</p>
                <p className="text-xs text-texto-suave truncate">{solicitud.correo}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 border-t border-borde pt-3 text-xs">
              <div>
                <span className="text-texto-suave block">Fecha y hora del intento</span>
                <span className="font-semibold text-texto">
                  {formatearFechaHora(solicitud.intentadoEn)}
                </span>
              </div>
              {(estado === 'RECHAZADA' || estado === 'REVOCADA') && solicitud.resueltoEn && (
                <div>
                  <span className="text-texto-suave block">Fecha de resolución</span>
                  <span className="font-semibold text-texto">
                    {formatearFechaHora(solicitud.resueltoEn)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Botones de acción según estado */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5 pt-1">
            <button
              type="button"
              onClick={manejarUsarOtraCuenta}
              className="btn-secundario"
            >
              <LogOut className="h-4 w-4" />
              <span>Usar otra cuenta</span>
            </button>

            {estado === 'PENDIENTE' && (
              <button
                type="button"
                onClick={() => refetch()}
                disabled={isFetching}
                className="btn-primario"
              >
                <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
                <span>Actualizar estado</span>
              </button>
            )}

            {estado === 'APROBADA' && (
              <button
                type="button"
                onClick={manejarIniciarGoogle}
                className="btn-primario"
              >
                <span>Entrar a SIPREF Reservas</span>
              </button>
            )}

            {estado === 'EXPIRADA' && (
              <button
                type="button"
                onClick={manejarIniciarGoogle}
                className="btn-primario"
              >
                <span>Continuar con Google</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

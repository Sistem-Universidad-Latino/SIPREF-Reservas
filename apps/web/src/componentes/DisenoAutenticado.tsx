import { useEffect, useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  LogOut,
  Menu,
  PlusCircle,
  Radio,
  WifiOff,
  X,
} from 'lucide-react';
import { salir, useYo } from '../api/consultas';
import { esApiError } from '../api/cliente';
import { obtenerEtiquetaRol } from '../utilidades/catalogos';
import logoUlatino from '../assets/logo.png';

function formatearFechaInstitucional(fecha: Date): string {
  return fecha.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Merida',
  });
}

export function DisenoAutenticado() {
  const { data: yo, isLoading, error } = useYo();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [cerrandoSesion, setCerrandoSesion] = useState(false);
  const [fechaActual, setFechaActual] = useState<Date>(() => new Date());
  const [errorConexion, setErrorConexion] = useState<boolean>(
    () => typeof navigator !== 'undefined' && navigator.onLine === false,
  );
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    const intervalo = window.setInterval(() => {
      setFechaActual(new Date());
    }, 60_000);

    const manejarOnline = () => setErrorConexion(false);
    const manejarOffline = () => setErrorConexion(true);
    const manejarEventoConexion = (ev: Event) => {
      const detalle = (ev as CustomEvent<{ conectada?: boolean }>).detail;
      if (typeof detalle?.conectada === 'boolean') {
        setErrorConexion(!detalle.conectada || navigator.onLine === false);
      }
    };

    window.addEventListener('online', manejarOnline);
    window.addEventListener('offline', manejarOffline);
    window.addEventListener('sipref:conexion', manejarEventoConexion);

    return () => {
      window.clearInterval(intervalo);
      window.removeEventListener('online', manejarOnline);
      window.removeEventListener('offline', manejarOffline);
      window.removeEventListener('sipref:conexion', manejarEventoConexion);
    };
  }, []);

  const fechaFormateada = formatearFechaInstitucional(fechaActual);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#faf9fc] flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 rounded-full border-4 border-[#244275]/20 border-t-[#fdbb11] animate-spin" />
          <p className="text-sm font-medium text-slate-500">
            Verificando sesión institucional...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    if (esApiError(error) && error.status === 403) {
      return <Navigate to="/acceso/estado" replace />;
    }
    return <Navigate to="/ingresar" replace />;
  }

  if (!yo) {
    return <Navigate to="/ingresar" replace />;
  }

  const manejarSalir = async () => {
    setCerrandoSesion(true);
    try {
      await salir();
    } catch {
      // Continuar hacia /ingresar aun si falla la petición
    } finally {
      queryClient.clear();
      navigate('/ingresar', { replace: true });
    }
  };

  const iniciales = yo.nombre
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');

  const enlaces = [
    { a: '/calendario', etiqueta: 'Calendario', icono: CalendarDays },
    { a: '/reservaciones/nueva', etiqueta: 'Nueva reservación', icono: PlusCircle },
  ];

  const contenidoSidebar = (
    <div className="flex h-full flex-col bg-[#244275] border-r border-[#30538f] shadow-2xl text-white">
      {/* Botón cerrar en móvil */}
      <button
        type="button"
        onClick={() => setMenuAbierto(false)}
        aria-label="Cerrar menú lateral"
        className="absolute top-4 right-4 text-white/60 hover:text-white lg:hidden bg-white/5 p-2 rounded-lg"
      >
        <X className="h-5 w-5" />
      </button>

      {/* Logo centrado arriba como en SIPREF */}
      <div className="px-6 py-10 w-full flex flex-col items-center justify-center">
        <div className="relative flex flex-col items-center group cursor-default">
          <img
            src={logoUlatino}
            alt="Universidad Latino Logo"
            className="w-28 h-auto object-contain drop-shadow-[0_0_8px_rgba(255,255,255,0.7)] group-hover:drop-shadow-[0_0_15px_rgba(253,187,17,0.8)] mb-5 relative z-10 group-hover:scale-105 transition-all duration-500"
          />
          <p className="text-transparent bg-clip-text bg-gradient-to-r from-white to-[#fdbb11] text-[12px] uppercase tracking-[0.28em] font-black text-center drop-shadow-sm">
            SIPREF RESERVAS
          </p>
        </div>
      </div>

      {/* Navegación principal */}
      <nav aria-label="Menú principal" className="flex-1 px-5 mt-2 space-y-2">
        {enlaces.map((item) => {
          const Icono = item.icono;
          return (
            <NavLink
              key={item.a}
              to={item.a}
              onClick={() => setMenuAbierto(false)}
              className={({ isActive }) =>
                `rounded-2xl flex items-center gap-3.5 py-3 px-5 transition-all duration-300 ${
                  isActive
                    ? 'bg-gradient-to-r from-[#fdbb11] to-[#e8a906] text-[#0e2045] shadow-lg shadow-[#fdbb11]/20 font-black translate-x-1'
                    : 'text-[#c5c6cf] hover:bg-white/5 hover:text-white font-semibold group hover:translate-x-1'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icono
                    className={`h-5 w-5 shrink-0 ${
                      isActive
                        ? ''
                        : 'opacity-70 group-hover:opacity-100 group-hover:scale-110 transition-transform'
                    }`}
                  />
                  <span className="text-sm tracking-wide">{item.etiqueta}</span>
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Botón de Cerrar Sesión abajo como en SIPREF */}
      <div className="px-5 pb-8 mt-auto">
        <button
          type="button"
          onClick={manejarSalir}
          disabled={cerrandoSesion}
          className="w-full text-[#c5c6cf] hover:bg-red-500/10 hover:text-red-400 rounded-2xl flex items-center gap-3.5 py-3 px-5 transition-all duration-300 group hover:translate-x-1 disabled:opacity-50"
        >
          <LogOut className="h-5 w-5 shrink-0 opacity-70 group-hover:opacity-100 group-hover:scale-110 transition-transform" />
          <span className="font-semibold text-sm tracking-wide">
            {cerrandoSesion ? 'Cerrando sesión...' : 'Cerrar Sesión'}
          </span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="bg-[#faf9fc] text-[#1b1c1e] antialiased flex flex-col min-h-screen">
      {/* Overlay oscuro para móvil */}
      {menuAbierto && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden transition-opacity"
          onClick={() => setMenuAbierto(false)}
        />
      )}

      {/* Header superior blanco fijo, igual que SIPREF */}
      <header className="bg-white border-b border-[#c5c6cf]/30 flex justify-between items-center px-3 sm:px-8 py-3 h-16 z-30 fixed top-0 right-0 left-0 lg:left-64 shadow-sm transition-all duration-300">
        {/* Botón Menú y Logo (Izquierda - Solo Móvil) */}
        <div className="flex items-center gap-2 sm:gap-3 lg:hidden">
          <button
            type="button"
            onClick={() => setMenuAbierto(true)}
            aria-label="Abrir menú de navegación"
            className="p-1.5 hover:bg-slate-100 rounded-md shrink-0"
          >
            <Menu className="h-6 w-6 text-[#1c355e]" />
          </button>
          <img
            src={logoUlatino}
            alt="Universidad Latino Logo"
            className="h-8 object-contain shrink-0"
          />
        </div>

        {/* Indicador institucional en escritorio */}
        <div className="hidden lg:flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white px-4 py-1.5 rounded-full border border-[#c5c6cf]/30 shadow-sm">
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#1c355e]" />
            <span className="text-[11px] font-medium text-slate-500 tracking-wide uppercase">
              Universidad Latino ·{' '}
              <span className="font-bold text-[#1c355e]">SIPREF Reservas</span>
            </span>
          </div>
        </div>

        {/* Indicador en vivo de fecha/conexión y Perfil del Usuario arriba a la derecha */}
        <div className="flex items-center gap-3 sm:gap-4 ml-auto shrink-0">
          <div
            className={`hidden sm:flex items-center gap-2.5 bg-white/80 backdrop-blur-sm rounded-full px-4 py-2 border shadow-sm transition-all ${
              errorConexion
                ? 'border-orange-300 shadow-orange-100'
                : 'border-slate-200/80'
            }`}
            role="status"
            aria-live="polite"
          >
            {errorConexion ? (
              <>
                <WifiOff className="h-[18px] w-[18px] text-orange-500 shrink-0" />
                <span className="text-xs font-extrabold text-orange-600">
                  Sin conexión
                </span>
              </>
            ) : (
              <>
                <span className="relative flex items-center justify-center shrink-0">
                  <Radio className="h-[18px] w-[18px] text-emerald-500" />
                  <span className="absolute w-2 h-2 rounded-full bg-emerald-400 animate-ping opacity-75" />
                </span>
                <span className="text-xs font-bold text-[#1b1c1e] capitalize">
                  {fechaFormateada}
                </span>
              </>
            )}
          </div>

          <Link
            to="/configuracion-perfil"
            title="Configuración de Perfil"
            className="flex items-center gap-3 pl-3 lg:border-l lg:border-[#c5c6cf]/30 shrink-0 group cursor-pointer rounded-lg py-1 pr-1 transition hover:bg-slate-50"
          >
            <div className="flex flex-col items-end justify-center min-w-0 hidden sm:flex">
              <p className="text-xs sm:text-sm font-bold text-[#1b1c1e] leading-tight truncate max-w-[160px] lg:max-w-[220px] group-hover:text-[#244275] transition-colors">
                {yo.nombre}
              </p>
              <p className="text-[10px] sm:text-xs text-slate-500 font-semibold uppercase tracking-wider">
                {obtenerEtiquetaRol(yo.rol)}
              </p>
            </div>
            {yo.fotoUrl ? (
              <img
                src={yo.fotoUrl}
                alt={yo.nombre}
                referrerPolicy="no-referrer"
                className="h-9 w-9 sm:h-10 sm:w-10 shrink-0 rounded-full object-cover border border-[#c5c6cf]/40 shadow-sm group-hover:scale-105 transition-transform"
              />
            ) : (
              <div className="h-9 w-9 sm:h-10 sm:w-10 flex-shrink-0 rounded-full bg-[#0e2045] text-white flex items-center justify-center border border-[#c5c6cf]/30 font-bold text-xs sm:text-sm uppercase shadow-sm group-hover:scale-105 group-hover:bg-[#1c355e] transition-all">
                {iniciales || 'UL'}
              </div>
            )}
          </Link>
        </div>
      </header>

      {/* Sidebar fijo en escritorio */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-50 lg:block lg:w-64">
        {contenidoSidebar}
      </aside>

      {/* Drawer móvil / tablet */}
      {menuAbierto && (
        <aside className="fixed inset-y-0 left-0 z-50 w-64 lg:hidden">
          {contenidoSidebar}
        </aside>
      )}

      {/* Contenido principal */}
      <div className="flex flex-1 flex-col pt-16 min-w-0 lg:pl-64">
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1600px] w-full mx-auto">
          <Outlet />
        </main>

        {/* Footer institucional como SIPREF */}
        <footer className="bg-[#1c2738] w-full py-4 px-4 sm:px-8 flex justify-between items-center border-t border-white/5 mt-auto">
          <div className="text-slate-400 font-bold text-[10px] uppercase tracking-[0.2em]">
            © 2026 UNIVERSIDAD LATINO - SIPREF RESERVAS
          </div>
        </footer>
      </div>
    </div>
  );
}

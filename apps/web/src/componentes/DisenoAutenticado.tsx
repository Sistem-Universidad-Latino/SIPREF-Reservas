import { useState } from 'react';
import { NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  History,
  LogOut,
  Menu,
  PlusCircle,
  X,
} from 'lucide-react';
import { salir, useYo } from '../api/consultas';
import { esApiError } from '../api/cliente';
import { obtenerEtiquetaRol } from '../utilidades/catalogos';
import logoUlatino from '../assets/logo-ulatino.svg';

export function DisenoAutenticado() {
  const { data: yo, isLoading, error } = useYo();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [cerrandoSesion, setCerrandoSesion] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-fondo flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 rounded-full border-4 border-navy/20 border-t-amber animate-spin" />
          <p className="text-sm font-medium text-texto-suave">
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
    { a: '/historial', etiqueta: 'Historial', icono: History },
    { a: '/reservaciones/nueva', etiqueta: 'Nueva reservación', icono: PlusCircle },
  ];

  const contenidoSidebar = (
    <div className="flex h-full flex-col bg-navy text-white">
      {/* Cabecera institucional */}
      <div className="flex items-center justify-between gap-3 border-b border-navy-600 px-5 py-5">
        <div className="flex items-center gap-3">
          <img
            src={logoUlatino}
            alt="Escudo Universidad Latino"
            className="h-10 w-10 shrink-0 rounded-lg bg-navy-800 p-0.5"
          />
          <div>
            <p className="text-base font-bold tracking-tight text-white leading-tight">
              SIPREF Reservas
            </p>
            <p className="text-xs font-medium text-amber-300">Universidad Latino</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setMenuAbierto(false)}
          aria-label="Cerrar menú lateral"
          className="lg:hidden rounded-lg p-1.5 text-navy-200 hover:bg-navy-600 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Navegación principal */}
      <nav aria-label="Menú principal" className="flex-1 space-y-1.5 px-3 py-5">
        <p className="px-3 pb-2 text-[11px] font-bold uppercase tracking-wider text-navy-300">
          Gestión de espacios
        </p>
        {enlaces.map((item) => {
          const Icono = item.icono;
          return (
            <NavLink
              key={item.a}
              to={item.a}
              onClick={() => setMenuAbierto(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition ${
                  isActive
                    ? 'bg-amber text-navy-900 font-semibold shadow-sm'
                    : 'text-navy-100 hover:bg-navy-600/80 hover:text-white'
                }`
              }
            >
              <Icono className="h-4 w-4 shrink-0" />
              <span>{item.etiqueta}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* Tarjeta de usuario autenticado */}
      <div className="border-t border-navy-600 p-4 space-y-3 bg-navy-800/60">
        <div className="flex items-center gap-3">
          {yo.fotoUrl ? (
            <img
              src={yo.fotoUrl}
              alt={yo.nombre}
              className="h-10 w-10 rounded-full object-cover ring-2 ring-amber/70 shrink-0"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber text-navy-900 text-xs font-bold ring-2 ring-amber/40">
              {iniciales || 'UL'}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{yo.nombre}</p>
            <p className="truncate text-xs text-amber-300 font-medium">
              {obtenerEtiquetaRol(yo.rol)}
            </p>
            <p className="truncate text-[11px] text-navy-200">{yo.correo}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={manejarSalir}
          disabled={cerrandoSesion}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-navy-500 bg-navy-700/80 px-3 py-2 text-xs font-semibold text-navy-100 transition hover:bg-navy-600 hover:text-white disabled:opacity-50"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>{cerrandoSesion ? 'Cerrando sesión...' : 'Cerrar sesión'}</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-fondo flex">
      {/* Sidebar fijo en escritorio */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:block lg:w-64">
        {contenidoSidebar}
      </aside>

      {/* Drawer móvil / tablet */}
      {menuAbierto && (
        <div
          className="fixed inset-0 z-40 flex lg:hidden bg-navy-900/60 backdrop-blur-[1px]"
          onClick={(e) => {
            if (e.target === e.currentTarget) setMenuAbierto(false);
          }}
        >
          <aside className="w-72 max-w-[85vw] h-full shadow-flotante">{contenidoSidebar}</aside>
        </div>
      )}

      {/* Contenido principal */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-64">
        {/* Barra superior para móvil/tablet */}
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-borde bg-navy px-4 py-3 text-white lg:hidden">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setMenuAbierto(true)}
              aria-label="Abrir menú de navegación"
              className="rounded-lg p-1.5 text-navy-100 hover:bg-navy-600"
            >
              <Menu className="h-5 w-5" />
            </button>
            <img src={logoUlatino} alt="UL" className="h-7 w-7" />
            <span className="text-sm font-bold">SIPREF Reservas</span>
          </div>
          <span className="rounded-full bg-amber/20 border border-amber/40 px-2.5 py-0.5 text-[11px] font-semibold text-amber-200">
            {obtenerEtiquetaRol(yo.rol)}
          </span>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1600px] w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

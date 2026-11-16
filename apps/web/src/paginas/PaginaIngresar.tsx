import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ShieldCheck, Terminal } from 'lucide-react';
import { loginDev } from '../api/consultas';
import { mensajeDeError, usarMocks } from '../api/cliente';
import type { EstadoAcceso, Rol } from '../api/tipos';
import { activarSesionGoogleMock } from '../mocks/servidorMock';
import logoUlatino from '../assets/logo-ulatino.svg';

function IconoGoogle() {
  return (
    <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.13-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96Z"
      />
    </svg>
  );
}

export function PaginaIngresar() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const paramError = searchParams.get('error');
  const mensajeErrorOAuth =
    paramError === 'dominio'
      ? 'Tu cuenta de Google no pertenece a un dominio permitido.'
      : paramError === 'google'
        ? 'No fue posible iniciar sesión con Google. Intenta de nuevo.'
        : null;

  // Estado del panel de desarrollo (solo en import.meta.env.DEV)
  const [devAbierto, setDevAbierto] = useState(false);
  const [devSub, setDevSub] = useState('google-oauth2|109823471928374');
  const [devNombre, setDevNombre] = useState('Mtra. Ana Sofía López Hernández');
  const [devCorreo, setDevCorreo] = useState('ana.lopez@ulatino.edu.mx');
  const [devEstado, setDevEstado] = useState<EstadoAcceso>('APROBADA');
  const [devRol, setDevRol] = useState<Rol>('ADMIN_ESPACIOS');
  const [devCargando, setDevCargando] = useState(false);
  const [devError, setDevError] = useState<string | null>(null);

  const manejarContinuarConGoogle = () => {
    if (usarMocks()) {
      const estado = activarSesionGoogleMock();
      queryClient.clear();
      navigate(estado === 'APROBADA' ? '/calendario' : '/acceso/estado');
      return;
    }
    window.location.href = '/api/auth/google/iniciar';
  };

  const manejarEnvioDev = async (e: React.FormEvent) => {
    e.preventDefault();
    setDevCargando(true);
    setDevError(null);
    try {
      await loginDev({
        sub: devSub.trim(),
        nombre: devNombre.trim(),
        correo: devCorreo.trim(),
        estado: devEstado,
        rol: devRol,
      });
      queryClient.clear();
      if (devEstado === 'APROBADA') {
        navigate('/calendario');
      } else {
        navigate('/acceso/estado');
      }
    } catch (err) {
      setDevError(mensajeDeError(err));
    } finally {
      setDevCargando(false);
    }
  };

  return (
    <div className="min-h-screen bg-fondo flex flex-col justify-center items-center p-4 sm:p-6">
      <div className="w-full max-w-md space-y-5">
        <div className="tarjeta overflow-hidden">
          {/* Franja superior institucional */}
          <div className="h-2 bg-gradient-to-r from-navy via-navy-600 to-amber" />

          <div className="p-7 sm:p-8 text-center space-y-6">
            <div className="flex flex-col items-center">
              <div className="rounded-2xl bg-navy p-3 shadow-md ring-4 ring-amber/20 mb-4">
                <img
                  src={logoUlatino}
                  alt="Escudo Universidad Latino"
                  className="h-14 w-14"
                />
              </div>
              <span className="inline-flex items-center rounded-full bg-amber-50 border border-amber-200 px-3 py-0.5 text-xs font-semibold text-amber-700 mb-2">
                Universidad Latino
              </span>
              <h1 className="text-2xl font-bold tracking-tight text-navy">
                SIPREF Reservas
              </h1>
              <p className="mt-1 text-sm text-texto-suave">
                Sistema institucional de reservación de aulas y espacios académicos
              </p>
            </div>

            {mensajeErrorOAuth && (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-left text-xs text-rose-800"
              >
                <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                <span className="font-medium">{mensajeErrorOAuth}</span>
              </div>
            )}

            <div className="space-y-3">
              <button
                type="button"
                onClick={manejarContinuarConGoogle}
                className="flex w-full items-center justify-center gap-3 rounded-xl border border-borde bg-white px-5 py-3 text-sm font-semibold text-texto shadow-sm transition hover:bg-slate-50 hover:border-navy/30 active:bg-slate-100"
              >
                <IconoGoogle />
                <span>Continuar con Google</span>
              </button>

              <div className="flex items-center justify-center gap-2 text-xs text-texto-suave pt-1">
                <ShieldCheck className="h-4 w-4 text-navy shrink-0" />
                <span>Tu acceso debe ser aprobado por un administrador de SIPREF.</span>
              </div>
            </div>
          </div>
        </div>

        {/* Panel discreto de acceso de desarrollo (solo en DEV) */}
        {import.meta.env.DEV && (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white/80 p-4 text-xs shadow-sm">
            <button
              type="button"
              onClick={() => setDevAbierto((v) => !v)}
              className="flex w-full items-center justify-between font-semibold text-texto-suave hover:text-navy"
            >
              <span className="inline-flex items-center gap-1.5">
                <Terminal className="h-3.5 w-3.5 text-amber-600" />
                Acceso de desarrollo
              </span>
              <span>{devAbierto ? 'Ocultar ▲' : 'Configurar ▼'}</span>
            </button>

            {devAbierto && (
              <form onSubmit={manejarEnvioDev} className="mt-3 space-y-2.5 border-t border-slate-200 pt-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="dev-sub" className="block text-[11px] font-medium text-texto-suave mb-0.5">
                      Google Sub
                    </label>
                    <input
                      id="dev-sub"
                      type="text"
                      value={devSub}
                      onChange={(e) => setDevSub(e.target.value)}
                      className="input-base py-1.5 text-xs"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="dev-nombre" className="block text-[11px] font-medium text-texto-suave mb-0.5">
                      Nombre
                    </label>
                    <input
                      id="dev-nombre"
                      type="text"
                      value={devNombre}
                      onChange={(e) => setDevNombre(e.target.value)}
                      className="input-base py-1.5 text-xs"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="dev-correo" className="block text-[11px] font-medium text-texto-suave mb-0.5">
                    Correo electrónico
                  </label>
                  <input
                    id="dev-correo"
                    type="email"
                    value={devCorreo}
                    onChange={(e) => setDevCorreo(e.target.value)}
                    className="input-base py-1.5 text-xs"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="dev-estado" className="block text-[11px] font-medium text-texto-suave mb-0.5">
                      Estado de cuenta
                    </label>
                    <select
                      id="dev-estado"
                      value={devEstado}
                      onChange={(e) => setDevEstado(e.target.value as EstadoAcceso)}
                      className="input-base py-1.5 text-xs"
                    >
                      <option value="APROBADA">APROBADA</option>
                      <option value="PENDIENTE">PENDIENTE</option>
                      <option value="RECHAZADA">RECHAZADA</option>
                      <option value="REVOCADA">REVOCADA</option>
                      <option value="EXPIRADA">EXPIRADA</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="dev-rol" className="block text-[11px] font-medium text-texto-suave mb-0.5">
                      Rol asignado
                    </label>
                    <select
                      id="dev-rol"
                      value={devRol}
                      onChange={(e) => setDevRol(e.target.value as Rol)}
                      className="input-base py-1.5 text-xs"
                    >
                      <option value="ADMIN_ESPACIOS">ADMIN_ESPACIOS</option>
                      <option value="DOCENTE">DOCENTE</option>
                      <option value="PERSONAL">PERSONAL</option>
                    </select>
                  </div>
                </div>

                {devError && (
                  <p role="alert" className="text-rose-600 font-medium">
                    {devError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={devCargando}
                  className="btn-navy w-full py-1.5 text-xs"
                >
                  {devCargando ? 'Iniciando sesión dev...' : 'Simular acceso (POST /api/auth/dev)'}
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Loader2, ShieldCheck } from 'lucide-react';
import { esperarServidorActivo, pingSalud, usarMocks } from '../api/cliente';
import { activarSesionGoogleMock } from '../mocks/servidorMock';
import logoUlatino from '../assets/logo.png';

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
  const [servidorListo, setServidorListo] = useState(() => usarMocks());
  const [conectando, setConectando] = useState(false);

  useEffect(() => {
    if (usarMocks()) return;
    let activo = true;
    void pingSalud().then((ok) => {
      if (activo && ok) setServidorListo(true);
    });
    return () => {
      activo = false;
    };
  }, []);

  const paramError = searchParams.get('error');
  const mensajeErrorOAuth =
    paramError === 'dominio'
      ? 'Tu cuenta de Google no pertenece a un dominio permitido.'
      : paramError === 'google'
        ? 'No fue posible iniciar sesión con Google. Intenta de nuevo.'
        : null;

  const manejarContinuarConGoogle = async () => {
    if (usarMocks()) {
      const estado = activarSesionGoogleMock();
      queryClient.clear();
      navigate(estado === 'APROBADA' ? '/calendario' : '/acceso/estado');
      return;
    }
    if (!servidorListo) {
      setConectando(true);
      await esperarServidorActivo();
    }
    window.location.href = '/api/auth/google/iniciar';
  };

  return (
    <div className="min-h-screen bg-fondo flex flex-col justify-center items-center p-4 sm:p-6">
      <div className="w-full max-w-md space-y-5">
        <div className="tarjeta overflow-hidden">
          {/* Franja superior institucional */}
          <div className="h-2 bg-gradient-to-r from-navy via-navy-600 to-amber" />

          <div className="p-7 sm:p-8 text-center space-y-6">
            <div className="flex flex-col items-center">
              <img
                src={logoUlatino}
                alt="Universidad Latino"
                className="w-36 h-auto mb-4 drop-shadow-sm"
              />
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
                disabled={conectando}
                onClick={manejarContinuarConGoogle}
                className="flex w-full items-center justify-center gap-3 rounded-xl border border-borde bg-white px-5 py-3 text-sm font-semibold text-texto shadow-sm transition hover:bg-slate-50 hover:border-navy/30 active:bg-slate-100 disabled:cursor-wait disabled:opacity-80"
              >
                {conectando ? (
                  <>
                    <Loader2 className="h-5 w-5 shrink-0 animate-spin text-navy" />
                    <span>Conectando con el servidor...</span>
                  </>
                ) : (
                  <>
                    <IconoGoogle />
                    <span>Continuar con Google</span>
                  </>
                )}
              </button>

              <div className="flex items-center justify-center gap-2 text-xs text-texto-suave pt-1">
                <ShieldCheck className="h-4 w-4 text-navy shrink-0" />
                <span>Tu acceso debe ser aprobado por un administrador de SIPREF.</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

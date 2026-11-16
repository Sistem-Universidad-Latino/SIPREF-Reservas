import React, { createContext, useCallback, useContext, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

export type TipoToast = 'exito' | 'error' | 'advertencia' | 'info';

export interface ItemToast {
  id: string;
  tipo: TipoToast;
  mensaje: string;
  detalle?: string;
}

interface ContextoToastValor {
  mostrarToast: (tipo: TipoToast, mensaje: string, detalle?: string) => void;
  exito: (mensaje: string, detalle?: string) => void;
  error: (mensaje: string, detalle?: string) => void;
  advertencia: (mensaje: string, detalle?: string) => void;
  info: (mensaje: string, detalle?: string) => void;
}

const ContextoToast = createContext<ContextoToastValor | null>(null);

export function ProveedorToast({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ItemToast[]>([]);

  const descartar = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const mostrarToast = useCallback(
    (tipo: TipoToast, mensaje: string, detalle?: string) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev, { id, tipo, mensaje, detalle }]);
      window.setTimeout(() => {
        descartar(id);
      }, 4500);
    },
    [descartar],
  );

  const valor: ContextoToastValor = {
    mostrarToast,
    exito: (m, d) => mostrarToast('exito', m, d),
    error: (m, d) => mostrarToast('error', m, d),
    advertencia: (m, d) => mostrarToast('advertencia', m, d),
    info: (m, d) => mostrarToast('info', m, d),
  };

  return (
    <ContextoToast.Provider value={valor}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="fixed top-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2.5 pointer-events-none px-4 sm:px-0"
      >
        {toasts.map((t) => {
          const estilos: Record<
            TipoToast,
            { contenedor: string; icono: React.ReactNode }
          > = {
            exito: {
              contenedor: 'border-emerald-200 bg-white text-texto',
              icono: <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />,
            },
            error: {
              contenedor: 'border-rose-200 bg-white text-texto',
              icono: <AlertCircle className="h-5 w-5 text-rose-600 shrink-0" />,
            },
            advertencia: {
              contenedor: 'border-amber-300 bg-white text-texto',
              icono: <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />,
            },
            info: {
              contenedor: 'border-blue-200 bg-white text-texto',
              icono: <Info className="h-5 w-5 text-blue-600 shrink-0" />,
            },
          };

          const actual = estilos[t.tipo];

          return (
            <div
              key={t.id}
              role="status"
              className={`pointer-events-auto flex items-start gap-3 rounded-xl border p-4 shadow-flotante transition-all ${actual.contenedor}`}
            >
              {actual.icono}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-texto">{t.mensaje}</p>
                {t.detalle && <p className="mt-0.5 text-xs text-texto-suave">{t.detalle}</p>}
              </div>
              <button
                type="button"
                onClick={() => descartar(t.id)}
                aria-label="Cerrar notificación"
                className="rounded-md p-1 text-texto-suave hover:bg-slate-100 hover:text-texto"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ContextoToast.Provider>
  );
}

export function useToast(): ContextoToastValor {
  const ctx = useContext(ContextoToast);
  if (!ctx) {
    return {
      mostrarToast: () => undefined,
      exito: () => undefined,
      error: () => undefined,
      advertencia: () => undefined,
      info: () => undefined,
    };
  }
  return ctx;
}

import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface PropiedadesModal {
  abierto: boolean;
  alCerrar: () => void;
  titulo: string;
  subtitulo?: string;
  anchoMax?: 'md' | 'lg' | 'xl';
  children: React.ReactNode;
}

export function Modal({
  abierto,
  alCerrar,
  titulo,
  subtitulo,
  anchoMax = 'md',
  children,
}: PropiedadesModal) {
  useEffect(() => {
    if (!abierto) return;
    const manejarTecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        alCerrar();
      }
    };
    window.addEventListener('keydown', manejarTecla);
    return () => window.removeEventListener('keydown', manejarTecla);
  }, [abierto, alCerrar]);

  if (!abierto) return null;

  const claseAncho =
    anchoMax === 'xl' ? 'max-w-2xl' : anchoMax === 'lg' ? 'max-w-xl' : 'max-w-md';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-900/60 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-titulo"
      onClick={(e) => {
        if (e.target === e.currentTarget) alCerrar();
      }}
    >
      <div className={`w-full ${claseAncho} rounded-card bg-white border border-borde shadow-flotante overflow-hidden`}>
        <div className="flex items-start justify-between gap-4 border-b border-borde bg-navy px-5 py-4 text-white">
          <div>
            <h2 id="modal-titulo" className="text-base font-semibold">
              {titulo}
            </h2>
            {subtitulo && <p className="mt-0.5 text-xs text-navy-100">{subtitulo}</p>}
          </div>
          <button
            type="button"
            onClick={alCerrar}
            aria-label="Cerrar ventana"
            className="rounded-lg p-1 text-navy-100 hover:bg-navy-600 hover:text-white transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

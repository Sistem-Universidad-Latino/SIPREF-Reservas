import { useEffect, useState } from 'react';
import { Minus, Plus } from 'lucide-react';

interface PropiedadesStepperCantidad {
  valor: number;
  alCambiar: (nuevoValor: number) => void;
  etiqueta: string;
}

/**
 * Control numérico compacto con botones − / + y entrada directa por teclado.
 * Normaliza a 1 al perder foco si queda vacío o menor que 1.
 */
export function StepperCantidad({
  valor,
  alCambiar,
  etiqueta,
}: PropiedadesStepperCantidad) {
  const [texto, setTexto] = useState(String(valor));

  useEffect(() => {
    setTexto(String(valor));
  }, [valor]);

  const confirmar = (raw: string) => {
    const n = parseInt(raw, 10);
    const normalizado = Number.isFinite(n) && n >= 1 ? n : 1;
    setTexto(String(normalizado));
    if (normalizado !== valor) {
      alCambiar(normalizado);
    }
  };

  return (
    <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white shadow-2xs">
      <button
        type="button"
        onClick={() => {
          const siguiente = Math.max(1, valor - 1);
          setTexto(String(siguiente));
          alCambiar(siguiente);
        }}
        aria-label={`Disminuir ${etiqueta}`}
        className="px-2 py-1 text-slate-600 hover:text-[#1c355e] hover:bg-slate-50 rounded-l-lg transition-colors cursor-pointer"
      >
        <Minus className="w-3 h-3" />
      </button>

      <input
        type="number"
        min={1}
        value={texto}
        onChange={(e) => {
          const val = e.target.value;
          setTexto(val);
          const n = parseInt(val, 10);
          if (Number.isFinite(n) && n >= 1) {
            alCambiar(n);
          }
        }}
        onBlur={(e) => confirmar(e.target.value)}
        aria-label={`Cantidad de ${etiqueta}`}
        className="w-11 text-center text-xs font-extrabold text-[#1c355e] bg-transparent outline-none py-0.5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />

      <button
        type="button"
        onClick={() => {
          const siguiente = valor + 1;
          setTexto(String(siguiente));
          alCambiar(siguiente);
        }}
        aria-label={`Aumentar ${etiqueta}`}
        className="px-2 py-1 text-slate-600 hover:text-[#1c355e] hover:bg-slate-50 rounded-r-lg transition-colors cursor-pointer"
      >
        <Plus className="w-3 h-3" />
      </button>
    </div>
  );
}

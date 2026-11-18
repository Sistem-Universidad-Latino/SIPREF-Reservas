import { useEffect, useState } from 'react';
import { Minus, Plus } from 'lucide-react';

interface PropiedadesStepperCantidad {
  valor: number;
  alCambiar: (nuevoValor: number) => void;
  etiqueta: string;
  min?: number;
  placeholder?: string;
}

/**
 * Control numérico compacto con botones − / + y entrada directa por teclado.
 * Usa inputMode="numeric" sin flechas nativas, selecciona todo al enfocar,
 * confirma con Enter sin enviar el formulario padre y normaliza al perder foco.
 */
export function StepperCantidad({
  valor,
  alCambiar,
  etiqueta,
  min = 1,
  placeholder,
}: PropiedadesStepperCantidad) {
  const [texto, setTexto] = useState(String(valor));

  useEffect(() => {
    setTexto(String(valor));
  }, [valor]);

  const confirmar = (raw: string) => {
    const n = parseInt(raw, 10);
    const normalizado = Number.isFinite(n) && n >= min ? n : min;
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
          const siguiente = Math.max(min, valor - 1);
          setTexto(String(siguiente));
          alCambiar(siguiente);
        }}
        aria-label={`Disminuir ${etiqueta}`}
        className="px-2 py-1 text-slate-600 hover:text-[#1c355e] hover:bg-slate-50 rounded-l-lg transition-colors cursor-pointer"
      >
        <Minus className="w-3 h-3" />
      </button>

      <input
        type="text"
        inputMode="numeric"
        value={texto}
        placeholder={placeholder}
        onFocus={(e) => e.target.select()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
        onChange={(e) => {
          const soloDigitos = e.target.value.replace(/\D+/g, '');
          setTexto(soloDigitos);
          if (soloDigitos !== '') {
            const n = parseInt(soloDigitos, 10);
            if (Number.isFinite(n) && n >= min) {
              alCambiar(n);
            }
          }
        }}
        onBlur={(e) => confirmar(e.target.value)}
        aria-label={`Cantidad de ${etiqueta}`}
        className="w-11 text-center text-xs font-extrabold text-[#1c355e] bg-transparent outline-none py-0.5"
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

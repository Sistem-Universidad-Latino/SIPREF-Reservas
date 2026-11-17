import { useEffect, useState } from 'react';
import { Minus, Plus, Sparkles, Trash2 } from 'lucide-react';
import { Modal } from './Modal';
import {
  useActualizarPlantillaEvento,
  useCrearPlantillaEvento,
  useEliminarPlantillaEvento,
} from '../api/consultas';
import { mensajeDeError } from '../api/cliente';
import type { PlantillaEvento, Recurso } from '../api/tipos';
import { useToast } from './Toast';

interface PropiedadesModalPlantilla {
  abierto: boolean;
  alCerrar: () => void;
  plantillaEditar: PlantillaEvento | null;
  recursosCatalogo: Recurso[];
  recursosIniciales?: Record<number, number>;
  tipoEventoInicial?: string;
  nombreEventoInicial?: string;
  alAplicar: (plantilla: PlantillaEvento) => void;
  alEliminar?: (idEliminada: number) => void;
}

export function ModalPlantillaEvento({
  abierto,
  alCerrar,
  plantillaEditar,
  recursosCatalogo,
  recursosIniciales,
  tipoEventoInicial,
  nombreEventoInicial,
  alAplicar,
  alEliminar,
}: PropiedadesModalPlantilla) {
  const toast = useToast();
  const crearMut = useCrearPlantillaEvento();
  const actualizarMut = useActualizarPlantillaEvento();
  const eliminarMut = useEliminarPlantillaEvento();

  const [nombre, setNombre] = useState('');
  const [tipoEvento, setTipoEvento] = useState('');
  const [seleccionados, setSeleccionados] = useState<Record<number, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [confirmandoEliminar, setConfirmandoEliminar] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    setError(null);
    setConfirmandoEliminar(false);
    if (plantillaEditar) {
      setNombre(plantillaEditar.nombre);
      setTipoEvento(plantillaEditar.tipoEvento ?? '');
      const mapa: Record<number, number> = {};
      for (const r of plantillaEditar.recursos) {
        mapa[r.recursoId] = r.cantidad;
      }
      setSeleccionados(mapa);
    } else {
      setNombre(nombreEventoInicial?.trim() ?? '');
      setTipoEvento(tipoEventoInicial?.trim() ?? '');
      setSeleccionados({ ...(recursosIniciales ?? {}) });
    }
  }, [
    abierto,
    plantillaEditar,
    recursosIniciales,
    tipoEventoInicial,
    nombreEventoInicial,
  ]);

  const alternar = (recursoId: number, marcado: boolean) => {
    setSeleccionados((prev) => {
      const copia = { ...prev };
      if (marcado) copia[recursoId] = copia[recursoId] ?? 1;
      else delete copia[recursoId];
      return copia;
    });
  };

  const cambiarCantidad = (recursoId: number, cant: number) => {
    setSeleccionados((prev) => ({
      ...prev,
      [recursoId]: Math.max(1, Math.floor(cant || 1)),
    }));
  };

  const manejarGuardar = async () => {
    const nombreLimpio = nombre.trim();
    if (!nombreLimpio) {
      setError('Escribe un nombre para la plantilla (ej. Ceremonia de Titulación).');
      return;
    }
    setError(null);

    const recursosPayload = Object.entries(seleccionados).map(([idStr, cantidad]) => ({
      recursoId: Number(idStr),
      cantidad,
    }));

    try {
      const datos = {
        nombre: nombreLimpio,
        tipoEvento: tipoEvento.trim() || null,
        recursos: recursosPayload,
      };
      const res = plantillaEditar
        ? await actualizarMut.mutateAsync({ id: plantillaEditar.id, datos })
        : await crearMut.mutateAsync(datos);

      toast.exito(
        plantillaEditar
          ? 'Plantilla de evento actualizada'
          : 'Plantilla de evento creada',
      );
      alAplicar(res);
      alCerrar();
    } catch (err) {
      setError(mensajeDeError(err));
    }
  };

  const manejarEliminar = async () => {
    if (!plantillaEditar) return;
    try {
      await eliminarMut.mutateAsync(plantillaEditar.id);
      toast.exito('Plantilla eliminada');
      alEliminar?.(plantillaEditar.id);
      alCerrar();
    } catch (err) {
      setError(mensajeDeError(err));
    }
  };

  const guardando = crearMut.isPending || actualizarMut.isPending;

  return (
    <Modal
      abierto={abierto}
      alCerrar={alCerrar}
      titulo={
        plantillaEditar
          ? 'Editar evento predefinido'
          : 'Crear evento con materiales predefinidos'
      }
      subtitulo="Agrupa materiales y cantidades predeterminadas reutilizables"
      anchoMax="lg"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="plantilla-nombre"
              className="block text-[11px] font-bold text-[#1c355e] uppercase tracking-wider mb-1"
            >
              Nombre del evento *
            </label>
            <input
              id="plantilla-nombre"
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. Ceremonia de Titulación"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:bg-white focus:border-[#1c355e] focus:ring-2 focus:ring-[#1c355e]/15"
            />
          </div>

          <div>
            <label
              htmlFor="plantilla-tipo"
              className="block text-[11px] font-bold text-[#1c355e] uppercase tracking-wider mb-1"
            >
              Tipo de evento (opcional)
            </label>
            <input
              id="plantilla-tipo"
              type="text"
              value={tipoEvento}
              onChange={(e) => setTipoEvento(e.target.value)}
              placeholder="Ej. Ceremonia"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:bg-white focus:border-[#1c355e] focus:ring-2 focus:ring-[#1c355e]/15"
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-[#1c355e] uppercase tracking-wider">
              Materiales predeterminados ({Object.keys(seleccionados).length})
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
            {recursosCatalogo.map((rec) => {
              const marcado = seleccionados[rec.id] !== undefined;
              const cant = seleccionados[rec.id] ?? 1;
              const esFijo = rec.unidad === 'fijo';
              const requiereCantidad = rec.unidad !== 'sin_cantidad' && !esFijo;

              return (
                <div
                  key={rec.id}
                  className={`flex items-center justify-between gap-2 rounded-xl border p-2 transition-all ${
                    marcado
                      ? 'border-[#1c355e]/40 bg-[#1c355e]/[0.03]'
                      : 'border-slate-200 bg-slate-50/70'
                  }`}
                >
                  <label className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={marcado}
                      onChange={(e) => alternar(rec.id, e.target.checked)}
                      className="rounded border-slate-300 text-[#1c355e] focus:ring-[#1c355e]/20 shrink-0"
                    />
                    <span className="text-xs font-semibold text-slate-800 truncate">
                      {rec.nombre}
                    </span>
                  </label>

                  {marcado && requiereCantidad && (
                    <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white shrink-0">
                      <button
                        type="button"
                        onClick={() => cambiarCantidad(rec.id, Math.max(1, cant - 1))}
                        className="px-1.5 py-0.5 text-slate-600 hover:text-[#1c355e] cursor-pointer"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="w-6 text-center text-xs font-extrabold text-[#1c355e]">
                        {cant}
                      </span>
                      <button
                        type="button"
                        onClick={() => cambiarCantidad(rec.id, cant + 1)}
                        className="px-1.5 py-0.5 text-slate-600 hover:text-[#1c355e] cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {error && <p className="text-xs font-semibold text-red-600">{error}</p>}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100">
          {plantillaEditar ? (
            !confirmandoEliminar ? (
              <button
                type="button"
                onClick={() => setConfirmandoEliminar(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-100 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Eliminar plantilla</span>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={manejarEliminar}
                  disabled={eliminarMut.isPending}
                  className="rounded-xl bg-rose-600 hover:bg-rose-700 px-3 py-1.5 text-xs font-bold text-white cursor-pointer"
                >
                  {eliminarMut.isPending ? 'Eliminando...' : 'Confirmar eliminar'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmandoEliminar(false)}
                  className="text-xs font-semibold text-slate-500 hover:underline cursor-pointer"
                >
                  No
                </button>
              </div>
            )
          ) : (
            <span />
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={alCerrar}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={manejarGuardar}
              disabled={guardando}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#1c355e] hover:bg-[#152847] px-4 py-2 text-xs font-bold text-white disabled:opacity-60 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#fdbb11]" />
              <span>{guardando ? 'Guardando...' : 'Guardar y aplicar'}</span>
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

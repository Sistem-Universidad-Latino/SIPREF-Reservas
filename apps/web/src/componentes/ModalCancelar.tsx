import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from './Modal';
import { useCancelarReservacion } from '../api/consultas';
import { mensajeDeError } from '../api/cliente';
import { useToast } from './Toast';

interface PropiedadesModalCancelar {
  abierto: boolean;
  alCerrar: () => void;
  reservacion: {
    id: string;
    nombreEvento: string;
    espacioNombre: string;
    codigo?: string;
  } | null;
  alCompletar?: () => void;
}

export function ModalCancelar({
  abierto,
  alCerrar,
  reservacion,
  alCompletar,
}: PropiedadesModalCancelar) {
  const [motivo, setMotivo] = useState('');
  const [errorLocal, setErrorLocal] = useState<string | null>(null);
  const cancelarMut = useCancelarReservacion();
  const toast = useToast();

  if (!reservacion) return null;

  const manejarEnvio = async (e: React.FormEvent) => {
    e.preventDefault();
    const motivoLimpio = motivo.trim();
    if (motivoLimpio.length < 5) {
      setErrorLocal('Describe brevemente el motivo de la cancelación (mínimo 5 caracteres).');
      return;
    }
    setErrorLocal(null);
    try {
      await cancelarMut.mutateAsync({ id: reservacion.id, motivo: motivoLimpio });
      toast.exito('Reservación cancelada correctamente');
      setMotivo('');
      alCerrar();
      alCompletar?.();
    } catch (err) {
      setErrorLocal(mensajeDeError(err));
    }
  };

  return (
    <Modal
      abierto={abierto}
      alCerrar={() => {
        if (!cancelarMut.isPending) {
          setErrorLocal(null);
          alCerrar();
        }
      }}
      titulo="Cancelar reservación"
      subtitulo={reservacion.codigo ? `Expediente ${reservacion.codigo}` : reservacion.espacioNombre}
    >
      <form onSubmit={manejarEnvio} className="space-y-4">
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Esta acción liberará el espacio asignado</p>
            <p className="mt-0.5 text-amber-800">
              Se registrará la cancelación de <strong>{reservacion.nombreEvento}</strong> ({reservacion.espacioNombre}) en la bitácora de auditoría. El registro se conserva con estado <em>Cancelada</em>.
            </p>
          </div>
        </div>

        <div>
          <label htmlFor="motivo-cancelacion" className="label-base">
            Motivo de cancelación <span className="text-rose-600">*</span>
          </label>
          <textarea
            id="motivo-cancelacion"
            rows={3}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Indica la razón por la que se cancela el evento..."
            className="input-base"
            required
          />
        </div>

        {errorLocal && (
          <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700">
            {errorLocal}
          </div>
        )}

        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={alCerrar}
            disabled={cancelarMut.isPending}
            className="btn-secundario"
          >
            Conservar reservación
          </button>
          <button
            type="submit"
            disabled={cancelarMut.isPending}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-50"
          >
            {cancelarMut.isPending ? 'Cancelando...' : 'Confirmar cancelación'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

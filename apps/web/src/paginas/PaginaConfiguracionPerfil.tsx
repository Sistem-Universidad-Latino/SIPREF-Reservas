import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  Building2,
  Mail,
  Save,
  Trash2,
  User,
} from 'lucide-react';
import { useActualizarPerfil, useEliminarCuenta, useYo } from '../api/consultas';
import { mensajeDeError } from '../api/cliente';
import { useToast } from '../componentes/Toast';

export function PaginaConfiguracionPerfil() {
  const { data: yo } = useYo();
  const actualizarPerfilMut = useActualizarPerfil();
  const eliminarCuentaMut = useEliminarCuenta();
  const navigate = useNavigate();
  const toast = useToast();

  const [nombre, setNombre] = useState('');
  const [mostrarModalEliminar, setMostrarModalEliminar] = useState(false);

  useEffect(() => {
    if (yo) {
      setNombre(yo.nombre);
    }
  }, [yo]);

  if (!yo) return null;

  const iniciales = yo.nombre
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');

  const manejarGuardar = async (e: React.FormEvent) => {
    e.preventDefault();
    const nombreLimpio = nombre.trim();
    if (nombreLimpio.length < 2) {
      toast.advertencia('El nombre debe tener al menos 2 caracteres.');
      return;
    }

    try {
      await actualizarPerfilMut.mutateAsync({ nombre: nombreLimpio });
      toast.exito('Nombre actualizado correctamente.');
    } catch (err) {
      toast.error(mensajeDeError(err));
    }
  };

  const manejarEliminarCuenta = async () => {
    try {
      await eliminarCuentaMut.mutateAsync();
      toast.exito('Tu cuenta ha sido eliminada.');
      navigate('/ingresar', { replace: true });
    } catch (err) {
      toast.error(mensajeDeError(err));
      setMostrarModalEliminar(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Cabecera de página estilo SIPREF */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#1c355e] tracking-tight">
            Configuración de Perfil
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Actualiza tu información o gestiona tu cuenta en SIPREF Reservas
          </p>
        </div>

        <Link
          to="/calendario"
          className="inline-flex items-center gap-2 self-start sm:self-auto rounded-xl border border-[#c5c6cf]/60 bg-white px-4 py-2 text-xs font-semibold text-[#1c355e] shadow-sm transition hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Volver al calendario</span>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Columna izquierda: Tarjeta de resumen del usuario */}
        <div className="bg-white rounded-2xl border border-[#c5c6cf]/40 shadow-sm overflow-hidden">
          <div className="h-24 bg-gradient-to-br from-[#1c355e] via-[#244275] to-[#0e2045] border-b-2 border-[#fdbb11] relative">
            <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 lg:left-6 lg:translate-x-0">
              {yo.fotoUrl ? (
                <img
                  src={yo.fotoUrl}
                  alt={yo.nombre}
                  referrerPolicy="no-referrer"
                  className="h-20 w-20 rounded-full object-cover border-4 border-white shadow-md bg-white"
                />
              ) : (
                <div className="h-20 w-20 rounded-full bg-[#0e2045] text-white flex items-center justify-center border-4 border-white shadow-md text-xl font-bold uppercase">
                  {iniciales || 'UL'}
                </div>
              )}
            </div>
          </div>

          <div className="pt-12 px-6 pb-6 space-y-5 text-center lg:text-left">
            <div className="pt-2">
              <h2 className="text-lg font-bold text-[#1b1c1e] leading-snug">
                {yo.nombre}
              </h2>
              <p className="text-xs text-slate-500 truncate mt-0.5">{yo.correo}</p>
            </div>

            <div className="flex flex-wrap justify-center lg:justify-start gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-semibold text-emerald-700">
                <BadgeCheck className="h-3.5 w-3.5" />
                Acceso Aprobado
              </span>
            </div>

            <div className="border-t border-slate-100 pt-4 space-y-3 text-xs">
              <div className="flex items-center justify-between text-slate-600">
                <span className="flex items-center gap-1.5 font-medium text-slate-500">
                  <Mail className="h-3.5 w-3.5 text-slate-400" />
                  Autenticación
                </span>
                <span className="font-semibold text-[#1c355e]">Google OAuth</span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span className="flex items-center gap-1.5 font-medium text-slate-500">
                  <Building2 className="h-3.5 w-3.5 text-slate-400" />
                  Institución
                </span>
                <span className="font-semibold text-slate-700">Universidad Latino</span>
              </div>
            </div>
          </div>
        </div>

        {/* Columna derecha: Edición de nombre y Zona de Peligro */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl border border-[#c5c6cf]/40 shadow-sm p-6 sm:p-8">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4 mb-6">
              <div className="h-10 w-10 rounded-xl bg-[#244275]/10 text-[#244275] flex items-center justify-center shrink-0">
                <User className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#1c355e]">
                  Información Personal
                </h3>
                <p className="text-xs text-slate-500">
                  Modifica cómo aparece tu nombre en las reservaciones y en la barra superior
                </p>
              </div>
            </div>

            <form onSubmit={manejarGuardar} className="space-y-5">
              <div>
                <label
                  htmlFor="perfil-nombre"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5"
                >
                  Nombre completo
                </label>
                <input
                  id="perfil-nombre"
                  type="text"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  required
                  minLength={2}
                  maxLength={150}
                  placeholder="Ej. Mtra. Ana Sofía López Hernández"
                  className="w-full rounded-xl border border-[#c5c6cf] bg-white px-4 py-2.5 text-sm text-[#1b1c1e] shadow-sm transition focus:border-[#244275] focus:outline-none focus:ring-2 focus:ring-[#244275]/20"
                />
              </div>

              <div>
                <label
                  htmlFor="perfil-correo"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5"
                >
                  Correo institucional
                </label>
                <input
                  id="perfil-correo"
                  type="email"
                  value={yo.correo}
                  disabled
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-500 cursor-not-allowed"
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  Vinculado a tu cuenta de Google (no editable).
                </p>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={
                    actualizarPerfilMut.isPending ||
                    nombre.trim().length < 2 ||
                    nombre.trim() === yo.nombre.trim()
                  }
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#fdbb11] to-[#e8a906] px-6 py-2.5 text-sm font-black text-[#0e2045] shadow-md shadow-[#fdbb11]/20 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  <span>
                    {actualizarPerfilMut.isPending ? 'Guardando...' : 'Guardar Nombre'}
                  </span>
                </button>
              </div>
            </form>
          </div>

          {/* Zona de peligro: Eliminar Cuenta */}
          <div className="bg-white rounded-2xl border border-rose-200/80 shadow-sm p-6 sm:p-7">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-rose-700 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0" />
                  Eliminar cuenta
                </h3>
                <p className="text-xs text-slate-600 mt-1 max-w-xl leading-relaxed">
                  Al eliminar tu cuenta, se cerrará tu sesión de forma inmediata y se removerán tus credenciales de acceso a SIPREF Reservas. Para volver a ingresar, deberás solicitar acceso nuevamente a un administrador.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setMostrarModalEliminar(true)}
                className="shrink-0 self-start sm:self-center inline-flex items-center gap-2 rounded-xl border border-rose-300 bg-rose-50 px-4 py-2 text-xs font-bold text-rose-700 transition hover:bg-rose-100"
              >
                <Trash2 className="h-4 w-4" />
                <span>Eliminar cuenta</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modal de confirmación para eliminar cuenta */}
      {mostrarModalEliminar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-100 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="h-10 w-10 rounded-full bg-rose-100 flex items-center justify-center shrink-0">
                <Trash2 className="h-5 w-5" />
              </div>
              <h4 className="text-lg font-bold text-[#1b1c1e]">¿Eliminar tu cuenta?</h4>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Esta acción es permanente. Perderás el acceso de sesión a SIPREF Reservas y deberás solicitar una nueva autorización para volver a ingresar.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setMostrarModalEliminar(false)}
                disabled={eliminarCuentaMut.isPending}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={manejarEliminarCuenta}
                disabled={eliminarCuentaMut.isPending}
                className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-rose-700 disabled:opacity-50"
              >
                {eliminarCuentaMut.isPending ? 'Eliminando...' : 'Sí, eliminar cuenta'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

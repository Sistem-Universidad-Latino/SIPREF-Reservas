import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  Armchair,
  ArrowLeft,
  Bell,
  Building2,
  CalendarCheck,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Clock,
  Loader2,
  Mail,
  Package,
  Pencil,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  User,
  X,
} from 'lucide-react';
import {
  consultarDisponibilidad,
  useAcomodos,
  useActualizarAcomodo,
  useConfiguracion,
  useCrearAcomodo,
  useCrearRecurso,
  useCrearReservacion,
  useEliminarAcomodo,
  useEliminarRecurso,
  useEliminarRecursosLote,
  useEspacios,
  usePlantillasEvento,
  useRecursos,
  useRecursosPredefinidosInactivos,
  useRestaurarRecursosPredefinidos,
  useYo,
} from '../api/consultas';
import { esApiError, mensajeDeError } from '../api/cliente';
import type {
  Acomodo,
  Conflicto,
  DisponibilidadRespuesta,
  PlantillaEvento,
  Recurso,
  UnidadAnticipacion,
} from '../api/tipos';
import { Modal } from '../componentes/Modal';
import { ModalPlantillaEvento } from '../componentes/ModalPlantillaEvento';
import { StepperCantidad } from '../componentes/StepperCantidad';
import {
  esEspacioExclusivoReservas,
  OPCIONES_UNIDAD_ANTICIPACION,
} from '../utilidades/catalogos';
import {
  calcularDuracion,
  construirIsoMexico,
  extraerFechaMexico,
  formatearRangoHorario,
  sumarDiasYmd,
} from '../utilidades/fechas';
import {
  MAX_RECORDATORIOS,
  convertirFilasRecordatorios,
  crearFilaRecordatorioPorDefecto,
  type FilaRecordatorio,
} from '../utilidades/recordatorios';
import { useToast } from '../componentes/Toast';

const LABEL_CLASS =
  'block text-[11px] font-bold text-[#1c355e] uppercase tracking-wider mb-1.5';
const INPUT_CLASS =
  'w-full px-3.5 py-2.5 bg-slate-50/80 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 placeholder:text-slate-400 placeholder:font-normal focus:bg-white focus:border-[#1c355e] focus:ring-4 focus:ring-[#1c355e]/10 outline-none transition-all';

export function PaginaNuevaReservacion() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();

  const { data: yo } = useYo();
  const { data: config } = useConfiguracion();
  const { data: espaciosRaw = [] } = useEspacios(true);
  const espacios = useMemo(
    () => espaciosRaw.filter(esEspacioExclusivoReservas),
    [espaciosRaw],
  );
  const { data: recursosCatalogo = [] } = useRecursos();
  const { data: estadoPredefinidos } = useRecursosPredefinidosInactivos();
  const { data: acomodosCatalogo = [] } = useAcomodos();
  const { data: plantillasEvento = [] } = usePlantillasEvento();

  const crearRecursoMut = useCrearRecurso();
  const eliminarRecursoMut = useEliminarRecurso();
  const eliminarLoteMut = useEliminarRecursosLote();
  const restaurarPredefinidosMut = useRestaurarRecursosPredefinidos();
  const crearAcomodoMut = useCrearAcomodo();
  const actualizarAcomodoMut = useActualizarAcomodo();
  const eliminarAcomodoMut = useEliminarAcomodo();
  const crearReservacionMut = useCrearReservacion();

  const hoyYmd = useMemo(() => extraerFechaMexico(new Date()), []);

  const fechaPorDefecto = useMemo(() => {
    const param = searchParams.get('fecha');
    if (param && /^\d{4}-\d{2}-\d{2}$/.test(param) && param >= hoyYmd) {
      return param;
    }
    return sumarDiasYmd(hoyYmd, 1);
  }, [searchParams, hoyYmd]);

  // Campos principales del formulario
  const [tipoEvento, setTipoEvento] = useState<string>('');
  const [espacioId, setEspacioId] = useState<string>('');
  const [nombreEvento, setNombreEvento] = useState<string>('');
  const [fecha, setFecha] = useState<string>(fechaPorDefecto);
  const [horaInicio, setHoraInicio] = useState<string>('10:00');
  const [horaFin, setHoraFin] = useState<string>('12:30');
  const [responsable, setResponsable] = useState<string>('');
  const [correoResponsable, setCorreoResponsable] = useState<string>('');
  const [descripcion, setDescripcion] = useState<string>('');

  const prefillInicialRef = useRef(false);

  // Prellenar responsable y correo con el usuario autenticado una sola vez al cargar
  useEffect(() => {
    if (yo && !prefillInicialRef.current) {
      prefillInicialRef.current = true;
      setResponsable((prev) => prev || yo.nombre);
      setCorreoResponsable((prev) => prev || yo.correo);
    }
  }, [yo]);

  useEffect(() => {
    if (!espacioId && espacios.length > 0) {
      setEspacioId(espacios[0].id);
    }
  }, [espacios, espacioId]);

  // Plantillas de evento con materiales predeterminados
  const [plantillaSeleccionadaId, setPlantillaSeleccionadaId] = useState<string>('');
  const [modalPlantillaAbierto, setModalPlantillaAbierto] = useState(false);
  const [plantillaAEditar, setPlantillaAEditar] = useState<PlantillaEvento | null>(null);

  // Materiales y equipo seleccionados: mapa recursoId -> cantidad
  const [materialesDesplegados, setMaterialesDesplegados] = useState(false);
  const [recursosSeleccionados, setRecursosSeleccionados] = useState<Record<number, number>>({});
  const [mostrarAgregarMaterial, setMostrarAgregarMaterial] = useState(false);
  const [nuevoMaterialNombre, setNuevoMaterialNombre] = useState('');
  const [nuevoMaterialRequiereCantidad, setNuevoMaterialRequiereCantidad] = useState(true);
  const [errorNuevoMaterial, setErrorNuevoMaterial] = useState<string | null>(null);
  const [materialAEliminar, setMaterialAEliminar] = useState<Recurso | null>(null);
  const [modoSeleccionEliminar, setModoSeleccionEliminar] = useState(false);
  const [idsEliminarLote, setIdsEliminarLote] = useState<number[]>([]);
  const [acomodoMobiliario, setAcomodoMobiliario] = useState<string>('');
  const [sillasMesaPanel, setSillasMesaPanel] = useState<number>(0);
  const [editandoAcomodos, setEditandoAcomodos] = useState(false);
  const [nuevoAcomodoNombre, setNuevoAcomodoNombre] = useState('');
  const [acomodoEnEdicion, setAcomodoEnEdicion] = useState<Acomodo | null>(null);

  // Recordatorios: por defecto 1 fila con SIPREF implícito y Correo
  const [filasRecordatorios, setFilasRecordatorios] = useState<FilaRecordatorio[]>([
    crearFilaRecordatorioPorDefecto('fila-inicial'),
  ]);

  // Disponibilidad en vivo y errores
  const [disponibilidad, setDisponibilidad] = useState<DisponibilidadRespuesta | null>(null);
  const [verificandoDisponibilidad, setVerificandoDisponibilidad] = useState(false);
  const [conflictosEnvio, setConflictosEnvio] = useState<Conflicto[]>([]);
  const [erroresCampo, setErroresCampo] = useState<Record<string, string>>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);

  const espacioActual = useMemo(
    () => espacios.find((e) => e.id === espacioId) ?? null,
    [espacios, espacioId],
  );

  const duracion = useMemo(
    () => calcularDuracion(horaInicio, horaFin),
    [horaInicio, horaFin],
  );

  const esFechaHoraPasada = useMemo(() => {
    if (!fecha || !horaInicio) return false;
    const inicioDate = new Date(construirIsoMexico(fecha, horaInicio));
    if (Number.isNaN(inicioDate.getTime())) return false;
    return inicioDate.getTime() <= Date.now();
  }, [fecha, horaInicio]);

  // Verificación de disponibilidad con debounce (300 ms)
  useEffect(() => {
    setConflictosEnvio([]);
    setErrorGeneral(null);
    if (!espacioId || !fecha || !duracion.valida || esFechaHoraPasada) {
      setDisponibilidad(null);
      setVerificandoDisponibilidad(false);
      return;
    }

    const controlador = new AbortController();
    const timer = window.setTimeout(async () => {
      setVerificandoDisponibilidad(true);
      try {
        const res = await consultarDisponibilidad(
          {
            espacioId,
            inicio: construirIsoMexico(fecha, horaInicio),
            fin: construirIsoMexico(fecha, horaFin),
          },
          controlador.signal,
        );
        setDisponibilidad(res);
      } catch {
        // Ignorar abortos
      } finally {
        setVerificandoDisponibilidad(false);
      }
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controlador.abort();
    };
  }, [espacioId, fecha, horaInicio, horaFin, duracion.valida, esFechaHoraPasada]);

  const plantillaActual = useMemo(
    () =>
      plantillasEvento.find((p) => String(p.id) === plantillaSeleccionadaId) ?? null,
    [plantillasEvento, plantillaSeleccionadaId],
  );

  const aplicarPlantilla = (plantilla: PlantillaEvento) => {
    setPlantillaSeleccionadaId(String(plantilla.id));
    setNombreEvento(plantilla.nombre);
    if (plantilla.tipoEvento) {
      setTipoEvento(plantilla.tipoEvento);
    } else if (!tipoEvento.trim()) {
      setTipoEvento(plantilla.nombre);
    }
    const mapa: Record<number, number> = {};
    for (const r of plantilla.recursos) {
      mapa[r.recursoId] = r.cantidad;
    }
    setRecursosSeleccionados(mapa);
    setErroresCampo((p) => ({ ...p, nombreEvento: '', tipoEvento: '' }));
    toast.exito(
      `Plantilla "${plantilla.nombre}" aplicada (${plantilla.recursos.length} materiales)`,
    );
  };

  const alternarMaterial = (recursoId: number, marcado: boolean) => {
    setRecursosSeleccionados((prev) => {
      const copia = { ...prev };
      if (marcado) {
        copia[recursoId] = copia[recursoId] ?? 1;
      } else {
        delete copia[recursoId];
      }
      return copia;
    });
  };

  const cambiarCantidadMaterial = (recursoId: number, cantidad: number) => {
    setRecursosSeleccionados((prev) => ({
      ...prev,
      [recursoId]: Math.max(1, Math.floor(cantidad || 1)),
    }));
  };

  const manejarGuardarMaterial = async () => {
    const nombreLimpio = nuevoMaterialNombre.trim();
    if (!nombreLimpio) {
      setErrorNuevoMaterial('Escribe el nombre del material.');
      return;
    }
    setErrorNuevoMaterial(null);
    try {
      const creado = await crearRecursoMut.mutateAsync({
        nombre: nombreLimpio,
        unidad: nuevoMaterialRequiereCantidad ? 'pieza' : 'sin_cantidad',
      });
      setRecursosSeleccionados((prev) => ({ ...prev, [creado.id]: 1 }));
      setNuevoMaterialNombre('');
      setNuevoMaterialRequiereCantidad(true);
      setMostrarAgregarMaterial(false);
      toast.exito('Material agregado al catálogo');
    } catch (err) {
      setErrorNuevoMaterial(mensajeDeError(err));
    }
  };

  const manejarConfirmarEliminarMaterial = async () => {
    if (!materialAEliminar) return;
    const idEliminar = materialAEliminar.id;
    try {
      await eliminarRecursoMut.mutateAsync(idEliminar);
      setRecursosSeleccionados((prev) => {
        const copia = { ...prev };
        delete copia[idEliminar];
        return copia;
      });
      setMaterialAEliminar(null);
      toast.exito('Material eliminado del catálogo');
    } catch (err) {
      toast.error(mensajeDeError(err));
    }
  };

  const alternarIdEliminarLote = (id: number) => {
    setIdsEliminarLote((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const manejarEliminarLote = async () => {
    if (idsEliminarLote.length === 0) return;
    try {
      await eliminarLoteMut.mutateAsync(idsEliminarLote);
      setRecursosSeleccionados((prev) => {
        const copia = { ...prev };
        for (const id of idsEliminarLote) delete copia[id];
        return copia;
      });
      setIdsEliminarLote([]);
      setModoSeleccionEliminar(false);
      toast.exito('Materiales eliminados del catálogo');
    } catch (err) {
      toast.error(mensajeDeError(err));
    }
  };

  const manejarRestaurarPredefinidos = async () => {
    try {
      await restaurarPredefinidosMut.mutateAsync();
      toast.exito('Materiales predefinidos restaurados');
    } catch (err) {
      toast.error(mensajeDeError(err));
    }
  };

  const manejarGuardarAcomodo = async () => {
    const nombreLimpio = nuevoAcomodoNombre.trim();
    if (!nombreLimpio) return;
    try {
      if (acomodoEnEdicion) {
        const actualizado = await actualizarAcomodoMut.mutateAsync({
          id: acomodoEnEdicion.id,
          nombre: nombreLimpio,
        });
        if (acomodoMobiliario === acomodoEnEdicion.nombre) {
          setAcomodoMobiliario(actualizado.nombre);
        }
        setAcomodoEnEdicion(null);
        toast.exito('Opción de acomodo actualizada');
      } else {
        await crearAcomodoMut.mutateAsync(nombreLimpio);
        toast.exito('Opción de acomodo agregada');
      }
      setNuevoAcomodoNombre('');
    } catch (err) {
      toast.error(mensajeDeError(err));
    }
  };

  const manejarEliminarAcomodo = async (ac: Acomodo) => {
    try {
      await eliminarAcomodoMut.mutateAsync(ac.id);
      if (acomodoMobiliario === ac.nombre) setAcomodoMobiliario('');
      if (acomodoEnEdicion?.id === ac.id) {
        setAcomodoEnEdicion(null);
        setNuevoAcomodoNombre('');
      }
      toast.exito('Opción de acomodo eliminada');
    } catch (err) {
      toast.error(mensajeDeError(err));
    }
  };

  const cantidadMaterialesSeleccionados = Object.keys(recursosSeleccionados).length;

  const resumenMaterialesTexto = useMemo(() => {
    const partes = recursosCatalogo
      .filter((r) => recursosSeleccionados[r.id] !== undefined)
      .map((r) => `${recursosSeleccionados[r.id]} ${r.nombre.toLowerCase()}`);
    if (sillasMesaPanel > 0) {
      partes.push(`${sillasMesaPanel} sillas mesa panel`);
    }
    if (acomodoMobiliario.trim()) {
      partes.push(`Acomodo: ${acomodoMobiliario.trim()}`);
    }
    return partes.length > 0 ? partes.join(' • ') : 'Ningún material seleccionado';
  }, [recursosCatalogo, recursosSeleccionados, sillasMesaPanel, acomodoMobiliario]);

  const agregarFilaRecordatorio = () => {
    setFilasRecordatorios((prev) => [
      ...prev,
      {
        id: `fila-${Date.now()}-${prev.length}`,
        sipref: false,
        correo: true,
        anticipacion: 30,
        unidad: 'MINUTOS',
      },
    ]);
  };

  const actualizarFilaRecordatorio = (
    id: string,
    parcial: Partial<FilaRecordatorio>,
  ) => {
    setFilasRecordatorios((prev) =>
      prev.map((f) => (f.id === id ? { ...f, ...parcial } : f)),
    );
  };

  const eliminarFilaRecordatorio = (id: string) => {
    setFilasRecordatorios((prev) => prev.filter((f) => f.id !== id));
  };

  const recordatoriosPayload = useMemo(
    () => convertirFilasRecordatorios(filasRecordatorios),
    [filasRecordatorios],
  );

  const manejarLimpiarTodo = () => {
    setPlantillaSeleccionadaId('');
    setTipoEvento('');
    setNombreEvento('');
    setEspacioId(espacios[0]?.id ?? '');
    setFecha(fechaPorDefecto);
    setHoraInicio('10:00');
    setHoraFin('12:30');
    setResponsable('');
    setCorreoResponsable('');
    setDescripcion('');
    setRecursosSeleccionados({});
    setMostrarAgregarMaterial(false);
    setNuevoMaterialNombre('');
    setNuevoMaterialRequiereCantidad(true);
    setErrorNuevoMaterial(null);
    setAcomodoMobiliario('');
    setSillasMesaPanel(0);
    setModoSeleccionEliminar(false);
    setIdsEliminarLote([]);
    setEditandoAcomodos(false);
    setAcomodoEnEdicion(null);
    setNuevoAcomodoNombre('');
    setFilasRecordatorios([crearFilaRecordatorioPorDefecto('fila-inicial')]);
    setErroresCampo({});
    setErrorGeneral(null);
    setConflictosEnvio([]);
    toast.exito('Formulario limpiado');
  };

  const manejarSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErroresCampo({});
    setErrorGeneral(null);
    setConflictosEnvio([]);

    const nuevosErrores: Record<string, string> = {};
    if (!tipoEvento.trim()) {
      nuevosErrores.tipoEvento = 'Ingresa el tipo de evento.';
    }
    if (!nombreEvento.trim()) {
      nuevosErrores.nombreEvento = 'Ingresa el nombre del evento.';
    }
    if (!espacioId) {
      nuevosErrores.espacioId = 'Selecciona un aula o espacio.';
    }
    if (esFechaHoraPasada) {
      nuevosErrores.inicio = 'La fecha y hora de inicio deben estar en el futuro.';
    }
    if (!duracion.valida) {
      nuevosErrores.fin = duracion.texto;
    }
    if (!responsable.trim()) {
      nuevosErrores.responsable = 'Ingresa el nombre del responsable.';
    }
    if (!correoResponsable.trim() || !correoResponsable.includes('@')) {
      nuevosErrores.correoResponsable = 'Ingresa un correo electrónico válido.';
    }
    if (recordatoriosPayload.length > MAX_RECORDATORIOS) {
      nuevosErrores.recordatorios = `Puedes configurar hasta ${MAX_RECORDATORIOS} envíos de recordatorio en total.`;
    }

    if (Object.keys(nuevosErrores).length > 0) {
      setErroresCampo(nuevosErrores);
      setErrorGeneral('Por favor corrige los campos señalados antes de continuar.');
      return;
    }

    const recursosPayload = Object.entries(recursosSeleccionados).map(([idStr, cant]) => ({
      recursoId: Number(idStr),
      cantidad: cant,
    }));

    try {
      await crearReservacionMut.mutateAsync({
        tipoEvento: tipoEvento.trim(),
        espacioId,
        nombreEvento: nombreEvento.trim(),
        inicio: construirIsoMexico(fecha, horaInicio),
        fin: construirIsoMexico(fecha, horaFin),
        responsable: responsable.trim(),
        correoResponsable: correoResponsable.trim(),
        descripcion: descripcion.trim(),
        observaciones: '',
        asistentesEstimados: null,
        acomodoMobiliario: acomodoMobiliario.trim(),
        sillasMesaPanel,
        recursos: recursosPayload,
        recordatorios: recordatoriosPayload,
      });

      toast.exito('Evento agendado correctamente');
      navigate(`/calendario?fecha=${fecha}`);
    } catch (err) {
      if (esApiError(err)) {
        if (err.status === 400 && Object.keys(err.campos).length > 0) {
          setErroresCampo(err.campos);
        }
        if (err.status === 409 && err.codigo === 'CONFLICTO_HORARIO') {
          const conf = (err.detalles?.conflictos as Conflicto[] | undefined) ?? [];
          setConflictosEnvio(conf);
        }
        setErrorGeneral(err.message);
      } else {
        setErrorGeneral(mensajeDeError(err));
      }
    }
  };

  const bufferMinutos = disponibilidad?.bufferMinutos ?? config?.bufferMinutos ?? 15;
  const conflictosActivos =
    conflictosEnvio.length > 0 ? conflictosEnvio : (disponibilidad?.conflictos ?? []);
  const limiteRecordatoriosAlcanzado =
    filasRecordatorios.length >= MAX_RECORDATORIOS ||
    recordatoriosPayload.length >= MAX_RECORDATORIOS;
  const aulaDisponible =
    !verificandoDisponibilidad &&
    !esFechaHoraPasada &&
    !errorGeneral &&
    Boolean(disponibilidad?.disponible) &&
    duracion.valida &&
    conflictosActivos.length === 0;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Encabezado superior */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-[#1c355e] text-[#fdbb11] flex items-center justify-center shadow-md shadow-[#1c355e]/15 shrink-0">
            <CalendarCheck className="w-5 h-5" />
          </div>
          <div>
            <Link
              to="/calendario"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-[#1c355e] transition-colors mb-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Volver al calendario</span>
            </Link>
            <h1 className="text-xl sm:text-2xl font-extrabold text-[#1c355e] tracking-tight leading-tight">
              Agendar Evento
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 font-medium mt-0.5">
              Reserva de espacios para conferencias, juntas y exámenes en SIPREF
            </p>
          </div>
        </div>

        {duracion.valida && (
          <div className="inline-flex items-center gap-2 self-start sm:self-center bg-white border border-slate-200/80 rounded-full px-4 py-2 shadow-sm">
            <Clock className="w-4 h-4 text-[#1c355e]" />
            <span className="text-xs font-bold text-slate-600">
              Duración: <span className="text-[#1c355e]">{duracion.texto}</span>
            </span>
          </div>
        )}
      </div>

      {/* Contenido en 2 columnas en escritorio */}
      <form
        onSubmit={manejarSubmit}
        noValidate
        className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start"
      >
        {/* Columna izquierda: Datos del formulario */}
        <div className="lg:col-span-8 bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-200/80 space-y-6">
          {/* Bloque 1: Información del evento */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 pb-2.5 border-b border-slate-100">
              <Building2 className="w-4 h-4 text-[#1c355e]" />
              <h2 className="text-xs font-extrabold uppercase tracking-wider text-[#1c355e]">
                Información del evento y espacio
              </h2>
            </div>

            {/* Selector rápido de evento predefinido (plantilla con materiales) */}
            <div className="rounded-2xl border border-[#1c355e]/15 bg-gradient-to-r from-[#1c355e]/[0.03] via-slate-50/80 to-[#fdbb11]/[0.07] p-3.5 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-[#1c355e] text-[#fdbb11] shadow-2xs shrink-0">
                    <Sparkles className="w-3.5 h-3.5" />
                  </span>
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#1c355e]">
                    Plantilla rápida de evento
                  </span>
                </div>
                <span className="hidden sm:inline text-[11px] font-medium text-slate-500">
                  Prellena nombre, tipo y materiales
                </span>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <select
                  aria-label="Evento predefinido con materiales"
                  value={plantillaSeleccionadaId}
                  onChange={(e) => {
                    const val = e.target.value;
                    setPlantillaSeleccionadaId(val);
                    const encontrada = plantillasEvento.find((p) => String(p.id) === val);
                    if (encontrada) aplicarPlantilla(encontrada);
                  }}
                  className="flex-1 min-w-0 px-3.5 py-2 bg-white border border-slate-200/90 rounded-xl text-xs font-semibold text-slate-700 shadow-2xs outline-none focus:border-[#1c355e] focus:ring-4 focus:ring-[#1c355e]/10 transition-all cursor-pointer"
                >
                  <option value="">Evento personalizado (o elige una plantilla...)</option>
                  {plantillasEvento.map((p) => (
                    <option key={p.id} value={String(p.id)}>
                      {p.nombre} ({p.recursos.length} materiales)
                    </option>
                  ))}
                </select>

                <div className="flex items-center gap-2 shrink-0">
                  {plantillaActual && (
                    <button
                      type="button"
                      onClick={() => {
                        setPlantillaAEditar(plantillaActual);
                        setModalPlantillaAbierto(true);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-3 py-2 text-xs font-bold text-[#1c355e] shadow-2xs transition-colors cursor-pointer"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span>Editar</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setPlantillaAEditar(null);
                      setModalPlantillaAbierto(true);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#1c355e] hover:bg-[#152847] px-3.5 py-2 text-xs font-bold text-white shadow-2xs transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 text-[#fdbb11]" />
                    <span>Nueva plantilla</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="campo-tipo-evento" className={LABEL_CLASS}>
                  TIPO DE EVENTO *
                </label>
                <input
                  id="campo-tipo-evento"
                  type="text"
                  value={tipoEvento}
                  onChange={(e) => {
                    setTipoEvento(e.target.value);
                    if (erroresCampo.tipoEvento) {
                      setErroresCampo((p) => ({ ...p, tipoEvento: '' }));
                    }
                  }}
                  placeholder="Ej. Conferencia, Junta, Examen, Taller..."
                  className={INPUT_CLASS}
                  required
                />
                {erroresCampo.tipoEvento && (
                  <p className="mt-1 text-xs font-semibold text-red-600">
                    {erroresCampo.tipoEvento}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="campo-espacio" className={LABEL_CLASS}>
                  AULA / ESPACIO *
                </label>
                <select
                  id="campo-espacio"
                  value={espacioId}
                  onChange={(e) => setEspacioId(e.target.value)}
                  className={INPUT_CLASS}
                  required
                >
                  {espacios.map((esp) => (
                    <option key={esp.id} value={esp.id}>
                      {esp.nombre} {esp.edificio ? `(${esp.edificio})` : ''}
                    </option>
                  ))}
                </select>
                {erroresCampo.espacioId && (
                  <p className="mt-1 text-xs font-semibold text-red-600">
                    {erroresCampo.espacioId}
                  </p>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="campo-nombre-evento" className={LABEL_CLASS}>
                NOMBRE DEL EVENTO *
              </label>
              <input
                id="campo-nombre-evento"
                type="text"
                value={nombreEvento}
                onChange={(e) => {
                  setNombreEvento(e.target.value);
                  if (erroresCampo.nombreEvento) {
                    setErroresCampo((p) => ({ ...p, nombreEvento: '' }));
                  }
                }}
                placeholder="Ej. Conferencia Magistral de Ingeniería de Software"
                className={INPUT_CLASS}
                required
              />
              {erroresCampo.nombreEvento && (
                <p className="mt-1 text-xs font-semibold text-red-600">
                  {erroresCampo.nombreEvento}
                </p>
              )}
            </div>
          </div>

          {/* Bloque 2: Fecha y horario */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 pb-2.5 border-b border-slate-100">
              <CalendarClock className="w-4 h-4 text-[#1c355e]" />
              <h2 className="text-xs font-extrabold uppercase tracking-wider text-[#1c355e]">
                Fecha y horario
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label htmlFor="campo-fecha" className={LABEL_CLASS}>
                  FECHA *
                </label>
                <input
                  id="campo-fecha"
                  type="date"
                  min={hoyYmd}
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  className={INPUT_CLASS}
                  required
                />
              </div>

              <div>
                <label htmlFor="campo-hora-inicio" className={LABEL_CLASS}>
                  HORA INICIO *
                </label>
                <input
                  id="campo-hora-inicio"
                  type="time"
                  value={horaInicio}
                  onChange={(e) => setHoraInicio(e.target.value)}
                  className={INPUT_CLASS}
                  required
                />
                {erroresCampo.inicio && (
                  <p className="mt-1 text-xs font-semibold text-red-600">
                    {erroresCampo.inicio}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="campo-hora-fin" className={LABEL_CLASS}>
                  HORA FIN *
                </label>
                <input
                  id="campo-hora-fin"
                  type="time"
                  value={horaFin}
                  onChange={(e) => setHoraFin(e.target.value)}
                  className={INPUT_CLASS}
                  required
                />
                {(erroresCampo.fin || !duracion.valida) && (
                  <p className="mt-1 text-xs font-semibold text-red-600">
                    {erroresCampo.fin ?? duracion.texto}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Bloque 3: Responsable y detalles */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 pb-2.5 border-b border-slate-100">
              <User className="w-4 h-4 text-[#1c355e]" />
              <h2 className="text-xs font-extrabold uppercase tracking-wider text-[#1c355e]">
                Responsable y descripción
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="campo-responsable" className={LABEL_CLASS}>
                  RESPONSABLE DEL EVENTO *
                </label>
                <input
                  id="campo-responsable"
                  type="text"
                  value={responsable}
                  onChange={(e) => setResponsable(e.target.value)}
                  placeholder="Ej. Dr. Juan Pérez"
                  className={INPUT_CLASS}
                  required
                />
                {erroresCampo.responsable && (
                  <p className="mt-1 text-xs font-semibold text-red-600">
                    {erroresCampo.responsable}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="campo-correo-responsable" className={LABEL_CLASS}>
                  CORREO ELECTRÓNICO (PARA AVISO) *
                </label>
                <div className="relative">
                  <input
                    id="campo-correo-responsable"
                    type="email"
                    value={correoResponsable}
                    onChange={(e) => setCorreoResponsable(e.target.value)}
                    placeholder="ejemplo@correo.com"
                    className={`${INPUT_CLASS} pr-9`}
                    required
                  />
                  <Mail className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
                {erroresCampo.correoResponsable && (
                  <p className="mt-1 text-xs font-semibold text-red-600">
                    {erroresCampo.correoResponsable}
                  </p>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="campo-descripcion" className={LABEL_CLASS}>
                DESCRIPCIÓN DEL EVENTO (OPCIONAL)
              </label>
              <textarea
                id="campo-descripcion"
                rows={3}
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Detalles sobre proyector, micrófonos, asistentes previstos, etc."
                className={`${INPUT_CLASS} resize-none`}
              />
            </div>
          </div>

          {/* Bloque 4: Materiales y equipo (acordeón desplegable) */}
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80 space-y-3">
            <button
              type="button"
              onClick={() => setMaterialesDesplegados((v) => !v)}
              aria-expanded={materialesDesplegados}
              className="w-full flex items-start justify-between gap-3 text-left cursor-pointer"
            >
              <div>
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-[#1c355e] shrink-0" />
                  <h2 className="text-xs font-bold uppercase tracking-wider text-[#1c355e]">
                    MATERIALES Y EQUIPO
                  </h2>
                </div>
                <p className="mt-1 text-xs text-slate-500 font-medium">
                  Marca el equipo y mobiliario que se utilizará en el evento
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className="inline-flex items-center rounded-full bg-[#fdbb11]/25 border border-[#fdbb11]/60 px-2.5 py-0.5 text-[11px] font-extrabold text-[#1c355e]">
                  {cantidadMaterialesSeleccionados}{' '}
                  {cantidadMaterialesSeleccionados === 1 ? 'seleccionado' : 'seleccionados'}
                </span>
                <ChevronDown
                  className={`w-4 h-4 text-[#1c355e] transition-transform duration-200 ${
                    materialesDesplegados ? 'rotate-180' : ''
                  }`}
                />
              </div>
            </button>

            {materialesDesplegados && (
              <div className="space-y-3 pt-2 border-t border-slate-200/70">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {recursosCatalogo.map((rec) => {
                    const seleccionado = recursosSeleccionados[rec.id] !== undefined;
                    const marcadoEliminar = idsEliminarLote.includes(rec.id);
                    const cantidad = recursosSeleccionados[rec.id] ?? 1;
                    const esFijo = rec.unidad === 'fijo';
                    const requiereCantidad = rec.unidad !== 'sin_cantidad' && !esFijo;

                    return (
                      <div
                        key={rec.id}
                        className={`flex items-center justify-between gap-2 rounded-xl border p-2.5 transition-all ${
                          modoSeleccionEliminar
                            ? marcadoEliminar
                              ? 'border-rose-400 bg-rose-50/70 shadow-xs'
                              : 'border-rose-200/80 bg-white/80 hover:bg-rose-50/30'
                            : seleccionado
                              ? 'border-[#1c355e]/40 bg-white shadow-xs'
                              : 'border-slate-200 bg-white/80 hover:bg-white'
                        }`}
                      >
                        <label className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={modoSeleccionEliminar ? marcadoEliminar : seleccionado}
                            onChange={(e) => {
                              if (modoSeleccionEliminar) {
                                alternarIdEliminarLote(rec.id);
                              } else {
                                alternarMaterial(rec.id, e.target.checked);
                              }
                            }}
                            className={`rounded focus:ring-2 shrink-0 ${
                              modoSeleccionEliminar
                                ? 'border-rose-300 text-rose-600 focus:ring-rose-200'
                                : 'border-slate-300 text-[#1c355e] focus:ring-[#1c355e]/20'
                            }`}
                          />
                          <span className="text-xs font-semibold text-slate-800 truncate">
                            {rec.nombre}
                          </span>
                          {esFijo && (
                            <span className="inline-flex items-center rounded-full bg-slate-200/80 px-2 py-0.5 text-[10px] font-bold text-slate-600 shrink-0">
                              Fijo en aula
                            </span>
                          )}
                        </label>

                        {!modoSeleccionEliminar && (
                          <div className="flex items-center gap-1.5 shrink-0">
                            {seleccionado && requiereCantidad && (
                              <StepperCantidad
                                valor={cantidad}
                                alCambiar={(n) => cambiarCantidadMaterial(rec.id, n)}
                                etiqueta={rec.nombre}
                              />
                            )}

                            <button
                              type="button"
                              onClick={() => setMaterialAEliminar(rec)}
                              aria-label={`Eliminar ${rec.nombre} del catálogo`}
                              title="Eliminar material del catálogo"
                              className="p-1 text-slate-400 hover:text-red-600 rounded-lg transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {!mostrarAgregarMaterial ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <div className="flex flex-wrap items-center gap-3">
                      {!modoSeleccionEliminar && (
                        <button
                          type="button"
                          onClick={() => setMostrarAgregarMaterial(true)}
                          className="inline-flex items-center gap-1 text-xs font-bold text-[#1c355e] hover:underline cursor-pointer"
                        >
                          + Agregar otro material
                        </button>
                      )}
                      {estadoPredefinidos?.hayInactivos && !modoSeleccionEliminar && (
                        <button
                          type="button"
                          onClick={manejarRestaurarPredefinidos}
                          disabled={restaurarPredefinidosMut.isPending}
                          className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 hover:underline disabled:opacity-50 cursor-pointer"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Restaurar predefinidos</span>
                        </button>
                      )}
                    </div>

                    {!modoSeleccionEliminar ? (
                      <button
                        type="button"
                        onClick={() => {
                          setIdsEliminarLote([]);
                          setModoSeleccionEliminar(true);
                        }}
                        className="text-xs font-bold text-rose-600 hover:underline cursor-pointer"
                      >
                        Seleccionar para eliminar
                      </button>
                    ) : (
                      <div className="flex items-center gap-2 ml-auto">
                        <button
                          type="button"
                          onClick={() => {
                            setModoSeleccionEliminar(false);
                            setIdsEliminarLote([]);
                          }}
                          className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={manejarEliminarLote}
                          disabled={
                            idsEliminarLote.length === 0 || eliminarLoteMut.isPending
                          }
                          className="rounded-xl bg-rose-600 hover:bg-rose-700 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50 cursor-pointer"
                        >
                          {eliminarLoteMut.isPending
                            ? 'Eliminando...'
                            : `Eliminar seleccionados (${idsEliminarLote.length})`}
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-slate-200 bg-white p-3.5 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                      <div>
                        <label
                          htmlFor="campo-nuevo-material"
                          className="block text-[11px] font-bold text-[#1c355e] uppercase tracking-wider mb-1"
                        >
                          Nombre del material
                        </label>
                        <input
                          id="campo-nuevo-material"
                          type="text"
                          value={nuevoMaterialNombre}
                          onChange={(e) => setNuevoMaterialNombre(e.target.value)}
                          placeholder="Ej. Podium institucional"
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:bg-white focus:border-[#1c355e] focus:ring-2 focus:ring-[#1c355e]/15"
                        />
                      </div>

                      <div className="flex items-center justify-between sm:justify-start gap-3 pt-1 sm:pt-4">
                        <span className="text-xs font-semibold text-slate-700">
                          ¿Requiere cantidad?
                        </span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={nuevoMaterialRequiereCantidad}
                          onClick={() => setNuevoMaterialRequiereCantidad((v) => !v)}
                          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
                            nuevoMaterialRequiereCantidad ? 'bg-[#1c355e]' : 'bg-slate-300'
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition duration-200 ${
                              nuevoMaterialRequiereCantidad ? 'translate-x-5' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>
                    </div>

                    {errorNuevoMaterial && (
                      <p className="text-xs font-semibold text-red-600">{errorNuevoMaterial}</p>
                    )}

                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setMostrarAgregarMaterial(false);
                          setNuevoMaterialNombre('');
                          setErrorNuevoMaterial(null);
                        }}
                        className="rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={manejarGuardarMaterial}
                        disabled={crearRecursoMut.isPending}
                        className="rounded-xl bg-[#1c355e] hover:bg-[#152847] px-3.5 py-1.5 text-xs font-bold text-white disabled:opacity-60 cursor-pointer"
                      >
                        {crearRecursoMut.isPending ? 'Guardando...' : 'Guardar material'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Subtarjeta: Acomodo de mesas, sillas y mesa panel */}
            <div className="rounded-2xl border border-slate-200/90 bg-white p-3.5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Armchair className="w-4 h-4 text-[#1c355e] shrink-0" />
                  <h3 className="text-xs font-bold text-[#1c355e]">
                    Acomodo de mesas, sillas y mesa panel
                  </h3>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setEditandoAcomodos((v) => !v);
                    setAcomodoEnEdicion(null);
                    setNuevoAcomodoNombre('');
                  }}
                  className="text-[11px] font-bold text-[#1c355e] hover:underline cursor-pointer shrink-0"
                >
                  {editandoAcomodos ? 'Listo' : 'Editar / Eliminar opciones'}
                </button>
              </div>

              {/* Chips dinámicos desde GET /api/acomodos */}
              <div className="flex flex-wrap items-center gap-1.5">
                {acomodosCatalogo.map((ac) => {
                  const activo = acomodoMobiliario.trim() === ac.nombre;
                  if (editandoAcomodos) {
                    return (
                      <div
                        key={ac.id}
                        className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700"
                      >
                        <span>{ac.nombre}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setAcomodoEnEdicion(ac);
                            setNuevoAcomodoNombre(ac.nombre);
                          }}
                          title={`Renombrar ${ac.nombre}`}
                          className="text-[#1c355e] hover:text-[#152847] p-0.5 cursor-pointer"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => manejarEliminarAcomodo(ac)}
                          title={`Eliminar ${ac.nombre}`}
                          className="text-rose-500 hover:text-rose-700 p-0.5 cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  }

                  return (
                    <button
                      key={ac.id}
                      type="button"
                      onClick={() => setAcomodoMobiliario(activo ? '' : ac.nombre)}
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors cursor-pointer ${
                        activo
                          ? 'border-[#1c355e] bg-[#1c355e] text-white'
                          : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-[#1c355e]/40 hover:text-[#1c355e]'
                      }`}
                    >
                      {ac.nombre}
                    </button>
                  );
                })}
              </div>

              {editandoAcomodos && (
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                  <input
                    type="text"
                    value={nuevoAcomodoNombre}
                    onChange={(e) => setNuevoAcomodoNombre(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        manejarGuardarAcomodo();
                      }
                    }}
                    placeholder={
                      acomodoEnEdicion
                        ? `Nuevo nombre para "${acomodoEnEdicion.nombre}"`
                        : 'Nueva opción de acomodo (ej. Tipo Cocktail)'
                    }
                    className="flex-1 min-w-[180px] px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 outline-none focus:border-[#1c355e]"
                  />
                  <button
                    type="button"
                    onClick={manejarGuardarAcomodo}
                    disabled={crearAcomodoMut.isPending || actualizarAcomodoMut.isPending}
                    className="rounded-lg bg-[#1c355e] hover:bg-[#152847] px-3 py-1.5 text-xs font-bold text-white cursor-pointer disabled:opacity-50"
                  >
                    {acomodoEnEdicion ? 'Renombrar' : 'Agregar'}
                  </button>
                  {acomodoEnEdicion && (
                    <button
                      type="button"
                      onClick={() => {
                        setAcomodoEnEdicion(null);
                        setNuevoAcomodoNombre('');
                      }}
                      className="text-xs font-semibold text-slate-500 hover:underline cursor-pointer"
                    >
                      Cancelar
                    </button>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                <div className="sm:col-span-2">
                  <label
                    htmlFor="campo-acomodo-mobiliario"
                    className="block text-[11px] font-bold text-[#1c355e] uppercase tracking-wider mb-1"
                  >
                    ¿Cómo se acomodarán las mesas y sillas? (Opcional)
                  </label>
                  <input
                    id="campo-acomodo-mobiliario"
                    type="text"
                    maxLength={255}
                    value={acomodoMobiliario}
                    onChange={(e) => setAcomodoMobiliario(e.target.value)}
                    placeholder="Ej. Auditorio con 4 mesas al frente y pasillo central"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:bg-white focus:border-[#1c355e] focus:ring-2 focus:ring-[#1c355e]/15"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[#1c355e] uppercase tracking-wider mb-1">
                    Sillas para mesa panel
                  </label>
                  <StepperCantidad
                    valor={sillasMesaPanel}
                    min={0}
                    placeholder="0"
                    alCambiar={setSillasMesaPanel}
                    etiqueta="sillas para mesa panel"
                  />
                </div>
              </div>
            </div>

            <p className="text-xs text-slate-500">
              <span className="font-semibold">Resumen:</span> {resumenMaterialesTexto}
            </p>
          </div>
        </div>

        {/* Columna derecha: Disponibilidad, Recordatorios y Acciones */}
        <div className="lg:col-span-4 space-y-5 lg:sticky lg:top-24">
          {/* Tarjeta de estado de disponibilidad */}
          <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200/80 space-y-3">
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-[#1c355e]">
              Disponibilidad del espacio
            </h2>

            {verificandoDisponibilidad && (
              <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3.5 text-xs font-semibold text-slate-600 flex items-center gap-2.5">
                <Loader2 className="w-4 h-4 animate-spin text-[#1c355e] shrink-0" />
                <span>Verificando horario en SIPREF...</span>
              </div>
            )}

            {!verificandoDisponibilidad && esFechaHoraPasada && (
              <div
                role="alert"
                className="rounded-2xl bg-amber-50 border border-amber-200 p-3.5 text-amber-900 space-y-1"
              >
                <div className="flex items-center gap-2 font-bold text-xs">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Horario en el pasado</span>
                </div>
                <p className="text-xs text-amber-800">
                  La fecha y hora de inicio deben estar en el futuro para poder agendar.
                </p>
              </div>
            )}

            {!verificandoDisponibilidad &&
              !esFechaHoraPasada &&
              (conflictosActivos.length > 0 || errorGeneral) && (
                <div
                  role="alert"
                  className="rounded-2xl bg-red-50 border border-red-200 p-3.5 text-red-800 space-y-2"
                >
                  <div className="flex items-center gap-2 font-bold text-xs">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
                    <span>
                      {conflictosActivos.length > 0
                        ? 'Reserva Bloqueada — Aula Ocupada'
                        : 'No se pudo completar'}
                    </span>
                  </div>

                  {errorGeneral && (
                    <p className="text-xs font-medium text-red-700">{errorGeneral}</p>
                  )}

                  {conflictosActivos.length > 0 && (
                    <ul className="space-y-1.5 pt-1">
                      {conflictosActivos.map((c, idx) => (
                        <li
                          key={`${c.origen}-${c.nombreEvento}-${idx}`}
                          className="text-xs bg-white/80 border border-red-200/80 rounded-xl px-2.5 py-2 space-y-1"
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-red-100 text-red-800 font-bold text-[10px] uppercase tracking-wide shrink-0">
                              {c.origen}
                            </span>
                            <span className="font-semibold text-red-900 truncate">
                              {c.nombreEvento}
                            </span>
                          </div>
                          <p className="text-[11px] font-semibold text-red-700">
                            {formatearRangoHorario(c.inicio, c.fin)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

            {aulaDisponible && (
              <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-3.5 text-emerald-900 space-y-1">
                <div className="flex items-center gap-2 font-bold text-xs text-emerald-800">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Aula disponible</span>
                </div>
                <p className="text-xs text-emerald-700 leading-relaxed">
                  <strong>{espacioActual?.nombre ?? 'El espacio'}</strong> está libre en el horario seleccionado (buffer de {bufferMinutos} min respetado).
                </p>
              </div>
            )}
          </div>

          {/* Tarjeta compacta de Recordatorios */}
          <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200/80 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-[#1c355e]" />
                <h2 className="text-xs font-extrabold uppercase tracking-wider text-[#1c355e]">
                  Recordatorios
                </h2>
              </div>

              <button
                type="button"
                onClick={agregarFilaRecordatorio}
                disabled={limiteRecordatoriosAlcanzado}
                className="text-xs font-bold text-[#1c355e] hover:underline disabled:opacity-40 disabled:no-underline cursor-pointer"
              >
                + Agregar otro
              </button>
            </div>

            <div className="space-y-2">
              {filasRecordatorios.map((fila, idx) => (
                <div
                  key={fila.id}
                  className="flex flex-wrap items-center gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200/80 text-xs"
                >
                  <label className="inline-flex items-center gap-1.5 font-semibold text-slate-700 cursor-pointer mr-1">
                    <input
                      type="checkbox"
                      checked={fila.correo}
                      onChange={(e) =>
                        actualizarFilaRecordatorio(fila.id, { correo: e.target.checked })
                      }
                      className="rounded border-slate-300 text-[#1c355e] focus:ring-[#1c355e]/20"
                    />
                    <span>Correo</span>
                  </label>

                  <input
                    type="number"
                    min={1}
                    value={fila.anticipacion}
                    onChange={(e) =>
                      actualizarFilaRecordatorio(fila.id, {
                        anticipacion: Math.max(1, Number(e.target.value) || 1),
                      })
                    }
                    aria-label="Cantidad de anticipación"
                    className="w-14 text-center font-bold px-1.5 py-1 bg-white border border-slate-200 rounded-lg text-slate-800 outline-none focus:ring-2 focus:ring-[#1c355e]/20"
                  />

                  <select
                    value={fila.unidad}
                    onChange={(e) =>
                      actualizarFilaRecordatorio(fila.id, {
                        unidad: e.target.value as UnidadAnticipacion,
                      })
                    }
                    aria-label="Unidad de anticipación"
                    className="flex-1 min-w-[95px] px-2 py-1 bg-white border border-slate-200 rounded-lg font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-[#1c355e]/20"
                  >
                    {OPCIONES_UNIDAD_ANTICIPACION.map((op) => (
                      <option key={op.valor} value={op.valor}>
                        {op.etiqueta}
                      </option>
                    ))}
                  </select>

                  {idx > 0 && (
                    <button
                      type="button"
                      onClick={() => eliminarFilaRecordatorio(fila.id)}
                      aria-label="Eliminar recordatorio"
                      className="text-slate-400 hover:text-red-600 p-1 rounded-lg transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <p className="text-[11px] text-slate-400 leading-snug">
              La notificación en SIPREF se envía automáticamente por defecto.
            </p>

            {erroresCampo.recordatorios && (
              <p className="text-xs font-semibold text-red-600">
                {erroresCampo.recordatorios}
              </p>
            )}
          </div>

          {/* Botones de acción */}
          <div className="bg-white rounded-3xl p-4 shadow-sm border border-slate-200/80 space-y-2.5">
            <button
              type="submit"
              disabled={crearReservacionMut.isPending}
              className="w-full bg-[#1c355e] hover:bg-[#152847] text-white rounded-xl px-5 py-3 text-sm font-bold shadow-md shadow-[#1c355e]/15 transition-all disabled:opacity-60 cursor-pointer flex items-center justify-center gap-2"
            >
              {crearReservacionMut.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Agendando...</span>
                </>
              ) : (
                <>
                  <CalendarCheck className="w-4 h-4 text-[#fdbb11]" />
                  <span>Agendar Evento</span>
                </>
              )}
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={manejarLimpiarTodo}
                disabled={crearReservacionMut.isPending}
                className="w-full inline-flex items-center justify-center gap-1.5 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-600 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 transition-colors disabled:opacity-50 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                <span>Limpiar todo</span>
              </button>

              <Link
                to="/calendario"
                className="w-full flex items-center justify-center border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </Link>
            </div>
          </div>
        </div>
      </form>

      <Modal
        abierto={!!materialAEliminar}
        alCerrar={() => setMaterialAEliminar(null)}
        titulo="Eliminar material del catálogo"
        subtitulo={materialAEliminar?.nombre}
        anchoMax="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600 leading-relaxed">
            ¿Eliminar este material del catálogo? Los eventos anteriores conservarán su registro.
          </p>
          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => setMaterialAEliminar(null)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={manejarConfirmarEliminarMaterial}
              disabled={eliminarRecursoMut.isPending}
              className="rounded-xl bg-rose-600 hover:bg-rose-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-60 cursor-pointer"
            >
              {eliminarRecursoMut.isPending ? 'Eliminando...' : 'Eliminar'}
            </button>
          </div>
        </div>
      </Modal>

      <ModalPlantillaEvento
        abierto={modalPlantillaAbierto}
        alCerrar={() => setModalPlantillaAbierto(false)}
        plantillaEditar={plantillaAEditar}
        recursosCatalogo={recursosCatalogo}
        recursosIniciales={recursosSeleccionados}
        tipoEventoInicial={tipoEvento}
        nombreEventoInicial={nombreEvento}
        alAplicar={(plantilla) => aplicarPlantilla(plantilla)}
        alEliminar={(idEliminada) => {
          if (plantillaSeleccionadaId === String(idEliminada)) {
            setPlantillaSeleccionadaId('');
          }
        }}
      />
    </div>
  );
}

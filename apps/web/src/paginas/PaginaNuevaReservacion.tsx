import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Bell,
  Building2,
  CalendarCheck,
  CheckCircle2,
  Clock,
  Package,
  Plus,
  Trash2,
  Users,
} from 'lucide-react';
import {
  consultarDisponibilidad,
  useConfiguracion,
  useCrearRecurso,
  useCrearReservacion,
  useEspacios,
  useRecursos,
  useYo,
} from '../api/consultas';
import { esApiError, mensajeDeError } from '../api/cliente';
import type {
  Conflicto,
  DisponibilidadRespuesta,
  TipoEvento,
  UnidadAnticipacion,
} from '../api/tipos';
import {
  LISTA_TIPOS_EVENTO,
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

export function PaginaNuevaReservacion() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();

  const { data: yo } = useYo();
  const { data: config } = useConfiguracion();
  const { data: espacios = [] } = useEspacios();
  const { data: recursosCatalogo = [] } = useRecursos();

  const crearRecursoMut = useCrearRecurso();
  const crearReservacionMut = useCrearReservacion();

  const fechaPorDefecto = useMemo(() => {
    const param = searchParams.get('fecha');
    if (param && /^\d{4}-\d{2}-\d{2}$/.test(param)) return param;
    return sumarDiasYmd(extraerFechaMexico(new Date()), 1);
  }, [searchParams]);

  // Campos principales del formulario
  const [tipoEvento, setTipoEvento] = useState<TipoEvento>('CONFERENCIA');
  const [espacioId, setEspacioId] = useState<string>('');
  const [nombreEvento, setNombreEvento] = useState<string>('');
  const [codigo, setCodigo] = useState<string>('');
  const [fecha, setFecha] = useState<string>(fechaPorDefecto);
  const [horaInicio, setHoraInicio] = useState<string>('10:00');
  const [horaFin, setHoraFin] = useState<string>('12:30');
  const [responsable, setResponsable] = useState<string>('');
  const [correoResponsable, setCorreoResponsable] = useState<string>('');
  const [asistentesEstimados, setAsistentesEstimados] = useState<string>('30');
  const [descripcion, setDescripcion] = useState<string>('');
  const [observaciones, setObservaciones] = useState<string>('');

  // Prellenar responsable y correo con el usuario autenticado y el primer espacio
  useEffect(() => {
    if (yo && !responsable && !correoResponsable) {
      setResponsable(yo.nombre);
      setCorreoResponsable(yo.correo);
    }
  }, [yo, responsable, correoResponsable]);

  useEffect(() => {
    if (!espacioId && espacios.length > 0) {
      setEspacioId(espacios[0].id);
    }
  }, [espacios, espacioId]);

  // Selección de recursos: mapa recursoId -> cantidad (si existe en el mapa está marcado)
  const [recursosSeleccionados, setRecursosSeleccionados] = useState<Record<number, number>>({});
  const [mostrarInputNuevoRecurso, setMostrarInputNuevoRecurso] = useState(false);
  const [nuevoRecursoNombre, setNuevoRecursoNombre] = useState('');
  const [nuevoRecursoUnidad, setNuevoRecursoUnidad] = useState('pieza');
  const [errorNuevoRecurso, setErrorNuevoRecurso] = useState<string | null>(null);

  // Recordatorios: por defecto 1 fila con Correo y 1 día
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

  const numAsistentes = asistentesEstimados.trim() === '' ? null : Number(asistentesEstimados);
  const superaCapacidad =
    espacioActual !== null &&
    numAsistentes !== null &&
    Number.isFinite(numAsistentes) &&
    numAsistentes > espacioActual.capacidad;

  // Verificación de disponibilidad con debounce cuando espacio, fecha y horas son válidos
  useEffect(() => {
    setConflictosEnvio([]);
    if (!espacioId || !fecha || !duracion.valida) {
      setDisponibilidad(null);
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
  }, [espacioId, fecha, horaInicio, horaFin, duracion.valida]);

  const alternarRecurso = (recursoId: number, marcado: boolean) => {
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

  const cambiarCantidadRecurso = (recursoId: number, cantidad: number) => {
    setRecursosSeleccionados((prev) => ({
      ...prev,
      [recursoId]: Math.max(1, Math.floor(cantidad || 1)),
    }));
  };

  const manejarAgregarRecursoCatalogo = async () => {
    const nombreLimpio = nuevoRecursoNombre.trim();
    if (!nombreLimpio) {
      setErrorNuevoRecurso('Escribe el nombre del recurso.');
      return;
    }
    setErrorNuevoRecurso(null);
    try {
      const creado = await crearRecursoMut.mutateAsync({
        nombre: nombreLimpio,
        unidad: nuevoRecursoUnidad.trim() || 'pieza',
      });
      setRecursosSeleccionados((prev) => ({ ...prev, [creado.id]: 1 }));
      setNuevoRecursoNombre('');
      setNuevoRecursoUnidad('pieza');
      setMostrarInputNuevoRecurso(false);
      toast.exito(`Recurso "${creado.nombre}" agregado y seleccionado`);
    } catch (err) {
      setErrorNuevoRecurso(mensajeDeError(err));
    }
  };

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

  const manejarSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErroresCampo({});
    setErrorGeneral(null);
    setConflictosEnvio([]);

    // Validación UX básica en el cliente
    const nuevosErrores: Record<string, string> = {};
    if (!nombreEvento.trim()) {
      nuevosErrores.nombreEvento = 'Ingresa el nombre del evento.';
    }
    if (!espacioId) {
      nuevosErrores.espacioId = 'Selecciona un aula o espacio.';
    }
    if (!duracion.valida) {
      nuevosErrores.fin = duracion.texto;
    }
    if (!responsable.trim()) {
      nuevosErrores.responsable = 'Ingresa el nombre del responsable.';
    }
    if (!correoResponsable.trim() || !correoResponsable.includes('@')) {
      nuevosErrores.correoResponsable = 'Ingresa un correo institucional válido.';
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
        tipoEvento,
        espacioId,
        nombreEvento: nombreEvento.trim(),
        codigo: codigo.trim() ? codigo.trim() : undefined,
        inicio: construirIsoMexico(fecha, horaInicio),
        fin: construirIsoMexico(fecha, horaFin),
        responsable: responsable.trim(),
        correoResponsable: correoResponsable.trim(),
        descripcion: descripcion.trim(),
        observaciones: observaciones.trim(),
        asistentesEstimados:
          numAsistentes !== null && Number.isFinite(numAsistentes) ? numAsistentes : null,
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

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <Link
            to="/calendario"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-texto-suave hover:text-navy mb-1.5"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Volver al calendario</span>
          </Link>
          <h1 className="text-xl sm:text-2xl font-bold text-navy">
            Agendar evento en aula
          </h1>
          <p className="text-xs text-texto-suave mt-0.5">
            Registra un nuevo evento académico o administrativo verificando disponibilidad en tiempo real con SIPREF.
          </p>
        </div>
      </div>

      <form onSubmit={manejarSubmit} noValidate className="space-y-6">
        {/* Sección 1: Datos principales del evento y espacio */}
        <section className="tarjeta p-5 sm:p-6 space-y-4">
          <div className="flex items-center gap-2 border-b border-borde pb-3">
            <Building2 className="h-5 w-5 text-navy" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-navy">
              1. Información del evento y espacio asignado
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="campo-tipo-evento" className="label-base">
                Tipo de evento <span className="text-rose-600">*</span>
              </label>
              <select
                id="campo-tipo-evento"
                value={tipoEvento}
                onChange={(e) => setTipoEvento(e.target.value as TipoEvento)}
                className="input-base"
              >
                {LISTA_TIPOS_EVENTO.map((t) => (
                  <option key={t.tipo} value={t.tipo}>
                    {t.etiqueta}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="campo-espacio" className="label-base">
                Aula / espacio asignado <span className="text-rose-600">*</span>
              </label>
              <select
                id="campo-espacio"
                value={espacioId}
                onChange={(e) => setEspacioId(e.target.value)}
                className="input-base"
                required
              >
                {espacios.map((esp) => (
                  <option key={esp.id} value={esp.id}>
                    {esp.nombre} · {esp.edificio} (Capacidad: {esp.capacidad} personas)
                  </option>
                ))}
              </select>
              {espacioActual && (
                <p className="mt-1 text-xs text-texto-suave">
                  Capacidad máxima registrada en SIPREF:{' '}
                  <strong className="text-navy">{espacioActual.capacidad} personas</strong> ({espacioActual.tipo})
                </p>
              )}
              {erroresCampo.espacioId && (
                <p className="mt-1 text-xs font-medium text-rose-600">{erroresCampo.espacioId}</p>
              )}
            </div>

            <div className="sm:col-span-1">
              <label htmlFor="campo-nombre-evento" className="label-base">
                Nombre del evento <span className="text-rose-600">*</span>
              </label>
              <input
                id="campo-nombre-evento"
                type="text"
                value={nombreEvento}
                onChange={(e) => setNombreEvento(e.target.value)}
                placeholder="Ej. Foro de Innovación Universitaria"
                className="input-base"
                required
              />
              {erroresCampo.nombreEvento && (
                <p className="mt-1 text-xs font-medium text-rose-600">
                  {erroresCampo.nombreEvento}
                </p>
              )}
            </div>

            <div className="sm:col-span-1">
              <label htmlFor="campo-codigo" className="label-base">
                Código de reservación interna <span className="font-normal text-texto-suave">(opcional)</span>
              </label>
              <input
                id="campo-codigo"
                type="text"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                placeholder="Se genera automáticamente"
                className="input-base font-mono"
              />
              {erroresCampo.codigo && (
                <p className="mt-1 text-xs font-medium text-rose-600">{erroresCampo.codigo}</p>
              )}
            </div>
          </div>
        </section>

        {/* Sección 2: Fecha, horario y disponibilidad */}
        <section className="tarjeta p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between gap-2 border-b border-borde pb-3">
            <div className="flex items-center gap-2">
              <CalendarCheck className="h-5 w-5 text-navy" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-navy">
                2. Fecha, horario y validación de disponibilidad
              </h2>
            </div>

            <div className="inline-flex items-center gap-1.5 rounded-full bg-navy-50 px-3 py-1 text-xs font-semibold text-navy">
              <Clock className="h-3.5 w-3.5 text-amber-600" />
              <span>
                {duracion.valida ? `Duración: ${duracion.texto}` : duracion.texto}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="campo-fecha" className="label-base">
                Fecha del evento <span className="text-rose-600">*</span>
              </label>
              <input
                id="campo-fecha"
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="input-base"
                required
              />
              {erroresCampo.inicio && (
                <p className="mt-1 text-xs font-medium text-rose-600">{erroresCampo.inicio}</p>
              )}
            </div>

            <div>
              <label htmlFor="campo-hora-inicio" className="label-base">
                Hora de inicio <span className="text-rose-600">*</span>
              </label>
              <input
                id="campo-hora-inicio"
                type="time"
                value={horaInicio}
                onChange={(e) => setHoraInicio(e.target.value)}
                className="input-base"
                required
              />
            </div>

            <div>
              <label htmlFor="campo-hora-fin" className="label-base">
                Hora de fin <span className="text-rose-600">*</span>
              </label>
              <input
                id="campo-hora-fin"
                type="time"
                value={horaFin}
                onChange={(e) => setHoraFin(e.target.value)}
                className="input-base"
                required
              />
              {erroresCampo.fin && (
                <p className="mt-1 text-xs font-medium text-rose-600">{erroresCampo.fin}</p>
              )}
            </div>
          </div>

          {/* Indicador de disponibilidad en tiempo real */}
          {verificandoDisponibilidad && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-texto-suave">
              Consultando disponibilidad del aula en SIPREF y SIPREF Reservas...
            </div>
          )}

          {!verificandoDisponibilidad &&
            duracion.valida &&
            disponibilidad?.disponible &&
            conflictosActivos.length === 0 && (
              <div
                role="status"
                className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-900"
              >
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                <span>
                  Aula disponible (se respetan {bufferMinutos} minutos entre eventos)
                </span>
              </div>
            )}

          {conflictosActivos.length > 0 && (
            <div
              role="alert"
              className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-900 space-y-2"
            >
              <div className="flex items-center gap-2 font-bold text-sm text-rose-800">
                <AlertCircle className="h-5 w-5 text-rose-600 shrink-0" />
                <span>
                  Espacio no disponible en este horario (se respetan {bufferMinutos} minutos entre eventos)
                </span>
              </div>
              <p className="text-rose-800">
                Se encontraron los siguientes eventos que se traslapan con el horario solicitado:
              </p>
              <ul className="space-y-1.5 pl-5 list-disc">
                {conflictosActivos.map((c, idx) => (
                  <li key={idx}>
                    <span className="inline-block rounded bg-rose-200/80 px-1.5 py-0.5 text-[10px] font-bold uppercase text-rose-950 mr-1.5">
                      {c.origen}
                    </span>
                    <strong>{c.nombreEvento}</strong> · {formatearRangoHorario(c.inicio, c.fin)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* Sección 3: Responsable, asistentes y detalles */}
        <section className="tarjeta p-5 sm:p-6 space-y-4">
          <div className="flex items-center gap-2 border-b border-borde pb-3">
            <Users className="h-5 w-5 text-navy" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-navy">
              3. Responsable, asistencia y descripción
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="campo-responsable" className="label-base">
                Responsable del evento <span className="text-rose-600">*</span>
              </label>
              <input
                id="campo-responsable"
                type="text"
                value={responsable}
                onChange={(e) => setResponsable(e.target.value)}
                placeholder="Nombre completo con grado"
                className="input-base"
                required
              />
              {erroresCampo.responsable && (
                <p className="mt-1 text-xs font-medium text-rose-600">
                  {erroresCampo.responsable}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="campo-correo" className="label-base">
                Correo institucional <span className="text-rose-600">*</span>
              </label>
              <input
                id="campo-correo"
                type="email"
                value={correoResponsable}
                onChange={(e) => setCorreoResponsable(e.target.value)}
                placeholder="nombre@ulatino.edu.mx"
                className="input-base"
                required
              />
              {erroresCampo.correoResponsable && (
                <p className="mt-1 text-xs font-medium text-rose-600">
                  {erroresCampo.correoResponsable}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="campo-asistentes" className="label-base">
                Asistentes estimados
              </label>
              <input
                id="campo-asistentes"
                type="number"
                min={1}
                max={2000}
                value={asistentesEstimados}
                onChange={(e) => setAsistentesEstimados(e.target.value)}
                className="input-base"
              />
            </div>
          </div>

          {superaCapacidad && espacioActual && (
            <div
              role="status"
              className="flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-xs text-amber-900"
            >
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                <strong>Advertencia de cupo:</strong> El número de asistentes estimados (
                {numAsistentes}) supera la capacidad registrada de{' '}
                <strong>{espacioActual.nombre}</strong> ({espacioActual.capacidad} personas). Aún
                puedes registrar la reservación si así lo autoriza la coordinación.
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="campo-descripcion" className="label-base">
                Descripción académica / objetivo
              </label>
              <textarea
                id="campo-descripcion"
                rows={3}
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Describe brevemente la actividad que se realizará..."
                className="input-base"
              />
            </div>
            <div>
              <label htmlFor="campo-observaciones" className="label-base">
                Observaciones logísticas
              </label>
              <textarea
                id="campo-observaciones"
                rows={3}
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                placeholder="Requerimientos de montaje, acceso previo, invitados externos..."
                className="input-base"
              />
            </div>
          </div>
        </section>

        {/* Sección 4: Recursos necesarios */}
        <section className="tarjeta p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-borde pb-3">
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-navy" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-navy">
                4. Recursos necesarios
              </h2>
            </div>

            {!mostrarInputNuevoRecurso && (
              <button
                type="button"
                onClick={() => setMostrarInputNuevoRecurso(true)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-navy hover:underline"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>+ Agregar otro recurso</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {recursosCatalogo.map((rec) => {
              const marcado = recursosSeleccionados[rec.id] !== undefined;
              const cantidad = recursosSeleccionados[rec.id] ?? 1;

              return (
                <div
                  key={rec.id}
                  className={`flex items-center justify-between gap-2 rounded-xl border p-3 transition ${
                    marcado
                      ? 'border-navy bg-navy-50/40 ring-1 ring-navy/20'
                      : 'border-borde bg-white hover:bg-slate-50'
                  }`}
                >
                  <label className="flex items-center gap-2.5 text-xs font-medium text-texto cursor-pointer flex-1 min-w-0">
                    <input
                      type="checkbox"
                      checked={marcado}
                      onChange={(e) => alternarRecurso(rec.id, e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-navy focus:ring-amber"
                    />
                    <span className="truncate">{rec.nombre}</span>
                  </label>

                  {marcado && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <input
                        type="number"
                        min={1}
                        max={500}
                        aria-label={`Cantidad de ${rec.nombre}`}
                        value={cantidad}
                        onChange={(e) =>
                          cambiarCantidadRecurso(rec.id, Number(e.target.value))
                        }
                        className="w-16 rounded-md border border-borde bg-white px-2 py-1 text-center text-xs font-semibold text-navy"
                      />
                      <span className="text-[11px] text-texto-suave">{rec.unidad}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Entrada en línea "+ Agregar otro recurso" */}
          {mostrarInputNuevoRecurso && (
            <div className="rounded-xl border border-dashed border-navy/40 bg-fondo p-3.5 space-y-2.5">
              <p className="text-xs font-semibold text-navy">
                Registrar nuevo recurso en el catálogo
              </p>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <input
                  type="text"
                  value={nuevoRecursoNombre}
                  onChange={(e) => setNuevoRecursoNombre(e.target.value)}
                  placeholder="Nombre del recurso (ej. Apuntador láser)"
                  className="input-base py-1.5 text-xs flex-1"
                />
                <input
                  type="text"
                  value={nuevoRecursoUnidad}
                  onChange={(e) => setNuevoRecursoUnidad(e.target.value)}
                  placeholder="Unidad (pieza)"
                  className="input-base py-1.5 text-xs sm:w-32"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={manejarAgregarRecursoCatalogo}
                    disabled={crearRecursoMut.isPending}
                    className="btn-navy py-1.5 px-3 text-xs"
                  >
                    {crearRecursoMut.isPending ? 'Agregando...' : 'Guardar y marcar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMostrarInputNuevoRecurso(false);
                      setErrorNuevoRecurso(null);
                    }}
                    className="btn-secundario py-1.5 px-3 text-xs"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
              {errorNuevoRecurso && (
                <p className="text-xs text-rose-600 font-medium">{errorNuevoRecurso}</p>
              )}
            </div>
          )}
        </section>

        {/* Sección 5: Recordatorios */}
        <section className="tarjeta p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-borde pb-3">
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-navy" />
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-navy">
                  5. Recordatorios automáticos
                </h2>
                <p className="text-[11px] text-texto-suave">
                  Cada canal seleccionado (SIPREF o Correo) genera un aviso independiente (máx. {MAX_RECORDATORIOS}).
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={agregarFilaRecordatorio}
              disabled={filasRecordatorios.length >= MAX_RECORDATORIOS}
              className="btn-secundario py-1.5 px-3 text-xs"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Agregar fila</span>
            </button>
          </div>

          <div className="space-y-2.5">
            {filasRecordatorios.map((fila) => (
              <div
                key={fila.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-borde bg-fondo/60 p-3 text-xs"
              >
                <div className="flex items-center gap-4">
                  <label className="inline-flex items-center gap-2 font-semibold text-texto cursor-pointer">
                    <input
                      type="checkbox"
                      checked={fila.sipref}
                      onChange={(e) =>
                        actualizarFilaRecordatorio(fila.id, { sipref: e.target.checked })
                      }
                      className="h-4 w-4 rounded border-slate-300 text-navy"
                    />
                    <span>SIPREF</span>
                  </label>

                  <label className="inline-flex items-center gap-2 font-semibold text-texto cursor-pointer">
                    <input
                      type="checkbox"
                      checked={fila.correo}
                      onChange={(e) =>
                        actualizarFilaRecordatorio(fila.id, { correo: e.target.checked })
                      }
                      className="h-4 w-4 rounded border-slate-300 text-navy"
                    />
                    <span>Correo</span>
                  </label>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-texto-suave">Enviar</span>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    aria-label="Cantidad de anticipación"
                    value={fila.anticipacion}
                    onChange={(e) =>
                      actualizarFilaRecordatorio(fila.id, {
                        anticipacion: Math.max(1, Number(e.target.value) || 1),
                      })
                    }
                    className="w-20 rounded-lg border border-borde bg-white px-2.5 py-1.5 text-center text-xs font-semibold text-navy"
                  />
                  <select
                    aria-label="Unidad de anticipación"
                    value={fila.unidad}
                    onChange={(e) =>
                      actualizarFilaRecordatorio(fila.id, {
                        unidad: e.target.value as UnidadAnticipacion,
                      })
                    }
                    className="rounded-lg border border-borde bg-white px-2.5 py-1.5 text-xs font-medium text-texto"
                  >
                    {OPCIONES_UNIDAD_ANTICIPACION.map((u) => (
                      <option key={u.valor} value={u.valor}>
                        {u.etiqueta}
                      </option>
                    ))}
                  </select>
                  <span className="text-texto-suave">antes</span>

                  {filasRecordatorios.length > 1 && (
                    <button
                      type="button"
                      onClick={() => eliminarFilaRecordatorio(fila.id)}
                      aria-label="Eliminar fila de recordatorio"
                      className="rounded-lg p-1.5 text-texto-suave hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {erroresCampo.recordatorios && (
            <p className="text-xs font-medium text-rose-600">{erroresCampo.recordatorios}</p>
          )}
        </section>

        {errorGeneral && (
          <div
            role="alert"
            className="flex items-center gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-800"
          >
            <AlertCircle className="h-5 w-5 text-rose-600 shrink-0" />
            <span>{errorGeneral}</span>
          </div>
        )}

        {/* Botonera final */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Link to="/calendario" className="btn-secundario">
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={crearReservacionMut.isPending}
            className="btn-primario px-6"
          >
            {crearReservacionMut.isPending ? 'Agendando evento...' : 'Agendar evento en aula'}
          </button>
        </div>
      </form>
    </div>
  );
}

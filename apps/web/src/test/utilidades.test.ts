import { describe, expect, it } from 'vitest';
import {
  calcularDuracion,
  construirIsoMexico,
  extraerFechaMexico,
  extraerHoraMexico,
  formatearFechaCompleta,
} from '../utilidades/fechas';
import {
  convertirFilasRecordatorios,
  crearFilaRecordatorioPorDefecto,
  type FilaRecordatorio,
} from '../utilidades/recordatorios';
import {
  obtenerEtiquetaRol,
  obtenerInfoEstadoReservacion,
  obtenerInfoTipoEvento,
} from '../utilidades/catalogos';

describe('Cálculo de duración (calcularDuracion)', () => {
  it('calcula horas y minutos correctamente (ej. 2 h 30 min)', () => {
    const res = calcularDuracion('10:00', '12:30');
    expect(res.valida).toBe(true);
    expect(res.minutos).toBe(150);
    expect(res.texto).toBe('2 h 30 min');
  });

  it('calcula horas exactas sin sufijo de minutos', () => {
    const res = calcularDuracion('08:00', '10:00');
    expect(res.valida).toBe(true);
    expect(res.minutos).toBe(120);
    expect(res.texto).toBe('2 h');
  });

  it('calcula duraciones menores a una hora en minutos', () => {
    const res = calcularDuracion('09:15', '10:00');
    expect(res.valida).toBe(true);
    expect(res.minutos).toBe(45);
    expect(res.texto).toBe('45 min');
  });

  it('marca como inválida una duración donde fin <= inicio', () => {
    const igual = calcularDuracion('11:00', '11:00');
    expect(igual.valida).toBe(false);

    const invertida = calcularDuracion('14:00', '12:00');
    expect(invertida.valida).toBe(false);
    expect(invertida.texto).toContain('posterior');
  });
});

describe('Conversión de filas de recordatorio a payload de API', () => {
  it('convierte la fila por defecto en 1 entrada de CORREO de 1 día', () => {
    const porDefecto = [crearFilaRecordatorioPorDefecto()];
    const payload = convertirFilasRecordatorios(porDefecto);
    expect(payload).toEqual([
      { canal: 'CORREO', anticipacion: 1, unidad: 'DIAS' },
    ]);
  });

  it('desglosa una fila con ambos canales (SIPREF y CORREO) en dos entradas separadas', () => {
    const filas: FilaRecordatorio[] = [
      { id: '1', sipref: true, correo: true, anticipacion: 2, unidad: 'HORAS' },
      { id: '2', sipref: true, correo: false, anticipacion: 30, unidad: 'MINUTOS' },
    ];
    const payload = convertirFilasRecordatorios(filas);
    expect(payload).toEqual([
      { canal: 'SIPREF', anticipacion: 2, unidad: 'HORAS' },
      { canal: 'CORREO', anticipacion: 2, unidad: 'HORAS' },
      { canal: 'SIPREF', anticipacion: 30, unidad: 'MINUTOS' },
    ]);
  });

  it('ignora filas sin ningún canal marcado o con anticipación no positiva', () => {
    const filas: FilaRecordatorio[] = [
      { id: '1', sipref: false, correo: false, anticipacion: 1, unidad: 'DIAS' },
      { id: '2', sipref: true, correo: true, anticipacion: 0, unidad: 'HORAS' },
    ];
    expect(convertirFilasRecordatorios(filas)).toEqual([]);
  });
});

describe('Mapeo de badges de estado, tipos de evento y roles', () => {
  it('mapea correctamente los estados PENDIENTE, REALIZADA y CANCELADA', () => {
    expect(obtenerInfoEstadoReservacion('PENDIENTE').etiqueta).toBe('Pendiente');
    expect(obtenerInfoEstadoReservacion('REALIZADA').etiqueta).toBe('Realizada');
    expect(obtenerInfoEstadoReservacion('CANCELADA').etiqueta).toBe('Cancelada');
  });

  it('mapea tipos de evento y etiquetas de rol en español', () => {
    expect(obtenerInfoTipoEvento('CONFERENCIA').etiqueta).toBe('Conferencia');
    expect(obtenerInfoTipoEvento('EXAMEN').etiqueta).toBe('Examen');
    expect(obtenerEtiquetaRol('ADMIN_ESPACIOS')).toBe('Administrador de espacios');
    expect(obtenerEtiquetaRol('DOCENTE')).toBe('Docente');
    expect(obtenerEtiquetaRol('PERSONAL')).toBe('Personal');
  });

  it('formatea fechas e ISO en zona America/Mexico_City', () => {
    const iso = construirIsoMexico('2026-11-15', '10:30');
    expect(iso).toBe('2026-11-15T10:30:00-06:00');
    expect(extraerFechaMexico(iso)).toBe('2026-11-15');
    expect(extraerHoraMexico(iso)).toBe('10:30');
    expect(formatearFechaCompleta('2026-11-15').toLowerCase()).toContain('domingo');
    expect(formatearFechaCompleta('2026-11-15').toLowerCase()).toContain('noviembre');
  });
});

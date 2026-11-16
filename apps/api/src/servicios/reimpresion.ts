import { escaparHtml } from './correo.js';
import type { ReservacionDetalleDto } from './reservaciones.js';

/**
 * Genera el HTML imprimible del expediente oficial de una reservación,
 * sin código QR ni sello digital (conforme a docs/CONTRATOS_API.md §1.5).
 */
export function generarHtmlExpediente(r: ReservacionDetalleDto): string {
  const filasRecursos =
    r.recursos.length > 0
      ? r.recursos
          .map(
            (rec) => `
          <tr>
            <td>${escaparHtml(rec.nombre)}</td>
            <td>${rec.cantidad}</td>
            <td>${escaparHtml(rec.unidad)}</td>
          </tr>`,
          )
          .join('')
      : `<tr><td colspan="3" style="color: #64748b;">Sin recursos adicionales solicitados</td></tr>`;

  const bloqueCancelacion = r.cancelacion
    ? `
      <div class="alerta-cancelada">
        <strong>RESERVACIÓN CANCELADA</strong><br/>
        Cancelada por: ${escaparHtml(r.cancelacion.por)} · Fecha: ${escaparHtml(r.cancelacion.en)}<br/>
        Motivo: ${escaparHtml(r.cancelacion.motivo)}
      </div>
    `
    : '';

  return `<!DOCTYPE html>
<html lang="es-MX">
<head>
  <meta charset="utf-8" />
  <title>Expediente de Reservación ${escaparHtml(r.codigo)} · SIPREF Reservas</title>
  <style>
    body {
      font-family: "Segoe UI", Arial, sans-serif;
      color: #0f172a;
      margin: 32px;
      line-height: 1.45;
    }
    .encabezado {
      border-bottom: 2px solid #0f172a;
      padding-bottom: 12px;
      margin-bottom: 20px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .institucion {
      font-size: 18px;
      font-weight: 700;
    }
    .subtitulo {
      font-size: 13px;
      color: #475569;
    }
    .folio {
      font-size: 16px;
      font-weight: 700;
      text-align: right;
    }
    .alerta-cancelada {
      border: 1px solid #dc2626;
      background: #fef2f2;
      color: #991b1b;
      padding: 12px;
      border-radius: 4px;
      margin-bottom: 16px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }
    th, td {
      border: 1px solid #cbd5e1;
      padding: 8px 10px;
      text-align: left;
      font-size: 13px;
    }
    th {
      background: #f8fafc;
      font-weight: 600;
      width: 28%;
    }
    h2 {
      font-size: 15px;
      margin: 20px 0 8px 0;
      color: #1e293b;
    }
    .firmas {
      margin-top: 48px;
      display: flex;
      justify-content: space-around;
      text-align: center;
      font-size: 13px;
    }
    .linea-firma {
      width: 240px;
      border-top: 1px solid #334155;
      padding-top: 6px;
    }
    @media print {
      .no-imprimir { display: none; }
      body { margin: 12mm; }
    }
  </style>
</head>
<body>
  <div class="no-imprimir" style="margin-bottom: 16px;">
    <button onclick="window.print()" style="padding: 8px 14px; cursor: pointer;">Imprimir expediente</button>
  </div>

  <div class="encabezado">
    <div>
      <div class="institucion">Universidad Latino · SIPREF Reservas</div>
      <div class="subtitulo">Expediente Oficial de Reservación de Espacio</div>
    </div>
    <div class="folio">
      Folio: ${escaparHtml(r.codigo)}<br/>
      <span class="subtitulo">Estado: ${escaparHtml(r.estado)}</span>
    </div>
  </div>

  ${bloqueCancelacion}

  <h2>Datos del Evento</h2>
  <table>
    <tbody>
      <tr><th>Nombre del evento</th><td>${escaparHtml(r.nombreEvento)}</td></tr>
      <tr><th>Tipo de evento</th><td>${escaparHtml(r.tipoEvento)}</td></tr>
      <tr><th>Espacio asignado</th><td>${escaparHtml(r.espacioNombre)} (${escaparHtml(r.espacioId)})</td></tr>
      <tr><th>Fecha y hora de inicio</th><td>${escaparHtml(r.inicio)}</td></tr>
      <tr><th>Fecha y hora de fin</th><td>${escaparHtml(r.fin)}</td></tr>
      <tr><th>Responsable del evento</th><td>${escaparHtml(r.responsable)}</td></tr>
      <tr><th>Correo de contacto</th><td>${escaparHtml(r.correoResponsable || '—')}</td></tr>
      <tr><th>Asistentes estimados</th><td>${r.asistentesEstimados !== null ? r.asistentesEstimados : '—'}</td></tr>
      <tr><th>Descripción</th><td>${escaparHtml(r.descripcion || '—')}</td></tr>
      <tr><th>Observaciones</th><td>${escaparHtml(r.observaciones || '—')}</td></tr>
    </tbody>
  </table>

  <h2>Recursos Solicitados</h2>
  <table>
    <thead>
      <tr>
        <th>Recurso</th>
        <th>Cantidad</th>
        <th>Unidad</th>
      </tr>
    </thead>
    <tbody>
      ${filasRecursos}
    </tbody>
  </table>

  <h2>Control de Registro</h2>
  <table>
    <tbody>
      <tr><th>Registrado por</th><td>${escaparHtml(r.creadoPor.nombre)}</td></tr>
      <tr><th>Fecha de creación</th><td>${escaparHtml(r.creadoEn)}</td></tr>
      <tr><th>Última actualización</th><td>${escaparHtml(r.actualizadoEn)} (versión ${r.version})</td></tr>
    </tbody>
  </table>

  <div class="firmas">
    <div class="linea-firma">
      ${escaparHtml(r.responsable)}<br/>
      Responsable del Evento
    </div>
    <div class="linea-firma">
      Administración de Espacios<br/>
      SIPREF · Universidad Latino
    </div>
  </div>
</body>
</html>`;
}

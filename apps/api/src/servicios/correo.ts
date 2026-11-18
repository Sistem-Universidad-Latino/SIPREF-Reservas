import nodemailer from 'nodemailer';
import { obtenerConfig } from '../config.js';

export interface OpcionesCorreo {
  para: string;
  asunto: string;
  texto: string;
  html: string;
}

export async function enviarCorreo(opciones: OpcionesCorreo): Promise<void> {
  const cfg = obtenerConfig();

  if (!cfg.SMTP_HOST) {
    if (cfg.NODE_ENV !== 'test') {
      console.info(
        `[CORREO-DEV] Para: ${opciones.para} | Asunto: ${opciones.asunto}\n${opciones.texto}`,
      );
    }
    return;
  }

  const transportador = nodemailer.createTransport({
    host: cfg.SMTP_HOST,
    port: cfg.SMTP_PORT,
    secure: cfg.SMTP_PORT === 465,
    auth:
      cfg.SMTP_USER && cfg.SMTP_PASS
        ? { user: cfg.SMTP_USER, pass: cfg.SMTP_PASS }
        : undefined,
  });

  await transportador.sendMail({
    from: cfg.SMTP_FROM,
    to: opciones.para,
    subject: opciones.asunto,
    text: opciones.texto,
    html: opciones.html,
  });
}

export async function enviarCorreoAprobacionAcceso(datos: {
  para: string;
  nombre: string;
  rol: string;
}): Promise<void> {
  const cfg = obtenerConfig();
  const enlace = cfg.FRONTEND_URL;
  const asunto = 'Tu acceso a SIPREF Reservas fue aprobado';
  const texto = [
    `Hola, ${datos.nombre}:`,
    '',
    `Tu solicitud de acceso al sistema SIPREF Reservas de la Universidad Latino fue aprobada con el rol ${datos.rol}.`,
    '',
    `Puedes ingresar desde el siguiente enlace:`,
    enlace,
    '',
    'Atentamente,',
    'Administración de Espacios · SIPREF Reservas',
  ].join('\n');

  const html = `
    <div style="font-family: sans-serif; color: #1e293b; max-width: 560px; margin: 0 auto;">
      <h2 style="color: #0f172a;">Tu acceso a SIPREF Reservas fue aprobado</h2>
      <p>Hola, <strong>${escaparHtml(datos.nombre)}</strong>:</p>
      <p>Tu solicitud de acceso al sistema <strong>SIPREF Reservas</strong> fue aprobada con el perfil <strong>${escaparHtml(datos.rol)}</strong>.</p>
      <p style="margin: 24px 0;">
        <a href="${escaparHtml(enlace)}" style="background: #1d4ed8; color: #ffffff; padding: 10px 18px; border-radius: 6px; text-decoration: none; font-weight: 600;">
          Ingresar a SIPREF Reservas
        </a>
      </p>
      <p style="font-size: 13px; color: #64748b;">Enlace directo: ${escaparHtml(enlace)}</p>
    </div>
  `;

  await enviarCorreo({ para: datos.para, asunto, texto, html });
}

function formatearFechaHoraMerida(inicioIso: string, finIso: string): {
  fecha: string;
  horario: string;
} {
  const ini = new Date(inicioIso);
  const fin = new Date(finIso);
  if (Number.isNaN(ini.getTime()) || Number.isNaN(fin.getTime())) {
    return { fecha: inicioIso, horario: finIso };
  }
  const fecha = new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Merida',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(ini);
  const fmtHora = new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Merida',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return { fecha, horario: `${fmtHora.format(ini)} - ${fmtHora.format(fin)} hrs` };
}

function filaDetalleCorreo(etiqueta: string, valor: string, destacado = false): string {
  const estiloValor = destacado
    ? 'color:#1c355e;font-weight:700;'
    : 'color:#0f172a;font-weight:500;';
  return (
    `<tr>` +
    `<td style="padding:10px 0;border-bottom:1px solid #e2e8f0;width:38%;color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.4px;vertical-align:top;">${escaparHtml(etiqueta)}</td>` +
    `<td style="padding:10px 0 10px 12px;border-bottom:1px solid #e2e8f0;font-size:14px;line-height:1.45;vertical-align:top;${estiloValor}">${escaparHtml(valor)}</td>` +
    `</tr>`
  );
}

export async function enviarCorreoRecordatorio(datos: {
  para: string;
  codigo: string;
  nombreEvento: string;
  tipoEvento?: string;
  espacioNombre: string;
  inicioIso: string;
  finIso: string;
  responsable?: string;
  acomodoMobiliario?: string | null;
  sillasMesaPanel?: number;
  descripcion?: string | null;
}): Promise<void> {
  const { fecha, horario } = formatearFechaHoraMerida(datos.inicioIso, datos.finIso);
  const asunto = `Recordatorio de evento: ${datos.nombreEvento} — SIPREF Reservas`;
  const texto = [
    `Recordatorio de evento programado — SIPREF Reservas`,
    '',
    `Folio: ${datos.codigo}`,
    `Evento: ${datos.nombreEvento}`,
    `Espacio: ${datos.espacioNombre}`,
    `Fecha: ${fecha}`,
    `Horario: ${horario}`,
    ...(datos.responsable ? [`Responsable: ${datos.responsable}`] : []),
    ...(datos.acomodoMobiliario ? [`Acomodo: ${datos.acomodoMobiliario}`] : []),
    ...(datos.sillasMesaPanel && datos.sillasMesaPanel > 0
      ? [`Sillas mesa panel: ${datos.sillasMesaPanel}`]
      : []),
  ].join('\n');

  const filas = [
    filaDetalleCorreo('Espacio', datos.espacioNombre, true),
    filaDetalleCorreo('Fecha', fecha),
    filaDetalleCorreo('Horario', horario),
    ...(datos.responsable ? [filaDetalleCorreo('Responsable', datos.responsable)] : []),
    ...(datos.acomodoMobiliario?.trim()
      ? [filaDetalleCorreo('Acomodo', datos.acomodoMobiliario.trim())]
      : []),
    ...(datos.sillasMesaPanel && datos.sillasMesaPanel > 0
      ? [filaDetalleCorreo('Sillas mesa panel', String(datos.sillasMesaPanel))]
      : []),
    ...(datos.descripcion?.trim()
      ? [filaDetalleCorreo('Descripción', datos.descripcion.trim())]
      : []),
    filaDetalleCorreo('Folio', datos.codigo),
  ].join('');

  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e293b;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f1f5f9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
          <tr>
            <td style="background-color:#1c355e;padding:20px 28px;border-bottom:3px solid #fdbb11;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="vertical-align:middle;">
                    <span style="display:inline-block;background-color:#fdbb11;color:#1c355e;font-weight:800;font-size:13px;letter-spacing:0.6px;padding:5px 10px;border-radius:6px;vertical-align:middle;">ULA</span>
                    <span style="color:#ffffff;font-size:16px;font-weight:700;letter-spacing:0.4px;margin-left:10px;vertical-align:middle;">SIPREF</span>
                  </td>
                  <td align="right" style="vertical-align:middle;color:#cbd5e1;font-size:11px;font-weight:600;letter-spacing:0.6px;text-transform:uppercase;">
                    Universidad Latino
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 28px 24px 28px;">
              <p style="margin:0 0 6px 0;font-size:11px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:#64748b;">
                Notificación de reservación
              </p>
              <h1 style="margin:0 0 8px 0;font-size:21px;line-height:1.3;font-weight:700;color:#0f172a;">
                Recordatorio de evento programado
              </h1>
              <p style="margin:0 0 22px 0;font-size:14px;line-height:1.55;color:#475569;">
                Le recordamos que cuenta con una reservación próxima registrada en el Sistema de Gestión de Prefectura.
              </p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-left:4px solid #1c355e;border-radius:8px;">
                <tr>
                  <td style="padding:18px 20px 10px 20px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td style="padding-bottom:14px;border-bottom:1px solid #cbd5e1;">
                          <div style="font-size:17px;font-weight:700;color:#0f172a;line-height:1.35;margin-bottom:6px;">
                            ${escaparHtml(datos.nombreEvento)}
                          </div>
                          <span style="display:inline-block;background-color:#e2e8f0;color:#1e293b;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;padding:3px 9px;border-radius:4px;">
                            ${escaparHtml(datos.tipoEvento || 'Evento')}
                          </span>
                        </td>
                      </tr>
                    </table>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:4px;">
                      ${filas}
                    </table>
                  </td>
                </tr>
              </table>
              <p style="margin:20px 0 0 0;font-size:12px;line-height:1.55;color:#64748b;">
                Este aviso se envía automáticamente conforme a la anticipación configurada en SIPREF. Para cualquier ajuste, comuníquese con Prefectura.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f8fafc;border-top:1px solid #e2e8f0;padding:14px 28px;text-align:center;">
              <p style="margin:0;font-size:11px;color:#94a3b8;">
                © 2026 Universidad Latino · Sistema de Gestión de Prefectura (SIPREF)
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  await enviarCorreo({ para: datos.para, asunto, texto, html });
}

export function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

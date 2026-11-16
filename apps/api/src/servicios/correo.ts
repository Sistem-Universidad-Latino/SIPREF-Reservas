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

export async function enviarCorreoRecordatorio(datos: {
  para: string;
  codigo: string;
  nombreEvento: string;
  espacioNombre: string;
  inicioIso: string;
  finIso: string;
}): Promise<void> {
  const asunto = `Recordatorio de reservación: ${datos.nombreEvento} (${datos.codigo})`;
  const texto = [
    `Recordatorio de evento programado en SIPREF Reservas:`,
    '',
    `Folio: ${datos.codigo}`,
    `Evento: ${datos.nombreEvento}`,
    `Espacio: ${datos.espacioNombre}`,
    `Inicio: ${datos.inicioIso}`,
    `Fin: ${datos.finIso}`,
  ].join('\n');

  const html = `
    <div style="font-family: sans-serif; color: #1e293b; max-width: 560px; margin: 0 auto;">
      <h2 style="color: #0f172a;">Recordatorio de reservación</h2>
      <p>Tiene un evento próximo registrado en <strong>SIPREF Reservas</strong>:</p>
      <ul>
        <li><strong>Folio:</strong> ${escaparHtml(datos.codigo)}</li>
        <li><strong>Evento:</strong> ${escaparHtml(datos.nombreEvento)}</li>
        <li><strong>Espacio:</strong> ${escaparHtml(datos.espacioNombre)}</li>
        <li><strong>Inicio:</strong> ${escaparHtml(datos.inicioIso)}</li>
        <li><strong>Fin:</strong> ${escaparHtml(datos.finIso)}</li>
      </ul>
    </div>
  `;

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

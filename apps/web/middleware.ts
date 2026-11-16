/**
 * Vercel Routing Middleware (framework-agnóstico).
 *
 * Reenvía (rewrite, no redirect) toda petición a /api/* hacia el backend en Render,
 * de modo que el navegador siempre habla con el dominio del frontend y las cookies
 * httpOnly son de primera parte.
 *
 * Requiere la variable de entorno API_URL en Vercel (p. ej. https://sipref-reservas-api.onrender.com),
 * sin barra final. Nunca se expone al navegador.
 */
import { rewrite } from '@vercel/functions';

export const config = {
  matcher: '/api/:path*',
};

export default function middleware(request: Request): Response {
  const apiUrl = process.env.API_URL;
  if (!apiUrl) {
    return new Response(
      JSON.stringify({
        error: {
          codigo: 'ERROR_INTERNO',
          mensaje: 'El servicio no está configurado correctamente.',
          detalles: {},
        },
      }),
      { status: 500, headers: { 'content-type': 'application/json; charset=utf-8' } },
    );
  }

  const entrante = new URL(request.url);
  const destino = new URL(entrante.pathname + entrante.search, apiUrl.replace(/\/+$/, '') + '/');
  return rewrite(destino);
}

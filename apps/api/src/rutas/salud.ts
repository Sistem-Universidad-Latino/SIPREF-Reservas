import type { FastifyInstance } from 'fastify';

export async function rutasSalud(app: FastifyInstance): Promise<void> {
  app.get('/api/salud', async () => {
    return {
      ok: true,
      version: '1.0.0',
    };
  });
}

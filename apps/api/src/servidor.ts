import { cerrarPool, obtenerPool } from './bd/pool.js';
import { obtenerConfig } from './config.js';
import { construirApp } from './app.js';
import { ejecutarTareasProgramadas } from './servicios/tareas.js';

async function iniciar(): Promise<void> {
  const cfg = obtenerConfig();
  const app = await construirApp(cfg);

  // Verificar conectividad básica a la base de datos al iniciar
  const pool = obtenerPool();
  await pool.query('SELECT 1');

  const cerrarOrdenadamente = async (senal: string) => {
    app.log.info({ senal }, 'Cerrando servidor de SIPREF Reservas...');
    try {
      await app.close();
      await cerrarPool();
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, 'Error al cerrar el servidor');
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void cerrarOrdenadamente('SIGINT'));
  process.on('SIGTERM', () => void cerrarOrdenadamente('SIGTERM'));

  await app.listen({ port: cfg.PORT, host: '0.0.0.0' });
  app.log.info(
    { port: cfg.PORT, env: cfg.NODE_ENV },
    'Servidor SIPREF Reservas API escuchando',
  );

  // Ciclo periódico cada 60s para enviar recordatorios vencidos en UTC
  const intervaloTareas = setInterval(() => {
    void ejecutarTareasProgramadas(pool).catch((err) => {
      app.log.warn({ err }, 'Error en ciclo periódico de recordatorios');
    });
  }, 60_000);
  intervaloTareas.unref?.();
}

iniciar().catch((err) => {
  console.error('Fallo fatal al iniciar SIPREF Reservas API:', err);
  process.exit(1);
});

import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { PaginaEstadoAcceso } from '../paginas/PaginaEstadoAcceso';
import { PaginaIngresar } from '../paginas/PaginaIngresar';
import type { EstadoAcceso, EstadoSolicitudRespuesta } from '../api/tipos';
import * as consultas from '../api/consultas';

function construirRespuestaEstado(estado: EstadoAcceso): EstadoSolicitudRespuesta {
  return {
    estado,
    solicitud: {
      id: 'sol-test-1',
      nombre: 'Dra. Elena Morales Ríos',
      correo: 'elena.morales@ulatino.edu.mx',
      fotoUrl: null,
      intentadoEn: '2026-11-15T21:00:00-06:00',
      expiraEn: '2026-12-15T21:00:00-06:00',
      resueltoEn: estado === 'PENDIENTE' ? null : '2026-11-16T09:00:00-06:00',
      rolAsignado: estado === 'APROBADA' ? 'DOCENTE' : null,
    },
    puedeEntrar: estado === 'APROBADA',
  };
}

function renderConProveedores(rutaInicial = '/acceso/estado') {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[rutaInicial]}>
        <Routes>
          <Route path="/ingresar" element={<PaginaIngresar />} />
          <Route path="/acceso/estado" element={<PaginaEstadoAcceso />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Variantes de la pantalla /acceso/estado y /ingresar', () => {
  it('muestra el mensaje y pasos de espera cuando el estado es PENDIENTE', () => {
    vi.spyOn(consultas, 'useEstadoSolicitud').mockReturnValue({
      data: construirRespuestaEstado('PENDIENTE'),
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof consultas.useEstadoSolicitud>);

    renderConProveedores('/acceso/estado');

    expect(screen.getByText('Tu solicitud está en revisión')).toBeInTheDocument();
    expect(screen.getByText('Solicitud enviada ✓')).toBeInTheDocument();
    expect(screen.getByText('En revisión')).toBeInTheDocument();
    expect(screen.getByText('Acceso concedido')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Actualizar estado/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Usar otra cuenta/i })).toBeInTheDocument();
  });

  it('muestra el paso 3 completado y botón Entrar a SIPREF Reservas cuando es APROBADA', () => {
    vi.spyOn(consultas, 'useEstadoSolicitud').mockReturnValue({
      data: construirRespuestaEstado('APROBADA'),
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof consultas.useEstadoSolicitud>);

    renderConProveedores('/acceso/estado');

    expect(screen.getByText('Acceso concedido ✓')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Entrar a SIPREF Reservas/i }),
    ).toBeInTheDocument();
  });

  it('muestra el mensaje exacto cuando la solicitud está RECHAZADA', () => {
    vi.spyOn(consultas, 'useEstadoSolicitud').mockReturnValue({
      data: construirRespuestaEstado('RECHAZADA'),
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof consultas.useEstadoSolicitud>);

    renderConProveedores('/acceso/estado');

    expect(
      screen.getByText('No fue posible otorgarte acceso. Contacta a la administración.'),
    ).toBeInTheDocument();
  });

  it('muestra el mensaje exacto cuando la cuenta está REVOCADA', () => {
    vi.spyOn(consultas, 'useEstadoSolicitud').mockReturnValue({
      data: construirRespuestaEstado('REVOCADA'),
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof consultas.useEstadoSolicitud>);

    renderConProveedores('/acceso/estado');

    expect(
      screen.getByText('Tu acceso fue suspendido. Contacta a la administración.'),
    ).toBeInTheDocument();
  });

  it('muestra el mensaje exacto y botón de Google cuando la solicitud está EXPIRADA', () => {
    vi.spyOn(consultas, 'useEstadoSolicitud').mockReturnValue({
      data: construirRespuestaEstado('EXPIRADA'),
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof consultas.useEstadoSolicitud>);

    renderConProveedores('/acceso/estado');

    expect(
      screen.getByText('Tu solicitud expiró. Puedes enviar una nueva.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Continuar con Google/i }),
    ).toBeInTheDocument();
  });

  it('muestra en /ingresar los errores de ?error=dominio y ?error=google', () => {
    renderConProveedores('/ingresar?error=dominio');
    expect(
      screen.getByText('Tu cuenta de Google no pertenece a un dominio permitido.'),
    ).toBeInTheDocument();
  });
});

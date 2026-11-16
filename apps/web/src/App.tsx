import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProveedorToast } from './componentes/Toast';
import { DisenoAutenticado } from './componentes/DisenoAutenticado';
import { PaginaIngresar } from './paginas/PaginaIngresar';
import { PaginaEstadoAcceso } from './paginas/PaginaEstadoAcceso';
import { PaginaCalendario } from './paginas/PaginaCalendario';
import { PaginaConfiguracionPerfil } from './paginas/PaginaConfiguracionPerfil';
import { PaginaNuevaReservacion } from './paginas/PaginaNuevaReservacion';

const queryClientPorDefecto = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export function RutasAplicacion() {
  return (
    <Routes>
      <Route path="/ingresar" element={<PaginaIngresar />} />
      <Route path="/acceso/estado" element={<PaginaEstadoAcceso />} />

      <Route element={<DisenoAutenticado />}>
        <Route path="/" element={<Navigate to="/calendario" replace />} />
        <Route path="/calendario" element={<PaginaCalendario />} />
        <Route path="/reservaciones/nueva" element={<PaginaNuevaReservacion />} />
        <Route path="/configuracion-perfil" element={<PaginaConfiguracionPerfil />} />
      </Route>

      <Route path="*" element={<Navigate to="/calendario" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClientPorDefecto}>
      <ProveedorToast>
        <BrowserRouter>
          <RutasAplicacion />
        </BrowserRouter>
      </ProveedorToast>
    </QueryClientProvider>
  );
}

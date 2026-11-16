import type { Config } from 'tailwindcss';

/** Tokens visuales alineados con SIPREF principal. */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      colors: {
        navy: {
          DEFAULT: '#17304F',
          50: '#EEF2F7',
          100: '#D6DFEA',
          200: '#A9BBD1',
          300: '#7B96B7',
          400: '#4D6F96',
          500: '#2A4C74',
          600: '#1F3D60',
          700: '#17304F',
          800: '#11243C',
          900: '#0B1828',
        },
        amber: {
          DEFAULT: '#F5B73B',
          50: '#FEF7E7',
          100: '#FDEBC4',
          200: '#FBD98A',
          300: '#F8C85E',
          400: '#F5B73B',
          500: '#E29E17',
          600: '#B97E0E',
          700: '#8C5F0B',
        },
        fondo: '#F6F8FB',
        borde: '#E3E8EF',
        texto: {
          DEFAULT: '#1E293B',
          suave: '#64748B',
        },
        evento: {
          conferencia: '#2563EB',
          taller: '#059669',
          junta: '#7C3AED',
          examen: '#DC2626',
          otro: '#64748B',
        },
      },
      borderRadius: {
        card: '14px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(16, 24, 40, 0.04), 0 1px 3px rgba(16, 24, 40, 0.06)',
        flotante: '0 12px 32px rgba(16, 24, 40, 0.16)',
      },
    },
  },
  plugins: [],
} satisfies Config;

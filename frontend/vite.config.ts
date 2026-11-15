import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://localhost:8000',
      '/upload': 'http://localhost:8000',
      '/analyze': 'http://localhost:8000',
      '/jobs': 'http://localhost:8000',
      '/results': 'http://localhost:8000',
      '/samples': 'http://localhost:8000',
      '/download': 'http://localhost:8000',
      '/report': 'http://localhost:8000',
      '/evaluation': 'http://localhost:8000',
      '/health': 'http://localhost:8000',
    }
  }
});

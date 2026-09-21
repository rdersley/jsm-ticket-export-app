import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: 'static/portal-ui',
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});

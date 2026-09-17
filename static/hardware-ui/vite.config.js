import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'static/hardware-ui',
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});

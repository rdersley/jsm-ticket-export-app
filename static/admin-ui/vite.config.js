import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'static/admin-ui',
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});

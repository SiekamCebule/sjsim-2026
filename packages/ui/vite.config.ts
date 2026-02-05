import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const EXPERIMENTAL_SJSIM_FLAG =
  process.argv.includes('--experimental-sjsim') ||
  process.env.npm_config_experimental_sjsim === 'true';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@assets': path.resolve(__dirname, '../../assets'),
      '@sjsim/core': path.resolve(__dirname, '../core/src/index.ts'),
    },
  },
  define: {
    __EXPERIMENTAL_SJSIM__: JSON.stringify(EXPERIMENTAL_SJSIM_FLAG),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});

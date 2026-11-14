import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
        '@ai-assistant/core': path.resolve(__dirname, 'packages/core/src/index.ts'),
        '@ai-assistant/widget': path.resolve(__dirname, 'packages/widget/src/index.ts'),
        'react-is': path.resolve(__dirname, 'node_modules/react-is'),
      },
      dedupe: ['react', 'react-dom', 'react-is'],
    },
    optimizeDeps: {
      include: ['recharts', 'react-is'],
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});

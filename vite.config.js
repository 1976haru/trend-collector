import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 운영 시 Express 서버가 빌드된 SPA 를 / 에서 직접 서빙하므로 base 는 '/' 로 둡니다.
// Vite dev 서버에서는 /api/* 호출을 로컬 Express(:3000) 로 프록시합니다.
const SERVER_PORT = Number(process.env.PORT || 3000);

export default defineConfig({
  base: '/',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: `http://localhost:${SERVER_PORT}`,
        changeOrigin: true,
      },
    },
  },
  build: { outDir: 'dist', sourcemap: false },
});

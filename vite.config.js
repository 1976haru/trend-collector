import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages 배포 시 저장소 이름이 base 경로가 됩니다.
// 환경변수 VITE_BASE_PATH 가 있으면 우선 적용, 없으면 '/trend-collector/' 사용.
const base = process.env.VITE_BASE_PATH || '/trend-collector/';

export default defineConfig({
  base,
  plugins: [react()],
  server: { port: 5173, open: true },
  build: { outDir: 'dist', sourcemap: false },
});

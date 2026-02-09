import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    define: {
      // 환경 변수가 없을 경우 빈 문자열로 대체하여 undefined 에러 방지
      'process.env.API_KEY': JSON.stringify(env.VITE_GOOGLE_GENAI_API_KEY || ''),
      'process.env.VITE_TMAP_APP_KEY': JSON.stringify(env.VITE_TMAP_APP_KEY || ''),
    },
  };
});
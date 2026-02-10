import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Declare process to avoid TS error
declare var process: any;

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    // [보안] 환경 변수 주입 설정
    define: {
      'process.env.API_KEY': JSON.stringify(env.VITE_GOOGLE_GENAI_API_KEY || ''),
      'process.env.VITE_TMAP_APP_KEY': JSON.stringify(env.VITE_TMAP_APP_KEY || ''),
    },
    // [핵심] 로컬 개발 서버 프록시 (CORS 해결)
    server: {
      proxy: {
        '/api/opinet': {
          target: 'http://www.opinet.co.kr/api/avgAllPrice.do?out=json&code=F260209163',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/opinet/, ''),
        },
      },
    },
  };
});
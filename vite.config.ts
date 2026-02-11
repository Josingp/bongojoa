
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Declare process to avoid TS error
declare var process: any;

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    // [보안] 환경 변수 주입 설정
    // TMAP_APP_KEY는 이제 서버리스 함수에서 사용되므로 클라이언트에 주입하지 않습니다.
    // Gemini API Key는 현재 구조상 클라이언트에서 사용되므로 유지합니다.
    define: {
      'process.env.API_KEY': JSON.stringify(env.VITE_GOOGLE_GENAI_API_KEY || ''),
    },
    // Serverless Function 사용으로 인해 로컬 프록시 설정은 제거되었습니다.
    server: {
      // 필요한 경우 로컬 개발을 위한 설정을 추가할 수 있습니다.
    },
  };
});


import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // [보안] 클라이언트 코드에 환경 변수(API KEY)를 노출하지 않습니다.
  // 모든 API 요청은 Vercel Serverless Functions (/api/*)를 통해 프록시됩니다.
  server: {
    // 필요한 경우 로컬 개발을 위한 설정을 추가할 수 있습니다.
  },
});

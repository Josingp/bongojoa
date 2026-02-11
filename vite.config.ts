
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // [보안] 클라이언트 코드에 환경 변수(API KEY)를 노출하지 않습니다.
  // 모든 API 요청은 Vercel Serverless Functions (/api/*)를 통해 프록시됩니다.
  server: {
    port: 3000, // 카카오/Supabase 리다이렉트 설정과 일치하도록 포트 고정
    strictPort: true, // 3000번 포트가 사용 중이면 에러를 발생시켜 다른 포트로 넘어가지 않도록 함
  },
});

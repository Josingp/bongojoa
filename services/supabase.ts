import { createClient } from '@supabase/supabase-js';

// 1. 환경 변수 타입 안전성 확보 (보내주신 코드)
const supabaseUrl = import.meta.env?.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Supabase 환경 변수가 없습니다! .env 파일을 확인해주세요.");
}

// 2. 안전한 클라이언트 생성 (보내주신 코드)
const validUrl = (supabaseUrl && supabaseUrl.startsWith('http')) ? supabaseUrl : 'https://placeholder.supabase.co';
const validKey = supabaseAnonKey || 'placeholder';

export const supabase = createClient(validUrl, validKey);

// 3. [추가] 카카오 로그인 함수 (KOE205 에러 해결)
export const loginWithKakao = async () => {
  // 현재 페이지 주소 (로컬/배포 자동 인식)
  const redirectUrl = window.location.origin; 

  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'kakao',
    options: {
      redirectTo: redirectUrl,
      // [핵심] 에러 원인 해결:
      // 이메일(account_email)은 빼고, 설정해둔 '닉네임'과 '프로필 사진'만 달라고 요청합니다.
      scopes: 'profile_nickname profile_image', 
    },
  });
  
  if (error) {
    alert("로그인 에러: " + error.message);
    console.error("Kakao Login Error:", error);
  }
};

// 4. [추가] 로그아웃 함수
export const logout = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) {
    alert("로그아웃 실패: " + error.message);
  } else {
    // 로그아웃 후 화면 새로고침
    window.location.reload();
  }
};
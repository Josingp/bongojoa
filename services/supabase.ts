import { createClient } from '@supabase/supabase-js';

// Access environment variables safely using optional chaining to prevent TypeError
const supabaseUrl = import.meta.env?.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Supabase configuration missing! Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
}

// 2. 안전한 클라이언트 생성
const validUrl = (supabaseUrl && supabaseUrl.startsWith('http')) ? supabaseUrl : 'https://placeholder.supabase.co';
const validKey = supabaseAnonKey || 'placeholder';

export const supabase = createClient(validUrl, validKey);

// 3. [추가] 카카오 로그인 함수 (KOE205 에러 해결)
export const loginWithKakao = async () => {
  // window.location.origin 대신 실제 배포 주소를 직접 입력하여 고정합니다.
  const redirectUrl = 'https://www.bongojoa.com';

  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'kakao',
    options: {
      redirectTo: redirectUrl, // 로그인 후 무조건 이 주소로 복귀
      // email 스코프 제외를 위해 queryParams로 scope를 덮어씁니다.
      scopes: 'profile_nickname profile_image', 
      queryParams: {
        scope: 'profile_nickname profile_image'
      }
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
    window.location.reload();
  }
};
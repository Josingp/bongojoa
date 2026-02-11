import { createClient } from '@supabase/supabase-js';

// Define expected environment variables structure locally to avoid global conflict with Vite's client types
interface EnvVariables {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  [key: string]: any;
}

// Access environment variables with type assertion to bypass strict ImportMeta checks
const env = import.meta.env as unknown as EnvVariables;

const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Supabase configuration missing! Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
}

// 2. 안전한 클라이언트 생성
const validUrl = (supabaseUrl && supabaseUrl.startsWith('http')) ? supabaseUrl : 'https://placeholder.supabase.co';
const validKey = supabaseAnonKey || 'placeholder';

export const supabase = createClient(validUrl, validKey);

// 3. [추가] 카카오 로그인 함수 (KOE205 에러 해결)
export const loginWithKakao = async () => {
  const redirectUrl = window.location.origin; 

  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'kakao',
    options: {
      redirectTo: redirectUrl,
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
import { createClient } from '@supabase/supabase-js';

// Fix for TS errors: Define ImportMeta types locally as vite/client types seem missing or not picked up
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Vite 환경 변수에서 키 가져오기
const meta = import.meta as unknown as ImportMeta;
const supabaseUrl = meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Supabase configuration missing! Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
}

export const supabase = createClient(supabaseUrl || "", supabaseAnonKey || "");
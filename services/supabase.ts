
import { createClient } from '@supabase/supabase-js';

// Ensure TypeScript recognizes import.meta.env
declare global {
  interface ImportMeta {
    env: {
      [key: string]: string | undefined;
      VITE_SUPABASE_URL?: string;
      VITE_SUPABASE_ANON_KEY?: string;
    }
  }
}

// Safely access environment variables using optional chaining
// This prevents the "Cannot read properties of undefined (reading 'VITE_SUPABASE_URL')" error
// if import.meta.env is undefined (which can happen in some environments)
const supabaseUrl = import.meta.env?.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Supabase configuration missing! Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
}

// Provide valid fallback values to prevent createClient from crashing the entire app
const validUrl = (supabaseUrl && supabaseUrl.startsWith('http')) ? supabaseUrl : 'https://placeholder.supabase.co';
const validKey = supabaseAnonKey || 'placeholder';

export const supabase = createClient(validUrl, validKey);

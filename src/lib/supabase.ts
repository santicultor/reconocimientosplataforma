import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase = url && key && import.meta.env.VITE_DEMO !== '1' ? createClient(url, key) : null;
export const supabaseConfigured = !!supabase;

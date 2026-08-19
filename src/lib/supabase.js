import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase configuration. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in ' +
      '.env.local (copy .env.example — never commit .env.local).',
  )
}

// The one shared Supabase client for the whole app — every module that needs Supabase imports
// this instance rather than calling createClient() itself, so there is exactly one session/
// storage/realtime connection in the browser. supabaseAnonKey is the publishable client key,
// safe to ship in the bundle; it must never be the service_role/secret key.
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

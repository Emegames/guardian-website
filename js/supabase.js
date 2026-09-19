// =========================================
// EME GAMES - SUPABASE
// Cliente público para el frontend.
// NO colocar aquí service_role keys ni secretos.
// =========================================

const SUPABASE_URL = "https://hbttkdkqgyqbluuabyhk.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_XeQ7EQDJ5frzLvxVLrTGOQ_TrlMTgtn";

if (!window.supabase) {
  throw new Error("Supabase JS no está cargado. Revisa el <script> de @supabase/supabase-js.");
}

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }
);

window.EMESupabase = supabaseClient;

/* =========================================================
   supabaseClient.js — Instancia única del cliente de Supabase,
   usada por el resto de archivos (auth.js, catalogo.js, etc.).
   ========================================================= */

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* =========================================================
   config.js — Credenciales del proyecto de Supabase.
   Se cargan primero: config.js -> supabaseClient.js -> resto.

   Dónde conseguirlas: dashboard de Supabase -> tu proyecto ->
   Project Settings -> API -> "Project URL" y "anon public" key.
   La anon key es pública por diseño (va en el navegador); la
   seguridad real la dan las políticas RLS de la base de datos.
   ========================================================= */

const SUPABASE_URL = "https://fmklpauswfnmryqlglzi.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZta2xwYXVzd2ZubXJ5cWxnbHppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUxNzQ1MjIsImV4cCI6MjEwMDc1MDUyMn0.EPv6O1AMtVBCMrciOTTxXiA15N5xKC9o3scxw8g25JI";

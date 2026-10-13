/* =========================================================
   estado.js — Estado global mínimo de la aplicación: quién tiene
   la sesión iniciada y en qué modo está el formulario de auth.

   A diferencia de la versión con localStorage, usuarios/prendas/
   reservas ya no se cachean acá: cada vista los consulta directo
   a Supabase (con sus joins y filtros propios) cada vez que se
   pinta, así siempre se ve el estado real de la base de datos.
   ========================================================= */

let sesion = null;
let modo   = "login"; // modo actual del formulario de auth: "login" | "signup"

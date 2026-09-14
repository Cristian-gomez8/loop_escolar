/* =========================================================
   db.js — Pequeños helpers de DOM reutilizados por varias vistas.
   La persistencia real ahora vive en Supabase (ver
   supabaseClient.js y estado.js); este archivo ya no habla con
   localStorage.
   ========================================================= */

// Alias corto de querySelector, usado en todas las vistas.
const $ = (s) => document.querySelector(s);

// Llena un <select> con una lista de opciones.
// textoTodos: si se indica, agrega una opción inicial con value="" (para filtros "Todos").
// prefijo: texto que se antepone a cada opción visible (ej. "Talla ").
function llenar(sel, opciones, textoTodos, prefijo = "") {
  sel.innerHTML = "";
  if (textoTodos) sel.append(new Option(textoTodos, ""));
  opciones.forEach(o => sel.append(new Option(prefijo + o, o)));
}

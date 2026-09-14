/* =========================================================
   app.js — Punto de arranque de la aplicación.
   Se carga último: para este momento ya existen todas las
   funciones y el estado definidos por los demás archivos.
   ========================================================= */

// Oculta la pantalla de auth y muestra la app ya filtrada por rol.
async function mostrarApp() {
  $("#pantallaAuth").classList.add("oculto");
  $("#app").classList.remove("oculto");
  $("#usuarioActual").textContent = "Hola, " + sesion.nombre;
  actualizarNavPorRol();
  await pintarCatalogo();
}

// Si el navegador ya tenía una sesión de Supabase activa (token
// guardado por el propio SDK), la recupera y entra directo sin
// pedir login de nuevo. Si la cuenta ya no tiene perfil (ver
// eliminarUsuario en usuarios.js), cierra esa sesión huérfana.
async function restaurarSesion() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) return;
  const perfil = await cargarPerfil(session.user.id);
  if (!perfil) {
    await supabaseClient.auth.signOut();
    return;
  }
  sesion = { id: perfil.id, nombre: perfil.nombre, email: perfil.email, rol: perfil.rol };
}

(async () => {
  pintarModo();
  await restaurarSesion();
  if (sesion) await mostrarApp();
})();

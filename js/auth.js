/* =========================================================
   auth.js — Inicio de sesión con Supabase Auth.
   ========================================================= */

// Deja visible el formulario de inicio de sesión.
function pintarModo() {
  $("#btnAuth").textContent = "Ingresar";
  mensaje(null);
}

// Muestra un mensaje de error debajo del formulario de auth.
function mensaje(error) {
  $("#authError").textContent = error || "";
  $("#authError").classList.toggle("oculto", !error);
}

// Trae el perfil (nombre/email/rol) de la tabla usuarios para el
// id de auth dado; ese perfil es lo que arma el objeto "sesion".
// Devuelve null si no existe (por ejemplo, un admin borró la cuenta
// desde el panel de Usuarios: ver la nota en usuarios.js sobre por
// qué eso no elimina el login en sí, solo el perfil).
async function cargarPerfil(idAuth) {
  const { data, error } = await supabaseClient
    .from("usuarios")
    .select("id, nombre, email, rol")
    .eq("id", idAuth)
    .single();
  if (error) return null;
  return data;
}

$("#formAuth").addEventListener("submit", async (e) => {
  e.preventDefault();
  const tarjetaIdentidad = $("#identidad").value.trim();
  const pass   = $("#password").value;

  if (!tarjetaIdentidad || !pass) return mensaje("Completa la tarjeta de identidad y la clave.");
  if (!/^[0-9]{1,20}$/.test(tarjetaIdentidad)) return mensaje("Escribe una tarjeta de identidad válida.");
  if (pass.length < 6) return mensaje("La clave debe tener al menos 6 caracteres.");

  $("#btnAuth").disabled = true;
  try {
    const { data, error } = await supabaseClient.functions.invoke("iniciar_sesion_identidad", {
      body: { tarjetaIdentidad, password: pass }
    });
    if (error || !data?.session?.access_token || !data?.session?.refresh_token) {
      return mensaje("Tarjeta de identidad o clave incorrectas.");
    }
    const { data: authData, error: sessionError } = await supabaseClient.auth.setSession(data.session);
    if (sessionError || !authData.session) return mensaje("No se pudo iniciar sesión. Intenta de nuevo.");
    const perfil = await cargarPerfil(authData.session.user.id);
    if (!perfil) {
      await supabaseClient.auth.signOut();
      return mensaje("Esta cuenta ya no está activa. Contacta a un administrador.");
    }
    iniciarSesion(perfil);
  } finally {
    $("#btnAuth").disabled = false;
  }
});

// Guarda la sesión activa (incluyendo el rol, usado por navegacion.js
// para mostrar/ocultar las vistas de almacén y usuarios) y muestra la app.
function iniciarSesion(perfil) {
  sesion = { id: perfil.id, nombre: perfil.nombre, email: perfil.email, rol: perfil.rol };
  $("#formAuth").reset();
  mensaje(null);
  mostrarApp();
}

$("#btnSalir").onclick = async () => {
  await supabaseClient.auth.signOut();
  sesion = null;
  $("#app").classList.add("oculto");
  $("#pantallaAuth").classList.remove("oculto");
};

// Mostrar / ocultar contraseña con iconos SVG
document.addEventListener('DOMContentLoaded', () => {
  const toggleBtn = document.getElementById('togglePassword');
  const passwordInput = document.getElementById('password');

  if (toggleBtn && passwordInput) {
    toggleBtn.addEventListener('click', () => {
      const estaOculta = passwordInput.type === 'password';

      if (estaOculta) {
        passwordInput.type = 'text';
        toggleBtn.classList.add('mostrar-password');
        toggleBtn.setAttribute('aria-label', 'Ocultar contraseña');
      } else {
        passwordInput.type = 'password';
        toggleBtn.classList.remove('mostrar-password');
        toggleBtn.setAttribute('aria-label', 'Mostrar contraseña');
      }
    });
  }
});
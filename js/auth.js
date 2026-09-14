/* =========================================================
   auth.js — Pantalla de ingreso / registro (login y signup) con
   Supabase Auth. El registro público siempre crea usuarios con
   rol "usuario" (lo asigna el trigger on_auth_user_created en la
   base de datos): los roles "almacen"/"admin" solo se asignan
   desde el panel de Usuarios (ver usuarios.js), nunca desde aquí.
   ========================================================= */

// Actualiza el formulario según el modo actual ("login" o "signup"):
// pestaña activa, si se muestra el campo Nombre, y el texto del botón.
function pintarModo() {
  $("#tabLogin").classList.toggle("activo", modo === "login");
  $("#tabSignup").classList.toggle("activo", modo === "signup");
  $("#campoNombre").classList.toggle("oculto", modo !== "signup");
  $("#nombre").required = modo === "signup";
  $("#btnAuth").textContent = modo === "login" ? "Ingresar" : "Crear cuenta";
  mensaje(null, null);
}

// Muestra un mensaje de error o de éxito debajo del formulario de auth.
function mensaje(error, ok) {
  $("#authError").textContent = error || "";
  $("#authError").classList.toggle("oculto", !error);
  $("#authOk").textContent = ok || "";
  $("#authOk").classList.toggle("oculto", !ok);
}

$("#tabLogin").onclick  = () => { modo = "login";  pintarModo(); };
$("#tabSignup").onclick = () => { modo = "signup"; pintarModo(); };

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
  const nombre = $("#nombre").value.trim();
  const email  = $("#email").value.trim().toLowerCase();
  const pass   = $("#password").value;

  if (!email || !pass) return mensaje("Completa el correo y la contraseña.");
  if (pass.length < 6) return mensaje("La contraseña debe tener al menos 6 caracteres.");

  $("#btnAuth").disabled = true;
  try {
    if (modo === "signup") {
      if (!nombre) return mensaje("Escribe tu nombre completo.");
      const { data, error } = await supabaseClient.auth.signUp({
        email, password: pass, options: { data: { nombre } }
      });
      if (error) return mensaje(error.message);
      if (!data.session) {
        // Solo ocurre si "Confirm email" sigue activo en el proyecto.
        return mensaje(null, "Cuenta creada. Revisa tu correo para confirmarla antes de ingresar.");
      }
      const perfil = await cargarPerfil(data.user.id);
      if (!perfil) return mensaje("La cuenta se creó pero no se pudo cargar el perfil. Intenta de nuevo.");
      iniciarSesion(perfil);
    } else {
      const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password: pass });
      if (error) return mensaje("Correo o contraseña incorrectos.");
      const perfil = await cargarPerfil(data.user.id);
      if (!perfil) {
        await supabaseClient.auth.signOut();
        return mensaje("Esta cuenta ya no está activa. Contacta a un administrador.");
      }
      iniciarSesion(perfil);
    }
  } finally {
    $("#btnAuth").disabled = false;
  }
});

// Guarda la sesión activa (incluyendo el rol, usado por navegacion.js
// para mostrar/ocultar las vistas de almacén y usuarios) y muestra la app.
function iniciarSesion(perfil) {
  sesion = { id: perfil.id, nombre: perfil.nombre, email: perfil.email, rol: perfil.rol };
  $("#formAuth").reset();
  mensaje(null, null);
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
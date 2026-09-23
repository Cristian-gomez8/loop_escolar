/* =========================================================
   usuarios.js — CRUD de usuarios (rol "admin"): listar, crear,
   cambiar rol y eliminar cuentas, contra la tabla "usuarios" de
   Supabase. Todo desde el cliente, sin Edge Functions ni
   service_role key:

   - Crear usuario llama a auth.signUp() con un cliente Supabase
     aparte (ver clienteAltas más abajo) que no persiste sesión,
     así no se reemplaza la sesión del admin que está creando la
     cuenta. El trigger de la base ya crea el perfil con
     rol="usuario"; acá solo se actualiza el rol elegido.
   - Eliminar solo borra la fila en "usuarios" (el admin sí tiene
     permiso vía RLS). La cuenta de acceso en Supabase Auth queda
     intacta -- borrarla de verdad requiere la Admin API (service
     role), así que hay que hacerlo a mano desde Authentication →
     Users en el dashboard de Supabase si se quiere eliminar del
     todo. Como el login vuelve a fallar sin perfil (ver auth.js),
     la cuenta queda igualmente inutilizable para entrar a la app.

   Reglas de seguridad para no dejar la app sin ningún administrador
   (no eliminar la propia cuenta; no eliminar ni degradar al último
   admin) se validan aquí para dar feedback inmediato, y de nuevo en
   la base de datos (trigger proteger_ultimo_admin) como garantía real.
   ========================================================= */

llenar($("#uRol"), ROLES);

// Cliente aparte solo para dar de alta usuarios desde este panel:
// persistSession/autoRefreshToken en false para que nunca toque
// localStorage ni la sesión activa del admin en supabaseClient.
const clienteAltas = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

// Copia local de la tabla usuarios, refrescada en cada pintarUsuarios().
let usuarios = [];

// Cuenta cuántos usuarios tienen rol "admin" (para no permitir
// que la app se quede sin ninguno).
function contarAdmins() {
  return usuarios.filter(u => u.rol === "admin").length;
}

// Trae las cuentas reales de Authentication junto con sus perfiles.
// La RPC también incluye cuentas cuyo perfil público aún no exista.
async function pintarUsuarios() {
  const { data, error } = await supabaseClient.rpc("listar_usuarios_admin");
  if (error) {
    console.error(error);
    $("#vacioUsuarios").textContent = "No se pudo cargar la lista de usuarios.";
    return;
  }
  usuarios = data;

  const ul = $("#listaUsuarios");
  ul.innerHTML = "";
  $("#vacioUsuarios").textContent = usuarios.length ? "" : "No hay usuarios registrados.";

  usuarios
    .slice()
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
    .forEach(u => {
      const li = document.createElement("li");
      li.className = "reserva";
      li.innerHTML = `
        <div class="mr">
          <h2 style="margin:0;font-size:1.05rem"></h2>
          <p class="nota" style="margin:.15rem 0 0"></p>
        </div>
        <select aria-label="Rol de ${u.nombre}"></select>
        <button class="btn-peligro">Eliminar</button>`;
      li.querySelector("h2").textContent = u.nombre;
      li.querySelector(".nota").textContent = u.email;
      const sel = li.querySelector("select");
      ROLES.forEach(r => sel.append(new Option(r, r, false, r === u.rol)));
      sel.onchange = () => cambiarRol(u, sel.value);
      li.querySelector("button").onclick = () => eliminarUsuario(u);
      ul.append(li);
    });
}

// Cambia el rol de un usuario. Bloquea la operación si dejaría al
// sistema sin ningún administrador. Si el usuario editado es quien
// tiene la sesión activa, también actualiza la sesión y la navegación.
async function cambiarRol(u, nuevoRol) {
  if (u.rol === "admin" && nuevoRol !== "admin" && contarAdmins() <= 1) {
    alert("No se puede quitar el rol de administrador: debe existir al menos un admin.");
    pintarUsuarios();
    return;
  }
  const { error } = await supabaseClient.from("usuarios").update({ rol: nuevoRol }).eq("id", u.id);
  if (error) {
    alert("No se pudo cambiar el rol: " + error.message);
    pintarUsuarios();
    return;
  }
  if (sesion && sesion.id === u.id) {
    sesion.rol = nuevoRol;
    actualizarNavPorRol();
  }
  pintarUsuarios();
}

// Elimina la cuenta completa mediante una función RPC segura: borra auth.users
// y el perfil relacionado en public.usuarios. Bloquea la auto-eliminación y
// la eliminación del último administrador.
async function eliminarUsuario(u) {
  if (sesion && sesion.id === u.id) {
    alert("No puedes eliminar tu propia cuenta mientras tienes la sesión iniciada.");
    return;
  }
  if (u.rol === "admin" && contarAdmins() <= 1) {
    alert("No se puede eliminar: debe existir al menos un administrador.");
    return;
  }
  if (!confirm(`¿Eliminar la cuenta de ${u.nombre} (${u.email})? Ya no podrá entrar a la app.`)) return;

  const { error } = await supabaseClient.rpc("eliminar_usuario", {
    p_usuario_id: u.id
  });
  if (error) {
    alert("No se pudo eliminar el usuario: " + error.message);
    return;
  }
  pintarUsuarios();
}

// Alta manual de usuarios desde el panel de administración: a
// diferencia del registro público (auth.js), aquí sí se puede elegir
// el rol directamente (por ejemplo, para crear una cuenta de almacén).
$("#formUsuarioNuevo").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#usuarioError").classList.add("oculto");
  const nombre = $("#uNombre").value.trim();
  const email  = $("#uEmail").value.trim().toLowerCase();
  const pass   = $("#uPass").value;
  const rol    = $("#uRol").value;

  if (!nombre || !email || !pass) {
    $("#usuarioError").textContent = "Completa nombre, correo y contraseña.";
    $("#usuarioError").classList.remove("oculto");
    return;
  }
  if (pass.length < 6) {
    $("#usuarioError").textContent = "La contraseña debe tener al menos 6 caracteres.";
    $("#usuarioError").classList.remove("oculto");
    return;
  }

  const { data, error } = await clienteAltas.auth.signUp({
    email, password: pass, options: { data: { nombre } }
  });
  if (error) {
    $("#usuarioError").textContent = "No se pudo crear el usuario: " + error.message;
    $("#usuarioError").classList.remove("oculto");
    return;
  }

  // El trigger on_auth_user_created ya creó el perfil con rol="usuario";
  // acá se fija el rol elegido en el formulario, si es distinto.
    if (rol !== "usuario") {
      const { error: errRol } = await supabaseClient.from("usuarios").update({ rol }).eq("id", data.user.id);
      if (errRol) {
        $("#usuarioError").textContent = "El usuario se creó, pero no se pudo fijar su rol: " + errRol.message;
        $("#usuarioError").classList.remove("oculto");
        pintarUsuarios();
        return;
      }
    }

    $("#formUsuarioNuevo").reset();
  pintarUsuarios();
});

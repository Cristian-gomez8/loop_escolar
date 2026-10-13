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
  return usuarios.filter(u => u.rol === "admin" && u.estado_aprobacion === "aprobado").length;
}

function configurarToggleClave(input, button) {
  button.addEventListener("click", () => {
    const mostrar = input.type === "password";
    input.type = mostrar ? "text" : "password";
    button.textContent = mostrar ? "Ocultar" : "Mostrar";
    button.setAttribute("aria-label", `${mostrar ? "Ocultar" : "Mostrar"} contraseña`);
    button.setAttribute("aria-pressed", String(mostrar));
  });
}

configurarToggleClave($("#uPass"), $("#toggleUPass"));
configurarTipoPersona($("#uTipoUsuario"), $("#uCampoNombreEstudiante"), $("#uNombreEstudiante"));

function renderizarListaUsuarios() {
  const ul = $("#listaUsuarios");
  const busqueda = $("#buscarUsuario").value.trim().toLocaleLowerCase();
  const filtrados = usuarios.filter(u =>
    `${u.nombre} ${u.email}`.toLocaleLowerCase().includes(busqueda)
  );

  ul.innerHTML = "";
  if (!usuarios.length) {
    $("#vacioUsuarios").textContent = "No hay usuarios registrados.";
  } else if (!filtrados.length) {
    $("#vacioUsuarios").textContent = "No se encontraron usuarios.";
  } else {
    $("#vacioUsuarios").textContent = "";
  }

  filtrados
    .slice()
    .sort((a, b) => Number(b.estado_aprobacion === "pendiente") - Number(a.estado_aprobacion === "pendiente") || a.nombre.localeCompare(b.nombre))
    .forEach(u => {
      const li = document.createElement("li");
      li.className = "reserva";
      li.innerHTML = `
        <div class="mr">
          <h2 style="margin:0;font-size:1.05rem"></h2>
          <p class="nota" style="margin:.15rem 0 0"></p>
        </div>
        <span class="estado-aprobacion"></span>
        <select aria-label="Rol del usuario"></select>
        <button class="btn-sec btn-editar-usuario" type="button">Editar perfil</button>
        <button class="btn-peligro" type="button">Eliminar</button>
        <div class="acciones-aprobacion"></div>
        <div class="edicion-usuario oculto">
          <label>Nombre completo</label>
          <input class="editar-nombre" aria-label="Nombre completo" maxlength="100" autocomplete="name" />
          <label>Tipo de usuario</label>
          <select class="editar-tipo-usuario" aria-label="Tipo de usuario">
            <option value="estudiante">Estudiante</option>
            <option value="padre_familia">Padre de familia</option>
          </select>
          <div class="editar-campo-estudiante oculto">
            <label>Nombre del estudiante del que es padre de familia</label>
            <input class="editar-nombre-estudiante" aria-label="Nombre del estudiante a cargo" maxlength="150" />
          </div>
          <label>Correo electrónico</label>
          <input class="editar-email" aria-label="Correo electrónico" type="email" maxlength="255" autocomplete="email" />
          <label>Nueva contraseña</label>
          <div class="input-con-toggle">
            <button type="button" class="btn-ver-clave" aria-label="Mostrar nueva contraseña" aria-pressed="false">Mostrar</button>
            <input class="editar-clave" aria-label="Nueva contraseña" type="password" minlength="6" autocomplete="new-password" />
          </div>
          <p class="nota">Deja la contraseña en blanco si no quieres cambiarla.</p>
          <p class="error error-edicion oculto"></p>
          <div class="acciones-edicion">
            <button class="btn" type="button">Guardar cambios</button>
            <button class="btn-sec btn-cancelar-edicion" type="button">Cancelar</button>
          </div>
        </div>`;
      li.querySelector("h2").textContent = u.nombre;
      li.querySelector(".nota").textContent = u.tipo_usuario === "padre_familia"
        ? `${u.email} · Padre de familia de ${u.nombre_estudiante || "estudiante sin especificar"}`
        : `${u.email} · ${u.tipo_usuario === "estudiante" ? "Estudiante" : "Tipo sin especificar"}`;
      const estado = u.estado_aprobacion || "pendiente";
      const etiquetaEstado = li.querySelector(".estado-aprobacion");
      etiquetaEstado.textContent = estado === "aprobado"
        ? "Aprobado"
        : estado === "rechazado" ? "Rechazado" : "Pendiente de aprobación";
      etiquetaEstado.classList.add(`estado-${estado}`);
      if (estado === "pendiente") {
        const acciones = li.querySelector(".acciones-aprobacion");
        const aprobar = document.createElement("button");
        aprobar.type = "button";
        aprobar.className = "btn";
        aprobar.textContent = "Aprobar";
        aprobar.onclick = () => resolverSolicitud(u, "aprobado");
        const rechazar = document.createElement("button");
        rechazar.type = "button";
        rechazar.className = "btn-peligro";
        rechazar.textContent = "Rechazar";
        rechazar.onclick = () => resolverSolicitud(u, "rechazado");
        acciones.append(aprobar, rechazar);
      }
      const sel = li.querySelector("select");
      ROLES.forEach(r => sel.append(new Option(r, r, false, r === u.rol)));
      sel.onchange = () => cambiarRol(u, sel.value);
      const panel = li.querySelector(".edicion-usuario");
      const nombre = li.querySelector(".editar-nombre");
      const tipoUsuario = li.querySelector(".editar-tipo-usuario");
      const campoNombreEstudiante = li.querySelector(".editar-campo-estudiante");
      const nombreEstudiante = li.querySelector(".editar-nombre-estudiante");
      const email = li.querySelector(".editar-email");
      const clave = li.querySelector(".editar-clave");
      nombre.value = u.nombre || "";
      tipoUsuario.value = u.tipo_usuario || "estudiante";
      nombreEstudiante.value = u.nombre_estudiante || "";
      configurarTipoPersona(tipoUsuario, campoNombreEstudiante, nombreEstudiante);
      email.value = u.email || "";
      configurarToggleClave(clave, li.querySelector(".btn-ver-clave"));
      li.querySelector(".btn-editar-usuario").onclick = () => panel.classList.toggle("oculto");
      li.querySelector(".btn-cancelar-edicion").onclick = () => panel.classList.add("oculto");
      li.querySelector(".acciones-edicion .btn").onclick = () =>
        guardarPerfilUsuario(u, nombre.value, email.value, tipoUsuario.value, nombreEstudiante.value, clave.value, li.querySelector(".error-edicion"));
      li.querySelector(".btn-peligro").onclick = () => eliminarUsuario(u);
      ul.append(li);
    });
}

  async function resolverSolicitud(u, estado) {
    const { error } = await supabaseClient.rpc("resolver_solicitud_usuario", {
      p_usuario_id: u.id,
      p_estado: estado
    });
    if (error) {
      alert(`No se pudo ${estado === "aprobado" ? "aprobar" : "rechazar"} la solicitud: ${error.message}`);
      return;
    }
    pintarUsuarios();
  }

async function guardarPerfilUsuario(u, nombre, email, tipoUsuario, nombreEstudiante, password, errorEl) {
  nombre = nombre.trim();
  email = email.trim().toLowerCase();
  nombreEstudiante = nombreEstudiante.trim();
  errorEl.classList.add("oculto");

  if (!nombre || !email) {
    errorEl.textContent = "Completa el nombre y el correo electrónico.";
    errorEl.classList.remove("oculto");
    return;
  }
  if (!tipoUsuario || (tipoUsuario === "padre_familia" && !nombreEstudiante)) {
    errorEl.textContent = tipoUsuario === "padre_familia"
      ? "Escribe el nombre del estudiante a cargo."
      : "Selecciona el tipo de usuario.";
    errorEl.classList.remove("oculto");
    return;
  }
  if (password && password.length < 6) {
    errorEl.textContent = "La nueva contraseña debe tener al menos 6 caracteres.";
    errorEl.classList.remove("oculto");
    return;
  }

  const { error: tipoError } = await supabaseClient
    .from("usuarios")
    .update({
      tipo_usuario: tipoUsuario,
      nombre_estudiante: tipoUsuario === "padre_familia" ? nombreEstudiante : null
    })
    .eq("id", u.id);
  if (tipoError) {
    errorEl.textContent = `No se pudo guardar el tipo de usuario: ${tipoError.message}`;
    errorEl.classList.remove("oculto");
    return;
  }

  const cambios = { usuarioId: u.id, nombre, email };
  if (password) cambios.password = password;
  const { error } = await supabaseClient.functions.invoke("editar_usuario_admin", { body: cambios });
  if (error) {
    let detalle = error.message;
    if (error.context && typeof error.context.clone === "function") {
      try {
        const respuesta = await error.context.clone().json();
        if (respuesta.error) detalle = respuesta.error;
      } catch {}
    }
    errorEl.textContent = `No se pudo guardar el perfil: ${detalle}`;
    errorEl.classList.remove("oculto");
    return;
  }

  if (sesion && sesion.id === u.id) {
    sesion.nombre = nombre;
    sesion.email = email;
    actualizarNavPorRol();
  }
  pintarUsuarios();
}

// Trae las cuentas reales de Authentication junto con sus perfiles.
// La RPC también incluye cuentas cuyo perfil público aún no exista.
async function pintarUsuarios() {
  let { data, error } = await supabaseClient.rpc("listar_usuarios_admin");
  if (error) {
    console.warn("No se pudo consultar listar_usuarios_admin; se usarán los perfiles públicos.", error);
    ({ data, error } = await supabaseClient
      .from("usuarios")
      .select("id, nombre, email, rol, tipo_usuario, nombre_estudiante, estado_aprobacion, creado_en")
      .order("creado_en", { ascending: false }));
  }

  if (error) {
    $("#listaUsuarios").innerHTML = "";
    console.error(error);
    $("#vacioUsuarios").textContent = `No se pudo cargar la lista de usuarios: ${error.message}`;
    return;
  }
  usuarios = data || [];
  renderizarListaUsuarios();
}

$("#buscarUsuario").addEventListener("input", renderizarListaUsuarios);

// Cambia el rol de un usuario. Bloquea la operación si dejaría al
// sistema sin ningún administrador. Si el usuario editado es quien
// tiene la sesión activa, también actualiza la sesión y la navegación.
async function cambiarRol(u, nuevoRol) {
  if (u.rol === "admin" && u.estado_aprobacion === "aprobado" && nuevoRol !== "admin" && contarAdmins() <= 1) {
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
  if (u.rol === "admin" && u.estado_aprobacion === "aprobado" && contarAdmins() <= 1) {
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
  const tipoUsuario = $("#uTipoUsuario").value;
  const nombreEstudiante = $("#uNombreEstudiante").value.trim();
  const email  = $("#uEmail").value.trim().toLowerCase();
  const pass   = $("#uPass").value;
  const rol    = $("#uRol").value;

  if (!nombre || !email || !pass) {
    $("#usuarioError").textContent = "Completa nombre, correo y contraseña.";
    $("#usuarioError").classList.remove("oculto");
    return;
  }
  if (!tipoUsuario || (tipoUsuario === "padre_familia" && !nombreEstudiante)) {
    $("#usuarioError").textContent = tipoUsuario === "padre_familia"
      ? "Escribe el nombre del estudiante a cargo."
      : "Selecciona el tipo de usuario.";
    $("#usuarioError").classList.remove("oculto");
    return;
  }
  if (pass.length < 6) {
    $("#usuarioError").textContent = "La contraseña debe tener al menos 6 caracteres.";
    $("#usuarioError").classList.remove("oculto");
    return;
  }

  const { data, error } = await clienteAltas.auth.signUp({
    email,
    password: pass,
    options: {
      data: {
        nombre,
        tipo_usuario: tipoUsuario,
        nombre_estudiante: tipoUsuario === "padre_familia" ? nombreEstudiante : null
      }
    }
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

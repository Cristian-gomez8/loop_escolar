/* =========================================================
   catalogo.js — Vista del catálogo de prendas.
   Para el resto de roles solo muestra prendas ya aprobadas por
   almacén ("disponible"/"reservada"): las "pendiente" y "rechazada"
   se gestionan en la vista de almacén (almacen.js).
   Para el rol "admin" muestra TODAS las prendas (cualquier estado)
   y agrega CRUD directo sobre el catálogo: crear, editar y eliminar
   una prenda sin pasar por el flujo de donación/aprobación. El admin
   no cambia el estado desde aquí (eso lo siguen gobernando donar →
   pendiente, almacén → aceptar/rechazar y reservar/cancelar); una
   prenda creada por el admin nace directamente "disponible".
   ========================================================= */

llenar($("#filtroTipo"),  TIPOS,  "Todos los tipos");
llenar($("#filtroTalla"), TALLAS, "Todas las tallas", "Talla ");
$("#filtroTipo").onchange = pintarCatalogo;
$("#filtroTalla").onchange = pintarCatalogo;

// Selects del formulario de alta/edición (sin opción "Todos": aquí se
// elige un valor concreto para la prenda, igual que en donacion.js).
llenar($("#pTipo"),  TIPOS);
llenar($("#pTalla"), TALLAS);

// Imagen de la prenda que se está creando/editando en el formulario
// de admin: null (sin foto), string (URL ya subida, sin cambios) o
// Blob (foto nueva elegida, pendiente de subir al guardar).
let imagenPrendaAdmin = null;

// Copia local de la última carga, para poder ubicar por id la prenda
// sobre la que actúan abrirFormularioPrenda/eliminarPrenda/reservar
// sin volver a pedirla a Supabase.
let prendas = [];

$("#pImagen").addEventListener("change", async (e) => {
  const archivo = e.target.files[0];
  if (!archivo) return;
  try {
    imagenPrendaAdmin = await comprimirImagen(archivo);
    $("#pImagenPreview").src = URL.createObjectURL(imagenPrendaAdmin);
    $("#pImagenPreview").classList.remove("oculto");
  } catch {
    $("#prendaError").textContent = "No se pudo procesar la imagen. Intenta con otra foto.";
    $("#prendaError").classList.remove("oculto");
  }
});

// Abre el formulario de admin. Sin argumento: modo "crear" (vacío).
// Con una prenda: modo "editar" (precarga sus datos).
function abrirFormularioPrenda(prenda) {
  $("#prendaError").classList.add("oculto");
  if (prenda) {
    $("#pIdEditar").value = prenda.id;
    $("#pTipo").value = prenda.tipo;
    $("#pTalla").value = prenda.talla;
    $("#pDefectos").value = prenda.defectos || "";
    imagenPrendaAdmin = prenda.imagen_url || null;
    $("#pImagenPreview").classList.toggle("oculto", !imagenPrendaAdmin);
    if (imagenPrendaAdmin) $("#pImagenPreview").src = imagenPrendaAdmin;
    $("#btnGuardarPrenda").textContent = "Guardar cambios";
  } else {
    $("#formPrendaAdmin").reset();
    $("#pIdEditar").value = "";
    imagenPrendaAdmin = null;
    $("#pImagenPreview").classList.add("oculto");
    $("#btnGuardarPrenda").textContent = "Crear prenda";
  }
  $("#formPrendaAdmin").classList.remove("oculto");
  $("#formPrendaAdmin").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function cerrarFormularioPrenda() {
  $("#formPrendaAdmin").classList.add("oculto");
  $("#formPrendaAdmin").reset();
  imagenPrendaAdmin = null;
}

$("#btnNuevaPrenda").onclick = () => abrirFormularioPrenda(null);
$("#btnCancelarPrenda").onclick = () => cerrarFormularioPrenda();

$("#formPrendaAdmin").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#prendaError").classList.add("oculto");
  const idEditar = $("#pIdEditar").value;
  const btn = $("#btnGuardarPrenda");
  btn.disabled = true;

  try {
    let imagen_url = typeof imagenPrendaAdmin === "string" ? imagenPrendaAdmin : null;
    if (imagenPrendaAdmin instanceof Blob) {
      imagen_url = await subirImagenPrenda(imagenPrendaAdmin);
    }

    const datos = {
      tipo: $("#pTipo").value,
      talla: $("#pTalla").value,
      defectos: $("#pDefectos").value.trim().slice(0, 300) || null,
      imagen_url
    };

    if (idEditar) {
      const anterior = prendas.find(x => x.id === idEditar);
      const { error } = await supabaseClient.from("prendas").update(datos).eq("id", idEditar);
      if (error) throw error;
      if (anterior && anterior.imagen_url && anterior.imagen_url !== imagen_url) {
        await borrarImagenPrenda(anterior.imagen_url);
      }
    } else {
      const { error } = await supabaseClient.from("prendas").insert({
        ...datos, estado: "disponible", donante_id: sesion.id
      });
      if (error) throw error;
    }

    cerrarFormularioPrenda();
    await pintarCatalogo();
  } catch (err) {
    $("#prendaError").textContent = "No se pudo guardar: " + err.message;
    $("#prendaError").classList.remove("oculto");
  } finally {
    btn.disabled = false;
  }
});

// Elimina una prenda del catálogo (solo admin). Su imagen en Storage y
// las reservas asociadas se limpian junto con ella (ON DELETE CASCADE
// en reservas.prenda_id).
async function eliminarPrenda(p) {
  if (!confirm(`¿Eliminar "${p.tipo} · Talla ${p.talla}" del catálogo? Esta acción no se puede deshacer.`)) return;
  const { error } = await supabaseClient.from("prendas").delete().eq("id", p.id);
  if (error) { alert("No se pudo eliminar: " + error.message); return; }
  if (p.imagen_url) await borrarImagenPrenda(p.imagen_url);
  await pintarCatalogo();
}

// Trae todas las prendas visibles para el rol actual (RLS ya filtra a
// nivel de fila: no-admin solo ve disponible/reservada + lo propio;
// aquí además se ocultan las propias pendiente/rechazada para no-admin,
// igual que hacía la versión con localStorage).
async function obtenerPrendasVisibles() {
  const { data, error } = await supabaseClient
    .from("prendas").select("*").order("creada", { ascending: false });
  if (error) { console.error(error); return []; }
  const esAdmin = sesion && sesion.rol === "admin";
  return esAdmin ? data : data.filter(p => p.estado === "disponible" || p.estado === "reservada");
}

// Renderiza la lista de prendas según los filtros de tipo/talla,
// mostrando la más reciente primero.
async function pintarCatalogo() {
  const esAdmin = sesion && sesion.rol === "admin";
  $("#btnNuevaPrenda").classList.toggle("oculto", !esAdmin);

  const tipo = $("#filtroTipo").value, talla = $("#filtroTalla").value;
  const visibles = await obtenerPrendasVisibles();
  prendas = visibles;
  const lista = visibles.filter(p => (!tipo || p.tipo === tipo) && (!talla || p.talla === talla));

  const ul = $("#listaPrendas");
  ul.innerHTML = "";
  $("#vacioCatalogo").textContent = lista.length ? "" :
    (visibles.length ? "No hay prendas con esos filtros." : "Aún no hay prendas donadas. Sé el primero en donar.");

  lista.forEach(p => {
    const li = document.createElement("li");
    li.className = "prenda";
    const disponible = p.estado === "disponible";
    const claseChip = disponible ? "" : p.estado === "rechazada" ? "rojo" : "gris";
    li.innerHTML = `
      ${p.imagen_url ? '<img class="miniatura" alt="Foto de la prenda">' : ""}
      <div class="fila">
        <div>
          <h2></h2>
          <p class="nota" style="margin:.15rem 0 0">Talla </p>
        </div>
        <span class="chip ${claseChip}"></span>
      </div>
      <p class="nota"></p>
      <button class="btn" ${disponible ? "" : "disabled"}>${disponible ? "Reservar" : "No disponible"}</button>
      ${esAdmin ? `
      <div class="fila" style="margin-top:.5rem;gap:.5rem">
        <button type="button" class="btn-sec" style="flex:1">Editar</button>
        <button type="button" class="btn-peligro" style="flex:1">Eliminar</button>
      </div>` : ""}`;
    if (p.imagen_url) li.querySelector(".miniatura").src = p.imagen_url;
    li.querySelector("h2").textContent = p.tipo;
    li.querySelector(".nota").textContent = "Talla " + p.talla;
    li.querySelector(".chip").textContent = p.estado;
    li.querySelectorAll(".nota")[1].textContent = p.defectos ? "Defectos: " + p.defectos : "Sin defectos reportados";
    if (disponible) li.querySelector("button").onclick = () => reservar(p);
    if (esAdmin) {
      li.querySelector(".btn-sec").onclick = () => abrirFormularioPrenda(p);
      li.querySelector(".btn-peligro").onclick = () => eliminarPrenda(p);
    }
    ul.append(li);
  });
}

// Reserva una prenda disponible para el usuario en sesión: llama al
// RPC reservar_prenda, que de forma atómica pasa la prenda a
// "reservada" y crea la reserva con fecha de entrega una semana
// después de hoy (evita que dos personas reserven la misma prenda
// a la vez, algo que un simple update+insert desde el cliente no podría).
async function reservar(p) {
  const entrega = new Date();
  entrega.setDate(entrega.getDate() + 7);
  const fecha_entrega = entrega.toISOString().slice(0, 10);

  const { error } = await supabaseClient.rpc("reservar_prenda", {
    p_prenda_id: p.id, p_fecha_entrega: fecha_entrega
  });
  if (error) { alert("No se pudo reservar: " + error.message); return; }
  await pintarCatalogo();
}

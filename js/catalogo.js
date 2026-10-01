/* =========================================================
   catalogo.js — Vista del catálogo de prendas.
  Solo muestra prendas "disponible", para que las reservadas no
  sigan apareciendo en el catálogo. Las pendientes y rechazadas se
  gestionan en almacén; el admin puede crear, editar y eliminar prendas.
   ========================================================= */

llenar($("#filtroTipo"),  TIPOS,  "Todos los tipos");
llenar($("#filtroTalla"), TALLAS, "Todas las tallas", "Talla ");
$("#filtroTipo").onchange = pintarCatalogo;
$("#filtroTalla").onchange = pintarCatalogo;

// El catálogo muestra únicamente prendas que todavía se pueden reservar.
async function obtenerPrendasVisibles() {
  const { data, error } = await supabaseClient
    .from("prendas").select("*").order("creada", { ascending: false });
  if (error) { console.error(error); return []; }
  return data.filter(p => p.estado === "disponible");
}

// Renderiza la lista de prendas según los filtros de tipo/talla,
// mostrando la más reciente primero.
async function pintarCatalogo() {
  const tipo = $("#filtroTipo").value, talla = $("#filtroTalla").value;
  const visibles = await obtenerPrendasVisibles();
  const lista = visibles.filter(p => (!tipo || p.tipo === tipo) && (!talla || p.talla === talla));

  const ul = $("#listaPrendas");
  ul.innerHTML = "";
  $("#vacioCatalogo").textContent = lista.length ? "" :
    (visibles.length ? "No hay prendas con esos filtros." : "Aún no hay prendas donadas. Sé el primero en donar.");

  lista.forEach(p => {
    const li = document.createElement("li");
    li.className = "prenda catalogo-foto";
    const fotos = obtenerFotosPrenda(p);
    li.innerHTML = `${fotos.length ? '<div class="galeria-prenda"></div>' : '<div class="sin-foto">Sin foto</div>'}
      <h2 class="titulo-prenda"></h2>
      <p class="descripcion-prenda"></p>
      <button class="btn btn-ver-prenda" type="button">Ver prenda</button>`;
    li.querySelector(".titulo-prenda").textContent = `${p.tipo} · Talla ${p.talla}`;
    li.querySelector(".descripcion-prenda").textContent = p.defectos || "Sin descripción";
    if (fotos.length) {
      const galeria = li.querySelector(".galeria-prenda");
      galeria.classList.add("sola");
      const imagen = document.createElement("img");
      imagen.src = fotos[0];
      imagen.alt = `Foto de ${p.tipo}`;
      galeria.append(imagen);
    }
    li.querySelector(".btn-ver-prenda").onclick = () => abrirDetallePrenda(p);
    ul.append(li);
  });
}

let prendaDetalle = null;
let fotosDetalle = [];
let indiceFotoDetalle = 0;

function pintarFotoDetalle() {
  const galeria = $("#detalleGaleria");
  const soloUna = fotosDetalle.length <= 1;
  const botonAnterior = $("#btnFotoAnterior");
  const botonSiguiente = $("#btnFotoSiguiente");
  botonAnterior.disabled = soloUna;
  botonSiguiente.disabled = soloUna;
  botonAnterior.style.visibility = soloUna ? "hidden" : "";
  botonSiguiente.style.visibility = soloUna ? "hidden" : "";
  $("#detalleFotoIndicador").textContent = soloUna ? "" : `${indiceFotoDetalle + 1} / ${fotosDetalle.length}`;
  galeria.replaceChildren();

  if (fotosDetalle.length) {
    const imagen = document.createElement("img");
    imagen.src = fotosDetalle[indiceFotoDetalle];
    imagen.alt = `Foto ${indiceFotoDetalle + 1} de ${prendaDetalle.tipo}, talla ${prendaDetalle.talla}`;
    galeria.append(imagen);
  } else {
    const sinFoto = document.createElement("div");
    sinFoto.className = "sin-foto";
    sinFoto.textContent = "Sin fotos";
    galeria.append(sinFoto);
  }
}

function abrirDetallePrenda(prenda) {
  prendaDetalle = prenda;
  const dialogo = $("#dialogDetallePrenda");
  fotosDetalle = obtenerFotosPrenda(prenda);
  indiceFotoDetalle = 0;
  $("#tituloDetallePrenda").textContent = `${prenda.tipo} · Talla ${prenda.talla}`;
  $("#detalleTipo").textContent = prenda.tipo;
  $("#detalleTalla").textContent = prenda.talla;
  $("#detalleDescripcion").textContent = prenda.defectos || "Sin descripción adicional.";
  $("#detalleError").classList.add("oculto");
  const puedeRetirar = sesion && ["admin", "almacen"].includes(sesion.rol);
  $("#btnRetirarPrenda").classList.toggle("oculto", !puedeRetirar);

  pintarFotoDetalle();
  dialogo.showModal();
}

function cambiarFotoDetalle(direccion) {
  if (fotosDetalle.length < 2) return;
  indiceFotoDetalle = (indiceFotoDetalle + direccion + fotosDetalle.length) % fotosDetalle.length;
  pintarFotoDetalle();
}

$("#btnCerrarDetalle").onclick = () => $("#dialogDetallePrenda").close();
$("#btnFotoAnterior").onclick = () => cambiarFotoDetalle(-1);
$("#btnFotoSiguiente").onclick = () => cambiarFotoDetalle(1);
$("#dialogDetallePrenda").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) e.currentTarget.close();
});
$("#btnReservarDetalle").onclick = async (e) => {
  if (!prendaDetalle) return;
  const boton = e.currentTarget;
  boton.disabled = true;
  try {
    if (await reservar(prendaDetalle)) $("#dialogDetallePrenda").close();
  } finally {
    boton.disabled = false;
  }
};
$("#btnRetirarPrenda").onclick = async (e) => {
  if (!prendaDetalle || !sesion || !["admin", "almacen"].includes(sesion.rol)) return;
  const confirmar = window.confirm(`¿Retirar ${prendaDetalle.tipo} · Talla ${prendaDetalle.talla} del catálogo?`);
  if (!confirmar) return;

  const boton = e.currentTarget;
  boton.disabled = true;
  try {
    const { error } = await supabaseClient.rpc("retirar_prenda_catalogo", {
      p_prenda_id: prendaDetalle.id
    });
    if (error) {
      $("#detalleError").textContent = "No se pudo retirar la prenda: " + error.message;
      $("#detalleError").classList.remove("oculto");
      return;
    }
    $("#dialogDetallePrenda").close();
    await pintarCatalogo();
  } finally {
    boton.disabled = false;
  }
};

// Desde el catálogo, cualquier usuario puede iniciar una nueva donación.
// El formulario de Donación es el que guarda la prenda pendiente para revisión.
$("#btnNuevaPrenda").onclick = () => {
  const botonDonacion = document.querySelector('nav button[data-vista="donacion"]');
  botonDonacion.click();
  $("#formDonacion").scrollIntoView({ behavior: "smooth", block: "start" });
  $("#dTipo").focus();
};

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
  if (error) {
    $("#detalleError").textContent = "No se pudo reservar: " + error.message;
    $("#detalleError").classList.remove("oculto");
    return false;
  }
  $("#detalleError").classList.add("oculto");
  await pintarCatalogo();
  return true;
}

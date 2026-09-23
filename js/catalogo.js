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

// Trae todas las prendas visibles para el rol actual (RLS ya filtra a
// nivel de fila. El catálogo solo muestra prendas autorizadas por almacén:
// disponible o reservada; las pendientes y rechazadas quedan en Donaciones.
async function obtenerPrendasVisibles() {
  const { data, error } = await supabaseClient
    .from("prendas").select("*").order("creada", { ascending: false });
  if (error) { console.error(error); return []; }
  return data.filter(p => p.estado === "disponible" || p.estado === "reservada");
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
    const disponible = p.estado === "disponible";
    li.innerHTML = `${p.imagen_url ? '<img class="miniatura" alt="Foto de prenda autorizada">' : '<div class="sin-foto">Sin foto</div>'}
      <h2 class="titulo-prenda"></h2>
      <p class="descripcion-prenda"></p>
      <button class="btn" ${disponible ? "" : "disabled"}>${disponible ? "Reservar" : "No disponible"}</button>`;
    li.querySelector(".titulo-prenda").textContent = `${p.tipo} · Talla ${p.talla}`;
    li.querySelector(".descripcion-prenda").textContent = p.defectos || "Sin descripción";
    if (p.imagen_url) {
      li.querySelector(".miniatura").src = p.imagen_url;
    }
    if (disponible) li.querySelector("button").onclick = () => reservar(p);
    ul.append(li);
  });
}

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
  if (error) { alert("No se pudo reservar: " + error.message); return; }
  await pintarCatalogo();
}

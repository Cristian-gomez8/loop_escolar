/* =========================================================
    reservas.js — Vista de reservas del usuario en sesión o del admin.
   ========================================================= */

// Renderiza las reservas visibles para el usuario en sesión, ordenadas por
// fecha de entrega más próxima primero. Si almacén ya marcó la prenda
// como "entregada" (ver dashboard.js/almacen.js), se muestra un chip
// en vez del botón Cancelar: ya no tiene sentido cancelar algo que el
// usuario ya recogió físicamente. El admin puede ver las reservas de todos;
// los demás roles solo reciben las reservas propias desde la consulta.
async function pintarReservas() {
  let query = supabaseClient
    .from("reservas")
    .select("*, usuario:usuarios(nombre), prenda:prendas(*)");
  if (sesion.rol !== "admin") query = query.eq("usuario_id", sesion.id);
  const { data, error } = await query
    .order("fecha_entrega", { ascending: true });
  if (error) { console.error(error); return; }

  const ul = $("#listaReservas");
  ul.innerHTML = "";
  $("#vacioReservas").textContent = data.length ? "" :
    sesion.rol === "admin"
      ? "No hay reservas registradas."
      : "Aún no tienes reservas. Ve al catálogo para reservar una prenda.";

  data.forEach(r => {
    const p = r.prenda;
    const entregada = p && p.estado === "entregado";
    const fecha = new Date(r.fecha_entrega + "T00:00:00")
      .toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" });
    const li = document.createElement("li");
    li.className = "reserva";
    li.innerHTML = `
      <div class="galeria-reserva"></div>
      <div class="mr">
        <h2 style="margin:0;font-size:1.05rem"></h2>
        <p class="nota" style="margin:.15rem 0 0"></p>
      </div>
      <div class="entrega"><small>Entrega</small><b></b></div>
      ${entregada ? '<span class="chip">Entregado</span>' : `<div class="acciones-reserva">${sesion.rol === "admin" ? '<button type="button" class="btn-sec btn-entregar">Confirmar entrega</button>' : ""}<button type="button" class="btn-sec btn-cancelar">Cancelar</button></div>`}`;
    if (p) {
      obtenerFotosPrenda(p).forEach((url, indice) => {
        const imagen = document.createElement("img");
        imagen.src = url;
        imagen.alt = `Foto ${indice + 1} de la prenda`;
        li.querySelector(".galeria-reserva").append(imagen);
      });
    }
    li.querySelector("h2").textContent = `${p ? p.tipo : "Prenda"} · Talla ${p ? p.talla : "—"}`;
    const usuario = sesion.rol === "admin" && r.usuario ? `Reservó: ${r.usuario.nombre}. ` : "";
    li.querySelector(".nota").textContent = usuario + (p && p.defectos ? "Defectos: " + p.defectos : "Sin defectos");
    li.querySelector(".entrega b").textContent = fecha;
    if (!entregada) {
      const botonEntrega = li.querySelector(".btn-entregar");
      if (botonEntrega) {
        botonEntrega.onclick = async () => {
          if (await marcarEntregado(r)) await pintarReservas();
        };
      }
      li.querySelector(".btn-cancelar").onclick = () => cancelar(r);
    }
    ul.append(li);
  });
}

// Cancela una reserva vía el RPC cancelar_reserva, que de forma
// atómica borra la reserva y devuelve la prenda a "disponible" para
// que otra familia pueda reservarla.
async function cancelar(r) {
  const { error } = await supabaseClient.rpc("cancelar_reserva", { p_reserva_id: r.id });
  if (error) { alert("No se pudo cancelar la reserva: " + error.message); return; }
  await pintarReservas();
}

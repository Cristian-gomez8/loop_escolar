/* =========================================================
   reservas.js — Vista "Mis reservas" del usuario en sesión.
   ========================================================= */

// Renderiza las reservas del usuario en sesión, ordenadas por
// fecha de entrega más próxima primero. Si almacén ya marcó la prenda
// como "entregada" (ver dashboard.js/almacen.js), se muestra un chip
// en vez del botón Cancelar: ya no tiene sentido cancelar algo que el
// usuario ya recogió físicamente.
async function pintarReservas() {
  const { data, error } = await supabaseClient
    .from("reservas")
    .select("*, prenda:prendas(tipo,talla,defectos,estado,imagen_url)")
    .eq("usuario_id", sesion.id)
    .order("fecha_entrega", { ascending: true });
  if (error) { console.error(error); return; }

  const ul = $("#listaReservas");
  ul.innerHTML = "";
  $("#vacioReservas").textContent = data.length ? "" :
    "Aún no tienes reservas. Ve al catálogo para reservar una prenda.";

  data.forEach(r => {
    const p = r.prenda;
    const entregada = p && p.estado === "entregado";
    const fecha = new Date(r.fecha_entrega + "T00:00:00")
      .toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" });
    const li = document.createElement("li");
    li.className = "reserva";
    li.innerHTML = `
      ${p && p.imagen_url ? '<img class="miniatura-chica" alt="Foto de la prenda">' : ""}
      <div class="mr">
        <h2 style="margin:0;font-size:1.05rem"></h2>
        <p class="nota" style="margin:.15rem 0 0"></p>
      </div>
      <div class="entrega"><small>Entrega</small><b></b></div>
      ${entregada ? '<span class="chip">Entregado</span>' : '<button class="btn-sec">Cancelar</button>'}`;
    if (p && p.imagen_url) li.querySelector(".miniatura-chica").src = p.imagen_url;
    li.querySelector("h2").textContent = `${p ? p.tipo : "Prenda"} · Talla ${p ? p.talla : "—"}`;
    li.querySelector(".nota").textContent = p && p.defectos ? "Defectos: " + p.defectos : "Sin defectos";
    li.querySelector(".entrega b").textContent = fecha;
    if (!entregada) li.querySelector("button").onclick = () => cancelar(r);
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

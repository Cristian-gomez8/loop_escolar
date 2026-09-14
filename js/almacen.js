/* =========================================================
   almacen.js — Aprobación de donaciones (rol "almacen"/"admin").
   Lista las prendas en estado "pendiente" (recién donadas) y
   permite aceptarlas (pasan a "disponible" y aparecen en el
   catálogo) o rechazarlas (pasan a "rechazada": se conservan
   para trazabilidad, pero nunca aparecen en el catálogo).

   También pinta la grilla "Reservas realizadas" (misma tabla que
   la del dashboard, ver construirFilaReserva en dashboard.js) para
   que almacén marque cada reserva como "entregada" al hacer la
   entrega física, sin tener que ir hasta el dashboard.
   ========================================================= */

// Renderiza las prendas pendientes de revisión, con la foto (si tiene),
// tipo, talla, defectos declarados y quién la donó.
async function pintarPendientes() {
  const { data, error } = await supabaseClient
    .from("prendas")
    .select("*, donante:usuarios(nombre,email)")
    .eq("estado", "pendiente")
    .order("creada", { ascending: true });
  if (error) { console.error(error); return; }

  const ul = $("#listaPendientes");
  ul.innerHTML = "";
  $("#vacioPendientes").textContent = data.length ? "" : "No hay donaciones pendientes por revisar.";

  data.forEach(p => {
    const li = document.createElement("li");
    li.className = "reserva";
    li.innerHTML = `
      ${p.imagen_url ? '<img class="miniatura-chica" alt="Foto de la prenda">' : ""}
      <div class="mr">
        <h2 style="margin:0;font-size:1.05rem"></h2>
        <p class="nota" style="margin:.15rem 0 0"></p>
        <p class="nota" style="margin:.15rem 0 0"></p>
      </div>
      <button class="btn-sec">Aceptar</button>
      <button class="btn-peligro">Rechazar</button>`;
    if (p.imagen_url) li.querySelector(".miniatura-chica").src = p.imagen_url;
    li.querySelector("h2").textContent = `${p.tipo} · Talla ${p.talla}`;
    const notas = li.querySelectorAll(".nota");
    notas[0].textContent = p.defectos ? "Defectos: " + p.defectos : "Sin defectos reportados";
    notas[1].textContent = "Donado por: " + (p.donante ? `${p.donante.nombre} (${p.donante.email})` : "usuario eliminado");
    li.querySelector(".btn-sec").onclick = () => aceptarPrenda(p);
    li.querySelector(".btn-peligro").onclick = () => rechazarPrenda(p);
    ul.append(li);
  });
}

// Acepta una donación pendiente: queda "disponible" en el catálogo.
async function aceptarPrenda(p) {
  const { error } = await supabaseClient.from("prendas").update({ estado: "disponible" }).eq("id", p.id);
  if (error) { alert("No se pudo aceptar la donación: " + error.message); return; }
  pintarPendientes();
}

// Rechaza una donación pendiente: queda marcada "rechazada".
// No se borra el registro para mantener trazabilidad de qué se donó
// y por qué no se aceptó, pero nunca se muestra en el catálogo.
async function rechazarPrenda(p) {
  const { error } = await supabaseClient.from("prendas").update({ estado: "rechazada" }).eq("id", p.id);
  if (error) { alert("No se pudo rechazar la donación: " + error.message); return; }
  pintarPendientes();
}

// Renderiza TODAS las reservas (sin filtros: esta vista no los tiene),
// más recientes primero, reutilizando construirFilaReserva de dashboard.js.
async function pintarReservasAlmacen() {
  const { data, error } = await supabaseClient
    .from("reservas")
    .select("*, usuario:usuarios(nombre), prenda:prendas(tipo,talla,defectos,estado)")
    .order("creada", { ascending: false });
  if (error) { console.error(error); return; }

  const cuerpo = $("#tablaReservasAlmacen tbody");
  cuerpo.innerHTML = "";
  $("#vacioTablaReservasAlmacen").textContent = data.length ? "" : "Todavía no se ha reservado ninguna prenda.";
  $("#tablaReservasAlmacen").classList.toggle("oculto", !data.length);

  data.forEach(r => cuerpo.append(construirFilaReserva(r, pintarReservasAlmacen)));
}

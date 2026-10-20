/* =========================================================
    reservas.js — Vista de reservas del usuario en sesión o del admin.
   ========================================================= */

// Renderiza las reservas visibles para el usuario en sesión, con las citas
// asignadas más próximas primero. Si almacén ya marcó la prenda
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
    const fecha = formatearCitaReserva(r);
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
    if (sesion.rol === "admin") {
      const ubicacion = document.createElement("p");
      ubicacion.className = "nota";
      ubicacion.textContent = `Ubicación: ${p && p.ubicacion ? p.ubicacion : "Sin asignar"}`;
      li.querySelector(".mr").append(ubicacion);
    }
    li.querySelector(".entrega b").textContent = fecha || "Pendiente de asignación";
    if (sesion.rol === "admin" && !entregada) {
      li.querySelector(".entrega").append(crearFormularioCita(r));
    }
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

function formatearCitaReserva(reserva) {
  if (!reserva.fecha_entrega) return "";
  const fecha = new Date(reserva.fecha_entrega + "T12:00:00Z")
    .toLocaleDateString("es-CO", {
      timeZone: "America/Bogota",
      day: "2-digit",
      month: "long",
      year: "numeric"
    });
  const hora = reserva.hora_entrega ? reserva.hora_entrega.slice(0, 5) : null;
  return hora ? `${fecha} · ${hora}` : fecha;
}

function fechaActualColombia() {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const valores = Object.fromEntries(partes.map(parte => [parte.type, parte.value]));
  return `${valores.year}-${valores.month}-${valores.day}`;
}

function crearFormularioCita(reserva) {
  const formulario = document.createElement("form");
  formulario.className = "formulario-cita";

  const fechaLabel = document.createElement("label");
  fechaLabel.textContent = "Fecha";
  const fecha = document.createElement("input");
  fecha.type = "date";
  fecha.required = true;
  fecha.min = fechaActualColombia();
  fecha.value = reserva.fecha_entrega || "";
  fechaLabel.append(fecha);

  const horaLabel = document.createElement("label");
  horaLabel.textContent = "Hora (Colombia)";
  const hora = document.createElement("input");
  hora.type = "time";
  hora.required = true;
  hora.step = 60;
  hora.value = reserva.hora_entrega ? reserva.hora_entrega.slice(0, 5) : "";
  horaLabel.append(hora);

  const guardar = document.createElement("button");
  guardar.type = "submit";
  guardar.className = "btn-sec";
  guardar.textContent = reserva.fecha_entrega ? "Actualizar cita" : "Asignar cita";

  formulario.append(fechaLabel, horaLabel, guardar);
  formulario.addEventListener("submit", async e => {
    e.preventDefault();
    if (!fecha.value || !hora.value) return;
    guardar.disabled = true;
    const { error } = await supabaseClient.rpc("asignar_fecha_reserva", {
      p_reserva_id: reserva.id,
      p_fecha_entrega: fecha.value,
      p_hora_entrega: hora.value
    });
    guardar.disabled = false;
    if (error) {
      alert("No se pudo guardar la cita: " + error.message);
      return;
    }
    await pintarReservas();
  });

  return formulario;
}

// Cancela una reserva vía el RPC cancelar_reserva, que de forma
// atómica borra la reserva y devuelve la prenda a "disponible" para
// que otra familia pueda reservarla.
async function cancelar(r) {
  const { error } = await supabaseClient.rpc("cancelar_reserva", { p_reserva_id: r.id });
  if (error) { alert("No se pudo cancelar la reserva: " + error.message); return; }
  await pintarReservas();
}

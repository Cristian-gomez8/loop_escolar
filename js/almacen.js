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

  const tabla = $("#tablaPendientes");
  const cuerpo = tabla.querySelector("tbody");
  cuerpo.innerHTML = "";
  $("#vacioPendientes").textContent = data.length ? "" : "No hay donaciones pendientes por revisar.";
  tabla.classList.toggle("oculto", !data.length);

  data.forEach(p => {
    const fila = document.createElement("tr");
    fila.innerHTML = "<td></td><td></td><td></td><td></td><td></td><td></td>";
    const [cTipo, cTalla, cDescripcion, cFoto, cDonante, cAcciones] = fila.querySelectorAll("td");
    cTipo.textContent = p.tipo;
    cTalla.textContent = p.talla;
    cDescripcion.textContent = p.defectos || "Sin defectos reportados";
    cDonante.textContent = p.donante ? `${p.donante.nombre} (${p.donante.email})` : "Usuario eliminado";
    if (p.imagen_url) {
      const imagen = document.createElement("img");
      imagen.className = "miniatura-tabla";
      imagen.alt = "Foto de la prenda";
      imagen.src = p.imagen_url;
      cFoto.append(imagen);
    } else {
      cFoto.textContent = "Sin foto";
    }

    const botonAceptar = document.createElement("button");
    botonAceptar.className = "btn-sec";
    botonAceptar.textContent = "Aceptar";
    botonAceptar.onclick = () => aceptarPrenda(p);
    const botonRechazar = document.createElement("button");
    botonRechazar.className = "btn-peligro";
    botonRechazar.textContent = "Rechazar";
    botonRechazar.onclick = () => rechazarPrenda(p);
    cAcciones.append(botonAceptar, botonRechazar);
    cuerpo.append(fila);
  });
}

// Acepta una donación pendiente: queda "disponible" en el catálogo.
async function aceptarPrenda(p) {
  const { error } = await supabaseClient.from("prendas").update({ estado: "disponible" }).eq("id", p.id);
  if (error) { alert("No se pudo aceptar la donación: " + error.message); return; }
  await pintarPendientes();
}

// Rechaza una donación pendiente: queda marcada "rechazada".
// No se borra el registro para mantener trazabilidad de qué se donó
// y por qué no se aceptó, pero nunca se muestra en el catálogo.
async function rechazarPrenda(p) {
  const { error } = await supabaseClient.from("prendas").update({ estado: "rechazada" }).eq("id", p.id);
  if (error) { alert("No se pudo rechazar la donación: " + error.message); return; }
  await pintarPendientes();
}

// Fin de la gestión de donaciones pendientes.


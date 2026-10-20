/* =========================================================
   almacen.js — Inventario y aprobación de donaciones
   (rol "almacen"/"admin"). Permite registrar dónde están las
   prendas disponibles o reservadas, y aceptar o rechazar las
   donaciones pendientes.
   ========================================================= */

// Renderiza las prendas pendientes de revisión, con la foto (si tiene),
// tipo, talla, defectos declarados y quién la donó.
llenar($("#editarTipo"), TIPOS);
llenar($("#editarTalla"), TALLAS);

async function pintarInventario() {
  const { data, error } = await supabaseClient
    .from("prendas")
    .select("id,tipo,talla,estado,ubicacion")
    .in("estado", ["disponible", "reservada"])
    .order("tipo", { ascending: true })
    .order("talla", { ascending: true });
  if (error) {
    console.error(error);
    $("#tablaInventario").classList.add("oculto");
    $("#vacioInventario").textContent = "No se pudo cargar el inventario: " + error.message;
    return;
  }

  const tabla = $("#tablaInventario");
  const cuerpo = tabla.querySelector("tbody");
  cuerpo.innerHTML = "";
  $("#vacioInventario").textContent = data.length ? "" : "No hay prendas disponibles o reservadas.";
  tabla.classList.toggle("oculto", !data.length);

  data.forEach(prenda => {
    const fila = document.createElement("tr");
    fila.innerHTML = "<td></td><td></td><td></td><td></td><td></td>";
    const [cTipo, cTalla, cEstado, cUbicacion, cAcciones] = fila.querySelectorAll("td");
    cTipo.textContent = prenda.tipo;
    cTalla.textContent = prenda.talla;
    cEstado.textContent = prenda.estado === "reservada" ? "Reservada" : "Disponible";

    const entrada = document.createElement("input");
    entrada.type = "text";
    entrada.maxLength = 100;
    entrada.value = prenda.ubicacion || "";
    entrada.placeholder = "Ej. Estante A, nivel 2";
    entrada.setAttribute("aria-label", `Ubicación de ${prenda.tipo}, talla ${prenda.talla}`);
    cUbicacion.append(entrada);

    const botonGuardar = document.createElement("button");
    botonGuardar.type = "button";
    botonGuardar.className = "btn-sec";
    botonGuardar.textContent = "Guardar";
    botonGuardar.onclick = async () => {
      botonGuardar.disabled = true;
      const { data: actualizadas, error: errorActualizacion } = await supabaseClient
        .from("prendas")
        .update({ ubicacion: entrada.value.trim() || null })
        .eq("id", prenda.id)
        .in("estado", ["disponible", "reservada"])
        .select("id");
      botonGuardar.disabled = false;
      if (errorActualizacion) {
        alert("No se pudo guardar la ubicación: " + errorActualizacion.message);
        return;
      }
      if (!actualizadas.length) {
        alert("La prenda ya no está disponible ni reservada. Actualiza el inventario.");
      }
      await pintarInventario();
    };
    cAcciones.append(botonGuardar);
    cuerpo.append(fila);
  });
}

let imagenEdicion = null;
let donacionEdicion = null;

$("#editarImagen").addEventListener("change", async (e) => {
  const archivo = e.target.files[0];
  imagenEdicion = null;
  if (!archivo) return;
  if (!archivo.type.startsWith("image/")) {
    e.target.value = "";
    mostrarErrorEdicion("Selecciona un archivo de imagen válido.");
    return;
  }
  try {
    imagenEdicion = await comprimirImagen(archivo);
    $("#editarImagenPreview").src = URL.createObjectURL(imagenEdicion);
    $("#editarImagenPreview").classList.remove("oculto");
    $("#editarQuitarImagen").checked = false;
    $("#editarDonacionError").classList.add("oculto");
  } catch {
    e.target.value = "";
    mostrarErrorEdicion("No se pudo procesar la foto. Intenta con otra imagen.");
  }
});

$("#btnCancelarEdicion").onclick = () => $("#dialogEditarDonacion").close();
$("#formEditarDonacion").addEventListener("submit", guardarEdicionDonacion);

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
    const fotos = obtenerFotosPrenda(p);
    if (fotos.length) {
      const galeria = document.createElement("div");
      galeria.className = "galeria-prenda compacta";
      fotos.forEach((url, indice) => {
        const imagen = document.createElement("img");
        imagen.className = "miniatura-tabla";
        imagen.alt = `Foto ${indice + 1} de la prenda`;
        imagen.src = url;
        galeria.append(imagen);
      });
      cFoto.append(galeria);
    } else {
      cFoto.textContent = "Sin foto";
    }

    const botonAceptar = document.createElement("button");
    botonAceptar.className = "btn-sec";
    botonAceptar.textContent = "Aceptar";
    botonAceptar.onclick = () => aceptarPrenda(p);
    if (sesion && sesion.rol === "admin") {
      const botonEditar = document.createElement("button");
      botonEditar.className = "btn-sec";
      botonEditar.textContent = "Editar";
      botonEditar.onclick = () => abrirEditorDonacion(p);
      cAcciones.append(botonEditar);
    }
    const botonRechazar = document.createElement("button");
    botonRechazar.className = "btn-peligro";
    botonRechazar.textContent = "Rechazar";
    botonRechazar.onclick = () => rechazarPrenda(p);
    cAcciones.append(botonAceptar, botonRechazar);
    cuerpo.append(fila);
  });
}

function abrirEditorDonacion(p) {
  if (!sesion || sesion.rol !== "admin") return;
  donacionEdicion = p;
  imagenEdicion = null;
  $("#formEditarDonacion").reset();
  $("#editarTipo").value = p.tipo;
  $("#editarTalla").value = p.talla;
  $("#editarDefectos").value = p.defectos || "";
  $("#editarImagen").value = "";
  const fotos = obtenerFotosPrenda(p);
  $("#editarImagenPreview").classList.toggle("oculto", !fotos.length);
  if (fotos.length) $("#editarImagenPreview").src = fotos[0];
  $("#editarQuitarImagen").disabled = !fotos.length;
  $("#editarDonacionError").classList.add("oculto");
  $("#dialogEditarDonacion").showModal();
}

function mostrarErrorEdicion(mensaje) {
  $("#editarDonacionError").textContent = mensaje;
  $("#editarDonacionError").classList.remove("oculto");
}

async function guardarEdicionDonacion(e) {
  e.preventDefault();
  if (!sesion || sesion.rol !== "admin" || !donacionEdicion) return;

  const botonGuardar = $("#formEditarDonacion button[type=submit]");
  const cambiarImagen = Boolean(imagenEdicion) || $("#editarQuitarImagen").checked;
  const fotosAnteriores = obtenerFotosPrenda(donacionEdicion);
  let nuevaImagenUrl = null;
  let guardado = false;
  botonGuardar.disabled = true;
  $("#editarDonacionError").classList.add("oculto");

  try {
    if (imagenEdicion) nuevaImagenUrl = await subirImagenPrenda(imagenEdicion);
    const defectos = $("#editarDefectos").value.trim().slice(0, 300);
    const cambios = {
      tipo: $("#editarTipo").value,
      talla: $("#editarTalla").value,
      defectos: defectos || null
    };
    if (imagenEdicion) {
      cambios.imagen_url = nuevaImagenUrl;
      cambios.imagen_urls = [nuevaImagenUrl];
    } else if ($("#editarQuitarImagen").checked) {
      cambios.imagen_url = null;
      cambios.imagen_urls = [];
    }

    const { data, error } = await supabaseClient.from("prendas")
      .update(cambios).eq("id", donacionEdicion.id).eq("estado", "pendiente").select("id");
    if (error || !data.length) {
      if (nuevaImagenUrl) await borrarImagenPrenda(nuevaImagenUrl);
      mostrarErrorEdicion(error ? "No se pudieron guardar los cambios: " + error.message : "La donación ya no está pendiente.");
      return;
    }

    guardado = true;
    if (cambiarImagen) {
      await Promise.all([...new Set(fotosAnteriores)].map(borrarImagenPrenda));
    }
    $("#dialogEditarDonacion").close();
    donacionEdicion = null;
    await pintarPendientes();
  } catch (error) {
    if (nuevaImagenUrl && !guardado) await borrarImagenPrenda(nuevaImagenUrl);
    mostrarErrorEdicion("No se pudieron guardar los cambios: " + error.message);
  } finally {
    botonGuardar.disabled = false;
  }
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

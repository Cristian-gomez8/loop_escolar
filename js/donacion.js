/* =========================================================
   donacion.js — Formulario para donar una prenda.
   La prenda queda en estado "pendiente": no aparece en el
   catálogo hasta que alguien con rol "almacen"/"admin" la
   acepte desde la vista de aprobación (ver almacen.js).
   También permite adjuntar una foto opcional, que se comprime
   en el navegador (imagen.js) y se sube a Supabase Storage.
   ========================================================= */

llenar($("#dTipo"),  TIPOS);
llenar($("#dTalla"), TALLAS);

const MAX_FOTOS_DONACION = 5;
let imagenesDonacion = [];

$("#dImagen").addEventListener("change", async (e) => {
  const archivos = Array.from(e.target.files || []);
  const vistaPrevia = $("#dImagenPreview");
  imagenesDonacion = [];
  vistaPrevia.replaceChildren();
  vistaPrevia.classList.add("oculto");
  $("#donacionError").classList.add("oculto");
  if (!archivos.length) return;
  if (archivos.length > MAX_FOTOS_DONACION) {
    e.target.value = "";
    $("#donacionError").textContent = `Puedes seleccionar hasta ${MAX_FOTOS_DONACION} fotos.`;
    $("#donacionError").classList.remove("oculto");
    return;
  }
  if (archivos.some(archivo => !archivo.type.startsWith("image/"))) {
    e.target.value = "";
    $("#donacionError").textContent = "Selecciona archivos de imagen válidos.";
    $("#donacionError").classList.remove("oculto");
    return;
  }

  try {
    imagenesDonacion = await Promise.all(archivos.map(archivo => comprimirImagen(archivo)));
    imagenesDonacion.forEach((imagen, indice) => {
      const miniatura = document.createElement("img");
      miniatura.src = URL.createObjectURL(imagen);
      miniatura.alt = `Vista previa ${indice + 1}`;
      vistaPrevia.append(miniatura);
    });
    vistaPrevia.classList.remove("oculto");
  } catch {
    imagenesDonacion = [];
    e.target.value = "";
    $("#donacionError").textContent = "No se pudo procesar la imagen. Intenta con otra foto.";
    $("#donacionError").classList.remove("oculto");
  }
});

$("#formDonacion").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("#formDonacion button[type=submit]");
  $("#donacionError").classList.add("oculto");
  const descripcion = $("#dDefectos").value.trim().slice(0, 300);
  const defectos = descripcion
    ? descripcion[0].toLocaleUpperCase("es") + descripcion.slice(1)
    : "";
  btn.disabled = true;

  try {
    const imagen_urls = [];
    for (const imagen of imagenesDonacion) {
      try {
        imagen_urls.push(await subirImagenPrenda(imagen));
      } catch {
        await Promise.all(imagen_urls.map(borrarImagenPrenda));
        $("#donacionError").textContent = "No se pudo subir la foto. Intenta con otra imagen.";
        $("#donacionError").classList.remove("oculto");
        return;
      }
    }

    const registro = {
      tipo: $("#dTipo").value, talla: $("#dTalla").value,
      defectos: defectos || null, estado: "pendiente",
      donante_id: sesion.id,
      imagen_url: imagen_urls[0] || null
    };
    let { error } = await supabaseClient.from("prendas").insert({
      ...registro,
      imagen_urls
    });
    const faltaMigracion = error && ["42703", "PGRST204"].includes(error.code);
    if (faltaMigracion && imagen_urls.length <= 1) {
      ({ error } = await supabaseClient.from("prendas").insert(registro));
    } else if (faltaMigracion) {
      await Promise.all(imagen_urls.map(borrarImagenPrenda));
      $("#donacionError").textContent = "Para guardar varias fotos, el administrador debe aplicar la migración 0006 de Supabase.";
      $("#donacionError").classList.remove("oculto");
      return;
    }
    if (error) {
      await Promise.all(imagen_urls.map(borrarImagenPrenda));
      $("#donacionError").textContent = "No se pudo guardar la donación: " + error.message;
      $("#donacionError").classList.remove("oculto");
      return;
    }

    $("#dDefectos").value = "";
    $("#dImagen").value = "";
    imagenesDonacion = [];
    $("#dImagenPreview").replaceChildren();
    $("#dImagenPreview").classList.add("oculto");
    $("#donacionOk").textContent = "¡Gracias! Tu donación quedó pendiente de revisión por almacén.";
    $("#donacionOk").classList.remove("oculto");
    setTimeout(() => $("#donacionOk").classList.add("oculto"), 4000);
  } finally {
    btn.disabled = false;
  }
});

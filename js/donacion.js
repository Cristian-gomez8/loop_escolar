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

// Blob de la imagen ya comprimida, lista para subirse cuando se
// envíe el formulario. null si no se adjuntó foto.
let imagenDonacion = null;

$("#dImagen").addEventListener("change", async (e) => {
  const archivo = e.target.files[0];
  if (!archivo) { imagenDonacion = null; $("#dImagenPreview").classList.add("oculto"); return; }
  if (!archivo.type.startsWith("image/")) {
    imagenDonacion = null;
    $("#dImagen").value = "";
    $("#donacionError").textContent = "Selecciona un archivo de imagen válido (JPG, PNG, GIF, WEBP u otro formato de imagen).";
    $("#donacionError").classList.remove("oculto");
    return;
  }
  try {
    imagenDonacion = await comprimirImagen(archivo);
    $("#dImagenPreview").src = URL.createObjectURL(imagenDonacion);
    $("#dImagenPreview").classList.remove("oculto");
  } catch {
    imagenDonacion = null;
    $("#donacionError").textContent = "No se pudo procesar la imagen. Intenta con otra foto.";
    $("#donacionError").classList.remove("oculto");
  }
});

$("#formDonacion").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#donacionError").classList.add("oculto");
  const defectos = $("#dDefectos").value.trim().slice(0, 300);
  const btn = $("#formDonacion button[type=submit]");
  btn.disabled = true;

  try {
    let imagen_url = null;
    if (imagenDonacion) {
      try {
        imagen_url = await subirImagenPrenda(imagenDonacion);
      } catch {
        $("#donacionError").textContent = "No se pudo subir la foto. Intenta con otra imagen.";
        $("#donacionError").classList.remove("oculto");
        return;
      }
    }

    const { error } = await supabaseClient.from("prendas").insert({
      tipo: $("#dTipo").value, talla: $("#dTalla").value,
      defectos: defectos || null, estado: "pendiente",
      donante_id: sesion.id, imagen_url
    });
    if (error) {
      $("#donacionError").textContent = "No se pudo guardar la donación: " + error.message;
      $("#donacionError").classList.remove("oculto");
      return;
    }

    $("#dDefectos").value = "";
    $("#dImagen").value = "";
    imagenDonacion = null;
    $("#dImagenPreview").classList.add("oculto");
    $("#donacionOk").textContent = "¡Gracias! Tu donación quedó pendiente de revisión por almacén.";
    $("#donacionOk").classList.remove("oculto");
    setTimeout(() => $("#donacionOk").classList.add("oculto"), 4000);
  } finally {
    btn.disabled = false;
  }
});

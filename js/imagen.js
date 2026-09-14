/* =========================================================
   imagen.js — Compresión de la foto de una prenda en el navegador,
   antes de subirla a Supabase Storage (bucket "prendas").
   ========================================================= */

// Redimensiona y comprime un archivo de imagen usando un <canvas>.
// - archivo: objeto File tomado de un <input type="file">.
// - maxLado: ancho/alto máximo en píxeles (se conserva la proporción).
// - calidad: calidad de compresión JPEG (0 a 1).
// Devuelve una Promise que resuelve con un Blob JPEG listo para subir.
function comprimirImagen(archivo, maxLado = 800, calidad = 0.7) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxLado) {
          height = Math.round(height * (maxLado / width));
          width = maxLado;
        } else if (height > maxLado) {
          width = Math.round(width * (maxLado / height));
          height = maxLado;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => blob ? resolve(blob) : reject(new Error("No se pudo comprimir la imagen.")),
          "image/jpeg", calidad
        );
      };
      img.onerror = () => reject(new Error("No se pudo leer la imagen."));
      img.src = lector.result;
    };
    lector.onerror = () => reject(new Error("No se pudo leer el archivo."));
    lector.readAsDataURL(archivo);
  });
}

// Sube un blob de imagen ya comprimido al bucket "prendas", dentro de
// una carpeta por usuario (requerido por la policy de Storage:
// storage.foldername(name)[1] = auth.uid()), y devuelve su URL pública.
async function subirImagenPrenda(blob) {
  const ruta = `${sesion.id}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabaseClient.storage.from("prendas").upload(ruta, blob, {
    contentType: "image/jpeg"
  });
  if (error) throw error;
  const { data } = supabaseClient.storage.from("prendas").getPublicUrl(ruta);
  return data.publicUrl;
}

// Borra una imagen de prenda del bucket a partir de su URL pública
// (usado al eliminar una prenda desde el catálogo de admin).
async function borrarImagenPrenda(url) {
  if (!url) return;
  const ruta = url.split("/object/public/prendas/")[1];
  if (!ruta) return;
  await supabaseClient.storage.from("prendas").remove([ruta]);
}

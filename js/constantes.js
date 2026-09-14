/* =========================================================
   constantes.js — Valores fijos usados en toda la aplicación.
   No depende de ningún otro archivo: debe cargarse primero.
   ========================================================= */

// Tipos de prenda disponibles para donar/filtrar en el catálogo.
const TIPOS = ["Camibuso", "Camisa", "Sudadera", "Pantalón", "Falda", "Chaqueta", "Zapatos"];

// Tallas disponibles para donar/filtrar en el catálogo.
const TALLAS = ["6", "8", "10", "12", "14", "16", "S", "M", "L", "36", "38", "40"];

// Roles posibles de un usuario:
//  - "usuario": puede donar prendas y reservarlas (rol por defecto al registrarse).
//  - "almacen": además puede aceptar/rechazar las donaciones pendientes.
//  - "admin":   además puede administrar (crear/editar rol/eliminar) usuarios.
const ROLES = ["usuario", "almacen", "admin"];

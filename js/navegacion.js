/* =========================================================
   navegacion.js — Menú superior: cambio entre vistas y control
   de acceso por rol (qué botones/secciones ve cada usuario).

   Nota importante: esto solo oculta/muestra la interfaz según el
   rol para guiar a cada quien a lo que le corresponde. La seguridad
   real vive en las políticas RLS de Supabase (ver
   supabase/migrations/0001_init.sql): aunque alguien mostrara estos
   botones a mano desde las herramientas de desarrollador, la base
   de datos igual rechazaría cualquier operación no autorizada.
   ========================================================= */

// Muestra la sección correspondiente a data-vista y marca el botón activo.
// Además dispara el repintado propio de cada vista al entrar a ella.
document.querySelectorAll("nav button[data-vista]").forEach(b => {
  b.onclick = async () => {
    document.querySelectorAll("nav button[data-vista]").forEach(x => x.classList.remove("activo"));
    b.classList.add("activo");
    const v = b.dataset.vista;
    $("#vistaCatalogo").classList.toggle("oculto", v !== "catalogo");
    $("#vistaDonacion").classList.toggle("oculto", v !== "donacion");
    $("#vistaReservas").classList.toggle("oculto", v !== "reservas");
    $("#vistaAlmacen").classList.toggle("oculto", v !== "almacen");
    $("#vistaDashboard").classList.toggle("oculto", v !== "dashboard");
    $("#vistaUsuarios").classList.toggle("oculto", v !== "usuarios");
    if (v === "catalogo")  await pintarCatalogo();
    if (v === "reservas")  await pintarReservas();
    if (v === "almacen")   await pintarPendientes();
    if (v === "dashboard") await pintarDashboard();
    if (v === "usuarios")  await pintarUsuarios();
  };
});

// Muestra u oculta los botones de menú restringidos por rol:
// - "almacen" y "dashboard": visibles para roles "almacen" y "admin".
// - "usuarios": visible solo para rol "admin".
// Si la vista que el usuario tenía abierta deja de estarle permitida
// (por ejemplo, se degradó su propio rol desde el panel de usuarios),
// se lo regresa al catálogo para no dejar una vista oculta "abierta".
function actualizarNavPorRol() {
  const rol = sesion ? sesion.rol : "usuario";
  const puedeAlmacen  = rol === "almacen" || rol === "admin";
  const puedeUsuarios = rol === "admin";

  $('nav button[data-vista="almacen"]').classList.toggle("oculto", !puedeAlmacen);
  $('nav button[data-vista="dashboard"]').classList.toggle("oculto", !puedeAlmacen);
  $('nav button[data-vista="usuarios"]').classList.toggle("oculto", !puedeUsuarios);

  const vistaAlmacenAbierta   = !$("#vistaAlmacen").classList.contains("oculto");
  const vistaDashboardAbierta = !$("#vistaDashboard").classList.contains("oculto");
  const vistaUsuariosAbierta  = !$("#vistaUsuarios").classList.contains("oculto");
  if ((vistaAlmacenAbierta && !puedeAlmacen) || (vistaDashboardAbierta && !puedeAlmacen) || (vistaUsuariosAbierta && !puedeUsuarios)) {
    $('nav button[data-vista="catalogo"]').click();
  }
}

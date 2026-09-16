/* =========================================================
   dashboard.js — Estadísticas de donaciones (rol "almacen"/"admin").
   Dos gráficas SVG dibujadas a mano (sin librerías) — prendas más
   ofertadas por tipo (barras) y donaciones en el tiempo (línea) — más
   una tabla con las reservas realizadas (quién reservó qué prenda).
   Los filtros de tipo/talla aplican por igual a las gráficas y a la tabla.
   Las gráficas cuentan TODAS las donaciones sin importar su estado
   (pendiente, disponible, reservada o rechazada): el dashboard mide
   la participación total de la comunidad, no solo lo ya aprobado.
   ========================================================= */

const SVG_NS = "http://www.w3.org/2000/svg";
// Tamaño base de las gráficas; CSS las adapta al ancho disponible.
const GRAF_ANCHO = 900, GRAF_ALTO = 360;
const GRAF_MARGEN = { arriba: 28, derecha: 20, abajo: 40, izquierda: 34 };

// Colores tomados de las variables CSS ya definidas en estilos.css,
// para que las gráficas usen el mismo verde de marca que el resto de la app.
const raiz = getComputedStyle(document.documentElement);
const COLOR_MARCA       = raiz.getPropertyValue("--verde-osc").trim()  || "#1f5c39";
const COLOR_GRILLA      = raiz.getPropertyValue("--borde").trim()      || "#d8e8de";
const COLOR_TEXTO_SUAVE = raiz.getPropertyValue("--gris").trim()       || "#6b7d72";
const COLOR_SUPERFICIE  = "#ffffff"; // fondo de la tarjeta: usado como anillo de los puntos

llenar($("#dashTipo"),  TIPOS,  "Todos los tipos");
llenar($("#dashTalla"), TALLAS, "Todas las tallas", "Talla ");
$("#dashTipo").onchange  = pintarDashboard;
$("#dashTalla").onchange = pintarDashboard;

// Crea un elemento SVG con los atributos indicados (evita innerHTML:
// todo el contenido de texto se asigna luego con textContent).
function crearSVGEl(etiqueta, atributos) {
  const el = document.createElementNS(SVG_NS, etiqueta);
  for (const clave in atributos) el.setAttribute(clave, atributos[clave]);
  return el;
}

// Dado un valor máximo, devuelve un paso de grilla "lindo" (1, 2, 5, 10…)
// y el tope redondeado hacia arriba, para que el eje Y no muestre decimales raros.
function escalaLinda(maximo) {
  if (maximo <= 0) return { paso: 1, tope: 4 };
  const magnitud = Math.pow(10, Math.floor(Math.log10(maximo)));
  const normal = maximo / magnitud;
  let paso = normal <= 2 ? magnitud / 2 : normal <= 5 ? magnitud : magnitud * 2;
  paso = Math.max(1, Math.round(paso));
  return { paso, tope: Math.ceil(maximo / paso) * paso };
}

// Ruta de una barra con la esquina superior redondeada y la base cuadrada
// (apoyada en la línea base), según el estilo de trazo del resto de la app.
function pathBarraRedondeada(x, y, ancho, alto, radio) {
  if (alto <= 0) return `M${x},${y} H${x + ancho} Z`;
  const r = Math.max(0, Math.min(radio, ancho / 2, alto));
  return `M${x},${y + alto} V${y + r} Q${x},${y} ${x + r},${y} H${x + ancho - r} Q${x + ancho},${y} ${x + ancho},${y + r} V${y + alto} Z`;
}

function formatFechaCorta(fecha) {
  return new Date(fecha + "T00:00:00").toLocaleDateString("es-CO", { day: "2-digit", month: "short" });
}

// Aplica los filtros de tipo/talla del dashboard sobre todas las prendas
// donadas (cualquier estado: el dashboard mide participación total).
async function datosFiltrados() {
  const tipo = $("#dashTipo").value, talla = $("#dashTalla").value;
  let query = supabaseClient.from("prendas").select("id, tipo, creada");
  if (tipo) query = query.eq("tipo", tipo);
  if (talla) query = query.eq("talla", talla);
  const { data, error } = await query;
  if (error) { console.error(error); return []; }
  return data;
}

// Cuenta cuántas prendas hay de cada tipo, de mayor a menor (para "más ofertadas").
function contarPorTipo(lista) {
  return TIPOS
    .map(tipo => ({ etiqueta: tipo, valor: lista.filter(p => p.tipo === tipo).length }))
    .sort((a, b) => b.valor - a.valor);
}

// Cuenta cuántas prendas se donaron cada día, ordenado cronológicamente.
function contarPorFecha(lista) {
  const conteoPorDia = new Map();
  lista.forEach(p => {
    const dia = new Date(p.creada).toISOString().slice(0, 10);
    conteoPorDia.set(dia, (conteoPorDia.get(dia) || 0) + 1);
  });
  return [...conteoPorDia.entries()]
    .map(([fecha, valor]) => ({ fecha, valor }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}

// Dibuja la gráfica de barras "prendas más ofertadas por tipo" dentro de contenedor.
// datos: [{ etiqueta, valor }], ya ordenados de mayor a menor.
function dibujarBarras(contenedor, datos) {
  const alto = GRAF_ALTO - GRAF_MARGEN.arriba - GRAF_MARGEN.abajo;
  const ancho = GRAF_ANCHO - GRAF_MARGEN.izquierda - GRAF_MARGEN.derecha;
  const maximo = Math.max(...datos.map(d => d.valor), 0);
  const { paso, tope } = escalaLinda(maximo);

  const svg = crearSVGEl("svg", {
    viewBox: `0 0 ${GRAF_ANCHO} ${GRAF_ALTO}`, width: "100%",
    role: "img", "aria-label": "Prendas donadas por tipo"
  });

  // Grilla horizontal recesiva + valores del eje Y.
  for (let v = 0; v <= tope; v += paso) {
    const y = GRAF_MARGEN.arriba + alto - (v / tope) * alto;
    svg.append(crearSVGEl("line", {
      x1: GRAF_MARGEN.izquierda, x2: GRAF_ANCHO - GRAF_MARGEN.derecha, y1: y, y2: y,
      stroke: COLOR_GRILLA, "stroke-width": 1
    }));
    const etiquetaY = crearSVGEl("text", {
      x: GRAF_MARGEN.izquierda - 8, y: y + 4, "text-anchor": "end",
      "font-size": 11, fill: COLOR_TEXTO_SUAVE
    });
    etiquetaY.textContent = v;
    svg.append(etiquetaY);
  }

  const anchoBanda = ancho / datos.length;
  const anchoBarra = Math.min(28, anchoBanda * 0.55);

  datos.forEach((d, i) => {
    const x = GRAF_MARGEN.izquierda + i * anchoBanda + (anchoBanda - anchoBarra) / 2;
    const h = tope > 0 ? (d.valor / tope) * alto : 0;
    const y = GRAF_MARGEN.arriba + alto - h;

    const barra = crearSVGEl("path", { d: pathBarraRedondeada(x, y, anchoBarra, h, 4), fill: COLOR_MARCA, class: "barra-svg" });
    const titulo = crearSVGEl("title", {});
    titulo.textContent = `${d.etiqueta}: ${d.valor}`;
    barra.append(titulo);
    svg.append(barra);

    if (d.valor > 0) {
      const valorTxt = crearSVGEl("text", {
        x: x + anchoBarra / 2, y: y - 6, "text-anchor": "middle",
        "font-size": 12, "font-weight": 700, fill: COLOR_MARCA
      });
      valorTxt.textContent = d.valor;
      svg.append(valorTxt);
    }

    const etiquetaX = crearSVGEl("text", {
      x: x + anchoBarra / 2, y: GRAF_MARGEN.arriba + alto + 18, "text-anchor": "middle",
      "font-size": 11, fill: COLOR_TEXTO_SUAVE
    });
    etiquetaX.textContent = d.etiqueta;
    svg.append(etiquetaX);
  });

  contenedor.replaceChildren(svg);
}

// Dibuja la gráfica de línea "donaciones en el tiempo" dentro de contenedor.
// datos: [{ fecha, valor }], ya ordenados cronológicamente.
// Nota de alcance: se etiqueta solo el primer y el último punto (regla de
// "etiquetar el extremo, no cada punto"); el resto del detalle vive en el
// tooltip nativo (<title>) de cada punto al pasar el mouse.
function dibujarLinea(contenedor, datos) {
  const alto = GRAF_ALTO - GRAF_MARGEN.arriba - GRAF_MARGEN.abajo;
  const ancho = GRAF_ANCHO - GRAF_MARGEN.izquierda - GRAF_MARGEN.derecha;
  const maximo = Math.max(...datos.map(d => d.valor), 0);
  const { paso, tope } = escalaLinda(maximo);

  const svg = crearSVGEl("svg", {
    viewBox: `0 0 ${GRAF_ANCHO} ${GRAF_ALTO}`, width: "100%",
    role: "img", "aria-label": "Donaciones por día"
  });

  for (let v = 0; v <= tope; v += paso) {
    const y = GRAF_MARGEN.arriba + alto - (v / tope) * alto;
    svg.append(crearSVGEl("line", {
      x1: GRAF_MARGEN.izquierda, x2: GRAF_ANCHO - GRAF_MARGEN.derecha, y1: y, y2: y,
      stroke: COLOR_GRILLA, "stroke-width": 1
    }));
    const etiquetaY = crearSVGEl("text", {
      x: GRAF_MARGEN.izquierda - 8, y: y + 4, "text-anchor": "end",
      "font-size": 11, fill: COLOR_TEXTO_SUAVE
    });
    etiquetaY.textContent = v;
    svg.append(etiquetaY);
  }

  const pasoX = datos.length > 1 ? ancho / (datos.length - 1) : 0;
  const puntos = datos.map((d, i) => ({
    x: GRAF_MARGEN.izquierda + (datos.length > 1 ? i * pasoX : ancho / 2),
    y: GRAF_MARGEN.arriba + alto - (tope > 0 ? (d.valor / tope) * alto : 0),
    dato: d
  }));

  if (puntos.length > 1) {
    const trazo = puntos.map((p, i) => (i === 0 ? "M" : "L") + `${p.x},${p.y}`).join(" ");
    svg.append(crearSVGEl("path", {
      d: trazo, fill: "none", stroke: COLOR_MARCA, "stroke-width": 2,
      "stroke-linecap": "round", "stroke-linejoin": "round"
    }));
  }

  puntos.forEach((p, i) => {
    const circulo = crearSVGEl("circle", {
      cx: p.x, cy: p.y, r: 5, fill: COLOR_MARCA,
      stroke: COLOR_SUPERFICIE, "stroke-width": 2, class: "punto-svg"
    });
    const titulo = crearSVGEl("title", {});
    titulo.textContent = `${formatFechaCorta(p.dato.fecha)}: ${p.dato.valor}`;
    circulo.append(titulo);
    svg.append(circulo);

    if (i === 0 || i === puntos.length - 1) {
      const valorTxt = crearSVGEl("text", {
        x: p.x, y: p.y - 10, "text-anchor": "middle",
        "font-size": 12, "font-weight": 700, fill: COLOR_MARCA
      });
      valorTxt.textContent = p.dato.valor;
      svg.append(valorTxt);

      const fechaTxt = crearSVGEl("text", {
        x: p.x, y: GRAF_MARGEN.arriba + alto + 18, "text-anchor": i === 0 ? "start" : "end",
        "font-size": 11, fill: COLOR_TEXTO_SUAVE
      });
      fechaTxt.textContent = formatFechaCorta(p.dato.fecha);
      svg.append(fechaTxt);
    }
  });

  contenedor.replaceChildren(svg);
}

// Construye la fila <tr> de una reserva para la tabla "Reservas realizadas"
// (columnas: quién reservó, prenda, descripción, fecha de entrega y estado).
// Se usa tanto en el dashboard como en la vista de almacén — ambas grillas
// son la misma tabla, solo que cada una decide qué reservas mostrarle.
// r.usuario y r.prenda vienen embebidos desde el select de Supabase
// (join usuario:usuarios(...), prenda:prendas(...)), no de un array global.
// Mientras no se haya entregado, se ven los botones "Marcar como entregado"
// y "Cancelar" juntos (ninguno depende del otro). Una vez entregada, es un
// estado final: ya no se puede cancelar, así que solo se ve el chip
// "Entregado", sin ningún botón.
// alCambiarEstado: función que repinta la vista que llamó a esta (cada
// vista refresca su propia grilla tras marcar entregado o cancelar).
function construirFilaReserva(r, alCambiarEstado) {
  const prenda = r.prenda;
  const usuario = r.usuario;
  const fecha = new Date(r.fecha_entrega + "T00:00:00")
    .toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" });
  const entregado = prenda && prenda.estado === "entregado";

  const fila = document.createElement("tr");
  fila.innerHTML = "<td></td><td></td><td></td><td></td><td></td>";
  const [cNombre, cPrenda, cDescripcion, cFecha, cEstado] = fila.querySelectorAll("td");
  cNombre.textContent = usuario ? usuario.nombre : "Usuario eliminado";
  cPrenda.textContent = prenda ? `${prenda.tipo} · Talla ${prenda.talla}` : "Prenda eliminada";
  cDescripcion.textContent = prenda && prenda.defectos ? prenda.defectos : "Sin defectos reportados";
  cFecha.textContent = fecha;

  if (entregado) {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = "Entregado";
    cEstado.append(chip);
  } else {
    const envoltorio = document.createElement("div");
    envoltorio.style.display = "flex";
    envoltorio.style.alignItems = "center";
    envoltorio.style.gap = ".5rem";

    const botonEntregar = document.createElement("button");
    botonEntregar.type = "button";
    botonEntregar.className = "btn-sec";
    botonEntregar.textContent = "Marcar como entregado";
    botonEntregar.onclick = async () => { await marcarEntregado(r); alCambiarEstado(); };

    const botonCancelar = document.createElement("button");
    botonCancelar.type = "button";
    botonCancelar.className = "btn-sec";
    botonCancelar.textContent = "Cancelar";
    botonCancelar.onclick = async () => { await cancelarReserva(r); alCambiarEstado(); };

    envoltorio.append(botonEntregar, botonCancelar);
    cEstado.append(envoltorio);
  }
  return fila;
}

// Marca como entregada la prenda de una reserva (ya se retiró físicamente),
// vía el RPC marcar_entregado (solo almacén/admin). La reserva NO se borra:
// queda como registro histórico de que se entregó.
async function marcarEntregado(r) {
  const { error } = await supabaseClient.rpc("marcar_entregado", { p_reserva_id: r.id });
  if (error) alert("No se pudo marcar como entregado: " + error.message);
}

// Cancela una reserva todavía no entregada, desde la grilla de almacén o
// del dashboard, vía el RPC cancelar_reserva: la prenda vuelve a
// "disponible" en el catálogo y se borra esta reserva, igual que el
// "Cancelar" que ya existía en "Mis reservas". Una vez entregada la prenda
// (ver construirFilaReserva) esta acción deja de ofrecerse: la entrega ya
// se hizo y no se deshace.
async function cancelarReserva(r) {
  const { error } = await supabaseClient.rpc("cancelar_reserva", { p_reserva_id: r.id });
  if (error) alert("No se pudo cancelar la reserva: " + error.message);
}

// Arma las filas de la tabla "Reservas realizadas" del dashboard: qué se
// reservó (tipo/talla/descripción), quién lo reservó, la fecha de entrega
// y si ya se entregó. idsPrendasFiltradas: Set con los id de las prendas
// que pasan los filtros de tipo/talla del dashboard (mismo criterio que
// las gráficas).
async function pintarTablaReservas(idsPrendasFiltradas) {
  const { data, error } = await supabaseClient
    .from("reservas")
    .select("*, usuario:usuarios(nombre), prenda:prendas(id,tipo,talla,defectos,estado)")
    .order("creada", { ascending: false });
  if (error) { console.error(error); return; }

  const filas = data.filter(r => idsPrendasFiltradas.has(r.prenda_id));

  const cuerpo = $("#tablaReservas tbody");
  cuerpo.innerHTML = "";
  $("#vacioTablaReservas").textContent = filas.length ? "" : "No hay reservas que coincidan con estos filtros.";
  $("#tablaReservas").classList.toggle("oculto", !filas.length);

  filas.forEach(r => cuerpo.append(construirFilaReserva(r, pintarDashboard)));
}

// Recalcula los datos según los filtros activos y redibuja las gráficas
// y la tabla de reservas. Se llama al entrar a la vista "dashboard" y
// cada vez que cambia un filtro.
async function pintarDashboard() {
  const lista = await datosFiltrados();
  const hayDatos = lista.length > 0;
  const mensaje = "No hay donaciones que coincidan con estos filtros.";

  $("#vacioBarras").textContent = hayDatos ? "" : mensaje;
  $("#vacioLinea").textContent = hayDatos ? "" : mensaje;
  $("#graficaBarras").classList.toggle("oculto", !hayDatos);
  $("#graficaLinea").classList.toggle("oculto", !hayDatos);

  if (hayDatos) {
    dibujarBarras($("#graficaBarras"), contarPorTipo(lista));
    dibujarLinea($("#graficaLinea"), contarPorFecha(lista));
  }

  await pintarTablaReservas(new Set(lista.map(p => p.id)));
}

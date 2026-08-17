const API = "/api";
const claveSesion = "cacd_llave_sesion";
const estadoAplicacion = {
  llaveSesion: localStorage.getItem(claveSesion),
  usuario: null,
  registroSeleccionado: null,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

function actualizarFechaHora() {
  const elemento = $("#fechaHoraActual");
  if (!elemento) return;
  const ahora = new Date();
  elemento.textContent = new Intl.DateTimeFormat("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(ahora);
}

actualizarFechaHora();
setInterval(actualizarFechaHora, 1000);

function mostrarAviso(mensaje, tipo = "info") {
  if (window.Swal) {
    Swal.fire({
      title: tipo === "success" ? "Operacion completada" : "Aviso del sistema",
      text: mensaje,
      icon: tipo,
      confirmButtonText: "Entendido",
      customClass: {
        popup: "alerta-institucional",
      },
    });
    return;
  }

  const elemento = $("#toast");
  elemento.textContent = mensaje;
  elemento.classList.add("show");
  setTimeout(() => elemento.classList.remove("show"), 2600);
}

async function consultarApi(ruta, opciones = {}) {
  const cabeceras = { "Content-Type": "application/json", ...(opciones.headers || {}) };
  if (estadoAplicacion.llaveSesion) cabeceras.Authorization = `Bearer ${estadoAplicacion.llaveSesion}`;
  const respuesta = await fetch(`${API}${ruta}`, { ...opciones, headers: cabeceras });
  if (!respuesta.ok) {
    const cuerpo = await respuesta.json().catch(() => ({}));
    throw new Error(cuerpo.detail || "No se pudo completar la operacion");
  }
  return respuesta.json();
}

function mostrarAplicacion() {
  $("#loginView").classList.add("hidden");
  $("#appView").classList.remove("hidden");
}

function mostrarIngreso() {
  $("#appView").classList.add("hidden");
  $("#loginView").classList.remove("hidden");
}

function cambiarPantalla(pantalla) {
  $$(".screen").forEach((elemento) => elemento.classList.remove("active"));
  $(`#screen-${pantalla}`).classList.add("active");
  $$(".nav-item").forEach((elemento) => elemento.classList.toggle("active", elemento.dataset.screen === pantalla));

  const titulos = {
    dashboard: ["Panel Control", "Resumen de Actividad"],
    newRecord: ["Nuevo Registro", "Formulario de Ingreso"],
    records: ["Registros", "Busqueda y Reportes"],
    settings: ["Configuracion", "Parametros"],
    detail: ["Registro", "Detalle del Acceso"],
  };
  const [contexto, titulo] = titulos[pantalla] || titulos.dashboard;
  $("#topContext").textContent = contexto;
  $("#pageTitle").textContent = titulo;

  if (pantalla === "dashboard") cargarPanel();
  if (pantalla === "records") cargarRegistros();
}

function etiquetaEstado(estado) {
  const clase = String(estado || "PENDIENTE").toLowerCase();
  return `<span class="status ${clase}">${estado}</span>`;
}

function formatearHora(valor) {
  if (!valor) return "--:--";
  return String(valor).slice(0, 5);
}

async function iniciarAplicacion() {
  if (!estadoAplicacion.llaveSesion) return mostrarIngreso();
  try {
    estadoAplicacion.usuario = await consultarApi("/usuario-actual");
    $("#sideUser").textContent = estadoAplicacion.usuario.nombre_completo;
    $("#flyoutUser").textContent = estadoAplicacion.usuario.nombre_completo;
    $("#topUser").textContent = estadoAplicacion.usuario.nombre_completo;
    mostrarAplicacion();
    cambiarPantalla("dashboard");
  } catch {
    localStorage.removeItem(claveSesion);
    estadoAplicacion.llaveSesion = null;
    mostrarIngreso();
  }
}

async function cargarPanel() {
  try {
    const datos = await consultarApi("/panel");
    $("#metricTotal").textContent = datos.resumen.ingresos_hoy || 0;
    $("#metricInside").textContent = datos.resumen.dentro_centro_datos || 0;
    $("#metricExits").textContent = datos.resumen.salidas_hoy || 0;
    $("#metricPending").textContent = datos.resumen.pendientes_salida || 0;
    $("#recentRows").innerHTML = datos.recientes.map((registro) => `
      <tr>
        <td>${registro.nombres_visitante}</td>
        <td>${registro.documento_visitante || "-"}</td>
        <td>${registro.empresa_o_area}</td>
        <td>${formatearHora(registro.hora_ingreso)}</td>
        <td>${etiquetaEstado(registro.estado)}</td>
      </tr>
    `).join("") || `<tr><td colspan="5">Sin registros recientes.</td></tr>`;
  } catch (error) {
    mostrarAviso(error.message);
  }
}

function parametrosFormulario(formulario) {
  const parametros = new URLSearchParams();
  new FormData(formulario).forEach((valor, clave) => {
    if (valor) parametros.append(clave, valor);
  });
  return parametros.toString();
}

async function cargarRegistros(parametros = "") {
  try {
    const registros = await consultarApi(`/registros-acceso${parametros ? `?${parametros}` : ""}`);
    $("#recordList").innerHTML = registros.map((registro) => `
      <tr>
        <td>${registro.codigo}</td>
        <td>${registro.fecha_acceso}</td>
        <td>${registro.nombres_visitante}</td>
        <td>${registro.documento_visitante || "-"}</td>
        <td>${registro.empresa_o_area}</td>
        <td>${registro.motivo_acceso}</td>
        <td>${formatearHora(registro.hora_ingreso)}</td>
        <td>${formatearHora(registro.hora_salida)}</td>
        <td>${etiquetaEstado(registro.estado)}</td>
        <td><button class="btn icon-only" data-detail="${registro.id}" title="Ver detalle"><i class="fa-regular fa-eye"></i></button></td>
      </tr>
    `).join("") || `<tr><td colspan="10">No se encontraron registros.</td></tr>`;
  } catch (error) {
    mostrarAviso(error.message);
  }
}

async function cargarDetalle(id) {
  try {
    const registro = await consultarApi(`/registros-acceso/${id}`);
    estadoAplicacion.registroSeleccionado = registro;
    $("#detailCode").textContent = `Registro de Acceso ${registro.codigo}`;
    $("#detailContent").innerHTML = `
      <div class="detail-left">
        <aside class="detail-card visitante-card">
          <div class="visitante-head">
            <div class="avatar-placeholder"><i class="fa-regular fa-user"></i></div>
            <div>
              <h3>${registro.nombres_visitante}</h3>
              <span class="doc-pill"><i class="fa-regular fa-id-card"></i>${registro.documento_visitante || "Sin documento"}</span>
            </div>
          </div>
          <div class="visitante-info">
            <div><span>Empresa / Area</span><strong>${registro.empresa_o_area}</strong></div>
            <div><span>Estado</span>${etiquetaEstado(registro.estado)}</div>
            <div class="span-2"><span>Area destino</span><strong>${registro.area_destino || "-"}</strong></div>
            <div class="span-2"><span>Contacto</span><strong>No registrado</strong></div>
          </div>
        </aside>

        <aside class="detail-card equipos-card">
          <h3><i class="fa-solid fa-laptop"></i> Equipos Declarados</h3>
          <div class="empty-equipment">
            <i class="fa-solid fa-circle-info"></i>
            <span>Los equipos se registran en observaciones.</span>
          </div>
        </aside>
      </div>

      <div class="detail-right">
        <section class="detail-card visita-card">
          <div class="detail-section-head">
            <h3><i class="fa-regular fa-circle-info"></i> Detalles de la Visita</h3>
            <span class="reason-pill">${registro.motivo_acceso}</span>
          </div>
          <div class="detail-pair-grid">
            <div class="detail-pair"><span>Hora ingreso</span><strong>${registro.fecha_acceso} - ${formatearHora(registro.hora_ingreso)}</strong><small>Registrado en sistema</small></div>
            <div class="detail-pair"><span>Hora salida</span><strong>${registro.hora_salida ? formatearHora(registro.hora_salida) : "Pendiente"}</strong><small>${registro.hora_salida ? "Registrado en sistema" : "Aun dentro / pendiente"}</small></div>
            <div class="detail-pair span-2 autorizador-box"><span>Personal OGITIC que recibe</span><strong>${registro.personal_ogitic}</strong><small>Responsable de recepcion</small></div>
            <div class="detail-pair span-2"><span>Observaciones</span><strong>${registro.observaciones || "-"}</strong></div>
          </div>
        </section>

        <section class="detail-card firmas-card">
          <h3><i class="fa-solid fa-signature"></i> Conformidad y Firmas</h3>
          <div class="firmas-grid">
          ${tarjetaFirma("Visitante", registro.firma_visitante_base64)}
          ${tarjetaFirma("Administrador OGITIC", registro.firma_ogitic_base64)}
            <article class="firma-box pendiente">
              <div><i class="fa-solid fa-shield-halved"></i></div>
              <strong>Seguridad</strong>
              <span>Pendiente</span>
            </article>
          </div>
        </section>

        <footer class="detail-card auditoria-card">
          <span><i class="fa-solid fa-clock-rotate-left"></i> Registrado por: <strong>${registro.creado_por}</strong> el ${registro.fecha_creacion}</span>
          <span><i class="fa-regular fa-clock"></i> Ultima modificacion: <strong>${registro.actualizado_por || "-"}</strong> ${registro.fecha_actualizacion || ""}</span>
        </footer>
      </div>
    `;
    cambiarPantalla("detail");
  } catch (error) {
    mostrarAviso(error.message);
  }
}

function tarjetaFirma(titulo, imagenBase64) {
  if (!imagenBase64) {
    return `
      <article class="firma-box pendiente">
        <div><i class="fa-regular fa-image"></i></div>
        <strong>${titulo}</strong>
        <span>Pendiente</span>
      </article>
    `;
  }

  return `
    <article class="firma-box">
      <img src="${imagenBase64}" alt="Firma ${titulo}">
      <strong>${titulo}</strong>
      <span>Registrada</span>
    </article>
  `;
}

$("#loginForm").addEventListener("submit", async (evento) => {
  evento.preventDefault();
  const datos = Object.fromEntries(new FormData(evento.currentTarget));
  try {
    const respuesta = await consultarApi("/autenticacion/ingreso", { method: "POST", body: JSON.stringify(datos) });
    estadoAplicacion.llaveSesion = respuesta.llave_sesion;
    estadoAplicacion.usuario = respuesta.usuario;
    localStorage.setItem(claveSesion, estadoAplicacion.llaveSesion);
    $("#sideUser").textContent = respuesta.usuario.nombre_completo;
    $("#flyoutUser").textContent = respuesta.usuario.nombre_completo;
    $("#topUser").textContent = respuesta.usuario.nombre_completo;
    mostrarAplicacion();
    cambiarPantalla("dashboard");
  } catch (error) {
    mostrarAviso(error.message);
  }
});

$("#logoutBtn").addEventListener("click", () => {
  localStorage.removeItem(claveSesion);
  estadoAplicacion.llaveSesion = null;
  estadoAplicacion.usuario = null;
  mostrarIngreso();
});

$("#sidebarToggle").addEventListener("click", () => {
  $("#appView").classList.toggle("sidebar-collapsed");
});

function prepararSelectorArchivo(inputId, nombreId, vistaId) {
  const input = $(`#${inputId}`);
  const nombre = $(`#${nombreId}`);
  const vista = $(`#${vistaId}`);
  if (!input || !nombre || !vista) return;

  input.closest(".file-control").addEventListener("click", (evento) => {
    if (evento.target === input) return;
    input.click();
  });
  input.addEventListener("change", () => {
    const archivo = input.files?.[0];
    nombre.textContent = archivo?.name || "Ningun archivo seleccionado";
    mostrarPrevisualizacionArchivo(archivo, vista);
  });
}

function mostrarPrevisualizacionArchivo(archivo, vista) {
  vista.innerHTML = "";
  if (!archivo) {
    vista.classList.add("hidden");
    return;
  }

  vista.classList.remove("hidden");
  if (archivo.type.startsWith("image/")) {
    const imagen = document.createElement("img");
    imagen.alt = archivo.name;
    imagen.src = URL.createObjectURL(archivo);
    imagen.onload = () => URL.revokeObjectURL(imagen.src);
    vista.appendChild(imagen);
    return;
  }

  vista.innerHTML = `
    <div class="file-placeholder">
      <i class="fa-regular fa-file-pdf"></i>
      <strong>${archivo.name}</strong>
      <small>Archivo listo para cargar</small>
    </div>
  `;
}

prepararSelectorArchivo("firmaVisitante", "nombreFirmaVisitante", "vistaFirmaVisitante");
prepararSelectorArchivo("firmaOgitic", "nombreFirmaOgitic", "vistaFirmaOgitic");

$("#recordForm").addEventListener("submit", async (evento) => {
  evento.preventDefault();
  const formulario = evento.currentTarget;
  const datosFormulario = new FormData(formulario);
  const firmaVisitante = datosFormulario.get("firma_visitante");
  const firmaOgitic = datosFormulario.get("firma_ogitic");
  const datos = Object.fromEntries(datosFormulario);
  delete datos.firma_visitante;
  delete datos.firma_ogitic;
  if (!datos.hora_salida) datos.hora_salida = null;
  try {
    const registro = await consultarApi("/registros-acceso", { method: "POST", body: JSON.stringify(datos) });
    if ((firmaVisitante && firmaVisitante.size) || (firmaOgitic && firmaOgitic.size)) {
      const firmas = new FormData();
      if (firmaVisitante && firmaVisitante.size) firmas.append("firma_visitante", firmaVisitante);
      if (firmaOgitic && firmaOgitic.size) firmas.append("firma_ogitic", firmaOgitic);
      const respuestaFirmas = await fetch(`${API}/registros-acceso/${registro.id}/firmas`, {
        method: "POST",
        headers: { Authorization: `Bearer ${estadoAplicacion.llaveSesion}` },
        body: firmas,
      });
      if (!respuestaFirmas.ok) throw new Error("El registro se guardo, pero no se pudo cargar la firma");
    }
    mostrarAviso(`Registro ${registro.codigo} guardado`, "success");
    formulario.reset();
    $("input[name='fecha_acceso']").value = fechaHoy;
    $("#nombreFirmaVisitante").textContent = "Ningun archivo seleccionado";
    $("#nombreFirmaOgitic").textContent = "Ningun archivo seleccionado";
    mostrarPrevisualizacionArchivo(null, $("#vistaFirmaVisitante"));
    mostrarPrevisualizacionArchivo(null, $("#vistaFirmaOgitic"));
    cargarDetalle(registro.id);
  } catch (error) {
    mostrarAviso(error.message);
  }
});

$("#filterForm").addEventListener("submit", (evento) => {
  evento.preventDefault();
  cargarRegistros(parametrosFormulario(evento.currentTarget));
});

$("#markExitBtn").addEventListener("click", async () => {
  if (!estadoAplicacion.registroSeleccionado) return;
  const ahora = new Date();
  const horaSalida = `${String(ahora.getHours()).padStart(2, "0")}:${String(ahora.getMinutes()).padStart(2, "0")}`;
  const cuerpo = new URLSearchParams({ hora_salida: horaSalida });
  try {
    const cabeceras = { Authorization: `Bearer ${estadoAplicacion.llaveSesion}` };
    const respuesta = await fetch(`${API}/registros-acceso/${estadoAplicacion.registroSeleccionado.id}/salida`, {
      method: "PATCH",
      headers: cabeceras,
      body: cuerpo,
    });
    if (!respuesta.ok) throw new Error("No se pudo marcar la salida");
    mostrarAviso("Salida registrada");
    cargarDetalle(estadoAplicacion.registroSeleccionado.id);
  } catch (error) {
    mostrarAviso(error.message);
  }
});

document.addEventListener("click", (evento) => {
  const botonPantalla = evento.target.closest("[data-screen]");
  if (botonPantalla) cambiarPantalla(botonPantalla.dataset.screen);
  const botonDetalle = evento.target.closest("[data-detail]");
  if (botonDetalle) cargarDetalle(botonDetalle.dataset.detail);
});

const fechaHoy = new Date().toISOString().slice(0, 10);
$("input[name='fecha_acceso']").value = fechaHoy;

iniciarAplicacion();

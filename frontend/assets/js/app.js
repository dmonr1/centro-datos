const API = "/api";
const claveSesion = "cacd_llave_sesion";
const estadoAplicacion = {
  llaveSesion: localStorage.getItem(claveSesion),
  usuario: null,
  registroSeleccionado: null,
  registroEditando: null,
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
    listado: ["Listado", "Todos los Registros"],
    records: ["Registros", "Busqueda y Reportes"],
    detail: ["Registro", "Detalle del Acceso"],
  };
  const [contexto, titulo] = titulos[pantalla] || titulos.dashboard;
  $("#topContext").textContent = contexto;
  $("#pageTitle").textContent = titulo;

  if (pantalla === "dashboard") cargarPanel();
  if (pantalla === "listado") cargarListadoRegistros();
  if (pantalla === "records") cargarRegistros();
  if (pantalla === "newRecord") setTimeout(ajustarPadsFirma, 60);
}

function etiquetaEstado(estado) {
  const clase = String(estado || "PENDIENTE").toLowerCase();
  return `<span class="status ${clase}">${estado}</span>`;
}

function formatearHora(valor) {
  if (!valor) return "--:--";
  return String(valor).slice(0, 5);
}

function nombreUsuarioActual() {
  return estadoAplicacion.usuario?.nombre_completo || estadoAplicacion.usuario?.nombre_usuario || "";
}

function sincronizarResponsableRegistro() {
  const campo = $("#personalOgitic");
  if (campo) campo.value = nombreUsuarioActual();
}

function sincronizarPendienteSalida() {
  const pendiente = $("#pendienteSalida");
  const horaSalida = $("#horaSalida");
  if (!pendiente || !horaSalida) return;
  horaSalida.disabled = pendiente.checked;
  if (pendiente.checked) horaSalida.value = "";
}

function prepararNuevoRegistro() {
  estadoAplicacion.registroEditando = null;
  $("#recordForm").reset();
  $("input[name='fecha_acceso']").value = fechaHoy;
  $("#pendienteSalida").checked = true;
  sincronizarPendienteSalida();
  sincronizarResponsableRegistro();
  $(".panel-head h2").textContent = "Formulario de Ingreso";
  $(".form-actions .btn.primary").innerHTML = `<i class="fa-solid fa-floppy-disk"></i>Guardar Registro`;
}

async function iniciarAplicacion() {
  if (!estadoAplicacion.llaveSesion) return mostrarIngreso();
  try {
    estadoAplicacion.usuario = await consultarApi("/usuario-actual");
    $("#sideUser").textContent = estadoAplicacion.usuario.nombre_completo;
    $("#flyoutUser").textContent = estadoAplicacion.usuario.nombre_completo;
    $("#topUser").textContent = estadoAplicacion.usuario.nombre_completo;
    sincronizarResponsableRegistro();
    mostrarAplicacion();
    cambiarPantalla("dashboard");
  } catch {
    localStorage.removeItem(claveSesion);
    estadoAplicacion.llaveSesion = null;
    mostrarIngreso();
  }
}

async function cargarPanel() {
  mostrarSkeletonPanel();
  try {
    const datos = await consultarApi("/panel");
    $$(".metric-card").forEach((tarjeta) => tarjeta.classList.remove("loading"));
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
    $$(".metric-card").forEach((tarjeta) => tarjeta.classList.remove("loading"));
    mostrarAviso(error.message);
  }
}

function mostrarSkeletonPanel() {
  $$(".metric-card").forEach((tarjeta) => tarjeta.classList.add("loading"));
  $("#recentRows").innerHTML = Array.from({ length: 4 }, () => `
    <tr class="skeleton-row">
      <td><span class="skeleton-line"></span></td>
      <td><span class="skeleton-line"></span></td>
      <td><span class="skeleton-line"></span></td>
      <td><span class="skeleton-line"></span></td>
      <td><span class="skeleton-chip"></span></td>
    </tr>
  `).join("");
}

function parametrosFormulario(formulario) {
  const parametros = new URLSearchParams();
  new FormData(formulario).forEach((valor, clave) => {
    if (valor) parametros.append(clave, valor);
  });
  return parametros.toString();
}

async function cargarRegistros(parametros = "") {
  mostrarSkeletonRegistros();
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

function mostrarSkeletonRegistros() {
  $("#recordList").innerHTML = Array.from({ length: 6 }, () => `
    <tr class="skeleton-row">
      <td><span class="skeleton-line"></span></td>
      <td><span class="skeleton-line"></span></td>
      <td><span class="skeleton-line"></span></td>
      <td><span class="skeleton-line"></span></td>
      <td><span class="skeleton-line"></span></td>
      <td><span class="skeleton-line"></span></td>
      <td><span class="skeleton-line"></span></td>
      <td><span class="skeleton-line"></span></td>
      <td><span class="skeleton-chip"></span></td>
      <td><span class="skeleton-chip"></span></td>
    </tr>
  `).join("");
}

async function cargarListadoRegistros() {
  mostrarSkeletonListado();
  try {
    const registros = await consultarApi("/registros-acceso");
    $("#allRecordList").innerHTML = registros.map((registro) => `
      <tr>
        <td>${registro.codigo}</td>
        <td>${registro.fecha_acceso}</td>
        <td>${registro.nombres_visitante}</td>
        <td>${registro.documento_visitante || "-"}</td>
        <td>${registro.empresa_o_area}</td>
        <td>${formatearHora(registro.hora_ingreso)}</td>
        <td>${formatearHora(registro.hora_salida)}</td>
        <td>${etiquetaEstado(registro.estado)}</td>
        <td>
          <div class="row-actions">
            <button class="btn icon-only" data-detail="${registro.id}" title="Ver detalle"><i class="fa-regular fa-eye"></i></button>
            <button class="btn icon-only" data-edit="${registro.id}" title="Editar"><i class="fa-solid fa-pen-to-square"></i></button>
          </div>
        </td>
      </tr>
    `).join("") || `<tr><td colspan="9">No hay registros guardados.</td></tr>`;
  } catch (error) {
    mostrarAviso(error.message);
  }
}

function mostrarSkeletonListado() {
  $("#allRecordList").innerHTML = Array.from({ length: 6 }, () => `
    <tr class="skeleton-row">
      <td><span class="skeleton-line"></span></td>
      <td><span class="skeleton-line"></span></td>
      <td><span class="skeleton-line"></span></td>
      <td><span class="skeleton-line"></span></td>
      <td><span class="skeleton-line"></span></td>
      <td><span class="skeleton-line"></span></td>
      <td><span class="skeleton-line"></span></td>
      <td><span class="skeleton-chip"></span></td>
      <td><span class="skeleton-chip"></span></td>
    </tr>
  `).join("");
}

async function editarRegistro(id) {
  try {
    const registro = await consultarApi(`/registros-acceso/${id}`);
    estadoAplicacion.registroEditando = registro;
    const formulario = $("#recordForm");
    formulario.fecha_acceso.value = registro.fecha_acceso;
    formulario.hora_ingreso.value = formatearHora(registro.hora_ingreso);
    $("#pendienteSalida").checked = !registro.hora_salida;
    $("#horaSalida").value = registro.hora_salida ? formatearHora(registro.hora_salida) : "";
    sincronizarPendienteSalida();
    formulario.nombres_visitante.value = registro.nombres_visitante || "";
    formulario.documento_visitante.value = registro.documento_visitante || "";
    formulario.empresa_o_area.value = registro.empresa_o_area || "";
    formulario.area_destino.value = registro.area_destino || "";
    formulario.motivo_acceso.value = registro.motivo_acceso || "";
    formulario.personal_ogitic.value = registro.personal_ogitic || nombreUsuarioActual();
    formulario.observaciones.value = registro.observaciones || "";
    cambiarPantalla("newRecord");
    $("#pageTitle").textContent = "Editar Registro";
    $(".panel-head h2").textContent = `Editar ${registro.codigo}`;
    $(".form-actions .btn.primary").innerHTML = `<i class="fa-solid fa-floppy-disk"></i>Guardar Cambios`;
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
            <h3><i class="fa-solid fa-circle-info"></i> Detalles de la Visita</h3>
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
    <article class="firma-box firma-preview" data-preview-image="${imagenBase64}" data-preview-title="Firma ${titulo}">
      <img src="${imagenBase64}" alt="Firma ${titulo}">
      <strong>${titulo}</strong>
      <span>Registrada</span>
    </article>
  `;
}

function abrirModalImagen(origen, titulo = "Imagen ampliada") {
  if (!origen) return;
  $("#imagenAmpliada").src = origen;
  $("#imagenAmpliada").alt = titulo;
  $("#imageModal").classList.remove("hidden");
  $("#imageModal").setAttribute("aria-hidden", "false");
}

function cerrarModalImagen() {
  $("#imageModal").classList.add("hidden");
  $("#imageModal").setAttribute("aria-hidden", "true");
  $("#imagenAmpliada").src = "";
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
    sincronizarResponsableRegistro();
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

const firmasDibujadas = { visitante: null, ogitic: null };
const camposFirma = {
  visitante: {
    input: "#firmaVisitante",
    nombre: "#nombreFirmaVisitante",
    vista: "#vistaFirmaVisitante",
    etiqueta: "Firma usuario / proveedor",
    archivo: "firma-visitante.png",
  },
  ogitic: {
    input: "#firmaOgitic",
    nombre: "#nombreFirmaOgitic",
    vista: "#vistaFirmaOgitic",
    etiqueta: "Firma administrador OGITIC",
    archivo: "firma-ogitic.png",
  },
};
const modalFirma = {
  tipo: null,
  dibujando: false,
  tieneTrazo: false,
  canvas: $("#padFirmaModal"),
  contenedor: $(".signature-board"),
};
modalFirma.contexto = modalFirma.canvas?.getContext("2d");

function prepararTrazoModal() {
  if (!modalFirma.contexto) return;
  modalFirma.contexto.lineCap = "round";
  modalFirma.contexto.lineJoin = "round";
  modalFirma.contexto.lineWidth = 2.6;
  modalFirma.contexto.strokeStyle = "#102033";
}

function ajustarModalFirma() {
  const canvas = modalFirma.canvas;
  if (!canvas) return;
  const rectangulo = canvas.getBoundingClientRect();
  if (!rectangulo.width || !rectangulo.height) return;
  const imagenActual = modalFirma.tieneTrazo ? canvas.toDataURL("image/png") : null;
  const escala = window.devicePixelRatio || 1;
  canvas.width = Math.round(rectangulo.width * escala);
  canvas.height = Math.round(rectangulo.height * escala);
  modalFirma.contexto.setTransform(escala, 0, 0, escala, 0, 0);
  prepararTrazoModal();
  if (imagenActual) {
    const imagen = new Image();
    imagen.onload = () => modalFirma.contexto.drawImage(imagen, 0, 0, rectangulo.width, rectangulo.height);
    imagen.src = imagenActual;
  }
}

function posicionFirma(evento) {
  const rectangulo = modalFirma.canvas.getBoundingClientRect();
  return {
    x: evento.clientX - rectangulo.left,
    y: evento.clientY - rectangulo.top,
  };
}

function limpiarModalFirma() {
  if (!modalFirma.canvas || !modalFirma.contexto) return;
  modalFirma.contexto.clearRect(0, 0, modalFirma.canvas.width, modalFirma.canvas.height);
  modalFirma.tieneTrazo = false;
  modalFirma.contenedor?.classList.remove("has-drawing");
}

function abrirModalFirma(tipo) {
  if (!camposFirma[tipo]) return;
  modalFirma.tipo = tipo;
  $("#signatureModalTitle").textContent = camposFirma[tipo].etiqueta;
  $("#signatureModal").classList.remove("hidden");
  $("#signatureModal").setAttribute("aria-hidden", "false");
  limpiarModalFirma();
  setTimeout(ajustarModalFirma, 40);
}

window.abrirModalFirma = abrirModalFirma;

function cerrarModalFirma() {
  $("#signatureModal").classList.add("hidden");
  $("#signatureModal").setAttribute("aria-hidden", "true");
  modalFirma.tipo = null;
  modalFirma.dibujando = false;
}

function dataUrlAArchivo(dataUrl, nombreArchivo) {
  const [cabecera, contenido] = dataUrl.split(",");
  const tipo = cabecera.match(/:(.*?);/)?.[1] || "image/png";
  const binario = atob(contenido);
  const bytes = new Uint8Array(binario.length);
  for (let indice = 0; indice < binario.length; indice += 1) bytes[indice] = binario.charCodeAt(indice);
  return new File([bytes], nombreArchivo, { type: tipo });
}

function mostrarFirmaDibujada(tipo, dataUrl) {
  const campo = camposFirma[tipo];
  if (!campo) return;
  firmasDibujadas[tipo] = dataUrl;
  $(campo.input).value = "";
  $(campo.nombre).textContent = "Firma dibujada en pantalla";
  const vista = $(campo.vista);
  vista.classList.remove("hidden");
  vista.innerHTML = `<img src="${dataUrl}" alt="${campo.etiqueta}">`;
}

function limpiarFirma(tipo) {
  const campo = camposFirma[tipo];
  if (!campo) return;
  firmasDibujadas[tipo] = null;
  $(campo.input).value = "";
  $(campo.nombre).textContent = "Ningun archivo seleccionado";
  mostrarPrevisualizacionArchivo(null, $(campo.vista));
}

if (modalFirma.canvas) {
  modalFirma.canvas.addEventListener("pointerdown", (evento) => {
    evento.preventDefault();
    ajustarModalFirma();
    modalFirma.canvas.setPointerCapture(evento.pointerId);
    const punto = posicionFirma(evento);
    modalFirma.dibujando = true;
    modalFirma.tieneTrazo = true;
    modalFirma.contenedor?.classList.add("has-drawing");
    modalFirma.contexto.beginPath();
    modalFirma.contexto.moveTo(punto.x, punto.y);
  });

  modalFirma.canvas.addEventListener("pointermove", (evento) => {
    if (!modalFirma.dibujando) return;
    evento.preventDefault();
    const punto = posicionFirma(evento);
    modalFirma.contexto.lineTo(punto.x, punto.y);
    modalFirma.contexto.stroke();
  });

  ["pointerup", "pointercancel", "pointerleave"].forEach((eventoNombre) => {
    modalFirma.canvas.addEventListener(eventoNombre, () => {
      modalFirma.dibujando = false;
    });
  });
}

function ajustarPadsFirma() {
  if (!$("#signatureModal").classList.contains("hidden")) ajustarModalFirma();
}

function prepararSelectorArchivo(inputId, nombreId, vistaId, padKey = null) {
  const input = $(`#${inputId}`);
  const nombre = $(`#${nombreId}`);
  const vista = $(`#${vistaId}`);
  if (!input || !nombre || !vista) return;

  input.addEventListener("change", () => {
    const archivo = input.files?.[0];
    if (archivo && padKey) firmasDibujadas[padKey] = null;
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

window.addEventListener("resize", ajustarPadsFirma);

prepararSelectorArchivo("firmaVisitante", "nombreFirmaVisitante", "vistaFirmaVisitante", "visitante");
prepararSelectorArchivo("firmaOgitic", "nombreFirmaOgitic", "vistaFirmaOgitic", "ogitic");

function manejarBotonDibujarFirma(evento) {
  const botonFirma = evento.target.closest("[data-open-signature]");
  if (!botonFirma) return;
  evento.preventDefault();
  evento.stopPropagation();
  evento.stopImmediatePropagation();
  abrirModalFirma(botonFirma.dataset.openSignature);
}

document.addEventListener("pointerdown", manejarBotonDibujarFirma, true);
document.addEventListener("click", manejarBotonDibujarFirma, true);

$$("[data-open-file]").forEach((boton) => {
  boton.addEventListener("click", (evento) => {
    evento.preventDefault();
    evento.stopPropagation();
    $(`#${boton.dataset.openFile}`)?.click();
  });
});

$$("[data-open-signature]").forEach((boton) => {
  boton.addEventListener("click", (evento) => {
    evento.preventDefault();
    evento.stopPropagation();
    abrirModalFirma(boton.dataset.openSignature);
  });
});

$("#limpiarFirmaVisitante").addEventListener("click", () => limpiarFirma("visitante"));
$("#limpiarFirmaOgitic").addEventListener("click", () => limpiarFirma("ogitic"));
$("#limpiarModalFirma").addEventListener("click", limpiarModalFirma);
$("#cancelarModalFirma").addEventListener("click", cerrarModalFirma);
$("#cerrarModalFirma").addEventListener("click", cerrarModalFirma);
$("#signatureModal").addEventListener("click", (evento) => {
  if (evento.target.id === "signatureModal") cerrarModalFirma();
});
$("#usarModalFirma").addEventListener("click", () => {
  if (!modalFirma.tipo || !modalFirma.tieneTrazo) {
    mostrarAviso("Dibuje una firma antes de usarla");
    return;
  }
  mostrarFirmaDibujada(modalFirma.tipo, modalFirma.canvas.toDataURL("image/png"));
  cerrarModalFirma();
});
$("#cerrarModalImagen").addEventListener("click", cerrarModalImagen);
$("#imageModal").addEventListener("click", (evento) => {
  if (evento.target.id === "imageModal") cerrarModalImagen();
});
$("#pendienteSalida").addEventListener("change", sincronizarPendienteSalida);
sincronizarPendienteSalida();

$("#recordForm").addEventListener("reset", () => {
  setTimeout(() => {
    estadoAplicacion.registroEditando = null;
    limpiarFirma("visitante");
    limpiarFirma("ogitic");
    $("#pendienteSalida").checked = true;
    sincronizarPendienteSalida();
    sincronizarResponsableRegistro();
    $(".panel-head h2").textContent = "Formulario de Ingreso";
    $(".form-actions .btn.primary").innerHTML = `<i class="fa-solid fa-floppy-disk"></i>Guardar Registro`;
  }, 0);
});

$("#recordForm").addEventListener("submit", async (evento) => {
  evento.preventDefault();
  const formulario = evento.currentTarget;
  const datosFormulario = new FormData(formulario);
  const firmaVisitanteDibujada = firmasDibujadas.visitante
    ? dataUrlAArchivo(firmasDibujadas.visitante, camposFirma.visitante.archivo)
    : null;
  const firmaOgiticDibujada = firmasDibujadas.ogitic
    ? dataUrlAArchivo(firmasDibujadas.ogitic, camposFirma.ogitic.archivo)
    : null;
  const firmaVisitante = firmaVisitanteDibujada || datosFormulario.get("firma_visitante");
  const firmaOgitic = firmaOgiticDibujada || datosFormulario.get("firma_ogitic");
  const datos = Object.fromEntries(datosFormulario);
  delete datos.firma_visitante;
  delete datos.firma_ogitic;
  if (!datos.hora_salida) datos.hora_salida = null;
  try {
    const editando = estadoAplicacion.registroEditando;
    const rutaRegistro = editando ? `/registros-acceso/${editando.id}` : "/registros-acceso";
    const metodoRegistro = editando ? "PATCH" : "POST";
    const registro = await consultarApi(rutaRegistro, { method: metodoRegistro, body: JSON.stringify(datos) });
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
    mostrarAviso(`Registro ${registro.codigo} ${editando ? "actualizado" : "guardado"}`, "success");
    estadoAplicacion.registroEditando = null;
    formulario.reset();
    $("input[name='fecha_acceso']").value = fechaHoy;
    sincronizarResponsableRegistro();
    sincronizarPendienteSalida();
    $(".panel-head h2").textContent = "Formulario de Ingreso";
    $(".form-actions .btn.primary").innerHTML = `<i class="fa-solid fa-floppy-disk"></i>Guardar Registro`;
    $("#nombreFirmaVisitante").textContent = "Ningun archivo seleccionado";
    $("#nombreFirmaOgitic").textContent = "Ningun archivo seleccionado";
    mostrarPrevisualizacionArchivo(null, $("#vistaFirmaVisitante"));
    mostrarPrevisualizacionArchivo(null, $("#vistaFirmaOgitic"));
    limpiarFirma("visitante");
    limpiarFirma("ogitic");
    cargarPanel();
    cargarListadoRegistros();
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
  const firma = evento.target.closest("[data-preview-image]");
  if (firma) {
    abrirModalImagen(firma.dataset.previewImage, firma.dataset.previewTitle);
    return;
  }

  const botonPantalla = evento.target.closest("[data-screen]");
  if (botonPantalla) {
    if (botonPantalla.dataset.screen === "newRecord" && !estadoAplicacion.registroEditando) prepararNuevoRegistro();
    cambiarPantalla(botonPantalla.dataset.screen);
  }
  const botonDetalle = evento.target.closest("[data-detail]");
  if (botonDetalle) cargarDetalle(botonDetalle.dataset.detail);
  const botonEditar = evento.target.closest("[data-edit]");
  if (botonEditar) editarRegistro(botonEditar.dataset.edit);
});

const fechaHoy = new Date().toISOString().slice(0, 10);
$("input[name='fecha_acceso']").value = fechaHoy;

iniciarAplicacion();

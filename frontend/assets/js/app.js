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

// Chart.js global defaults (use Poppins)
if (window.Chart) {
  Chart.defaults.font.family = 'Poppins';
  Chart.defaults.color = '#0f172a';
}

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
  try {
    if (window.Swal) {
      Swal.fire({
        title: tipo === "success" ? "Operacion completada" : "Aviso del sistema",
        text: mensaje,
        icon: tipo,
        confirmButtonText: "Entendido",
        customClass: { popup: "alerta-institucional" },
      });
      return;
    }

    const elemento = $("#toast");
    if (elemento) {
      elemento.textContent = mensaje;
      elemento.classList.add("show");
      setTimeout(() => elemento.classList.remove("show"), 2600);
      return;
    }

    // Fallback si no existe el toast en el DOM
    alert(mensaje);
  } catch (err) {
    // Si mostrarAviso falla, asegurar que al menos se loguee y no rompa el flujo
    console.error("mostrarAviso fallo:", err);
    try { alert(mensaje); } catch (e) { /* nada */ }
  }
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
    dashboard: ["Inicio", "Resumen de Actividad"],
    newRecord: ["Nuevo Registro", "Formulario de Ingreso"],
    listado: ["Listado", "Todos los Registros"],
    records: ["Registros", "Busqueda y Reportes"],
    historial: ["Historial de Accesos", "Consulta de registros"] ,
    reportes: ["Reportes", "Analisis historico de accesos"],
    detail: ["Registro", "Detalle del Acceso"],
  };
  const [contexto, titulo] = titulos[pantalla] || titulos.dashboard;
  $("#topContext").textContent = contexto;
  $("#pageTitle").textContent = titulo;

  // Mostrar/ocultar botón flotante en Inicio
  const fab = $("#fabNewRecord");
  if (fab) {
    if (pantalla === "dashboard") {
      fab.classList.remove("hidden");
    } else {
      fab.classList.add("hidden");
    }
  }

  if (pantalla === "dashboard") cargarPanel();
  if (pantalla === "listado") cargarListadoRegistros();
  if (pantalla === "records") cargarRegistros();
  if (pantalla === "historial") cargarHistorial();
  if (pantalla === "reportes") cargarReportes();
  if (pantalla === "newRecord") setTimeout(ajustarPadsFirma, 60);
}

function etiquetaEstado(estado) {
  const valor = String(estado || "PENDIENTE_SALIDA").toUpperCase();
  const clase = valor === "PENDIENTE_SALIDA" ? "pendiente" : valor.toLowerCase();
  const texto = {
    DENTRO: "Dentro",
    SALIO: "Salio",
    PENDIENTE: "Pendiente",
    PENDIENTE_SALIDA: "Pendiente de salida",
  }[valor] || valor;
  return `<span class="status ${clase}">${texto}</span>`;
}

function formatearHora(valor) {
  if (!valor) return "--:--";
  return String(valor).slice(0, 5);
}

function formatearHoraSalida(valor) {
  return valor ? formatearHora(valor) : "Pendiente de salida";
}

function estadoPorSalida(registro) {
  return registro?.hora_salida ? "SALIO" : "PENDIENTE_SALIDA";
}

// Utilities used by multiple renderers
const escapeHtml = (s) => String(s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function cleanMotivo(m, r) {
  const raw = String(m || '').trim();
  if (!raw) return escapeHtml((r && r.observaciones) || '-');
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(raw)) return escapeHtml((r && r.observaciones) || '-');
  return escapeHtml(raw);
}
function normalizeHM(t) { if (!t) return null; const parts = String(t).split(':'); return parts.length >= 2 ? `${String(parts[0]).padStart(2,'0')}:${String(parts[1]).padStart(2,'0')}` : t; }

function fechaLocalISO(fecha = new Date()) {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getDate()).padStart(2, "0");
  return `${anio}-${mes}-${dia}`;
}

function formatearMinutos(minutos) {
  const total = Math.max(0, Number(minutos) || 0);
  if (total < 60) return `${total} min`;
  const horas = Math.floor(total / 60);
  const resto = total % 60;
  return resto ? `${horas}h ${resto}m` : `${horas}h`;
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
  // hide back button when creating a new record
  const backBtn = $("#backFromForm");
  if (backBtn) backBtn.style.display = 'none';
  // hide motivo custom
  const motivoWrapper = document.querySelector('.motivo-otro-wrapper');
  if (motivoWrapper) motivoWrapper.classList.add('hidden');
}

async function iniciarAplicacion() {
  if (!estadoAplicacion.llaveSesion) return mostrarIngreso();
  try {
    estadoAplicacion.usuario = await consultarApi("/usuario-actual");
    $("#sideUser").textContent = estadoAplicacion.usuario.nombre_completo;
    $("#flyoutUser").textContent = estadoAplicacion.usuario.nombre_completo;
    const topUserEl = $("#topUser");
    if (topUserEl) topUserEl.textContent = estadoAplicacion.usuario.nombre_completo;
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
    // KPIs
    console.debug('panel response:', datos);
    const getVal = (...paths) => {
      for (const p of paths) {
        if (p.includes('.')) {
          const parts = p.split('.');
          let cur = datos;
          for (const part of parts) { if (cur && part in cur) cur = cur[part]; else { cur = undefined; break; } }
          if (cur !== undefined && cur !== null) return cur;
        } else {
          if (datos && p in datos && datos[p] !== undefined && datos[p] !== null) return datos[p];
          if (datos && datos.resumen && p in datos.resumen && datos.resumen[p] !== undefined && datos.resumen[p] !== null) return datos.resumen[p];
        }
      }
      return 0;
    };
    const setIf = (sel, value) => { const el = $(sel); if (el) el.textContent = value; };
    setIf('#metricToday', getVal('resumen.ingresos_hoy', 'ingresos_hoy'));
    setIf('#metricInside', getVal('resumen.dentro_centro_datos', 'dentro_centro_datos'));
    setIf('#metricAvgTime', formatearMinutos(getVal('resumen.tiempo_promedio_hoy', 'tiempo_promedio_hoy')));
    setIf('#metricObservationsToday', getVal('resumen.observaciones_hoy', 'observaciones_hoy'));

    // recientes (panel) -> table resumen
    const recientes = (datos.recientes || []).filter((registro) => {
      const referencia = registro.fecha_movimiento || registro.fecha_actualizacion || registro.fecha_creacion;
      if (!referencia) return true;
      const tiempo = new Date(referencia).getTime();
      return Number.isNaN(tiempo) || tiempo >= Date.now() - (24 * 60 * 60 * 1000);
    });
      const recentRowsEl = $("#recentRows");
      if (recentRowsEl) {
        recentRowsEl.innerHTML = recientes.map((registro) => `
      <tr>
        <td>${registro.nombres_visitante}</td>
        <td>${registro.documento_visitante || "-"}</td>
        <td>${registro.empresa_o_area}</td>
        <td>${formatearHora(registro.hora_ingreso)}</td>
        <td>${etiquetaEstado(registro.estado)}</td>
      </tr>
      `).join("") || `<tr><td colspan="5">Sin registros recientes.</td></tr>`;
      }

    // Render last 5 list
    renderRecentFive(recientes.slice(0,5));
    renderRecentMovements(recientes.slice(0,6));
    renderInsidePeople(datos.dentro_actualmente || []);

    // Load today for hourly chart
    const hoy = new Date();
    const desde = new Date(hoy);
    desde.setDate(hoy.getDate() - 6);
    const desdeStr = fechaLocalISO(desde);
    const hastaStr = fechaLocalISO(hoy);
    try {
      const registros7 = await consultarApi(`/registros-acceso?fecha_desde=${desdeStr}&fecha_hasta=${hastaStr}`);
      const horasMap = new Map();
      registros7
        .filter((r) => r.fecha_acceso === hastaStr)
        .forEach(r => {
          const hora = r.hora_ingreso ? Number(String(r.hora_ingreso).slice(0,2)) : null;
          if (Number.isInteger(hora) && hora >= 8 && hora <= 17) horasMap.set(hora, (horasMap.get(hora)||0)+1);
        });
      const horasBase = Array.from({ length: 10 }, (_, i) => i + 8);
      const horasArr = horasBase.map((h) => [`${h}:00`, horasMap.get(h) || 0]);
      drawVerticalBar('chartHourlyToday', horasArr, reportCharts.chartHourlyToday);
    } catch (e) { /* ignore small chart errors */ }
  } catch (error) {
    $$(".metric-card").forEach((tarjeta) => tarjeta.classList.remove("loading"));
    mostrarAviso(error.message);
  }
}

function mostrarSkeletonPanel() {
  $$(".metric-card").forEach((tarjeta) => tarjeta.classList.add("loading"));
  const recentRowsEl = $("#recentRows");
  if (recentRowsEl) recentRowsEl.innerHTML = Array.from({ length: 4 }, () => `
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
        <td>${formatearHoraSalida(registro.hora_salida)}</td>
        <td>${etiquetaEstado(estadoPorSalida(registro))}</td>
        <td><button class="btn icon-only" data-detail="${registro.id}" title="Ver detalle"><i class="fa-regular fa-eye"></i></button></td>
      </tr>
    `).join("") || `<tr><td colspan="10">No se encontraron registros.</td></tr>`;
  } catch (error) {
    mostrarAviso(error.message);
  }
}

let historialCache = [];
let historialFiltradoCache = [];
let historialPaginaActual = 1;
const historialPorPagina = 20;
let reportDataCache = [];
const reportCharts = {};

function agruparYContar(items, keyFn) {
  const mapa = new Map();
  items.forEach((it) => {
    const k = keyFn(it) || 'Sin dato';
    mapa.set(k, (mapa.get(k) || 0) + 1);
  });
  return Array.from(mapa.entries()).sort((a,b)=>b[1]-a[1]);
}

function minutosEntre(horaInicio, horaFin) {
  if (!horaInicio || !horaFin) return null;
  const [hi, mi] = horaInicio.split(":").map(Number);
  const [hf, mf] = horaFin.split(":").map(Number);
  let inicio = hi*60 + mi;
  let fin = hf*60 + mf;
  if (fin < inicio) fin += 24*60;
  return fin - inicio;
}

function bucketDuracion(minutos) {
  if (minutos == null) return 'Sin salida';
  if (minutos < 30) return 'Menos de 30 min';
  if (minutos < 60) return '30 min - 1 hora';
  if (minutos < 120) return '1 - 2 horas';
  if (minutos < 240) return '2 - 4 horas';
  return 'Más de 4 horas';
}

function actualizarIndicadorObservaciones(registros) {
  const total = registros.length;
  const conObs = registros.filter(r => r.observaciones && String(r.observaciones).trim() !== '').length;
  const elem = $("#regObservationsCount");
  if (elem) elem.textContent = `${conObs} (${Math.round((conObs/Math.max(total,1))*100)}%)`;
}

async function cargarReportes(parametros = "") {
  const form = $("#reportFilterForm");
  // show loading skeleton in charts
  mostrarSkeletonRegistros();
  try {
    const registros = await consultarApi(`/registros-acceso${parametros ? `?${parametros}` : ""}`);
    reportDataCache = registros;
    actualizarIndicadorObservaciones(registros);

    const mesesOrden = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    const meses = new Map(mesesOrden.map((mes) => [mes, 0]));
    registros.forEach((r) => {
      const fecha = new Date(`${r.fecha_acceso}T00:00:00`);
      if (!Number.isNaN(fecha.getTime())) {
        const etiqueta = mesesOrden[fecha.getMonth()];
        meses.set(etiqueta, (meses.get(etiqueta) || 0) + 1);
      }
    });
    drawLine('chartMes', Array.from(meses.entries()), reportCharts.chartMes);

    const motivos = agruparYContar(registros, r => r.motivo_acceso || 'Sin motivo');
    drawDonut('chartMotivo', motivos, 'legendMotivo');

    const areas = agruparYContar(registros, r => r.empresa_o_area || 'Sin area');
    drawHorizontalBarWithValues('chartArea', areas.slice(0, 10));

    const durMap = new Map();
    registros.forEach(r => { const m = minutosEntre(r.hora_ingreso, r.hora_salida); const b = bucketDuracion(m); durMap.set(b, (durMap.get(b)||0)+1); });
    const durOrden = ['Menos de 30 min', '30 min - 1 hora', '1 - 2 horas', '2 - 4 horas', 'Más de 4 horas', 'Sin salida'];
    const durArr = durOrden.filter((key) => durMap.has(key)).map((key) => [key, durMap.get(key)]);
    drawDonut('chartDuracion', durArr, 'legendDuracion');

    const ogitic = agruparYContar(registros, r => r.personal_ogitic || 'Sin registro');
    drawVerticalBarWithValues('chartOgitic', ogitic.slice(0, 10));

    const estados = agruparYContar(registros, (r) => {
      const estado = estadoPorSalida(r);
      if (estado === 'SALIO') return 'Salió';
      if (estado === 'PENDIENTE_SALIDA') return 'Dentro';
      return 'Pendiente';
    });
    drawDonut('chartEstado', estados, 'legendEstado');
  } catch (error) {
    mostrarAviso(error.message);
  }
}

function ensureCanvas(id) {
  return document.getElementById(id) || null;
}

function ejeEntero() {
  return {
    beginAtZero: true,
    ticks: {
      precision: 0,
      stepSize: 1,
      color: '#0f172a',
      font: { family: 'Poppins' },
      callback: (valor) => Number.isInteger(Number(valor)) ? valor : '',
    },
  };
}

function ejeCantidadFlexible() {
  return {
    beginAtZero: true,
    ticks: {
      precision: 0,
      color: '#0f172a',
      font: { family: 'Poppins' },
      callback: (valor) => Number.isInteger(Number(valor)) ? valor : '',
    },
  };
}

function destruirGrafico(id) {
  if (reportCharts[id]) {
    reportCharts[id].destroy();
    delete reportCharts[id];
  }
}

const etiquetasBarraPlugin = {
  id: 'etiquetasBarra',
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    const dataset = chart.data.datasets[0];
    if (!dataset) return;
    ctx.save();
    ctx.font = '700 11px Poppins, sans-serif';
    ctx.fillStyle = '#102033';
    ctx.textBaseline = 'middle';
    const meta = chart.getDatasetMeta(0);
    meta.data.forEach((bar, index) => {
      const valor = dataset.data[index];
      if (valor == null) return;
      if (chart.options.indexAxis === 'y') {
        ctx.textAlign = 'left';
        ctx.fillText(valor, bar.x + 8, bar.y);
      } else {
        ctx.textAlign = 'center';
        ctx.fillText(valor, bar.x, bar.y - 10);
      }
    });
    ctx.restore();
  },
};

function renderLegendList(legendId, dataPairs, colors) {
  const el = document.getElementById(legendId);
  if (!el) return;
  const total = dataPairs.reduce((sum, [, value]) => sum + Number(value || 0), 0);
  if (!dataPairs.length || total === 0) {
    el.innerHTML = `<div class="chart-legend-empty">Sin datos</div>`;
    return;
  }
  el.innerHTML = dataPairs.map(([label, value], index) => {
    const porcentaje = Math.round((Number(value || 0) / total) * 100);
    return `
      <div class="chart-legend-item">
        <span class="legend-dot" style="background:${colors[index % colors.length]}"></span>
        <span class="legend-label">${escapeHtml(label)}</span>
        <strong>${value}</strong>
        <small>${porcentaje}%</small>
      </div>`;
  }).join('');
}

function drawPie(id, dataPairs, existingChart) {
  const labels = dataPairs.map((d) => d[0]);
  const values = dataPairs.map((d) => d[1]);
  const ctx = ensureCanvas(id);
  if (!ctx) return;
  // ensure visible size
  try { ctx.style.height = ctx.style.height || '140px'; } catch(e) {}
  console.debug(`drawPie ${id}`, { labels, values });
  if (existingChart) {
    existingChart.data.labels = labels;
    existingChart.data.datasets[0].data = values;
    existingChart.update();
    return;
  }
  const cfg = {
    type: 'pie',
    data: {
      labels: labels,
      datasets: [
        {
          data: values,
          backgroundColor: generateColors(values.length),
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 2,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { font: { family: 'Poppins' } },
        },
      },
    },
  };
  reportCharts[id] = new Chart(ctx.getContext('2d'), cfg);
}

function drawBar(id, dataPairs, existingChart) {
  const labels = dataPairs.map(d=>d[0]);
  const values = dataPairs.map(d=>d[1]);
  const ctx = ensureCanvas(id);
  if (!ctx) return;
  if (existingChart) { existingChart.data.labels = labels; existingChart.data.datasets[0].data = values; existingChart.update(); return; }
  reportCharts[id] = new Chart(ctx.getContext('2d'), { type: 'bar', data: { labels, datasets: [{ label: '', data: values, backgroundColor: generateColors(values.length), borderColor: generateColors(values.length).map(c=>shadeColor(c,-30)), borderWidth: 1 }] }, options: { responsive: true, maintainAspectRatio: true, aspectRatio: 2, scales: { x: { ticks: { color: '#0f172a', font: { family: 'Poppins' } } }, y: ejeEntero() }, plugins: { legend: { display: false } } } });
}

function drawDonut(id, dataPairs, legendId) {
  const labels = dataPairs.map(d=>d[0]);
  const values = dataPairs.map(d=>d[1]);
  const ctx = ensureCanvas(id);
  if (!ctx) return;
  destruirGrafico(id);
  const colors = generateColors(Math.max(values.length, 1));
  renderLegendList(legendId, dataPairs, colors);
  reportCharts[id] = new Chart(ctx.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors,
        borderColor: '#fff',
        borderWidth: 3,
        hoverOffset: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '64%',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const total = values.reduce((sum, value) => sum + Number(value || 0), 0);
              const value = Number(ctx.parsed || 0);
              const porcentaje = total ? Math.round((value / total) * 100) : 0;
              return `${ctx.label}: ${value} (${porcentaje}%)`;
            },
          },
        },
      },
    },
  });
}

function drawHorizontalBarWithValues(id, dataPairs) {
  const labels = dataPairs.map(d=>d[0]);
  const values = dataPairs.map(d=>d[1]);
  const ctx = ensureCanvas(id);
  if (!ctx) return;
  destruirGrafico(id);
  const colors = generateColors(Math.max(values.length, 1));
  reportCharts[id] = new Chart(ctx.getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors,
        borderColor: colors.map(c=>shadeColor(c,-30)),
        borderWidth: 1,
        borderRadius: 8,
        maxBarThickness: 28,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { right: 28 } },
      scales: {
        x: ejeCantidadFlexible(),
        y: { ticks: { color: '#0f172a', font: { family: 'Poppins', size: 11 } }, grid: { display: false } },
      },
      plugins: { legend: { display: false }, tooltip: { enabled: true } },
    },
    plugins: [etiquetasBarraPlugin],
  });
}

function drawVerticalBarWithValues(id, dataPairs) {
  const labels = dataPairs.map(d=>d[0]);
  const values = dataPairs.map(d=>d[1]);
  const ctx = ensureCanvas(id);
  if (!ctx) return;
  destruirGrafico(id);
  const colors = generateColors(Math.max(values.length, 1));
  reportCharts[id] = new Chart(ctx.getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors,
        borderColor: colors.map(c=>shadeColor(c,-30)),
        borderWidth: 1,
        borderRadius: 8,
        maxBarThickness: 42,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 18 } },
      scales: {
        x: { ticks: { color: '#0f172a', font: { family: 'Poppins', size: 11 }, maxRotation: 35, minRotation: 0 }, grid: { display: false } },
        y: ejeCantidadFlexible(),
      },
      plugins: { legend: { display: false }, tooltip: { enabled: true } },
    },
    plugins: [etiquetasBarraPlugin],
  });
}

function drawVerticalBar(id, dataPairs, existingChart) {
  const labels = dataPairs.map(d=>d[0]);
  const values = dataPairs.map(d=>d[1]);
  const ctx = ensureCanvas(id);
  if (!ctx) return;
  if (existingChart) {
    existingChart.destroy();
    delete reportCharts[id];
  }
  reportCharts[id] = new Chart(ctx.getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: '',
        data: values,
        backgroundColor: '#63a9dc',
        borderColor: '#0b5f9f',
        borderWidth: 1,
        borderRadius: 8,
        maxBarThickness: 34,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#294963', font: { family: 'Poppins', size: 11 } },
        },
        y: ejeEntero(),
      },
      plugins: { legend: { display: false } },
    },
  });
}

function drawHorizontalBar(id, dataPairs, existingChart) {
  const labels = dataPairs.map(d=>d[0]);
  const values = dataPairs.map(d=>d[1]);
  const ctx = ensureCanvas(id);
  if (!ctx) return;
  if (existingChart) { existingChart.data.labels = labels; existingChart.data.datasets[0].data = values; existingChart.update(); return; }
  reportCharts[id] = new Chart(ctx.getContext('2d'), { type: 'bar', data: { labels, datasets: [{ data: values, backgroundColor: generateColors(values.length), borderColor: generateColors(values.length).map(c=>shadeColor(c,-30)), borderWidth: 1 }] }, options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, aspectRatio: 1.6, scales: { x: ejeEntero(), y: { ticks: { color: '#0f172a', font: { family: 'Poppins' } } } }, plugins: { legend: { display: false } } } });
}

function drawLine(id, dataPairs, existingChart) {
  const labels = dataPairs.map(d=>d[0]);
  const values = dataPairs.map(d=>d[1]);
  const ctx = ensureCanvas(id);
  if (!ctx) return;
  if (existingChart) { existingChart.data.labels = labels; existingChart.data.datasets[0].data = values; existingChart.update(); return; }
  reportCharts[id] = new Chart(ctx.getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: '',
        data: values,
        borderColor: '#1469a8',
        backgroundColor: '#1469a8',
        pointBackgroundColor: '#fff',
        pointBorderColor: '#1469a8',
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
        tension: .32,
        fill: false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { ticks: { color: '#0f172a', font: { family: 'Poppins' } }, grid: { display: false } },
        y: ejeCantidadFlexible(),
      },
      plugins: { legend: { display: false } },
    },
  });
}

function generateColors(n) {
  const palette = ['#4285f4', '#34a853', '#fbbc05', '#ff7043', '#ea4335', '#8e63ce'];
  return Array.from({ length: n }, (_, i) => palette[i % palette.length]);
}

function shadeColor(hex, percent) {
  try {
    const h = hex.replace('#','');
    const num = parseInt(h,16);
    let r = (num >> 16) + percent;
    let g = ((num >> 8) & 0x00FF) + percent;
    let b = (num & 0x0000FF) + percent;
    r = Math.max(Math.min(255, r), 0);
    g = Math.max(Math.min(255, g), 0);
    b = Math.max(Math.min(255, b), 0);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  } catch (e) { return hex; }
}

// Export report data as Excel
function exportReportesExcel() {
  const data = reportDataCache.map(r => ({ Fecha: r.fecha_acceso, Nombre: r.nombres_visitante, Documento: r.documento_visitante, Empresa: r.empresa_o_area, Motivo: r.motivo_acceso, HoraIngreso: r.hora_ingreso, HoraSalida: r.hora_salida, Personal: r.personal_ogitic, Observaciones: r.observaciones, Estado: r.estado }));
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, 'Reportes');
  XLSX.writeFile(wb, `reportes_accesos_${new Date().toISOString().slice(0,10)}.xlsx`);
}

// Export report area to PDF
async function exportReportesPDF() {
  const node = document.querySelector('#screen-reportes');
  if (!node) return;
  const canvas = await html2canvas(node, { scale: 1.5 });
  const imgData = canvas.toDataURL('image/png');
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF('landscape', 'pt', 'a4');
  const imgProps = pdf.getImageProperties(imgData);
  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
  pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
  pdf.save(`reportes_accesos_${new Date().toISOString().slice(0,10)}.pdf`);
}

async function cargarHistorial(parametros = "") {
  mostrarSkeletonRegistros();
  try {
    // Use backend search + date range; additional filters applied client-side
    const registros = await consultarApi(`/registros-acceso${parametros ? `?${parametros}` : ""}`);
    // store cache
    historialCache = registros;
    // Only apply client-side filters if the user has entered filter values or explicit params were passed.
    const form = $("#filterForm");
    const formHasValues = form ? Array.from(new FormData(form)).some(([,v]) => v && String(v).trim() !== "") : false;
    const filtrados = (parametros || formHasValues) ? aplicarFiltrosLocal(registros) : registros;
    historialPaginaActual = 1;
    renderHistorial(filtrados);
  } catch (error) {
    mostrarAviso(error.message);
  }
}

function renderHistorial(registros) {
  const cuerpo = $("#historialList");
  const tarjetas = $("#historialCards");
  if (!cuerpo) return;
  historialFiltradoCache = registros || [];
  const total = historialFiltradoCache.length;
  const totalPaginas = Math.max(1, Math.ceil(total / historialPorPagina));
  historialPaginaActual = Math.min(Math.max(historialPaginaActual, 1), totalPaginas);
  const inicio = (historialPaginaActual - 1) * historialPorPagina;
  const pagina = historialFiltradoCache.slice(inicio, inicio + historialPorPagina);
  if (total === 0) {
    cuerpo.innerHTML = `<tr><td colspan="11">No se encontraron registros.</td></tr>`;
    if (tarjetas) tarjetas.innerHTML = `
      <article class="historial-card historial-card-empty">
        <i class="fa-regular fa-folder-open"></i>
        <span>No se encontraron registros.</span>
      </article>`;
    renderHistorialPaginacion(0, 0, 0);
    return;
  }
  cuerpo.innerHTML = pagina.map((r, idx) => `
    <tr>
      <td>${inicio + idx + 1}</td>
      <td>${r.fecha_acceso}</td>
      <td>${r.nombres_visitante}</td>
      <td>${r.empresa_o_area || ''}</td>
      <td>${r.motivo_acceso || ''}</td>
      <td>${formatearHora(r.hora_ingreso)}</td>
      <td>${r.hora_salida ? formatearHora(r.hora_salida) : '<span class="status pendiente">Pendiente de salida</span>'}</td>
      <td>${r.personal_ogitic || ''}</td>
      <td>${(r.observaciones || '').replace(/</g, '&lt;')}</td>
      <td>${r.hora_salida ? etiquetaEstado('SALIO') : etiquetaEstado('DENTRO')}</td>
      <td>
        <div class="row-actions">
          <button class="btn icon-only action-view" data-detail="${r.id}" title="Ver detalle"><i class="fa-regular fa-eye"></i></button>
          <button class="btn icon-only action-edit" data-edit="${r.id}" title="Editar"><i class="fa-solid fa-pen-to-square"></i></button>
          ${!r.hora_salida ? `<button class="btn icon-only action-exit" data-mark-exit="${r.id}" title="Marcar salida"><i class="fa-solid fa-arrow-right-from-bracket"></i></button>` : ''}
        </div>
      </td>
    </tr>
  `).join('');
  if (tarjetas) {
    tarjetas.innerHTML = pagina.map((r, idx) => {
      const numero = inicio + idx + 1;
      const horaSalida = r.hora_salida
        ? formatearHora(r.hora_salida)
        : '<span class="status pendiente">Pendiente de salida</span>';
      const estado = r.hora_salida ? etiquetaEstado('SALIO') : etiquetaEstado('DENTRO');
      return `
        <article class="historial-card">
          <div class="historial-card-head">
            <div class="historial-card-title">
              <small>N° ${numero} · ${escapeHtml(r.fecha_acceso)}</small>
              <strong>${escapeHtml(r.nombres_visitante || 'Sin nombre')}</strong>
              <span>${escapeHtml(r.documento_visitante || 'Sin documento')}</span>
            </div>
            ${estado}
          </div>
          <div class="historial-card-grid">
            <div><span>Área / Empresa</span><strong>${escapeHtml(r.empresa_o_area || '-')}</strong></div>
            <div><span>Motivo</span><strong>${escapeHtml(r.motivo_acceso || '-')}</strong></div>
            <div><span>Ingreso</span><strong>${formatearHora(r.hora_ingreso)}</strong></div>
            <div><span>Salida</span><strong>${horaSalida}</strong></div>
            <div><span>Personal OGTIC</span><strong>${escapeHtml(r.personal_ogitic || '-')}</strong></div>
            <div><span>Observaciones</span><strong>${escapeHtml(r.observaciones || '-')}</strong></div>
          </div>
          <div class="historial-card-actions row-actions">
            <button class="btn icon-only action-view" data-detail="${r.id}" title="Ver detalle"><i class="fa-regular fa-eye"></i></button>
            <button class="btn icon-only action-edit" data-edit="${r.id}" title="Editar"><i class="fa-solid fa-pen-to-square"></i></button>
            ${!r.hora_salida ? `<button class="btn icon-only action-exit" data-mark-exit="${r.id}" title="Marcar salida"><i class="fa-solid fa-arrow-right-from-bracket"></i></button>` : ''}
          </div>
        </article>`;
    }).join('');
  }
  renderHistorialPaginacion(total, inicio + 1, inicio + pagina.length);
}

function renderHistorialPaginacion(total, desde, hasta) {
  const info = $("#historialPageInfo");
  const pag = $("#historialPagination");
  if (info) info.textContent = total ? `Mostrando ${desde} - ${hasta} de ${total} registros` : "Mostrando 0 de 0 registros";
  if (!pag) return;
  const totalPaginas = Math.max(1, Math.ceil(total / historialPorPagina));
  const paginas = [];
  const inicio = Math.max(1, historialPaginaActual - 1);
  const fin = Math.min(totalPaginas, inicio + 2);
  paginas.push(`<button class="page-control" data-page="${Math.max(1, historialPaginaActual - 1)}" ${historialPaginaActual === 1 ? 'disabled' : ''}><i class="fa-solid fa-chevron-left"></i></button>`);
  for (let p = inicio; p <= fin; p += 1) {
    paginas.push(`<button class="page-control ${p === historialPaginaActual ? 'active' : ''}" data-page="${p}">${p}</button>`);
  }
  paginas.push(`<button class="page-control" data-page="${Math.min(totalPaginas, historialPaginaActual + 1)}" ${historialPaginaActual === totalPaginas ? 'disabled' : ''}><i class="fa-solid fa-chevron-right"></i></button>`);
  pag.innerHTML = paginas.join('');
}

function renderRecentFive(items) {
  const cuerpo = $("#recentFive");
  if (!cuerpo) return;
  console.debug('renderRecentFive items:', items);
  if (!items || items.length === 0) {
    cuerpo.innerHTML = `<tr><td colspan="8">Sin registros.</td></tr>`;
    return;
  }
  const ahora = new Date();
  const formatDuration = (mins) => {
    if (mins == null) return 'Dentro';
    return `${Math.floor(mins/60)}h ${mins%60}m`;
  };
  cuerpo.innerHTML = items.map((r, idx) => {
    // normalize hora_ingreso/hora_salida to HH:MM if they contain seconds
    const hi = normalizeHM(r.hora_ingreso);
    const hs = normalizeHM(r.hora_salida);
    const tiempoMin = hi ? (hs ? minutosEntre(hi, hs) : minutosEntre(hi, `${String(ahora.getHours()).padStart(2,'0')}:${String(ahora.getMinutes()).padStart(2,'0')}`)) : null;
    // Determine displayed state: prefer hora_salida presence to avoid inconsistent DB states
    const mostradoEstado = estadoPorSalida(r);
    return `
    <tr>
      <td>${idx+1}</td>
      <td>${r.nombres_visitante}</td>
      <td>${escapeHtml(r.empresa_o_area || '')}</td>
      <td>${cleanMotivo(r.motivo_acceso || r.motivo || r.observaciones || '', r)}</td>
      <td>${formatDuration(tiempoMin)}</td>
      <td>${hi ? formatearHora(hi) : '--:--'}</td>
      <td>${hs ? formatearHora(hs) : 'Pendiente de salida'}</td>
      <td>${etiquetaEstado(mostradoEstado)}</td>
    </tr>`;
  }).join('');
}

function renderInsidePeople(items) {
  const el = $("#insidePeople");
  const moreBtn = $("#showInsideMore");
  if (!el) return;
  const lista = (items || []).slice(0, 4);
  if (moreBtn) moreBtn.classList.toggle("hidden", (items || []).length <= 4);
  if (lista.length === 0) {
    el.innerHTML = `
      <table class="inside-people-table">
        <thead><tr><th>Persona/proveedor</th><th>Área/empresa</th><th>Ingreso</th><th>Tiempo dentro</th></tr></thead>
        <tbody><tr class="empty-row"><td colspan="4">No hay personas dentro actualmente.</td></tr></tbody>
      </table>
      <div class="inside-people-cards">
        <article class="inside-person-card inside-person-empty">
          <i class="fa-solid fa-user-check"></i>
          <span>No hay personas dentro actualmente.</span>
        </article>
      </div>`;
    return;
  }
  const ahora = new Date();
  const horaActual = `${String(ahora.getHours()).padStart(2,'0')}:${String(ahora.getMinutes()).padStart(2,'0')}`;
  const datosPersona = lista.map((r) => {
    const hi = normalizeHM(r.hora_ingreso);
    const tiempoMin = hi ? minutosEntre(hi, horaActual) : null;
    return {
      nombre: escapeHtml(r.nombres_visitante || 'Sin nombre'),
      area: escapeHtml(r.empresa_o_area || r.area_destino || '-'),
      ingreso: hi ? formatearHora(hi) : '--:--',
      tiempo: tiempoMin == null ? 'Dentro' : formatearMinutos(tiempoMin),
    };
  });
  const rows = datosPersona.map((persona) => {
    return `
      <tr>
        <td class="inside-name">${persona.nombre}</td>
        <td>${persona.area}</td>
        <td>${persona.ingreso}</td>
        <td class="inside-time">${persona.tiempo}</td>
      </tr>`;
  }).join('');
  const cards = datosPersona.map((persona) => `
    <article class="inside-person-card">
      <div class="inside-person-head">
        <span class="inside-person-icon"><i class="fa-regular fa-circle-user"></i></span>
        <div>
          <strong>${persona.nombre}</strong>
          <small>${persona.area}</small>
        </div>
      </div>
      <div class="inside-person-meta">
        <span><i class="fa-solid fa-arrow-right-to-bracket"></i>${persona.ingreso}</span>
        <span><i class="fa-regular fa-clock"></i>${persona.tiempo}</span>
      </div>
    </article>`).join('');
  el.innerHTML = `
    <table class="inside-people-table">
      <thead><tr><th>Persona/proveedor</th><th>Área/empresa</th><th>Ingreso</th><th>Tiempo dentro</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="inside-people-cards">${cards}</div>`;
}

function renderRecentMovements(items) {
  const el = $("#recentMovements");
  if (!el) return;
  const encabezadoMovimientos = `<thead><tr><th>Entrada</th><th>Hora entrada</th><th>Salida</th><th>Hora salida</th><th>Nombre</th><th>Motivo</th><th>Duración</th><th>Estado</th></tr></thead>`;
  if (!items || items.length === 0) {
    el.innerHTML = `
      <table class="recent-movements-table">
        ${encabezadoMovimientos}
        <tbody>
          <tr class="empty-row">
            <td colspan="8">No hay movimientos recientes en las últimas 24 horas.</td>
          </tr>
        </tbody>
      </table>
      <div class="recent-movement-cards">
        <article class="movement-card movement-card-empty">
          <i class="fa-regular fa-clock"></i>
          <span>No hay movimientos recientes en las últimas 24 horas.</span>
        </article>
      </div>`;
    return;
  }
  // limit to first 5 (remove near-duplicate last item)
  const lista = items.slice(0,5);
  const ahora = new Date();
  const movimientos = lista.map(r => {
    const hi = normalizeHM(r.hora_ingreso);
    const hs = normalizeHM(r.hora_salida);
    const mins = hi ? (hs ? minutosEntre(hi, hs) : minutosEntre(hi, `${String(ahora.getHours()).padStart(2,'0')}:${String(ahora.getMinutes()).padStart(2,'0')}`)) : null;
    const tiempoText = mins == null ? 'Dentro' : `${Math.floor(mins/60)}h ${mins%60}m`;
    const horaEntrada = hi ? formatearHora(hi) : '--:--';
    const horaSalida = hs ? formatearHora(hs) : 'Pendiente de salida';
    const motivo = cleanMotivo(r.motivo_acceso || r.motivo || r.observaciones || '', r);
    const estado = estadoPorSalida(r);
    return { r, hs, tiempoText, horaEntrada, horaSalida, motivo, estado };
  });
  const rows = movimientos.map(({ r, hs, tiempoText, horaEntrada, horaSalida, motivo, estado }) => `
      <tr>
        <td class="mv-icon"><span class="movement-icon entry"><i class="fa-solid fa-arrow-down"></i></span></td>
        <td class="mv-time">${horaEntrada}</td>
        <td class="mv-icon">${hs ? '<span class="movement-icon exit"><i class="fa-solid fa-arrow-up"></i></span>' : '<span class="movement-empty">Dentro</span>'}</td>
        <td class="mv-time mv-exit-time ${hs ? '' : 'pending-text'}">${horaSalida}</td>
        <td class="mv-name">${escapeHtml(r.nombres_visitante)}</td>
        <td class="mv-motivo">${motivo}</td>
        <td class="mv-duracion">${tiempoText}</td>
        <td class="mv-status">${etiquetaEstado(estado)}</td>
      </tr>`).join('');
  const cards = movimientos.map(({ r, hs, tiempoText, horaEntrada, horaSalida, motivo, estado }) => `
      <article class="movement-card">
        <div class="movement-card-head">
          <div class="movement-card-title">
            <strong>${escapeHtml(r.nombres_visitante || 'Sin nombre')}</strong>
            <span>${motivo || 'Sin motivo'}</span>
          </div>
          ${etiquetaEstado(estado)}
        </div>
        <div class="movement-card-times">
          <div class="movement-card-time">
            <span class="movement-icon entry"><i class="fa-solid fa-arrow-down"></i></span>
            <small>Entrada</small>
            <strong>${horaEntrada}</strong>
          </div>
          <div class="movement-card-time">
            ${hs ? '<span class="movement-icon exit"><i class="fa-solid fa-arrow-up"></i></span>' : '<span class="movement-empty">Dentro</span>'}
            <small>Salida</small>
            <strong class="${hs ? '' : 'pending-text'}">${horaSalida}</strong>
          </div>
          <div class="movement-card-time">
            <i class="fa-regular fa-clock"></i>
            <small>Duración</small>
            <strong>${tiempoText}</strong>
          </div>
        </div>
      </article>`).join('');
  el.innerHTML = `<table class="recent-movements-table">${encabezadoMovimientos}<tbody>${rows}</tbody></table><div class="recent-movement-cards">${cards}</div>`;
}

function renderRecentSummary(items) {
  const el = $("#recentFive");
  if (!el) return;
  // Deprecated: summary renderer used previously to overwrite the recentFive table.
  // Keep function for compatibility but do not modify the main recentFive element anymore.
  return;
}

// Apply client-side filters from the form inputs
function aplicarFiltrosLocal(registros) {
  const form = $("#filterForm");
  if (!form) return registros;
  const datos = Object.fromEntries(new FormData(form));
  let res = registros.slice();
  // Global search term
  if (datos.busqueda) {
    const term = datos.busqueda.toLowerCase();
    res = res.filter(r => {
      const fields = [r.nombres_visitante, r.documento_visitante, r.empresa_o_area, r.motivo_acceso, r.observaciones];
      return fields.some(f => (f || '').toString().toLowerCase().includes(term));
    });
  }
  return res;
}

// Export currently displayed historialCache (after client filters) to CSV
function exportHistorialCSV() {
  const registros = aplicarFiltrosLocal(historialCache);
  if (!registros.length) { mostrarAviso('No hay registros para exportar'); return; }
  const headers = ['N°','Fecha','Usuario/Proveedor','Área/Empresa','Motivo','Hora Ingreso','Hora Salida','Personal OGTIC','Observaciones','Estado'];
  const filas = registros.map((r, idx) => [
    idx+1,
    r.fecha_acceso,
    r.nombres_visitante,
    r.empresa_o_area || '',
    r.motivo_acceso || '',
    formatearHora(r.hora_ingreso),
    formatearHoraSalida(r.hora_salida),
    r.personal_ogitic || '',
    (r.observaciones || '').replace(/\n/g,' '),
    r.estado || '',
  ]);
  const csv = [headers, ...filas].map(r => r.map(c => '"' + String(c).replace(/"/g,'""') + '"').join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `historial_accesos_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Mark exit for a specific registro id (current time)
async function marcarSalidaRegistro(id) {
  if (!id) return;
  const ahora = new Date();
  const horaSalida = `${String(ahora.getHours()).padStart(2,'0')}:${String(ahora.getMinutes()).padStart(2,'0')}`;
  try {
    const cabeceras = { Authorization: `Bearer ${estadoAplicacion.llaveSesion}` };
    const cuerpo = new URLSearchParams({ hora_salida: horaSalida });
    const respuesta = await fetch(`${API}/registros-acceso/${id}/salida`, { method: 'PATCH', headers: cabeceras, body: cuerpo });
    if (!respuesta.ok) throw new Error('No se pudo marcar la salida');
    mostrarAviso('Salida registrada', 'success');
    cargarHistorial(parametrosFormulario($("#filterForm")));
  } catch (error) {
    mostrarAviso(error.message);
  }
}

function mostrarSkeletonRegistros() {
  const target = $("#historialList") || $("#recordList") || $("#allRecordList");
  const tarjetasHistorial = $("#historialCards");
  if (!target) return;
  target.innerHTML = Array.from({ length: 6 }, () => `
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
  if (tarjetasHistorial) {
    tarjetasHistorial.innerHTML = Array.from({ length: 3 }, () => `
      <article class="historial-card">
        <div class="skeleton-line"></div>
        <div class="skeleton-line"></div>
        <div class="skeleton-line"></div>
      </article>
    `).join("");
  }
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
        <td>${formatearHoraSalida(registro.hora_salida)}</td>
        <td>${etiquetaEstado(estadoPorSalida(registro))}</td>
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
    // set motivo select or custom input
    const selectMotivo = formulario.querySelector("select[name='motivo_acceso']");
    const motivoWrapper = document.querySelector('.motivo-otro-wrapper');
    if (selectMotivo) {
      const found = Array.from(selectMotivo.options).some(o => o.value === registro.motivo_acceso);
      if (found) {
        selectMotivo.value = registro.motivo_acceso;
        if (motivoWrapper) motivoWrapper.classList.add('hidden');
      } else {
        selectMotivo.value = 'Otro';
        if (motivoWrapper) {
          motivoWrapper.classList.remove('hidden');
          const custom = document.querySelector('#motivoCustomField');
          if (custom) custom.value = registro.motivo_acceso || '';
        }
      }
    }
    formulario.personal_ogitic.value = registro.personal_ogitic || nombreUsuarioActual();
    formulario.observaciones.value = registro.observaciones || "";
    limpiarFirma("visitante");
    limpiarFirma("ogitic");
    if (registro.firma_visitante_base64) mostrarFirmaDibujada("visitante", registro.firma_visitante_base64);
    if (registro.firma_ogitic_base64) mostrarFirmaDibujada("ogitic", registro.firma_ogitic_base64);
    cambiarPantalla("newRecord");
    $("#pageTitle").textContent = "Editar Registro";
    $(".panel-head h2").textContent = `Editar ${registro.codigo}`;
    $(".form-actions .btn.primary").innerHTML = `<i class="fa-solid fa-floppy-disk"></i>Guardar Cambios`;
    // show back button when editing
    const backBtn = $("#backFromForm");
    if (backBtn) backBtn.style.display = 'inline-block';
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
            <div class="detail-pair"><span>Hora salida</span><strong>${formatearHoraSalida(registro.hora_salida)}</strong><small>${registro.hora_salida ? "Registrado en sistema" : "Aun dentro / pendiente"}</small></div>
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
    const topUserEl2 = $("#topUser");
    if (topUserEl2) topUserEl2.textContent = respuesta.usuario.nombre_completo;
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
  // If custom motivo provided, prefer it
  if (datos.motivo_acceso === 'Otro') {
    const custom = datosFormulario.get('motivo_acceso_custom') || '';
    if (custom && String(custom).trim() !== '') datos.motivo_acceso = String(custom).trim();
    delete datos.motivo_acceso_custom;
  }
  delete datos.firma_visitante;
  delete datos.firma_ogitic;
  if (!datos.hora_salida) datos.hora_salida = null;
  try {
    const editando = estadoAplicacion.registroEditando;
    const rutaRegistro = editando ? `/registros-acceso/${editando.id}` : "/registros-acceso";
    const metodoRegistro = editando ? "PATCH" : "POST";
    const registro = await consultarApi(rutaRegistro, { method: metodoRegistro, body: JSON.stringify(datos) });
    if (!registro?.id) throw new Error("El registro se guardo, pero el servidor no devolvio el detalle del registro");
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
  const fd = new FormData(evento.currentTarget);
  const params = new URLSearchParams();
  if (fd.get('fecha_desde')) params.append('fecha_desde', fd.get('fecha_desde'));
  if (fd.get('fecha_hasta')) params.append('fecha_hasta', fd.get('fecha_hasta'));
  if (fd.get('busqueda')) params.append('busqueda', fd.get('busqueda'));
  cargarHistorial(params.toString());
});

// Export button (inside filter form)
const exportBtn = $("#exportBtn");
if (exportBtn) exportBtn.addEventListener("click", exportHistorialCSV);

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
    if (botonPantalla.dataset.screen === "newRecord") {
      // Always prepare a fresh form when user explicitly navigates to Registrar Acceso
      estadoAplicacion.registroEditando = null;
      prepararNuevoRegistro();
    }
    cambiarPantalla(botonPantalla.dataset.screen);
  }
  const botonDetalle = evento.target.closest("[data-detail]");
  if (botonDetalle) cargarDetalle(botonDetalle.dataset.detail);
  const botonEditar = evento.target.closest("[data-edit]");
  if (botonEditar) {
    // remember previous screen so the form's "Volver" can return correctly
    const activeScreenEl = document.querySelector('.screen.active');
    estadoAplicacion.previousScreen = activeScreenEl ? (activeScreenEl.id || '').replace('screen-','') : 'historial';
    editarRegistro(botonEditar.dataset.edit);
  }
  const botonMarcar = evento.target.closest("[data-mark-exit]");
  if (botonMarcar) marcarSalidaRegistro(botonMarcar.dataset.markExit);
  const botonPagina = evento.target.closest("[data-page]");
  if (botonPagina) {
    historialPaginaActual = Number(botonPagina.dataset.page) || 1;
    renderHistorial(historialFiltradoCache);
  }
});

// Back button on the new/edit form header
const backFromFormBtn = $("#backFromForm");
if (backFromFormBtn) backFromFormBtn.addEventListener('click', () => {
  const destino = estadoAplicacion.previousScreen || (estadoAplicacion.registroEditando ? 'historial' : 'dashboard');
  cambiarPantalla(destino);
});

const fechaHoy = fechaLocalISO();
$("input[name='fecha_acceso']").value = fechaHoy;

iniciarAplicacion();

// motivo 'Otro' toggling
(function setupMotivoToggle(){
  const select = document.querySelector("select[name='motivo_acceso']");
  const wrapper = document.querySelector('.motivo-otro-wrapper');
  if (!select || !wrapper) return;
  select.addEventListener('change', (e) => {
    if (e.target.value === 'Otro') wrapper.classList.remove('hidden'); else wrapper.classList.add('hidden');
  });
})();

// Help dropdown: toggle and close on outside click
(function setupHelpDropdown() {
  const helpBtn = $("#helpBtn");
  const helpDropdown = $("#helpDropdown");
  if (!helpBtn || !helpDropdown) return;

  helpBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const expanded = helpBtn.getAttribute("aria-expanded") === "true";
    helpBtn.setAttribute("aria-expanded", String(!expanded));
    helpDropdown.classList.toggle("visible");
    helpDropdown.setAttribute("aria-hidden", String(expanded));
  });

  document.addEventListener("click", (e) => {
    if (!helpBtn.contains(e.target) && !helpDropdown.contains(e.target)) {
      if (helpDropdown.classList.contains("visible")) {
        helpDropdown.classList.remove("visible");
        helpDropdown.setAttribute("aria-hidden", "true");
        helpBtn.setAttribute("aria-expanded", "false");
      }
    }
  });
})();

// FAB behavior: open new record form
(function setupFab() {
  const fab = $("#fabNewRecord");
  if (!fab) return;
  fab.addEventListener("click", (e) => {
    e.preventDefault();
    try { prepararNuevoRegistro(); } catch (err) { /* ignore if not available */ }
    cambiarPantalla("newRecord");
  });
})();

// Reportes UI wiring
const runReportsBtn = $("#runReportsBtn");
if (runReportsBtn) runReportsBtn.addEventListener('click', () => {
  const fd = new FormData($("#reportFilterForm"));
  const params = new URLSearchParams();
  if (fd.get('fecha_desde')) params.append('fecha_desde', fd.get('fecha_desde'));
  if (fd.get('fecha_hasta')) params.append('fecha_hasta', fd.get('fecha_hasta'));
  if (fd.get('empresa_o_area')) params.append('empresa_o_area', fd.get('empresa_o_area'));
  if (fd.get('motivo_acceso')) params.append('motivo_acceso', fd.get('motivo_acceso'));
  if (fd.get('personal_ogitic')) params.append('personal_ogitic', fd.get('personal_ogitic'));
  cargarReportes(params.toString());
});

const exportXlsBtn = $("#exportXlsBtn");
if (exportXlsBtn) exportXlsBtn.addEventListener('click', exportReportesExcel);
const exportPdfBtn = $("#exportPdfBtn");
if (exportPdfBtn) exportPdfBtn.addEventListener('click', exportReportesPDF);

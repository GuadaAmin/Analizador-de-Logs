// Punto de entrada de la interfaz: estado global, comunicación con el servidor
// Python y coordinación entre el editor y las vistas del inspector.

import { $, $$, esc, debounce, aviso, descargar, csv, iniciarTooltip, formatoNum, ICONOS } from './util.js';
import { Editor } from './editor.js';
import { EJEMPLOS, PRUEBAS, FASES } from './datos.js';
import * as V from './vistas.js';

const est = {
  analisis: null,
  textoAnalizado: null,
  nombreArchivo: 'LogFile.txt',
  lineaSel: 1,
  pestana: 'diagnostico',
  filtroDiag: 'todas',
  limiteDiag: 300,
  tiposOcultos: new Set(),
  busquedaTokens: '',
  lexemaAutomata: null,
  pruebas: null,
  pruebasMs: 0,
  pruebasSoloFallas: false,
  conectado: false,
};

const RENDER = {
  diagnostico: V.vistaDiagnostico,
  tokens: V.vistaTokens,
  arbol: V.vistaArbol,
  semantica: V.vistaSemantica,
  automata: V.vistaAutomata,
  analitica: V.vistaAnalitica,
  pruebas: V.vistaPruebas,
  especificacion: V.vistaEspecificacion,
};
const PESTANAS = Object.keys(RENDER);

// ----------------------------------------------------------------------------
// API
// ----------------------------------------------------------------------------
async function api(ruta, cuerpo) {
  const r = await fetch(ruta, {
    method: cuerpo ? 'POST' : 'GET',
    headers: cuerpo ? { 'Content-Type': 'application/json' } : undefined,
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(datos.error || `Error HTTP ${r.status}`);
  return datos;
}

async function verificarConexion() {
  const c = $('#conexion');
  try {
    const d = await api('/api/estado');
    est.conectado = true;
    c.className = 'conexion ok';
    c.querySelector('.conexion-texto').textContent = `Python ${d.python}`;
    c.title = `Conectado a ${d.compilador}`;
    return true;
  } catch {
    est.conectado = false;
    c.className = 'conexion error';
    c.querySelector('.conexion-texto').textContent = 'Sin servidor';
    $('#vista-diagnostico').innerHTML = `<div class="banner-error"><strong>No se pudo conectar con el compilador.</strong><br>
      Esta interfaz ejecuta <code>compilador.py</code> a través de un servidor local. Inícielo desde la carpeta del proyecto con
      <br><br><code>python servidor.py</code><br><br>y abra la dirección que se muestra en la consola.</div>`;
    return false;
  }
}

// ----------------------------------------------------------------------------
// Análisis
// ----------------------------------------------------------------------------
let secuencia = 0;
async function compilar({ silencioso = false } = {}) {
  const texto = editor.valor;
  const id = ++secuencia;
  marcarCargando(true);
  try {
    const res = await api('/api/analizar', { texto });
    if (id !== secuencia) return; // Llegó una respuesta más nueva
    if (!est.conectado) await verificarConexion();
    est.analisis = res;
    est.textoAnalizado = texto;
    est.limiteDiag = 300;
    est.lexemaAutomata = null;
    editor.aplicarAnalisis(texto, res);
    est.lineaSel = Math.min(est.lineaSel, res.lineas.length) || 1;
    actualizarPipeline();
    actualizarEstado();
    renderizar();
    $('#modificado').hidden = true;
    if (!silencioso) {
      const e = res.estricto;
      aviso(e.ok ? e.mensaje : `${FASES[e.fase].nombre}: ${e.mensaje}`, e.ok ? 'ok' : 'error');
    }
  } catch (err) {
    if (id !== secuencia) return;
    marcarCargando(false);
    if (!(await verificarConexion())) return;
    aviso(err.message, 'error', 5000);
  }
}

function marcarCargando(si) {
  if (si) $$('.fase').forEach((f) => { if (!f.dataset.estado) f.dataset.estado = 'cargando'; });
  else $$('.fase').forEach((f) => { if (f.dataset.estado === 'cargando') delete f.dataset.estado; });
}

function actualizarPipeline() {
  const a = est.analisis;
  const e = a.estricto;
  const lineas = a.lineas.filter((l) => l.estado !== 'vacia');
  const erroresLex = a.tokens.filter((t) => t.tipo === 'ERROR').length;
  const registros = lineas.reduce((s, l) => s + l.entradas.length, 0);
  const validos = lineas.filter((l) => l.estado === 'ok').reduce((s, l) => s + l.entradas.length, 0);

  const orden = ['lexico', 'sintactico', 'semantico'];
  const fallo = e.ok ? -1 : orden.indexOf(e.fase === 'interno' ? 'semantico' : e.fase);
  orden.forEach((f, i) => {
    $(`.fase[data-fase="${f}"]`).dataset.estado = fallo < 0 || i < fallo ? 'ok' : i === fallo ? 'error' : 'omitida';
  });
  $('#det-lexico').textContent = `${formatoNum(a.tokens.length)} tokens · ${erroresLex} ${erroresLex === 1 ? 'error' : 'errores'}`;
  $('#det-sintactico').textContent = `${formatoNum(registros)} <LogEntry> derivados`;
  $('#det-semantico').textContent = `${formatoNum(validos)} registros válidos`;

  const v = $('#veredicto');
  v.className = `veredicto ${e.ok ? 'ok' : e.fase}`;
  v.querySelector('.veredicto-icono').innerHTML = e.ok ? ICONOS.check : ICONOS.cruz;
  v.querySelector('strong').textContent = e.ok ? 'Compilación exitosa' : `Fallo de compilación · ${FASES[e.fase].nombre}`;
  const detalle = v.querySelector('.veredicto-texto span');
  detalle.textContent = e.mensaje;
  detalle.title = e.mensaje;

  const errores = lineas.length - lineas.filter((l) => l.estado === 'ok').length;
  const cnt = $('#cnt-diag');
  cnt.textContent = errores;
  cnt.classList.toggle('alerta', errores > 0);
  $('#cnt-tokens').textContent = formatoNum(a.tokens.length);
}

function actualizarEstado() {
  const a = est.analisis;
  $('#est-lineas').textContent = `${formatoNum(editor.valor.split('\n').length)} líneas`;
  if (a) {
    $('#est-tokens').textContent = `${formatoNum(a.tokens.length)} tokens`;
    $('#est-tiempo').textContent = `análisis ${a.metricas.msTotal.toLocaleString('es-AR')} ms`;
  }
}

// ----------------------------------------------------------------------------
// Vistas
// ----------------------------------------------------------------------------
function renderizar(pestana = est.pestana) {
  if (pestana !== 'automata') V.detenerAnimacion();
  const cont = $(`#vista-${pestana}`);
  if (pestana === 'diagnostico' && !est.conectado && !est.analisis) return;
  RENDER[pestana](cont, est, acciones);
}

function cambiarPestana(p) {
  est.pestana = p;
  try { history.replaceState(null, '', `#${p}/${est.lineaSel}`); } catch { /* sin historial */ }
  $$('#pestanas button').forEach((b) => b.classList.toggle('activa', b.dataset.tab === p));
  $$('.vista').forEach((v) => v.classList.toggle('activa', v.dataset.vista === p));
  renderizar();
  // La primera vez que se abre la suite, se ejecuta automáticamente.
  if (p === 'pruebas' && !est.pruebas && est.conectado) acciones.correrPruebas();
}

const acciones = {
  irALinea: (n, col, largo) => editor.irALinea(n, col, largo),
  seleccionarLinea(n, moverCursor) {
    const total = est.analisis?.lineas.length ?? 1;
    n = Math.max(1, Math.min(total, n || 1));
    if (n !== est.lineaSel) est.lexemaAutomata = null;
    est.lineaSel = n;
    if (moverCursor) editor.irALinea(n);
    if (['arbol', 'semantica', 'automata', 'diagnostico'].includes(est.pestana)) renderizar();
  },
  cargarTexto(texto, nombre) { cargar(texto, nombre); },
  async correrPruebas() {
    const btn = $('#btn-correr');
    if (btn) { btn.disabled = true; btn.textContent = 'Ejecutando…'; }
    const t0 = performance.now();
    try {
      const { resultados } = await api('/api/lote', { casos: PRUEBAS.map((p) => p.texto) });
      est.pruebas = resultados;
      est.pruebasMs = Math.round(performance.now() - t0);
      const pasan = resultados.filter((r, i) => (r.ok ? 'ok' : r.fase) === PRUEBAS[i].esp).length;
      aviso(`${pasan} de ${PRUEBAS.length} pruebas superadas`, pasan === PRUEBAS.length ? 'ok' : 'error');
    } catch (err) {
      aviso(err.message, 'error');
    }
    renderizar('pruebas');
  },
};

// ----------------------------------------------------------------------------
// Carga de contenido
// ----------------------------------------------------------------------------
function cargar(texto, nombre) {
  est.nombreArchivo = nombre;
  $('#nombre-archivo').textContent = nombre;
  est.lineaSel = 1;
  editor.establecer(texto);
  compilar({ silencioso: true });
}

async function leerArchivo(archivo) {
  if (archivo.size > 4 * 1024 * 1024) { aviso('El archivo supera los 4 MB permitidos.', 'error'); return; }
  const texto = await archivo.text();
  cargar(texto, archivo.name);
  aviso(`Archivo “${archivo.name}” cargado`, 'ok');
}

function construirMenuEjemplos() {
  const menu = $('#menu-ejemplos');
  menu.innerHTML = EJEMPLOS.map((e) => (e.grupo
    ? `<div class="menu-grupo">${esc(e.grupo)}</div>`
    : `<button data-ejemplo="${e.id}"><span>${esc(e.titulo)}</span><small>${esc(e.sub)}</small></button>`)).join('');
  menu.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-ejemplo]');
    if (!b) return;
    const ej = EJEMPLOS.find((e) => e.id === b.dataset.ejemplo);
    cargar(ej.texto(), ej.id === 'logfile' ? 'LogFile.txt' : `${ej.id}.log`);
    cerrarMenus();
  });
}

function cerrarMenus() { $$('.menu.abierto').forEach((m) => m.classList.remove('abierto')); }
function alternarMenu(id) {
  const m = $(id);
  const abrir = !m.classList.contains('abierto');
  cerrarMenus();
  if (abrir) m.classList.add('abierto');
}

// ----------------------------------------------------------------------------
// Exportación
// ----------------------------------------------------------------------------
function exportar(tipo) {
  const a = est.analisis;
  if (!a) { aviso('Primero compile el contenido.', 'error'); return; }
  const base = est.nombreArchivo.replace(/\.[^.]+$/, '') || 'log';
  if (tipo === 'json') {
    const reporte = {
      generado: new Date().toISOString(),
      archivo: est.nombreArchivo,
      compilacion: a.estricto,
      metricas: a.metricas,
      lineas: a.lineas.map((l) => ({ linea: l.linea, estado: l.estado, mensaje: l.mensaje, texto: l.texto, registros: l.entradas.map((e) => ({ campos: e.campos, reglas: e.reglas.map(({ clave, ok, mensaje }) => ({ clave, ok, mensaje })) })) })),
      tokens: a.tokens,
    };
    descargar(`${base}_reporte.json`, JSON.stringify(reporte, null, 2), 'application/json');
  } else if (tipo === 'csv') {
    descargar(`${base}_diagnostico.csv`, csv([['linea', 'estado', 'mensaje', 'contenido'], ...a.lineas.filter((l) => l.estado !== 'vacia').map((l) => [l.linea, l.estado, l.mensaje ?? '', l.texto])]), 'text/csv');
  } else if (tipo === 'tokens') {
    descargar(`${base}_tokens.csv`, csv([['indice', 'tipo', 'lexema', 'linea', 'columna'], ...a.tokens.map((t, i) => [i + 1, t.tipo, t.lexema, t.linea, t.columna])]), 'text/csv');
  } else if (tipo === 'log') {
    descargar(`${base}_validos.log`, a.lineas.filter((l) => l.estado === 'ok').map((l) => l.texto).join('\n'));
  }
  cerrarMenus();
}

// ----------------------------------------------------------------------------
// Inicialización
// ----------------------------------------------------------------------------
const editor = new Editor({
  textarea: $('#entrada'),
  resaltado: $('#resaltado'),
  gutter: $('#gutter'),
  contenedor: $('#editor'),
  onCambio: (texto, programatico) => {
    if (programatico) return;
    $('#modificado').hidden = false;
    actualizarEstado();
    if ($('#chk-vivo').checked && texto.length < 400_000) compilarEnVivo();
  },
  onCursor: (linea, col) => {
    $('#est-cursor').textContent = `Ln ${linea}, Col ${col}`;
    if (est.analisis && linea !== est.lineaSel && linea <= est.analisis.lineas.length) acciones.seleccionarLinea(linea, false);
  },
  onArchivo: leerArchivo,
});
const compilarEnVivo = debounce(() => compilar({ silencioso: true }), 380);

function iniciarDivisor() {
  const div = $('#divisor');
  const principal = $('#principal');
  const mover = (e) => {
    const r = principal.getBoundingClientRect();
    const pct = Math.max(25, Math.min(72, ((e.clientX - r.left) / r.width) * 100));
    principal.style.setProperty('--ancho-editor', `${pct}%`);
  };
  div.addEventListener('pointerdown', (e) => {
    div.classList.add('arrastrando');
    div.setPointerCapture(e.pointerId);
    div.addEventListener('pointermove', mover);
  });
  div.addEventListener('pointerup', () => { div.classList.remove('arrastrando'); div.removeEventListener('pointermove', mover); });
  div.addEventListener('keydown', (e) => {
    const actual = parseFloat(getComputedStyle(principal).getPropertyValue('--ancho-editor')) || 46;
    if (e.key === 'ArrowLeft') principal.style.setProperty('--ancho-editor', `${Math.max(25, actual - 2)}%`);
    if (e.key === 'ArrowRight') principal.style.setProperty('--ancho-editor', `${Math.min(72, actual + 2)}%`);
  });
}

function siguienteError(dir) {
  const a = est.analisis;
  if (!a) return;
  const errores = a.lineas.filter((l) => l.estado !== 'ok' && l.estado !== 'vacia');
  if (!errores.length) { aviso('No hay errores en el archivo.', 'ok'); return; }
  const actual = est.lineaSel;
  const l = dir > 0 ? errores.find((x) => x.linea > actual) ?? errores[0] : [...errores].reverse().find((x) => x.linea < actual) ?? errores[errores.length - 1];
  acciones.seleccionarLinea(l.linea, false);
  editor.irALinea(l.linea, l.tokenError?.columna ?? 1, l.tokenError?.longitud ?? 0);
}

function iniciarEventos() {
  $('#btn-compilar').addEventListener('click', () => compilar());
  $('#btn-abrir').addEventListener('click', () => $('#input-archivo').click());
  $('#input-archivo').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) leerArchivo(f); e.target.value = ''; });
  $('#btn-limpiar').addEventListener('click', () => cargar('', 'sin_titulo.log'));
  $('#btn-ejemplos').addEventListener('click', (e) => { e.stopPropagation(); alternarMenu('#menu-ejemplos'); });
  $('#btn-exportar').addEventListener('click', (e) => { e.stopPropagation(); alternarMenu('#menu-exportar'); });
  $('#menu-exportar').addEventListener('click', (e) => { const b = e.target.closest('[data-exportar]'); if (b) exportar(b.dataset.exportar); });
  document.addEventListener('click', (e) => { if (!e.target.closest('.menu-desplegable')) cerrarMenus(); });

  $$('#pestanas button').forEach((b) => b.addEventListener('click', () => cambiarPestana(b.dataset.tab)));

  $('#btn-tema').addEventListener('click', () => {
    const nuevo = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = nuevo;
    try { localStorage.setItem('clf-tema', nuevo); } catch { /* almacenamiento no disponible */ }
  });
  $('#btn-acerca').addEventListener('click', () => $('#modal-acerca').showModal());
  $('#btn-atajos').addEventListener('click', () => $('#modal-atajos').showModal());
  $$('dialog').forEach((d) => d.addEventListener('click', (e) => { if (e.target === d) d.close(); }));

  document.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key === 'Enter') { e.preventDefault(); compilar(); }
    else if (mod && e.key.toLowerCase() === 'o') { e.preventDefault(); $('#input-archivo').click(); }
    else if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); exportar('json'); }
    else if (e.altKey && /^[1-8]$/.test(e.key)) { e.preventDefault(); cambiarPestana(PESTANAS[Number(e.key) - 1]); }
    else if (e.key === 'F8') { e.preventDefault(); siguienteError(e.shiftKey ? -1 : 1); }
    else if (e.key === 'Escape') cerrarMenus();
    else if (e.key === '?' && !e.target.closest('textarea, input')) $('#modal-atajos').showModal();
  });
}

async function iniciar() {
  iniciarTooltip();
  iniciarEventos();
  iniciarDivisor();
  construirMenuEjemplos();
  V.vistaEspecificacion($('#vista-especificacion'));
  const ok = await verificarConexion();
  const ej = EJEMPLOS.find((e) => e.id === 'mixto');
  est.nombreArchivo = 'trafico_con_errores.log';
  $('#nombre-archivo').textContent = est.nombreArchivo;
  editor.establecer(ej.texto());
  actualizarEstado();
  // Enlaces directos: #pestaña/línea (p. ej. #arbol/4)
  const [tab, linea] = location.hash.slice(1).split('/');
  if (ok) await compilar({ silencioso: true });
  if (linea) { acciones.seleccionarLinea(Number(linea), true); }
  if (PESTANAS.includes(tab)) cambiarPestana(tab);
}

iniciar();

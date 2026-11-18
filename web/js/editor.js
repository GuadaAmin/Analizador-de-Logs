// Editor de logs: textarea transparente sobre una capa <pre> con el resaltado
// generado a partir de los tokens que emite el analizador léxico real.

import { esc } from './util.js';

export class Editor {
  constructor({ textarea, resaltado, gutter, contenedor, onCambio, onCursor, onArchivo }) {
    this.ta = textarea;
    this.pre = resaltado;
    this.gutter = gutter;
    this.contenedor = contenedor;
    this.onCambio = onCambio;
    this.onCursor = onCursor;
    this.onArchivo = onArchivo;
    this.analisis = null;      // Último resultado coincidente con el texto
    this.textoAnalizado = null;
    this.lineaActiva = 1;

    this.ta.addEventListener('input', () => { this.pintar(); this.onCambio?.(this.ta.value); });
    this.ta.addEventListener('scroll', () => this.sincronizarScroll());
    for (const ev of ['click', 'keyup', 'select', 'focus']) this.ta.addEventListener(ev, () => this.actualizarCursor());
    this.ta.addEventListener('keydown', (e) => this.teclas(e));
    this.gutter.addEventListener('click', (e) => {
      const g = e.target.closest('.g');
      if (g) this.irALinea(Number(g.dataset.n));
    });
    this.iniciarArrastre();
  }

  get valor() { return this.ta.value; }

  establecer(texto) {
    this.ta.value = texto;
    this.ta.setSelectionRange(0, 0);
    this.ta.scrollTop = 0;
    this.ta.scrollLeft = 0;
    this.analisis = null;
    this.pintar();
    this.actualizarCursor(true);
    this.onCambio?.(texto, true);
  }

  aplicarAnalisis(texto, analisis) {
    this.textoAnalizado = texto;
    this.analisis = analisis;
    this.pintar();
  }

  teclas(e) {
    // Tab inserta un carácter de tabulación en lugar de mover el foco.
    if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      const { selectionStart: s, selectionEnd: f, value: v } = this.ta;
      this.ta.value = v.slice(0, s) + '\t' + v.slice(f);
      this.ta.selectionStart = this.ta.selectionEnd = s + 1;
      this.ta.dispatchEvent(new Event('input'));
    }
  }

  // --------------------------------------------------------------------------
  // Renderizado
  // --------------------------------------------------------------------------
  pintar() {
    const texto = this.ta.value;
    const lineas = texto.split('\n');
    const vigente = this.analisis && this.textoAnalizado === texto;
    const porLinea = vigente ? this.indexarTokens(this.analisis.tokens) : null;
    const diag = vigente ? this.analisis.lineas : null;

    const partes = new Array(lineas.length);
    for (let i = 0; i < lineas.length; i++) {
      const l = lineas[i].replace(/\r$/, '');
      const clase = i + 1 === this.lineaActiva ? 'ln activa' : 'ln';
      const contenido = porLinea ? this.colorearLinea(l, porLinea.get(i + 1) || [], diag?.[i]) : esc(l);
      partes[i] = `<span class="${clase}" data-n="${i + 1}">${contenido || ' '}</span>`;
    }
    this.pre.innerHTML = partes.join('');

    const g = new Array(lineas.length);
    for (let i = 0; i < lineas.length; i++) {
      const d = diag?.[i];
      const estado = d && d.estado !== 'vacia' ? d.estado : '';
      const activa = i + 1 === this.lineaActiva ? ' activa' : '';
      const tt = d?.mensaje ? ` data-tt="${esc(d.mensaje)}"` : '';
      g[i] = `<div class="g ${estado}${activa}" data-n="${i + 1}"${tt}>${i + 1}</div>`;
    }
    this.gutter.innerHTML = g.join('');
    this.sincronizarScroll();
  }

  indexarTokens(tokens) {
    const m = new Map();
    for (const t of tokens) {
      if (!m.has(t.linea)) m.set(t.linea, []);
      m.get(t.linea).push(t);
    }
    return m;
  }

  colorearLinea(l, tokens, diag) {
    const err = diag?.tokenError && diag.estado !== 'ok' ? diag.tokenError : null;
    const eIni = err ? err.columna - 1 : -1;
    const eFin = err ? eIni + err.longitud : -1;
    const sub = (ini, fin) => (err && ini < eFin && fin > eIni ? ` subrayado ${diag.estado}` : '');

    let html = '', pos = 0;
    for (const t of tokens) {
      const ini = t.columna - 1;
      if (ini < pos || ini >= l.length) continue;
      let largo = t.lexema.length;
      const salto = t.lexema.indexOf('\n');
      if (salto >= 0) largo = salto;
      const fin = Math.min(l.length, ini + largo);
      if (ini > pos) html += esc(l.slice(pos, ini));
      html += `<span class="t-${t.tipo}${sub(ini, fin)}">${esc(l.slice(ini, fin))}</span>`;
      pos = fin;
    }
    if (pos < l.length) html += esc(l.slice(pos));
    // Error al final de la línea (p. ej. falta un campo): marcador visible.
    if (err && eIni >= l.length) html += `<span class="subrayado ${diag.estado}">  </span>`;
    return html;
  }

  sincronizarScroll() {
    this.pre.scrollTop = this.ta.scrollTop;
    this.pre.scrollLeft = this.ta.scrollLeft;
    this.gutter.scrollTop = this.ta.scrollTop;
  }

  // --------------------------------------------------------------------------
  // Cursor y navegación
  // --------------------------------------------------------------------------
  posicionCursor() {
    const antes = this.ta.value.slice(0, this.ta.selectionStart);
    const linea = (antes.match(/\n/g)?.length ?? 0) + 1;
    const col = antes.length - antes.lastIndexOf('\n');
    return { linea, col };
  }

  actualizarCursor(forzar = false) {
    const { linea, col } = this.posicionCursor();
    if (linea !== this.lineaActiva || forzar) {
      this.pre.querySelector('.ln.activa')?.classList.remove('activa');
      this.gutter.querySelector('.g.activa')?.classList.remove('activa');
      this.lineaActiva = linea;
      this.pre.querySelector(`.ln[data-n="${linea}"]`)?.classList.add('activa');
      this.gutter.querySelector(`.g[data-n="${linea}"]`)?.classList.add('activa');
    }
    this.onCursor?.(linea, col);
  }

  irALinea(n, columna = 1, largo = 0) {
    const lineas = this.ta.value.split('\n');
    n = Math.max(1, Math.min(n, lineas.length));
    let offset = 0;
    for (let i = 0; i < n - 1; i++) offset += lineas[i].length + 1;
    const inicio = offset + Math.max(0, columna - 1);
    this.ta.focus({ preventScroll: true });
    this.ta.setSelectionRange(inicio, inicio + largo);
    const altoLinea = parseFloat(getComputedStyle(this.ta).lineHeight) || 21;
    const objetivo = (n - 1) * altoLinea;
    if (objetivo < this.ta.scrollTop || objetivo > this.ta.scrollTop + this.ta.clientHeight - altoLinea * 2) {
      this.ta.scrollTop = Math.max(0, objetivo - this.ta.clientHeight / 3);
    }
    if (columna <= 1) this.ta.scrollLeft = 0;
    this.sincronizarScroll();
    this.actualizarCursor();
  }

  // --------------------------------------------------------------------------
  // Arrastrar y soltar archivos
  // --------------------------------------------------------------------------
  iniciarArrastre() {
    let profundidad = 0;
    const c = this.contenedor;
    c.addEventListener('dragenter', (e) => { if (e.dataTransfer?.types.includes('Files')) { profundidad++; c.classList.add('soltando'); e.preventDefault(); } });
    c.addEventListener('dragover', (e) => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); });
    c.addEventListener('dragleave', () => { if (--profundidad <= 0) { profundidad = 0; c.classList.remove('soltando'); } });
    c.addEventListener('drop', (e) => {
      profundidad = 0;
      c.classList.remove('soltando');
      const archivo = e.dataTransfer?.files?.[0];
      if (archivo) { e.preventDefault(); this.onArchivo?.(archivo); }
    });
  }
}

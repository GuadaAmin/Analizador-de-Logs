// Utilidades compartidas por la interfaz.

export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);

export function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export function formatoBytes(n) {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toLocaleString('es-AR', { maximumFractionDigits: i ? 1 : 0 })} ${u[i]}`;
}

export const formatoNum = (n) => Number(n).toLocaleString('es-AR');

export function porcentaje(a, b) {
  if (!b) return '0 %';
  return `${(a / b * 100).toLocaleString('es-AR', { maximumFractionDigits: 1 })} %`;
}

export function descargar(nombre, contenido, tipo = 'text/plain') {
  const blob = new Blob([contenido], { type: `${tipo};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: nombre });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function csv(filas) {
  return filas.map((f) => f.map((v) => {
    const s = String(v ?? '');
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\n');
}

export function aviso(texto, tipo = 'info', ms = 3200) {
  const cont = document.getElementById('avisos');
  const n = document.createElement('div');
  n.className = `aviso ${tipo}`;
  n.innerHTML = `<i></i><span>${esc(texto)}</span>`;
  cont.appendChild(n);
  setTimeout(() => { n.style.opacity = '0'; n.style.transition = 'opacity .3s'; }, ms);
  setTimeout(() => n.remove(), ms + 320);
}

// Tooltip global: cualquier elemento con data-tt (HTML) lo muestra al pasar el mouse.
export function iniciarTooltip() {
  const tt = document.getElementById('tooltip');
  let actual = null;
  document.addEventListener('pointerover', (e) => {
    const objetivo = e.target.closest('[data-tt]');
    if (!objetivo) { tt.classList.remove('visible'); actual = null; return; }
    if (objetivo !== actual) { actual = objetivo; tt.innerHTML = objetivo.dataset.tt; }
    tt.classList.add('visible');
  });
  document.addEventListener('pointermove', (e) => {
    if (!actual) return;
    const r = tt.getBoundingClientRect();
    let x = e.clientX + 14, y = e.clientY + 16;
    if (x + r.width > innerWidth - 8) x = e.clientX - r.width - 14;
    if (y + r.height > innerHeight - 8) y = e.clientY - r.height - 12;
    tt.style.left = `${x}px`;
    tt.style.top = `${y}px`;
  });
  document.addEventListener('pointerdown', () => tt.classList.remove('visible'));
}

export const ICONOS = {
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  cruz: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  alerta: '<svg viewBox="0 0 24 24"><path d="M12 8v5M12 16.5h.01"/><path d="M10.3 3.9 2.4 17.6A2 2 0 0 0 4.1 20.6h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>',
  menos: '<svg viewBox="0 0 24 24"><path d="M6 12h12"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M7 4v16l13-8z" fill="currentColor" stroke="none"/></svg>',
  pausa: '<svg viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/></svg>',
  siguiente: '<svg viewBox="0 0 24 24"><path d="M6 5l8 7-8 7M18 5v14"/></svg>',
  anterior: '<svg viewBox="0 0 24 24"><path d="M18 5l-8 7 8 7M6 5v14"/></svg>',
  reiniciar: '<svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>',
  archivo: '<svg viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>',
  arbol: '<svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="19" r="2"/><path d="M12 7v4M12 11l-6 6M12 11l6 6"/></svg>',
  grafico: '<svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  rayo: '<svg viewBox="0 0 24 24"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>',
};

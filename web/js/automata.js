// Simulación didáctica del AFD integrador M = (Q, Σ, δ, q0, F) definido en la
// sección 3.2 del informe. El resultado oficial del token siempre lo emite el
// lexer de Python; esta traza muestra el recorrido de estados del modelo formal.

import { esc } from './util.js';

const METODOS = ['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS', 'PATCH', 'TRACE', 'CONNECT'];
const URI_VALIDOS = new Set('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~:/?[]@!$&\'()*+,;=');
const HEX = new Set('0123456789abcdefABCDEF');
const esDigito = (c) => c >= '0' && c <= '9';
const esLetra = (c) => /^[A-Za-z]$/.test(c);

// Nodos con estado de aceptación y el token que emiten.
const ACEPTACION = {
  num0: 'TOKEN_ENTERO', num3: 'TOKEN_IP', uri: 'TOKEN_RUTA', ffecha: 'TOKEN_FECHA',
  fmet: 'TOKEN_METODO_HTTP', fprot: 'TOKEN_PROTOCOLO', guion: 'TOKEN_GUION', comillas: 'TOKEN_COMILLAS',
};

// Patrón posicional de TOKEN_FECHA: D dígito, M mayúscula, m minúscula, S signo.
const PATRON_FECHA = '[DD/Mmm/DDDD:DD:DD:DD SDDDD]';
const SEGMENTO_FECHA = (i) => (i < 1 ? 'q_fecha_[' : i < 3 ? 'q_fecha_día' : i < 4 ? 'q_fecha_/' : i < 7 ? 'q_fecha_mes'
  : i < 8 ? 'q_fecha_/' : i < 12 ? 'q_fecha_año' : i < 15 ? 'q_fecha_hora' : i < 18 ? 'q_fecha_min' : i < 21 ? 'q_fecha_seg'
    : i < 22 ? 'q_fecha_esp' : i < 23 ? 'q_fecha_signo' : 'q_fecha_tz');
const coincideFecha = (c, p) => (p === 'D' ? esDigito(c) : p === 'M' ? /[A-Z]/.test(c) : p === 'm' ? /[a-z]/.test(c)
  : p === 'S' ? c === '+' || c === '-' : c === p);
const PATRON_PROT = 'HTTP/D.D';

/**
 * Calcula la traza del AFD para un lexema.
 * @returns {{rama:string, pasos:Array, acepta:boolean, tipo:string|null}}
 */
export function trazar(lexema, siguiente = '') {
  const pasos = [];
  let estado = 'q0', nodo = 'q0';
  const mover = (sim, nuevoEstado, nuevoNodo, arista) => {
    pasos.push({ de: estado, sim, a: nuevoEstado, nodo: nuevoNodo, arista, deNodo: nodo });
    estado = nuevoEstado; nodo = nuevoNodo;
  };
  const aError = (sim) => mover(sim, 'q_err', 'err', nodo === 'err' ? 'err-err' : null);

  const c0 = lexema[0] ?? '';
  let rama;
  if (c0 === '/') rama = 'uri';
  else if (c0 === '[') rama = 'fecha';
  else if (c0 === 'H' && (lexema + siguiente).startsWith('HTTP')) rama = 'prot';
  else if (esLetra(c0)) rama = 'met';
  else if (esDigito(c0)) rama = 'num';
  else if (c0 === '-') rama = 'guion';
  else if (c0 === '"') rama = 'comillas';
  else rama = 'err';

  let puntos = 0, digitosBloque = 0, hexPend = 0, prefijo = '';
  for (let i = 0; i < lexema.length; i++) {
    const c = lexema[i];
    if (nodo === 'err') { mover(c, 'q_err', 'err', 'err-err'); continue; }

    switch (rama) {
      case 'num':
        // Un octeto de IP admite de 1 a 3 dígitos (sub-máquina O = D ∪ D² ∪ D³).
        if (esDigito(c) && (puntos === 0 || digitosBloque < 3)) {
          digitosBloque++;
          mover(c, `q_num_${puntos}`, `num${puntos}`, i === 0 ? 'q0-num0' : `num${puntos}-num${puntos}`);
        } else if (c === '.' && puntos < 3 && digitosBloque >= 1 && digitosBloque <= 3) {
          puntos++; digitosBloque = 0;
          mover(c, `q_num_${puntos}`, `num${puntos}`, `num${puntos - 1}-num${puntos}`);
        } else aError(c);
        break;
      case 'uri':
        if (i === 0) mover(c, 'q_uri', 'uri', 'q0-uri');
        else if (hexPend === 2) { if (HEX.has(c)) { hexPend = 1; mover(c, 'q_hex2', 'hex2', 'hex1-hex2'); } else aError(c); }
        else if (hexPend === 1) { if (HEX.has(c)) { hexPend = 0; mover(c, 'q_uri', 'uri', 'hex2-uri'); } else aError(c); }
        else if (c === '%') { hexPend = 2; mover(c, 'q_hex1', 'hex1', 'uri-hex1'); }
        else if (URI_VALIDOS.has(c)) mover(c, 'q_uri', 'uri', 'uri-uri');
        else aError(c);
        break;
      case 'fecha': {
        const p = PATRON_FECHA[i];
        if (p !== undefined && coincideFecha(c, p)) {
          const ultimo = i === PATRON_FECHA.length - 1;
          mover(c, ultimo ? 'q_f_fecha' : SEGMENTO_FECHA(i), ultimo ? 'ffecha' : 'fecha',
            i === 0 ? 'q0-fecha' : ultimo ? 'fecha-ffecha' : 'fecha-fecha');
        } else aError(c);
        break;
      }
      case 'met': {
        const cand = prefijo + c;
        if (METODOS.some((m) => m.startsWith(cand))) {
          prefijo = cand;
          const completo = METODOS.includes(cand);
          mover(c, completo ? 'q_f_metodo' : `q_met_${cand}`, completo ? 'fmet' : 'met',
            i === 0 ? (completo ? 'met-fmet' : 'q0-met') : completo ? 'met-fmet' : 'met-met');
        } else aError(c);
        break;
      }
      case 'prot': {
        const p = PATRON_PROT[i];
        const ok = p === 'D' ? esDigito(c) : c === p;
        if (p !== undefined && ok) {
          const ultimo = i === PATRON_PROT.length - 1;
          const nombres = ['q_prot_H', 'q_prot_HT', 'q_prot_HTT', 'q_prot_HTTP', 'q_prot_/', 'q_prot_mayor', 'q_prot_punto', 'q_f_protocolo'];
          mover(c, nombres[i], ultimo ? 'fprot' : 'prot', i === 0 ? 'q0-prot' : ultimo ? 'prot-fprot' : 'prot-prot');
        } else aError(c);
        break;
      }
      case 'guion':
        if (i === 0) mover(c, 'q_guion', 'guion', 'q0-guion'); else aError(c);
        break;
      case 'comillas':
        if (i === 0) mover(c, 'q_comillas', 'comillas', 'q0-comillas'); else aError(c);
        break;
      default:
        mover(c, 'q_err', 'err', i === 0 ? 'q0-err' : 'err-err');
    }
  }

  // El último octeto de una IP no puede quedar vacío (p. ej. '192.168.1.').
  const tipo = nodo === 'num3' && digitosBloque === 0 ? null : (ACEPTACION[nodo] ?? null);
  const acepta = tipo !== null;
  pasos.push({ de: estado, sim: '⊔', a: acepta ? 'q0' : 'q_err', nodo: acepta ? nodo : 'err', deNodo: nodo, arista: null, fin: true, acepta, tipo });
  return { rama, pasos, acepta, tipo };
}

// ----------------------------------------------------------------------------
// Diagrama SVG del AFD integrador
// ----------------------------------------------------------------------------
const NODOS = {
  q0: [60, 235, 'q0'],
  guion: [210, 40, 'q_guion'], comillas: [330, 40, 'q_com'],
  num0: [210, 150, 'num_0'], num1: [330, 150, 'num_1'], num2: [450, 150, 'num_2'], num3: [570, 150, 'num_3'],
  uri: [210, 255, 'q_uri'], hex1: [330, 255, 'hex_1'], hex2: [450, 255, 'hex_2'],
  fecha: [210, 345, 'Q_fecha'], ffecha: [340, 345, 'f_fecha'],
  met: [210, 405, 'Q_met'], fmet: [340, 405, 'f_met'],
  prot: [210, 465, 'Q_prot'], fprot: [340, 465, 'f_prot'],
  err: [660, 330, 'q_err'],
};
const R = 22;

// Cada constructor devuelve [trazado, x de etiqueta, y de etiqueta].
function curvaQ0(dest) {
  const [x0, y0] = NODOS.q0, [x1, y1] = NODOS[dest];
  const sx = x0 + R * 0.7, sy = y0 + Math.sign(y1 - y0) * R * 0.7, ex = x1 - R;
  return [`M${sx} ${sy} C ${sx + 40} ${y1}, ${ex - 60} ${y1}, ${ex} ${y1}`, x1 - R - 34, y1 - 7];
}
function recta(a, b) {
  const [x0, y0] = NODOS[a], [x1, y1] = NODOS[b];
  return [`M${x0 + R} ${y0} L ${x1 - R - 3} ${y1}`, (x0 + x1) / 2, y0 - 8];
}
function bucle(n) {
  const [x, y] = NODOS[n];
  return [`M${x - 9} ${y - R + 2} C ${x - 26} ${y - 56}, ${x + 26} ${y - 56}, ${x + 9} ${y - R + 2}`, x, y - R - 30];
}
const [hx, hy] = NODOS.hex2, [ux, uy] = NODOS.uri;
const [qx, qy] = NODOS.q0, [ex, ey] = NODOS.err;

const ARISTAS = [
  ['q0-guion', curvaQ0('guion'), "'-'"],
  ['q0-comillas', [`M${qx + 15} ${qy - 16} C 130 40, 250 6, ${330 - R} 34`, 262, 18], "'\"'"],
  ['q0-num0', curvaQ0('num0'), 'dígito'],
  ['num0-num0', bucle('num0'), 'd'],
  ['num0-num1', recta('num0', 'num1'), "'.'"],
  ['num1-num1', bucle('num1'), 'd'],
  ['num1-num2', recta('num1', 'num2'), "'.'"],
  ['num2-num2', bucle('num2'), 'd'],
  ['num2-num3', recta('num2', 'num3'), "'.'"],
  ['num3-num3', bucle('num3'), 'd'],
  ['q0-uri', curvaQ0('uri'), "'/'"],
  ['uri-uri', bucle('uri'), 'Σ_uri'],
  ['uri-hex1', recta('uri', 'hex1'), "'%'"],
  ['hex1-hex2', recta('hex1', 'hex2'), 'hex'],
  ['hex2-uri', [`M${hx - 12} ${hy + R - 4} C ${hx - 40} ${hy + 52}, ${ux + 40} ${hy + 52}, ${ux + 12} ${uy + R - 2}`, (hx + ux) / 2, hy + 52], 'hex'],
  ['q0-fecha', curvaQ0('fecha'), "'['"],
  ['fecha-ffecha', recta('fecha', 'ffecha'), "patrón · ']'"],
  ['q0-met', curvaQ0('met'), 'letra'],
  ['met-fmet', recta('met', 'fmet'), 'reservada'],
  ['q0-prot', curvaQ0('prot'), "'HTTP'"],
  ['prot-fprot', recta('prot', 'fprot'), "/ d '.' d"],
  ['q0-err', [`M${qx} ${qy + R} C ${qx + 20} 535, ${ex} 535, ${ex} ${ey + R + 3}`, 470, 505], 'otro símbolo'],
  ['err-err', bucle('err'), 'c ∉ Σ_espacio'],
];

export function diagramaSVG() {
  const aristas = ARISTAS.map(([id, [d, lx, ly], etq]) => `
    <path class="arista" data-arista="${id}" d="${d}" marker-end="url(#punta)"/>
    <text class="etq" data-etq="${id}" x="${lx}" y="${ly}">${esc(etq)}</text>`).join('');
  const nodos = Object.entries(NODOS).map(([id, [x, y, txt]]) => {
    const final = id in ACEPTACION;
    return `<g class="estado${final ? ' final' : ''}${id === 'err' ? ' err' : ''}" data-nodo="${id}"
      data-tt="<b>${esc(txt)}</b>${final ? `<div class='tt-sub'>∈ F · emite ${ACEPTACION[id]}</div>` : id === 'err' ? "<div class='tt-sub'>estado sumidero</div>" : ''}">
      <circle cx="${x}" cy="${y}" r="${R}"/>
      ${final ? `<circle class="anillo" cx="${x}" cy="${y}" r="${R - 4}"/>` : ''}
      <text x="${x}" y="${y}">${esc(txt)}</text></g>`;
  }).join('');
  return `<svg class="diagrama" viewBox="0 0 720 530" role="img" aria-label="Diagrama del AFD integrador">
    <defs><marker id="punta" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0 0 L10 5 L0 10z" stroke="none" style="fill:var(--texto-3)"/></marker>
      <marker id="punta-activa" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0 0 L10 5 L0 10z" stroke="none" style="fill:var(--acento)"/></marker></defs>
    <rect class="caja" x="172" y="86" width="436" height="94" rx="10"/><text class="caja-tit" x="180" y="174">TOKEN_ENTERO / TOKEN_IP</text>
    <rect class="caja" x="172" y="190" width="316" height="128" rx="10"/><text class="caja-tit" x="180" y="312">TOKEN_RUTA · RFC 3986</text>
    <rect class="caja" x="172" y="320" width="210" height="172" rx="10"/><text class="caja-tit" x="254" y="486">sub-autómatas</text>
    <path class="flecha-ini" d="M6 ${qy} L ${qx - R - 3} ${qy}" marker-end="url(#punta)"/>
    ${aristas}${nodos}
  </svg>`;
}

export function resaltarDiagrama(svg, pasos, indice) {
  if (!svg) return;
  svg.querySelectorAll('.estado').forEach((g) => g.classList.remove('visitado', 'actual'));
  svg.querySelectorAll('.arista, .etq').forEach((a) => a.classList.remove('activa'));
  svg.querySelectorAll('.arista').forEach((a) => a.setAttribute('marker-end', 'url(#punta)'));
  const visit = new Set(['q0']);
  for (let i = 0; i <= indice && i < pasos.length; i++) visit.add(pasos[i].nodo);
  visit.forEach((n) => svg.querySelector(`[data-nodo="${n}"]`)?.classList.add('visitado'));
  const paso = pasos[indice];
  const actual = indice < 0 ? 'q0' : paso?.nodo;
  svg.querySelector(`[data-nodo="${actual}"]`)?.classList.add('actual');
  if (paso?.arista) {
    const arista = svg.querySelector(`[data-arista="${paso.arista}"]`);
    arista?.classList.add('activa');
    arista?.setAttribute('marker-end', 'url(#punta-activa)');
    svg.querySelector(`[data-etq="${paso.arista}"]`)?.classList.add('activa');
  }
}

export function descripcionRama(rama) {
  return {
    num: 'Bifurcación TOKEN_ENTERO / IP: δ(q0, d ∈ Σ_dígito) = q_num_0; los puntos consumidos determinan q_num_i.',
    uri: "Bifurcación TOKEN_RUTA: δ(q0, '/') = q_uri; % activa el sub-autómata de percent-encoding.",
    fecha: "Bifurcación TOKEN_FECHA: δ(q0, '[') = q_fecha_1; concatenación heterogénea posicional.",
    met: 'Bifurcación TOKEN_METODO_HTTP: δ(q0, c ∈ Σ_letra) = q_met_1; unión de ramas de palabras reservadas.',
    prot: "Bifurcación TOKEN_PROTOCOLO: lookahead de 'HTTP' desde 'H' para desambiguar de HEAD.",
    guion: "Transición estática: δ(q0, '-') = q_guion.",
    comillas: "Transición estática: δ(q0, '\"') = q_comillas.",
    err: 'Transición de fallo: δ(q0, c ∉ {/, [, -, ", Σ_letra, Σ_dígito, Σ_espacio}) = q_err.',
  }[rama];
}

export { ACEPTACION };

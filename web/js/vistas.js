// Renderizadores de cada pestaña del inspector.

import { esc, formatoBytes, formatoNum, porcentaje, ICONOS } from './util.js';
import { FASES, TOKENS, GRAMATICA_ENTRY, PRUEBAS } from './datos.js';
import { trazar, diagramaSVG, resaltarDiagrama, descripcionRama } from './automata.js';

const insignia = (estado, texto) => {
  const icono = estado === 'ok' ? ICONOS.check : estado === 'neutra' ? '' : ICONOS.cruz;
  return `<span class="insignia ${estado}">${icono}${esc(texto ?? FASES[estado]?.nombre ?? estado)}</span>`;
};
const chip = (tipo, extra = '') => `<span class="chip ${tipo}" ${extra}>${esc(TOKENS[tipo]?.corto ? tipo : tipo)}</span>`;
const vacio = (icono, titulo, texto) => `<div class="vacio">${icono}<strong>${esc(titulo)}</strong><p>${texto}</p></div>`;

const SIN_ANALISIS = () => vacio(ICONOS.archivo, 'Sin resultados todavía', 'Escriba o cargue un log en el editor y presione <kbd>Ctrl</kbd> + <kbd>Enter</kbd>.');

function cabecera(titulo, descripcion, controles = '') {
  return `<div class="vista-cabecera"><div><h2>${titulo}</h2>${descripcion ? `<p>${descripcion}</p>` : ''}</div>
    ${controles ? `<div class="vista-controles">${controles}</div>` : ''}</div>`;
}

function selectorLinea(est) {
  const total = est.analisis?.lineas.length ?? 0;
  return `<div class="selector-linea">
    <button class="btn-icono" data-accion="linea-ant" title="Línea anterior">${ICONOS.anterior}</button>
    <span style="font-size:12px;color:var(--texto-3)">Línea</span>
    <input class="campo" type="number" min="1" max="${total}" value="${est.lineaSel}" data-accion="linea-num" aria-label="Número de línea">
    <span style="font-size:12px;color:var(--texto-3)">de ${total}</span>
    <button class="btn-icono" data-accion="linea-sig" title="Línea siguiente">${ICONOS.siguiente}</button>
  </div>`;
}

export function enlazarSelectorLinea(cont, acciones, est) {
  cont.querySelector('[data-accion="linea-ant"]')?.addEventListener('click', () => acciones.seleccionarLinea(est.lineaSel - 1, true));
  cont.querySelector('[data-accion="linea-sig"]')?.addEventListener('click', () => acciones.seleccionarLinea(est.lineaSel + 1, true));
  cont.querySelector('[data-accion="linea-num"]')?.addEventListener('change', (e) => acciones.seleccionarLinea(Number(e.target.value), true));
}

// ============================================================================
// Diagnóstico
// ============================================================================
export function vistaDiagnostico(cont, est, acciones) {
  const a = est.analisis;
  if (!a) { cont.innerHTML = SIN_ANALISIS(); return; }

  const lineas = a.lineas.filter((l) => l.estado !== 'vacia');
  const cuenta = { ok: 0, lexico: 0, sintactico: 0, semantico: 0, interno: 0 };
  let registros = 0;
  for (const l of lineas) { cuenta[l.estado]++; if (l.estado === 'ok') registros += l.entradas.length; }

  const e = a.estricto;
  const claseEstricto = e.ok ? 'ok' : e.fase;
  const filtro = est.filtroDiag;
  const visibles = lineas.filter((l) => filtro === 'todas' || (filtro === 'errores' ? l.estado !== 'ok' : l.estado === filtro));
  const LIMITE = est.limiteDiag;

  const filtros = [['todas', 'Todas', lineas.length, null], ['errores', 'Con errores', lineas.length - cuenta.ok, null],
    ['ok', 'Válidas', cuenta.ok, 'var(--ok)'], ['lexico', 'Léxico', cuenta.lexico, 'var(--lexico)'],
    ['sintactico', 'Sintáctico', cuenta.sintactico, 'var(--sintactico)'], ['semantico', 'Semántico', cuenta.semantico, 'var(--semantico)']];
  if (cuenta.interno) filtros.push(['interno', 'Excepción', cuenta.interno, 'var(--interno)']);

  cont.innerHTML = `
    ${cabecera('Diagnóstico de compilación', 'Veredicto del compilador sobre el archivo completo y análisis independiente de cada línea para localizar todas las fallas.')}
    <div class="mensaje-compilador ${claseEstricto}">
      <div style="min-width:0;flex:1">
        <div class="mc-cab">Salida de compilador.py · modo estricto (idéntico a main())</div>
        <pre><span class="terminal-prompt">$ python compilador.py</span>\n${esc(e.ok ? e.mensaje : `FALLO DE COMPILACIÓN:\n${e.mensaje}`)}</pre>
      </div>
      <div>${e.ok ? insignia('ok', 'Compilación exitosa') : insignia(e.fase)}</div>
    </div>
    <div class="resumen-grilla">
      <div class="resumen-item"><div class="etiqueta"><i style="background:var(--ok)"></i>Registros válidos</div><div class="valor">${formatoNum(registros)}</div></div>
      <div class="resumen-item"><div class="etiqueta"><i style="background:var(--lexico)"></i>Errores léxicos</div><div class="valor">${cuenta.lexico}</div></div>
      <div class="resumen-item"><div class="etiqueta"><i style="background:var(--sintactico)"></i>Errores sintácticos</div><div class="valor">${cuenta.sintactico}</div></div>
      <div class="resumen-item"><div class="etiqueta"><i style="background:var(--semantico)"></i>Errores semánticos</div><div class="valor">${cuenta.semantico + (cuenta.interno ? ` <small style="font-size:12px;color:var(--interno)">+${cuenta.interno} exc.</small>` : '')}</div></div>
    </div>
    <div class="vista-cabecera" style="margin-bottom:10px">
      <div class="filtros-diag">${filtros.map(([k, n, c, color]) => `<button class="filtro-btn${filtro === k ? ' activo' : ''}" data-filtro="${k}">${color ? `<i style="background:${color}"></i>` : ''}${n} <span class="contador">${c}</span></button>`).join('')}</div>
    </div>
    ${a.lineasTruncadas ? `<p class="regla-ref" style="margin:0 0 10px">Se muestran las primeras ${formatoNum(a.lineas.length)} líneas con diagnóstico detallado.</p>` : ''}
    <div class="lista-diag">
      ${visibles.length ? visibles.slice(0, LIMITE).map((l) => `
        <button class="diag ${l.estado}${l.linea === est.lineaSel ? ' seleccionada' : ''}" data-linea="${l.linea}">
          <span class="diag-linea">Ln ${l.linea}</span>
          <span class="diag-cuerpo">
            <span class="diag-texto" style="display:block">${esc(l.texto)}</span>
            <span class="diag-msg" style="display:block">${l.estado === 'ok' ? `${l.entradas.length > 1 ? `${l.entradas.length} registros · ` : ''}Análisis léxico, sintáctico y semántico superado.` : esc(l.mensaje)}</span>
          </span>
          ${insignia(l.estado, FASES[l.estado].corto)}
        </button>`).join('') : vacio(ICONOS.check, 'Nada para mostrar', 'No hay líneas que coincidan con el filtro seleccionado.')}
    </div>
    ${visibles.length > LIMITE ? `<div style="text-align:center;margin-top:12px"><button class="btn btn-sutil" data-accion="mas">Mostrar ${Math.min(500, visibles.length - LIMITE)} más (${formatoNum(visibles.length - LIMITE)} restantes)</button></div>` : ''}`;

  cont.querySelectorAll('[data-filtro]').forEach((b) => b.addEventListener('click', () => { est.filtroDiag = b.dataset.filtro; est.limiteDiag = 300; vistaDiagnostico(cont, est, acciones); }));
  cont.querySelector('[data-accion="mas"]')?.addEventListener('click', () => { est.limiteDiag += 500; vistaDiagnostico(cont, est, acciones); });
  cont.querySelectorAll('.diag').forEach((b) => b.addEventListener('click', () => {
    const l = a.lineas[Number(b.dataset.linea) - 1];
    acciones.seleccionarLinea(l.linea, false);
    acciones.irALinea(l.linea, l.tokenError?.columna ?? 1, l.tokenError?.longitud ?? 0);
  }));
}

// ============================================================================
// Tokens
// ============================================================================
export function vistaTokens(cont, est, acciones) {
  const a = est.analisis;
  if (!a) { cont.innerHTML = SIN_ANALISIS(); return; }
  const conteo = {};
  for (const t of a.tokens) conteo[t.tipo] = (conteo[t.tipo] || 0) + 1;
  const tipos = Object.keys(TOKENS).filter((t) => conteo[t]);
  const q = est.busquedaTokens.toLowerCase();
  const filtrados = a.tokens.map((t, i) => ({ ...t, i })).filter((t) => !est.tiposOcultos.has(t.tipo) && (!q || t.lexema.toLowerCase().includes(q)));
  const LIM = 1500;

  cont.innerHTML = `
    ${cabecera('Flujo de tokens', 'Secuencia emitida por <code>Lexer.obtener_siguiente_token()</code> sobre el archivo completo. Los lexemas rechazados se emiten como <code>ERROR</code> tras el barrido hasta el delimitador.',
    `<input class="campo" type="search" placeholder="Buscar lexema…" value="${esc(est.busquedaTokens)}" data-accion="buscar" style="width:180px">`)}
    <div class="leyenda-tokens">${tipos.map((t) => `<span class="chip filtro ${t}${est.tiposOcultos.has(t) ? ' apagado' : ''}" data-tipo="${t}" data-tt="<b>${t}</b><div class='tt-sub'>${esc(TOKENS[t].regex)}</div>">${t} <span class="n">${formatoNum(conteo[t])}</span></span>`).join('')}</div>
    ${a.tokensTruncados ? '<p class="regla-ref">El flujo se truncó en 25.000 tokens.</p>' : ''}
    ${filtrados.length ? `<div class="tabla-contenedor"><table class="tabla">
      <thead><tr><th class="num">#</th><th>Tipo</th><th>Lexema</th><th class="num">Ln</th><th class="num">Col</th><th class="num">Long.</th></tr></thead>
      <tbody>${filtrados.slice(0, LIM).map((t) => `<tr data-i="${t.i}">
        <td class="num">${t.i + 1}</td><td>${chip(t.tipo)}</td>
        <td><span class="lexema${t.lexema.length > 60 ? ' largo' : ''}" ${t.lexema.length > 60 ? `title="${esc(t.lexema.slice(0, 500))}"` : ''}>${esc(t.lexema)}</span></td>
        <td class="num">${t.linea}</td><td class="num">${t.columna}</td><td class="num">${t.lexema.length}</td></tr>`).join('')}</tbody>
    </table></div>${filtrados.length > LIM ? `<p class="regla-ref">Mostrando ${formatoNum(LIM)} de ${formatoNum(filtrados.length)} tokens. Use el buscador o los filtros para acotar.</p>` : ''}`
    : vacio(ICONOS.archivo, 'Sin tokens', 'No hay tokens que coincidan con los filtros actuales.')}`;

  cont.querySelectorAll('[data-tipo]').forEach((c) => c.addEventListener('click', () => {
    const t = c.dataset.tipo;
    est.tiposOcultos.has(t) ? est.tiposOcultos.delete(t) : est.tiposOcultos.add(t);
    vistaTokens(cont, est, acciones);
  }));
  const buscar = cont.querySelector('[data-accion="buscar"]');
  buscar.addEventListener('input', () => {
    est.busquedaTokens = buscar.value;
    const pos = buscar.selectionStart;
    vistaTokens(cont, est, acciones);
    const nuevo = cont.querySelector('[data-accion="buscar"]');
    nuevo.focus(); nuevo.setSelectionRange(pos, pos);
  });
  cont.querySelectorAll('tbody tr').forEach((tr) => tr.addEventListener('click', () => {
    const t = a.tokens[Number(tr.dataset.i)];
    acciones.seleccionarLinea(t.linea, false);
    acciones.irALinea(t.linea, t.columna, t.lexema.length);
  }));
}

// ============================================================================
// Árbol sintáctico
// ============================================================================
function nodoTerminal(tipo, token, rol, clase = '') {
  return `<li><span class="nodo ${clase}">${chip(tipo)}${token ? `<span class="nodo-lexema" title="${esc(token.lexema.slice(0, 400))}">${esc(token.lexema)}</span>` : ''}<span class="nodo-regla">${esc(rol)}</span></span></li>`;
}

function arbolEntrada(tokens, opciones = {}) {
  const { fallaEn = -1, encontrado = null, faseFalla = null, semIdx = -1 } = opciones;
  const items = GRAMATICA_ENTRY.map((g, i) => {
    const tok = tokens[i];
    if (g.tipo === 'SIZE') {
      let hijo;
      if (tok) hijo = nodoTerminal(tok.tipo, tok, 'TOKEN_ENTERO | TOKEN_GUION', semIdx === i ? 'sem-error' : '');
      else if (i === fallaEn) hijo = `<li><span class="nodo fallo"><span class="chip NT">TOKEN_ENTERO | TOKEN_GUION</span><span class="nodo-error ${faseFalla}">${ICONOS.alerta} encontrado ${encontrado ? `${esc(encontrado.tipo)} '${esc(encontrado.lexema)}'` : 'EOF'}</span></span></li>`;
      else hijo = '<li><span class="nodo pendiente"><span class="chip NT">TOKEN_ENTERO | TOKEN_GUION</span></span></li>';
      return `<li><span class="nodo${!tok && i !== fallaEn ? ' pendiente' : ''}"><span class="nodo-nt">&lt;SizeField&gt;</span><span class="nodo-regla">${esc(g.rol)}</span></span><ul>${hijo}</ul></li>`;
    }
    if (tok) return nodoTerminal(g.tipo, tok, g.rol, semIdx === i ? 'sem-error' : '');
    if (i === fallaEn) {
      return `<li><span class="nodo fallo">${chip(g.tipo)}<span class="nodo-error ${faseFalla}">${ICONOS.alerta} ${faseFalla === 'lexico' ? 'lexema inválido' : 'encontrado'} ${encontrado ? `${encontrado.tipo === 'ERROR' ? '' : esc(encontrado.tipo)} '${esc(encontrado.lexema || 'EOF')}'` : 'EOF'}</span></span></li>`;
    }
    return `<li><span class="nodo pendiente">${chip(g.tipo)}<span class="nodo-regla">${esc(g.rol)}</span></span></li>`;
  });
  return items.join('');
}

export function vistaArbol(cont, est, acciones) {
  const a = est.analisis;
  if (!a) { cont.innerHTML = SIN_ANALISIS(); return; }
  const l = a.lineas[est.lineaSel - 1];
  let cuerpo;

  if (!l || l.estado === 'vacia') {
    cuerpo = `<div class="arbol"><ul><li><span class="nodo"><span class="nodo-nt">&lt;LogFile&gt;</span></span>
      <ul><li><span class="nodo"><span class="nodo-epsilon">ε</span><span class="nodo-regla">línea vacía · derivación a la palabra vacía</span></span></li></ul></li></ul></div>`;
  } else {
    const entradas = l.entradas.map((en, k) => {
      const reglaMal = en.reglas.find((r) => !r.ok);
      const semIdx = l.estado === 'semantico' && k === l.entradas.length - 1 && reglaMal ? reglaMal.token : -1;
      return { html: arbolEntrada(en.tokens, { semIdx }), ok: semIdx < 0 };
    });
    if (l.parcial) {
      const toks = l.parcial.tokens;
      // Si el parser abortó durante <SizeField>, los 10 primeros tokens ya fueron consumidos.
      entradas.push({ html: arbolEntrada(toks, { fallaEn: toks.length, encontrado: l.parcial.encontrado, faseFalla: l.estado }), ok: false });
    }
    const sangria = (html, i) => `<li><span class="nodo"><span class="nodo-nt">&lt;LogEntry&gt;</span><span class="nodo-regla">registro ${i + 1} de la línea ${l.linea}</span></span><ul>${html}</ul></li>`;
    const resto = l.estado === 'ok'
      ? '<li><span class="nodo"><span class="nodo-nt">&lt;LogFile&gt;</span><span class="nodo-regla">→ resto del archivo</span></span><ul><li><span class="nodo"><span class="nodo-epsilon">ε</span><span class="nodo-regla">cierre de la recursión</span></span></li></ul></li>'
      : '';
    cuerpo = `<div class="arbol"><ul><li><span class="nodo"><span class="nodo-nt">&lt;LogFile&gt;</span><span class="nodo-regla">::= &lt;LogEntry&gt; &lt;LogFile&gt; | ε</span></span>
      <ul>${entradas.map((e, i) => sangria(e.html, i)).join('')}${resto}</ul></li></ul></div>`;

    if (l.estado !== 'ok' && l.mensaje) {
      cuerpo = `<div class="mensaje-compilador ${l.estado}" style="margin-bottom:14px"><div style="flex:1;min-width:0"><div class="mc-cab">${FASES[l.estado].nombre}</div><pre>${esc(l.mensaje)}</pre></div></div>${cuerpo}`;
    }
    if (l.estado === 'ok' || l.estado === 'semantico') cuerpo += derivacion(l.entradas[0]);
  }

  cont.innerHTML = `${cabecera('Árbol de derivación', 'Derivación de la GLC realizada por el parser descendente recursivo para la línea seleccionada. Los nodos atenuados son los que no llegaron a derivarse.', selectorLinea(est))}${cuerpo}`;
  enlazarSelectorLinea(cont, acciones, est);
}

function derivacion(entrada) {
  if (!entrada) return '';
  const T = GRAMATICA_ENTRY.slice(0, 10).map((g) => g.tipo);
  const size = entrada.tokens[10]?.tipo ?? 'TOKEN_ENTERO';
  const pasos = [
    '<b>&lt;LogFile&gt;</b>',
    '<b>&lt;LogEntry&gt;</b> &lt;LogFile&gt;',
    `${T.join(' ')} <b>&lt;SizeField&gt;</b> &lt;LogFile&gt;`,
    `${T.join(' ')} ${size} <b>&lt;LogFile&gt;</b>`,
    `${T.join(' ')} ${size} ε`,
  ];
  return `<div class="seccion-titulo">Derivación por izquierda</div><div class="derivacion tarjeta">${pasos.map((p, i) => `${i ? '⇒ ' : '&nbsp;&nbsp;'}${p}`).join('\n')}</div>`;
}

// ============================================================================
// Semántica
// ============================================================================
const REFERENCIAS = {
  ip: 'Octetos en 0–255 y sin ceros a la izquierda (ambigüedad octal).',
  fecha: 'Calendario gregoriano con bisiestos, reloj 24 h y huso UTC−12:00 a UTC+14:00.',
  linea_peticion: 'Método + SP + Request-Target + SP + Versión ≤ 8190 bytes (LimitRequestLine de Apache).',
  protocolo: 'Lista blanca de versiones soportadas: HTTP/1.0 y HTTP/1.1.',
  estado: 'RFC 9110: clases 1xx a 5xx (100–599). Se aceptan códigos no registrados en IANA.',
  tamano: 'Campo %b: guion si no hubo payload; de lo contrario, cantidad positiva de bytes.',
};

function detalleRegla(clave, en) {
  const t = en.tokens, d = en.detalle;
  switch (clave) {
    case 'ip': {
      const oct = d.octetos ?? [];
      return `<div class="octetos">${oct.map((o) => {
        const mal = (o.length > 1 && o[0] === '0') || o === '' || Number(o) > 255;
        return `<span class="octeto${mal ? ' mal' : ''}" data-tt="${mal ? 'Octeto inválido' : `Octeto válido · ${Number(o).toString(2).padStart(8, '0')}<sub>2</sub>`}">${esc(o || '∅')}</span>`;
      }).join('<span class="punto-sep">.</span>')}</div>`;
    }
    case 'fecha': {
      const f = d.fecha;
      if (!f) return '';
      const offPct = ((f.offsetMinutos + 720) / (1560)) * 100;
      const offOk = f.offsetMinutos >= -720 && f.offsetMinutos <= 840 && Number(f.offset.slice(3)) <= 59;
      let cal = '';
      if (f.mesNumero && f.diasDelMes) {
        const primero = (new Date(Date.UTC(f.anio, f.mesNumero - 1, 1)).getUTCDay() + 6) % 7;
        const dias = ['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((x) => `<span>${x}</span>`).join('');
        const celdas = Array.from({ length: primero }, () => '<span></span>').join('')
          + Array.from({ length: f.diasDelMes }, (_, i) => `<span class="dia${i + 1 === f.dia ? ' sel' : ''}">${i + 1}</span>`).join('')
          + (f.dia > f.diasDelMes ? `<span class="mal" data-tt="Día inexistente en ${f.mes} ${f.anio}">${f.dia}</span>` : '');
        cal = `<div class="calendario-mini">${dias}${celdas}</div>`;
      }
      return `<div class="regla-detalle">
        <span>${f.dia} de ${esc(f.mes)} de ${f.anio} · ${String(f.hora).padStart(2, '0')}:${String(f.minuto).padStart(2, '0')}:${String(f.segundo).padStart(2, '0')}
        · año ${f.bisiesto ? '<b>bisiesto</b>' : 'no bisiesto'}${f.diasDelMes ? ` · ${esc(f.mes)} tiene ${f.diasDelMes} días` : ''}</span>
        ${cal}
        <span>Huso ${esc(f.offset)} = <b>${f.offsetMinutos >= 0 ? '+' : ''}${f.offsetMinutos}</b> minutos</span>
        <div class="escala-tz" data-tt="Rango válido: −720 a +840 minutos">
          <div class="pista"></div><div class="cero" style="left:${720 / 1560 * 100}%"></div>
          <div class="marca${offOk ? '' : ' mal'}" style="left:${Math.max(0, Math.min(100, offPct))}%"></div>
        </div>
        <div class="medidor-leyenda"><span>UTC−12:00</span><span>UTC</span><span>UTC+14:00</span></div>
      </div>`;
    }
    case 'linea_peticion': {
      const n = d.requestLine ?? 0;
      return `<div class="regla-detalle">
        <div class="medidor${n > 8190 ? ' excede' : ''}" data-tt="${formatoNum(n)} de 8.190 bytes"><span style="width:${Math.min(100, Math.max(1, n / 8190 * 100))}%"></span></div>
        <div class="medidor-leyenda"><span>${formatoNum(n)} bytes</span><span>límite 8.190</span></div>
        <span class="mono" style="font-size:11.5px;color:var(--texto-3)">${esc(t[5].lexema)} ␠ ${esc(t[6].lexema.length > 50 ? t[6].lexema.slice(0, 50) + '…' : t[6].lexema)} ␠ ${esc(t[7].lexema)}</span>
      </div>`;
    }
    case 'protocolo':
      return `<div class="clases-http">${['HTTP/1.0', 'HTTP/1.1'].map((p) => `<span class="${p === t[7].lexema ? 'activa' : ''}">${p}</span>`).join('')}${['HTTP/1.0', 'HTTP/1.1'].includes(t[7].lexema) ? '' : `<span class="fuera">${esc(t[7].lexema)}</span>`}</div>`;
    case 'estado': {
      const c = Number(t[9].lexema);
      const clase = Math.floor(c / 100);
      const nombres = { 1: 'Informativa', 2: 'Éxito', 3: 'Redirección', 4: 'Error del cliente', 5: 'Error del servidor' };
      return `<div class="clases-http">${[1, 2, 3, 4, 5].map((k) => `<span class="${k === clase ? 'activa' : ''}" data-tt="${nombres[k]}">${k}xx</span>`).join('')}${clase < 1 || clase > 5 ? `<span class="fuera">${esc(t[9].lexema)}</span>` : ''}</div>
        <span class="regla-ref">${nombres[clase] ? `Clase ${clase}xx · ${nombres[clase]}` : 'Fuera del dominio de clases HTTP'}</span>`;
    }
    case 'tamano':
      return t[10].tipo === 'TOKEN_GUION'
        ? '<span class="regla-ref">Guion: sin bytes transferidos (representación Apache de %b).</span>'
        : `<span class="regla-ref">${formatoBytes(Number(t[10].lexema))} transferidos</span>`;
    default: return '';
  }
}

const VALOR_REGLA = {
  ip: (t) => t[0].lexema, fecha: (t) => t[3].lexema, linea_peticion: (t) => `${t[5].lexema} ${t[6].lexema.length > 40 ? t[6].lexema.slice(0, 40) + '…' : t[6].lexema} ${t[7].lexema}`,
  protocolo: (t) => t[7].lexema, estado: (t) => t[9].lexema, tamano: (t) => t[10].lexema,
};

export function vistaSemantica(cont, est, acciones) {
  const a = est.analisis;
  if (!a) { cont.innerHTML = SIN_ANALISIS(); return; }
  const l = a.lineas[est.lineaSel - 1];
  let cuerpo;
  if (!l || l.estado === 'vacia') cuerpo = vacio(ICONOS.archivo, 'Línea vacía', 'Seleccione una línea con contenido.');
  else if (!l.entradas.length) {
    cuerpo = vacio(ICONOS.alerta, 'El análisis semántico no se ejecutó',
      `La línea ${l.linea} no superó la fase <b>${esc(FASES[l.estado].nombre.toLowerCase())}</b>. El semántico solo actúa sobre secuencias ya validadas sintácticamente.<br><br><code>${esc(l.mensaje)}</code>`);
  } else {
    cuerpo = l.entradas.map((en, k) => `
      ${l.entradas.length > 1 ? `<div class="seccion-titulo">Registro ${k + 1}</div>` : ''}
      <div class="reglas">${en.reglas.map((r, i) => `
        <div class="regla${r.ok ? '' : ' falla'}">
          <div class="regla-cab"><h3><span class="regla-num">${i + 1}</span>${esc(r.nombre)}</h3>${r.ok ? insignia('ok', 'Cumple') : insignia('semantico', 'Viola')}</div>
          <div class="regla-valor">${esc(VALOR_REGLA[r.clave](en.tokens))}</div>
          ${detalleRegla(r.clave, en)}
          ${r.ok ? `<div class="regla-ref">${esc(REFERENCIAS[r.clave])}</div>` : `<div class="regla-error">${esc(r.mensaje)}</div>`}
        </div>`).join('')}</div>`).join('');
    const fallas = l.entradas.flatMap((e) => e.reglas).filter((r) => !r.ok).length;
    cuerpo = `<p class="regla-ref" style="margin:-4px 0 14px">${fallas ? `${fallas} regla${fallas > 1 ? 's' : ''} violada${fallas > 1 ? 's' : ''}. El compilador reporta la primera según el orden de <code>analizar_log_entry()</code>; aquí cada regla se evalúa por separado.` : 'Las seis reglas del dominio se cumplen.'}</p>${cuerpo}`;
  }
  cont.innerHTML = `${cabecera('Análisis semántico', 'Restricciones lógicas y del protocolo aplicadas por <code>SemanticAnalyzer</code> sobre la línea seleccionada.', selectorLinea(est))}${cuerpo}`;
  enlazarSelectorLinea(cont, acciones, est);
}

// ============================================================================
// Autómata
// ============================================================================
let animacion = null;
export function detenerAnimacion() { if (animacion) { clearInterval(animacion); animacion = null; } }

export function vistaAutomata(cont, est, acciones) {
  detenerAnimacion();
  const a = est.analisis;
  const tokensLinea = a ? a.tokens.filter((t) => t.linea === est.lineaSel) : [];
  if (est.lexemaAutomata == null && tokensLinea.length) est.lexemaAutomata = { lexema: tokensLinea[0].lexema, tipo: tokensLinea[0].tipo, idx: 0 };
  const sel = est.lexemaAutomata;

  cont.innerHTML = `
    ${cabecera('Autómata Finito Determinista', 'Simulación paso a paso del AFD integrador M = (Q, Σ, δ, q0, F) definido en el informe. Elija un token de la línea o escriba un lexema para recorrer la cinta.', a ? selectorLinea(est) : '')}
    <div class="automata-grid">
      <div class="tarjeta">
        <div class="lista-tokens-linea" id="tokens-linea">
          ${tokensLinea.length ? tokensLinea.map((t, i) => `<span class="chip ${t.tipo}${sel && sel.idx === i && sel.lexema === t.lexema ? ' sel' : ''}" data-i="${i}" data-tt="<b>${esc(t.lexema.slice(0, 80))}</b>">${esc(t.lexema.length > 18 ? t.lexema.slice(0, 18) + '…' : t.lexema)}</span>`).join('') : '<span class="regla-ref">La línea seleccionada no tiene tokens.</span>'}
        </div>
        <div style="display:flex;gap:6px;margin-top:10px">
          <input class="campo mono" id="lexema-libre" placeholder="Probar un lexema, p. ej. 192.168.0.1 o /a%2G" style="flex:1" value="${sel && sel.idx === -1 ? esc(sel.lexema) : ''}">
          <button class="btn btn-sutil" id="btn-trazar">${ICONOS.rayo} Trazar</button>
        </div>
      </div>
      <div class="tarjeta" id="panel-traza"></div>
      <div class="tarjeta" style="padding:8px">${diagramaSVG()}</div>
    </div>`;

  enlazarSelectorLinea(cont, acciones, est);
  cont.querySelectorAll('#tokens-linea .chip').forEach((c) => c.addEventListener('click', () => {
    const t = tokensLinea[Number(c.dataset.i)];
    est.lexemaAutomata = { lexema: t.lexema, tipo: t.tipo, idx: Number(c.dataset.i) };
    vistaAutomata(cont, est, acciones);
  }));
  const libre = cont.querySelector('#lexema-libre');
  const trazarLibre = () => { if (libre.value) { est.lexemaAutomata = { lexema: libre.value, tipo: null, idx: -1 }; vistaAutomata(cont, est, acciones); } };
  cont.querySelector('#btn-trazar').addEventListener('click', trazarLibre);
  libre.addEventListener('keydown', (e) => { if (e.key === 'Enter') trazarLibre(); });

  if (sel) panelTraza(cont, sel);
  else resaltarDiagrama(cont.querySelector('.diagrama'), [], -1);
}

function panelTraza(cont, sel) {
  const lexema = sel.lexema.length > 400 ? sel.lexema.slice(0, 400) : sel.lexema;
  const { rama, pasos, acepta, tipo } = trazar(lexema);
  const panel = cont.querySelector('#panel-traza');
  const svg = cont.querySelector('.diagrama');
  let i = -1;

  panel.innerHTML = `
    <div class="vista-cabecera" style="margin-bottom:8px">
      <div><h2 style="font-size:13.5px">Cinta de entrada</h2><p>${esc(descripcionRama(rama))}</p></div>
      <div class="controles-traza">
        <button class="btn-icono" data-c="reiniciar" title="Reiniciar">${ICONOS.reiniciar}</button>
        <button class="btn-icono" data-c="ant" title="Paso anterior">${ICONOS.anterior}</button>
        <button class="btn btn-primario btn-mini" data-c="play">${ICONOS.play} Reproducir</button>
        <button class="btn-icono" data-c="sig" title="Paso siguiente">${ICONOS.siguiente}</button>
        <input type="range" min="60" max="900" value="420" data-c="vel" title="Velocidad" aria-label="Velocidad">
      </div>
    </div>
    <div class="cinta">${[...lexema].map((c, k) => `<span class="celda" data-k="${k}">${c === ' ' ? '␠' : esc(c)}</span>`).join('')}<span class="celda fin" data-k="${lexema.length}">⊔</span></div>
    <div class="resultado-traza" style="margin:6px 0 12px">
      <span>AFD formal: ${acepta ? `${insignia('ok', 'Acepta')} ${chip(tipo)}` : insignia('lexico', 'Rechaza → q_err')}</span>
      ${sel.tipo ? `<span>Lexer Python: ${chip(sel.tipo)}</span>
      <span>${(acepta ? tipo : 'ERROR') === sel.tipo ? insignia('ok', 'Coinciden') : insignia('sintactico', 'Difieren')}</span>` : ''}
    </div>
    <div class="traza-lista">${pasos.map((p, k) => `<div data-p="${k}"><span class="delta">${k + 1}</span><span>δ(${esc(p.de)},</span><span class="sim">${p.sim === ' ' ? '␠' : esc(p.sim)}</span><span>) = ${esc(p.a)}${p.fin ? (p.acepta ? ` · emite ${p.tipo}` : ' · rechazo') : ''}</span></div>`).join('')}</div>`;

  const celdas = [...panel.querySelectorAll('.celda')];
  const filas = [...panel.querySelectorAll('.traza-lista > div')];
  const btnPlay = panel.querySelector('[data-c="play"]');
  const pintar = () => {
    celdas.forEach((c, k) => {
      c.classList.toggle('leida', k < i);
      c.classList.toggle('cabezal', k === i);
      c.classList.toggle('err', k === i && pasos[i]?.nodo === 'err');
    });
    filas.forEach((f, k) => f.classList.toggle('actual', k === i));
    // Desplazamiento local (sin mover la vista completa)
    const lista = panel.querySelector('.traza-lista'), cinta = panel.querySelector('.cinta');
    const fila = filas[i], celda = celdas[Math.max(0, i)];
    if (fila && (fila.offsetTop < lista.scrollTop || fila.offsetTop + fila.offsetHeight > lista.scrollTop + lista.clientHeight)) {
      lista.scrollTop = fila.offsetTop - lista.clientHeight / 2;
    }
    if (celda) cinta.scrollLeft = Math.max(0, celda.offsetLeft - cinta.clientWidth / 2);
    resaltarDiagrama(svg, pasos, i);
  };
  const paso = (d) => { i = Math.max(-1, Math.min(pasos.length - 1, i + d)); pintar(); };
  const pausar = () => { detenerAnimacion(); btnPlay.innerHTML = `${ICONOS.play} Reproducir`; };
  const reproducir = () => {
    if (i >= pasos.length - 1) i = -1;
    btnPlay.innerHTML = `${ICONOS.pausa} Pausa`;
    const vel = 960 - Number(panel.querySelector('[data-c="vel"]').value);
    animacion = setInterval(() => { paso(1); if (i >= pasos.length - 1) pausar(); }, vel);
  };
  panel.querySelector('[data-c="sig"]').addEventListener('click', () => { pausar(); paso(1); });
  panel.querySelector('[data-c="ant"]').addEventListener('click', () => { pausar(); paso(-1); });
  panel.querySelector('[data-c="reiniciar"]').addEventListener('click', () => { pausar(); i = -1; pintar(); });
  panel.querySelector('[data-c="vel"]').addEventListener('change', () => { if (animacion) { pausar(); reproducir(); } });
  btnPlay.addEventListener('click', () => (animacion ? pausar() : reproducir()));
  filas.forEach((f) => f.addEventListener('click', () => { pausar(); i = Number(f.dataset.p); pintar(); }));
  pintar();
  if (pasos.length <= 60) reproducir();
}

// ============================================================================
// Analítica
// ============================================================================
function barrasH(datos, total, opciones = {}) {
  const max = Math.max(1, ...datos.map(([, v]) => v));
  return `<div class="barras-h">${datos.map(([k, v]) => `
    <div class="barra-h" data-tt="<b>${esc(k)}</b><div class='tt-sub'>${formatoNum(v)} ${opciones.unidad ?? 'peticiones'} · ${porcentaje(v, total)}</div>">
      <span class="nombre" title="${esc(k)}">${esc(k)}</span>
      <span class="pista"><span class="relleno" style="width:${(v / max) * 100}%"></span></span>
      <span class="valor">${opciones.formato ? opciones.formato(v) : formatoNum(v)}</span>
    </div>`).join('')}</div>`;
}

const contar = (arr, f) => {
  const m = new Map();
  for (const x of arr) { const k = f(x); m.set(k, (m.get(k) || 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};

export function vistaAnalitica(cont, est) {
  const a = est.analisis;
  if (!a) { cont.innerHTML = SIN_ANALISIS(); return; }
  const regs = a.lineas.filter((l) => l.estado === 'ok').flatMap((l) => l.entradas.map((e) => e.campos));
  const noVacias = a.lineas.filter((l) => l.estado !== 'vacia');
  const fallidas = noVacias.filter((l) => l.estado !== 'ok').length;

  if (!regs.length) {
    cont.innerHTML = `${cabecera('Analítica de tráfico', 'Estadísticas calculadas sobre los registros que superaron las tres fases.')}${vacio(ICONOS.grafico, 'Sin registros válidos', 'Las métricas se calculan únicamente con registros que superan el análisis léxico, sintáctico y semántico. Pruebe el ejemplo <b>Tráfico válido</b>.')}`;
    return;
  }

  const bytes = regs.reduce((s, r) => s + (r.tamano ? Number(r.tamano) : 0), 0);
  const ips = contar(regs, (r) => r.ip);
  const rutas = contar(regs, (r) => r.ruta.split('?')[0]);
  const metodos = contar(regs, (r) => r.metodo);
  const codigos = contar(regs, (r) => r.estado);
  const protocolos = contar(regs, (r) => r.protocolo);
  const horas = Array(24).fill(0);
  regs.forEach((r) => { horas[Number(r.fecha.slice(13, 15))]++; });
  const maxHora = Math.max(1, ...horas);

  const CLASES = [
    ['2xx', 'Éxito', 'var(--ok)'], ['3xx', 'Redirección', 'var(--barra)'], ['4xx', 'Error del cliente', 'var(--sintactico)'],
    ['5xx', 'Error del servidor', 'var(--lexico)'], ['1xx', 'Informativa', 'var(--texto-3)'],
  ];
  const porClase = Object.fromEntries(CLASES.map(([c]) => [c, 0]));
  regs.forEach((r) => { porClase[`${r.estado[0]}xx`]++; });
  const errores4y5 = porClase['4xx'] + porClase['5xx'];

  const FASES_G = [['ok', 'Válidas', 'var(--ok)'], ['lexico', 'Léxico', 'var(--lexico)'], ['sintactico', 'Sintáctico', 'var(--sintactico)'], ['semantico', 'Semántico', 'var(--semantico)'], ['interno', 'Excepción', 'var(--interno)']];
  const porFase = Object.fromEntries(FASES_G.map(([f]) => [f, 0]));
  noVacias.forEach((l) => { porFase[l.estado]++; });

  const apilada = (items, tot) => `<div class="apilada">${items.filter(([, , , v]) => v).map(([k, n, c, v]) => `<span style="flex-grow:${v};background:${c}" data-tt="<b>${esc(n)}</b><div class='tt-sub'>${formatoNum(v)} · ${porcentaje(v, tot)}</div>"></span>`).join('')}</div>
    <div class="apilada-leyenda">${items.filter(([, , , v]) => v).map(([k, n, c, v]) => `<span><i style="background:${c}"></i>${esc(k === n ? n : `${k} ${n}`)}<b>${formatoNum(v)}</b></span>`).join('')}</div>`;

  cont.innerHTML = `
    ${cabecera('Analítica de tráfico', `Estadísticas sobre los ${formatoNum(regs.length)} registros que superaron las tres fases del compilador.`)}
    <div class="kpis">
      <div class="kpi"><div class="etiqueta">Registros válidos</div><div class="valor">${formatoNum(regs.length)}</div><div class="sub">${porcentaje(noVacias.length - fallidas, noVacias.length)} de las líneas</div></div>
      <div class="kpi"><div class="etiqueta">Volumen transferido</div><div class="valor">${formatoBytes(bytes)}</div><div class="sub">promedio ${formatoBytes(bytes / regs.length)}</div></div>
      <div class="kpi"><div class="etiqueta">Clientes únicos</div><div class="valor">${formatoNum(ips.length)}</div><div class="sub">${formatoNum(rutas.length)} recursos distintos</div></div>
      <div class="kpi"><div class="etiqueta">Respuestas 4xx / 5xx</div><div class="valor">${porcentaje(errores4y5, regs.length)}</div><div class="sub">${formatoNum(errores4y5)} peticiones con error</div></div>
    </div>
    <div class="graficos">
      <div class="grafico ancho"><h3>Actividad por hora del día <small>hora local del registro</small></h3>
        <div class="columnas">${horas.map((v, h) => `<div class="col${v ? '' : ' cero'}" style="height:${(v / maxHora) * 100}%" data-tt="<b>${String(h).padStart(2, '0')}:00 – ${String(h).padStart(2, '0')}:59</b><div class='tt-sub'>${v} peticiones</div>"></div>`).join('')}</div>
        <div class="columnas-eje">${horas.map((_, h) => `<span>${h % 3 === 0 ? String(h).padStart(2, '0') : ''}</span>`).join('')}</div>
      </div>
      <div class="grafico"><h3>Clases de respuesta <small>RFC 9110</small></h3>${apilada(CLASES.map(([c, n, col]) => [c, n, col, porClase[c]]), regs.length)}</div>
      <div class="grafico"><h3>Resultado del análisis por línea <small>${formatoNum(noVacias.length)} líneas</small></h3>${apilada(FASES_G.map(([f, n, col]) => [n, n, col, porFase[f]]), noVacias.length)}</div>
      <div class="grafico"><h3>Métodos HTTP</h3>${barrasH(metodos, regs.length)}</div>
      <div class="grafico"><h3>Códigos de estado</h3>${barrasH(codigos.slice(0, 8), regs.length)}</div>
      <div class="grafico"><h3>Recursos más solicitados <small>sin query string</small></h3>${barrasH(rutas.slice(0, 8), regs.length)}</div>
      <div class="grafico"><h3>Clientes con más peticiones</h3>${barrasH(ips.slice(0, 8), regs.length)}</div>
      <div class="grafico ancho"><h3>Versiones del protocolo</h3>${barrasH(protocolos, regs.length)}</div>
    </div>`;
}

// ============================================================================
// Pruebas
// ============================================================================
export function vistaPruebas(cont, est, acciones) {
  const res = est.pruebas;
  const total = PRUEBAS.length;
  const pasan = res ? res.filter((r, i) => faseDe(r) === PRUEBAS[i].esp).length : 0;
  const circ = 2 * Math.PI * 22;
  const soloFallas = est.pruebasSoloFallas;

  const cats = [...new Set(PRUEBAS.map((p) => p.cat))];
  const filas = (cat) => PRUEBAS.map((p, i) => ({ p, i })).filter(({ p, i }) => p.cat === cat && (!soloFallas || (res && faseDe(res[i]) !== p.esp))).map(({ p, i }) => {
    const r = res?.[i];
    const obtenido = r ? faseDe(r) : null;
    const pasa = r && obtenido === p.esp;
    return `<tr class="prueba">
      <td><span class="icono-res ${!r ? 'pend' : pasa ? 'pasa' : 'falla'}">${!r ? '' : pasa ? ICONOS.check : ICONOS.cruz}</span></td>
      <td class="desc"><strong>${esc(p.desc)}</strong><small>${esc(p.resumen ?? (p.texto || '(archivo vacío)'))}</small>${r && !r.ok ? `<span class="msg-real" title="${esc(r.mensaje)}">${esc(r.mensaje)}</span>` : ''}</td>
      <td>${insignia(p.esp, FASES[p.esp].corto)}</td>
      <td>${r ? insignia(obtenido, FASES[obtenido].corto) : '<span class="regla-ref">—</span>'}</td>
      <td><button class="btn btn-sutil btn-mini" data-cargar="${i}">Abrir</button></td>
    </tr>`;
  }).join('');

  const cuerpo = cats.map((c) => { const f = filas(c); return f ? `<div class="seccion-titulo">${esc(c)}</div><div class="tabla-contenedor" style="max-height:none"><table class="tabla"><thead><tr><th></th><th>Caso</th><th>Esperado</th><th>Obtenido</th><th></th></tr></thead><tbody>${f}</tbody></table></div>` : ''; }).join('');

  cont.innerHTML = `
    ${cabecera('Suite de pruebas', 'Casos que ejercitan cada fase del compilador, incluidos los tres casos del informe (sección 5). Cada caso se compila en modo estricto y se compara la fase de falla obtenida con la esperada.',
    `<label class="interruptor"><input type="checkbox" id="solo-fallas" ${soloFallas ? 'checked' : ''}><span class="interruptor-pista"></span><span>Solo fallidas</span></label>
     <button class="btn btn-primario" id="btn-correr">${ICONOS.play} Ejecutar ${total} pruebas</button>`)}
    <div class="pruebas-resumen">
      <svg class="progreso-anillo" viewBox="0 0 54 54"><circle class="fondo-anillo" cx="27" cy="27" r="22"/>
        <circle class="valor-anillo" cx="27" cy="27" r="22" stroke-dasharray="${circ}" stroke-dashoffset="${res ? circ * (1 - pasan / total) : circ}" style="${res && pasan < total ? 'stroke:var(--sintactico)' : ''}"/></svg>
      <div class="cifras"><strong>${res ? `${pasan} / ${total} pruebas superadas` : 'Pruebas sin ejecutar'}</strong>
        <span>${res ? `${porcentaje(pasan, total)} de éxito · ${est.pruebasMs} ms` : 'Presione “Ejecutar” para correr la suite contra compilador.py.'}</span></div>
    </div>
    ${cuerpo || vacio(ICONOS.check, 'Todas las pruebas pasan', 'No hay pruebas fallidas para mostrar.')}`;

  cont.querySelector('#btn-correr').addEventListener('click', () => acciones.correrPruebas());
  cont.querySelector('#solo-fallas').addEventListener('change', (e) => { est.pruebasSoloFallas = e.target.checked; vistaPruebas(cont, est, acciones); });
  cont.querySelectorAll('[data-cargar]').forEach((b) => b.addEventListener('click', () => {
    const p = PRUEBAS[Number(b.dataset.cargar)];
    acciones.cargarTexto(p.texto, `prueba-${Number(b.dataset.cargar) + 1}.log`);
  }));
}
const faseDe = (r) => (r.ok ? 'ok' : r.fase);

// ============================================================================
// Especificación
// ============================================================================
export function vistaEspecificacion(cont) {
  const filasTokens = Object.entries(TOKENS).filter(([k]) => k !== 'ERROR').map(([k, t]) => `
    <tr><td>${chip(k)}</td><td><span class="regex">${esc(t.regex)}</span></td><td style="font-size:12.5px;color:var(--texto-2)">${esc(t.desc)}<br><code>${esc(t.ej)}</code></td></tr>`).join('');

  cont.innerHTML = `
    ${cabecera('Especificación formal del lenguaje', 'Resumen del modelado formal del informe técnico: alfabeto, autómata, gramática libre de contexto y reglas semánticas.')}
    <div class="seccion-titulo" style="margin-top:4px">3.1 · Alfabeto Σ = Σ<sub>alfanumérico</sub> ∪ Σ<sub>símbolo</sub> ∪ Σ<sub>espacio</sub></div>
    <div class="alfabeto">
      <div class="tarjeta"><h4>Σ alfanumérico</h4><p>{0…9, A…Z, a…z}</p></div>
      <div class="tarjeta"><h4>Σ símbolo</h4><p>ASCII imprimible (32–126): terminales estructurales <code>" - [ ]</code> y caracteres de contenido <code>. &amp; ? = @ _ /</code></p></div>
      <div class="tarjeta"><h4>Σ espacio</h4><p>{' ', \\t, \\n, \\r}: delimitadores en q0; \\n separa registros.</p></div>
    </div>
    <div class="seccion-titulo">3.2 · AFD integrador M = (Q, Σ, δ, q0, F)</div>
    <div class="bnf"><span class="nt">Q</span> = {q0, q_num_0, q_num_1, q_num_2, q_num_3, q_err, q_guion, q_comillas} ∪ Q_uri ∪ Q_metodo ∪ Q_fecha ∪ Q_protocolo
<span class="nt">F</span> = {q_num_0, q_num_3, q_comillas, q_f-uri, q_f-metodo, q_f-fecha, q_f-protocolo}
<span class="op">q_num_0 → TOKEN_ENTERO · q_num_3 → TOKEN_IP · q_num_1, q_num_2 ∉ F → q_err</span></div>
    <div class="seccion-titulo">3.4 · Gramática libre de contexto (BNF)</div>
    <pre class="bnf"><span class="nt">&lt;LogFile&gt;</span>   <span class="op">::=</span> <span class="nt">&lt;LogEntry&gt;</span> <span class="nt">&lt;LogFile&gt;</span> <span class="op">|</span> <span class="eps">ε</span>
<span class="nt">&lt;LogEntry&gt;</span>  <span class="op">::=</span> TOKEN_IP TOKEN_GUION TOKEN_GUION TOKEN_FECHA
               TOKEN_COMILLAS TOKEN_METODO_HTTP TOKEN_RUTA TOKEN_PROTOCOLO
               TOKEN_COMILLAS TOKEN_ENTERO <span class="nt">&lt;SizeField&gt;</span>
<span class="nt">&lt;SizeField&gt;</span> <span class="op">::=</span> TOKEN_ENTERO <span class="op">|</span> TOKEN_GUION</pre>
    <div class="seccion-titulo">4 · Tokens y expresiones regulares</div>
    <div class="tabla-contenedor" style="max-height:none"><table class="tabla"><thead><tr><th>Token</th><th>Expresión regular</th><th>Descripción</th></tr></thead><tbody>${filasTokens}</tbody></table></div>
    <div class="seccion-titulo">2.3 · Reglas semánticas</div>
    <ol class="lista-reglas">
      <li><strong>Direcciones IPv4:</strong> ${esc(REFERENCIAS.ip)}</li>
      <li><strong>Códigos de estado:</strong> ${esc(REFERENCIAS.estado)}</li>
      <li><strong>Fechas:</strong> ${esc(REFERENCIAS.fecha)}</li>
      <li><strong>Versiones HTTP:</strong> ${esc(REFERENCIAS.protocolo)}</li>
      <li><strong>Request-Line:</strong> ${esc(REFERENCIAS.linea_peticion)}</li>
      <li><strong>Tamaño de respuesta:</strong> ${esc(REFERENCIAS.tamano)}</li>
    </ol>`;
}

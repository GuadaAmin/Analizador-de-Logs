// Datos estáticos de la interfaz: metadatos de tokens y fases, ejemplos y casos de prueba.
// Las definiciones formales replican las del informe técnico (secciones 3 y 4).

export const FASES = {
  ok: { nombre: 'Válida', corto: 'OK' },
  lexico: { nombre: 'Error léxico', corto: 'Léxico' },
  sintactico: { nombre: 'Error sintáctico', corto: 'Sintáctico' },
  semantico: { nombre: 'Error semántico', corto: 'Semántico' },
  interno: { nombre: 'Excepción no controlada', corto: 'Excepción' },
  vacia: { nombre: 'Línea vacía', corto: 'Vacía' },
};

export const TOKENS = {
  TOKEN_IP: {
    corto: 'IP', regex: String.raw`\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}`,
    desc: 'Dirección IPv4 del cliente: cuatro octetos decimales separados por puntos.', ej: '192.168.1.45',
  },
  TOKEN_GUION: {
    corto: 'GUION', regex: '-',
    desc: 'Terminal estático para identidad remota y usuario autenticado; también representa %b sin bytes.', ej: '-',
  },
  TOKEN_FECHA: {
    corto: 'FECHA', regex: String.raw`\[\d{2}/[A-Z][a-z]{2}/\d{4}:\d{2}:\d{2}:\d{2}\s[+-]\d{4}\]`,
    desc: 'Marca de tiempo entre corchetes con formato estándar de Apache.', ej: '[14/Oct/2026:13:45:01 -0300]',
  },
  TOKEN_COMILLAS: {
    corto: 'COMILLAS', regex: '"',
    desc: 'Delimitador estructural que encapsula la línea de petición HTTP.', ej: '"',
  },
  TOKEN_METODO_HTTP: {
    corto: 'METODO', regex: 'GET|POST|PUT|DELETE|HEAD|OPTIONS|PATCH|TRACE|CONNECT',
    desc: 'Palabra reservada que representa el verbo de la petición HTTP.', ej: 'GET',
  },
  TOKEN_RUTA: {
    corto: 'RUTA', regex: String.raw`/([a-zA-Z0-9\-._~:/?[\]@!$&'()*+,;=]|%[0-9a-fA-F]{2})*`,
    desc: 'Request-target en origin-form (RFC 3986). Todo % debe ir seguido de dos hexadecimales.', ej: '/api/users?id=45&sort=asc',
  },
  TOKEN_PROTOCOLO: {
    corto: 'PROTOCOLO', regex: String.raw`HTTP/\d\.\d`,
    desc: 'Firma y versión del protocolo; el semántico valida la lista blanca (1.0 y 1.1).', ej: 'HTTP/1.1',
  },
  TOKEN_ENTERO: {
    corto: 'ENTERO', regex: String.raw`\d+`,
    desc: 'Secuencia de dígitos; el parser le asigna su rol (código de estado o bytes) por posición.', ej: '200',
  },
  ERROR: {
    corto: 'ERROR', regex: '—',
    desc: 'Lexema rechazado: el AFD alcanzó el estado sumidero q_err y barrió hasta el delimitador.', ej: '192.168.@.1',
  },
};

// Secuencia de terminales exigida por <LogEntry> (sección 3.4 del informe).
export const GRAMATICA_ENTRY = [
  { tipo: 'TOKEN_IP', rol: 'host remoto' },
  { tipo: 'TOKEN_GUION', rol: 'identidad remota' },
  { tipo: 'TOKEN_GUION', rol: 'usuario autenticado' },
  { tipo: 'TOKEN_FECHA', rol: 'marca de tiempo' },
  { tipo: 'TOKEN_COMILLAS', rol: 'apertura de petición' },
  { tipo: 'TOKEN_METODO_HTTP', rol: 'método' },
  { tipo: 'TOKEN_RUTA', rol: 'request-target' },
  { tipo: 'TOKEN_PROTOCOLO', rol: 'versión' },
  { tipo: 'TOKEN_COMILLAS', rol: 'cierre de petición' },
  { tipo: 'TOKEN_ENTERO', rol: 'código de estado' },
  { tipo: 'SIZE', rol: 'tamaño %b' },
];

// ----------------------------------------------------------------------------
// Generador determinístico de logs de ejemplo
// ----------------------------------------------------------------------------
function prng(semilla) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MESES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const p2 = (n) => String(n).padStart(2, '0');

export function fechaCLF(d, offset = '-0300') {
  return `[${p2(d.getUTCDate())}/${MESES[d.getUTCMonth()]}/${d.getUTCFullYear()}:${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())} ${offset}]`;
}

export function lineaCLF({ ip = '192.168.1.1', id = '-', usr = '-', fecha = '[14/Oct/2026:13:45:01 -0300]', metodo = 'GET', ruta = '/index.html', proto = 'HTTP/1.1', estado = '200', bytes = '1043' } = {}) {
  return `${ip} ${id} ${usr} ${fecha} "${metodo} ${ruta} ${proto}" ${estado} ${bytes}`;
}

function elegir(r, pares) {
  const total = pares.reduce((s, [, p]) => s + p, 0);
  let x = r() * total;
  for (const [v, p] of pares) { if ((x -= p) <= 0) return v; }
  return pares[0][0];
}

export function generarTrafico(n = 60, semilla = 7) {
  const r = prng(semilla);
  const ips = ['192.168.1.45', '10.0.0.12', '172.16.4.201', '200.45.12.9', '181.30.77.142', '8.8.4.4', '190.220.3.18', '45.79.112.3', '201.212.9.77', '66.249.66.1'];
  const rutas = [
    ['/', 8], ['/index.html', 6], ['/api/users?id=45&sort=asc', 5], ['/api/productos', 5], ['/login', 4],
    ['/static/css/app.css', 6], ['/static/js/main.js', 6], ['/img/logo.png', 4], ['/buscar?q=compiladores%20UNSTA', 3],
    ['/api/pedidos/1024', 3], ['/admin', 1], ['/favicon.ico', 4], ['/docs/informe%5Ffinal.pdf', 2], ['/api/v1/sesion', 2],
  ];
  const metodos = [['GET', 70], ['POST', 14], ['PUT', 4], ['DELETE', 3], ['HEAD', 4], ['OPTIONS', 2], ['PATCH', 3]];
  const estados = [['200', 62], ['304', 10], ['301', 4], ['201', 5], ['404', 9], ['403', 2], ['401', 3], ['500', 3], ['503', 1], ['204', 2]];
  let t = Date.UTC(2026, 9, 14, 8, 2, 11);
  const lineas = [];
  for (let i = 0; i < n; i++) {
    t += Math.floor(r() * 18 * 60 * 1000) + 2000;
    const metodo = elegir(r, metodos);
    const estado = metodo === 'POST' && r() < .5 ? '201' : elegir(r, estados);
    const sinCuerpo = estado === '304' || estado === '204' || metodo === 'HEAD';
    lineas.push(lineaCLF({
      ip: ips[Math.floor(r() * ips.length)],
      fecha: fechaCLF(new Date(t)),
      metodo,
      ruta: elegir(r, rutas),
      proto: r() < .85 ? 'HTTP/1.1' : 'HTTP/1.0',
      estado,
      bytes: sinCuerpo ? '-' : String(Math.floor(200 + r() ** 2 * 48000)),
    }));
  }
  return lineas;
}

function traficoConErrores() {
  const l = generarTrafico(36, 21);
  const insertar = [
    [3, lineaCLF({ ip: '192.168.@.1', bytes: '-' })],
    [7, lineaCLF({ ip: '256.10.0.1', estado: '200' })],
    [11, '10.0.0.12 - [14/Oct/2026:10:12:44 -0300] "GET /index.html HTTP/1.1" 200 512'],
    [15, lineaCLF({ fecha: '[29/Feb/2026:09:00:00 -0300]' })],
    [19, lineaCLF({ ruta: '/buscar?q=%ZZ' })],
    [23, lineaCLF({ proto: 'HTTP/2.0' })],
    [27, lineaCLF({ estado: '999' })],
    [30, lineaCLF({ metodo: 'FETCH' })],
    [33, lineaCLF({ fecha: '[14/Oct/2026:13:45:01 +1500]' })],
  ];
  for (const [i, v] of insertar) l.splice(i, 0, v);
  return l;
}

export const EJEMPLOS = [
  { grupo: 'Datasets' },
  { id: 'logfile', titulo: 'LogFile.txt', sub: 'Archivo original del proyecto', texto: () => lineaCLF({ fecha: '[14/Oct/2026:13:45:01 +1350]', ruta: '/api/data%40', bytes: '13000' }) },
  { id: 'trafico', titulo: 'Tráfico válido', sub: '80 registros sintéticos de un día', texto: () => generarTrafico(80).join('\n') },
  { id: 'mixto', titulo: 'Tráfico con errores', sub: 'Registros mezclados con fallas de las tres fases', texto: () => traficoConErrores().join('\n') },
  { grupo: 'Casos del informe (sección 5)' },
  { id: 'caso1', titulo: 'Caso 1 · Error léxico', sub: '192.168.@.1 — carácter sin transición en el AFD', texto: () => lineaCLF({ ip: '192.168.@.1', bytes: '-' }) },
  { id: 'caso2', titulo: 'Caso 2 · Error sintáctico', sub: 'Falta el segundo TOKEN_GUION', texto: () => '192.168.1.1 - [14/Oct/2026:13:45:01 -0300] "GET /index.html HTTP/1.1" 200 -' },
  { id: 'caso3', titulo: 'Caso 3 · Error semántico', sub: 'Código de estado 999 fuera de RFC 9110', texto: () => lineaCLF({ estado: '999', bytes: '1000' }) },
  { grupo: 'Casos borde' },
  {
    id: 'fechas', titulo: 'Calendario y husos horarios', sub: 'Bisiestos, límites UTC-12 / UTC+14', texto: () => [
      lineaCLF({ fecha: '[29/Feb/2024:00:00:00 +0000]' }),
      lineaCLF({ fecha: '[29/Feb/2000:23:59:59 -1200]' }),
      lineaCLF({ fecha: '[31/Dec/2026:12:30:00 +1400]' }),
      lineaCLF({ fecha: '[29/Feb/1900:10:00:00 -0300]' }),
      lineaCLF({ fecha: '[31/Apr/2026:10:00:00 -0300]' }),
      lineaCLF({ fecha: '[14/Oct/2026:24:00:00 -0300]' }),
      lineaCLF({ fecha: '[14/Oct/2026:10:00:00 -1201]' }),
      lineaCLF({ fecha: '[14/Oct/2026:10:00:00 +0560]' }),
    ].join('\n'),
  },
  {
    id: 'rfc3986', titulo: 'URIs y percent-encoding', sub: 'Validación léxica RFC 3986', texto: () => [
      lineaCLF({ ruta: '/buscar?q=hola%20mundo&lang=es' }),
      lineaCLF({ ruta: "/api/items;v=2/(abc)*+,!$'@:~" }),
      lineaCLF({ ruta: '/docs/%E2%9C%93' }),
      lineaCLF({ ruta: '/a%2G' }),
      lineaCLF({ ruta: '/a%4' }),
      lineaCLF({ ruta: '/archivo{1}' }),
      lineaCLF({ ruta: '/pagina#seccion' }),
    ].join('\n'),
  },
  {
    id: 'ip', titulo: 'Direcciones IPv4', sub: 'Rangos, ceros a la izquierda, puntos', texto: () => [
      lineaCLF({ ip: '0.0.0.0' }),
      lineaCLF({ ip: '255.255.255.255' }),
      lineaCLF({ ip: '192.168.001.1' }),
      lineaCLF({ ip: '300.1.1.1' }),
      lineaCLF({ ip: '192.168.1' }),
      lineaCLF({ ip: '1.2.3.4.5' }),
    ].join('\n'),
  },
];

// ----------------------------------------------------------------------------
// Suite de pruebas: cada caso declara la fase en la que el compilador debe fallar.
// ----------------------------------------------------------------------------
const largo = '/' + 'a'.repeat(8200);
export const PRUEBAS = [
  { cat: 'Válidos', desc: 'Registro CLF canónico', esp: 'ok', texto: lineaCLF() },
  { cat: 'Válidos', desc: 'Archivo vacío (derivación <LogFile> → ε)', esp: 'ok', texto: '' },
  { cat: 'Válidos', desc: 'Tamaño %b representado con guion', esp: 'ok', texto: lineaCLF({ bytes: '-' }) },
  { cat: 'Válidos', desc: 'Múltiples registros (recursividad por la derecha)', esp: 'ok', texto: generarTrafico(5, 3).join('\n') },
  { cat: 'Válidos', desc: 'Método HEAD vs. prefijo HTTP (lookahead)', esp: 'ok', texto: lineaCLF({ metodo: 'HEAD', bytes: '-' }) },
  { cat: 'Válidos', desc: 'Código no registrado en IANA (499)', esp: 'ok', texto: lineaCLF({ estado: '499' }) },
  { cat: 'Válidos', desc: '29 de febrero en año bisiesto (2024)', esp: 'ok', texto: lineaCLF({ fecha: '[29/Feb/2024:10:00:00 -0300]' }) },
  { cat: 'Válidos', desc: 'Año secular bisiesto (2000)', esp: 'ok', texto: lineaCLF({ fecha: '[29/Feb/2000:10:00:00 -0300]' }) },
  { cat: 'Válidos', desc: 'Huso horario límite UTC+14:00', esp: 'ok', texto: lineaCLF({ fecha: '[14/Oct/2026:10:00:00 +1400]' }) },
  { cat: 'Válidos', desc: 'Huso horario límite UTC-12:00', esp: 'ok', texto: lineaCLF({ fecha: '[14/Oct/2026:10:00:00 -1200]' }) },
  { cat: 'Válidos', desc: 'Percent-encoding válido (%20)', esp: 'ok', texto: lineaCLF({ ruta: '/buscar?q=a%20b' }) },

  { cat: 'Léxicos', desc: 'Caso 1 del informe: @ dentro de la IP', esp: 'lexico', texto: lineaCLF({ ip: '192.168.@.1', bytes: '-' }) },
  { cat: 'Léxicos', desc: 'IP con dos puntos (q_num_2 ∉ F)', esp: 'lexico', texto: lineaCLF({ ip: '192.168.1' }) },
  { cat: 'Léxicos', desc: 'Método inexistente (FETCH)', esp: 'lexico', texto: lineaCLF({ metodo: 'FETCH' }) },
  { cat: 'Léxicos', desc: 'Método en minúsculas', esp: 'lexico', texto: lineaCLF({ metodo: 'get' }) },
  { cat: 'Léxicos', desc: 'Percent-encoding con hex inválido (%2G)', esp: 'lexico', texto: lineaCLF({ ruta: '/a%2G' }) },
  { cat: 'Léxicos', desc: 'Carácter ilegal en URI ({)', esp: 'lexico', texto: lineaCLF({ ruta: '/a{b}' }) },
  { cat: 'Léxicos', desc: 'Fragmento # excluido de la ruta', esp: 'lexico', texto: lineaCLF({ ruta: '/a#b' }) },
  { cat: 'Léxicos', desc: 'Mes en minúsculas ([A-Z][a-z]{2})', esp: 'lexico', texto: lineaCLF({ fecha: '[14/oct/2026:13:45:01 -0300]' }) },
  { cat: 'Léxicos', desc: 'Protocolo sin punto (HTTP/11)', esp: 'lexico', texto: lineaCLF({ proto: 'HTTP/11' }) },

  { cat: 'Sintácticos', desc: 'Caso 2 del informe: falta un guion', esp: 'sintactico', texto: '192.168.1.1 - [14/Oct/2026:13:45:01 -0300] "GET /index.html HTTP/1.1" 200 -' },
  { cat: 'Sintácticos', desc: 'Falta comilla de cierre', esp: 'sintactico', texto: '192.168.1.1 - - [14/Oct/2026:13:45:01 -0300] "GET /index.html HTTP/1.1 200 512' },
  { cat: 'Sintácticos', desc: 'Falta el campo tamaño', esp: 'sintactico', texto: '192.168.1.1 - - [14/Oct/2026:13:45:01 -0300] "GET /index.html HTTP/1.1" 200\n' + lineaCLF() },
  { cat: 'Sintácticos', desc: 'Campos en orden incorrecto', esp: 'sintactico', texto: '- - 192.168.1.1 [14/Oct/2026:13:45:01 -0300] "GET /index.html HTTP/1.1" 200 512' },
  { cat: 'Sintácticos', desc: 'Petición sin método', esp: 'sintactico', texto: '192.168.1.1 - - [14/Oct/2026:13:45:01 -0300] "/index.html HTTP/1.1" 200 512' },

  { cat: 'Semánticos', desc: 'Caso 3 del informe: estado 999', esp: 'semantico', texto: lineaCLF({ estado: '999', bytes: '1000' }) },
  { cat: 'Semánticos', desc: 'Octeto fuera de rango (256)', esp: 'semantico', texto: lineaCLF({ ip: '192.168.1.256' }) },
  { cat: 'Semánticos', desc: 'Ceros a la izquierda en la IP', esp: 'semantico', texto: lineaCLF({ ip: '192.168.01.1' }) },
  { cat: 'Semánticos', desc: '29 de febrero en año no bisiesto', esp: 'semantico', texto: lineaCLF({ fecha: '[29/Feb/2025:10:00:00 -0300]' }) },
  { cat: 'Semánticos', desc: 'Año secular no bisiesto (1900)', esp: 'semantico', texto: lineaCLF({ fecha: '[29/Feb/1900:10:00:00 -0300]' }) },
  { cat: 'Semánticos', desc: 'Mes inexistente (Abc)', esp: 'semantico', texto: lineaCLF({ fecha: '[14/Abc/2026:10:00:00 -0300]' }) },
  { cat: 'Semánticos', desc: 'Hora 24', esp: 'semantico', texto: lineaCLF({ fecha: '[14/Oct/2026:24:00:00 -0300]' }) },
  { cat: 'Semánticos', desc: 'Huso horario +1500 (fuera de la Tierra)', esp: 'semantico', texto: lineaCLF({ fecha: '[14/Oct/2026:10:00:00 +1500]' }) },
  { cat: 'Semánticos', desc: 'Minutos del huso > 59 (+0560)', esp: 'semantico', texto: lineaCLF({ fecha: '[14/Oct/2026:10:00:00 +0560]' }) },
  { cat: 'Semánticos', desc: 'Protocolo HTTP/2.0 fuera de la lista blanca', esp: 'semantico', texto: lineaCLF({ proto: 'HTTP/2.0' }) },
  { cat: 'Semánticos', desc: 'Código de estado 099', esp: 'semantico', texto: lineaCLF({ estado: '099' }) },
  { cat: 'Semánticos', desc: 'Tamaño de respuesta 0', esp: 'semantico', texto: lineaCLF({ bytes: '0' }) },
  { cat: 'Semánticos', desc: 'Request-Line > 8190 bytes (LimitRequestLine)', esp: 'semantico', texto: lineaCLF({ ruta: largo }), resumen: '"GET /aaaa…(8200 caracteres) HTTP/1.1"' },
];

"""
Servidor de la interfaz web del Analizador de Logs (CLF).

Expone el compilador real (compilador.py) a través de una pequeña API HTTP
construida solo con la biblioteca estándar de Python, y sirve la interfaz
gráfica ubicada en la carpeta ./web.

Uso:
    python servidor.py              # abre el navegador en http://127.0.0.1:8000
    python servidor.py --puerto 9000 --sin-navegador
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import threading
import time
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

from compilador import Lexer, Parser, SemanticAnalyzer, Token, TokenType

BASE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.join(BASE, "web")

MAX_BYTES = 4 * 1024 * 1024      # Tamaño máximo de entrada aceptado
MAX_TOKENS = 25_000              # Tope de tokens devueltos a la interfaz
MAX_LINEAS = 8_000               # Tope de líneas con diagnóstico detallado

# Orden en que SemanticAnalyzer.analizar_log_entry aplica sus reglas,
# junto con el índice del token sobre el que recae cada una.
REGLAS_SEMANTICAS = [
    ("ip", "Dirección IPv4", 0),
    ("fecha", "Fecha y huso horario", 3),
    ("linea_peticion", "Longitud de la Request-Line", 6),
    ("protocolo", "Versión del protocolo", 7),
    ("estado", "Código de estado HTTP", 9),
    ("tamano", "Tamaño de respuesta", 10),
]

MESES = {"Jan": 1, "Feb": 2, "Mar": 3, "Apr": 4, "May": 5, "Jun": 6,
         "Jul": 7, "Aug": 8, "Sep": 9, "Oct": 10, "Nov": 11, "Dec": 12}


# ----------------------------------------------------------------------------
# Utilidades
# ----------------------------------------------------------------------------
def token_a_dict(t: Token) -> dict:
    return {"tipo": t.tipo.name, "lexema": t.lexema, "linea": t.linea, "columna": t.columna}


def clasificar_error(exc: Exception) -> str:
    """Determina la fase del compilador que originó la excepción."""
    msg = str(exc)
    if isinstance(exc, SyntaxError):
        return "sintactico"
    if msg.startswith("Error Léxico"):
        return "lexico"
    if msg.startswith("Error Semántico"):
        return "semantico"
    return "interno"


def mensaje_error(exc: Exception) -> str:
    if clasificar_error(exc) == "interno":
        return f"Excepción no controlada ({type(exc).__name__}): {exc}"
    return str(exc)


class ParserInstrumentado(Parser):
    """Parser del compilador que además registra los tokens consumidos de la
    entrada en curso, para reconstruir el árbol de derivación parcial."""

    def __init__(self, lexer: Lexer):
        self.entrada_actual: list[Token] = []
        super().__init__(lexer)

    def parse_log_entry(self) -> list[Token]:
        self.entrada_actual = []
        return super().parse_log_entry()

    def consumir_y_retornar(self, tipo_esperado: TokenType) -> Token:
        token = super().consumir_y_retornar(tipo_esperado)
        self.entrada_actual.append(token)
        return token


# ----------------------------------------------------------------------------
# Fases
# ----------------------------------------------------------------------------
def tokenizar(texto: str) -> tuple[list[dict], bool]:
    """Flujo completo de tokens emitidos por el analizador léxico."""
    lexer = Lexer(texto)
    tokens: list[dict] = []
    while True:
        t = lexer.obtener_siguiente_token()
        if t.tipo == TokenType.EOF:
            return tokens, False
        tokens.append(token_a_dict(t))
        if len(tokens) >= MAX_TOKENS:
            return tokens, True


def compilar_estricto(texto: str) -> dict:
    """Réplica exacta del flujo de main() de compilador.py: primero se deriva
    <LogFile> completo y luego se aplica el análisis semántico registro a registro."""
    parser = Parser(Lexer(texto))
    try:
        arbol = parser.parse_log_file()
        semantico = SemanticAnalyzer()
        for registro in arbol:
            semantico.analizar_log_entry(registro)
        return {
            "ok": True,
            "fase": None,
            "registros": len(arbol),
            "mensaje": f"Análisis exitoso. Se procesaron {len(arbol)} registros válidos.",
        }
    except Exception as exc:  # noqa: BLE001 - se reporta cualquier fallo
        return {"ok": False, "fase": clasificar_error(exc), "registros": None, "mensaje": mensaje_error(exc)}


def chequear_reglas(tokens: list[Token]) -> list[dict]:
    """Ejecuta cada regla semántica del compilador de forma aislada."""
    sem = SemanticAnalyzer()
    llamadas = {
        "ip": lambda: sem._validar_ip(tokens[0]),
        "fecha": lambda: sem._validar_fecha(tokens[3]),
        "linea_peticion": lambda: sem._validar_linea_peticion(tokens[5], tokens[6], tokens[7]),
        "protocolo": lambda: sem._validar_protocolo(tokens[7]),
        "estado": lambda: sem._validar_estado(tokens[9]),
        "tamano": lambda: sem._validar_tamano(tokens[10]),
    }
    reglas = []
    for clave, nombre, idx in REGLAS_SEMANTICAS:
        try:
            llamadas[clave]()
            reglas.append({"clave": clave, "nombre": nombre, "ok": True, "mensaje": None, "token": idx})
        except Exception as exc:  # noqa: BLE001
            reglas.append({"clave": clave, "nombre": nombre, "ok": False,
                           "mensaje": mensaje_error(exc), "token": idx})
    return reglas


def detalle_semantico(tokens: list[Token]) -> dict:
    """Valores interpretados que la interfaz muestra junto a cada regla."""
    d: dict = {}
    try:
        d["octetos"] = tokens[0].lexema.split(".")
    except Exception:  # noqa: BLE001
        pass
    try:
        f = tokens[3].lexema
        anio = int(f[8:12])
        mes = MESES.get(f[4:7])
        bisiesto = (anio % 4 == 0 and anio % 100 != 0) or (anio % 400 == 0)
        dias = [0, 31, 29 if bisiesto else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
        signo = -1 if f[22] == "-" else 1
        d["fecha"] = {
            "dia": int(f[1:3]), "mes": f[4:7], "mesNumero": mes, "anio": anio,
            "hora": int(f[13:15]), "minuto": int(f[16:18]), "segundo": int(f[19:21]),
            "bisiesto": bisiesto, "diasDelMes": dias[mes] if mes else None,
            "offset": f[22:27], "offsetMinutos": signo * (int(f[23:25]) * 60 + int(f[25:27])),
        }
    except Exception:  # noqa: BLE001
        pass
    try:
        d["requestLine"] = len(tokens[5].lexema) + 1 + len(tokens[6].lexema) + 1 + len(tokens[7].lexema)
    except Exception:  # noqa: BLE001
        pass
    return d


def campos_registro(tokens: list[Token]) -> dict:
    t = tokens
    return {
        "ip": t[0].lexema, "fecha": t[3].lexema, "metodo": t[5].lexema, "ruta": t[6].lexema,
        "protocolo": t[7].lexema, "estado": t[9].lexema,
        "tamano": None if t[10].tipo == TokenType.TOKEN_GUION else t[10].lexema,
    }


def analizar_linea(numero: int, texto: str) -> dict:
    """Diagnóstico independiente de una línea: se ejecuta el pipeline completo
    del compilador sobre ella para localizar la fase exacta de cada fallo."""
    resultado = {"linea": numero, "texto": texto.rstrip("\r"), "estado": "ok", "mensaje": None,
                 "entradas": [], "parcial": None, "tokenError": None}
    if not texto.strip():
        resultado["estado"] = "vacia"
        return resultado

    lexer = Lexer(texto)
    lexer.linea = numero  # Alinea la numeración con la del archivo completo
    parser = ParserInstrumentado(lexer)
    semantico = SemanticAnalyzer()

    try:
        while parser.token_actual.tipo != TokenType.EOF:
            tokens = parser.parse_log_entry()
            entrada = {"tokens": [token_a_dict(t) for t in tokens],
                       "reglas": chequear_reglas(tokens),
                       "detalle": detalle_semantico(tokens),
                       "campos": campos_registro(tokens)}
            resultado["entradas"].append(entrada)
            try:
                semantico.analizar_log_entry(tokens)
            except Exception:
                regla = next(r for r in entrada["reglas"] if not r["ok"])
                tok = tokens[regla["token"]]
                resultado["tokenError"] = {"columna": tok.columna, "longitud": len(tok.lexema)}
                raise
    except Exception as exc:  # noqa: BLE001
        fase = clasificar_error(exc)
        resultado["estado"] = fase
        resultado["mensaje"] = mensaje_error(exc)
        if fase in ("lexico", "sintactico"):
            t = parser.token_actual
            resultado["parcial"] = {
                "tokens": [token_a_dict(x) for x in parser.entrada_actual],
                "encontrado": token_a_dict(t),
            }
            resultado["tokenError"] = {"columna": t.columna, "longitud": max(1, len(t.lexema))}
    return resultado


def analizar(texto: str) -> dict:
    inicio = time.perf_counter()
    tokens, tokens_truncados = tokenizar(texto)
    t_lex = time.perf_counter()
    estricto = compilar_estricto(texto)
    t_comp = time.perf_counter()

    lineas_texto = texto.split("\n")
    lineas = [analizar_linea(i + 1, l) for i, l in enumerate(lineas_texto[:MAX_LINEAS])]
    fin = time.perf_counter()

    return {
        "estricto": estricto,
        "tokens": tokens,
        "tokensTruncados": tokens_truncados,
        "lineas": lineas,
        "lineasTruncadas": len(lineas_texto) > MAX_LINEAS,
        "metricas": {
            "caracteres": len(texto),
            "lineas": len(lineas_texto),
            "msLexico": round((t_lex - inicio) * 1000, 2),
            "msCompilacion": round((t_comp - t_lex) * 1000, 2),
            "msTotal": round((fin - inicio) * 1000, 2),
        },
    }


# ----------------------------------------------------------------------------
# HTTP
# ----------------------------------------------------------------------------
class Manejador(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WEB, **kwargs)

    def log_message(self, formato, *args):  # Consola silenciosa salvo errores
        if args and str(args[1]).startswith(("4", "5")):
            super().log_message(formato, *args)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _json(self, codigo: int, cuerpo: dict):
        datos = json.dumps(cuerpo, ensure_ascii=False).encode("utf-8")
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(datos)))
        self.end_headers()
        self.wfile.write(datos)

    def _leer_json(self) -> dict | None:
        largo = int(self.headers.get("Content-Length") or 0)
        if largo > MAX_BYTES * 2:
            self._json(413, {"error": "La entrada supera el tamaño máximo permitido (4 MB)."})
            return None
        try:
            return json.loads(self.rfile.read(largo).decode("utf-8") or "{}")
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._json(400, {"error": "Cuerpo JSON inválido."})
            return None

    def do_GET(self):
        if self.path == "/api/estado":
            return self._json(200, {"ok": True, "python": sys.version.split()[0],
                                    "compilador": "compilador.py"})
        return super().do_GET()

    def do_POST(self):
        cuerpo = self._leer_json()
        if cuerpo is None:
            return
        if self.path == "/api/analizar":
            texto = cuerpo.get("texto", "")
            if not isinstance(texto, str):
                return self._json(400, {"error": "El campo 'texto' debe ser una cadena."})
            if len(texto.encode("utf-8")) > MAX_BYTES:
                return self._json(413, {"error": "La entrada supera el tamaño máximo permitido (4 MB)."})
            return self._json(200, analizar(texto))
        if self.path == "/api/lote":
            casos = cuerpo.get("casos", [])
            if not isinstance(casos, list) or len(casos) > 200:
                return self._json(400, {"error": "Lista de casos inválida."})
            return self._json(200, {"resultados": [compilar_estricto(str(c)) for c in casos]})
        self._json(404, {"error": "Ruta no encontrada."})


def main():
    ap = argparse.ArgumentParser(description="Interfaz web del Analizador de Logs CLF")
    ap.add_argument("--puerto", type=int, default=8000)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--sin-navegador", action="store_true")
    args = ap.parse_args()

    servidor = None
    for puerto in range(args.puerto, args.puerto + 20):
        try:
            servidor = ThreadingHTTPServer((args.host, puerto), Manejador)
            break
        except OSError:
            continue
    if servidor is None:
        sys.exit("No se encontró un puerto libre.")

    url = f"http://{args.host}:{servidor.server_address[1]}/"
    print(f"Analizador de Logs CLF  ·  interfaz disponible en {url}")
    print("Presione Ctrl+C para detener el servidor.")
    if not args.sin_navegador:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido.")
    finally:
        servidor.server_close()


if __name__ == "__main__":
    main()

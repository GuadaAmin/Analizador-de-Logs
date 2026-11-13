from enum import Enum, auto
from dataclasses import dataclass

class TokenType(Enum):
    TOKEN_IP = auto()
    TOKEN_FECHA = auto()
    TOKEN_METODO_HTTP = auto()
    TOKEN_RUTA = auto()
    TOKEN_ESTADO = auto()
    EOF = auto()      # Fin de archivo
    ERROR = auto()    # Símbolo no reconocido

@dataclass
class Token:
    tipo: TokenType
    lexema: str
    linea: int
    columna: int

    def __str__(self):
        return f"<{self.tipo.name}, '{self.lexema}', Ln: {self.linea}, Col: {self.columna}>"

# Analizador léxico (Escáner)
class Lexer:
    def __init__(self, entrada: str):
        self.entrada = entrada
        self.posicion = 0
        self.linea = 1
        self.columna = 1
        self.caracter_actual = self.entrada[0] if self.entrada else None

    def avanzar(self):
        """Mueve el cabezal de lectura un carácter hacia adelante (transición básica)."""
        if self.caracter_actual == '\n':
            self.linea += 1
            self.columna = 0
        
        self.posicion += 1
        self.columna += 1
        
        if self.posicion >= len(self.entrada):
            self.caracter_actual = None  # EOF
        else:
            self.caracter_actual = self.entrada[self.posicion]

    def saltar_espacios(self):
        """Consume los caracteres pertenecientes a Σ_espacio."""
        while self.caracter_actual is not None and self.caracter_actual.isspace():
            self.avanzar()

    def obtener_siguiente_token(self) -> Token:
        while self.caracter_actual is not None:
            if self.caracter_actual.isspace():
                self.saltar_espacios()
                continue
                
            if self.caracter_actual == '[':
                return self._leer_fecha()
                
            if self.caracter_actual == '/':
                return self._leer_ruta()
                
            if self.caracter_actual.isalpha():
                return self._leer_metodo()
                
            if self.caracter_actual.isdigit():
                return self._leer_ip_o_estado()
                
            # Intercepción de carácter inválido aislado: agrupa todo hasta el espacio
            linea_err, col_err = self.linea, self.columna
            lexema_err = self._consumir_hasta_espacio("")
            return Token(TokenType.ERROR, lexema_err, linea_err, col_err)

        return Token(TokenType.EOF, "", self.linea, self.columna)

    def _leer_ip_o_estado(self) -> Token:
        lexema = ""
        linea_inicio, col_inicio = self.linea, self.columna
        cantidad_puntos = 0
        
        while self.caracter_actual is not None and (self.caracter_actual.isdigit() or self.caracter_actual == '.'):
            if self.caracter_actual == '.':
                cantidad_puntos += 1
            lexema += self.caracter_actual
            self.avanzar()
            
        # Si el autómata se interrumpió por un carácter que no es espacio (ej: '/' en "14/")
        if self.caracter_actual is not None and not self.caracter_actual.isspace():
            lexema = self._consumir_hasta_espacio(lexema)
            return Token(TokenType.ERROR, lexema, linea_inicio, col_inicio)

        if cantidad_puntos == 0:
            if len(lexema) == 3:
                return Token(TokenType.TOKEN_ESTADO, lexema, linea_inicio, col_inicio)
            else:
                return Token(TokenType.ERROR, lexema, linea_inicio, col_inicio)
        elif cantidad_puntos == 3:
            return Token(TokenType.TOKEN_IP, lexema, linea_inicio, col_inicio)
        else:
            return Token(TokenType.ERROR, lexema, linea_inicio, col_inicio)

    def _leer_fecha(self) -> Token:
        lexema = ""
        linea_inicio = self.linea
        col_inicio = self.columna
        
        # El AFD transita leyendo todo hasta encontrar el cierre ']' o el fin de archivo
        while self.caracter_actual is not None and self.caracter_actual != ']':
            lexema += self.caracter_actual
            self.avanzar()
            
        # Si encontramos el corchete de cierre, lo anexamos y avanzamos
        if self.caracter_actual == ']':
            lexema += self.caracter_actual
            self.avanzar()
        
        # Validación Léxica Estructural (reemplazo manual de la expresión regular)
        # Formato esperado: [DD/Mes/AAAA:HH:MM:SS] -> Exactamente 22 caracteres
        if len(lexema) == 22:
            # 1. Validar los símbolos estáticos en sus posiciones exactas del autómata
            if (lexema[0] == '[' and lexema[3] == '/' and lexema[7] == '/' and 
                lexema[12] == ':' and lexema[15] == ':' and lexema[18] == ':' and 
                lexema[21] == ']'):
                
                # 2. Extraer los bloques que varían
                bloque_digitos = (lexema[1:3] + lexema[8:12] + 
                                  lexema[13:15] + lexema[16:18] + lexema[19:21])
                mes = lexema[4:7]
                
                # 3. Verificar que los tipos de caracteres coincidan (\d y [A-Z][a-z]{2})
                if (bloque_digitos.isdigit() and 
                    mes.isalpha() and 
                    mes[0].isupper() and 
                    mes[1:].islower()):
                    
                    # Léxicamente válido. Si la fecha es "32/Feb/2026", pasará por aquí
                    # y será rechazada más adelante por el Analizador Semántico.
                    return Token(TokenType.TOKEN_FECHA, lexema, linea_inicio, col_inicio)
                    
        # Si no tiene 22 caracteres, o le faltan las barras/puntos, es un Error Léxico
        return Token(TokenType.ERROR, lexema, linea_inicio, col_inicio)

    def _leer_metodo(self) -> Token:
        lexema = ""
        linea_inicio = self.linea
        col_inicio = self.columna
        
        # El AFD transita leyendo todo el bloque hasta chocar con un espacio (delimitador natural)
        while self.caracter_actual is not None and not self.caracter_actual.isspace():
            lexema += self.caracter_actual
            self.avanzar()
            
        metodos_validos = {"GET", "POST", "PUT", "DELETE", "HEAD"}
        
        # Si lee "GET123", el lexema será "GET123", no existirá en el conjunto y lanzará Error.
        if lexema in metodos_validos:
            return Token(TokenType.TOKEN_METODO_HTTP, lexema, linea_inicio, col_inicio)
        else:
            return Token(TokenType.ERROR, lexema, linea_inicio, col_inicio)

    def _leer_ruta(self) -> Token:
        lexema = ""
        linea_inicio = self.linea
        col_inicio = self.columna
        
        # El AFD consume caracteres iterativamente hasta chocar con un espacio o EOF
        while self.caracter_actual is not None and not self.caracter_actual.isspace():
            lexema += self.caracter_actual
            self.avanzar()
            
        # Estructuralmente, si empezó con '/' y terminó en espacio, el léxico lo acepta.
        # El límite de longitud (2048) se validará en la etapa semántica.
        return Token(TokenType.TOKEN_RUTA, lexema, linea_inicio, col_inicio)

    def _consumir_hasta_espacio(self, lexema_parcial: str) -> str:
        """Consume y anexa caracteres hasta encontrar el delimitador de espacio o EOF."""
        while self.caracter_actual is not None and not self.caracter_actual.isspace():
            lexema_parcial += self.caracter_actual
            self.avanzar()
        return lexema_parcial

# Analizador sintáctico (Parser)
class Parser:
    def __init__(self, lexer: Lexer):
        self.lexer = lexer
        self.token_actual = self.lexer.obtener_siguiente_token()

    def _error_sintactico(self, tipo_esperado: TokenType):
        raise SyntaxError(
            f"Error Sintáctico (Ln {self.token_actual.linea}, Col {self.token_actual.columna}): "
            f"Se esperaba {tipo_esperado.name}, pero se encontró {self.token_actual.tipo.name} ('{self.token_actual.lexema}')."
        )

    def consumir_y_retornar(self, tipo_esperado: TokenType) -> Token:
        # 1. Intercepción de Errores Léxicos propagados bajo demanda
        if self.token_actual.tipo == TokenType.ERROR:
            raise ValueError(
                f"Error Léxico (Ln {self.token_actual.linea}, Col {self.token_actual.columna}): "
                f"Símbolo o lexema inválido '{self.token_actual.lexema}'"
            )

        # 2. Validación de la GLC
        if self.token_actual.tipo == tipo_esperado:
            token_capturado = self.token_actual
            self.token_actual = self.lexer.obtener_siguiente_token()
            return token_capturado
        else:
            self._error_sintactico(tipo_esperado)

    def parse_log_entry(self) -> list[Token]:
        tokens_entry = []
        tokens_entry.append(self.consumir_y_retornar(TokenType.TOKEN_IP))
        tokens_entry.append(self.consumir_y_retornar(TokenType.TOKEN_FECHA))
        tokens_entry.append(self.consumir_y_retornar(TokenType.TOKEN_METODO_HTTP))
        tokens_entry.append(self.consumir_y_retornar(TokenType.TOKEN_RUTA))
        tokens_entry.append(self.consumir_y_retornar(TokenType.TOKEN_ESTADO))
        return tokens_entry

# Analizador semántico
class SemanticAnalyzer:
    def analizar_log_entry(self, tokens: list[Token]):
        """
        Recibe una secuencia sintácticamente válida (garantizada por la GLC)
        y aplica las restricciones del dominio de negocio.
        Orden posicional garantizado: [IP, FECHA, METODO, RUTA, ESTADO]
        """
        token_ip = tokens[0]
        token_fecha = tokens[1]
        token_ruta = tokens[3]
        token_estado = tokens[4]
        
        self._validar_ip(token_ip)
        self._validar_fecha(token_fecha)
        self._validar_ruta(token_ruta)
        self._validar_estado(token_estado)
        # TOKEN_METODO_HTTP no requiere validación semántica adicional.

    def _validar_ip(self, token: Token):
        octetos = token.lexema.split('.')
        for octeto in octetos:
            if not (0 <= int(octeto) <= 255):
                raise ValueError(
                    f"Error Semántico (Ln {token.linea}): El octeto '{octeto}' de la IP '{token.lexema}' "
                    f"está fuera del límite físico admitido (0-255)."
                )

    def _validar_estado(self, token: Token):
        if not (100 <= int(token.lexema) <= 599):
            raise ValueError(
                f"Error Semántico (Ln {token.linea}): El código de estado HTTP '{token.lexema}' "
                f"no existe en el protocolo (rango válido 100-599)."
            )

    def _validar_ruta(self, token: Token):
        ruta = token.lexema
        
        # 1. Límite físico (Buffer Overflow)
        if len(ruta) > 2048:
            raise ValueError(
                f"Error Semántico (Ln {token.linea}): La URI excede el límite de 2048 caracteres."
            )
            
        # 2. Seguridad: Path Traversal (Evasión de directorios)
        if "../" in ruta or "..\\" in ruta:
            raise ValueError(
                f"Error Semántico (Ln {token.linea}): Intento de evasión de directorio detectado en '{ruta}'."
            )
            
        # 3. Seguridad: Exposición de información sensible
        archivos_sensibles = [".env", ".git", ".htaccess", ".htpasswd"]
        if any(sensible in ruta for sensible in archivos_sensibles):
            raise ValueError(
                f"Error Semántico (Ln {token.linea}): Intento de acceso a archivo de configuración del sistema en '{ruta}'."
            )
            
        # 4. Inconsistencia de protocolo HTTP
        if "#" in ruta:
            raise ValueError(
                f"Error Semántico (Ln {token.linea}): La URI contiene un fragmento ('#'), el cual no se transmite en peticiones estándar."
            )

    def _validar_fecha(self, token: Token):
        dia = int(token.lexema[1:3])
        mes_str = token.lexema[4:7]
        anio = int(token.lexema[8:12])
        horas, minutos, segundos = int(token.lexema[13:15]), int(token.lexema[16:18]), int(token.lexema[19:21])
        
        if not (1990 <= anio <= 2026):
            raise ValueError(f"Error Semántico (Ln {token.linea}): Año '{anio}' fuera de marco operativo.")
            
        meses_dias = {"Jan": 31, "Feb": 28, "Mar": 31, "Apr": 30, "May": 31, "Jun": 30, 
                      "Jul": 31, "Aug": 31, "Sep": 30, "Oct": 31, "Nov": 30, "Dec": 31}
        
        if mes_str not in meses_dias:
            raise ValueError(f"Error Semántico (Ln {token.linea}): Mes '{mes_str}' inválido.")
            
        max_dias = meses_dias[mes_str]
        if mes_str == "Feb" and (anio % 4 == 0 and (anio % 100 != 0 or anio % 400 == 0)):
            max_dias = 29
            
        if not (1 <= dia <= max_dias):
            if mes_str == "Feb" and dia == 29:
                raise ValueError(f"Error Semántico (Ln {token.linea}): Día '29' inválido para el mes 'Feb' en el año {anio}.")
            else:
                raise ValueError(f"Error Semántico (Ln {token.linea}): Día '{dia}' inválido para el mes '{mes_str}'.")
            
        if not (0 <= horas <= 23) or not (0 <= minutos <= 59) or not (0 <= segundos <= 59):
            raise ValueError(f"Error Semántico (Ln {token.linea}): Estructura de reloj inválida.")

# Orquestrador principal (Compilador)
class LogCompiler:
    def __init__(self, entrada: str):
        self.lexer = Lexer(entrada)
        self.parser = Parser(self.lexer)
        self.semantic = SemanticAnalyzer()

    def procesar(self):
        while self.parser.token_actual.tipo != TokenType.EOF:
            if self.parser.token_actual.tipo == TokenType.ERROR:
                raise ValueError(f"Error Léxico (Ln {self.parser.token_actual.linea}): Símbolo o lexema inválido '{self.parser.token_actual.lexema}'")
            
            tokens_entry = self.parser.parse_log_entry()
            self.semantic.analizar_log_entry(tokens_entry)
            print(f"Línea {tokens_entry[0].linea}: [OK] Análisis Léxico, Sintáctico y Semántico superado.")


# ==========================================
# BLOQUE DE PRUEBA Y EJECUCIÓN
# ==========================================
if __name__ == "__main__":
    logs_prueba = [
        # --- CASOS VÁLIDOS (Límites Físicos y Temporales Absolutos) ---
        "0.0.0.0 [01/Jan/1990:00:00:00] GET / 100",                             # 1. OK: Límites mínimos
        "255.255.255.255 [29/Feb/2024:23:59:59] DELETE /api/v1?id=9 599",       # 2. OK: Límites máximos, año bisiesto real y URI con parámetros

        # --- ERRORES SEMÁNTICOS (Violación de Reglas de Negocio) ---
        "192.168.1.1 [31/Apr/2026:13:45:01] GET /index.html 200",               # 3. Semántico: Abril tiene estrictamente 30 días
        "192.168.1.1 [14/Oct/1989:13:45:01] GET /index.html 200",               # 4. Semántico: Año 1989 (fuera de la cota operativa inferior)
        "192.168.1.1 [14/Oct/2026:24:00:00] GET /index.html 200",               # 5. Semántico: Reloj inválido (24:00:00)
        "192.168.1.256 [14/Oct/2026:13:45:01] GET /index.html 200",             # 6. Semántico: Octeto IPv4 superior a 255 (desbordamiento)
        "192.168.1.1 [14/Oct/2026:13:45:01] GET /index.html 600",               # 7. Semántico: Estado HTTP superior a la especificación (600)
        "192.168.1.1 [14/Oct/2026:13:45:01] GET /index.html 099",               # 8. Semántico: Estado HTTP inferior a la especificación (099)
        "192.168.1.1 [14/Oct/2026:13:45:01] GET /public/..\\private 200",       # 9. Semántico: Path Traversal empleando sintaxis Windows (..\)
        "192.168.1.1 [14/Oct/2026:13:45:01] GET /var/www/.htaccess 403",        # 10. Semántico: Acceso a archivo crítico de configuración
        "192.168.1.1 [14/Oct/2026:13:45:01] GET /index.html#header 200",        # 11. Semántico: Inclusión de fragmento de resolución en cliente (#)

        # --- ERRORES LÉXICOS (Violación Estructural o de Alfabeto) ---
        "192.168.1.1 [14/Oct/2026:13:45:01] PATCH /index.html 200",             # 12. Léxico: Método HTTP excluido del lexicón finito
        "192.168.1.1 [14/Oct/2026:13:45:01] get /index.html 200",               # 13. Léxico: Sensibilidad de mayúsculas (case-sensitive) en métodos
        "192.168.1.1 [14/Oct/2026:13:45:01] GET /index.html 20",                # 14. Léxico: Geometría de estado errónea (2 dígitos en lugar de 3)
        "192.168.1.1 [14.Oct.2026:13:45:01] GET /index.html 200",               # 15. Léxico: Separadores posicionales inválidos dentro de la fecha
        "192.168.1.1 14/Oct/2026:13:45:01 GET /index.html 200",                 # 16. Léxico: Fecha sin los corchetes delimitadores ('[', ']') obligatorios
        "192.168.1.1.1 [14/Oct/2026:13:45:01] GET /index.html 200",             # 17. Léxico: IP con exceso de transiciones de delimitador (4 puntos)

        # --- ERRORES SINTÁCTICOS (Violación de Reglas de Producción GLC) ---
        "[14/Oct/2026:13:45:01] 192.168.1.1 GET /index.html 200",               # 18. Sintáctico: Inversión del orden de los nodos TOKEN_IP y TOKEN_FECHA
        "192.168.1.1 [14/Oct/2026:13:45:01] GET /index.html",                   # 19. Sintáctico: EOF prematuro por ausencia obligatoria de TOKEN_ESTADO
        "192.168.1.1 [14/Oct/2026:13:45:01] GET /index /style.css 200"          # 20. Sintáctico: Duplicación consecutiva inesperada de TOKEN_RUTA
    ]

    for i, log in enumerate(logs_prueba, 1):
        print(f"\n--- Probando Caso {i} ---")
        print(f"Entrada: {log}")
        try:
            compilador = LogCompiler(log)
            compilador.procesar()
        except Exception as e:
            print(e)
            
    input("\nPresiona Enter para salir...")
from enum import Enum, auto
from dataclasses import dataclass

class TokenType(Enum):
    TOKEN_IP = auto()
    TOKEN_FECHA = auto()
    TOKEN_METODO_HTTP = auto()
    TOKEN_RUTA = auto()
    TOKEN_ENTERO = auto() # Estado y cantidad de bits
    TOKEN_PROTOCOLO = auto() 
    TOKEN_GUION = auto()     
    TOKEN_COMILLAS = auto()
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

    def _saltar_delimitadores(self):
        """Implementa la transición δ(q0, c ∈ Σ_espacio) = q0"""
        while self.caracter_actual is not None and self.caracter_actual.isspace():
            self.avanzar()

    def obtener_siguiente_token(self) -> Token:
        while self.caracter_actual is not None:
            # Estado q0: Descarte de delimitadores (incluye espacios y saltos de línea \n)
            if self.caracter_actual.isspace():
                self._saltar_delimitadores()
                continue
                
            # Bifurcación TOKEN_RUTA
            if self.caracter_actual == '/':
                return self._leer_ruta()
                
            # Bifurcación TOKEN_FECHA
            if self.caracter_actual == '[':
                return self._leer_fecha()
                
            # Bifurcación TOKEN_PROTOCOLO (Lookahead para desambiguar de HEAD)
            if self.caracter_actual == 'H' and self.entrada.startswith("HTTP", self.posicion):
                return self._leer_protocolo()
                
            # Bifurcación TOKEN_METODO_HTTP
            if self.caracter_actual.isalpha():
                return self._leer_metodo()
                
            # Bifurcación TOKEN_IP / ENTERO
            if self.caracter_actual.isdigit():
                return self._leer_ip_o_entero()

            # Transición directa estática: TOKEN_GUION
            if self.caracter_actual == '-':
                lin, col = self.linea, self.columna
                self.avanzar()
                return Token(TokenType.TOKEN_GUION, "-", lin, col)
                
            # Transición directa estática: TOKEN_COMILLAS
            if self.caracter_actual == '"':
                lin, col = self.linea, self.columna
                self.avanzar()
                return Token(TokenType.TOKEN_COMILLAS, '"', lin, col)
                
            # Intercepción de carácter inválido aislado: agrupa todo hasta el espacio
            linea_err, col_err = self.linea, self.columna
            lexema_err = self._consumir_hasta_espacio("")
            return Token(TokenType.ERROR, lexema_err, linea_err, col_err)

        return Token(TokenType.EOF, "", self.linea, self.columna)

    def _leer_ip_o_entero(self) -> Token:
        lexema = ""
        linea_inicio, col_inicio = self.linea, self.columna
        cantidad_puntos = 0
        
        while self.caracter_actual is not None and (self.caracter_actual.isdigit() or self.caracter_actual == '.'):
            if self.caracter_actual == '.':
                cantidad_puntos += 1
            lexema += self.caracter_actual
            self.avanzar()
            
        if self.caracter_actual is not None and not self.caracter_actual.isspace():
            lexema = self._consumir_hasta_espacio(lexema)
            return Token(TokenType.ERROR, lexema, linea_inicio, col_inicio)

        if cantidad_puntos == 0:
            return Token(TokenType.TOKEN_ENTERO, lexema, linea_inicio, col_inicio)
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
        
        # Validación Léxica Estructural
        # Formato esperado: [DD/Mes/AAAA:HH:MM:SS ±ZZZZ] -> Exactamente 28 caracteres
        if len(lexema) == 28:
            # 1. Validar los símbolos estáticos en sus posiciones exactas del autómata
            if (lexema[0] == '[' and lexema[3] == '/' and lexema[7] == '/' and 
                lexema[12] == ':' and lexema[15] == ':' and lexema[18] == ':' and 
                lexema[21] == ' ' and lexema[22] in ('+', '-') and lexema[27] == ']'):
                
                # 2. Extraer los bloques numéricos que varían (incluyendo el huso horario final)
                bloque_digitos = (lexema[1:3] + lexema[8:12] + 
                                  lexema[13:15] + lexema[16:18] + 
                                  lexema[19:21] + lexema[23:27])
                mes = lexema[4:7]
                
                # 3. Verificar que los tipos de caracteres coincidan (\d y [A-Z][a-z]{2})
                if (bloque_digitos.isdigit() and 
                    mes.isalpha() and 
                    mes[0].isupper() and 
                    mes[1:].islower()):
                    
                    # Léxicamente válido. Los chequeos lógicos (ej. mes válido, horas reales) 
                    # ocurrirán en el Analizador Semántico.
                    return Token(TokenType.TOKEN_FECHA, lexema, linea_inicio, col_inicio)
                    
        # Si no tiene 28 caracteres, o le faltan símbolos fijos, es un Error Léxico
        return Token(TokenType.ERROR, lexema, linea_inicio, col_inicio)

    def _leer_metodo(self) -> Token:
        lexema = ""
        linea_inicio = self.linea
        col_inicio = self.columna
        
        # El AFD transita leyendo todo el bloque hasta chocar con un espacio (delimitador natural) o comillas
        while self.caracter_actual is not None and not self.caracter_actual.isspace() and self.caracter_actual != '"':
            lexema += self.caracter_actual
            self.avanzar()
            
        metodos_validos = {"GET", "POST", "PUT", "DELETE", "HEAD", "OPTIONS", "PATCH", "TRACE", "CONNECT"}

        # Si lee "GET123", el lexema será "GET123", no existirá en el conjunto y lanzará Error.
        if lexema in metodos_validos:
            return Token(TokenType.TOKEN_METODO_HTTP, lexema, linea_inicio, col_inicio)
        else:
            return Token(TokenType.ERROR, lexema, linea_inicio, col_inicio)

    def _leer_protocolo(self) -> Token:
        lexema = ""
        linea_inicio, col_inicio = self.linea, self.columna
        
        while self.caracter_actual is not None and (self.caracter_actual.isalpha() or self.caracter_actual.isdigit() or self.caracter_actual in '/.'):
            lexema += self.caracter_actual
            self.avanzar()
            
        if lexema.startswith("HTTP/"):
            version = lexema[5:]
            # Exigencia geométrica estricta de RFC 9112: DIGIT "." DIGIT
            if len(version) == 3 and version[0].isdigit() and version[1] == '.' and version[2].isdigit():
                return Token(TokenType.TOKEN_PROTOCOLO, lexema, linea_inicio, col_inicio)
                
        return Token(TokenType.ERROR, lexema, linea_inicio, col_inicio)
    
    def _leer_ruta(self) -> Token:
        lexema = ""
        linea_inicio = self.linea
        col_inicio = self.columna

        # Conjunto estricto de caracteres válidos en una URI (RFC 3986)
        # Incluye: alfanuméricos, unreserved (-._~), reserved (:/?[]@!$&'()*+,;=) y percent (%). Se excluye #.
        caracteres_validos_uri = set(
            "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
            "-._~:/?[]@!$&'()*+,;=%"
        )
        hexadecimales = set("0123456789abcdefABCDEF")
        
        while self.caracter_actual is not None and not self.caracter_actual.isspace() and self.caracter_actual != '"':
            
            # Sub-autómata para Percent-Encoding (% seguido de 2 hex)
            if self.caracter_actual == '%':
                lexema += self.caracter_actual
                self.avanzar()
                
                # Consumimos estrictamente los siguientes dos caracteres
                for _ in range(2):
                    if self.caracter_actual is not None and self.caracter_actual in hexadecimales:
                        lexema += self.caracter_actual
                        self.avanzar()
                    else:
                        # Falló la regla de los 2 hex (ej: %2G, %X). Rechazo inmediato.
                        return self._consumir_ruta_error(lexema, linea_inicio, col_inicio)
                
                continue # El bloque %XX fue válido, seguimos con el while
                
            # Transición normal para caracteres permitidos
            elif self.caracter_actual in caracteres_validos_uri:
                lexema += self.caracter_actual
                self.avanzar()
                
            # Símbolo ilegal (ej: comillas, llaves, espacios)
            else:
                return self._consumir_ruta_error(lexema, linea_inicio, col_inicio)
            
        return Token(TokenType.TOKEN_RUTA, lexema, linea_inicio, col_inicio)

    def _consumir_ruta_error(self, lexema_parcial: str, linea_inicio: int, col_inicio: int) -> Token:
        """Sumidero: consume el resto de la URI corrupta para emitir el error completo."""
        while self.caracter_actual is not None and not self.caracter_actual.isspace() and self.caracter_actual != '"':
            lexema_parcial += self.caracter_actual
            self.avanzar()
        return Token(TokenType.ERROR, lexema_parcial, linea_inicio, col_inicio)
    
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

    def parse_log_file(self) -> list[list[Token]]:
        """
        Implementa la regla: <LogFile> ::= <LogEntry> <LogFile> | ε
        """
        entradas = []
        
        # Derivación a ε: Si el token actual es EOF de inmediato, el archivo está vacío.
        if self.token_actual.tipo == TokenType.EOF:
            return entradas
            
        # Derivación recursiva/iterativa: <LogEntry> <LogFile>
        while self.token_actual.tipo != TokenType.EOF:
            entradas.append(self.parse_log_entry())
            
        return entradas
    
    def parse_log_entry(self) -> list[Token]:
        tokens_entry = []
        # 1. Dirección IP
        tokens_entry.append(self.consumir_y_retornar(TokenType.TOKEN_IP))
        # 2. Identidad remota (suele ser un guion)
        tokens_entry.append(self.consumir_y_retornar(TokenType.TOKEN_GUION))
        # 3. Usuario autenticado (suele ser un guion)
        tokens_entry.append(self.consumir_y_retornar(TokenType.TOKEN_GUION))
        # 4. Marca de tiempo
        tokens_entry.append(self.consumir_y_retornar(TokenType.TOKEN_FECHA))
        # 5. Comillas de apertura de la petición
        tokens_entry.append(self.consumir_y_retornar(TokenType.TOKEN_COMILLAS))
        # 6. Verbo HTTP
        tokens_entry.append(self.consumir_y_retornar(TokenType.TOKEN_METODO_HTTP))
        # 7. Recurso solicitado (URI)
        tokens_entry.append(self.consumir_y_retornar(TokenType.TOKEN_RUTA))
        # 8. Versión del protocolo
        tokens_entry.append(self.consumir_y_retornar(TokenType.TOKEN_PROTOCOLO))
        # 9. Comillas de cierre de la petición
        tokens_entry.append(self.consumir_y_retornar(TokenType.TOKEN_COMILLAS))
        # 10. Código de respuesta
        tokens_entry.append(self.consumir_y_retornar(TokenType.TOKEN_ENTERO))
        # 11. Tamaño en bytes (Puede ser un número o un guion si no hay payload)
        if self.token_actual.tipo == TokenType.ERROR:
            raise ValueError(f"Error Léxico (Ln {self.token_actual.linea}, Col {self.token_actual.columna}): Símbolo o lexema inválido '{self.token_actual.lexema}'")
            
        if self.token_actual.tipo in (TokenType.TOKEN_ENTERO, TokenType.TOKEN_GUION):
            token_tamano = self.token_actual
            self.token_actual = self.lexer.obtener_siguiente_token()
            tokens_entry.append(token_tamano)
        else:
            raise SyntaxError(f"Error Sintáctico (Ln {self.token_actual.linea}, Col {self.token_actual.columna}): Se esperaba TOKEN_ENTERO o TOKEN_GUION para el tamaño, pero se encontró {self.token_actual.tipo.name}.")
        
        return tokens_entry

# Analizador semántico
class SemanticAnalyzer:
    def analizar_log_entry(self, tokens: list[Token]):
        """
        Recibe una secuencia sintácticamente válida (garantizada por la GLC)
        y aplica las restricciones del dominio de negocio.
        Nuevo orden: [IP, -, -, FECHA, ", METODO, RUTA, PROTOCOLO, ", ESTADO]
        """
        token_ip = tokens[0]
        # tokens[1] y [2] son los guiones de identidad
        token_fecha = tokens[3]
        # tokens[4] son las comillas de apertura, [5] es el método HTTP
        token_ruta = tokens[6]
        token_protocolo = tokens[7]
        # tokens[7] es el protocolo, [8] son las comillas de cierre
        token_estado = tokens[9]
        token_tamano = tokens[10]
        
        self._validar_ip(token_ip)
        self._validar_fecha(token_fecha)
        self._validar_ruta(token_ruta)
        self._validar_protocolo(token_protocolo)
        self._validar_estado(token_estado)
        self._validar_tamano(token_tamano)
        # TOKEN_METODO_HTTP no requiere validación semántica adicional.

    def _validar_tamano(self, token: Token):
        if token.tipo == TokenType.TOKEN_GUION:
            return # El guion indica ausencia de bytes (válido en CLF)
            
        bytes_enviados = int(token.lexema)
        # Validación de integridad lógica: Un archivo no puede tener tamaño negativo
        if bytes_enviados <= 0:
            raise ValueError(f"Error Semántico (Ln {token.linea}): El tamaño de respuesta ({bytes_enviados} bytes) no puede ser negativo ni 0.")

    def _validar_ip(self, token: Token):
        octetos = token.lexema.split('.')
        for octeto in octetos:
            # Validación 1: Prevención de ambigüedad octal (ceros a la izquierda)
            if len(octeto) > 1 and octeto[0] == '0':
                raise ValueError(f"Error Semántico (Ln {token.linea}): El octeto '{octeto}' en la IP '{token.lexema}' contiene ceros a la izquierda (notación inválida/octal).")
                
            # Validación 2: Límites físicos del byte
            if not (0 <= int(octeto) <= 255):
                raise ValueError(f"Error Semántico (Ln {token.linea}): El octeto '{octeto}' de la IP '{token.lexema}' está fuera del límite (0-255).")

    def _validar_estado(self, token: Token):
        codigo = int(token.lexema)
        # RFC 9110: Los códigos de estado operan en clases de 1xx a 5xx.
        # Se permiten códigos no registrados en IANA para soportar la extensibilidad del protocolo.
        if not (100 <= codigo <= 599):
            raise ValueError(f"Error Semántico (Ln {token.linea}): El código HTTP '{token.lexema}' está fuera del rango de clases válidas (100-599).")

    def _validar_ruta(self, token: Token):
        # Validación semántica: Límite físico alineado a la directiva LimitRequestLine de Apache.
        if len(token.lexema) > 8190:
            raise ValueError(f"Error Semántico (Ln {token.linea}): El request-target supera el límite de 8190 caracteres soportado por el servidor.")

    def _validar_fecha(self, token: Token):
        lexema = token.lexema
        linea = token.linea
        
        # 1. Extracción mediante slicing estático (posiciones garantizadas por el lexer)
        try:
            dia = int(lexema[1:3])
            mes_str = lexema[4:7]
            anio = int(lexema[8:12])
            hora = int(lexema[13:15])
            minuto = int(lexema[16:18])
            segundo = int(lexema[19:21])
            
            signo_tz = lexema[22]
            horas_tz = int(lexema[23:25])
            mins_tz = int(lexema[25:27])
        except ValueError:
            raise ValueError(f"Error Semántico (Ln {linea}): Los componentes de la fecha no son numéricos.")

        # 2. Validación por Lista Blanca de Meses en Inglés (Estándar Apache)
        meses_validos = {
            "Jan": 1, "Feb": 2, "Mar": 3, "Apr": 4, "May": 5, "Jun": 6,
            "Jul": 7, "Aug": 8, "Sep": 9, "Oct": 10, "Nov": 11, "Dec": 12
        }
        
        if mes_str not in meses_validos:
            raise ValueError(f"Error Semántico (Ln {linea}): Mes '{mes_str}' inexistente o en idioma incorrecto.")
            
        mes = meses_validos[mes_str]

        # 3. Validación de Días y Años Bisiestos
        dias_por_mes = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
        
        # Cálculo axiomático de bisiesto: divisible por 4, pero si es secular (múltiplo de 100) 
        # debe ser divisible por 400.
        es_bisiesto = (anio % 4 == 0 and anio % 100 != 0) or (anio % 400 == 0)
        
        if es_bisiesto:
            dias_por_mes[2] = 29

        if not (1 <= dia <= dias_por_mes[mes]):
            raise ValueError(f"Error Semántico (Ln {linea}): Día {dia} fuera de límite calendario para {mes_str} {anio}.")

        # 4. Validación de Hora Matemática (Reloj 24hs)
        if not (0 <= hora <= 23):
            raise ValueError(f"Error Semántico (Ln {linea}): Hora {hora} inválida.")
        if not (0 <= minuto <= 59):
            raise ValueError(f"Error Semántico (Ln {linea}): Minuto {minuto} inválido.")
        if not (0 <= segundo <= 59):
            raise ValueError(f"Error Semántico (Ln {linea}): Segundo {segundo} inválido.")

        # 5. Validación de Desplazamiento Horario (Timezone)
        if not (0 <= mins_tz <= 59):
            raise ValueError(f"Error Semántico (Ln {linea}): Minutos de huso horario ({mins_tz}) fuera de rango.")
            
        # Convertir a minutos totales para evaluar límites planetarios asimétricos
        offset_total_mins = (horas_tz * 60) + mins_tz
        if signo_tz == '-':
            offset_total_mins *= -1
            
        # Rango válido: desde UTC-12:00 (-720 minutos) hasta UTC+14:00 (+840 minutos)
        if not (-720 <= offset_total_mins <= 840):
            raise ValueError(f"Error Semántico (Ln {linea}): Desplazamiento {signo_tz}{horas_tz:02d}{mins_tz:02d} fuera de los límites terrestres permitidos (-1200 a +1400).")

    def _validar_protocolo(self, token: Token):
        protocolos_estandar = {"HTTP/1.0", "HTTP/1.1"}
        if token.lexema not in protocolos_estandar:
            raise ValueError(f"Error Semántico (Ln {token.linea}): Versión de protocolo '{token.lexema}' desconocida o no soportada.")

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
# BLOQUE DE PRUEBA Y EJECUCIÓN: Llamada a LogFile (archivo txt dentro de la misma carpeta)
# ==========================================
import os

def main():
    # 1. Resolver la ruta absoluta del archivo en la misma carpeta que el script
    directorio_actual = os.path.dirname(os.path.abspath(__file__))
    nombre_archivo = "LogFile.txt" 
    ruta_archivo = os.path.join(directorio_actual, nombre_archivo)

    # 2. Leer el contenido del archivo de texto
    try:
        with open(ruta_archivo, 'r', encoding='utf-8') as file:
            contenido_log = file.read()
    except FileNotFoundError:
        print(f"Error Crítico: El archivo '{nombre_archivo}' no existe en {directorio_actual}.")
        return
    except PermissionError:
        print(f"Error Crítico: Permisos insuficientes para leer '{nombre_archivo}'.")
        return

    # 3. Inicializar el pipeline del compilador
    lexer = Lexer(contenido_log)
    parser = Parser(lexer)
    
    # 4. Ejecutar el análisis
    # 4. Ejecutar el análisis
    try:
        # Llamada al axioma principal que implementamos antes: <LogFile>
        arbol_sintactico = parser.parse_log_file()
        
        # Instanciar y ejecutar el analizador semántico
        semanticAnalyzer = SemanticAnalyzer()
        
        # Iterar sobre cada línea validada por el parser
        for registro_tokens in arbol_sintactico:
            semanticAnalyzer.analizar_log_entry(registro_tokens)
        
        print(f"Análisis exitoso. Se procesaron {len(arbol_sintactico)} registros válidos.")
        
    except Exception as e: 
        # Captura las excepciones de Error Léxico, Sintáctico o Semántico
        print(f"FALLO DE COMPILACIÓN:\n{e}")

if __name__ == '__main__':
    main()
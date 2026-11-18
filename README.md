# Analizador Léxico, Sintáctico y Semántico de Logs (CLF)

Trabajo Final — Compiladores y Trasladores 2026 · UNSTA, Facultad de Ingeniería
Grupo: Amin, Guadalupe · Lopez Ávila, Candelaria · Ruiz, Amparo

Compilador para un subconjunto del *Common Log Format* de Apache, implementado en
Python sin expresiones regulares: AFD hecho a mano (léxico), parser descendente
recursivo (sintáctico) y validador de reglas del dominio (semántico).

## Ejecución

Requiere solo Python 3.10 o superior (no hay dependencias externas).

```bash
# Interfaz gráfica (abre el navegador en http://127.0.0.1:8000)
python servidor.py

# Opciones
python servidor.py --puerto 9000 --sin-navegador

# Modo consola original: analiza LogFile.txt
python compilador.py
```

## Estructura

| Archivo | Contenido |
|---|---|
| `compilador.py` | Lexer, Parser, SemanticAnalyzer (núcleo del trabajo) |
| `servidor.py` | API HTTP (biblioteca estándar) que ejecuta `compilador.py` y sirve la interfaz |
| `web/` | Interfaz: HTML, CSS y módulos JavaScript sin dependencias |
| `LogFile.txt` | Archivo de entrada del modo consola |

## Funcionalidades de la interfaz

- **Editor** con resaltado generado por los tokens reales del lexer, marcadores por línea,
  subrayado del lexema que falla, compilación en vivo y carga de archivos (arrastrar y soltar).
- **Pipeline** con el estado de cada fase y el veredicto del compilador en modo estricto
  (mismo flujo que `main()`).
- **Diagnóstico** por línea: cada línea se compila de forma independiente para listar
  todas las fallas y la fase en que ocurren.
- **Tokens**: flujo completo emitido por `Lexer`, con filtros por tipo y búsqueda.
- **Árbol sintáctico**: derivación de la GLC, incluida la derivación parcial y el punto
  exacto de falla.
- **Semántica**: las seis reglas evaluadas por separado (IPv4, calendario y huso horario,
  LimitRequestLine, versión HTTP, RFC 9110, tamaño %b).
- **Autómata**: simulación paso a paso del AFD del informe sobre cualquier lexema, con cinta,
  diagrama de estados y tabla de transiciones δ.
- **Analítica**: métricas de tráfico sobre los registros válidos.
- **Pruebas**: suite de 38 casos (incluye los tres casos de la sección 5 del informe).
- **Especificación**: alfabeto, AFD, BNF, expresiones regulares y reglas semánticas.
- Exportación del reporte (JSON, CSV de diagnóstico, CSV de tokens, log filtrado),
  tema claro/oscuro y atajos de teclado (`?` para verlos).

## API

| Método | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| GET | `/api/estado` | — | versión de Python |
| POST | `/api/analizar` | `{"texto": "..."}` | resultado estricto, tokens y diagnóstico por línea |
| POST | `/api/lote` | `{"casos": ["...", ...]}` | resultado estricto de cada caso |

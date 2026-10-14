# Reglas de arquitectura que se comprueban leyendo el código, sin arrancar nada: lo que un cambio no debe romper aunque todas
# las demás pruebas sigan en verde (CLAUDE.md, «Reglas que no se rompen» y «Mapa del código»).
import glob, os, re, sys, unittest
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
from financebuddy import servidor

PKG = os.path.join(RAIZ, "financebuddy")
WEB = os.path.join(PKG, "web")

def leer(ruta):
    with open(ruta, encoding="utf-8") as fh: return fh.read()

def sin_comentarios_js(src):
    """Quita los comentarios de bloque para que un ejemplo dentro de /* … */ no cuente como código."""
    return re.sub(r"/\*.*?\*/", lambda m: "\n" * m.group(0).count("\n"), src, flags=re.S)

class TestArquitectura(unittest.TestCase):
    def test_paneles_sin_import_ni_export(self):
        """La página concatena los paneles en una sola función: un import/export la rompe entera."""
        malos = []
        for ruta in glob.glob(os.path.join(WEB, "*.js")) + glob.glob(os.path.join(WEB, "paneles", "*.js")):
            for n, linea in enumerate(sin_comentarios_js(leer(ruta)).splitlines(), 1):
                if re.match(r"\s*(import|export)\s+[\w{*]", linea): malos.append(f"{os.path.relpath(ruta, RAIZ)}:{n}")
        self.assertEqual(malos, [], "import/export en la interfaz (JS plano concatenado, sin módulos)")

    def test_nombres_de_nivel_superior_no_se_repiten_entre_paneles(self):
        """Los módulos de MODULOS comparten ámbito: una function con el mismo nombre en dos paneles pisa a la primera sin
        avisar, y una const repetida deja la página en blanco."""
        dueño, repetidos = {}, []
        for m in servidor.MODULOS:
            src = sin_comentarios_js(leer(os.path.join(WEB, "paneles", m + ".js")))
            for n, linea in enumerate(src.splitlines(), 1):
                d = re.match(r"(?:async\s+)?function\*?\s+([\w$]+)|(?:const|let|var|class)\s+([\w$]+)", linea)  # columna 0 = nivel superior
                if not d: continue
                nombre = d.group(1) or d.group(2)
                if nombre in dueño: repetidos.append(f"{nombre}: {dueño[nombre]} y {m}.js:{n}")
                else: dueño[nombre] = f"{m}.js:{n}"
        self.assertEqual(repetidos, [], "nombres de nivel superior repetidos entre paneles")

    def test_cada_modulo_existe(self):
        for m in servidor.MODULOS: self.assertTrue(os.path.isfile(os.path.join(WEB, "paneles", m + ".js")), m)

    def test_sql_que_escribe_solo_en_almacen(self):
        """Toda escritura pasa por almacen.py (copias, Deshacer, validación). La única excepción conocida es «Borrar todos
        mis datos» (/api/vaciar), que hace una copia antes."""
        permitido = {("servidor.py", "DELETE FROM registros"): 1, ("servidor.py", "DELETE FROM config"): 1}
        visto = {}
        for ruta in glob.glob(os.path.join(PKG, "*.py")):
            nombre = os.path.basename(ruta)
            if nombre == "almacen.py": continue
            for s in re.findall(r"(?:INSERT\s+(?:OR\s+\w+\s+)?INTO|UPDATE|DELETE\s+FROM|DROP\s+TABLE|ALTER\s+TABLE)\s+\w+", leer(ruta), re.I):
                k = (nombre, re.sub(r"\s+", " ", s))
                visto[k] = visto.get(k, 0) + 1
        self.assertEqual({k: v for k, v in visto.items() if permitido.get(k) != v}, {}, "SQL que escribe fuera de almacen.py")

    def test_solo_las_dependencias_declaradas(self):
        """Biblioteca estándar más openpyxl, xlrd y pystray (y Pillow, que trae pystray). Otra cosa es «con permiso»."""
        permitidos = set(sys.stdlib_module_names) | {"financebuddy", "openpyxl", "xlrd", "pystray", "PIL"}
        ajenos = []
        for ruta in glob.glob(os.path.join(PKG, "*.py")):
            for linea in leer(ruta).splitlines():
                m = re.match(r"\s*(?:import\s+([\w., ]+)|from\s+([\w.]+)\s+import)", linea)
                if not m: continue
                for mod in (m.group(1) or m.group(2)).split(","):
                    raiz = mod.strip().split(" ")[0].split(".")[0]
                    if raiz and raiz not in permitidos: ajenos.append(f"{os.path.basename(ruta)}: {raiz}")
        self.assertEqual(ajenos, [], "dependencias que no están en requirements.txt")

    def test_solo_los_opcionales_salen_a_internet(self):
        """Regla 1: las únicas salidas son Jev, los precios y el aviso de versión (y __main__, que solo llama a 127.0.0.1 para
        reutilizar la app ya abierta). Un módulo nuevo que abra conexiones es «con permiso»."""
        permitidos = {"jev.py", "precios.py", "actualizaciones.py", "__main__.py"}
        red = re.compile(r"\burllib\.request\b|\bhttp\.client\b|\bsocket\b|\bftplib\b|\bsmtplib\b|\bwebsocket")
        fuera = [os.path.basename(r) for r in glob.glob(os.path.join(PKG, "*.py"))
                 if os.path.basename(r) not in permitidos and red.search(leer(r))]
        self.assertEqual(fuera, [], "módulos que abren conexiones de red")

    def test_la_pagina_no_carga_nada_de_fuera(self):
        """Todo se sirve desde web/: ni scripts, ni estilos, ni fuentes de internet."""
        externos = []
        patron = re.compile(r"""(?:src|href)\s*=\s*["'](?:https?:)?//[^"']+|@import\s+url\(\s*["']?https?://[^)]+""")
        for ruta in glob.glob(os.path.join(WEB, "*.html")) + glob.glob(os.path.join(WEB, "**", "*.css"), recursive=True):
            externos += [f"{os.path.relpath(ruta, RAIZ)}: {m.group(0)}" for m in patron.finditer(leer(ruta))]
        self.assertEqual(externos, [], "recursos cargados de internet")

    def test_colores_de_categoria_se_ven_sobre_el_fondo_claro(self):
        """Los colores de serie (CAT_COLOR) y los que se reparten a las categorías nuevas (PALETA) pintan puntos, barras y el
        rosco sobre las tarjetas: en el tema claro tienen que llegar a 3:1 frente a --surface (WCAG, elementos gráficos)."""
        def lum(h):
            c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
            r, g, b = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
            return 0.2126 * r + 0.7152 * g + 0.0722 * b
        src = leer(os.path.join(WEB, "paneles", "componentes.js"))
        tonos = re.findall(r"#[0-9A-Fa-f]{6}", re.search(r"const PALETA = \[(.*?)\]", src).group(1))
        tonos += re.findall(r"#[0-9A-Fa-f]{6}", re.search(r"const CAT_COLOR = \{(.*?)\};", src, re.S).group(1))
        fondo = re.search(r"--surface:(#[0-9A-Fa-f]{6})", leer(os.path.join(WEB, "estilos.css"))).group(1)
        self.assertGreater(len(tonos), 20)
        flojos = [f"{t} {(lum(fondo) + 0.05) / (lum(t) + 0.05):.2f}:1" for t in tonos if (lum(fondo) + 0.05) / (lum(t) + 0.05) < 3]
        self.assertEqual(flojos, [], f"colores de categoría por debajo de 3:1 sobre {fondo}")

if __name__ == "__main__":
    unittest.main()

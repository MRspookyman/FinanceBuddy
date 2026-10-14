# Repaso automático de un cambio antes del revisor: las «Trampas conocidas» de CLAUDE.md que se pueden ver en el diff sin
# pensar. No decide si el cambio está bien; dice dónde mirar, y qué modelo merece el revisor.
#
# Uso: python .claude\herramientas\chequeo_diff.py [--archivos=a.py,b.js] [--base=HEAD]
#   Mira el árbol de trabajo frente a --base (cambios sin commit y archivos nuevos sin seguimiento).
#   ⛔ = casi seguro un fallo o algo «con permiso» · ⚠ = mirar · · = dato
# Código de salida: 0 sin ⛔ · 1 con algún ⛔
import os, re, subprocess, sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Archivos donde un fallo cambia una cifra o pierde datos: con ellos, el revisor va con opus
DELICADOS = re.compile(r"(calculos\w*\.js|datos\.js|renta\.js|importar\.py|almacen\.py|modelo\.py|cartera\.py|operaciones\.py|"
                       r"bizums\.py|clasificar\.py|lectura\.py|detectar\.py|servidor\.py|secreto\.py)$")

def git(*a):
    return subprocess.run(["git", *a], cwd=RAIZ, capture_output=True, text=True, encoding="utf-8", errors="replace").stdout

def main():
    flags = dict(a[2:].split("=", 1) if "=" in a else (a[2:], "1") for a in sys.argv[1:] if a.startswith("--"))
    base = flags.get("base", "HEAD")
    solo = set(flags["archivos"].replace("\\", "/").split(",")) if flags.get("archivos") else None
    nuevos = [f for f in git("ls-files", "--others", "--exclude-standard").splitlines() if f]
    stat = {}
    for l in git("diff", "--numstat", base).splitlines():
        a, b, f = l.split("\t", 2); stat[f] = (a, b)
    for f in nuevos:
        try: stat[f] = (str(sum(1 for _ in open(os.path.join(RAIZ, f), encoding="utf-8", errors="replace"))), "0")
        except OSError: stat[f] = ("?", "0")
    if solo: stat = {f: v for f, v in stat.items() if f in solo or any(f.endswith("/" + s) or f == s for s in solo)}
    if not stat: print("· no hay cambios"); return 0

    # líneas añadidas por archivo
    añadidas = {}
    diff = git("diff", "-U0", base, "--", *stat.keys())
    actual = None
    for l in diff.splitlines():
        if l.startswith("+++ "): actual = l[6:] if l.startswith("+++ b/") else None
        elif actual and l.startswith("+") and not l.startswith("+++"): añadidas.setdefault(actual, []).append(l[1:])
    for f in nuevos:
        if f in stat:
            try: añadidas[f] = open(os.path.join(RAIZ, f), encoding="utf-8", errors="replace").read().splitlines()
            except OSError: pass
    todo_añadido = {f: "\n".join(v) for f, v in añadidas.items()}

    graves, avisos = [], []
    def tocado(patron): return [f for f in stat if re.search(patron, f)]
    def añadido(f, patron): return re.search(patron, todo_añadido.get(f, ""), re.M)

    app = [f for f in stat if f.startswith("financebuddy/")]
    pruebas = tocado(r"^pruebas/")
    total = sum(int(a) + int(b) for f, (a, b) in stat.items() if a.isdigit() and b.isdigit() and f.startswith("financebuddy/"))  # solo la app
    print("· archivos: " + ", ".join(f"{f} (+{a}/−{b})" for f, (a, b) in sorted(stat.items())))

    # Datos: campo nuevo → VERSION_ESQUEMA y FORMS
    if tocado(r"financebuddy/modelo\.py$"):
        if not añadido("financebuddy/almacen.py", r"VERSION_ESQUEMA\s*="):
            graves.append("modelo.py cambia y VERSION_ESQUEMA no sube (almacen.py): una app anterior borraría el campo al editar")
        if not tocado(r"formularios\.js$"): avisos.append("modelo.CAMPOS cambia y formularios.js (FORMS) no: ¿falta el campo en el formulario?")
    if tocado(r"financebuddy/plantilla\.py$") and not añadido("financebuddy/plantilla.py", r"^\s*VERSION\s*="):
        graves.append("plantilla.py cambia y plantilla.VERSION no sube")

    # Rutas nuevas y Deshacer
    srv = todo_añadido.get("financebuddy/servidor.py", "")
    rutas = sorted(set(re.findall(r'ruta\s*(?:==|in|\.startswith\()\s*\(?["\'](/api/[\w/]+)', srv)))
    if rutas:
        try: no_anulan = open(os.path.join(RAIZ, "financebuddy", "servidor.py"), encoding="utf-8").read().split("NO_ANULAN_DESHACER", 1)[1].split("}", 1)[0]
        except (OSError, IndexError): no_anulan = ""
        for r in rutas:
            if r not in no_anulan: avisos.append(f"ruta nueva {r}: si solo consulta, va en NO_ANULAN_DESHACER (si no, borra el «Deshacer»)")
    if re.search(r"huella", "\n".join(todo_añadido.get(f, "") for f in tocado(r"^financebuddy/\w+\.py$"))):
        avisos.append("toca la huella del extracto: la deduplicación y la cadena de saldos dependen de ella; ¿sigue igual para lo ya importado?")
    for f in tocado(r"financebuddy/\w+\.py$"):
        a = todo_añadido.get(f, "")
        if re.search(r"todos\(\s*[\"']movimiento", a) and "parte_de" not in a:
            avisos.append(f"{f}: recorre movimientos y no menciona parte_de; si es una operación en bloque, debe saltarse las partes de un dividido")
        if re.search(r"\b(urllib\.request|http\.client|requests|socket)\b", a):
            graves.append(f"{f}: código de red nuevo (regla 1: «con permiso»)")

    # Interfaz
    for f in tocado(r"financebuddy/web/.*\.js$"):
        a = todo_añadido.get(f, "")
        if re.search(r"<canvas|getContext\(", a): avisos.append(f"{f}: canvas: un importe dibujado ahí no se desenfoca en modo discreto (usa SVG o texto con «€»)")
        if re.search(r"toFixed\(|[\"'`]\s*€|€\s*[\"'`]\s*\+|\+\s*[\"'`]\s*€", a): avisos.append(f"{f}: importe montado a mano: usa eur() (formato 1.234,56 €, espacio duro)")
        if re.search(r"\badd\(\s*[\"'](warn|info)", a): avisos.append(f"{f}: aviso nuevo: ¿lleva clave (4.º argumento de add)? Sin clave no se puede quitar")
        if re.search(r"^let\s+\w+", a, re.M) and "/paneles/" in f: avisos.append(f"{f}: «let» de nivel superior: si es estado que debe sobrevivir a FB.refrescar(), va en FB.estado")
        if re.search(r"<select|createEl\(\s*[\"']select", a) and re.search(r"value\s*[:=]\s*\w*\.?id\b(?!\s*\+)", a):
            avisos.append(f"{f}: un <select> con id como valor: los valores van como cadena (String(id))")
        if re.search(r"#[0-9a-fA-F]{6}\b|rgba?\(", a): avisos.append(f"{f}: color puesto a mano en JS: usa las variables de estilos.css (contraste medido)")
    for f in tocado(r"\.css$"):
        sueltos = [l for l in todo_añadido.get(f, "").splitlines() if re.search(r"#[0-9a-fA-F]{3,8}\b|rgba?\(", l) and not re.match(r"\s*--[\w-]+\s*:", l)]
        if sueltos: avisos.append(f"{f}: {len(sueltos)} línea(s) con colores fuera de una variable: mide el contraste en claro y oscuro (contraste.py)")

    # Pruebas, secretos, puertos, documentación
    for f, a in todo_añadido.items():
        if re.search(r"(?:sk|pk|api|key|token)[-_][A-Za-z0-9]{20,}", a): graves.append(f"{f}: parece una clave en claro (regla 7)")
        if re.search(r"--puerto[ =]+8765\b|(127\.0\.0\.1|localhost):8765\b", a) and not f.startswith("financebuddy/"): graves.append(f"{f}: usa el puerto 8765 (la app real del usuario)")
        if re.search(r"\b\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\b|ES\d{2}\s?\d{4}\s?\d{4}", a) and f.startswith("pruebas/"):
            avisos.append(f"{f}: algo con forma de tarjeta o IBAN: los datos de prueba tienen que ser inventados")
    if app and not pruebas: avisos.append("cambia la app y ninguna prueba: ¿qué prueba fallaría sin este cambio?")
    for f in tocado(r"^pruebas/test_.*\.py$"):
        if re.search(r"servidor\.App\(", todo_añadido.get(f, "")) and re.search(r"/api/carpeta|carpeta", todo_añadido.get(f, "")) and "setUp" not in todo_añadido.get(f, ""):
            avisos.append(f"{f}: una App a pelo que toca carpetas reescribe %APPDATA%\\FinanceBuddy\\ajustes.json: apártalo como test_robustez.setUp")
        if "autoarranque" in todo_añadido.get(f, "") and "CLAVE" not in todo_añadido.get(f, ""):
            avisos.append(f"{f}: toca autoarranque sin cambiar autoarranque.CLAVE: dejaría algo arrancando en el Windows de quien la pase")
    if tocado(r"financebuddy/web/") and not tocado(r"^README\.md$"): avisos.append("cambia la interfaz y no README.md: ¿cambia lo que ve el usuario?")

    for g in graves: print("⛔ " + g)
    for a in avisos: print("⚠ " + a)
    delicado = any(DELICADOS.search(f) for f in stat)
    modelo = "opus" if graves or delicado or total > 400 else "sonnet"
    motivo = "hay ⛔" if graves else "toca cifras, datos o el servidor" if delicado else "cambio grande" if total > 400 else "cambio de interfaz o pequeño"
    print(f"· {total} líneas cambiadas en la app · revisor recomendado: {modelo} ({motivo})")
    return 1 if graves else 0

if __name__ == "__main__":
    sys.exit(main())

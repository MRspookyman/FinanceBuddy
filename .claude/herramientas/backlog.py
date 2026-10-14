# El backlog sin gastar tokens: lo que un agente leería entero para saber qué hay, aquí sale en unas líneas.
#   .claude/backlog.md          lo vivo: pendiente, en curso y sin comprobar (lo que leen los agentes)
#   .claude/backlog-archivo.md  lo cerrado: hecha y descartada (se busca, no se lee)
#
# Uso: python .claude\herramientas\backlog.py <orden>
#   resumen                  pendiente y sin comprobar en una línea cada una (en curso, primero)
#   buscar PALABRA [...]     en los dos archivos, sin acentos ni mayúsculas; todas las palabras (si nada, cualquiera)
#   ronda [N]                propuesta de la siguiente ronda solo con el backlog: directas, por prioridad y esfuerzo (máx. N=5,
#                            y no más de 2 «añadir»). Lo «con permiso» sale aparte
#   siguiente                el próximo identificador libre
#   en-curso B-123 [NOTA]    marca la entrada «EN CURSO» (en su nota)
#   hecha B-123 NOTA         la saca de lo vivo y la apunta en Hecha del archivo, con la fecha de hoy y la nota
#   descartar B-123 MOTIVO   igual, a Descartada
#   archivar                 pasa al archivo las secciones Hecha y Descartada que aún estén en backlog.md
#   comprobar                identificadores únicos, filas bien formadas y recuento por estado
import datetime, os, re, sys, unicodedata
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VIVO, ARCHIVO = os.path.join(DIR, "backlog.md"), os.path.join(DIR, "backlog-archivo.md")
CERRADAS = ("## Hecha", "## Descartada")
CABECERA_ARCHIVO = """# Backlog de FinanceBuddy · archivo

Lo cerrado: lo hecho y lo descartado. **No se lee entero**: se busca con
`python .claude\\herramientas\\backlog.py buscar <palabras>` antes de proponer algo, para no repetirlo. Nadie borra entradas.

## Hecha

| Id | Qué | Cuándo |
|---|---|---|

## Descartada (no volver a proponer sin un motivo nuevo)

| Id | Qué | Motivo |
|---|---|---|
"""
PRIORIDAD = {"cifra": 0, "fallo": 1, "accesibilidad": 2, "quitar": 3, "mejorar": 4, "añadir": 5}
ESFUERZO = {"bajo": 0, "medio": 1, "alto": 2}

def leer(ruta):
    if not os.path.exists(ruta): return ""
    with open(ruta, encoding="utf-8") as fh: return fh.read()

def escribir(ruta, texto):
    with open(ruta, "w", encoding="utf-8", newline="\n") as fh: fh.write(texto)

def plano(s):
    return "".join(c for c in unicodedata.normalize("NFD", s.lower()) if unicodedata.category(c) != "Mn")

def celdas(linea):
    return [c.strip() for c in linea.strip().strip("|").split("|")]

def filas(texto):
    """(sección, línea, celdas) de cada fila con identificador B-nnn."""
    seccion = ""
    for linea in texto.splitlines():
        if linea.startswith("## "): seccion = linea[3:].strip()
        elif re.match(r"\|\s*B-\d+\s*\|", linea): yield seccion, linea, celdas(linea)

def estado(seccion, c):
    s = plano(seccion)
    if s.startswith("hecha"): return "hecha"
    if s.startswith("descartada"): return "descartada"
    if s.startswith("sin comprobar"): return "sin comprobar"
    return "en curso" if "en curso" in plano(c[-1]) else "pendiente"

def corto(s, n=150):
    s = re.sub(r"\s+", " ", s)
    return s if len(s) <= n else s[:n - 1] + "…"

def todas():
    for ruta in (VIVO, ARCHIVO):
        for seccion, linea, c in filas(leer(ruta)): yield ruta, seccion, linea, c

def resumen():
    vivas = [(estado(s, c), c) for s, _, c in filas(leer(VIVO))]
    for est in ("en curso", "pendiente", "sin comprobar"):
        grupo = [c for e, c in vivas if e == est]
        if not grupo: continue
        print(f"## {est} ({len(grupo)})")
        for c in grupo:
            extra = " · ".join(c[2:5]) if est != "sin comprobar" else c[2]
            print(f"{c[0]} · {extra} · {corto(c[1])}")

def buscar(palabras):
    claves = [plano(p) for p in palabras]
    filas_ = [(s, c, plano(l)) for _, s, l, c in todas()]
    hits = [x for x in filas_ if all(k in x[2] for k in claves)] or [x for x in filas_ if any(k in x[2] for k in claves)]
    if not hits: print("nada"); return
    for s, c, _ in hits:
        print(f"{c[0]} [{estado(s, c)}] {corto(c[1], 170)}" + (f" — {corto(c[-1], 120)}" if estado(s, c) == "descartada" else ""))

def ronda(n=5):
    cand = [c for s, _, c in filas(leer(VIVO)) if estado(s, c) == "pendiente" and len(c) >= 6]
    clave = lambda c: (PRIORIDAD.get(c[2], 9), ESFUERZO.get(c[4], 9), int(c[0][2:]))
    elegidas, añadir = [], 0
    for c in sorted((c for c in cand if c[3] == "directa"), key=clave):
        if c[2] == "añadir":
            if añadir >= 2: continue
            añadir += 1
        elegidas.append(c)
        if len(elegidas) >= n: break
    curso = [c[0] for s, _, c in filas(leer(VIVO)) if estado(s, c) == "en curso"]
    if curso: print("EN CURSO primero (terminar o abandonar antes):", ", ".join(curso))
    print(f"## ronda propuesta ({len(elegidas)})")
    for c in elegidas: print(f"{c[0]} · {c[2]} · {c[4]} · {corto(c[1], 200)}\n    nota: {corto(c[5], 200)}")
    permiso = sorted((c for c in cand if c[3] != "directa"), key=clave)[:5]
    if permiso:
        print("## con permiso (preguntar antes)")
        for c in permiso: print(f"{c[0]} · {c[2]} · {c[4]} · {corto(c[1], 160)}")

def siguiente():
    ids = [int(c[0][2:]) for *_, c in todas()]
    print(f"B-{max(ids, default=0) + 1:03d}")

def quitar_de_vivo(ident):
    texto = leer(VIVO)
    for _, linea, c in filas(texto):
        if c[0] == ident:
            escribir(VIVO, texto.replace(linea + "\n", "", 1))
            return c
    sys.exit(f"{ident} no está en lo vivo (backlog.md)")

def añadir_a_archivo(seccion, fila):
    texto = leer(ARCHIVO) or CABECERA_ARCHIVO
    i = texto.index(seccion)
    sep = texto.index("|---", i); fin = texto.index("\n", sep) + 1
    escribir(ARCHIVO, texto[:fin] + fila + "\n" + texto[fin:])  # lo último cerrado, arriba

def cerrar(ident, nota, hecha):
    c = quitar_de_vivo(ident)
    hoy = datetime.date.today().strftime("%d/%m/%Y")
    if hecha: añadir_a_archivo("## Hecha", f"| {ident} | {c[1]} | {hoy} · {nota} |")
    else: añadir_a_archivo("## Descartada", f"| {ident} | {c[1]} | {nota} ({hoy}) |")
    print(f"{ident} → {'hecha' if hecha else 'descartada'}")

def en_curso(ident, nota):
    texto = leer(VIVO)
    for s, linea, c in filas(texto):
        if c[0] == ident:
            if "en curso" in plano(c[-1]): print(f"{ident} ya estaba en curso"); return
            hoy = datetime.date.today().strftime("%d/%m")
            c[-1] = (c[-1] + " · " if c[-1] else "") + f"**EN CURSO** ({hoy}{', ' + nota if nota else ''})"
            escribir(VIVO, texto.replace(linea, "| " + " | ".join(c) + " |", 1))
            print(f"{ident} en curso"); return
    sys.exit(f"{ident} no está en lo vivo (backlog.md)")

def archivar():
    texto = leer(VIVO)
    movidas = 0
    for seccion in CERRADAS:
        i = texto.find("\n" + seccion)
        if i < 0: continue
        j = texto.find("\n## ", i + 1); j = len(texto) if j < 0 else j
        lineas = [l for l in texto[i:j].splitlines() if re.match(r"\|\s*B-\d+\s*\|", l)]
        for linea in reversed(lineas): añadir_a_archivo(seccion, linea)  # cada una va arriba: al revés, quedan en su orden
        movidas += len(lineas)
        texto = texto[:i] + texto[j:]
    escribir(VIVO, texto.rstrip("\n") + "\n")
    print(f"archivadas: {movidas}")

def comprobar():
    vistos, mal, cuenta = {}, [], {}
    for ruta, s, linea, c in todas():
        if c[0] in vistos: mal.append(f"{c[0]} repetido ({os.path.basename(vistos[c[0]])} y {os.path.basename(ruta)})")
        vistos[c[0]] = ruta
        if len(c) < 3: mal.append(f"{c[0]}: fila con {len(c)} columnas")
        e = estado(s, c); cuenta[e] = cuenta.get(e, 0) + 1
    print(f"{len(vistos)} entradas · " + " · ".join(f"{k}: {v}" for k, v in sorted(cuenta.items())))
    if mal: print("\n".join(mal)); sys.exit(1)

if __name__ == "__main__":
    a = sys.argv[1:] or ["resumen"]
    orden, resto = a[0], a[1:]
    if orden == "resumen": resumen()
    elif orden == "buscar" and resto: buscar(resto)
    elif orden == "ronda": ronda(int(resto[0]) if resto else 5)
    elif orden == "siguiente": siguiente()
    elif orden == "en-curso" and resto: en_curso(resto[0], " ".join(resto[1:]))
    elif orden in ("hecha", "descartar") and len(resto) >= 2: cerrar(resto[0], " ".join(resto[1:]), orden == "hecha")
    elif orden == "archivar": archivar()
    elif orden == "comprobar": comprobar()
    else: sys.exit(__doc__ or "Mira la cabecera de este archivo para el uso.")

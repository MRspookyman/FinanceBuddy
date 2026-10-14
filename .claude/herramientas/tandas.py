# Las tres tandas de pruebas en una orden y con una salida corta: cuántas pasan, y de lo que falla solo lo necesario para
# arreglarlo. Compara los recuentos con los de CLAUDE.md («Comandos») y, con --actualizar, los reescribe allí.
#
# Uso: python .claude\herramientas\tandas.py [--solo=py|pantallas|flujos] [--actualizar]
# Código de salida: 0 todo en verde · 1 algo falla · 3 sin navegador (las de Python sí se pasan)
# Las dos tandas del navegador van en paralelo en los puertos 8797 y 8798 (nunca en el 8765, que es la app real).
import os, re, subprocess, sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CLAUDE = os.path.join(RAIZ, "CLAUDE.md")
PY = [sys.executable, "-m", "unittest", "discover", "-s", "pruebas", "-p", "test_*.py", "-t", "."]
NAV = {"pantallas": [sys.executable, os.path.join("pruebas", "run.py"), "--tests", "--puerto=8797"],
       "flujos": [sys.executable, os.path.join("pruebas", "run.py"), "--flujos", "--puerto=8798"]}

def lanzar(cmd):
    return subprocess.Popen(cmd, cwd=RAIZ, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace")

def resumen_py(rc, out):
    m = re.search(r"Ran (\d+) tests?", out)
    n = int(m.group(1)) if m else 0
    if rc == 0: return n, f"python: {n} OK", []
    # solo la cabecera de cada fallo y sus últimas líneas (la causa), no la traza entera
    bloques = re.split(r"\n(?==+\n(?:FAIL|ERROR): )", out)
    fallos = []
    for b in bloques[1:]:
        cab = re.search(r"(FAIL|ERROR): (.+)", b)
        partes = b.split("-" * 70)  # cabecera · traza · (resumen final, en el último)
        cola = [l for l in (partes[1] if len(partes) > 1 else b).strip().splitlines() if l.strip()][-3:]
        fallos.append(f"  {cab.group(1)} {cab.group(2)}\n" + "\n".join("    " + l.strip()[:220] for l in cola))
    total = re.search(r"FAILED \(([^)]*)\)", out)
    return n, f"python: {n} pruebas · FALLAN ({total.group(1) if total else 'ver salida'})", fallos[:8] or [out[-1500:]]

def resumen_nav(nombre, rc, out):
    if rc == 3: return None, f"{nombre}: sin navegador (no se han pasado)", []
    lineas = [l for l in out.splitlines() if l.startswith("── ")]
    tests = re.search(r"TESTS (\d+)/(\d+)", out); flujos = re.search(r"FLUJOS (\d+)/(\d+)", out)
    malos = [l[:300] for l in out.splitlines() if "✕" in l or "Error" in l or "(sin log)" in l or "no devolvió" in l or "no arranca" in l]
    if nombre == "pantallas":
        n = (len(lineas), int(tests.group(2)) if tests else 0)
        txt = f"pantallas: {len(lineas)} · cálculos {tests.group(1)}/{tests.group(2)}" if tests else f"pantallas: {len(lineas)} · cálculos: sin resultado"
    else:
        n = int(flujos.group(2)) if flujos else 0
        txt = f"flujos: {flujos.group(1)}/{flujos.group(2)}" if flujos else "flujos: sin resultado"
    if rc != 0 and not malos: malos = [out[-1500:]]
    return n, txt + ("" if rc == 0 else " · FALLAN"), malos[:12]

def recuentos_claude():
    with open(CLAUDE, encoding="utf-8", newline="") as fh: t = fh.read()  # newline="": se respetan sus finales de línea
    py = re.search(r":: (\d+) pruebas de Python", t); pa = re.search(r":: (\d+) pantallas sin errores \+ (\d+) pruebas de cálculos", t)
    fl = re.search(r":: (\d+) flujos con clics", t)
    return t, (int(py.group(1)) if py else None), ((int(pa.group(1)), int(pa.group(2))) if pa else None), (int(fl.group(1)) if fl else None)

def actualizar(t, py, pa, fl):
    if py is not None: t = re.sub(r":: \d+ pruebas de Python", f":: {py} pruebas de Python", t)
    if pa is not None: t = re.sub(r":: \d+ pantallas sin errores \+ \d+ pruebas de cálculos", f":: {pa[0]} pantallas sin errores + {pa[1]} pruebas de cálculos", t)
    if fl is not None: t = re.sub(r":: \d+ flujos con clics", f":: {fl} flujos con clics", t)
    # la columna de los comentarios va alineada: se rehace el relleno de esas tres líneas
    def alinear(m):
        cmd, com = m.group(1).rstrip(), m.group(2)
        return cmd.ljust(63) + com
    t = re.sub(r"^(python [^\n]*?)(:: \d+ (?:pruebas de Python|pantallas sin errores|flujos con clics)[^\n]*)$", alinear, t, flags=re.M)
    with open(CLAUDE, "w", encoding="utf-8", newline="") as fh: fh.write(t)

def main():
    flags = dict(a[2:].split("=", 1) if "=" in a else (a[2:], "1") for a in sys.argv[1:] if a.startswith("--"))
    solo = flags.get("solo")
    procs = {}
    if solo in (None, "py"): procs["py"] = lanzar(PY)
    for k in ("pantallas", "flujos"):
        if solo in (None, k): procs[k] = lanzar(NAV[k])
    res, rc_total, sin_nav = {}, 0, False
    for k, p in procs.items():
        out, _ = p.communicate(timeout=900)
        if k == "py": n, txt, malos = resumen_py(p.returncode, out)
        else: n, txt, malos = resumen_nav(k, p.returncode, out)
        res[k] = n
        if p.returncode == 3: sin_nav = True
        elif p.returncode != 0: rc_total = 1
        print(txt)
        for m in malos: print(m)
    t, cpy, cpa, cfl = recuentos_claude()
    distintos = []
    if res.get("py") is not None and "py" in res and res["py"] != cpy: distintos.append(f"python {cpy} → {res['py']}")
    if res.get("pantallas") and res["pantallas"] != cpa: distintos.append(f"pantallas + cálculos {cpa} → {res['pantallas']}")
    if res.get("flujos") and res["flujos"] != cfl: distintos.append(f"flujos {cfl} → {res['flujos']}")
    if distintos:
        if "actualizar" in flags and rc_total == 0:
            actualizar(t, res.get("py") if "py" in res else None, res.get("pantallas") or None, res.get("flujos") or None)
            print("CLAUDE.md actualizado: " + "; ".join(distintos))
        else: print("CLAUDE.md tiene otros recuentos (con --actualizar se corrigen si todo pasa): " + "; ".join(distintos))
    print("RESULTADO:", "FALLA" if rc_total else ("en verde, sin navegador" if sin_nav else "todo en verde"))
    return rc_total or (3 if sin_nav else 0)

if __name__ == "__main__":
    sys.exit(main())

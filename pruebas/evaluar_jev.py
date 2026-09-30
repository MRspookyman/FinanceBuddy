# ¿Cuánto acierta Jev con TUS movimientos? Toma movimientos que ya tienes clasificados (importados del banco), le pide
# a Jev su categoría sin decirle la tuya y compara. Así sabes si fiarte de sus sugerencias antes de usarlas.
#
# Uso (en tu ordenador, con la app cerrada o abierta):
#   python pruebas\evaluar_jev.py                  → 80 comercios distintos de tu carpeta de datos
#   python pruebas\evaluar_jev.py --n 150          → más casos
#   python pruebas\evaluar_jev.py --mostrar        → NO envía nada: enseña el texto exacto que se enviaría
#   python pruebas\evaluar_jev.py --datos CARPETA  → otra carpeta de datos
# La clave se toma de Ajustes → Asistente Jev (o de la variable TYPESAFE_API_KEY). Coste: céntimos como mucho.
import argparse, os, random, sys, time
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from financebuddy import clasificar as C, jev, rutas
from financebuddy.almacen import Almacen

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--datos"); ap.add_argument("--n", type=int, default=80); ap.add_argument("--mostrar", action="store_true")
    a = ap.parse_args()
    raiz = a.datos or rutas.leer_ajustes().get("datos") or rutas.carpeta_por_defecto()
    alm = Almacen(rutas.Carpeta(raiz).db)
    cats = {c["nombre"]: c for c in alm.todos("categoria")}
    # Un caso por comercio (clave de patrón y signo), solo lo importado del banco y ya clasificado
    casos, vistos = [], set()
    movs = [m for m in alm.todos("movimiento") if m.get("ext_texto") and m.get("clase") in ("gasto", "ingreso", "reembolso") and m.get("categoria") in cats]
    random.Random(7).shuffle(movs)
    for m in movs:
        k = jev.saneado(m["ext_texto"], 0).rsplit(".", 2)[0]  # mismo texto enviado = mismo caso (p. ej. «Bizum enviado. Concepto: cena»)
        if k in vistos: continue
        vistos.add(k); casos.append(m)
        if len(casos) >= a.n: break
    if not casos: sys.exit(f"No hay movimientos importados y clasificados en {raiz}.")
    imp = lambda m: float(m.get("ext_importe") or (m["importe"] if m["clase"] != "gasto" else -m["importe"]))
    if a.mostrar:
        for m in casos: print(f"{m['categoria']:>16} ← {jev.saneado(m['ext_texto'], imp(m))}")
        print(f"\n{len(casos)} casos. Esto es exactamente lo que se enviaría (no se ha enviado nada)."); return
    c = jev.config(alm)
    if not c["clave"]: sys.exit("Falta la clave: pégala en Ajustes → Asistente Jev o define TYPESAFE_API_KEY.")
    gasto, ingreso = jev.categorias_de(alm)
    res, fallos, tokens, t0 = [], [], 0, time.time()
    for i, m in enumerate(casos, 1):
        try: r = jev.clasificar(c["clave"], m["ext_texto"], imp(m), gasto, ingreso, minima=0)
        except jev.ErrorJev as e: sys.exit(f"Jev: {e}")
        ok = bool(r) and r["categoria"] == m["categoria"]
        conf = r["confianza"] if r else 0
        tokens += (r or {}).get("tokens", 0)
        res.append((ok, conf))
        if not ok: fallos.append((m, r))
        print(f"\r{i}/{len(casos)}", end="", flush=True)
    seg = time.time() - t0
    print("\n")
    tramo = lambda lo, hi: [ok for ok, cf in res if lo <= cf < hi]
    print(f"Aciertos: {sum(ok for ok, _ in res)} de {len(res)} ({100 * sum(ok for ok, _ in res) / len(res):.0f} %) · {seg / len(res):.2f} s por caso")
    for nombre, lo, hi in (("confianza ≥ 85 % (saldría marcada)", jev.SEGURA, 1.01), ("confianza 50–85 % (saldría sin marcar)", jev.MINIMA, jev.SEGURA), ("confianza < 50 % (no se propondría)", 0, jev.MINIMA)):
        t = tramo(lo, hi)
        if t: print(f"  {nombre}: {sum(t)} de {len(t)} bien ({100 * sum(t) / len(t):.0f} %)")
    print(f"Coste aproximado: {tokens / 1e6 * 0.042:.4f} $ ({tokens} tokens de entrada)")
    if fallos:
        print("\nDónde se equivoca (tu categoría → la de Jev):")
        for m, r in fallos[:40]:
            print(f"  {m['categoria']:>16} → {(r or {}).get('categoria', '—'):<16} {round(100 * (r or {}).get('confianza', 0)):>3} %  {jev.saneado(m['ext_texto'], imp(m))[:90]}")

if __name__ == "__main__":
    main()

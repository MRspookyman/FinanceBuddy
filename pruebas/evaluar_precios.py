# ¿Funcionan HOY los servicios de precios (Yahoo, Morningstar, CoinGecko)? Son gratuitos y no oficiales: pueden cambiar sin aviso.
# Este script los prueba de verdad, desde tu ordenador, con productos públicos. NO lee ni envía tus datos: usa una carpeta temporal.
#
# Uso:  python pruebas\evaluar_precios.py                    → prueba un ETF, un fondo (por ISIN), una acción, el oro y una cripto
#       python pruebas\evaluar_precios.py IE00B4L5Y983 bitcoin → busca lo que le pases (ISIN, ticker o nombre)
# Por cada servicio dice si responde, cuántos días de histórico trae y el último precio. Si algo falla, el motivo.
import os, sys, tempfile
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from financebuddy import precios
from financebuddy.almacen import Almacen

def probar(etiqueta, fn):
    try:
        r = fn()
        print(f"  ✓ {etiqueta}: {r}")
        return True
    except precios.ErrorPrecios as e:
        print(f"  ✕ {etiqueta}: {e}")
        return False
    except Exception as e:
        print(f"  ✕ {etiqueta}: error inesperado: {type(e).__name__}: {e}")
        return False

def serie(fuente, codigo, **kw):
    s, info = precios.descargar(fuente, codigo, **kw)
    u = max(s)
    return f"{len(s)} días hasta {u} · último {s[u]:.4f} {info.get('moneda')}"

def main():
    carpeta = tempfile.mkdtemp()
    alm = Almacen(os.path.join(carpeta, "prueba.db"))
    precios.guardar_config(alm, {"activo": True})
    ok = []
    print("Descarga de series (lo que hace «Actualizar precios»):")
    ok.append(probar("Yahoo · IWDA.AS (ETF MSCI World, EUR)", lambda: serie("yahoo", "IWDA.AS", completa=True)))
    ok.append(probar("Yahoo · AAPL (acción en USD)", lambda: serie("yahoo", "AAPL", completa=True)))
    ok.append(probar("Yahoo · USDEUR=X (cambio de moneda)", lambda: serie("yahoo", "USDEUR=X", completa=True)))
    ok.append(probar("Yahoo · GC=F (oro)", lambda: serie("yahoo", "GC=F", completa=True)))
    ok.append(probar("Morningstar · 0P0000YXQE (fondo)", lambda: serie("morningstar", "0P0000YXQE", completa=True)))
    ok.append(probar("CoinGecko · bitcoin", lambda: serie("coingecko", "bitcoin", completa=True)))
    consultas = sys.argv[1:] or ["IE00B4L5Y983", "apple", "bitcoin", "oro"]
    print("\nBuscador (lo que hace «Buscar el precio»):")
    for q in consultas:
        try:
            c = precios.buscar(alm, q)
            print(f"  «{q}»: {len(c)} resultado{'s' if len(c) != 1 else ''}")
            for x in c[:4]: print(f"      {x['fuente']:<11} {x['codigo']:<14} {x['precio']:>10} {x['moneda']}  {x['nombre']}" + (f"  · TER {x['ficha']['ter']} %" if (x.get('ficha') or {}).get('ter') is not None else ""))
            ok.append(bool(c))
        except precios.ErrorPrecios as e:
            print(f"  ✕ «{q}»: {e}"); ok.append(False)
    print("\nComparador (necesita IWDA.AS, SXR8.DE, EUNA.DE y XEON.DE de Yahoo):")
    for sim, _ in [p for r in precios.REFERENCIAS.values() for p in r["piezas"]]:
        ok.append(probar(f"Yahoo · {sim}", lambda sim=sim: serie("yahoo", sim, completa=True)))
    print(f"\n{sum(ok)} de {len(ok)} pruebas bien." + ("" if all(ok) else " Las que fallan se pueden arreglar en financebuddy/precios.py (todo lo de cada servicio está ahí, aislado)."))
    return 0 if all(ok) else 1

if __name__ == "__main__":
    sys.exit(main())

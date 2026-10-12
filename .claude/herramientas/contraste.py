# Contraste WCAG entre dos colores, medido y no estimado. Lo usan los agentes de revisión (regla 5: texto ≥ 4,5:1).
#
#   python .claude/herramientas/contraste.py "#DD5F36" "#FFFFFF"     dos colores sueltos
#   python .claude/herramientas/contraste.py --vars                   cada color de texto de estilos.css sobre cada fondo, en claro y oscuro
import os, re, sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

CSS = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "financebuddy", "web", "estilos.css")
FONDOS = ("bg", "surface", "surface-2")
TEXTOS = ("ink", "ink-2", "ink-3", "brand", "coral-t", "amber-t", "mint", "rose", "fin-up", "fin-down")

def rgb(h):
    h = h.strip().lstrip("#")
    if len(h) == 3: h = "".join(c * 2 for c in h)
    return [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]

def luminancia(h):
    r, g, b = [c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb(h)]
    return 0.2126 * r + 0.7152 * g + 0.0722 * b

def contraste(a, b):
    la, lb = sorted((luminancia(a), luminancia(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)

def variables(bloque, base=None):
    """--nombre:valor de un bloque de CSS; un var(--otra) se resuelve con lo ya leído (o con el tema claro)."""
    v = dict(base or {})
    for nombre, valor in re.findall(r"--([\w-]+):([^;}]+)", bloque):
        v[nombre] = valor.strip()
    for _ in range(4):
        for k, x in list(v.items()):
            m = re.fullmatch(r"var\(--([\w-]+)\)", x)
            if m and m.group(1) in v: v[k] = v[m.group(1)]
    return {k: x for k, x in v.items() if re.fullmatch(r"#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?", x)}

def main():
    args = sys.argv[1:]
    if len(args) == 2:
        c = contraste(*args)
        print(f"{args[0]} sobre {args[1]}: {c:.2f}:1 · {'pasa' if c >= 4.5 else 'NO llega a 4,5:1'}")
        return 0 if c >= 4.5 else 1
    if args != ["--vars"]:
        print(__doc__ or "Uso: contraste.py COLOR FONDO | --vars"); return 2
    css = open(CSS, encoding="utf-8").read()
    claro_txt, _, resto = css.partition("body.theme-dark{")
    claro = variables(claro_txt.split("body[data-acento")[0])
    oscuro = variables(resto.split("}")[0], claro)
    fallos = 0
    for tema, v in (("claro", claro), ("oscuro", oscuro)):
        print(f"── tema {tema}")
        for t in TEXTOS:
            if t not in v: continue
            celdas = []
            for f in FONDOS:
                if f not in v: continue
                c = contraste(v[t], v[f]); fallos += c < 4.5
                celdas.append(f"{f} {c:.2f}{'' if c >= 4.5 else ' ✕'}")
            print(f"  --{t:<9} {v[t]:<8} " + " · ".join(celdas))
    print(f"{fallos} combinación(es) por debajo de 4,5:1" if fallos else "Todo ≥ 4,5:1")
    return 1 if fallos else 0

if __name__ == "__main__":
    sys.exit(main())

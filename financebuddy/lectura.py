# Lectura de extractos (Excel .xlsx/.xls o CSV) y reconocimiento del formato (perfil) por la fila de cabecera.
import csv, datetime, io, os, re, unicodedata

def norm(s):
    s = unicodedata.normalize("NFD", str(s if s is not None else "").lower())
    return re.sub(r"\s+", " ", "".join(c for c in s if unicodedata.category(c) != "Mn")).strip()

def filas_crudas(ruta):
    """Todas las filas del archivo como listas de celdas (primera hoja si es Excel)."""
    ext = os.path.splitext(ruta)[1].lower()
    if ext in (".xlsx", ".xlsm"):
        import openpyxl
        wb = openpyxl.load_workbook(ruta, data_only=True, read_only=True)
        filas = [list(r) for r in wb.worksheets[0].iter_rows(values_only=True)]
        wb.close()
        return filas
    if ext == ".xls":
        import xlrd
        sh = xlrd.open_workbook(ruta).sheet_by_index(0)
        out = []
        for i in range(sh.nrows):
            fila = []
            for j in range(sh.ncols):
                c = sh.cell(i, j)
                fila.append(xlrd.xldate_as_datetime(c.value, 0) if c.ctype == xlrd.XL_CELL_DATE else c.value)
            out.append(fila)
        return out
    if ext not in (".csv", ".txt"): raise ValueError(f"Formato no admitido ({ext}): usa Excel (.xlsx, .xls) o CSV.")
    with io.open(ruta, "rb") as fh: datos = fh.read()
    texto = None
    for enc in ("utf-8-sig", "cp1252", "latin-1"):
        try: texto = datos.decode(enc); break
        except UnicodeDecodeError: pass
    muestra = "\n".join(texto.splitlines()[:40])
    sep = max([";", "\t", ","], key=lambda s: muestra.count(s))
    return list(csv.reader(io.StringIO(texto), delimiter=sep))

def fecha(v):
    if isinstance(v, datetime.datetime): return v.date().isoformat()
    if isinstance(v, datetime.date): return v.isoformat()
    if isinstance(v, (int, float)) and 20000 < v < 80000:  # número de serie de Excel
        return (datetime.date(1899, 12, 30) + datetime.timedelta(days=int(v))).isoformat()
    s = str(v or "").strip()
    for f in ("%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d", "%d/%m/%y", "%d-%m-%y", "%d.%m.%Y", "%Y/%m/%d", "%Y-%m-%d %H:%M:%S", "%d/%m/%Y %H:%M:%S", "%d/%m/%Y %H:%M"):
        try: return datetime.datetime.strptime(s, f).date().isoformat()
        except ValueError: pass
    return None

def numero(v):
    """1.234,56 · -12,30 · 1,234.56 · 1234.5 · «12,30 €» → float. None si no es un número."""
    if isinstance(v, bool) or v is None: return None
    if isinstance(v, (int, float)): return float(v)
    s = str(v).strip().replace("€", "").replace("EUR", "").replace("\xa0", "").replace(" ", "")
    neg = s.startswith("(") and s.endswith(")")
    s = s.strip("()")
    if not s or not re.fullmatch(r"[+-]?[\d.,]+-?", s): return None
    if s.endswith("-"): s = "-" + s[:-1]
    if "," in s and "." in s:
        s = s.replace(".", "").replace(",", ".") if s.rfind(",") > s.rfind(".") else s.replace(",", "")
    elif "," in s: s = s.replace(",", ".") if s.count(",") == 1 else s.replace(",", "")
    elif s.count(".") > 1: s = s.replace(".", "")  # 1.234.567 (un solo punto se toma como decimal)
    try: n = float(s)
    except ValueError: return None
    return -n if neg else n

def texto(v):
    if v is None: return ""
    if isinstance(v, float) and v.is_integer(): v = int(v)
    return re.sub(r"\s+", " ", str(v)).strip()

# ───────────── cabecera y perfiles ─────────────
def buscar_cabecera(filas, columnas):
    """Índice de la primera fila (de las 40 primeras) que contiene todos los textos de `columnas` (normalizados)
    y el índice de cada columna. None si no está."""
    buscados = {k: norm(v) for k, v in columnas.items() if v}
    for i, f in enumerate(filas[:40]):
        cab = [norm(x) for x in f]
        idx = {}
        for k, v in buscados.items():
            j = next((j for j, c in enumerate(cab) if c == v), None)
            if j is None: j = next((j for j, c in enumerate(cab) if c.startswith(v)), None)
            if j is None: break
            idx[k] = j
        else:
            if len(set(idx.values())) == len(idx): return i, idx
    return None

def reconocer(filas, perfiles, tipo=None):
    """Primer perfil (del tipo pedido, si se pide) cuya cabecera aparece en el archivo → (perfil, i_cabecera, índices).
    Los perfiles con más columnas se prueban antes (son más concretos)."""
    cand = [p for p in perfiles if not tipo or p.get("tipo") == tipo]
    for p in sorted(cand, key=lambda p: -len(p.get("columnas") or {})):
        r = buscar_cabecera(filas, p.get("columnas") or {})
        if r: return p, r[0], r[1]
    return None

def cabecera_probable(filas):
    """Para configurar un formato nuevo: la fila que parece la cabecera (≥ 3 textos y debajo una fila con fecha e importe)."""
    for i, f in enumerate(filas[:40]):
        textos = [x for x in f if isinstance(x, str) and x.strip() and fecha(x) is None and numero(x) is None]
        if len(textos) < 3: continue
        sig = filas[i + 1] if i + 1 < len(filas) else []
        if any(fecha(x) for x in sig) and any(numero(x) is not None and not fecha(x) for x in sig): return i
    return 0

def muestra_para_configurar(filas):
    i = cabecera_probable(filas)
    cab = [texto(x) for x in filas[i]] if filas else []
    ejemplos = [[texto(x.isoformat()[:10] if isinstance(x, (datetime.date, datetime.datetime)) else x) for x in f] for f in filas[i + 1:i + 6]]
    return {"fila_cabecera": i, "cabecera": cab, "ejemplos": ejemplos}

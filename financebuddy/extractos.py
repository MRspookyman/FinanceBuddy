# Extractos del banco que no son una hoja de cálculo: Norma 43 (AEB), OFX y QIF. Cada uno se lee a filas con la forma de las
# del banco (op y val en ISO; texto e importe con su signo: cargo negativo, abono positivo) y entra por el mismo camino que
# el resto de extractos (importar.importar_banco). Lo que el archivo es por dentro manda, no su extensión.
# OFX y QIF están leídos según su especificación pública: no se han contrastado con un extracto real del usuario.
import datetime, html, re
from . import lectura as L

NOMBRES = {"n43": "Norma 43", "ofx": "OFX", "qif": "QIF"}
RE_FECHA_QIF = re.compile(r"(\d{1,2})[/.\-](\d{1,2})[/.\-]\d{2,4}")
CIFRAS = re.compile(r"\d+")  # céntimos de la Norma 43

def formato(ruta):
    """«n43», «ofx», «qif» o None (cualquier otra cosa: Excel, CSV...)."""
    with open(ruta, "rb") as fh: datos = fh.read(4096)
    if datos.startswith((b"PK\x03\x04", b"\xd0\xcf\x11\xe0")): return None  # xlsx o xls: no son de texto
    texto = L._texto_de(datos) or ""
    lineas = [l.strip() for l in texto.splitlines() if l.strip()]
    if not lineas: return None
    if re.match(r"11\d{30}", lineas[0]): return "n43"  # cabecera de cuenta: 32 cifras al principio
    mayus = texto.upper()
    if "OFXHEADER:" in mayus or "<OFX>" in mayus: return "ofx"
    if lineas[0].startswith("!"): return "qif"
    return None

def leer(ruta, fmt):
    """→ (filas, datos). datos = {iban (últimos 4 dígitos o None), ilegibles [{fila, que, valor}], saldo_final {fecha, saldo} o None}.
    Lanza ValueError con el mensaje para el usuario si el archivo no sirve o no trae movimientos."""
    with open(ruta, "rb") as fh: texto = L._texto_de(fh.read()) or ""
    filas, datos = {"n43": _n43, "ofx": _ofx, "qif": _qif}[fmt](texto)
    if not filas:
        if datos["ilegibles"]:
            r = datos["ilegibles"][0]
            raise ValueError(f"No se ha podido leer ninguna fila del extracto: no entiendo {r['que']} «{r['valor']}» "
                             f"(línea {r['fila']}). Comprueba que el archivo está completo.")
        raise ValueError("El extracto no trae movimientos: no hay nada que importar.")
    return filas, datos

def _aamdd(s):
    """AAMMDD de la Norma 43 → ISO (años 2000 a 2099), o None si no es una fecha que exista."""
    if not re.fullmatch(r"\d{6}", s): return None
    try: return datetime.date(2000 + int(s[:2]), int(s[2:4]), int(s[4:])).isoformat()
    except ValueError: return None

def _fecha_ofx(s):
    """AAAAMMDD (con hora detrás o sin ella) → ISO, o None si no es una fecha que exista."""
    m = re.match(r"(\d{4})(\d{2})(\d{2})", s or "")
    if not m: return None
    try: return datetime.date(*map(int, m.groups())).isoformat()
    except ValueError: return None

def _euros(cifras, negativo):
    """Céntimos sin coma (como en la Norma 43) → euros con su signo."""
    v = round(int(cifras) / 100, 2)
    return -v if negativo and v else v

def _n43(texto):
    """Registros de 80 posiciones (la norma cuenta desde 1; aquí los índices empiezan en 0): 11 cuenta, 22 movimiento, 23 su
    concepto y 33 el saldo final. El resto (00, 08, 12, 24, 88, 98, 99) es de estructura y no aporta nada."""
    filas, raras, cuentas, iban, saldo, fecha_final, ultimo = [], [], 0, None, None, None, None
    for n, crudo in enumerate(texto.splitlines(), 1):
        if not crudo.strip(): continue
        l = crudo.ljust(80)
        cod = l[:2]
        if cod == "11":
            cuentas += 1; iban = l[10:20][-4:]; fecha_final = _aamdd(l[26:32]); ultimo = None
        elif cod == "22":
            ultimo = None
            fecha, clave, cifras = _aamdd(l[10:16]), l[27], l[28:42]
            if fecha is None: raras.append({"fila": n, "que": "la fecha", "valor": l[10:16].strip()})
            elif clave not in ("1", "2"): raras.append({"fila": n, "que": "el signo", "valor": clave.strip()})
            elif not CIFRAS.fullmatch(cifras): raras.append({"fila": n, "que": "el importe", "valor": cifras.strip()})
            else:
                ultimo = {"op": fecha, "importe": _euros(cifras, clave == "1"), "texto": "",
                          "ref": " ".join(x for x in (l[52:64].strip(), l[64:80].strip()) if x)}
                val = _aamdd(l[16:22])
                if val: ultimo["val"] = val
                filas.append(ultimo)
        elif cod == "23":
            if ultimo is not None: ultimo["texto"] = " ".join(x for x in (ultimo["texto"], " ".join(l[4:80].split())) if x)
        elif cod == "33":
            ultimo = None
            clave, cifras = l[58], l[59:73]
            if clave not in ("1", "2") or not CIFRAS.fullmatch(cifras) or fecha_final is None:
                raise ValueError("No se puede leer el saldo final del extracto (registro 33): puede que el archivo esté "
                                 "incompleto o dañado. No se ha importado nada.")
            saldo = {"fecha": fecha_final, "saldo": _euros(cifras, clave == "1")}
        elif cod not in ("00", "08", "12", "24", "88", "98", "99"):
            raras.append({"fila": n, "que": "el registro", "valor": cod.strip()})
    if cuentas > 1:
        raise ValueError(f"El archivo trae {cuentas} cuentas; de momento se importa una por archivo. "
                         "Separa las cuentas en archivos distintos.")
    for f in filas:
        ref = f.pop("ref")
        f["texto"] = f["texto"] or ref or "Movimiento"
    return filas, {"iban": iban, "ilegibles": raras, "saldo_final": saldo}

def _hoja(bloque, etiqueta):
    """Valor de una etiqueta de OFX («<ETIQUETA>valor», sin espacios alrededor); «» si no está."""
    m = re.search(r"<" + etiqueta + r">\s*([^<\r\n]*)", bloque, re.I)
    return html.unescape(m.group(1).strip()) if m else ""

def _ofx(texto):
    cuentas = len(re.findall(r"<STMTRS>", texto, re.I))
    if cuentas > 1:
        raise ValueError("El OFX trae varias cuentas; de momento se importa una por archivo. "
                         "Separa las cuentas en archivos distintos.")
    if not cuentas:
        raise ValueError("El OFX no es de una cuenta bancaria (falta <STMTRS>): de momento solo se importan cuentas "
                         "bancarias, no tarjetas.")
    cuenta = _hoja(texto, "ACCTID")
    if not cuenta:
        raise ValueError("El OFX no trae el número de la cuenta bancaria (ACCTID): de momento solo se importan cuentas "
                         "bancarias, no tarjetas.")
    filas, raras = [], []
    for m in re.finditer(r"<STMTTRN>(.*?)(?=<STMTTRN>|</STMTTRN>|</BANKTRANLIST>|</STMTRS>)", texto, re.S | re.I):
        n, b = texto.count("\n", 0, m.start()) + 1, m.group(1)  # n: la línea donde empieza el movimiento
        fecha, cifra = _fecha_ofx(_hoja(b, "DTPOSTED")), _hoja(b, "TRNAMT")
        importe = L.numero(cifra, miles=False)  # con punto o con coma decimal
        if not fecha: raras.append({"fila": n, "que": "la fecha", "valor": _hoja(b, "DTPOSTED")})
        elif importe is None: raras.append({"fila": n, "que": "el importe", "valor": cifra})
        else:
            textos = dict.fromkeys(x for x in (" ".join(_hoja(b, e).split()) for e in ("NAME", "MEMO")) if x)
            filas.append({"op": fecha, "importe": round(importe, 2), "texto": " ".join(textos) or "Movimiento"})
    saldo = None
    bal = re.search(r"<LEDGERBAL>(.*?)(?=</LEDGERBAL>|</STMTRS>|<STMTTRN>|$)", texto, re.S | re.I)
    if bal:
        cifra, fecha_bal = _hoja(bal.group(1), "BALAMT"), _fecha_ofx(_hoja(bal.group(1), "DTASOF"))
        importe_bal = L.numero(cifra, miles=False)
        if importe_bal is None or not fecha_bal:
            raise ValueError("No se puede leer el saldo final del OFX (LEDGERBAL): puede que el archivo esté incompleto "
                             "o dañado. No se ha importado nada.")
        saldo = {"fecha": fecha_bal, "saldo": round(importe_bal, 2)}
    return filas, {"iban": cuenta[-4:], "ilegibles": raras, "saldo_final": saldo}

def _qif(texto):
    tipos = [l.strip()[6:].strip() for l in texto.splitlines() if l.strip().lower().startswith("!type:")]
    if not tipos:
        raise ValueError("El archivo QIF no dice de qué cuenta es (falta la línea «!Type:Bank»): no se puede importar con seguridad.")
    bancos = sum(1 for t in tipos if t.lower() == "bank")
    if not bancos:
        raise ValueError(f"El archivo QIF es de «{tipos[0]}», no de una cuenta bancaria: de momento solo se importan cuentas "
                         "bancarias, no tarjetas.")
    if bancos > 1:
        raise ValueError(f"El archivo QIF trae {bancos} cuentas bancarias; de momento se importa una por archivo. "
                         "Separa las cuentas en archivos distintos.")
    orden = _orden_fechas_qif(texto)
    filas, raras, rec, activo = [], [], {}, False
    for n, crudo in enumerate(texto.splitlines(), 1):
        l = crudo.strip()
        if not l: continue
        if l.startswith("!") or l == "^":  # cabecera de sección o fin de registro
            if activo and rec: _registro_qif(rec, filas, raras, orden)
            rec = {}
            if l.startswith("!"): activo = l.lower() == "!type:bank"
        elif activo and l[0] in "DTUPM":  # fecha, importe, beneficiario y memo
            rec.setdefault("n", n); rec[l[0]] = (n, l[1:].strip())
    if activo and rec: _registro_qif(rec, filas, raras, orden)
    return filas, {"iban": None, "ilegibles": raras, "saldo_final": None}

def _orden_fechas_qif(texto):
    """«dmy» o «mdy». La especificación de QIF es mes/día, pero los bancos españoles suelen escribir día/mes: con las dos cifras
    menores de 13 no hay forma de saberlo, así que se decide por el archivo entero y, si no se puede, no se importa."""
    dia_primero = mes_primero = False
    for l in texto.splitlines():
        m = RE_FECHA_QIF.fullmatch(l.strip()[1:].strip()) if l.strip()[:1] in ("D", "d") else None
        if m:
            a, b = int(m.group(1)), int(m.group(2))
            dia_primero |= a > 12
            mes_primero |= b > 12
    if dia_primero and mes_primero:
        raise ValueError("Las fechas del archivo QIF no siguen un solo orden (unas son día/mes y otras mes/día): no se importa para no cambiarlas. Descarga el extracto en Excel o CSV.")
    if mes_primero: return "mdy"
    if dia_primero: return "dmy"
    raise ValueError("No se puede saber si las fechas del archivo QIF son día/mes o mes/día (ninguna pasa del día 12). "
                     "Para no cambiarlas sin que lo sepas, descarga el extracto en Excel o CSV.")

def _registro_qif(rec, filas, raras, orden="dmy"):
    """Un movimiento QIF → una fila. Si la fecha o el importe no se entienden, va a raras con su línea."""
    linea, fecha_txt = rec.get("D", (rec["n"], ""))
    m = RE_FECHA_QIF.fullmatch(fecha_txt)
    if m and orden == "mdy": fecha_txt = f"{m.group(2)}/{m.group(1)}/" + re.split(r"[/.\-]", fecha_txt)[2]
    fecha = None if "'" in fecha_txt else L.fecha(fecha_txt)  # «2'26» (año de dos cifras con apóstrofo) no se entiende
    if not fecha:
        raras.append({"fila": linea, "que": "la fecha", "valor": fecha_txt}); return
    linea, cifra_txt = rec.get("T") or rec.get("U") or (rec["n"], "")
    cifra = L.numero(cifra_txt, miles=False)
    if cifra is None:
        raras.append({"fila": linea, "que": "el importe", "valor": cifra_txt}); return
    textos = dict.fromkeys(" ".join(rec[c][1].split()) for c in "PM" if c in rec and rec[c][1].strip())
    filas.append({"op": fecha, "importe": round(cifra, 2), "texto": " ".join(textos) or "Movimiento"})

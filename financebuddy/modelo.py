# Tipos de registro, sus campos y la validación. Cada registro se guarda como JSON en la tabla `registros`.
#
# Tipos de campo: texto · num · num+ (≥ 0) · int · fecha (AAAA-MM-DD) · bool · lista (de textos) · meses (lista 1-12)
#                 · mapa (objeto) · tupla de opciones. «*» al final = obligatorio.
import datetime, re

CAMPOS = {
    # Cuentas del usuario. tipo: corriente (día a día) · ahorro · broker (efectivo del bróker) · otro (fianza, depósito…).
    # extracto: el usuario importa los movimientos de esta cuenta (si no, sus saldos se deducen de los traspasos).
    # iban: sus 4 últimas cifras (para saber de qué cuenta es un extracto sin preguntar).
    "cuenta": {"nombre": "texto*", "tipo": ("corriente", "ahorro", "broker", "otro"), "extracto": "bool", "iban": "texto", "notas": "texto",
               "alias": "texto", "icono": "texto", "color": "texto"},
    # icono: un emoji · color: #RRGGBB (si faltan, la app pone uno propio de la categoría).
    "categoria": {"nombre": "texto*", "grupo": ("variable", "fijo", "ingreso"), "presupuesto": "num+", "icono": "texto", "color": "texto", "descripcion": "texto", "oculta": "bool"},  # oculta: no sale al elegir categoría (se conserva)
    # importe siempre positivo: la clase da el signo. Transferencias con destino (sale) u origen (entra) = otra cuenta.
    # ext_*: huella de la fila del extracto de la que sale (para no importarla dos veces).
    "movimiento": {"fecha": "fecha*", "clase": ("gasto", "ingreso", "reembolso", "transferencia"), "categoria": "texto",
                   "importe": "num+*", "cuenta": "texto", "concepto": "texto*", "recurrente": "texto", "destino": "texto",
                   "origen": "texto", "nota": "texto", "ext_texto": "texto", "ext_importe": "num", "ext_fecha": "fecha",
                   "reembolsa": "int", "auto": "mapa", "sin_gasto": "bool", "parte_de": "int", "lote": "texto",
                   "divisa": "texto", "importe_divisa": "num+", "a_medias": "bool", "mi_parte": "num+", "cobrado": "bool", "etiquetas": "lista"},
                                                               # parte_de: id del movimiento dividido; auto: regla que lo clasificó al importar;
                                                               # reembolsa: id del gasto que devuelve este reembolso (Bizums, bizums.py);
                                                               # sin_gasto: quitaste el enlace a mano, que no se vuelva a enlazar solo
                                                               # divisa + importe_divisa: lo que costó en otra moneda (50 USD); `importe` sigue siendo lo que salió en euros y lo que cuenta
                                                               # a_medias (solo gastos): lo pagaste tú entero pero solo `mi_parte` es tuyo; el resto te lo deben (cobrado: ya te lo han dado)
                                                               # etiquetas: palabras libres para agrupar movimientos de cualquier categoría («vacaciones», «regalo»…)
    # Dinero que te da (dividendo, cupón) o te cobra (comisión, custodia) un activo, sin cambiar sus participaciones: importe siempre
    # positivo, el tipo dice el sentido. Cuenta para la rentabilidad del activo y entra/sale del efectivo de su bróker.
    # retencion: lo que ya se quedó Hacienda de un dividendo (el importe es lo que llegó a la cuenta; el bruto, la suma de los dos).
    "cobro": {"fecha": "fecha*", "activo": "texto*", "tipo": ("dividendo", "comision"), "importe": "num+*", "retencion": "num+", "cuenta": "texto", "nota": "texto",
              "ext_texto": "texto", "ext_importe": "num", "ext_fecha": "fecha", "lote": "texto"},
    # meses: solo esos meses del año (p. ej. [7] = anual en julio).
    "recurrente": {"nombre": "texto*", "clase": ("gasto", "ingreso", "aportacion"), "categoria": "texto", "importe": "num+*",
                   "dia": "int", "desde": "fecha*", "hasta": "fecha", "meses": "meses", "activo": "bool",
                   "activo_inversion": "texto", "cuenta": "texto"},
    # patrones: textos del extracto del bróker que identifican el activo (p. ej. «s&p 500 index»).
    # ter: gastos corrientes anuales (%) · materia: materias primas (oro, cobre…) · fuente_precio / codigo_precio / moneda: de dónde
    # se consulta su precio por internet, si el usuario lo activa (precios.py): el código es un ISIN, un ticker o el nombre de la
    # cripto; la moneda, la del precio (se convierte a euros).
    "activo": {"nombre": "texto*", "clase": ("fondo", "etf", "accion", "cripto", "materia", "pension", "bono", "inmueble", "otro"), "cuenta": "texto", "valor": "num",
               "fecha_valor": "fecha", "aportado_inicial": "num", "fecha_inicio": "fecha", "estado": ("activo", "vendido"),
               "patrones": "lista", "isin": "texto", "ter": "num+", "objetivo": "num+",
               "largo_plazo": "bool",
               "fuente_precio": ("", "morningstar", "yahoo", "coingecko"), "codigo_precio": "texto", "moneda": "texto"},  # largo_plazo: es inversión a largo plazo (vale sí si falta); el interruptor «solo largo plazo» deja fuera lo demás
    # importe: + compra, − venta · participaciones: las compradas (+) o vendidas (−), si el extracto las dice («… @ 2»).
    # orden: huella de la orden del bróker de la que sale (operaciones.py) · supuesta: «si», si la orden no decía si era
    # compra o venta y se ha supuesto (el extracto de la cuenta, si llega, lo corrige) · traspaso: «si», si es la mitad de
    # un traspaso entre fondos (vender uno para comprar otro): no es dinero nuevo · ajuste: «si» en un ajuste de
    # participaciones sin dinero (importe 0) para cuadrar con lo que dice el bróker (cartera.cuadrar).
    "aportacion": {"fecha": "fecha*", "activo": "texto*", "importe": "num*", "participaciones": "cant", "cuenta": "texto", "recurrente": "texto",
                   "ext_texto": "texto", "ext_importe": "num", "ext_fecha": "fecha", "orden": "texto", "supuesta": "texto", "traspaso": "texto", "ajuste": "texto", "nota": "texto", "lote": "texto"},
    # saldos: {cuenta: saldo} · valores: {activo: valor} a esa fecha.
    "patrimonio": {"fecha": "fecha*", "saldos": "mapa", "origen_saldos": "mapa", "valores": "mapa", "otros": "num", "deudas": "num+", "nota": "texto"},
    # cuenta: lo ahorrado es el saldo de esa cuenta · meta_meses: la meta es N meses de gasto.
    "objetivo": {"nombre": "texto*", "meta": "num+", "meta_meses": "num+", "ahorrado": "num+", "cuenta": "texto",
                 "fecha_limite": "fecha", "prioridad": ("media", "alta", "baja"), "estado": ("activo", "conseguido")},
    # repetir: al marcarlo hecho pasa a su siguiente fecha (renta, ITV, seguro…) en vez de quedar cerrado.
    "recordatorio": {"nombre": "texto*", "fecha": "fecha*", "avisar_dias": "int", "estado": ("pendiente", "hecho"), "texto": "texto",
                     "repetir": ("no", "anual", "trimestral", "mensual")},
    # Si el texto del movimiento contiene `patron` → categoría/clase. cuenta_otra: para traspasos, la otra cuenta.
    "regla": {"patron": "texto*", "categoria": "texto", "clase": ("gasto", "ingreso", "reembolso", "transferencia"),
              "recurrente": "texto", "cuenta_otra": "texto", "origen": ("usuario", "plantilla"), "concepto": "texto", "accion": ("clasificar", "preguntar")},
    # Cómo leer el Excel/CSV de un banco o bróker. columnas: {campo: texto de la cabecera}.
    # acciones (inversión): [{patron, accion: interes|ignorar}] aprendidas al revisar.
    # operaciones: órdenes con participaciones (fecha, isin | activo, importe?, participaciones, tipo?, estado?).
    "perfil": {"nombre": "texto*", "tipo": ("banco", "inversion", "operaciones"), "columnas": "mapa", "cuenta": "texto",
               "compras_negativas": "bool", "acciones": "listamapa"},
    # foto: lo que decían los datos al cerrar el mes y ya no cambia: {hecha, ingresos, gastos, ahorro, patrimonio, invertido, metido,
    # categorias: {categoría: gasto neto}} (FOTO_NUM). La calcula la pantalla (fotoCierre) y el servidor solo la valida; sin ella (cierres de antes) no pasa nada.
    "cierre": {"mes": "texto*", "fecha": "fecha", "notas": "texto", "foto": "mapa"},
    # Internos (solo los escribe el servidor)
    "pendiente": {"tipo_import": ("banco", "inversion"), "cuenta": "texto", "archivo": "texto", "perfil": "texto",
                  "fila": "mapa", "duda": "texto", "lote": "texto", "preguntar": "bool"},
    "ignorado": {"cuenta": "texto", "ext_fecha": "fecha", "ext_importe": "num", "ext_texto": "texto", "lote": "texto"},
    # Operación con participaciones pero sin importe (Excel de operaciones) que espera a su movimiento de la cuenta del bróker.
    "operacion": {"fecha": "fecha*", "activo": "texto*", "participaciones": "cant*", "orden": "texto", "lote": "texto"},
}
# lote: identificador de la importación de un archivo que creó el registro (importar.importar_archivo). Lo ponen solo las importaciones
# (almacen.con_lote); sirve para quitar de un golpe todo lo que trajo un archivo (importar.deshacer_lote). Vacío = apuntado a mano.
CON_LOTE = tuple(t for t, c in CAMPOS.items() if "lote" in c)
POR_DEFECTO_SI = {("activo", "recurrente"), ("compras_negativas", "perfil"), ("largo_plazo", "activo")}  # booleanos que, si faltan, valen sí
EDITABLES = set(CAMPOS) - {"pendiente", "ignorado", "operacion"}
# Referencias por nombre: al renombrar, se actualizan en los demás registros.
REFERENCIAS = {
    "cuenta": [("movimiento", "cuenta"), ("movimiento", "destino"), ("movimiento", "origen"), ("recurrente", "cuenta"),
               ("activo", "cuenta"), ("aportacion", "cuenta"), ("cobro", "cuenta"), ("objetivo", "cuenta"), ("perfil", "cuenta"),
               ("regla", "cuenta_otra"), ("pendiente", "cuenta"), ("patrimonio", "saldos*"), ("patrimonio", "origen_saldos*")],
    "categoria": [("movimiento", "categoria"), ("recurrente", "categoria"), ("regla", "categoria")],
    "activo": [("aportacion", "activo"), ("recurrente", "activo_inversion"), ("patrimonio", "valores*"), ("operacion", "activo"), ("cobro", "activo")],
    "recurrente": [("movimiento", "recurrente"), ("aportacion", "recurrente"), ("regla", "recurrente")],
}
UNICOS = {"cuenta": "nombre", "categoria": "nombre", "activo": "nombre", "recurrente": "nombre", "cierre": "mes", "perfil": "nombre"}
FOTO_NUM = ("ingresos", "gastos", "ahorro", "patrimonio", "invertido", "metido")


def fecha(v):
    if v in (None, ""): return None
    if isinstance(v, datetime.datetime): return v.date().isoformat()
    if isinstance(v, datetime.date): return v.isoformat()
    s = str(v).strip()[:10]
    try: return datetime.date.fromisoformat(s).isoformat()
    except ValueError: raise ValueError(f"fecha no válida: «{v}»")

def numero(v, decimales=2):
    if v in (None, ""): return None
    if isinstance(v, bool): raise ValueError("número no válido")
    if isinstance(v, (int, float)): return round(float(v), decimales)
    s = str(v).strip().replace("€", "").replace(" ", "").replace("\xa0", "")
    if "," in s: s = s.replace(".", "").replace(",", ".")
    try: return round(float(s), decimales)
    except ValueError: raise ValueError(f"número no válido: «{v}»")

MAX_ETIQUETAS, LARGO_ETIQUETA = 12, 30

def _limpiar_movimiento(out):
    """Lo que une varios campos de un movimiento (ajusta `out`): la divisa y su importe, «a medias» y las etiquetas."""
    # Otra divisa: el importe en euros es el que cuenta; esto solo recuerda lo que costó allí. Se guardan las dos cosas o ninguna.
    div = (out.pop("divisa", "") or "").upper()
    orig = out.pop("importe_divisa", None)
    if div or orig is not None:
        if not re.fullmatch(r"[A-Z]{3}", div): raise ValueError("divisa: un código de tres letras (USD, GBP…)")
        if div == "EUR": raise ValueError("divisa: el importe ya está en euros; deja la divisa vacía")
        if not orig or orig <= 0: raise ValueError("importe_divisa: pon cuánto costó en esa divisa")
        out["divisa"], out["importe_divisa"] = div, orig
    # A medias: solo un gasto; mi_parte es lo tuyo y el resto (importe − mi_parte) te lo deben.
    if out.get("clase") != "gasto" or not out.get("a_medias"):
        out["a_medias"] = False
        out.pop("mi_parte", None); out.pop("cobrado", None)
    else:
        if out.get("parte_de"): raise ValueError("a_medias: una parte de un movimiento dividido no puede ir a medias; vuelve a juntarlo")
        if out.get("mi_parte") is None: raise ValueError("mi_parte: pon cuánto es tu parte")
        if out["mi_parte"] >= out.get("importe", 0) - 0.004: raise ValueError("mi_parte: tu parte tiene que ser menor que el importe; si lo pagaste todo tú, quita «a medias»")
        out["cobrado"] = bool(out.get("cobrado"))
    # Etiquetas: sin «#», sin repetir (da igual mayúsculas o minúsculas) y en el orden en que las escribiste.
    vistas, etq = set(), []
    for e in out.pop("etiquetas", []):
        e = re.sub(r"\s+", " ", e.lstrip("#")).strip()
        if not e or e.casefold() in vistas: continue
        if len(e) > LARGO_ETIQUETA: raise ValueError(f"etiquetas: «{e[:12]}…» es demasiado larga (máximo {LARGO_ETIQUETA} letras)")
        vistas.add(e.casefold()); etq.append(e)
    if len(etq) > MAX_ETIQUETAS: raise ValueError(f"etiquetas: como mucho {MAX_ETIQUETAS} por movimiento")
    if etq: out["etiquetas"] = etq

def limpiar(tipo, datos):
    """Devuelve una copia validada de `datos` con solo los campos del tipo. Lanza ValueError con un mensaje legible."""
    if tipo not in CAMPOS: raise ValueError(f"tipo desconocido: {tipo}")
    out = {}
    for k, t in CAMPOS[tipo].items():
        v = datos.get(k)
        oblig = isinstance(t, str) and t.endswith("*")
        t = t.rstrip("*") if isinstance(t, str) else t
        try:
            if isinstance(t, tuple):
                v = (str(v).strip().lower() if v not in (None, "") else t[0])
                if v not in t: raise ValueError(f"debe ser uno de: {', '.join(t)}")
            elif t == "texto": v = re.sub(r"\s+", " ", str(v)).strip() if v not in (None,) else ""
            elif t == "cant":  # participaciones: hasta 6 decimales
                v = numero(v, 6)
            elif t in ("num", "num+"):
                v = numero(v)
                if v is not None and t == "num+" and v < 0: raise ValueError("no puede ser negativo")
            elif t == "int": v = int(float(v)) if v not in (None, "") else None
            elif t == "fecha": v = fecha(v)
            elif t == "bool": v = (k, tipo) in POR_DEFECTO_SI if v is None else v in (True, 1, "1", "true", "sí", "si", "on")
            elif t == "lista":
                v = [str(x).strip() for x in (v if isinstance(v, list) else str(v or "").split(",")) if str(x).strip()]
            elif t == "meses":
                arr = v if isinstance(v, list) else re.split(r"[,\s]+", str(v or ""))
                v = sorted({int(x) for x in arr if str(x).strip().isdigit() and 1 <= int(x) <= 12}) or None
            elif t == "mapa": v = dict(v) if isinstance(v, dict) else {}
            elif t == "listamapa": v = [dict(x) for x in v if isinstance(x, dict)] if isinstance(v, list) else []
        except (TypeError, ValueError) as e:
            raise ValueError(f"{k}: {e}")
        if oblig and v in (None, ""): raise ValueError(f"falta «{k}»")
        if v not in (None, "", [], {}): out[k] = v
        elif isinstance(t, tuple) or t == "bool": out[k] = v
    if tipo == "movimiento": _limpiar_movimiento(out)
    if tipo == "cuenta":
        if len(out.get("alias", "")) > 24: raise ValueError("alias: como mucho 24 caracteres")
        if out.get("icono") and out["icono"] not in ("🏦", "🌱", "📈", "💼", "🏠", "✈️", "🎯", "💶"):
            raise ValueError("icono: elige uno de los ocho iconos de cuenta")
        # color: "1"…"6" (cadena, como el <select> del formulario); se acepta también el número
        if out.get("color") and (isinstance(datos.get("color"), bool) or out["color"] not in ("1", "2", "3", "4", "5", "6")):
            raise ValueError("color: elige un número del 1 al 6")
    if tipo == "categoria":
        if out.get("color") and not re.fullmatch(r"#[0-9a-fA-F]{6}", out["color"]): raise ValueError("color: usa el formato #RRGGBB")
        if len(out.get("icono", "")) > 8: raise ValueError("icono: pon un solo emoji")
    if tipo == "activo":
        if out.get("codigo_precio") and not re.fullmatch(r"[A-Za-z0-9._=\-\^]{1,40}", out["codigo_precio"]): raise ValueError("codigo_precio: solo letras, números, punto o guion")
        if out.get("moneda") and not re.fullmatch(r"[A-Za-z]{3}", out["moneda"]): raise ValueError("moneda: un código de tres letras (EUR, USD…)")
        if out.get("fuente_precio") and not out.get("codigo_precio"): raise ValueError("codigo_precio: falta el código con el que consultar el precio")
        if not out.get("fuente_precio"): out.pop("codigo_precio", None)
    # Mapas numéricos
    for k in ("saldos", "valores"):
        if k in out: out[k] = {str(a): numero(b) for a, b in out[k].items() if numero(b) is not None}
    if tipo == "patrimonio":
        origenes = out.get("origen_saldos", {})
        if any(v not in ("manual", "extracto") for v in origenes.values()): raise ValueError("origen_saldos: origen no válido")
        if origenes: out["origen_saldos"] = {c: v for c, v in origenes.items() if c in out.get("saldos", {})}
    if tipo == "cierre" and "foto" in out:  # solo las cifras conocidas y lo que es un número: lo demás no entra
        def cifra(v):
            try: return None if isinstance(v, (bool, dict, list)) else numero(v)
            except ValueError: return None
        f = out["foto"]
        foto = {k: cifra(f.get(k)) for k in FOTO_NUM if cifra(f.get(k)) is not None}
        if f.get("hecha"): foto["hecha"] = fecha(f["hecha"])
        if isinstance(f.get("categorias"), dict): foto["categorias"] = {str(k): cifra(v) for k, v in f["categorias"].items() if cifra(v) is not None}
        if foto: out["foto"] = foto
        else: out.pop("foto")
    return out

def nombre_de(tipo, d):
    return d.get("nombre") or d.get("concepto") or d.get("patron") or d.get("mes") or d.get("fecha") or tipo

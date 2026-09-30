# Tipos de registro, sus campos y la validación. Cada registro se guarda como JSON en la tabla `registros`.
#
# Tipos de campo: texto · num · num+ (≥ 0) · int · fecha (AAAA-MM-DD) · bool · lista (de textos) · meses (lista 1-12)
#                 · mapa (objeto) · tupla de opciones. «*» al final = obligatorio.
import datetime, re

CAMPOS = {
    # Cuentas del usuario. tipo: corriente (día a día) · ahorro · broker (efectivo del bróker) · otro (fianza, depósito…).
    # extracto: el usuario importa los movimientos de esta cuenta (si no, sus saldos se deducen de los traspasos).
    # iban: sus 4 últimas cifras (para saber de qué cuenta es un extracto sin preguntar).
    "cuenta": {"nombre": "texto*", "tipo": ("corriente", "ahorro", "broker", "otro"), "extracto": "bool", "iban": "texto", "notas": "texto"},
    # icono: un emoji · color: #RRGGBB (si faltan, la app pone uno propio de la categoría).
    "categoria": {"nombre": "texto*", "grupo": ("variable", "fijo", "ingreso"), "presupuesto": "num+", "icono": "texto", "color": "texto"},
    # importe siempre positivo: la clase da el signo. Transferencias con destino (sale) u origen (entra) = otra cuenta.
    # ext_*: huella de la fila del extracto de la que sale (para no importarla dos veces).
    "movimiento": {"fecha": "fecha*", "clase": ("gasto", "ingreso", "reembolso", "transferencia"), "categoria": "texto",
                   "importe": "num+*", "cuenta": "texto", "concepto": "texto*", "recurrente": "texto", "destino": "texto",
                   "origen": "texto", "nota": "texto", "ext_texto": "texto", "ext_importe": "num", "ext_fecha": "fecha"},
    # meses: solo esos meses del año (p. ej. [7] = anual en julio).
    "recurrente": {"nombre": "texto*", "clase": ("gasto", "ingreso", "aportacion"), "categoria": "texto", "importe": "num+*",
                   "dia": "int", "desde": "fecha*", "hasta": "fecha", "meses": "meses", "activo": "bool",
                   "activo_inversion": "texto", "cuenta": "texto"},
    # patrones: textos del extracto del bróker que identifican el activo (p. ej. «s&p 500 index»).
    # ter: gastos corrientes anuales (%) · materia: materias primas (oro, cobre…).
    "activo": {"nombre": "texto*", "clase": ("fondo", "etf", "accion", "cripto", "materia", "otro"), "cuenta": "texto", "valor": "num",
               "fecha_valor": "fecha", "aportado_inicial": "num", "fecha_inicio": "fecha", "estado": ("activo", "vendido"),
               "patrones": "lista", "isin": "texto", "ter": "num+"},
    # importe: + compra, − venta · participaciones: las compradas (+) o vendidas (−), si el extracto las dice («… @ 2»).
    # orden: huella de la orden del bróker de la que sale (operaciones.py) · supuesta: «si», si la orden no decía si era
    # compra o venta y se ha supuesto (el extracto de la cuenta, si llega, lo corrige) · traspaso: «si», si es la mitad de
    # un traspaso entre fondos (vender uno para comprar otro): no es dinero nuevo.
    "aportacion": {"fecha": "fecha*", "activo": "texto*", "importe": "num*", "participaciones": "cant", "cuenta": "texto", "recurrente": "texto",
                   "ext_texto": "texto", "ext_importe": "num", "ext_fecha": "fecha", "orden": "texto", "supuesta": "texto", "traspaso": "texto"},
    # saldos: {cuenta: saldo} · valores: {activo: valor} a esa fecha.
    "patrimonio": {"fecha": "fecha*", "saldos": "mapa", "valores": "mapa", "otros": "num", "deudas": "num+", "nota": "texto"},
    # cuenta: lo ahorrado es el saldo de esa cuenta · meta_meses: la meta es N meses de gasto.
    "objetivo": {"nombre": "texto*", "meta": "num+", "meta_meses": "num+", "ahorrado": "num+", "cuenta": "texto",
                 "fecha_limite": "fecha", "prioridad": ("media", "alta", "baja"), "estado": ("activo", "conseguido")},
    "recordatorio": {"nombre": "texto*", "fecha": "fecha*", "avisar_dias": "int", "estado": ("pendiente", "hecho"), "texto": "texto"},
    # Si el texto del movimiento contiene `patron` → categoría/clase. cuenta_otra: para traspasos, la otra cuenta.
    "regla": {"patron": "texto*", "categoria": "texto", "clase": ("gasto", "ingreso", "reembolso", "transferencia"),
              "recurrente": "texto", "cuenta_otra": "texto", "origen": ("usuario", "plantilla")},
    # Cómo leer el Excel/CSV de un banco o bróker. columnas: {campo: texto de la cabecera}.
    # acciones (inversión): [{patron, accion: interes|ignorar}] aprendidas al revisar.
    # operaciones: órdenes con participaciones (fecha, isin | activo, importe?, participaciones, tipo?, estado?).
    "perfil": {"nombre": "texto*", "tipo": ("banco", "inversion", "operaciones"), "columnas": "mapa", "cuenta": "texto",
               "compras_negativas": "bool", "acciones": "listamapa"},
    "cierre": {"mes": "texto*", "fecha": "fecha", "notas": "texto"},
    # Internos (solo los escribe el servidor)
    "pendiente": {"tipo_import": ("banco", "inversion"), "cuenta": "texto", "archivo": "texto", "perfil": "texto",
                  "fila": "mapa", "duda": "texto"},
    "ignorado": {"cuenta": "texto", "ext_fecha": "fecha", "ext_importe": "num", "ext_texto": "texto"},
    # Operación con participaciones pero sin importe (Excel de operaciones) que espera a su movimiento de la cuenta del bróker.
    "operacion": {"fecha": "fecha*", "activo": "texto*", "participaciones": "cant*", "orden": "texto"},
}
POR_DEFECTO_SI = {("activo", "recurrente"), ("compras_negativas", "perfil")}  # booleanos que, si faltan, valen sí
EDITABLES = set(CAMPOS) - {"pendiente", "ignorado", "operacion"}
# Referencias por nombre: al renombrar, se actualizan en los demás registros.
REFERENCIAS = {
    "cuenta": [("movimiento", "cuenta"), ("movimiento", "destino"), ("movimiento", "origen"), ("recurrente", "cuenta"),
               ("activo", "cuenta"), ("aportacion", "cuenta"), ("objetivo", "cuenta"), ("perfil", "cuenta"),
               ("regla", "cuenta_otra"), ("pendiente", "cuenta"), ("patrimonio", "saldos*")],
    "categoria": [("movimiento", "categoria"), ("recurrente", "categoria"), ("regla", "categoria")],
    "activo": [("aportacion", "activo"), ("recurrente", "activo_inversion"), ("patrimonio", "valores*"), ("operacion", "activo")],
    "recurrente": [("movimiento", "recurrente"), ("aportacion", "recurrente"), ("regla", "recurrente")],
}
UNICOS = {"cuenta": "nombre", "categoria": "nombre", "activo": "nombre", "recurrente": "nombre", "cierre": "mes", "perfil": "nombre"}

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
    if tipo == "categoria":
        if out.get("color") and not re.fullmatch(r"#[0-9a-fA-F]{6}", out["color"]): raise ValueError("color: usa el formato #RRGGBB")
        if len(out.get("icono", "")) > 8: raise ValueError("icono: pon un solo emoji")
    # Mapas numéricos
    for k in ("saldos", "valores"):
        if k in out: out[k] = {str(a): numero(b) for a, b in out[k].items() if numero(b) is not None}
    return out

def nombre_de(tipo, d):
    return d.get("nombre") or d.get("concepto") or d.get("patron") or d.get("mes") or d.get("fecha") or tipo

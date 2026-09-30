# Datos ficticios para probar la app (FinanceBuddy.exe --ejemplo) y para las pruebas automáticas.
# Genera ~5 meses de una persona inventada: nómina, alquiler, gastos del día a día, traspasos al ahorro y al bróker,
# aportaciones a dos activos y un registro de patrimonio al cierre de cada mes (que cuadra con los movimientos).
import datetime, os, random, shutil
from . import plantilla, rutas
from .almacen import Almacen

CORRIENTE, AHORRO, BROKER = "Cuenta nómina", "Ahorro", "Bróker"
RECURRENTES = [  # nombre, clase, categoría, importe, día, meses
    ("Nómina", "ingreso", "Nómina", 1850.0, 28, None),
    ("Alquiler", "gasto", "Vivienda", 700.0, 1, None),
    ("Internet y móvil", "gasto", "Suministros", 35.0, 5, None),
    ("Luz", "gasto", "Suministros", 48.0, 12, None),
    ("Gimnasio", "gasto", "Suscripciones", 29.9, 3, None),
    ("Seguro del coche", "gasto", "Seguros", 310.0, 15, [3]),
]
APORTACIONES = [("Aportación fondo indexado", "Fondo indexado MSCI World", 150.0, 10), ("Aportación Bitcoin", "Bitcoin", 50.0, 10)]
VARIABLES = [  # concepto, categoría, importe mínimo, máximo, veces al mes
    ("Mercadona", "Supermercado", 18, 75, 5), ("Lidl", "Supermercado", 10, 40, 3), ("Bar La Plaza", "Comer fuera", 6, 38, 4),
    ("Glovo", "Comer fuera", 14, 30, 1), ("Repsol", "Coche", 40, 65, 2), ("Cinesa", "Ocio", 9, 22, 1),
    ("Amazon", "Compras", 12, 60, 1), ("Farmacia", "Salud", 5, 25, 1),
]

def crear(raiz, hoy=None, meses=5, reemplazar=True):
    """Crea (o recrea) una carpeta de datos de ejemplo. hoy: AAAA-MM-DD (por defecto, hoy)."""
    if reemplazar and os.path.exists(os.path.join(raiz, "datos.db")):
        shutil.rmtree(raiz, ignore_errors=True)
    c = rutas.Carpeta(raiz)
    alm = Almacen(c.db)
    plantilla.instalar(alm)
    hoy = datetime.date.fromisoformat(hoy) if hoy else datetime.date.today()
    rnd = random.Random(7)
    inicio = (hoy.replace(day=1) - datetime.timedelta(days=1)).replace(day=1)
    for _ in range(meses - 2): inicio = (inicio - datetime.timedelta(days=1)).replace(day=1)
    dia0 = inicio - datetime.timedelta(days=1)  # saldos iniciales: último día del mes anterior
    saldos = {CORRIENTE: 1650.0, AHORRO: 3200.0, BROKER: 400.0}
    with alm.transaccion():
        alm.guardar("cuenta", {"nombre": CORRIENTE, "tipo": "corriente", "extracto": True})
        alm.guardar("cuenta", {"nombre": AHORRO, "tipo": "ahorro", "extracto": False})
        alm.guardar("cuenta", {"nombre": BROKER, "tipo": "broker", "extracto": False})
        alm.set_config("limite_variable", 600)
        alm.set_config("configurado", True)
        alm.guardar("activo", {"nombre": "Fondo indexado MSCI World", "clase": "fondo", "cuenta": BROKER, "aportado_inicial": 4000,
                               "fecha_inicio": (inicio - datetime.timedelta(days=400)).isoformat(), "patrones": ["msci world"]})
        alm.guardar("activo", {"nombre": "Bitcoin", "clase": "cripto", "cuenta": BROKER, "aportado_inicial": 600,
                               "fecha_inicio": (inicio - datetime.timedelta(days=200)).isoformat(), "patrones": ["bitcoin"]})
        for n, cl, cat, imp, dia, ms in RECURRENTES:
            alm.guardar("recurrente", {"nombre": n, "clase": cl, "categoria": cat, "importe": imp, "dia": dia, "desde": inicio.isoformat(), "meses": ms, "cuenta": CORRIENTE})
        for n, activo, imp, dia in APORTACIONES:
            alm.guardar("recurrente", {"nombre": n, "clase": "aportacion", "importe": imp, "dia": dia, "desde": inicio.isoformat(), "activo_inversion": activo, "cuenta": BROKER})
        alm.guardar("objetivo", {"nombre": "Fondo de emergencia", "meta_meses": 3, "cuenta": AHORRO, "prioridad": "alta"})
        alm.guardar("objetivo", {"nombre": "Viaje a Japón", "meta": 2500, "ahorrado": 900, "fecha_limite": (hoy + datetime.timedelta(days=300)).isoformat(), "prioridad": "media"})
        alm.guardar("recordatorio", {"nombre": "Declaración de la renta", "fecha": (hoy + datetime.timedelta(days=10)).isoformat(), "avisar_dias": 14, "texto": "Revisar el borrador"})
        alm.guardar("patrimonio", {"fecha": dia0.isoformat(), "saldos": dict(saldos), "valores": {"Fondo indexado MSCI World": 4700.0, "Bitcoin": 820.0}, "otros": 0, "deudas": 0, "nota": "Saldos iniciales"})

        valores = {"Fondo indexado MSCI World": 4700.0, "Bitcoin": 820.0}
        movs = []  # (fecha, datos)
        aport = []
        d = inicio
        while d <= hoy:
            fin_mes = (d.replace(day=28) + datetime.timedelta(days=4)).replace(day=1) - datetime.timedelta(days=1)
            ultimo = min(fin_mes, hoy)
            for n, cl, cat, imp, dia, ms in RECURRENTES:
                f = d.replace(day=min(dia, fin_mes.day))
                if f <= hoy and (not ms or d.month in ms):
                    movs.append((f, {"clase": cl, "categoria": cat, "importe": imp, "concepto": n, "recurrente": n}))
            for concepto, cat, a, b, veces in VARIABLES:
                for _ in range(veces):
                    f = d.replace(day=rnd.randint(1, fin_mes.day))
                    if f <= hoy: movs.append((f, {"clase": "gasto", "categoria": cat, "importe": round(rnd.uniform(a, b), 2), "concepto": concepto}))
            # Una cena pagada por todos y la parte que devuelve un amigo por Bizum
            f = d.replace(day=min(20, fin_mes.day))
            if f <= hoy:
                movs.append((f, {"clase": "gasto", "categoria": "Comer fuera", "importe": 84.0, "concepto": "Restaurante El Puerto"}))
                movs.append((f, {"clase": "reembolso", "categoria": "Comer fuera", "importe": 42.0, "concepto": "Parte de Marta"}))
            f = d.replace(day=min(29, fin_mes.day))
            if f <= hoy:
                movs.append((f, {"clase": "transferencia", "importe": 200.0, "concepto": f"A {AHORRO}", "destino": AHORRO}))
                movs.append((f, {"clase": "transferencia", "importe": 200.0, "concepto": f"A {BROKER}", "destino": BROKER}))
            for n, activo, imp, dia in APORTACIONES:
                f = d.replace(day=dia)
                if f <= hoy: aport.append((f, {"activo": activo, "importe": imp, "cuenta": BROKER, "recurrente": n}))
            # Aplicar el mes a los saldos y registrar el cierre (solo meses completos)
            for f, m in [x for x in movs if d <= x[0] <= ultimo]:
                s = {"ingreso": 1, "reembolso": 1, "gasto": -1}.get(m["clase"])
                if s: saldos[CORRIENTE] += s * m["importe"]
                else:
                    saldos[CORRIENTE] -= m["importe"]; saldos[m["destino"]] += m["importe"]
            for f, a in [x for x in aport if d <= x[0] <= ultimo]:
                saldos[BROKER] -= a["importe"]; valores[a["activo"]] += a["importe"]
            valores = {k: round(v * (1 + rnd.uniform(-0.03, 0.05)), 2) for k, v in valores.items()}
            if fin_mes < hoy:
                alm.guardar("patrimonio", {"fecha": fin_mes.isoformat(), "saldos": {k: round(v, 2) for k, v in saldos.items()}, "valores": dict(valores), "otros": 0, "deudas": 0})
                alm.guardar("cierre", {"mes": fin_mes.strftime("%Y-%m"), "fecha": fin_mes.isoformat(), "notas": ""})
            d = fin_mes + datetime.timedelta(days=1)
        for f, m in movs: alm.guardar("movimiento", {"fecha": f.isoformat(), "cuenta": CORRIENTE, **m})
        for f, a in aport: alm.guardar("aportacion", {"fecha": f.isoformat(), **a})
        for a in alm.todos("activo"):
            alm.guardar("activo", {**a, "valor": valores[a["nombre"]], "fecha_valor": hoy.isoformat()}, a["id"])
    alm.cerrar()
    return raiz

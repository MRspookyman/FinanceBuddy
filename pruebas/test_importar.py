# Pruebas de la importación y la base de datos (sin navegador). Uso: python -m unittest pruebas.test_importar -v
import datetime, io, os, shutil, sys, tempfile, unittest
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from financebuddy import importar as IM, lectura as L, plantilla, rutas
from financebuddy.almacen import Almacen

def escribir(ruta, enc, texto):
    with io.open(ruta, "w", encoding=enc) as fh: fh.write(texto)

def excel_santander(ruta, filas, saldo_inicial=1000.0, romper=False):
    """filas: [(fecha ISO, concepto, importe)] en orden cronológico → Excel con el formato de Santander (más reciente arriba)."""
    import openpyxl
    wb = openpyxl.Workbook(); ws = wb.active
    for _ in range(3): ws.append([])
    ws.append(["Movimientos de la cuenta"]); ws.append(["ES00 0000 0000 0000 0000"]); ws.append([])
    ws.append(["Fecha operación", "Fecha valor", "Concepto", "Importe", "Saldo", "Divisa"])
    s, out = saldo_inicial, []
    for i, (f, c, imp) in enumerate(filas):
        s = round(s + imp, 2)
        out.append([datetime.datetime.fromisoformat(f), datetime.datetime.fromisoformat(f), c, imp, s + (5 if romper and i == 2 else 0), "EUR"])
    for r in reversed(out): ws.append(r)
    wb.save(ruta)

FILAS = [
    ("2026-09-01", "Compra Mercadona, Madrid, Tarj. :*1234", -45.20),
    ("2026-09-02", "Bizum a favor de Ana Ruiz concepto cena", -30.00),
    ("2026-09-03", "Traspaso: Ahorro", -200.00),
    ("2026-09-05", "Pago Movil En Ferreteria Lopez, Madrid", -12.50),
    ("2026-09-06", "Compra Lidl, Madrid", -10.00),
    ("2026-09-06", "Compra Lidl, Madrid", -10.00),  # dos compras idénticas el mismo día
    ("2026-09-10", "Transferencia Nomina Empresa SL", 1800.00),
    ("2026-09-11", "Transferencia de Juan Perez", 50.00),
]

class Base(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.c = rutas.Carpeta(self.dir)
        self.a = Almacen(self.c.db)
        plantilla.instalar(self.a)
        self.a.guardar("cuenta", {"nombre": "Nómina", "tipo": "corriente", "extracto": True})
        self.a.guardar("cuenta", {"nombre": "Ahorro", "tipo": "ahorro"})
        self.a.guardar("cuenta", {"nombre": "Bróker", "tipo": "broker"})
        self.a.guardar("activo", {"nombre": "Fondo MSCI", "clase": "fondo", "cuenta": "Bróker", "patrones": ["msci world"]})
    def tearDown(self):
        self.a.cerrar(); shutil.rmtree(self.dir, ignore_errors=True)
    def extracto(self, filas=FILAS, nombre="movs.xlsx", **kw):
        ruta = os.path.join(self.c.banco, nombre); excel_santander(ruta, filas, **kw); return ruta
    def importar(self, ruta, tipo="banco", cuenta="Nómina"):
        return IM.importar_archivo(self.a, self.c, ruta, tipo, cuenta)
    def movs(self): return self.a.todos("movimiento")

class TestBanco(Base):
    def test_pide_la_cuenta_la_primera_vez(self):
        with self.assertRaises(IM.NecesitaCuenta): IM.importar_archivo(self.a, self.c, self.extracto(), "banco")
        r = self.importar(self.extracto())
        self.assertTrue(r["ok"])
        self.assertEqual(next(p for p in self.a.todos("perfil") if p["nombre"] == "Santander")["cuenta"], "Nómina")
        r2 = IM.importar_archivo(self.a, self.c, self.extracto(nombre="otro.xlsx"), "banco")  # ya no pregunta
        self.assertTrue(r2["ok"])

    def test_clasifica(self):
        r = self.importar(self.extracto())
        self.assertEqual((r["nuevas"], r["dudas"]), (6, 2))
        por = {m["ext_texto"]: m for m in self.movs()}
        self.assertEqual(por["Compra Mercadona, Madrid, Tarj. :*1234"]["categoria"], "Supermercado")
        self.assertEqual(por["Bizum a favor de Ana Ruiz concepto cena"]["categoria"], "Comer fuera")
        self.assertEqual((por["Traspaso: Ahorro"]["clase"], por["Traspaso: Ahorro"].get("destino")), ("transferencia", "Ahorro"))
        self.assertEqual((por["Transferencia Nomina Empresa SL"]["clase"], por["Transferencia Nomina Empresa SL"]["categoria"]), ("ingreso", "Nómina"))
        self.assertEqual(sum(1 for m in self.movs() if m["ext_texto"] == "Compra Lidl, Madrid"), 2)
        self.assertEqual(len(self.a.todos("pendiente")), 2)
        self.assertFalse(os.path.exists(os.path.join(self.c.banco, "movs.xlsx")))  # movido a Procesados
        self.assertEqual(self.a.config("saldo_extracto:Nómina"), {"fecha": "2026-09-11", "saldo": 2542.3})

    def test_reglas_de_serie(self):
        from financebuddy import clasificar as C
        reglas = C.ordenar_reglas(self.a.todos("regla"))
        cat = lambda t: (C.regla_para(t, reglas) or {}).get("categoria")
        self.assertEqual(cat("PAGO MOVIL EN DIA 25013, MADRID ES, TARJ. :*001234"), "Supermercado")
        self.assertEqual(cat("PAGO MOVIL EN PLENERGY US 58, MALAGA ES"), "Coche")
        self.assertEqual(cat("PAGO MOVIL EN GAME 458 MADRID, MADRID ES"), "Compras")
        self.assertIsNone(cat("Bizum a favor de Ana concepto dia de playa"))

    def test_reimportar_no_duplica(self):
        self.importar(self.extracto())
        r = self.importar(self.extracto())
        self.assertEqual((r["nuevas"], r["dudas"], r["existentes"]), (0, 0, 8))
        self.assertEqual((len(self.movs()), len(self.a.todos("pendiente"))), (6, 2))

    def test_resolver_y_aprender(self):
        self.importar(self.extracto())
        p = next(x for x in self.a.todos("pendiente") if "Ferreteria" in x["fila"]["texto"])
        IM.resolver(self.a, p["id"], {"accion": "guardar", "clase": "gasto", "categoria": "Hogar", "concepto": "Ferretería", "recordar": True, "patron": "ferreteria lopez"})
        q = next(x for x in self.a.todos("pendiente") if "Juan" in x["fila"]["texto"])
        IM.resolver(self.a, q["id"], {"accion": "ignorar"})
        self.assertEqual(len(self.a.todos("pendiente")), 0)
        # Reimportar el mismo extracto: nada nuevo, nada por revisar (lo resuelto y lo descartado se reconoce)
        r = self.importar(self.extracto())
        self.assertEqual((r["nuevas"], r["dudas"]), (0, 0))
        # Un extracto posterior con la misma ferretería se clasifica solo
        r = self.importar(self.extracto(FILAS + [("2026-09-20", "Pago Movil En Ferreteria Lopez, Madrid", -8.0)], nombre="b.xlsx"))
        self.assertEqual((r["nuevas"], r["dudas"]), (1, 0))
        self.assertEqual([m["categoria"] for m in self.movs() if m["fecha"] == "2026-09-20"], ["Hogar"])

    def test_recordar_resuelve_las_iguales(self):
        filas = [("2026-09-01", "Pago Movil En Bar Pepe, Madrid ES, Tarj. :*1234", -5.0), ("2026-09-02", "Pago Movil En Bar Pepe, Madrid ES, Tarj. :*1234", -7.0),
                 ("2026-09-03", "Compra Bet365, Palma, Tarjeta 4000000000001234 , Comision 0,00", -20.0)]
        self.a.guardar("regla", {"patron": "bet365", "categoria": "Ocio", "clase": "gasto"})
        r = self.importar(self.extracto(filas))
        self.assertEqual(r["dudas"], 0 if any(x["patron"] == "bar" for x in self.a.todos("regla")) else 2)
        self.assertEqual([m["categoria"] for m in self.movs() if "Bet365" in m["ext_texto"]], ["Ocio"])  # no «Comisiones» por «COMISION 0,00»
    def test_recordar_resuelve_las_iguales_pendientes(self):
        filas = [("2026-09-01", "Pago Movil En Ferreteria Lopez, Madrid", -5.0), ("2026-09-02", "Pago Movil En Ferreteria Lopez, Madrid", -7.0)]
        self.importar(self.extracto(filas))
        p = self.a.todos("pendiente")[0]
        msg = IM.resolver(self.a, p["id"], {"accion": "guardar", "clase": "gasto", "categoria": "Hogar", "recordar": True, "patron": "ferreteria lopez"})
        self.assertIn("1 más", msg)
        self.assertEqual((len(self.a.todos("pendiente")), sorted(m["importe"] for m in self.movs())), (0, [5.0, 7.0]))

    def test_traspaso_desconocido_a_otra_cuenta(self):
        self.importar(self.extracto([("2026-09-01", "Traspaso interno cuenta 9999", -100.0)]))
        p = self.a.todos("pendiente")[0]
        IM.resolver(self.a, p["id"], {"accion": "guardar", "clase": "transferencia", "cuenta_otra": "Bróker", "recordar": True, "patron": "cuenta 9999"})
        m = self.movs()[0]
        self.assertEqual((m["clase"], m.get("destino")), ("transferencia", "Bróker"))
        self.importar(self.extracto([("2026-09-01", "Traspaso interno cuenta 9999", -100.0), ("2026-10-01", "Traspaso interno cuenta 9999", -100.0)], nombre="c.xlsx"))
        self.assertEqual(sum(1 for m in self.movs() if m.get("destino") == "Bróker"), 2)

    def test_saldos_rotos_no_importa_nada(self):
        r = self.importar(self.extracto(romper=True))
        self.assertFalse(r["ok"])
        self.assertIn("no cuadran", r["mensaje"])
        self.assertEqual(len(self.movs()), 0)

    def test_apuntado_a_mano_no_se_duplica(self):
        self.a.guardar("movimiento", {"fecha": "2026-09-01", "clase": "gasto", "categoria": "Supermercado", "importe": 45.2, "concepto": "Súper", "cuenta": "Nómina"})
        r = self.importar(self.extracto())
        self.assertEqual(r["nuevas"], 5)

    def test_formato_nuevo_csv(self):
        ruta = os.path.join(self.c.banco, "banco_x.csv")
        escribir(ruta, "utf-8", "Date;Description;Amount;Balance\n02/09/2026;CARREFOUR EXPRESS;-12,40;987,60\n01/09/2026;Recibo Iberdrola;-50,00;1.000,00\n")
        with self.assertRaises(IM.NecesitaPerfil) as e: self.importar(ruta)
        self.assertEqual(e.exception.info["cabecera"], ["Date", "Description", "Amount", "Balance"])
        IM.crear_perfil(self.a, "Banco X", "banco", {"fecha": "Date", "concepto": "Description", "importe": "Amount", "saldo": "Balance"}, "Nómina")
        r = self.importar(ruta)
        self.assertEqual((r["ok"], r["nuevas"]), (True, 2))
        self.assertEqual(sorted(m["categoria"] for m in self.movs()), ["Suministros", "Supermercado"])

    def test_cargo_y_abono(self):
        ruta = os.path.join(self.c.banco, "b.csv")
        escribir(ruta, "cp1252", "Fecha;Concepto;Cargo;Abono\n01/09/2026;Mercadona;23,10;\n03/09/2026;Nómina;;1500,00\n")
        IM.crear_perfil(self.a, "Banco Y", "banco", {"fecha": "Fecha", "concepto": "Concepto", "cargo": "Cargo", "abono": "Abono"}, "Nómina")
        r = self.importar(ruta)
        self.assertEqual(r["nuevas"], 2)
        self.assertEqual(sorted((m["clase"], m["importe"]) for m in self.movs()), [("gasto", 23.1), ("ingreso", 1500.0)])

class TestInversion(Base):
    CSV = ("Fecha de operación;Fecha valor;Concepto;Importe\n"
           "01/09/2026;01/09/2026;Ahorro;200,00\n"
           "10/09/2026;10/09/2026;FIDELITY MSCI WORLD INDEX;-150,00\n"
           "12/09/2026;12/09/2026;ISHARES GOLD ETC;-50,00\n"
           "30/09/2026;30/09/2026;Periodo 01/09/2026 30/09/2026;0,45\n")
    def csv(self, nombre="mi.csv"):
        ruta = os.path.join(self.c.inversion, nombre); escribir(ruta, "utf-8", self.CSV); return ruta
    def test_importa_y_aprende(self):
        r = IM.importar_archivo(self.a, self.c, self.csv(), "inversion", "Bróker")
        self.assertEqual((r["nuevas"], r["dudas"]), (2, 2))  # compra MSCI + intereses; dudas: entrada y oro
        self.assertEqual([(x["activo"], x["importe"]) for x in self.a.todos("aportacion")], [("Fondo MSCI", 150.0)])
        self.assertEqual([(m["clase"], m["importe"], m["cuenta"]) for m in self.movs()], [("ingreso", 0.45, "Bróker")])
        self.a.guardar("activo", {"nombre": "Oro", "clase": "etf", "cuenta": "Bróker"})
        for p in self.a.todos("pendiente"):
            if "GOLD" in p["fila"]["texto"]: IM.resolver(self.a, p["id"], {"accion": "activo", "activo": "Oro", "recordar": True, "patron": "ishares gold"})
            else: IM.resolver(self.a, p["id"], {"accion": "ignorar", "recordar": True, "patron": "ahorro"})
        r = IM.importar_archivo(self.a, self.c, self.csv("mi2.csv"), "inversion", "Bróker")
        self.assertEqual((r["nuevas"], r["dudas"]), (0, 0))
        self.assertIn("ishares gold", next(a for a in self.a.todos("activo") if a["nombre"] == "Oro")["patrones"])

class TestBase(Base):
    def test_renombrar_propaga(self):
        self.importar(self.extracto())
        c = next(x for x in self.a.todos("cuenta") if x["nombre"] == "Ahorro")
        self.a.guardar("cuenta", {**c, "nombre": "Colchón"}, c["id"])
        self.assertTrue(any(m.get("destino") == "Colchón" for m in self.movs()))
    def test_nombres_unicos(self):
        with self.assertRaises(ValueError): self.a.guardar("cuenta", {"nombre": "nómina".capitalize().replace("o", "ó")})
    def test_validacion(self):
        with self.assertRaises(ValueError): self.a.guardar("movimiento", {"fecha": "ayer", "importe": 3, "concepto": "x"})
        with self.assertRaises(ValueError): self.a.guardar("movimiento", {"fecha": "2026-01-01", "importe": -3, "concepto": "x"})
    def test_copias(self):
        p = self.a.copia(self.c.copias, forzar=True)
        self.assertTrue(os.path.exists(p))

class TestLectura(unittest.TestCase):
    def test_numeros(self):
        for txt, n in [("1.234,56", 1234.56), ("-12,30", -12.3), ("1,234.56", 1234.56), ("1234.5", 1234.5), ("12,30 €", 12.3), ("(5,00)", -5.0), ("abc", None), ("", None), ("1.234.567", 1234567)]:
            self.assertEqual(L.numero(txt), n, txt)
    def test_fechas(self):
        for txt in ("05/09/2026", "2026-09-05", "05-09-2026", "05/09/26", datetime.date(2026, 9, 5)):
            self.assertEqual(L.fecha(txt), "2026-09-05")

if __name__ == "__main__":
    unittest.main()

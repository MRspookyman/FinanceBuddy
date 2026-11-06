# Pruebas de la importación y la base de datos (sin navegador). Uso: python -m unittest pruebas.test_importar -v
import datetime, io, os, shutil, sys, tempfile, unittest
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from financebuddy import importar as IM, lectura as L, plantilla, rutas
from financebuddy.almacen import Almacen

def escribir(ruta, enc, texto):
    with io.open(ruta, "w", encoding=enc) as fh: fh.write(texto)

def excel_santander(ruta, filas, saldo_inicial=1000.0, romper=False, iban="ES00 0000 0000 0000 0000", titular=None):
    """filas: [(fecha ISO, concepto, importe)] en orden cronológico → Excel con el formato de Santander (más reciente arriba)."""
    import openpyxl
    wb = openpyxl.Workbook(); ws = wb.active
    ws.append([None, None, "Cuenta", "Fecha"]); ws.append([None, None, iban, "30/09/2026 | 10:00:00"])
    ws.append([None, None, "Titular", "Saldo"]); ws.append([None, None, titular or "", "1.000,00€ EUR"])
    ws.append(["Movimientos de la cuenta"]); ws.append([])
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
    def test_referencia_de_extracto_cuenta_movimientos_intermedios(self):
        self.a.set_config("saldo_extracto:Nómina", {"fecha": "2026-07-31", "saldo": 1000})
        # Agosto ya entró de un archivo sin saldo, además de un gasto escrito a mano.
        self.a.guardar("movimiento", {"fecha": "2026-08-15", "cuenta": "Nómina", "clase": "gasto", "importe": 100, "concepto": "Compra inventada",
                                      "ext_fecha": "2026-08-15", "ext_importe": -100, "ext_texto": "Compra inventada"})
        self.a.guardar("movimiento", {"fecha": "2026-08-20", "cuenta": "Nómina", "clase": "gasto", "importe": 20, "concepto": "Gasto manual"})
        r = self.importar(self.extracto([("2026-09-01", "Compra Lidl", -10)], saldo_inicial=880))
        self.assertTrue(r["ok"], r)
        self.assertNotIn("hueco", r)
        self.assertEqual(r["saldo_igualado"]["saldo"], 870)

    def test_usos_no_cuenta_dos_veces_la_procedencia_del_saldo(self):
        self.a.guardar("patrimonio", {"fecha": "2026-08-31", "saldos": {"Nómina": 1000}, "origen_saldos": {"Nómina": "manual"}})
        cuenta = next(c for c in self.a.todos("cuenta") if c["nombre"] == "Nómina")
        self.assertEqual(dict(self.a.usos("cuenta", cuenta))["patrimonio"], 1)

    def test_pide_la_cuenta_la_primera_vez(self):
        with self.assertRaises(IM.NecesitaCuenta): IM.importar_archivo(self.a, self.c, self.extracto(), "banco")
        r = self.importar(self.extracto())
        self.assertTrue(r["ok"])
        self.assertEqual(next(p for p in self.a.todos("perfil") if p["nombre"] == "Santander")["cuenta"], "Nómina")
        r2 = IM.importar_archivo(self.a, self.c, self.extracto(nombre="otro.xlsx"), "banco")  # ya no pregunta
        self.assertTrue(r2["ok"])

    def test_clasifica(self):
        r = self.importar(self.extracto())
        self.assertEqual((r["nuevas"], r["dudas"]), (5, 3))
        por = {m["ext_texto"]: m for m in self.movs()}
        self.assertEqual(por["Compra Mercadona, Madrid, Tarj. :*1234"]["categoria"], "Supermercado")
        self.assertEqual(next(p for p in self.a.todos("pendiente") if "Ana Ruiz" in p["fila"]["texto"])["fila"]["cat"], "Comer fuera")
        self.assertEqual((por["Traspaso: Ahorro"]["clase"], por["Traspaso: Ahorro"].get("destino")), ("transferencia", "Ahorro"))
        self.assertEqual((por["Transferencia Nomina Empresa SL"]["clase"], por["Transferencia Nomina Empresa SL"]["categoria"]), ("ingreso", "Nómina"))
        self.assertEqual(sum(1 for m in self.movs() if m["ext_texto"] == "Compra Lidl, Madrid"), 2)
        self.assertEqual(len(self.a.todos("pendiente")), 3)
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
        self.assertEqual((len(self.movs()), len(self.a.todos("pendiente"))), (5, 3))

    def test_resolver_y_aprender(self):
        self.importar(self.extracto())
        p = next(x for x in self.a.todos("pendiente") if "Ferreteria" in x["fila"]["texto"])
        IM.resolver(self.a, p["id"], {"accion": "guardar", "clase": "gasto", "categoria": "Hogar", "concepto": "Ferretería", "proxima": "siempre", "patron": "ferreteria lopez"})
        q = next(x for x in self.a.todos("pendiente") if "Juan" in x["fila"]["texto"])
        IM.resolver(self.a, q["id"], {"accion": "ignorar"})
        b = next(x for x in self.a.todos("pendiente") if "Ana Ruiz" in x["fila"]["texto"])
        IM.resolver(self.a, b["id"], {"clase": "gasto", "categoria": "Comer fuera", "proxima": "preguntar"})
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
        msg = IM.resolver(self.a, p["id"], {"accion": "guardar", "clase": "gasto", "categoria": "Hogar", "proxima": "siempre", "patron": "ferreteria lopez"})
        self.assertIn("1 más", msg)
        self.assertEqual((len(self.a.todos("pendiente")), sorted(m["importe"] for m in self.movs())), (0, [5.0, 7.0]))

    def test_traspaso_desconocido_a_otra_cuenta(self):
        self.importar(self.extracto([("2026-09-01", "Traspaso interno cuenta 9999", -100.0)]))
        p = self.a.todos("pendiente")[0]
        IM.resolver(self.a, p["id"], {"accion": "guardar", "clase": "transferencia", "cuenta_otra": "Bróker", "proxima": "siempre", "patron": "cuenta 9999"})
        m = self.movs()[0]
        self.assertEqual((m["clase"], m.get("destino")), ("transferencia", "Bróker"))
        self.importar(self.extracto([("2026-09-01", "Traspaso interno cuenta 9999", -100.0), ("2026-10-01", "Traspaso interno cuenta 9999", -100.0)], nombre="c.xlsx"))
        self.assertEqual(sum(1 for m in self.movs() if m.get("destino") == "Bróker"), 2)

    def test_regla_de_traspaso_al_importar_la_otra_cuenta_no_es_un_traspaso_a_si_misma(self):
        # La regla se aprendió en Nómina («Traspaso: ahorro» → Ahorro). Al importar el extracto de Ahorro, el mismo texto no puede
        # ser un traspaso de Ahorro a Ahorro: con más de una cuenta posible se pregunta; con una sola, es esa.
        self.a.guardar("regla", {"patron": "traspaso: ahorro", "clase": "transferencia", "cuenta_otra": "Ahorro", "origen": "usuario"})
        self.importar(self.extracto([("2026-09-01", "Traspaso: Ahorro", 100.0)], nombre="ahorro.xlsx"), cuenta="Ahorro")
        self.assertFalse([m for m in self.movs() if m["cuenta"] == m.get("origen") or m["cuenta"] == m.get("destino")])
        self.assertEqual(len([p for p in self.a.todos("pendiente") if p["cuenta"] == "Ahorro"]), 1)
        # importar su extracto marca la cuenta como «importa extracto» (sus traspasos llegan en él, no se suman desde la otra)
        self.assertTrue(next(c for c in self.a.todos("cuenta") if c["nombre"] == "Ahorro").get("extracto"))
        broker = next(c for c in self.a.todos("cuenta") if c["nombre"] == "Bróker")
        self.a.borrar("cuenta", broker["id"])
        self.importar(self.extracto([("2026-09-15", "Traspaso: Ahorro", 50.0)], nombre="ahorro2.xlsx"), cuenta="Ahorro")
        m = next(m for m in self.movs() if m["fecha"] == "2026-09-15")
        self.assertEqual((m["cuenta"], m.get("origen")), ("Ahorro", "Nómina"))

    def test_saldos_rotos_no_importa_nada(self):
        r = self.importar(self.extracto(romper=True))
        self.assertFalse(r["ok"])
        self.assertIn("no cuadran", r["mensaje"])
        self.assertEqual(len(self.movs()), 0)

    def test_saldos_con_los_dias_al_reves_dentro_de_cada_dia_se_ordenan(self):
        # Días de más reciente a más antiguo, pero cada día en orden cronológico: los saldos cuadran si se reordena dentro del día
        ruta = os.path.join(self.c.banco, "mixto.csv")
        escribir(ruta, "utf-8", "Fecha;Concepto;Importe;Saldo\n02/09/2026;Nomina Empresa SL;1500,00;2470,00\n02/09/2026;Bar Pepe;-30,00;2440,00\n"
                                "01/09/2026;Mercadona;-20,00;980,00\n01/09/2026;Lidl;-10,00;970,00\n")
        IM.crear_perfil(self.a, "Banco M", "banco", {"fecha": "Fecha", "concepto": "Concepto", "importe": "Importe", "saldo": "Saldo"}, "Nómina")
        r = self.importar(ruta)
        self.assertTrue(r["ok"], r.get("mensaje"))
        self.assertEqual(r["nuevas"] + r["dudas"], 4)
        self.assertEqual(self.a.config("saldo_extracto:Nómina"), {"fecha": "2026-09-02", "saldo": 2440.0})
        # Si dentro del día no hay orden posible, sigue sin importarse
        filas = [{"op": "2026-09-02", "texto": "A", "importe": 10.0, "saldo": 1010.0}, {"op": "2026-09-01", "texto": "B", "importe": -5.0, "saldo": 990.0}]
        self.assertIn("no cuadran", IM.ordenar_y_comprobar_saldos(filas)[1])

    def test_apuntado_a_mano_no_se_duplica(self):
        self.a.guardar("movimiento", {"fecha": "2026-09-01", "clase": "gasto", "categoria": "Supermercado", "importe": 45.2, "concepto": "Súper", "cuenta": "Nómina"})
        r = self.importar(self.extracto())
        self.assertEqual(r["nuevas"], 4)

    def test_apuntado_a_mano_dias_antes_se_enlaza(self):
        self.a.guardar("movimiento", {"fecha": "2026-09-03", "clase": "gasto", "categoria": "Hogar", "importe": 12.5, "concepto": "Tornillos", "cuenta": "Nómina"})
        self.a.guardar("movimiento", {"fecha": "2026-09-10", "clase": "ingreso", "categoria": "Otros ingresos", "importe": 10.0, "concepto": "No es la compra", "cuenta": "Nómina"})
        self.importar(self.extracto())
        tornillos = [m for m in self.movs() if m["importe"] == 12.5]
        self.assertEqual(len(tornillos), 1)
        self.assertEqual((tornillos[0]["concepto"], tornillos[0]["ext_fecha"]), ("Tornillos", "2026-09-05"))
        self.assertEqual(sum(1 for m in self.movs() if m["importe"] == 10.0), 3)  # el ingreso a mano no se confunde con las compras de 10 €
        r = self.importar(self.extracto(nombre="otra.xlsx"))
        self.assertEqual(r["nuevas"], 0)

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

    def test_importe_con_miles_incoherente_va_a_ilegibles(self):
        ruta = os.path.join(self.c.banco, "miles.csv")
        escribir(ruta, "utf-8", "Fecha;Concepto;Importe\n01/09/2026;Mercadona;-1.234\n02/09/2026;Lidl;-12.345.6\n")
        IM.crear_perfil(self.a, "Banco M", "banco", {"fecha": "Fecha", "concepto": "Concepto", "importe": "Importe"}, "Nómina")
        r = self.importar(ruta)
        self.assertEqual(sorted(m["importe"] for m in self.movs()), [1234.0])
        self.assertEqual([(x["fila"], x["que"], x["valor"]) for x in r["ilegibles"]], [(3, "el importe", "-12.345.6")])

    def test_las_filas_que_no_se_leen_se_avisan_y_lo_demas_se_importa(self):
        ruta = os.path.join(self.c.banco, "a_mano.csv")
        escribir(ruta, "utf-8", "Fecha;Concepto;Importe\n01/09/2026;Mercadona;-23,45\n2026-09-03T10:15:00Z;Lidl;-9,90\n05/09/2026;Kiosko;-3,2O\n31/02/2026;Farmacia;-7,00\n\nTotal;;-43,55\n")
        IM.crear_perfil(self.a, "Banco Z", "banco", {"fecha": "Fecha", "concepto": "Concepto", "importe": "Importe"}, "Nómina")
        r = self.importar(ruta)
        self.assertEqual((r["ok"], r["nuevas"] + r["dudas"]), (True, 2))  # la fecha con «T» se entiende: son dos movimientos
        # Las dos que no: un importe con una O por un cero y un día que no existe. La línea en blanco y el total no son movimientos.
        self.assertEqual([(x["fila"], x["que"], x["valor"], x["texto"]) for x in r["ilegibles"]], [(4, "el importe", "-3,2O", "Kiosko"), (5, "la fecha", "31/02/2026", "Farmacia")])
        self.assertIn("⚠ 2 filas no se han podido leer (la primera, la fila 4: no entiendo el importe «-3,2O»)", r["mensaje"])

    def test_con_saldo_una_fila_ilegible_no_cuadra_y_el_error_dice_cual(self):
        ruta = os.path.join(self.c.banco, "con_saldo.csv")
        escribir(ruta, "utf-8", "Fecha;Concepto;Importe;Saldo\n03/09/2026;Lidl;-10,00;956,55\n02/09/2026;Kiosko;-1O,00;966,55\n01/09/2026;Mercadona;-23,45;976,55\n")
        IM.crear_perfil(self.a, "Banco S", "banco", {"fecha": "Fecha", "concepto": "Concepto", "importe": "Importe", "saldo": "Saldo"}, "Nómina")
        r = self.importar(ruta)
        self.assertFalse(r["ok"])
        self.assertIn("no cuadran", r["mensaje"]); self.assertIn("en la fila 3 no entiendo el importe «-1O,00»", r["mensaje"])
        self.assertEqual(self.movs(), [])
        # y si no se lee ninguna, se dice por qué en vez de «el archivo no tiene movimientos»
        escribir(ruta, "utf-8", "Fecha;Concepto;Importe;Saldo\n2026/9;Lidl;-10,00;956,55\n")
        with self.assertRaises(ValueError) as e: self.importar(ruta)
        self.assertIn("no entiendo la fecha «2026/9» (fila 2)", str(e.exception))

    def test_manda_lo_que_el_archivo_es_por_dentro_no_su_extension(self):
        import openpyxl
        IM.crear_perfil(self.a, "Banco X", "banco", {"fecha": "Fecha", "concepto": "Concepto", "importe": "Importe"}, "Nómina")
        en = lambda nombre: os.path.join(self.c.banco, nombre)
        # un .xlsx al que el banco llama .xls
        wb = openpyxl.Workbook(); ws = wb.active
        ws.append(["Fecha", "Concepto", "Importe"]); ws.append([datetime.datetime(2026, 9, 1), "Mercadona", -23.45])
        wb.save(en("a.xlsx")); os.replace(en("a.xlsx"), en("a.xls"))
        # el «Texto Unicode» de Excel (UTF-16 con tabuladores) y un texto con tabuladores llamado .xls
        escribir(en("b.csv"), "utf-16", "Fecha\tConcepto\tImporte\n02/09/2026\tMercadona\t-11,10\n")
        escribir(en("c.xls"), "cp1252", "Fecha\tConcepto\tImporte\n03/09/2026\tMercadona\t-12,20\n")
        for nombre in ("a.xls", "b.csv", "c.xls"):
            r = self.importar(en(nombre))
            self.assertEqual((r["ok"], r["nuevas"]), (True, 1), nombre)
        self.assertEqual(sorted(m["importe"] for m in self.movs()), [11.1, 12.2, 23.45])
        # lo que no se puede leer se dice claro, no con el error de la librería
        escribir(en("d.xls"), "utf-8", "<html><body><table><tr><td>Fecha</td><td>Concepto</td><td>Importe</td></tr></table></body></html>")
        with io.open(en("e.xlsx"), "wb") as fh: fh.write(b"")
        with io.open(en("f.xls"), "wb") as fh: fh.write(b"\xd0\xcf\x11\xe0" + b"\x00" * 600)
        with io.open(en("g.xlsx"), "wb") as fh: fh.write(b"PK\x03\x04" + b"no es un excel")
        for nombre, texto in (("d.xls", "no es un Excel de verdad"), ("e.xlsx", "está vacío"), ("f.xls", "protegido con contraseña o dañado"), ("g.xlsx", "No se puede leer como Excel")):
            with self.assertRaises(ValueError) as e: self.importar(en(nombre))
            self.assertIn(texto, str(e.exception), nombre)

class TestAprender(Base):
    """Lo que la app aprende sola: tu historial, los grupos de «Por revisar» y los cambios de categoría."""
    def test_limpia_tarjetas_enmascaradas(self):
        from financebuddy import clasificar as C
        self.assertEqual(C.patron_sugerido("COMPRA TARJ. 5540XXXXXXXX1234 MERCADONA VALENCIA"), "mercadona valencia")
        self.assertEqual(C.patron_sugerido("RECIBO /VODAFONE ESPANA SAU"), "vodafone espana sau")
        self.assertEqual(C.comercio("TRANSACCION CONTACTLESS EN BAR PEPE 00123, MADRID ES"), "Bar Pepe")

    def test_recuerda_sin_regla(self):
        # Resolver sin regla no autoriza clasificar la próxima importación.
        self.importar(self.extracto([("2026-09-05", "Pago Movil En Ferreteria Lopez, Madrid", -12.5)]))
        p = self.a.todos("pendiente")[0]
        IM.resolver(self.a, p["id"], {"accion": "guardar", "clase": "gasto", "categoria": "Hogar"})
        r = self.importar(self.extracto([("2026-09-05", "Pago Movil En Ferreteria Lopez, Madrid", -12.5), ("2026-09-20", "Pago Movil En Ferreteria Lopez, Madrid", -8.0)], nombre="b.xlsx"))
        self.assertEqual((r["nuevas"], r["dudas"]), (0, 1))
        self.assertEqual([m for m in self.movs() if m["fecha"] == "2026-09-20"], [])
        self.assertFalse(any(x.get("origen") == "usuario" for x in self.a.todos("regla")))

    def test_sugerencia_por_parecido(self):
        from financebuddy import clasificar as C
        mem = C.memoria([{"clase": "gasto", "categoria": "Hogar", "ext_texto": "Pago Movil En Ferreteria Lopez, Madrid"}])
        s = C.sugerir("Pago Movil En Ferreteria Lopes, Getafe", -9.0, mem)
        self.assertEqual((s["categoria"], s["clase"]), ("Hogar", "gasto"))
        self.assertIn("parecido", s["motivo"])
        self.assertIsNone(C.sugerir("Pago Movil En Joyeria Sol", -9.0, mem))
        s = C.sugerir("Pago Movil En Ferreteria Lopez, Madrid", 9.0, mem)  # te lo devuelven
        self.assertEqual(s["clase"], "reembolso")

    def test_resolver_un_grupo(self):
        filas = [("2026-09-01", "Pago Movil En Kiosko Ana, Madrid", -2.0), ("2026-09-02", "Pago Movil En Kiosko Ana, Madrid", -3.0),
                 ("2026-09-03", "Pago Movil En Joyeria Sol, Madrid", -30.0)]
        self.importar(self.extracto(filas))
        P = self.a.todos("pendiente")
        kiosko = [p["id"] for p in P if "Kiosko" in p["fila"]["texto"]]
        msg = IM.resolver(self.a, kiosko[0], {"accion": "guardar", "clase": "gasto", "categoria": "Ocio", "ids": kiosko})
        self.assertIn("1 más", msg)
        self.assertEqual([p["fila"]["texto"] for p in self.a.todos("pendiente")], ["Pago Movil En Joyeria Sol, Madrid"])

    def test_recategorizar_parecidos_y_recordar(self):
        filas = [("2026-09-01", "Compra Mercadona, Madrid", -10.0), ("2026-09-08", "Compra Mercadona, Madrid", -20.0), ("2026-09-09", "Compra Lidl, Madrid", -5.0)]
        self.importar(self.extracto(filas))
        m = next(x for x in self.movs() if x["importe"] == 10.0)
        self.assertEqual(IM.parecidos(self.a, m["id"])["n"], 1)
        msg = IM.recategorizar(self.a, m["id"], {"categoria": "Hogar", "parecidos": True, "recordar": True})
        self.assertIn("1 más", msg)
        self.assertEqual(sorted((x["ext_texto"][:14], x["categoria"]) for x in self.movs()),
                         [("Compra Lidl, M", "Supermercado"), ("Compra Mercado", "Hogar"), ("Compra Mercado", "Hogar")])
        regla = next(x for x in self.a.todos("regla") if x.get("origen") == "usuario")
        self.assertEqual((regla["patron"], regla["categoria"]), ("mercadona", "Hogar"))
        r = self.importar(self.extracto(filas + [("2026-09-20", "Compra Mercadona, Madrid", -7.0)], nombre="c.xlsx"))
        self.assertEqual(r["nuevas"], 1)
        self.assertEqual([x["categoria"] for x in self.movs() if x["fecha"] == "2026-09-20"], ["Hogar"])
        with self.assertRaises(ValueError): IM.recategorizar(self.a, m["id"], {"categoria": "No existe"})

    def test_parecidos_dice_si_ya_hay_una_regla_tuya_de_ese_comercio(self):
        """La pantalla marca sola «cambiar los demás y recordarlo» solo la primera vez: si ya hay una regla tuya de ese
        comercio, sale desactivado (lo que manda es la regla) y para eso necesita saber que existe y a dónde manda."""
        self.importar(self.extracto([("2026-09-01", "Compra Mercadona, Madrid", -10.0), ("2026-09-08", "Compra Mercadona, Madrid", -20.0)]))
        m = next(x for x in self.movs() if x["importe"] == 10.0)
        r = IM.parecidos(self.a, m["id"])
        self.assertEqual((r["n"], r["regla"]), (1, None))  # la primera vez no hay nada tuyo
        IM.recategorizar(self.a, m["id"], {"categoria": "Hogar", "parecidos": True, "recordar": True})
        r = IM.parecidos(self.a, m["id"])
        self.assertEqual(r["regla"]["categoria"], "Hogar")
        self.assertTrue(self.a.obtener("regla", r["regla"]["id"]))
        # Una regla de la plantilla no cuenta: sobre esa sí se puede poner la tuya desde ahí
        self.a.borrar("regla", r["regla"]["id"])
        self.assertIsNone(IM.parecidos(self.a, m["id"])["regla"])

    def test_categoria_icono_y_color(self):
        i = self.a.guardar("categoria", {"nombre": "Pádel", "grupo": "variable", "icono": "🎾", "color": "#12AB34"})
        self.assertEqual(self.a.obtener("categoria", i)["color"], "#12AB34")
        with self.assertRaises(ValueError): self.a.guardar("categoria", {"nombre": "X", "color": "red;}"})

class TestExtractosReales(Base):
    """Lo aprendido con extractos reales: titular e IBAN de la cabecera, traspasos cruzados, reglas nuevas, bróker."""
    def test_gasolina_no_es_suministros_y_bizum_no_reparte_recibos(self):
        filas = [("2026-08-20", "Bizum a favor de Ana Ruiz concepto gasofa", -10.0),
                 ("2026-09-02", "Compra Anthropic* Claude Sub, San Francisco, Tarjeta 5163830304139456 , Comision 0,00", -200.0),
                 ("2026-09-02", "Bizum de Pedro Gil concepto sin concepto", 7.0)]
        self.importar(self.extracto(filas))
        cat = {m["ext_texto"][:10]: (m["clase"], m.get("categoria")) for m in self.movs()}
        self.assertEqual(next(p for p in self.a.todos("pendiente") if "gasofa" in p["fila"]["texto"])["fila"]["cat"], "Coche")
        self.assertNotIn("Bizum de P", cat)  # sin gasto que repartir cerca (la suscripción no cuenta): se pregunta
        self.assertEqual(len(self.a.todos("pendiente")), 2)

    def test_reglas_nuevas_y_prefijos_de_pago(self):
        from financebuddy import clasificar as C
        reglas = C.ordenar_reglas(self.a.todos("regla"))
        cat = lambda t: (C.regla_para(t, reglas) or {}).get("categoria")
        self.assertEqual(cat("COMPRA BET365, PALMA DEMALLO, TARJETA 5163830304139456 , COMISION 0,00"), "Apuestas")
        self.assertEqual(cat("TRANSACCION CONTACTLESS EN E S EUROPA, ANDUJAR ES, TARJ. :*139456"), "Coche")
        self.assertEqual(cat("PAGO MOVIL EN BURGUER TOMAS, JAEN ES"), "Comer fuera")
        self.assertEqual(C.patron_sugerido("PAGO MOVIL EN SQ *ESTACION JAE, JAEN ES"), "estacion jae")
        self.assertEqual(C.patron_sugerido("COMPRA WL *STEAM PURCHASE, BELLEVUE"), "steam purchase")
        self.assertEqual(C.patron_sugerido("TRANSACCION CONTACTLESS EN 12229 PULL AND, JAEN ES"), "pull and")

    def test_plantilla_nueva_llega_a_instalaciones_existentes(self):
        cat = next(c for c in self.a.todos("categoria") if c["nombre"] == "Apuestas")
        self.a.borrar("categoria", cat["id"])
        for r in self.a.todos("regla"):
            if r["patron"] == "bet365": self.a.borrar("regla", r["id"])
        self.a.guardar("regla", {"patron": "mercadona", "categoria": "Hogar", "clase": "gasto", "origen": "usuario"})
        self.a.set_config("plantilla_version", 1)
        plantilla.instalar(self.a)
        self.assertTrue(any(c["nombre"] == "Apuestas" for c in self.a.todos("categoria")))
        self.assertTrue(any(r["patron"] == "bet365" for r in self.a.todos("regla")))
        self.assertEqual(sum(r["patron"] == "mercadona" for r in self.a.todos("regla")), 2)  # la del usuario sigue, no se duplica la de serie
        n = len(self.a.todos("regla")); plantilla.instalar(self.a); self.assertEqual(len(self.a.todos("regla")), n)

    def test_b137_pregunta_incluye_identidad_sin_agrupar_otras_cuentas(self):
        for numero in ("4444", "5555"):
            ruta = self.extracto(nombre=f"identidad-{numero}.xlsx", iban=f"ES12 0049 1111 2222 3333 {numero}")
            with self.assertRaises(IM.NecesitaCuenta) as error:
                IM.importar_archivo(self.a, self.c, ruta, "banco")
            self.assertEqual(error.exception.info["iban"], numero)
            self.assertEqual(error.exception.info["perfil"], "Santander")
        self.assertFalse(self.movs())

    def test_cuenta_por_iban_y_titular(self):
        self.a.guardar("cuenta", {"nombre": "Otra", "tipo": "corriente", "extracto": True})
        r = self.importar(self.extracto(FILAS, iban="ES12 0049 1111 2222 3333 4444", titular="GARCIA LOPEZ ANA"))
        self.assertTrue(r["ok"])
        self.assertEqual(next(c for c in self.a.todos("cuenta") if c["nombre"] == "Nómina")["iban"], "4444")
        self.assertEqual(self.a.config("titulares"), ["GARCIA LOPEZ ANA"])
        # El mismo formato con otro IBAN: no se da por hecho que sea la cuenta de antes
        with self.assertRaises(IM.NecesitaCuenta): IM.importar_archivo(self.a, self.c, self.extracto(FILAS, nombre="b.xlsx", iban="ES12 0049 1111 2222 3333 5555"), "banco")
        r = IM.importar_archivo(self.a, self.c, self.extracto(FILAS, nombre="b.xlsx", iban="ES12 0049 1111 2222 3333 5555"), "banco", "Otra")
        r = IM.importar_archivo(self.a, self.c, self.extracto(FILAS + [("2026-09-20", "Compra Lidl, Madrid", -3.0)], nombre="c.xlsx", iban="ES12 0049 1111 2222 3333 4444"), "banco")
        self.assertEqual((r["cuenta"], r["nuevas"]), ("Nómina", 1))  # sin preguntar: por el IBAN

    def test_traspaso_a_tu_nombre_se_cruza_con_el_broker(self):
        self.a.set_config("titulares", ["GARCIA LOPEZ ANA"])
        filas = [("2026-08-26", "Transferencia inmediata a favor de Ana García López concepto ahorro", -500.0),
                 ("2026-08-27", "Transferencia de GARCIA LOPEZ ANA, concepto gastos.", 300.0)]
        r = self.importar(self.extracto(filas))
        P = self.a.todos("pendiente")
        self.assertEqual({p["fila"]["clase"] for p in P}, {"transferencia"})  # a tu nombre → traspaso, no gasto/ingreso
        csv = os.path.join(self.c.inversion, "mi.csv")
        escribir(csv, "utf-8", "Fecha de operación;Fecha valor;Concepto;Importe\n26/08/2026;26/08/2026;ahorro;500,00\n")
        r = IM.importar_archivo(self.a, self.c, csv, "inversion", "Bróker")
        self.assertEqual((r["traspasos"], r["dudas"]), (1, 0))
        m = next(m for m in self.movs() if m["importe"] == 500.0)
        self.assertEqual((m["clase"], m.get("destino")), ("transferencia", "Bróker"))
        self.assertEqual([p["fila"]["importe"] for p in self.a.todos("pendiente")], [300.0])  # la otra sigue esperando su cuenta

    def test_broker_crea_activo_para_todo_el_grupo(self):
        from financebuddy import servidor
        csv = os.path.join(self.c.inversion, "mi.csv")
        escribir(csv, "utf-8", "Fecha de operación;Fecha valor;Concepto;Importe\n"
                 "04/09/2026;08/09/2026;FIDELITY PHYSICAL BITCOIN ET @;-55,43\n04/08/2026;06/08/2026;FIDELITY PHYSICAL BITCOIN ET @;-55,45\n"
                 "04/08/2026;06/08/2026;ETF ETFS Copper ETC @ 1;-50,31\n")
        IM.importar_archivo(self.a, self.c, csv, "inversion", "Bróker")
        P = self.a.todos("pendiente")
        sug = IM.sugerencia_inversion(next(p for p in P if "BITCOIN" in p["fila"]["texto"]), self.a.todos("activo"))
        self.assertEqual((sug["nuevo"], sug["clase"]), ("Fidelity Physical Bitcoin", "cripto"))
        cobre = next(p for p in P if "Copper" in p["fila"]["texto"])
        self.assertEqual(IM.sugerencia_inversion(cobre, [])["nuevo"], "ETFS Copper")
        ids = [p["id"] for p in P if "BITCOIN" in p["fila"]["texto"]]
        IM.resolver(self.a, ids[0], {"accion": "activo", "nuevo_activo": "Fidelity Physical Bitcoin", "ids": ids, "recordar": True, "patron": "fidelity physical bitcoin"})
        a = next(x for x in self.a.todos("activo") if x["nombre"] == "Fidelity Physical Bitcoin")
        self.assertEqual((a["clase"], a["patrones"]), ("cripto", ["fidelity physical bitcoin"]))
        self.assertEqual(sorted(x["importe"] for x in self.a.todos("aportacion")), [55.43, 55.45])


class TestBizums(Base):
    """Bizums recibidos: la parte que te devuelven de un gasto que pagaste tú (bizums.py)."""
    def reparto(self, extra=()):
        # El 15 pagas 97,84 € en el súper; el 16 te mandan 4 Bizums de ~19,56 € (97,84 ÷ 5: tú incluido)
        filas = [("2026-09-10", "Pago Movil En Gimnasio Zeus, Jaen", -30.00),
                 ("2026-09-15", "Pago Movil En Mercadona Aguad, Jaen, Tarj. :*1234", -97.84),
                 ("2026-09-16", "Bizum de Ana Ruiz Lopez", 19.56), ("2026-09-16", "Bizum de Luis Perez Gil", 19.6),
                 ("2026-09-16", "Bizum de Eva Sanz Diaz", 19.56), ("2026-09-16", "Bizum de Pablo Cano Rey", 19.56)] + list(extra)
        return self.importar(self.extracto(sorted(filas)))
    def test_reparto_exacto_encuentra_el_gasto_aunque_no_sea_del_dia_anterior(self):
        self.reparto([("2026-09-12", "Pago Movil En Cine Plaza, Jaen", -40.00)])  # otro gasto en medio, más reciente
        self.assertEqual([p for p in self.a.todos("pendiente") if "Bizum" in p["fila"]["texto"]], [])
        reem = [m for m in self.movs() if m["clase"] == "reembolso"]
        self.assertEqual((len(reem), {m["categoria"] for m in reem}), (4, {"Supermercado"}))
        # Y quedan enlazados con el gasto: tu parte real = 97,84 − 78,28 = 19,56
        from financebuddy import bizums
        bizums.enlazar(self.a)
        super_ = next(m for m in self.movs() if m["clase"] == "gasto" and m["importe"] == 97.84)
        self.assertEqual({m["reembolsa"] for m in self.movs() if m["clase"] == "reembolso"}, {super_["id"]})
    def test_no_devuelve_mas_de_lo_que_costo(self):
        from financebuddy import bizums
        self.reparto()
        for i, quien in enumerate(("Mara Gil Ron", "Rosa Gil Ron")):
            self.a.guardar("movimiento", {"fecha": f"2026-09-1{7 + i}", "clase": "reembolso", "categoria": "Supermercado", "importe": 19.56, "concepto": f"Otro{i}",
                                          "cuenta": "Nómina", "ext_texto": f"Bizum de {quien}"})
        bizums.enlazar(self.a)
        extra = {m["concepto"]: m for m in self.movs() if m["concepto"].startswith("Otro")}
        self.assertIsNotNone(extra["Otro0"].get("reembolsa"))  # 5 × 19,56 = 97,80: cabe
        self.assertIsNone(extra["Otro1"].get("reembolsa"))     # el sexto ya no: no se devuelve más de lo que costó
    def test_los_hermanos_del_reparto_heredan_la_categoria(self):
        filas = [("2026-09-26", "Bizum de Ana Ruiz Lopez concepto comida", 22.12), ("2026-09-26", "Bizum de Luis Perez Gil", 22.12),
                 ("2026-09-26", "Bizum de Eva Sanz Diaz", 22.20), ("2026-09-27", "Bizum de Pablo Cano Rey", 22.12),
                 ("2026-09-26", "Bizum de Otro Distinto Mas", 5.00)]  # importe distinto: no es del reparto
        r = self.importar(self.extracto(sorted(filas)))
        self.assertEqual(r["dudas"], 1, r)
        self.assertEqual({m["categoria"] for m in self.movs() if m["importe"] > 20}, {"Comer fuera"})
        self.assertEqual(self.a.todos("pendiente")[0]["fila"]["importe"], 5.0)
    def test_gasto_de_otro_extracto(self):
        # El gasto está en un extracto anterior (ya importado) y los Bizums llegan en otro
        self.importar(self.extracto([("2026-09-10", "Pago Movil En Restaurante El Pino, Jaen", -60.00)], nombre="a.xlsx"))
        r = self.importar(self.extracto([("2026-09-13", "Bizum de Ana Ruiz Lopez", 15.00), ("2026-09-13", "Bizum de Luis Perez Gil", 15.00),
                                         ("2026-09-13", "Bizum de Eva Sanz Diaz", 15.00)], nombre="b.xlsx", saldo_inicial=940.0))
        self.assertEqual((r["dudas"], r["nuevas"]), (0, 3), r)  # 60 ÷ 4 = 15 (tú + 3)
        self.assertEqual({m["categoria"] for m in self.movs() if m["clase"] == "reembolso"}, {"Comer fuera"})
    def test_sin_gasto_sigue_preguntando(self):
        r = self.importar(self.extracto([("2026-09-13", "Bizum de Ana Ruiz Lopez", 15.00), ("2026-09-13", "Bizum de Luis Perez Gil", 15.00)]))
        self.assertEqual(r["dudas"], 2)
        self.assertIn("parece un reparto", self.a.todos("pendiente")[0]["duda"])
    def test_aritmetica(self):
        from financebuddy import bizums as B
        self.assertTrue(B.parte(97.84, 19.56, 5) and B.parte(97.84, 19.6, 5) and not B.parte(97.84, 20.5, 5))
        self.assertEqual(B.iguales(19.56, "2026-09-16", [{"fecha": "2026-09-16", "importe": 19.6}, {"fecha": "2026-09-17", "importe": 19.56}, {"fecha": "2026-09-20", "importe": 19.56}]), 2)

class TestCobros(Base):
    """Dividendos y comisiones de un activo (registro `cobro`)."""
    CSV = ("Fecha de operación;Fecha valor;Concepto;Importe\n"
           "10/09/2026;10/09/2026;FIDELITY MSCI WORLD INDEX;-150,00\n"
           "20/09/2026;20/09/2026;DIVIDENDO FIDELITY MSCI WORLD INDEX;3,40\n"
           "25/09/2026;25/09/2026;CUPON ISHARES GOLD ETC;1,10\n")
    def importar_csv(self):
        ruta = os.path.join(self.c.inversion, "d.csv"); escribir(ruta, "utf-8", self.CSV)
        return IM.importar_archivo(self.a, self.c, ruta, "inversion", "Bróker")
    def test_dividendo_de_un_activo_conocido_no_es_una_venta(self):
        r = self.importar_csv()  # (el activo «Fondo MSCI» ya existe en la base de las pruebas, con el patrón «msci world»)
        self.assertIn("1 dividendos", r["mensaje"], r)
        cobros = self.a.todos("cobro")
        self.assertEqual([(c["activo"], c["tipo"], c["importe"], c["fecha"]) for c in cobros], [("Fondo MSCI", "dividendo", 3.4, "2026-09-20")])
        self.assertEqual([x["importe"] for x in self.a.todos("aportacion")], [150.0])  # solo la compra: el dividendo no es venta
        # El cupón de un activo que aún no existe espera en «Por revisar», sugerido como dividendo
        p = next(p for p in self.a.todos("pendiente") if "CUPON" in p["fila"]["texto"])
        self.assertEqual(IM.sugerencia_inversion(p, self.a.todos("activo"))["accion"], "dividendo")
        # Reimportar no duplica
        ruta = os.path.join(self.c.inversion, "d2.csv"); escribir(ruta, "utf-8", self.CSV)
        IM.importar_archivo(self.a, self.c, ruta, "inversion", "Bróker")
        self.assertEqual(len(self.a.todos("cobro")), 1)
    def test_resolver_un_dividendo_y_arreglos_de_cartera(self):
        from financebuddy import cartera
        self.a.guardar("activo", {"nombre": "Oro", "clase": "etf", "cuenta": "Bróker"})
        self.importar_csv()
        p = next(p for p in self.a.todos("pendiente") if "CUPON" in p["fila"]["texto"])
        with self.assertRaises(ValueError): IM.resolver(self.a, p["id"], {"accion": "dividendo"})  # falta el activo
        IM.resolver(self.a, p["id"], {"accion": "dividendo", "activo": "Oro"})
        self.assertEqual(sorted((c["activo"], c["importe"]) for c in self.a.todos("cobro")), [("Fondo MSCI", 3.4), ("Oro", 1.1)])
        self.assertEqual(self.a.todos("pendiente"), [])
        # Renombrar propaga y unir lo pasa al destino; borrar se lleva los dividendos y no reaparecen
        oro = next(a for a in self.a.todos("activo") if a["nombre"] == "Oro")
        self.a.guardar("activo", {**oro, "nombre": "Oro físico"}, oro["id"])
        self.assertIn("Oro físico", [c["activo"] for c in self.a.todos("cobro")])
        ids = {a["nombre"]: a["id"] for a in self.a.todos("activo")}
        cartera.unir(self.a, ids["Oro físico"], ids["Fondo MSCI"])
        self.assertEqual({c["activo"] for c in self.a.todos("cobro")}, {"Fondo MSCI"})
        cartera.borrar(self.a, ids["Fondo MSCI"])
        self.assertEqual(self.a.todos("cobro"), [])
        self.assertEqual(len([i for i in self.a.todos("ignorado")]), 3)  # compra + 2 dividendos: no reaparecen

class TestParticipaciones(Base):
    def test_participaciones_y_tipo(self):
        self.assertEqual((IM.participaciones("ETF ETFS Copper ETC @ 2", -90.6), IM.participaciones("ETF ETFS Copper ETC @ 2", 90.6)), (-2.0, 2.0))
        self.assertIsNone(IM.participaciones("FIDELITY PHYSICAL BITCOIN ET @", 5))
        self.assertEqual([IM.clase_activo(t) for t in ("ISHARES PHYSICAL GOLD ETC", "ETF ETFS Copper ETC", "FIDELITY S&P 500 INDEX P ACC")], ["materia", "materia", "fondo"])
        self.a.guardar("activo", {"nombre": "Cobre", "clase": "materia", "cuenta": "Bróker", "patrones": ["copper"], "aportado_inicial": 0})
        csv = os.path.join(self.c.inversion, "c.csv")
        escribir(csv, "utf-8", "Fecha de operación;Fecha valor;Concepto;Importe\n27/04/2026;29/04/2026;ETF ETFS Copper ETC @ 2;-90,63\n26/05/2026;28/05/2026;ETF ETFS Copper ETC @ 1;47,10\n")
        IM.importar_archivo(self.a, self.c, csv, "inversion", "Bróker")
        self.assertEqual(sorted((x["importe"], x["participaciones"]) for x in self.a.todos("aportacion")), [(-47.1, -1.0), (90.63, 2.0)])

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

    def test_confirmar_una_compra_la_enlaza_con_su_plan_fijo(self):
        # Sin el enlace, la compra confirmada y la aportación automática del plan sumarían las dos en el mismo mes
        self.a.guardar("activo", {"nombre": "Oro", "clase": "etf", "cuenta": "Bróker"})
        for nombre, importe in (("Plan grande", 200), ("Plan oro", 50)):
            self.a.guardar("recurrente", {"nombre": nombre, "clase": "aportacion", "importe": importe, "dia": 12, "desde": "2026-01-01",
                                          "activo_inversion": "Oro", "cuenta": "Bróker"})
        IM.importar_archivo(self.a, self.c, self.csv(), "inversion", "Bróker")
        p = next(p for p in self.a.todos("pendiente") if "GOLD" in p["fila"]["texto"])
        IM.resolver(self.a, p["id"], {"accion": "activo", "activo": "Oro"})
        self.assertEqual([(x["importe"], x.get("recurrente")) for x in self.a.todos("aportacion") if x["activo"] == "Oro"], [(50.0, "Plan oro")])  # el de 200 € no es el suyo

    def test_sin_broker_no_ofrece_otras_cuentas(self):
        self.a.borrar("cuenta", next(c for c in self.a.todos("cuenta") if c["tipo"] == "broker")["id"])
        with self.assertRaises(IM.NecesitaCuenta) as e: IM.importar_archivo(self.a, self.c, self.csv(), "inversion")
        self.assertEqual(e.exception.info["cuentas"], [])

class TestOperaciones(Base):
    """Órdenes de fondos (CSV de MyInvestor: ISIN, importe, participaciones, estado) y Excel de operaciones con títulos."""
    ORDENES = ("Fecha de la orden;ISIN;Importe estimado;Nº de participaciones;Estado\n"
               "12/03/2026;IE00BYX5MX67;500.2 EUR;30,5;Finalizada\n"
               "10/03/2026;FR0000989626;500 EUR;0,011;Finalizada\n"
               "02/04/2026;LU9999999991;80 EUR;1,5;Finalizada\n"
               "01/04/2026;LU0034353002;300 EUR;;Cancelada\n"
               "04/03/2026;FR0000989626;1000 EUR;0,022;Finalizada\n")
    CUENTA = "Fecha de operación;Fecha valor;Concepto;Importe\n06/03/2026;06/03/2026;GROUPAMA TRESORERIE I ACC EUR;-999,50\n"
    def archivo(self, nombre, texto, enc="cp1252"):
        ruta = os.path.join(self.c.inversion, nombre); escribir(ruta, enc, texto); return ruta
    def aps(self, activo=None): return sorted((a["fecha"], a["activo"], a["importe"], a.get("participaciones")) for a in self.a.todos("aportacion") if not activo or a["activo"] == activo)

    def test_repetir_extracto_que_completa_titulos_no_es_ya_importado(self):
        csv = "Fecha de operación;Fecha valor;Concepto;Importe\n10/09/2026;10/09/2026;MSCI WORLD;-150,00\n"
        self.importar(self.archivo("compra.csv", csv), "inversion", "Bróker")
        self.a.guardar("operacion", {"fecha": "2026-09-10", "activo": "Fondo MSCI", "participaciones": 2, "cuenta": "Bróker"})
        r = self.importar(self.archivo("repetida.csv", csv), "inversion", "Bróker")
        self.assertFalse(r.get("ya_importado"), r)
        self.assertEqual(self.a.todos("operacion"), [])
        self.assertEqual(self.a.todos("aportacion")[0]["participaciones"], 2)

    def test_ordenes_y_traspaso_entre_fondos(self):
        r = IM.importar_archivo(self.a, self.c, self.archivo("ordenes.csv", self.ORDENES), None, "Bróker")
        self.assertEqual(r["tipo"], "operaciones"); self.assertEqual(r["nuevas"], 4)
        self.assertIn("1 traspasos entre fondos", r["mensaje"]); self.assertIn("1 canceladas", r["mensaje"])
        self.assertEqual(self.aps(), [("2026-03-04", "Groupama Trésorerie", 1000.0, 0.022), ("2026-03-10", "Groupama Trésorerie", -500.0, -0.011),
                                      ("2026-03-12", "Fidelity S&P 500", 500.2, 30.5), ("2026-04-02", "Fondo LU9999999991", 80.0, 1.5)])
        A = {a["nombre"]: a for a in self.a.todos("activo")}
        self.assertEqual((A["Fidelity S&P 500"]["isin"], A["Fondo LU9999999991"]["clase"]), ("IE00BYX5MX67", "fondo"))
        tr = [a["activo"] for a in self.a.todos("aportacion") if a.get("traspaso")]
        self.assertEqual(sorted(tr), ["Fidelity S&P 500", "Groupama Trésorerie"])
        # Otra vez el mismo archivo: nada nuevo
        r = IM.importar_archivo(self.a, self.c, self.archivo("ordenes2.csv", self.ORDENES), None, "Bróker")
        self.assertEqual((r["nuevas"], r["existentes"]), (0, 4))
        # El extracto de la cuenta trae la compra de Groupama: es la misma, no se duplica (y deja de ser «supuesta»)
        r = IM.importar_archivo(self.a, self.c, self.archivo("cuenta.csv", self.CUENTA), "inversion", "Bróker")
        self.assertEqual((r["nuevas"], r["existentes"], r["dudas"]), (0, 1, 0))
        self.assertFalse(r.get("ya_importado"), r)  # casar la orden escribe la huella: no es una repetición
        g = next(a for a in self.a.todos("aportacion") if a["fecha"] == "2026-03-04")
        self.assertEqual((g["ext_importe"], g.get("supuesta", "")), (-999.5, ""))
        repetido = IM.importar_archivo(self.a, self.c, self.archivo("repetido.csv", self.CUENTA), "inversion", "Bróker")
        self.assertTrue(repetido.get("ya_importado"), repetido)

    def test_cuenta_antes_que_las_ordenes(self):
        r = IM.importar_archivo(self.a, self.c, self.archivo("cuenta.csv", self.CUENTA), "inversion", "Bróker")
        self.assertEqual(r["dudas"], 1)  # aún no hay activo que reconozca «Groupama»
        IM.importar_archivo(self.a, self.c, self.archivo("ordenes.csv", self.ORDENES), None, "Bróker")
        self.assertEqual(self.a.todos("pendiente"), [])  # la duda era esa orden
        self.assertEqual(self.aps("Groupama Trésorerie"), [("2026-03-06", "Groupama Trésorerie", 999.5, 0.022), ("2026-03-10", "Groupama Trésorerie", -500.0, -0.011)])

    def test_venta_a_la_cuenta_corrige_la_orden_supuesta(self):
        IM.importar_archivo(self.a, self.c, self.archivo("o.csv", "Fecha de la orden;ISIN;Importe estimado;Nº de participaciones;Estado\n"
                                                                 "14/04/2026;LU0034353002;199.98 EUR;2,199;Finalizada\n"), None, "Bróker")
        self.assertEqual(self.aps(), [("2026-04-14", "DWS Floating Rate Notes", 199.98, 2.199)])  # sin más datos, se supone compra
        IM.importar_archivo(self.a, self.c, self.archivo("c.csv", "Fecha de operación;Fecha valor;Concepto;Importe\n"
                                                                 "16/04/2026;17/04/2026;DEUTSCHE FLOAT RATE NOTS LC EU;199,98\n"), "inversion", "Bróker")
        self.assertEqual(self.aps(), [("2026-04-14", "DWS Floating Rate Notes", -199.98, -2.199)])  # el dinero entró en la cuenta: era una venta

    def test_excel_de_titulos(self):
        import openpyxl
        ruta = os.path.join(self.c.inversion, "operaciones.xlsx")
        wb = openpyxl.Workbook(); ws = wb.active
        ws.append(["Fecha", "Tipo", "Activo", "Estado", "Títulos", "Títulos netos"])
        ws.append([datetime.datetime(2026, 6, 24), "Compra", "FIDELITY PHYSICAL BITCOIN ET", "Finalizada", 57, "=E2"])
        ws.append([datetime.datetime(2026, 7, 30), "Compra", "FIDELITY PHYSICAL BITCOIN ET", "Rechazada", 3, "=E3"])
        ws.append([datetime.datetime(2026, 5, 25), "Venta", "ISHARES PHYSICAL GOLD ETC", "Finalizada", 1, "=E4"])
        wb.save(ruta)
        r = IM.importar_archivo(self.a, self.c, ruta, None, "Bróker")
        self.assertIn("2 esperando al extracto", r["mensaje"])
        self.assertEqual(sorted(a["nombre"] for a in self.a.todos("activo")), ["Fidelity Physical Bitcoin", "Fondo MSCI", "iShares Physical Gold"])
        r = IM.importar_archivo(self.a, self.c, self.archivo("c.csv", "Fecha de operación;Fecha valor;Concepto;Importe\n"
                                                                 "25/06/2026;29/06/2026;FIDELITY PHYSICAL BITCOIN ET @;-303,41\n"
                                                                 "26/05/2026;28/05/2026;ISHARES PHYSICAL GOLD ETC @ 1;74,59\n"), "inversion", "Bróker")
        self.assertIn("completadas con sus títulos", r["mensaje"])
        self.assertEqual(self.aps(), [("2026-05-26", "iShares Physical Gold", -74.59, -1.0), ("2026-06-25", "Fidelity Physical Bitcoin", 303.41, 57.0)])
        self.assertEqual(self.a.todos("operacion"), [])

    def test_una_orden_con_la_fecha_ilegible_se_avisa(self):
        ruta = self.archivo("ordenes.csv", "Fecha;Tipo;Activo;Estado;Títulos\n24/06/2026;Compra;FIDELITY PHYSICAL BITCOIN ET;Finalizada;57\n2026-13-45;Compra;ISHARES PHYSICAL GOLD ETC;Finalizada;2\n")
        r = IM.importar_archivo(self.a, self.c, ruta, None, "Bróker")
        self.assertEqual([(x["fila"], x["valor"]) for x in r["ilegibles"]], [(3, "2026-13-45")])
        self.assertIn("⚠ 1 fila no se ha podido leer (la fila 3: no entiendo la fecha «2026-13-45»)", r["mensaje"])

class TestCartera(Base):
    """Arreglos a mano de la cartera (cartera.py) y sugerencias del bróker que no inventan activos."""
    CUENTA = ("Fecha de operación;Fecha valor;Concepto;Importe\n"
              "04/03/2025;04/03/2025;Inicio;5000\n"
              "06/03/2025;06/03/2025;GROUPAMA TRESORERIE I ACC EUR;-4999,04\n"
              "18/03/2025;19/03/2025;S&P 500 INDEX P ACC EUR @ 31.5;-400\n")
    def importar_cuenta(self, nombre="c.csv"):
        ruta = os.path.join(self.c.inversion, nombre); escribir(ruta, "utf-8", self.CUENTA)
        return IM.importar_archivo(self.a, self.c, ruta, "inversion", "Bróker")
    def test_sugerencias_del_broker(self):
        self.importar_cuenta()
        s = {p["fila"]["texto"]: IM.sugerencia_inversion(p, self.a.todos("activo")) for p in self.a.todos("pendiente")}
        self.assertEqual(s["Inicio"], {"accion": "ignorar"})  # dinero desde tu banco, no la venta de un activo «Inicio»
        self.assertEqual(s["GROUPAMA TRESORERIE I ACC EUR"], {"accion": "activo", "nuevo": "Groupama Trésorerie", "clase": "fondo", "isin": "FR0000989626"})
        g = next(p for p in self.a.todos("pendiente") if p["fila"]["texto"].startswith("GROUPAMA"))
        IM.resolver(self.a, g["id"], {"accion": "activo", "nuevo_activo": "Groupama Trésorerie"})
        act = next(a for a in self.a.todos("activo") if a["nombre"] == "Groupama Trésorerie")
        self.assertEqual((act["isin"], act["clase"]), ("FR0000989626", "fondo"))  # así las órdenes (por ISIN) caen en el mismo

    def test_era_un_traspaso(self):
        from financebuddy import cartera
        self.importar_cuenta()
        p = next(p for p in self.a.todos("pendiente") if p["fila"]["texto"] == "Inicio")
        IM.resolver(self.a, p["id"], {"accion": "activo", "nuevo_activo": "Inicio"})  # el error de antes: tomarlo por una venta
        ini = next(a for a in self.a.todos("activo") if a["nombre"] == "Inicio")
        cartera.borrar(self.a, ini["id"], era_traspaso=True)
        self.assertFalse(any(a["nombre"] == "Inicio" for a in self.a.todos("activo")))
        self.assertFalse(any(x["activo"] == "Inicio" for x in self.a.todos("aportacion")))
        r = self.importar_cuenta("c2.csv")  # el mismo extracto otra vez: no vuelve
        self.assertFalse(any(p["fila"]["texto"] == "Inicio" for p in self.a.todos("pendiente")))

    def test_unir_y_cuadrar(self):
        from financebuddy import cartera
        self.a.guardar("activo", {"nombre": "Sp500", "clase": "otro", "cuenta": "Bróker", "valor": 100, "fecha_valor": "2025-03-20"})
        self.a.guardar("activo", {"nombre": "Fidelity S&P 500", "clase": "fondo", "cuenta": "Bróker", "patrones": ["fidelity s&p 500"]})
        self.a.guardar("aportacion", {"fecha": "2025-03-18", "activo": "Sp500", "importe": 400, "participaciones": 31.5, "cuenta": "Bróker"})
        self.a.guardar("aportacion", {"fecha": "2025-04-08", "activo": "Fidelity S&P 500", "importe": 198.7, "participaciones": 17.807, "cuenta": "Bróker"})
        self.a.guardar("patrimonio", {"fecha": "2025-03-31", "saldos": {"Bróker": 0}, "valores": {"Sp500": 101, "Fidelity S&P 500": 0}})
        A = {a["nombre"]: a["id"] for a in self.a.todos("activo")}
        cartera.unir(self.a, A["Sp500"], A["Fidelity S&P 500"])
        self.assertEqual(sorted(a["nombre"] for a in self.a.todos("activo")), ["Fidelity S&P 500", "Fondo MSCI"])
        f = next(a for a in self.a.todos("activo") if a["nombre"] == "Fidelity S&P 500")
        self.assertIn("sp500", f["patrones"]); self.assertEqual(f["valor"], 100)
        self.assertEqual(self.a.todos("patrimonio")[0]["valores"], {"Fidelity S&P 500": 101})
        self.assertAlmostEqual(cartera.participaciones(self.a, "Fidelity S&P 500"), 49.307)
        # El bróker dice 49,326: se añade un ajuste de +0,019 sin dinero; la segunda vez ya cuadra
        self.assertIn("+0.019", cartera.cuadrar(self.a, f["id"], "49,326", "2025-05-01", "650"))
        aj = [x for x in self.a.todos("aportacion") if x.get("ajuste")]
        self.assertEqual([(x["importe"], x["participaciones"]) for x in aj], [(0.0, 0.019)])
        self.assertIn("ya cuadraba", cartera.cuadrar(self.a, f["id"], 49.326))
        self.assertEqual(next(a for a in self.a.todos("activo") if a["nombre"] == "Fidelity S&P 500")["valor"], 650)

    def test_ordenes_mandan_sobre_participaciones_redondeadas(self):
        self.importar_cuenta()
        s = next(p for p in self.a.todos("pendiente") if p["fila"]["texto"].startswith("S&P"))
        IM.resolver(self.a, s["id"], {"accion": "activo", "nuevo_activo": "S&P 500 Index P Acc Eur"})
        ruta = os.path.join(self.c.inversion, "o.csv")
        escribir(ruta, "cp1252", "Fecha de la orden;ISIN;Importe estimado;Nº de participaciones;Estado\n16/03/2025;IE00BYX5MX67;400 EUR;31,519;Finalizada\n")
        IM.importar_archivo(self.a, self.c, ruta, None, "Bróker")
        self.assertEqual([(x["activo"], x["participaciones"]) for x in self.a.todos("aportacion")], [("S&P 500 Index P Acc Eur", 31.519)])

class TestDetectar(Base):
    MESES = ["2026-07", "2026-08", "2026-09"]
    def filas(self):
        out = []
        for i, m in enumerate(self.MESES):
            out += [(f"{m}-01", "Transferencia inmediata a favor de Pedro Casero concepto Alquiler", -600.0),
                    (f"{m}-03", "Compra Mercadona, Madrid", -40.0), (f"{m}-12", "Compra Mercadona, Madrid", -55.0 - i),
                    (f"{m}-05", "Bizum a favor de Carlos Lopez concepto: wifi", -16.0),
                    (f"{m}-{27 - i:02d}", "Transferencia de Empresa SL, concepto Nomina mes", 1800.0),
                    (f"{m}-{29 - i:02d}", "Recibo Digi Spain Telecom, concepto: factura", -20.0 - i * 0.5)]
        out.append(("2026-09-15", "Transferencia de Club Deportivo, concepto pago", 300.0))
        return sorted(out)
    def preparar(self):
        self.importar(self.extracto(self.filas(), saldo_inicial=3000))
        for p in self.a.todos("pendiente"):  # el alquiler por transferencia llega como duda
            IM.resolver(self.a, p["id"], {"accion": "guardar", "clase": p["fila"]["clase"] if p["fila"]["importe"] > 0 else "gasto",
                                          "categoria": "Vivienda" if "casero" in p["fila"]["texto"].lower() else "Otros ingresos" if p["fila"]["importe"] > 0 else "Otros"})
    def test_detecta_fijos_y_origenes(self):
        from financebuddy import detectar as D
        self.preparar()
        f = {x["patron"]: x for x in D.fijos(self.a)}
        self.assertEqual(set(f), {"empresa sl", "pedro casero", "carlos lopez concepto: wifi", "digi spain telecom"})
        self.assertEqual((f["empresa sl"]["categoria"], f["empresa sl"]["grupo"], f["empresa sl"]["importe"]), ("Nómina", "ingreso", 1800.0))
        self.assertEqual((f["digi spain telecom"]["categoria"], f["digi spain telecom"]["grupo"]), ("Suministros", "fijo"))
        self.assertEqual((f["pedro casero"]["dia"], f["pedro casero"]["desde"]), (1, "2026-09-01"))
        o = {x["origen"]: x for x in D.origenes(self.a)}
        self.assertEqual((o["Empresa SL"]["total"], o["Empresa SL"]["veces"], o["Empresa SL"]["media_mes"]), (5400.0, 3, 1800.0))
        self.assertIn("Club Deportivo", o)

    def test_crear_enlaza_y_no_repite(self):
        from financebuddy import detectar as D
        self.preparar()
        props = [x for x in D.fijos(self.a) if x["patron"] in ("empresa sl", "carlos lopez concepto: wifi")]
        self.assertIn("2 fijos creados", D.crear(self.a, props))
        recs = {r["nombre"]: r for r in self.a.todos("recurrente")}
        self.assertEqual(set(recs), {x["nombre"] for x in props})
        enlazados = [m for m in self.movs() if m.get("recurrente")]
        self.assertEqual(sorted(m["fecha"][:7] for m in enlazados), ["2026-09", "2026-09"])
        self.assertEqual({x["patron"] for x in D.fijos(self.a)}, {"pedro casero", "digi spain telecom"})
        with self.assertRaises(ValueError): D.crear(self.a, props[:1])
        # El mes siguiente se reconoce solo y queda enlazado
        self.importar(self.extracto(self.filas() + [("2026-10-27", "Transferencia de Empresa SL, concepto Nomina oct", 1850.0)], nombre="oct.xlsx", saldo_inicial=3000))
        oct_ = next(m for m in self.movs() if m["fecha"] == "2026-10-27")
        self.assertEqual((oct_["recurrente"], oct_["categoria"]), (props[0]["nombre"] if props[0]["patron"] == "empresa sl" else props[1]["nombre"], "Nómina"))

class TestBase(Base):
    def test_renombrar_propaga(self):
        self.importar(self.extracto())
        c = next(x for x in self.a.todos("cuenta") if x["nombre"] == "Ahorro")
        self.a.guardar("cuenta", {**c, "nombre": "Colchón"}, c["id"])
        self.assertTrue(any(m.get("destino") == "Colchón" for m in self.movs()))
    def test_instantanea_y_recuperar(self):
        foto = self.a.instantanea()
        self.importar(self.extracto())
        self.assertTrue(self.movs())
        self.a.recuperar(foto)
        self.assertFalse(self.movs())
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
    def test_fechas_con_hora_con_zona_o_con_el_mes_escrito(self):
        for txt in ("2026-09-05T10:15:23Z", "2026-09-05T10:15:23.160+02:00", "2026-09-05 10:15", "05/09/2026, 10:15", "05.09.26", "5 sep 2026", "5 de Septiembre de 2026",
                    "05-sept.-2026", "Sep 5, 2026", "September 5 2026"):
            self.assertEqual(L.fecha(txt), "2026-09-05", txt)
        # Lo ambiguo o imposible sigue sin ser una fecha: orden americano, todo junto, un día que no existe, un rótulo con cifras
        for txt in ("09/30/2026", "20260905", "31/02/2026", "5 martes 2026", "30/09/2026 | 10:00:00", "Saldo a 30/09/2026", "12,50", "1.234,56"):
            self.assertIsNone(L.fecha(txt), txt)
    def test_el_signo_menos_tipografico(self):
        self.assertEqual((L.numero("−12,30"), L.numero("–1.234,56 €"), L.numero("–")), (-12.3, -1234.56, None))
    def test_punto_de_miles_sin_decimales(self):
        # «1.234» es mil doscientos treinta y cuatro (punto de miles español); lo demás se lee como antes
        for txt, n in [("1.234", 1234), ("-1.500", -1500), ("1.500-", -1500), ("1.000 €", 1000), ("(2.000)", -2000), ("999.999", 999999),
                       ("1.234,56", 1234.56), ("12.5", 12.5), ("12.50", 12.5), ("1,234.56", 1234.56), ("1234.567", 1234.567), ("0.123", 0.123),
                       ("1.2345", 1.2345), ("1,234", 1.234), ("1.234.567", 1234567)]:
            self.assertEqual(L.numero(txt), n, txt)
        self.assertEqual(L.numero("1.234", miles=False), 1.234)
    def test_agrupacion_de_miles_incoherente_no_se_adivina(self):
        for txt in ("12.345.6", "1,23,4", "1.23,45", "1,5.23", "1.234,5.6", "1.2.3", "€ 12.34.567"):
            self.assertIsNone(L.numero(txt), txt)
            self.assertIsNone(L.numero(txt, miles=False), txt)
        for txt, n in [("+1.234.567,89", 1234567.89), ("1,234,567.8", 1234567.8), ("€ 1.234", 1234), ("-1.234.567", -1234567), ("1234,56", 1234.56)]:
            self.assertEqual(L.numero(txt), n, txt)
    def test_punto_decimal_se_decide_por_archivo(self):
        self.assertTrue(L.punto_decimal(["1.234", "12.50"]))  # «12.50»: el punto es la coma decimal
        self.assertTrue(L.punto_decimal(["199.98 EUR"]))
        self.assertFalse(L.punto_decimal(["1.234", "-45,20", "1.234,56", 12.5, None, ""]))
    def test_numeros_de_excel_que_no_son_fechas(self):
        self.assertIsNone(L.fecha(25000))  # un importe entero no es una fecha de 1968
        self.assertIsNone(L.fecha(80000))
        self.assertEqual(L.fecha(46295), "2026-09-30")  # número de serie de Excel de verdad
        self.assertEqual(L.fecha(46295.5), "2026-09-30")
        # Al adivinar columnas, una de números enteros no se toma por fechas sin ninguna fecha de verdad al lado
        c = L.columnas_probables(["A", "B", "C"], [[46200, "Compra Lidl", 46100], [46201, "Nómina", 45000]])
        self.assertEqual(c, {})
        c = L.columnas_probables(["A", "B", "C"], [["01/09/2026", "Compra Lidl", 46100], ["02/09/2026", "Nómina", 45000]])
        self.assertEqual((c["fecha"], c["concepto"], c["importe"]), ("A", "B", "C"))
        # con el nombre «Fecha» en la cabecera, los números de serie sí valen
        c = L.columnas_probables(["Fecha", "Concepto", "Importe"], [[46200, "Compra Lidl", -12.5]])
        self.assertEqual(c["fecha"], "Fecha")

class TestMilesAlImportar(Base):
    PERFIL = {"nombre": "Banco de prueba", "tipo": "banco", "columnas": {"fecha": "fecha", "concepto": "concepto", "importe": "importe", "saldo": "saldo"}}
    def leer(self, texto):
        self.a.guardar("perfil", self.PERFIL)
        ruta = os.path.join(self.c.banco, "b.csv"); escribir(ruta, "utf-8", texto)
        return [(f["importe"], f.get("saldo")) for f in IM.leer(ruta, self.a, "banco", "Banco de prueba")[1]]

    def test_formato_espanol(self):
        self.assertEqual(self.leer("Fecha;Concepto;Importe;Saldo\n01/09/2026;Nómina;1.500;2.734,56\n02/09/2026;Lidl;-12,30;2.722,26\n"),
                         [(1500.0, 2734.56), (-12.3, 2722.26)])
    def test_archivo_con_punto_decimal_no_cambia(self):
        # si el archivo escribe «12.50», su «1.234» es 1,234 como siempre (no se adivina fila a fila)
        self.assertEqual(self.leer("Fecha;Concepto;Importe;Saldo\n01/09/2026;Café;-1.234;100.50\n02/09/2026;Lidl;-12.30;88.20\n"),
                         [(-1.23, 100.5), (-12.3, 88.2)])
    def test_participaciones_con_punto_son_decimales(self):
        ruta = os.path.join(self.c.inversion, "o.csv")
        escribir(ruta, "utf-8", "Fecha de la orden;ISIN;Importe estimado;Nº de participaciones;Estado\n"
                                "14/04/2026;LU0034353002;1.500 EUR;2.199;Finalizada\n")
        from financebuddy import operaciones as OP
        ops = OP.leer(ruta, self.a)[1]
        self.assertEqual([(o["importe"], o["part"]) for o in ops], [(1500.0, 2.199)])

class TestNorma43OfxQif(Base):
    """B-017: extractos de Norma 43, OFX y QIF por el mismo camino que el del banco. Todo inventado (cuenta 0000008901)."""
    @staticmethod
    def reg(*campos):
        """Registro de ancho fijo de la Norma 43: pares (valor, ancho). Un número se rellena con ceros; un texto, con espacios."""
        out = ""
        for valor, ancho in campos:
            s = str(valor).rjust(ancho, "0") if isinstance(valor, int) else str(valor).ljust(ancho)
            assert len(s) == ancho, (valor, ancho)
            out += s
        return out + "\n"
    def n43_cabecera(self, cuenta=8901):
        return self.reg(("11", 2), (9999, 4), (1, 4), (cuenta, 10), (260901, 6), (260930, 6), ("2", 1), (100000, 14),
                        (978, 3), (1, 1), ("TITULAR INVENTADO", 26), ("", 3))
    def n43_movimiento(self, fecha, clave, centimos):
        return self.reg(("22", 2), (9999, 4), (1, 4), (fecha, 6), (fecha, 6), ("", 2), ("", 3), (clave, 1),
                        (centimos, 14), (1, 10), ("", 12), ("", 16))
    def n43_concepto(self, texto):
        return self.reg(("23", 2), ("01", 2), (texto[:38], 38), (texto[38:76], 38))
    def n43_final(self, cuenta=8901):
        return self.reg(("33", 2), (9999, 4), (1, 4), (cuenta, 10), (1, 5), (4520, 14), (1, 5), (150000, 14),
                        ("2", 1), (245480, 14), (978, 3), ("", 4))
    def n43_fin(self):
        return self.reg(("88", 2), ("9" * 18, 18), (6, 6), ("", 54))
    def n43_ejemplo(self, cuenta=8901):
        return (self.n43_cabecera(cuenta)
                + self.n43_movimiento(260902, "1", 4520) + self.n43_concepto("PAGO MOVIL EN KIOSKO ANA MADRID")
                + self.n43_movimiento(260915, "2", 150000) + self.n43_concepto("TRANSFERENCIA NOMINA EMPRESA SL")
                + self.n43_final(cuenta) + self.n43_fin())
    def ofx(self, debito="-45.20", cuenta="0000008901"):
        return ("OFXHEADER:100\nDATA:OFXSGML\nVERSION:102\nSECURITY:NONE\nENCODING:USASCII\nCHARSET:1252\n"
                "COMPRESSION:NONE\nOLDFILEUID:NONE\nNEWFILEUID:NONE\n\n"
                "<OFX>\n<SIGNONMSGSRSV1><SONRS><STATUS><CODE>0<SEVERITY>INFO</STATUS><DTSERVER>20260930120000"
                "<LANGUAGE>SPA</SONRS></SIGNONMSGSRSV1>\n"
                "<BANKMSGSRSV1><STMTTRNRS><TRNUID>1<STATUS><CODE>0<SEVERITY>INFO</STATUS>\n"
                f"<STMTRS><CURDEF>EUR<BANKACCTFROM><BANKID>9999<ACCTID>{cuenta}<ACCTTYPE>CHECKING</BANKACCTFROM>\n"
                "<BANKTRANLIST><DTSTART>20260901<DTEND>20260930\n"
                f"<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260902<TRNAMT>{debito}<FITID>2026090201"
                "<NAME>PAGO MOVIL<MEMO>KIOSKO ANA MADRID</STMTTRN>\n"
                "<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260915<TRNAMT>1500.00<FITID>2026091501"
                "<NAME>EMPRESA SL<MEMO>NOMINA</STMTTRN>\n"
                "</BANKTRANLIST>\n<LEDGERBAL><BALAMT>2454.80<DTASOF>20260930</LEDGERBAL>\n"
                "</STMTRS></STMTTRNRS></BANKMSGSRSV1>\n</OFX>\n")
    def qif(self, fecha="02/09/2026"):
        return ("!Option:AutoSwitch\n!Account\nNNómina\nTBank\n^\n!Clear:AutoSwitch\n!Type:Bank\n"
                f"D{fecha}\nT-45.20\nPKIOSKO ANA\nMPAGO MOVIL\n^\n"
                "D15/09/2026\nT1500.00\nPEMPRESA SL\nMNOMINA\n^\n")
    def escribir_extracto(self, texto, nombre):
        ruta = os.path.join(self.c.banco, nombre)
        escribir(ruta, "latin-1", texto)
        return ruta
    def fijar_iban(self, nombre, digitos):
        c = next(x for x in self.a.todos("cuenta") if x["nombre"] == nombre)
        self.a.guardar("cuenta", {**c, "iban": digitos}, c["id"])
    def extraidos(self):
        """Lo que ha entrado del extracto, en movimientos y pendientes: (fecha, importe con su signo, texto)."""
        out = [(m["ext_fecha"], m["ext_importe"], m["ext_texto"]) for m in self.movs() if m.get("ext_fecha")]
        out += [(p["fila"]["op"], p["fila"]["importe"], p["fila"]["texto"]) for p in self.a.todos("pendiente")]
        return sorted(out)

    def test_norma43_cargo_y_abono_con_su_signo(self):
        r = self.importar(self.escribir_extracto(self.n43_ejemplo(), "extracto.n43"))
        self.assertTrue(r["ok"])
        self.assertEqual(self.extraidos(), [("2026-09-02", -45.2, "PAGO MOVIL EN KIOSKO ANA MADRID"),
                                            ("2026-09-15", 1500.0, "TRANSFERENCIA NOMINA EMPRESA SL")])
        self.assertEqual(self.a.config("saldo_extracto:Nómina"), {"fecha": "2026-09-30", "saldo": 2454.8})

    def test_norma43_reimportar_no_duplica(self):
        self.importar(self.escribir_extracto(self.n43_ejemplo(), "extracto.n43"))
        r = self.importar(self.escribir_extracto(self.n43_ejemplo(), "copia.n43"))
        self.assertEqual((r["nuevas"], r["existentes"]), (0, 2))
        self.assertEqual(len(self.extraidos()), 2)

    def test_norma43_de_otra_cuenta_pide_cual_es(self):
        ruta = self.escribir_extracto(self.n43_ejemplo(cuenta=1111), "otra.n43")
        with self.assertRaises(IM.NecesitaCuenta):
            IM.importar_archivo(self.a, self.c, ruta, "banco")

    def test_norma43_la_segunda_vez_reconoce_la_cuenta_por_el_numero(self):
        self.importar(self.escribir_extracto(self.n43_ejemplo(), "extracto.n43"))
        r = IM.importar_archivo(self.a, self.c, self.escribir_extracto(self.n43_ejemplo(), "otro.n43"), "banco")
        self.assertEqual(r["cuenta"], "Nómina")

    def test_norma43_con_dos_cuentas_se_rechaza_entera(self):
        ruta = self.escribir_extracto(self.n43_ejemplo() + self.n43_ejemplo(cuenta=1111), "dos.n43")
        with self.assertRaises(ValueError) as e:
            self.importar(ruta)
        self.assertIn("2 cuentas", str(e.exception))
        self.assertEqual(self.movs(), [])

    def test_norma43_fecha_ilegible_va_a_ilegibles_y_lo_demas_entra(self):
        texto = (self.n43_cabecera() + self.n43_movimiento(261302, "1", 4520) + self.n43_concepto("PAGO MOVIL EN KIOSKO ANA MADRID")
                 + self.n43_movimiento(260915, "2", 150000) + self.n43_concepto("TRANSFERENCIA NOMINA EMPRESA SL")
                 + self.n43_final() + self.n43_fin())
        r = self.importar(self.escribir_extracto(texto, "mal.n43"))
        self.assertEqual([(i["fila"], i["que"]) for i in r["ilegibles"]], [(2, "la fecha")])
        self.assertEqual(self.extraidos(), [("2026-09-15", 1500.0, "TRANSFERENCIA NOMINA EMPRESA SL")])

    def test_norma43_registro_desconocido_va_a_ilegibles(self):
        texto = (self.n43_cabecera() + self.reg(("XX", 2), ("", 78)) + self.n43_movimiento(260902, "1", 4520)
                 + self.n43_concepto("PAGO MOVIL EN KIOSKO ANA MADRID") + self.n43_final() + self.n43_fin())
        r = self.importar(self.escribir_extracto(texto, "raro.n43"))
        self.assertEqual([(i["fila"], i["que"]) for i in r["ilegibles"]], [(2, "el registro")])
        self.assertEqual(len(self.extraidos()), 1)

    def test_norma43_saldo_final_ilegible_no_importa_nada(self):
        texto = self.n43_ejemplo().replace(self.n43_final(), self.reg(("33", 2), ("X", 78)))
        with self.assertRaises(ValueError) as e:
            self.importar(self.escribir_extracto(texto, "saldo.n43"))
        self.assertIn("saldo final", str(e.exception))
        self.assertEqual(self.movs(), [])

    def test_extracto_sin_movimientos_avisa_en_vez_de_romper(self):
        ruta = self.escribir_extracto(self.n43_cabecera() + self.n43_final() + self.n43_fin(), "vacio.n43")
        with self.assertRaises(ValueError) as e:
            self.importar(ruta)
        self.assertIn("no trae movimientos", str(e.exception))

    def test_ofx_cargo_y_abono_con_su_signo(self):
        r = self.importar(self.escribir_extracto(self.ofx(), "extracto.ofx"))
        self.assertTrue(r["ok"])
        self.assertEqual(self.extraidos(), [("2026-09-02", -45.2, "PAGO MOVIL KIOSKO ANA MADRID"),
                                            ("2026-09-15", 1500.0, "EMPRESA SL NOMINA")])
        self.assertEqual(self.a.config("saldo_extracto:Nómina"), {"fecha": "2026-09-30", "saldo": 2454.8})

    def test_ofx_reconoce_la_cuenta_por_el_iban(self):
        self.fijar_iban("Nómina", "8901")
        r = IM.importar_archivo(self.a, self.c, self.escribir_extracto(self.ofx(), "extracto.ofx"), "banco")
        self.assertEqual(r["cuenta"], "Nómina")

    def test_ofx_importe_ilegible_va_a_ilegibles(self):
        texto = self.ofx(debito="-4,5O")
        linea = next(n for n, l in enumerate(texto.splitlines(), 1) if "<STMTTRN>" in l)
        r = self.importar(self.escribir_extracto(texto, "mal.ofx"))
        self.assertEqual([(i["fila"], i["que"]) for i in r["ilegibles"]], [(linea, "el importe")])
        self.assertEqual(self.extraidos(), [("2026-09-15", 1500.0, "EMPRESA SL NOMINA")])

    def test_ofx_sin_cuenta_bancaria_se_rechaza(self):
        ruta = self.escribir_extracto(self.ofx().replace("<ACCTID>0000008901", ""), "sin cuenta.ofx")
        with self.assertRaises(ValueError) as e:
            self.importar(ruta)
        self.assertIn("bancaria", str(e.exception))

    def test_qif_pide_la_cuenta_y_luego_importa_con_su_signo(self):
        ruta = self.escribir_extracto(self.qif(), "extracto.qif")
        with self.assertRaises(IM.NecesitaCuenta):
            IM.importar_archivo(self.a, self.c, ruta, "banco")
        r = self.importar(ruta)
        self.assertTrue(r["ok"])
        self.assertEqual(self.extraidos(), [("2026-09-02", -45.2, "KIOSKO ANA PAGO MOVIL"),
                                            ("2026-09-15", 1500.0, "EMPRESA SL NOMINA")])

    def test_qif_fecha_ilegible_va_a_ilegibles(self):
        texto = self.qif(fecha="31/02/2026")
        linea = next(n for n, l in enumerate(texto.splitlines(), 1) if l.startswith("D"))
        r = self.importar(self.escribir_extracto(texto, "mal.qif"))
        self.assertEqual([(i["fila"], i["que"]) for i in r["ilegibles"]], [(linea, "la fecha")])
        self.assertEqual(self.extraidos(), [("2026-09-15", 1500.0, "EMPRESA SL NOMINA")])

    def test_qif_de_tarjeta_se_rechaza(self):
        ruta = self.escribir_extracto("!Type:CCard\nD02/09/2026\nT-45.20\nPTIENDA\n^\n", "tarjeta.qif")
        with self.assertRaises(ValueError) as e:
            self.importar(ruta)
        self.assertIn("bancaria", str(e.exception))

    def test_ofx_con_coma_decimal_se_lee(self):
        r = self.importar(self.escribir_extracto(self.ofx(debito="-45,20"), "coma.ofx"))
        self.assertIn(("2026-09-02", -45.2, "PAGO MOVIL KIOSKO ANA MADRID"), self.extraidos())

    def test_qif_mes_dia_se_lee_en_ese_orden(self):
        # 09/15 solo puede ser mes/día: todo el archivo lo es, y 02/09 es el 9 de febrero, no el 2 de septiembre
        texto = "!Type:Bank\nD02/09/2026\nT-45.20\nPKIOSKO\n^\nD09/15/2026\nT1500.00\nPEMPRESA\n^\n"
        self.importar(self.escribir_extracto(texto, "americano.qif"))
        self.assertEqual(sorted(f for f, _, _ in self.extraidos()), ["2026-02-09", "2026-09-15"])

    def test_qif_con_fechas_que_no_se_pueden_ordenar_se_rechaza(self):
        # 05/09 y 10/05: ninguna pasa del 12, no hay forma de saber si es día/mes o mes/día
        texto = "!Type:Bank\nD05/09/2026\nT-45.20\nPKIOSKO\n^\nD10/05/2026\nT-3.00\nPCAFE\n^\n"
        with self.assertRaises(ValueError):
            self.importar(self.escribir_extracto(texto, "ambiguo.qif"))
        self.assertEqual(self.extraidos(), [])

    def test_mismo_extracto_en_otro_formato_no_duplica(self):
        self.importar(self.escribir_extracto(self.ofx(), "a.ofx"))
        r = self.importar(self.escribir_extracto(self.qif(), "a.qif"))
        self.assertEqual((r["nuevas"], r["existentes"]), (0, 2))
        self.assertEqual(len(self.extraidos()), 2)

    def test_extracto_suelto_en_la_raiz_se_reconoce_por_lo_que_es(self):
        os.makedirs(self.c.importar, exist_ok=True)
        ruta = os.path.join(self.c.importar, "suelto.txt")
        escribir(ruta, "latin-1", self.n43_ejemplo())
        r = IM.importar_archivo(self.a, self.c, ruta, None, "Nómina")
        self.assertEqual(r["tipo"], "banco")
        self.assertEqual(len(self.extraidos()), 2)

    def test_archivos_pendientes_incluye_los_extractos(self):
        for nombre in ("a.n43", "b.ofx", "c.qfx", "d.qif"):
            escribir(os.path.join(self.c.banco, nombre), "latin-1", "x")
        self.assertEqual(sorted(os.path.basename(p) for p, _ in IM.archivos_pendientes(self.c)),
                         ["a.n43", "b.ofx", "c.qfx", "d.qif"])

    def test_un_extracto_no_se_importa_como_movimientos_del_broker(self):
        ruta = self.escribir_extracto(self.n43_ejemplo(), "extracto.n43")
        with self.assertRaises(ValueError) as e:
            IM.importar_archivo(self.a, self.c, ruta, "inversion", "Bróker")
        self.assertIn("extracto", str(e.exception))

    def test_formato_desconocido_conserva_el_mensaje_de_siempre(self):
        ruta = self.escribir_extracto("%PDF-1.4 inventado", "extracto.pdf")
        with self.assertRaises(ValueError) as e:
            self.importar(ruta)
        self.assertIn("Formato no admitido", str(e.exception))

class TestLotes(Base):
    """B-061: cada archivo importado deja un lote y se puede quitar entero sin tocar lo apuntado a mano ni lo de otros archivos."""
    def registros_del_lote(self, lote):
        return {t: [r for r in self.a.todos(t) if r.get("lote") == lote] for t in ("movimiento", "aportacion", "cobro", "pendiente", "ignorado", "operacion")}

    def test_lo_que_crea_una_importacion_lleva_su_lote(self):
        r = self.importar(self.extracto())
        self.assertTrue(r["lote"])
        self.assertEqual({m["lote"] for m in self.movs()}, {r["lote"]})
        self.assertEqual({p["lote"] for p in self.a.todos("pendiente")}, {r["lote"]})  # también las dudas
        self.assertEqual(r["registros"], {"movimiento": 5, "pendiente": 3})
        (e,) = self.a.config("importaciones")
        self.assertEqual((e["id"], e["archivo"], e["tipo"], e["cuenta"]), (r["lote"], "movs.xlsx", "banco", "Nómina"))

    def test_cada_archivo_su_lote_y_una_importacion_que_no_trae_nada_no_deja_ninguno(self):
        a = self.importar(self.extracto())
        otra = self.importar(self.extracto(FILAS[:2], nombre="repetido.xlsx"))  # lo mismo que ya estaba: nada nuevo
        self.assertEqual(otra["nuevas"], 0)
        self.assertNotIn("lote", otra)
        b = self.importar(self.extracto([("2026-10-01", "Compra Lidl, Madrid", -7.0)], nombre="b.xlsx", saldo_inicial=2542.3))
        self.assertNotEqual(a["lote"], b["lote"])
        self.assertEqual([e["id"] for e in self.a.config("importaciones")], [a["lote"], b["lote"]])

    def test_la_vista_previa_no_deja_lote(self):
        ruta = self.extracto()
        with self.a.simular():
            r = IM.importar_archivo(self.a, self.c, ruta, "banco", "Nómina", simulando=True)
            self.assertTrue(r["ok"] and r["nuevas"])
            self.assertEqual([m for m in self.movs() if m.get("lote")], [])
            self.assertNotIn("lote", r)
        self.assertIsNone(self.a.config("importaciones"))

    def test_quitar_el_lote_borra_justo_lo_suyo(self):
        self.a.guardar("movimiento", {"fecha": "2026-09-20", "clase": "gasto", "categoria": "Ocio", "importe": 9.0, "cuenta": "Nómina", "concepto": "Cine a mano"})
        a = self.importar(self.extracto())
        b = self.importar(self.extracto([("2026-10-01", "Compra Lidl, Madrid", -7.0)], nombre="b.xlsx", saldo_inicial=2542.3))
        propias = [m["id"] for m in self.movs() if m.get("lote") == a["lote"]]
        # el usuario toca cosas de la importación: sigue siendo de ese lote
        m = next(m for m in self.movs() if m.get("lote") == a["lote"] and "Mercadona" in m["ext_texto"])
        self.a.guardar("movimiento", {**m, "categoria": "Hogar", "nota": "a mano"}, m["id"])
        msg, n = IM.deshacer_lote(self.a, a["lote"])
        self.assertEqual(n, 8)  # 5 movimientos + 3 dudas
        self.assertIn("5 movimientos y 3 filas por revisar", msg)
        self.assertIn("movs.xlsx", msg)
        self.assertEqual(sorted(m["concepto"] for m in self.movs()), sorted(["Cine a mano", next(x["concepto"] for x in self.movs() if x.get("lote") == b["lote"])]))
        self.assertTrue(all(i not in {x["id"] for x in self.movs()} for i in propias))
        self.assertEqual(self.a.todos("pendiente"), [])
        self.assertEqual([e["id"] for e in self.a.config("importaciones")], [b["lote"]])
        self.assertEqual(list(IM.lotes_recientes(self.a)[0]["registros"].items()), [("movimiento", 1)])

    def test_quitar_dos_veces_no_falla(self):
        a = self.importar(self.extracto())
        self.assertEqual(IM.deshacer_lote(self.a, a["lote"])[1], 8)
        msg, n = IM.deshacer_lote(self.a, a["lote"])
        self.assertEqual(n, 0); self.assertIn("ya no tiene nada", msg)
        self.assertEqual(IM.deshacer_lote(self.a, "no-existe")[1], 0)
        self.assertEqual(IM.deshacer_lote(self.a, "")[1], 0)
        self.assertEqual(IM.deshacer_lote(self.a, None)[1], 0)

    def test_vaciar_un_lote_con_una_cadena_vacia_no_borra_lo_apuntado_a_mano(self):
        self.a.guardar("movimiento", {"fecha": "2026-09-20", "clase": "gasto", "categoria": "Ocio", "importe": 9.0, "cuenta": "Nómina", "concepto": "Cine a mano"})
        IM.deshacer_lote(self.a, "")
        self.assertEqual(len(self.movs()), 1)

    def test_lo_apuntado_a_mano_que_la_importacion_casa_con_una_fila_se_queda(self):
        mano = self.a.guardar("movimiento", {"fecha": "2026-09-05", "clase": "gasto", "categoria": "Hogar", "importe": 12.5, "cuenta": "Nómina", "concepto": "Ferretería"})
        a = self.importar(self.extracto())
        casado = self.a.obtener("movimiento", mano)
        self.assertTrue(casado.get("ext_fecha")); self.assertNotIn("lote", casado)  # se queda con la huella del extracto, pero es tuyo
        IM.deshacer_lote(self.a, a["lote"])
        self.assertEqual([m["concepto"] for m in self.movs()], ["Ferretería"])
        r = self.importar(self.extracto())  # y al reimportar no se duplica
        self.assertEqual(len([m for m in self.movs() if "Ferreteria" in (m.get("ext_texto") or "") or m["concepto"] == "Ferretería"]), 1)
        self.assertEqual((r["existentes"], r["nuevas"] + r["dudas"]), (1, 7))  # la fila casada ya estaba; las otras siete, otra vez

    def test_reimportar_tras_quitar_trae_otra_vez_las_filas(self):
        a = self.importar(self.extracto())
        antes = sorted((m["ext_fecha"], m["ext_importe"], m["ext_texto"]) for m in self.movs())
        IM.deshacer_lote(self.a, a["lote"])
        self.assertEqual(self.movs(), [])
        r = self.importar(self.extracto())
        self.assertEqual((r["nuevas"], r["dudas"], r["existentes"]), (5, 3, 0))
        self.assertEqual(sorted((m["ext_fecha"], m["ext_importe"], m["ext_texto"]) for m in self.movs()), antes)
        self.assertNotEqual(r["lote"], a["lote"])

    def test_lo_que_sale_de_resolver_una_duda_es_del_lote_del_archivo(self):
        a = self.importar(self.extracto())
        p = next(p for p in self.a.todos("pendiente") if "Juan Perez" in p["fila"]["texto"])
        IM.resolver(self.a, p["id"], {"accion": "guardar", "clase": "ingreso", "categoria": "Otros ingresos", "concepto": "De Juan"})
        self.assertEqual(next(m for m in self.movs() if m["concepto"] == "De Juan")["lote"], a["lote"])
        b = self.importar(self.extracto([("2026-10-01", "Compra Lidl, Madrid", -7.0)], nombre="b.xlsx", saldo_inicial=2542.3))
        IM.deshacer_lote(self.a, a["lote"])
        self.assertEqual([m["lote"] for m in self.movs()], [b["lote"]])
        self.assertEqual(self.a.todos("pendiente"), [])

    def test_descartar_una_duda_queda_en_el_lote_y_reimportar_la_recupera(self):
        a = self.importar(self.extracto())
        p = self.a.todos("pendiente")[0]
        IM.resolver(self.a, p["id"], {"accion": "ignorar"})
        self.assertEqual(len(self.registros_del_lote(a["lote"])["ignorado"]), 1)
        IM.deshacer_lote(self.a, a["lote"])
        self.assertEqual(self.a.todos("ignorado"), [])
        self.assertEqual(self.importar(self.extracto())["dudas"], 3)

    def test_los_bizums_de_otro_archivo_no_se_quedan_apuntando_a_un_gasto_que_ya_no_esta(self):
        from financebuddy import bizums
        a = self.importar(self.extracto([("2026-09-10", "Pago Movil En Restaurante El Pino, Jaen", -60.00)], nombre="a.xlsx"))
        b = self.importar(self.extracto([("2026-09-13", "Bizum de Ana Ruiz Lopez", 15.00), ("2026-09-13", "Bizum de Luis Perez Gil", 15.00),
                                         ("2026-09-13", "Bizum de Eva Sanz Diaz", 15.00)], nombre="b.xlsx", saldo_inicial=940.0))
        bizums.enlazar(self.a)
        gasto = next(m for m in self.movs() if m["clase"] == "gasto")
        reem = [m for m in self.movs() if m["clase"] == "reembolso"]
        self.assertEqual({m.get("reembolsa") for m in reem}, {gasto["id"]})
        IM.deshacer_lote(self.a, a["lote"])
        reem = [m for m in self.movs() if m["clase"] == "reembolso"]
        self.assertEqual((len(reem), [m.get("reembolsa") for m in reem]), (3, [None, None, None]))  # siguen, sin enlace roto
        self.assertEqual({m["lote"] for m in reem}, {b["lote"]})

    def test_quitar_los_dos_lados_de_un_enlace_de_bizum_no_deja_nada_colgando(self):
        from financebuddy import bizums
        a = self.importar(self.extracto([("2026-09-10", "Pago Movil En Restaurante El Pino, Jaen", -60.00)], nombre="a.xlsx"))
        b = self.importar(self.extracto([("2026-09-13", "Bizum de Ana Ruiz Lopez", 15.00), ("2026-09-13", "Bizum de Luis Perez Gil", 15.00),
                                         ("2026-09-13", "Bizum de Eva Sanz Diaz", 15.00)], nombre="b.xlsx", saldo_inicial=940.0))
        bizums.enlazar(self.a)
        IM.deshacer_lote(self.a, b["lote"])
        self.assertEqual([m["clase"] for m in self.movs()], ["gasto"])
        self.assertEqual(IM.deshacer_lote(self.a, a["lote"])[1], 1)
        self.assertEqual(self.movs(), [])

    def test_un_movimiento_dividido_se_quita_entero(self):
        a = self.importar(self.extracto())
        m = next(m for m in self.movs() if "Mercadona" in m["ext_texto"])
        IM.dividir(self.a, m["id"], [{"importe": 30.2, "categoria": "Supermercado"}, {"importe": 15.0, "categoria": "Hogar"}])
        partes = [x for x in self.movs() if x.get("parte_de")]
        self.assertEqual((len(partes), {x["lote"] for x in partes}), (2, {a["lote"]}))  # las partes heredan el lote
        IM.deshacer_lote(self.a, a["lote"])
        self.assertEqual([x for x in self.movs() if x.get("parte_de")], [])
        self.assertEqual(self.movs(), [])
        self.assertEqual(self.importar(self.extracto())["nuevas"], 5)  # y vuelven como una sola fila

    def test_el_broker_tambien_deja_lote_y_se_quita_con_sus_cobros_y_aportaciones(self):
        csv = ("Fecha de operación;Fecha valor;Concepto;Importe\n"
               "10/09/2026;10/09/2026;FIDELITY MSCI WORLD INDEX;-150,00\n"
               "20/09/2026;20/09/2026;DIVIDENDO FIDELITY MSCI WORLD INDEX;2,00\n"
               "30/09/2026;30/09/2026;Periodo 01/09/2026 30/09/2026;0,45\n"
               "01/09/2026;01/09/2026;Ahorro;200,00\n")
        ruta = os.path.join(self.c.inversion, "b.csv"); escribir(ruta, "utf-8", csv)
        r = IM.importar_archivo(self.a, self.c, ruta, "inversion", "Bróker")
        lote = r["lote"]
        reg = self.registros_del_lote(lote)
        self.assertEqual((len(reg["aportacion"]), len(reg["cobro"]), len(reg["pendiente"])), (1, 1, 1))
        self.assertEqual(r["registros"], {t: len(v) for t, v in reg.items() if v})
        IM.deshacer_lote(self.a, lote)
        self.assertEqual([self.a.todos(t) for t in ("aportacion", "cobro", "pendiente", "movimiento")], [[], [], [], []])
        self.assertEqual(self.a.todos("activo")[0]["nombre"], "Fondo MSCI")  # los activos no son del lote

    ORDENES = ("Fecha de la orden;ISIN;Importe estimado;Nº de participaciones;Estado\n"
               "12/03/2026;IE00BYX5MX67;500.2 EUR;30,5;Finalizada\n"
               "04/03/2026;FR0000989626;1000 EUR;0,022;Finalizada\n")
    CUENTA = "Fecha de operación;Fecha valor;Concepto;Importe\n06/03/2026;06/03/2026;GROUPAMA TRESORERIE I ACC EUR;-999,50\n"

    def test_el_archivo_de_ordenes_deja_lote_y_al_quitarlo_solo_se_quedan_los_activos_con_ajustes(self):
        ruta = os.path.join(self.c.inversion, "ordenes.csv"); escribir(ruta, "cp1252", self.ORDENES)
        r = IM.importar_archivo(self.a, self.c, ruta, None, "Bróker")
        self.assertEqual(r["tipo"], "operaciones")
        self.assertEqual(({x.get("lote") for x in self.a.todos("aportacion")}, r["registros"]), ({r["lote"]}, {"aportacion": 2}))
        g = next(x for x in self.a.todos("activo") if x["nombre"] == "Groupama Trésorerie")
        self.a.guardar("activo", {**g, "ter": 0.1}, g["id"])  # algo tuyo: se queda
        msg, n = IM.deshacer_lote(self.a, r["lote"])
        self.assertEqual(n, 2); self.assertIn("y 1 activo que había creado (Fidelity S&P 500)", msg)
        self.assertEqual((self.a.todos("aportacion"), sorted(x["nombre"] for x in self.a.todos("activo"))), ([], ["Fondo MSCI", "Groupama Trésorerie"]))
        ruta = os.path.join(self.c.inversion, "ordenes2.csv"); escribir(ruta, "cp1252", self.ORDENES)
        self.assertEqual(IM.importar_archivo(self.a, self.c, ruta, None, "Bróker")["nuevas"], 2)

    def test_una_duda_del_broker_que_resuelven_las_ordenes_se_queda_con_el_lote_de_las_ordenes(self):
        ruta = os.path.join(self.c.inversion, "cuenta.csv"); escribir(ruta, "cp1252", self.CUENTA)
        cuenta = IM.importar_archivo(self.a, self.c, ruta, "inversion", "Bróker")
        ruta = os.path.join(self.c.inversion, "ordenes.csv"); escribir(ruta, "cp1252", self.ORDENES)
        ordenes = IM.importar_archivo(self.a, self.c, ruta, None, "Bróker")
        self.assertEqual(self.a.todos("pendiente"), [])
        g = next(a for a in self.a.todos("aportacion") if a["fecha"] == "2026-03-06")
        self.assertEqual(g["lote"], ordenes["lote"])  # la compra existe porque llegó la orden: quitar el extracto de la cuenta no la borra
        self.assertEqual(IM.deshacer_lote(self.a, cuenta["lote"])[1], 0)  # de ese extracto ya no queda nada que quitar
        self.assertEqual(len([a for a in self.a.todos("aportacion") if a["fecha"] == "2026-03-06"]), 1)

    def test_el_registro_guarda_solo_las_ultimas_importaciones(self):
        for i in range(IM.LOTES_MAX + 3):
            self.importar(self.extracto([(f"2026-09-{i + 1:02d}", f"Compra Tienda{i}, Madrid", -1.0)], nombre=f"x{i}.xlsx", saldo_inicial=1000.0 - i))
        self.assertEqual(len(self.a.config("importaciones")), IM.LOTES_MAX)

    def test_una_base_de_la_version_2_se_abre_y_se_marca(self):
        from financebuddy import almacen
        self.a.guardar("movimiento", {"fecha": "2026-09-20", "clase": "gasto", "categoria": "Ocio", "importe": 9.0, "concepto": "Antiguo"})
        self.a.set_config("version_esquema", 2); self.a.cerrar()
        self.a = Almacen(self.c.db)
        self.assertEqual(self.a.config("version_esquema"), almacen.VERSION_ESQUEMA)
        self.assertEqual([m["concepto"] for m in self.movs()], ["Antiguo"])  # sin lote: nunca se quita con una importación
        self.assertEqual(IM.deshacer_lote(self.a, "cualquiera")[1], 0)

class TestFormatosDeSerie(Base):
    """B-107: BBVA (Excel), la cuenta «Actual» de Revolut (CSV) y la cuenta de inversión de Revolut (CSV) se reconocen y se
    importan solos. Todo inventado, con la misma forma que los archivos de verdad."""
    def bbva(self, filas, nombre="bbva.xlsx", saldo=1000.0):
        """filas: [(fecha valor, fecha, concepto, movimiento, importe)] en orden cronológico → Excel de BBVA (lo más reciente arriba)."""
        import openpyxl
        wb = openpyxl.Workbook(); ws = wb.active; ws.title = "Informe BBVA"
        for _ in range(2): ws.append([None])
        ws.append([None, None, "Movimientos"]); ws.append([None, None, "Fecha de generación del informe: 30/09/2026"])
        ws.append([None, "Fecha valor", "Fecha", "Concepto", "Movimiento", "Importe", "Divisa", "Disponible", "Divisa", "Observaciones"])
        con_saldo = []
        for val, op, conc, mov, imp in filas:
            saldo = round(saldo + imp, 2); con_saldo.append([None, "/".join(reversed(val.split("-"))), "/".join(reversed(op.split("-"))), conc, mov, imp, "EUR", saldo, "EUR", ""])
        for f in reversed(con_saldo): ws.append(f)
        ruta = os.path.join(self.c.banco, nombre); wb.save(ruta); return ruta
    BBVA = [("2026-08-31", "2026-09-01", "Mercadona valencia", "Pago con tarjeta", -40.0),
            ("2026-09-01", "2026-09-01", "Bizum", "Recibido: cena", 15.0),
            ("2026-09-02", "2026-09-02", "Bizum", "ENVIADO: Sin concepto", -10.0),
            ("2026-09-03", "2026-09-03", "Transferencia recibida", "De Ana Prueba Inventada", 200.0),
            ("2026-09-04", "2026-09-04", "Ret. efectivo a debito con tarj. en cajero. aut.", "Otros", -20.0),
            ("2026-09-05", "2026-09-05", "Revolut**0000*", "Pago con tarjeta", -150.0)]
    ACTUAL = ("Tipo,Producto,Fecha de inicio,Fecha de finalización,Descripción,Importe,Comisión,Divisa,State,Saldo\n"
              "Recargas,Actual,2026-09-05 10:00:00,2026-09-05 10:00:02,Una recarga de Apple Pay con *0000,150.00,0.00,EUR,COMPLETADO,150.00\n"
              "Pago con tarjeta,Actual,2026-09-06 12:00:00,2026-09-08 09:00:00,Lidl,-20.00,0.50,EUR,COMPLETADO,129.50\n"
              "Transferir,Actual,2026-09-07 09:00:00,2026-09-07 09:00:01,A cuenta de inversión,-100.00,0.00,EUR,COMPLETADO,29.50\n"
              "Pago con tarjeta,Actual,2026-09-09 09:00:00,,Amazon,-5.00,0.00,EUR,PENDIENTE,\n")
    INVERSION = ("Date,Ticker,Type,Quantity,Price per share,Total Amount,Currency,FX Rate\n"
                 "2026-03-02T09:00:00.474680Z,,CASH TOP-UP,,,USD 110,USD,1.1000\n"
                 "2026-03-02T14:30:00.123Z,ACME,BUY - MARKET,2,USD 55,USD 110,USD,1.1000\n"
                 "2026-03-10T14:30:00Z,ACME,BUY - MARKET,1,USD 60,USD 60,USD,1.2000\n"
                 "2026-04-01T10:00:00Z,ACME,DIVIDEND,,,USD 1.10,USD,1.1000\n"
                 "2026-05-04T14:30:00Z,ACME,SELL - MARKET,1.5,USD 80,USD 120,USD,1.2000\n"
                 "2026-05-05T09:00:00Z,,CASH WITHDRAWAL,,,USD -120,USD,1.2000\n"
                 "2026-05-06T09:00:00Z,ZETA,BUY - LIMIT,3,EUR 10,EUR 30,EUR,1.0000\n"
                 "2026-06-01T09:00:00Z,ACME,STOCK SPLIT,2,,USD 0,USD,1.1000\n"
                 "2026-06-02T09:00:00Z,,CUSTODY FEE,,,USD -2.20,USD,1.1000\n")
    def csv(self, carpeta, nombre, texto):
        ruta = os.path.join(carpeta, nombre); escribir(ruta, "utf-8", texto); return ruta

    def test_texto_con_el_detalle(self):
        self.assertEqual(L.con_detalle("Bizum", "Recibido: cena"), "Bizum · Recibido: cena")
        self.assertEqual(L.con_detalle("Bizum", "Recibido: bizum de Ana"), "Bizum · Recibido: bizum de Ana")
        self.assertEqual(L.con_detalle("Transferencia recibida", "De Ana Prueba"), "Transferencia recibida · De Ana Prueba")
        self.assertEqual(L.con_detalle("Mercadona valencia", "Pago con tarjeta"), "Mercadona valencia")  # genérico: no se añade
        self.assertEqual(L.con_detalle("Cajero", "Otros"), "Cajero")
        self.assertEqual(L.con_detalle("Bizum recibido de Ana", "Recibido"), "Bizum recibido de Ana")  # ya lo dice el concepto
        self.assertEqual(L.con_detalle("", "Recibido: cena"), "Recibido: cena")

    def test_importes_con_la_moneda_delante(self):
        for txt, n in [("USD 108", 108.0), ("USD -0.03", -0.03), ("EUR -50", -50.0), ("12,30 EUR", 12.3), ("GBP 1,234.50", 1234.5), ("USD", None), ("ACME", None)]:
            self.assertEqual(L.numero(txt), n, txt)

    def test_se_reconocen_los_tres(self):
        perfiles = self.a.todos("perfil")
        self.assertEqual(L.reconocer(L.filas_crudas(self.bbva(self.BBVA)), perfiles)[0]["nombre"], "BBVA")
        self.assertEqual(L.reconocer(L.filas_crudas(self.csv(self.c.banco, "actual.csv", self.ACTUAL)), perfiles)[0]["nombre"], "Revolut (cuenta)")
        # Gana aunque haya un formato hecho a mano con menos columnas para el mismo archivo
        self.a.guardar("perfil", {"nombre": "Mi Revolut", "tipo": "inversion", "columnas": {"fecha": "date", "concepto": "ticker", "importe": "quantity"}})
        ruta = self.csv(self.c.inversion, "inversion.csv", self.INVERSION)
        self.assertEqual(L.reconocer(L.filas_crudas(ruta), self.a.todos("perfil"))[0]["nombre"], "Revolut (inversión)")
        self.assertEqual(IM.tipo_de(ruta, self.a, self.c), "operaciones")

    def test_bbva(self):
        r = self.importar(self.bbva(self.BBVA))
        self.assertTrue(r["ok"], r); self.assertEqual((r["perfil"], r["filas"]), ("BBVA", 6))
        textos = {m["ext_texto"]: m for m in self.movs()} | {p["fila"]["texto"]: p["fila"] for p in self.a.todos("pendiente")}
        self.assertEqual(sorted(textos), sorted(["Mercadona valencia", "Bizum · Recibido: cena", "Bizum · ENVIADO: Sin concepto",
                                                 "Transferencia recibida · De Ana Prueba Inventada", "Ret. efectivo a debito con tarj. en cajero. aut.", "Revolut**0000*"]))
        merc = textos["Mercadona valencia"]
        self.assertEqual((merc["fecha"], merc["ext_fecha"], merc["categoria"]), ("2026-08-31", "2026-09-01", "Supermercado"))  # fecha valor y fecha
        cena = textos["Bizum · Recibido: cena"]
        self.assertEqual((cena["clase"], cena["categoria"]), ("reembolso", "Comer fuera"))  # un Bizum aunque no traiga el nombre
        self.assertEqual(textos["Bizum · ENVIADO: Sin concepto"]["concepto"], "Bizum enviado")
        self.assertEqual(textos["Revolut**0000*"]["clase"], "transferencia")  # recargar Revolut con la tarjeta: dinero entre tus cuentas
        self.assertEqual(self.a.config("saldo_extracto:Nómina"), {"fecha": "2026-09-05", "saldo": 995.0})
        r = self.importar(self.bbva(self.BBVA, nombre="bbva2.xlsx"))
        self.assertEqual((r["nuevas"], r["existentes"], r["dudas"]), (0, 6, 0))

    def test_revolut_cuenta(self):
        self.a.guardar("cuenta", {"nombre": "Revolut", "tipo": "corriente", "extracto": True})
        self.importar(self.bbva(self.BBVA))
        r = self.importar(self.csv(self.c.banco, "actual.csv", self.ACTUAL), cuenta="Revolut")
        self.assertTrue(r["ok"], r); self.assertEqual((r["perfil"], r["filas"]), ("Revolut (cuenta)", 3))
        self.assertIn("1 sin completar (pendiente o anulada): no se importa", r["mensaje"])  # la compra pendiente no ha tocado el saldo
        self.assertEqual(r["traspasos"], 1)  # la recarga es el pago a Revolut del extracto de BBVA
        m = {x["ext_texto"]: x for x in self.movs() if x["cuenta"] == "Revolut"}
        self.assertEqual((m["Lidl"]["importe"], m["Lidl"]["fecha"], m["Lidl"]["ext_fecha"]), (20.5, "2026-09-06", "2026-09-08"))  # con la comisión
        self.assertEqual(m["Una recarga de Apple Pay con *0000"]["origen"], "Nómina")
        self.assertEqual([p["fila"]["clase"] for p in self.a.todos("pendiente") if p["cuenta"] == "Revolut"], ["transferencia"])  # «A cuenta de inversión»
        r = self.importar(self.csv(self.c.banco, "actual2.csv", self.ACTUAL), cuenta="Revolut")
        self.assertEqual((r["nuevas"], r["existentes"]), (0, 3))

    def test_revolut_inversion(self):
        self.a.guardar("activo", {"nombre": "Zeta Corp", "clase": "accion", "cuenta": "Bróker", "fuente_precio": "yahoo", "codigo_precio": "ZETA"})
        ruta = self.csv(self.c.inversion, "inversion.csv", self.INVERSION)
        with self.a.simular():  # la vista previa no deja nada
            self.assertEqual(IM.importar_archivo(self.a, self.c, ruta, None, "Bróker", simulando=True)["nuevas"], 6)  # 4 órdenes, 1 dividendo, 1 comisión
        self.assertEqual((self.a.todos("aportacion"), len(self.a.todos("activo"))), ([], 2))
        r = IM.importar_archivo(self.a, self.c, ruta, None, "Bróker")
        self.assertEqual((r["tipo"], r["perfil"], r["nuevas"], r["dudas"]), ("operaciones", "Revolut (inversión)", 6, 1))
        self.assertIn("2 ingresos o retiradas de efectivo ignorados", r["mensaje"])
        # Importes en euros (moneda ÷ cambio); una venta, con importe y participaciones en negativo
        self.assertEqual(sorted((a["fecha"], a["activo"], a["importe"], a["participaciones"]) for a in self.a.todos("aportacion")),
                         [("2026-03-02", "ACME", 100.0, 2.0), ("2026-03-10", "ACME", 50.0, 1.0), ("2026-05-04", "ACME", -100.0, -1.5),
                          ("2026-05-06", "Zeta Corp", 30.0, 3.0)])
        acme = next(a for a in self.a.todos("activo") if a["nombre"] == "ACME")  # creado solo; ZETA era «Zeta Corp» por su ticker
        self.assertEqual((acme["clase"], acme["cuenta"], acme["patrones"], acme.get("fuente_precio", "")), ("accion", "Bróker", ["acme"], ""))
        self.assertEqual([(c["fecha"], c["activo"], c["tipo"], c["importe"]) for c in self.a.todos("cobro")], [("2026-04-01", "ACME", "dividendo", 1.0)])
        self.assertEqual([(m["clase"], m["categoria"], m["importe"]) for m in self.movs()], [("gasto", "Comisiones", 2.0)])
        self.assertEqual([p["fila"]["texto"] for p in self.a.todos("pendiente")], ["STOCK SPLIT ACME · 2 títulos"])  # lo que no sé leer no se pierde
        # Otra vez el mismo archivo: nada nuevo
        r2 = IM.importar_archivo(self.a, self.c, self.csv(self.c.inversion, "inversion2.csv", self.INVERSION), None, "Bróker")
        self.assertEqual((r2["nuevas"], r2["existentes"], r2["dudas"]), (0, 7, 0))
        self.assertEqual((len(self.a.todos("aportacion")), len(self.a.todos("cobro")), len(self.a.todos("pendiente"))), (4, 1, 1))
        # Quitar la importación quita también el activo que creó (el que ya tenías se queda)
        msg, n = IM.deshacer_lote(self.a, r["lote"])
        self.assertIn("y 1 activo que había creado (ACME)", msg)
        self.assertEqual(sorted(a["nombre"] for a in self.a.todos("activo")), ["Fondo MSCI", "Zeta Corp"])
        self.assertEqual((self.a.todos("aportacion"), self.a.todos("cobro")), ([], []))

    def test_renombrar_el_activo_no_duplica_al_reimportar(self):
        IM.importar_archivo(self.a, self.c, self.csv(self.c.inversion, "inversion.csv", self.INVERSION), None, "Bróker")
        acme = next(a for a in self.a.todos("activo") if a["nombre"] == "ACME")
        self.a.guardar("activo", {**acme, "nombre": "Acme Corporation"}, acme["id"])  # la huella es el ticker del archivo, no el nombre
        r = IM.importar_archivo(self.a, self.c, self.csv(self.c.inversion, "inversion2.csv", self.INVERSION), None, "Bróker")
        self.assertEqual((r["nuevas"], r["dudas"], r["activos_nuevos"]), (0, 0, []))
        self.assertEqual(sorted(a["activo"] for a in self.a.todos("aportacion")), ["Acme Corporation"] * 3 + ["ZETA"])

    RARO = ("Date,Ticker,Type,Quantity,Price per share,Total Amount,Currency,FX Rate\n"
            "2026-07-01T09:00:00Z,ACME,DIVIDEND TAX (CORRECTION),,,USD -0.40,USD,1.2500\n"  # un dividendo que resta
            "2026-07-02T09:00:00Z,ACME,STOCK SPLIT,3,,,USD,1.1000\n"  # sin importe: no es una compra en espera
            "2026-07-03T09:00:00Z,ACME,TRANSFER FROM REVOLUT TRADING LTD TO REVOLUT SECURITIES EUROPE UAB,2.5,,,USD,1.1000\n"
            "2026-07-04T14:30:00Z,ACME,BUY - MARKET,2,USD 50,USD 100,USD,1.2500\n"
            "2026-07-05T09:00:00Z,,DIVIDEND,,,USD 1.25,USD,1.2500\n")  # sin ticker: ¿de qué activo?

    def test_lo_que_no_cuadra_con_su_tipo_va_a_revisar(self):
        r = IM.importar_archivo(self.a, self.c, self.csv(self.c.inversion, "raro.csv", self.RARO), None, "Bróker")
        self.assertEqual((r["nuevas"], r["dudas"]), (1, 4))
        P = {p["fila"]["texto"][:16]: p for p in self.a.todos("pendiente")}
        self.assertEqual(sorted(P), ["DIVIDEND", "DIVIDEND TAX (CO", "STOCK SPLIT ACME", "TRANSFER FROM RE"])
        # Con sus títulos y su ticker: es lo que hace falta para ajustar las participaciones
        self.assertEqual(P["STOCK SPLIT ACME"]["fila"]["texto"], "STOCK SPLIT ACME · 3 títulos")
        self.assertIn("de ACME (2,5 títulos)", P["TRANSFER FROM RE"]["duda"])
        self.assertEqual((self.a.todos("operacion"), self.a.todos("cobro")), ([], []))
        self.assertEqual([(a["importe"], a["participaciones"]) for a in self.a.todos("aportacion")], [(80.0, 2.0)])
        r = IM.importar_archivo(self.a, self.c, self.csv(self.c.inversion, "raro2.csv", self.RARO), None, "Bróker")
        self.assertEqual((r["nuevas"], r["dudas"], len(self.a.todos("pendiente"))), (0, 0, 4))

    def test_lo_resuelto_desde_por_revisar_no_vuelve_al_reimportar(self):
        IM.importar_archivo(self.a, self.c, self.csv(self.c.inversion, "raro.csv", self.RARO), None, "Bróker")
        for p in self.a.todos("pendiente"):
            d = {"accion": "dividendo", "activo": "ACME"} if p["fila"]["texto"] == "DIVIDEND" else {"accion": "activo", "activo": "ACME"}
            IM.resolver(self.a, p["id"], d)
        self.assertEqual((self.a.todos("pendiente"), len(self.a.todos("aportacion")), len(self.a.todos("cobro"))), ([], 4, 1))
        r = IM.importar_archivo(self.a, self.c, self.csv(self.c.inversion, "raro2.csv", self.RARO), None, "Bróker")
        self.assertEqual((r["nuevas"], r["dudas"]), (0, 0))
        self.assertEqual((self.a.todos("pendiente"), len(self.a.todos("aportacion")), len(self.a.todos("cobro"))), ([], 4, 1))

    def test_bizum_con_nombre_y_sin_el(self):
        from financebuddy import clasificar as C
        conc = lambda t, imp: C.clasificar_fila({"op": "2026-09-01", "texto": t, "importe": imp}, [], [], [], [], "Nómina")["concepto"]
        self.assertEqual(conc("BIZUM ENVIADO A ANA LOPEZ CONCEPTO cena", -10.0), "Cena")
        self.assertEqual(conc("Bizum recibido de Ana Lopez concepto cena", 10.0), "Parte de Ana")
        self.assertEqual(conc("Bizum · Enviado: cena", -10.0), "Cena")  # BBVA: el nombre no viene
        self.assertEqual(conc("Bizum · Recibido: cena", 10.0), "Parte de un Bizum")
        self.assertEqual(conc("Bizum · ENVIADO: Sin concepto", -10.0), "Bizum enviado")



class TestContinuidadExtractos(Base):
    def test_cargos_nuevos_del_mismo_dia_no_son_un_hueco(self):
        self.importar(self.extracto([("2026-10-07", "Compra Lidl", -10)], saldo_inicial=1000))
        r = self.importar(self.extracto([("2026-10-07", "Compra Lidl", -10), ("2026-10-07", "Compra Lidl", -8.99),
                                        ("2026-10-08", "Compra Lidl", -20)], saldo_inicial=1000))
        self.assertNotIn("hueco", r)
        self.assertEqual(r["saldo_igualado"]["saldo"], 961.01)

    def test_primera_importacion_compara_con_saldo_manual(self):
        self.a.guardar("patrimonio", {"fecha": "2026-10-11", "saldos": {"Nómina": 990}})
        self.a.guardar("movimiento", {"fecha": "2026-10-12", "cuenta": "Nómina", "clase": "gasto", "concepto": "Manual", "importe": 10})
        r = self.importar(self.extracto([("2026-10-20", "Compra Lidl", -20)], saldo_inicial=896.8))
        self.assertAlmostEqual(r["hueco"]["importe"], -83.2)

    def test_hueco_reancla_sin_inventar_movimientos(self):
        self.importar(self.extracto([("2026-10-11", "Compra Lidl", -10)], saldo_inicial=1000))
        r = self.importar(self.extracto([("2026-10-20", "Compra Lidl", -20)], saldo_inicial=906.8))
        self.assertAlmostEqual(r["hueco"]["importe"], -83.2)
        self.assertEqual((r["hueco"]["desde"], r["hueco"]["hasta"]), ("2026-10-12", "2026-10-19"))
        self.assertEqual(len(self.movs()), 2)
        ultimo = max(self.a.todos("patrimonio"), key=lambda p: p["fecha"])
        self.assertEqual(ultimo["saldos"], {"Nómina": 886.8})
        self.assertEqual(ultimo["origen_saldos"], {"Nómina": "extracto"})
        # El extracto que faltaba rellena la historia sin alterar el ancla actual.
        tarde = self.importar(self.extracto([("2026-10-15", "Compra Lidl", -83.2)], saldo_inicial=990))
        self.assertNotIn("hueco", tarde)
        self.assertEqual(max(self.a.todos("patrimonio"), key=lambda p: p["fecha"])["saldos"]["Nómina"], 886.8)

    def test_repetido_no_deja_previa_ni_lote(self):
        from financebuddy.servidor import App
        self.importar(self.extracto())
        app = App(self.dir, hoy="2026-11-03", fija=True)
        try:
            r = app._importar(self.extracto(), previa=True)
            self.assertTrue(r["ya_importado"])
            self.assertNotIn("previa", r)
            self.assertNotIn("lote", r)
        finally: app.alm.cerrar()

    def test_antiguo_no_cambia_saldo_posterior(self):
        self.importar(self.extracto([("2026-10-20", "Compra Lidl", -20)], saldo_inicial=900))
        self.importar(self.extracto([("2026-09-01", "Compra Lidl", -10)], saldo_inicial=1000))
        self.assertEqual(self.a.config("saldo_extracto:Nómina"), {"fecha": "2026-10-20", "saldo": 880})
        self.assertEqual(len(self.a.todos("patrimonio")), 1)

    def test_saldos_mixtos_conservan_origen(self):
        self.a.guardar("patrimonio", {"fecha": "2026-10-20", "saldos": {"Ahorro": 4000}, "nota": "Manual"})
        self.importar(self.extracto([("2026-10-20", "Compra Lidl", -20)], saldo_inicial=900))
        reg = self.a.todos("patrimonio")[0]
        self.assertEqual(reg["saldos"], {"Ahorro": 4000, "Nómina": 880})
        self.assertEqual(reg["origen_saldos"], {"Ahorro": "manual", "Nómina": "extracto"})

    def test_carpeta_con_una_pregunta_importa_los_demas(self):
        from financebuddy.servidor import App
        self.extracto()
        escribir(os.path.join(self.c.banco, "desconocido.csv"), "utf-8", "A;B;C\nuno;dos;tres\n")
        perfil = next(p for p in self.a.todos("perfil") if p["nombre"] == "Santander")
        self.a.guardar("perfil", {**perfil, "cuenta": "Nómina"}, perfil["id"])
        app = App(self.dir, hoy="2026-11-03", fija=True)
        try:
            r = app.manejar("/api/importar/carpeta", {})
            self.assertTrue(any(x.get("ok") and x.get("nuevas") for x in r["resultados"]))
            self.assertTrue(any(x.get("necesita") == "perfil" for x in r["resultados"]))
        finally: app.alm.cerrar()

    def test_broker_pregunta_y_recuerda_descartar_o_responder(self):
        from financebuddy.servidor import App
        app = App(self.dir, hoy="2026-11-03", fija=True)
        try:
            csv = os.path.join(self.c.inversion, "efectivo.csv")
            texto = "Fecha de operación;Fecha valor;Concepto;Importe\n01/09/2026;01/09/2026;Ahorro;200,00\n"
            escribir(csv, "utf-8", texto)
            self.assertEqual(app._importar(csv, "inversion", "Bróker")["preguntar_efectivo"], "Bróker")
            self.assertTrue(app.manejar("/api/importar/efectivo", {"cuenta": "Bróker"})["ok"])
            self.assertTrue(app.alm.config("efectivo_preguntado:Bróker"))
            self.assertFalse(app.alm.todos("patrimonio"))
            escribir(csv, "utf-8", texto)
            self.assertNotIn("preguntar_efectivo", app._importar(csv, "inversion", "Bróker"))
            app.manejar("/api/importar/efectivo", {"cuenta": "Bróker", "saldo": "301,50"})
            self.assertEqual(app.alm.todos("patrimonio")[0]["saldos"], {"Bróker": 301.5})
            self.assertEqual(app.alm.todos("patrimonio")[0]["origen_saldos"], {"Bróker": "manual"})
        finally: app.alm.cerrar()


class TestPreguntar(Base):
    def test_persona_concepto_gana_y_solo_casa_bizums(self):
        from financebuddy import clasificar as C
        especifica = self.a.guardar("regla", {"patron": "ana ruiz", "concepto": "cena", "categoria": "Comer fuera", "clase": "gasto"})
        self.a.guardar("regla", {"patron": "ana ruiz", "categoria": "Regalos", "clase": "gasto"})
        self.assertEqual(C.regla_para("Bizum a Ana Ruiz concepto cena", self.a.todos("regla"))["id"], especifica)
        self.assertEqual(C.regla_para("Bizum a Ana Ruiz concepto cine", self.a.todos("regla"))["categoria"], "Regalos")
        self.assertEqual(C.regla_para("Compra Ana Ruiz cena", self.a.todos("regla"))["categoria"], "Regalos")

    def test_preguntar_gana_serie_y_no_propaga(self):
        self.a.guardar("regla", {"patron": "mercadona", "accion": "preguntar"})
        r = self.importar(self.extracto([("2026-09-01", "Compra Mercadona", -10)]))
        self.assertEqual((r["nuevas"], r["dudas"]), (0, 1))
        p = self.a.todos("pendiente")[0]
        self.assertTrue(p["preguntar"])
        self.assertEqual(p["fila"]["cat"], "")

    def test_memoria_bizum_no_clasifica(self):
        for dia in range(1, 4):
            self.a.guardar("movimiento", {"fecha": f"2026-08-0{dia}", "clase": "gasto", "categoria": "Ocio", "importe": 5,
                                          "concepto": "Ana", "ext_texto": "Bizum a Ana Ruiz concepto cine"})
        r = self.importar(self.extracto([("2026-09-01", "Bizum a Ana Ruiz concepto sorpresa", -5)]))
        self.assertEqual((r["nuevas"], r["dudas"]), (0, 1))

    def test_proxima_actualiza_preguntar_sin_duplicar(self):
        rid = self.a.guardar("regla", {"patron": "ferreteria lopez", "accion": "preguntar"})
        self.importar(self.extracto([("2026-09-01", "Compra Ferreteria Lopez", -5)]))
        p = self.a.todos("pendiente")[0]
        IM.resolver(self.a, p["id"], {"clase": "gasto", "categoria": "Hogar", "patron": "FERRETERIA LOPEZ", "proxima": "siempre"})
        reglas = [r for r in self.a.todos("regla") if r["patron"] == "ferreteria lopez"]
        self.assertEqual(len(reglas), 1)
        self.assertEqual((reglas[0]["id"], reglas[0]["accion"], reglas[0]["categoria"]), (rid, "clasificar", "Hogar"))

    def test_proxima_concepto_solo_resuelve_conceptos_iguales(self):
        self.importar(self.extracto([("2026-09-01", "Bizum a Ana Ruiz concepto cena", -5),
                                    ("2026-09-02", "Bizum a Ana Ruiz concepto cine", -6),
                                    ("2026-09-03", "Bizum a Ana Ruiz concepto cena amigos", -7)]))
        p = next(p for p in self.a.todos("pendiente") if p["fila"]["op"] == "2026-09-01")
        IM.resolver(self.a, p["id"], {"clase": "gasto", "categoria": "Comer fuera", "patron": "ana ruiz", "proxima": "concepto", "palabra": "cena"})
        self.assertEqual([p["fila"]["op"] for p in self.a.todos("pendiente")], ["2026-09-02"])
        self.assertEqual(next(r for r in self.a.todos("regla") if r["patron"] == "ana ruiz")["concepto"], "cena")

    def test_importar_auto_y_preguntar_reglas_usuario_y_serie(self):
        from financebuddy.servidor import App
        rid = self.a.guardar("regla", {"patron": "tienda inventada", "categoria": "Hogar", "clase": "gasto"})
        self.importar(self.extracto([("2026-09-01", "Compra Tienda Inventada", -5), ("2026-09-02", "Compra Mercadona", -6)]))
        movs = self.movs()
        self.assertEqual(next(m for m in movs if "Inventada" in m["ext_texto"])["auto"], {"regla": rid, "serie": False})
        serie = next(m for m in movs if "Mercadona" in m["ext_texto"])["auto"]
        self.assertTrue(serie["serie"])
        self.assertEqual(self.a.obtener("regla", serie["regla"])["origen"], "plantilla")
        self.a.cerrar()
        app = App(self.dir, fija=True)
        try:
            for m in movs:
                r = app.manejar("/api/regla/preguntar", {"movimiento": m["id"]})
                self.assertTrue(r["ok"] and r["deshacer"], r)
                from financebuddy import clasificar as C
                regla = C.regla_para(m["ext_texto"], app.alm.todos("regla"))
                self.assertEqual(regla["accion"], "preguntar")
                self.assertEqual(app.alm.obtener("movimiento", m["id"])["categoria"], m["categoria"])
                self.assertTrue(app.manejar("/api/deshacer", {})["ok"])
        finally:
            app.alm.cerrar()
            self.a = Almacen(self.c.db)

    def test_migracion_idempotente_y_restauracion(self):
        mid = self.a.insertar_crudo("movimiento", {"fecha": "2026-09-01", "clase": "gasto", "categoria": "Hogar",
                                                "importe": 5, "concepto": "Inventado", "sugerido": "historial"})
        self.a.set_config("guardar_sugeridos", True)
        foto = self.a.instantanea()
        for _ in range(2):
            self.a.recuperar(foto)
            self.a.migrar_revision()
            m = self.a.obtener("movimiento", mid)
            self.assertNotIn("sugerido", m)
            self.assertEqual(m["auto"], {"historial": True})
            self.assertIsNone(self.a.config("guardar_sugeridos"))

    def test_datos_historial_racha_botones_y_ultimo_lote(self):
        from financebuddy.servidor import App
        for dia, cat in enumerate(["Ocio", "Comer fuera", "Comer fuera", "Comer fuera"], 1):
            self.a.guardar("movimiento", {"fecha": f"2026-08-0{dia}", "clase": "gasto", "categoria": cat,
                                          "importe": 5, "concepto": "Ana", "ext_texto": "Bizum a Ana Ruiz concepto plan"})
        self.importar(self.extracto([("2026-09-01", "Bizum a Ana Ruiz concepto cena", -5)]))
        self.a.cerrar()
        app = App(self.dir, fija=True)
        try:
            d = app.datos()
            p = d["pendientes"][0]
            self.assertEqual(p["bizum"], {"persona": "Ana Ruiz", "concepto": "cena"})
            self.assertEqual(p["historial"], [{"categoria": "Comer fuera", "n": 3}, {"categoria": "Ocio", "n": 1}])
            self.assertEqual(p["racha"], {"categoria": "Comer fuera", "n": 3})
            self.assertEqual(p["botones"][:2], ["Comer fuera", "Ocio"])
            self.assertEqual(len(p["botones"]), 6)
            self.assertEqual(d["ultimo_lote"], p["lote"])
        finally:
            app.alm.cerrar()
            self.a = Almacen(self.c.db)

    def test_palabra_y_botones_sin_historial_y_clase_ingreso(self):
        from financebuddy import clasificar as C
        d = C.detalle_revision({"texto": "Bizum a Ana Ruiz concepto cena", "importe": -5, "clase": "gasto"}, [], self.a.todos("categoria"))
        self.assertEqual(d["palabra"], {"palabra": "cena", "categoria": "Comer fuera"})
        self.assertEqual(d["botones"][0], "Comer fuera")
        self.assertEqual(d["historial"], [])
        self.assertNotIn("racha", d)
        d = C.detalle_revision({"texto": "Ingreso inventado", "importe": 5, "clase": "ingreso"}, [], self.a.todos("categoria"))
        ingresos = {c["nombre"] for c in self.a.todos("categoria") if c.get("grupo") == "ingreso"}
        self.assertTrue(set(d["botones"]) <= ingresos)

    def test_traspaso_con_regla_ambiguo_resuelto_no_es_automatico(self):
        self.a.guardar("regla", {"patron": "traspaso inventado", "clase": "transferencia", "cuenta_otra": "Nómina"})
        r = self.importar(self.extracto([("2026-09-01", "Traspaso inventado", -10)]))
        self.assertEqual((r["nuevas"], r["dudas"]), (0, 1))
        p = self.a.todos("pendiente")[0]
        self.assertNotIn("auto", p["fila"])
        # Una duda antigua que ya llevara esa marca tampoco la conserva al resolverla.
        self.a.guardar("pendiente", {**p, "fila": {**p["fila"], "auto": {"regla": 999, "serie": False}}}, p["id"])
        IM.resolver(self.a, p["id"], {"clase": "transferencia", "cuenta_otra": "Ahorro", "proxima": "preguntar"})
        m = self.movs()[0]
        self.assertEqual(m["destino"], "Ahorro")
        self.assertNotIn("auto", m)

if __name__ == "__main__":
    unittest.main()

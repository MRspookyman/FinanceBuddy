# Dividir un movimiento en varias categorías y volver a juntarlo (datos inventados).
import shutil, tempfile, unittest
from financebuddy import bizums, clasificar, importar, plantilla, rutas, servidor
from financebuddy.almacen import Almacen

EXT = {"ext_texto": "COMPRA TARJ. HIPERMERCADO SOL", "ext_importe": -87.4, "ext_fecha": "2026-09-10"}

class TestDividir(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.a = Almacen(rutas.Carpeta(self.dir).db)
        plantilla.instalar(self.a)
        self.id = self.a.guardar("movimiento", {"fecha": "2026-09-10", "clase": "gasto", "categoria": "Supermercado", "importe": 87.4,
                                                "concepto": "Hipermercado Sol", "cuenta": "Nómina", **EXT})

    def tearDown(self):
        self.a.cerrar()
        shutil.rmtree(self.dir, ignore_errors=True)

    def partes(self):
        return sorted((m for m in self.a.todos("movimiento") if m.get("parte_de") == self.id), key=lambda m: m["id"])

    def dividir(self, id=None):
        return importar.dividir(self.a, id or self.id, [{"importe": 62, "categoria": "Supermercado"}, {"importe": "25,40", "categoria": "Hogar", "nota": "sartén"}])

    def test_las_partes_suman_y_conservan_la_huella(self):
        self.assertEqual(self.dividir(), "Dividido en 2 partes")
        p = self.partes()
        self.assertEqual([(m["importe"], m["categoria"]) for m in p], [(62.0, "Supermercado"), (25.4, "Hogar")])
        self.assertEqual(p[0]["id"], self.id)  # la primera es el movimiento de siempre
        self.assertEqual(p[1]["nota"], "sartén")
        for m in p:
            self.assertEqual((m["fecha"], m["cuenta"], m["concepto"], m["ext_importe"], m["ext_fecha"]), ("2026-09-10", "Nómina", "Hipermercado Sol", -87.4, "2026-09-10"))

    def test_reimportar_no_duplica_lo_dividido(self):
        self.dividir()
        self.assertEqual(importar.huellas_existentes(self.a, "Nómina")[("2026-09-10", -87.4)], 1)
        # dos cargos iguales el mismo día, los dos divididos: son dos filas del extracto, no una
        otro = self.a.guardar("movimiento", {"fecha": "2026-09-10", "clase": "gasto", "categoria": "Supermercado", "importe": 87.4,
                                             "concepto": "Hipermercado Sol", "cuenta": "Nómina", **EXT})
        self.dividir(otro)
        self.assertEqual(importar.huellas_existentes(self.a, "Nómina")[("2026-09-10", -87.4)], 2)

    def test_lo_que_no_cuadra_no_se_divide(self):
        casos = [
            ([{"importe": 60, "categoria": "Supermercado"}, {"importe": 20, "categoria": "Hogar"}], "suman 80,00 € y el movimiento es de 87,40 €"),
            ([{"importe": 87.4, "categoria": "Supermercado"}], "entre 2 y 6"),
            ([{"importe": 87.4, "categoria": "Supermercado"}, {"importe": 0, "categoria": "Hogar"}], "mayor que cero"),
            ([{"importe": 62, "categoria": "Supermercado"}, {"importe": 25.4, "categoria": "No existe"}], "categoría de cada parte"),
        ]
        for partes, texto in casos:
            with self.assertRaises(ValueError) as e: importar.dividir(self.a, self.id, partes)
            self.assertIn(texto, str(e.exception))
        self.assertEqual(self.partes(), [])
        self.assertEqual(len(self.a.todos("movimiento")), 1)

    def test_no_se_divide_un_fijo_un_traspaso_ni_un_gasto_con_bizums(self):
        fijo = self.a.guardar("movimiento", {"fecha": "2026-09-01", "clase": "gasto", "categoria": "Vivienda", "importe": 700, "concepto": "Alquiler", "recurrente": "Alquiler"})
        tras = self.a.guardar("movimiento", {"fecha": "2026-09-02", "clase": "transferencia", "importe": 100, "concepto": "A ahorro", "destino": "Ahorro"})
        self.a.guardar("movimiento", {"fecha": "2026-09-11", "clase": "reembolso", "categoria": "Supermercado", "importe": 20, "concepto": "Parte de Ana", "reembolsa": self.id})
        for id, texto in ((fijo, "fijo"), (tras, "gastos e ingresos"), (self.id, "Bizums")):
            with self.assertRaises(ValueError) as e: importar.dividir(self.a, id, [{"importe": 1, "categoria": "Hogar"}, {"importe": 1, "categoria": "Ocio"}])
            self.assertIn(texto, str(e.exception))

    def test_volver_a_juntar(self):
        self.dividir()
        with self.assertRaises(ValueError): self.dividir()  # una parte no se vuelve a dividir
        segunda = self.partes()[1]["id"]
        self.assertEqual(importar.juntar(self.a, segunda), self.id)  # desde cualquiera de las partes
        m = self.a.todos("movimiento")
        self.assertEqual(len(m), 1)
        self.assertEqual((m[0]["id"], m[0]["importe"], m[0]["categoria"], m[0].get("parte_de")), (self.id, 87.4, "Supermercado", None))
        with self.assertRaises(ValueError): importar.juntar(self.a, self.id)

    def test_lo_dividido_no_se_recategoriza_en_bloque_ni_ensena_al_historial(self):
        otro = self.a.guardar("movimiento", {"fecha": "2026-08-10", "clase": "gasto", "categoria": "Supermercado", "importe": 30, "concepto": "Hipermercado Sol",
                                             "cuenta": "Nómina", "ext_texto": EXT["ext_texto"], "ext_importe": -30, "ext_fecha": "2026-08-10"})
        self.dividir()
        hogar = self.partes()[1]
        importar.recategorizar(self.a, otro, {"categoria": "Compras", "parecidos": True})
        self.assertEqual(self.a.obtener("movimiento", hogar["id"])["categoria"], "Hogar")
        self.assertEqual(self.a.obtener("movimiento", self.id)["categoria"], "Supermercado")
        mem = clasificar.memoria(self.a.todos("movimiento"))
        self.assertEqual({cat for c in mem.values() for (_, cat) in c}, {"Compras"})

    def test_un_bizum_no_se_enlaza_solo_a_una_parte_y_con_uno_enlazado_no_se_junta(self):
        self.dividir()
        hogar = self.partes()[1]
        bizum = lambda cat, imp, texto: self.a.guardar("movimiento", {"fecha": "2026-09-10", "clase": "reembolso", "categoria": cat, "importe": imp, "concepto": "Bizum", "cuenta": "Nómina",
                                                                     "ext_texto": texto, "ext_importe": imp, "ext_fecha": "2026-09-10"})
        de_la_parte = bizum("Hogar", 12.7, "BIZUM DE ANA SARTEN")  # la mitad de la parte de Hogar: sin dividir, se enlazaría
        cine = self.a.guardar("movimiento", {"fecha": "2026-09-10", "clase": "gasto", "categoria": "Ocio", "importe": 40, "concepto": "Cine", "cuenta": "Nómina"})
        del_cine = bizum("Ocio", 20, "BIZUM DE LUIS CINE")
        self.assertEqual(bizums.enlazar(self.a), 1)  # solo el del cine, que no está dividido
        self.assertEqual(self.a.obtener("movimiento", del_cine).get("reembolsa"), cine)
        self.assertIsNone(self.a.obtener("movimiento", de_la_parte).get("reembolsa"))
        # Si lo enlazas tú con una parte, juntar se niega: borraría la parte y el Bizum se quedaría sin su gasto
        m = self.a.obtener("movimiento", de_la_parte)
        self.a.guardar("movimiento", {**{k: v for k, v in m.items() if k != "id"}, "reembolsa": hogar["id"]}, de_la_parte)
        with self.assertRaises(ValueError) as e: importar.juntar(self.a, self.id)
        self.assertIn("Bizums", str(e.exception))
        self.assertEqual(len(self.partes()), 2)

    def test_una_parte_no_cambia_de_importe_fecha_ni_cuenta_ni_se_borra_sola(self):
        self.a.cerrar()
        app = servidor.App(self.dir, fija=True)
        try:
            app.manejar("/api/movimiento/dividir", {"id": self.id, "partes": [{"importe": 62, "categoria": "Supermercado"}, {"importe": 25.4, "categoria": "Hogar"}]})
            hogar = next(m for m in app.alm.todos("movimiento") if m["categoria"] == "Hogar")
            datos = {k: v for k, v in hogar.items() if k != "id"}
            for cambio in ({"importe": 40}, {"fecha": "2026-08-02"}, {"cuenta": "Ahorro"}, {"clase": "ingreso"}):
                with self.assertRaises(ValueError) as e: app.manejar("/api/guardar", {"tipo": "movimiento", "id": hogar["id"], "datos": {**datos, **cambio}})
                self.assertIn("vuelve a juntarlo", str(e.exception))
            with self.assertRaises(ValueError) as e: app.manejar("/api/borrar", {"tipo": "movimiento", "id": hogar["id"]})
            self.assertIn("vuelve a juntarlo", str(e.exception))
            # Lo suyo sí se cambia (categoría y nota), aunque la página mande el importe como texto y no mande la huella del extracto
            suyo = {k: v for k, v in datos.items() if not k.startswith("ext_") and k != "parte_de"}
            self.assertTrue(app.manejar("/api/guardar", {"tipo": "movimiento", "id": hogar["id"], "datos": {**suyo, "importe": "25,40", "categoria": "Compras", "nota": "sartén"}})["ok"])
            m = app.alm.obtener("movimiento", hogar["id"])
            self.assertEqual((m["categoria"], m["nota"], m["importe"], m["parte_de"], m["ext_importe"]), ("Compras", "sartén", 25.4, self.id, -87.4))
            self.assertEqual(round(sum(x["importe"] for x in app.alm.todos("movimiento")), 2), 87.4)
            # Un movimiento cualquiera no se hace «parte» por el formulario
            otro = app.manejar("/api/guardar", {"tipo": "movimiento", "datos": {"fecha": "2026-09-12", "clase": "gasto", "categoria": "Ocio", "importe": 9, "concepto": "Cine", "parte_de": self.id}})["id"]
            self.assertIsNone(app.alm.obtener("movimiento", otro).get("parte_de"))
            # Y después de volver a juntarlo, se borra como cualquiera
            app.manejar("/api/movimiento/juntar", {"id": hogar["id"]})
            self.assertTrue(app.manejar("/api/borrar", {"tipo": "movimiento", "id": self.id})["ok"])
        finally:
            app.alm.cerrar()
            self.a = Almacen(rutas.Carpeta(self.dir).db)

    def test_por_la_api_se_puede_deshacer(self):
        self.a.cerrar()
        app = servidor.App(self.dir, fija=True)
        try:
            r = app.manejar("/api/movimiento/dividir", {"id": self.id, "partes": [{"importe": 62, "categoria": "Supermercado"}, {"importe": 25.4, "categoria": "Hogar"}]})
            self.assertTrue(r["ok"])
            self.assertEqual(len(app.alm.todos("movimiento")), 2)
            self.assertTrue(app.manejar("/api/deshacer", {})["ok"])
            m = app.alm.todos("movimiento")
            self.assertEqual((len(m), m[0]["importe"], m[0].get("parte_de")), (1, 87.4, None))
        finally:
            app.alm.cerrar()
            self.a = Almacen(rutas.Carpeta(self.dir).db)

    def test_quitar_un_aviso_y_volver_a_ponerlo(self):
        self.a.cerrar()
        app = servidor.App(self.dir, fija=True)
        try:
            app.manejar("/api/config/descartar_aviso", {"clave": "inicio:ritmo:2026-10"})
            app.manejar("/api/config/descartar_aviso", {"clave": "inicio:ritmo:2026-10"})
            self.assertEqual(app.alm.config("avisos_descartados"), ["inicio:ritmo:2026-10"])
            app.manejar("/api/config/descartar_aviso", {"clave": "inicio:ritmo:2026-10", "volver": True})
            self.assertEqual(app.alm.config("avisos_descartados"), [])
        finally:
            app.alm.cerrar()
            self.a = Almacen(rutas.Carpeta(self.dir).db)

if __name__ == "__main__":
    unittest.main()

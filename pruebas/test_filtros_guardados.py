# Filtros guardados de Movimientos: la ruta guarda la lista en config, la limpia y no deja pasar lo que no es un filtro (datos inventados).
import shutil, tempfile, unittest
from financebuddy import servidor

F = {"nombre": "Sin revisar grandes", "busqueda": "super", "categoria": "Ocio", "cuenta": "Nómina", "desde": "50", "hasta": "1.000,50",
     "sinRevisar": True, "etiqueta": "viaje", "deben": True, "periodo": "año", "orden": "importe"}

class TestFiltrosGuardados(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.app = servidor.App(self.dir, fija=True)

    def tearDown(self):
        self.app.alm.cerrar()
        shutil.rmtree(self.dir, ignore_errors=True)

    def guardar(self, lista): return self.app.manejar("/api/config/filtros_movimientos", {"lista": lista})
    def guardados(self): return self.app.alm.config("filtros_movimientos")

    def test_guarda_la_lista_tal_cual_y_llega_a_la_pagina(self):
        self.assertTrue(self.guardar([F])["ok"])
        self.assertEqual(self.guardados(), [F])
        self.assertEqual(self.app.datos()["config"]["filtros_movimientos"], [F])
        self.guardar([])  # borrar el último deja la lista vacía
        self.assertEqual(self.guardados(), [])

    def test_limpia_lo_que_llega(self):
        self.guardar([{"nombre": "  Un   nombre  " + "x" * 100, "busqueda": "a" * 500, "sinRevisar": "sí", "periodo": "siempre", "orden": "azar", "otro": 1, "desde": 5}])
        g = self.guardados()[0]
        self.assertEqual(len(g["nombre"]), 60)
        self.assertTrue(g["nombre"].startswith("Un nombre x"))
        self.assertEqual((len(g["busqueda"]), g["sinRevisar"], g["periodo"], g["orden"], g["desde"], g["deben"]), (120, False, "mes", "fecha", "", False))
        self.assertNotIn("otro", g)

    def test_rechaza_lo_que_no_es_valido(self):
        self.guardar([F])
        for mala in ("no es lista", {"a": 1}, [1], [{"nombre": "  "}], [{"nombre": "A"}, {"nombre": "a"}], [{"nombre": f"f{i}"} for i in range(21)]):
            with self.assertRaises(ValueError): self.guardar(mala)
        self.assertEqual(self.guardados(), [F])  # lo de antes sigue ahí
        self.assertTrue(self.guardar([{"nombre": f"f{i}"} for i in range(20)])["ok"])  # justo el máximo

    def test_guardar_anula_deshacer_porque_la_foto_incluye_la_configuracion(self):
        self.app.deshacer = self.app.alm.instantanea(); self.app.deshacer_que = "algo"
        self.guardar([F])
        self.assertIsNone(self.app.deshacer)

if __name__ == "__main__":
    unittest.main()

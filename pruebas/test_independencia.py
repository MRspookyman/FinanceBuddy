# Supuestos de la calculadora de independencia: se guardan en config sin tocar ningún registro, solo los campos conocidos y solo números.
import shutil, tempfile, unittest
from financebuddy import servidor

class TestIndependencia(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.app = servidor.App(self.dir, fija=True)

    def tearDown(self):
        self.app.alm.cerrar()
        shutil.rmtree(self.dir, ignore_errors=True)

    def guardar(self, v): return self.app.manejar("/api/config", {"independencia": v})
    def guardado(self): return self.app.alm.config("independencia")

    def test_guarda_los_numeros_y_llega_a_la_pagina(self):
        self.assertTrue(self.guardar({"gasto": "24.000,50", "tasa": 3.5, "edad": 40, "pension": "900", "edadPension": 67})["ok"])
        self.assertEqual(self.guardado(), {"gasto": 24000.5, "tasa": 3.5, "edad": 40, "pension": 900, "edadPension": 67})
        self.assertEqual(self.app.datos()["config"]["independencia"]["gasto"], 24000.5)

    def test_vacio_o_desconocido_se_descarta(self):
        self.guardar({"gasto": "", "rent": None, "otro": 5, "apo": 1e12})
        self.assertEqual(self.guardado(), {})
        self.guardar("hola")
        self.assertEqual(self.guardado(), {})

    def test_no_toca_los_registros(self):
        self.guardar({"gasto": 1000})
        self.assertEqual(self.app.alm.todos("movimiento"), [])

if __name__ == "__main__": unittest.main()

# Arrancar con Windows: la entrada del registro se pone, se lee y se quita. Se prueba en una rama del registro que Windows no
# ejecuta (no en la de verdad): si una prueba se queda a medias, no arranca nada al iniciar sesión.
import sys, unittest
from financebuddy import autoarranque

EXE = '"C:\\Apps\\FinanceBuddy\\FinanceBuddy.exe" --bandeja'

@unittest.skipUnless(sys.platform == "win32", "solo en Windows")
class TestAutoarranque(unittest.TestCase):
    def setUp(self):
        import winreg
        self.winreg = winreg
        self.real = (autoarranque.CLAVE, autoarranque.orden)
        autoarranque.CLAVE = r"Software\FinanceBuddy-pruebas\Run"
        autoarranque.orden = lambda: EXE

    def tearDown(self):
        for clave in (autoarranque.CLAVE, r"Software\FinanceBuddy-pruebas"):
            try: self.winreg.DeleteKey(self.winreg.HKEY_CURRENT_USER, clave)
            except OSError: pass
        autoarranque.CLAVE, autoarranque.orden = self.real

    def test_se_pone_se_ve_y_se_quita(self):
        self.assertEqual(autoarranque.estado(), {"disponible": True, "activo": False, "motivo": ""})
        self.assertTrue(autoarranque.poner(True)["activo"])
        self.assertEqual(autoarranque._leer(), EXE)
        self.assertTrue(autoarranque.poner(True)["activo"])  # dos veces no estorba
        self.assertFalse(autoarranque.poner(False)["activo"])
        self.assertIsNone(autoarranque._leer())
        self.assertFalse(autoarranque.poner(False)["activo"])  # y quitar lo que no está, tampoco

    def test_si_la_app_cambia_de_carpeta_se_pone_al_dia_al_abrirla(self):
        autoarranque.poner(True)
        autoarranque.orden = lambda: '"D:\\Otra\\FinanceBuddy.exe" --bandeja'
        self.assertFalse(autoarranque.estado()["activo"])  # la entrada apunta a la carpeta de antes
        autoarranque.al_dia()
        self.assertTrue(autoarranque.estado()["activo"])
        autoarranque.poner(False); autoarranque.al_dia()  # apagado, abrir la app no lo enciende
        self.assertIsNone(autoarranque._leer())

    def test_ni_desde_el_codigo_fuente_ni_desde_una_app_de_pruebas(self):
        self.assertFalse(autoarranque.estado(fija=True)["disponible"])
        with self.assertRaises(ValueError): autoarranque.poner(True, fija=True)
        autoarranque.al_dia(fija=True)
        autoarranque.orden = self.real[1]  # la de verdad: estas pruebas no son el .exe
        self.assertFalse(autoarranque.estado()["disponible"])
        with self.assertRaises(ValueError) as e: autoarranque.poner(True)
        self.assertIn("app instalada", str(e.exception))
        self.assertIsNone(autoarranque._leer())

if __name__ == "__main__":
    unittest.main()

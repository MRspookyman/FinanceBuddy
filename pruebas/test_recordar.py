# Avisos de Windows: qué se recuerda cada día (datos inventados) y que, apagado, no se dice nada.
import shutil, tempfile, threading, unittest
from financebuddy import plantilla, recordar, rutas
from financebuddy.almacen import Almacen

class TestRecordar(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.a = Almacen(rutas.Carpeta(self.dir).db)
        plantilla.instalar(self.a)

    def tearDown(self):
        self.a.cerrar()
        shutil.rmtree(self.dir, ignore_errors=True)

    def test_recordatorios_dentro_de_su_plazo(self):
        self.a.guardar("recordatorio", {"nombre": "ITV", "fecha": "2026-10-10", "avisar_dias": 14})
        self.a.guardar("recordatorio", {"nombre": "Seguro", "fecha": "2026-12-01", "avisar_dias": 14})
        self.a.guardar("recordatorio", {"nombre": "Renta", "fecha": "2026-09-30", "avisar_dias": 0})
        self.a.guardar("recordatorio", {"nombre": "Ya está", "fecha": "2026-09-29", "estado": "hecho"})
        self.a.guardar("recordatorio", {"nombre": "Atrasado", "fecha": "2026-09-20"})
        textos = [t for _, t in recordar.pendientes(self.a, "2026-09-30")]
        self.assertEqual(textos, ["ITV · en 10 días", "Renta · hoy", "Atrasado · desde el 20/09"])

    def test_dias_sin_importar(self):
        self.a.guardar("movimiento", {"fecha": "2026-09-25", "clase": "gasto", "importe": 10, "concepto": "Pan", "cuenta": "Nómina"})
        self.assertEqual(recordar.pendientes(self.a, "2026-09-30"), [])
        self.assertEqual(recordar.pendientes(self.a, "2026-10-04"), [("importar", "Llevas 9 días sin importar el extracto de tu banco")])

    def test_sin_movimientos_no_pide_importar(self):
        self.assertEqual(recordar.pendientes(self.a, "2026-09-30"), [])

    def test_apagado_no_avisa_y_encendido_una_vez_al_dia(self):
        class App: pass
        app = App(); app.alm = self.a; app.hoy = "2026-09-30"
        self.a.guardar("recordatorio", {"nombre": "ITV", "fecha": "2026-10-01"})
        dichos, parar = [], threading.Event()
        parar.set()  # el hilo no llega a mirar: se llama a mano
        h = recordar.vigilar(app, dichos.append, parar)
        h.join(2)
        h.una_vez()
        self.assertEqual(dichos, [])  # apagado de serie
        self.a.set_config("avisos_windows", True)
        h.una_vez(); h.una_vez()
        self.assertEqual(dichos, ["ITV · mañana"])
        app.hoy = "2026-10-01"
        h.una_vez()
        self.assertEqual(dichos, ["ITV · mañana", "ITV · hoy"])

if __name__ == "__main__":
    unittest.main()

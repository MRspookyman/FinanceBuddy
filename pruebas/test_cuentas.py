"""Preferencias visuales de cuentas: validación, API, deshacer y versión del esquema."""
import os
import tempfile
import unittest
from financebuddy import almacen, modelo, servidor


class TestCuentas(unittest.TestCase):
    def test_preferencias_opcionales(self):
        c = modelo.limpiar("cuenta", {"nombre": "Nómina"})
        for k in ("alias", "icono", "color"):
            self.assertNotIn(k, c)
        for icono in ("🏦", "🌱", "📈", "💼", "🏠", "✈️", "🎯", "💶"):
            for color in (*range(1, 7), *map(str, range(1, 7))):  # número o cadena: se guarda siempre como cadena
                c = modelo.limpiar("cuenta", {"nombre": "Nómina", "alias": "  Mi   colchón ", "icono": icono, "color": color})
                self.assertEqual((c["nombre"], c["alias"], c["icono"], c["color"]), ("Nómina", "Mi colchón", icono, str(color)))
        self.assertEqual(modelo.limpiar("cuenta", {"nombre": "N", "alias": "x" * 24, "color": "6"})["alias"], "x" * 24)

    def test_rechaza_preferencias_invalidas(self):
        for campo, valores in (("alias", ["x" * 25]), ("icono", ["🐱", "🏦🌱", "Banco"]), ("color", [0, 7, -1, 1.5, True, False, "#5B3FD1", "azul", "1.0"])):
            for valor in valores:
                with self.subTest(campo=campo, valor=valor), self.assertRaises(ValueError):
                    modelo.limpiar("cuenta", {"nombre": "Nómina", campo: valor})

    def test_api_conserva_nombre_y_permite_deshacer_y_restaurar_diseño(self):
        with tempfile.TemporaryDirectory() as carpeta:
            app = servidor.App(carpeta, hoy="2026-09-30")
            try:
                guardar = lambda tipo, datos, id=None: app.manejar("/api/guardar", {"tipo": tipo, "datos": datos, "id": id})
                id = guardar("cuenta", {"nombre": "Nómina", "tipo": "corriente"})["id"]
                guardar("movimiento", {"fecha": "2026-09-10", "clase": "gasto", "importe": 10, "concepto": "Café", "cuenta": "Nómina"})
                c = app.alm.obtener("cuenta", id)
                self.assertTrue(guardar("cuenta", {**c, "alias": "Colchón", "icono": "🎯", "color": "4"}, id)["ok"])
                actual = app.datos()["registros"]["cuenta"][0]
                self.assertEqual((actual["alias"], actual["icono"], actual["color"], actual["nombre"]), ("Colchón", "🎯", "4", "Nómina"))
                self.assertEqual(app.alm.todos("movimiento")[0]["cuenta"], "Nómina")
                self.assertTrue(app.manejar("/api/deshacer", {})["ok"])
                self.assertNotIn("alias", app.alm.obtener("cuenta", id))
                guardar("cuenta", {**c, "alias": "Colchón", "icono": "🎯", "color": 4}, id)
                guardar("cuenta", {**app.alm.obtener("cuenta", id), "alias": "", "icono": "", "color": ""}, id)
                for k in ("alias", "icono", "color"):
                    self.assertNotIn(k, app.alm.obtener("cuenta", id))
            finally:
                app.alm.cerrar()

    def test_esquema_actual_actualiza_el_anterior_y_rechaza_futuro(self):
        with tempfile.TemporaryDirectory() as carpeta:
            ruta = os.path.join(carpeta, "datos.db")
            a = almacen.Almacen(ruta)
            a.set_config("version_esquema", almacen.VERSION_ESQUEMA - 1)
            a.cerrar()
            a = almacen.Almacen(ruta)
            self.assertEqual(a.config("version_esquema"), almacen.VERSION_ESQUEMA)
            a.set_config("version_esquema", almacen.VERSION_ESQUEMA + 1)
            a.cerrar()
            with self.assertRaises(almacen.BaseMasNueva):
                almacen.Almacen(ruta)

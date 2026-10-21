# B-018 (otra divisa), B-063 (gastos a medias) y B-064 (etiquetas): lo que el modelo acepta y rechaza, y que la API lo guarda y lo conserva.
import io, os, shutil, sys, tempfile, unittest
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from financebuddy import exportar, importar as IM, modelo, servidor

BASE = {"fecha": "2026-09-10", "clase": "gasto", "categoria": "Ocio", "importe": 40, "cuenta": "Nómina", "concepto": "Cena"}
limpio = lambda **x: modelo.limpiar("movimiento", {**BASE, **x})

class TestModelo(unittest.TestCase):
    def test_sin_campos_nuevos_un_movimiento_queda_como_antes(self):
        m = limpio()
        for k in ("divisa", "importe_divisa", "mi_parte", "etiquetas"): self.assertNotIn(k, m)
        self.assertFalse(m["a_medias"]); self.assertFalse(m.get("cobrado", False))

    def test_otra_divisa_guarda_el_original_junto_al_importe_en_euros(self):
        m = limpio(importe=46.3, divisa="usd", importe_divisa="50,00")
        self.assertEqual((m["importe"], m["divisa"], m["importe_divisa"]), (46.3, "USD", 50.0))

    def test_la_divisa_y_su_importe_van_juntos_y_el_euro_no_es_otra_divisa(self):
        for malo in ({"divisa": "USD"}, {"importe_divisa": 50}, {"divisa": "DOLAR", "importe_divisa": 5}, {"divisa": "EUR", "importe_divisa": 5}, {"divisa": "USD", "importe_divisa": 0}):
            with self.assertRaises(ValueError, msg=malo): limpio(**malo)

    def test_a_medias_guarda_tu_parte_y_pide_que_sea_menor_que_el_importe(self):
        m = limpio(a_medias=True, mi_parte="15,50")
        self.assertEqual((m["a_medias"], m["mi_parte"], m["cobrado"]), (True, 15.5, False))
        self.assertTrue(limpio(a_medias=True, mi_parte=0)["mi_parte"] == 0)  # todo lo paga otro: tu parte es cero
        for malo in ({"mi_parte": None}, {"mi_parte": 40}, {"mi_parte": 50}):
            with self.assertRaises(ValueError, msg=malo): limpio(a_medias=True, **malo)

    def test_a_medias_solo_vale_en_gastos_y_sin_marcar_se_olvida_tu_parte(self):
        for m in (limpio(clase="ingreso", a_medias=True, mi_parte=10, categoria="Nómina"), limpio(a_medias=False, mi_parte=10, cobrado=True)):
            self.assertFalse(m["a_medias"]); self.assertNotIn("mi_parte", m); self.assertNotIn("cobrado", m)

    def test_una_parte_de_un_dividido_no_va_a_medias(self):
        with self.assertRaises(ValueError): limpio(a_medias=True, mi_parte=10, parte_de=7)

    def test_etiquetas_sin_almohadilla_ni_repetidas(self):
        self.assertEqual(limpio(etiquetas="#Vacaciones, vacaciones,  regalo  de boda ,")["etiquetas"], ["Vacaciones", "regalo de boda"])
        self.assertEqual(limpio(etiquetas=["a", "A", "b"])["etiquetas"], ["a", "b"])
        for malo in ("x" * 31, ",".join(str(i) for i in range(13))):
            with self.assertRaises(ValueError): limpio(etiquetas=malo)

class TestApi(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp(); self.app = servidor.App(self.dir, hoy="2026-09-30")
        self.api("/api/bienvenida", {"cuentas": [{"nombre": "Nómina", "tipo": "corriente", "saldo": 1000}]})
    def tearDown(self):
        self.app.alm.cerrar(); shutil.rmtree(self.dir, ignore_errors=True)
    def api(self, ruta, d=None): return self.app.manejar(ruta, d or {})
    def guardar(self, **x): return self.api("/api/guardar", {"tipo": "movimiento", "datos": {**BASE, **x}})

    def test_se_guardan_se_conservan_al_editar_y_se_pueden_quitar(self):
        r = self.guardar(importe=46.3, divisa="USD", importe_divisa=50, a_medias=True, mi_parte=23.15, etiquetas="viaje, comida")
        self.assertTrue(r["ok"], r)
        m = self.app.alm.obtener("movimiento", r["id"])
        self.assertEqual((m["divisa"], m["importe_divisa"], m["mi_parte"], m["etiquetas"]), ("USD", 50, 23.15, ["viaje", "comida"]))
        self.api("/api/movimiento/categoria", {"ids": [r["id"]], "categoria": "Viajes"})  # cambiar la categoría no pierde nada
        m = self.app.alm.obtener("movimiento", r["id"])
        self.assertEqual((m["categoria"], m["divisa"], m["mi_parte"], m["etiquetas"]), ("Viajes", "USD", 23.15, ["viaje", "comida"]))
        self.api("/api/guardar", {"tipo": "movimiento", "id": r["id"], "datos": {**BASE, "etiquetas": []}})
        m = self.app.alm.obtener("movimiento", r["id"])
        self.assertTrue(all(k not in m for k in ("divisa", "importe_divisa", "mi_parte", "etiquetas")) and not m["a_medias"])

    def test_un_error_de_los_campos_nuevos_no_guarda_nada(self):
        with self.assertRaises(ValueError): self.guardar(a_medias=True, mi_parte=99)
        self.assertEqual(self.app.alm.todos("movimiento"), [])

    def test_un_gasto_a_medias_no_se_divide(self):
        g = self.guardar(a_medias=True, mi_parte=10)["id"]
        with self.assertRaises(ValueError): IM.dividir(self.app.alm, g, [{"importe": 20, "categoria": "Ocio"}, {"importe": 20, "categoria": "Ocio"}])

    def test_el_excel_lleva_la_divisa_lo_que_te_deben_y_las_etiquetas(self):
        from openpyxl import load_workbook
        self.guardar(importe=46.3, divisa="USD", importe_divisa=50, a_medias=True, mi_parte=23.15, etiquetas="viaje, comida")
        ws = load_workbook(io.BytesIO(exportar.datos_excel(self.app.alm)))["Movimientos"]
        fila = {c.value: ws.cell(2, i + 1).value for i, c in enumerate(ws[1])}
        self.assertEqual((fila["Divisa"], fila["Importe en esa divisa"], fila["A medias: tu parte"], fila["Etiquetas"]), ("USD", 50, 23.15, "viaje, comida"))
        self.assertAlmostEqual(fila["Te deben"], 23.15, 2)

if __name__ == "__main__":
    unittest.main()

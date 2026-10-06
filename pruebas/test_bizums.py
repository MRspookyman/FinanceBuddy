# Bizums: no se vuelve a enlazar lo que quitaste a mano y los repartos de dos días son un solo grupo.
import os, shutil, tempfile, unittest
from financebuddy import bizums, plantilla, rutas
from financebuddy.almacen import Almacen

def pend(id, op, imp):
    return {"id": id, "tipo_import": "banco", "cuenta": "Nómina", "fila": {"op": op, "importe": imp, "texto": "Bizum de Ana", "clase": "reembolso"}}

class TestBizums(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.a = Almacen(rutas.Carpeta(self.dir).db)
        plantilla.instalar(self.a)
        self.gasto = self.a.guardar("movimiento", {"fecha": "2026-09-10", "clase": "gasto", "categoria": "Supermercado", "importe": 40.0, "concepto": "Super", "cuenta": "Nómina"})
        self.bz = self.a.guardar("movimiento", {"fecha": "2026-09-11", "clase": "reembolso", "categoria": "Supermercado", "importe": 20.0,
                                                 "concepto": "Parte de Ana", "cuenta": "Nómina", "ext_texto": "Bizum de Ana"})
    def tearDown(self):
        self.a.cerrar(); shutil.rmtree(self.dir, ignore_errors=True)

    def test_enlaza_y_no_vuelve_a_enlazar_lo_que_quitaste(self):
        self.assertEqual(bizums.enlazar(self.a), 1)
        self.assertEqual(self.a.obtener("movimiento", self.bz)["reembolsa"], self.gasto)
        m = self.a.obtener("movimiento", self.bz); m.pop("reembolsa"); m["sin_gasto"] = True  # lo que guarda el servidor al quitar el enlace
        self.a.guardar("movimiento", m, self.bz)
        self.assertEqual(bizums.enlazar(self.a), 0)
        self.assertFalse(self.a.obtener("movimiento", self.bz).get("reembolsa"))

    def test_reparto_en_dos_dias_es_un_solo_grupo(self):
        g = bizums.repartos([pend(1, "2026-09-11", 19.56), pend(2, "2026-09-12", 19.56), pend(3, "2026-09-20", 19.56)])
        self.assertEqual(set(g), {1, 2})
        self.assertEqual(g[1], g[2])

if __name__ == "__main__":
    unittest.main()

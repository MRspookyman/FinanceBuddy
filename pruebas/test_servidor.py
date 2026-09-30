# Prueba de extremo a extremo de la API (lo que hace la página) y de la seguridad del servidor.
import base64, http.client, json, os, shutil, sys, tempfile, threading, unittest
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from financebuddy import servidor
from pruebas.test_importar import FILAS, excel_santander

class TestFlujo(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.app = servidor.App(self.dir, hoy="2026-09-30")
    def tearDown(self):
        self.app.alm.cerrar(); shutil.rmtree(self.dir, ignore_errors=True)
    def api(self, ruta, d=None):
        return self.app.manejar(ruta, d or {})

    def test_flujo_completo(self):
        self.assertEqual(self.app.datos()["registros"]["cuenta"], [])
        self.api("/api/bienvenida", {"cuentas": [{"nombre": "Nómina", "tipo": "corriente", "saldo": 1000}, {"nombre": "Ahorro", "tipo": "ahorro", "saldo": "2.000,50"}],
                                     "limite": 500, "fondo_meses": 3, "recurrentes": [{"nombre": "Alquiler", "clase": "gasto", "categoria": "Vivienda", "importe": 600, "dia": 1}]})
        D = self.app.datos()
        self.assertEqual([c["nombre"] for c in D["registros"]["cuenta"]], ["Nómina", "Ahorro"])
        self.assertEqual(D["registros"]["patrimonio"][0]["saldos"], {"Nómina": 1000.0, "Ahorro": 2000.5})
        self.assertEqual(D["config"]["limite_variable"], 500)
        self.assertEqual(D["registros"]["objetivo"][0]["cuenta"], "Ahorro")
        # Subir el extracto: la primera vez pregunta la cuenta
        ruta = os.path.join(self.dir, "x.xlsx"); excel_santander(ruta, FILAS)
        with open(ruta, "rb") as fh: b64 = base64.b64encode(fh.read()).decode()
        r = self.api("/api/importar/subir", {"nombre": "movimientos.xlsx", "tipo": "banco", "contenido": b64})
        self.assertEqual(r["necesita"], "cuenta")
        r = self.api("/api/importar/reintentar", {"archivo": r["archivo"], "tipo": "banco", "cuenta": "Nómina", "perfil": r["perfil"]})
        self.assertTrue(r["ok"], r)
        self.assertEqual(len(self.app.datos()["pendientes"]), 2)
        for p in self.app.datos()["pendientes"]:
            self.api("/api/resolver", {"id": p["id"], "accion": "guardar", "clase": "gasto" if p["fila"]["importe"] < 0 else "ingreso",
                                       "categoria": "Hogar" if p["fila"]["importe"] < 0 else "Otros ingresos"})
        self.assertEqual(self.app.datos()["pendientes"], [])
        # Cierre
        r = self.api("/api/cierre", {"fecha": "2026-09-30", "mes": "2026-09", "saldos": {"Nómina": "2542,30", "Ahorro": 2200.5}, "notas": "ok"})
        self.assertTrue(r["ok"])
        D = self.app.datos()
        self.assertEqual(D["registros"]["cierre"][0]["mes"], "2026-09")
        self.assertEqual(D["registros"]["patrimonio"][-1]["saldos"]["Nómina"], 2542.3)
        # Editar y borrar
        r = self.api("/api/guardar", {"tipo": "categoria", "datos": {"nombre": "Mascotas 2", "grupo": "variable"}})
        self.api("/api/borrar", {"tipo": "categoria", "id": r["id"]})
        with self.assertRaises(ValueError): self.api("/api/guardar", {"tipo": "pendiente", "datos": {}})
        with self.assertRaises(ValueError): self.api("/api/vaciar", {"confirmar": "no"})
        self.api("/api/vaciar", {"confirmar": "BORRAR"})
        self.assertEqual(self.app.datos()["registros"]["movimiento"], [])
        self.assertTrue(any("antes de vaciar" in n for n in self.app.copias()))

    def test_subida_detecta_el_tipo(self):
        self.api("/api/bienvenida", {"cuentas": [{"nombre": "Nómina", "tipo": "corriente", "saldo": 1000}]})
        ruta = os.path.join(self.dir, "x.xlsx"); excel_santander(ruta, FILAS)
        with open(ruta, "rb") as fh: b64 = base64.b64encode(fh.read()).decode()
        r = self.api("/api/importar/subir", {"nombre": "extracto.xlsx", "tipo": None, "contenido": b64})
        self.assertEqual((r.get("necesita"), r.get("tipo")), ("cuenta", "banco"))  # Santander reconocido sin decirle el tipo
        r = self.api("/api/importar/reintentar", {"archivo": r["archivo"], "tipo": r["tipo"], "cuenta": "Nómina", "perfil": r["perfil"]})
        self.assertTrue(r["ok"], r)
        P = self.app.datos()["pendientes"]
        self.assertTrue(P and all("sugerencia" in p for p in P if p["fila"]["clase"] != "transferencia"))

    def test_config_de_apariencia(self):
        self.api("/api/config", {"acento": "verde", "inicio": ["gasto", "semana", "<script>"]})
        c = self.app.datos()["config"]
        self.assertEqual((c["acento"], c["inicio"]), ("verde", ["gasto", "semana"]))
        self.api("/api/config", {"acento": "url(x)"})
        self.assertEqual(self.app.datos()["config"]["acento"], "violeta")

    def test_subida_rechaza_otros_formatos(self):
        r = self.api("/api/importar/subir", {"nombre": "virus.exe", "contenido": ""})
        self.assertFalse(r["ok"])
        r = self.api("/api/importar/subir", {"nombre": "..\\..\\x.csv", "tipo": "banco", "contenido": base64.b64encode(b"a;b\n").decode()})
        self.assertTrue(os.path.exists(os.path.join(self.app.carpeta.banco, "x.csv")) or not r["ok"])

class TestSeguridad(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dir = tempfile.mkdtemp()
        cls.app = servidor.App(cls.dir)
        cls.srv = servidor.crear(cls.app, 8797)
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown(); cls.srv.server_close(); cls.app.alm.cerrar(); shutil.rmtree(cls.dir, ignore_errors=True)
    def pedir(self, metodo, ruta, token=None, host="127.0.0.1:8797", cuerpo=None):
        c = http.client.HTTPConnection("127.0.0.1", 8797, timeout=5)
        h = {"Host": host}
        if token: h["X-FB-Token"] = token
        c.request(metodo, ruta, body=json.dumps(cuerpo) if cuerpo is not None else None, headers=h)
        try:
            r = c.getresponse(); return r.status, r.read()
        finally: c.close()
    def test_sin_clave_no_hay_datos(self):
        self.assertEqual(self.pedir("GET", "/api/datos")[0], 403)
        self.assertEqual(self.pedir("POST", "/api/vaciar", cuerpo={"confirmar": "BORRAR"})[0], 403)
    def test_con_clave(self):
        self.assertEqual(self.pedir("GET", "/api/datos", self.app.token)[0], 200)
    def test_host_ajeno(self):
        self.assertEqual(self.pedir("GET", "/", host="malo.com")[0], 403)
        self.assertEqual(self.pedir("GET", "/api/datos", self.app.token, host="malo.com")[0], 403)
    def test_ruta_fuera_de_web(self):
        self.assertEqual(self.pedir("GET", "/web/../../servidor.py")[0], 404)
        self.assertEqual(self.pedir("GET", "/web/%2e%2e/%2e%2e/servidor.py")[0], 404)
    def test_pagina(self):
        s, b = self.pedir("GET", "/")
        self.assertEqual(s, 200); self.assertIn(self.app.token.encode(), b)

if __name__ == "__main__":
    unittest.main()

# Pruebas del asistente Jev (jev.py) contra un servidor Jev falso en local: mismo formato que la API documentada
# (POST /v1/systemone). No hace falta red ni clave real. Uso: python -m unittest pruebas.test_jev -v
import http.server, json, os, shutil, sys, tempfile, threading, unittest
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from financebuddy import jev, servidor
from pruebas.test_importar import excel_santander

CLAVE = "clave_de_prueba_0123456789abcdef"
RECIBIDO = []  # cuerpos de las peticiones que ha recibido el servidor falso

class JevFalso(http.server.BaseHTTPRequestHandler):
    estado_http = 200
    def log_message(self, *a): pass
    def do_POST(self):
        cuerpo = json.loads(self.rfile.read(int(self.headers["Content-Length"])).decode("utf-8"))
        RECIBIDO.append(cuerpo)
        if self.path != "/v1/systemone" or self.headers.get("Authorization") != f"Bearer {CLAVE}" or JevFalso.estado_http != 200:
            code = 401 if JevFalso.estado_http == 200 else JevFalso.estado_http
            self.send_response(code); self.send_header("Content-Type", "application/json"); self.end_headers()
            self.wfile.write(json.dumps({"error": {"message": "no"}}).encode()); return
        estado = str(cuerpo["state"]).lower()
        answers = {}
        for nombre, q in cuerpo["questions"].items():
            crit = q["criteria"]
            elegir = lambda *palabras: next((k for k in crit if any(p in (k + " " + crit[k]).lower() for p in palabras)), None)
            if estado.startswith("extracto bancario"):  # formato nuevo: la columna cuyo nombre lo dice
                claves = {"fecha": ("operaci",), "concepto": ("concepto",), "importe": ("importe",), "saldo": ("saldo",)}
                ch = elegir(*claves[nombre]) if nombre in claves else "ninguna"
            elif nombre == "tipo":
                ch = "reembolso" if "bizum recibido" in estado else "ingreso"
            elif any(p in estado for p in ("brunch", "desayuno", "restaurante")):
                ch = elegir("comer fuera")
            elif "academia" in estado:
                ch = elegir("formación")
            else:
                ch = None
            conf = 0.93 if ch else 0.3
            ch = ch or next(iter(crit))
            answers[nombre] = {"type": "choice", "choice": ch, "confidence": conf, "probabilities": {k: (conf if k == ch else 0.0) for k in crit}}
        self.send_response(200); self.send_header("Content-Type", "application/json"); self.end_headers()
        self.wfile.write(json.dumps({"model": "jev-falso", "answers": answers, "usage": {"input_tokens": 100, "output_tokens": 10}}).encode())

FILAS = [
    ("2026-09-01", "Bizum de Ana Ruiz Garcia concepto brunch del domingo", 25.00),
    ("2026-09-02", "Recibo Academia Oxford Idiomas SL", -65.00),
    ("2026-09-03", "Pago Movil En Kiosko Ana, Madrid ES, Tarj. :*123456", -3.50),
    ("2026-09-04", "Compra Mercadona, Madrid", -40.00),
]

class TestJev(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), JevFalso)
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
        os.environ["FB_JEV_URL"] = f"http://127.0.0.1:{cls.srv.server_address[1]}/v1/systemone"
    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown(); cls.srv.server_close(); os.environ.pop("FB_JEV_URL", None)
    def setUp(self):
        RECIBIDO.clear(); JevFalso.estado_http = 200
        self.dir = tempfile.mkdtemp()
        self.app = servidor.App(self.dir, hoy="2026-09-30")
        self.app.manejar("/api/bienvenida", {"cuentas": [{"nombre": "Nómina", "tipo": "corriente", "saldo": 1000}]})
    def tearDown(self):
        self.app.alm.cerrar(); shutil.rmtree(self.dir, ignore_errors=True)
    def importar(self):
        ruta = os.path.join(self.app.carpeta.banco, "x.xlsx"); excel_santander(ruta, FILAS)
        return self.app._importar(ruta, "banco", "Nómina")

    def test_saneado(self):
        t = jev.saneado("BIZUM DE JAVIER DIAZ CASADO CONCEPTO desayuno", 14.7)
        self.assertNotIn("JAVIER", t); self.assertIn("Bizum recibido. Concepto: desayuno", t)
        self.assertIn("Bizum enviado sin concepto", jev.saneado("BIZUM A FAVOR DE ALEJANDRO LARA CONCEPTO Sin concepto", -2))
        t = jev.saneado("TRANSFERENCIA INMEDIATA A FAVOR DE Diego JOSE Garcia RAYA CONCEPTO pista padel", -12)
        self.assertNotIn("Diego", t); self.assertIn("una persona", t); self.assertIn("pista padel", t)
        self.assertIn("NTER SOLUTIONS", jev.saneado("TRANSFERENCIA DE NTER SOLUTIONS AND TECHNOLOGIES, S.L, CONCEPTO NOMINA", 1382.25))  # empresa: se queda
        t = jev.saneado("PAGO MOVIL EN ITV JAEN-VEIASA, JAEN ES, TARJ. :*904020", -48.62)
        self.assertNotIn("904020", t); self.assertIn("ITV JAEN", t); self.assertIn("Sale dinero: 48.62 €", t)

    def test_sin_clave_no_hace_nada(self):
        r = self.importar()
        self.assertNotIn("Jev", r["mensaje"]); self.assertEqual(RECIBIDO, [])
        self.assertFalse(self.app.manejar("/api/jev/revisar", {})["ok"])

    def test_la_clave_no_sale_hacia_la_pagina(self):
        self.app.manejar("/api/jev/config", {"clave": CLAVE, "activo": True})
        d = json.dumps(self.app.datos())
        self.assertNotIn(CLAVE, d)
        self.assertEqual(self.app.datos()["config"]["jev"]["fin_clave"], CLAVE[-4:])
        with self.assertRaises(ValueError): self.app.manejar("/api/jev/config", {"clave": "mal clave con espacios"})

    def test_por_revisar_al_importar(self):
        self.app.manejar("/api/jev/config", {"clave": CLAVE, "activo": True})
        r = self.importar()
        self.assertIn("Jev propone categoría", r["mensaje"], r["mensaje"])
        enviado = json.dumps(RECIBIDO, ensure_ascii=False)
        self.assertNotIn("Ruiz", enviado); self.assertNotIn("123456", enviado)  # ni nombres de Bizum ni tarjetas
        P = {p["fila"]["texto"]: p for p in self.app.datos()["pendientes"]}
        s = P["Bizum de Ana Ruiz Garcia concepto brunch del domingo"]["sugerencia"]
        self.assertEqual((s["fuente"], s["clase"], s["categoria"]), ("jev", "reembolso", "Comer fuera"))
        self.assertEqual(P["Recibo Academia Oxford Idiomas SL"]["sugerencia"]["categoria"], "Formación")
        self.assertIsNone(P["Pago Movil En Kiosko Ana, Madrid ES, Tarj. :*123456"]["sugerencia"])  # Jev no estaba seguro: nada
        # Aceptar la sugerencia de Jev funciona como cualquier otra (y crea la regla)
        p = P["Recibo Academia Oxford Idiomas SL"]
        self.app.manejar("/api/resolver", {"id": p["id"], "accion": "guardar", "clase": "gasto", "categoria": "Formación", "recordar": True, "patron": "academia oxford"})
        self.assertTrue(any(m["categoria"] == "Formación" for m in self.app.datos()["registros"]["movimiento"]))
        # Lo ya preguntado no se vuelve a preguntar
        n = len(RECIBIDO)
        self.app.manejar("/api/jev/revisar", {})
        self.assertEqual(len(RECIBIDO), n)

    def test_error_de_jev_no_marca_nada(self):
        self.app.manejar("/api/jev/config", {"clave": CLAVE, "activo": True, "al_importar": False})
        self.importar()
        JevFalso.estado_http = 401
        r = self.app.manejar("/api/jev/revisar", {})
        self.assertFalse(r["ok"]); self.assertIn("clave", r["mensaje"])
        self.assertFalse(any(p.get("jev") for p in self.app.alm.todos("pendiente")))
        JevFalso.estado_http = 200
        self.assertTrue(self.app.manejar("/api/jev/revisar", {})["ok"])  # la próxima vez, sí

    def test_probar(self):
        self.assertFalse(self.app.manejar("/api/jev/probar", {})["ok"])
        self.app.manejar("/api/jev/config", {"clave": CLAVE})
        r = self.app.manejar("/api/jev/probar", {})
        self.assertTrue(r["ok"], r); self.assertIn("jev-falso", r["mensaje"])

    def test_formato_nuevo(self):
        self.app.manejar("/api/jev/config", {"clave": CLAVE, "activo": True})
        ruta = os.path.join(self.app.carpeta.banco, "raro.csv")
        with open(ruta, "w", encoding="utf-8") as fh:
            fh.write("F.Operación;F.Valor;Concepto del movimiento;Importe EUR;Saldo EUR\n01/09/2026;01/09/2026;Compra Lidl;-12,30;500,00\n02/09/2026;02/09/2026;Nomina;1500,00;2000,00\n")
        r = self.app._importar(ruta, "banco")
        self.assertEqual(r["necesita"], "perfil")
        self.assertEqual(r["propuesta"], {"fecha": "F.Operación", "concepto": "Concepto del movimiento", "importe": "Importe EUR", "saldo": "Saldo EUR"})

if __name__ == "__main__":
    unittest.main()

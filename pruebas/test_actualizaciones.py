# Aviso de versión (actualizaciones.py) contra un GitHub falso en local. Uso: python -m unittest pruebas.test_actualizaciones -v
import http.server, json, os, shutil, sys, tempfile, threading, unittest
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from financebuddy import VERSION, actualizaciones, servidor

class GitHubFalso(http.server.BaseHTTPRequestHandler):
    codigo, cuerpo, pedidos = 200, {"tag_name": "v99.0.0", "html_url": "https://github.com/x/y/releases/tag/v99.0.0", "body": "Novedades"}, []
    def log_message(self, *a): pass
    def do_GET(self):
        GitHubFalso.pedidos.append((self.path, self.headers.get("Authorization")))
        self.send_response(GitHubFalso.codigo); self.send_header("Content-Type", "application/json"); self.end_headers()
        self.wfile.write(json.dumps(GitHubFalso.cuerpo).encode())

class TestActualizaciones(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), GitHubFalso)
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
        os.environ["FB_ACTUALIZACIONES_URL"] = f"http://127.0.0.1:{cls.srv.server_address[1]}/releases/latest"
    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown(); cls.srv.server_close(); os.environ.pop("FB_ACTUALIZACIONES_URL", None)
    def setUp(self):
        GitHubFalso.codigo, GitHubFalso.pedidos = 200, []
        GitHubFalso.cuerpo = {"tag_name": "v99.0.0", "html_url": "https://github.com/x/y/releases/tag/v99.0.0", "body": "Novedades"}
        self.dir = tempfile.mkdtemp(); self.app = servidor.App(self.dir)
        self.api = lambda r, d=None: self.app.manejar(r, d or {})
    def tearDown(self):
        self.app.alm.cerrar(); shutil.rmtree(self.dir, ignore_errors=True)

    def test_apagado_de_serie_no_consulta(self):
        self.assertFalse(self.app.datos()["config"]["actualizaciones"]["activo"])
        r = self.api("/api/actualizaciones/comprobar")
        self.assertFalse(r["ok"]); self.assertEqual(GitHubFalso.pedidos, [])

    def test_avisa_de_una_version_nueva_y_no_manda_nada_tuyo(self):
        self.api("/api/actualizaciones/config", {"activo": True})
        r = self.api("/api/actualizaciones/comprobar")
        self.assertTrue(r["ok"] and r["nueva"]); self.assertEqual(r["version"], "99.0.0"); self.assertIn("releases/tag", r["url"])
        self.assertEqual(GitHubFalso.pedidos, [("/releases/latest", None)])   # sin clave ni datos: una consulta pública
        self.assertTrue(self.app.datos()["config"]["actualizaciones"]["resultado"]["nueva"])

    def test_como_mucho_una_consulta_al_dia(self):
        self.api("/api/actualizaciones/config", {"activo": True})
        self.api("/api/actualizaciones/comprobar"); self.api("/api/actualizaciones/comprobar")
        self.assertEqual(len(GitHubFalso.pedidos), 1)
        self.api("/api/actualizaciones/comprobar", {"forzar": True}); self.assertEqual(len(GitHubFalso.pedidos), 2)
        self.assertFalse(self.app.datos()["config"]["actualizaciones"]["viejo"])

    def test_misma_version_sin_versiones_y_sin_conexion(self):
        self.api("/api/actualizaciones/config", {"activo": True})
        GitHubFalso.cuerpo = {"tag_name": "v" + VERSION}
        self.assertFalse(self.api("/api/actualizaciones/comprobar", {"forzar": True})["nueva"])
        GitHubFalso.codigo = 404
        r = self.api("/api/actualizaciones/comprobar", {"forzar": True}); self.assertTrue(r["ok"] and not r["nueva"]); self.assertIn("No hay versiones", r["mensaje"])
        GitHubFalso.codigo = 503
        r = self.api("/api/actualizaciones/comprobar", {"forzar": True}); self.assertFalse(r["ok"]); self.assertIn("503", r["mensaje"])
        os.environ["FB_ACTUALIZACIONES_URL"], antes = "http://127.0.0.1:9/", os.environ["FB_ACTUALIZACIONES_URL"]
        try: self.assertFalse(self.api("/api/actualizaciones/comprobar", {"forzar": True})["ok"])
        finally: os.environ["FB_ACTUALIZACIONES_URL"] = antes

    def test_comparar_versiones(self):
        self.assertTrue(actualizaciones.es_mas_nueva("v1.0.1", "1.0.0")); self.assertTrue(actualizaciones.es_mas_nueva("2.0", "1.9.9"))
        self.assertTrue(actualizaciones.es_mas_nueva("1.10.0", "1.9.0"))
        self.assertFalse(actualizaciones.es_mas_nueva("1.0", "1.0.0")); self.assertFalse(actualizaciones.es_mas_nueva("0.9.9", "1.0.0")); self.assertFalse(actualizaciones.es_mas_nueva("", "1.0.0"))
        self.assertFalse(actualizaciones.es_mas_nueva("1.0.0-beta", "1.0.0"))

if __name__ == "__main__":
    unittest.main()

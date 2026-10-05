# Prueba de extremo a extremo de la API (lo que hace la página) y de la seguridad del servidor.
import base64, datetime, http.client, json, os, shutil, sys, tempfile, threading, unittest
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

    def test_vista_previa_no_guarda_nada_y_coincide_con_la_importacion(self):
        self.api("/api/bienvenida", {"cuentas": [{"nombre": "Nómina", "tipo": "corriente", "saldo": 1000}]})
        ruta = os.path.join(self.dir, "x.xlsx"); excel_santander(ruta, FILAS)
        with open(ruta, "rb") as fh: b64 = base64.b64encode(fh.read()).decode()
        r = self.api("/api/importar/subir", {"nombre": "movimientos.xlsx", "tipo": "banco", "contenido": b64, "previa": True})
        self.assertEqual(r["necesita"], "cuenta"); self.assertTrue(r["subido"])
        antes = (len(self.app.alm.todos("movimiento")), len(self.app.alm.todos("pendiente")), self.app.alm.config("saldo_extracto:Nómina"))
        v = self.api("/api/importar/reintentar", {"archivo": r["archivo"], "tipo": "banco", "cuenta": "Nómina", "perfil": r["perfil"], "previa": True, "subido": True})
        self.assertTrue(v["ok"] and v["subido"], v)
        P = v["previa"]
        # Nada se ha guardado y el archivo sigue ahí para confirmarlo
        self.assertEqual((len(self.app.alm.todos("movimiento")), len(self.app.alm.todos("pendiente")), self.app.alm.config("saldo_extracto:Nómina")), antes)
        self.assertTrue(any(os.path.basename(p) == r["archivo"] for p, _ in __import__("financebuddy.importar", fromlist=["x"]).archivos_pendientes(self.app.carpeta)))
        self.assertGreater(P["movimientos"]["n"], 0); self.assertIsNotNone(P["saldo_final"]); self.assertLessEqual(len(P["muestra"]), 12)
        # Y la importación de verdad da exactamente lo que enseñó la vista previa
        real = self.api("/api/importar/reintentar", {"archivo": r["archivo"], "tipo": "banco", "cuenta": "Nómina", "perfil": r["perfil"]})
        self.assertTrue(real["ok"] and "previa" not in real, real)
        movs, pend = self.app.alm.todos("movimiento"), self.app.alm.todos("pendiente")
        self.assertEqual((P["movimientos"]["n"], P["dudas"]["n"]), (len(movs), len(pend)))
        self.assertEqual(round(sum(m["importe"] for m in movs if m["clase"] == "gasto"), 2), P["movimientos"]["gastos"])
        # Repetir la vista previa con lo ya importado: todo «ya estaba»
        self.assertEqual(self.api("/api/importar/descartar", {"archivo": r["archivo"]})["ok"], False)  # ya está en Procesados

    def test_primer_extracto_da_el_saldo_inicial_y_se_puede_deshacer(self):
        self.api("/api/guardar", {"tipo": "cuenta", "datos": {"nombre": "Nómina", "tipo": "corriente", "extracto": True}})
        ruta = os.path.join(self.dir, "x.xlsx"); excel_santander(ruta, FILAS)
        with open(ruta, "rb") as fh: b64 = base64.b64encode(fh.read()).decode()
        r = self.api("/api/importar/subir", {"nombre": "movimientos.xlsx", "tipo": "banco", "contenido": b64, "previa": False})
        r = self.api("/api/importar/reintentar", {"archivo": r["archivo"], "tipo": "banco", "cuenta": "Nómina", "perfil": r["perfil"]})
        self.assertTrue(r["ok"], r)
        pat = self.app.alm.todos("patrimonio")
        self.assertEqual(len(pat), 1); self.assertEqual(pat[0]["saldos"]["Nómina"], self.app.alm.config("saldo_extracto:Nómina")["saldo"])
        # Deshacer la última decisión de «Por revisar»
        p = self.app.alm.todos("pendiente")[0]
        antes = len(self.app.alm.todos("movimiento"))
        self.api("/api/resolver", {"id": p["id"], "accion": "ignorar"})
        self.assertEqual(len(self.app.alm.todos("pendiente")), 2)
        self.assertTrue(self.api("/api/deshacer")["ok"])
        self.assertEqual((len(self.app.alm.todos("pendiente")), len(self.app.alm.todos("movimiento"))), (3, antes))
        self.assertFalse(self.api("/api/deshacer")["ok"])

    def test_saldo_banco_no_cierra_el_mes_ni_toca_los_valores(self):
        self.api("/api/bienvenida", {"cuentas": [{"nombre": "Nómina", "tipo": "corriente", "saldo": 1000}]})
        self.app.alm.guardar("activo", {"nombre": "Fondo", "clase": "fondo", "valor": 500, "fecha_valor": "2026-08-31"})
        ant = self.app.alm.todos("patrimonio")[0].get("valores", {})
        self.assertTrue(self.api("/api/saldo_banco", {"fecha": "2026-10-02", "saldos": {"Nómina": 373.5}})["ok"])
        pat = sorted(self.app.alm.todos("patrimonio"), key=lambda r: r["fecha"])
        self.assertEqual((pat[-1]["fecha"], pat[-1]["saldos"]["Nómina"], pat[-1].get("valores", {})), ("2026-10-02", 373.5, ant))
        self.assertEqual(self.app.alm.todos("cierre"), [])
        self.assertEqual(self.app.alm.todos("activo")[0]["valor"], 500)
        self.api("/api/saldo_banco", {"fecha": "2026-10-02", "saldos": {"Nómina": 400}})   # el mismo día se actualiza, no se duplica
        self.assertEqual(len([r for r in self.app.alm.todos("patrimonio") if r["fecha"] == "2026-10-02"]), 1)

    def test_descartar_un_archivo_subido(self):
        self.api("/api/bienvenida", {"cuentas": [{"nombre": "Nómina", "tipo": "corriente", "saldo": 1000}]})
        ruta = os.path.join(self.dir, "x.xlsx"); excel_santander(ruta, FILAS)
        with open(ruta, "rb") as fh: b64 = base64.b64encode(fh.read()).decode()
        r = self.api("/api/importar/subir", {"nombre": "otro.xlsx", "tipo": "banco", "contenido": b64, "previa": True})
        self.assertTrue(self.api("/api/importar/descartar", {"archivo": r["archivo"]})["ok"])
        self.assertEqual(self.app.datos()["info"]["archivos"], [])

    def test_simular_deshace_aunque_falle(self):
        alm = self.app.alm
        with alm.simular(): alm.guardar("cuenta", {"nombre": "Fantasma", "tipo": "corriente"})
        self.assertEqual(alm.todos("cuenta"), [])
        with self.assertRaises(ValueError):
            with alm.simular(): alm.guardar("cuenta", {"nombre": "Otra", "tipo": "corriente"}); raise ValueError("fallo")
        self.assertEqual(alm.todos("cuenta"), [])
        alm.guardar("cuenta", {"nombre": "Real", "tipo": "corriente"})   # y la base sigue funcionando
        self.assertEqual([c["nombre"] for c in alm.todos("cuenta")], ["Real"])

    def test_plantilla_de_excel_tiene_desplegable_y_se_importa_con_su_categoria(self):
        import io, openpyxl
        self.api("/api/bienvenida", {"cuentas": [{"nombre": "Nómina", "tipo": "corriente", "saldo": 1000}]})
        r = self.api("/api/plantilla")
        self.assertTrue(r["ok"]); self.assertTrue(r["nombre"].endswith(".xlsx"))
        wb = openpyxl.load_workbook(io.BytesIO(base64.b64decode(r["contenido"])))
        self.assertEqual(wb.sheetnames[0], "Movimientos")
        self.assertEqual([c.value for c in wb["Movimientos"][1]], ["Fecha", "Concepto", "Importe", "Categoría"])
        lista = [c[0].value for c in wb["Listas"].iter_rows(min_row=2)]
        self.assertEqual(set(lista), {c["nombre"] for c in self.app.alm.todos("categoria")})
        validaciones = {v.type for v in wb["Movimientos"].data_validations.dataValidation}
        self.assertEqual(validaciones, {"list", "date", "decimal"})
        # La rellena como lo haría el usuario y la importa: la categoría elegida manda (aunque ninguna regla conozca el comercio)
        ws = wb["Movimientos"]
        for fila in [(datetime.datetime(2026, 9, 3), "Bar de la esquina", -12.5, "Ocio"), (datetime.datetime(2026, 9, 4), "Regalo de la abuela", 50, "Otros ingresos"),
                     (datetime.datetime(2026, 9, 5), "Cosa rara xyz", -8, None), (datetime.datetime(2026, 9, 6), "Devolución del cine", 9, "Ocio"),
                     (datetime.datetime(2026, 9, 7), "Gasto en categoría de ingreso", -5, "Nómina"), (datetime.datetime(2026, 9, 8), "Categoría inventada", -7, "No existe")]:
            ws.append(list(fila))
        ruta = os.path.join(self.dir, "plantilla.xlsx"); wb.save(ruta)
        with open(ruta, "rb") as fh: b64 = base64.b64encode(fh.read()).decode()
        r = self.api("/api/importar/subir", {"nombre": "plantilla.xlsx", "tipo": "banco", "contenido": b64, "cuenta": "Nómina"})
        if r.get("necesita") == "cuenta":
            r = self.api("/api/importar/reintentar", {"archivo": r["archivo"], "tipo": "banco", "cuenta": "Nómina", "perfil": r["perfil"]})
        self.assertTrue(r["ok"], r); self.assertEqual(r["perfil"], "Plantilla de FinanceBuddy")
        movs = {m["concepto"]: m for m in self.app.alm.todos("movimiento")}
        bar = movs["Bar De La Esquina"] if "Bar De La Esquina" in movs else next(m for m in movs.values() if "esquina" in m["concepto"].lower())
        self.assertEqual((bar["clase"], bar["categoria"], bar["importe"]), ("gasto", "Ocio", 12.5))
        regalo = next(m for m in movs.values() if "abuela" in m["concepto"].lower())
        self.assertEqual((regalo["clase"], regalo["categoria"]), ("ingreso", "Otros ingresos"))
        dev = next(m for m in movs.values() if m["fecha"] == "2026-09-06")
        self.assertEqual((dev["clase"], dev["categoria"]), ("reembolso", "Ocio"))   # positivo en categoría de gasto = te devuelven
        # Sin categoría, en una de ingreso con signo de gasto o inventada: lo decide el resto (reglas) y, si no sabe, queda por revisar
        self.assertEqual(len(self.app.alm.todos("pendiente")), 3)

    def test_activo_largo_plazo(self):
        r = self.api("/api/guardar", {"tipo": "activo", "datos": {"nombre": "Fondo A", "clase": "fondo"}})
        self.assertTrue(r["ok"], r)
        self.api("/api/guardar", {"tipo": "activo", "datos": {"nombre": "Colchón", "clase": "fondo", "largo_plazo": False}})
        A = {a["nombre"]: a for a in self.app.datos()["registros"]["activo"]}
        self.assertTrue(A["Fondo A"]["largo_plazo"])        # si falta, vale sí
        self.assertFalse(A["Colchón"]["largo_plazo"])

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
        self.assertEqual(self.app.datos()["config"]["acento"], "salvia")

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
    def test_estado_de_precios_se_consulta_por_post(self):
        # La página lo pide con POST (FB.api con cuerpo); por GET no existe. Un GET aquí dejó la actualización «sin acabar» para siempre.
        self.assertEqual(self.pedir("POST", "/api/precios/estado", self.app.token, cuerpo={})[0], 200)
        self.assertEqual(self.pedir("GET", "/api/precios/estado", self.app.token)[0], 404)
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

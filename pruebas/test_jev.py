# Pruebas del asistente Jev (jev.py) contra un servidor Jev falso en local: mismo formato que la API documentada
# (POST /v1/systemone). No hace falta red ni clave real. Uso: python -m unittest pruebas.test_jev -v
import base64, http.client, http.server, json, os, shutil, sys, tempfile, threading, time, unittest
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from financebuddy import jev, servidor
from pruebas.test_importar import excel_santander

CLAVE = "clave_de_prueba_0123456789abcdef"
RECIBIDO = []  # cuerpos de las peticiones que ha recibido el servidor falso

class JevFalso(http.server.BaseHTTPRequestHandler):
    estado_http = 200
    bloqueo = None  # B-019: si hay un Event, Jev espera en él antes de contestar
    def log_message(self, *a): pass
    def do_POST(self):
        cuerpo = json.loads(self.rfile.read(int(self.headers["Content-Length"])).decode("utf-8"))
        RECIBIDO.append(cuerpo)
        if JevFalso.bloqueo is not None: JevFalso.bloqueo.wait(20)  # B-019: Jev tarda; la app debe seguir atendiendo
        if self.path != "/v1/systemone" or self.headers.get("Authorization") != f"Bearer {CLAVE}" or JevFalso.estado_http != 200:
            code = 401 if JevFalso.estado_http == 200 else JevFalso.estado_http
            self.send_response(code); self.send_header("Content-Type", "application/json"); self.end_headers()
            self.wfile.write(json.dumps({"error": {"message": "no"}}).encode()); return
        estado = str(cuerpo["state"]).lower()
        answers = {}
        for nombre, q in cuerpo["questions"].items():
            if q["type"] == "noul":  # ¿es una cuota fija?
                answers[nombre] = {"type": "noul", "noul": 0.9 if "academia" in estado else 0.1}; continue
            crit = q["criteria"]
            elegir = lambda *palabras: next((k for k in crit if any(p in (k + " " + crit[k]).lower() for p in palabras)), None)
            if estado.startswith("extracto bancario"):  # formato nuevo: la columna cuyo nombre lo dice
                claves = {"fecha": ("operaci",), "concepto": ("concepto",), "importe": ("importe",), "saldo": ("saldo",)}
                ch = "banco" if nombre == "_tipo" else elegir(*claves[nombre]) if nombre in claves else "ninguna"
            elif nombre == "tipo":
                ch = "reembolso" if "bizum recibido" in estado else "ingreso"
            elif nombre == "origen":  # reparto de Bizums: el gasto candidato del súper, si lo hay
                ch = next((k for k in crit if "mercadona" in crit[k].lower()), "ninguno")
            elif nombre == "accion":  # bróker
                ch = "comision" if "custodia" in estado else "compra" if "apple" in estado else None
            elif nombre == "clase":
                ch = "accion" if "apple" in estado else None
            elif any(p in estado for p in ("brunch", "desayuno", "restaurante")):
                ch = elegir("comer fuera")
            elif "academia" in estado:
                ch = elegir("formación")
            elif "mercadona" in estado:
                ch = elegir("supermercado")
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

def esperar_repaso(limite=30):
    """Espera a que acabe el repaso de Jev en segundo plano (B-019) y devuelve su estado."""
    t = time.time()
    while jev.estado_repaso()["en_marcha"] and time.time() - t < limite:
        time.sleep(0.02)
    return jev.estado_repaso()

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
        esperar_repaso(); self.app.alm.cerrar(); shutil.rmtree(self.dir, ignore_errors=True)
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

    def test_saneado_bizum_que_no_va_al_principio(self):
        t = jev.saneado("Pago Bizum a Juan Perez Garcia concepto cena", -20)
        self.assertNotIn("Juan", t); self.assertNotIn("Perez", t); self.assertIn("Bizum enviado. Concepto: cena", t)

    def test_saneado_transferencia_bizum(self):
        t = jev.saneado("Transferencia Bizum de Maria Lopez", 15)
        self.assertNotIn("Maria", t); self.assertNotIn("Lopez", t); self.assertIn("Bizum recibido sin concepto", t)

    def test_saneado_envio_bizum_sin_preposicion(self):
        t = jev.saneado("Envio Bizum Juan Perez Gomez", -5)
        self.assertNotIn("Juan", t); self.assertNotIn("Gomez", t); self.assertIn("Bizum enviado", t)

    def test_saneado_recibo_de_una_persona(self):
        t = jev.saneado("Recibo Juan Perez Garcia alquiler", -600)
        self.assertNotIn("Juan", t); self.assertNotIn("Garcia", t); self.assertIn("Recibo una persona alquiler", t)
        # Lo que no es una persona se queda: un comercio con apellido tras «Pago Movil En» o una empresa
        self.assertIn("Ferreteria Lopez", jev.saneado("Pago Movil En Ferreteria Lopez, Madrid", -12.5))
        self.assertIn("Iberdrola Clientes", jev.saneado("Recibo Iberdrola Clientes Sau", -50))

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

    def test_la_clave_se_guarda_cifrada_y_la_de_antes_se_cifra_al_abrir(self):
        from financebuddy import secreto
        self.app.manejar("/api/jev/config", {"clave": CLAVE, "activo": True})
        guardada = self.app.alm.config("jev")["clave"]
        if os.name == "nt": self.assertTrue(secreto.cifrada(guardada)); self.assertNotIn(CLAVE, guardada)
        self.assertEqual(jev.config(self.app.alm)["clave"], CLAVE)
        with open(self.app.carpeta.db, "rb") as fh: crudo = fh.read()
        wal = self.app.carpeta.db + "-wal"
        if os.path.exists(wal):
            with open(wal, "rb") as fh: crudo += fh.read()
        if os.name == "nt": self.assertNotIn(CLAVE.encode(), crudo)
        # una base de una versión anterior, con la clave en claro: al abrirla se cifra y sigue funcionando
        self.app.alm.set_config("jev", {"clave": CLAVE, "activo": True})
        self.app.alm.set_config("precios", {"clave_coingecko": "CG-clave-de-prueba"})
        self.app.abrir(self.dir)
        if os.name == "nt":
            self.assertTrue(secreto.cifrada(self.app.alm.config("jev")["clave"]))
            self.assertTrue(secreto.cifrada(self.app.alm.config("precios")["clave_coingecko"]))
        self.assertEqual(jev.config(self.app.alm)["clave"], CLAVE)
        self.assertTrue(self.app.datos()["config"]["precios"]["hay_clave_cg"])
        # cifrada en otro ordenador: aquí no se puede leer, se dice y el asistente queda apagado (no revienta)
        self.app.alm.set_config("jev", {"clave": secreto.MARCA + "bm8gZXMgdW4gYmxvYg==", "activo": True})
        j = self.app.datos()["config"]["jev"]
        self.assertEqual((j["hay_clave"], j["activo"], j["ilegible"]), (False, False, True))

    def test_la_clave_de_la_variable_de_entorno_no_enciende_el_asistente(self):
        vieja = os.environ.get("TYPESAFE_API_KEY")
        os.environ["TYPESAFE_API_KEY"] = CLAVE
        try:
            j = self.app.datos()["config"]["jev"]
            self.assertEqual((j["hay_clave"], j["de_entorno"], j["activo"]), (True, True, False))
            self.app.manejar("/api/jev/config", {"activo": True})
            self.assertTrue(self.app.datos()["config"]["jev"]["activo"])
        finally:
            if vieja is None: del os.environ["TYPESAFE_API_KEY"]
            else: os.environ["TYPESAFE_API_KEY"] = vieja

    def test_por_revisar_al_importar(self):
        self.app.manejar("/api/jev/config", {"clave": CLAVE, "activo": True})
        r = self.importar()
        self.assertIn("segundo plano", r["mensaje"], r["mensaje"]); self.assertTrue(r["jev_en_marcha"], r)
        esperar_repaso()  # B-019: Jev repasa aparte; lo que sigue es lo que ya ha propuesto
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
        self.assertGreater(self.app.datos()["config"]["jev"]["revision"]["preguntados"], 0)  # y repasa lo que se clasificó solo
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

    def test_error_del_repaso_de_fondo_queda_para_verlo(self):
        # B-019: si Jev rechaza la clave mientras repasa lo importado, el error queda para verlo en Revisar
        self.app.manejar("/api/jev/config", {"clave": CLAVE, "activo": True})
        JevFalso.estado_http = 401
        try:
            self.importar()
            estado = esperar_repaso()
        finally:
            JevFalso.estado_http = 200
        self.assertFalse(estado["en_marcha"]); self.assertIn("clave", estado["error"], estado)

    def test_sin_conexion_no_se_queda_esperando(self):
        self.app.manejar("/api/jev/config", {"clave": CLAVE, "activo": True, "al_importar": False})
        self.importar()
        for i in range(30): self.mov("2026-09-10", f"Comercio {chr(65 + i % 26)}{i} prueba", 5 + i, "Otros")
        url = os.environ["FB_JEV_URL"]
        os.environ["FB_JEV_URL"] = "http://127.0.0.1:9/v1/systemone"  # nadie escucha: sin conexión
        try:
            t = time.monotonic()
            r = self.app.manejar("/api/jev/auditar", {})
            self.assertFalse(r["ok"]); self.assertIn("conectar", r["mensaje"])
            self.assertLess(time.monotonic() - t, 5)
            self.assertFalse(self.app.manejar("/api/jev/revisar", {})["ok"])
        finally: os.environ["FB_JEV_URL"] = url
        self.assertFalse(any(p.get("jev") for p in self.app.alm.todos("pendiente")))
        self.assertEqual(self.app.datos()["config"]["jev"]["revision"]["preguntados"], 0)
        self.assertTrue(self.app.manejar("/api/jev/auditar", {})["ok"])  # con conexión, sí

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
        r = self.app.proponer_con_jev(self.app._importar(ruta, "banco"))  # lo que añade Jev va después de importar, sin el cerrojo
        self.assertEqual(r["necesita"], "perfil")
        # Las columnas las reconoce ya la propia app (lectura.columnas_probables, sin internet); de Jev solo se coge lo que
        # falte, como si el archivo es del banco o del bróker (`_tipo`).
        self.assertEqual(r["propuesta"], {"_tipo": "banco", "fecha": "F.Operación", "fecha_valor": "F.Valor",
                                          "concepto": "Concepto del movimiento", "importe": "Importe EUR", "saldo": "Saldo EUR"})

    def mov(self, fecha, concepto, importe, categoria):
        r = self.app.manejar("/api/guardar", {"tipo": "movimiento", "datos": {"fecha": fecha, "clase": "gasto", "importe": importe, "concepto": concepto,
                                                                             "categoria": categoria, "cuenta": "Nómina"}})
        self.assertTrue(r["ok"], r)

    def test_apuntar_sugiere_categoria(self):
        # Sin Jev: tus reglas siguen funcionando (y no sale nada hacia fuera)
        self.assertEqual(self.app.manejar("/api/jev/categoria", {"texto": "Mercadona Jaén", "importe": -20})["categoria"], "Supermercado")
        self.assertNotIn("categoria", self.app.manejar("/api/jev/categoria", {"texto": "Brunch con amigos", "importe": -4}))
        self.assertEqual(RECIBIDO, [])
        self.app.manejar("/api/jev/config", {"clave": CLAVE, "activo": True})
        r = self.app.manejar("/api/jev/categoria", {"texto": "Brunch con amigos", "importe": -4})
        self.assertEqual((r["categoria"], r["fuente"]), ("Comer fuera", "jev"))
        self.assertEqual(self.app.manejar("/api/jev/categoria", {"texto": "Mercadona Jaén", "importe": -20})["fuente"], "regla")
        self.assertEqual(len(RECIBIDO), 1)  # lo que reconocen tus reglas no se pregunta
        self.mov("2026-09-10", "Brunch con amigos", 4, "Ocio")
        self.assertEqual(self.app.manejar("/api/jev/categoria", {"texto": "Brunch con amigos", "importe": -4})["fuente"], "historial")
        self.assertNotIn("categoria", self.app.manejar("/api/jev/categoria", {"texto": "Pago raro", "importe": -4}))  # Jev no está seguro

    def test_broker(self):
        self.app.manejar("/api/guardar", {"tipo": "cuenta", "datos": {"nombre": "Bróker", "tipo": "broker", "extracto": True}})
        self.app.manejar("/api/jev/config", {"clave": CLAVE, "activo": True})
        ruta = os.path.join(self.app.carpeta.inversion, "mi.csv")
        with open(ruta, "w", encoding="utf-8") as fh:
            fh.write("Fecha de operación;Fecha valor;Concepto;Importe\n10/09/2026;10/09/2026;COMPRA APPLE INC;-150,00\n"
                     "15/09/2026;15/09/2026;CUOTA CUSTODIA TRIMESTRAL;-3,00\n")
        r = self.app._importar(ruta, "inversion", "Bróker")
        self.assertIn("Jev", r["mensaje"], r)
        esperar_repaso()  # B-019: lo que la app no reconoce lo mira Jev en segundo plano
        P = {p["fila"]["texto"]: p for p in self.app.datos()["pendientes"]}
        s = P["COMPRA APPLE INC"]["sugerencia"]
        self.assertEqual((s["accion"], s["clase"], s["fuente"]), ("activo", "accion", "jev"))
        self.assertEqual((P["CUOTA CUSTODIA TRIMESTRAL"]["sugerencia"]["accion"], P["CUOTA CUSTODIA TRIMESTRAL"]["sugerencia"]["fuente"]), ("interes", "jev"))
        # Crear el activo con el tipo que proponía Jev
        p = P["COMPRA APPLE INC"]
        self.app.manejar("/api/resolver", {"id": p["id"], "accion": "activo", "nuevo_activo": s["nuevo"], "clase": s["clase"]})
        self.assertEqual(next(a for a in self.app.alm.todos("activo") if a["nombre"] == s["nuevo"])["clase"], "accion")
        n = len(RECIBIDO)
        self.app.manejar("/api/jev/revisar", {})
        self.assertEqual(len(RECIBIDO), n)  # ya preguntado

    def test_revisar_categorias(self):
        self.importar()
        self.mov("2026-09-05", "Clases academia de inglés", 40, "Otros")      # en «Otros»: Jev ve Formación
        self.mov("2026-09-06", "Desayuno cafetería centro", 4, "Ocio")         # Jev muy seguro de que es Comer fuera
        self.mov("2026-09-07", "Desayuno cafetería centro", 5, "Ocio")
        self.assertFalse(self.app.manejar("/api/jev/auditar", {})["ok"])     # sin Jev
        self.app.manejar("/api/jev/config", {"clave": CLAVE, "activo": True, "al_importar": False})
        r = self.app.manejar("/api/jev/auditar", {})
        self.assertTrue(r["ok"], r)
        H = {h["actual"]: h for h in self.app.datos()["config"]["jev"]["revision"]["hallazgos"]}
        self.assertEqual(set(H), {"Otros", "Ocio"})  # Mercadona (Supermercado) está bien
        self.assertEqual((H["Otros"]["propuesta"], H["Ocio"]["propuesta"], H["Ocio"]["n"]), ("Formación", "Comer fuera", 2))
        self.assertNotIn("Ruiz", json.dumps(RECIBIDO, ensure_ascii=False))
        # Aplicar: cambia todo el comercio y lo recuerda; descartar: se queda como está
        self.app.manejar("/api/jev/hallazgo", {"clave": H["Ocio"]["clave"], "accion": "aplicar"})
        self.assertEqual({m["categoria"] for m in self.app.alm.todos("movimiento") if "Desayuno" in m["concepto"]}, {"Comer fuera"})
        self.app.manejar("/api/jev/hallazgo", {"clave": H["Otros"]["clave"], "accion": "descartar"})
        self.assertEqual(self.app.datos()["config"]["jev"]["revision"]["hallazgos"], [])
        with self.assertRaises(ValueError): self.app.manejar("/api/jev/hallazgo", {"clave": H["Otros"]["clave"], "accion": "aplicar"})
        n = len(RECIBIDO)
        self.app.manejar("/api/jev/auditar", {})
        self.assertEqual(len(RECIBIDO), n)  # lo ya repasado no se vuelve a preguntar
        u = self.app.datos()["config"]["jev"]["uso"]
        self.assertEqual((u["consultas"], u["tokens"]), (n, 100 * n)); self.assertGreater(u["coste"], 0)

    def test_fijos(self):
        for mes in ("07", "08", "09"):
            self.mov(f"2026-{mes}-03", "Recibo Academia Oxford", 65, "Formación")
            self.mov(f"2026-{mes}-04", "Compra Mercadona", 40, "Supermercado")
        self.app.manejar("/api/jev/config", {"clave": CLAVE, "activo": True})
        f = {x["ejemplo"]: x for x in self.app.manejar("/api/detectar", {})["fijos"]}
        self.assertEqual((f["Recibo Academia Oxford"]["jev_fijo"], f["Compra Mercadona"]["jev_fijo"]), (0.9, 0.1))
        n = len(RECIBIDO)
        self.app.manejar("/api/detectar", {})
        self.assertEqual(len(RECIBIDO), n)  # se recuerda

    def reparto(self):
        """Mercadona 97,84 € pagado con tarjeta y cuatro Bizums de ~19,56 € ocho días después (fuera del día anterior)."""
        for f, c, i in (("2026-09-01", "Pago Movil En Mercadona Aguad, Jaen", -97.84), ("2026-09-02", "Pago Movil En Ferreteria Lopez, Madrid", -12.5)):
            self.app.manejar("/api/guardar", {"tipo": "movimiento", "datos": {"fecha": f, "clase": "gasto", "importe": abs(i), "concepto": c.split(" En ")[1].split(",")[0],
                                                                              "categoria": "Supermercado" if "Mercadona" in c else "Hogar", "cuenta": "Nómina", "ext_texto": c, "ext_importe": i, "ext_fecha": f}})
        ruta = os.path.join(self.app.carpeta.banco, "r.xlsx")
        excel_santander(ruta, [("2026-09-09", f"Bizum de {n} concepto", 19.56) for n in ("Ana Ruiz", "Luis Gil", "Eva Sanz", "Pablo Cano")], saldo_inicial=900.0)
        return self.app._importar(ruta, "banco", "Nómina")

    def test_bizum_reparto_con_gastos_candidatos(self):
        self.app.manejar("/api/jev/config", {"clave": CLAVE, "activo": True, "al_importar": False})
        # Ocho días después, 4 Bizums de 19,56 = 97,84 ÷ 5 (tú incluido): lo casa la aritmética local, sin preguntar a Jev
        r = self.reparto()
        P = self.app.datos()["pendientes"]
        self.assertEqual(len(P), 0, r)
        self.assertEqual(RECIBIDO, [])

    def test_bizum_pendiente_pregunta_a_jev_con_los_candidatos(self):
        self.app.manejar("/api/jev/config", {"clave": CLAVE, "activo": True, "al_importar": False})
        for f, c, i in (("2026-09-01", "Pago Movil En Mercadona Aguad, Jaen", -97.84), ("2026-09-05", "Pago Movil En Cine Plaza, Jaen", -40.0)):
            self.app.manejar("/api/guardar", {"tipo": "movimiento", "datos": {"fecha": f, "clase": "gasto", "importe": abs(i), "concepto": c.split(" En ")[1].split(",")[0],
                                                                              "categoria": "Supermercado" if "Mercadona" in c else "Ocio", "cuenta": "Nómina", "ext_texto": c, "ext_importe": i, "ext_fecha": f}})
        ruta = os.path.join(self.app.carpeta.banco, "r.xlsx")
        excel_santander(ruta, [("2026-09-09", "Bizum de Ana Ruiz", 31.00), ("2026-09-09", "Bizum de Luis Gil", 31.00)], saldo_inicial=900.0)  # 62 € no cuadra con nada
        self.app._importar(ruta, "banco", "Nómina")
        self.assertEqual(len(self.app.datos()["pendientes"]), 2)
        self.app.manejar("/api/jev/revisar", {})
        P = self.app.datos()["pendientes"]
        # Los dos Bizums son un reparto: una sola pregunta, con los gastos tuyos como opciones y el contexto de tu historial
        q = [b for b in RECIBIDO if "origen" in b["questions"]]
        self.assertEqual(len(q), 1)
        opciones = json.dumps(q[0]["questions"]["origen"]["criteria"], ensure_ascii=False)
        self.assertIn("97.84", opciones); self.assertIn("40.00", opciones); self.assertIn("ninguno", opciones)
        self.assertIn("2 Bizums de esa misma cantidad", q[0]["state"]); self.assertIn("recibe Bizums casi siempre", q[0]["state"])
        self.assertNotIn("Ruiz", json.dumps(RECIBIDO, ensure_ascii=False))
        s = P[0]["sugerencia"]
        self.assertEqual((s["fuente"], s["categoria"], s["clase"]), ("jev", "Supermercado", "reembolso"))
        self.assertIn("parte de «Pago Movil En Mercadona", s["motivo"])
        # Los candidatos llegan a la página con todo el detalle
        c = P[0]["candidatos"]
        self.assertEqual({x["importe"] for x in c}, {97.84, 40.0})
        self.assertTrue(all({"id", "fecha", "concepto", "cat", "dias", "devuelto", "texto"} <= set(x) for x in c))
        # Elegir uno enlaza los Bizums con ese gasto
        gasto = next(x for x in c if x["importe"] == 97.84)
        self.app.manejar("/api/resolver", {"id": P[0]["id"], "ids": [p["id"] for p in P], "accion": "guardar", "clase": "gasto", "categoria": "Supermercado", "reembolsa": gasto["id"]})
        reem = [m for m in self.app.alm.todos("movimiento") if m["clase"] == "reembolso"]
        self.assertEqual(({m["reembolsa"] for m in reem}, len(reem)), ({gasto["id"]}, 2))

    def test_contexto_de_tu_historial_y_privacidad(self):
        self.app.manejar("/api/jev/config", {"clave": CLAVE, "activo": True, "al_importar": False})
        self.app.alm.set_config("titulares", ["GARCIA LOPEZ ANA"])
        for conc, cat in (("cena", "Comer fuera"), ("cena", "Comer fuera"), ("copa", "Comer fuera"), ("piso", "Vivienda")):
            self.app.manejar("/api/guardar", {"tipo": "movimiento", "datos": {"fecha": "2026-09-03", "clase": "gasto", "importe": 10, "concepto": conc, "categoria": cat, "cuenta": "Nómina",
                                                                              "ext_texto": f"Bizum a favor de Laura Gil concepto {conc}", "ext_importe": -10, "ext_fecha": "2026-09-03"}})
        ctx = jev.Contexto(self.app.alm)
        t = ctx.de("Bizum a favor de Laura Gil concepto mojitos", -8)
        self.assertIn("«cena» → Comer fuera (2)", t); self.assertIn("«piso» → Vivienda", t)
        self.assertIn("le has enviado 4 Bizums", t); self.assertNotIn("Laura", t)
        self.assertIn("SU PARTE", t)
        # Tu nombre y las direcciones no salen, ni en el concepto de una transferencia
        jev.config(self.app.alm)
        s = jev.saneado("TRANSFERENCIA A FAVOR DE Pepe Gil CONCEPTO Septiembre y fianza, C/linares 4izq, Ana Garcia Lopez", -450)
        self.assertNotIn("Ana", s); self.assertNotIn("Garcia", s); self.assertNotIn("linares", s); self.assertIn("fianza", s)

    def test_registro_de_lo_enviado(self):
        self.app.manejar("/api/jev/config", {"clave": CLAVE, "activo": True})
        self.assertEqual(self.app.manejar("/api/jev/enviado", {})["enviado"], [])
        self.importar()
        esperar_repaso()  # B-019: lo enviado lo registra el repaso de fondo
        e = self.app.manejar("/api/jev/enviado", {})["enviado"]
        self.assertTrue(e and all({"cuando", "estado", "preguntas"} <= set(x) for x in e))
        self.assertNotIn("Ruiz", json.dumps(e, ensure_ascii=False))
        self.assertEqual(len(e), len(RECIBIDO))  # lo registrado es lo enviado, ni más ni menos

class TestJevNoBloquea(unittest.TestCase):
    """B-019: Jev no puede dejar colgado el servidor. Importar y pedir a Jev no retienen el cerrojo de la app."""
    def setUp(self):
        RECIBIDO.clear(); JevFalso.estado_http = 200; JevFalso.bloqueo = None
        self.jev_srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), JevFalso)
        threading.Thread(target=self.jev_srv.serve_forever, daemon=True).start()
        self.url_antes = os.environ.get("FB_JEV_URL")
        os.environ["FB_JEV_URL"] = f"http://127.0.0.1:{self.jev_srv.server_address[1]}/v1/systemone"
        self.dir = tempfile.mkdtemp()
        self.app = servidor.App(self.dir, hoy="2026-09-30")
        self.app.manejar("/api/bienvenida", {"cuentas": [{"nombre": "Nómina", "tipo": "corriente", "saldo": 1000}]})
        self.web = servidor.crear(self.app, 0)
        threading.Thread(target=self.web.serve_forever, daemon=True).start()
        self.puerto = self.web.server_address[1]
    def tearDown(self):
        if JevFalso.bloqueo is not None: JevFalso.bloqueo.set()
        esperar_repaso()
        JevFalso.bloqueo = None
        self.web.shutdown(); self.web.server_close()
        self.jev_srv.shutdown(); self.jev_srv.server_close()
        if self.url_antes is None: os.environ.pop("FB_JEV_URL", None)
        else: os.environ["FB_JEV_URL"] = self.url_antes
        self.app.alm.cerrar(); shutil.rmtree(self.dir, ignore_errors=True)
    def pedir(self, metodo, ruta, cuerpo=None):
        c = http.client.HTTPConnection("127.0.0.1", self.puerto, timeout=30)
        try:
            c.request(metodo, ruta, body=json.dumps(cuerpo or {}).encode("utf-8") if metodo == "POST" else None,
                      headers={"X-FB-Token": self.app.token, "Content-Type": "application/json"})
            return json.loads(c.getresponse().read().decode("utf-8"))
        finally:
            c.close()
    def importar(self):
        excel_santander(os.path.join(self.app.carpeta.banco, "x.xlsx"), FILAS)
        return self.pedir("POST", "/api/importar/reintentar", {"archivo": "x.xlsx", "tipo": "banco", "cuenta": "Nómina"})
    def mov(self, fecha, concepto, importe, categoria):
        r = self.app.manejar("/api/guardar", {"tipo": "movimiento", "datos": {"fecha": fecha, "clase": "gasto", "importe": importe, "concepto": concepto,
                                                                             "categoria": categoria, "cuenta": "Nómina"}})
        self.assertTrue(r["ok"], r)
    def esperar_llamada(self, n0):
        t = time.time()
        while len(RECIBIDO) == n0 and time.time() - t < 10: time.sleep(0.02)
        self.assertGreater(len(RECIBIDO), n0, "Jev no ha recibido la petición")
    def test_la_importacion_vuelve_aunque_jev_no_responda(self):
        self.app.manejar("/api/jev/config", {"clave": CLAVE, "activo": True})
        JevFalso.bloqueo = threading.Event()  # Jev no contesta hasta que lo soltemos
        t = time.time()
        r = self.importar()
        self.assertLess(time.time() - t, 5, "la importación se ha quedado esperando a Jev")
        self.assertTrue(r["ok"], r); self.assertTrue(r.get("jev_en_marcha"), r); self.assertIn("segundo plano", r["mensaje"], r["mensaje"])
        self.assertTrue(jev.estado_repaso()["en_marcha"])
        self.assertTrue(self.pedir("GET", "/api/datos")["pendientes"])  # la app sigue atendiendo mientras Jev repasa
        JevFalso.bloqueo.set()
        self.assertEqual(esperar_repaso()["error"], "")
        self.assertTrue(any(p.get("jev") for p in self.app.alm.todos("pendiente")))
    def test_mientras_jev_repasa_no_se_le_pide_lo_mismo_otra_vez(self):
        # Revisar y auditar no esperan al cerrojo: sin la comprobación, «Pedir a Jev» durante el repaso de fondo repetiría y pagaría las mismas preguntas
        self.app.manejar("/api/jev/config", {"clave": CLAVE, "activo": True})
        JevFalso.bloqueo = threading.Event()
        self.assertTrue(self.importar()["jev_en_marcha"])
        self.esperar_llamada(0)
        t = time.time()
        for ruta in ("/api/jev/revisar", "/api/jev/auditar"):
            r = self.pedir("POST", ruta)
            self.assertFalse(r["ok"], r); self.assertIn("repasando", r["mensaje"])
        self.assertLess(time.time() - t, 5, "se le ha vuelto a preguntar a Jev mientras repasaba")
        JevFalso.bloqueo.set()
        self.assertEqual(esperar_repaso()["error"], "")
        self.assertTrue(self.pedir("POST", "/api/jev/revisar")["ok"])  # al acabar el repaso, ya se puede
    def test_una_peticion_a_jev_no_deja_colgada_la_pagina(self):
        self.app.manejar("/api/jev/config", {"clave": CLAVE, "activo": True, "al_importar": False})
        self.importar()
        JevFalso.bloqueo = threading.Event()
        resultado = {}
        hilo = threading.Thread(target=lambda: resultado.update(self.pedir("POST", "/api/jev/revisar")), daemon=True)
        n0 = len(RECIBIDO); hilo.start(); self.esperar_llamada(n0)
        t = time.time()
        self.pedir("GET", "/api/datos")
        self.assertLess(time.time() - t, 5, "la página se ha quedado esperando a Jev")
        JevFalso.bloqueo.set(); hilo.join(20)
        self.assertTrue(resultado.get("ok"), resultado)
    def test_un_formato_nuevo_no_deja_colgada_la_pagina_mientras_jev_propone_las_columnas(self):
        # B-019 (resto): un archivo cuyo formato no se conoce le pregunta a Jev qué columna es cada cosa. Esa pregunta no puede
        # hacerse con el cerrojo de la app cogido: mientras Jev no contesta, el resto de peticiones tienen que seguir saliendo.
        self.app.manejar("/api/jev/config", {"clave": CLAVE, "activo": True})
        csv = ("F.Operación;F.Valor;Concepto del movimiento;Importe EUR;Saldo EUR\n"
               "01/09/2026;01/09/2026;Compra Lidl;-12,30;500,00\n02/09/2026;02/09/2026;Nomina;1500,00;2000,00\n")
        ruta = os.path.join(self.app.carpeta.banco, "raro.csv")
        subir = {"nombre": "raro.csv", "tipo": "banco", "contenido": base64.b64encode(csv.encode("utf-8")).decode()}
        for que, url, cuerpo in (("subir", "/api/importar/subir", subir), ("reintentar", "/api/importar/reintentar", {"archivo": "raro.csv", "tipo": "banco"}),
                                 ("carpeta", "/api/importar/carpeta", {})):
            with self.subTest(que):
                with open(ruta, "w", encoding="utf-8") as fh: fh.write(csv)
                JevFalso.bloqueo = threading.Event()
                resultado = {}
                hilo = threading.Thread(target=lambda: resultado.update(self.pedir("POST", url, cuerpo)), daemon=True)
                n0 = len(RECIBIDO); hilo.start(); self.esperar_llamada(n0)
                t = time.time()
                self.pedir("GET", "/api/datos")
                espera = time.time() - t
                JevFalso.bloqueo.set(); hilo.join(20)
                self.assertLess(espera, 5, f"con Jev sin contestar, otra petición ha esperado {espera:.1f} s a la importación")
                r = resultado.get("resultados", [resultado])[0]  # la carpeta devuelve una lista; subir y reintentar, el archivo
                self.assertEqual(r["necesita"], "perfil", r)
                # y la propuesta de Jev sigue llegando a la pantalla cuando contesta
                self.assertEqual(r["propuesta"], {"_tipo": "banco", "fecha": "F.Operación", "fecha_valor": "F.Valor",
                                                  "concepto": "Concepto del movimiento", "importe": "Importe EUR", "saldo": "Saldo EUR"}, r)
    def test_descartar_mientras_jev_repasa_no_lo_devuelve(self):
        # Lo que descartas mientras Jev repasa no vuelve a salir cuando el repaso acaba (B-019)
        self.app.manejar("/api/jev/config", {"clave": CLAVE, "activo": True, "al_importar": False})
        self.mov("2026-09-05", "Clases academia de inglés", 40, "Otros")
        self.assertTrue(self.pedir("POST", "/api/jev/auditar")["ok"])
        A = next(h["clave"] for h in self.app.datos()["config"]["jev"]["revision"]["hallazgos"] if h["actual"] == "Otros")
        self.mov("2026-09-06", "Desayuno cafetería centro", 4, "Ocio")
        JevFalso.bloqueo = threading.Event()
        resultado = {}
        hilo = threading.Thread(target=lambda: resultado.update(self.pedir("POST", "/api/jev/auditar")), daemon=True)
        n0 = len(RECIBIDO); hilo.start(); self.esperar_llamada(n0)
        t = time.time()
        r = self.pedir("POST", "/api/jev/hallazgo", {"clave": A, "accion": "descartar"})
        self.assertLess(time.time() - t, 5, "descartar se ha quedado esperando a Jev")
        self.assertTrue(r["ok"], r)
        JevFalso.bloqueo.set(); hilo.join(20)
        self.assertTrue(resultado.get("ok"), resultado)
        self.assertNotIn(A, [h["clave"] for h in self.app.datos()["config"]["jev"]["revision"]["hallazgos"]])
    def test_con_jev_apagado_la_importacion_no_llama_a_jev(self):
        self.app.manejar("/api/jev/config", {"clave": CLAVE, "activo": False})
        r = self.importar()
        self.assertTrue(r["ok"], r); self.assertFalse(r.get("jev_en_marcha"), r)
        self.assertEqual(RECIBIDO, [])


if __name__ == "__main__":
    unittest.main()

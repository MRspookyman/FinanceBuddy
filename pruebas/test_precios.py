# Pruebas de los precios por internet (precios.py) contra un servidor falso en local (Yahoo, Morningstar y CoinGecko con los
# mismos formatos). No hace falta red. Uso: python -m unittest pruebas.test_precios -v
import datetime, http.server, json, os, shutil, sys, tempfile, threading, time, unittest, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from financebuddy import precios, servidor

PEDIDOS = []   # (ruta con parámetros) de lo que ha recibido el servidor falso: para comprobar que solo salen identificadores

def _dias(n, fin=None):
    f = fin or datetime.date.today()
    return [f - datetime.timedelta(days=i) for i in range(n)][::-1]

def _ts(d): return int(datetime.datetime(d.year, d.month, d.day, 12, tzinfo=datetime.timezone.utc).timestamp())

def serie_falsa(base, n=400, pendiente=0.1):
    """n días laborables de precio creciente: base + pendiente × día."""
    ds = [d for d in _dias(int(n * 1.5)) if d.weekday() < 5][-n:]
    return [(d, base + pendiente * i) for i, d in enumerate(ds)]

YAHOO = {"IWDA.AS": ("EUR", 80.0), "SXR8.DE": ("EUR", 400.0), "EUNA.DE": ("EUR", 5.0), "XEON.DE": ("EUR", 140.0), "AAPL": ("USD", 200.0),
         "VUSA.L": ("GBp", 7000.0), "USDEUR=X": ("EUR", 0.9), "GBPEUR=X": ("EUR", 1.2), "GC=F": ("USD", 2300.0), "0P0000YXQE": ("EUR", 20.0)}

class PreciosFalso(http.server.BaseHTTPRequestHandler):
    caido = False      # si es True, todo devuelve 503
    def log_message(self, *a): pass
    def _json(self, obj, code=200):
        self.send_response(code); self.send_header("Content-Type", "application/json"); self.end_headers()
        self.wfile.write(json.dumps(obj).encode())
    def do_GET(self):
        u = urllib.parse.urlsplit(self.path); q = urllib.parse.parse_qs(u.query)
        PEDIDOS.append(self.path)
        if PreciosFalso.caido: return self._json({"error": "caído"}, 503)
        p = u.path
        if p.startswith("/yahoo/v8/finance/chart/"):
            sim = urllib.parse.unquote(p.rsplit("/", 1)[1])
            if sim not in YAHOO: return self._json({"chart": {"result": None, "error": {"code": "Not Found"}}}, 404)
            mon, base = YAHOO[sim]
            s = serie_falsa(base, 400 if q.get("range") == ["max"] else 25, base * 0.001)
            return self._json({"chart": {"result": [{"meta": {"currency": mon, "longName": f"Producto {sim}", "fullExchangeName": "Mercado falso"},
                                                     "timestamp": [_ts(d) for d, _ in s], "indicators": {"quote": [{"close": [v for _, v in s]}]}}]}})
        if p == "/yahoo/v1/finance/search":
            t = q["q"][0].upper()
            quotes = {"IE00B4L5Y983": [{"symbol": "IWDA.AS", "shortname": "iShares Core MSCI World", "quoteType": "ETF"},
                                       {"symbol": "EUNL.DE", "shortname": "iShares Core MSCI World (Xetra)", "quoteType": "ETF"},
                                       {"symbol": "0P0000YXQE.F", "shortname": "iShares Developed World Index", "quoteType": "MUTUALFUND"}],
                      "APPLE": [{"symbol": "AAPL", "longname": "Apple Inc.", "quoteType": "EQUITY"}, {"symbol": "APC.DE", "shortname": "Apple", "quoteType": "EQUITY"}],
                      "BITCOIN": []}.get(t, [])
            return self._json({"quotes": quotes})
        if p.startswith("/morningstar/api/rest.svc/timeseries_price/"):
            sec = q["id"][0].split("]")[0]
            if sec != "0P0000YXQE": return self._json([])
            s = serie_falsa(20.0, 400, 0.02)
            return self._json([[int(_ts(d) * 1000), v] for d, v in s] + [[int(_ts(s[-1][0] + datetime.timedelta(days=(5 - s[-1][0].weekday()) % 7 or 7)) * 1000), 99.0]] * 0)
        if "/security/screener" in p:
            return self._json({"rows": [{"SecId": "F00000X5R7", "Name": "iShares Developed World Index Fund (IE) D Acc EUR", "Universe": "FOESP$$ALL",
                                         "OngoingCharge": 0.2, "CollectedSRRI": 5, "CategoryName": "Renta Variable Global Cap. Grande Blend", "BrandingCompanyName": "BlackRock"}]}
                              if q["term"][0].upper() == "IE00B4L5Y983" else {"rows": []})
        if p.startswith("/coingecko/api/v3/coins/") and p.endswith("/market_chart"):
            if "bitcoin" not in p: return self._json({"error": "coin not found"}, 404)
            s = serie_falsa(50000.0, 30, 100.0)
            return self._json({"prices": [[int(_ts(d) * 1000), v] for d, v in s]})
        if p == "/coingecko/api/v3/search":
            return self._json({"coins": [{"id": "bitcoin", "name": "Bitcoin", "market_cap_rank": 1}, {"id": "bitcoin-cash", "name": "Bitcoin Cash", "market_cap_rank": 20}]
                               if q["query"][0].lower() == "bitcoin" else []})
        self._json({}, 404)

class Base(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), PreciosFalso)
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
        os.environ["FB_PRECIOS_URL"] = f"http://127.0.0.1:{cls.srv.server_address[1]}"
    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown(); cls.srv.server_close(); os.environ.pop("FB_PRECIOS_URL", None)
    def setUp(self):
        PEDIDOS.clear(); PreciosFalso.caido = False
        self.dir = tempfile.mkdtemp()
        self.app = servidor.App(self.dir, hoy=datetime.date.today().isoformat())
        self.alm = self.app.alm
        self.api = lambda ruta, d=None: self.app.manejar(ruta, d or {})
        self.api("/api/bienvenida", {"cuentas": [{"nombre": "Broker", "tipo": "broker", "saldo": 0}]})
    def tearDown(self):
        self.alm.cerrar(); shutil.rmtree(self.dir, ignore_errors=True)
    def activar(self): self.api("/api/precios/config", {"activo": True})
    def activo(self, nombre, **kw):
        self.alm.guardar("activo", {"nombre": nombre, "clase": "etf", **kw})
    def compra(self, nombre, fecha, importe, part=None):
        self.alm.guardar("aportacion", {"fecha": fecha, "activo": nombre, "importe": importe, "participaciones": part})

class TestActivacion(Base):
    def test_apagado_de_serie_y_no_sale_nada(self):
        self.activo("Mundo", fuente_precio="yahoo", codigo_precio="IWDA.AS")
        self.assertFalse(self.app.datos()["config"]["precios"]["activo"])
        r = self.api("/api/precios/actualizar", {})
        self.assertFalse(r["ok"]); self.assertIn("desactivados", r["mensaje"])
        self.assertFalse(self.api("/api/precios/buscar", {"texto": "IE00B4L5Y983"})["ok"])
        self.assertEqual(PEDIDOS, [])

    def test_la_pagina_no_recibe_las_series(self):
        self.activar(); self.activo("Mundo", fuente_precio="yahoo", codigo_precio="IWDA.AS")
        precios.actualizar(self.alm)
        d = self.app.datos()
        self.assertFalse(any(k.startswith("precio_serie:") for k in d["config"]))
        self.assertIn("Mundo", d["config"]["precios"]["activos"])
        self.assertNotIn("serie", json.dumps(d["config"]["precios"]))

    def test_validacion_de_la_fuente_y_el_codigo(self):
        for mal in ({"fuente_precio": "yahoo"}, {"fuente_precio": "bing", "codigo_precio": "X"}, {"fuente_precio": "yahoo", "codigo_precio": "a/b?c"},
                    {"fuente_precio": "yahoo", "codigo_precio": "AAPL", "moneda": "dólares"}):
            with self.assertRaises(ValueError): self.alm.guardar("activo", {"nombre": "Malo", **mal})
        self.assertEqual(precios.validar_fuente("", "x", "usd"), ("", "", "EUR"))

class TestActualizar(Base):
    def test_solo_salen_identificadores(self):
        self.activar()
        self.activo("Mundo", fuente_precio="yahoo", codigo_precio="IWDA.AS", isin="IE00B4L5Y983", valor=12345.67)
        self.compra("Mundo", "2026-01-15", 5000, 55.5)
        precios.actualizar(self.alm, forzar=True)
        todo = " ".join(PEDIDOS)
        self.assertIn("IWDA.AS", todo)
        for secreto in ("12345", "5000", "Broker", "Mundo", "55.5"): self.assertNotIn(secreto, urllib.parse.unquote(todo))

    def test_guarda_la_serie_y_el_ultimo_precio_en_euros(self):
        self.activar(); self.activo("Mundo", fuente_precio="yahoo", codigo_precio="IWDA.AS")
        r = precios.actualizar(self.alm)
        self.assertEqual((r["actualizados"], r["total"], r["fallos"]), (1, 1, []))
        u = self.alm.config("precio_ultimos")["Mundo"]
        s = precios.leer_serie(self.alm, "yahoo", "IWDA.AS")
        self.assertEqual(u["fecha"], max(s)); self.assertAlmostEqual(u["precio"], s[max(s)], 4)
        self.assertGreater(len(s), 300)
        self.assertEqual(precios.mensaje_resultado(r), "1 precio al día")

    def test_dos_activos_con_el_mismo_codigo_se_descargan_una_vez(self):
        self.activar()
        self.activo("A", fuente_precio="yahoo", codigo_precio="IWDA.AS"); self.activo("B", fuente_precio="yahoo", codigo_precio="IWDA.AS")
        precios.actualizar(self.alm)
        self.assertEqual(sum("IWDA.AS" in p for p in PEDIDOS), 1)
        self.assertEqual(set(self.alm.config("precio_ultimos")), {"A", "B"})

    def test_al_dia_no_vuelve_a_descargar_salvo_forzar(self):
        self.activar(); self.activo("Mundo", fuente_precio="yahoo", codigo_precio="IWDA.AS")
        precios.actualizar(self.alm); n = len(PEDIDOS)
        precios.actualizar(self.alm); self.assertEqual(len(PEDIDOS), n)
        precios.actualizar(self.alm, forzar=True); self.assertGreater(len(PEDIDOS), n)

    def test_cambio_de_moneda_dolares_y_peniques(self):
        self.activar()
        self.activo("Apple", clase="accion", fuente_precio="yahoo", codigo_precio="AAPL", moneda="USD")
        self.activo("Vanguard UK", fuente_precio="yahoo", codigo_precio="VUSA.L", moneda="GBp")
        r = precios.actualizar(self.alm)
        self.assertEqual(r["fallos"], [])
        ult = self.alm.config("precio_ultimos")
        sa, sv = precios.leer_serie(self.alm, "yahoo", "AAPL"), precios.leer_serie(self.alm, "yahoo", "VUSA.L")
        fx_usd, fx_gbp = precios.leer_serie(self.alm, "yahoo", "USDEUR=X"), precios.leer_serie(self.alm, "yahoo", "GBPEUR=X")
        f = ult["Apple"]["fecha"]
        self.assertAlmostEqual(ult["Apple"]["precio"], sa[f] * precios.valor_en(fx_usd, f), 3)
        f = ult["Vanguard UK"]["fecha"]
        self.assertAlmostEqual(ult["Vanguard UK"]["precio"], sv[f] * 0.01 * precios.valor_en(fx_gbp, f), 3)   # peniques → libras → euros
        self.assertLess(ult["Vanguard UK"]["precio"], 200)

    def test_morningstar_y_coingecko(self):
        self.activar()
        self.activo("Indexado", fuente_precio="morningstar", codigo_precio="0P0000YXQE")
        self.activo("Bitcoin", clase="cripto", fuente_precio="coingecko", codigo_precio="bitcoin")
        self.compra("Indexado", "2026-01-15", 100, 5)
        r = precios.actualizar(self.alm)
        self.assertEqual((r["actualizados"], r["fallos"]), (2, []))
        u = self.alm.config("precio_ultimos")
        self.assertGreater(u["Bitcoin"]["precio"], 50000); self.assertEqual(u["Indexado"]["fuente"], "morningstar")
        self.assertTrue(all(datetime.date.fromisoformat(k).weekday() < 5 for k in precios.leer_serie(self.alm, "morningstar", "0P0000YXQE")))

    def test_los_fallos_se_cuentan_una_vez_y_no_rompen_lo_demas(self):
        self.activar()
        self.activo("Mundo", fuente_precio="yahoo", codigo_precio="IWDA.AS")
        self.activo("Raro", fuente_precio="yahoo", codigo_precio="NOEXISTE")
        self.activo("Otro raro", fuente_precio="coingecko", codigo_precio="nada")
        r = precios.actualizar(self.alm)
        self.assertEqual((r["actualizados"], len(r["fallos"])), (1, 2))
        self.assertEqual(sorted(f["que"] for f in r["fallos"]), ["Otro raro", "Raro"])
        self.assertEqual(precios.mensaje_resultado(r), "1 precio al día · 2 no se han podido actualizar")
        self.assertIn("Mundo", self.alm.config("precio_ultimos"))

    def test_sin_conexion_se_sigue_con_lo_ultimo_conocido(self):
        self.activar(); self.activo("Mundo", fuente_precio="yahoo", codigo_precio="IWDA.AS")
        precios.actualizar(self.alm)
        antes = self.alm.config("precio_ultimos")["Mundo"]
        PreciosFalso.caido = True
        r = precios.actualizar(self.alm, forzar=True)
        self.assertEqual((r["actualizados"], len(r["fallos"])), (0, 1)); self.assertIn("503", r["fallos"][0]["motivo"])
        self.assertEqual(self.alm.config("precio_ultimos")["Mundo"], antes)   # el precio de antes sigue ahí

    def test_servidor_inalcanzable_falla_rapido_y_dice_por_que(self):
        import time as _t
        self.activar(); self.activo("A", fuente_precio="yahoo", codigo_precio="IWDA.AS"); self.activo("B", fuente_precio="yahoo", codigo_precio="SXR8.DE")
        self.activo("C", clase="accion", fuente_precio="yahoo", codigo_precio="AAPL", moneda="USD")
        os.environ["FB_PRECIOS_URL"], antes = "http://127.0.0.1:9", os.environ["FB_PRECIOS_URL"]
        try:
            t = _t.time(); r = precios.actualizar(self.alm, forzar=True)
        finally: os.environ["FB_PRECIOS_URL"] = antes
        self.assertLess(_t.time() - t, 5)
        self.assertEqual((r["actualizados"], len(r["fallos"])), (0, 4))   # 3 precios + el cambio USD→EUR
        self.assertTrue(all("sin conexión" in f["motivo"] for f in r["fallos"]), r["fallos"])

    def test_los_vendidos_y_los_sin_fuente_no_se_consultan(self):
        self.activar()
        self.activo("Vendido", fuente_precio="yahoo", codigo_precio="IWDA.AS", estado="vendido"); self.activo("Manual")
        r = precios.actualizar(self.alm)
        self.assertEqual((r["total"], PEDIDOS), (0, []))

    def test_en_segundo_plano_y_estado(self):
        self.activar(); self.activo("Mundo", fuente_precio="yahoo", codigo_precio="IWDA.AS")
        self.assertTrue(self.api("/api/precios/actualizar", {"forzar": True})["iniciado"])
        for _ in range(100):
            e = self.api("/api/precios/estado")
            if not e["en_marcha"] and e["resultado"]: break
            time.sleep(0.05)
        self.assertTrue(e["resultado"]["ok"]); self.assertEqual(e["mensaje"], "1 precio al día")
        self.assertFalse(e["precios"]["viejo"]); self.assertTrue(e["precios"]["ultima"])

    def test_viejo_se_marca_a_las_seis_horas(self):
        self.activar()
        self.assertTrue(precios.para_la_pagina(self.alm)["viejo"])
        precios.guardar_config(self.alm, {}); c = dict(self.alm.config("precios")); c["ultima"] = datetime.datetime.now().isoformat(timespec="seconds"); self.alm.set_config("precios", c)
        self.assertFalse(precios.para_la_pagina(self.alm)["viejo"])
        c["ultima"] = (datetime.datetime.now() - datetime.timedelta(hours=7)).isoformat(timespec="seconds"); self.alm.set_config("precios", c)
        self.assertTrue(precios.para_la_pagina(self.alm)["viejo"])

class TestBuscar(Base):
    def test_por_isin_morningstar_primero_con_ficha(self):
        self.activar()
        r = self.api("/api/precios/buscar", {"texto": "ie00b4l5y983"})
        self.assertTrue(r["ok"])
        c = r["candidatos"]
        self.assertEqual([x["fuente"] for x in c][:1], ["morningstar"])
        self.assertEqual(c[0]["codigo"], "0P0000YXQE"); self.assertEqual(c[0]["ficha"]["ter"], 0.2); self.assertEqual(c[0]["ficha"]["riesgo"], 5)
        self.assertIn("yahoo", [x["fuente"] for x in c]); self.assertTrue(all(x["precio"] > 0 and x["fecha"] for x in c))
        self.assertNotIn("0P0000YXQE.F", [x["codigo"] for x in c])    # el código de Morningstar en Yahoo no se ofrece dos veces
        self.assertEqual(PEDIDOS and any("IE00B4L5Y983" in p for p in PEDIDOS), True)

    def test_por_nombre_y_cripto_y_materias(self):
        self.activar()
        c = precios.buscar(self.alm, "apple")
        self.assertEqual(c[0]["codigo"], "AAPL"); self.assertEqual(c[0]["moneda"], "USD"); self.assertEqual(c[0]["tipo"], "accion")
        self.assertNotIn("APC.DE", [x["codigo"] for x in c])    # sin cotizaciones en el servidor: se descarta
        self.assertEqual(precios.buscar(self.alm, "bitcoin")[0]["codigo"], "bitcoin")
        self.assertEqual(precios.buscar(self.alm, "oro")[0]["codigo"], "GC=F")
        self.assertEqual(precios.buscar(self.alm, "   "), [])
        self.assertEqual(precios.buscar(self.alm, "x" * 70), [])

class TestAutoconfigurar(Base):
    def test_configura_los_que_tienen_isin_y_deja_el_resto(self):
        self.activar()
        self.activo("Fondo mundo", isin="IE00B4L5Y983"); self.activo("Fondo raro", isin="ES0000000001"); self.activo("Sin isin"); self.activo("Ya hecho", isin="IE00B4L5Y983", fuente_precio="yahoo", codigo_precio="IWDA.AS")
        r = self.api("/api/precios/autoconfigurar", {})
        self.assertEqual((r["configurados"], r["sin_resultado"]), (["Fondo mundo"], ["Fondo raro"]))
        a = next(x for x in self.alm.todos("activo") if x["nombre"] == "Fondo mundo")
        self.assertEqual((a["fuente_precio"], a["codigo_precio"], a["moneda"], a["ter"]), ("morningstar", "0P0000YXQE", "EUR", 0.2))
        self.assertNotIn("fuente_precio", {k: v for k, v in next(x for x in self.alm.todos("activo") if x["nombre"] == "Sin isin").items() if v})

class TestComparar(Base):
    def test_matematica_de_unidades_valor_y_tir(self):
        self.activar()
        self.activo("Mi fondo", valor=1)
        hoy = datetime.date.today()
        f1, f2 = (hoy - datetime.timedelta(days=200)).isoformat(), (hoy - datetime.timedelta(days=100)).isoformat()
        self.compra("Mi fondo", f1, 1000, 10); self.compra("Mi fondo", f2, 500, 5)
        self.alm.guardar("aportacion", {"fecha": f2, "activo": "Mi fondo", "importe": 200, "participaciones": 2, "traspaso": "si"})   # un traspaso no es dinero nuevo
        r = precios.comparar(self.alm, "mundo")
        s = precios.leer_serie(self.alm, "yahoo", "IWDA.AS")
        u = 1000 / precios.valor_en(s, f1) + 500 / precios.valor_en(s, f2)
        self.assertAlmostEqual(r["hoy"], u * s[max(s)], 1)
        self.assertEqual(r["puesto"], 1500); self.assertEqual(r["aportado"][-1], 1500); self.assertEqual(r["desde"], f1)
        self.assertEqual(len(r["meses"]), len(r["valor"])); self.assertEqual(r["meses"][0], f1[:7])
        self.assertGreater(r["tir"], 0)    # el falso crece siempre
        self.assertEqual(r["avisos"], [])

    def test_sesenta_cuarenta_mezcla_dos_piezas(self):
        self.activar(); self.activo("Mi fondo")
        f1 = (datetime.date.today() - datetime.timedelta(days=150)).isoformat()
        self.compra("Mi fondo", f1, 1000, 10)
        r = precios.comparar(self.alm, "6040")
        a, b = precios.leer_serie(self.alm, "yahoo", "IWDA.AS"), precios.leer_serie(self.alm, "yahoo", "EUNA.DE")
        esperado = 600 / precios.valor_en(a, f1) * a[max(a)] + 400 / precios.valor_en(b, f1) * b[max(b)]
        self.assertAlmostEqual(r["hoy"], esperado, 1)

    def test_sin_compras_o_con_referencia_desconocida(self):
        self.activar()
        with self.assertRaises(precios.ErrorPrecios): precios.comparar(self.alm, "mundo")
        self.activo("Mi fondo"); self.compra("Mi fondo", "2026-01-15", 100, 1)
        with self.assertRaises(precios.ErrorPrecios): precios.comparar(self.alm, "inventada")
        self.assertFalse(self.api("/api/precios/comparar", {"ref": "inventada"})["ok"])

    def test_avisa_si_tus_compras_son_anteriores_a_los_precios(self):
        self.activar(); self.activo("Mi fondo")
        self.compra("Mi fondo", "2010-01-15", 100, 1)
        r = precios.comparar(self.alm, "mundo")
        self.assertTrue(any("anteriores" in a for a in r["avisos"]))

    def test_xirr(self):
        d = datetime.date
        self.assertAlmostEqual(precios._xirr([(d(2025, 1, 1), -1000), (d(2026, 1, 1), 1100)]), 0.10, 3)
        self.assertIsNone(precios._xirr([(d(2025, 1, 1), -1000)]))

if __name__ == "__main__":
    unittest.main()

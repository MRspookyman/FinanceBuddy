# Que la app aguante lo que puede salir mal: carpeta de datos que no se puede abrir, base de datos dañada, borrar algo
# que se está usando, copias en un segundo sitio y extractos de bancos que la app no conoce.
import os, shutil, sys, tempfile, threading, unittest
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from financebuddy import almacen, lectura as L, rutas, servidor, __main__ as arranque
from financebuddy.almacen import Almacen

class TestCarpetaYBaseDatos(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        # Cuál es tu carpeta de datos se guarda fuera de ella, en %APPDATA%\FinanceBuddy\ajustes.json, y «/api/carpeta» lo
        # reescribe: sin apartarlo, pasar las pruebas dejaba la app de verdad apuntando a una carpeta temporal y, al abrirla,
        # parecía que no había datos (estaban en su sitio, pero la app miraba a otro lado).
        self.ajustes_reales = rutas.AJUSTES
        rutas.AJUSTES = os.path.join(self.dir, "ajustes.json")
        self.app = servidor.App(self.dir)
    def tearDown(self):
        rutas.AJUSTES = self.ajustes_reales
        self.app.alm.cerrar(); shutil.rmtree(self.dir, ignore_errors=True)

    def test_cambiar_a_una_carpeta_imposible_no_deja_la_app_inservible(self):
        archivo = os.path.join(self.dir, "soy-un-archivo.txt")
        with open(archivo, "w", encoding="utf-8") as fh: fh.write("x")
        with self.assertRaises(ValueError) as e:
            self.app.manejar("/api/carpeta", {"carpeta": os.path.join(archivo, "dentro")})
        self.assertIn("Sigues con", str(e.exception))
        self.assertEqual(self.app.carpeta.raiz, os.path.abspath(self.dir))
        self.assertTrue(self.app.datos()["info"]["carpeta"])  # la app sigue respondiendo

    def test_cambiar_de_carpeta_bien(self):
        otra = os.path.join(self.dir, "otra")
        r = self.app.manejar("/api/carpeta", {"carpeta": otra})
        self.assertTrue(r["ok"])
        self.assertEqual(self.app.carpeta.raiz, os.path.abspath(otra))
        # y la carpeta elegida se recuerda para la próxima vez (en el ajustes.json apartado, no en el del usuario)
        self.assertEqual(rutas.leer_ajustes().get("datos"), os.path.abspath(otra))
        self.assertNotEqual(rutas.AJUSTES, self.ajustes_reales)

    def test_base_danada_se_reconoce_y_se_recupera_con_una_copia(self):
        self.app.manejar("/api/guardar", {"tipo": "cuenta", "datos": {"nombre": "Mi cuenta"}})
        self.app.copia("prueba", forzar=True)
        self.app.alm.cerrar()
        with open(self.app.carpeta.db, "wb") as fh: fh.write(b"esto no es una base de datos" * 50)
        for sufijo in ("-wal", "-shm"):
            if os.path.exists(self.app.carpeta.db + sufijo): os.remove(self.app.carpeta.db + sufijo)
        with self.assertRaises(almacen.BaseDañada):
            Almacen(self.app.carpeta.db)
        dichos = []
        def dialogo(texto, titulo="FinanceBuddy", preguntar=False):
            dichos.append(texto); return True  # el usuario dice que sí a recuperar la copia
        error = None
        try: Almacen(self.app.carpeta.db)
        except almacen.BaseDañada as e: error = e
        self.assertTrue(arranque._reparar(self.dir, error, dialogo))
        self.assertTrue(any("dañado" in t for t in dichos))
        alm = Almacen(self.app.carpeta.db)  # ya se puede abrir, y están los datos de la copia
        self.assertEqual([c["nombre"] for c in alm.todos("cuenta")], ["Mi cuenta"])
        alm.cerrar()
        self.assertTrue([n for n in os.listdir(self.dir) if ".roto" in n], "el archivo dañado tiene que guardarse, no borrarse")
        self.app.alm = Almacen(self.app.carpeta.db)

    def test_si_dice_que_no_no_se_toca_nada(self):
        self.app.copia("prueba", forzar=True)
        error = almacen.BaseDañada(self.app.carpeta.db, "file is not a database")
        self.assertFalse(arranque._reparar(self.dir, error, lambda *a, **k: False))
        self.assertFalse([n for n in os.listdir(self.dir) if ".roto" in n])

    def test_sin_copias_lo_dice_y_no_inventa(self):
        vacia = tempfile.mkdtemp()
        try:
            dichos = []
            error = almacen.BaseDañada(os.path.join(vacia, "datos.db"), "file is not a database")
            self.assertFalse(arranque._reparar(vacia, error, lambda t, *a, **k: (dichos.append(t), False)[1]))
            self.assertIn("no hay ninguna copia", dichos[0])
        finally: shutil.rmtree(vacia, ignore_errors=True)

    def test_datos_de_una_version_mas_nueva_no_se_abren(self):
        otra = os.path.join(self.dir, "del-futuro")
        alm = Almacen(servidor.rutas.Carpeta(otra).db)
        alm.set_config("version_esquema", almacen.VERSION_ESQUEMA + 1); alm.cerrar()
        with self.assertRaises(almacen.BaseMasNueva):
            Almacen(os.path.join(otra, "datos.db"))
        # al cambiar de carpeta se explica y la app sigue con la suya
        with self.assertRaises(ValueError) as e:
            self.app.manejar("/api/carpeta", {"carpeta": otra})
        self.assertIn("versión más nueva", str(e.exception))
        self.assertEqual(self.app.carpeta.raiz, os.path.abspath(self.dir))
        # y al arrancar, un cuadro que lo dice en vez de abrirlos
        dichos, decir = [], arranque.decir
        arranque.decir = lambda t, *a, **k: dichos.append(t)
        try:
            class A: hoy = None; pruebas = False; datos = otra; ejemplo = False
            self.assertIsNone(arranque._abrir_app(otra, A))
        finally: arranque.decir = decir
        self.assertIn("versión más nueva", dichos[0])

    def test_una_app_abierta_con_su_carpeta_no_toca_la_de_siempre(self):
        # Servidores de pruebas (--datos, --ejemplo, --pruebas): «Usar otra carpeta» no se apunta en ajustes.json y
        # «Volver a mis datos» vuelve a la carpeta con la que se arrancó, no a los datos de verdad.
        rutas.guardar_ajustes({"datos": os.path.join(self.dir, "los-de-verdad")})
        d = os.path.join(self.dir, "pruebas")
        app = servidor.App(d, fija=True)
        try:
            app.manejar("/api/carpeta", {"carpeta": os.path.join(self.dir, "otra")})
            self.assertEqual(rutas.leer_ajustes()["datos"], os.path.join(self.dir, "los-de-verdad"))
            app.ejemplo = True
            app.manejar("/api/ejemplo", {"activar": False})
            self.assertEqual(app.carpeta.raiz, os.path.abspath(d))
            self.assertFalse(os.path.exists(os.path.join(self.dir, "los-de-verdad")))
        finally: app.alm.cerrar()
        solo = servidor.App(os.path.join(self.dir, "ej"), fija=True, ejemplo=True)
        try:
            with self.assertRaises(ValueError): solo.manejar("/api/ejemplo", {"activar": False})
        finally: solo.alm.cerrar()

    def test_restaurar_una_copia_vuelve_a_ese_dia_y_guarda_lo_de_ahora(self):
        self.app.manejar("/api/guardar", {"tipo": "cuenta", "datos": {"nombre": "La de antes"}})
        copia = os.path.basename(self.app.copia("prueba", forzar=True))
        self.app.manejar("/api/guardar", {"tipo": "cuenta", "datos": {"nombre": "La de después"}})
        self.assertIn(copia, self.app.copias())
        r = self.app.manejar("/api/restaurar", {"copia": copia})
        self.assertTrue(r["ok"], r)
        self.assertEqual([c["nombre"] for c in self.app.alm.todos("cuenta")], ["La de antes"])
        # lo que había justo antes de restaurar no se pierde: queda en otra copia
        antes = [n for n in self.app.copias() if "antes de restaurar" in n]
        self.assertEqual(len(antes), 1)
        self.app.manejar("/api/restaurar", {"copia": antes[0]})
        self.assertEqual([c["nombre"] for c in self.app.alm.todos("cuenta")], ["La de antes", "La de después"])
        with self.assertRaises(ValueError): self.app.manejar("/api/restaurar", {"copia": "..\\datos.db"})
        with self.assertRaises(ValueError): self.app.manejar("/api/restaurar", {"copia": "no-existe.db"})

    def test_si_ya_hay_una_app_abierta_la_segunda_no_toca_los_datos(self):
        srv = servidor.crear(self.app, 8795)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        nueva = os.path.join(self.dir, "no-se-crea")
        try:
            self.assertEqual(arranque.main(["--datos", nueva, "--puerto", "8795", "--sin-navegador"]), 0)
            self.assertFalse(os.path.exists(nueva), "con el puerto ocupado no hay que abrir (ni crear) la carpeta de datos")
            self.assertIs(servidor.Manejador.app, self.app)
        finally:
            srv.shutdown(); srv.server_close()

class TestBorrarEnUso(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.app = servidor.App(self.dir)
        self.cuenta = self.app.manejar("/api/guardar", {"tipo": "cuenta", "datos": {"nombre": "Nómina", "tipo": "corriente"}})["id"]
        for i in range(3):
            self.app.manejar("/api/guardar", {"tipo": "movimiento", "datos": {"fecha": "2026-09-0%d" % (i + 1), "clase": "gasto", "importe": 10,
                                                                              "concepto": "Compra %d" % i, "cuenta": "Nómina", "categoria": "Otros"}})
    def tearDown(self):
        self.app.alm.cerrar(); shutil.rmtree(self.dir, ignore_errors=True)

    def test_borrar_una_cuenta_con_movimientos_pide_confirmar(self):
        r = self.app.manejar("/api/borrar", {"tipo": "cuenta", "id": self.cuenta})
        self.assertFalse(r["ok"])
        self.assertTrue(r["necesita_confirmar"])
        self.assertIn("3 movimientos", r["mensaje"])
        self.assertIn("Nómina", r["mensaje"])
        self.assertEqual(len(self.app.alm.todos("cuenta")), 1)  # no se ha borrado
        self.assertTrue(self.app.manejar("/api/borrar", {"tipo": "cuenta", "id": self.cuenta, "confirmar": True})["ok"])
        self.assertEqual(self.app.alm.todos("cuenta"), [])

    def test_borrar_una_categoria_dice_cuantos_gastos_se_quedan_sin_ella(self):
        cat = next(c for c in self.app.alm.todos("categoria") if c["nombre"] == "Otros")
        r = self.app.manejar("/api/borrar", {"tipo": "categoria", "id": cat["id"]})
        self.assertIn("3 movimientos", r["mensaje"])
        self.assertIn("Sin clasificar", r["mensaje"])

    def test_lo_que_no_usa_nadie_se_borra_sin_preguntar(self):
        id = self.app.manejar("/api/guardar", {"tipo": "cuenta", "datos": {"nombre": "Cuenta vacía"}})["id"]
        self.assertTrue(self.app.manejar("/api/borrar", {"tipo": "cuenta", "id": id})["ok"])

class TestSegundaCopia(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.app = servidor.App(self.dir)
    def tearDown(self):
        self.app.alm.cerrar(); shutil.rmtree(self.dir, ignore_errors=True)

    def test_la_copia_se_guarda_tambien_en_la_segunda_carpeta(self):
        extra = os.path.join(self.dir, "USB")
        r = self.app.manejar("/api/copia_extra", {"carpeta": extra})
        self.assertTrue(r["ok"], r)
        self.assertTrue([n for n in os.listdir(extra) if n.endswith(".db")])
        self.assertIsNone(self.app.alm.config("copia_extra_error"))
        self.app.manejar("/api/copia", {})
        self.assertGreaterEqual(len([n for n in os.listdir(extra) if n.endswith(".db")]), 1)

    def test_si_el_sitio_no_esta_la_app_sigue_y_lo_cuenta(self):
        archivo = os.path.join(self.dir, "no-soy-carpeta.txt")
        with open(archivo, "w", encoding="utf-8") as fh: fh.write("x")
        r = self.app.manejar("/api/copia_extra", {"carpeta": os.path.join(archivo, "copias")})
        self.assertFalse(r["ok"])
        fallo = self.app.alm.config("copia_extra_error")
        self.assertTrue(fallo and fallo["motivo"])
        p = self.app.copia("manual", forzar=True)  # la copia de siempre se sigue haciendo
        self.assertTrue(os.path.exists(p))

    def test_se_puede_quitar(self):
        self.app.manejar("/api/copia_extra", {"carpeta": os.path.join(self.dir, "USB")})
        self.assertTrue(self.app.manejar("/api/copia_extra", {"carpeta": ""})["ok"])
        self.assertIsNone(self.app.alm.config("copia_extra"))

    def test_no_vale_la_carpeta_de_copias_de_siempre(self):
        with self.assertRaises(ValueError):
            self.app.manejar("/api/copia_extra", {"carpeta": self.app.carpeta.copias})

class TestColumnasDeUnBancoNuevo(unittest.TestCase):
    """Un extracto de un banco que la app no conoce: tiene que proponer sola qué columna es cada cosa."""
    def columnas(self, cabecera, ejemplos):
        return L.columnas_probables(cabecera, ejemplos)

    def test_nombres_habituales(self):
        self.assertEqual(self.columnas(["Fecha", "Concepto", "Importe", "Saldo"], [["01/09/2026", "RECIBO LUZ", "-48,20", "1.200,00"]]),
                         {"fecha": "Fecha", "concepto": "Concepto", "importe": "Importe", "saldo": "Saldo"})

    def test_fecha_valor_no_se_confunde_con_la_de_operacion(self):
        c = self.columnas(["F.Valor", "Fecha", "Concepto", "Movimiento", "Importe", "Divisa"],
                          [["01/09/2026", "02/09/2026", "Compra Lidl", "Pago con tarjeta", "-12,30", "EUR"]])
        self.assertEqual((c["fecha"], c["fecha_valor"], c["concepto"]), ("Fecha", "F.Valor", "Concepto"))

    def test_debe_y_haber(self):
        c = self.columnas(["FECHA VALOR", "DESCRIPCIÓN", "DEBE", "HABER", "SALDO"],
                          [["02/09/2026", "BIZUM DE ANA", "", "15,00", "1.215,00"], ["03/09/2026", "COMPRA", "20,00", "", "1.195,00"]])
        self.assertEqual((c["cargo"], c["abono"]), ("DEBE", "HABER"))
        self.assertNotIn("importe", c)

    def test_en_ingles(self):
        c = self.columnas(["Type", "Started Date", "Description", "Amount", "Balance"],
                          [["CARD_PAYMENT", "2026-09-03", "Mercadona", "-56.79", "1143.21"]])
        self.assertEqual((c["fecha"], c["concepto"], c["importe"]), ("Started Date", "Description", "Amount"))

    def test_sin_nombres_utiles_se_mira_el_contenido(self):
        c = self.columnas(["Col1", "Col2", "Col3"], [["03/09/2026", "Mercadona", "-56,79"]])
        self.assertEqual((c["fecha"], c["concepto"], c["importe"]), ("Col1", "Col2", "Col3"))

    def test_si_no_hay_nada_reconocible_no_se_inventa(self):
        self.assertEqual(self.columnas(["a", "b"], [["x", "y"]]), {})
        self.assertEqual(self.columnas([], []), {})

    def test_un_archivo_desconocido_llega_a_la_pantalla_con_la_propuesta(self):
        d = tempfile.mkdtemp()
        try:
            app = servidor.App(d)
            app.manejar("/api/guardar", {"tipo": "cuenta", "datos": {"nombre": "Cuenta nueva", "tipo": "corriente", "extracto": True}})
            ruta = os.path.join(app.carpeta.banco, "banco-raro.csv")
            with open(ruta, "w", encoding="utf-8") as fh:
                fh.write("Fecha de operacion;Descripcion;Importe (EUR);Saldo (EUR)\n01/09/2026;COMPRA MERCADONA;-56,79;1.000,00\n02/09/2026;NOMINA;1500,00;2.500,00\n")
            r = app._importar(ruta, "banco")
            self.assertEqual(r["necesita"], "perfil")
            self.assertEqual(r["propuesta"], {"fecha": "Fecha de operacion", "concepto": "Descripcion", "importe": "Importe (EUR)", "saldo": "Saldo (EUR)"})
            # y con esas columnas se importa de verdad
            r2 = app.manejar("/api/importar/reintentar", {"archivo": "banco-raro.csv", "tipo": "banco", "columnas": r["propuesta"],
                                                          "perfil": "Banco raro", "cuenta": "Cuenta nueva"})
            self.assertTrue(r2["ok"], r2)
            self.assertEqual(len(app.alm.todos("movimiento")), 2)
            app.alm.cerrar()
        finally: shutil.rmtree(d, ignore_errors=True)

class TestRutasDeArchivos(unittest.TestCase):
    def test_dentro_de(self):
        base = rutas.WEB
        self.assertTrue(servidor._dentro_de(base, "icono.svg"))
        self.assertTrue(servidor._dentro_de(base, "paneles/datos.js"))
        for fuera in ("../servidor.py", "..\\servidor.py", "C:/Windows/win.ini", "/etc/passwd", "\\\\servidor\\share\\x"):
            self.assertIsNone(servidor._dentro_de(base, fuera), fuera)

    def test_motivo_en_cristiano(self):
        self.assertEqual(rutas.motivo(FileNotFoundError(2, "No such file")), "esa ruta no existe")
        self.assertEqual(rutas.motivo(PermissionError(13, "Denegado")), "Windows no te deja escribir ahí")
        self.assertTrue(rutas.motivo(ValueError("vaya")))

if __name__ == "__main__":
    unittest.main()

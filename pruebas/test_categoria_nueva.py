# Aconsejar una categoría nueva cuando ninguna encaja (clasificar.proponer_categoria_nueva) y la ruta
# que la crea al resolver un pendiente. Datos inventados. Uso: python -m unittest pruebas.test_categoria_nueva -v
import os, shutil, sys, tempfile, unittest
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from financebuddy import clasificar as C, plantilla, servidor


def cats(*nombres, ocultas=()):
    return [{"nombre": n, "grupo": "variable", **({"oculta": True} if n in ocultas else {})} for n in nombres]

class TestHeuristica(unittest.TestCase):
    def test_aconseja_lo_que_falta(self):
        r = C.proponer_categoria_nueva("Compra Veterinaria San Roque, Madrid", -45.0, cats("Comer fuera", "Ocio"))
        self.assertEqual((r["accion"], r["nombre"], r["icono"], r["grupo"], r["clase"]), ("crear", "Mascotas", "🐾", "variable", "gasto"))
        self.assertIn("mascotas", r["motivo"]); self.assertIn("veterinari", r["motivo"])
        self.assertEqual(C.proponer_categoria_nueva("DONATIVO Cruz Roja Espanola", -10, cats("Ocio"))["nombre"], "Donaciones")
        self.assertEqual(C.proponer_categoria_nueva("Polideportivo Municipal", -30, cats("Ocio"))["nombre"], "Deporte")

    def test_sin_palabras_o_sin_gasto_no_aconseja(self):
        self.assertIsNone(C.proponer_categoria_nueva("Compra Cosas Raras SL", -9, cats("Ocio")))
        self.assertIsNone(C.proponer_categoria_nueva("Veterinaria San Roque", 20, cats("Ocio")))  # entra dinero: solo gastos

    def test_si_ya_la_tienes_no_se_duplica(self):
        self.assertIsNone(C.proponer_categoria_nueva("Veterinaria San Roque", -45, cats("Mascotas")))
        self.assertIsNone(C.proponer_categoria_nueva("Veterinaria San Roque", -45, cats("mascotas")))  # sin importar mayúsculas
        self.assertIsNone(C.proponer_categoria_nueva("Matrícula universidad", -300, cats("Educación")))  # un alias propio
        self.assertIsNone(C.proponer_categoria_nueva("Zapatería Lopez", -50, cats("Compras")))  # Compras ya cubre la ropa
        self.assertIsNotNone(C.proponer_categoria_nueva("Zapatería Lopez", -50, cats("Ocio")))

    def test_si_esta_oculta_se_aconseja_mostrarla(self):
        r = C.proponer_categoria_nueva("Veterinaria San Roque", -45, cats("Mascotas", ocultas=("Mascotas",)))
        self.assertEqual((r["accion"], r["nombre"]), ("mostrar", "Mascotas"))
        r = C.proponer_categoria_nueva("Curso de inglés academia", -80, cats("Estudios", ocultas=("Estudios",)))
        self.assertEqual((r["accion"], r["nombre"]), ("mostrar", "Estudios"))

    def test_si_la_fusionaste_en_otra_no_vuelve(self):
        self.assertIsNone(C.proponer_categoria_nueva("Veterinaria San Roque", -45, cats("Ocio"), {"Mascotas": "Otros"}))

    def test_el_catalogo_es_coherente_con_la_plantilla(self):
        de_serie = {n for n, _ in plantilla.CATEGORIAS}
        for e in plantilla.CATALOGO:
            self.assertIn(e["grupo"], ("variable", "fijo")); self.assertLessEqual(len(e["icono"]), 8); self.assertTrue(e["palabras"])
            for p in e["palabras"]: self.assertEqual(p, C.norm(p))  # sin tildes ni mayúsculas
        # Los nombres que coinciden con los de serie no inventan otros: se reutilizan tal cual
        self.assertTrue({"Mascotas", "Regalos", "Formación", "Viajes", "Salud", "Hogar"} <= de_serie & {e["nombre"] for e in plantilla.CATALOGO})
        # Con las categorías de serie, ninguna regla de serie de otra categoría se «roba» con las palabras del catálogo
        # (los comercios con regla nunca llegan a «Por revisar»; el catálogo solo habla de lo que no tiene regla ni categoría)
        todas = [{"nombre": n, "grupo": g} for n, g in plantilla.CATEGORIAS]
        for patron, cat, _ in plantilla.REGLAS:
            if cat in ("Nómina",): continue
            r = C.proponer_categoria_nueva(patron, -10, todas)
            self.assertTrue(r is None or r["nombre"] not in {c["nombre"] for c in todas}, (patron, r))

class TestRuta(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.app = servidor.App(self.dir, hoy="2026-09-30")
        self.app.manejar("/api/bienvenida", {"cuentas": [{"nombre": "Nómina", "tipo": "corriente", "saldo": 1000}]})
        self.alm = self.app.alm
    def tearDown(self):
        self.alm.cerrar(); shutil.rmtree(self.dir, ignore_errors=True)
    def pendiente(self, texto, imp=-20.0, fecha="2026-09-20"):
        return self.alm.guardar("pendiente", {"tipo_import": "banco", "cuenta": "Nómina", "archivo": "x.xlsx", "perfil": "Santander", "duda": "?",
                                              "fila": {"op": fecha, "texto": texto, "importe": imp, "clase": "gasto", "cat": "Otros", "concepto": "X", "duda": "?"}})
    def pend(self, pid): return next(p for p in self.app.datos()["pendientes"] if p["id"] == pid)
    def borrar_categoria(self, nombre):
        for c in self.alm.todos("categoria"):
            if c["nombre"] == nombre: self.alm.borrar("categoria", c["id"])

    def test_sugerir_categoria_regla_historial_y_sin_coincidencia(self):
        for texto in ("Taller Inventado Norte", "Taller Inventado Norte", "Otro Comercio"):
            self.alm.guardar("movimiento", {"fecha": "2026-09-01", "clase": "gasto", "categoria": "Ocio", "importe": 12, "concepto": texto})
        consulta = {"texto": "Taller Inventado Norte", "clase": "gasto"}
        self.assertEqual(self.app.manejar("/api/categoria/sugerir", consulta),
                         {"ok": True, "categoria": "Ocio", "motivo": "historial", "veces": 2})
        self.alm.guardar("regla", {"patron": "taller inventado", "clase": "gasto", "categoria": "Coche"})
        self.app.deshacer = self.alm.instantanea()
        foto = self.app.deshacer
        self.assertEqual(self.app.manejar("/api/categoria/sugerir", consulta),
                         {"ok": True, "categoria": "Coche", "motivo": "regla", "veces": 0})
        self.assertIs(self.app.deshacer, foto)
        self.assertEqual(self.app.manejar("/api/categoria/sugerir", {"texto": "Zyxw desconocido"}),
                         {"ok": True, "categoria": None, "motivo": None, "veces": 0})
        self.assertEqual(self.app.manejar("/api/categoria/sugerir", {"texto": ""}),
                         {"ok": True, "categoria": None, "motivo": None, "veces": 0})

    def test_el_consejo_llega_a_la_pagina_y_no_crea_nada(self):
        pid = self.pendiente("Compra Donativo Cruz Roja Madrid ES")
        n = self.pend(pid)["categoria_nueva"]
        self.assertEqual((n["accion"], n["nombre"]), ("crear", "Donaciones"))
        self.assertFalse(self.alm.buscar("categoria", nombre="Donaciones"))  # solo aconseja

    def test_un_comercio_de_serie_con_categoria_clara_no_lleva_consejo(self):
        self.mov = self.alm.guardar("movimiento", {"fecha": "2026-08-01", "clase": "gasto", "categoria": "Ocio", "importe": 12, "concepto": "Club", "cuenta": "Nómina",
                                                   "ext_texto": "Compra Polideportivo Norte, Madrid"})
        pid = self.pendiente("Compra Polideportivo Norte, Madrid")
        self.assertEqual(self.pend(pid)["sugerencia"]["categoria"], "Ocio")
        self.assertNotIn("categoria_nueva", self.pend(pid))  # el historial ya sabe qué es

    def test_crear_la_categoria_resuelve_y_recuerda(self):
        a = self.pendiente("Compra Donativo Cruz Roja Madrid ES", fecha="2026-09-20")
        b = self.pendiente("Compra Donativo Cruz Roja Madrid ES", fecha="2026-09-21")
        r = self.app.manejar("/api/resolver", {"id": a, "accion": "guardar", "clase": "gasto", "categoria": "Donaciones", "concepto": "Cruz Roja",
                                                "categoria_nueva": {"nombre": "Donaciones", "icono": "🤝", "grupo": "variable"}, "proxima": "siempre", "patron": "donativo cruz roja"})
        self.assertTrue(r["ok"], r)
        c = self.alm.buscar("categoria", nombre="Donaciones")[0]
        self.assertEqual((c["grupo"], c["icono"]), ("variable", "🤝"))
        movs = [m for m in self.alm.todos("movimiento") if m["categoria"] == "Donaciones"]
        self.assertEqual(len(movs), 2)  # este y el otro igual (recordar)
        self.assertEqual(self.alm.contar("pendiente"), 0)
        reglas = [x for x in self.alm.todos("regla") if x["patron"] == "donativo cruz roja"]
        self.assertEqual((len(reglas), reglas[0]["categoria"], reglas[0]["origen"]), (1, "Donaciones", "usuario"))
        # Y no se vuelve a aconsejar
        self.assertNotIn("categoria_nueva", self.pend(self.pendiente("Donativo Cruz Roja otro")))

    def test_se_puede_cambiar_nombre_emoji_y_grupo(self):
        pid = self.pendiente("Veterinaria San Roque")
        self.app.manejar("/api/resolver", {"id": pid, "accion": "guardar", "clase": "gasto", "categoria": "Peludos",
                                           "categoria_nueva": {"nombre": " Peludos  ", "icono": "🐶", "grupo": "fijo"}})
        c = self.alm.buscar("categoria", nombre="Peludos")[0]
        self.assertEqual((c["grupo"], c["icono"]), ("fijo", "🐶"))
        self.assertEqual([m["categoria"] for m in self.alm.todos("movimiento")], ["Peludos"])

    def test_sin_pulsar_nada_no_se_crea_y_un_nombre_vacio_falla(self):
        pid = self.pendiente("Veterinaria San Roque")
        antes = len(self.alm.todos("categoria"))
        with self.assertRaises(ValueError):
            self.app.manejar("/api/resolver", {"id": pid, "accion": "guardar", "clase": "gasto", "categoria": "", "categoria_nueva": {"nombre": "  "}})
        self.assertEqual(len(self.alm.todos("categoria")), antes); self.assertEqual(self.alm.contar("pendiente"), 1)

    def test_si_existia_no_se_duplica_y_si_estaba_oculta_se_muestra(self):
        c = self.alm.buscar("categoria", nombre="Mascotas")[0]
        self.alm.guardar("categoria", {**c, "oculta": True}, c["id"])
        pid = self.pendiente("Veterinaria San Roque")
        n = self.pend(pid)["categoria_nueva"]
        self.assertEqual((n["accion"], n["nombre"]), ("mostrar", "Mascotas"))
        self.app.manejar("/api/resolver", {"id": pid, "accion": "guardar", "clase": "gasto", "categoria": "mascotas", "categoria_nueva": {"nombre": "mascotas", "mostrar": True}})
        todas = self.alm.buscar("categoria", nombre="Mascotas")
        self.assertEqual(len(todas), 1); self.assertFalse(todas[0].get("oculta"))
        self.assertEqual([m["categoria"] for m in self.alm.todos("movimiento")], ["Mascotas"])

    def test_la_plantilla_no_la_pisa_ni_la_recrea(self):
        pid = self.pendiente("Donativo Cruz Roja")
        self.app.manejar("/api/resolver", {"id": pid, "accion": "guardar", "clase": "gasto", "categoria": "Donaciones",
                                           "categoria_nueva": {"nombre": "Donaciones", "icono": "🤝", "grupo": "fijo"}})
        # Una versión futura de la plantilla que traiga una categoría con ese nombre no la duplica ni cambia lo del usuario
        antes = plantilla.CATEGORIAS[:]
        try:
            plantilla.CATEGORIAS.append(("Donaciones", "variable"))
            self.alm.set_config("plantilla_version", plantilla.VERSION - 1)
            plantilla.instalar(self.alm)
        finally:
            plantilla.CATEGORIAS[:] = antes
        cs = self.alm.buscar("categoria", nombre="Donaciones")
        self.assertEqual((len(cs), cs[0]["grupo"], cs[0]["icono"]), (1, "fijo", "🤝"))
        # Y si la borras, plantilla.instalar no la recrea (no es de serie)
        self.alm.borrar("categoria", cs[0]["id"])
        self.alm.set_config("plantilla_version", plantilla.VERSION - 1)
        plantilla.instalar(self.alm)
        self.assertFalse(self.alm.buscar("categoria", nombre="Donaciones"))

    def test_fusionada_no_se_aconseja(self):
        self.borrar_categoria("Mascotas")
        self.alm.set_config("categorias_fusionadas", {"Mascotas": "Otros"})
        self.assertNotIn("categoria_nueva", self.pend(self.pendiente("Veterinaria San Roque")))

if __name__ == "__main__":
    unittest.main()

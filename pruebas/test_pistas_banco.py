import unittest
from financebuddy import clasificar as C


class PistasBanco(unittest.TestCase):
    def detalle(self, texto):
        categorias = [{"nombre": n, "grupo": "variable"} for n in ("Comer fuera", "Supermercado", "Ocio", "Otros")]
        return C.detalle_revision({"texto": texto, "importe": -12, "clase": "gasto"}, [], categorias)

    def test_tecnicismos_no_son_comercio(self):
        for texto in ("PAGO MOVIL EN NIKE ES TARJ. 1234 COMISION 0,00", "PAGO MOVIL EN NIKE ES, COMISION 0,00", "LENTIAMO.ES FECHA VALOR 06/11/2026 COMISION 0,00", "Compra con tarjeta en ZALA NDO PAY, COMISION 0,00"):
            with self.subTest(texto=texto):
                self.assertNotIn("palabra", self.detalle(texto))

    def test_palabras_completas(self):
        for texto in ("comision", "comisión", "comisaria", "cinerama", "gastronomia", "partidora", "viajero"):
            with self.subTest(texto=texto):
                self.assertIsNone(C.cat_por_palabras(texto))

    def test_bizum_cena_conserva_pista_debil(self):
        d = self.detalle("Bizum a Elena Inventada concepto cena")
        self.assertEqual(d["palabra"], {"palabra": "cena", "categoria": "Comer fuera"})
        self.assertEqual(C.cat_por_palabras("cena"), "Comer fuera")
        self.assertFalse(C.sugerir("Bizum a Elena Inventada concepto cena", -12, {}, "Comer fuera")["segura"])

    def test_plurales_y_derivadas_conservan_categoria(self):
        casos = {"cumpleaños": "Regalos", "cervezas": "Comer fuera", "cenas": "Comer fuera",
                 "desayunos": "Comer fuera", "regalos": "Regalos", "compras": "Supermercado",
                 "supermercado": "Supermercado", "entradas": "Ocio", "billetes": "Viajes",
                 "vuelos": "Viajes", "hotel": "Viajes", "hoteles": "Viajes"}
        for texto, categoria in casos.items():
            with self.subTest(texto=texto):
                self.assertEqual(C.cat_por_palabras(texto), categoria)

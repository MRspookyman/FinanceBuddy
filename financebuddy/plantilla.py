# Lo que trae una instalación nueva: categorías, reglas de comercios habituales en España y los formatos
# de archivo que se reconocen de serie (Santander y MyInvestor). El usuario puede cambiarlo todo desde la app.

CATEGORIAS = [
    ("Vivienda", "fijo"), ("Suministros", "fijo"), ("Seguros", "fijo"), ("Suscripciones", "fijo"),
    ("Supermercado", "variable"), ("Comer fuera", "variable"), ("Ocio", "variable"), ("Transporte", "variable"),
    ("Coche", "variable"), ("Salud", "variable"), ("Compras", "variable"), ("Hogar", "variable"), ("Viajes", "variable"),
    ("Formación", "variable"), ("Regalos", "variable"), ("Cuidado personal", "variable"), ("Mascotas", "variable"),
    ("Efectivo", "variable"), ("Comisiones", "variable"), ("Apuestas", "variable"), ("Otros", "variable"),
    ("Nómina", "ingreso"), ("Intereses", "ingreso"), ("Otros ingresos", "ingreso"),
]

# (patrón, categoría, clase). Gana la primera que case: las más concretas primero («amazon prime» antes que «amazon»).
REGLAS = [
    ("nomina", "Nómina", "ingreso"),
    ("repsol luz", "Suministros", "gasto"), ("iberdrola", "Suministros", "gasto"), ("endesa", "Suministros", "gasto"),
    ("naturgy", "Suministros", "gasto"), ("totalenergies", "Suministros", "gasto"), ("holaluz", "Suministros", "gasto"),
    ("canal de isabel", "Suministros", "gasto"), ("aguas de", "Suministros", "gasto"), ("movistar", "Suministros", "gasto"),
    ("vodafone", "Suministros", "gasto"), ("orange", "Suministros", "gasto"), ("digi spain", "Suministros", "gasto"),
    ("pepephone", "Suministros", "gasto"), ("simyo", "Suministros", "gasto"), ("lowi", "Suministros", "gasto"),
    ("o2", "Suministros", "gasto"), ("jazztel", "Suministros", "gasto"), ("masmovil", "Suministros", "gasto"),
    ("mapfre", "Seguros", "gasto"), ("mutua madrile", "Seguros", "gasto"), ("linea directa", "Seguros", "gasto"),
    ("allianz", "Seguros", "gasto"), ("axa", "Seguros", "gasto"), ("sanitas", "Seguros", "gasto"),
    ("adeslas", "Seguros", "gasto"), ("generali", "Seguros", "gasto"), ("reale seguros", "Seguros", "gasto"),
    ("amazon prime", "Suscripciones", "gasto"), ("netflix", "Suscripciones", "gasto"), ("spotify", "Suscripciones", "gasto"),
    ("disney", "Suscripciones", "gasto"), ("hbo", "Suscripciones", "gasto"), ("max.com", "Suscripciones", "gasto"),
    ("dazn", "Suscripciones", "gasto"), ("apple.com/bill", "Suscripciones", "gasto"), ("google one", "Suscripciones", "gasto"),
    ("youtube", "Suscripciones", "gasto"), ("openai", "Suscripciones", "gasto"), ("anthropic", "Suscripciones", "gasto"),
    ("basic-fit", "Suscripciones", "gasto"), ("gimnasio", "Suscripciones", "gasto"), ("playstation", "Suscripciones", "gasto"),
    ("mercadona", "Supermercado", "gasto"), ("lidl", "Supermercado", "gasto"), ("carrefour", "Supermercado", "gasto"),
    ("aldi", "Supermercado", "gasto"), ("alcampo", "Supermercado", "gasto"), ("eroski", "Supermercado", "gasto"),
    ("consum", "Supermercado", "gasto"), ("ahorramas", "Supermercado", "gasto"), ("supermercados dia", "Supermercado", "gasto"),
    ("en dia", "Supermercado", "gasto"), ("compra dia", "Supermercado", "gasto"),
    ("hipercor", "Supermercado", "gasto"), ("bonpreu", "Supermercado", "gasto"),
    ("gadis", "Supermercado", "gasto"), ("froiz", "Supermercado", "gasto"), ("masymas", "Supermercado", "gasto"),
    ("covirán", "Supermercado", "gasto"), ("coviran", "Supermercado", "gasto"), ("spar", "Supermercado", "gasto"),
    ("glovo", "Comer fuera", "gasto"), ("just eat", "Comer fuera", "gasto"), ("uber eats", "Comer fuera", "gasto"),
    ("mcdonald", "Comer fuera", "gasto"), ("burger king", "Comer fuera", "gasto"), ("telepizza", "Comer fuera", "gasto"),
    ("domino", "Comer fuera", "gasto"), ("starbucks", "Comer fuera", "gasto"), ("100 montaditos", "Comer fuera", "gasto"),
    ("restaurante", "Comer fuera", "gasto"), ("cafeteria", "Comer fuera", "gasto"), ("meson", "Comer fuera", "gasto"),
    ("bar", "Comer fuera", "gasto"), ("taberna", "Comer fuera", "gasto"), ("cerveceria", "Comer fuera", "gasto"),
    ("pizzeria", "Comer fuera", "gasto"),
    ("cinesa", "Ocio", "gasto"), ("yelmo", "Ocio", "gasto"), ("kinepolis", "Ocio", "gasto"), ("ticketmaster", "Ocio", "gasto"),
    ("padel", "Ocio", "gasto"), ("bowling", "Ocio", "gasto"), ("steam", "Ocio", "gasto"),
    ("repsol", "Coche", "gasto"), ("cepsa", "Coche", "gasto"), ("moeve", "Coche", "gasto"), ("galp", "Coche", "gasto"),
    ("bp", "Coche", "gasto"), ("shell", "Coche", "gasto"), ("plenoil", "Coche", "gasto"), ("ballenoil", "Coche", "gasto"),
    ("petroprix", "Coche", "gasto"), ("plenergy", "Coche", "gasto"), ("gasolinera", "Coche", "gasto"), ("parking", "Coche", "gasto"),
    ("telpark", "Coche", "gasto"), ("peaje", "Coche", "gasto"), ("itv", "Coche", "gasto"), ("autopista", "Coche", "gasto"),
    ("renfe", "Transporte", "gasto"), ("emt", "Transporte", "gasto"), ("metro de", "Transporte", "gasto"),
    ("crtm", "Transporte", "gasto"), ("cabify", "Transporte", "gasto"), ("uber", "Transporte", "gasto"),
    ("bolt", "Transporte", "gasto"), ("blablacar", "Transporte", "gasto"), ("taxi", "Transporte", "gasto"),
    ("alsa", "Transporte", "gasto"),
    ("farmacia", "Salud", "gasto"), ("dental", "Salud", "gasto"), ("dentist", "Salud", "gasto"), ("clinica", "Salud", "gasto"),
    ("fisio", "Salud", "gasto"), ("optica", "Salud", "gasto"),
    ("amazon", "Compras", "gasto"), ("amzn", "Compras", "gasto"), ("aliexpress", "Compras", "gasto"), ("temu", "Compras", "gasto"),
    ("shein", "Compras", "gasto"), ("zara", "Compras", "gasto"), ("primark", "Compras", "gasto"), ("pull and bear", "Compras", "gasto"),
    ("zalando", "Compras", "gasto"), ("decathlon", "Compras", "gasto"), ("mediamarkt", "Compras", "gasto"),
    ("el corte ingles", "Compras", "gasto"), ("pccomponentes", "Compras", "gasto"), ("fnac", "Compras", "gasto"), ("en game", "Compras", "gasto"),
    ("wallapop", "Compras", "gasto"), ("vinted", "Compras", "gasto"),
    ("ikea", "Hogar", "gasto"), ("leroy merlin", "Hogar", "gasto"), ("bricomart", "Hogar", "gasto"), ("jysk", "Hogar", "gasto"),
    ("ryanair", "Viajes", "gasto"), ("vueling", "Viajes", "gasto"), ("iberia", "Viajes", "gasto"), ("booking", "Viajes", "gasto"),
    ("airbnb", "Viajes", "gasto"), ("iryo", "Viajes", "gasto"), ("ouigo", "Viajes", "gasto"), ("hotel", "Viajes", "gasto"),
    ("udemy", "Formación", "gasto"), ("coursera", "Formación", "gasto"), ("casa del libro", "Formación", "gasto"),
    ("peluqueria", "Cuidado personal", "gasto"), ("barber", "Cuidado personal", "gasto"),
    ("veterinari", "Mascotas", "gasto"), ("tiendanimal", "Mascotas", "gasto"), ("kiwoko", "Mascotas", "gasto"),
    ("cajero", "Efectivo", "gasto"), ("retirada efectivo", "Efectivo", "gasto"),
    ("comision", "Comisiones", "gasto"), ("liquidacion del contrato", "Comisiones", "gasto"),
] + [  # v2: lo que faltaba en extractos reales
    ("bet365", "Apuestas", "gasto"), ("pokerstars", "Apuestas", "gasto"), ("codere", "Apuestas", "gasto"), ("sportium", "Apuestas", "gasto"),
    ("bwin", "Apuestas", "gasto"), ("luckia", "Apuestas", "gasto"), ("william hill", "Apuestas", "gasto"), ("betfair", "Apuestas", "gasto"),
    ("loterias y apuestas", "Apuestas", "gasto"), ("casino", "Apuestas", "gasto"),
    ("burguer", "Comer fuera", "gasto"), ("burger", "Comer fuera", "gasto"), ("brewing", "Comer fuera", "gasto"), ("fast fo", "Comer fuera", "gasto"),
    ("kebab", "Comer fuera", "gasto"), ("sushi", "Comer fuera", "gasto"), ("asador", "Comer fuera", "gasto"), ("taperia", "Comer fuera", "gasto"),
    ("tapas", "Comer fuera", "gasto"), ("bodega", "Comer fuera", "gasto"), ("heladeria", "Comer fuera", "gasto"), ("churreria", "Comer fuera", "gasto"),
    ("chiringuito", "Comer fuera", "gasto"), ("restaurant", "Comer fuera", "gasto"), ("gastrobar", "Comer fuera", "gasto"), ("pub", "Comer fuera", "gasto"),
    ("cocteleria", "Comer fuera", "gasto"), ("vinoteca", "Comer fuera", "gasto"), ("tasca", "Comer fuera", "gasto"), ("pasteleria", "Comer fuera", "gasto"),
    ("five guys", "Comer fuera", "gasto"), ("kfc", "Comer fuera", "gasto"), ("goiko", "Comer fuera", "gasto"), ("foster", "Comer fuera", "gasto"),
    ("minimarket", "Supermercado", "gasto"), ("supermercado", "Supermercado", "gasto"), ("verduleria", "Supermercado", "gasto"),
    ("fruteria", "Supermercado", "gasto"), ("carniceria", "Supermercado", "gasto"), ("panaderia", "Supermercado", "gasto"),
    ("pescaderia", "Supermercado", "gasto"), ("alimentacion", "Supermercado", "gasto"), ("ultramarinos", "Supermercado", "gasto"),
    ("e s", "Coche", "gasto"), ("e.s.", "Coche", "gasto"), ("estacion de servicio", "Coche", "gasto"), ("area de servicio", "Coche", "gasto"),
    ("cloudflare", "Suscripciones", "gasto"), ("github", "Suscripciones", "gasto"), ("icloud", "Suscripciones", "gasto"), ("crunchyroll", "Suscripciones", "gasto"),
    ("g2a", "Ocio", "gasto"), ("instant gaming", "Ocio", "gasto"), ("eneba", "Ocio", "gasto"), ("nintendo", "Ocio", "gasto"), ("comics", "Ocio", "gasto"),
    ("pull and", "Compras", "gasto"), ("bershka", "Compras", "gasto"), ("stradivarius", "Compras", "gasto"), ("mango", "Compras", "gasto"),
    ("lefties", "Compras", "gasto"), ("sprinter", "Compras", "gasto"), ("druni", "Cuidado personal", "gasto"), ("primor", "Cuidado personal", "gasto"),
]
VERSION = 2  # sube al cambiar CATEGORIAS o REGLAS: las instalaciones existentes reciben lo nuevo (sin tocar lo del usuario)

# Formatos de archivo reconocidos de serie. columnas: {campo: texto de la cabecera (sin tildes, en minúsculas)}.
#   banco: fecha, fecha_valor?, concepto, importe | cargo+abono, saldo?
#   inversión: fecha, concepto, importe (compras en negativo si compras_negativas)
PERFILES = [
    {"nombre": "Santander", "tipo": "banco",
     "columnas": {"fecha": "fecha operacion", "fecha_valor": "fecha valor", "concepto": "concepto", "importe": "importe", "saldo": "saldo"}},
    {"nombre": "MyInvestor (cuenta de efectivo)", "tipo": "inversion", "compras_negativas": True,
     "columnas": {"fecha": "fecha de operacion", "concepto": "concepto", "importe": "importe"},
     "acciones": [{"patron": "periodo", "accion": "interes"}]},
]

def instalar(alm):
    """Carga la plantilla en una base de datos nueva (solo lo que falte) y, en una ya en uso, lo nuevo de cada versión."""
    with alm.transaccion():
        v = alm.config("plantilla_version") or 1
        if v < VERSION and alm.contar("categoria"):
            tengo = {c["nombre"].lower() for c in alm.todos("categoria")}
            for n, g in CATEGORIAS:
                if n.lower() not in tengo: alm.guardar("categoria", {"nombre": n, "grupo": g})
            patrones = {r["patron"] for r in alm.todos("regla")}
            for p, c, cl in REGLAS:
                if p not in patrones: alm.guardar("regla", {"patron": p, "categoria": c, "clase": cl, "origen": "plantilla"})
        if v < VERSION: alm.set_config("plantilla_version", VERSION)
        if not alm.contar("categoria"):
            for n, g in CATEGORIAS: alm.guardar("categoria", {"nombre": n, "grupo": g})
        if not alm.contar("regla"):
            for p, c, cl in REGLAS: alm.guardar("regla", {"patron": p, "categoria": c, "clase": cl, "origen": "plantilla"})
        if not alm.contar("perfil"):
            for p in PERFILES: alm.guardar("perfil", p)
        if alm.config("limite_variable") is None: alm.set_config("limite_variable", 0)

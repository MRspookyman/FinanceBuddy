# Servidor local de la app: sirve las pantallas (web/) y una API JSON sobre la base de datos.
# Solo escucha en 127.0.0.1 y cada arranque genera una clave que la página envía en la cabecera X-FB-Token.
import base64, calendar, datetime, http.server, io, json, mimetypes, os, re, secrets, socketserver, tempfile, threading, traceback, urllib.parse
from . import VERSION, actualizaciones, autoarranque, bizums, cartera, clasificar as C, detectar, exportar, importar as IM, modelo, ordenar, plantilla, precios, rutas, secreto
from .almacen import Almacen, comprobar_copia

mimetypes.add_type("font/woff2", ".woff2")
MODULOS = ["datos", "calculos", "calculos_saldos", "calculos_avisos", "componentes", "graficos", "inicio", "inversion", "renta", "anual", "independencia", "precios", "exportar", "formularios",
           "bienvenida", "importar", "revisar", "fijos", "cierre", "ajustes", "gestionar", "cuentas", "repaso", "pantallas"]  # el orden es el de la concatenación: no lo cambies
MAX_SUBIDA = 25 * 1024 * 1024
ACENTOS = ["violeta", "salvia", "azul", "verde", "coral", "rosa", "grafito"]  # colores de acento (estilos.css: body[data-acento])

def leer(p):
    with io.open(p, "rb") as fh: return fh.read()

def _dentro_de(base, rel):
    """Ruta de `rel` dentro de `base`, o None si se sale de ahí (`..`, una ruta absoluta o una unidad: `C:\\…`).
    La página solo puede pedir archivos de la carpeta web; cualquier otra cosa no existe para ella."""
    if os.path.isabs(rel) or os.path.splitdrive(rel)[0] or rel.startswith(("\\", "/")): return None
    base = os.path.realpath(base)
    p = os.path.realpath(os.path.join(base, rel))
    return p if p == base or p.startswith(base + os.sep) else None

# Lo que se pierde al borrar algo que se está usando (se enseña antes de borrar, con el recuento real)
PLURAL = {"movimiento": "movimientos", "recurrente": "fijos", "aportacion": "operaciones de inversión", "cobro": "dividendos y comisiones",
          "regla": "reglas", "objetivo": "objetivos", "perfil": "formatos de archivo", "activo": "activos", "patrimonio": "registros de saldos",
          "cuenta": "cuentas", "categoria": "categorías", "pendiente": "cosas por revisar", "operacion": "órdenes", "cierre": "cierres de mes"}
CONSECUENCIA = {
    "cuenta": "Sus movimientos se quedarían sin cuenta y su saldo dejaría de salir en «Actualizar saldos» (el patrimonio que anotaste no cambia).",
    "categoria": "Esos movimientos se quedarían sin categoría: contarían como «Sin clasificar». Si lo que quieres es juntarla con otra, en Ajustes → Categorías puedes fusionarla u ocultarla.",
    "recurrente": "Sus movimientos dejarían de contar como gasto fijo y no se tendrían en cuenta en la previsión.",
    "activo": "Sus operaciones se quedarían sin activo y dejarían de contar en tu inversión.",
}

MAX_FILTROS_MOV = 20  # filtros guardados de Movimientos (config.filtros_movimientos)

def filtros_movimientos_validos(lista):
    """La lista de filtros guardados de Movimientos, limpia: cada uno con nombre único, y solo los campos que la vista sabe aplicar."""
    if not isinstance(lista, list): raise ValueError("Los filtros guardados no son una lista.")
    if len(lista) > MAX_FILTROS_MOV: raise ValueError(f"Puedes guardar hasta {MAX_FILTROS_MOV} filtros: quita alguno antes de guardar otro.")
    texto = lambda v, n: re.sub(r"\s+", " ", v).strip()[:n] if isinstance(v, str) else ""
    out, vistos = [], set()
    for f in lista:
        if not isinstance(f, dict): raise ValueError("Filtro guardado no válido.")
        nombre = texto(f.get("nombre"), 60)
        if not nombre: raise ValueError("Ponle un nombre al filtro.")
        if nombre.casefold() in vistos: raise ValueError(f"Ya hay un filtro que se llama «{nombre}».")
        vistos.add(nombre.casefold())
        out.append({"nombre": nombre, "busqueda": texto(f.get("busqueda"), 120), "categoria": texto(f.get("categoria"), 80), "cuenta": texto(f.get("cuenta"), 80),
                    "desde": texto(f.get("desde"), 20), "hasta": texto(f.get("hasta"), 20), "sinRevisar": f.get("sinRevisar") is True,
                    "etiqueta": texto(f.get("etiqueta"), 60), "deben": f.get("deben") is True,
                    "periodo": f.get("periodo") if f.get("periodo") in ("mes", "año", "todo") else "mes",
                    "orden": f.get("orden") if f.get("orden") in ("fecha", "importe") else "fecha"})
    return out

# Rutas que no cambian nada tuyo (consultas, descargas, copias): tras ellas, lo último que se podía deshacer sigue valiendo.
# Cualquier otra escritura lo anula: «Deshacer» repone la foto ENTERA de antes y se llevaría por delante lo hecho después.
# Qué se deshace al corregir un registro que ya existía (/api/guardar): lo que se enseña en «Deshacer lo último».
DESHACER_AL_EDITAR = {"cuenta": "Cambios en la cuenta", "movimiento": "Cambios en el movimiento", "recurrente": "Cambios en el fijo"}
NO_ANULAN_DESHACER = {"/api/parecidos", "/api/detectar", "/api/categoria/sugerir", "/api/categoria/uso",
                      "/api/plantilla", "/api/exportar_datos", "/api/regla/probar", "/api/abrir_carpeta", "/api/copia", "/api/arranque",
                      "/api/actualizaciones/comprobar", "/api/precios/actualizar", "/api/precios/estado", "/api/precios/buscar", "/api/precios/comparar", "/api/config/visto",
                      "/api/importar/descartar"}  # quitar un archivo de la carpeta Importar no toca la base


def _aviso_borrar(tipo, reg, usos):
    lista = " y ".join(", ".join(f"{n} {PLURAL.get(t, t)}" for t, n in usos).rsplit(", ", 1))
    return f"«{modelo.nombre_de(tipo, reg)}» se está usando en {lista}. " + (CONSECUENCIA.get(tipo) or "Lo que apunta a esto se quedaría sin ello.")

class App:
    """Estado del servidor: carpeta de datos abierta, base de datos y clave de la sesión."""
    def __init__(self, raiz, hoy=None, pruebas=False, fija=False, ejemplo=False):
        self.token = secrets.token_urlsafe(24)
        self.hoy = hoy
        self.pruebas = pruebas
        self.lock = threading.RLock()
        self.ejemplo = ejemplo
        # fija: la carpeta se ha dado al arrancar (--datos, --ejemplo, --pruebas). Esa app no es «la de siempre»: ni apunta en
        # ajustes.json la carpeta que se elija ni vuelve a la que diga ese archivo (que es la de los datos de verdad).
        self.fija = fija
        self.inicio = None if ejemplo else os.path.abspath(raiz)
        self.deshacer = None  # foto de los datos antes de la última decisión que se puede deshacer
        self.deshacer_que = ""  # qué se deshace (se enseña en Ajustes: el aviso con «Deshacer» dura segundos, esto no)
        self.abrir(raiz)

    def abrir(self, raiz):
        """Abre una carpeta de datos. Si algo falla (carpeta imposible, base dañada), la app se queda con la que ya tenía
        abierta: así un error al cambiar de carpeta no deja la app inservible."""
        carpeta = rutas.Carpeta(raiz)
        alm = Almacen(carpeta.db)
        try:
            plantilla.instalar(alm)
            secreto.proteger(alm, "precios", "clave_coingecko")  # claves en claro de versiones anteriores
            alm.copia(carpeta.copias, extra=alm.config("copia_extra"))
            bizums.enlazar(alm)  # une los Bizums recibidos con su gasto (también en datos de versiones anteriores)
        except BaseException:
            alm.cerrar(); raise
        anterior = getattr(self, "alm", None)
        self.deshacer, self.deshacer_que = None, ""
        self.carpeta, self.alm = carpeta, alm
        if anterior is not None: anterior.cerrar()

    # ───── datos para la página ─────
    def datos(self):
        regs = self.alm.todos_por_tipo()
        pend = regs.pop("pendiente", [])
        if pend:  # la categoría más probable de cada duda del banco (por tu historial)
            mem = C.memoria(regs.get("movimiento", []))
            activos = regs.get("activo", [])
            fus = self.alm.config("categorias_fusionadas") or {}
            fijas = {c["nombre"] for c in regs.get("categoria", []) if c.get("grupo") == "fijo"}
            cands = bizums.detalle_candidatos(pend, regs.get("movimiento", []), fijas)  # gastos que un Bizum recibido podría devolver
            for p in pend:
                f = p.get("fila") or {}
                if p.get("tipo_import") == "banco":
                    p.update(C.detalle_revision(f, regs.get("movimiento", []), regs.get("categoria", [])))
                    if f.get("preguntar"): p["preguntar"] = True
                if p["id"] in cands: p["candidatos"] = cands[p["id"]]
                if p.get("tipo_import") == "inversion": p["sugerencia"] = IM.sugerencia_inversion(p, activos)
                elif f.get("clase") != "transferencia":
                    s = C.sugerir(f.get("texto", ""), f.get("importe", 0), mem, f.get("cat", ""))
                    p["sugerencia"] = s
                    if s:
                        p.update(C.detalle_revision({**f, "clase": s["clase"]}, regs.get("movimiento", []), regs.get("categoria", [])))
                    if not s and p.get("palabra"):
                        p["sugerencia"] = {"clase": f.get("clase") or ("gasto" if f.get("importe", 0) < 0 else "ingreso"),
                                           "categoria": p["palabra"]["categoria"], "motivo": "por el concepto", "segura": False}
                    # Si ninguna categoría tuya encaja: aconsejar crear una típica por el concepto. Solo aconseja.
                    if f.get("importe", 0) < 0 and not bizums.es_bizum(f.get("texto")) and (
                            not s or s["categoria"] in ("Otros", "Otros ingresos") or str(s.get("motivo", "")).startswith("parecido")):
                        todas = regs.get("categoria", [])
                        n = C.proponer_categoria_nueva(f.get("texto", ""), f["importe"], todas, fus)
                        if n: p["categoria_nueva"] = n
        ignorados = regs.pop("ignorado", [])
        cfg = self.alm.config(sin="precio_serie:")  # las series de precios (caché) se quedan en el servidor
        cfg["precios"] = precios.para_la_pagina(self.alm)
        cfg["importaciones"] = IM.lotes_recientes(self.alm, {**regs, "pendiente": pend, "ignorado": ignorados})  # las importaciones recientes y lo que queda de cada una (para «Quitar esta importación»)
        cfg["actualizaciones"] = actualizaciones.para_la_pagina(self.alm)
        return {"registros": regs, "pendientes": pend, "config": cfg,
                "ultimo_lote": cfg["importaciones"][0]["id"] if cfg["importaciones"] else None,
                "info": {"version": VERSION, "carpeta": self.carpeta.raiz, "hoy": self.hoy, "ejemplo": self.ejemplo,
                         "deshacer": self.deshacer_que if self.deshacer else "", "arranque": autoarranque.estado(self.fija),
                         "archivos": [{"nombre": os.path.basename(p), "tipo": t} for p, t in IM.archivos_pendientes(self.carpeta)]}}

    # ───── acciones ─────
    def importar_carpeta(self, previa=False):
        resultados = []
        foto = None if previa else self.alm.instantanea()
        for ruta, tipo in IM.archivos_pendientes(self.carpeta):
            resultados.append(self._importar(ruta, tipo, previa=previa))
        if foto is not None and any(r.get("deshacer") for r in resultados):
            # Una sola petición importa toda la carpeta: deshacer debe reponer el estado anterior a todos sus archivos.
            self.deshacer, self.deshacer_que = foto, "Importación completa de la carpeta"
        if not resultados: return {"ok": True, "resultados": [], "mensaje": "No hay archivos en la carpeta Importar."}
        return {"ok": all(r.get("ok") or r.get("necesita") for r in resultados), "resultados": resultados}

    # ───── vista previa de una importación: el mismo código que importa de verdad, dentro de una simulación que se deshace ─────
    def _ids(self):
        return {t: {x["id"] for x in self.alm.todos(t)} for t in ("movimiento", "aportacion", "pendiente", "activo")}

    def _informe_previa(self, antes, r):
        nuevos = lambda t: [x for x in self.alm.todos(t) if x["id"] not in antes[t]]
        movs, aps, pend, acts = nuevos("movimiento"), nuevos("aportacion"), nuevos("pendiente"), nuevos("activo")
        firmado = lambda m: -m["importe"] if m["clase"] == "gasto" else m["importe"] if m["clase"] in ("ingreso", "reembolso") else 0
        fechas = [m["fecha"] for m in movs] + [a["fecha"] for a in aps] + [p["fila"]["op"] for p in pend]
        gasto_cat = {}
        for m in movs:
            if m["clase"] == "gasto": gasto_cat[m.get("categoria") or "Sin categoría"] = gasto_cat.get(m.get("categoria") or "Sin categoría", 0) + m["importe"]
        saldo = (self.alm.config(f"saldo_extracto:{r['cuenta']}") or None) if r.get("cuenta") else None
        return {
            "movimientos": {"n": len(movs), "ingresos": round(sum(m["importe"] for m in movs if m["clase"] in ("ingreso", "reembolso")), 2),
                            "gastos": round(sum(m["importe"] for m in movs if m["clase"] == "gasto"), 2), "traspasos": sum(1 for m in movs if m["clase"] == "transferencia")},
            "aportaciones": {"n": len(aps), "compras": round(sum(a["importe"] for a in aps if a["importe"] > 0), 2), "ventas": round(-sum(a["importe"] for a in aps if a["importe"] < 0), 2)},
            "automaticos": sum(1 for m in movs if m.get("auto")), "activos_nuevos": [a["nombre"] for a in acts], "existentes": r.get("existentes", 0),
            "ilegibles": r.get("ilegibles") or [],  # filas que parecían un movimiento y no se han podido leer: se enseñan, no se callan
            "dudas": {"n": len(pend), "muestra": [{"fecha": p["fila"]["op"], "texto": p["fila"].get("texto", ""), "importe": p["fila"].get("importe", 0)}
                                                   for p in sorted(pend, key=lambda p: p["fila"]["op"], reverse=True)[:6]]},
            "desde": min(fechas) if fechas else None, "hasta": max(fechas) if fechas else None,
            "saldo_final": saldo,
            "muestra": [{"fecha": m["fecha"], "concepto": m.get("concepto", ""), "importe": firmado(m), "categoria": m.get("categoria", ""), "clase": m["clase"], "auto": m.get("auto")}
                        for m in sorted(movs, key=lambda m: (m["fecha"], m["id"]), reverse=True)[:12]],
            "categorias": [{"categoria": c, "total": round(v, 2)} for c, v in sorted(gasto_cat.items(), key=lambda kv: -kv[1])[:6]],
        }

    def _importar(self, ruta, tipo=None, cuenta=None, perfil=None, previa=False, antes=None):
        """previa: no guarda nada, enseña el informe de lo que pasaría (`antes`: algo que hacer dentro de la simulación, p. ej. crear el formato)."""
        nombre = os.path.basename(ruta)
        donde = {"archivo": nombre, "carpeta": self._carpeta_de(ruta)}  # la pantalla lo nombra así: puede haber dos iguales en Banco e Inversión
        try:
            if previa:
                with self.alm.simular():
                    if antes: antes()
                    ids = self._ids()
                    r = IM.importar_archivo(self.alm, self.carpeta, ruta, tipo, cuenta, perfil, simulando=True)
                    if r.get("ok") and not r.get("ya_importado"): r["previa"] = self._informe_previa(ids, r)
                if r.get("ok") and r.get("ya_importado"):
                    # No hay cambios que confirmar: archivar también con «Ver antes de importar».
                    IM.archivar(self.carpeta, ruta)
                return {**r, **donde}
            foto = self.alm.instantanea()
            r = IM.importar_archivo(self.alm, self.carpeta, ruta, tipo, cuenta, perfil)
            if r.get("ok") and r.get("tipo") == "banco":
                bizums.enlazar(self.alm)
            if r.get("ok") and r.get("saldo_igualado"):
                self.deshacer, self.deshacer_que = foto, "Importación y saldo del banco"
                r["deshacer"] = True
            return {**r, **donde}
        except IM.NecesitaPerfil as e:
            # Qué columna es cada cosa: lo que se ve en el propio archivo, sin internet.
            return {"ok": False, "necesita": "perfil", **e.info, **donde, "tipo": tipo or e.info.get("tipo"), "propuesta": dict(e.info.get("columnas_probables") or {})}
        except IM.NecesitaCuenta as e:
            return {"ok": False, "necesita": "cuenta", **e.info, **donde}
        except Exception as e:
            return {"ok": False, **donde, "mensaje": f"{nombre}: {e}"}

    def _carpeta_de(self, ruta):
        """En qué carpeta de Importar está un archivo: «banco», «inversion» o «» (la raíz). Es el `tipo` de `IM.archivos_pendientes`."""
        d = os.path.dirname(os.path.abspath(ruta))
        return "banco" if d == os.path.abspath(self.carpeta.banco) else "inversion" if d == os.path.abspath(self.carpeta.inversion) else ""

    def _pendiente(self, nombre, carpeta=None):
        """La ruta del archivo `nombre` que espera en Importar (en `carpeta`, si se dice: «banco», «inversion» o «»), o None."""
        return next((p for p, t in IM.archivos_pendientes(self.carpeta) if os.path.basename(p) == nombre and (carpeta is None or (t or "") == carpeta)), None)



    def subir(self, d):
        nombre = os.path.basename(str(d.get("nombre") or "archivo.csv"))
        nombre = re.sub(r'[\\/:*?"<>|]', "_", nombre)
        if not nombre.lower().endswith(IM.EXTENSIONES): return {"ok": False, "mensaje": "Solo se admiten archivos Excel (.xlsx, .xls), CSV, Norma 43, OFX o QIF."}
        datos = base64.b64decode(d.get("contenido") or "")
        if len(datos) > MAX_SUBIDA: return {"ok": False, "mensaje": "El archivo es demasiado grande."}
        tipo = d.get("tipo") if d.get("tipo") in ("banco", "inversion", "operaciones") else None
        ruta = os.path.join(self.carpeta.carpeta_import(tipo), nombre)
        with io.open(ruta, "wb") as fh: fh.write(datos)
        return {**self._importar(ruta, tipo, previa=bool(d.get("previa"))), "subido": True}

    def reintentar(self, d):
        """Tras configurar el formato o elegir la cuenta: vuelve a importar el archivo."""
        nombre = os.path.basename(d["archivo"])
        ruta = self._pendiente(nombre, d.get("carpeta"))
        if not ruta: return {"ok": False, "mensaje": f"No encuentro «{nombre}» en la carpeta Importar."}
        tipo = d.get("tipo") if d.get("tipo") in ("banco", "inversion", "operaciones") else None
        crear = (lambda: IM.crear_perfil(self.alm, d.get("perfil") or os.path.splitext(nombre)[0], tipo or "banco", d["columnas"], d.get("cuenta"),
                                         d.get("compras_negativas", True))) if d.get("columnas") else None
        if d.get("previa"):  # el formato nuevo también se crea solo dentro de la simulación
            r = self._importar(ruta, tipo, d.get("cuenta"), d.get("perfil"), previa=True, antes=crear)
            return {**r, "subido": bool(d.get("subido")), "peticion": {k: d.get(k) for k in ("archivo", "carpeta", "tipo", "cuenta", "perfil", "columnas", "compras_negativas") if d.get(k) is not None}} if r.get("previa") else r
        if crear: crear()
        return self._importar(ruta, tipo, d.get("cuenta"), d.get("perfil"))

    def descartar_archivo(self, d):
        """Quita de la carpeta Importar un archivo que no se quiere importar: uno subido que se ha quedado a medias (vista previa, falta
        la cuenta o el formato, o un error) o uno de la lista de la carpeta (la pantalla lo confirma antes)."""
        nombre = os.path.basename(d.get("archivo") or "")
        ruta = self._pendiente(nombre, d.get("carpeta"))
        if not ruta: return {"ok": False, "mensaje": f"No encuentro «{nombre}» en la carpeta Importar."}
        os.remove(ruta)
        return {"ok": True, "mensaje": f"«{nombre}» descartado: no se ha importado nada."}

    def bienvenida(self, d):
        """Primer arranque: cuentas con su saldo de hoy, límite de gasto y fondo de emergencia."""
        cuentas = [c for c in d.get("cuentas") or [] if str(c.get("nombre", "")).strip()]
        if not cuentas: raise ValueError("Añade al menos una cuenta.")
        hoy = self.hoy or datetime.date.today().isoformat()
        with self.alm.transaccion():
            saldos = {}
            for c in cuentas:
                self.alm.guardar("cuenta", {"nombre": c["nombre"], "tipo": c.get("tipo"), "extracto": c.get("extracto", c.get("tipo") in ("corriente", "ahorro"))})
                if c.get("saldo") not in (None, ""): saldos[c["nombre"].strip()] = c["saldo"]
            if saldos: self.alm.guardar("patrimonio", {"fecha": hoy, "saldos": saldos, "nota": "Saldos iniciales"})
            self.alm.set_config("limite_variable", modelo.numero(d.get("limite")) or 0)
            ahorro = next((c["nombre"] for c in cuentas if c.get("tipo") == "ahorro"), None)
            if ahorro and modelo.numero(d.get("fondo_meses")):
                self.alm.guardar("objetivo", {"nombre": "Fondo de emergencia", "meta_meses": d["fondo_meses"], "cuenta": ahorro, "prioridad": "alta"})
            for r in d.get("recurrentes") or []:
                if str(r.get("nombre", "")).strip() and modelo.numero(r.get("importe")):
                    self.alm.guardar("recurrente", {"desde": hoy[:8] + "01", **r})
            self.alm.set_config("configurado", True)
        return {"ok": True}

    def saldo_banco(self, d):
        """Saldos comprobados por el usuario en el repaso, sin cerrar el mes ni tocar el valor de los activos."""
        fecha = modelo.fecha(d.get("fecha"))
        if not fecha or not isinstance(d.get("saldos"), dict): raise ValueError("Faltan la fecha y los saldos.")
        regs = self.alm.todos("patrimonio")
        ya = next((r for r in regs if r["fecha"] == fecha), None)
        base = ya or max([r for r in regs if r["fecha"] < fecha], key=lambda r: r["fecha"], default={})
        saldos = {**(ya or {}).get("saldos", {}), **d["saldos"]}
        origenes = {c: ((ya or {}).get("origen_saldos") or {}).get(c, "extracto" if (ya or {}).get("nota") in ("Saldo del extracto", "Saldo del primer extracto") else "manual") for c in (ya or {}).get("saldos", {})}
        # Confirmar expresamente que una estimación coincide con el banco también es una comprobación manual.
        # Los saldos ya anotados hoy no se reenvían desde el repaso: conservan su procedencia.
        origenes.update({c: "manual" for c in d["saldos"]})
        reg = {"fecha": fecha, "saldos": saldos, "origen_saldos": origenes, "valores": base.get("valores") or {}, "otros": base.get("otros"), "deudas": base.get("deudas"), "nota": (ya or {}).get("nota") or "Saldos comprobados"}
        self.alm.guardar("patrimonio", reg, ya["id"] if ya else None)
        return {"ok": True}

    def cierre(self, d):
        """Registro de patrimonio de ese día + valores de los activos. El mes queda cerrado (con su nota) solo si los saldos son
        de su último día o de después: anotar saldos a mitad de mes es un registro más, y ese mes se sigue pidiendo al acabar."""
        fecha = modelo.fecha(d.get("fecha"))
        if not fecha: raise ValueError("Falta la fecha del cierre.")
        mes = str(d.get("mes") or "")
        if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", mes): mes = fecha[:7]
        cierra = fecha >= f"{mes}-{calendar.monthrange(int(mes[:4]), int(mes[5:]))[1]:02d}"
        with self.alm.transaccion():
            reg = {"fecha": fecha, "saldos": d.get("saldos") or {}, "valores": d.get("valores") or {}, "otros": d.get("otros"), "deudas": d.get("deudas"),
                   "nota": d.get("nota") or ("" if cierra else d.get("notas") or "")}
            ya = next((r for r in self.alm.todos("patrimonio") if r["fecha"] == fecha), None)
            self.alm.guardar("patrimonio", reg, ya["id"] if ya else None)
            for a in self.alm.todos("activo"):
                v = modelo.numero((d.get("valores") or {}).get(a["nombre"]))
                if v is not None: self.alm.guardar("activo", {**a, "valor": v, "fecha_valor": fecha}, a["id"])
            if cierra:
                c = next((r for r in self.alm.todos("cierre") if r["mes"] == mes), None)
                nuevo = {"mes": mes, "fecha": fecha, "notas": d.get("notas") or ""}
                foto = d.get("foto") if isinstance(d.get("foto"), dict) else (c or {}).get("foto")  # sin foto nueva (cliente antiguo), se conserva la de antes
                if foto: nuevo["foto"] = foto
                self.alm.guardar("cierre", nuevo, c["id"] if c else None)
        return {"ok": True, "cerrado": cierra, "mensaje": f"Mes cerrado: registro de patrimonio del {IM.fmt(fecha)} guardado." if cierra else f"Saldos del {IM.fmt(fecha)} guardados."}

    def precios(self, accion, d):
        """Precios por internet (opcional, apagado de serie): ajustes, actualizar en segundo plano, buscar y comparar."""
        a = self.alm
        try:
            if accion == "config":
                precios.guardar_config(a, d)
                return {"ok": True, "precios": precios.para_la_pagina(a)}
            if accion == "actualizar":
                precios._exigir(a)
                return {"ok": True, "iniciado": precios.actualizar_en_segundo_plano(a, bool(d.get("forzar")))}
            if accion == "estado":
                e = precios.estado(a)
                r = e.get("resultado") or {}
                return {"ok": True, **e, "mensaje": precios.mensaje_resultado(r) if r.get("ok") else r.get("mensaje", ""), "precios": precios.para_la_pagina(a)}
            if accion == "autoconfigurar": return {"ok": True, **precios.autoconfigurar(a)}
            if accion == "buscar": return {"ok": True, "candidatos": precios.buscar(a, str(d.get("texto") or ""))}
            if accion == "comparar": return {"ok": True, **precios.comparar(a, str(d.get("ref") or "mundo"))}
        except precios.ErrorPrecios as e:
            return {"ok": False, "mensaje": str(e)}
        raise ValueError("Acción de precios desconocida.")

    def valores(self, d):
        fecha = modelo.fecha(d.get("fecha")) or (self.hoy or datetime.date.today().isoformat())
        n = 0
        with self.alm.transaccion():
            for a in self.alm.todos("activo"):
                v = modelo.numero((d.get("valores") or {}).get(a["nombre"]))
                if v is not None: self.alm.guardar("activo", {**a, "valor": v, "fecha_valor": fecha}, a["id"]); n += 1
        return {"ok": True, "mensaje": f"Valores actualizados ({n})."}

    def cambiar_carpeta(self, d):
        escrita = os.path.expandvars(str(d.get("carpeta") or "").strip().strip('"'))
        if not escrita: raise ValueError("Escribe una carpeta válida.")
        if not os.path.isabs(escrita): raise ValueError(f"Escribe la ruta completa de la carpeta (por ejemplo, C:\\Users\\…\\FinanceBuddy). Sigues con {self.carpeta.raiz}.")
        nueva = os.path.abspath(escrita)
        # Una ruta mal escrita no crea una carpeta vacía (parecería que se han perdido los datos): la carpeta tiene que existir
        if not os.path.isdir(nueva):
            que = "es un archivo, no una carpeta" if os.path.exists(nueva) else "no existe (¿está bien escrita?). Si quieres empezar allí, créala antes en el Explorador"
            raise ValueError(f"No se ha podido usar «{nueva}»: {que}. Sigues con {self.carpeta.raiz}.")
        # Una carpeta sin datos de FinanceBuddy empieza de cero: antes se pide confirmación (sin ella no se crea nada)
        if not os.path.exists(os.path.join(nueva, "datos.db")) and d.get("confirmado") is not True:
            return {"ok": False, "necesita_confirmar": True,
                    "mensaje": f"La carpeta «{nueva}» no tiene datos de FinanceBuddy: si la usas, se creará una base nueva y vacía. Tus datos actuales siguen en {self.carpeta.raiz}."}
        try:
            self.abrir(nueva)
        except Exception as e:  # la carpeta de antes sigue abierta: solo hay que contar qué ha pasado
            raise ValueError(f"No se ha podido usar «{nueva}»: {rutas.motivo(e)}. Sigues con {self.carpeta.raiz}.")
        self.ejemplo = False
        if not self.fija: a = rutas.leer_ajustes(); a["datos"] = nueva; rutas.guardar_ajustes(a)
        return {"ok": True, "mensaje": f"Usando la carpeta {nueva}"}

    def copia(self, motivo="diaria", forzar=False):
        """Copia de seguridad en la carpeta Copias y, si la has configurado, también en la carpeta extra (otro disco o un USB)."""
        return self.alm.copia(self.carpeta.copias, motivo, forzar=forzar, extra=self.alm.config("copia_extra"))

    def modo_ejemplo(self, activar):
        """Cambia a una carpeta temporal con datos inventados (o vuelve a la carpeta de datos del usuario)."""
        if activar:
            from . import ejemplo
            raiz = os.path.join(tempfile.gettempdir(), "FinanceBuddy-ejemplo")
            ejemplo.crear(raiz, hoy=self.hoy)
            self.abrir(raiz)
            self.ejemplo = True
        else:
            if self.fija and not self.inicio: raise ValueError("Esta app se ha abierto solo con datos de ejemplo: no hay otros a los que volver.")
            self.abrir(self.inicio if self.fija else rutas.leer_ajustes().get("datos") or rutas.carpeta_por_defecto())
            self.ejemplo = False
        return {"ok": True}

    def restaurar(self, d):
        nombre = os.path.basename(str(d.get("copia") or ""))
        origen = os.path.join(self.carpeta.copias, nombre)
        if not nombre.endswith(".db") or not os.path.exists(origen): raise ValueError("No encuentro esa copia.")
        comprobar_copia(origen)  # dañada o de una versión más nueva: se dice y no se toca nada
        import sqlite3, shutil
        # Se aparta una copia de trabajo antes: la de «antes de restaurar» puede empujar fuera del límite de 30 a la que se restaura
        with tempfile.TemporaryDirectory() as tmp:
            trabajo = os.path.join(tmp, "copia.db")
            shutil.copy2(origen, trabajo)
            self.copia("antes de restaurar", forzar=True)
            src = sqlite3.connect(trabajo)
            try:
                with self.alm.lock:
                    src.backup(self.alm.con)
                    self.alm.quitar_restos_jev()
                    self.alm.migrar_revision()
            finally: src.close()
        return {"ok": True, "mensaje": f"Restaurada la copia «{nombre}»."}

    def copias(self):
        """Las copias para el desplegable de «Restaurar una copia», de la más nueva a la más vieja."""
        from .almacen import copias_de
        return [os.path.basename(p) for p in reversed(copias_de(self.carpeta.copias))]

    def manejar(self, ruta, d):
        """API de escritura. Devuelve un dict JSON."""
        foto = self.deshacer
        r = self._manejar(ruta, d)
        # Si esto ha cambiado algo sin renovar la foto, lo de antes ya no se puede deshacer (se perdería lo de ahora).
        # `mantener`: una decisión más de la misma tanda de «Por revisar», que se deshace junta.
        if (foto is not None and self.deshacer is foto and r is not None and ruta not in NO_ANULAN_DESHACER and not d.get("previa")
                and not d.get("mantener") and not r.get("necesita_confirmar") and not r.get("necesita") and not r.get("ya_importado")):
            self.deshacer, self.deshacer_que = None, ""
        return r

    def _manejar(self, ruta, d):
        a = self.alm
        if ruta == "/api/guardar":
            tipo = d.get("tipo")
            if tipo not in modelo.EDITABLES: raise ValueError("Tipo no editable.")
            id = int(d["id"]) if d.get("id") else None
            datos = dict(d.get("datos") or {})
            if tipo == "movimiento":
                viejo = (a.obtener("movimiento", id) if id else None) or {}
                if id:  # quitar a mano el gasto que devuelve un Bizum: que no se vuelva a enlazar solo
                    if datos.get("reembolsa"): datos.pop("sin_gasto", None)
                    elif viejo.get("reembolsa") or viejo.get("sin_gasto"): datos["sin_gasto"] = True
                IM.comprobar_parte(viejo, datos)  # una parte de un movimiento dividido no cambia de importe, fecha ni cuenta
            # Corregir una cuenta, un movimiento o un fijo que ya existe se puede deshacer (la foto se toma antes de guardar)
            foto = a.instantanea() if id and tipo in DESHACER_AL_EDITAR else None
            guardado = a.guardar(tipo, datos, id)
            if foto is not None:
                self.deshacer = foto
                self.deshacer_que = DESHACER_AL_EDITAR[tipo]
            return {"ok": True, "id": guardado, "deshacer": foto is not None}
        if ruta == "/api/borrar":
            if d.get("tipo") not in modelo.EDITABLES: raise ValueError("Tipo no editable.")
            reg = a.obtener(d["tipo"], int(d["id"]))
            if d["tipo"] == "movimiento" and reg and reg.get("parte_de"):  # sin esa parte, las demás ya no sumarían el cargo del banco
                raise ValueError("Es una parte de un movimiento dividido: vuelve a juntarlo antes de borrarlo.")
            usos = a.usos(d["tipo"], reg) if reg else []
            if usos and not d.get("confirmar"):  # hay cosas que apuntan a este registro: antes de borrar, que se vea qué pasa
                return {"ok": False, "necesita_confirmar": True, "mensaje": _aviso_borrar(d["tipo"], reg, usos)}
            self.deshacer = a.instantanea()  # borrar se puede deshacer (Ajustes → Copias y archivos, o el aviso)
            self.deshacer_que = "Borrado: " + str((reg or {}).get("nombre") or (reg or {}).get("concepto") or d["tipo"])
            a.borrar(d["tipo"], int(d["id"])); return {"ok": True, "deshacer": True}
        if ruta == "/api/objetivos":  # reparto objetivo: {id de activo: %}. Vacío = quitar el objetivo de todos. Si hay alguno, suman 100.
            a_ver = d.get("objetivos") or {}
            if not isinstance(a_ver, dict): raise ValueError("Objetivos no válidos.")
            nuevos = {}
            for k, v in a_ver.items():
                n = modelo.numero(v)
                if n is None: continue
                if not 0 <= n <= 100: raise ValueError("Cada porcentaje tiene que estar entre 0 y 100.")
                if n > 0: nuevos[int(k)] = n
            if nuevos and abs(sum(nuevos.values()) - 100) > 0.05:
                raise ValueError(f"Los porcentajes suman {round(sum(nuevos.values()), 2)} %, tienen que sumar 100 %.")
            with a.transaccion():
                for r in a.todos("activo"):
                    datos = {k: v for k, v in r.items() if k not in ("id", "objetivo")}
                    if r["id"] in nuevos: datos["objetivo"] = nuevos[r["id"]]
                    if r.get("objetivo") != datos.get("objetivo"): a.guardar("activo", datos, r["id"])
            return {"ok": True, "mensaje": "Reparto objetivo guardado ✓" if nuevos else "Reparto objetivo quitado"}
        if ruta == "/api/config":
            for k, v in (d or {}).items():
                if k in ("limite_variable",): a.set_config(k, modelo.numero(v) or 0)
                elif k == "dia_inicio": a.set_config(k, min(28, max(1, int(modelo.numero(v) or 1))))  # día en que empieza «tu mes»
                elif k == "colchon": a.set_config(k, max(0, modelo.numero(v) or 0))  # 0 = lo calcula la app
                elif k == "meta_ahorro": a.set_config(k, max(0, modelo.numero(v) or 0))  # cuánto quieres ahorrar al mes (0 = sin meta)
                elif k == "por_pagina":  # registros por página de las listas largas (10 a 200; 40 si no es un número)
                    try: n = int(modelo.numero(v) or 40)
                    except ValueError: n = 40
                    a.set_config(k, min(200, max(10, n)))
                elif k == "avisos_windows": a.set_config(k, v in (True, 1, "1", "true", "on"))
                elif k == "acento": a.set_config(k, v if v in ACENTOS else ACENTOS[0])
                elif k == "mascota": a.set_config(k, "no" if v == "no" else "si")
                elif k == "mascota_nombre": a.set_config(k, v.strip()[:16] if isinstance(v, str) else "")
                elif k == "independencia":  # supuestos de la calculadora (en %, como se escriben): solo números de los campos conocidos
                    sup = {}
                    for c in ("gasto", "tasa", "rent", "apo", "edad", "pension", "edadPension"):
                        x = modelo.numero(v.get(c)) if isinstance(v, dict) else None
                        if x is not None and abs(x) < 1e9: sup[c] = x
                    a.set_config(k, sup)
                elif k in ("inicio", "inicio_ocultos"):  # paneles de Inicio visibles (en orden) y ocultos
                    a.set_config(k, [x for x in (v if isinstance(v, list) else []) if isinstance(x, str) and re.fullmatch(r"[a-z]{2,20}", x)][:20])
            return {"ok": True}
        if ruta == "/api/titulares":
            a.set_config("titulares", [re.sub(r"\s+", " ", str(x)).strip()[:80] for x in (d.get("titulares") or []) if str(x).strip()][:6])
            return {"ok": True}
        if ruta == "/api/regla/preguntar":
            foto = a.instantanea()
            msg = IM.preguntar_movimiento(a, int(d["movimiento"]))
            self.deshacer, self.deshacer_que = foto, msg
            return {"ok": True, "mensaje": msg, "deshacer": True}
        if ruta == "/api/recategorizar":  # desde la ficha de un movimiento (solo ese, o también su comercio): se puede deshacer
            foto = a.instantanea()
            msg = IM.recategorizar(a, int(d["id"]), d)
            self.deshacer, self.deshacer_que = foto, msg
            return {"ok": True, "mensaje": msg}
        if ruta == "/api/movimiento/categoria":  # desde la lista de Movimientos: la de una fila o la de varios elegidos (se puede deshacer)
            foto = a.instantanea()
            msg = IM.cambiar_categoria(a, [int(x) for x in (d.get("ids") or []) if str(x).isdigit()], d.get("categoria"))
            self.deshacer, self.deshacer_que = foto, msg
            return {"ok": True, "mensaje": msg}
        if ruta == "/api/parecidos": return {"ok": True, **IM.parecidos(a, int(d["id"]))}
        if ruta == "/api/movimiento/dividir":  # un cargo que son varias cosas: una parte por categoría (se puede deshacer y volver a juntar)
            foto = a.instantanea()
            msg = IM.dividir(a, int(d["id"]), d.get("partes"))
            self.deshacer, self.deshacer_que = foto, msg
            return {"ok": True, "mensaje": msg}
        if ruta == "/api/movimiento/juntar":
            foto = a.instantanea()
            id = IM.juntar(a, int(d["id"]))
            self.deshacer, self.deshacer_que = foto, "Vuelto a juntar"
            return {"ok": True, "mensaje": "Vuelto a juntar ✓", "id": id}
        if ruta == "/api/importar/carpeta": return self.importar_carpeta(bool(d.get("previa")))
        if ruta == "/api/importar/deshacer":  # quita de golpe todo lo que trajo una importación (se puede deshacer con «Deshacer»)
            foto = a.instantanea()
            msg, n = IM.deshacer_lote(a, d.get("lote"))
            if n: self.deshacer, self.deshacer_que = foto, msg
            return {"ok": True, "mensaje": msg, "quitados": n}
        if ruta == "/api/importar/descartar": return self.descartar_archivo(d)
        if ruta == "/api/importar/subir": return self.subir(d)
        if ruta == "/api/importar/reintentar": return self.reintentar(d)
        if ruta == "/api/importar/efectivo":
            cuenta = next((c for c in a.todos("cuenta") if c["nombre"] == d.get("cuenta") and c.get("tipo") == "broker"), None)
            if not cuenta: raise ValueError("Elige una cuenta de bróker.")
            saldo = modelo.numero(d.get("saldo"))
            if saldo is not None:
                fecha = self.hoy or datetime.date.today().isoformat()
                ya = next((p for p in a.todos("patrimonio") if p["fecha"] == fecha), {})
                a.guardar("patrimonio", {**ya, "fecha": fecha, "saldos": {**ya.get("saldos", {}), cuenta["nombre"]: saldo},
                                        "origen_saldos": {**ya.get("origen_saldos", {}), cuenta["nombre"]: "manual"}}, ya.get("id"))
            a.set_config(f"efectivo_preguntado:{cuenta['nombre']}", True)
            return {"ok": True, "mensaje": "Saldo guardado." if saldo is not None else "No volveré a preguntarlo."}
        if ruta == "/api/saldo_banco":  # los saldos del banco como saldos de hoy: se puede deshacer
            foto = a.instantanea(); r = self.saldo_banco(d)
            self.deshacer, self.deshacer_que = foto, "Saldos de hoy"
            return {**r, "deshacer": True}
        if ruta == "/api/deshacer":  # vuelve a como estaba antes de la última decisión que se podía deshacer
            if not self.deshacer: return {"ok": False, "mensaje": "No hay nada que deshacer."}
            a.recuperar(self.deshacer); self.deshacer, self.deshacer_que = None, ""
            return {"ok": True, "mensaje": "Deshecho"}
        if ruta == "/api/resolver":
            if not d.get("mantener"): self.deshacer = a.instantanea()
            msg = IM.resolver(a, int(d["id"]), d)
            bizums.enlazar(a)
            # `mantener`: es una decisión más de la misma tanda (aceptar sugerencias en bloque); se deshacen todas juntas
            self.deshacer_que = "Varias decisiones de «Por revisar»" if d.get("mantener") else msg
            return {"ok": True, "mensaje": msg}
        if ruta == "/api/detectar": return {"ok": True, "fijos": detectar.fijos(a), "origenes": detectar.origenes(a)}
        if ruta == "/api/fijos":  # crear los fijos detectados que marcaste: se puede deshacer (también enlaza sus pagos)
            foto = a.instantanea()
            msg = detectar.crear(a, d.get("fijos") or [])
            self.deshacer, self.deshacer_que = foto, msg
            return {"ok": True, "mensaje": msg, "deshacer": True}
        if ruta == "/api/bienvenida": return self.bienvenida(d)
        if ruta in ("/api/cierre", "/api/valores"):  # anotar saldos o valores (y cerrar el mes) se puede deshacer
            foto = a.instantanea()
            r = self.cierre(d) if ruta == "/api/cierre" else self.valores(d)
            if r.get("ok"):
                self.deshacer = foto
                self.deshacer_que = ("Mes cerrado" if r.get("cerrado") else "Saldos anotados") if ruta == "/api/cierre" else "Valores anotados"
                r["deshacer"] = True
            return r
        if ruta == "/api/activo/unir": return {"ok": True, "mensaje": cartera.unir(a, d["origen"], d["destino"])}
        if ruta == "/api/activo/borrar": return {"ok": True, "mensaje": cartera.borrar(a, d["id"], bool(d.get("era_traspaso")))}
        if ruta == "/api/activo/cuadrar": return {"ok": True, "mensaje": cartera.cuadrar(a, d["id"], d.get("participaciones"), d.get("fecha"), d.get("valor"))}
        if ruta == "/api/categoria/sugerir":
            texto = str(d.get("texto") or "").strip()
            importe = 1 if d.get("clase") == "ingreso" else -1
            regla = C.regla_para(texto, a.todos("regla"))
            if regla and regla.get("categoria") and regla.get("clase") == ("ingreso" if importe > 0 else "gasto"):
                return {"ok": True, "categoria": regla["categoria"], "motivo": "regla", "veces": 0}
            mem = C.memoria([{**m, "ext_texto": m.get("ext_texto") or m.get("concepto")} for m in a.todos("movimiento")])
            s = C.sugerir(texto, importe, mem, contar=True) if texto else None
            return {"ok": True, "categoria": s["categoria"] if s else None, "motivo": "historial" if s else None, "veces": s["veces"] if s else 0}
        if ruta == "/api/actualizaciones/config":
            actualizaciones.guardar_config(a, d); return {"ok": True, "actualizaciones": actualizaciones.para_la_pagina(a)}
        if ruta == "/api/actualizaciones/comprobar":
            try: return {"ok": True, **actualizaciones.comprobar(a, bool(d.get("forzar")))}
            except actualizaciones.ErrorActualizacion as e: return {"ok": False, "mensaje": str(e)}
        if ruta == "/api/exportar_datos": return {"ok": True, "nombre": f"FinanceBuddy-datos-{datetime.date.today().isoformat()}.xlsx", "contenido": base64.b64encode(exportar.datos_excel(a)).decode()}
        if ruta == "/api/regla/probar": return {"ok": True, **ordenar.probar_regla(a, d)}
        if ruta == "/api/regla/aplicar":
            self.deshacer = a.instantanea()
            self.deshacer_que = ordenar.aplicar_regla(a, d)
            return {"ok": True, "mensaje": self.deshacer_que}
        if ruta == "/api/categoria/fusionar":
            if d.get("previa"): return ordenar.vista_fusion(a, d.get("origen"), d.get("destino"))
            ordenar.vista_fusion(a, d.get("origen"), d.get("destino"))  # valida antes de guardar la foto
            self.deshacer = a.instantanea()
            self.deshacer_que = ordenar.fusionar(a, d.get("origen"), d.get("destino"))
            return {"ok": True, "mensaje": self.deshacer_que}
        if ruta == "/api/categoria/ocultar":
            self.deshacer = a.instantanea()
            self.deshacer_que = ordenar.ocultar(a, [str(x) for x in (d.get("nombres") or [])], d.get("ocultar") is not False)
            return {"ok": True, "mensaje": self.deshacer_que}
        if ruta == "/api/categoria/uso": return {"ok": True, "uso": ordenar.uso(a)}
        if ruta == "/api/plantilla": return {"ok": True, "nombre": "FinanceBuddy-plantilla.xlsx", "contenido": base64.b64encode(exportar.plantilla_excel(a)).decode()}
        if ruta.startswith("/api/precios/"): return self.precios(ruta[len("/api/precios/"):], d)
        if ruta == "/api/config/descartar_aviso":  # avisos que el usuario quita (los de la cartera y los del Inicio); `volver`: lo repone
            k = str(d.get("clave") or "")[:120]
            ya = a.config("avisos_descartados") or []
            if k: a.set_config("avisos_descartados", [x for x in ya if x != k] if d.get("volver") else list(dict.fromkeys(ya + [k]))[-200:])
            return {"ok": True}
        if ruta == "/api/config/filtros_movimientos":  # filtros guardados de Movimientos: la lista entera (guardar, renombrar y borrar los hace la página)
            a.set_config("filtros_movimientos", filtros_movimientos_validos(d.get("lista")))
            return {"ok": True}
        if ruta == "/api/config/visto":  # «lo que cambió desde la última vez» del Inicio: solo anota hasta dónde llegaba lo que ya viste
            try: mx, neto = max(0, int(d.get("max_id"))), d.get("neto")
            except (TypeError, ValueError, OverflowError): raise ValueError("Falta hasta qué movimiento has visto.")
            neto = float(neto) if isinstance(neto, (int, float)) and not isinstance(neto, bool) and abs(neto) < 1e12 else None
            fecha = str(d.get("fecha") or "")
            a.set_config("ultima_vista", {"max_id": mx, "neto": neto, "fecha": fecha if re.fullmatch(r"\d{4}-\d{2}-\d{2}", fecha) else None,
                                         "avisos": [str(x)[:120] for x in (d.get("avisos") if isinstance(d.get("avisos"), list) else []) if isinstance(x, str)][:100]})
            return {"ok": True}
        if ruta == "/api/carpeta": return self.cambiar_carpeta(d)
        if ruta == "/api/copia_extra":  # segunda carpeta donde dejar las copias (USB, otro disco); vacío = solo la de siempre
            carpeta = os.path.expandvars(str(d.get("carpeta") or "").strip().strip('"'))
            if not carpeta:
                a.set_config("copia_extra", None); a.set_config("copia_extra_error", None)
                return {"ok": True, "mensaje": "Las copias se guardan solo en la carpeta Copias."}
            carpeta = os.path.abspath(carpeta)
            if os.path.normcase(carpeta) == os.path.normcase(self.carpeta.copias):
                raise ValueError("Esa es la carpeta de copias de siempre: elige otro sitio (un USB u otro disco).")
            a.set_config("copia_extra", carpeta)
            self.copia("segunda carpeta", forzar=True)
            fallo = a.config("copia_extra_error")
            if fallo: return {"ok": False, "mensaje": f"No se ha podido guardar la copia en {carpeta}: {fallo['motivo']}. Lo he dejado apuntado igualmente: se intentará en cada copia."}
            return {"ok": True, "mensaje": f"Hecho: cada copia se guardará también en {carpeta}"}
        if ruta == "/api/arranque":  # que Windows abra la app (en la bandeja) al iniciar sesión; no toca tus datos
            e = autoarranque.poner(bool(d.get("activar")), self.fija)
            return {"ok": True, "arranque": e, "mensaje": "FinanceBuddy se abrirá con Windows, en la bandeja" if e["activo"] else "FinanceBuddy ya no se abre con Windows"}
        if ruta == "/api/ejemplo": return self.modo_ejemplo(bool(d.get("activar")))
        if ruta == "/api/abrir_carpeta":
            os.startfile(self.carpeta.importar if d.get("que") != "datos" else self.carpeta.raiz); return {"ok": True}
        if ruta == "/api/copia":
            p = self.copia("manual", forzar=True)
            extra = a.config("copia_extra_error")
            return {"ok": True, "mensaje": f"Copia guardada: {os.path.basename(p)}" + (f" · la copia en {extra['carpeta']} ha fallado: {extra['motivo']}" if extra else "")}
        if ruta == "/api/restaurar": return self.restaurar(d)
        if ruta == "/api/vaciar":  # borra todos los datos (se hace una copia antes)
            if d.get("confirmar") != "BORRAR": raise ValueError("Escribe BORRAR para confirmar.")
            self.copia("antes de vaciar", forzar=True)
            with a.transaccion():
                a.con.execute("DELETE FROM registros"); a.con.execute("DELETE FROM config")
            plantilla.instalar(a)
            return {"ok": True, "mensaje": "Datos borrados (hay una copia en la carpeta Copias)."}
        return None

class Manejador(http.server.BaseHTTPRequestHandler):
    app: App = None
    protocol_version = "HTTP/1.1"
    def log_message(self, *a): pass

    def _enviar(self, codigo, cuerpo, tipo="application/json; charset=utf-8"):
        datos = cuerpo.encode("utf-8") if isinstance(cuerpo, str) else cuerpo
        self.send_response(codigo)
        self.send_header("Content-Type", tipo); self.send_header("Content-Length", str(len(datos)))
        self.send_header("Cache-Control", "no-store"); self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY"); self.send_header("Content-Security-Policy", "frame-ancestors 'none'")  # otra web no puede meter la app en un marco
        self.end_headers(); self.wfile.write(datos)

    def _json(self, obj, codigo=200): self._enviar(codigo, json.dumps(obj, ensure_ascii=False))

    def _host_ok(self):  # evita que otra web use la app a través del navegador (DNS rebinding)
        h = (self.headers.get("Host") or "").split(":")[0]
        return h in ("127.0.0.1", "localhost")

    def _autorizado(self): return self._host_ok() and secrets.compare_digest(self.headers.get("X-FB-Token") or "", self.app.token)

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        app = self.app
        if not self._host_ok(): return self._enviar(403, "Prohibido", "text/plain")
        try:
            if u.path in ("/", "/index.html"):
                html = leer(os.path.join(rutas.WEB, "index.html")).decode("utf-8")
                return self._enviar(200, html.replace("__TOKEN__", app.token).replace("__VERSION__", VERSION), "text/html; charset=utf-8")
            if u.path == "/paneles.js":  # módulos de las pantallas concatenados (comparten ámbito)
                partes = []
                for m in MODULOS:
                    src = leer(os.path.join(rutas.WEB, "paneles", m + ".js")).decode("utf-8")
                    partes.append(src)
                return self._enviar(200, json.dumps({"modulos": MODULOS, "fuentes": partes}, ensure_ascii=False))
            if u.path.startswith("/web/"):
                p = _dentro_de(rutas.WEB, urllib.parse.unquote(u.path[5:]))
                if not p or not os.path.isfile(p): return self._enviar(404, "No existe", "text/plain")
                tipo = mimetypes.guess_type(p)[0] or "application/octet-stream"
                if tipo.startswith("text/") or tipo.endswith("javascript"): tipo += "; charset=utf-8"
                return self._enviar(200, leer(p), tipo)
            if u.path in ("/pruebas.js", "/flujos.js") and app.pruebas:  # solo con --pruebas: cálculos y flujos con clics
                p = os.path.join(os.path.dirname(rutas.PAQUETE), "pruebas", "pruebas_calculos.js" if u.path == "/pruebas.js" else "pruebas_flujos.js")
                if u.path == "/flujos.js" and os.environ.get("FB_GUION"): p = os.environ["FB_GUION"]  # run.py --guion: unos clics sueltos en vez de los flujos
                return self._enviar(200, leer(p), "text/javascript; charset=utf-8")
            if not self._autorizado(): return self._json({"error": "no autorizado"}, 403)
            with app.lock:
                if u.path == "/api/datos": return self._json(app.datos())
                if u.path == "/api/copias": return self._json({"copias": app.copias()})
            return self._json({"error": "no existe"}, 404)
        except Exception as e:
            return self._json({"ok": False, "mensaje": str(e), "traza": traceback.format_exc()[-1500:]}, 500)

    def do_POST(self):
        u = urllib.parse.urlparse(self.path)
        if not self._autorizado(): return self._json({"error": "no autorizado"}, 403)
        largo = (self.headers.get("Content-Length") or "0").strip()
        if not (largo.isascii() and largo.isdigit()):  # negativo, con letras o vacío de cifras: no se lee nada
            self.close_connection = True
            return self._json({"ok": False, "mensaje": "Petición no válida"}, 400)
        n = int(largo)
        if n > MAX_SUBIDA * 1.4:
            self.close_connection = True  # el cuerpo no se ha leído: no se puede seguir usando esta conexión
            return self._json({"ok": False, "mensaje": "Demasiado grande"}, 413)
        try:
            d = json.loads(self.rfile.read(n) or b"{}")
            if u.path == "/api/salir":
                self._json({"ok": True})
                threading.Thread(target=self.server.shutdown, daemon=True).start()
                return
            with self.app.lock:
                r = self.app.manejar(u.path, d)
            if r is None: return self._json({"error": "no existe"}, 404)
            return self._json(r)
        except ValueError as e:
            return self._json({"ok": False, "mensaje": str(e)}, 400)
        except Exception as e:
            return self._json({"ok": False, "mensaje": f"Error inesperado: {e}", "traza": traceback.format_exc()[-1500:]}, 500)

class Servidor(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = False

def crear(app, puerto):
    srv = Servidor(("127.0.0.1", puerto), Manejador)  # si el puerto está ocupado falla aquí, sin tocar nada más
    Manejador.app = app
    return srv

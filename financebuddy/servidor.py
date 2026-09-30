# Servidor local de la app: sirve las pantallas (web/) y una API JSON sobre la base de datos.
# Solo escucha en 127.0.0.1 y cada arranque genera una clave que la página envía en la cabecera X-FB-Token.
import base64, datetime, http.server, io, json, mimetypes, os, re, secrets, socketserver, tempfile, threading, traceback, urllib.parse
from . import VERSION, clasificar as C, detectar, importar as IM, modelo, plantilla, rutas
from .almacen import Almacen

MODULOS = ["datos", "calculos", "componentes", "graficos", "inicio", "formularios", "pantallas"]
MAX_SUBIDA = 25 * 1024 * 1024
ACENTOS = ["violeta", "azul", "verde", "coral", "rosa", "grafito"]  # colores de acento (estilos.css: body[data-acento])

def leer(p):
    with io.open(p, "rb") as fh: return fh.read()

class App:
    """Estado del servidor: carpeta de datos abierta, base de datos y clave de la sesión."""
    def __init__(self, raiz, hoy=None, pruebas=False):
        self.token = secrets.token_urlsafe(24)
        self.hoy = hoy
        self.pruebas = pruebas
        self.lock = threading.RLock()
        self.ejemplo = False
        self.abrir(raiz)

    def abrir(self, raiz):
        self.carpeta = rutas.Carpeta(raiz)
        self.alm = Almacen(self.carpeta.db)
        plantilla.instalar(self.alm)
        self.alm.copia(self.carpeta.copias)

    # ───── datos para la página ─────
    def datos(self):
        regs = self.alm.todos_por_tipo()
        pend = regs.pop("pendiente", [])
        if pend:  # la categoría más probable de cada duda del banco (por tu historial)
            mem = C.memoria(regs.get("movimiento", []))
            for p in pend:
                f = p.get("fila") or {}
                if p.get("tipo_import") == "banco" and f.get("clase") != "transferencia":
                    p["sugerencia"] = C.sugerir(f.get("texto", ""), f.get("importe", 0), mem, f.get("cat", ""))
        regs.pop("ignorado", None)
        return {"registros": regs, "pendientes": pend, "config": self.alm.config(),
                "info": {"version": VERSION, "carpeta": self.carpeta.raiz, "hoy": self.hoy, "ejemplo": self.ejemplo,
                         "archivos": [{"nombre": os.path.basename(p), "tipo": t} for p, t in IM.archivos_pendientes(self.carpeta)]}}

    # ───── acciones ─────
    def importar_carpeta(self):
        resultados = []
        for ruta, tipo in IM.archivos_pendientes(self.carpeta):
            resultados.append(self._importar(ruta, tipo))
        if not resultados: return {"ok": True, "resultados": [], "mensaje": "No hay archivos en la carpeta Importar."}
        return {"ok": all(r.get("ok") or r.get("necesita") for r in resultados), "resultados": resultados}

    def _importar(self, ruta, tipo=None, cuenta=None, perfil=None):
        nombre = os.path.basename(ruta)
        try:
            r = IM.importar_archivo(self.alm, self.carpeta, ruta, tipo, cuenta, perfil)
            return {**r, "archivo": nombre}
        except IM.NecesitaPerfil as e:
            return {"ok": False, "necesita": "perfil", "archivo": nombre, **e.info, "tipo": tipo or e.info.get("tipo")}
        except IM.NecesitaCuenta as e:
            return {"ok": False, "necesita": "cuenta", **e.info}
        except Exception as e:
            return {"ok": False, "archivo": nombre, "mensaje": f"{nombre}: {e}"}

    def subir(self, d):
        nombre = os.path.basename(str(d.get("nombre") or "archivo.csv"))
        nombre = re.sub(r'[\\/:*?"<>|]', "_", nombre)
        if not nombre.lower().endswith(IM.EXTENSIONES): return {"ok": False, "mensaje": "Solo se admiten archivos Excel (.xlsx, .xls) o CSV."}
        datos = base64.b64decode(d.get("contenido") or "")
        if len(datos) > MAX_SUBIDA: return {"ok": False, "mensaje": "El archivo es demasiado grande."}
        tipo = d.get("tipo") if d.get("tipo") in ("banco", "inversion") else None
        ruta = os.path.join(self.carpeta.carpeta_import(tipo), nombre)
        with io.open(ruta, "wb") as fh: fh.write(datos)
        return self._importar(ruta, tipo)

    def reintentar(self, d):
        """Tras configurar el formato o elegir la cuenta: vuelve a importar el archivo."""
        nombre = os.path.basename(d["archivo"])
        ruta = next((p for p, t in IM.archivos_pendientes(self.carpeta) if os.path.basename(p) == nombre), None)
        if not ruta: return {"ok": False, "mensaje": f"No encuentro «{nombre}» en la carpeta Importar."}
        tipo = d.get("tipo") if d.get("tipo") in ("banco", "inversion") else None
        if d.get("columnas"):
            IM.crear_perfil(self.alm, d.get("perfil") or os.path.splitext(nombre)[0], tipo or "banco", d["columnas"], d.get("cuenta"),
                            d.get("compras_negativas", True))
        return self._importar(ruta, tipo, d.get("cuenta"), d.get("perfil"))

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

    def cierre(self, d):
        """Registro de patrimonio del día del cierre + valores de los activos + nota del mes."""
        fecha = modelo.fecha(d.get("fecha"))
        if not fecha: raise ValueError("Falta la fecha del cierre.")
        with self.alm.transaccion():
            reg = {"fecha": fecha, "saldos": d.get("saldos") or {}, "valores": d.get("valores") or {}, "otros": d.get("otros"), "deudas": d.get("deudas"), "nota": d.get("nota") or ""}
            ya = next((r for r in self.alm.todos("patrimonio") if r["fecha"] == fecha), None)
            self.alm.guardar("patrimonio", reg, ya["id"] if ya else None)
            for a in self.alm.todos("activo"):
                v = modelo.numero((d.get("valores") or {}).get(a["nombre"]))
                if v is not None: self.alm.guardar("activo", {**a, "valor": v, "fecha_valor": fecha}, a["id"])
            mes = d.get("mes") or fecha[:7]
            c = next((r for r in self.alm.todos("cierre") if r["mes"] == mes), None)
            self.alm.guardar("cierre", {"mes": mes, "fecha": fecha, "notas": d.get("notas") or ""}, c["id"] if c else None)
        return {"ok": True, "mensaje": f"Mes cerrado: registro de patrimonio del {IM.fmt(fecha)} guardado."}

    def valores(self, d):
        fecha = modelo.fecha(d.get("fecha")) or (self.hoy or datetime.date.today().isoformat())
        n = 0
        with self.alm.transaccion():
            for a in self.alm.todos("activo"):
                v = modelo.numero((d.get("valores") or {}).get(a["nombre"]))
                if v is not None: self.alm.guardar("activo", {**a, "valor": v, "fecha_valor": fecha}, a["id"]); n += 1
        return {"ok": True, "mensaje": f"Valores actualizados ({n})."}

    def cambiar_carpeta(self, d):
        nueva = os.path.abspath(os.path.expandvars(str(d.get("carpeta") or "").strip().strip('"')))
        if not nueva or len(nueva) < 4: raise ValueError("Escribe una carpeta válida.")
        self.alm.cerrar()
        self.abrir(nueva)
        a = rutas.leer_ajustes(); a["datos"] = nueva; rutas.guardar_ajustes(a)
        return {"ok": True, "mensaje": f"Usando la carpeta {nueva}"}

    def modo_ejemplo(self, activar):
        """Cambia a una carpeta temporal con datos inventados (o vuelve a la carpeta de datos del usuario)."""
        self.alm.cerrar()
        if activar:
            from . import ejemplo
            raiz = os.path.join(tempfile.gettempdir(), "FinanceBuddy-ejemplo")
            ejemplo.crear(raiz, hoy=self.hoy)
            self.abrir(raiz)
            self.ejemplo = True
        else:
            self.abrir(rutas.leer_ajustes().get("datos") or rutas.carpeta_por_defecto())
            self.ejemplo = False
        return {"ok": True}

    def restaurar(self, d):
        nombre = os.path.basename(str(d.get("copia") or ""))
        origen = os.path.join(self.carpeta.copias, nombre)
        if not nombre.endswith(".db") or not os.path.exists(origen): raise ValueError("No encuentro esa copia.")
        self.alm.copia(self.carpeta.copias, "antes de restaurar", forzar=True)
        import sqlite3
        src = sqlite3.connect(origen)
        with self.alm.lock:
            src.backup(self.alm.con)
        src.close()
        return {"ok": True, "mensaje": f"Restaurada la copia «{nombre}»."}

    def copias(self):
        return sorted((n for n in os.listdir(self.carpeta.copias) if n.endswith(".db")), reverse=True)

    def manejar(self, ruta, d):
        """API de escritura. Devuelve un dict JSON."""
        a = self.alm
        if ruta == "/api/guardar":
            tipo = d.get("tipo")
            if tipo not in modelo.EDITABLES: raise ValueError("Tipo no editable.")
            id = int(d["id"]) if d.get("id") else None
            return {"ok": True, "id": a.guardar(tipo, d.get("datos") or {}, id)}
        if ruta == "/api/borrar":
            if d.get("tipo") not in modelo.EDITABLES: raise ValueError("Tipo no editable.")
            a.borrar(d["tipo"], int(d["id"])); return {"ok": True}
        if ruta == "/api/config":
            for k, v in (d or {}).items():
                if k in ("limite_variable",): a.set_config(k, modelo.numero(v) or 0)
                elif k == "acento": a.set_config(k, v if v in ACENTOS else ACENTOS[0])
                elif k in ("inicio", "inicio_ocultos"):  # paneles de Inicio visibles (en orden) y ocultos
                    a.set_config(k, [x for x in (v if isinstance(v, list) else []) if isinstance(x, str) and re.fullmatch(r"[a-z]{2,20}", x)][:20])
            return {"ok": True}
        if ruta == "/api/recategorizar": return {"ok": True, "mensaje": IM.recategorizar(a, int(d["id"]), d)}
        if ruta == "/api/parecidos": return {"ok": True, **IM.parecidos(a, int(d["id"]))}
        if ruta == "/api/importar/carpeta": return self.importar_carpeta()
        if ruta == "/api/importar/subir": return self.subir(d)
        if ruta == "/api/importar/reintentar": return self.reintentar(d)
        if ruta == "/api/resolver": return {"ok": True, "mensaje": IM.resolver(a, int(d["id"]), d)}
        if ruta == "/api/detectar": return {"ok": True, "fijos": detectar.fijos(a), "origenes": detectar.origenes(a)}
        if ruta == "/api/fijos": return {"ok": True, "mensaje": detectar.crear(a, d.get("fijos") or [])}
        if ruta == "/api/bienvenida": return self.bienvenida(d)
        if ruta == "/api/cierre": return self.cierre(d)
        if ruta == "/api/valores": return self.valores(d)
        if ruta == "/api/carpeta": return self.cambiar_carpeta(d)
        if ruta == "/api/ejemplo": return self.modo_ejemplo(bool(d.get("activar")))
        if ruta == "/api/abrir_carpeta":
            os.startfile(self.carpeta.importar if d.get("que") != "datos" else self.carpeta.raiz); return {"ok": True}
        if ruta == "/api/copia":
            p = a.copia(self.carpeta.copias, "manual", forzar=True); return {"ok": True, "mensaje": f"Copia guardada: {os.path.basename(p)}"}
        if ruta == "/api/restaurar": return self.restaurar(d)
        if ruta == "/api/vaciar":  # borra todos los datos (se hace una copia antes)
            if d.get("confirmar") != "BORRAR": raise ValueError("Escribe BORRAR para confirmar.")
            a.copia(self.carpeta.copias, "antes de vaciar", forzar=True)
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
                rel = os.path.normpath(urllib.parse.unquote(u.path[5:]))
                p = os.path.join(rutas.WEB, rel)
                if rel.startswith("..") or not os.path.isfile(p): return self._enviar(404, "No existe", "text/plain")
                tipo = mimetypes.guess_type(p)[0] or "application/octet-stream"
                if tipo.startswith("text/") or tipo.endswith("javascript"): tipo += "; charset=utf-8"
                return self._enviar(200, leer(p), tipo)
            if u.path == "/pruebas.js" and app.pruebas:
                p = os.path.join(os.path.dirname(rutas.PAQUETE), "pruebas", "pruebas_calculos.js")
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
        n = int(self.headers.get("Content-Length") or 0)
        if n > MAX_SUBIDA * 1.4: return self._json({"ok": False, "mensaje": "Demasiado grande"}, 413)
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
    Manejador.app = app
    return Servidor(("127.0.0.1", puerto), Manejador)

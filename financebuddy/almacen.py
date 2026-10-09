# Base de datos: un archivo SQLite con una tabla de registros (JSON por registro, ver modelo.py) y la configuración.
import datetime, glob, json, os, pathlib, re, shutil, sqlite3, threading
from contextlib import contextmanager
from . import modelo

class BaseDañada(Exception):
    """El archivo datos.db no es una base de datos (o está corrupto). Se arregla restaurando una copia."""
    def __init__(self, ruta, causa):
        super().__init__(f"El archivo de datos está dañado y no se puede abrir ({causa}).")
        self.ruta, self.causa = ruta, causa

class BaseMasNueva(Exception):
    """El archivo datos.db lo ha guardado una versión más nueva de la app: esta no sabe leerlo y podría estropearlo."""
    def __init__(self, ruta):
        super().__init__("esos datos son de una versión más nueva de FinanceBuddy: actualiza la app para abrirlos")
        self.ruta = ruta

ESQUEMA = """
CREATE TABLE IF NOT EXISTS registros(id INTEGER PRIMARY KEY, tipo TEXT NOT NULL, datos TEXT NOT NULL, creado TEXT, modificado TEXT);
CREATE INDEX IF NOT EXISTS registros_tipo ON registros(tipo);
CREATE TABLE IF NOT EXISTS config(clave TEXT PRIMARY KEY, valor TEXT);
"""
VERSION_ESQUEMA = 2
COPIAS_MAX = 30

RE_COPIA = re.compile(r"datos (\d{4}-\d{2}-\d{2})(?: (\d{6}))?")

def _cuando(p):
    """Cuándo se hizo una copia, por su nombre («datos 2026-10-06.db» = ese día a las 00:00; «datos 2026-10-06 173000 manual.db»).
    Ordenar por el nombre tal cual no vale: «datos 2026-10-06 173000 manual.db» va ANTES que «datos 2026-10-06.db» (el espacio
    es menor que el punto) y se tomaba la copia vieja por la nueva."""
    m = RE_COPIA.match(os.path.basename(p))
    if m: return (m.group(1), m.group(2) or "000000")
    t = datetime.datetime.fromtimestamp(os.path.getmtime(p))
    return (t.strftime("%Y-%m-%d"), t.strftime("%H%M%S"))

def copias_de(carpeta):
    """Las copias de seguridad de una carpeta, de la más antigua a la más reciente."""
    return sorted(glob.glob(os.path.join(carpeta, "datos *.db")), key=_cuando)

def ultima_copia(carpeta):
    """La copia de seguridad más reciente de una carpeta Copias, o None."""
    copias = copias_de(carpeta)
    return copias[-1] if copias else None

def comprobar_copia(ruta):
    """Antes de restaurar una copia: que sea una base de FinanceBuddy entera y no de una versión más nueva de la app.
    La abre solo para leer. Lanza ValueError con el motivo en español; si no, no hace nada."""
    try:
        con = sqlite3.connect(pathlib.Path(os.path.abspath(ruta)).as_uri() + "?mode=ro&immutable=1", uri=True)  # sin -wal ni -shm al lado
        try:
            if con.execute("PRAGMA integrity_check").fetchone()[0] != "ok": raise sqlite3.DatabaseError("integridad")
            tablas = {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            if not {"registros", "config"} <= tablas: raise ValueError("Esa copia no es de FinanceBuddy: no la restauro. Tus datos no se han tocado.")
            f = con.execute("SELECT valor FROM config WHERE clave='version_esquema'").fetchone()
        finally: con.close()
    except sqlite3.DatabaseError:
        raise ValueError("Esa copia está dañada y no se puede usar. Tus datos no se han tocado: elige otra copia.")
    try: v = json.loads(f[0]) if f else None
    except ValueError: v = None
    if isinstance(v, int) and v > VERSION_ESQUEMA:
        raise ValueError("Esa copia es de una versión más nueva de FinanceBuddy: actualiza la app para restaurarla. Tus datos no se han tocado.")

def restaurar_archivo(db, copia):
    """Aparta el datos.db dañado («datos.db.roto …») y deja la copia en su lugar. → ruta del archivo apartado."""
    roto = f"{db}.roto {datetime.datetime.now():%Y-%m-%d %H%M%S}"
    os.replace(db, roto)
    for sufijo in ("-wal", "-shm"):
        try: os.remove(db + sufijo)
        except OSError: pass
    shutil.copy2(copia, db)
    return roto

class Almacen:
    def __init__(self, ruta):
        self.ruta = ruta
        self.con = sqlite3.connect(ruta, check_same_thread=False, isolation_level=None)
        self.lock = threading.RLock()
        self._tx = 0
        try:
            self.con.execute("PRAGMA journal_mode=WAL")
            self.con.executescript(ESQUEMA)
            v = self.config("version_esquema")
            if v is None or (isinstance(v, int) and v < VERSION_ESQUEMA): self.set_config("version_esquema", VERSION_ESQUEMA)
            elif isinstance(v, int) and v > VERSION_ESQUEMA:
                self.con.close()
                raise BaseMasNueva(ruta)
        except sqlite3.DatabaseError as e:  # no es una base de datos, o está corrupta: hay que restaurar una copia
            self.con.close()
            raise BaseDañada(ruta, str(e))
        self.con.execute("DELETE FROM registros WHERE tipo='composicion'")  # informes X-Ray de versiones anteriores

    # ───── transacciones (anidables: solo la más externa hace COMMIT) ─────
    @contextmanager
    def transaccion(self):
        with self.lock:
            if self._tx == 0: self.con.execute("BEGIN")
            self._tx += 1
            try:
                yield self
            except BaseException:
                self._tx -= 1
                if self._tx == 0: self.con.execute("ROLLBACK")
                raise
            self._tx -= 1
            if self._tx == 0: self.con.execute("COMMIT")

    @contextmanager
    def simular(self):
        """Todo lo que se escriba dentro se deshace al salir: sirve para enseñar qué pasaría (vista previa de una importación)
        con exactamente el mismo código que lo haría de verdad. No se puede anidar dentro de otra transacción."""
        with self.lock:
            if self._tx != 0: raise RuntimeError("No se puede simular dentro de otra operación.")
            self.con.execute("BEGIN"); self._tx = 1
            try: yield self
            finally:
                self._tx = 0
                self.con.execute("ROLLBACK")

    # ───── registros ─────
    def todos(self, tipo):
        with self.lock:
            filas = self.con.execute("SELECT id, datos FROM registros WHERE tipo=? ORDER BY id", (tipo,)).fetchall()
        return [{"id": i, **json.loads(d)} for i, d in filas]

    def todos_por_tipo(self):
        out = {t: [] for t in modelo.CAMPOS}
        with self.lock:
            for i, t, d in self.con.execute("SELECT id, tipo, datos FROM registros ORDER BY id"):
                out.setdefault(t, []).append({"id": i, **json.loads(d)})
        return out

    def obtener(self, tipo, id):
        with self.lock:
            f = self.con.execute("SELECT datos FROM registros WHERE tipo=? AND id=?", (tipo, id)).fetchone()
        return {"id": id, **json.loads(f[0])} if f else None

    def buscar(self, tipo, **igual):
        return [r for r in self.todos(tipo) if all(r.get(k) == v for k, v in igual.items())]

    def guardar(self, tipo, datos, id=None):
        """Crea (id=None) o reemplaza un registro. Valida los campos, comprueba nombres únicos y propaga renombres."""
        d = modelo.limpiar(tipo, datos)
        ahora = datetime.datetime.now().isoformat(timespec="seconds")
        with self.transaccion():
            campo = modelo.UNICOS.get(tipo)
            if campo and d.get(campo):
                for r in self.todos(tipo):
                    if r["id"] != id and str(r.get(campo, "")).lower() == str(d[campo]).lower():
                        raise ValueError(f"Ya existe {'una' if tipo in ('cuenta', 'categoria') else 'un'} {tipo} «{d[campo]}»")
            if id is None:
                cur = self.con.execute("INSERT INTO registros(tipo, datos, creado, modificado) VALUES(?,?,?,?)", (tipo, json.dumps(d, ensure_ascii=False), ahora, ahora))
                return cur.lastrowid
            viejo = self.obtener(tipo, id)
            if viejo is None: raise ValueError(f"No existe el registro {tipo} {id}")
            self.con.execute("UPDATE registros SET datos=?, modificado=? WHERE id=? AND tipo=?", (json.dumps(d, ensure_ascii=False), ahora, id, tipo))
            if tipo in modelo.REFERENCIAS and viejo.get("nombre") and d.get("nombre") and viejo["nombre"] != d["nombre"]:
                self._renombrar(tipo, viejo["nombre"], d["nombre"])
            return id

    def _renombrar(self, tipo, viejo, nuevo):
        for t, campo in modelo.REFERENCIAS[tipo]:
            for r in self.todos(t):
                cambio = False
                if campo.endswith("[]"):  # elementos de una lista
                    lista = r.get(campo[:-2]) or []
                    if viejo in lista: r[campo[:-2]] = [nuevo if x == viejo else x for x in lista]; cambio = True
                elif campo.endswith("*"):  # claves de un mapa
                    m = r.get(campo[:-1]) or {}
                    if viejo in m: m[nuevo] = m.pop(viejo); cambio = True
                elif r.get(campo) == viejo: r[campo] = nuevo; cambio = True
                if cambio:
                    i = r.pop("id")
                    self.con.execute("UPDATE registros SET datos=? WHERE id=?", (json.dumps(r, ensure_ascii=False), i))

    def insertar_crudo(self, tipo, d):
        """Inserta sin validar (datos ya limpios, p. ej. en importaciones masivas)."""
        ahora = datetime.datetime.now().isoformat(timespec="seconds")
        with self.lock:
            return self.con.execute("INSERT INTO registros(tipo, datos, creado, modificado) VALUES(?,?,?,?)",
                                    (tipo, json.dumps(d, ensure_ascii=False), ahora, ahora)).lastrowid

    def borrar(self, tipo, id):
        with self.transaccion():
            self.con.execute("DELETE FROM registros WHERE tipo=? AND id=?", (tipo, id))

    def contar(self, tipo):
        with self.lock:
            return self.con.execute("SELECT COUNT(*) FROM registros WHERE tipo=?", (tipo,)).fetchone()[0]

    # ───── configuración ─────
    def config(self, clave=None, defecto=None, sin=None):
        """Un ajuste (o todos). `sin`: al pedir todos, deja fuera los que empiezan por ese prefijo (sin leerlos)."""
        with self.lock:
            if clave is None:
                filas = self.con.execute("SELECT clave, valor FROM config WHERE clave NOT LIKE ? ESCAPE '\\'", (sin.replace("%", "\\%").replace("_", "\\_") + "%",)).fetchall() if sin \
                    else self.con.execute("SELECT clave, valor FROM config").fetchall()
                return {k: json.loads(v) for k, v in filas}
            f = self.con.execute("SELECT valor FROM config WHERE clave=?", (clave,)).fetchone()
        return json.loads(f[0]) if f else defecto

    def set_config(self, clave, valor):
        with self.lock:
            self.con.execute("INSERT INTO config(clave, valor) VALUES(?,?) ON CONFLICT(clave) DO UPDATE SET valor=excluded.valor",
                             (clave, json.dumps(valor, ensure_ascii=False)))

    # ───── copias de seguridad ─────
    def instantanea(self):
        """Foto en memoria de todos los datos (para poder deshacer la última decisión)."""
        with self.lock:
            return ([tuple(r) for r in self.con.execute("SELECT id,tipo,datos FROM registros")], [tuple(r) for r in self.con.execute("SELECT clave,valor FROM config")])

    def recuperar(self, foto):
        regs, cfg = foto
        with self.transaccion():
            self.con.execute("DELETE FROM registros"); self.con.execute("DELETE FROM config")
            self.con.executemany("INSERT INTO registros(id,tipo,datos) VALUES(?,?,?)", regs)
            self.con.executemany("INSERT INTO config(clave,valor) VALUES(?,?)", cfg)

    def copia(self, carpeta, motivo="diaria", forzar=False, extra=None):
        """Copia datos.db en carpeta/datos AAAA-MM-DD[ motivo].db (una al día salvo `forzar`). Guarda las últimas 30.
        `extra`: segunda carpeta (otro disco, un USB, una carpeta sincronizada) donde dejar la misma copia; si no se puede
        (el USB no está puesto), no se interrumpe nada: se apunta el motivo en `copia_extra_error` para enseñarlo en Ajustes."""
        os.makedirs(carpeta, exist_ok=True)
        hoy = datetime.date.today().isoformat()
        if not forzar and glob.glob(os.path.join(carpeta, f"datos {hoy}*.db")): return None
        nombre = f"datos {hoy}" + (f" {datetime.datetime.now():%H%M%S} {motivo}" if forzar else "") + ".db"
        destino = os.path.join(carpeta, nombre)
        n = 1
        while os.path.exists(destino):  # dos copias con el mismo motivo en el mismo segundo: la segunda no pisa la primera
            n += 1; destino = os.path.join(carpeta, f"{nombre[:-3]} ({n}).db")
        with self.lock:
            dst = sqlite3.connect(destino)
            self.con.backup(dst)
            dst.close()
        self._limpiar_copias(carpeta)
        if extra: self._copia_extra(destino, str(extra))
        return destino

    def _limpiar_copias(self, carpeta):
        for viejo in copias_de(carpeta)[:-COPIAS_MAX]:
            try: os.remove(viejo)
            except OSError: pass

    def _copia_extra(self, origen, carpeta):
        try:
            os.makedirs(carpeta, exist_ok=True)
            shutil.copy2(origen, os.path.join(carpeta, os.path.basename(origen)))
            self._limpiar_copias(carpeta)
            self.set_config("copia_extra_error", None)
        except OSError as e:
            self.set_config("copia_extra_error", {"carpeta": carpeta, "motivo": getattr(e, "strerror", None) or str(e),
                                                  "cuando": datetime.date.today().isoformat()})

    def usos(self, tipo, reg):
        """Cuántos registros apuntan a este por su nombre (modelo.REFERENCIAS) → [(tipo, nº)]. Para avisar antes de borrar."""
        nombre = (reg or {}).get("nombre")
        if not nombre or tipo not in modelo.REFERENCIAS: return []
        cuenta = {}
        for t, campo in modelo.REFERENCIAS[tipo]:
            n = 0
            for r in self.todos(t):
                if campo.endswith("[]"): n += nombre in (r.get(campo[:-2]) or [])
                elif campo.endswith("*"): n += nombre in (r.get(campo[:-1]) or {})
                else: n += r.get(campo) == nombre
            if n: cuenta[t] = cuenta.get(t, 0) + n
        return sorted(cuenta.items(), key=lambda x: -x[1])

    def cerrar(self):
        with self.lock: self.con.close()

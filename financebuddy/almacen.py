# Base de datos: un archivo SQLite con una tabla de registros (JSON por registro, ver modelo.py) y la configuración.
import datetime, glob, json, os, shutil, sqlite3, threading
from contextlib import contextmanager
from . import modelo

ESQUEMA = """
CREATE TABLE IF NOT EXISTS registros(id INTEGER PRIMARY KEY, tipo TEXT NOT NULL, datos TEXT NOT NULL, creado TEXT, modificado TEXT);
CREATE INDEX IF NOT EXISTS registros_tipo ON registros(tipo);
CREATE TABLE IF NOT EXISTS config(clave TEXT PRIMARY KEY, valor TEXT);
"""
VERSION_ESQUEMA = 1
COPIAS_MAX = 30

class Almacen:
    def __init__(self, ruta):
        self.ruta = ruta
        self.con = sqlite3.connect(ruta, check_same_thread=False, isolation_level=None)
        self.con.execute("PRAGMA journal_mode=WAL")
        self.lock = threading.RLock()
        self._tx = 0
        self.con.executescript(ESQUEMA)
        if self.config("version_esquema") is None: self.set_config("version_esquema", VERSION_ESQUEMA)

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
    def config(self, clave=None, defecto=None):
        with self.lock:
            if clave is None: return {k: json.loads(v) for k, v in self.con.execute("SELECT clave, valor FROM config")}
            f = self.con.execute("SELECT valor FROM config WHERE clave=?", (clave,)).fetchone()
        return json.loads(f[0]) if f else defecto

    def set_config(self, clave, valor):
        with self.lock:
            self.con.execute("INSERT INTO config(clave, valor) VALUES(?,?) ON CONFLICT(clave) DO UPDATE SET valor=excluded.valor",
                             (clave, json.dumps(valor, ensure_ascii=False)))

    # ───── copias de seguridad ─────
    def copia(self, carpeta, motivo="diaria", forzar=False):
        """Copia datos.db en carpeta/datos AAAA-MM-DD[ motivo].db (una al día salvo `forzar`). Guarda las últimas 30."""
        os.makedirs(carpeta, exist_ok=True)
        hoy = datetime.date.today().isoformat()
        if not forzar and glob.glob(os.path.join(carpeta, f"datos {hoy}*.db")): return None
        nombre = f"datos {hoy}" + (f" {datetime.datetime.now():%H%M%S} {motivo}" if forzar else "") + ".db"
        destino = os.path.join(carpeta, nombre)
        with self.lock:
            dst = sqlite3.connect(destino)
            self.con.backup(dst)
            dst.close()
        for viejo in sorted(glob.glob(os.path.join(carpeta, "datos *.db")))[:-COPIAS_MAX]:
            try: os.remove(viejo)
            except OSError: pass
        return destino

    def cerrar(self):
        with self.lock: self.con.close()

# Las claves de los servicios opcionales (Jev, CoinGecko) se guardan cifradas con la protección de datos de Windows (DPAPI):
# solo las puede leer tu usuario de Windows en este ordenador. Así no viajan legibles en datos.db ni en sus copias de
# seguridad (la carpeta Copias, un USB, una carpeta sincronizada) ni si le pasas el archivo a alguien.
# La contrapartida: al llevar los datos a otro ordenador (o a otro usuario) hay que volver a pegar la clave.
# Fuera de Windows no hay DPAPI: la clave se queda como texto, igual que antes.
import base64, ctypes

MARCA = "dpapi:"

class _Blob(ctypes.Structure):
    _fields_ = [("n", ctypes.c_uint32), ("p", ctypes.POINTER(ctypes.c_char))]

def _dpapi(nombre, datos):
    """CryptProtectData / CryptUnprotectData sobre unos bytes. Lanza OSError (o AttributeError fuera de Windows) si no puede."""
    fn = getattr(ctypes.windll.crypt32, nombre)
    buf = ctypes.create_string_buffer(datos, len(datos))
    ent, sal = _Blob(len(datos), ctypes.cast(buf, ctypes.POINTER(ctypes.c_char))), _Blob()
    if not fn(ctypes.byref(ent), None, None, None, None, 0x01, ctypes.byref(sal)):  # 0x01: sin ventanas (CRYPTPROTECT_UI_FORBIDDEN)
        raise OSError("DPAPI")
    try: return ctypes.string_at(sal.p, sal.n)
    finally:
        liberar = ctypes.windll.kernel32.LocalFree
        liberar.argtypes = [ctypes.c_void_p]
        liberar(ctypes.cast(sal.p, ctypes.c_void_p))

def cifrada(valor):
    return str(valor or "").startswith(MARCA)

def guardar(texto):
    """Lo que se escribe en la base de datos: la clave cifrada («dpapi:…») o, si no se puede cifrar, tal cual."""
    texto = str(texto or "")
    if not texto or cifrada(texto): return texto
    try: return MARCA + base64.b64encode(_dpapi("CryptProtectData", texto.encode("utf-8"))).decode("ascii")
    except Exception: return texto

def leer(valor):
    """La clave en claro. "" si no hay o si se cifró en otro ordenador (o con otro usuario) y aquí no se puede leer."""
    valor = str(valor or "")
    if not cifrada(valor): return valor
    try: return _dpapi("CryptUnprotectData", base64.b64decode(valor[len(MARCA):])).decode("utf-8")
    except Exception: return ""

def proteger(alm, ajuste, campo):
    """Si la clave de `config[ajuste][campo]` está en claro (datos de una versión anterior), la deja cifrada."""
    c = alm.config(ajuste) or {}
    v = c.get(campo)
    if v and not cifrada(v):
        nuevo = guardar(v)
        if nuevo != v: alm.set_config(ajuste, {**c, campo: nuevo})

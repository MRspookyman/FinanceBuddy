# Genera recursos/icono.ico (el del .exe) con el mismo dibujo que web/icono.svg. Uso: python recursos/crear_icono.py
import os
from PIL import Image, ImageDraw

def dibujar(n):
    im = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    k = n / 64
    d.rounded_rectangle([0, 0, n - 1, n - 1], radius=14 * k, fill=(91, 75, 214))
    w = max(1, round(6 * k))
    for x, y in ((20, 30), (30, 22), (40, 34)):
        d.line([(x * k, 44 * k), (x * k, y * k)], fill="white", width=w)
    d.line([(16 * k, 44 * k), (48 * k, 44 * k)], fill="white", width=w)
    return im

ruta = os.path.join(os.path.dirname(os.path.abspath(__file__)), "icono.ico")
dibujar(256).save(ruta, sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print(ruta)

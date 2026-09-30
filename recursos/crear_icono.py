# Genera recursos/icono.ico (el del .exe) con el mismo dibujo que web/icono.svg (una cartera salvia y arena).
# Uso: python recursos/crear_icono.py
import os
from PIL import Image, ImageDraw

SALVIA, SALVIA_2, CREMA, ARENA = (111, 149, 119), (169, 194, 164), (251, 246, 236), (230, 201, 149)

def dibujar(n):
    k = n / 64
    fondo = Image.new("RGBA", (n, n))
    for y in range(n):  # degradado diagonal aproximado (vertical: basta a este tamaño)
        t = y / max(1, n - 1)
        ImageDraw.Draw(fondo).line([(0, y), (n, y)], fill=tuple(round(a + (b - a) * t) for a, b in zip(SALVIA, SALVIA_2)))
    mascara = Image.new("L", (n, n), 0)
    ImageDraw.Draw(mascara).rounded_rectangle([0, 0, n - 1, n - 1], radius=16 * k, fill=255)
    im = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    im.paste(fondo, (0, 0), mascara)
    d = ImageDraw.Draw(im)
    d.polygon([(13 * k, 26 * k), (17 * k, 17.8 * k), (36.6 * k, 13.5 * k), (44 * k, 20 * k), (13 * k, 22 * k)], fill=ARENA)
    d.rounded_rectangle([13 * k, 20 * k, 51 * k, 48 * k], radius=7 * k, fill=CREMA)
    d.rounded_rectangle([36 * k, 29 * k, 51 * k, 39 * k], radius=5 * k, fill=ARENA)
    d.ellipse([39.8 * k, 31.8 * k, 44.2 * k, 36.2 * k], fill=SALVIA)
    return im

ruta = os.path.join(os.path.dirname(os.path.abspath(__file__)), "icono.ico")
dibujar(256).save(ruta, sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print(ruta)

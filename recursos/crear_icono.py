# Genera recursos/icono.ico (el del .exe y la bandeja) con el mismo dibujo que web/icono.svg (tres barras que suben, sobre tinta).
# Uso: python recursos/crear_icono.py
import os
from PIL import Image, ImageDraw

TINTA, VERDE = (16, 21, 28), (98, 211, 166)

def dibujar(n):
    k = n / 32
    im = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, n - 1, n - 1], radius=8 * k, fill=TINTA)
    gris = lambda a: tuple(round(t + (255 - t) * a) for t in TINTA)  # blanco con transparencia `a` sobre la tinta
    d.rounded_rectangle([7 * k, 17 * k, 11.5 * k, 25 * k], radius=1.5 * k, fill=gris(.5))
    d.rounded_rectangle([13.75 * k, 12 * k, 18.25 * k, 25 * k], radius=1.5 * k, fill=gris(.8))
    d.rounded_rectangle([20.5 * k, 7 * k, 25 * k, 25 * k], radius=1.5 * k, fill=VERDE)
    return im

ruta = os.path.join(os.path.dirname(os.path.abspath(__file__)), "icono.ico")
dibujar(256).save(ruta, sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print(ruta)

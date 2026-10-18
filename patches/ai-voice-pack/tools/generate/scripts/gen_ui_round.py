# -*- coding: utf-8 -*-
"""Генерация 9-slice «пилюль» для мод-интерфейса -> mod/images/ui/round*.png.

В Ren'Py 7.4 нет нативного border-radius: скругление кнопок делается
Frame-нарезкой скруглённых картинок (белая заливка + прозрачные углы),
цвет задаётся в стилях через TintMatrix. Stdlib-only (zlib/struct/math),
сглаживание — суперсэмплинг x4. Запуск:

    python tools/gen_ui_round.py

Alphas: round=255 (заливка/акцент), round_soft=0x1f (12% — призрачные
кнопки), round_ghost=0x33 (20% — hover), round_dim=0x66 (40% — бейдж).
"""
import math
import os
import struct
import zlib

SIZE = 72     # итоговый размер png
RADIUS = 14   # радиус скругления (срез Frame=16: < высоты самых мелких кнопок)
SS = 4        # суперсэмплинг (степень сглаживания)

ALPHAS = {
    "round": 255,
    "round_soft": 0x1F,
    "round_ghost": 0x33,
    "round_dim": 0x66,
}


def _inside(x, y, r, size):
    """Точка внутри скруглённого прямоугольника (SDF по центру-clamp)."""
    cx = min(max(x, r), size - r)
    cy = min(max(y, r), size - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def _chunk(tag, data):
    c = tag + data
    return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)


def make_png(path, alpha):
    big = SIZE * SS
    br = RADIUS * SS
    cell = float(SS * SS)
    rows = []
    for y in range(SIZE):
        row = bytearray()
        for x in range(SIZE):
            hit = 0
            for sy in range(SS):
                py = y * SS + sy + 0.5
                for sx in range(SS):
                    if _inside(x * SS + sx + 0.5, py, br, big):
                        hit += 1
            a = int(round(alpha * hit / cell))
            row += bytes((255, 255, 255, a))
        rows.append(bytes(row))

    raw = b"".join(b"\x00" + r for r in rows)
    png = (
        b"\x89PNG\r\n\x1a\n"
        + _chunk(b"IHDR", struct.pack(">IIBBBBB", SIZE, SIZE, 8, 6, 0, 0, 0))
        + _chunk(b"IDAT", zlib.compress(raw, 9))
        + _chunk(b"IEND", b"")
    )
    with open(path, "wb") as f:
        f.write(png)


def main():
    out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "mod", "images", "ui")
    out_dir = os.path.normpath(out_dir)
    if not os.path.isdir(out_dir):
        os.makedirs(out_dir)
    for name, alpha in sorted(ALPHAS.items()):
        path = os.path.join(out_dir, name + ".png")
        make_png(path, alpha)
        print("%s (alpha=0x%02x) -> %s" % (name, alpha, path))


if __name__ == "__main__":
    main()

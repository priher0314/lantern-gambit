#!/usr/bin/env python3
"""Roadside Story — 1차 픽셀 아트 생성기.

모든 스프라이트를 코드로 직접 그린다(외부 에셋 없음, 라이선스 걱정 없음).
규격: 아이소메트릭 타일 64x32, 광원은 왼쪽 위, 외곽선은 채움색을 어둡게 한 색.
이 그림은 '1차 자체 제작 프로시저럴 아트'이며, 같은 파일명·같은 기준점으로 손그림 에셋으로 교체할 수 있다.
규격과 교체 방법은 docs/ART_GUIDE.md, docs/ASSET_MANIFEST.md 참고.

실행: python3 tools/gen_art.py   (프로젝트 루트에서)
"""
import json, math, os, random
from PIL import Image, ImageDraw

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "sprites")
random.seed(7)

# ------------------------------------------------------------------ 색
def rgb(h):
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 255)

def shade(c, f):
    """f<1 어둡게(살짝 보랏빛으로), f>1 밝게(살짝 노랗게)"""
    r, g, b = c[0], c[1], c[2]
    if f < 1:
        r, g, b = r * f, g * f * 0.97, b * (f * 0.9 + 0.1 * 1.0)
        b = min(255, b + (1 - f) * 18)
    else:
        r, g, b = r + (255 - r) * (f - 1), g + (255 - g) * (f - 1), b + (255 - b) * (f - 1) * 0.7
    return (int(max(0, min(255, r))), int(max(0, min(255, g))), int(max(0, min(255, b))), 255)

P = {
    "grass": rgb("7fb86a"), "grass2": rgb("8cc474"), "grass_d": rgb("6aa35e"), "wild": rgb("5c9357"),
    "path": rgb("e2d3b0"), "path_d": rgb("c9b891"), "asphalt": rgb("5d6170"), "asphalt_l": rgb("6c7080"),
    "line": rgb("f1ead2"), "yellow": rgb("f2c14e"), "water": rgb("5aa9d6"), "water_l": rgb("8fcdea"),
    "sand": rgb("ecd9a0"), "wood": rgb("b07a4a"), "wood_d": rgb("8a5a36"), "cream": rgb("f6e9cf"),
    "white": rgb("fbf7ee"), "red": rgb("d9584a"), "orange": rgb("ee8f3b"), "pink": rgb("ef9bb0"),
    "blue": rgb("4f8fd0"), "teal": rgb("46b3a4"), "green": rgb("4f9d55"), "leaf": rgb("5fae5a"),
    "leaf_d": rgb("3f8a4c"), "purple": rgb("8d6cc0"), "brown": rgb("7a5236"), "grey": rgb("a9aab5"),
    "grey_d": rgb("7b7d8c"), "dark": rgb("3a3545"), "glass": rgb("a8dcec"), "glass_n": rgb("ffe9a0"),
    "skin": rgb("f6cfa6"), "skin2": rgb("e2ad82"), "black": rgb("2b2733"), "gold": rgb("f0b93a"),
    "stone": rgb("cfcabc"), "roof_r": rgb("c8553f"), "roof_b": rgb("4a78b8"), "roof_g": rgb("4e9a6a"),
    "roof_o": rgb("e58a3a"), "roof_p": rgb("b05c8a"), "roof_y": rgb("e3b23c"), "roof_n": rgb("3f4a6b"),
}
OUT = rgb("3a3041")

# ------------------------------------------------------------------ 캔버스
class Canvas:
    """건물용 캔버스. 발자국 w x h 타일, 위로 top 픽셀 여유."""
    def __init__(self, w, h, top):
        self.w, self.h, self.top = w, h, top
        self.W = (w + h) * 32
        self.H = top + (w + h) * 16 + 2
        self.ox = h * 32
        self.oy = top
        self.im = Image.new("RGBA", (self.W, self.H), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.im)

    def pt(self, gx, gy, z=0.0):
        return (self.ox + (gx - gy) * 32, self.oy + (gx + gy) * 16 - z)

    def poly(self, pts, fill, outline=None):
        pts = [(round(x), round(y)) for x, y in pts]
        self.d.polygon(pts, fill=fill, outline=outline if outline else shade(fill, 0.62))

    def line(self, a, b, fill, width=1):
        self.d.line([(round(a[0]), round(a[1])), (round(b[0]), round(b[1]))], fill=fill, width=width)

    def px(self, x, y, c):
        x, y = round(x), round(y)
        if 0 <= x < self.W and 0 <= y < self.H:
            self.im.putpixel((x, y), c)

    def rect(self, x0, y0, x1, y1, c, outline=None):
        self.d.rectangle([round(x0), round(y0), round(x1), round(y1)], fill=c, outline=outline)

    # --- 아이소 도형
    def top_face(self, x0, y0, x1, y1, z, c, outline=None):
        self.poly([self.pt(x0, y0, z), self.pt(x1, y0, z), self.pt(x1, y1, z), self.pt(x0, y1, z)], c, outline)

    def left_face(self, x0, x1, y, z0, z1, c, outline=None):   # +y 면 (화면 왼쪽 아래를 향함, 밝은 면)
        self.poly([self.pt(x0, y, z0), self.pt(x1, y, z0), self.pt(x1, y, z1), self.pt(x0, y, z1)], c, outline)

    def right_face(self, x, y0, y1, z0, z1, c, outline=None):  # +x 면 (화면 오른쪽 아래, 어두운 면)
        self.poly([self.pt(x, y0, z0), self.pt(x, y1, z0), self.pt(x, y1, z1), self.pt(x, y0, z1)], c, outline)

    def box(self, x0, y0, x1, y1, z0, z1, c, top=None):
        self.right_face(x1, y0, y1, z0, z1, shade(c, 0.78))
        self.left_face(x0, x1, y1, z0, z1, c)
        self.top_face(x0, y0, x1, y1, z1, top if top else shade(c, 1.18))

    def gable(self, x0, y0, x1, y1, z, rise, c, over=0.06):
        """용마루가 x축 방향인 박공지붕. 앞쪽(+y) 경사면과 오른쪽 박공벽이 보인다."""
        ym = (y0 + y1) / 2
        a0, a1 = x0 - over, x1 + over
        b0, b1 = y0 - over, y1 + over
        # 뒤 경사면 (조금 보임)
        self.poly([self.pt(a0, b0, z), self.pt(a1, b0, z), self.pt(a1, ym, z + rise), self.pt(a0, ym, z + rise)], shade(c, 1.12))
        # 오른쪽 박공 삼각형
        self.poly([self.pt(x1, y0, z), self.pt(x1, y1, z), self.pt(x1, ym, z + rise)], shade(P["cream"], 0.8))
        # 앞 경사면
        self.poly([self.pt(a0, ym, z + rise), self.pt(a1, ym, z + rise), self.pt(a1, b1, z), self.pt(a0, b1, z)], c)
        # 기와 줄
        for i in range(1, 4):
            t = i / 4
            p0 = self.pt(a0, ym + (b1 - ym) * t, z + rise * (1 - t))
            p1 = self.pt(a1, ym + (b1 - ym) * t, z + rise * (1 - t))
            self.line(p0, p1, shade(c, 0.82))

    def hip(self, x0, y0, x1, y1, z, rise, c, over=0.06):
        """사방으로 내려오는 지붕"""
        a0, a1, b0, b1 = x0 - over, x1 + over, y0 - over, y1 + over
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        k = 0.22
        r0, r1 = (cx - (x1 - x0) * k, cy), (cx + (x1 - x0) * k, cy)
        self.poly([self.pt(a0, b0, z), self.pt(a1, b0, z), self.pt(r1[0], r1[1], z + rise), self.pt(r0[0], r0[1], z + rise)], shade(c, 1.12))
        self.poly([self.pt(a1, b0, z), self.pt(a1, b1, z), self.pt(r1[0], r1[1], z + rise)], shade(c, 0.8))
        self.poly([self.pt(a0, b1, z), self.pt(a1, b1, z), self.pt(r1[0], r1[1], z + rise), self.pt(r0[0], r0[1], z + rise)], c)
        self.poly([self.pt(a0, b0, z), self.pt(a0, b1, z), self.pt(r0[0], r0[1], z + rise)], shade(c, 1.2))

    def win_l(self, x0, x1, y, z0, z1, c=None):
        c = c or P["glass"]
        self.left_face(x0, x1, y, z0, z1, c, shade(P["wood_d"], 0.8))
        a, b = self.pt(x0, y, z1), self.pt(x1, y, z1)
        self.line((a[0] + 1, a[1] + 2), ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 2), shade(c, 1.5))

    def win_r(self, x, y0, y1, z0, z1, c=None):
        c = c or shade(P["glass"], 0.85)
        self.right_face(x, y0, y1, z0, z1, c, shade(P["wood_d"], 0.7))

    def door_l(self, xc, y, wd, ht, c=None):
        c = c or P["wood"]
        self.left_face(xc - wd / 2, xc + wd / 2, y, 0, ht, c, shade(c, 0.55))
        k = self.pt(xc + wd / 2 - 0.05, y, ht * 0.45)
        self.px(k[0], k[1], P["gold"])

    def awning_l(self, x0, x1, y, z, depth, c1, c2=None):
        c2 = c2 or P["white"]
        n = max(2, int(round((x1 - x0) * 6)))
        for i in range(n):
            a, b = x0 + (x1 - x0) * i / n, x0 + (x1 - x0) * (i + 1) / n
            col = c1 if i % 2 == 0 else c2
            self.poly([self.pt(a, y, z), self.pt(b, y, z), self.pt(b, y + depth, z - 5), self.pt(a, y + depth, z - 5)], col, shade(col, 0.8))
        self.line(self.pt(x0, y + depth, z - 5), self.pt(x1, y + depth, z - 5), shade(c1, 0.6))

    def sign_roof(self, gx, gy, z, icon, bg, wpx=17, hpx=13):
        """지붕 위에 세운 간판 (정면을 보게 평면으로 그린다)"""
        cx, cy = self.pt(gx, gy, z)
        cx, cy = round(cx), round(cy)
        self.rect(cx - 1, cy - 4, cx, cy, P["grey_d"])
        x0, y0 = cx - wpx // 2, cy - 4 - hpx
        self.rect(x0, y0, x0 + wpx, y0 + hpx, bg, OUT)
        self.rect(x0 + 1, y0 + 1, x0 + wpx - 1, y0 + 1, shade(bg, 1.35))
        draw_icon(self.im, icon, x0 + (wpx - 9) // 2 + 1, y0 + (hpx - 9) // 2 + 1)

    def shadow(self, gx, gy, rx, ry, a=70):
        cx, cy = self.pt(gx, gy)
        ov = Image.new("RGBA", self.im.size, (0, 0, 0, 0))
        ImageDraw.Draw(ov).ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=(40, 40, 60, a))
        self.im = Image.alpha_composite(ov, self.im)
        self.d = ImageDraw.Draw(self.im)

    def blob(self, cx, cy, r, c):
        """동글동글한 덩어리(나무, 덤불)"""
        cx, cy = round(cx), round(cy)
        self.d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=c, outline=shade(c, 0.6))
        self.d.ellipse([cx - r + 2, cy - r + 1, cx + r // 3, cy], fill=shade(c, 1.22))
        self.d.ellipse([cx - r + 3, cy - r + 3, cx + r - 2, cy + r - 1], fill=c)
        self.d.ellipse([cx - r // 2 - 1, cy - r + 2, cx, cy - r // 3], fill=shade(c, 1.25))

    def save(self, name, meta):
        path = os.path.join(ROOT, "buildings", name + ".png")
        self.im.save(path)
        meta[name] = {"ox": self.ox, "oy": self.oy, "w": self.W, "h": self.H}

# ------------------------------------------------------------------ 9x9 아이콘
ICONS = {
    "cup":   ["         ", "  w   w  ", "   w w   ", " ccccccc ", " ccccccco", " cccccc o", "  ccccc  ", "   ccc   ", " ddddddd "],
    "food":  ["    r    ", "   rrr   ", "  rrorr  ", " rrorrrr ", " wwwwwww ", " wdddddw ", "  wwwww  ", "   www   ", "         "],
    "nut":   ["         ", "   bbb   ", "  bbobb  ", " bbobbob ", " bobbobb ", " bbobbob ", "  bbobb  ", "   bbb   ", "         "],
    "bowl":  ["  w  w   ", "   w  w  ", "  w  w   ", " rrrrrrr ", " ryyyyyr ", " rrrrrrr ", "  rrrrr  ", "   rrr   ", "  ddddd  "],
    "bread": ["         ", "  ooooo  ", " oyoyoyo ", " ooooooo ", " obbbbbo ", " obbbbbo ", " obbbbbo ", "  bbbbb  ", "         "],
    "cart":  ["         ", "b        ", " bwwwwww ", " bwwwwww ", " bwwwww  ", " bbbbbb  ", "  b   b  ", " dd   dd ", " dd   dd "],
    "gift":  ["  r   r  ", "  rr rr  ", " yyyryyy ", " yyyryyy ", " rrrrrrr ", " yyyryyy ", " yyyryyy ", " yyyryyy ", "         "],
    "jar":   ["  bbbbb  ", "  wwwww  ", " yyyyyyy ", " yoyyyyy ", " yoyyyyy ", " yoyyyyy ", " yyyyyyy ", "  yyyyy  ", "         "],
    "scope": ["         ", "     ddd ", "    dddd ", "  wddd   ", " wwdd    ", "  w  d   ", "    d d  ", "   d   d ", "  d     d"],
    "fuel":  ["         ", " rrrrr   ", " rwwwr d ", " rwwwr  d", " rrrrr  d", " rrrrr dd", " rrrrr d ", " rrrrrdd ", " ddddd   "],
    "bolt":  ["     yy  ", "    yy   ", "   yy    ", "  yyyyy  ", "    yy   ", "   yy    ", "  yy     ", "  y      ", "         "],
    "steam": ["  w w w  ", " w w w   ", "  w w w  ", "         ", " bbbbbbb ", " bcccccb ", " bcccccb ", "  bbbbb  ", "         "],
    "bed":   ["         ", " b       ", " b       ", " bww     ", " bwwrrrrr", " bbbbbbbb", " b      b", " b      b", "         "],
    "cone":  ["   ppp   ", "  pwppp  ", "  ppppp  ", "  ppppp  ", "  ooooo  ", "   ooo   ", "   ooo   ", "    o    ", "         "],
    "wc":    ["         ", " bb   rr ", " bb   rr ", "bbbb rrrr", "bbbb rrrr", " bb  rrrr", " bb   rr ", " bb   rr ", "         "],
    "p":     ["         ", " wwwww   ", " ww  ww  ", " ww  ww  ", " wwwww   ", " ww      ", " ww      ", " ww      ", "         "],
    "heart": ["         ", " rr   rr ", "rrrr rrrr", "rrrrrrrrr", "rrrrrrrrr", " rrrrrrr ", "  rrrrr  ", "   rrr   ", "    r    "],
    "star":  ["    y    ", "    y    ", "   yyy   ", "yyyyyyyyy", " yyyyyyy ", "  yyyyy  ", "  yy yy  ", " yy   yy ", "         "],
    "drop":  ["    c    ", "    c    ", "   ccc   ", "   ccc   ", "  ccccc  ", "  cwccc  ", "  cwccc  ", "   ccc   ", "         "],
}
ICOL = {"w": P["white"], "c": rgb("7ec8e3"), "o": P["orange"], "d": P["dark"], "r": P["red"], "b": P["brown"],
        "y": P["yellow"], "p": P["pink"], "g": P["green"]}

def draw_icon(im, name, x, y, scale=1):
    rows = ICONS[name]
    x, y = int(round(x)), int(round(y))
    for j, row in enumerate(rows):
        for i, ch in enumerate(row):
            if ch != " ":
                for sy in range(scale):
                    for sx in range(scale):
                        xx, yy = x + i * scale + sx, y + j * scale + sy
                        if 0 <= xx < im.width and 0 <= yy < im.height:
                            im.putpixel((xx, yy), ICOL[ch])

def auto_outline(im, color=OUT):
    """불투명 픽셀 바깥 테두리에 1px 외곽선"""
    w, h = im.size
    src = im.load()
    out = im.copy()
    dst = out.load()
    for y in range(h):
        for x in range(w):
            if src[x, y][3] == 0:
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and src[nx, ny][3] > 200:
                        dst[x, y] = color
                        break
    return out

# ------------------------------------------------------------------ 타일
def tile_base(c, speck=None, n=0, edge=None, seed=0):
    rnd = random.Random(seed)
    im = Image.new("RGBA", (64, 32), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.polygon([(31, 0), (32, 0), (63, 15), (63, 16), (32, 31), (31, 31), (0, 16), (0, 15)], fill=c)
    px = im.load()
    for _ in range(n):
        x, y = rnd.randint(4, 59), rnd.randint(2, 29)
        if px[x, y][3] > 0 and px[min(63, x + 1), y][3] > 0:
            col = rnd.choice(speck)
            px[x, y] = col
            if rnd.random() < 0.4 and px[x, max(0, y - 1)][3] > 0:
                px[x, y - 1] = col
    if edge:
        d.line([(0, 16), (31, 31)], fill=edge)
        d.line([(32, 31), (63, 16)], fill=edge)
    return im

def gen_tiles():
    out = os.path.join(ROOT, "tiles")
    g = P["grass"]
    for i in range(3):
        tile_base(g, [shade(g, 1.12), shade(g, 0.9), shade(g, 1.2)], 26, None, i).save(f"{out}/grass_{i}.png")
    w = P["wild"]
    for i in range(3):
        tile_base(w, [shade(w, 1.15), shade(w, 0.85), shade(w, 0.8)], 40, None, 10 + i).save(f"{out}/wild_{i}.png")
    pl = shade(P["grass"], 0.9)
    im = tile_base(pl, [shade(pl, 1.1), shade(pl, 0.88)], 30, None, 20)
    im.save(f"{out}/plot_0.png")
    # 보행로: 돌 포장
    im = tile_base(P["path"], [P["path_d"], shade(P["path"], 1.1)], 18, shade(P["path_d"], 0.85), 30)
    d = ImageDraw.Draw(im)
    for k in (-1, 0, 1):
        d.line([(16 + k * 16, 8 - k * 8 + 8), (48 + k * 16 - 16, 24 - k * 8 - 0)], fill=P["path_d"])
    d.line([(16, 8), (48, 24)], fill=P["path_d"])
    d.line([(48, 8), (16, 24)], fill=P["path_d"])
    im.save(f"{out}/path_0.png")
    a = P["asphalt"]
    base = tile_base(a, [P["asphalt_l"], shade(a, 0.9)], 22, None, 40)
    base.save(f"{out}/road_0.png")
    # 가까운 차선: 휴게소 쪽(위 오른쪽 모서리=y작은쪽 경계) 실선
    im = base.copy(); d = ImageDraw.Draw(im)
    d.line([(33, 2), (61, 16)], fill=P["line"])
    im.save(f"{out}/road_near.png")
    # 먼 차선: 차선 사이 경계(위 오른쪽 모서리)에 노란 점선, 바깥 모서리에 실선
    im = base.copy(); d = ImageDraw.Draw(im)
    d.line([(36, 3), (48, 9)], fill=P["yellow"])
    d.line([(2, 17), (30, 30)], fill=P["line"])
    im.save(f"{out}/road_far.png")
    for i in range(2):
        im = tile_base(P["water"], [P["water_l"], shade(P["water"], 0.92)], 10, None, 50 + i)
        d = ImageDraw.Draw(im)
        rnd = random.Random(60 + i)
        for _ in range(4):
            x, y = rnd.randint(12, 44), rnd.randint(8, 22)
            d.line([(x, y), (x + 6, y)], fill=P["water_l"])
        im.save(f"{out}/water_{i}.png")
    tile_base(P["sand"], [shade(P["sand"], 0.92), shade(P["sand"], 1.1)], 20, None, 70).save(f"{out}/sand_0.png")
    # 논밭(시골 풍경)
    f = rgb("a9c46a")
    im = tile_base(f, [shade(f, 1.1)], 0, None, 80); d = ImageDraw.Draw(im)
    for k in range(-3, 4):
        d.line([(32 + k * 8 - 14, 16 + k * 4 + 7), (32 + k * 8 + 14, 16 + k * 4 - 7)], fill=shade(f, 0.84))
    im2 = tile_base(f, None, 0);
    mask = im2.split()[3]
    im.putalpha(mask)
    im.save(f"{out}/field_0.png")
    # 커서
    for name, col in (("cursor_ok", (120, 230, 140)), ("cursor_bad", (240, 100, 90)), ("cursor_sel", (255, 240, 170)), ("cursor_entry", (255, 210, 90)), ("cursor_range", (255, 255, 255))):
        im = Image.new("RGBA", (64, 32), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
        fill_a = 40 if name == "cursor_range" else 90
        d.polygon([(31, 0), (32, 0), (63, 15), (63, 16), (32, 31), (31, 31), (0, 16), (0, 15)], fill=col + (fill_a,), outline=col + (255 if name != "cursor_range" else 90,))
        im.save(f"{out}/{name}.png")

# ------------------------------------------------------------------ 건물
def planter(c, gx, gy, col=None):
    col = col or random.choice([P["pink"], P["yellow"], P["red"], P["white"]])
    c.box(gx - 0.09, gy - 0.09, gx + 0.09, gy + 0.09, 0, 4, P["wood"])
    x, y = c.pt(gx, gy, 6)
    c.blob(x, y, 3, P["leaf"])
    c.px(x - 1, y - 1, col); c.px(x + 1, y, col); c.px(x, y - 2, col)

def shop(meta, name, w, h, tier, wall, roof, roof_kind, icon, sign_bg, awn=None, hgt=(22, 26, 32), chimney=False, extra=None):
    H = hgt[tier]
    top = H + 44
    c = Canvas(w, h, top)
    m = 0.1
    x0, y0, x1, y1 = m, m, w - m, h - m
    c.shadow(w / 2 + 0.15, h / 2 + 0.15, (w + h) * 14, (w + h) * 7, 46)
    # 바닥 기단
    c.box(x0 - 0.04, y0 - 0.04, x1 + 0.04, y1 + 0.04, 0, 2, P["stone"])
    c.box(x0, y0, x1, y1, 2, H, wall)
    # 벽 하단 띠
    c.left_face(x0, x1, y1, 2, 6, shade(wall, 0.86), shade(wall, 0.7))
    c.right_face(x1, y0, y1, 2, 6, shade(wall, 0.68), shade(wall, 0.55))
    # 문 (왼쪽 면, 입구 열)
    door_col = int((w - 1) / 2) + 0.5
    c.door_l(door_col, y1, 0.3, 15, P["wood"] if tier < 2 else P["wood_d"])
    # 창문
    for i in range(w):
        cx = i + 0.5
        if abs(cx - door_col) < 0.1:
            if w == 1:
                continue
            continue
        c.win_l(cx - 0.26, cx + 0.26, y1, 8, 18)
    if w == 1:
        c.win_l(x0 + 0.02, door_col - 0.2, y1, 9, 17)
    for j in range(h):
        cy = j + 0.5
        c.win_r(x1, cy - 0.24, cy + 0.24, 8, 18)
    # 2층 창 (3단계)
    if tier == 2 and H >= 30:
        for i in range(w):
            c.win_l(i + 0.3, i + 0.7, y1, H - 9, H - 3)
        for j in range(h):
            c.win_r(x1, j + 0.3, j + 0.7, H - 9, H - 3)
    if awn and tier >= 0:
        c.awning_l(x0 + 0.02, x1 - 0.02, y1, 21 if tier < 2 else 22, 0.2 + 0.05 * tier, awn)
    # 지붕
    if roof_kind == "gable":
        c.gable(x0, y0, x1, y1, H, 9 + tier * 2, roof)
    elif roof_kind == "hip":
        c.hip(x0, y0, x1, y1, H, 10 + tier * 2, roof)
    else:
        c.box(x0 - 0.05, y0 - 0.05, x1 + 0.05, y1 + 0.05, H, H + 3, roof)
        c.top_face(x0 + 0.08, y0 + 0.08, x1 - 0.08, y1 - 0.08, H + 3, shade(roof, 0.9), shade(roof, 0.7))
    rz = H + (3 if roof_kind == "flat" else 6)
    if chimney:
        c.box(x0 + 0.2, y0 + 0.25, x0 + 0.42, y0 + 0.47, rz, rz + 9 + tier, P["roof_r"] if roof != P["roof_r"] else P["grey"])
    # 간판
    sw = 17 + tier * 2
    c.sign_roof(w * 0.5 + 0.1, h - 0.25, rz - (2 if roof_kind != "flat" else 0), icon, sign_bg, sw, 13)
    # 단계별 꾸밈
    if tier >= 1:
        planter(c, x0 + 0.08, h - 0.02 + 0.06 if False else y1 + 0.12)
        planter(c, x1 - 0.1, y1 + 0.12)
    if tier >= 2:
        # 깃발 + 지붕 테두리 조명
        fx, fy = c.pt(x1 - 0.15, y0 + 0.15, rz + 4)
        c.rect(fx, fy - 12, fx, fy, P["grey_d"])
        c.poly([(fx + 1, fy - 12), (fx + 8, fy - 10), (fx + 1, fy - 7)], sign_bg)
        for i in range(int(w * 5)):
            p = c.pt(x0 + (x1 - x0) * (i + 0.5) / (w * 5), y1 + 0.02, H - 1)
            c.px(p[0], p[1], P["yellow"] if i % 2 == 0 else P["white"])
    if extra:
        extra(c, tier, H)
    c.save(f"{name}_{tier}", meta)

def stall(meta, name, tier, wall, awn, icon, sign_bg, w=1, topper=None):
    """1칸(또는 2x1) 가판대형 가게"""
    H = 17 + tier * 2
    c = Canvas(w, 1, H + 40)
    c.shadow(w / 2 + 0.12, 0.62, (w + 1) * 13, (w + 1) * 6, 46)
    x0, y0, x1, y1 = 0.14, 0.16, w - 0.14, 0.84
    c.box(x0, y0, x1, y1, 0, H, wall)
    # 판매 창구
    c.left_face(x0 + 0.08, x1 - 0.08, y1, 8, H - 2, P["dark"], shade(wall, 0.6))
    c.left_face(x0 + 0.08, x1 - 0.08, y1, 6, 8, P["wood"], P["wood_d"])
    # 창구 안 진열
    for i in range(int(3 * w)):
        p = c.pt(x0 + 0.2 + i * 0.22, y1, 10)
        c.rect(p[0], p[1] - 2, p[0] + 2, p[1], [P["yellow"], P["red"], P["cream"]][i % 3])
    c.win_r(x1, y0 + 0.14, y1 - 0.14, 8, H - 3)
    c.box(x0 - 0.06, y0 - 0.06, x1 + 0.06, y1 + 0.06, H, H + 3, awn)
    c.awning_l(x0 - 0.04, x1 + 0.04, y1 + 0.02, H + 1, 0.3, awn)
    if tier >= 1:
        c.box(x0 + 0.1, y0 + 0.08, x1 - 0.1, y1 - 0.2, H + 3, H + 6, shade(awn, 0.9))
    rz = H + 3 + (3 if tier >= 1 else 0)
    c.sign_roof(w * 0.5, 0.45, rz, icon, sign_bg, 15 + tier * 2, 13)
    if tier >= 1:
        planter(c, x1 + 0.0, y1 + 0.1)
    if tier >= 2:
        for i in range(int(w * 6)):
            p = c.pt(x0 + (x1 - x0) * (i + 0.5) / (w * 6), y1 + 0.34, H - 5)
            c.px(p[0], p[1], P["yellow"] if i % 2 == 0 else P["pink"])
        planter(c, x0 - 0.02, y1 + 0.1)
    if topper:
        topper(c, tier, rz)
    c.save(f"{name}_{tier}", meta)

def gen_buildings():
    meta = {}
    os.makedirs(os.path.join(ROOT, "buildings"), exist_ok=True)
    for t in range(3):
        shop(meta, "snack", 2, 2, t, P["cream"], P["roof_r"], "gable", "food", P["red"], awn=P["red"], chimney=True)
        shop(meta, "udon", 2, 2, t, rgb("efe2c4"), P["roof_n"], "hip", "bowl", P["roof_n"], awn=P["roof_n"], chimney=True)
        shop(meta, "bakery", 2, 2, t, rgb("f7e3c0"), P["roof_o"], "gable", "bread", P["orange"], awn=P["orange"], chimney=True)
        shop(meta, "convenience", 2, 2, t, P["white"], P["teal"], "flat", "cart", P["teal"], awn=None)
        shop(meta, "souvenir", 2, 2, t, rgb("f3dfc8"), P["roof_p"], "hip", "gift", P["roof_p"], awn=P["pink"])
        shop(meta, "specialty", 2, 2, t, rgb("e9d8b4"), P["wood_d"], "gable", "jar", P["brown"], awn=P["yellow"])
        shop(meta, "cafe", 2, 2, t, rgb("f4ead8"), P["roof_g"], "flat", "cup", P["roof_g"], awn=P["green"], extra=cafe_extra)
        shop(meta, "sauna", 2, 2, t, rgb("ecd7b6"), P["wood_d"], "hip", "steam", P["wood_d"], awn=None, chimney=True, hgt=(24, 28, 34))
        shop(meta, "hotel", 3, 2, t, rgb("f3ead9"), P["roof_b"], "flat", "bed", P["roof_b"], awn=P["blue"], hgt=(40, 50, 60), extra=hotel_extra)
        shop(meta, "restroom", 2, 1, t, P["white"], P["roof_b"], "flat", "wc", P["white"], awn=None, hgt=(18, 20, 22))
        stall(meta, "kiosk", t, P["cream"], P["orange"], "cup", P["orange"])
        stall(meta, "walnut", t, rgb("f1dfbf"), P["brown"], "nut", P["cream"], w=2)
        stall(meta, "icecream", t, P["white"], P["pink"], "cone", P["white"], topper=None)
        gen_vending(meta, t)
        gen_parking(meta, "parking", t, False)
        gen_parking(meta, "ev", t, True)
        gen_garden(meta, t)
        gen_playground(meta, t)
        gen_observatory(meta, t)
        gen_gas(meta, t)
        gen_bench(meta, t)
        gen_photozone(meta, t)
    gen_deco(meta)
    with open(os.path.join(ROOT, "buildings", "meta.json"), "w") as f:
        json.dump(meta, f, indent=1)

def cafe_extra(c, tier, H):
    # 테라스 파라솔
    if tier >= 1:
        px, py = c.pt(0.2, 2.02, 0)
        c.rect(px, py - 12, px, py, P["grey_d"])
        c.poly([(px - 8, py - 11), (px, py - 16), (px + 8, py - 11)], P["green"])
        c.poly([(px - 3, py - 11), (px, py - 16), (px + 3, py - 11)], P["white"])

def hotel_extra(c, tier, H):
    for fl in range(2, 2 + tier + 1):
        z = 8 + fl * 10
        if z + 8 > H - 2:
            break
        for i in range(3):
            c.win_l(i + 0.25, i + 0.75, 1.9, z, z + 7)
        for j in range(2):
            c.win_r(2.9, j + 0.25, j + 0.75, z, z + 7)

def gen_vending(meta, t):
    c = Canvas(1, 1, 44)
    c.shadow(0.6, 0.62, 18, 8, 46)
    n = 1 + (1 if t >= 1 else 0)
    cols = [P["red"], P["blue"]]
    for i in range(n):
        x0 = 0.18 + i * 0.36 if n == 2 else 0.3
        c.box(x0, 0.3, x0 + 0.34, 0.66, 0, 22, cols[i])
        c.left_face(x0 + 0.05, x0 + 0.29, 0.66, 10, 19, P["glass"], shade(cols[i], 0.6))
        c.left_face(x0 + 0.05, x0 + 0.29, 0.66, 3, 6, P["dark"], shade(cols[i], 0.6))
        for k in range(3):
            p = c.pt(x0 + 0.09 + k * 0.08, 0.66, 14)
            c.px(p[0], p[1], [P["yellow"], P["white"], P["orange"]][k])
    if t >= 2:
        c.box(0.12, 0.24, 0.92, 0.72, 23, 25, P["roof_y"])
        c.awning_l(0.12, 0.92, 0.72, 24, 0.2, P["yellow"])
    c.save(f"vending_{t}", meta)

def gen_parking(meta, name, t, ev):
    c = Canvas(2, 2, 34)
    a = P["asphalt_l"]
    c.top_face(0.03, 0.03, 1.97, 1.97, 0, a, shade(a, 0.7))
    line = P["line"] if not ev else rgb("9fe6a0")
    for x in (0.03, 1.0, 1.97):
        c.line(c.pt(x, 0.1), c.pt(x, 1.9), line)
    c.line(c.pt(0.05, 1.0), c.pt(1.95, 1.0), shade(line, 0.9))
    if t >= 1:
        # 연석과 화단
        c.box(0.0, 0.0, 2.0, 0.07, 0, 3, P["stone"])
        for gx in (0.3, 1.0, 1.7):
            p = c.pt(gx, 0.03, 5)
            c.blob(p[0], p[1], 4, P["leaf"])
    # 표지판
    px, py = c.pt(1.93, 0.07, 0)
    c.rect(px, py - 18, px, py, P["grey_d"])
    bg = P["blue"] if not ev else P["green"]
    c.rect(px - 5, py - 30, px + 6, py - 18, bg, OUT)
    draw_icon(c.im, "p" if not ev else "bolt", px - 4, py - 28)
    if ev:
        for gx in (0.5, 1.5):
            c.box(gx - 0.07, 0.04, gx + 0.07, 0.16, 0, 14, P["white"])
            p = c.pt(gx, 0.16, 9)
            c.rect(p[0] - 1, p[1] - 1, p[0] + 1, p[1] + 1, P["green"])
        if t >= 2:
            for gx, gy in ((0.05, 0.1), (1.95, 0.1)):
                c.box(gx - 0.03, gy - 0.03, gx + 0.03, gy + 0.03, 0, 24, P["grey"])
            c.box(0.0, 0.0, 2.0, 0.6, 24, 26, rgb("9fe6a0"))
    elif t >= 2:
        px, py = c.pt(0.07, 0.07, 0)
        c.rect(px, py - 24, px, py, P["grey_d"])
        c.rect(px - 2, py - 27, px + 2, py - 24, P["glass_n"], OUT)
    c.save(f"{name}_{t}", meta)

def gen_garden(meta, t):
    c = Canvas(2, 2, 40)
    g = shade(P["grass2"], 1.04)
    c.top_face(0.03, 0.03, 1.97, 1.97, 0, g, shade(g, 0.75))
    # 낮은 울타리(뒤쪽 두 변)
    for i in range(8):
        a = c.pt(0.1 + i * 0.25, 0.06, 0); c.rect(a[0], a[1] - 4, a[0], a[1], P["wood"])
        b = c.pt(0.06, 0.1 + i * 0.25, 0); c.rect(b[0], b[1] - 4, b[0], b[1], P["wood"])
    c.line(c.pt(0.1, 0.06, 3), c.pt(1.9, 0.06, 3), P["wood"]); c.line(c.pt(0.06, 0.1, 3), c.pt(0.06, 1.9, 3), P["wood"])
    rnd = random.Random(100 + t)
    cols = [P["pink"], P["yellow"], P["red"], P["white"], P["purple"]]
    n = 14 + t * 10
    for _ in range(n):
        gx, gy = rnd.uniform(0.2, 1.85), rnd.uniform(0.2, 1.85)
        if 0.75 < gx < 1.3 and 0.75 < gy < 1.3 and t >= 1:
            continue
        p = c.pt(gx, gy)
        col = rnd.choice(cols)
        c.px(p[0], p[1] - 1, P["leaf_d"]); c.px(p[0], p[1] - 2, col); c.px(p[0] + 1, p[1] - 2, col); c.px(p[0], p[1] - 3, col)
    # 뒤쪽 모서리 나무
    p = c.pt(0.35, 0.35, 0)
    c.rect(p[0] - 1, p[1] - 9, p[0], p[1], P["brown"])
    c.blob(p[0], p[1] - 16, 9, P["leaf"])
    if t >= 1:
        # 작은 연못
        cx, cy = c.pt(1.02, 1.02)
        c.d.ellipse([cx - 13, cy - 6, cx + 13, cy + 6], fill=P["water"], outline=P["stone"])
        c.d.line([(cx - 6, cy - 1), (cx, cy - 1)], fill=P["water_l"])
        for gx, gy in ((1.6, 0.4), (0.4, 1.6)):
            p = c.pt(gx, gy, 5); c.blob(p[0], p[1], 5, P["leaf_d"])
    if t >= 2:
        # 꽃 아치
        a, b = c.pt(1.25, 1.9, 0), c.pt(1.75, 1.9, 0)
        for (x, y) in (a, b):
            c.rect(x, y - 16, x + 1, y, P["white"], P["grey"])
        c.d.arc([a[0], a[1] - 28, b[0] + 1, a[1] - 2], 180, 360, fill=P["white"], width=2)
        for k in range(7):
            ang = math.pi * (k + 0.5) / 7
            x = (a[0] + b[0]) / 2 - math.cos(ang) * (b[0] - a[0]) / 2
            y = a[1] - 15 - math.sin(ang) * 12 + (b[1] - a[1]) * k / 7
            c.px(x, y, P["pink"]); c.px(x + 1, y, P["red"]); c.px(x, y - 1, P["leaf"])
        p = c.pt(1.7, 0.45, 0)
        c.rect(p[0] - 1, p[1] - 8, p[0], p[1], P["brown"]); c.blob(p[0], p[1] - 13, 7, P["pink"])
    c.save(f"garden_{t}", meta)

def gen_playground(meta, t):
    c = Canvas(2, 2, 44)
    s = P["sand"]
    c.top_face(0.04, 0.04, 1.96, 1.96, 0, s, shade(s, 0.75))
    rnd = random.Random(5)
    for _ in range(24):
        p = c.pt(rnd.uniform(0.15, 1.85), rnd.uniform(0.15, 1.85)); c.px(p[0], p[1], shade(s, 0.9))
    # 미끄럼틀
    c.box(0.3, 0.3, 0.7, 0.7, 0, 3, P["wood"])
    for gx, gy in ((0.3, 0.3), (0.7, 0.3), (0.3, 0.7), (0.7, 0.7)):
        p = c.pt(gx, gy); c.rect(p[0], p[1] - 20, p[0], p[1], P["red"])
    c.top_face(0.3, 0.3, 0.7, 0.7, 14, P["yellow"], shade(P["yellow"], 0.7))
    c.poly([c.pt(0.4, 0.7, 14), c.pt(0.6, 0.7, 14), c.pt(0.6, 1.45, 1), c.pt(0.4, 1.45, 1)], P["blue"])
    c.poly([c.pt(0.26, 0.26, 20), c.pt(0.74, 0.26, 20), c.pt(0.74, 0.74, 20), c.pt(0.5, 0.5, 27)], P["red"])
    c.poly([c.pt(0.26, 0.74, 20), c.pt(0.74, 0.74, 20), c.pt(0.5, 0.5, 27)], shade(P["red"], 1.15))
    # 그네
    if t >= 0:
        a, b = c.pt(1.3, 0.5, 0), c.pt(1.8, 0.5, 0)
        for (x, y) in (a, b):
            c.rect(x, y - 18, x, y, P["blue"])
        c.line((a[0], a[1] - 18), (b[0], b[1] - 18), P["blue"])
        m = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
        c.rect(m[0] - 3, m[1] - 15, m[0] - 3, m[1] - 5, P["grey_d"]); c.rect(m[0] + 3, m[1] - 15, m[0] + 3, m[1] - 5, P["grey_d"])
        c.rect(m[0] - 3, m[1] - 5, m[0] + 3, m[1] - 4, P["yellow"])
    if t >= 1:
        # 시소 + 흔들 말
        a, b = c.pt(1.15, 1.35, 5), c.pt(1.8, 1.35, 2)
        c.line(a, b, P["red"], 2)
        m = c.pt(1.48, 1.35, 0); c.poly([(m[0] - 3, m[1]), (m[0] + 3, m[1]), (m[0], m[1] - 5)], P["grey_d"])
    if t >= 2:
        # 정글짐 돔
        cx, cy = c.pt(1.45, 1.45, 0)
        c.d.arc([cx - 14, cy - 22, cx + 14, cy + 6], 180, 360, fill=P["green"], width=1)
        c.d.arc([cx - 7, cy - 22, cx + 7, cy + 6], 180, 360, fill=P["green"], width=1)
        c.d.line([(cx - 13, cy - 8), (cx + 13, cy - 8)], fill=P["green"])
        c.d.line([(cx - 10, cy - 15), (cx + 10, cy - 15)], fill=P["green"])
        fx, fy = c.pt(0.5, 0.5, 27)
        c.rect(fx, fy - 8, fx, fy, P["grey_d"]); c.poly([(fx + 1, fy - 8), (fx + 6, fy - 6), (fx + 1, fy - 4)], P["yellow"])
    c.save(f"playground_{t}", meta)

def gen_observatory(meta, t):
    H = (40, 52, 64)[t]
    c = Canvas(2, 2, H + 34)
    c.shadow(1.15, 1.15, 50, 24, 46)
    c.box(0.2, 0.2, 1.8, 1.8, 0, 4, P["stone"])
    # 기둥 탑
    wall = rgb("f0e6d2")
    c.box(0.62, 0.62, 1.38, 1.38, 4, H - 10, wall)
    c.door_l(1.0, 1.38, 0.26, 14, P["wood"])
    z = 22
    while z < H - 16:
        c.win_l(0.86, 1.14, 1.38, z, z + 7)
        c.win_r(1.38, 0.86, 1.14, z, z + 7)
        z += 14
    # 전망 데크
    deck = P["wood"]
    c.box(0.25, 0.25, 1.75, 1.75, H - 10, H - 7, deck)
    # 난간
    for i in range(7):
        a = c.pt(0.25 + i * 0.25, 1.75, H - 7); c.rect(a[0], a[1] - 6, a[0], a[1], P["white"])
        b = c.pt(1.75, 0.25 + i * 0.25, H - 7); c.rect(b[0], b[1] - 6, b[0], b[1], P["white"])
    c.line(c.pt(0.25, 1.75, H - 1), c.pt(1.75, 1.75, H - 1), P["white"]); c.line(c.pt(1.75, 0.25, H - 1), c.pt(1.75, 1.75, H - 1), P["white"])
    # 지붕
    roof = P["roof_b"] if t < 2 else P["roof_r"]
    for gx, gy in ((0.4, 0.4), (1.6, 0.4), (0.4, 1.6), (1.6, 1.6)):
        p = c.pt(gx, gy, H - 7); c.rect(p[0], p[1] - 14, p[0], p[1], P["wood_d"])
    c.hip(0.3, 0.3, 1.7, 1.7, H + 7, 10, roof, 0.1)
    # 망원경
    p = c.pt(1.5, 1.6, H - 7); draw_icon(c.im, "scope", int(p[0]) - 4, int(p[1]) - 10)
    if t >= 1:
        fx, fy = c.pt(1.0, 1.0, H + 17)
        c.rect(fx, fy - 9, fx, fy, P["grey_d"]); c.poly([(fx + 1, fy - 9), (fx + 8, fy - 7), (fx + 1, fy - 4)], P["red"])
        planter(c, 0.35, 1.9); planter(c, 1.65, 1.9)
    if t >= 2:
        for i in range(10):
            p = c.pt(0.25 + 1.5 * (i + 0.5) / 10, 1.76, H - 9); c.px(p[0], p[1], P["yellow"] if i % 2 == 0 else P["white"])
    c.save(f"observatory_{t}", meta)

def gen_gas(meta, t):
    c = Canvas(3, 2, 60)
    a = P["asphalt_l"]
    c.top_face(0.03, 0.03, 2.97, 1.97, 0, a, shade(a, 0.7))
    # 뒤쪽 매점
    c.box(0.9, 0.1, 2.1, 0.75, 0, 20, P["white"])
    c.win_l(1.0, 1.45, 0.75, 6, 16); c.door_l(1.75, 0.75, 0.26, 14, P["blue"])
    c.box(0.85, 0.05, 2.15, 0.8, 20, 23, P["red"])
    # 캐노피 기둥
    for gx in (0.35, 2.65):
        c.box(gx - 0.06, 1.34, gx + 0.06, 1.46, 0, 34, P["white"])
    # 주유기
    n = 2 if t < 2 else 3
    for i in range(n):
        gx = (i + 0.5) * 3.0 / n + 0.42
        if gx > 2.8: gx = 2.8
        c.box(gx - 0.1, 1.28, gx + 0.1, 1.5, 0, 3, P["stone"])
        c.box(gx - 0.07, 1.31, gx + 0.07, 1.47, 3, 15, P["red"] if i % 2 == 0 else P["yellow"])
        p = c.pt(gx, 1.47, 11); c.rect(p[0] - 1, p[1] - 1, p[0] + 1, p[1], P["glass"])
    # 캐노피
    canopy = P["red"] if t < 1 else rgb("e2553f")
    c.box(0.08, 0.95, 2.92, 1.9, 34, 39, P["white"])
    c.left_face(0.08, 2.92, 1.9, 35, 38, canopy)
    c.right_face(2.92, 0.95, 1.9, 35, 38, shade(canopy, 0.8))
    p = c.pt(1.5, 1.9, 36); draw_icon(c.im, "fuel", int(p[0]) - 4, int(p[1]) - 13)
    if t >= 1:
        # 가격 표지 기둥
        px, py = c.pt(2.9, 0.12, 0)
        c.rect(px - 1, py - 30, px, py, P["grey_d"]); c.rect(px - 6, py - 44, px + 6, py - 30, P["white"], OUT)
        c.rect(px - 4, py - 42, px + 4, py - 39, P["red"]); c.rect(px - 4, py - 37, px + 4, py - 36, P["dark"]); c.rect(px - 4, py - 34, px + 4, py - 33, P["dark"])
    if t >= 2:
        for i in range(14):
            q = c.pt(0.1 + 2.8 * (i + 0.5) / 14, 1.91, 34); c.px(q[0], q[1], P["glass_n"])
    c.save(f"gas_{t}", meta)

def gen_bench(meta, t):
    c = Canvas(1, 1, 30)
    c.shadow(0.55, 0.6, 16, 7, 40)
    w = P["wood"]
    c.box(0.2, 0.42, 0.8, 0.62, 3, 5, w)
    for gx in (0.24, 0.76):
        p = c.pt(gx, 0.62); c.rect(p[0], p[1] - 4, p[0], p[1], P["dark"])
    c.left_face(0.2, 0.8, 0.42, 5, 11, shade(w, 0.9), shade(w, 0.6))
    c.line(c.pt(0.2, 0.42, 8), c.pt(0.8, 0.42, 8), shade(w, 0.65))
    if t >= 1:
        px, py = c.pt(0.5, 0.3, 0)
        c.rect(px, py - 22, px, py, P["grey_d"])
        c.poly([(px - 11, py - 20), (px, py - 27), (px + 11, py - 20)], P["orange"])
        c.poly([(px - 4, py - 20), (px, py - 27), (px + 4, py - 20)], P["white"])
    if t >= 2:
        planter(c, 0.14, 0.78); planter(c, 0.88, 0.3)
    c.save(f"bench_{t}", meta)

def gen_photozone(meta, t):
    c = Canvas(1, 1, 44)
    c.shadow(0.55, 0.6, 18, 8, 40)
    c.box(0.18, 0.3, 0.82, 0.56, 0, 3, P["white"])
    a, b = c.pt(0.24, 0.43, 3), c.pt(0.76, 0.43, 3)
    cx, cy = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 15
    col = P["pink"] if t < 2 else P["red"]
    # 하트 프레임
    pts = []
    for k in range(40):
        th = 2 * math.pi * k / 40
        x = 16 * math.sin(th) ** 3
        y = -(13 * math.cos(th) - 5 * math.cos(2 * th) - 2 * math.cos(3 * th) - math.cos(4 * th))
        pts.append((cx + x * 0.72, cy + y * 0.72 - 1))
    c.d.line(pts + [pts[0]], fill=col, width=3)
    c.d.line(pts + [pts[0]], fill=shade(col, 1.25), width=1)
    if t >= 1:
        for k in range(0, 40, 4):
            c.px(pts[k][0], pts[k][1] - 1, P["yellow"] if k % 8 == 0 else P["white"])
        planter(c, 0.14, 0.7)
    if t >= 2:
        planter(c, 0.88, 0.62)
        draw_icon(c.im, "star", int(cx) - 4, int(cy) - 22)
    c.save(f"photozone_{t}", meta)

def gen_deco(meta):
    # 나무 (2종 + 풍경용)
    for i, (leaf, r) in enumerate(((P["leaf"], 12), (P["leaf_d"], 11), (rgb("7fbf5a"), 10))):
        c = Canvas(1, 1, 44)
        c.shadow(0.55, 0.58, 15, 7, 50)
        p = c.pt(0.5, 0.5)
        c.rect(p[0] - 1, p[1] - 12, p[0] + 1, p[1], P["brown"], shade(P["brown"], 0.6))
        c.blob(p[0] - 5, p[1] - 17, r - 4, shade(leaf, 0.92))
        c.blob(p[0] + 5, p[1] - 18, r - 4, shade(leaf, 0.96))
        c.blob(p[0], p[1] - 24, r, leaf)
        c.save("tree_0" if i == 0 else f"tree_v{i}", meta)
    # 벚나무(풍경·계절용)
    c = Canvas(1, 1, 44); c.shadow(0.55, 0.58, 15, 7, 50); p = c.pt(0.5, 0.5)
    c.rect(p[0] - 1, p[1] - 12, p[0] + 1, p[1], P["brown"], shade(P["brown"], 0.6)); c.blob(p[0] - 5, p[1] - 17, 8, rgb("f3b6c8")); c.blob(p[0] + 5, p[1] - 18, 8, rgb("f6c3d2")); c.blob(p[0], p[1] - 24, 12, rgb("f7c9d6"))
    c.save("tree_v3", meta)
    # 꽃밭
    c = Canvas(1, 1, 16)
    c.box(0.12, 0.12, 0.88, 0.88, 0, 3, P["wood"], top=rgb("6b4a36"))
    rnd = random.Random(3)
    for _ in range(16):
        gx, gy = rnd.uniform(0.2, 0.8), rnd.uniform(0.2, 0.8)
        p = c.pt(gx, gy, 3); col = rnd.choice([P["pink"], P["yellow"], P["red"], P["white"], P["purple"]])
        c.px(p[0], p[1] - 1, P["leaf"]); c.px(p[0], p[1] - 2, col); c.px(p[0] + 1, p[1] - 2, col); c.px(p[0], p[1] - 3, col)
    c.save("flowerbed_0", meta)
    # 가로등
    c = Canvas(1, 1, 44)
    c.shadow(0.52, 0.56, 7, 3, 50)
    p = c.pt(0.5, 0.5)
    c.rect(p[0] - 2, p[1] - 2, p[0] + 1, p[1], P["dark"])
    c.rect(p[0] - 1, p[1] - 30, p[0], p[1] - 2, P["grey_d"])
    c.rect(p[0] - 3, p[1] - 37, p[0] + 2, p[1] - 31, P["glass_n"], OUT)
    c.poly([(p[0] - 5, p[1] - 37), (p[0] + 4, p[1] - 37), (p[0], p[1] - 41)], P["dark"])
    c.save("lamp_0", meta)
    # 분수
    c = Canvas(2, 2, 36)
    cx, cy = c.pt(1.0, 1.0)
    c.d.ellipse([cx - 44, cy - 22, cx + 44, cy + 22], fill=P["stone"], outline=shade(P["stone"], 0.6))
    c.d.ellipse([cx - 44, cy - 27, cx + 44, cy + 17], fill=shade(P["stone"], 1.1), outline=shade(P["stone"], 0.6))
    c.d.ellipse([cx - 38, cy - 24, cx + 38, cy + 14], fill=P["water"], outline=shade(P["water"], 0.7))
    c.d.ellipse([cx - 10, cy - 14, cx + 10, cy - 4], fill=P["stone"], outline=shade(P["stone"], 0.6))
    c.rect(cx - 2, cy - 30, cx + 2, cy - 9, shade(P["stone"], 1.1), shade(P["stone"], 0.6))
    c.d.ellipse([cx - 9, cy - 34, cx + 9, cy - 27], fill=P["water_l"], outline=shade(P["stone"], 0.6))
    for dx in (-14, -7, 7, 14):
        c.d.arc([cx + min(dx, 0), cy - 36, cx + max(dx, 0), cy - 12], 180 if dx < 0 else 270, 270 if dx < 0 else 360, fill=P["water_l"])
    c.save("fountain_0", meta)

# ------------------------------------------------------------------ 캐릭터
CW, CH = 16, 20
LOOKS = {
    # look: [(머리색, 상의, 하의, 장식)] 4가지 변형
    "casual":  [("4a3628", "e06c5a", "4a5b8c", ""), ("2b2733", "5aa7d6", "6b5a48", ""), ("7a5236", "f2c14e", "4a5b8c", ""), ("2b2733", "7cc47a", "3f4a6b", "")],
    "casual2": [("4a3628", "f6f1e3", "7b8fb0", "ev"), ("2b2733", "9fe6a0", "4a5b8c", "ev"), ("7a5236", "bfe0f0", "3f4a6b", "ev"), ("2b2733", "f6f1e3", "6b5a48", "ev")],
    "suit":    [("2b2733", "3f4a6b", "2f3550", "tie"), ("4a3628", "50556a", "3a3e52", "tie"), ("2b2733", "5d6170", "2f3550", "tie"), ("3a3041", "2f3550", "2b2f45", "tie")],
    "work":    [("2b2733", "ee8f3b", "4a5b8c", "cap"), ("4a3628", "f2c14e", "3f4a6b", "cap"), ("2b2733", "5d8f6a", "50556a", "cap"), ("4a3628", "ee8f3b", "6b5a48", "cap")],
    "youth":   [("2b2733", "8d6cc0", "3f4a6b", "pack"), ("7a5236", "46b3a4", "2f3550", "pack"), ("d9a441", "ef9bb0", "4a5b8c", "pack"), ("2b2733", "f6f1e3", "3f4a6b", "pack")],
    "family":  [("4a3628", "ef9bb0", "7b8fb0", ""), ("2b2733", "7cc47a", "4a5b8c", ""), ("7a5236", "f6d97a", "6b5a48", ""), ("2b2733", "8fc7e8", "3f4a6b", "")],
    "senior":  [("d8d5dc", "a9896a", "6b5a48", "hat"), ("e8e6ea", "8fa98a", "50556a", ""), ("cfccd4", "b98f9f", "6b5a48", "hat"), ("e8e6ea", "9fa3c0", "50556a", "")],
    "biker":   [("2b2733", "2b2733", "2f3550", "helmet_r"), ("2b2733", "3a3041", "2b2733", "helmet_y"), ("2b2733", "5a2f2f", "2b2733", "helmet_w"), ("2b2733", "2f3550", "2b2733", "helmet_b")],
    "tourist": [("7a5236", "f2a65a", "e9d8b4", "sunhat"), ("d9a441", "6cc0d8", "f6f1e3", "sunhat"), ("4a3628", "f48fb1", "e9d8b4", "sunhat"), ("2b2733", "ffd166", "c9b891", "sunhat")],
    "gourmet": [("4a3628", "8a3b3b", "3a3041", "beret"), ("2b2733", "5a4a7a", "3a3041", "beret"), ("7a5236", "3f6b5a", "2f3550", "beret"), ("2b2733", "8a5a36", "3a3041", "beret")],
    "vip":     [("2b2733", "f6f1e3", "c9b891", "shades"), ("d9a441", "2b2733", "2b2733", "shades"), ("4a3628", "b89ad8", "f6f1e3", "shades"), ("2b2733", "e9c46a", "3a3041", "shades")],
    "youtuber": [("e85d75", "ffd166", "3f4a6b", "cam")] * 4,
    "critic":  [("d8d5dc", "3a3041", "50556a", "glasses")] * 4,
    "celebrity": [("f2c14e", "e85d75", "2b2733", "shades_star")] * 4,
    "staff":   [("2b2733", "f6f1e3", "3f4a6b", "apron_r"), ("4a3628", "f6f1e3", "3f4a6b", "apron_g"), ("7a5236", "f6f1e3", "50556a", "apron_b"), ("2b2733", "f6f1e3", "6b5a48", "apron_o"), ("d8d5dc", "f6f1e3", "3f4a6b", "apron_r"), ("d9a441", "f6f1e3", "3f4a6b", "apron_g")],
}

def draw_person(hair, top, bottom, acc, back, frame, kid=False, skin=None):
    """frame: 0 서기, 1 걷기A, 2 걷기B, 3 앉기"""
    im = Image.new("RGBA", (CW, CH), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    hair, top, bottom = rgb(hair), rgb(top), rgb(bottom)
    skin = skin or P["skin"]
    oy = 3 if kid else 0
    hx0, hy0 = 5, 2 + oy                    # 머리 6x6
    by0 = hy0 + 6                           # 몸통
    bh = 4 if kid else 5
    ly0 = by0 + bh
    lh = 3 if kid else 4
    bob = 1 if frame in (1, 2) and False else 0
    # 다리
    if frame == 3:
        d.rectangle([5, ly0, 7, ly0 + 1], fill=bottom); d.rectangle([8, ly0, 10, ly0 + 1], fill=bottom)
        d.rectangle([5, ly0 + 2, 6, ly0 + 2], fill=P["dark"]); d.rectangle([9, ly0 + 2, 10, ly0 + 2], fill=P["dark"])
    else:
        la = lh - (1 if frame == 1 else 0)
        lb = lh - (1 if frame == 2 else 0)
        d.rectangle([5, ly0, 7, ly0 + la - 1], fill=bottom)
        d.rectangle([8, ly0, 10, ly0 + lb - 1], fill=shade(bottom, 0.85))
        d.rectangle([5, ly0 + la - 1, 7, ly0 + la - 1], fill=P["dark"])
        d.rectangle([8, ly0 + lb - 1, 10, ly0 + lb - 1], fill=P["dark"])
    # 몸통
    d.rectangle([5, by0, 10, by0 + bh - 1], fill=top)
    d.rectangle([9, by0, 10, by0 + bh - 1], fill=shade(top, 0.85))
    # 팔
    sw = {0: (0, 0), 1: (1, -1), 2: (-1, 1), 3: (0, 0)}[frame]
    d.rectangle([4, by0 + max(0, sw[0]), 4, by0 + bh - 2 + sw[0]], fill=top)
    d.rectangle([11, by0 + max(0, sw[1]), 11, by0 + bh - 2 + sw[1]], fill=shade(top, 0.85))
    d.point((4, by0 + bh - 1 + sw[0]), fill=skin); d.point((11, by0 + bh - 1 + sw[1]), fill=skin)
    # 머리
    d.rectangle([hx0, hy0, hx0 + 5, hy0 + 5], fill=skin)
    if back:
        d.rectangle([hx0, hy0, hx0 + 5, hy0 + 4], fill=hair)
        d.rectangle([hx0 - 0, hy0 + 5, hx0 + 5, hy0 + 5], fill=shade(hair, 0.85) if not kid else skin)
    else:
        d.rectangle([hx0, hy0, hx0 + 5, hy0 + 1], fill=hair)
        d.point((hx0, hy0 + 2), fill=hair); d.point((hx0 + 5, hy0 + 2), fill=hair)
        d.point((hx0 + 1, hy0 + 3), fill=P["dark"]); d.point((hx0 + 4, hy0 + 3), fill=P["dark"])
        d.point((hx0, hy0 + 4), fill=rgb("f0a890")); d.point((hx0 + 5, hy0 + 4), fill=rgb("f0a890"))
    # 장식
    if acc == "tie" and not back:
        d.rectangle([7, by0, 8, by0], fill=P["white"]); d.rectangle([7, by0 + 1, 7, by0 + 3], fill=P["red"])
    if acc == "cap":
        d.rectangle([hx0, hy0 - 1, hx0 + 5, hy0], fill=P["blue"])
        if not back: d.rectangle([hx0 + 3, hy0 + 1, hx0 + 6, hy0 + 1], fill=shade(P["blue"], 0.8))
    if acc == "pack":
        if back: d.rectangle([6, by0, 9, by0 + 3], fill=P["red"], outline=shade(P["red"], 0.7))
        else: d.point((5, by0), fill=P["red"]); d.point((10, by0), fill=P["red"])
    if acc == "hat":
        d.rectangle([hx0 - 1, hy0, hx0 + 6, hy0], fill=P["wood_d"]); d.rectangle([hx0 + 1, hy0 - 2, hx0 + 4, hy0 - 1], fill=P["wood"])
    if acc.startswith("helmet"):
        col = {"r": P["red"], "y": P["yellow"], "w": P["white"], "b": P["blue"]}[acc[-1]]
        d.rectangle([hx0 - 1, hy0 - 1, hx0 + 6, hy0 + 2], fill=col); d.rectangle([hx0, hy0 - 2, hx0 + 5, hy0 - 2], fill=col)
        if not back: d.rectangle([hx0 + 1, hy0 + 2, hx0 + 4, hy0 + 3], fill=P["glass"])
        else: d.rectangle([hx0 - 1, hy0 + 3, hx0 + 6, hy0 + 4], fill=col)
    if acc == "sunhat":
        d.rectangle([hx0 - 2, hy0, hx0 + 7, hy0], fill=P["cream"]); d.rectangle([hx0, hy0 - 2, hx0 + 5, hy0 - 1], fill=P["cream"]); d.rectangle([hx0, hy0 - 1, hx0 + 5, hy0 - 1], fill=P["red"])
        if not back: d.rectangle([7, by0 + 1, 8, by0 + 2], fill=P["dark"])   # 카메라
    if acc == "beret":
        d.rectangle([hx0 - 1, hy0 - 1, hx0 + 5, hy0], fill=P["roof_r"]); d.point((hx0 + 3, hy0 - 2), fill=P["roof_r"])
        if not back: d.rectangle([6, by0, 9, by0], fill=P["yellow"])
    if acc in ("shades", "shades_star", "glasses") and not back:
        col = P["dark"] if acc != "glasses" else P["grey_d"]
        d.rectangle([hx0, hy0 + 3, hx0 + 5, hy0 + 3], fill=col)
        if acc == "glasses": d.point((hx0 + 1, hy0 + 3), fill=P["glass"]); d.point((hx0 + 4, hy0 + 3), fill=P["glass"])
    if acc == "shades_star":
        d.point((hx0 + 7, hy0 - 1), fill=P["yellow"]); d.point((hx0 - 2, hy0 + 1), fill=P["yellow"])
    if acc == "cam" and not back:
        d.rectangle([11, by0 - 2, 13, by0], fill=P["dark"]); d.point((12, by0 - 1), fill=P["glass"])
    if acc == "ev" and not back:
        d.point((7, by0 + 1), fill=P["green"]); d.point((8, by0 + 2), fill=P["green"])
    if acc.startswith("apron"):
        col = {"r": P["red"], "g": P["green"], "b": P["blue"], "o": P["orange"]}[acc[-1]]
        if not back:
            d.rectangle([6, by0 + 1, 9, by0 + bh - 1], fill=col)
        d.rectangle([hx0, hy0 - 1, hx0 + 5, hy0], fill=P["white"])
    return auto_outline(im)

def gen_characters():
    out = os.path.join(ROOT, "characters")
    os.makedirs(out, exist_ok=True)
    skins = [P["skin"], P["skin"], P["skin2"], P["skin"]]
    for look, variants in LOOKS.items():
        for vi, (hair, top, bottom, acc) in enumerate(variants):
            sheet = Image.new("RGBA", (CW * 4, CH * 2), (0, 0, 0, 0))
            for row, back in enumerate((False, True)):
                for fr in range(4):
                    sheet.paste(draw_person(hair, top, bottom, acc, back, fr, False, skins[vi % 4]), (fr * CW, row * CH))
            sheet.save(f"{out}/{look}_{vi}.png")
    kid_cols = [("4a3628", "f2c14e", "4a5b8c"), ("2b2733", "ef9bb0", "8d6cc0"), ("7a5236", "7cc47a", "e06c5a"), ("2b2733", "8fc7e8", "ee8f3b")]
    for vi, (hair, top, bottom) in enumerate(kid_cols):
        sheet = Image.new("RGBA", (CW * 4, CH * 2), (0, 0, 0, 0))
        for row, back in enumerate((False, True)):
            for fr in range(4):
                sheet.paste(draw_person(hair, top, bottom, "", back, fr, True), (fr * CW, row * CH))
        sheet.save(f"{out}/kid_{vi}.png")

# ------------------------------------------------------------------ 차량
CAR_COLORS = ["d9584a", "4f8fd0", "f6f1e3", "f2c14e", "5d6170", "46b3a4"]

class VC:
    """차량용 작은 아이소 캔버스. 원점은 차 중심 바닥."""
    def __init__(self, W=72, H=56, oy=34):
        self.im = Image.new("RGBA", (W, H), (0, 0, 0, 0)); self.d = ImageDraw.Draw(self.im)
        self.ox, self.oy = W // 2, oy
    def pt(self, gx, gy, z=0):
        return (self.ox + (gx - gy) * 32, self.oy + (gx + gy) * 16 - z)
    def poly(self, pts, c, o=None):
        self.d.polygon([(round(x), round(y)) for x, y in pts], fill=c, outline=o or shade(c, 0.6))
    def box(self, x0, y0, x1, y1, z0, z1, c, top=None):
        self.poly([self.pt(x1, y0, z0), self.pt(x1, y1, z0), self.pt(x1, y1, z1), self.pt(x1, y0, z1)], shade(c, 0.78))
        self.poly([self.pt(x0, y1, z0), self.pt(x1, y1, z0), self.pt(x1, y1, z1), self.pt(x0, y1, z1)], c)
        self.poly([self.pt(x0, y0, z1), self.pt(x1, y0, z1), self.pt(x1, y1, z1), self.pt(x0, y1, z1)], top or shade(c, 1.2))
    def lface(self, x0, x1, y, z0, z1, c):
        self.poly([self.pt(x0, y, z0), self.pt(x1, y, z0), self.pt(x1, y, z1), self.pt(x0, y, z1)], c)
    def rface(self, x, y0, y1, z0, z1, c):
        self.poly([self.pt(x, y0, z0), self.pt(x, y1, z0), self.pt(x, y1, z1), self.pt(x, y0, z1)], c)
    def wheel(self, gx, gy):
        x, y = self.pt(gx, gy, 0)
        self.d.ellipse([x - 3, y - 4, x + 3, y + 1], fill=P["black"]); self.d.point((round(x), round(y - 2)), fill=P["grey"])

def draw_vehicle(kind, color, front):
    """길이 방향이 x축. front=True 면 +x 로 달리는 모습(앞면이 보임), False 면 -x 로 달리는 모습(뒷면이 보임)."""
    v = VC()
    col = rgb(color)
    L, Wd, Hb, Hc = 0.42, 0.2, 7, 6
    cab0, cab1 = -0.18, 0.2
    if kind == "van": L, Hb, Hc, cab0, cab1 = 0.46, 8, 8, -0.36, 0.26
    if kind == "sedan": L, Hb, Hc, cab0, cab1, col = 0.48, 6, 5, -0.2, 0.16, rgb("2b2733")
    if kind == "ev": col = rgb("f6f1e3")
    if kind == "bus": L, Wd, Hb, Hc, cab0, cab1 = 0.9, 0.23, 9, 10, -0.86, 0.86
    if kind == "truck": L, Wd = 0.62, 0.22
    if kind == "bike":
        v.wheel(-0.2, 0.0); v.wheel(0.2, 0.0)
        v.box(-0.2, -0.05, 0.2, 0.05, 3, 6, col)
        px, py = v.pt(0.0, 0.0, 6)
        v.d.rectangle([px - 2, py - 7, px + 2, py - 1], fill=P["black"])
        v.d.rectangle([px - 2, py - 11, px + 2, py - 8], fill=P["red"] if color == CAR_COLORS[0] else P["yellow"])
        return auto_outline(v.im)
    sx = 1 if front else -1    # 앞이 +x 인지
    for gx in (-L + 0.14, L - 0.14):
        v.wheel(gx, Wd)
    wx, wy = v.pt(L, Wd * 0.2, 0); v.d.ellipse([wx - 2, wy - 4, wx + 2, wy], fill=P["black"])
    if kind == "truck":
        cabx0, cabx1 = (L - 0.36, L) if front else (-L, -L + 0.36)
        boxx0, boxx1 = (-L, L - 0.38) if front else (-L + 0.38, L)
        v.box(boxx0, -Wd, boxx1, Wd, 3, 20, rgb("e9e2d0"))
        v.lface(boxx0 + 0.04, boxx1 - 0.04, Wd, 9, 13, col)
        v.box(cabx0, -Wd, cabx1, Wd, 3, 15, col)
        if front:
            v.rface(L, -Wd + 0.03, Wd - 0.03, 9, 14, P["glass"])
            v.d.point(v.pt(L, Wd - 0.03, 5), fill=P["glass_n"])
        v.lface(cabx0 + 0.05, cabx1 - 0.05, Wd, 9, 13, P["glass"])
        return auto_outline(v.im)
    v.box(-L, -Wd, L, Wd, 2, 2 + Hb, col)
    c0, c1 = (cab0, cab1) if front else (-cab1, -cab0)
    v.box(c0, -Wd + 0.02, c1, Wd - 0.02, 2 + Hb, 2 + Hb + Hc, shade(col, 1.08))
    # 옆 유리
    if kind == "bus":
        for i in range(6):
            a = -L + 0.1 + i * 0.28
            v.lface(a, a + 0.2, Wd - 0.02, 2 + Hb + 2, 2 + Hb + Hc - 2, P["glass"])
        v.lface(-L, L, Wd, 5, 7, P["yellow"])
    else:
        v.lface(c0 + 0.04, c1 - 0.04, Wd - 0.02, 2 + Hb + 1, 2 + Hb + Hc - 1, P["glass"])
    # 앞/뒤 유리와 등
    v.rface(c1, -Wd + 0.05, Wd - 0.05, 2 + Hb + 1, 2 + Hb + Hc - 1, P["glass"] if front else shade(P["glass"], 0.8))
    lamp = P["glass_n"] if front else P["red"]
    for gy in (-Wd + 0.04, Wd - 0.06):
        p = v.pt(L, gy, 2 + Hb - 2); v.d.rectangle([p[0] - 1, p[1] - 1, p[0], p[1]], fill=lamp)
    if kind == "ev":
        v.lface(-L, L, Wd, 4, 5, P["green"])
    return auto_outline(v.im)

def gen_vehicles():
    out = os.path.join(ROOT, "vehicles")
    os.makedirs(out, exist_ok=True)
    for kind in ("car", "van", "truck", "bike", "bus", "ev", "sedan"):
        for ci, col in enumerate(CAR_COLORS):
            for tag, front in (("f", True), ("b", False)):
                draw_vehicle(kind, col, front).save(f"{out}/{kind}_{ci}_{tag}.png")

# ------------------------------------------------------------------ 효과 / UI
def gen_effects():
    out = os.path.join(ROOT, "effects")
    os.makedirs(out, exist_ok=True)
    # 그림자
    im = Image.new("RGBA", (16, 8), (0, 0, 0, 0)); ImageDraw.Draw(im).ellipse([1, 1, 14, 6], fill=(40, 40, 60, 80)); im.save(f"{out}/shadow.png")
    im = Image.new("RGBA", (48, 24), (0, 0, 0, 0)); ImageDraw.Draw(im).ellipse([2, 2, 45, 21], fill=(40, 40, 60, 70)); im.save(f"{out}/shadow_car.png")
    # 불빛 (계단식 원)
    im = Image.new("RGBA", (64, 48), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    for r, a in ((30, 22), (24, 34), (18, 48), (12, 66), (6, 90)):
        d.ellipse([32 - r, 24 - r * 0.72, 32 + r, 24 + r * 0.72], fill=(255, 226, 150, a))
    im.save(f"{out}/glow.png")
    # 말풍선 아이콘
    for name, icon in (("emote_happy", "heart"), ("emote_star", "star")):
        im = Image.new("RGBA", (13, 14), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
        d.rectangle([0, 0, 12, 10], fill=P["white"], outline=OUT); d.polygon([(5, 10), (8, 10), (6, 13)], fill=P["white"], outline=OUT); d.line([(6, 10), (7, 10)], fill=P["white"])
        draw_icon(im, icon, 2, 1); im.save(f"{out}/{name}.png")
    im = Image.new("RGBA", (13, 14), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.rectangle([0, 0, 12, 10], fill=P["white"], outline=OUT); d.polygon([(5, 10), (8, 10), (6, 13)], fill=P["white"], outline=OUT); d.line([(6, 10), (7, 10)], fill=P["white"])
    d.line([(3, 3), (5, 5)], fill=P["red"]); d.line([(9, 3), (7, 5)], fill=P["red"]); d.line([(4, 8), (8, 8)], fill=P["red"]); d.point((3, 8), fill=P["red"]); d.point((9, 8), fill=P["red"])
    im.save(f"{out}/emote_angry.png")
    # 반짝이 4프레임
    sheet = Image.new("RGBA", (9 * 4, 9), (0, 0, 0, 0)); d = ImageDraw.Draw(sheet)
    for f in range(4):
        cx = f * 9 + 4; r = [1, 2, 4, 2][f]
        d.line([(cx - r, 4), (cx + r, 4)], fill=P["white"]); d.line([(cx, 4 - r), (cx, 4 + r)], fill=P["white"]); d.point((cx, 4), fill=P["yellow"])
    sheet.save(f"{out}/sparkle.png")
    # 연기/김
    im = Image.new("RGBA", (8, 8), (0, 0, 0, 0)); ImageDraw.Draw(im).ellipse([1, 1, 6, 6], fill=(250, 250, 250, 170)); im.save(f"{out}/puff.png")
    # 경고(입구 막힘)
    im = Image.new("RGBA", (11, 11), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.polygon([(5, 0), (10, 10), (0, 10)], fill=P["yellow"], outline=OUT); d.line([(5, 3), (5, 6)], fill=P["dark"]); d.point((5, 8), fill=P["dark"]); im.save(f"{out}/warn.png")
    # 업그레이드 가능 화살표
    im = Image.new("RGBA", (9, 10), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.polygon([(4, 0), (8, 4), (6, 4), (6, 9), (2, 9), (2, 4), (0, 4)], fill=rgb("7be08a"), outline=OUT); im.save(f"{out}/up_arrow.png")

UI_ICONS = {
    "coin":    ["   yyyy   ", "  yyyyyy  ", " yyoyyoyy ", " yyoyyoyy ", " yyooooyy ", " yyoyyoyy ", " yyoyyoyy ", "  yyyyyy  ", "   yyyy   ", "          "],
    "people":  ["  bb      ", " bbbb  rr ", " bbbb rrrr", "  bb  rrrr", " bbbb  rr ", "bbbbbbrrrr", "bbbbbrrrrr", "bbbbbrrrrr", " b  b r  r", "          "],
    "rank":    ["    y     ", "   yyy    ", " yyyyyyy  ", "yyyyyyyyy ", " yyyyyyy  ", "  yyyyy   ", " yyy yyy  ", " yy   yy  ", "          ", "          "],
    "clock":   ["   wwww   ", "  wwwwww  ", " wwwdwwww ", " wwwdwwww ", " wwwdddww ", " wwwwwwww ", " wwwwwwww ", "  wwwwww  ", "   wwww   ", "          "],
    "build":   ["      ddd ", "     ddddd", "    dddddd", "   bb ddd ", "  bb   d  ", " bb       ", "bb        ", "b         ", "          ", "          "],
    "upgrade": ["    gg    ", "   gggg   ", "  gggggg  ", " gggggggg ", "    gg    ", "    gg    ", "    gg    ", "    gg    ", "          ", "          "],
    "research":["   wwww   ", "    ww    ", "    ww    ", "   wwww   ", "   wccw   ", "  wccccw  ", " wccccccw ", " wccccccw ", "  wwwwww  ", "          "],
    "staff":   ["   bbbb   ", "  bbbbbb  ", "  bssssb  ", "  ssssss  ", "   ssss   ", "  wwrrww  ", " wwwrrwww ", " wwwrrwww ", " wwwwwwww ", "          "],
    "codex":   [" bbbbbbbb ", " byyyyyyb ", " bywwwwyb ", " byyyyyyb ", " bywwwwyb ", " byyyyyyb ", " bywwwwyb ", " byyyyyyb ", " bbbbbbbb ", "          "],
    "perk":    ["  gg  gg  ", " gggggggg ", " gggggggg ", "  gggggg  ", "  gggggg  ", " gggggggg ", " ggg  ggg ", "  g  b g  ", "     b    ", "    bb    "],
    "menu":    ["          ", " wwwwwwww ", " wwwwwwww ", "          ", " wwwwwwww ", " wwwwwwww ", "          ", " wwwwwwww ", " wwwwwwww ", "          "],
    "pause":   ["          ", "  ww  ww  ", "  ww  ww  ", "  ww  ww  ", "  ww  ww  ", "  ww  ww  ", "  ww  ww  ", "  ww  ww  ", "          ", "          "],
    "play":    ["          ", "  ww      ", "  wwww    ", "  wwwwww  ", "  wwwwwww ", "  wwwwww  ", "  wwww    ", "  ww      ", "          ", "          "],
    "star":    ["    y     ", "    y     ", "   yyy    ", "yyyyyyyyy ", " yyyyyyy  ", "  yyyyy   ", "  yy yy   ", " yy   yy  ", "          ", "          "],
    "smile":   ["  yyyyyy  ", " yyyyyyyy ", "yydyyyydyy", "yydyyyydyy", "yyyyyyyyyy", "ydyyyyyydy", "yyddddddyy", " yyyyyyyy ", "  yyyyyy  ", "          "],
    "lock":    ["   dddd   ", "  dd  dd  ", "  dd  dd  ", " yyyyyyyy ", " yyyddyyy ", " yyyddyyy ", " yyyyyyyy ", " yyyyyyyy ", "          ", "          "],
    "chart":   ["         w", "       w w", "     w w w", "   w w w w", " w w w w w", " w w w w w", " w w w w w", "wwwwwwwwww", "          ", "          "],
    "gear":    ["   w  w   ", " w wwww w ", "  wwwwww  ", "wwww  wwww", " ww    ww ", " ww    ww ", "wwww  wwww", "  wwwwww  ", " w wwww w ", "   w  w   "],
    "expand":  ["www    www", "w        w", "w        w", "          ", "    ww    ", "    ww    ", "          ", "w        w", "w        w", "www    www"],
    "move":    ["    ww    ", "   wwww   ", "    ww    ", " w  ww  w ", "wwwwwwwwww", "wwwwwwwwww", " w  ww  w ", "    ww    ", "   wwww   ", "    ww    "],
    "trash":   ["   rrrr   ", " rrrrrrrr ", "          ", "  rrrrrr  ", "  rwrrwr  ", "  rwrrwr  ", "  rwrrwr  ", "  rwrrwr  ", "  rrrrrr  ", "          "],
    "trophy":  [" yyyyyyyy ", "yyyyyyyyyy", "y yyyyyy y", "y yyyyyy y", " yyyyyyyy ", "  yyyyyy  ", "   yyyy   ", "    yy    ", "   yyyy   ", "  bbbbbb  "],
}
UCOL = {"y": P["yellow"], "o": rgb("c98a1e"), "b": rgb("5a86c8"), "r": P["red"], "w": P["white"], "d": P["dark"], "g": rgb("6fcf7f"), "c": rgb("7ec8e3"), "s": P["skin"]}

def gen_ui():
    out = os.path.join(ROOT, "ui")
    os.makedirs(out, exist_ok=True)
    for name, rows in UI_ICONS.items():
        im = Image.new("RGBA", (12, 12), (0, 0, 0, 0))
        for j, row in enumerate(rows):
            for i, ch in enumerate(row):
                if ch != " ":
                    im.putpixel((i + 1, j + 1), UCOL[ch])
        auto_outline(im).save(f"{out}/{name}.png")
    # 분야 아이콘 (9x9 간판 아이콘 재사용)
    cats = {"basic": "p", "food": "food", "shop": "cart", "tour": "scope", "car": "fuel", "relax": "cup", "family": "cone", "deco": "heart"}
    for cat, icon in cats.items():
        im = Image.new("RGBA", (11, 11), (0, 0, 0, 0)); draw_icon(im, icon, 1, 1); auto_outline(im).save(f"{out}/cat_{cat}.png")
    for name in ICONS:
        im = Image.new("RGBA", (11, 11), (0, 0, 0, 0)); draw_icon(im, name, 1, 1); auto_outline(im).save(f"{out}/ic_{name}.png")
    # 게임 아이콘
    im = Image.new("RGBA", (64, 64), rgb("8cc474")); d = ImageDraw.Draw(im)
    d.rectangle([0, 44, 63, 63], fill=P["asphalt"]); d.rectangle([4, 53, 18, 54], fill=P["line"]); d.rectangle([26, 53, 40, 54], fill=P["line"]); d.rectangle([48, 53, 62, 54], fill=P["line"])
    d.rectangle([14, 20, 50, 44], fill=P["cream"], outline=OUT); d.polygon([(10, 22), (32, 6), (54, 22)], fill=P["roof_r"], outline=OUT)
    d.rectangle([28, 30, 36, 44], fill=P["wood"], outline=OUT); d.rectangle([18, 26, 25, 33], fill=P["glass"], outline=OUT); d.rectangle([39, 26, 46, 33], fill=P["glass"], outline=OUT)
    im.save(os.path.join(ROOT, "..", "..", "icon.png"))

if __name__ == "__main__":
    for sub in ("tiles", "buildings", "characters", "vehicles", "effects", "ui"):
        os.makedirs(os.path.join(ROOT, sub), exist_ok=True)
    gen_tiles(); gen_buildings(); gen_characters(); gen_vehicles(); gen_effects(); gen_ui()
    n = sum(len(f) for _, _, f in os.walk(ROOT))
    print("generated files:", n)

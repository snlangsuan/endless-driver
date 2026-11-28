# A car met on the mountain passes (engine/src/ae86.js; not one the player drives), from "1985 Toyota Sprinter Trueno AE86 Project D" by
# Ddiaz Design (CC BY-NC-SA 4.0 - non-commercial, share-alike: see CREDITS.md) -> engine/assets/ae86.bin.
# Run: python3 scripts/ae86.py ~/Downloads/1985_toyota_sprinter_trueno_ae86_project_d.glb engine/assets/ae86.bin   (needs numpy and Pillow)
# As scripts/gr86.py (the format in scripts/pcr2.py). The body is class 0, the paint, its two tones from its own map - with no lettering and no badges: the writing on the doors and the maker's names on the tail are painted out. The cabin
# is left out (the game's glass is not seen through). The model is in centimetres-ish units, its nose toward +z: brought to 4.2 m long.
import sys
import numpy as np
from pcr2 import GLB, gather, hubs, records, write

src, out = sys.argv[1], sys.argv[2]
glb = GLB(src)
# (the paint map and the trim map, with the writing and the makers' names painted out, before anything reads them: the lettering on the doors
# - a white field - and the band of names along the top of the trim's map - black)
_img = glb.image
def image(im):
    P = _img(im)
    if im in PATCH:
        from PIL import ImageDraw
        P = P.convert('RGB'); w, h = P.size; x0, y0, x1, y1, col = PATCH[im]; ImageDraw.Draw(P).rectangle([int(x0 * w), int(y0 * h), int(x1 * w), int(y1 * h)], fill=col)
    return P
glb.image = image
def img_of(part):
    for M in glb.J['materials']:
        if part in M.get('name', '').lower(): return glb.J['textures'][M['pbrMetallicRoughness']['baseColorTexture']['index']]['source']
PATCH = {img_of('carpaint'): (0.41, 0.80, 0.69, 0.885, (255, 255, 255)), img_of('details_ext'): (0.0, 0.0, 1.0, 0.37, (5, 5, 5))}
def klass(name, path):
    n = name.lower()
    if any(h in n for h in ('details_mat_021', 'details_int', 'details_add')): return None      # the cabin
    if 'carpaint' in n: return 20
    if 'details_ext' in n: return 21
    if 'carbon' in n: return 9
    if 'glass_' in n and 'mat_glass' in n: return 2
    if n == 'orange_glass' or n == 'yellow': return 7
    if n == 'phong3': return 6
    if 'lights' in n: return 12
    if 'tyre' in n: return 4
    if 'tire_' in n: return 3
    return 1
def wheel(path, name):
    n = name.lower()
    if 'tire_brake' in n: return 2
    return 1 if ('tire_' in n or 'tyre' in n) else 0
# (every part keeps its own map now - the two tones of the paint, the weave of the bonnet, the wheels, the tyres' walls, the trim - where
# before only the lamps did, the rest a colour to each vertex: the paint's edge ran in steps from vertex to vertex. Normal maps for the big
# parts only: each map is a 1024 x 1024 layer.)
NRM = ('carpaint', 'carbon', 'tyre', 'tire_hub', 'details_ext')
R = gather(glb, klass, wheel=wheel, notex=lambda name: False,
           second=lambda k, M: M.get('emissiveTexture', {}).get('index') if k == 12 else (M.get('normalTexture', {}).get('index') if any(q in M.get('name', '').lower() for q in NRM) else None))
V, N, C, K, WH, I, UV, LC, LN = (R[q] for q in ('V', 'N', 'C', 'K', 'WH', 'I', 'UV', 'LC', 'LN'))
V[:, 2] *= -1; N[:, 2] *= -1                      # (gather turns a model whose nose is toward -z: this one's is toward +z)
sc = 4.2 / (V[:, 2].max() - V[:, 2].min()); V *= sc
K[K == 20] = 0; K[K == 21] = 1
HUB = hubs(V, WH)
print('verts', len(V), 'tris', len(I), 'size', (V.max(0) - V.min(0)).round(3), 'hubs', np.round(HUB, 3).tolist(), 'classes', {int(k): int((K == k).sum()) for k in np.unique(K)}, 'wheels', {int(k): int((WH == k).sum()) for k in np.unique(WH)})
write(out, glb, R['LAYER'], records(V, N, C, K, WH, LC, LN, UV), I, HUB)

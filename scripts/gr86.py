# The player's second car, from "GR86 2021" by Galaxy Car Showroom (CC BY 4.0, see CREDITS.md) -> engine/assets/gr86.bin.
# Run: python3 scripts/gr86.py ~/Downloads/gr86_2021.glb engine/assets/gr86.bin   (needs numpy and Pillow)
# As scripts/mx5.py makes the MX-5 (the format in scripts/pcr2.py), with the same classes the shader lights each part by - 0 body paint, 1 plain,
# 2 window glass, 3 metal, 4 tyre, 9 black gloss, 10 the exhaust's tips - and one of its own: 12, a lamp, its inside as the model paints it
# (the reflectors, the red and amber of the lenses) under a clear glossy lens, lit by the model's own map of what glows: the vertex's second layer
# is that map, not a normal map. (The model's lenses, clear and see-through over the insides, are left out: the game's glass is not
# see-through, and over the lamps it hid them.) The badges are left out, and the cabin, the engine and the boot: behind glass that is not
# see-through and panels that do not open, none of it is seen. Mirrored to right-hand drive.
import sys
import numpy as np
from pcr2 import GLB, gather, hubs, records, write

src, out = sys.argv[1], sys.argv[2]
glb = GLB(src)
HIDDEN = ('interior', 'leather', 'carpet', 'seatbelt', 'trunk', 'engine', 'screen', 'logo', 'light_glass')
def klass(name, path):
    n = name.lower()
    if any(h in n for h in HIDDEN): return None
    if n == 'paint': return 0
    if n == 'window_glass': return 2
    if n == 'trim_gloss_black': return 9
    if n == 'mirror': return 3
    if n in ('light_bucket', 'material'): return 12
    if n in ('wheel0031mtl', 'wheel1mtl', 'wheel0041mtl'): return 4      # (the tread, the outer shell of the tyre, its sidewall)
    if n == 'wheel0051mtl': return 9      # (the nuts and the rim's dark centre)
    if n in ('wheel0021mtl', 'wheel0081mtl'): return 3      # (the brake disc; the wheel's spokes and the callipers)
    if any(q.startswith('SK_Exhaust') for q in path): return 10
    return 1
# (Wheel007x: the callipers, on the wheels' own map - they steer with the front wheels but do not roll)
def wheel(path, name):
    if not any(q.startswith('Wheel') for q in path): return 0
    return 2 if any(q.startswith('Wheel007') for q in path) else 1
R = gather(glb, klass, wheel=wheel, second=lambda k, M: M.get('emissiveTexture', {}).get('index') if k == 12 else M.get('normalTexture', {}).get('index'))
V, N, C, K, WH, I, UV, LC, LN = (R[q] for q in ('V', 'N', 'C', 'K', 'WH', 'I', 'UV', 'LC', 'LN'))
# (the black plastics are pure black in the model, which here gave nothing back but the sky's shine: a little above black)
C[K == 1] = np.maximum(C[K == 1], 0.03)
HUB = hubs(V, WH)
print('verts', len(V), 'tris', len(I), 'size', (V.max(0) - V.min(0)).round(3), 'hubs', np.round(HUB, 3).tolist(), 'classes', {int(k): int((K == k).sum()) for k in np.unique(K)})
write(out, glb, R['LAYER'], records(V, N, C, K, WH, LC, LN, UV), I, HUB)

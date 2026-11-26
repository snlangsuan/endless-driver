# The player's car from "2016 Mazda MX-5 Miata" by Galaxy Car Showroom (CC BY 4.0, see CREDITS.md) -> engine/assets/mx5.bin.
# Run: python3 scripts/mx5.py ~/Downloads/2016_mazda_mx-5_miata.glb engine/assets/mx5.bin   (needs numpy and Pillow)
# In the game's car measure: x to the left, y up from the ground under the tyres, z ahead, metres; mirrored to right-hand drive. The badges are
# left out. Each vertex gets its colour from its material's texture (or plain colour), and a material class the shader lights it by:
# 0 body paint, 1 plain (its own colour, matte), 2 window glass, 3 metal, 4 tyre, 5 headlamp, 6 tail lamp, 7 indicator, 8 cabin, 9 black gloss,
# 10 the exhaust's tips (dark, sooty metal), 11 the black print round the windscreen's edge and behind the mirror (the frit), 13 a clear lamp
# lens not lit (the reversing lamps), 14 a red one not lit (the reflectors).
# The model's own textures go with it - the colour maps of the underbody and grille, the lamps' insides, the cabin and the tyres, and the normal
# maps of the tyres, the wheels, the hood's cloth, the cabin and the underbody - each made 1024 x 1024 and stored as a JPEG (PNG where it has a
# cut-out) for the game to put into one texture array (playercar.js); a vertex on a textured part carries its place on the texture and which of
# the array's layers to take its colour and its normal from (its colour then is the material's own factor, the texture's taken in the shader).
# (Before, each vertex took the one colour of its texture under it, and every detail smaller than a triangle - the grille's mesh, the lettering
# on the tyres, the treads - was lost.) The engine's maps are left out: it is not seen.
# The format is in scripts/pcr2.py.
import sys
import numpy as np
from pcr2 import GLB, gather, hubs, records, write

src, out = sys.argv[1], sys.argv[2]
glb = GLB(src)
# the class of each material, by its name (None: left out)
def klass(name, path):
    n = name.lower()
    if 'badge' in n: return None
    if n.startswith('m_carpaintnormal'): return 0
    if 'windowsurround' in n: return 11
    if 'trim_plasticsmoothblack' in n or 'plasticsmoothblack' in n or n == 'black' or n == 'screen': return 9
    if 'glass_windowfront' in n: return 2
    if 'lightglassnormal_red' in n: return 6
    if 'lightglassnormal_orange' in n: return 7
    if 'lightglassnormal_clear' in n: return 5
    if 'nickel' in n or n == 'mirror' or 'rim_main' in n: return 3
    if 'tire' in n: return 4
    if 'interior' in n or 'fabric' in n or n == 'tiled': return 8
    return 1
R = gather(glb, klass, skip=lambda path: path[-1].startswith('Hood 6_119') or path[-1].startswith('Boot 6_156'),      # (the emblems on the bonnet and the boot lid)
           wheel=lambda path, name: 1 if any(('Wheel' in q or 'Tire' in q) for q in path) else 0, notex=lambda name: 'engine' in name.lower(),
           cut=lambda name: 'interior' in name.lower())      # (cut-out parts of the cabin's texture: triangles that are mostly clear are left out)
V, N, C, K, WH, I, UV, LC, LN = (R[q] for q in ('V', 'N', 'C', 'K', 'WH', 'I', 'UV', 'LC', 'LN'))
# (the grey fitting at the top of the boot lid, where the badge was, read as a spot on the paint: it goes; and the exhaust's tips are their own
# class - as bright metal they gave back the sky and looked like two lamps under the bumper)
tc = V[I].mean(1); tk = K[I[:, 0]]
I = I[~((tk == 1) & (np.abs(tc[:, 0]) < 0.13) & (tc[:, 1] > 0.7) & (tc[:, 2] < -1.68))]
# (and the badge on the middle of the lid is part of the body's own skin, modelled in relief: there the skin is pressed flat into the lid's
# surface around it - a plane fitted to the paint just outside - its triangles kept. Cut out, they left a hole the badge's shape.)
for cen in ([0, 0.885, -1.657], [0, 0.898, -1.775]):
    cen = np.array(cen); dd = np.linalg.norm((V - cen)[:, [0, 2]], axis=1); paint = K == 0
    ring = paint & (dd > 0.07) & (dd < 0.14) & (np.abs(V[:, 1] - cen[1]) < 0.06) & (N[:, 1] > 0.6)
    A = np.c_[np.ones(ring.sum()), V[ring][:, 0], V[ring][:, 2]]; co = np.linalg.lstsq(A, V[ring][:, 1], rcond=None)[0]
    inn = paint & (dd < 0.065) & (np.abs(V[:, 1] - cen[1]) < 0.05)
    V[inn, 1] = co[0] + co[1] * V[inn, 0] + co[2] * V[inn, 2]; nn = np.array([-co[1], 1, -co[2]]); N[inn] = nn / np.linalg.norm(nn)
# (and the high brake lamp on the middle of the boot lid, with its housing: unlit, a dark spot on the red)
tc = V[I].mean(1); tk = K[I[:, 0]]; I = I[~(np.isin(tk, [1, 6, 9]) & (np.abs(tc[:, 0]) < 0.2) & (tc[:, 1] > 0.75) & (tc[:, 2] < -1.2) & (tc[:, 2] > -1.75))]
tc = V[I].mean(1); ex = np.unique(I[(K[I[:, 0]] == 3) & (tc[:, 1] < 0.3) & (tc[:, 2] < -1.5)]); K[ex] = 10
# (the lamps at the back that are not lit driving along: the clear lenses - the reversing lamps, low in the bumper's corners, in the middle
# under the number plate and inside the tail lamps - class 13, and the red reflectors low on the bumper's sides, class 14: the shader draws
# them as the lenses they are, unlit. As head and tail lamps they shone white and red under the bumper at night.)
K[(K == 5) & (V[:, 2] < -1.0)] = 13
K[(K == 6) & (V[:, 2] < -1.0) & (V[:, 1] < 0.6) & (np.abs(V[:, 0]) > 0.75)] = 14
# the wheels: each wheel and tyre vertex goes to the wheel of its quarter; its hub is the middle of that quarter's tyre
HUB = hubs(V, WH)
print('verts', len(V), 'tris', len(I), 'size', (V.max(0) - V.min(0)).round(3), 'hubs', np.round(HUB, 3).tolist())
rec = records(V, N, C, K, WH, LC, LN, UV)
# The frit's distance from the clear glass, for the band of dots along its edge (the shader's): from each of its vertices to the nearest point of
# the glass's triangles' edges, sampled every few millimetres.
fm = K == 11
if fm.any():
    gt = I[K[I[:, 0]] == 2]; E = np.concatenate([gt[:, [0, 1]], gt[:, [1, 2]], gt[:, [2, 0]]]); tt = np.linspace(0, 1, 9)[None, :, None]
    G = (V[E[:, 0]][:, None, :] * (1 - tt) + V[E[:, 1]][:, None, :] * tt).reshape(-1, 3)
    fd = np.array([np.sqrt(((G - p) ** 2).sum(1)).min() for p in V[fm]])
    rec['c'][fm, 3] = np.clip(np.round(fd / 0.1 * 255), 0, 255); print('frit verts', fm.sum(), 'distance to glass m: min', fd.min().round(4), 'max', fd.max().round(3))
write(out, glb, R['LAYER'], rec, I, HUB)

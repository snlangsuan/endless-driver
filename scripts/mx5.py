# The player's car from "2016 Mazda MX-5 Miata" by Galaxy Car Showroom (CC BY 4.0, see CREDITS.md) -> engine/assets/mx5.bin.
# Run: python3 scripts/mx5.py ~/Downloads/2016_mazda_mx-5_miata.glb engine/assets/mx5.bin   (needs numpy and Pillow)
# In the game's car measure: x to the left, y up from the ground under the tyres, z ahead, metres; mirrored to right-hand drive. The badges are
# left out. Each vertex gets its colour from its material's texture (or plain colour), and a material class the shader lights it by:
# 0 body paint, 1 plain (its own colour, matte), 2 window glass, 3 metal, 4 tyre, 5 headlamp, 6 tail lamp, 7 indicator, 8 cabin, 9 black gloss,
# 10 the exhaust's tips (dark, sooty metal).
# Format "PCR1": vertex and index counts (uint32), the four wheels' hubs (front left, front right, rear left, rear right: 12 float32), then per
# vertex place (3 float32), normal (3 float32), colour (4 uint8, sRGB), class and wheel (uint8: class, wheel 0 none / 1-4, two to spare);
# then the triangles (uint32).
import sys, json, struct, io
import numpy as np
from PIL import Image

src, out = sys.argv[1], sys.argv[2]
b = open(src, 'rb').read(); cl = struct.unpack('<I', b[12:16])[0]; J = json.loads(b[20:20 + cl]); o = 20 + cl
BIN = b[o + 8:o + 8 + struct.unpack('<I', b[o:o + 4])[0]]
CT = {5126: np.float32, 5123: np.uint16, 5125: np.uint32, 5121: np.uint8}; NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}
def acc(i):
    a = J['accessors'][i]; bv = J['bufferViews'][a['bufferView']]; dt = np.dtype(CT[a['componentType']]); n = NC[a['type']]
    off = bv.get('byteOffset', 0) + a.get('byteOffset', 0); st = bv.get('byteStride', dt.itemsize * n)
    raw = np.frombuffer(BIN, dtype=np.uint8, count=st * (a['count'] - 1) + dt.itemsize * n, offset=off)
    return np.lib.stride_tricks.as_strided(raw, shape=(a['count'], dt.itemsize * n), strides=(st, 1)).copy().view(dt).reshape(a['count'], n)
TEX = {}
def tex(mi):
    if mi in TEX: return TEX[mi]
    pb = J['materials'][mi].get('pbrMetallicRoughness', {}); t = None
    if 'baseColorTexture' in pb:
        im = J['images'][J['textures'][pb['baseColorTexture']['index']]['source']]; bv = J['bufferViews'][im['bufferView']]
        I = Image.open(io.BytesIO(BIN[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']])).convert('RGBA').resize((512, 512), Image.LANCZOS)
        t = np.asarray(I).astype(np.float32) / 255
    TEX[mi] = (t, np.array(pb.get('baseColorFactor', [1, 1, 1, 1]), dtype=np.float32)); return TEX[mi]
def mat(nd):
    if 'matrix' in nd: return np.array(nd['matrix'], dtype=np.float64).reshape(4, 4).T
    T = np.eye(4); t = nd.get('translation', [0, 0, 0]); x, y, z, w = nd.get('rotation', [0, 0, 0, 1]); s = nd.get('scale', [1, 1, 1])
    R = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)], [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)], [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
    T[:3, :3] = R * np.array(s); T[:3, 3] = t; return T
# the class of each material, by its name (None: left out)
def klass(name):
    n = name.lower()
    if 'badge' in n: return None
    if n.startswith('m_carpaintnormal'): return 0
    if 'trim_plasticsmoothblack' in n or 'plasticsmoothblack' in n or n == 'black' or n == 'screen' or 'windowsurround' in n: return 9
    if 'glass_windowfront' in n: return 2
    if 'lightglassnormal_red' in n: return 6
    if 'lightglassnormal_orange' in n: return 7
    if 'lightglassnormal_clear' in n: return 5
    if 'nickel' in n or n == 'mirror' or 'rim_main' in n: return 3
    if 'tire' in n: return 4
    if 'interior' in n or 'fabric' in n or n == 'tiled': return 8
    return 1
Vs, Ns, Cs, Ks, Ws, Is = [], [], [], [], [], []; base = 0
def walk(i, P, path):
    global base
    nd = J['nodes'][i]; W = P @ mat(nd); path = path + [nd.get('name', '')]
    if 'mesh' in nd:
        for p in J['meshes'][nd['mesh']]['primitives']:
            mi = p.get('material', 0); name = J['materials'][mi].get('name', ''); k = klass(name)
            if k is None: continue
            if any(q.startswith('Hood 6_119') or q.startswith('Boot 6_156') for q in path): continue      # (the emblems on the bonnet and the boot lid)
            A = p['attributes']; v = acc(A['POSITION']).astype(np.float64); idx = acc(p['indices']).reshape(-1, 3).astype(np.int64) if 'indices' in p else np.arange(len(v)).reshape(-1, 3)
            v = (np.c_[v, np.ones(len(v))] @ W.T)[:, :3]
            n = acc(A['NORMAL']).astype(np.float64) @ np.linalg.inv(W[:3, :3]).T if 'NORMAL' in A else None
            t, f = tex(mi)
            if t is not None and 'TEXCOORD_0' in A:
                uv = np.mod(acc(A['TEXCOORD_0']).astype(np.float64), 1); s = t.shape[0]
                c = t[np.clip((uv[:, 1] * s).astype(int), 0, s - 1), np.clip((uv[:, 0] * s).astype(int), 0, s - 1)] * f
            else: c = np.tile(f, (len(v), 1))
            if 'interior' in name.lower():      # (cut-out parts of the cabin's texture: triangles that are mostly clear are left out)
                idx = idx[c[idx, 3].mean(1) > 0.3]
            wheel = 1 if any(('Wheel' in q or 'Tire' in q) for q in path) else 0
            Vs.append(v); Ns.append(n); Cs.append(c[:, :3]); Ks.append(np.full(len(v), k)); Ws.append(np.full(len(v), wheel)); Is.append(idx + base); base += len(v)
    for c in nd.get('children', []): walk(c, W, path)
for r in J['scenes'][J.get('scene', 0)]['nodes']: walk(r, np.eye(4), [])
V = np.concatenate(Vs); C = np.concatenate(Cs); K = np.concatenate(Ks); WH = np.concatenate(Ws); I = np.concatenate(Is)
N = []
for v, n in zip(Vs, Ns): N.append(n if n is not None else np.zeros_like(v))
N = np.concatenate(N)
miss = np.linalg.norm(N, axis=1) < 1e-9
if miss.any():
    fn = np.cross(V[I[:, 1]] - V[I[:, 0]], V[I[:, 2]] - V[I[:, 0]]); acc_n = np.zeros_like(V)
    for j in range(3): np.add.at(acc_n, I[:, j], fn)
    N[miss] = acc_n[miss]
N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-12)
# to the game's measure: ahead is the model's -z; the model's +x is its right, the game's +x its left - kept as it is, which mirrors the car to
# right-hand drive. Standing on its tyres, its middle over the origin.
V[:, 2] *= -1; N[:, 2] *= -1
V[:, 1] -= V[:, 1].min(); V[:, 0] -= (V[:, 0].min() + V[:, 0].max()) / 2; V[:, 2] -= (V[:, 2].min() + V[:, 2].max()) / 2
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
# the wheels: each wheel and tyre vertex goes to the wheel of its quarter; its hub is the middle of that quarter's tyre
HUB = []
for qi, (sx, sz) in enumerate([(1, 1), (-1, 1), (1, -1), (-1, -1)]):
    m = (WH > 0) & (np.sign(V[:, 0]) == sx) & (np.sign(V[:, 2]) == sz); WH[m & (WH > 0)] = qi + 1
    q = V[m]; HUB.append([(q[:, 0].min() + q[:, 0].max()) / 2, (q[:, 1].min() + q[:, 1].max()) / 2, (q[:, 2].min() + q[:, 2].max()) / 2])
print('verts', len(V), 'tris', len(I), 'size', (V.max(0) - V.min(0)).round(3), 'hubs', np.round(HUB, 3).tolist())
rec = np.zeros(len(V), dtype=[('p', '<f4', 3), ('n', '<f4', 3), ('c', 'u1', 4), ('k', 'u1', 4)])
rec['p'] = V; rec['n'] = N; rec['c'][:, :3] = np.clip(np.round(np.clip(C, 0, 1) ** (1 / 2.2) * 255), 0, 255); rec['c'][:, 3] = 255
rec['k'][:, 0] = K; rec['k'][:, 1] = WH
with open(out, 'wb') as fo:
    fo.write(struct.pack('<4sII', b'PCR1', len(V), I.size)); fo.write(np.array(HUB, dtype='<f4').tobytes()); fo.write(rec.tobytes()); fo.write(I.astype('<u4').tobytes())
print('bytes', 12 + 48 + rec.nbytes + I.size * 4)

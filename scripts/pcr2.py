# What scripts/mx5.py and scripts/gr86.py share: reading a binary glTF (.glb) and writing the player's car in the game's format "PCR2" (playercar.js).
# Format "PCR2": vertex and index counts (uint32), the four wheels' hubs (front left, front right, rear left, rear right: 12 float32), the number
# of texture layers (uint32) and for each its length in bytes (uint32) and the image, padded to 4 bytes; then per vertex place (3 float32),
# normal (3 float32), colour (4 uint8, sRGB; the fourth free for the shader's use by class - the MX-5's frit: how far it is from the clear glass),
# class, wheel, colour layer and normal layer (uint8: class; wheel 0 none, 1-4 a wheel that rolls and (the front pair) steers, 5-8 a part of
# wheel 1-4 that steers with it but does not roll - a brake calliper; layers 255 none), place on the texture (2 float32); then the triangles (uint32).
# In the game's car measure: x to the left, y up from the ground under the tyres, z ahead, metres. The models' ahead is their -z and their +x their
# right; +x kept as it is, which mirrors a left-hand-drive car to right-hand drive.
import json, struct, io
import numpy as np
from PIL import Image

CT = {5126: np.float32, 5123: np.uint16, 5125: np.uint32, 5121: np.uint8}; NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}


class GLB:
    def __init__(self, src):
        b = open(src, 'rb').read(); cl = struct.unpack('<I', b[12:16])[0]; self.J = json.loads(b[20:20 + cl]); o = 20 + cl
        self.BIN = b[o + 8:o + 8 + struct.unpack('<I', b[o:o + 4])[0]]

    def acc(self, i):
        J = self.J; a = J['accessors'][i]; bv = J['bufferViews'][a['bufferView']]; dt = np.dtype(CT[a['componentType']]); n = NC[a['type']]
        off = bv.get('byteOffset', 0) + a.get('byteOffset', 0); st = bv.get('byteStride', dt.itemsize * n)
        raw = np.frombuffer(self.BIN, dtype=np.uint8, count=st * (a['count'] - 1) + dt.itemsize * n, offset=off)
        return np.lib.stride_tricks.as_strided(raw, shape=(a['count'], dt.itemsize * n), strides=(st, 1)).copy().view(dt).reshape(a['count'], n)

    def image(self, im):
        bv = self.J['bufferViews'][self.J['images'][im]['bufferView']]
        return Image.open(io.BytesIO(self.BIN[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']]))

    @staticmethod
    def mat(nd):
        if 'matrix' in nd: return np.array(nd['matrix'], dtype=np.float64).reshape(4, 4).T
        T = np.eye(4); t = nd.get('translation', [0, 0, 0]); x, y, z, w = nd.get('rotation', [0, 0, 0, 1]); s = nd.get('scale', [1, 1, 1])
        R = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)], [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)], [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
        T[:3, :3] = R * np.array(s); T[:3, 3] = t; return T


def gather(G, klass, skip=lambda path: False, wheel=lambda path, name: 0, notex=lambda name: False, cut=lambda name: False, second=lambda k, M: M.get('normalTexture', {}).get('index')):
    """Every primitive of the scene, in the game's measure, standing on its tyres with its middle over the origin.
    klass(name, path): the material's class, or None to leave the part out; skip(path): leave out a whole node (and what is under it);
    wheel(path, name): 0 not a wheel, 1 rolls with the wheel, 2 steers with it but does not roll; notex(name): no texture layers - the colour of the
    material's texture under each vertex instead; cut(name): leave out the triangles that are mostly clear in the texture;
    second(k, material): the texture index for the vertex's second layer (its normal map, unless the class takes something else there)."""
    J = G.J; LAYER = {}; TEX = {}
    def layer(ti):
        if ti is None: return 255
        im = J['textures'][ti]['source']
        if im not in LAYER: LAYER[im] = len(LAYER)
        return LAYER[im]
    def tex(mi):
        if mi in TEX: return TEX[mi]
        pb = J['materials'][mi].get('pbrMetallicRoughness', {}); t = None
        if 'baseColorTexture' in pb:
            I = G.image(J['textures'][pb['baseColorTexture']['index']]['source']).convert('RGBA').resize((512, 512), Image.LANCZOS)
            t = np.asarray(I).astype(np.float32) / 255
        TEX[mi] = (t, np.array(pb.get('baseColorFactor', [1, 1, 1, 1]), dtype=np.float32)); return TEX[mi]
    Vs, Ns, Cs, Ks, Ws, Is, UVs, LCs, LNs = [], [], [], [], [], [], [], [], []; base = [0]
    def walk(i, P, path):
        nd = J['nodes'][i]; W = P @ G.mat(nd); path = path + [nd.get('name', '')]
        if skip(path): return
        if 'mesh' in nd:
            for p in J['meshes'][nd['mesh']]['primitives']:
                mi = p.get('material', 0); M = J['materials'][mi]; name = M.get('name', ''); k = klass(name, path)
                if k is None: continue
                A = p['attributes']; v = G.acc(A['POSITION']).astype(np.float64); idx = G.acc(p['indices']).reshape(-1, 3).astype(np.int64) if 'indices' in p else np.arange(len(v)).reshape(-1, 3)
                v = (np.c_[v, np.ones(len(v))] @ W.T)[:, :3]
                n = G.acc(A['NORMAL']).astype(np.float64) @ np.linalg.inv(W[:3, :3]) if 'NORMAL' in A else None      # (row vectors: n times the inverse is the inverse-transpose's turn; with .T as before, a part with its own rotation - the GR86's doors, lids and bumpers - had its normals turned the wrong way and its paint mirrored the sky in grey patches)
                t, f = tex(mi); nt = notex(name)
                uv0 = G.acc(A['TEXCOORD_0']).astype(np.float64) if 'TEXCOORD_0' in A else np.zeros((len(v), 2))
                lc = 255 if nt else layer(M.get('pbrMetallicRoughness', {}).get('baseColorTexture', {}).get('index'))
                ln = 255 if nt or 'TEXCOORD_0' not in A else layer(second(k, M))
                if 'TEXCOORD_0' not in A: lc = 255
                if t is not None and 'TEXCOORD_0' in A:
                    uv = np.mod(G.acc(A['TEXCOORD_0']).astype(np.float64), 1); s = t.shape[0]
                    c = t[np.clip((uv[:, 1] * s).astype(int), 0, s - 1), np.clip((uv[:, 0] * s).astype(int), 0, s - 1)] * f
                else: c = np.tile(f, (len(v), 1))
                if cut(name): idx = idx[c[idx, 3].mean(1) > 0.3]
                if lc != 255: c = np.tile(f, (len(v), 1))
                UVs.append(uv0); LCs.append(np.full(len(v), lc)); LNs.append(np.full(len(v), ln))
                Vs.append(v); Ns.append(n); Cs.append(c[:, :3]); Ks.append(np.full(len(v), k)); Ws.append(np.full(len(v), wheel(path, name))); Is.append(idx + base[0]); base[0] += len(v)
        for c in nd.get('children', []): walk(c, W, path)
    for r in J['scenes'][J.get('scene', 0)]['nodes']: walk(r, np.eye(4), [])
    V = np.concatenate(Vs); C = np.concatenate(Cs); K = np.concatenate(Ks); WH = np.concatenate(Ws); I = np.concatenate(Is)
    UV = np.concatenate(UVs); LC = np.concatenate(LCs); LN = np.concatenate(LNs)
    N = np.concatenate([n if n is not None else np.zeros_like(v) for v, n in zip(Vs, Ns)])
    miss = np.linalg.norm(N, axis=1) < 1e-9
    if miss.any():
        fn = np.cross(V[I[:, 1]] - V[I[:, 0]], V[I[:, 2]] - V[I[:, 0]]); acc_n = np.zeros_like(V)
        for j in range(3): np.add.at(acc_n, I[:, j], fn)
        N[miss] = acc_n[miss]
    N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-12)
    V[:, 2] *= -1; N[:, 2] *= -1
    V[:, 1] -= V[:, 1].min(); V[:, 0] -= (V[:, 0].min() + V[:, 0].max()) / 2; V[:, 2] -= (V[:, 2].min() + V[:, 2].max()) / 2
    return dict(V=V, N=N, C=C, K=K, WH=WH, I=I, UV=UV, LC=LC, LN=LN, LAYER=LAYER)


def hubs(V, WH):
    """Each wheel part to the wheel of its quarter (WH changed in place: 1 -> 1-4, 2 -> 5-8); a hub is the middle of what rolls in its quarter."""
    raw = WH.copy(); HUB = []
    for qi, (sx, sz) in enumerate([(1, 1), (-1, 1), (1, -1), (-1, -1)]):
        q4 = (np.sign(V[:, 0]) == sx) & (np.sign(V[:, 2]) == sz); m = (raw == 1) & q4; WH[m] = qi + 1; WH[(raw == 2) & q4] = qi + 5
        q = V[m]; HUB.append([(q[:, 0].min() + q[:, 0].max()) / 2, (q[:, 1].min() + q[:, 1].max()) / 2, (q[:, 2].min() + q[:, 2].max()) / 2])
    return HUB


def records(V, N, C, K, WH, LC, LN, UV):
    rec = np.zeros(len(V), dtype=[('p', '<f4', 3), ('n', '<f4', 3), ('c', 'u1', 4), ('k', 'u1', 4), ('uv', '<f4', 2)])
    rec['p'] = V; rec['n'] = N; rec['c'][:, :3] = np.clip(np.round(np.clip(C, 0, 1) ** (1 / 2.2) * 255), 0, 255); rec['c'][:, 3] = 255
    rec['k'][:, 0] = K; rec['k'][:, 1] = WH; rec['k'][:, 2] = LC; rec['k'][:, 3] = LN; rec['uv'] = UV
    return rec


def write(out, G, LAYER, rec, I, HUB):
    """The layers' images, 1024 square: JPEG, or PNG where there is a cut-out to keep; then everything as the format above."""
    IMGS = []
    for im, li in sorted(LAYER.items(), key=lambda q: q[1]):
        P = G.image(im); alpha = P.mode in ('RGBA', 'LA') or (P.mode == 'P' and 'transparency' in P.info)
        P = P.convert('RGBA' if alpha else 'RGB').resize((1024, 1024), Image.LANCZOS); o2 = io.BytesIO()
        if alpha: P.save(o2, 'PNG', optimize=True)
        else: P.save(o2, 'JPEG', quality=92, subsampling=0)
        d = o2.getvalue(); IMGS.append(d + b'\0' * (-len(d) % 4)); print('layer', li, 'image', im, 'alpha' if alpha else 'jpeg', len(d))
    with open(out, 'wb') as fo:
        fo.write(struct.pack('<4sII', b'PCR2', len(rec), I.size)); fo.write(np.array(HUB, dtype='<f4').tobytes())
        fo.write(struct.pack('<I', len(IMGS)))
        for d in IMGS: fo.write(struct.pack('<I', len(d))); fo.write(d)
        fo.write(rec.tobytes()); fo.write(I.astype('<u4').tobytes())
    print('bytes', 64 + sum(4 + len(d) for d in IMGS) + rec.nbytes + I.size * 4)

# Blender script: builds the player cars as smooth subdivision-surface models and exports them as .glb
# Run inside Blender:  exec(open('<project>/tools/carbuilder.py').read()); build_all('<project>/assets/cars')
# Car faces -Y in Blender (glTF export turns that into +Z, the game's forward). Units: metres.
import bpy, bmesh, math
from mathutils import Vector, Matrix, Quaternion

# ---------- materials (names are what the game looks for) ----------
def material(name, color, rough=0.5, metal=0.0, emit=None, alpha=1.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if emit:
        b.inputs['Emission Color'].default_value = (*emit, 1); b.inputs['Emission Strength'].default_value = 2.0
    if alpha < 1:
        b.inputs['Alpha'].default_value = alpha; m.blend_method = 'BLEND' if hasattr(m, 'blend_method') else None
    return m

def mats():
    return {
        'paint': material('paint', (0.8, 0.8, 0.8), 0.25, 0.4),
        'hood': material('hood', (0.12, 0.12, 0.13), 0.3, 0.3),
        'glass': material('glass', (0.03, 0.04, 0.05), 0.05, 0.2),
        'trim': material('trim', (0.035, 0.035, 0.04), 0.7, 0.0),
        'chrome': material('chrome', (0.85, 0.86, 0.88), 0.15, 1.0),
        'light': material('light', (0.95, 0.95, 0.9), 0.1, 0.0),
        'tail': material('tail', (0.5, 0.02, 0.02), 0.2, 0.0),
        'amber': material('amber', (0.9, 0.45, 0.05), 0.2, 0.0),
        'tyre': material('tyre', (0.03, 0.03, 0.03), 0.9, 0.0),
        'rim': material('rim', (0.7, 0.72, 0.75), 0.25, 0.9),
        'cloth': material('cloth', (0.05, 0.05, 0.055), 0.95, 0.0),
        'seat': material('seat', (0.08, 0.07, 0.065), 0.8, 0.0),
    }

def clear():
    for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
    for me in list(bpy.data.meshes): bpy.data.meshes.remove(me)

def obj_from_bm(bm, name, mat_list):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for m in mat_list: me.materials.append(m)
    o = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(o)
    return o

def apply_mods(o):
    bpy.context.view_layer.objects.active = o
    for o2 in bpy.context.selected_objects: o2.select_set(False)
    o.select_set(True)
    for m in list(o.modifiers): bpy.ops.object.modifier_apply(modifier=m.name)

# ---------- body: loft of cross-section rings, mirrored and subdivided ----------
# station = (y, half_width, z_bottom, z_belt, z_top, top_half_width, kind) ; kind: 'deck' | 'glassF' | 'roof' | 'glassR' | 'open'
SEG_MAT = None
SUBDIV = 1
def body(name, stations, M, hood_range=None, open_top=False, bpil=None, dip=0.0):
    bm = bmesh.new()
    # holding loops: duplicate a station just beside every change of kind so subdivision keeps the roof height and pillar lines
    st2 = []
    for i, st in enumerate(stations):
        prev_k = stations[i - 1][6] if i else st[6]; next_k = stations[i + 1][6] if i + 1 < len(stations) else st[6]
        if prev_k != st[6] and i: st2.append((st[0] - 0.06,) + st[1:])
        st2.append(st)
        if next_k != st[6] and i + 1 < len(stations): st2.append((st[0] + 0.06,) + st[1:])
    stations = st2
    if bpil is not None:   # two close rings around the B-pillar so it can be painted between the side windows
        for yy in (bpil - 0.045, bpil + 0.045):
            for i in range(len(stations) - 1):
                a, b = stations[i], stations[i + 1]
                if a[0] < yy < b[0]:
                    t = (yy - a[0]) / (b[0] - a[0]); stations.insert(i + 1, (yy,) + tuple(a[k] + (b[k] - a[k]) * t for k in range(1, 6)) + (a[6],)); break
    rings = []
    for (y, w, zb, zbelt, zt, tw, kind) in stations:
        dz = dip if kind == 'deck' and y < 0 else 0.0                 # front fenders standing proud of a lower hood
        pts = [(0, zb), (0.8 * w, zb), (w, zb + 0.13), (w * 1.0, zbelt - 0.06), (w * 0.985, zbelt), (tw * 1.01, zt - 0.09), (tw * 0.955, zt - 0.04),   # s5 (A/C-pillar, roof rail) kept slim so the pillar does not block the view
                (tw * 0.45, zt - dz * 0.7), (0, zt + 0.01 - dz)]
        rings.append([bm.verts.new((x, y, z)) for (x, z) in pts])
    nseg = len(rings[0]) - 1
    names = list(M.keys())
    def mi(n): return names.index(n)
    for i in range(len(rings) - 1):
        ka, kb = stations[i][6], stations[i + 1][6]
        for s in range(nseg):
            f = bm.faces.new((rings[i][s], rings[i][s + 1], rings[i + 1][s + 1], rings[i + 1][s]))
            m = 'paint'
            if s == 0: m = 'trim'
            if s >= 4 and s <= 6 or (s == 7 and (ka, kb) in (('glassF', 'roof'), ('roof', 'glassR'))):
                if ka == 'glassF' and kb == 'roof': m = 'paint' if s == 5 else 'glass'   # windscreen; s5 is the A-pillar
                elif ka == 'roof' and kb == 'glassR': m = 'paint' if s == 5 else 'glass'  # rear window; s5 is the C-pillar
                elif ka == 'roof' and kb == 'roof' and s == 4: m = 'paint' if bpil is not None and stations[i][0] < bpil < stations[i + 1][0] else 'glass'  # side windows / B-pillar (s5 stays paint: the roof rail the pillars meet)

            if hood_range and hood_range[0] <= stations[i][0] < hood_range[1] and s >= 5: m = 'hood'   # hood panel in its own colour (y range)
            if open_top and s >= 6 and ka == 'open' and kb == 'open': m = 'seat'   # cockpit tub
            f.material_index = mi(m)
    # caps
    for r, flip in ((rings[0], False), (rings[-1], True)):
        vs = list(r) if not flip else list(reversed(r))
        f = bm.faces.new(vs); f.material_index = mi('paint')
    o = obj_from_bm(bm, name, list(M.values()))
    mir = o.modifiers.new('mir', 'MIRROR'); mir.use_clip = True; mir.use_mirror_merge = True
    sub = o.modifiers.new('sub', 'SUBSURF'); sub.levels = SUBDIV; sub.render_levels = SUBDIV
    apply_mods(o)
    for p in o.data.polygons: p.use_smooth = True
    return o

def cut_arches(o, wheels, r, w):
    for (x, y) in wheels:
        bpy.ops.mesh.primitive_cylinder_add(vertices=40, radius=r + 0.07, depth=0.7, location=(math.copysign(w, x), y, r + 0.02), rotation=(0, math.pi / 2, 0))
        c = bpy.context.active_object
        b = o.modifiers.new('arch', 'BOOLEAN'); b.object = c; b.operation = 'DIFFERENCE'; b.solver = 'EXACT'
        apply_mods(o); bpy.data.objects.remove(c, do_unlink=True)
        # dark wheel-well liner
        bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=r + 0.065, depth=0.32, location=(math.copysign(w - 0.2, x), y, r + 0.02), rotation=(0, math.pi / 2, 0))
        lin = bpy.context.active_object; lin.name = name_of(o) + '_well'
        lin.data.materials.append(bpy.data.materials['trim'])
        bm = bmesh.new(); bm.from_mesh(lin.data)
        for f in list(bm.faces):
            if abs(f.normal.x) > 0.9: bm.faces.remove(f)          # open both ends
        bm.to_mesh(lin.data); bm.free()
        lin.parent = o

def name_of(o): return o.name

def fix_normals(o):
    bm = bmesh.new(); bm.from_mesh(o.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    # make sure they point away from the car's centre
    c = Vector((0, 0, 0.7)); out = sum(((f.calc_center_median() - c).dot(f.normal) for f in bm.faces), 0.0)
    if out < 0:
        for f in bm.faces: f.normal_flip()
    bm.to_mesh(o.data); bm.free(); o.data.update()

def part(kind, name, loc, scale, mat, rot=(0, 0, 0), bevel=0.02, parent=None, segs=3):
    if kind == 'box': bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    elif kind == 'cyl': bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.5, depth=1, location=loc, rotation=rot)
    elif kind == 'sphere': bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=0.5, location=loc, rotation=rot)
    o = bpy.context.active_object; o.name = name; o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel and kind == 'box':
        b = o.modifiers.new('bev', 'BEVEL'); b.width = bevel; b.segments = min(segs, 2); apply_mods(o)
    o.data.materials.append(mat)
    for p in o.data.polygons: p.use_smooth = True
    if parent: o.parent = parent
    return o

def surf(o, x, z, direction):
    # point on the body surface hit by a ray from outside along `direction` (Vector), passing through (x, ?, z) or (?, y, z)
    d = Vector(direction).normalized(); start = Vector((x, 0, z)) - d * 6 if abs(d.y) > 0.5 else Vector((0, x, z)) - d * 6
    ok, loc, nor, idx = o.ray_cast(start, d)
    return (loc, nor) if ok else (None, None)

# lights / grille / mirrors / plates, mirrored left-right
def stick(o, name, origin, d, size, mat, out=0.0, track='Y', spin=0.0, bevel=0.008):
    """lay a box onto the body: ray-cast from `origin` along `d`, sit the box on the hit point, turned to the surface.
    track 'Y': the box's thin local Y follows the surface normal (front/rear/side parts; on the sides local X runs along the car);
    track 'Z': the thin local Z follows the normal (parts lying on top surfaces)."""
    ok, loc, nor, idx = o.ray_cast(Vector(origin), Vector(d).normalized())
    if not ok: return None
    p = part('box', name, tuple(loc + nor * out), size, mat, bevel=bevel, parent=o)
    q = nor.to_track_quat(track, 'Z' if track == 'Y' else 'Y')
    if spin: q = q @ Quaternion((0, 1, 0) if track == 'Y' else (0, 0, 1), spin)
    p.rotation_mode = 'QUATERNION'; p.rotation_quaternion = q
    return p

def strip(o, name, s, ys, z, size_hz, mat, out=0.004):
    """a run of short pieces down the side of the car at height z, each laid onto the body (side skirts, cladding)"""
    for ya, yb in zip(ys, ys[1:]):
        stick(o, name, (s * 6, (ya + yb) / 2, z), (-s, 0, 0), (abs(yb - ya) + 0.02, size_hz[0], size_hz[1]), mat, out=out)

# lights / grille / mirrors / plates, mirrored left-right - all laid onto the surface so nothing floats
def wing(o, M, x, y, z, span, chord, rx):
    """rear wing whose two stands reach right down onto the boot lid"""
    for s in (-1, 1):
        ok, loc, nor, idx = o.ray_cast(Vector((s * x, y, 3.0)), Vector((0, 0, -1)))
        z0 = loc.z if ok else z - 0.2
        part('box', 'wing_stand', (s * x, y, (z0 + z) / 2), (0.05, 0.08, z - z0 + 0.02), M['trim'], bevel=0.008, parent=o)
    part('box', 'wing', (0, y + 0.05, z), (span, chord, 0.035), M['paint'], rot=(rx, 0, 0), bevel=0.012, parent=o)

def details(o, P, M):
    hl, w = P['L'] / 2, P['W'] / 2
    F, R = (0, 1, 0), (0, -1, 0)                       # rays toward the nose (car faces -Y) and toward the tail
    for s in (-1, 1):
        if P.get('sport'):   # slim swept headlights on the corner where the nose turns into the fender top, wide thin tail-light bars
            for k, (xo, zo, sz, mat_, lift) in enumerate(((0.27, 0.0, (0.42, 0.17, 0.02), M['trim'], 0.004), (0.28, 0.005, (0.33, 0.09, 0.02), M['light'], 0.012), (0.27, -0.045, (0.36, 0.022, 0.012), M['light'], 0.014))):
                stick(o, 'headlight' if k else 'lamp_housing', (s * (w - xo), -hl - 2.0, P['hlz'] + 1.1 + zo), (0, 1, -0.55), sz, mat_, out=lift, track='Z', spin=s * 0.3, bevel=0.006 if k == 0 else 0)
            stick(o, 'taillight', (s * (w - 0.3), hl + 3, P['tlz']), R, (0.52, 0.02, 0.065), M['tail'], out=0.006)
            stick(o, 'rind', (s * (w - 0.62), hl + 3, P['tlz']), R, (0.12, 0.02, 0.05), M['amber'], out=0.006)
            stick(o, 'indicator', (s * (w - 0.1), -hl - 3, P['hlz'] - 0.2), F, (0.12, 0.02, 0.04), M['amber'], out=0.006)
        else:
            stick(o, 'headlight', (s * (w - 0.33), -hl - 3, P['hlz']), F, (0.44, 0.03, 0.1), M['light'], out=0.008)
            stick(o, 'indicator', (s * (w - 0.12), -hl - 3, P['hlz'] - 0.12), F, (0.14, 0.02, 0.05), M['amber'], out=0.008)
            stick(o, 'taillight', (s * (w - 0.3), hl + 3, P['tlz']), R, (0.42, 0.03, 0.1), M['tail'], out=0.008)
            stick(o, 'rind', (s * (w - 0.6), hl + 3, P['tlz']), R, (0.12, 0.02, 0.07), M['amber'], out=0.008)
        # door mirror: an arm from the door at the base of the window, the housing just outboard of it
        # (aim just below the waistline: a ray above it can slip over the shoulder and land on the hood or the windscreen)
        ok, loc, nor, idx = o.ray_cast(Vector((s * 6, P['mirrorY'], P['belt'] - 0.06)), Vector((-s, 0, 0)))
        if not ok or abs(loc.x) < w * 0.85: loc = Vector((s * w * 0.98, P['mirrorY'], P['belt'] - 0.06))
        part('box', 'mirror_arm', tuple(loc + Vector((s * 0.06, 0, 0.09))), (0.13, 0.05, 0.03), M['trim'], bevel=0.008, parent=o)
        part('box', 'mirror', tuple(loc + Vector((s * 0.15, 0.02, 0.15))), (0.2, 0.09, 0.13), M['paint'], bevel=0.03, parent=o)
        for hy in (P['handleY'], P.get('handleY2')):
            if hy is not None: stick(o, 'handle', (s * 6, hy, P['belt'] - 0.12), (-s, 0, 0), (0.15, 0.02, 0.03), M['chrome'], out=0.008)
    # door shut-lines: thin dark strips following the body side
    for s in (-1, 1):
        for sy in P.get('seams', ()):
            z1, z0 = P['belt'] - 0.03, P['st'][0][2] + 0.14
            pts = []
            for k in range(7):
                loc, nor = surf(o, sy, z0 + (z1 - z0) * k / 6, (-s, 0, 0))
                if loc is not None: pts.append(loc)
            for a, b in zip(pts, pts[1:]):
                mid = (a + b) / 2; ln = (b - a).length
                part('box', 'seam', tuple(mid + Vector((s * 0.002, 0, 0))), (0.006, 0.007, ln + 0.004), M['trim'], bevel=0, parent=o)
    stick(o, 'grille', (0, -hl - 3, P['grz']), F, (P['grw'], 0.03, P['grh']), M['trim'], out=0.004)
    stick(o, 'plate_f', (0, -hl - 3, P['grz'] - P['grh'] / 2 - 0.02 if P.get('sport') else 0.42), F, (0.44, 0.02, 0.12), M['light'], out=0.012)
    stick(o, 'plate_r', (0, hl + 3, P['tlz'] - 0.22), R, (0.44, 0.02, 0.12), M['light'], out=0.008)
    stick(o, 'splitter', (0, -hl - 3, P['st'][0][2] + 0.03), F, (P['W'] - 0.3, 0.05, 0.035), M['trim'], out=0.02)

# ---------- wheel: tyre with rounded shoulders + multi-spoke rim (rim material takes the wheel colour) ----------
def wheel(name, r, width, M, spokes=5):
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=r, depth=width, location=(0, 0, 0), rotation=(0, math.pi / 2, 0))
    t = bpy.context.active_object; t.name = name
    b = t.modifiers.new('bev', 'BEVEL'); b.width = 0.045; b.segments = 2; apply_mods(t)
    bpy.ops.object.select_all(action='DESELECT'); t.select_set(True); bpy.context.view_layer.objects.active = t
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)  # children must not inherit the axle rotation
    t.data.materials.append(M['tyre'])
    for p in t.data.polygons: p.use_smooth = True
    for side in (-1, 1):
        bpy.ops.mesh.primitive_cylinder_add(vertices=28, radius=r * 0.66, depth=0.02, location=(side * (width / 2 + 0.002), 0, 0), rotation=(0, math.pi / 2, 0))
        d = bpy.context.active_object; d.data.materials.append(M['trim']); d.parent = t
        bpy.ops.mesh.primitive_torus_add(major_radius=r * 0.63, minor_radius=0.018, major_segments=28, minor_segments=5, location=(side * (width / 2 + 0.012), 0, 0), rotation=(0, math.pi / 2, 0))
        lip = bpy.context.active_object; lip.data.materials.append(M['rim']); lip.parent = t
        for k in range(spokes):
            a = k / spokes * 2 * math.pi
            sp = part('box', 'spoke', (side * (width / 2 + 0.012), math.cos(a) * r * 0.32, math.sin(a) * r * 0.32), (0.03, 0.15, r * 0.62), M['rim'], rot=(a - math.pi / 2, 0, 0), bevel=0.012, segs=2)
            sp.parent = t
        part('cyl', 'hub', (side * (width / 2 + 0.015), 0, 0), (0.05, r * 0.28, r * 0.28), M['rim'], rot=(0, math.pi / 2, 0), parent=t)
    return t

def export(path, objs):
    for o in bpy.context.selected_objects: o.select_set(False)
    for o in objs:
        o.select_set(True)
        for c in o.children_recursive: c.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, use_selection=True, export_format='GLB', export_apply=True, export_yup=True, export_texcoords=False, export_tangents=False)


# ---------- per-car extras and the whole build ----------
def extras(name, o, c, M):
    hl, w = c['L'] / 2, c['W'] / 2
    if name == 'rally':
        # hood scoop (a raised box with a dark mouth) and the two vent pairs beside it, all laid onto the hood
        sc = stick(o, 'scoop', (0, -1.42, 3.0), (0, 0, -1), (0.62, 0.48, 0.09), M['paint'], out=0.03, track='Z', bevel=0.035)
        stick(o, 'scoop_mouth', (0, -1.62, 3.0), (0, 0, -1), (0.5, 0.05, 0.05), M['trim'], out=0.06, track='Z', bevel=0.005)
        for s in (-1, 1):
            for vy in (-1.82, -1.18):
                stick(o, 'hood_vent', (s * 0.4, vy, 3.0), (0, 0, -1), (0.2, 0.12, 0.015), M['trim'], out=0.006, track='Z', bevel=0.004)
            # round fog lamps low in the bumper, an amber corner lamp outboard of each
            ok, loc, nor, idx = o.ray_cast(Vector((s * 0.55, -hl - 3, 0.44)), Vector((0, 1, 0)))
            if ok:
                f = part('cyl', 'fog', tuple(loc + nor * 0.015), (0.09, 0.09, 0.04), M['light'], rot=(math.pi / 2, 0, 0), parent=o)
                part('cyl', 'fog_ring', tuple(loc + nor * 0.005), (0.11, 0.11, 0.035), M['trim'], rot=(math.pi / 2, 0, 0), parent=o)
            stick(o, 'indicator', (s * 0.76, -hl - 3, 0.5), (0, 1, 0), (0.13, 0.02, 0.05), M['amber'], out=0.006)
            strip(o, 'skirt', s, [-0.8 + k * 0.3 for k in range(6)], 0.36, (0.03, 0.06), M['paint'])
        stick(o, 'intake', (0, -hl - 3, 0.42), (0, 1, 0), (0.62, 0.02, 0.16), M['trim'], out=0.004)
        wing(o, M, 0.5, 1.9, 1.24, 1.5, 0.3, -0.1)
    if name == 'fastback':
        for s in (-1, 1):
            for k in range(3):                                           # fender vents behind the front wheels
                stick(o, 'vent', (s * 6, -0.86 + k * 0.035, 0.6 - k * 0.04), (-s, 0, 0), (0.025, 0.012, 0.22 - k * 0.04), M['trim'], out=0.002, spin=0.35, bevel=0)
            stick(o, 'canard', (s * 0.74, -hl - 3, 0.36), (0, 1, 0), (0.22, 0.12, 0.022), M['trim'], out=0.04)
            stick(o, 'intake', (s * 0.6, -hl - 3, 0.44), (0, 1, 0), (0.24, 0.02, 0.13), M['trim'], out=0.004)
            strip(o, 'skirt', s, [-0.85 + k * 0.34 for k in range(6)], 0.33, (0.03, 0.08), M['trim'])
        stick(o, 'ducktail', (0, 2.0, 3.0), (0, 0, -1), (1.2, 0.14, 0.022), M['paint'], out=0.012, track='Z')
        stick(o, 'diffuser', (0, hl + 3, c['st'][-1][2] + 0.05), (0, -1, 0), (1.1, 0.03, 0.08), M['trim'], out=0.01)
        for s in (-1, 1):
            ok, loc, nor, idx = o.ray_cast(Vector((s * 0.45, hl + 3, c['st'][-1][2] + 0.06)), Vector((0, -1, 0)))
            if ok: part('cyl', 'exhaust', tuple(loc + Vector((0, 0.01, 0))), (0.075, 0.075, 0.08), M['chrome'], rot=(math.pi / 2, 0, 0), parent=o)
    if name == 'coupe':
        wing(o, M, 0.6, 1.95, 1.06, 1.6, 0.3, -0.06)
    if name == 'cross':
        for s in (-1, 1):
            # black cladding: an arc of short pieces hugging each wheel arch, and a band along the sill
            for wy in (-c['wb'] / 2, c['wb'] / 2):
                R = c['r'] + 0.13
                for k in range(11):
                    a0 = math.pi * k / 11; a1 = math.pi * (k + 1) / 11; am = (a0 + a1) / 2
                    y, z = wy + R * math.cos(am), c['r'] + 0.02 + R * math.sin(am)
                    ok, loc, nor, idx = o.ray_cast(Vector((s * 6, y, z)), Vector((-s, 0, 0)))
                    if not ok: continue
                    tan = Vector((0, -math.sin(am), math.cos(am)))
                    xa = tan - nor * tan.dot(nor); xa.normalize(); za = xa.cross(nor)
                    pc = part('box', 'arch_clad', tuple(loc + nor * 0.012), (R * (a1 - a0) + 0.03, 0.03, 0.1), M['trim'], bevel=0.008, parent=o)
                    pc.rotation_mode = 'QUATERNION'; pc.rotation_quaternion = Matrix((xa, nor, za)).transposed().to_quaternion()
            strip(o, 'cladding', s, [-c['wb'] / 2 + 0.5 + k * ((c['wb'] - 1.0) / 5) for k in range(6)], 0.47, (0.03, 0.16), M['trim'])
        # grille chrome underline sweeping out toward the lamps, and black lower bumpers front and rear
        stick(o, 'grille_chrome', (0, -hl - 3, c['grz'] - c['grh'] / 2 - 0.03), (0, 1, 0), (1.3, 0.02, 0.025), M['chrome'], out=0.012, bevel=0.005)
        stick(o, 'bumper_f', (0, -hl - 3, 0.5), (0, 1, 0), (1.45, 0.02, 0.17), M['trim'], out=0.006)
        stick(o, 'bumper_r', (0, hl + 3, 0.55), (0, -1, 0), (1.45, 0.02, 0.2), M['trim'], out=0.006)
    if name == 'roadster':
        # windscreen frame + glass, seats, roll hoops
        part('box', 'windscreen', (0, -0.6, 1.02), (1.3, 0.04, 0.42), M['glass'], rot=(-0.95, 0, 0), bevel=0.01, parent=o)
        part('box', 'ws_frame', (0, -0.5, 1.2), (1.34, 0.05, 0.05), M['trim'], rot=(-0.95, 0, 0), parent=o)
        for s in (-1, 1):
            bpy.ops.mesh.primitive_torus_add(major_radius=0.16, minor_radius=0.022, location=(s * 0.36, 0.48, 0.9), rotation=(math.pi / 2, 0, 0))
            h = bpy.context.active_object; h.data.materials.append(M['chrome']); h.parent = o
        # soft top as its own object (the game shows it when the top is closed)
        # thin cloth canopy: header meets the windscreen frame, flat roof, rear quarters down to the deck
        st = [(-0.5, 1.19), (-0.42, 1.225), (-0.1, 1.24), (0.25, 1.235), (0.5, 1.16), (0.7, 0.99), (0.82, 0.87)]
        bm = bmesh.new(); rows = []
        for (y, zr) in st:
            q = min(1.0, max(0.0, (y - 0.2) / 0.3))      # 0 = roof rim only, 1 = full rear quarter
            zb = (zr - 0.07) * (1 - q) + 0.86 * q
            sec = [(-0.67, zb), (-0.655, zr - 0.06), (-0.6, zr - 0.015), (-0.45, zr), (0, zr + 0.01), (0.45, zr), (0.6, zr - 0.015), (0.655, zr - 0.06), (0.67, zb)]
            rows.append([bm.verts.new((x, y, z)) for (x, z) in sec])
        for i in range(len(rows) - 1):
            for j in range(len(rows[0]) - 1):
                bm.faces.new((rows[i][j], rows[i][j + 1], rows[i + 1][j + 1], rows[i + 1][j]))
        t = obj_from_bm(bm, 'softtop', [M['cloth']]); fix_normals(t)
        for p in t.data.polygons: p.use_smooth = True
        t.parent = o
        part('box', 'rear_window', (0, 0.6, 1.03), (0.62, 0.02, 0.17), M['glass'], rot=(0.85, 0, 0), bevel=0.005, parent=t)
        for s in (-1, 1):   # side windows (shown with the top)
            bm = bmesh.new(); x = s * 0.665
            v = [bm.verts.new(c) for c in ((x, -0.42, 0.87), (x, 0.3, 0.87), (x, 0.28, 1.15), (x, -0.36, 1.16))]
            bm.faces.new(v); g = obj_from_bm(bm, 'sideglass', [M['glass']]); g.parent = t

def build(name, outdir=None):
    exec(open('/Users/decimo/Documents/workspace/endless-driver/tools/cars_spec.py').read(), globals())
    clear(); M = mats(); c = CARS[name]
    o = body(name, c['st'], M, c.get('hood'), c.get('open', False), c.get('bpil'), c.get('hooddip', 0.0))
    wh = [(s * c['track'], y) for y in (-c['wb'] / 2, c['wb'] / 2) for s in (-1, 1)]
    fix_normals(o)
    cut_arches(o, wh, c['r'], c['W'] / 2)
    fix_normals(o)
    details(o, c, M); extras(name, o, c, M)
    if outdir: export(f'{outdir}/{name}.glb', [o])
    clear(); M = mats()
    w = wheel('wheel', c['r'], 0.24 if name != 'cross' else 0.26, M, c['spokes'])
    if outdir: export(f'{outdir}/{name}_wheel.glb', [w])
    return o

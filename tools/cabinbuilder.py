# Blender script: smooth cockpit (dashboard, gauge cowl, centre stack, console, seats, steering wheel) -> assets/cars/cabin.glb
# Built in the game's cabin frame (three.js: x right, y up, z forward; driver's eye at (-0.37, 1.22, -0.05)).
# Blender is Z-up, so a three.js point (x, y, z) is placed at Blender (x, -z, y); glTF export turns it back.
# Run inside Blender after carbuilder.py helpers are loaded:  exec(open('<project>/tools/cabinbuilder.py').read()); build_cabin('<project>/assets/cars')
import bpy, bmesh, math
from mathutils import Vector

def T(x, y, z): return (x, -z, y)

def cmats():
    return {
        'idark': material('idark', (0.035, 0.035, 0.038), 0.75),
        'itrim': material('itrim', (0.09, 0.085, 0.08), 0.8),
        'iseat': material('iseat', (0.12, 0.1, 0.085), 0.95),
        'igrip': material('igrip', (0.012, 0.012, 0.012), 0.6),
        'chrome': material('chrome', (0.85, 0.86, 0.88), 0.15, 1.0),
    }

def smooth(o, levels=2):
    s = o.modifiers.new('sub', 'SUBSURF'); s.levels = levels; s.render_levels = levels; apply_mods(o)
    for p in o.data.polygons: p.use_smooth = True
    return o

def loft_x(name, prof, xs, mat, shrink=None):
    """profile = closed loop of (z, y) points in the three.js frame, swept along x; shrink(x) scales the profile toward its centre"""
    bm = bmesh.new(); rings = []
    cz = sum(p[0] for p in prof) / len(prof); cy = sum(p[1] for p in prof) / len(prof)
    for x in xs:
        k = shrink(x) if shrink else 1.0
        rings.append([bm.verts.new(T(x, cy + (y - cy) * k, cz + (z - cz) * k)) for (z, y) in prof])
    n = len(prof)
    for i in range(len(rings) - 1):
        for j in range(n):
            bm.faces.new((rings[i][j], rings[i][(j + 1) % n], rings[i + 1][(j + 1) % n], rings[i + 1][j]))
    bm.faces.new(rings[0][::-1]); bm.faces.new(rings[-1])
    o = obj_from_bm(bm, name, [mat]); fix_normals_c(o)
    return o

def fix_normals_c(o):
    bm = bmesh.new(); bm.from_mesh(o.data); bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:]); bm.to_mesh(o.data); bm.free(); o.data.update()

def rbox(name, c, size, mat, rx=0.0, bev=0.04, segs=3, parent=None):
    """rounded box centred at three.js point c with three.js size (w, h, d), tilted about x"""
    bpy.ops.mesh.primitive_cube_add(size=1, location=T(*c), rotation=(rx, 0, 0))
    o = bpy.context.active_object; o.name = name; o.scale = (size[0], size[2], size[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    b = o.modifiers.new('bev', 'BEVEL'); b.width = bev; b.segments = segs; b.limit_method = 'NONE'; apply_mods(o)
    o.data.materials.append(mat)
    for p in o.data.polygons: p.use_smooth = True
    if parent: o.parent = parent
    return o

def seat(x, M, root):
    cush = rbox('seat_cushion', (x, 0.44, -0.15), (0.46, 0.13, 0.5), M['iseat'], rx=0.06, bev=0.05)
    for s in (-1, 1):
        rbox('seat_bolster', (x + s * 0.235, 0.5, -0.17), (0.08, 0.12, 0.48), M['iseat'], rx=0.06, bev=0.035, parent=root)
        rbox('back_bolster', (x + s * 0.24, 0.9, -0.49), (0.08, 0.6, 0.16), M['iseat'], rx=-0.14, bev=0.035, parent=root)
    rbox('seat_back', (x, 0.88, -0.47), (0.44, 0.66, 0.11), M['iseat'], rx=-0.14, bev=0.05, parent=root)
    rbox('headrest', (x, 1.3, -0.54), (0.25, 0.17, 0.09), M['iseat'], rx=-0.1, bev=0.04, parent=root)
    for s in (-1, 1):
        bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.008, depth=0.12, location=T(x + s * 0.07, 1.2, -0.535))
        st = bpy.context.active_object; st.data.materials.append(M['chrome']); st.parent = root
    cush.parent = root

def build_cabin(outdir=None):
    clear(); M = cmats()
    root = bpy.data.objects.new('cabin', None); bpy.context.collection.objects.link(root)
    # dashboard: one swept, softly rounded moulding whose face sits just behind the gauges (z 0.66)
    prof = [(1.15, 0.92), (0.95, 0.955), (0.8, 0.955), (0.71, 0.93), (0.675, 0.885), (0.675, 0.72), (0.7, 0.62), (0.8, 0.575), (1.15, 0.6)]
    xs = [-0.81, -0.79, -0.6, -0.3, 0.0, 0.3, 0.6, 0.79, 0.81]
    dash = loft_x('dash', prof, xs, M['idark'], shrink=lambda x: 0.8 if abs(x) > 0.8 else 1.0)
    smooth(dash, 2); dash.parent = root
    # gauge cowl: an arched hood over the two dials
    bm = bmesh.new(); arcs = []
    for z in (0.64, 0.67, 0.8, 0.86):
        ring = []
        for k in range(13):
            a = math.pi * k / 12
            for rad in ((0.235, 0.1),):
                ring.append(bm.verts.new(T(-0.37 + math.cos(a) * rad[0], 0.885 + math.sin(a) * rad[1] * (1.0 if z < 0.8 else 0.85), z)))
        arcs.append(ring)
    inner = []
    for z in (0.64, 0.67, 0.8, 0.86):
        inner.append([bm.verts.new(T(-0.37 + math.cos(math.pi * k / 12) * 0.215, 0.885 + math.sin(math.pi * k / 12) * 0.083, z)) for k in range(13)])
    for i in range(3):
        for k in range(12):
            bm.faces.new((arcs[i][k], arcs[i][k + 1], arcs[i + 1][k + 1], arcs[i + 1][k]))
            bm.faces.new((inner[i][k + 1], inner[i][k], inner[i + 1][k], inner[i + 1][k + 1]))
    for k in range(12): bm.faces.new((arcs[0][k + 1], arcs[0][k], inner[0][k], inner[0][k + 1]))   # front lip
    cowl = obj_from_bm(bm, 'cowl', [M['idark']]); fix_normals_c(cowl); smooth(cowl, 1); cowl.parent = root
    # centre stack (screen sits in front of it) and the tunnel console between the seats
    rbox('stack', (0, 0.73, 0.7), (0.34, 0.34, 0.08), M['itrim'], rx=-0.15, bev=0.03).parent = root
    rbox('console', (0, 0.52, 0.28), (0.24, 0.28, 0.86), M['itrim'], bev=0.05).parent = root
    rbox('armrest', (0, 0.68, -0.1), (0.2, 0.06, 0.34), M['iseat'], bev=0.025).parent = root
    bpy.ops.mesh.primitive_cone_add(vertices=16, radius1=0.07, radius2=0.022, depth=0.08, location=T(0, 0.7, 0.14))
    boot = bpy.context.active_object; boot.data.materials.append(M['igrip']); boot.parent = root
    for p in boot.data.polygons: p.use_smooth = True
    # steering column shroud
    bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=0.05, depth=0.18, location=T(-0.37, 0.897, 0.593), rotation=(math.pi / 2 - 0.38, 0, 0))
    col = bpy.context.active_object; col.name = 'column'; col.data.materials.append(M['idark']); col.parent = root
    for p in col.data.polygons: p.use_smooth = True
    # seats
    seats = bpy.data.objects.new('seats', None); bpy.context.collection.objects.link(seats); seats.parent = root   # moved per car in the game
    seat(-0.37, M, seats); seat(0.37, M, seats)
    rear = bpy.data.objects.new('rear', None); bpy.context.collection.objects.link(rear); rear.parent = root
    rbox('rear_cushion', (0, 0.53, -1.1), (1.42, 0.2, 0.5), M['iseat'], rx=0.05, bev=0.07).parent = rear
    rbox('rear_back', (0, 0.95, -1.36), (1.42, 0.56, 0.14), M['iseat'], rx=-0.17, bev=0.07).parent = rear
    rbox('shelf', (0, 1.0, -1.6), (1.4, 0.03, 0.3), M['idark'], bev=0.01).parent = rear
    # steering wheel: its own object at the origin of the game's wheel group (rim in the x-y plane, facing -z)
    steer = bpy.data.objects.new('steer', None); bpy.context.collection.objects.link(steer)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.188, minor_radius=0.026, major_segments=56, minor_segments=14, location=(0, 0, 0), rotation=(math.pi / 2, 0, 0))
    rim = bpy.context.active_object; rim.name = 'steer_rim'; rim.data.materials.append(M['igrip']); rim.parent = steer
    for p in rim.data.polygons: p.use_smooth = True
    for a in (0.0, math.pi, -math.pi / 2):
        c = (math.cos(a) * 0.095, 0, math.sin(a) * 0.095)
        bpy.ops.mesh.primitive_cube_add(size=1, location=c, rotation=(0, -a, 0))
        sp = bpy.context.active_object; sp.scale = (0.17, 0.022, 0.042); bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        b = sp.modifiers.new('bev', 'BEVEL'); b.width = 0.01; b.segments = 3; apply_mods(sp)
        sp.data.materials.append(M['idark']); sp.parent = steer
        for p in sp.data.polygons: p.use_smooth = True
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0.012, 0))
    pad = bpy.context.active_object; pad.name = 'airbag'; pad.scale = (0.13, 0.05, 0.1); bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    b = pad.modifiers.new('bev', 'BEVEL'); b.width = 0.03; b.segments = 4; apply_mods(pad)
    pad.data.materials.append(M['idark']); pad.parent = steer
    for p in pad.data.polygons: p.use_smooth = True
    bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=0.018, depth=0.006, location=(0, 0.04, 0), rotation=(math.pi / 2, 0, 0))
    logo = bpy.context.active_object; logo.data.materials.append(M['chrome']); logo.parent = steer
    if outdir:
        for o in bpy.context.selected_objects: o.select_set(False)
        bpy.ops.export_scene.gltf(filepath=f'{outdir}/cabin.glb', use_selection=False, export_format='GLB', export_apply=True, export_yup=True, export_texcoords=False, export_tangents=False)
    return root

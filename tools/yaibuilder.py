# Blender script: "Yai Speed" - a small hunched old Thai woman with a looping sprint, exported as assets/cars/yai.glb
# Rigid parts (smooth subdivided) parented to an armature; one action "run" (24 frames, loops).
# Faces -Y in Blender (glTF turns that into +Z, the game's forward).  Run:  exec(open(...).read()); build_yai('<project>/assets/cars')
import bpy, bmesh, math
from mathutils import Vector

def ymat(name, color, rough=0.8):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True; b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (*color, 1); b.inputs['Roughness'].default_value = rough
    return m

def yclear():
    for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
    for a in list(bpy.data.actions): bpy.data.actions.remove(a)
    for me in list(bpy.data.meshes): bpy.data.meshes.remove(me)
    for ar in list(bpy.data.armatures): bpy.data.armatures.remove(ar)

def blob(name, kind, loc, scale, mat, rot=(0, 0, 0), sub=2):
    if kind == 'sphere': bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=10, radius=1, location=loc, rotation=rot)
    else: bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=1, depth=2, location=loc, rotation=rot)
    o = bpy.context.active_object; o.name = name; o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    if kind == 'cyl' and sub:
        m = o.modifiers.new('sub', 'SUBSURF'); m.levels = 1
        bpy.ops.object.modifier_apply(modifier='sub')
    o.data.materials.append(mat)
    for p in o.data.polygons: p.use_smooth = True
    return o

def taper(name, top, bot, r_top, r_bot, mat, flat=1.0, segs=14):
    """a smooth limb / garment segment between two points (world), elliptical (flat < 1 squashes front-back)"""
    bm = bmesh.new(); A, B = Vector(top), Vector(bot); axis = (B - A); L = axis.length; d = axis.normalized()
    side = Vector((1, 0, 0)) if abs(d.x) < 0.9 else Vector((0, 1, 0)); u = d.cross(side).normalized(); v = d.cross(u).normalized()
    rings = []
    for k, t in enumerate((0.0, 0.12, 0.5, 0.88, 1.0)):
        r = r_top + (r_bot - r_top) * t
        if k in (0, 4): r *= 0.55                                   # rounded ends
        c = A + axis * t
        rings.append([bm.verts.new(c + (u * math.cos(a) * r) + (v * math.sin(a) * r * flat)) for a in (i * 2 * math.pi / segs for i in range(segs))])
    for i in range(len(rings) - 1):
        for j in range(segs): bm.faces.new((rings[i][j], rings[i][(j + 1) % segs], rings[i + 1][(j + 1) % segs], rings[i + 1][j]))
    bm.faces.new(rings[0][::-1]); bm.faces.new(rings[-1])
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(o)
    me.materials.append(mat)
    bpy.context.view_layer.objects.active = o; o.select_set(True)
    m = o.modifiers.new('sub', 'SUBSURF'); m.levels = 1; bpy.ops.object.modifier_apply(modifier='sub'); o.select_set(False)
    for p in o.data.polygons: p.use_smooth = True
    return o

def to_bone(o, arm, bone):
    o.name = 'm_' + o.name                                         # keep mesh names apart from bone names (three.js strips the dots)
    mw = o.matrix_world.copy(); o.parent = arm; o.parent_type = 'BONE'; o.parent_bone = bone
    bpy.context.view_layer.update(); o.matrix_world = mw

def build_yai(outdir=None):
    yclear()
    skin = ymat('yskin', (0.42, 0.3, 0.22), 0.7); blouse = ymat('yblouse', (0.78, 0.76, 0.7), 0.9)
    sarong = ymat('ysarong', (0.12, 0.07, 0.1), 0.85); hair = ymat('yhair', (0.72, 0.72, 0.7), 0.6); dark = ymat('ydark', (0.02, 0.015, 0.015), 0.5)
    # ---- armature (rest pose: standing, slightly hunched) ----
    bpy.ops.object.armature_add(location=(0, 0, 0)); arm = bpy.context.active_object; arm.name = 'yai'
    bpy.ops.object.mode_set(mode='EDIT'); eb = arm.data.edit_bones
    for b in list(eb): eb.remove(b)
    def bone(name, head, tail, parent=None):
        b = eb.new(name); b.head = head; b.tail = tail
        if parent: b.parent = eb[parent]
        return b
    bone('hips', (0, 0, 0.78), (0, 0, 0.9))
    bone('spine', (0, 0, 0.9), (0, -0.16, 1.27), 'hips')          # bent forward
    bone('head', (0, -0.16, 1.27), (0, -0.22, 1.45), 'spine')
    for s, n in ((1, 'L'), (-1, 'R')):
        bone('thigh.' + n, (s * 0.09, 0, 0.8), (s * 0.09, -0.02, 0.43), 'hips')
        bone('shin.' + n, (s * 0.09, -0.02, 0.43), (s * 0.09, 0.0, 0.06), 'thigh.' + n)
        bone('arm.' + n, (s * 0.17, -0.13, 1.2), (s * 0.19, -0.12, 0.95), 'spine')
        bone('fore.' + n, (s * 0.19, -0.12, 0.95), (s * 0.19, -0.2, 0.75), 'arm.' + n)
    bpy.ops.object.mode_set(mode='OBJECT')
    # ---- body parts ----
    parts = []
    parts.append((taper('torso', (0, -0.02, 0.92), (0, -0.15, 1.24), 0.15, 0.13, blouse, 0.75), 'spine'))
    parts.append((taper('collar', (0, -0.15, 1.2), (0, -0.17, 1.29), 0.11, 0.06, blouse, 0.8), 'spine'))
    parts.append((taper('sarong', (0, 0.0, 0.93), (0, -0.01, 0.6), 0.155, 0.15, sarong, 0.72), 'hips'))
    parts.append((taper('hem', (0, -0.01, 0.64), (0, -0.01, 0.56), 0.15, 0.145, sarong, 0.72), 'hips'))
    parts.append((taper('neck', (0, -0.16, 1.24), (0, -0.19, 1.33), 0.045, 0.04, skin), 'head'))
    head = blob('headball', 'sphere', (0, -0.22, 1.38), (0.085, 0.095, 0.105), skin); parts.append((head, 'head'))
    parts.append((blob('haircap', 'sphere', (0, -0.205, 1.405), (0.09, 0.095, 0.09), hair), 'head'))
    parts.append((blob('bun', 'sphere', (0, -0.15, 1.44), (0.05, 0.05, 0.045), hair), 'head'))
    for s in (1, -1):
        parts.append((blob('eye', 'sphere', (s * 0.03, -0.3, 1.39), (0.014, 0.008, 0.009), dark), 'head'))
    parts.append((blob('mouth', 'sphere', (0, -0.302, 1.335), (0.02, 0.006, 0.006), dark), 'head'))
    for s, n in ((1, 'L'), (-1, 'R')):
        parts.append((taper('thigh' + n, (s * 0.09, 0, 0.8), (s * 0.09, -0.02, 0.43), 0.06, 0.042, skin), 'thigh.' + n))
        parts.append((taper('shin' + n, (s * 0.09, -0.02, 0.43), (s * 0.09, 0.0, 0.07), 0.04, 0.03, skin), 'shin.' + n))
        parts.append((taper('foot' + n, (s * 0.09, 0.03, 0.04), (s * 0.09, -0.12, 0.03), 0.03, 0.028, skin, 0.6), 'shin.' + n))
        parts.append((taper('sleeve' + n, (s * 0.17, -0.13, 1.2), (s * 0.185, -0.12, 1.07), 0.05, 0.045, blouse), 'arm.' + n))
        parts.append((taper('upper' + n, (s * 0.18, -0.125, 1.08), (s * 0.19, -0.12, 0.95), 0.032, 0.026, skin), 'arm.' + n))
        parts.append((taper('fore' + n, (s * 0.19, -0.12, 0.95), (s * 0.19, -0.2, 0.76), 0.025, 0.02, skin), 'fore.' + n))
        parts.append((blob('hand' + n, 'sphere', (s * 0.19, -0.21, 0.73), (0.025, 0.02, 0.04), skin), 'fore.' + n))
    for o, b in parts: to_bone(o, arm, b)
    # ---- run cycle: 24 frames, legs and arms in opposition, a bob and a lean ----
    arm.animation_data_create(); act = bpy.data.actions.new('run'); arm.animation_data.action = act
    bpy.context.view_layer.objects.active = arm; bpy.ops.object.mode_set(mode='POSE')
    P = arm.pose.bones
    for pb in P: pb.rotation_mode = 'XYZ'
    def key(f, pose):
        for name, (rx, rz) in pose.items():
            pb = P[name]; pb.rotation_euler = (rx, 0, rz); pb.keyframe_insert('rotation_euler', frame=f)
    def legs(ph):  # ph 0..1 ; L leads at 0
        out = {}
        for n, o in (('L', 0.0), ('R', 0.5)):
            a = (ph + o) * 2 * math.pi
            out['thigh.' + n] = (-0.85 * math.sin(a) - 0.15, 0)            # swing forward/back
            out['shin.' + n] = (1.25 * max(0, math.cos(a - 0.9)) + 0.15, 0)  # knee folds on the back swing
            out['arm.' + n] = (0.9 * math.sin(a), 0)
            out['fore.' + n] = (-1.1, 0)
        out['spine'] = (0.08 * math.sin(ph * 4 * math.pi), 0); out['head'] = (-0.25, 0); out['hips'] = (0, 0.12 * math.sin(ph * 2 * math.pi))
        return out
    for k in range(9):
        key(1 + k * 3, legs(k / 8))
    for k in range(9):                                              # vertical bob: two hops per cycle
        P['hips'].location = (0, 0.05 * abs(math.sin(k / 8 * 2 * math.pi)), 0); P['hips'].keyframe_insert('location', frame=1 + k * 3)
    act.use_fake_user = True
    # ---- stand: hunched, arms hanging, head tilted (one held pose) ----
    st = bpy.data.actions.new('stand'); st.use_fake_user = True; arm.animation_data.action = st
    for pb in P: pb.rotation_euler = (0, 0, 0); pb.location = (0, 0, 0)
    pose = {'spine': (0.12, 0), 'head': (-0.35, 0.25), 'arm.L': (0.15, 0), 'arm.R': (0.15, 0), 'fore.L': (-0.35, 0), 'fore.R': (-0.35, 0), 'shin.L': (0.12, 0), 'shin.R': (0.12, 0), 'thigh.L': (-0.06, 0), 'thigh.R': (-0.06, 0), 'hips': (0, 0)}
    for f in (1, 25): key(f, pose); P['hips'].keyframe_insert('location', frame=f)
    for a in (act, st):                                             # both go out to glTF as separate animations
        tr = arm.animation_data.nla_tracks.new(); tr.name = a.name; tr.strips.new(a.name, 1, a)
    arm.animation_data.action = None
    bpy.ops.object.mode_set(mode='OBJECT')
    bpy.context.scene.frame_start = 1; bpy.context.scene.frame_end = 25; bpy.context.scene.render.fps = 24
    if outdir:
        bpy.ops.object.select_all(action='DESELECT')
        bpy.ops.export_scene.gltf(filepath=f'{outdir}/yai.glb', use_selection=False, export_format='GLB', export_animations=True, export_animation_mode='NLA_TRACKS', export_force_sampling=True, export_texcoords=False, export_tangents=False, export_yup=True)
    return arm

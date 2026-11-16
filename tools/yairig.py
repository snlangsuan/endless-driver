# Blender script: rig the image-to-3D Yai Speed sculpt (assets/ref/yai_src.glb, a single untextured mesh caught mid-stride)
# -> colours it by body part, skins it to a simple armature and adds two actions ("run" loops, "stand" is held)
# -> exports assets/cars/yai.glb (skinned; the game clones it with SkeletonUtils).
# Run:  exec(open('<project>/tools/yairig.py').read()); rig_yai('<project>')
import bpy, math
from mathutils import Vector, Matrix, Quaternion

J = {  # joints of the sculpt after import (facing -Y, metres; measured from the mesh)
    'hips': (0, 0.03, 0.70), 'chest': (0, -0.04, 1.0), 'neck': (0, -0.1, 1.17), 'top': (0, -0.16, 1.46),
    'hip.L': (0.08, 0.0, 0.7), 'knee.L': (0.13, -0.25, 0.42), 'ankle.L': (0.13, -0.13, 0.24), 'toe.L': (0.14, -0.31, 0.15),
    'hip.R': (-0.07, 0.05, 0.7), 'knee.R': (-0.07, 0.15, 0.38), 'ankle.R': (-0.07, 0.39, 0.14), 'toe.R': (-0.06, 0.35, 0.0),
    'sh.L': (0.15, -0.06, 1.08), 'elb.L': (0.25, -0.26, 0.96), 'wr.L': (0.13, -0.4, 1.12), 'fist.L': (0.11, -0.42, 1.18),
    'sh.R': (-0.15, 0.0, 1.07), 'elb.R': (-0.23, 0.24, 0.93), 'wr.R': (-0.21, 0.32, 0.79), 'fist.R': (-0.2, 0.34, 0.73),
}
CHAIN = [  # bone, head joint, tail joint, parent
    ('hips', 'hips', 'chest', None), ('spine', 'chest', 'neck', 'hips'), ('head', 'neck', 'top', 'spine'),
    ('thigh.L', 'hip.L', 'knee.L', 'hips'), ('shin.L', 'knee.L', 'ankle.L', 'thigh.L'), ('foot.L', 'ankle.L', 'toe.L', 'shin.L'),
    ('thigh.R', 'hip.R', 'knee.R', 'hips'), ('shin.R', 'knee.R', 'ankle.R', 'thigh.R'), ('foot.R', 'ankle.R', 'toe.R', 'shin.R'),
    ('arm.L', 'sh.L', 'elb.L', 'spine'), ('fore.L', 'elb.L', 'wr.L', 'arm.L'), ('hand.L', 'wr.L', 'fist.L', 'fore.L'),
    ('arm.R', 'sh.R', 'elb.R', 'spine'), ('fore.R', 'elb.R', 'wr.R', 'arm.R'), ('hand.R', 'wr.R', 'fist.R', 'fore.R'),
]

def M(name, color, rough=0.85):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True; b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (*color, 1); b.inputs['Roughness'].default_value = rough
    return m

def rig_yai(root, export=True):
    for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
    for a in list(bpy.data.actions): bpy.data.actions.remove(a)
    bpy.ops.import_scene.gltf(filepath=f'{root}/assets/ref/yai_src.glb')
    me = [o for o in bpy.data.objects if o.type == 'MESH'][0]
    for o in list(bpy.data.objects):
        if o is not me: bpy.data.objects.remove(o, do_unlink=True)
    me.name = 'yaiBody'; me.parent = None; me.rotation_mode = 'XYZ'; me.rotation_euler = (0, 0, -math.pi / 2); me.scale = (1.45,) * 3
    bpy.ops.object.select_all(action='DESELECT'); bpy.context.view_layer.objects.active = me; me.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    dec = me.modifiers.new('dec', 'DECIMATE'); dec.ratio = 0.42; bpy.ops.object.modifier_apply(modifier='dec')   # light enough for the web build
    for p in me.data.polygons: p.use_smooth = True
    # ---- armature fitted to the pose ----
    bpy.ops.object.armature_add(location=(0, 0, 0)); arm = bpy.context.active_object; arm.name = 'yai'
    bpy.ops.object.mode_set(mode='EDIT'); eb = arm.data.edit_bones
    for b in list(eb): eb.remove(b)
    for n, h, t, par in CHAIN:
        b = eb.new(n); b.head = J[h]; b.tail = J[t]
        if par: b.parent = eb[par]; b.use_connect = False
    bpy.ops.object.mode_set(mode='OBJECT')
    # ---- skin it ----
    bpy.ops.object.select_all(action='DESELECT'); me.select_set(True); arm.select_set(True); bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    # ---- colour by body part (dominant bone), since the sculpt came without a texture ----
    skin, hair, blouse, sarong = M('yskin', (0.36, 0.25, 0.18), 0.7), M('yhair', (0.62, 0.62, 0.6), 0.6), M('yblouse', (0.72, 0.7, 0.64), 0.9), M('ysarong', (0.1, 0.06, 0.08), 0.85)
    me.data.materials.clear()
    for m in (skin, hair, blouse, sarong): me.data.materials.append(m)
    gname = {g.index: g.name for g in me.vertex_groups}
    def dom(v):
        best = max(v.groups, key=lambda g: g.weight, default=None)
        return gname[best.group] if best else 'hips'
    vb = [dom(v) for v in me.data.vertices]
    for p in me.data.polygons:
        c = p.center; names = [vb[i] for i in p.vertices]; b = max(set(names), key=names.count)
        if b.startswith(('arm', 'fore', 'hand')):
            sh = Vector(J['sh.' + b[-1]]); idx = 2 if (c - sh).length < 0.15 else 0                 # short sleeves, bare forearms
        elif c.z > 1.17: idx = 0 if (p.normal.y < -0.35 and 1.2 < c.z < 1.4) else 1                   # face, otherwise grey hair
        elif c.z > 0.79: idx = 2                                                                         # blouse
        elif c.z > 0.29: idx = 3                                                                         # tube skirt
        else: idx = 0                                                                                    # bare shins and feet
        p.material_index = idx
    # ---- poses ----
    bpy.context.view_layer.objects.active = arm; bpy.ops.object.mode_set(mode='POSE')
    P = arm.pose.bones
    rest_dir = {pb.name: (pb.bone.tail_local - pb.bone.head_local).normalized() for pb in P}
    def aim(name, d):
        """rotate a pose bone so it points along world direction d (armature space; parents already posed)"""
        bpy.context.view_layer.update()
        pb = P[name]; cur = (pb.tail - pb.head).normalized(); q = cur.rotation_difference(Vector(d).normalized())
        mw = pb.matrix.copy(); loc = mw.translation.copy()
        rot = (q.to_matrix().to_4x4() @ mw); rot.translation = loc; pb.matrix = rot
    def reset():
        for pb in P: pb.rotation_mode = 'QUATERNION'; pb.rotation_quaternion = (1, 0, 0, 0); pb.location = (0, 0, 0)
    def keyall(f):
        for pb in P: pb.keyframe_insert('rotation_quaternion', frame=f); pb.keyframe_insert('location', frame=f)
    mirror = {'L': 'R', 'R': 'L'}
    def swapped():  # each limb takes the other side's rest direction (legs and arms trade places)
        for part in ('thigh', 'shin', 'foot', 'arm', 'fore', 'hand'):
            for s in 'LR':
                d = rest_dir[f'{part}.{mirror[s]}'].copy(); d.x = -d.x                  # mirrored left-right
                aim(f'{part}.{s}', d)
    act = bpy.data.actions.new('run'); act.use_fake_user = True; arm.animation_data_create(); arm.animation_data.action = act
    reset(); P['hips'].location = (0, 0, 0); keyall(1); keyall(25)
    reset(); swapped(); keyall(13)
    # passing poses: knees tucked, body lifted
    for f, tuck in ((7, 'R'), (19, 'L')):
        reset(); bpy.context.view_layer.update()
        for s in 'LR':
            th, sh = rest_dir[f'thigh.{s}'], rest_dir[f'shin.{s}']
            aim(f'thigh.{s}', Vector((th.x, -0.25, -1)) if s == tuck else Vector((th.x, 0.05, -1)))
            aim(f'shin.{s}', Vector((sh.x, 0.85, -0.6)) if s == tuck else Vector((sh.x, 0.1, -1)))
        P['hips'].location = (0, 0.05, 0); keyall(f)
    st = bpy.data.actions.new('stand'); st.use_fake_user = True; arm.animation_data.action = st
    reset()
    for s, sx in (('L', 1), ('R', -1)):
        aim(f'thigh.{s}', (0, 0.02, -1)); aim(f'shin.{s}', (0, 0.04, -1)); aim(f'foot.{s}', (0, -1, -0.25))
        aim(f'arm.{s}', (sx * 0.15, -0.12, -1)); aim(f'fore.{s}', (sx * 0.05, -0.35, -1)); aim(f'hand.{s}', (0, -0.2, -1))
    P['hips'].location = (0, 0, -0.06); keyall(1); keyall(25)
    for a in (act, st):
        tr = arm.animation_data.nla_tracks.new(); tr.name = a.name; tr.strips.new(a.name, 1, a)
    arm.animation_data.action = None
    bpy.ops.object.mode_set(mode='OBJECT')
    bpy.context.scene.frame_start = 1; bpy.context.scene.frame_end = 25; bpy.context.scene.render.fps = 24
    if export:
        bpy.ops.object.select_all(action='DESELECT')
        bpy.ops.export_scene.gltf(filepath=f'{root}/assets/cars/yai.glb', use_selection=False, export_format='GLB', export_animations=True, export_animation_mode='NLA_TRACKS',
                                  export_force_sampling=True, export_skins=True, export_texcoords=False, export_tangents=False, export_yup=True)
    return arm

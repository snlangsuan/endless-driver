// Bloom: the bright parts of the picture, shrunk and spread.
@group(0) @binding(0) var s: sampler;
@group(0) @binding(1) var t: texture_2d<f32>;
struct VO { @builtin(position) cp: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) i: u32) -> VO { var o: VO; let p = vec2f(f32(i32(i & 1u) * 4 - 1), f32(i32(i >> 1u) * 4 - 1)); o.cp = vec4f(p, 0., 1.); o.uv = vec2f(p.x * .5 + .5, .5 - p.y * .5); return o; }
fn tap(uv: vec2f, o: vec2f) -> vec3f { let d = 1. / vec2f(textureDimensions(t)); return textureSampleLevel(t, s, uv + o * d, 0.).rgb; }
fn box(uv: vec2f) -> vec3f { return (tap(uv, vec2f(-1., -1.)) + tap(uv, vec2f(1., -1.)) + tap(uv, vec2f(-1., 1.)) + tap(uv, vec2f(1., 1.))) * .25; }
@fragment fn fsBright(i: VO) -> @location(0) vec4f { let c = box(i.uv); let l = max(c.r, max(c.g, c.b)); return vec4f(c * max(l - 1., 0.) / max(l, 1e-4), 1.); }
@fragment fn fsDown(i: VO) -> @location(0) vec4f { return vec4f(box(i.uv), 1.); }
@fragment fn fsUp(i: VO) -> @location(0) vec4f { return vec4f(box(i.uv), 1.); }

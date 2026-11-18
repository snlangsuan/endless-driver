// The last pass: tone mapping, rain and snow streaks, a little noise against banding.
@group(0) @binding(0) var s: sampler;
@group(0) @binding(1) var tS: texture_2d<f32>;
@group(0) @binding(2) var tB: texture_2d<f32>;
@group(0) @binding(3) var<uniform> u: vec4f;
struct VO { @builtin(position) cp: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) i: u32) -> VO { var o: VO; let p = vec2f(f32(i32(i & 1u) * 4 - 1), f32(i32(i >> 1u) * 4 - 1)); o.cp = vec4f(p, 0., 1.); o.uv = vec2f(p.x * .5 + .5, .5 - p.y * .5); return o; }
fn ss(a: f32, b: f32, x: f32) -> f32 { let t = clamp((x - a) / (b - a), 0., 1.); return t * t * (3. - 2. * t); }
fn aces(x: vec3f) -> vec3f { return clamp((x * (2.51 * x + .03)) / (x * (2.43 * x + .59) + .14), vec3f(0.), vec3f(1.)); }
@fragment fn fs(i: VO) -> @location(0) vec4f {
  var c = textureSampleLevel(tS, s, i.uv, 0.).rgb + textureSampleLevel(tB, s, i.uv, 0.).rgb * .22;
  c *= u.x;
  let ry = abs(u.y); let snf = step(u.y, -.01);
  if (ry > .01) {            // rain falling past the eye in slanting streaks, or snow drifting down; three depths; the scene greyed
    let lum = dot(c, vec3f(.3, .6, .1)); c = mix(c, vec3f(lum) * vec3f(.96, 1., 1.05), .22 * ry); var r = 0.;
    for (var k = 0; k < 3; k++) {
      let fk = f32(k); let sc = 16. + fk * 14.;
      var p = vec2f(i.uv.x * sc * 1.78 + i.uv.y * sc * u.w + fk * 7.3, i.uv.y * sc * mix(.16, 1., snf) - u.z * mix(5.5 - fk * 1.2, 1.5 - fk * .35, snf));
      p.x += snf * sin(u.z * .8 + p.y * .7 + fk) * .35;
      p.y += fract(sin(floor(p.x) * 91.7 + fk) * 43758.5453) * 9.;                 // every column falls out of step with its neighbours
      let id = floor(p); let f = fract(p); let h = fract(sin(dot(id, vec2f(127.1, 311.7))) * 43758.5453);
      let on = step(1. - (.1 + .5 * ry), h); let x0 = .2 + .6 * fract(h * 57.3);
      let streak = (1. - ss(0., mix(.05, .03, fk * .5), abs(f.x - x0))) * ss(0., .25, f.y) * ss(1., .55, f.y);
      let flake = 1. - ss(.03, .11 - fk * .02, length(f - vec2f(x0, .5)));
      r += on * mix(streak, flake * 1.6, snf) * (.55 - .13 * fk);
    }
    c += vec3f(.72, .78, .88) * r * (.06 + lum * .5) * (.5 + .5 * ry) * mix(1., 1.8, snf);
  }
  let q = i.uv - .5; c *= 1. - dot(q, q) * .45;
  c = aces(c);
  let l = dot(c, vec3f(.2126, .7152, .0722)); c = mix(vec3f(l), c, 1.06);
  c = pow(max(c, vec3f(0.)), vec3f(1. / 2.2));
  let n = fract(52.9829189 * fract(dot(i.cp.xy, vec2f(.06711056, .00583715))));
  return vec4f(c + (n - .5) / 255., 1.);
}

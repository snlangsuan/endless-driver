// Culling on the graphics card: which of a chunk's leaves or blades of grass are in view. One thread for each of the first n instances of the
// chunk's buffer (n: what the distance allows - see LODN in render.js); one that may show is added to the list outI, and counted in the
// instanceCount of its draw's indirect arguments - so the draw that follows (vsLeafC in vertex.wgsl) does only those.
// A thing is kept unless it lies wholly outside one of the five sides of the view (left, right, bottom, top, near: the far side is beyond the fog):
// tested as a ball round its foot, as big as the thing can reach - its length, widened as the far densities are (ws), and the wind's sway on
// top - and a falling petal, which wanders metres from where it was put, kept if it is anywhere near.
struct CP { pl: array<vec4f, 6>, cam: vec4f, n: u32, ws: f32, p0: f32, p1: f32 };
@group(0) @binding(0) var<storage, read> inst: array<vec4f>;
@group(0) @binding(1) var<storage, read_write> outI: array<u32>;
@group(0) @binding(2) var<storage, read_write> args: array<atomic<u32>, 4>;
@group(0) @binding(3) var<uniform> cp: CP;
@compute @workgroup_size(64) fn cull(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x; if (i >= cp.n) { return; }
  let a = inst[i * 3u]; let k = inst[i * 3u + 2u].x;
  var r = a.w * 1.5 * cp.ws + 2.5; if (k > 10.5 && k < 11.5) { r = 10.; }
  let p = a.xyz - cp.cam.xyz;
  for (var q = 0; q < 5; q++) { let pl = cp.pl[q]; if (dot(pl.xyz, p) + pl.w < -r) { return; } }
  outI[atomicAdd(&args[1], 1u)] = i;
}

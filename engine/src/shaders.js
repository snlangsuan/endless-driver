// --------------------------------------------------------------------------------------------------------- shaders
// The WGSL lives in shaders/*.wgsl (fetched by boot.js into WGSL). Here it is put together and compiled.
const W_COMMON = `const SHADOW_RES = ${SHADOW}.;\n` + WGSL.common, W_VERT = WGSL.vertex;
const W_SCENE = W_COMMON + W_VERT + WGSL.scene, W_SHADOW = W_COMMON + W_VERT, W_POST = WGSL.post, W_FINAL = WGSL.final;
function mod(code, name) {
  const m = device.createShaderModule({ code });
  m.getCompilationInfo().then((info) => { for (const e of info.messages) if (e.type === 'error') fail(`WGSL ${name} line ${e.lineNum}: ${e.message}\n   ${code.split('\n')[e.lineNum - 1]}`); });
  return m;
}
const mScene = mod(W_SCENE, 'scene'), mShadow = mod(W_SHADOW, 'shadow'), mPost = mod(W_POST, 'post'), mFinal = mod(W_FINAL, 'final');

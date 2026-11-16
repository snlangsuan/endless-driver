// ===== Post-processing, WebGPU build: bloom + filmic output + colour grade / vignette (same as post.js) =====
import * as THREE from 'three';
import { bloom } from 'three/examples/jsm/tsl/display/BloomNode.js';
const T = THREE;

export class Post {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.pp = new T.PostProcessing(renderer);
    const scenePass = T.pass(scene, camera);
    const col = scenePass.getTextureNode('output');
    const bl = bloom(col, 0.35, 0.55, 0.92);
    this.pp.outputColorTransform = false;          // tone map + sRGB ourselves, then grade in display space like the WebGL OutputPass -> grade
    this.pp.outputNode = T.Fn(() => {
      const c = T.renderOutput(col.add(bl)).toVar();
      const l = T.dot(c.rgb, T.vec3(0.2126, 0.7152, 0.0722));
      const g = T.mix(T.vec3(l), c.rgb, 1.1).sub(0.5).mul(1.05).add(0.5);
      const q = T.uv().sub(0.5), v = T.clamp(T.dot(q, q).mul(0.35 * 2.2).oneMinus(), 0, 1);
      return T.vec4(T.clamp(g.mul(v), 0, 1), 1);
    })();
    this.enabled = true;
  }
  setSize() {}
  render() { this.pp.render(); }
}

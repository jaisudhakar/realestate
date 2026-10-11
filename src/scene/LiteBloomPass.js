import { HalfFloatType, ShaderMaterial, Vector2, WebGLRenderTarget, AdditiveBlending } from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

// A lightweight bloom: threshold at quarter resolution, then a few separable blurs.
// Uses 3 shader programs instead of UnrealBloomPass's 8, and far fewer passes per frame.
const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

export class LiteBloomPass extends Pass {
  constructor({ strength = 0.4, threshold = 0.85, radius = 1 } = {}) {
    super();
    this.strength = strength;
    this.threshold = threshold;
    this.radius = radius;
    const opts = { type: HalfFloatType, depthBuffer: false };
    this.rtA = new WebGLRenderTarget(1, 1, opts);
    this.rtB = new WebGLRenderTarget(1, 1, opts);
    this.rtC = new WebGLRenderTarget(1, 1, opts);
    this.rtD = new WebGLRenderTarget(1, 1, opts);

    this.brightMat = new ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uThreshold: { value: threshold }, uTexel: { value: new Vector2() } },
      vertexShader,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse; uniform float uThreshold; uniform vec2 uTexel; varying vec2 vUv;
        void main() {
          // 4-tap box downsample keeps small lights from flickering
          vec3 c = texture2D(tDiffuse, vUv + uTexel * vec2(-1.0, -1.0)).rgb
                 + texture2D(tDiffuse, vUv + uTexel * vec2( 1.0, -1.0)).rgb
                 + texture2D(tDiffuse, vUv + uTexel * vec2(-1.0,  1.0)).rgb
                 + texture2D(tDiffuse, vUv + uTexel * vec2( 1.0,  1.0)).rgb;
          c *= 0.25;
          float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
          gl_FragColor = vec4(c * smoothstep(uThreshold, uThreshold + 0.25, l), 1.0);
        }`,
    });
    this.blurMat = new ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uDir: { value: new Vector2() } },
      vertexShader,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse; uniform vec2 uDir; varying vec2 vUv;
        void main() {
          vec3 c = texture2D(tDiffuse, vUv).rgb * 0.227027;
          c += (texture2D(tDiffuse, vUv + uDir * 1.384615).rgb + texture2D(tDiffuse, vUv - uDir * 1.384615).rgb) * 0.316216;
          c += (texture2D(tDiffuse, vUv + uDir * 3.230769).rgb + texture2D(tDiffuse, vUv - uDir * 3.230769).rgb) * 0.070270;
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    this.mixMat = new ShaderMaterial({
      uniforms: { tNear: { value: null }, tFar: { value: null }, uStrength: { value: strength } },
      vertexShader,
      fragmentShader: /* glsl */ `
        uniform sampler2D tNear; uniform sampler2D tFar; uniform float uStrength; varying vec2 vUv;
        void main() {
          vec3 b = texture2D(tNear, vUv).rgb * 0.6 + texture2D(tFar, vUv).rgb * 0.9;
          gl_FragColor = vec4(b * uStrength, 1.0);
        }`,
      blending: AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      transparent: true,
    });
    this.quad = new FullScreenQuad();
    this.needsSwap = false;
  }

  setSize(width, height) {
    const w4 = Math.max(1, Math.round(width / 4));
    const h4 = Math.max(1, Math.round(height / 4));
    this.rtA.setSize(w4, h4);
    this.rtB.setSize(w4, h4);
    this.rtC.setSize(Math.max(1, w4 >> 1), Math.max(1, h4 >> 1));
    this.rtD.setSize(Math.max(1, w4 >> 1), Math.max(1, h4 >> 1));
    this.fullSize = [width, height];
  }

  #blur(renderer, src, dst, dx, dy) {
    this.blurMat.uniforms.tDiffuse.value = src.texture;
    this.blurMat.uniforms.uDir.value.set(dx / src.width, dy / src.height);
    renderer.setRenderTarget(dst);
    this.quad.render(renderer);
  }

  render(renderer, writeBuffer, readBuffer) {
    if (this.strength <= 0.001) return;
    const autoClear = renderer.autoClear;
    renderer.autoClear = true;
    const r = this.radius;

    this.quad.material = this.brightMat;
    this.brightMat.uniforms.tDiffuse.value = readBuffer.texture;
    this.brightMat.uniforms.uThreshold.value = this.threshold;
    this.brightMat.uniforms.uTexel.value.set(1 / readBuffer.width, 1 / readBuffer.height);
    renderer.setRenderTarget(this.rtA);
    this.quad.render(renderer);

    this.quad.material = this.blurMat;
    this.#blur(renderer, this.rtA, this.rtB, r, 0);
    this.#blur(renderer, this.rtB, this.rtA, 0, r);
    this.#blur(renderer, this.rtA, this.rtC, r * 2, 0); // downsample into the wider halo
    this.#blur(renderer, this.rtC, this.rtD, 0, r * 2);
    this.#blur(renderer, this.rtD, this.rtC, r * 2, 0);
    this.#blur(renderer, this.rtC, this.rtD, 0, r * 2);

    // Add the glow on top of the frame in place
    renderer.autoClear = false;
    this.quad.material = this.mixMat;
    this.mixMat.uniforms.tNear.value = this.rtA.texture;
    this.mixMat.uniforms.tFar.value = this.rtD.texture;
    this.mixMat.uniforms.uStrength.value = this.strength;
    renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
    this.quad.render(renderer);
    renderer.autoClear = autoClear;
  }

  dispose() {
    [this.rtA, this.rtB, this.rtC, this.rtD].forEach((t) => t.dispose());
    [this.brightMat, this.blurMat, this.mixMat].forEach((m) => m.dispose());
    this.quad.dispose();
  }
}

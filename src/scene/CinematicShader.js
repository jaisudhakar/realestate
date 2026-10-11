import { Vector2 } from 'three';

// Final grade: subtle chromatic aberration, teal/orange split-tone, vignette and film grain.
export const CinematicShader = {
  name: 'CinematicShader',
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uResolution: { value: new Vector2(1, 1) },
    uGrain: { value: 0.045 },
    uVignette: { value: 0.9 },
    uAberration: { value: 0.01 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uGrain, uVignette, uAberration;
    uniform vec2 uResolution;
    varying vec2 vUv;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

    void main() {
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);
      vec2 off = c * r2 * uAberration;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - off).b;

      // split tone: cool shadows, warm highlights
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      vec3 shadows = vec3(0.02, 0.05, 0.08);
      vec3 highs = vec3(0.06, 0.03, -0.02);
      col += shadows * (1.0 - l) * 0.6 + highs * l * 0.5;
      col = mix(vec3(l), col, 1.06); // gentle saturation lift

      // vignette
      float v = smoothstep(0.85, 0.18, length(c * vec2(1.0, 0.85)));
      col *= mix(1.0, v, uVignette * 0.75);

      // animated film grain
      float g = hash(vUv * uResolution + fract(uTime * 24.0) * 100.0) - 0.5;
      col += g * uGrain * (1.0 - l * 0.5);

      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

// Wet-lens filter: procedural droplets, mostly at the screen edges; slide off and dry in ~4 s.
// Distortion (high/mid) draws the scene to the screen as usual, copies the screen into a texture and draws it back through
// the drops: rendering into a separate target instead blended the additive sunbeams in linear space, dimming them while
// the lens was wet. Low quality draws droplets only.
import * as THREE from 'three';
import { WetTrigger } from './wettrigger.js';

const DRY_SECONDS = 4;

const WET_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const WET_FRAG = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tScene;
uniform float uTime, uWet, uSeed, uAspect, uDistort;
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec3 dropLayer(vec2 uv, float scale, float t, float w) {
  vec2 st = uv * vec2(uAspect, 1.0) * scale;
  vec2 id = floor(st);
  float n = h21(id + uSeed), n2 = h21(id + uSeed + 17.13);
  vec2 f = fract(st) - 0.5;
  float slide = fract(n2 + t * (0.04 + 0.1 * n));
  float r = 0.12 + 0.17 * n2;
  float ry = r / 1.25;
  vec2 p = vec2((n - 0.5) * 2.0 * (0.5 - r), (0.5 - ry) * (1.0 - 2.0 * slide));   // the drop never leaves its cell: no straight cut-off along a cell edge
  vec2 d = f - p; d.y *= 1.25;
  float m = smoothstep(r, r * 0.5, length(d)) * step(n, w);
  return vec3(d * m, m);
}
void main() {
  vec2 uv = vUv;
  float edge = smoothstep(0.2, 0.72, length(uv - 0.5) * 1.414);
  float w = uWet * (0.3 + 0.7 * edge);
  vec3 a = dropLayer(uv, 3.0, uTime, w * 0.55);
  vec3 b = dropLayer(uv * 1.7 + 3.1, 5.0, uTime * 1.3, w * 0.4);
  vec2 off = (a.xy + b.xy) * 0.11;   // offset grows with distance from the drop centre = magnifying lens
  float mask = max(a.z, b.z);
  if (uDistort > 0.5) {
    vec3 col = sRGBTransferEOTF(texture2D(tScene, uv - off)).rgb + mask * 0.03;   // the copied screen holds display values
    gl_FragColor = vec4(col, 1.0);
  } else {
    gl_FragColor = vec4(vec3(0.9, 0.97, 1.0), mask * 0.22);
  }
  #include <colorspace_fragment>
}`;

export class WetScreen {
  constructor() {
    this.wet = 0;
    this.trigger = new WetTrigger();
    this.time = 0;
    this.fb = null;
    this.size = new THREE.Vector2();
    this.scene = new THREE.Scene();
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: null }, uTime: { value: 0 }, uWet: { value: 0 }, uSeed: { value: 0 },
        uAspect: { value: 1 }, uDistort: { value: 1 },
      },
      vertexShader: WET_VERT, fragmentShader: WET_FRAG, depthTest: false, depthWrite: false, transparent: true,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    quad.frustumCulled = false;
    this.scene.add(quad);
  }

  // depth: metres of water over the player's feet (0 when dry). Wading deep enough wets the lens now and then;
  // it dries off by itself even while the player stays in the water.
  update(dt, depth, moving, running) {
    this.time += dt;
    const hit = this.trigger.update(dt, depth, moving, running);
    if (hit) { this.wet = Math.max(this.wet, hit); this.mat.uniforms.uSeed.value = Math.random() * 97; }
    this.wet = Math.max(0, this.wet - dt / DRY_SECONDS);
  }

  // the texture the screen is copied into, sized to the canvas (created on first use)
  copyScreen(renderer) {
    if (!this.fb || this.fb.image.width !== this.size.x || this.fb.image.height !== this.size.y) {
      this.fb?.dispose();
      this.fb = new THREE.FramebufferTexture(this.size.x, this.size.y);
    }
    renderer.copyFramebufferToTexture(this.fb);
    return this.fb;
  }

  render(renderer, scene, camera, distort) {
    if (this.wet <= 0.001) { renderer.render(scene, camera); return; }
    const u = this.mat.uniforms;
    renderer.getDrawingBufferSize(this.size);
    u.uTime.value = this.time;
    u.uWet.value = this.wet;
    u.uAspect.value = this.size.x / Math.max(1, this.size.y);
    if (distort) {
      renderer.render(scene, camera);
      u.tScene.value = this.copyScreen(renderer);
      u.uDistort.value = 1;
      this.mat.blending = THREE.NoBlending;
      renderer.render(this.scene, this.cam);
    } else {
      renderer.render(scene, camera);
      u.uDistort.value = 0;
      this.mat.blending = THREE.NormalBlending;
      const ac = renderer.autoClear;
      renderer.autoClear = false;
      renderer.render(this.scene, this.cam);
      renderer.autoClear = ac;
    }
  }
}

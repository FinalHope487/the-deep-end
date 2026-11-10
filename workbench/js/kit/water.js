// K2: water. Planar reflection (mirror camera + clip plane), see-through to the tiled floor by depth absorption,
// animated ripples that bend the reflection and break up the sun glint.
import * as THREE from 'three';

const VERT = /* glsl */`
varying vec3 vW;
void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;

const FRAG = /* glsl */`
uniform sampler2D tRefl; uniform mat4 texMat;
uniform vec3 tint, bodyLight, sunCol, sunToward;
uniform float absorb, reflStrength, f0, depth, time, rScale, rSpeed, rAmp, distort, glint, glintSize;
varying vec3 vW;
float h(vec2 p, float t){
  float a = 0.0;
  a += sin(dot(p, vec2( 0.9, 0.4))*rScale*1.0 + t*1.00);
  a += sin(dot(p, vec2(-0.5, 0.8))*rScale*1.7 + t*1.31) * 0.7;
  a += sin(dot(p, vec2( 0.2,-1.0))*rScale*2.9 + t*1.77) * 0.5;
  a += sin(dot(p, vec2(-0.8,-0.3))*rScale*4.3 + t*2.13) * 0.3;
  a += sin(dot(p, vec2( 0.6, 0.7))*rScale*6.1 + t*2.70) * 0.18;
  return a;
}
void main(){
  float t = time * rSpeed; float e = 0.04;
  float h0 = h(vW.xz, t);
  vec2 g = vec2(h(vW.xz+vec2(e,0.0), t)-h0, h(vW.xz+vec2(0.0,e), t)-h0) / e;
  vec3 N = normalize(vec3(-g.x*rAmp, 1.0, -g.y*rAmp));
  vec3 V = normalize(cameraPosition - vW);
  float nv = max(dot(N,V), 0.0);
  float F = f0 + (1.0-f0)*pow(1.0-nv, 5.0);
  F = clamp(F*reflStrength + (reflStrength-1.0)*0.0, 0.0, 1.0);
  vec4 tc = texMat * vec4(vW,1.0);
  vec2 uv = tc.xy/tc.w + N.xz*distort;
  vec3 refl = texture2D(tRefl, uv).rgb;
  float path = depth / max(V.y, 0.06);
  float T = exp(-absorb*path);                 // light from the floor that survives the water
  float bodyA = (1.0-F)*(1.0-T);               // water body colour weight
  vec3 body = tint*bodyLight;
  vec3 R = reflect(-sunToward, N);
  float sp = pow(max(dot(R, V), 0.0), glintSize) * glint;
  vec3 prem = refl*F + body*bodyA + sunCol*sp;
  float a = F + bodyA;
  gl_FragColor = vec4(prem, clamp(a + sp*0.2, 0.0, 1.0));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function createWater(room, plan, preset, light, renderer, size) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(plan.pos, 3));
  geo.setIndex(plan.idx);
  const sun = room.sources.find((s) => s.type === 'sun');
  const sd = sun ? new THREE.Vector3(...sun.dir).normalize() : new THREE.Vector3(0, -1, 0);
  const rtW = Math.max(64, Math.floor(size.x * preset.reflectionScale)), rtH = Math.max(64, Math.floor(size.y * preset.reflectionScale));
  const rt = new THREE.WebGLRenderTarget(rtW, rtH, { type: THREE.HalfFloatType, samples: 0 });
  rt.texture.colorSpace = THREE.LinearSRGBColorSpace;
  const lin = (c) => { const k = new THREE.Color().setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace); return new THREE.Vector3(k.r, k.g, k.b); };
  const texMat = new THREE.Matrix4();
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    uniforms: {
      tRefl: { value: rt.texture }, texMat: { value: texMat },
      tint: { value: lin(preset.tint) },
      bodyLight: { value: new THREE.Vector3(...light.skyHorizon.map((c) => c * 0.5 * light.skyStrength + (light.ambientFloor ?? 0))) },
      sunCol: { value: lin(light.sunColor).multiplyScalar(light.sunStrength) },
      sunToward: { value: sd.clone().negate() },
      absorb: { value: preset.absorption }, reflStrength: { value: preset.reflection }, f0: { value: preset.f0 },
      depth: { value: room.waterLevel }, time: { value: 0 },
      rScale: { value: preset.rippleScale }, rSpeed: { value: preset.rippleSpeed }, rAmp: { value: preset.rippleAmp },
      distort: { value: preset.distort }, glint: { value: preset.glint }, glintSize: { value: preset.glintSize },
    },
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 5;
  mesh.frustumCulled = false;

  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -room.waterLevel);
  const virt = new THREE.PerspectiveCamera();
  const rp = new THREE.Vector3(0, room.waterLevel, 0), nrm = new THREE.Vector3(0, 1, 0);
  const bias = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), rot = new THREE.Matrix4();

  function renderReflection(scene, camera) {
    camera.updateMatrixWorld();
    v1.setFromMatrixPosition(camera.matrixWorld);
    v1.sub(rp).reflect(nrm).add(rp); // mirrored eye
    rot.extractRotation(camera.matrixWorld);
    v2.set(0, 0, -1).applyMatrix4(rot).add(camera.position);
    v2.sub(rp).reflect(nrm).add(rp); // mirrored target
    virt.position.copy(v1);
    virt.up.set(0, 1, 0).applyMatrix4(rot).reflect(nrm);
    virt.lookAt(v2);
    virt.fov = camera.fov; virt.aspect = camera.aspect; virt.near = camera.near; virt.far = camera.far;
    virt.updateProjectionMatrix(); virt.updateMatrixWorld();
    texMat.copy(bias).multiply(virt.projectionMatrix).multiply(virt.matrixWorldInverse);
    mesh.visible = false;
    const prevT = renderer.getRenderTarget();
    const prevClip = renderer.clippingPlanes;
    renderer.clippingPlanes = [plane];
    renderer.setRenderTarget(rt);
    renderer.clear();
    renderer.render(scene, virt);
    renderer.setRenderTarget(prevT);
    renderer.clippingPlanes = prevClip;
    mesh.visible = true;
  }

  return { mesh, renderReflection, setTime(t) { mat.uniforms.time.value = t; }, dispose() { rt.dispose(); mat.dispose(); geo.dispose(); } };
}

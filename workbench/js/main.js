// Viewer entry. Reads ?sheet=<name>[&shot=1][&stage=tile|sun|water|indirect|final]. Everything else comes from data files.
import * as THREE from 'three';
import { parseRoom } from './room.js';
import { buildSurfaces, buildWaterPlan, makeSolid } from './geometry.js';
import { createWalker } from './walk.js';
import { createTileMaterial } from './kit/tile.js';
import { addSun } from './kit/sun.js';
import { createWater } from './kit/water.js';
import { computeIndirect } from './kit/indirect.js';

const q = new URLSearchParams(location.search);
const SHOT = q.has('shot');
const STAGE = q.get('stage') || 'final';
const STAGES = ['tile', 'sun', 'water', 'indirect', 'final'];
const at = (s) => STAGES.indexOf(STAGE) >= STAGES.indexOf(s);

const wb = window.__wb = { ready: false, error: null };
const getJSON = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error(`${u}: HTTP ${r.status}`); return r.json(); };
const getText = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error(`${u}: HTTP ${r.status}`); return r.text(); };
const lin = (c) => { const k = new THREE.Color().setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace); return [k.r, k.g, k.b]; };

function fail(e) {
  wb.error = String(e.message || e);
  const d = document.createElement('pre');
  d.style.cssText = 'position:fixed;left:8px;top:8px;margin:0;padding:8px;background:#400;color:#fff;font:13px monospace;white-space:pre-wrap;z-index:9';
  d.textContent = 'ERROR: ' + wb.error;
  document.body.append(d);
  console.error(e);
}

async function boot() {
  const sheet = await getJSON(`/sheets/${encodeURIComponent(q.get('sheet'))}.json`);
  const room = parseRoom(await getText(`/rooms/${encodeURIComponent(sheet.room)}.room.txt`));
  const light = await getJSON(`/looks/light/${encodeURIComponent(sheet.light)}.json`);
  const waterP = await getJSON(`/looks/water/${encodeURIComponent(sheet.water)}.json`);
  const matP = await getJSON(`/looks/material/${encodeURIComponent(sheet.material)}.json`);
  if (light.sunStrength > 0 && !room.sources.some((s) => s.type === 'sun')) throw new Error('light preset has a sun but the room declares no "source: sun"');
  if (light.skyStrength > 0 && !room.sources.some((s) => s.type === 'opening')) throw new Error('light preset has sky light but the room declares no "source: opening"');

  const size = SHOT ? { x: 888, y: 900 } : { x: innerWidth, y: innerHeight };
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.setSize(size.x, size.y);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = light.exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false; // the sun and the room are static
  document.body.append(renderer.domElement);
  renderer.domElement.id = 'view';

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, size.x / size.y, 0.05, 500);

  // sky dome: gradient from the light preset, same radiance the indirect gather assumes
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { top: { value: new THREE.Vector3(...lin(light.skyTop).map((c) => c * light.skyStrength)) }, hor: { value: new THREE.Vector3(...lin(light.skyHorizon).map((c) => c * light.skyStrength)) } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top, hor; varying vec3 vD; void main(){ float k = smoothstep(0.0,1.0,max(vD.y,0.0)); gl_FragColor = vec4(mix(hor, top, k),1.0);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 24, 12), skyMat);
  sky.position.set(room.w * room.unit / 2, 0, room.d * room.unit / 2);
  sky.renderOrder = -1; sky.frustumCulled = false;
  scene.add(sky);

  // room surfaces (K1) + indirect (K5)
  const matLin = { tileSize: matP.tileSize, wall: lin(matP.wall), ceiling: lin(matP.ceiling), floor: lin(matP.floor) };
  const surf = buildSurfaces(room, matLin);
  const solid = makeSolid(room);
  const nVert = surf.pos.length / 3;
  const ind = at('indirect') ? computeIndirect(room, solid, surf, light, matLin) : new Float32Array(nVert * 3).fill(at('sun') ? 0.08 : 0.55);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(surf.pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(surf.nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(surf.uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(surf.col, 3));
  geo.setAttribute('aInd', new THREE.BufferAttribute(ind, 3));
  geo.setIndex(surf.idx);
  const tile = createTileMaterial(matP);
  tile.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aInd; varying vec3 vInd;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvInd = aInd;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vInd;').replace('#include <aomap_fragment>', '#include <aomap_fragment>\nreflectedLight.indirectDiffuse += diffuseColor.rgb * vInd;');
  };
  const roomMesh = new THREE.Mesh(geo, tile);
  roomMesh.castShadow = roomMesh.receiveShadow = true;
  scene.add(roomMesh);

  if (at('sun')) addSun(scene, room, light);

  let water = null;
  if (at('water')) { water = createWater(room, buildWaterPlan(room), waterP, light, renderer, size); scene.add(water.mesh); }

  const walker = createWalker(camera, renderer.domElement, room);
  const cam = room.cameras.main;
  walker.lookFrom(cam.pos, cam.look);
  if (!SHOT && at('final')) walker.enable();

  let simTime = 0;
  const frame = (dt) => {
    walker.update(dt);
    if (water) { water.setTime(simTime); water.renderReflection(scene, camera); }
    renderer.render(scene, camera);
  };
  renderer.shadowMap.needsUpdate = true;
  renderer.render(scene, camera); // builds the shadow map once, before the reflection pass

  const gl = renderer.getContext();
  const px = new Uint8Array(4);
  const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');

  Object.assign(wb, {
    room, sheet, stage: STAGE, vertices: nVert, camera,
    glRenderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown',
    // render cost per frame, measured back to back with a GPU sync (not capped by the display refresh)
    measure(n = 300, warm = 30) {
      const ts = [];
      for (let i = 0; i < warm + n; i++) {
        const t0 = performance.now(); simTime += 1 / 60; frame(1 / 60); sync();
        if (i >= warm) ts.push(performance.now() - t0);
      }
      ts.sort((a, b) => a - b);
      return { mean: ts.reduce((a, b) => a + b, 0) / ts.length, p99: ts[Math.min(ts.length - 1, Math.ceil(ts.length * 0.99) - 1)], min: ts[0], max: ts[ts.length - 1], n };
    },
    still(t = 4.0) { simTime = t; frame(0); sync(); return renderer.domElement.toDataURL('image/png'); },
  });
  wb.ready = true;

  if (!SHOT) {
    let last = performance.now();
    const loop = (now) => { const dt = Math.min(0.1, (now - last) / 1000); last = now; simTime += dt; frame(dt); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    const help = document.createElement('div');
    help.style.cssText = 'position:fixed;left:8px;bottom:8px;color:#fff;background:#0008;padding:4px 8px;font:12px sans-serif';
    help.textContent = 'click the picture to look around; W A S D to walk';
    document.body.append(help);
    addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
  }
}

boot().catch(fail);

// The 12 "small discoveries": tiny vertex-coloured models, bobbing and now and then glinting; picked by tap or E.
import * as THREE from 'three';

const PICK_RADIUS = 3;
const PICK_HEIGHT = 1.6;   // items on the other floor are out of reach
const SHOW_RADIUS = 36;
const LIGHT_DIR = new THREE.Vector3(0.4, 0.85, 0.35).normalize();

// merge primitive parts into one non-indexed geometry with baked flat shading
function mergeShadedParts(parts) {
  const pos = [], col = [];
  const n = new THREE.Vector3(), c = new THREE.Color();
  for (const { geo, color, m } of parts) {
    const g = geo.toNonIndexed();
    g.applyMatrix4(m);
    g.computeVertexNormals();
    const p = g.attributes.position, nn = g.attributes.normal;
    c.set(color);
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      n.set(nn.getX(i), nn.getY(i), nn.getZ(i));
      const s = 0.55 + 0.45 * Math.max(0, n.dot(LIGHT_DIR));
      col.push(c.r * s, c.g * s, c.b * s);
    }
    g.dispose(); geo.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}

const mat4 = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));

function itemGeometry(kind) {
  switch (kind) {
    case 'duck': return mergeShadedParts([
      { geo: new THREE.SphereGeometry(0.13, 10, 8), color: 0xffd23a, m: mat4(0, 0, 0, 0, 0, 0, 1.25, 0.85, 1) },
      { geo: new THREE.SphereGeometry(0.08, 10, 8), color: 0xffd23a, m: mat4(0.1, 0.11, 0) },
      { geo: new THREE.BoxGeometry(0.07, 0.025, 0.06), color: 0xff8a1f, m: mat4(0.19, 0.1, 0) },
    ]);
    case 'towel': return mergeShadedParts([
      { geo: new THREE.BoxGeometry(0.36, 0.07, 0.24), color: 0xf2f2ee, m: mat4(0, 0, 0) },
      { geo: new THREE.BoxGeometry(0.362, 0.072, 0.05), color: 0x3d7fd9, m: mat4(0, 0, 0.06) },
      { geo: new THREE.BoxGeometry(0.362, 0.072, 0.05), color: 0x3d7fd9, m: mat4(0, 0, -0.06) },
    ]);
    case 'goggles': return mergeShadedParts([
      { geo: new THREE.TorusGeometry(0.06, 0.018, 6, 14), color: 0x2a6fe0, m: mat4(-0.07, 0, 0) },
      { geo: new THREE.TorusGeometry(0.06, 0.018, 6, 14), color: 0x2a6fe0, m: mat4(0.07, 0, 0) },
      { geo: new THREE.CircleGeometry(0.05, 12), color: 0x9fd8ff, m: mat4(-0.07, 0, 0.005) },
      { geo: new THREE.CircleGeometry(0.05, 12), color: 0x9fd8ff, m: mat4(0.07, 0, 0.005) },
      { geo: new THREE.TorusGeometry(0.16, 0.008, 4, 20, Math.PI), color: 0x222a33, m: mat4(0, 0, -0.02, Math.PI / 2 - 0.2, 0, Math.PI) },
    ]);
    case 'key': return mergeShadedParts([
      { geo: new THREE.TorusGeometry(0.05, 0.015, 6, 14), color: 0xd9b24a, m: mat4(-0.09, 0, 0) },
      { geo: new THREE.BoxGeometry(0.15, 0.025, 0.025), color: 0xd9b24a, m: mat4(0.03, 0, 0) },
      { geo: new THREE.BoxGeometry(0.025, 0.05, 0.025), color: 0xd9b24a, m: mat4(0.09, -0.03, 0) },
      { geo: new THREE.BoxGeometry(0.08, 0.05, 0.01), color: 0xe0413a, m: mat4(-0.17, -0.02, 0, 0, 0, 0.4) },
    ]);
    case 'flipflop': return mergeShadedParts([
      { geo: new THREE.BoxGeometry(0.12, 0.025, 0.28), color: 0x37c4a0, m: mat4(0, 0, 0) },
      { geo: new THREE.TorusGeometry(0.05, 0.01, 4, 12, Math.PI), color: 0xf5f5f0, m: mat4(0, 0.012, -0.03, 0, Math.PI / 2, 0) },
    ]);
    default: return mergeShadedParts([   // kickboard
      { geo: new THREE.BoxGeometry(0.34, 0.045, 0.48), color: 0x3a8ef0, m: mat4(0, 0, 0) },
      { geo: new THREE.BoxGeometry(0.342, 0.047, 0.1), color: 0xf6f3e8, m: mat4(0, 0, 0.12) },
    ]);
  }
}

export class ItemSet {
  constructor(scene, glowTex) {
    this.scene = scene;
    this.glowTex = glowTex;
    this.mat = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.geos = {};
    this.meshes = [];
    this.ray = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
  }

  setItems(items, found) {
    for (const m of this.meshes) this.scene.remove(m);
    this.meshes = items.map((it) => {
      this.geos[it.kind] ||= itemGeometry(it.kind);
      const m = new THREE.Mesh(this.geos[it.kind], this.mat);
      m.position.set(it.x, it.h + 0.3, it.z);
      m.rotation.y = it.id * 1.3;
      m.userData.item = it;
      m.visible = !found.has(it.id);
      // the glint: a small additive spark that flashes now and then, and keeps pulsing once in reach
      const glint = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.glowTex, color: 0xfff6dc, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0,
      }));
      glint.scale.set(0.55, 0.55, 1);
      m.add(glint);
      m.userData.glint = glint;
      this.scene.add(m);
      return m;
    });
    this.found = found;
  }

  update(t, px, pz, ph) {
    for (const m of this.meshes) {
      const it = m.userData.item;
      if (this.found.has(it.id)) { m.visible = false; continue; }
      const d = Math.hypot(it.x - px, it.z - pz);
      m.visible = d < SHOW_RADIUS;
      if (!m.visible) continue;
      m.position.y = it.h + 0.3 + Math.sin(t * 2 + it.id) * 0.04;
      m.rotation.y += 0.008;
      const near = d <= PICK_RADIUS && Math.abs(it.h - ph) < PICK_HEIGHT;
      const flash = Math.max(0, Math.sin((t + it.id * 0.77) * 1.8)) ** 24;   // a brief spark every ~3.5 s
      const pulse = near ? 0.32 + 0.22 * Math.sin(t * 3.2) : 0;
      m.userData.glint.material.opacity = Math.min(0.85, flash * 0.8 + pulse);
    }
  }

  inReach(it, px, pz, ph) {
    return Math.hypot(it.x - px, it.z - pz) <= PICK_RADIUS && Math.abs(it.h - ph) < PICK_HEIGHT;
  }

  nearest(px, pz, ph) {
    let best = null, bd = PICK_RADIUS;
    for (const m of this.meshes) {
      const it = m.userData.item;
      if (this.found.has(it.id) || Math.abs(it.h - ph) >= PICK_HEIGHT) continue;
      const d = Math.hypot(it.x - px, it.z - pz);
      if (d <= bd) { bd = d; best = m; }
    }
    return best;
  }

  // screen tap → item within pick radius under the finger (generous: test against a sphere)
  pick(camera, sx, sy, px, pz, ph) {
    this.ndc.set((sx / innerWidth) * 2 - 1, -(sy / innerHeight) * 2 + 1);
    this.ray.setFromCamera(this.ndc, camera);
    const sphere = new THREE.Sphere();
    for (const m of this.meshes) {
      const it = m.userData.item;
      if (this.found.has(it.id) || !this.inReach(it, px, pz, ph)) continue;
      sphere.set(m.position, 0.45);
      if (this.ray.ray.intersectsSphere(sphere)) return m;
    }
    return null;
  }
}

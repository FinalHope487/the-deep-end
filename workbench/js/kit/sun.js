// K3: sun with shadows. Direction comes from the room's `source: sun` line, colour and strength from the light preset.
import * as THREE from 'three';

export function addSun(scene, room, preset) {
  const src = room.sources.find((s) => s.type === 'sun');
  if (!src) return null;
  const dir = new THREE.Vector3(...src.dir).normalize();
  const W = room.w * room.unit, D = room.d * room.unit;
  const center = new THREE.Vector3(W / 2, room.ceiling / 2, D / 2);
  const radius = Math.hypot(W, D, room.ceiling) / 2 + 2;
  const light = new THREE.DirectionalLight(new THREE.Color().setRGB(...preset.sunColor, THREE.SRGBColorSpace), preset.sunStrength);
  light.position.copy(center).addScaledVector(dir, -radius * 2);
  light.target.position.copy(center);
  light.castShadow = true;
  const sh = light.shadow;
  sh.mapSize.set(preset.shadowMapSize, preset.shadowMapSize);
  sh.camera.left = -radius; sh.camera.right = radius; sh.camera.top = radius; sh.camera.bottom = -radius;
  sh.camera.near = radius * 0.9; sh.camera.far = radius * 3.2;
  sh.bias = -0.00015; sh.normalBias = 0.008;
  sh.radius = preset.shadowSoftness;
  // shadow-only lid just above the wall tops: stops light creeping over the top 1-2 cm of walls
  const lid = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: THREE.DoubleSide }));
  lid.rotation.x = Math.PI / 2; lid.position.set(W / 2, room.ceiling + 0.04, D / 2);
  lid.castShadow = true; lid.renderOrder = -2;
  scene.add(light, light.target, lid);
  light.userData.lid = lid; // so that the caller can remove the lid together with the light
  return light;
}

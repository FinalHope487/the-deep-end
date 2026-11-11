// K1: tile material. World-metre UVs so the grout grid lines up across surfaces.
import * as THREE from 'three';

export function createTileMaterial(p) {
  const N = 256;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  const grout = Math.max(2, Math.round((p.groutWidth / p.tileSize) * N));
  const gc = p.groutColor.map((v) => Math.round(v * 255));
  g.fillStyle = `rgb(${gc})`;
  g.fillRect(0, 0, N, N);
  g.fillStyle = '#fff';
  g.fillRect(grout / 2, grout / 2, N - grout, N - grout);
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 8;
  map.generateMipmaps = true;
  const bump = new THREE.CanvasTexture(c);
  bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
  bump.anisotropy = 8;

  const mat = new THREE.MeshStandardMaterial({
    map, bumpMap: bump, bumpScale: p.bump, vertexColors: true,
    roughness: p.roughness, metalness: 0,
  });
  mat.shadowSide = THREE.DoubleSide;
  return mat;
}

// UV in tile units from a world position and a face normal axis (0=x,1=y,2=z)
export function tileUV(x, y, z, axis, tileSize) {
  if (axis === 1) return [x / tileSize, z / tileSize];
  if (axis === 0) return [z / tileSize, y / tileSize];
  return [x / tileSize, y / tileSize];
}

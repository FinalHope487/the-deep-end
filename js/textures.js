// Procedural canvas textures: pool tiles, water ripples, glow, silhouette.
import * as THREE from 'three';

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 1 texture repeat = 1 m = 8×8 small tiles with grout lines
export function makeTileTexture() {
  const t = canvasTex(256, 256, (g, w) => {
    const n = 8, s = w / n;
    g.fillStyle = '#c3ced3';
    g.fillRect(0, 0, w, w);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const v = 238 + ((Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1 + 1) % 1 * 14;
      g.fillStyle = `rgb(${v | 0},${(v + 3) | 0},${(v + 5) | 0})`;
      g.fillRect(x * s + 1.5, y * s + 1.5, s - 3, s - 3);
      const grad = g.createLinearGradient(x * s, y * s, x * s + s, y * s + s);
      grad.addColorStop(0, 'rgba(255,255,255,0.35)');
      grad.addColorStop(0.5, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(x * s + 1.5, y * s + 1.5, s - 3, s - 3);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// seamless caustic-like ripple pattern (periodic sines on a 2π torus)
export function makeRippleTexture() {
  const t = canvasTex(256, 256, (g, w, h) => {
    const img = g.createImageData(w, h);
    const P = Math.PI * 2;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const u = (x / w) * P, v = (y / h) * P;
      const a = Math.sin(3 * u + 2 * Math.sin(2 * v)) + Math.sin(4 * v + 2 * Math.sin(3 * u + v)) + Math.sin(2 * (u + v) + Math.sin(5 * u));
      const k = Math.max(0, 1 - Math.abs(a) * 0.9);
      const c = 150 + k * k * 105;
      const i = (y * w + x) * 4;
      img.data[i] = c * 0.85; img.data[i + 1] = c; img.data[i + 2] = c; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function makeGlowTexture() {
  return canvasTex(128, 128, (g, w) => {
    const grad = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.25, 'rgba(255,255,255,0.45)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, w);
  });
}

export function makeSilhouetteTexture() {
  return canvasTex(64, 128, (g) => {
    g.fillStyle = '#000';
    g.filter = 'blur(1.5px)';
    g.beginPath(); g.ellipse(32, 16, 9, 11, 0, 0, Math.PI * 2); g.fill();          // head
    g.beginPath();
    g.moveTo(18, 30); g.quadraticCurveTo(32, 25, 46, 30);                           // shoulders
    g.lineTo(48, 70); g.lineTo(42, 72); g.lineTo(41, 124); g.lineTo(34, 124); g.lineTo(32, 80);
    g.lineTo(30, 124); g.lineTo(23, 124); g.lineTo(22, 72); g.lineTo(16, 70);
    g.closePath(); g.fill();
  });
}

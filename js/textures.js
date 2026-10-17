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

// Sign atlas, 512×512: 16 text plates (128×64) on top, 8 pictures (128×128) below; cell order = SIGN in levels.js.
// The 8×8 corner at the bottom right stays solid white for lamps and windows.
export function makeSignAtlas() {
  const FONT = '"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif';
  const t = canvasTex(512, 512, (g) => {
    g.clearRect(0, 0, 512, 512);
    const plate = (i, bg, fg, lines, opt = {}) => {
      const x = (i % 4) * 128, y = (i >> 2) * 64;
      g.save();
      g.translate(x, y);
      if (bg) {
        g.fillStyle = bg; g.fillRect(3, 5, 122, 54);
        g.strokeStyle = fg; g.lineWidth = 2.5; g.strokeRect(6, 8, 116, 48);
      }
      g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
      if (opt.fade) g.globalAlpha = opt.fade;
      lines.forEach(([text, size, dy]) => { g.font = `600 ${size}px ${FONT}`; g.fillText(text, 64, 32 + dy); });
      g.restore();
    };
    const chalk = (draw, i, textCell = false) => {
      const x = textCell ? (i % 4) * 128 : (i % 4) * 128, y = textCell ? (i >> 2) * 64 : 256 + ((i - 16) >> 2) * 128;
      g.save(); g.translate(x, y);
      g.strokeStyle = 'rgba(70,74,80,0.85)'; g.fillStyle = 'rgba(70,74,80,0.85)'; g.lineWidth = 4; g.lineCap = 'round'; g.lineJoin = 'round';
      draw(); g.restore();
    };
    plate(0, '#f3c623', '#1d1d1d', [['小心地滑', 21, -7], ['CAUTION  WET FLOOR', 10, 15]]);
    plate(1, '#f4f6f7', '#1f5fa8', [['水深 0.4M', 22, -4], ['DEPTH', 10, 17]]);
    plate(2, '#f4f6f7', '#c42b25', [['深水區', 20, -10], ['禁止跳水', 18, 13]]);
    plate(3, '#f4f6f7', '#245a8c', [['2F 觀景池', 21, -4], ['↑ UPSTAIRS', 10, 17]]);
    plate(4, '#e9eef0', '#2b3a44', [['淋浴間', 21, -4], ['SHOWER', 10, 17]]);
    plate(5, '#f4f6f7', '#c42b25', [['請勿奔跑', 21, -4], ['NO RUNNING', 10, 17]]);
    plate(6, '#e9eef0', '#2b3a44', [['置物櫃', 21, -4], ['LOCKERS', 10, 17]]);
    plate(7, '#24705a', '#f2f2ee', [['大廳', 22, -4], ['MAIN HALL', 10, 17]]);
    plate(8, '#24705a', '#f2f2ee', [['觀景池', 22, -4], ['TERRACE POOL', 10, 17]]);
    plate(9, '#24705a', '#f2f2ee', [['機房', 22, -4], ['PLANT ROOM', 10, 17]]);
    plate(10, '#24705a', '#f2f2ee', [['深水池', 22, -4], ['DEEP POOL', 10, 17]]);
    plate(11, '#1f8a4c', '#f2f2ee', [['出口', 22, -4], ['EXIT', 11, 17]]);
    plate(12, '#e8ecec', '#1f5fa8', [['水深 9.0M', 22, -4], ['DEPTH', 10, 17]], { fade: 0.85 });
    plate(13, '#e8ecec', '#245a8c', [['3F', 22, -4], ['↑ UPSTAIRS', 10, 17]], { fade: 0.8 });
    plate(14, '#ecebe6', '#3a3a3a', [['請勿回頭', 21, -4], ['DO NOT LOOK BACK', 9, 17]], { fade: 0.75 });
    chalk(() => {   // tally marks + a line of chalk
      for (let k = 0; k < 9; k++) { g.beginPath(); g.moveTo(14 + k * 7, 10); g.lineTo(12 + k * 7, 28); g.stroke(); }
      g.beginPath(); g.moveTo(10, 24); g.lineTo(76, 14); g.stroke();
      g.font = `500 18px ${FONT}`; g.textAlign = 'left'; g.fillText('還有一層', 18, 50);
    }, 15, true);
    // pictures
    const pic = (i) => [((i - 16) % 4) * 128, 256 + ((i - 16) >> 2) * 128];
    {   // 16: guide arrow (points right)
      const [x, y] = pic(16);
      g.fillStyle = '#24705a'; g.fillRect(x + 6, y + 6, 116, 116);
      g.fillStyle = '#f2f2ee'; g.beginPath();
      g.moveTo(x + 24, y + 52); g.lineTo(x + 70, y + 52); g.lineTo(x + 70, y + 30); g.lineTo(x + 106, y + 64);
      g.lineTo(x + 70, y + 98); g.lineTo(x + 70, y + 76); g.lineTo(x + 24, y + 76); g.closePath(); g.fill();
    }
    const prohibit = (i, figure) => {
      const [x, y] = pic(i);
      g.save(); g.translate(x + 64, y + 64);
      g.fillStyle = '#f4f6f7'; g.beginPath(); g.arc(0, 0, 58, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#1d1d1d'; g.fillStyle = '#1d1d1d'; g.lineWidth = 6; g.lineCap = 'round';
      figure();
      g.strokeStyle = '#c42b25'; g.lineWidth = 10;
      g.beginPath(); g.arc(0, 0, 50, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.moveTo(-35, -35); g.lineTo(35, 35); g.stroke();
      g.restore();
    };
    prohibit(17, () => {   // no diving: figure arcing into water
      g.beginPath(); g.arc(-14, -22, 7, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.moveTo(-10, -14); g.quadraticCurveTo(10, -10, 16, 12); g.stroke();
      g.beginPath(); g.moveTo(-30, 26); g.quadraticCurveTo(-15, 18, 0, 26); g.quadraticCurveTo(15, 34, 30, 26); g.stroke();
    });
    prohibit(18, () => {   // no running
      g.beginPath(); g.arc(4, -28, 7, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.moveTo(2, -19); g.lineTo(-4, 4); g.lineTo(10, 26); g.moveTo(-4, 4); g.lineTo(-20, 22);
      g.moveTo(0, -12); g.lineTo(-16, -2); g.moveTo(0, -12); g.lineTo(16, -4); g.stroke();
    });
    prohibit(19, () => {   // ??? a head looking back over its shoulder
      g.beginPath(); g.arc(0, -16, 12, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.moveTo(-12, 30); g.lineTo(-10, 2); g.lineTo(10, 2); g.lineTo(12, 30); g.fill();
      g.lineWidth = 4; g.beginPath(); g.arc(0, -16, 22, Math.PI * 0.9, Math.PI * 1.6); g.stroke();
      g.beginPath(); g.moveTo(-22, -30); g.lineTo(-24, -20); g.lineTo(-14, -22); g.stroke();
    });
    chalk(() => { g.beginPath(); g.arc(64, 64, 40, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(50, 54, 4, 0, Math.PI * 2); g.arc(78, 54, 4, 0, Math.PI * 2); g.fill(); g.beginPath(); g.arc(64, 66, 22, 0.2, Math.PI - 0.2); g.stroke(); }, 20);
    chalk(() => {   // duck
      g.beginPath(); g.ellipse(60, 78, 34, 20, 0, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.arc(82, 46, 15, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.moveTo(96, 46); g.lineTo(112, 50); g.lineTo(96, 54); g.stroke();
      g.beginPath(); g.arc(86, 42, 2.5, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.moveTo(14, 104); g.quadraticCurveTo(40, 96, 64, 104); g.quadraticCurveTo(88, 112, 114, 104); g.stroke();
    }, 21);
    chalk(() => {   // three stick figures holding hands
      for (const [cx, s] of [[30, 1], [64, 0.8], [98, 1]]) {
        g.beginPath(); g.arc(cx, 40, 9 * s, 0, Math.PI * 2); g.stroke();
        g.beginPath(); g.moveTo(cx, 50); g.lineTo(cx, 82); g.lineTo(cx - 10, 108); g.moveTo(cx, 82); g.lineTo(cx + 10, 108); g.stroke();
      }
      g.beginPath(); g.moveTo(12, 66); g.lineTo(116, 66); g.stroke();
    }, 22);
    {   // 23: damp handprints
      const [x, y] = pic(23);
      g.save(); g.translate(x, y);
      g.fillStyle = 'rgba(90,110,120,0.75)';
      for (const [hx, hy, rot] of [[44, 70, -0.25], [86, 52, 0.2]]) {
        g.save(); g.translate(hx, hy); g.rotate(rot);
        g.beginPath(); g.ellipse(0, 10, 15, 19, 0, 0, Math.PI * 2); g.fill();
        for (const [fx, fy, l] of [[-13, -10, 14], [-5, -16, 18], [4, -17, 19], [12, -12, 15]]) { g.beginPath(); g.ellipse(fx, fy - l / 2, 3.6, l / 2 + 2, 0, 0, Math.PI * 2); g.fill(); }
        g.beginPath(); g.ellipse(17, 10, 4, 10, -0.7, 0, Math.PI * 2); g.fill();
        g.restore();
      }
      g.fillRect(40, 92, 4, 22); g.fillRect(84, 74, 3, 30);   // drips
      g.restore();
    }
    g.fillStyle = '#ffffff'; g.fillRect(504, 504, 8, 8);
  });
  t.generateMipmaps = false;
  t.minFilter = THREE.LinearFilter;
  return t;
}

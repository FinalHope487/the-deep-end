// W-09: on-screen frame time. Call tick(now) once per animation frame. Shows when the URL has ?stats=1 or after setVisible(true) (panel switch).
// Measures the interval between two animation frames (what the player feels), over the last 300 frames, redrawn once per second.
export function createStats() {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;left:6px;top:6px;padding:4px 8px;background:#000a;color:#fff;font:bold 22px/28px monospace;white-space:pre;pointer-events:none;z-index:8';
  el.textContent = 'frame stats...';
  const ts = []; let prev = 0, shown = 0, on = false;
  const setVisible = (v) => { on = v; if (v) { document.body.append(el); shown = 0; } else el.remove(); };
  if (new URLSearchParams(location.search).has('stats')) setVisible(true);
  return {
    setVisible,
    get visible() { return on; },
    tick(now) {
      if (!on) return;
      if (prev) { ts.push(now - prev); if (ts.length > 300) ts.shift(); }
      prev = now;
      if (now - shown < 1000 || ts.length < 10) return;
      shown = now;
      const s = [...ts].sort((a, b) => a - b);
      const mean = s.reduce((a, b) => a + b, 0) / s.length;
      const p99 = s[Math.min(s.length - 1, Math.ceil(s.length * 0.99) - 1)];
      el.textContent = `mean ${mean.toFixed(1)} ms\np99  ${p99.toFixed(1)} ms\n${(1000 / mean).toFixed(0)} fps  n=${s.length}`;
    },
  };
}

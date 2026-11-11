// Parameter panel (shown with ?panel=1). Built only from the tables in params.js: no code for a key, a preset id or a room id.
// The panel edits the live preset objects (`look[kind]`) and asks the viewer to apply them through ONE path: hooks.apply(Set of kinds).
// Plain HTML inputs, no library. A drawer: one button opens and closes it; while it is open, walking and looking are off (hooks.setActive).
import { PARAMS, DIAGNOSTICS } from './params.js';

const hex = (c) => '#' + c.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('');
const unhex = (h) => [1, 3, 5].map((i) => Math.round(parseInt(h.slice(i, i + 2), 16) / 255 * 1000) / 1000);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const clone = (o) => JSON.parse(JSON.stringify(o));
const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };
const replaceIn = (target, src) => { for (const k of Object.keys(target)) delete target[k]; Object.assign(target, clone(src)); };

const CSS = `
#wbp-open{position:fixed;top:6px;right:6px;z-index:10;width:44px;height:44px;border-radius:8px;border:1px solid #fff6;background:#000b;color:#fff;font:22px sans-serif}
#wbp{position:fixed;top:0;right:0;bottom:0;width:min(380px,94vw);z-index:9;background:#111e;color:#eee;font:13px/1.3 sans-serif;overflow-y:auto;padding:8px 10px 60px;box-sizing:border-box;display:none;touch-action:pan-y;-webkit-overflow-scrolling:touch}
#wbp.open{display:block}
#wbp *{box-sizing:border-box}
#wbp details{margin:6px 0;border:1px solid #fff3;border-radius:6px;padding:4px 8px}
#wbp summary{font-weight:bold;padding:6px 0;cursor:pointer;text-transform:capitalize}
#wbp h4{margin:8px 0 2px;font-size:12px;color:#9cf;text-transform:uppercase;letter-spacing:.05em}
#wbp .row{display:grid;grid-template-columns:1fr 1.4fr auto;gap:6px;align-items:center;min-height:32px}
#wbp .row.changed .lab{color:#fc6;font-weight:bold}
#wbp .row.adv{display:none}
#wbp.adv .row.adv{display:grid}
#wbp input[type=range]{width:100%;min-width:0;height:28px}
#wbp input[type=color]{width:100%;height:28px;padding:0;border:0;background:none}
#wbp select,#wbp button{font:13px sans-serif;min-height:32px;max-width:100%}
#wbp .val{font:11px monospace;color:#bbb;margin-left:4px}
#wbp .bar{display:flex;flex-wrap:wrap;gap:4px;margin:4px 0}
#wbp .rst{width:32px;visibility:hidden}
#wbp .row.changed .rst{visibility:visible}
#wbp .msg{color:#f88;white-space:pre-wrap}
#wbp .top{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:4px}
`;

// hooks: { look, ids, apply(kinds) -> ms, loadPreset(kind, id) -> preset, listPresets() -> {kind: [id]}, diag: {key: value}, onDiag(key, value), setActive(on) }
export function createPanel(hooks) {
  const { look } = hooks;
  document.head.append(el('style', { textContent: CSS }));
  const root = el('div', { id: 'wbp' });
  const openBtn = el('button', { id: 'wbp-open', textContent: '☰', title: 'parameters (P)' });
  document.body.append(root, openBtn);

  const loaded = {};            // kind -> copy of the preset as loaded (reset target)
  const ids = { ...hooks.ids }; // kind -> id of the loaded preset
  const rows = {};              // kind -> key -> { row, set(value), entry }
  const cost = {};              // kind -> ms of the last apply
  const timers = {};
  const seq = {};               // kind -> number of the latest preset choice
  let slotA = null, status;

  const refreshRow = (kind, e) => {
    const r = rows[kind][e.key], v = look[kind][e.key];
    r.set(v); r.row.classList.toggle('changed', !same(v, loaded[kind][e.key]));
  };
  const refreshKind = (kind) => PARAMS[kind].forEach((e) => refreshRow(kind, e));
  const say = (m) => { status.textContent = m || ''; };

  // one apply per kind; a kind that took more than 100 ms last time waits until the input has been quiet for 250 ms
  function schedule(kind) {
    clearTimeout(timers[kind]);
    const run = () => { try { cost[kind] = hooks.apply(new Set([kind])); say(''); } catch (err) { say(String(err.message || err)); } };
    if ((cost[kind] || 0) > 100) timers[kind] = setTimeout(run, 250); else run();
  }
  function setValue(kind, e, v) { look[kind][e.key] = v; refreshRow(kind, e); schedule(kind); }

  function widget(kind, e, get, put) {
    if (e.kind === 'range') {
      const out = el('span', { className: 'val' });
      const inp = el('input', { type: 'range', min: e.min, max: e.max, step: e.step });
      inp.addEventListener('input', () => put(Number(inp.value)));
      return { node: el('span', {}, inp, out), set: (v) => { inp.value = v; out.textContent = Number(v).toFixed(String(e.step).split('.')[1]?.length || 0); } };
    }
    if (e.kind === 'colour') {
      const inp = el('input', { type: 'color' });
      inp.addEventListener('input', () => put(unhex(inp.value)));
      return { node: inp, set: (v) => { inp.value = hex(v); } };
    }
    if (e.kind === 'select') {
      const inp = el('select', {}, ...e.options.map((o, i) => el('option', { value: String(i), textContent: String(o) })));
      inp.addEventListener('input', () => put(e.options[Number(inp.value)]));
      return { node: inp, set: (v) => { inp.value = String(e.options.indexOf(v)); } };
    }
    const inp = el('input', { type: 'checkbox' });
    inp.addEventListener('input', () => put(inp.checked));
    return { node: inp, set: (v) => { inp.checked = !!v; } };
  }

  function entryRow(entry, get, put, reset) {
    const w = widget(null, entry, get, put);
    const rst = el('button', { className: 'rst', textContent: '↺', title: 'reset to the loaded value' });
    rst.addEventListener('click', reset);
    const row = el('div', { className: 'row' + (entry.level === 'advanced' ? ' adv' : '') }, el('span', { className: 'lab', textContent: entry.label }), w.node, rst);
    return { row, set: w.set };
  }

  function groupsOf(table) { const g = new Map(); for (const e of table) { if (!g.has(e.group)) g.set(e.group, []); g.get(e.group).push(e); } return g; }

  function exportBar(kind) {
    const text = () => JSON.stringify(look[kind], null, 1);
    const name = () => `${ids[kind]}-edit.json`;
    const copy = el('button', { textContent: 'copy JSON' });
    copy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(text()); say(`${kind}: copied`); } catch {
        const ta = el('textarea', { value: text() }); document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove(); say(`${kind}: copied`);
      }
    });
    const dl = el('button', { textContent: 'download JSON' });
    dl.addEventListener('click', () => {
      const a = el('a', { href: URL.createObjectURL(new Blob([text()], { type: 'application/json' })), download: name() });
      document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      say(`${kind}: saved as ${name()}; put it in workbench/looks/${kind}/`);
    });
    return [copy, dl];
  }

  function kindBlock(kind, presetIds) {
    const d = el('details', {});
    d.append(el('summary', { textContent: kind }));
    const sel = el('select', {}, ...presetIds.map((id) => el('option', { value: id, textContent: id })));
    sel.value = ids[kind];
    sel.addEventListener('change', async () => {
      const want = sel.value, mine = (seq[kind] = (seq[kind] || 0) + 1); // only the latest choice may change the state
      const keep = { look: clone(look[kind]), loaded: loaded[kind], id: ids[kind] };
      try {
        const p = await hooks.loadPreset(kind, want);
        if (mine !== seq[kind]) return;
        clearTimeout(timers[kind]);
        ids[kind] = want; loaded[kind] = clone(p); replaceIn(look[kind], p);
        hooks.apply(new Set([kind])); refreshKind(kind); say('');
      } catch (err) {
        if (mine !== seq[kind]) return;
        // a bad file or a preset that does not fit the room: put the old values back
        ids[kind] = keep.id; loaded[kind] = keep.loaded; replaceIn(look[kind], keep.look);
        try { hooks.apply(new Set([kind])); } catch { /* the old values were applied before */ }
        sel.value = keep.id; refreshKind(kind); say(String(err.message || err));
      }
    });
    const resetAll = el('button', { textContent: 'reset all' });
    resetAll.addEventListener('click', () => { replaceIn(look[kind], loaded[kind]); refreshKind(kind); schedule(kind); });
    d.append(el('div', { className: 'bar' }, sel, resetAll, ...exportBar(kind)));
    rows[kind] = {};
    for (const [group, entries] of groupsOf(PARAMS[kind])) {
      d.append(el('h4', { textContent: group }));
      for (const e of entries) {
        const r = entryRow(e, null, (v) => setValue(kind, e, v), () => setValue(kind, e, clone(loaded[kind][e.key])));
        rows[kind][e.key] = { ...r, entry: e };
        d.append(r.row);
      }
    }
    return d;
  }

  function diagBlock() {
    const d = el('details', {});
    d.append(el('summary', { textContent: 'diagnostics' }));
    for (const e of DIAGNOSTICS) {
      const r = entryRow(e, null, (v) => { hooks.diag[e.key] = v; hooks.onDiag(e.key, v); }, () => {});
      r.set(hooks.diag[e.key] ?? e.default);
      d.append(r.row);
    }
    return d;
  }

  // A/B: "keep as A" stores the four presets; holding "hold: A" shows A, releasing shows the current set again
  function abBar() {
    const keep = el('button', { textContent: 'keep as A' });
    const hold = el('button', { textContent: 'hold: show A', disabled: true });
    hold.style.touchAction = 'none';
    let current = null;
    const swap = (from, kinds) => { for (const k of kinds) replaceIn(look[k], from[k]); hooks.apply(new Set(kinds)); };
    keep.addEventListener('click', () => { slotA = clone(look); hold.disabled = false; say('A kept'); });
    const down = (ev) => {
      if (!slotA || current) return;
      ev.preventDefault(); hold.setPointerCapture?.(ev.pointerId);
      current = clone(look);
      swap(slotA, Object.keys(PARAMS).filter((k) => !same(look[k], slotA[k])));
    };
    const up = () => {
      if (!current) return;
      const back = current; current = null;
      swap(back, Object.keys(PARAMS).filter((k) => !same(look[k], back[k])));
    };
    for (const t of ['pointerup', 'pointercancel']) hold.addEventListener(t, up);
    hold.addEventListener('pointerdown', down);
    hold.addEventListener('contextmenu', (ev) => ev.preventDefault());
    return el('div', { className: 'bar' }, keep, hold);
  }

  async function init() {
    const index = await hooks.listPresets();
    status = el('div', { className: 'msg' });
    const adv = el('input', { type: 'checkbox' });
    adv.addEventListener('input', () => root.classList.toggle('adv', adv.checked));
    root.append(el('div', { className: 'top' }, el('label', {}, adv, ' advanced'), el('span', { textContent: '(P: open / close)' })), abBar(), status);
    for (const kind of Object.keys(PARAMS)) {
      loaded[kind] = clone(look[kind]);
      root.append(kindBlock(kind, index[kind] || [ids[kind]]));
      refreshKind(kind);
    }
    root.append(diagBlock());
  }

  function toggle(on) {
    const open = on ?? !root.classList.contains('open');
    root.classList.toggle('open', open);
    if (open) document.exitPointerLock?.();
    hooks.setActive(!open);
  }
  openBtn.addEventListener('click', () => toggle());
  addEventListener('keydown', (ev) => { if (ev.code === 'KeyP' && !/INPUT|SELECT|TEXTAREA/.test(ev.target.tagName)) toggle(); });
  return init().then(() => ({ toggle, root }));
}

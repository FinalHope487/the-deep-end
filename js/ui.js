// DOM overlays: title, HUD, pause menu, end screen, toasts, joystick.
const $ = (id) => document.getElementById(id);

function fmtTime(sec) {
  const s = Math.floor(sec), m = Math.floor(s / 60);
  return `${m} 分 ${String(s % 60).padStart(2, '0')} 秒`;
}

export class UI {
  constructor(handlers) {
    this.h = handlers;
    this.el = {};
    for (const id of ['title', 'hud', 'menu', 'end', 'fade', 'btn-start', 'btn-continue', 'btn-settings', 'btn-pause',
      'btn-resume', 'btn-title', 'btn-again', 'btn-jump', 'btn-jump-title', 'btn-jump-back', 'jump', 'jump-list', 'jump-flag', 'toast-zone', 'toast-item', 'fps', 'joy', 'joy-knob', 'hint',
      'opt-volume', 'opt-quality', 'opt-fps', 'opt-bgm', 'menu-stats', 'menu-title', 'st-explore', 'st-dist', 'st-time', 'st-zones',
      'st-items', 'end-explore', 'end-dist', 'end-time', 'end-items', 'quality-now']) this.el[id] = $(id);
    const e = this.el;
    e['btn-start'].onclick = () => this.h.onStart();
    e['btn-continue'].onclick = () => this.h.onContinue();
    e['btn-settings'].onclick = () => this.showMenu(false);
    e['btn-pause'].onclick = () => this.h.onPause();
    e['btn-resume'].onclick = () => this.h.onResume();
    e['btn-title'].onclick = () => this.h.onToTitle();
    e['btn-again'].onclick = () => this.h.onAgain();
    e['btn-jump'].onclick = () => this.showJump();
    e['btn-jump-title'].onclick = () => this.showJump();
    e['btn-jump-back'].onclick = () => { e.jump.hidden = true; };
    e['opt-volume'].oninput = () => this.h.onSettings({ volume: +e['opt-volume'].value / 100 });
    e['opt-quality'].onchange = () => this.h.onSettings({ quality: e['opt-quality'].value });
    e['opt-fps'].onchange = () => this.h.onSettings({ showFps: e['opt-fps'].checked });
    e['opt-bgm'].onchange = () => this.h.onSettings({ bgm: e['opt-bgm'].checked });
    this.toastTimers = {};
  }

  // one button per jump target; picking one hands its id to onJump
  buildJumpList(targets) {
    const list = this.el['jump-list'];
    list.replaceChildren();
    for (const t of targets) {
      const b = document.createElement('button');
      b.className = 'btn';
      b.textContent = t.label;
      b.dataset.jump = t.id;
      b.onclick = () => this.h.onJump(t.id);
      list.append(b);
    }
  }

  showJump() { this.el.jump.hidden = false; }
  setJumped(on) { this.el['jump-flag'].hidden = !on; }

  setHint(isTouch) {
    this.el.hint.textContent = isTouch
      ? '左半邊按住拖曳移動（推到底跑步）・右半邊拖曳轉視角・點閃光的物品拾取'
      : 'WASD 移動・Shift 跑步・點畫面後用滑鼠轉視角・E 或點擊閃光的物品拾取・Esc 暫停';
  }

  applySettings(s) {
    this.el['opt-volume'].value = Math.round(s.volume * 100);
    this.el['opt-quality'].value = s.quality;
    this.el['opt-fps'].checked = s.showFps;
    this.el['opt-bgm'].checked = s.bgm;
    this.el.fps.hidden = !s.showFps;
  }

  showTitle(hasSave) {
    this.el.title.hidden = false;
    this.el.hud.hidden = true;
    this.el.menu.hidden = true;
    this.el.jump.hidden = true;
    this.el.end.hidden = true;
    this.el.fade.className = '';
    this.el['btn-continue'].hidden = !hasSave;
  }

  enableStart() {
    this.el['btn-start'].disabled = false;
    this.el['btn-start'].textContent = '開始';
  }

  showPlaying() {
    this.el.fade.className = '';
    this.el.title.hidden = true;
    this.el.menu.hidden = true;
    this.el.jump.hidden = true;
    this.el.end.hidden = true;
    this.el.hud.hidden = false;
  }

  // inGame: show progress stats + resume; from title: settings only
  showMenu(inGame, stats) {
    this.el.menu.hidden = false;
    this.el['menu-stats'].hidden = !inGame;
    this.el['btn-resume'].textContent = inGame ? '繼續探索' : '返回';
    this.el['btn-title'].hidden = !inGame;
    this.el['btn-jump'].hidden = !inGame;
    this.el['menu-title'].textContent = inGame ? '暫停' : '設定';
    this.menuInGame = inGame;
    if (stats) this.updateStats(stats);
  }

  hideMenu() { this.el.menu.hidden = true; }

  updateStats(s) {
    const e = this.el;
    e['st-explore'].textContent = Math.round(s.explore) + '%';
    e['st-dist'].textContent = Math.round(s.distance) + ' m';
    e['st-time'].textContent = fmtTime(s.elapsed);
    e['st-zones'].textContent = s.zones.length ? s.zones.join('、') : '尚未到達任何區域';
    e['st-items'].textContent = `${s.found} / 12`;
  }

  setQualityLabel(text) { this.el['quality-now'].textContent = text; }

  toast(which, text) {
    const el = this.el[which === 'zone' ? 'toast-zone' : 'toast-item'];
    el.textContent = text;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(this.toastTimers[which]);
    this.toastTimers[which] = setTimeout(() => el.classList.remove('show'), 2000);
  }

  setJoy(j) {
    const el = this.el.joy;
    if (!j) { el.hidden = true; return; }
    el.hidden = false;
    el.style.transform = `translate(${j.ox}px, ${j.oy}px)`;
    this.el['joy-knob'].style.transform = `translate(${j.x * 40}px, ${j.y * 40}px)`;
  }

  setFps(text) { this.el.fps.textContent = text; }

  startEnding() {
    this.el.hud.hidden = true;
    this.el.fade.className = 'white';
  }

  showEnd(s) {
    const e = this.el;
    e['end-explore'].textContent = Math.round(s.explore) + '%';
    e['end-dist'].textContent = Math.round(s.distance) + ' m';
    e['end-time'].textContent = fmtTime(s.elapsed);
    e['end-items'].textContent = `${s.found} / 12`;
    e.end.hidden = false;
  }
}

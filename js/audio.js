// ===== 効果音・BGM =====
// ▼ 音声ファイルの置き場所
//    効果音 … audio/se/   BGM … audio/bgm/
//    下の AUDIO_FILES にファイル名を書いてあります。同じ名前でファイルを置くだけで差し替わります
//    （拡張子を変えたい場合はここのファイル名を書き換えてください）。
//    ファイルが無い場合は、内蔵の簡易な音（効果音・BGMとも自動生成）が鳴ります。
const AUDIO_FILES = {
  se: {
    click: 'click.mp3',       // ボタンを押したとき
    roll: 'roll.mp3',         // サイコロを振る
    step: 'step.mp3',         // 駒が1マス進む
    land: 'land.mp3',         // マスに止まった（イベント開始）
    plus: 'plus.mp3',         // お金が増えた
    minus: 'minus.mp3',       // お金が減った
    love: 'love.mp3',         // お砂糖ができた
    break: 'break.mp3',       // 破局・略奪された
    item: 'item.mp3',         // アイテムを手に入れた
    warp: 'warp.mp3',         // ワープ
    duel: 'duel.mp3',         // 対戦開始
    win: 'win.mp3',           // 対戦に勝った
    global: 'global.mp3',     // 全体イベント発生
    turn: 'turn.mp3',         // 自分の番になった（オンライン）
    quiz_ok: 'quiz_ok.mp3',   // クイズ正解
    quiz_ng: 'quiz_ng.mp3',   // クイズ不正解
    goal: 'goal.mp3',         // ゴール／ゴールステージ突入
    result: 'result.mp3'      // 結果発表
  },
  bgm: {
    main: 'main.mp3',         // メインステージ
    goal: 'goal.mp3',         // ゴールステージ
    battle: 'battle.mp3',     // 対戦中
    result: 'result.mp3'      // 結果画面
  }
};
const AS = { seOn: true, bgmOn: true, seVol: 0.6, bgmVol: 0.35 };
try { Object.assign(AS, JSON.parse(localStorage.getItem('vrcAudio') || '{}')); } catch (e) {}
const saveAS = () => { try { localStorage.setItem('vrcAudio', JSON.stringify(AS)); } catch (e) {} };

const AC = { ctx: null, se: null, bgm: null };
let bgmOverride = null, bgmCur = '', bgmEl = null, synthTimer = null, lastTurn = -1;
const missing = {};

function audioUnlock() {
  try {
    if (!AC.ctx) {
      const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
      AC.ctx = new C(); AC.se = AC.ctx.createGain(); AC.bgm = AC.ctx.createGain(); AC.se.connect(AC.ctx.destination); AC.bgm.connect(AC.ctx.destination); applyVol();
    }
    if (AC.ctx.state === 'suspended') AC.ctx.resume();
    if (typeof G !== 'undefined' && G) { bgmCur = ''; updateBgm(); }
  } catch (e) {}
}
function applyVol() { if (AC.se) { AC.se.gain.value = AS.seOn ? AS.seVol : 0; AC.bgm.gain.value = AS.bgmOn ? AS.bgmVol : 0; } if (bgmEl) bgmEl.volume = AS.bgmOn ? Math.min(1, AS.bgmVol * 1.6) : 0; }

// 内蔵の簡易音（ファイルが無いとき）
function tone(f, t0, d, type, vol, f2) {
  const c = AC.ctx, o = c.createOscillator(), g = c.createGain();
  o.type = type || 'sine'; o.frequency.setValueAtTime(f, t0); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + d);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol || 0.2, t0 + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
  o.connect(g); g.connect(AC.se); o.start(t0); o.stop(t0 + d + 0.05);
}
const SYN = {
  click: t => tone(900, t, 0.05, 'square', 0.08),
  roll: t => { for (let i = 0; i < 7; i++) tone(300 + Math.random() * 400, t + i * 0.08, 0.06, 'square', 0.07); },
  step: t => tone(520, t, 0.06, 'triangle', 0.12),
  land: t => { tone(660, t, 0.12, 'triangle', 0.18); tone(880, t + 0.1, 0.18, 'triangle', 0.18); },
  plus: t => [523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.07, 0.16, 'triangle', 0.18)),
  minus: t => { tone(392, t, 0.18, 'sawtooth', 0.1); tone(294, t + 0.14, 0.28, 'sawtooth', 0.1); },
  love: t => { tone(784, t, 0.25, 'sine', 0.2); tone(988, t + 0.15, 0.4, 'sine', 0.2); tone(1319, t + 0.3, 0.5, 'sine', 0.12); },
  break: t => { tone(330, t, 0.15, 'sawtooth', 0.12, 120); tone(196, t + 0.15, 0.5, 'sine', 0.2, 98); },
  item: t => [880, 1175, 1568].forEach((f, i) => tone(f, t + i * 0.06, 0.2, 'sine', 0.15)),
  warp: t => tone(250, t, 0.55, 'sine', 0.2, 1400),
  duel: t => { tone(180, t, 0.12, 'sawtooth', 0.16, 90); tone(480, t + 0.1, 0.2, 'square', 0.1, 240); tone(180, t + 0.3, 0.12, 'sawtooth', 0.16, 90); },
  win: t => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, t + i * 0.09, 0.22, 'triangle', 0.2)),
  global: t => { for (let i = 0; i < 3; i++) tone(700, t + i * 0.22, 0.14, 'square', 0.1); tone(1050, t + 0.7, 0.4, 'triangle', 0.15); },
  turn: t => { tone(740, t, 0.12, 'sine', 0.2); tone(988, t + 0.12, 0.25, 'sine', 0.2); },
  quiz_ok: t => { tone(784, t, 0.12, 'triangle', 0.2); tone(1047, t + 0.12, 0.3, 'triangle', 0.2); },
  quiz_ng: t => tone(200, t, 0.35, 'sawtooth', 0.14, 140),
  goal: t => [523, 659, 784, 659, 784, 1047, 1319].forEach((f, i) => tone(f, t + i * 0.11, 0.3, 'triangle', 0.2)),
  result: t => [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.16, 0.5, 'triangle', 0.2))
};
// 効果音：自分の端末だけで鳴らす（_sfx）／ホストが全員に鳴らす（sfx）
function _sfx(name) {
  if (!AS.seOn || !AC.ctx) return;
  try {
    const file = AUDIO_FILES.se[name];
    if (file && !missing['se:' + name]) {
      const a = new Audio('audio/se/' + file); a.volume = Math.min(1, AS.seVol * 1.3);
      a.onerror = () => { missing['se:' + name] = true; };
      const pr = a.play(); if (pr && pr.catch) pr.catch(() => { missing['se:' + name] = true; if (SYN[name]) SYN[name](AC.ctx.currentTime + 0.01); });
      return;
    }
    if (SYN[name]) SYN[name](AC.ctx.currentTime + 0.01);
  } catch (e) {}
}
function sfx(name) { _sfx(name); if (typeof Net !== 'undefined') Net.bc({ k: 'sfx', v: name }); }

// BGM：ファイルがあればそれを、無ければ内蔵の簡易BGMを流す
const SYB = {
  main: { bpm: 92, root: 261.63, scale: [0, 2, 4, 7, 9], wave: 'triangle', vol: 0.09 },
  goal: { bpm: 118, root: 293.66, scale: [0, 2, 4, 7, 9], wave: 'triangle', vol: 0.1 },
  battle: { bpm: 128, root: 220, scale: [0, 3, 5, 7, 10], wave: 'square', vol: 0.045 },
  result: { bpm: 70, root: 261.63, scale: [0, 4, 7, 11, 14], wave: 'sine', vol: 0.12 }
};
function stopBgm() {
  clearInterval(synthTimer); synthTimer = null;
  if (bgmEl) { try { bgmEl.pause(); } catch (e) {} bgmEl = null; }
}
function synthBgm(name) {
  const c = SYB[name] || SYB.main; let step = 0;
  synthTimer = setInterval(() => {
    if (!AC.ctx || AC.ctx.state !== 'running' || !AS.bgmOn) return;
    const t = AC.ctx.currentTime + 0.05, beat = 60 / c.bpm / 2, old = AC.se;
    AC.se = AC.bgm; // BGMは専用の音量ノードへ
    if (step % 8 === 0) tone(c.root / 2, t, beat * 6, 'sine', c.vol * 1.6);
    if (step % 4 === 0 || Math.random() < 0.55) { const n = c.scale[rnd(0, c.scale.length - 1)] + (Math.random() < 0.3 ? 12 : 0); tone(c.root * Math.pow(2, n / 12), t, beat * 1.8, c.wave, c.vol); }
    AC.se = old; step++;
  }, 60 / c.bpm / 2 * 1000);
}
function updateBgm() {
  if (typeof G === 'undefined' || !G || !AC.ctx) return;
  const want = bgmOverride || (G.over ? 'result' : G.stage === 'goal' ? 'goal' : 'main');
  if (want === bgmCur) { applyVol(); return; }
  bgmCur = want; stopBgm();
  const file = AUDIO_FILES.bgm[want];
  if (file && !missing['bgm:' + want]) {
    const a = new Audio('audio/bgm/' + file); a.loop = true; bgmEl = a; applyVol();
    a.onerror = () => { missing['bgm:' + want] = true; if (bgmEl === a) { bgmEl = null; if (bgmCur === want && !synthTimer) synthBgm(want); } };
    const pr = a.play(); if (pr && pr.catch) pr.catch(() => {});
  } else synthBgm(want);
}
// 毎回の画面更新で呼ぶ（BGMの切り替えと、自分の番のお知らせ音）
function audioTick() {
  if (typeof G === 'undefined' || !G) return;
  updateBgm();
  if (G.t !== lastTurn) { if (Net.on && Net.seat === G.t && !G.over) _sfx('turn'); lastTurn = G.t; }
}

// 操作パネル
(function () {
  const $$ = s => document.querySelector(s); if (!$$('#audioctl')) return;
  const sync = () => { $$('#seBtn').textContent = AS.seOn ? '🔊' : '🔇'; $$('#bgmBtn').textContent = AS.bgmOn ? '🎵' : '🎵✕'; $$('#seVol').value = AS.seVol * 100; $$('#bgmVol').value = AS.bgmVol * 100; applyVol(); saveAS(); };
  $$('#seBtn').onclick = () => { AS.seOn = !AS.seOn; sync(); if (AS.seOn) _sfx('click'); };
  $$('#bgmBtn').onclick = () => { AS.bgmOn = !AS.bgmOn; sync(); };
  $$('#seVol').oninput = e => { AS.seVol = e.target.value / 100; sync(); };
  $$('#seVol').onchange = () => _sfx('click');
  $$('#bgmVol').oninput = e => { AS.bgmVol = e.target.value / 100; sync(); };
  sync();
  ['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, audioUnlock));
  document.addEventListener('click', e => { if (e.target.closest && e.target.closest('button')) _sfx('click'); });
})();
window.VER_AUDIO = '2026.10.25-t3';

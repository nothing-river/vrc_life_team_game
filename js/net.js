// ===== オンライン対戦（PeerJSによるP2P通信。サーバー不要）=====
// ホストの端末がゲームを進行し、ゲストには画面の更新内容を送る。ゲストは「サイコロを振る」などの操作だけ送る。
// チーム戦版：参加者は最大20人、観戦者は最大6人。観戦者は操作できず、ゲーム中でも入室できる。
const Net = {
  on: false, host: false, seat: 0, spec: false, peer: null, conn: null, conns: [], specs: [], lobby: [], started: false, over: false, startMsg: null, _st: null,
  all() { return this.conns.concat(this.specs); },
  bc(m) { if (this.host) this.all().forEach(c => c.open && c.send(m)); },
  snap() { // ゲーム状態（写真は開始時に1回だけ送るので除く）
    return { t: G.t, round: G.round, goalRound: G.goalRound, turns: G.turns, stage: G.stage, order: G.order, quiz: G.quiz, hid: G.hid, fog: G.fog, ask: G.ask || null, global: G.global, rules: G.rules, busy: G.busy, over: G.over, ps: G.ps.map(p => ({ ...p, img: undefined })) };
  },
  sync() { // 人数が多いので、短い間の更新はまとめて1回で送る
    if (!this.host || !this.started || !G || this._st) return;
    this._st = setTimeout(() => { this._st = null; this.flush(); }, 70);
  },
  flush() { clearTimeout(this._st); this._st = null; if (!this.host || !this.started || !G) return; this.bc({ k: 'state', s: this.snap() }); }
};
let IMGS = [];

// 合言葉 → 部屋ID（日本語もOK。ハッシュ化してPeerJSのIDにする）
async function roomId(phrase) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('vrc-life:' + phrase));
  return 'vrclife-' + [...new Uint8Array(b)].slice(0, 10).map(x => x.toString(16).padStart(2, '0')).join('');
}
// 受信したプロフィールの検証（名前は8文字まで、写真はJPEGのdata URLのみ）
const cleanQs = a => (Array.isArray(a) ? a : []).slice(0, QMAX).map(q => {
  if (!q || typeof q.text !== 'string') return null; const text = q.text.trim().slice(0, 60); if (!text) return null;
  if (q.t === 'num') return typeof q.ans === 'number' && isFinite(q.ans) && Math.abs(q.ans) <= 1e9 ? { t: 'num', text, ans: q.ans } : null;
  if (q.t !== 'mc' || !Array.isArray(q.choices)) return null;
  const choices = q.choices.slice(0, 4).map(c => String(c).trim().slice(0, 24)); if (choices.length < 2 || choices.some(c => !c)) return null;
  return Number.isInteger(q.ans) && q.ans >= 0 && q.ans < choices.length ? { t: 'mc', text, choices, ans: q.ans } : null;
}).filter(Boolean);
const cleanProfile = (m, def) => ({
  qs: m.qs === undefined ? undefined : cleanQs(m.qs),
  name: String(m.name || def).slice(0, 8) || def,
  color: typeof m.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(m.color) ? m.color.toLowerCase() : null,
  img: typeof m.img === 'string' && m.img.length < 80000 && /^data:image\/jpeg;base64,[A-Za-z0-9+\/=]+$/.test(m.img) ? m.img : null
});
const specNames = () => Net.specs.map(s => s.prof.name);
const smallerTeam = () => { const c = [0, 0]; Net.lobby.forEach(p => c[p.team || 0]++); return c[1] < c[0] ? 1 : 0; };
const pushLobby = () => Net.bc({ k: 'lobby', list: Net.lobby.map(p => ({ name: p.name, img: p.img, color: p.color, team: p.team || 0, qn: (p.qs || []).length })), specs: specNames() }); // 問題の中身（正解）は送らない
const catchUp = c => { if (Net.startMsg) c.send(Net.startMsg); c.send({ k: 'state', s: Net.snap() }); }; // 観戦者が途中から入ったとき

function hostRoom(phrase, me, ui) {
  roomId(phrase).then(id => {
    const peer = new Peer(id), host = cleanProfile(me, 'ホスト'); host.team = 0;
    Object.assign(Net, { peer, on: true, host: true, seat: 0, spec: false, lobby: [host], conns: [], specs: [], started: false, startMsg: null });
    peer.on('open', () => ui.update(Net.lobby, specNames()));
    peer.on('error', e => ui.error(e.type === 'unavailable-id' ? 'その合言葉は使われています。別の合言葉にしてください' : '接続エラー: ' + e.type));
    peer.on('connection', c => {
      c.on('data', m => {
        if (m.k === 'join') {
          if (m.spec) { // 観戦者
            if (Net.specs.length >= MAX_SPECS) return c.send({ k: 'deny', why: '観戦席が満員です（6人まで）' });
            c.spec = true; c.seat = 0; c.prof = cleanProfile(m, '観戦者'); Net.specs.push(c); c.send({ k: 'role', spec: true });
            if (Net.started) catchUp(c); else { pushLobby(); ui.update(Net.lobby, specNames()); }
            return;
          }
          if (Net.started || Net.lobby.length >= MAX_PLAYERS) return c.send({ k: 'deny', why: Net.started ? 'すでに開始しています（観戦者としてなら入れます）' : '参加者が満員です（20人まで。観戦者としてなら入れます）' });
          c.seat = Net.lobby.length; c.prof = cleanProfile(m, 'ゲスト'); c.prof.qs = c.prof.qs || []; c.prof.team = smallerTeam(); Net.lobby.push(c.prof); Net.conns.push(c);
          c.send({ k: 'seat', seat: c.seat }); pushLobby(); ui.update(Net.lobby, specNames());
        } else if (m.k === 'profile') {
          if (c.spec) { c.prof = cleanProfile(m, '観戦者'); if (!Net.started) { pushLobby(); ui.update(Net.lobby, specNames()); } return; }
          if (!c.seat) return;
          const pf = cleanProfile(m, 'ゲスト'); pf.qs = pf.qs || (c.prof ? c.prof.qs : []) || []; pf.team = c.prof ? c.prof.team : 0; c.prof = pf;
          if (Net.started) setProfile(c.seat, pf); else { Net.lobby[c.seat] = pf; pushLobby(); ui.update(Net.lobby, specNames()); }
        } else if (c.spec) return; // 観戦者は操作できない
        else if (m.k === 'ans' && Net.started) quizAnswer(c.seat, m.v);
        else if (m.k === 'back') { // 結果画面から「ルームに戻る」
          if (Net.started) c.back = true;
          else if (!Net.conns.includes(c) && Net.lobby.length < MAX_PLAYERS && c.prof) {
            Net.pending = (Net.pending || []).filter(x => x !== c);
            c.seat = Net.lobby.length; Net.lobby.push(c.prof); Net.conns.push(c);
            c.send({ k: 'seat', seat: c.seat }); pushLobby(); ui.update(Net.lobby, specNames());
          }
        }
        else if (m.k === 'pick' && G.ask) submitAns(c.seat, m.v);
        else if (m.k === 'prog' && Net.started) hostProg(c.seat, m.p);
        else if (m.k === 'roll' && Net.started && G.t === c.seat) turn(m.i === undefined ? -1 : m.i);
      });
      c.on('close', () => {
        if (c.spec) { Net.specs = Net.specs.filter(x => x !== c); if (!Net.started) { pushLobby(); ui.update(Net.lobby, specNames()); } return; }
        if (!c.seat) { Net.pending = (Net.pending || []).filter(x => x !== c); return; }
        if (Net.started) { // ゲーム中の退出：自動で進行
          G.ps[c.seat].auto = true; log(`${N(G.ps[c.seat])}が退出（自動で進行）`);
          if (G.t === c.seat && !G.busy) turn();
        } else { // 開始前の退出：席を詰める
          const i = Net.conns.indexOf(c); if (i < 0) return; Net.conns.splice(i, 1); Net.lobby.splice(i + 1, 1);
          Net.conns.forEach((x, j) => { x.seat = j + 1; x.open && x.send({ k: 'seat', seat: j + 1 }); });
          pushLobby(); ui.update(Net.lobby, specNames());
        }
      });
    });
  });
}

function startOnline() {
  const kin = [0, 0];
  const ps = Net.lobby.map(p => { const t = p.team || 0, k = kin[t]++; return { name: p.name, img: p.img, team: t, color: p.color || teamColor(t, k) }; });
  const turns = clampTurns($('#tn').value), rules = readRules(), psq = ps.map((p, i) => ({ ...p, qs: Net.lobby[i].qs || [] }));
  Net.started = true; Net.conns.forEach(c => c.back = false);
  Net.startMsg = { k: 'start', ps, turns, rules }; Net.bc(Net.startMsg);
  initUI(psq, turns, rules); afterStart();
}

function joinRoom(phrase, me, ui) {
  roomId(phrase).then(id => {
    const peer = new Peer();
    Object.assign(Net, { peer, on: true, host: false, spec: false });
    peer.on('error', e => ui.error(e.type === 'peer-unavailable' ? 'ルームが見つかりません。合言葉を確認してください' : '接続エラー: ' + e.type));
    peer.on('open', () => {
      const c = Net.conn = peer.connect(id, { reliable: true });
      c.on('open', () => c.send({ k: 'join', name: me.name, img: me.img, color: me.color, qs: me.qs, spec: !!me.spec }));
      c.on('data', m => onGuestMsg(m, ui));
      c.on('close', () => { if (!Net.over) alert('ホストとの接続が切れました。ページを再読み込みしてください'); });
    });
  });
}

function onGuestMsg(m, ui) {
  switch (m.k) {
    case 'deny': ui.error(m.why); Net.peer.destroy(); break;
    case 'seat': Net.seat = m.seat; if (ui.seat) ui.seat(m.seat); break;
    case 'role': Net.spec = true; Net.seat = -1; break;
    case 'lobby': ui.update(m.list, m.specs || []); break;
    case 'start': IMGS = m.ps.map(p => p.img); Net.over = false; initUI(m.ps, m.turns, m.rules); break;
    case 'prof': { const p = G.ps[m.i]; p.name = m.name; p.color = m.color; p.img = IMGS[m.i] = m.img; setPlayerStyles(); renderStat(); renderTokens(); break; }
    case 'state':
      if (!G) break;
      const ch = G.stage !== m.s.stage;
      G.t = m.s.t; G.round = m.s.round; G.goalRound = m.s.goalRound; G.turns = m.s.turns; G.stage = m.s.stage; G.busy = m.s.busy; G.ask = m.s.ask; G.global = m.s.global; G.rules = m.s.rules; G.order = m.s.order; G.fog = m.s.fog; G.quiz = m.s.quiz;
      const hc = JSON.stringify(G.hid) !== JSON.stringify(m.s.hid); G.hid = m.s.hid; G.over = m.s.over;
      if (ch) renderBoard(); else if (hc) updateFog();
      G.ps = m.s.ps.map((p, i) => ({ ...p, img: IMGS[i] })); renderTokens(); renderStat(); break;
    case 'say': _say(m.v); break;
    case 'sfx': _sfx(m.v); break;
    case 'prog': _prog(m.seat, m.text); break;
    case 'head': _head(m.v, m.ty); break;
    case 'fx': _sign(m.v); break;
    case 'hold': _hold(m.ms); break;
    case 'log': _log(m.v); break;
    case 'dice': $('#dice').textContent = m.v; break;
    case 'end': finish(); break;
  }
}

// ゲーム中のプロフィール変更（ホストが反映して全員に配信）
function setProfile(seat, pf) {
  const p = G.ps[seat]; p.name = pf.name; p.img = pf.img; const kin = G.ps.filter((q, i) => q.team === p.team && i < seat).length; p.color = pf.color || teamColor(p.team, kin); pf.qs = (Net.lobby[seat] && Net.lobby[seat].qs) || []; pf.team = p.team; Net.lobby[seat] = pf;
  setPlayerStyles(); Net.bc({ k: 'prof', i: seat, name: pf.name, img: pf.img, color: p.color });
  log(`${N(p)}が名前・写真を変更した`); renderStat(); renderTokens();
}
function applyProfile(pf) {
  if (Net.host) setProfile(Net.seat, pf); else Net.conn.send({ k: 'profile', ...pf });
}

// 結果画面から「ルームに戻る」。ホストが戻ると、戻ってきた人が同じルームに集まる（観戦者はそのまま）
function backToRoom() {
  $('#result').close(); $('#game').hidden = true; $('#setup').hidden = false; if (document.body) document.body.classList.remove('playing');
  if (!Net.on) return; // 同じ端末プレイ：設定画面に戻る（名前・写真はそのまま）
  Net.over = false;
  if (Net.host) {
    const keep = Net.conns.filter(c => c.open && c.back), rest = Net.conns.filter(c => c.open && !c.back);
    rest.forEach(c => c.seat = 0); Net.pending = rest; Net.conns = keep; Net.started = false; Net.startMsg = null;
    Net.lobby = [Net.lobby[0]];
    keep.forEach((c, j) => { c.seat = j + 1; Net.lobby.push(c.prof); c.send({ k: 'seat', seat: c.seat }); });
    pushLobby(); Net.ui.update(Net.lobby, specNames());
  } else if (Net.spec) {
    $('#lob').innerHTML = '<p class="lead">👀 観戦者としてルームに戻りました。ホストの開始を待っています…</p>';
  } else {
    Net.conn.send({ k: 'back' });
    $('#lob').innerHTML = '<p class="lead">ホストがルームに戻るのを待っています…</p>';
  }
}
window.VER_NET = '2026.10.25-t1';

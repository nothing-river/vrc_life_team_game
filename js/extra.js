// ===== 追加機能：対戦・妨害・アイテム・投資・同盟・お砂糖の拡張・全体イベント・職業・ミッション =====
const K = MONEY_SCALE;
const bump = (p, k) => { p.st = p.st || {}; p.st[k] = (p.st[k] || 0) + 1; };
const battleOn = () => !G.rules || G.rules.battle !== false;
const sample = (a, n) => [...a].sort(() => Math.random() - 0.5).slice(0, n);
const allOthers = p => others(p).filter(o => !o.done);
const foesOf = p => allOthers(p).filter(o => o.team !== p.team); // 妨害・対戦の相手は「相手チーム」だけ
const idxOf = o => G.ps.indexOf(o);
const note = (p, t) => { say(t); log(`${N(p)}：${t.replace(/\n/g, ' ')}`); };
const unit = n => Math.round(n / (10 * K)) * (10 * K); // 1万円単位（K=1000のとき）に丸める
const missionOK = p => !!(p.mission && MISSIONS[p.mission] && MISSIONS[p.mission].ok(p));

// 職業・着せ替え・全体イベントによる収入補正（プラス収入のみ。マイナスは全体イベントの出費倍率だけ）
function boost(p, n) {
  if (n > 0) {
    let f = 1; const t = G.curType;
    if (t) {
      const j = JOBS[p.job], s = STYLES[p.style];
      if (j && j.types.includes(t)) f *= j.f;
      if (s && s.types.includes(t)) f *= s.f;
      if (G.global && G.global.types && G.global.types.includes(t)) f *= G.global.f;
    }
    return n * f;
  }
  const j = JOBS[p.job]; let f = 1;
  if (j && j.lossF) f *= j.lossF;
  if (G.global && G.global.lossF) f *= G.global.lossF;
  return n * f;
}
function gainSugar(p) { sfx('love'); p.sugar++; if (p.sugar === 1) { p.love = 5; p.trait = pick(Object.keys(TRAITS)); p.annTurn = 0; } }
function breakAlly(p, o) { p.ally = null; p.allyN = 0; if (o) { o.ally = null; o.allyN = 0; } log(`🔗 ${N(p)}${o ? 'と' + N(o) : ''}の同盟が終わった`); }
function moveMoney(from, to, amt, why) {
  amt = Math.max(0, Math.min(amt, Math.max(from.money, 0))); from.money -= amt; to.money += amt;
  log(`${N(to)}：${why}（${N(from)}から +${yen(amt)}）`); say(`${why}\n${N(from)} → ${N(to)}\n${yen(amt)}`); fx('plus'); renderStat(); return amt;
}
function guarded(o, what) {
  const i = o.items.indexOf('guard'); if (i < 0) return false;
  o.items.splice(i, 1); say(`🛡️ ${N(o)}のガード発動！\n${what}を防いだ`); log(`${N(o)}：ガードで${what}を防いだ`); renderStat(); return true;
}

// ===== 汎用の選択・回答（対戦相手の選択、賭け金、ミニゲームの結果など）=====
let askCtx = null, askTimer = null, askSeq = 0, askSig = '', miniOpen = false;
const autoAns = (kind, opts) => kind === 'number' ? rnd(0, 100) : kind === 'react' ? 400 + rnd(0, 300) : kind === 'tap' ? rnd(18, 32) : rnd(0, Math.max(0, opts.length - 1));
function waitAns(seats, title, opts, kind, secs) {
  return new Promise(res => {
    G.ask = { id: ++askSeq, title, opts, kind, seats: [...seats], done: [] };
    askCtx = { ans: {}, seats: [...seats], kind, opts, res };
    clearTimeout(askTimer); askTimer = setTimeout(closeAsk, secs * 1000);
    renderStat();
  });
}
function submitAns(seat, v) {
  const c = askCtx; if (!c || !c.seats.includes(seat) || seat in c.ans) return;
  if (c.kind === 'choice') { if (!Number.isInteger(v) || v < 0 || v >= c.opts.length) return; }
  else if (c.kind === 'number') { if (typeof v !== 'number' || !isFinite(v) || Math.abs(v) > 1e9) return; }
  else if (typeof v !== 'number' || !isFinite(v) || v < 0 || v > 99999) return; // react / tap のスコア
  c.ans[seat] = v; G.ask.done.push(seat);
  if (c.seats.every(s => s in c.ans)) closeAsk(); else renderStat();
}
function closeAsk() {
  const c = askCtx; if (!c) return; askCtx = null; clearTimeout(askTimer);
  c.seats.forEach(s => { if (!(s in c.ans)) c.ans[s] = c.kind === 'react' ? 9999 : c.kind === 'tap' ? 0 : autoAns(c.kind, c.opts); });
  G.ask = null; renderStat(); c.res(c.ans);
}
async function askMany(seats, title, opts, kind = 'choice', secs = 40) {
  const ans = {}, todo = [];
  seats.forEach(s => { if (G.ps[s].auto) ans[s] = autoAns(kind, opts); else todo.push(s); });
  if (!todo.length) return ans;
  if (!Net.on) { // 同じ端末：1人ずつ順番に
    for (const s of todo) { const a = await waitAns([s], (seats.length > 1 ? `${N(G.ps[s])}：` : '') + title, opts, kind, secs); ans[s] = a[s]; }
    return ans;
  }
  return Object.assign(ans, await waitAns(todo, title, opts, kind, secs));
}
const askOne = async (seat, title, opts, kind, secs) => (await askMany([seat], title, opts, kind, secs))[seat];
const askRoute = async (p, pos) => askOne(idxOf(p), `${N(p)}：分かれ道！どちらへ進む？`, FORKS[pos], 'choice', 45);

function onPick(v) {
  if (!G.ask) return;
  const my = Net.on ? Net.seat : G.ask.seats[0];
  if (!G.ask.seats.includes(my)) return;
  if (!Net.on || Net.host) submitAns(my, v); else Net.conn.send({ k: 'pick', v });
}
// 観戦：対戦に参加していない人にも、ミニゲームの進み具合がリアルタイムで見える
let specState = {}, lastAskId = -1;
function _prog(seat, text) { specState[seat] = text; renderSpec(); }
function renderSpec() {
  const el = $('#specbox'); if (!el) return;
  el.innerHTML = Object.keys(specState).map(s => `<div class="sp">${fmt(`\u0001${s}\u0002`, true)} ${esc(specState[s])}</div>`).join('');
}
function hostProg(seat, pl) { // 参加者の進み具合をホストが検証して全員に配信（表示のためだけ。勝敗は別に集計）
  if (!G.ask || !G.ask.seats.includes(seat) || !pl || typeof pl !== 'object') return;
  const n = Math.min(9999, Math.max(0, Math.floor(+pl.n) || 0)), ms = Math.min(9999, Math.max(0, Math.floor(+pl.ms) || 0));
  const T = { wait: '😬 構え中…', go: '🟢 GO！', ms: `⏱ ${ms}ms`, bad: '❌ フライング', tap: `👆 ${n}回`, end: `🏁 ${n}回` }[pl.s]; if (!T) return;
  _prog(seat, T); Net.bc({ k: 'prog', seat, text: T });
}
function sendProg(pl) { if (!Net.on) return; if (Net.host) hostProg(Net.seat, pl); else Net.conn.send({ k: 'prog', p: pl }); }
function renderGlobalBar() {
  const el = $('#globalbar'); if (!el) return;
  el.innerHTML = G.global ? `<div class="gb"><b>🌐 全体イベント中：${esc(G.global.icon)}${esc(G.global.name)}</b><span>${esc(G.global.desc)}（あと${G.global.left}ラウンド）</span></div>` : '';
}
function renderAsk() {
  const a = G.ask, el = $('#route');
  if (!a) { if (askSig) { el.innerHTML = ''; askSig = ''; } return; }
  const my = Net.on ? Net.seat : a.seats[0], can = a.seats.includes(my) && !a.done.includes(my);
  const mini = can && (a.kind === 'react' || a.kind === 'tap');
  if (a.id !== lastAskId) { specState = {}; lastAskId = a.id; }
  const sig = JSON.stringify([a.id, a.done, can, my]);
  if (sig !== askSig) {
    askSig = sig;
    const wait = a.seats.filter(s => !a.done.includes(s)).map(s => fmt(`\u0001${s}\u0002`, true)).join(' ');
    let h = `<div class="rtq">${fmt(a.title, true)}</div>`;
    if (mini) h += '<div class="rtw">🎮 ミニゲーム画面が開きます…</div>';
    else if (can && a.kind === 'number') h += '<div class="qnum"><input type="number" id="ansnum" placeholder="数字を入力"><button class="rt" id="ansgo">送信</button></div>';
    else if (can) h += a.opts.map((o, i) => `<button class="rt" data-i="${i}">${esc(o)}</button>`).join('');
    else { const dn = a.done.map(s => fmt(`\u0001${s}\u0002`, true)).join(' '); h += `<div class="rtw">👀 観戦中：${wait || '…'} が操作中${dn ? '<br>✅ 完了：' + dn : ''}</div>`; }
    if (a.seats.length > 1 || a.kind === 'react' || a.kind === 'tap') h += '<div id="specbox"></div>';
    el.innerHTML = h;
  }
  renderSpec();
  if (mini && !miniOpen) openMini(a.kind, a.title, v => onPick(v));
}

// ===== ミニゲーム画面（反応速度・連打）。自分の端末で測るので通信の遅れは関係しない =====
function openMini(kind, title, done) {
  const d = $('#mini'); if (!d || !d.showModal) return;
  miniOpen = true; d.oncancel = e => e.preventDefault();
  const fin = v => setTimeout(() => { d.close(); miniOpen = false; done(v); }, 1000);
  const head = `<h3>${fmt(title, true)}</h3>`;
  // ボタンの色は直接指定する（マウスが乗っているときのCSSに負けて緑にならない不具合の対策）
  const col = cls => { const b = d.querySelector('#mbtn'); b.className = 'mbig ' + cls; b.style.background = { wait: '#ffd0d0', go: '#5fe36a', bad: '#ff8f8f', ok: '#ffe08a' }[cls] || ''; };
  if (kind === 'react') {
    d.innerHTML = head + '<p>準備ができたらスタート。<b>緑になったら</b>すぐタップ！早すぎるとフライングです。</p><button class="mbig" id="mbtn">スタート</button>';
    const b = d.querySelector('#mbtn'); let st = 0, t0 = 0, to = null;
    b.onpointerdown = ev => {
      ev.preventDefault();
      if (st === 0) { st = 1; b.textContent = '…待って…'; col('wait'); sendProg({ s: 'wait' }); to = setTimeout(() => { st = 2; b.textContent = '今だ！！'; col('go'); t0 = performance.now(); sendProg({ s: 'go' }); }, 1500 + Math.random() * 2500); }
      else if (st === 1) { clearTimeout(to); st = 3; b.textContent = 'フライング！'; col('bad'); sendProg({ s: 'bad' }); fin(9999); }
      else if (st === 2) { st = 3; const ms = Math.round(performance.now() - t0); b.textContent = `${ms}ms`; col('ok'); sendProg({ s: 'ms', ms }); fin(ms); }
    };
  } else {
    d.innerHTML = head + '<p>スタートを押したら<b>5秒間</b>、できるだけ連打！</p><button class="mbig" id="mbtn">スタート</button>';
    const b = d.querySelector('#mbtn'); let st = 0, n = 0, left = 5, lastP = 0;
    b.onpointerdown = ev => {
      ev.preventDefault();
      if (st === 0) { st = 1; n = 0; col('go'); b.textContent = `0回 / 残り5秒`; const iv = setInterval(() => { left--; b.textContent = `${n}回 / 残り${left}秒`; if (left <= 0) { clearInterval(iv); st = 2; col('ok'); b.textContent = `${n}回！`; sendProg({ s: 'end', n }); fin(n); } }, 1000); }
      else if (st === 1) { n++; b.textContent = `${n}回 / 残り${left}秒`; const now = Date.now(); if (now - lastP > 180) { lastP = now; sendProg({ s: 'tap', n }); } }
    };
  }
  d.showModal();
}

// ===== 毎ターンの副収入（結婚・印税・お砂糖＋性格・好感度・記念日・借金の利息・同盟の期限）=====
async function passiveIncome(p) {
  if (p.married) add(p, 150, '家計の助け');
  if (p.royal && p.royal.n > 0) { add(p, p.royal.amt * (p.job === 'maker' ? 1.3 : 1), `ワールドの印税が入った📈（残り${p.royal.n - 1}回）`); if (--p.royal.n <= 0) p.royal = null; }
  if (p.sugar) {
    const t = TRAITS[p.trait] || TRAITS.free;
    add(p, (100 * p.sugar + (p.live ? 100 : 0)) * t.inc * (p.love >= 8 ? 1.5 : 1), p.live ? 'お砂糖と同棲生活' : 'お砂糖とペアワールド巡り');
    if (p.trait === 'amae') p.love = Math.min(10, p.love + 1);
    else if (p.trait === 'tsun') p.love = Math.max(0, Math.min(10, p.love + rnd(-1, 1)));
    else if (p.trait === 'free' && rnd(1, 4) === 1) p.love = Math.max(0, p.love - 1);
    if (p.love <= 1 && p.trait !== 'shikkari' && rnd(1, 3) === 1) { await sleep(800); losesugar(p, 1, '好感度が下がって自然消滅…'); }
    else if (p.sugar && ++p.annTurn >= 6) {
      p.annTurn = 0; await sleep(800);
      if (p.love >= 4) { p.love = Math.min(10, p.love + 2); add(p, 1500, '🎂 お砂糖との記念日！'); }
      else { p.love = Math.max(0, p.love - 1); add(p, -500, '記念日を忘れてケンカ…'); }
    }
  }
  if (p.debt > 0) { const i = unit(p.debt * 0.03); if (i > 0) { p.debt += i; log(`${N(p)}：借金の利息 ${yen(i)}（借金 ${yen(p.debt)}）`); } }
  if (p.allyN > 0 && p.ally != null && --p.allyN <= 0) breakAlly(p, G.ps[p.ally]);
}

// ===== 全体イベント（ラウンドの頭に全員へ効果）=====
async function rollGlobal() {
  const off = G.rules && G.rules.events === false;
  if (G.global && --G.global.left <= 0) { log(`🌐 全体イベント終了：${G.global.name}`); G.global = null; renderStat(); }
  let g;
  if (!G.fairDone && G.round >= 2) { G.fairDone = true; g = GLOBALS.find(x => x.jobFair); } // 最初の全体イベントは必ず転職フェア（全員が職業を選べる）
  else if (off || G.global || G.round < 2 || Math.random() > 0.45) return;
  else g = pick(GLOBALS.filter(x => !x.jobFair || rnd(1, 3) === 1));
  const left = g.rounds > 0 ? rnd(3, 7) : 0; // 続く全体イベントは3〜7ラウンド
  const dur = left ? `（${left}ラウンド続く）` : '';
  sfx('global'); head(`🌐 全体イベント発生！${g.icon}${g.name}`, 'start'); say(`${g.icon} ${g.name}\n${g.desc}${dur}`); log(`🌐 全体イベント：${g.icon}${g.name}（${g.desc}）${dur}`);
  if (g.skipAll) G.ps.forEach(q => { if (!q.done) q.skip += 1; });
  if (g.gift) G.ps.forEach(q => { if (!q.done) q.money += Math.round(g.gift * K / 1000) * 1000; });
  if (left) G.global = { icon: g.icon, name: g.name, desc: g.desc, left, types: g.types || null, f: g.f || 1, lossF: g.lossF || 0 };
  renderStat(); await sleep(3500);
  if (g.jobFair) await pickJobs();
}

// ===== 開始時：職業の選択・隠しミッションの配布 =====
async function pickJobs() {
  const keys = Object.keys(JOBS), seats = G.ps.map((_, i) => i);
  head('💼 職業を選ぼう（無職もOK）', 'start'); say('💼 全員が職業を選べます\n得意なマスの収入が増えます（ターンは進みません）');
  const ans = await askMany(seats, '💼 職業を選ぼう（得意なマスの収入が増える・無職もOK）', keys.map(k => `${JOBS[k].icon}${JOBS[k].name}：${JOBS[k].desc}`), 'choice', 45);
  seats.forEach(s => { G.ps[s].job = keys[ans[s]]; log(`${N(G.ps[s])}の職業：${JOBS[keys[ans[s]]].icon}${JOBS[keys[ans[s]]].name}`); });
}
function assignMissions() {
  if (G.rules && G.rules.missions === false) return;
  const keys = Object.keys(MISSIONS).sort(() => Math.random() - 0.5);
  G.ps.forEach((p, i) => { p.mission = keys[i % keys.length]; });
  log('🎴 全員に隠しミッションが配られた（内容は本人だけが見られます）');
}
let missionSig = '';
function renderMission() {
  const el = $('#mission'); if (!el) return;
  const my = Net.on ? Net.seat : G.t, p = G.ps[my];
  if (!p || !p.mission || (G.rules && G.rules.missions === false)) { if (missionSig) { el.innerHTML = ''; missionSig = ''; } return; }
  const m = MISSIONS[p.mission], ok = m.ok(p), sig = `${my}|${p.mission}|${m.prog(p)}|${ok}`;
  if (sig === missionSig) return; missionSig = sig;
  el.innerHTML = `<details ${Net.on ? 'open' : ''}><summary>🎴 ${Net.on ? 'あなたの' : '手番の人の'}隠しミッション${ok ? ' ✅' : ''}</summary>
    <p><b>${esc(m.desc)}</b><br>進み具合：${esc(m.prog(p))}　達成で最終得点 +${yen(MISSION_BONUS * K)}</p>${Net.on ? '' : '<p class="note">※同じ端末では他の人に見えないよう、手番の人だけが開いてください</p>'}</details>`;
}

// ===== 同じマスに止まったときの交流（同じインスタンス）=====
async function meetEvent(p) {
  if (p.pos === 0 || p.done) return;
  const mates = allOthers(p).filter(o => o.pos === p.pos); if (!mates.length) return;
  const o = pick(mates), d = rnd(1, 5);
  head(`🌐 ${N(p)}と${N(o)}が同じインスタンスに！`, 'social'); await sleep(900);
  if (d === 1) { add(p, 300, '同じインスタンスで乾杯🍻'); add(o, 300, '同じインスタンスで乾杯🍻'); }
  else if (d === 2) { p.friends++; o.friends++; say('フレンド申請が成立！👫\n（両者に友達+1）'); log(`${N(p)}と${N(o)}：友達になった`); renderStat(); }
  else if (d === 3) { fame(p, 1); fame(o, 1); say('ツーショット撮影📸\n（両者に人気度+1）'); log(`${N(p)}と${N(o)}：ツーショットで人気度UP`); renderStat(); }
  else if (d === 4) { add(p, -200, '些細なことで口論…'); add(o, -200, '些細なことで口論…'); }
  else { add(p, 400, '情報交換でおいしい話を聞いた'); }
  await sleep(2500);
}

// ===== 妨害系アイテム（使ってもサイコロは振れる）=====
async function useAct(ui) {
  const p = G.ps[G.t], id = p.items[ui];
  if (G.busy || G.over || p.done || p.skip > 0 || !ITEMS[id] || !ITEMS[id].act) return;
  if (p.muted > 0) { say('🔇 ミュート中でアイテムは使えない'); return; }
  G.busy = true; p.items.splice(ui, 1); bump(p, 'items'); renderStat();
  head(`${N(p)} が ${ITEMS[id].icon}${ITEMS[id].name} を使った`, 'item');
  const foes = foesOf(p);
  if (!foes.length) { p.items.push(id); say('相手がいない…アイテムは返ってきた'); }
  else {
    const o = foes.length === 1 ? foes[0] : foes[await askOne(idxOf(p), `${ITEMS[id].icon} ${ITEMS[id].name}：誰に使う？`, foes.map(x => x.name))];
    if (!guarded(o, ITEMS[id].name)) {
      if (id === 'thief') {
        if (!o.items.length) note(p, `${N(o)}は盗めるアイテムを持っていなかった…`);
        else { const it = o.items.splice(rnd(0, o.items.length - 1), 1)[0]; note(p, `🦹 ${N(o)}から${ITEMS[it].icon}${ITEMS[it].name}を盗んだ！`); if (p.items.length < 3) p.items.push(it); else add(p, 300, '持ちきれず売却'); }
      } else if (id === 'block') { o.skip += 1; note(p, `🚫 ${N(o)}をブロック！次の手番は1回休み`); }
      else if (id === 'mute') { o.muted = 1; note(p, `🔇 ${N(o)}をミュート！次の手番はアイテムが使えない`); }
      else if (id === 'swap') { [p.pos, o.pos] = [o.pos, p.pos]; renderTokens(); note(p, `🔄 ${N(o)}と位置を入れ替えた！`); }
    }
  }
  renderStat(); await sleep(3000);
  G.busy = false; renderStat();
}

// ===== 新しいマスの効果 =====
Object.assign(H, {
  duel: async p => {
    if (!battleOn()) return H.pay(p);
    const foes = foesOf(p); if (!foes.length) return add(p, 200, '対戦相手がいないので不戦勝（賞金）');
    const me = idxOf(p), o = pick(foes); // 相手・ゲーム・賭け金はランダムで決まる
    const games = ['🎲 ダイス勝負', '🎰 チンチロ', '🃏 ハイ&ロー', '⚡ 反応速度', '👆 連打（5秒）'];
    const gi = rnd(0, games.length - 1), bet = pick([300, 600, 1200]) * K;
    const both = [me, idxOf(o)]; // 対戦する2人（サイコロは各自が自分で振る）
    say(`⚔️ 対戦！ランダムで決定\n${N(p)} VS ${N(o)}\n${games[gi]}　賭け金 ${yen(bet)}`); log(`${N(p)}が${N(o)}に${games[gi]}を挑んだ（${yen(bet)}）`); await sleep(3200);
    let w = 0; const oi = idxOf(o), nm = s => N(G.ps[s]);
    if (gi === 0) { // ダイス勝負：1人ずつ、自分でボタンを押してサイコロを振る
      for (let t = 0; t < 3; t++) {
        await askOne(me, `${nm(me)}：🎲 サイコロを振ろう！（ボタンを押す）`, ['🎲 振る'], 'choice', 30); sfx('roll'); const a = rnd(1, 6); showDice(a); say(`🎲 ${nm(me)}：${a}`); await sleep(1500);
        await askOne(oi, `${nm(oi)}：🎲 サイコロを振ろう！（ボタンを押す）`, ['🎲 振る'], 'choice', 30); sfx('roll'); const b = rnd(1, 6); showDice(`${a} vs ${b}`); say(`🎲 ${nm(me)}：${a}　${nm(oi)}：${b}`); await sleep(2000);
        if (a !== b) { w = a > b ? 1 : -1; break; } say('同点！もう一回'); await sleep(900);
      }
    } else if (gi === 1) { // チンチロ：1人ずつ、自分でサイコロを振る（役が出なければ最大3回まで振り直し）
      const chin = () => {
        const d = [rnd(1, 6), rnd(1, 6), rnd(1, 6)].sort((x, y) => x - y); let s, nm;
        if (d[0] === d[2]) { s = d[0] === 1 ? 200 : 100 + d[0]; nm = d[0] === 1 ? 'ピンゾロ(最強)' : `${d[0]}のゾロ目`; }
        else if (d.join() === '4,5,6') { s = 90; nm = 'シゴロ'; }
        else if (d.join() === '1,2,3') { s = -1; nm = 'ヒフミ(最弱)'; }
        else if (d[0] === d[1]) { s = d[2]; nm = `目${d[2]}`; } else if (d[1] === d[2]) { s = d[0]; nm = `目${d[0]}`; } else { s = 0; nm = '役なし'; }
        return { s, txt: `🎲${d.join(' ')} ${nm}` };
      };
      const roll3 = async seat => {
        let r;
        for (let t = 1; t <= 3; t++) {
          await askOne(seat, `${nm(seat)}：🎰 チンチロ！サイコロを3つ振ろう（${t}回目）`, ['🎲🎲🎲 振る'], 'choice', 30); sfx('roll');
          r = chin(); showDice(r.txt.replace('🎲', '')); say(`${nm(seat)}：${r.txt}（${t}回目）`); await sleep(2000);
          if (r.s !== 0) break; if (t < 3) { say(`${nm(seat)}：役なし…もう一度振れる！`); await sleep(900); }
        }
        return r;
      };
      for (let t = 0; t < 3; t++) {
        const a = await roll3(me), b = await roll3(oi); say(`${nm(me)}：${a.txt}\n${nm(oi)}：${b.txt}`); await sleep(2800);
        if (a.s !== b.s) { w = a.s > b.s ? 1 : -1; break; } say('引き分け！もう一回'); await sleep(900);
      }
    } else if (gi === 2) { // ハイ&ロー（心理戦）：数字は相手(守る側)が決める。自動では出さない
      const nums = [1, 2, 3, 4, 5, 6];
      say(`🃏 ハイ&ロー（心理戦）\n${nm(oi)}が数字を2つ決めます。\n${nm(me)}は「隠された数字が大きいか小さいか」を当てよう`); await sleep(3000);
      const a = nums[await askOne(oi, `${nm(oi)}：🃏 公開する数字を決めよう（${nm(me)}に見せる数字）`, nums.map(String), 'choice', 45)];
      const rest = nums.filter(x => x !== a);
      const b = rest[await askOne(oi, `${nm(oi)}：🃏 隠す数字を決めよう（公開する数字は ${a}。${nm(me)}には見えません）`, rest.map(String), 'choice', 45)];
      showDice(`${a} → ？`); say(`🃏 公開された数字は ${a}\n隠された数字は…？`); await sleep(1200);
      const g = await askOne(me, `${nm(me)}：🃏 隠された数字は ${a} より…？（心理戦！）`, ['ハイ（大きい）', 'ロー（小さい）'], 'choice', 45);
      showDice(`${a} → ${b}`); w = (g === 0) === (b > a) ? 1 : -1; say(`公開 ${a} → 隠し ${b}\n${w > 0 ? nm(me) + 'の予想的中！' : nm(me) + 'の予想ハズレ…'}`); await sleep(2800);
    } else {
      const react = gi === 3, seats = both;
      const r = await askMany(seats, react ? '⚡ 反応速度勝負！緑になったらタップ' : '👆 連打勝負！5秒間できるだけ連打', [], react ? 'react' : 'tap', 60);
      const a = r[seats[0]], b = r[seats[1]], fmtS = v => react ? (v >= 9999 ? 'フライング/未入力' : v + 'ms') : v + '回';
      w = a === b ? 0 : (react ? a < b : a > b) ? 1 : -1; say(`${N(p)}：${fmtS(a)}\n${N(o)}：${fmtS(b)}`); await sleep(2800);
    }
    if (!w) { say('引き分け！賭け金の移動なし'); log(`${N(p)}と${N(o)}の勝負は引き分け`); }
    else { const win = w > 0 ? p : o, lose = w > 0 ? o : p; sfx('win'); bump(win, 'duel'); moveMoney(lose, win, bet, '⚔️ 対戦に勝利！'); }
  },
  tax: async p => {
    const rich = [...G.ps].sort((a, b) => b.money - a.money)[0], poor = [...G.ps].sort((a, b) => a.money - b.money)[0];
    if (rich === poor) return note(p, '税務署は今日はお休み');
    say(`🏛️ 税務調査！\n一番の富豪 ${N(rich)} から\n最下位 ${N(poor)} へ寄付`); await sleep(2200);
    moveMoney(rich, poor, Math.max(100 * K, unit(rich.money * 0.1)), '🏛️ 税金・寄付');
  },
  invest: async p => {
    if (p.royal && p.royal.n > 0) return add(p, 300, 'ワールドの評判が上がった（投資中）');
    const i = await askOne(idxOf(p), `${N(p)}：ワールド制作に投資する？（${yen(1000 * K)}を払うと、毎ターン${yen(400 * K)}が5回入る）`, ['投資する', '見送る']);
    if (i === 0) { p.royal = { n: 5, amt: 400 }; bump(p, 'invest'); add(p, -1000, 'ワールド制作に投資！印税が入るのを待とう📈'); } else note(p, '今回は投資を見送った');
  },
  avatar: async p => {
    const keys = Object.keys(STYLES), i = await askOne(idxOf(p), `${N(p)}：アバターのテイストを決めよう`, keys.map(k => `${STYLES[k].icon}${STYLES[k].name}：${STYLES[k].desc}`));
    p.style = keys[i]; note(p, `${STYLES[p.style].icon} ${STYLES[p.style].name}にお着替え！\n${STYLES[p.style].desc}`); fame(p, 0);
  },
  report: async p => {
    say('🚨 通報・BANマス！'); const d = await rollDice();
    if (d <= 2) { if (useAmulet(p)) return; p.skip += 1; add(p, -600, 'マナー違反を通報されBAN…1回休み＋罰金', -1); }
    else if (d <= 4) add(p, 400, 'マナー違反者を通報して感謝された');
    else add(p, 800, '運営から通報協力のお礼が届いた', 1);
  },
  gamble: async p => {
    const opts = [`堅実勝負（${yen(300 * K)}・勝率50%で2倍）`, `勝負（${yen(600 * K)}・勝率40%で2.5倍）`, `大勝負（${yen(1200 * K)}・勝率25%で5倍）`, `💳借金して大勝負（${yen(1500 * K)}を借りて勝率25%で5倍）`, 'やめておく'];
    const i = await askOne(idxOf(p), `${N(p)}：ギャンブル！どうする？`, opts);
    if (i === 4) return note(p, '賢明な判断…ギャンブルは見送った');
    const c = [{ b: 300, w: .5, m: 2 }, { b: 600, w: .4, m: 2.5 }, { b: 1200, w: .25, m: 5 }, { b: 1500, w: .25, m: 5, loan: true }][i];
    if (c.loan) { p.debt += 1500 * K; p.money += 1500 * K; note(p, `💳 ${yen(1500 * K)}を借金！（毎ターン利息、最終得点から引かれる）`); await sleep(1800); }
    say('🃏 運命の勝負…'); await sleep(1500);
    if (Math.random() < c.w) add(p, c.b * (c.m - 1), '🎉 大当たり！勝負に勝った'); else add(p, -c.b, '💸 負けた…');
  },
  detective: async p => {
    const foes = foesOf(p); if (!foes.length) return note(p, '調べる相手がいない');
    const o = pick(foes);
    say(`🔎 ランダムで${N(o)}を調査中…`); await sleep(1800);
    if (o.sugar >= 2 && !o.exposed) { o.exposed = true; fame(o, -1); add(o, -300, '多糖が暴露された！'); await sleep(1500); losesugar(o, 1, '暴露されて1人と破局'); await sleep(1500); add(p, 600, '探偵の成功報酬'); }
    else if (o.sugar >= 2) add(p, 300, 'すでに知られた秘密…ささやかな報酬');
    else { say(`🔎 ${N(o)}の秘密：\nお砂糖${o.sugar}人 / 元お砂糖${o.exes}人 / 友達${o.friends}人`); await sleep(2500); add(p, -100, '調査費用だけがかかった'); }
  },
  rob: async p => {
    if (!battleOn()) return H.sugar(p);
    const foes = foesOf(p).filter(o => o.sugar > 0); if (!foes.length) return note(p, '略奪できるお砂糖を持つ人がいない…');
    if (p.sugar >= 3) return note(p, 'お砂糖が多すぎて手が回らない');
    const o = pick(foes);
    if (guarded(o, 'お砂糖の略奪')) return;
    const rv = p.revenge === idxOf(o);
    let ch = o.married ? .25 : o.live ? .4 : .6; ch += (o.love <= 3 ? .15 : o.love >= 8 ? -.15 : 0) + (rv ? .2 : 0);
    say(`💘 ランダムで${N(o)}のお砂糖が標的に…${rv ? '（復讐戦！）' : ''}\n成功率 ${Math.round(ch * 100)}%`); await sleep(2400);
    if (Math.random() < ch) { losesugar(o, 1, `${N(p)}にお砂糖を奪われた`); o.revenge = idxOf(p); gainSugar(p); fame(p, -1); bump(p, 'rob'); await sleep(1500); note(p, '💘 略奪成功！新しいお砂糖ができた（人気度-1）'); }
    else { add(p, -400, '略奪失敗…気まずい空気', -1); add(o, 200, '略奪を撃退！'); }
  },
  alliance: async p => {
    if (!battleOn()) return H.friend(p);
    const me = idxOf(p);
    if (p.ally != null && G.ps[p.ally]) {
      const o = G.ps[p.ally], i = await askOne(me, `🔗 ${N(o)}と同盟中。どうする？`, ['同盟を続ける', '裏切る（相手の所持金の15%を奪う）']);
      if (i === 1 && !guarded(o, '裏切り')) { moveMoney(o, p, unit(o.money * 0.15), '🔗 同盟を裏切った！'); fame(p, -1); breakAlly(p, o); } else note(p, '同盟は続く');
      return;
    }
    const foes = foesOf(p).filter(o => o.ally == null); if (!foes.length) return note(p, '同盟を組める相手がいない');
    const o = pick(foes);
    const yes = await askOne(idxOf(o), `🔗 ${N(p)}から同盟の申し込み！（5手番、お互いの収入の30%が入る）`, ['組む', '断る']);
    if (yes === 0) { p.ally = idxOf(o); o.ally = me; p.allyN = o.allyN = 5; note(p, `🔗 ${N(p)}と${N(o)}が同盟を結んだ！`); } else note(p, `${N(o)}は同盟を断った`);
  }
});
// 既存マスへの拡張（集会の常連・結婚式のブーケ・復縁の記録）
const _shukai = H.shukai, _marry = H.marry, _ex = H.ex;
H.shukai = async p => { const r = p.regulars || 0; await _shukai(p); bump(p, 'shukai'); if (r) add(p, r * 100, `常連${r}人が応援に来てくれた🎪`); p.regulars = Math.min(5, r + 1); renderStat(); };
H.marry = async p => {
  const was = p.married; await _marry(p);
  if (!was && p.married) { const os = allOthers(p); if (os.length) { await sleep(1500); const o = pick(os); add(o, 500, '💐 結婚式のブーケをキャッチ！'); if (!o.sugar && rnd(1, 3) === 1) { gainSugar(o); note(o, 'ブーケがきっかけでお砂糖ができた🍬'); } } }
};
H.ex = async p => { const e0 = p.exes, s0 = p.sugar; await _ex(p); if (p.exes < e0 && p.sugar > s0) bump(p, 'reunion'); };
window.VER_EXTRA = '2026.10.25-t3';

// ===== 途中参戦（観戦者だけが、ゲーム中に参加者になれる）=====
function addLatePlayer(prof) {
  const t = prof.team === 1 ? 1 : 0, kin = G.ps.filter(q => q.team === t).length, i = G.ps.length;
  const p = newPlayer({ name: prof.name, img: prof.img, team: t, color: prof.color || teamColor(t, kin) }, G.rules);
  if (!G.rules || G.rules.missions !== false) p.mission = pick(Object.keys(MISSIONS));
  G.ps.push(p); G.order.push(i); (prof.qs || []).forEach(q => G.qpool.push({ ...q, author: i }));
  Net.bc({ k: 'addp', i, img: prof.img }); Net.flush(); setPlayerStyles(); sfx('item');
  head(`⚔️ ${N(p)}が${TEAMS[t].icon}${TEAMS[t].name}に途中参戦！`, 'start'); say(`⚔️ 途中参戦！\n${N(p)}（${TEAMS[t].icon}${TEAMS[t].name}）\n所持金 ${yen(p.money)} でスタート`); log(`⚔️ ${N(p)}が${TEAMS[t].icon}${TEAMS[t].name}に途中参戦！（手番は今のラウンドの最後に回ります）`);
  renderStat(); renderTokens();
}
window.VER_EXTRA = window.VER_EXTRA;

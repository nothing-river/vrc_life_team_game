let G;
// 演出の時間設定（ミリ秒）：マス到着の演出 → 内容 → 読む時間
const FX_INTRO = 1200, FX_HOLD_MIN = 3500, FX_HOLD_PER_CHAR = 70, FX_HOLD_MAX = 8000;
const L = () => G.stage === 'goal' ? LAYOUT2 : LAYOUT;
const mult = p => 1 + p.fame * .1 + (p.fbt ? .3 : 0);
const others = p => G.ps.filter(o => o !== p);
const fame = (p, n) => p.fame = Math.max(0, Math.min(5, p.fame + n));
const score = p => p.money + MONEY_SCALE * ((p.sugar ? 2000 + (p.sugar - 1) * 1000 : 0) + (p.live ? 1000 : 0) + (p.married ? 2000 : 0) + p.fame * 500 + (G.over && missionOK(p) ? MISSION_BONUS : 0)) - (p.debt || 0);

const makeHid = (n, goal) => [...Array(n).keys()].filter(i => i > 0 && !(goal && i === n - 1) && rnd(0, 1));
// プレイヤーの初期状態（開始時・途中参戦で共通）
function newPlayer(p, rules) { return { ...p, team: p.team === 1 ? 1 : 0, pos: 0, money: rules.money || START_MONEY, love: 0, trait: null, royal: null, style: null, job: 'none', mission: null, st: {}, ally: null, allyN: 0, muted: 0, exposed: false, debt: 0, regulars: 0, annTurn: 0, revenge: -1, sugar: 0, friends: 0, exes: 0, live: false, married: false, fbt: false, pc: false, fame: 0, skip: 0, items: ['dice2'], done: false, rank: 0 }; }
function initUI(ps, turns, rules) {
  rules = rules && typeof rules === 'object' ? rules : { fog: !!rules };
  const fog = rules.fog;
  const qsets = ps.map(p => p.qs || []); // 登録された問題（ホスト/同じ端末のみ保持。回答は他の人へ送らない）
  const order = ps.map((_, i) => i); // 手番の順番はランダム（入室順にしない）
  for (let i = order.length - 1; i > 0; i--) { const j = rnd(0, i); [order[i], order[j]] = [order[j], order[i]]; }
  G = { order, oi: 0, ps: ps.map(p => newPlayer(p, rules)),
    t: order[0], round: 1, turns: turns || DEFAULT_TURNS, fog: !!fog, rules, goalRound: 0, global: null, ask: null, curType: null, hid: null, quiz: null, stage: 'main', fin: 0, busy: false, over: false };
  G.qpool = qsets.flatMap((a, i) => a.map(q => ({ ...q, author: i }))); G.ps.forEach(p => { delete p.qs; });
  if (G.fog) G.hid = makeHid(LAYOUT.length, false);
  $('#setup').hidden = true; $('#game').hidden = false; if (document.body) document.body.classList.add('playing');
  $('#roll').onclick = () => onRoll(-1);
  $('#joinplay').onclick = e => { const b = e.target.closest('button'); if (b && Net.conn && Net.conn.open) { Net.conn.send({ k: 'joinplay', t: +b.dataset.t }); b.disabled = true; } };
  $('#items').onclick = e => { const x = e.target.closest('button'); if (x && !x.disabled) onRoll(+x.dataset.i); };
  $('#quiz').onclick = e => {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    if (b.dataset.a !== undefined) onAnswer(+b.dataset.a);
    else if (b.id === 'qgo') { const v = parseFloat($('#qin').value); if (isFinite(v)) onAnswer(v); }
  };
  $('#route').onclick = e => {
    const x = e.target.closest('button'); if (!x || x.disabled) return;
    if (x.id === 'ansgo') { const v = parseFloat($('#ansnum').value); if (isFinite(v)) onPick(v); } else if (x.dataset.i !== undefined) onPick(+x.dataset.i);
  };
  $('#stat').onclick = e => {
    const c = e.target.closest('.chip'), pl = e.target.closest('.pill'), t = $('#tip');
    if (c && c.dataset.tip) { t.textContent = c.dataset.tip; t.hidden = false; }
    else if (pl && G.ps[+pl.dataset.pi]) { t.textContent = playerSummary(G.ps[+pl.dataset.pi], +pl.dataset.pi); t.hidden = false; }
    else t.hidden = true;
  };
  showAllTokens = false; const tb = $('#tokBtn'); if (tb) { tb.textContent = '👥 全員の駒を表示'; tb.onclick = () => { showAllTokens = !showAllTokens; tb.textContent = showAllTokens ? '👥 近くの駒だけ表示' : '👥 全員の駒を表示'; renderTokens(); }; }
  bindBoardHover();
  $('#editme').hidden = !Net.on || Net.spec; $('#editme').onclick = openProfile; $('#tip').hidden = true;
  setPlayerStyles(); renderLegend(); renderBoard(); renderTokens(); renderStat();
}
function onAnswer(v) {
  if (!Net.on) quizAnswer(G.quiz.cur, v); else if (Net.host) quizAnswer(Net.seat, v); else Net.conn.send({ k: 'ans', v });
}
async function afterStart() {
  say('ゲーム開始！'); head(G.fog ? '🌫️ 霧モード：見えないマスは止まると公開' : '📍 イベント'); G.busy = true; renderStat();
  assignMissions(); G.busy = false;
  say('準備OK！\nサイコロを振ろう🎲'); announce();
  if (G.ps[G.t].auto) setTimeout(turn, 900);
}
function startGame(ps, turns, rules) { initUI(ps, turns, rules); afterStart(); }
function onRoll(i = -1) {
  if (!Net.on) return turn(i);
  if (Net.host) { if (G.t === Net.seat) turn(i); } else Net.conn.send({ k: 'roll', i });
}

function announce() { renderStat(); } // 手番表示は画面上部の「ターンバー」(renderTurn)が担当。イベント表示(#msg)とは独立

async function rollDice(n = 1) {
  sfx('roll');
  const r = () => [...Array(n)].map(() => rnd(1, 6));
  for (let i = 0; i < 9; i++) { showDice(r().join('+')); await sleep(70); }
  const v = r(), s = v.reduce((a, b) => a + b);
  showDice(n > 1 ? `${v.join('+')}=${s}` : s); return s;
}

function add(p, n, text, fm = 0) {
  n = Math.round(boost(p, n) * MONEY_SCALE / 100) * 100; p.money += n; if (fm) fame(p, fm);
  if (n > 0 && p.ally != null && G.ps[p.ally] && p.allyN > 0) { const q = G.ps[p.ally], x = Math.round(n * 0.3 / 1000) * 1000; if (x > 0) { q.money += x; log(`${N(q)}：同盟ボーナス（${N(p)}の収入から +${yen(x)}）`); } }
  const f = fm > 0 ? ' ⭐UP' : fm < 0 ? ' ⭐DOWN' : '';
  log(`${N(p)}：${text}（${n >= 0 ? '+' : ''}${yen(n)}${f}）`);
  say(`${text}\n${n >= 0 ? '+' : ''}${yen(n)}${f}`); fx(n > 0 ? 'plus' : n < 0 ? 'minus' : null); renderStat();
}
function losesugar(p, n, why) {
  sfx('break');
  n = Math.min(n, p.sugar); p.sugar -= n; p.exes += n; if (!p.sugar) { p.live = false; p.love = 0; p.trait = null; }
  say(`${why}
${n > 1 ? 'お砂糖' + n + '人と' : 'お砂糖と'}破局…💔`); log(`${N(p)}：${why}（お砂糖と破局）`); renderStat();
}
function reveal(i, quiet) {
  if (!G.hid) return; const k = G.hid.indexOf(i); if (k < 0) return;
  G.hid.splice(k, 1); updateFog();
  if (!quiet) { const t = TYPES[L()[i]]; log(`🔦 霧が晴れた：${t.icon}${t.label}`); }
}
const pickItem = () => (G.fog && rnd(1, 3) === 1) ? 'scope' : pick(battleOn() ? ITEM_POOL : ITEM_POOL.filter(k => !HOSTILE.includes(k)));
function giveItem(p, id) {
  if (id === 'scope') {
    const hs = (G.hid || []).slice(), got = [];
    for (let k = 0; k < 5 && hs.length; k++) got.push(hs.splice(rnd(0, hs.length - 1), 1)[0]);
    got.forEach(i => reveal(i, true));
    say(`🔭 望遠鏡！霧が晴れた\n（${got.length}マス公開）`); log(`${N(p)}：望遠鏡で${got.length}マス公開`); return renderStat();
  }
  const it = ITEMS[id]; sfx('item');
  if (p.items.length >= 3) return add(p, 300, `${it.icon}${it.name}は持ちきれないので売却`);
  p.items.push(id); say(`${it.icon} ${it.name}をゲット！`); log(`${N(p)}：${it.name}を入手`); renderStat();
}
function useAmulet(p) {
  const i = p.items.indexOf('amulet'); if (i < 0) return false;
  p.items.splice(i, 1); say('🧿 お守りが身代わりに！\nピンチを回避'); log(`${N(p)}：お守りで回避`); renderStat(); return true;
}

// 1マスずつ移動。メインは周回ループ＋分岐（1周でボーナス）、ゴールステージはゴールで止まる
async function moveBy(p, n, delay) {
  for (let i = 0; i < n; i++) {
    if (G.stage === 'goal') { if (p.pos >= LAYOUT2.length - 1) break; p.pos++; }
    else {
      const nx = NEXT[p.pos];
      p.pos = nx.length > 1 ? nx[await askRoute(p, p.pos)] : nx[0];
      if (p.pos === 0) { bump(p, 'laps'); add(p, 1000, 'ログインボーナス（1周）'); await sleep(500); }
    }
    sfx('step'); renderTokens(); await sleep(delay);
  }
}

async function turn(ui = -1) {
  if (G.busy || G.over) return;
  const p = G.ps[G.t]; if (p.done) return;
  if (ui >= 0 && (!p.items[ui] || ['amulet', 'guard', 'scope'].includes(p.items[ui]))) return;
  if (ui >= 0 && ITEMS[p.items[ui]].act) return useAct(ui);
  if (ui >= 0 && p.muted > 0) return;
  G.busy = true; renderStat();
  log(`▶ ${N(p)} の手番（${G.stage === 'goal' ? 'ゴールステージ' : '第' + G.round + 'ターン'}）`);
  if (p.skip > 0) {
    p.skip--; say(`${N(p)}は足止め中…💤\n今回はお休み`); log(`${N(p)}：お休み`);
    await sleep(1200); return endTurn(p, false);
  }
  const item = ui >= 0 ? p.items.splice(ui, 1)[0] : null;
  let steps, delay = 250;
  if (item) { bump(p, 'items'); say(`${ITEMS[item].icon} ${ITEMS[item].name}を使った！`); log(`${N(p)}：${ITEMS[item].name}を使用`); renderStat(); await sleep(800); }
  switch (item) {
    case 'dice2': steps = await rollDice(2); break;
    case 'dice3': steps = await rollDice(3); break;
    case 'bike': steps = 3 + await rollDice(); break;
    case 'plane': steps = 10; delay = 120; break;
    case 'train': steps = 8; delay = 120; break;
    case 'ship': steps = 6; delay = 120; break;
    default: steps = await rollDice();
  }
  await moveBy(p, steps, delay);
  const ty = L()[p.pos], hid = isHid(p.pos);
  reveal(p.pos); renderStat();
  head(`📍 ${N(p)} が ${TYPES[ty].icon}${TYPES[ty].label} に止まった${hid ? '（霧が晴れた！）' : ''}`, ty); say('');
  await sleep(FX_INTRO); // マス到着の演出を見せる
  G.curType = ty; await H[ty](p); G.curType = null; await meetEvent(p);
  const ms = Math.min(FX_HOLD_MAX, FX_HOLD_MIN + $('#msg').textContent.length * FX_HOLD_PER_CHAR) + (G.quiz ? 3000 : 0); // 内容を読む時間（バーで残り時間を表示）
  hold(ms); await sleep(ms);
  if (G.quiz) { G.quiz = null; renderStat(); }
  await endTurn(p, true);
}

function nextO() {
  const n = G.ps.length;
  for (let i = 1; i <= n; i++) { const oi = (G.oi + i) % n; if (!G.ps[G.order[oi]].done) return oi; }
  return -1;
}
async function endTurn(p, income) {
  if (p.muted > 0) p.muted--;
  if (income && !p.done) await passiveIncome(p);
  await sleep(700);
  const no = nextO();
  if (no < 0) { G.over = true; return finish(); }
  if (G.stage === 'goal' && no <= G.oi && ++G.goalRound >= GOAL_ROUNDS_MAX) { G.over = true; return finish(); } // 安全装置（通常は全員がゴールした時点で終了する）
  G.oi = no; G.t = G.order[no];
  if (G.stage === 'main' && G.oi === 0) { if (++G.round > G.turns) return toGoalStage(); await rollGlobal(); }
  G.busy = false; announce();
  if (G.ps[G.t].auto) setTimeout(turn, 900); // 退出した人は自動で進行
}

// 規定ラウンド終了：ゴールステージへ。全員がスタートマスに集合する
async function toGoalStage() {
  say('🏁 ゴールステージへ！\nここからは一本道。ゴールを目指せ！'); log('ゴールステージ開始');
  await sleep(1800);
  G.ps.forEach(p => p.pos = 0); // ゴールステージは、全員が最初のマスに集合してスタート
  G.goalRound = 0;
  sfx('goal'); G.global = null; if (G.fog) G.hid = makeHid(LAYOUT2.length, true);
  G.stage = 'goal'; G.oi = 0; G.t = G.order[0];
  renderBoard(); renderTokens(); renderStat();
  log('全員がスタートマスに集合した（全員がゴールするまで続きます）');
  G.busy = false; announce();
  if (G.ps[G.t].auto) setTimeout(turn, 900);
}

// ===== クイズ（登録問題を全員が回答。出題者は回答しない）=====
let qCur = null, qAns = {}, qSkip = new Set(), qList = [];
function takeQuestion(p) {
  const pool = G.qpool || []; if (!pool.length) return null;
  const pref = pool.filter(q => q.author !== G.ps.indexOf(p)), src = pref.length ? pref : pool;
  const q = src[rnd(0, src.length - 1)]; pool.splice(pool.indexOf(q), 1); return q;
}
function quizAnswer(seat, v) {
  const q = G.quiz; if (!q || q.phase !== 'ask' || !qCur) return;
  if (seat === q.author || q.answered.includes(seat) || !qList.includes(seat)) return;
  if (!Net.on && seat !== q.cur) return;
  if (q.type === 'mc') { if (!Number.isInteger(v) || v < 0 || v >= q.choices.length) return; }
  else if (typeof v !== 'number' || !isFinite(v) || Math.abs(v) > 1e9) return;
  qAns[seat] = v; q.answered.push(seat); log(`${N(G.ps[seat])}が回答した`);
  if (!Net.on) { q.cur = qList.find(i => !q.answered.includes(i) && !qSkip.has(i)) ?? null; q.left = ANSWER_SEC; }
  renderStat();
}
async function runQuiz(p) {
  const def = takeQuestion(p); if (!def) return false;
  qCur = def; qAns = {}; qSkip = new Set();
  qList = G.ps.map((_, i) => i).filter(i => i !== def.author && !G.ps[i].auto);
  G.quiz = { text: def.text, type: def.t, choices: def.t === 'mc' ? def.choices : null, author: def.author, left: ANSWER_SEC, phase: 'ask', answered: [], cur: Net.on ? null : qList[0] };
  say(`❓ ${N(G.ps[def.author])}さんの問題！\n${Net.on ? '全員で回答しよう' : '順番に回答します'}`); renderStat();
  const pending = () => qList.filter(i => !G.quiz.answered.includes(i) && !qSkip.has(i));
  for (let t = 0; pending().length;) {
    await sleep(250);
    if (++t % 4) continue;
    G.quiz.left--;
    if (G.quiz.left <= 0) {
      if (Net.on) break; // オンライン：時間切れ（未回答は不正解）
      qSkip.add(G.quiz.cur); G.quiz.cur = pending()[0] ?? null; G.quiz.left = ANSWER_SEC; // 同じ端末：次の人へ
    }
    renderStat();
  }
  // ----- 結果 -----
  const answered = qList.filter(i => qAns[i] !== undefined);
  let winners, correct;
  if (def.t === 'mc') { correct = def.choices[def.ans]; winners = answered.filter(i => qAns[i] === def.ans); }
  else {
    correct = String(def.ans); const dist = i => Math.abs(qAns[i] - def.ans), best = Math.min(...answered.map(dist));
    winners = answered.length ? answered.filter(i => dist(i) === best) : [];
  }
  const rows = qList.map(i => ({ seat: i, pick: qAns[i] === undefined ? '未回答' : (def.t === 'mc' ? `${'ABCD'[qAns[i]]}. ${def.choices[qAns[i]]}` : String(qAns[i])),
    win: winners.includes(i), note: def.t === 'num' && qAns[i] !== undefined ? `差 ${Math.abs(qAns[i] - def.ans)}` : '' }));
  const names = a => a.map(i => N(G.ps[i])).join('・');
  let summary;
  if (winners.length) { summary = `${def.t === 'mc' ? '正解者' : '一番近かった人'}：${names(winners)}（賞金あり）`; sfx(winners.length ? 'quiz_ok' : 'quiz_ng'); winners.forEach(i => { bump(G.ps[i], 'quiz'); add(G.ps[i], def.t === 'mc' ? QUIZ_REWARD : QUIZ_REWARD * 1.5, 'クイズ賞金！'); }); }
  else { summary = `正解者なし！出題者 ${N(G.ps[def.author])} にボーナス`; add(G.ps[def.author], QUIZ_AUTHOR_BONUS, '誰も当てられず出題者ボーナス'); }
  G.quiz.phase = 'reveal'; G.quiz.reveal = { correct, rows, summary };
  say(`正解は「${correct}」！\n${summary}`); renderStat();
  qCur = null; return true;
}

// ===== 各マスの効果 =====
const H = {
  start: async () => {},
  pay: async p => add(p, rnd(3, 12) * 100, pick(TEXT.pay)),
  loss: async p => {
    if (useAmulet(p)) return;
    add(p, -rnd(2, 9) * 100 * (p.pc ? .5 : 1), pick(TEXT.loss));
    if (p.sugar && rnd(1, 4) === 1) { await sleep(800); losesugar(p, 1, 'ピンチで心がすれ違った'); }
  },
  job: async p => add(p, 1000, pick(TEXT.job)),
  world: async p => { const [t, m, f] = pick(TEXT.world); add(p, m, t, f); },
  trouble: async p => {
    if (useAmulet(p)) return;
    const [t, m, f, s] = pick(TEXT.trouble); p.skip += s; add(p, m, t, f);
  },
  gacha: async p => {
    if (rnd(1, 4) === 1) return giveItem(p, pickItem());
    const [t, m, f] = pick(TEXT.gacha); add(p, m, t, f);
  },
  item: async p => giveItem(p, pickItem()),
  shukai: async p => {
    say('集会を開催！参加者は…？'); const d = await rollDice();
    add(p, d * 400 * mult(p) * (p.sugar ? 1.5 : 1), d === 1 ? '集会は過疎気味…' : `集会に${d * 5}人が来場！${p.sugar ? 'お砂糖が運営を手伝った' : ''}`, d >= 5 ? 1 : 0);
  },
  event: async p => {
    say('個人イベを開催！結果は…？'); const d = await rollDice();
    const g = [-300, 800, 800, 1500, 1500, 3000][d - 1];
    add(p, g > 0 ? g * mult(p) : g, ['誰も来なかった…', '小さなライブ', '小さなライブ', '大盛況', '大盛況', 'バズって大成功！'][d - 1], d === 6 ? 1 : 0);
  },
  dj: async p => {
    say('DJイベ！フロアの反応は？'); const d = await rollDice();
    d >= 4 ? add(p, d * 350 * mult(p), 'フロアが大盛り上がり！', 1) : add(p, 200, '選曲がハマらなかった…');
  },
  photo: async p => {
    say('撮影会を開催！'); const d = await rollDice();
    add(p, d * 200 * mult(p), d >= 5 ? '写真集がバズった！' : '撮影会が無事終了', d >= 5 ? 1 : 0);
  },
  quiz: async p => {
    if (await runQuiz(p)) return; // 登録された問題が無ければ、従来のサイコロクイズ
    say('ワールドクイズ！偶数なら正解'); const d = await rollDice();
    d % 2 === 0 ? add(p, 1200, '正解！賞金ゲット') : add(p, -400, '不正解…参加費だけ取られた');
  },
  shop: async p => {
    say('BOOTHでお買い物…'); const d = await rollDice();
    if (d <= 2) add(p, -200, '小物をポチった');
    else if (d === 3) p.fbt ? add(p, 300, '余ったフルトラを譲った') : (p.fbt = true, add(p, -800, 'フルトラ購入！イベ収入UP🕺'));
    else if (d === 4) p.pc ? add(p, 300, '古いPCを売った') : (p.pc = true, add(p, -800, '高性能PCに買い替え！ピンチ半減💻'));
    else if (d === 5) add(p, -600, '新アバターをお迎え！', 1);
    else add(p, 1500, '福袋が大当たり！');
  },
  warp: async p => {
    say('ワールドジャンプ！'); const d = await rollDice(), goal = G.stage === 'goal'; let t;
    const back = k => { for (let i = 0; i < k; i++) p.pos = goal ? Math.max(1, p.pos - 1) : PREV[p.pos][0]; };
    const fwd = k => { for (let i = 0; i < k; i++) p.pos = goal ? Math.min(LAYOUT2.length - 2, p.pos + 1) : NEXT[p.pos][0]; };
    if (d <= 2) { back(3); t = 'ワープ事故で3マス戻る'; }
    else if (d <= 4) { fwd(2); t = '2マス進んだ！'; }
    else if (d === 5) { fwd(4); t = '近道発見！4マス進む'; }
    else {
      const os = others(p).filter(o => !o.done);
      if (os.length) { const o = pick(os); [p.pos, o.pos] = [o.pos, p.pos]; t = `${N(o)}と位置が入れ替わった！`; } else t = '誰もいなかった…';
    }
    sfx('warp'); renderTokens(); say(t); log(`${N(p)}：${t}`);
  },
  rest: async p => { p.skip = 1; add(p, 100, 'ベッドで寝落ち…次回お休み💤'); },
  collab: async p => {
    const o = pick(others(p)); add(o, 500, `${N(p)}とコラボ！`, 1); add(p, 500, `${N(o)}とコラボ！`, 1);
  },
  social: async p => {
    const os = sample(others(p), 4); // 人数が多いので、巻き込まれるのは最大4人
    if (rnd(0, 1)) { os.forEach(o => add(o, 200, `${N(p)}にドリンクをおごられた`)); add(p, -200 * os.length, '全員にドリンクをおごった', 1); }
    else { os.forEach(o => add(o, -200, `${N(p)}の誕生日会に参加`)); add(p, 200 * os.length, '誕生日会を開いてもらった！'); }
  },
  sugar: async p => {
    if (p.friends > 0 && rnd(1, 2) === 1) { p.friends--; gainSugar(p); say(`友達からお砂糖に変化！🍬${p.sugar > 1 ? '\n（多糖に…）' : ''}`); log(`${N(p)}：友達がお砂糖に`); return renderStat(); }
    if (p.sugar >= 3) return add(p, 200, 'お砂糖たちとラブラブ報告（バレないように…）');
    say(p.sugar ? 'もう一人…？お砂糖チャンス！3以上で成功' : 'お砂糖チャンス！成功の目は3以上');
    const d = await rollDice();
    if (d >= 3) { gainSugar(p); say(p.sugar > 1 ? '多糖になった…！🍬🍬\nバレないように気をつけて' : 'お砂糖ゲット！🍬'); log(`${N(p)}：お砂糖が${p.sugar}人に`); renderStat(); }
    else { say('今回は縁がなかった…'); log(`${N(p)}：お砂糖ならず`); }
  },
  date: async p => {
    if (!p.sugar) {
      if (rnd(1, 4) === 1) { gainSugar(p); say('ひとりワールド巡り中に運命の出会い！🍬'); log(`${N(p)}：出会ってお砂糖に`); return renderStat(); }
      return add(p, 100, 'お砂糖がいないのでひとりワールド巡り…');
    }
    if (p.sugar > 1 && rnd(1, 3) === 1) {
      add(p, -500, 'デートがダブルブッキング！');
      if (rnd(0, 1)) { await sleep(900); losesugar(p, 1, 'ブッキングがバレた'); }
      return;
    }
    const r = rnd(1, 6);
    if (r === 5) { p.live = true; return add(p, -500, '同棲ワールドを建てた🏠'); }
    if (r === 6) { p.love = Math.max(0, p.love - 2); add(p, -300, 'ケンカしてしまった'); if (rnd(1, 3) === 1) { await sleep(800); losesugar(p, 1, 'ケンカが決定打になった'); } return; }
    p.love = Math.min(10, p.love + 1); const [t, m, f] = pick(TEXT.date); add(p, m, t, f);
  },
  marry: async p => {
    if (p.married) return add(p, 200, '結婚記念日');
    if (p.sugar > 1) { losesugar(p, p.sugar - 1, '結婚で多糖が発覚…他のお砂糖とは別れた'); await sleep(1000); }
    p.married = true; let gift = 0;
    sample(others(p), 4).forEach(o => { o.money -= 300 * MONEY_SCALE; gift += 300; });
    add(p, gift, '結婚！みんなから祝儀'); renderStat();
  },
  ex: async p => {
    if (p.exes <= 0) { say('元お砂糖はいない…\n今回は何も起きなかった'); return log(`${N(p)}：元お砂糖がいないので何も起きなかった`); }
    say('元お砂糖とばったり遭遇…！'); const d = await rollDice();
    if (d === 1) add(p, -rnd(4, 12) * 100, '元お砂糖にお金をたかられた…');
    else if (d === 2) { if (p.sugar) losesugar(p, 1, '元お砂糖と会っていたのが現お砂糖にバレた'); else add(p, -300, '気まずくて逃げ出した…', -1); }
    else if (d === 3) add(p, -200, '気まずい再会…目を合わせられない', -1);
    else if (d === 4) { p.exes--; p.friends++; add(p, 200, '和解して友達に戻った'); }
    else if (d === 5) { p.exes--; gainSugar(p); say(`元お砂糖と復縁！🍬${p.sugar > 1 ? '\n多糖に…' : ''}`); log(`${N(p)}：元お砂糖と復縁`); renderStat(); }
    else add(p, 500, '元お砂糖が仕事を紹介してくれた', 1);
  },
  past: async p => {
    if (!p.sugar) return add(p, 100, '他人のお砂糖の過去話を聞いてしまった…');
    say('お砂糖の過去を知ってしまった…'); const d = await rollDice();
    if (d <= 2) { await sleep(500); losesugar(p, 1, '過去を知ってショックで別れた'); }
    else if (d <= 4) add(p, 200, '過去は過去。気にしないと決めた');
    else add(p, 600, '過去を受け止めて絆が深まった', 1);
  },
  friend: async p => {
    const d = rnd(1, 6);
    if (d <= 2) { p.friends++; say('フレンド申請が通った！👫'); log(`${N(p)}：友達が増えた`); renderStat(); }
    else if (d === 3) add(p, 300, '友達とワールド巡り');
    else if (d === 4) {
      if (p.friends > 0) { p.friends--; gainSugar(p); say(`友達がお砂糖に変化！🍬${p.sugar > 1 ? '\n多糖に…' : ''}`); log(`${N(p)}：友達がお砂糖に`); }
      else { p.friends++; say('新しい友達ができた👫'); }
      renderStat();
    }
    else if (d === 5) add(p, -300, '友達にお金を貸した…');
    else add(p, 600, '友達が集会を手伝ってくれた');
  },
  offkai: async p => {
    say('リアルでオフ会！結果は…？'); const d = await rollDice();
    if (d === 1) add(p, -600, '交通費と宿代がかさんだ…');
    else if (d === 2) {
      if (p.sugar) { add(p, -300, 'お砂糖と初オフ…解釈違いで空気が悪く'); await sleep(900); losesugar(p, 1, 'リアルで会って別れた'); }
      else add(p, -300, 'オフ会で話が弾まなかった');
    }
    else if (d === 3) { if (p.sugar) p.love = Math.min(10, p.love + 1); add(p, 500, 'オフ会が盛り上がった！', 1); }
    else if (d === 4) {
      if (p.friends > 0) { p.friends--; gainSugar(p); say(`オフ会で友達と急接近！お砂糖に🍬${p.sugar > 1 ? '\n多糖に…' : ''}`); log(`${N(p)}：オフ会で友達がお砂糖に`); renderStat(); }
      else { p.friends++; add(p, 100, 'オフ会で友達ができた👫'); }
    }
    else if (d === 5) {
      if (p.sugar) { if (rnd(0, 1)) p.live = true; add(p, 800, `リアルでも相性抜群！${p.live ? '同棲へ🏠' : ''}`, 1); }
      else add(p, 300, 'オフ会でみんなに奢ってもらった');
    }
    else if (p.sugar > 1) { add(p, -800, 'オフ会で多糖ブッキング…修羅場！'); await sleep(900); losesugar(p, 1, '修羅場で1人と破局'); }
    else add(p, 1200, 'オフ会ビンゴ大会で優勝！');
  },
  tata: async p => {
    if (p.sugar < 2) {
      say('お砂糖が増えそうな予感…'); const d = await rollDice();
      if (d >= 5) { gainSugar(p); say(p.sugar > 1 ? '多糖になった！？🍬🍬' : 'お砂糖ができた🍬'); log(`${N(p)}：お砂糖が${p.sugar}人に`); renderStat(); }
      else add(p, 100, '平穏な日々');
      return;
    }
    say('多糖がバレるか…？'); const d = await rollDice();
    if (d === 1) { add(p, -1000, '全員にバレて大修羅場！', -2); await sleep(900); losesugar(p, p.sugar, '全員にバレた'); }
    else if (d <= 3) { add(p, -500, 'お砂糖の1人にバレた…'); await sleep(900); losesugar(p, 1, '多糖がバレた'); }
    else if (d <= 5) add(p, 600 * p.sugar, 'うまく両立できている…！');
    else add(p, 1500, '全員公認の仲良しグループに！', 1);
  },
  sns: async p => {
    const d = rnd(1, 6);
    if (d === 1) add(p, -300, '匂わせ投稿が炎上…', -1);
    else if (d === 2) { if (p.exes > 0 && p.sugar) add(p, -500, '元お砂糖がSNSで特定して絡んできた'); else add(p, -200, 'エゴサして落ち込んだ'); }
    else if (d <= 4) add(p, 400, '投稿がバズった！', 1);
    else if (d === 5) { if (p.sugar > 1) add(p, -300, '多糖がバレかけて慌てて投稿削除'); else add(p, 600, '投げ銭が集まった'); }
    else add(p, 1000, '大バズり！', 1);
  },
  divorce: async p => {
    if (p.married) { // 結婚している → 離婚の危機
      say('離婚の危機…！3以下で離婚成立'); const d = await rollDice();
      if (d <= 3) { p.married = false; p.exes++; add(p, -rnd(8, 20) * 100, '離婚が成立…慰謝料を支払った'); }
      else add(p, 300, '話し合いで仲直り！夫婦円満', 1);
      return;
    }
    if (p.sugar > 0) { // お砂糖がいる → 別れ話
      say('お砂糖と別れ話…'); const d = await rollDice();
      if (d <= 2) losesugar(p, 1, '別れ話がこじれた'); else add(p, 400, 'ちゃんと話して絆が深まった', 1);
      return;
    }
    if (p.exes > 0) { // 元お砂糖がいる → 元お砂糖の話
      say('元お砂糖の結婚・離婚の話を聞いた…'); const d = await rollDice();
      if (d <= 3) add(p, -500, '元お砂糖の結婚式でご祝儀…複雑な気分'); else add(p, 300, '元お砂糖が円満な報告をくれた');
      return;
    }
    // 元お砂糖もお砂糖もいない → 特殊イベント
    say('離婚マス…だが別れる相手がいない！'); await sleep(900);
    const ev = pick([
      () => add(p, rnd(5, 12) * 100, '離婚相談員のバイトで稼いだ'),
      () => add(p, 300, '「別れる相手がいない」が話題に', 1),
      () => { p.friends++; say('友達の離婚の愚痴を聞いてあげた👫\n友達が増えた'); log(`${N(p)}：愚痴を聞いて友達が増えた`); renderStat(); },
      () => add(p, -300, '友達の離婚調停の付き添いで交通費…')
    ]);
    ev();
  },
  goal: async p => {
    if (p.done) return;
    sfx('goal'); p.done = true; p.rank = ++G.fin;
    add(p, GOAL_BONUS[Math.min(p.rank, GOAL_BONUS.length) - 1], `${p.rank}位でゴール！🏁`);
  }
};

function finish() {
  G.over = true; Net.over = true; _sfx('result'); updateBgm(); Net.flush(); Net.bc({ k: 'end' });
  const K = MONEY_SCALE;
  const lines = p => {
    const r = [['💰 所持金（ゴール順ボーナス込み）', p.money, false]];
    if (p.sugar) r.push([`🍬 お砂糖 ${p.sugar}人`, K * (2000 + (p.sugar - 1) * 1000), true]);
    if (p.live) r.push(['🏠 同棲', K * 1000, true]);
    if (p.married) r.push(['💍 結婚', K * 2000, true]);
    if (p.fame) r.push([`⭐ 人気度 ${p.fame}`, K * 500 * p.fame, true]);
    if (missionOK(p)) r.push(['🎴 ミッション達成', K * MISSION_BONUS, true]);
    if (p.debt) r.push(['💳 借金', -p.debt, true]);
    return r;
  };
  const sum = (t, f) => G.ps.filter(p => p.team === t).reduce((s, p) => s + f(p), 0);
  const A = sum(0, score), B = sum(1, score), win = A === B ? -1 : A > B ? 0 : 1;
  const all = [...G.ps].sort((a, b) => score(b) - score(a)), medal = ['🥇', '🥈', '🥉'];
  const row = p => { const i = all.indexOf(p); return `<details class="mrow" style="${cv(p.color)}"><summary><span class="medal">${i < 3 ? medal[i] : (i + 1) + '位'}</span>${tok(p)}<strong>${esc(p.name)}</strong><small>${p.done ? '🏁' + p.rank + '位' : ''}</small><em>${yen(score(p))}</em></summary>
      ${p.mission ? `<div class="rsub">🎴 ミッション：${esc(MISSIONS[p.mission].desc)}${missionOK(p) ? ' ✅達成' : ' ❌未達成'}</div>` : ''}
      <table>${lines(p).map(([l, v, b]) => `<tr><td>${l}</td><td>${b && v > 0 ? '+' : ''}${yen(v)}</td></tr>`).join('')}<tr class="sum"><td>最終得点</td><td>${yen(score(p))}</td></tr></table>
      <div class="chips">${chips(p)}</div></details>`; };
  const block = t => `<section class="tres${win === t ? ' win' : ''}"><h3>${TEAMS[t].icon} ${TEAMS[t].name}${win === t ? ' 👑' : ''}<em>${yen(t ? B : A)}</em></h3>
      <div class="rsub">所持金の合計 ${yen(sum(t, p => p.money))} ／ ${G.ps.filter(p => p.team === t).length}人</div>${all.filter(p => p.team === t).map(row).join('')}</section>`;
  $('#result').innerHTML = `<h2>🎉 結果発表</h2>
    <div class="banner">${win < 0 ? '🤝 引き分け！' : `🏆 ${TEAMS[win].icon}${TEAMS[win].name} の勝利！`}<small>${TEAMS[0].icon} ${yen(A)} ／ ${TEAMS[1].icon} ${yen(B)}（差 ${yen(Math.abs(A - B))}）</small></div>
    <p class="lead">勝敗は「チーム全員の最終得点の合計」で決まります。個人の1位（MVP）：${tok(all[0])} <b>${esc(all[0].name)}</b></p>
    <div class="tgrid">${block(0)}${block(1)}</div>
    <details class="how"><summary>📖 結果の見かた</summary>
      <p>最終得点 ＝ 所持金（ゴール順ボーナス込み）＋お砂糖・同棲・結婚・人気度・ミッションのボーナス − 借金。名前をクリックすると内訳が見られます。</p>
      <p>ゴール順ボーナス：1位 ${yen(GOAL_BONUS[0] * K)} ／ 2位 ${yen(GOAL_BONUS[1] * K)} ／ 3位 ${yen(GOAL_BONUS[2] * K)} …（10位以降は ${yen(GOAL_BONUS[9] * K)}）。ゴールステージは全員がゴールするまで続きます。</p></details>
    <div class="endbtns"><button class="big" onclick="backToRoom()">${Net.on ? (Net.host ? 'ルームに戻って再戦する' : 'ルームに戻る') : 'もう一度遊ぶ（設定に戻る）'}</button>
    <button onclick="location.reload()">トップに戻る</button></div>
    ${Net.on ? '<p class="lead">ホストが「ルームに戻る」を押すと、戻ってきた人が同じルームに集まります（観戦者はそのまま残ります）。</p>' : ''}`;
  $('#result').showModal();
}
window.VER_GAME = '2026.10.25-t3';

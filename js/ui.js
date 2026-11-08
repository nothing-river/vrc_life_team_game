const $ = s => document.querySelector(s);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = a => a[rnd(0, a.length - 1)];
// 色ユーティリティ：背景色に合わせて文字色(白/濃色)を自動で切り替える
const fgOf = hex => { const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)); return (.299 * r + .587 * g + .114 * b) > 140 ? '#3d2a4a' : '#fff'; };
const cv = c => `--c:${c};--fg:${fgOf(c)}`;
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const yen = n => {
  const a = Math.abs(n), o = Math.floor(a / 1e8), m = Math.floor(a % 1e8 / 1e4), r = a % 1e4;
  let s = ''; if (o) s += o + '億'; if (m) s += m.toLocaleString() + '万'; if (r || !s) s += r.toLocaleString();
  return (n < 0 ? '-' : '') + s + '円';
};

// 写真を正方形に切り抜いて軽量化 (120px JPEG)
function loadPhoto(file) {
  return new Promise(res => {
    const im = new Image();
    im.onload = () => {
      const s = Math.min(im.width, im.height), c = document.createElement('canvas');
      c.width = c.height = 120;
      c.getContext('2d').drawImage(im, (im.width - s) / 2, (im.height - s) / 2, s, s, 0, 0, 120, 120);
      URL.revokeObjectURL(im.src);
      res(c.toDataURL('image/jpeg', .8));
    };
    im.src = URL.createObjectURL(file);
  });
}

const tok = (p, i) => {
  if (i === undefined && typeof G !== 'undefined' && G && G.ps) i = G.ps.indexOf(p);
  const cls = p.img && i >= 0 ? ` pi${i}` : '';
  return `<i class="tok${cls}" style="${cv(p.color)};${p.img && !cls ? `background-image:url(${p.img})` : ''}">${p.img ? '' : esc([...p.name][0])}</i>`;
};

// 色の指定：カラーピッカー＋RGBスライダー。初期は「デフォルト色」(未指定=null)、いじるとカスタム色
function colorCtl(host, def, onChange) {
  host.innerHTML = `<div class="cc"><input type="color" class="cp" aria-label="プレイヤーの色">
    <details><summary>RGBで調整</summary>${['R', 'G', 'B'].map((n, k) => `<label>${n}<input type="range" min="0" max="255" class="cr"><output></output></label>`).join('')}
    <button type="button" class="creset">デフォルトに戻す</button></details></div>`;
  const cp = host.querySelector('.cp'), rs = [...host.querySelectorAll('.cr')], os = [...host.querySelectorAll('output')];
  let custom = false;
  const show = hex => { cp.value = hex; [1, 3, 5].forEach((p, k) => { rs[k].value = parseInt(hex.slice(p, p + 2), 16); os[k].textContent = rs[k].value; }); };
  const user = hex => { custom = true; show(hex); if (onChange) onChange(); };
  cp.oninput = () => user(cp.value);
  rs.forEach(r => r.oninput = () => user('#' + rs.map(x => (+x.value).toString(16).padStart(2, '0')).join('')));
  host.querySelector('.creset').onclick = () => { custom = false; show(def); if (onChange) onChange(); };
  show(def);
  return { get: () => custom ? cp.value : null, setDefault(h) { def = h; if (!custom) show(h); }, setValue(h) { custom = true; show(h); } };
}
const colorGap = (a, b) => { const f = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); const [x, y] = [f(a), f(b)]; return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };

// 写真についての注意書き
const photoNote = online => `<p class="note">📷 写真は保存していません。この端末のブラウザ内で小さく加工して駒に使うだけで、サーバーへのアップロードや保存はしません。${online ? 'オンラインの場合のみ、同じルームの参加者の端末に直接送られます。' : ''}ページを閉じる・再読み込みすると消えます。</p>`;

// ===== セットアップ画面（同じ端末 / ルーム作成 / ルーム入室）=====
const rowHtml = i => `<div class="prow" data-i="${i}">
  <label class="ph" style="--c:${COLORS[i]}"><input type="file" accept="image/*" hidden><span>写真</span></label>
  <input class="nm" maxlength="8" placeholder="プレイヤー${i + 1}の名前"><div class="cwrap"></div><details class="qd"><summary>❓ クイズ問題を登録（出題者になる）<span class="qn"></span></summary><div class="qe"></div></details></div>`;
function bindRow(r, photos, i, cb) {
  r.querySelector('input[type=file]').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    photos[i] = await loadPhoto(f);
    const ph = r.querySelector('.ph'); ph.style.backgroundImage = `url(${photos[i]})`; ph.querySelector('span').hidden = true; if (cb) cb();
  };
}

function buildSetup(onStart) {
  const el = $('#setup');
  const menu = () => {
    el.innerHTML = `<h1>VRC人生ゲーム <small class="tag">チーム戦版</small></h1><p class="lead">2チームに分かれて稼ごう。最後にチーム全員の合計が多いほうが勝ち！（参加者最大20人＋観戦者6人）</p>
      <div class="menu"><button class="big" data-m="local">同じ端末で遊ぶ</button>
      <button class="big alt" data-m="host">ルームを作る（オンライン）</button>
      <button class="big alt" data-m="join">ルームに入る（オンライン）</button></div>`;
    el.querySelector('.menu').onclick = e => {
      const m = e.target.dataset.m;
      if (m === 'local') local(); else if (m) online(m === 'host');
    };
  };
  const local = () => {
    let n = 2; const photos = [null, null, null, null];
    el.innerHTML = `<h1>同じ端末で遊ぶ</h1><div class="count" id="count">${[2, 3, 4].map(i => `<button data-n="${i}">${i}人</button>`).join('')}</div>
      <div id="rows">${[0, 1, 2, 3].map(rowHtml).join('')}</div>
      ${photoNote(false)}${turnsHtml}<br><button id="go" class="big">ゲーム開始</button> <button class="back">戻る</button>`;
    const sync = () => {
      el.querySelectorAll('.prow').forEach((r, i) => r.hidden = i >= n);
      el.querySelectorAll('#count button').forEach(b => b.classList.toggle('on', +b.dataset.n === n));
    };
    el.querySelector('#count').onclick = e => { if (e.target.dataset.n) { n = +e.target.dataset.n; sync(); } };
    el.querySelectorAll('.prow').forEach((r, i) => { bindRow(r, photos, i); r.querySelector('.nm').insertAdjacentHTML('afterend', `<select class="tsel" aria-label="チーム"><option value="0"${i % 2 ? '' : ' selected'}>🔴 あか</option><option value="1"${i % 2 ? ' selected' : ''}>🔵 あお</option></select>`); });
    const cc = [...el.querySelectorAll('.cwrap')].map((w, i) => colorCtl(w, COLORS[i]));
    const qe = [...el.querySelectorAll('.qe')].map(h => qEditor(h));
    el.querySelector('.back').onclick = menu;
    $('#go').onclick = () => { const ts = [...Array(n)].map((_, i) => +el.querySelectorAll('.tsel')[i].value); if (!ts.includes(0) || !ts.includes(1)) return alert('あかチームとあおチームに、1人以上ずつ入れてください'); onStart([...Array(n)].map((_, i) => ({
      team: ts[i], name: el.querySelectorAll('.nm')[i].value.trim() || `P${i + 1}`, img: photos[i], color: cc[i].get() || COLORS[i], qs: qe[i].get() })), clampTurns($('#tn').value), readRules()); };
    sync();
  };
  const online = isHost => {
    const photos = [null];
    el.innerHTML = `<h1>${isHost ? 'ルームを作る' : 'ルームに入る'}</h1>
      <p class="lead">${isHost ? '合言葉を決めて、参加する人に伝えてください。参加者は最大20人、観戦者は最大6人です。入室後に、ホストが2チームへ振り分けます。' : 'ホストに教えてもらった合言葉を入力してください。'}</p>
      ${rowHtml(0)}
      ${photoNote(true)}
      <input id="pw" class="nm pw" maxlength="20" placeholder="合言葉（なんでもOK）">${isHost ? turnsHtml + '<label class="tn chk"><input type="checkbox" id="rteam" checked> 🔴🔵 プレイヤーが自分でチームを選べる（オフにするとホストだけが決めます）</label><label class="tn chk"><input type="checkbox" id="rlate" checked> ⚔️ 観戦者が、ゲーム中に参加者として途中参戦できる</label>' : '<label class="tn chk"><input type="checkbox" id="asSpec"> 👀 観戦者として入る（最大6人・操作はできません。ゲーム中でも入れます）</label>'}
      <p id="err" class="err" role="alert"></p>
      <button id="go" class="big">${isHost ? 'ルーム作成' : '入室'}</button> <button class="back">戻る</button><div id="lob"></div>`;
    const meNow = () => cleanProfile({ name: el.querySelector('.nm').value.trim(), img: photos[0], color: cc.get(), qs: qe.get() }, isHost ? 'ホスト' : 'ゲスト');
    let pt; // 入室後も名前・写真を変更できる（開始前）。変更はロビーの全員に反映
    const sendProfile = () => { clearTimeout(pt); pt = setTimeout(() => {
      if (Net.started) return;
      if (isHost) { if (Net.lobby.length) { const t = Net.lobby[0].team; Net.lobby[0] = meNow(); Net.lobby[0].team = t; pushLobby(); ui.update(Net.lobby, specNames()); } }
      else if (Net.conn && Net.conn.open) Net.conn.send({ k: 'profile', ...meNow() });
    }, 350); };
    const cc = colorCtl(el.querySelector('.cwrap'), COLORS[0], sendProfile);
    const qe = qEditor(el.querySelector('.qe'), sendProfile);
    el.querySelector('.nm').oninput = sendProfile;
    bindRow(el.querySelector('.prow'), photos, 0, sendProfile);
    el.querySelector('.back').onclick = () => { if (Net.peer) Net.peer.destroy(); Net.on = Net.host = Net.spec = false; menu(); };
    const ui = Net.ui = {
      seat: n => {},
      error: m => { $('#err').textContent = m; $('#go').disabled = false; },
      update: (list, specs = []) => {
        const allow = Net.allowTeam !== false;
        const cnt = [0, 0], kin = list.map(p => cnt[p.team || 0]++), eff = list.map((p, i) => p.color || teamColor(p.team || 0, kin[i]));
        const mine = isHost ? 0 : Net.seat; if (!Net.spec && list[mine]) cc.setDefault(eff[mine]);
        const col = t => `<div class="tcol t${t}"><h3>${TEAMS[t].icon} ${TEAMS[t].name}（${cnt[t]}人）</h3>${list.map((p, i) => [p, i]).filter(([p]) => (p.team || 0) === t).map(([p, i]) =>
          `<div class="lp">${tok({ ...p, color: eff[i] })}<span>${esc(p.name)}${i === 0 ? '（ホスト）' : ''}${!Net.spec && i === mine ? ' ★' : ''}</span><small>❓${(p.qs ? p.qs.length : p.qn) || 0}</small>${!Net.spec && i === mine && (isHost || allow) ? [0, 1].map(t => `<button class="tpick${(p.team || 0) === t ? ' on' : ''}" data-t="${t}" title="${TEAMS[t].name}にする">${TEAMS[t].icon}</button>`).join('') : (isHost ? `<button class="tmv" data-i="${i}" title="もう一方のチームへ移動">⇄</button>` : '')}</div>`).join('')}</div>`;
        const ok = list.length >= 2 && cnt[0] > 0 && cnt[1] > 0;
        $('#lob').innerHTML = `<h2>参加者 ${list.length}/${MAX_PLAYERS}</h2><div class="tcols">${col(0)}${col(1)}</div>`
          + (Math.abs(cnt[0] - cnt[1]) > 1 ? '<p class="err">チームの人数に差があります。公平にするなら振り分けを調整してください。</p>' : '')
          + `<p class="lead">👀 観戦者 ${specs.length}/${MAX_SPECS}${specs.length ? '：' + specs.map(esc).join('、') : ''}</p>`
          + (Net.spec ? '<p class="lead">👀 観戦者として入室しました。ホストの開始を待っています…</p>' : `<p class="lead">${allow ? '自分のチームは、名前の横の🔴🔵ボタンで選べます。' : 'チームはホストが決めます。'}名前・写真・色は入室後も上の欄で変更できます。</p>`)
          + (isHost ? `<div class="hbtns"><button id="rand">🔀 ランダムに振り分け</button><button id="start" class="big" ${ok ? '' : 'disabled'}>この人数で開始</button></div>` : (Net.spec ? '' : '<p class="lead">ホストの開始を待っています…</p>'));
      }
    };
    $('#lob').onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.classList.contains('tpick')) { const t = +b.dataset.t; if (isHost) { Net.lobby[0].team = t; pushLobby(); ui.update(Net.lobby, specNames()); } else if (Net.conn && Net.conn.open) Net.conn.send({ k: 'team', t }); return; }
      if (!isHost) return;
      if (b.classList.contains('tmv')) { const p = Net.lobby[+b.dataset.i]; p.team = (p.team || 0) ^ 1; }
      else if (b.id === 'rand') { const idx = Net.lobby.map((_, i) => i).sort(() => Math.random() - 0.5); idx.forEach((i, k) => Net.lobby[i].team = k % 2); }
      else if (b.id === 'start') return startOnline();
      else return;
      pushLobby(); ui.update(Net.lobby, specNames());
    };
    if (isHost) $('#rteam').onchange = () => { Net.allowTeam = $('#rteam').checked; pushLobby(); ui.update(Net.lobby, specNames()); };
    $('#go').onclick = () => {
      const pw = $('#pw').value.trim();
      if (!pw) return ui.error('合言葉を入力してください');
      $('#err').textContent = ''; $('#go').disabled = true;
      const me = meNow(); me.spec = !isHost && $('#asSpec').checked;
      isHost ? hostRoom(pw, me, ui) : joinRoom(pw, me, ui);
    };
  };
  menu();
}

// ===== ボード描画 =====
const isHid = i => !!(G.hid && G.hid.indexOf(i) >= 0);
const cellClass = (i, lay, g) => `cell ${isHid(i) ? 't-fog fog' : 't-' + lay[i]}${g ? '' : `${FORKS[i] ? ' fork' : ''}${MERGES.has(i) ? ' merge' : ''}${i >= PN ? ' br' : ''}`}`;
const cellInfo = (i, lay) => isHid(i) ? { icon: '❔', label: '？？？' } : TYPES[lay[i]];
function renderBoard() {
  const g = G.stage === 'goal', path = g ? PATH2 : PATH, lay = g ? LAYOUT2 : LAYOUT;
  const bd = $('#board'); bd.className = g ? 'g' : '';
  bd.innerHTML = path.map(([x, y], i) => {
    const m = cellInfo(i, lay);
    return `<div class="${cellClass(i, lay, g)}" id="k${i}" style="grid-column:${x + 1};grid-row:${y + 1}"><b>${m.icon}</b><small>${m.label}</small><div class="toks" id="c${i}"></div></div>`;
  }).join('');
}
// 霧モード：公開されたマスだけ表示を更新
function updateFog() {
  if (typeof document.getElementById !== 'function') return;
  const g = G.stage === 'goal', lay = g ? LAYOUT2 : LAYOUT;
  lay.forEach((_, i) => {
    const e = document.getElementById('k' + i); if (!e) return;
    const m = cellInfo(i, lay); e.className = cellClass(i, lay, g);
    e.querySelector('b').textContent = m.icon; e.querySelector('small').textContent = m.label;
  });
}
// 盤面が横スクロールのとき（スマホ等）、手番のプレイヤーの駒が見える位置へ自動スクロール
function followCurrent() {
  if (typeof document.getElementById !== 'function') return;
  const w = $('#boardwrap'), c = G.ps[G.t] && document.getElementById('c' + G.ps[G.t].pos);
  if (!w || !c || !c.parentElement || !w.scrollTo) return;
  const e = c.parentElement;
  w.scrollTo({ left: e.offsetLeft - w.clientWidth / 2 + e.offsetWidth / 2, top: w.scrollHeight > w.clientHeight ? e.offsetTop - w.clientHeight / 2 + e.offsetHeight / 2 : 0, behavior: 'smooth' });
}

// 近くの駒だけ表示（手番の人から NEAR マス以内）。遠いマスの駒は、手番の人以外は隠す
let showAllTokens = false;
function nearSet(pos) {
  const adj = {}, link = (a, b) => { (adj[a] = adj[a] || []).push(b); (adj[b] = adj[b] || []).push(a); };
  if (G.stage === 'goal') LAYOUT2.forEach((_, i) => { if (i + 1 < LAYOUT2.length) link(i, i + 1); });
  else NEXT.forEach((ns, i) => ns.forEach(j => link(i, j)));
  const seen = new Set([pos]); let fr = [pos];
  for (let d = 0; d < NEAR; d++) { const nx = []; fr.forEach(i => (adj[i] || []).forEach(j => { if (!seen.has(j)) { seen.add(j); nx.push(j); } })); fr = nx; }
  return seen;
}
function renderTokens() {
  document.querySelectorAll('.toks').forEach(e => e.innerHTML = '');
  const by = {}; G.ps.forEach((p, i) => (by[p.pos] = by[p.pos] || []).push(i));
  const cur = G.ps[G.t], near = showAllTokens || !cur ? null : nearSet(cur.pos);
  Object.keys(by).forEach(pos => {
    const el = $('#c' + pos); if (!el) return;
    let list = by[pos].sort((a, b) => (b === G.t) - (a === G.t)), far = false;
    if (near && !near.has(+pos)) { far = true; list = list.filter(i => i === G.t); }
    const show = list.slice(0, 3), total = by[pos].length;
    el.innerHTML = show.map(i => tok(G.ps[i], i)).join('') + (total > show.length ? `<i class="tok more${far ? ' far' : ''}">${far ? '👥' : '+'}${total - show.length}</i>` : '');
  });
  followCurrent(); Net.sync();
}
// マスにカーソルを合わせる（スマホはタップ）と、そのマスにいる人を一覧表示
function bindBoardHover() {
  const b = $('#board'), pop = $('#cellpop'); if (!b || !pop) return;
  let hideT;
  const show = (e, sticky) => {
    const c = e.target.closest && e.target.closest('.cell'); if (!c) { pop.hidden = true; return; }
    const i = +c.id.slice(1), who = G.ps.map((p, k) => [p, k]).filter(([p]) => p.pos === i);
    if (!who.length) { pop.hidden = true; return; }
    pop.innerHTML = `<b>このマスにいる人（${who.length}）</b>` + who.map(([p, k]) => `<div style="${cv(p.color)}"><i class="dot"></i>${TEAMS[p.team].icon} ${esc(p.name)}</div>`).join('');
    pop.hidden = false; const w = pop.offsetWidth || 160, h = pop.offsetHeight || 80;
    pop.style.left = Math.max(4, Math.min(innerWidth - w - 4, e.clientX + 14)) + 'px'; pop.style.top = Math.max(4, Math.min(innerHeight - h - 4, e.clientY + 14)) + 'px';
    if (sticky) { clearTimeout(hideT); hideT = setTimeout(() => pop.hidden = true, 4500); }
  };
  b.onmousemove = e => show(e, false); b.onmouseleave = () => pop.hidden = true; b.onclick = e => show(e, true);
}

const chip = (b, suffix = '') => `<span class="chip" data-tip="${esc(b.name)}：${esc(b.desc)}" title="${esc(b.name)}：${esc(b.desc)}">${b.icon}${b.name}${suffix}</span>`;
function chips(p, hide) {
  const c = [], S = hide ? Math.min(p.sugar, 1) : p.sugar, tip = (t, label) => `<span class="chip" data-tip="${esc(t)}" title="${esc(t)}">${label}</span>`;
  if (S) c.push(chip(BADGES.sugar, '×' + S));
  if (p.sugar && !hide) { const t = TRAITS[p.trait]; c.push(tip(`好感度：${BADGES.love.desc}${t ? '／性格 ' + t.name + '：' + t.desc : ''}`, `💗${p.love}/10${t ? t.icon + t.name : ''}`)); }
  if (p.live) c.push(chip(BADGES.live));
  if (p.married) c.push(chip(BADGES.married));
  if (p.friends) c.push(chip(BADGES.friends, '×' + p.friends));
  if (p.exes) c.push(chip(BADGES.exes, '×' + p.exes));
  if (p.fame) c.push(chip(BADGES.fame, '×' + p.fame));
  if (p.fbt) c.push(chip(BADGES.fbt));
  if (p.pc) c.push(chip(BADGES.pc));
  if (p.job && JOBS[p.job]) c.push(tip(`${JOBS[p.job].name}：${JOBS[p.job].desc}`, `${JOBS[p.job].icon}${JOBS[p.job].name}`));
  if (p.style && STYLES[p.style]) c.push(tip(`${STYLES[p.style].name}：${STYLES[p.style].desc}`, `${STYLES[p.style].icon}${STYLES[p.style].name}`));
  if (p.royal && p.royal.n > 0) c.push(chip(BADGES.royal, '×' + p.royal.n));
  if (p.regulars) c.push(chip(BADGES.regs, '×' + p.regulars));
  if (p.ally != null && G.ps[p.ally] && p.allyN > 0) c.push(tip(`同盟：${BADGES.ally.desc}（残り${p.allyN}手番）`, `🔗同盟:${esc(G.ps[p.ally].name)}(${p.allyN})`));
  if (p.debt) c.push(chip(BADGES.debt, ' ' + yen(p.debt)));
  if (p.muted > 0) c.push(chip(BADGES.muted));
  if (p.mission && !(G.rules && G.rules.missions === false)) c.push(chip(BADGES.mission));
  p.items.forEach(k => c.push(`<span class="chip it" data-tip="${ITEMS[k].name}：${ITEMS[k].desc}" title="${ITEMS[k].name}：${ITEMS[k].desc}">${ITEMS[k].icon}${ITEMS[k].name}</span>`));
  return c.join('') || '<span class="chip none">なし</span>';
}
function renderLegend() {
  $('#legendBody').innerHTML = '<h4>ステータス</h4>' + Object.values(BADGES).map(b => `<p><b>${b.icon} ${b.name}</b>　${b.desc}</p>`).join('')
    + '<h4>アイテム（自分の番に使う）</h4>' + Object.values(ITEMS).map(i => `<p><b>${i.icon} ${i.name}</b>　${i.desc}</p>`).join('')
    + '<h4>マスの種類</h4><p class="sq">' + Object.values(TYPES).map(t => `${t.icon}${t.label}`).join('　') + '</p>';
}
function renderTurn() {
  const cp = G.ps[G.t], n = G.ps.length, k = (G.order || []).indexOf(G.t) + 1, goal = G.stage === 'goal', left = G.turns - G.round;
  const head1 = goal ? '<b class="big1">🏁 ゴールステージ</b><span>全員がゴールするまで続きます（第${G.goalRound + 1}ラウンド）</span>'
    : `<b class="big1">第 ${G.round} / ${G.turns} ターン</b><span>${left > 0 ? (left <= 5 ? `ゴールステージまであと${left}ターン` : `残り${left}ターン`) : '最終ターン！この後ゴールステージへ'}</span>`;
  const bar = goal ? '' : `<div class="bar"><i style="width:${Math.min(100, (G.round - 1 + k / n) / G.turns * 100)}%"></i></div>`;
  $('#turn').innerHTML = `<div class="t1">${head1}${G.global ? `<span class="gl">🌐 ${esc(G.global.icon)}${esc(G.global.name)}：${esc(G.global.desc)}</span>` : ''}</div>${bar}<div class="t2" style="${cv(cp.color)}">${tok(cp)}<strong>${TEAMS[cp.team].icon}${esc(cp.name)}</strong> の番<small>（手番 ${k}/${n}）</small></div>`;
}
// 手番の順番（ログの上に固定表示。ログが流れても消えない）
function renderOrder() {
  const el = $('#orderbar'); if (!el || !G.order) return;
  const n = G.order.length, oi = Math.max(0, G.order.indexOf(G.t)), W = Math.min(n, 6);
  const one = si => `<span class="oi${si === G.t ? ' cur' : ''}${G.ps[si].done ? ' dn' : ''}">${fmt(`\u0001${si}\u0002`, true)}</span>`;
  el.innerHTML = `<span class="ol">🎲 手番の順番（全${n}人・次の${W}人まで表示）</span>` + [...Array(W)].map((_, k) => (k ? '<i>→</i>' : '') + one(G.order[(oi + k) % n])).join('')
    + (n > W ? `<i>→</i><span class="oi more" title="${esc(G.order.map(si => G.ps[si].name).join(' → '))}">…ほか${n - W}人</span>` : '');
}
const yenS = n => { const a = Math.abs(n); return (n < 0 ? '-' : '') + (a >= 1e8 ? (a / 1e8).toFixed(2).replace(/\.?0+$/, '') + '億' : Math.round(a / 1e4).toLocaleString() + '万'); };
function playerSummary(p, si) {
  const hide = Net.on && si !== Net.seat && !p.exposed, S = hide ? Math.min(p.sugar, 1) : p.sugar, b = [`${TEAMS[p.team].icon}${p.name}`, `💰${yen(p.money)}`];
  if (S) b.push(`🍬${S}`); if (p.married) b.push('💍結婚'); if (p.live) b.push('🏠同棲'); if (p.friends) b.push(`👫${p.friends}`); if (p.exes) b.push(`💔${p.exes}`); if (p.fame) b.push(`⭐${p.fame}`);
  if (JOBS[p.job]) b.push(JOBS[p.job].icon + JOBS[p.job].name); if (p.debt) b.push('💳' + yen(p.debt)); if (p.items.length) b.push('🎒' + p.items.map(k => ITEMS[k].icon + ITEMS[k].name).join('・')); if (p.done) b.push('🏁' + p.rank + '位');
  return b.join('　');
}
// チームの総額と、メンバーの一覧（名前をクリック/タップで詳細）
function renderScore() {
  const tot = [0, 1].map(t => G.ps.filter(p => p.team === t).reduce((s, p) => s + p.money, 0)), pos = tot.map(x => Math.max(0, x));
  const ratio = Math.max(3, Math.min(97, Math.round(pos[0] / Math.max(1, pos[0] + pos[1]) * 100)));
  const pill = si => { const p = G.ps[si]; return `<span class="pill${si === G.t ? ' cur' : ''}${p.done ? ' dn' : ''}" data-pi="${si}" style="${cv(p.color)}">${tok(p, si)}<b>${esc(p.name)}</b><em>${yenS(p.money)}</em></span>`; };
  const blk = t => `<div class="tb t${t}"><div class="th"><b>${TEAMS[t].icon} ${TEAMS[t].name}</b><span>${yen(tot[t])}</span></div><div class="pills">${(G.order || G.ps.map((_, i) => i)).filter(si => G.ps[si].team === t).map(pill).join('')}</div></div>`;
  const lead = tot[0] === tot[1] ? '同点' : `${TEAMS[tot[0] > tot[1] ? 0 : 1].icon}が ${yen(Math.abs(tot[0] - tot[1]))} リード`;
  const my = Net.on ? (Net.spec ? G.t : Net.seat) : G.t, mp = G.ps[my];
  $('#stat').innerHTML = `<div class="vs" title="チームの所持金の比率"><i style="width:${ratio}%"></i></div><div class="vsl">${lead}</div>${blk(0)}${blk(1)}`
    + (mp ? `<div class="pc me ${my === G.t ? 'now' : ''}" style="${cv(mp.color)}"><div class="pt">${tok(mp, my)}<div><strong>${Net.on && !Net.spec ? 'あなた：' : '手番：'}${TEAMS[mp.team].icon}${esc(mp.name)}${mp.done ? ' 🏁' + mp.rank + '位' : ''}</strong><span class="mny">${yen(mp.money)}</span></div></div><div class="chips">${chips(mp, false)}</div></div>` : '');
}
function renderStat() {
  renderTurn(); renderOrder(); renderGlobalBar(); audioTick(); renderQuiz();
  renderScore();
  const cp = G.ps[G.t], own = !(Net.on && G.t !== Net.seat), mine = !G.busy && !G.over && !cp.done && own;
  $('#items').innerHTML = cp.items.map((k, i) => `<button data-i="${i}" ${mine && !cp.muted && !['amulet', 'guard', 'scope'].includes(k) ? '' : 'disabled'} title="${ITEMS[k].desc}">${ITEMS[k].icon} ${ITEMS[k].name}<small> ${ITEMS[k].desc}</small></button>`).join('');
  renderAsk(); renderMission(); renderJoinPlay();
  updateBtn(); Net.sync();
}
const clampTurns = v => Math.max(3, Math.min(99, parseInt(v) || DEFAULT_TURNS));
const turnsHtml = `<label class="tn">ラウンド数（メインステージ） <input id="tn" class="nm" type="number" min="3" max="99" value="${DEFAULT_TURNS}"> ラウンド（全員が1回ずつ動くと1ラウンド）</label>
  <label class="tn chk"><input type="checkbox" id="fog"> 🌫️ 霧モード（マスの一部が見えない。誰かが止まると公開）</label>
  <label class="tn">初期所持金 <select id="rmoney" class="nm"><option value="1000000">100万円</option><option value="3000000" selected>300万円</option><option value="5000000">500万円</option><option value="10000000">1000万円</option></select></label>
  <label class="tn chk"><input type="checkbox" id="rbattle" checked> ⚔️ 対戦・妨害あり（対戦マス・略奪・同盟・泥棒などのアイテム）</label>
  <label class="tn chk"><input type="checkbox" id="revents" checked> 🌐 全体イベントあり（Vketシーズンなど）</label>
  <label class="tn chk"><input type="checkbox" id="rmission" checked> 🎴 隠しミッションあり</label>`;
const readRules = () => ({ fog: $('#fog').checked, money: +$('#rmoney').value || START_MONEY, battle: $('#rbattle').checked, events: $('#revents').checked, missions: $('#rmission').checked, late: $('#rlate') ? $('#rlate').checked : true });

// 名前は N(p) の目印で文章に埋め込み、表示時に「プレイヤー色のバッジ」(ログ) / 通常の文字(メッセージ) に変換する
const N = p => `\u0001${G.ps.indexOf(p)}\u0002`;
const fmt = (t, html) => String(t).replace(/\u0001(\d+)\u0002/g, (_, i) => {
  const p = G.ps[+i]; if (!p) return '';
  return html ? `<b class="who" style="${cv(p.color)}"><i class="tok pi${+i}" style="${cv(p.color)}">${p.img ? '' : esc([...p.name][0])}</i>${esc(p.name)}</b>` : p.name;
});
const _log = t => {
  const ol = $('#log'); ol.insertAdjacentHTML('afterbegin', `<li${String(t).startsWith('▶') ? ' class="sep"' : ''}>${fmt(t, true)}</li>`);
  while (ol.children && ol.children.length > 300) ol.lastChild.remove(); // 直近300件を保持（スクロールで過去ログを確認）
};
// ===== イベント演出（マスの種類ごとの見た目・数字の増減・表示時間バー）=====
const _restart = (e, c) => { if (!e || !e.classList || !e.classList.remove) return; e.classList.remove(c); void e.offsetWidth; e.classList.add(c); };
const _head = (t, ty) => {
  $('#evh').textContent = fmt(t, false);
  const e = $('#event'); if (e.dataset) e.dataset.ty = ty || '';
  $('#evicon').textContent = ty && TYPES[ty] ? TYPES[ty].icon : '';
  if (ty) { _restart(e, 'pop'); _sfx(ty === 'duel' ? 'duel' : 'land'); bgmOverride = ty === 'duel' ? 'battle' : null; }
};
const head = (t, ty) => { _head(t, ty); Net.bc({ k: 'head', v: t, ty }); };
const _sign = k => { _sfx(k === 'plus' ? 'plus' : 'minus'); const e = $('#event'); if (e && e.classList && e.classList.remove) e.classList.remove('plus', 'minus'); _restart(e, k); };
const fx = k => { if (!k) return; _sign(k); Net.bc({ k: 'fx', v: k }); };
const _hold = ms => { const b = $('#evbar i'); if (!b || !b.style) return; b.style.animation = 'none'; void b.offsetWidth; b.style.animation = `evbar ${ms}ms linear forwards`; };
const hold = ms => { _hold(ms); Net.bc({ k: 'hold', ms }); };
const _say = t => $('#msg').textContent = fmt(t, false);
const log = t => { _log(t); Net.bc({ k: 'log', v: t }); };
const say = t => { _say(t); Net.bc({ k: 'say', v: t }); };
const showDice = v => { $('#dice').textContent = v; Net.bc({ k: 'dice', v }); };
// ロールボタン：自分の番のときだけ押せる（オンライン時）
const updateBtn = () => { const b = $('#roll'); if (b) b.disabled = G.busy || G.over || (Net.on && G.t !== Net.seat); };

// プレイヤー画像をCSSクラス(.pi0〜)として登録（ログ内の小アイコンを軽量にするため）
function setPlayerStyles() {
  if (!document.head) return;
  let s = document.getElementById('pstyle');
  if (!s) { s = document.createElement('style'); s.id = 'pstyle'; document.head.appendChild(s); }
  s.textContent = G.ps.map((p, i) => p.img ? `.pi${i}{background-image:url(${p.img})}` : '').join('');
}

// ゲーム中の名前・写真の変更
function openProfile() {
  const me = G.ps[Net.seat], d = $('#prof'); let img = me.img;
  d.innerHTML = `<h3>名前・写真を変更</h3><div class="prow"><label class="ph" style="--c:${me.color};${img ? `background-image:url(${img})` : ''}"><input type="file" accept="image/*" hidden><span ${img ? 'hidden' : ''}>写真</span></label>
    <input class="nm" maxlength="8" value="${esc(me.name)}"><div class="cwrap"></div></div>${photoNote(Net.on)}<div class="row"><button class="big" id="psave">保存</button><button id="pcancel">キャンセル</button></div>`;
  d.querySelector('input[type=file]').onchange = async e => {
    const f = e.target.files[0]; if (!f) return; img = await loadPhoto(f);
    const ph = d.querySelector('.ph'); ph.style.backgroundImage = `url(${img})`; ph.querySelector('span').hidden = true;
  };
  const cc = colorCtl(d.querySelector('.cwrap'), COLORS[Net.seat]); if (me.color !== COLORS[Net.seat]) cc.setValue(me.color);
  $('#pcancel').onclick = () => d.close();
  $('#psave').onclick = () => { d.close(); applyProfile(cleanProfile({ name: d.querySelector('.nm').value.trim(), img, color: cc.get() }, me.name)); };
  d.showModal();
}
window.VER_UI = '2026.10.25-t3';

// ===== クイズ：問題の登録エディタ（ロビー/設定画面） =====
let _qid = 0;
function qEditor(host, onChange) {
  const uid = ++_qid; let qs = [];
  const blank = t => ({ t, text: '', choices: ['', '', '', ''], ans: t === 'mc' ? 0 : null });
  const clean = () => qs.map(q => {
    const text = q.text.trim().slice(0, 60); if (!text) return null;
    if (q.t === 'num') return Number.isFinite(q.ans) ? { t: 'num', text, ans: q.ans } : null;
    const idx = []; q.choices.forEach((c, k) => { if (c.trim()) idx.push(k); });
    if (idx.length < 2 || !idx.includes(q.ans)) return null;
    return { t: 'mc', text, choices: idx.map(k => q.choices[k].trim().slice(0, 24)), ans: idx.indexOf(q.ans) };
  }).filter(Boolean);
  const count = () => { const d = host.closest('details'), n = d && d.querySelector('.qn'); if (n) n.textContent = ` （有効 ${clean().length}問）`; };
  const changed = () => { count(); if (onChange) onChange(); };
  const render = () => {
    host.innerHTML = '<p class="note">問題は出題者本人は回答できません。正解者が賞金をもらい、全員不正解なら出題者にボーナスが入ります。未入力・選択肢2個未満・正解未選択の問題は無効です。</p>'
      + qs.map((q, i) => `<div class="qf" data-i="${i}"><div class="qrow"><select class="qty"><option value="mc"${q.t === 'mc' ? ' selected' : ''}>4択（選択式）</option><option value="num"${q.t === 'num' ? ' selected' : ''}>数当て（一番近い人が勝ち）</option></select><button type="button" class="qdel">削除</button></div>
        <input class="nm qtx" maxlength="60" placeholder="問題文" value="${esc(q.text)}">
        ${q.t === 'mc' ? q.choices.map((c, k) => `<label class="qc"><input type="radio" name="qa${uid}_${i}" class="qa" value="${k}"${q.ans === k ? ' checked' : ''}><input class="nm qchx" data-k="${k}" maxlength="24" placeholder="選択肢${'ABCD'[k]}${k < 2 ? '（必須）' : '（任意）'}" value="${esc(c)}"></label>`).join('') + '<small>○を押した選択肢が正解です</small>'
          : `<input class="nm qnn" type="number" placeholder="正解の数字" value="${q.ans === null ? '' : q.ans}">`}</div>`).join('')
      + (qs.length < QMAX ? '<button type="button" class="qadd">＋問題を追加</button>' : '');
    host.querySelectorAll('.qf').forEach(f => {
      const i = +f.dataset.i, q = qs[i];
      f.querySelector('.qty').onchange = e => { qs[i] = { ...blank(e.target.value), text: q.text }; render(); changed(); };
      f.querySelector('.qdel').onclick = () => { qs.splice(i, 1); render(); changed(); };
      f.querySelector('.qtx').oninput = e => { q.text = e.target.value; changed(); };
      f.querySelectorAll('.qchx').forEach(x => x.oninput = e => { q.choices[+x.dataset.k] = e.target.value; changed(); });
      f.querySelectorAll('.qa').forEach(x => x.onchange = () => { q.ans = +x.value; changed(); });
      const nn = f.querySelector('.qnn'); if (nn) nn.oninput = e => { q.ans = e.target.value === '' ? null : parseFloat(e.target.value); changed(); };
    });
    const add = host.querySelector('.qadd'); if (add) add.onclick = () => { qs.push(blank('mc')); render(); changed(); };
  };
  render(); count();
  return { get: clean };
}

// ===== クイズ：回答パネル =====
function quizSeat() { return Net.on ? Net.seat : (G.quiz ? G.quiz.cur : -1); }
function renderQuiz() {
  const el = $('#quiz'), q = G.quiz; if (!el) return;
  if (!q) { if (el._sig !== '') { el.hidden = true; el.innerHTML = ''; el._sig = ''; } return; }
  const seat = quizSeat(), can = q.phase === 'ask' && seat >= 0 && seat !== q.author && !q.answered.includes(seat);
  const tl = q.phase === 'ask' ? `⏱ ${q.left}秒` : '結果発表';
  const sig = JSON.stringify([q.phase, q.text, q.answered, can, q.cur, q.reveal ? 1 : 0]);
  if (el._sig === sig) { const t = $('#qleft'); if (t) t.textContent = tl; return; } // タイマーだけ更新（入力中の数字を消さない）
  el._sig = sig; el.hidden = false;
  const who = s => fmt(`\u0001${s}\u0002`, true);
  let h = `<div class="qh"><span>❓ ${who(q.author)} さんの問題</span><b id="qleft">${tl}</b></div><div class="qtext">${esc(q.text)}</div>`;
  if (q.phase === 'ask') {
    if (!Net.on && q.cur != null) h += `<div class="qwho">今の回答者：${who(q.cur)}（他の人は画面を見ないでね）</div>`;
    h += q.type === 'mc'
      ? `<div class="qchs">${q.choices.map((c, i) => `<button data-a="${i}" ${can ? '' : 'disabled'}>${'ABCD'[i]}. ${esc(c)}</button>`).join('')}</div>`
      : `<div class="qnum"><input type="number" id="qin" ${can ? '' : 'disabled'} placeholder="数字を予想"><button id="qgo" ${can ? '' : 'disabled'}>回答</button></div>`;
    const note = Net.on && seat === q.author ? 'あなたの問題です。回答はみんなに任せよう' : (q.answered.includes(seat) ? '回答済み！みんなを待っています' : '');
    h += `<div class="qst">${note}<br>回答済み：${q.answered.length ? q.answered.map(who).join(' ') : 'まだ誰も'}</div>`;
  } else {
    const r = q.reveal;
    h += `<div class="qans">正解：<b>${esc(r.correct)}</b></div><ul class="qres">${r.rows.map(x => `<li>${who(x.seat)} ${esc(x.pick)} ${x.win ? '✅' : '❌'}${x.note ? ` <small>${esc(x.note)}</small>` : ''}</li>`).join('')}</ul><div class="qst">${esc(r.summary)}</div>`;
  }
  el.innerHTML = h;
}

// 観戦者向け：途中参戦ボタン
let jpSig = '';
function renderJoinPlay() {
  const el = $('#joinplay'); if (!el) return;
  const can = Net.on && Net.spec && !G.over && G.ps.length < MAX_PLAYERS && !(G.rules && G.rules.late === false), allow = Net.allowTeam !== false;
  const sig = can + '|' + allow + '|' + G.ps.length; if (sig === jpSig) return; jpSig = sig;
  el.innerHTML = can ? `<div class="jp"><b>⚔️ 途中参戦</b><span>${allow ? 'チームを選んで、参加者として参戦できます（今のラウンドの最後から手番に加わります）' : 'チームは自動で決まります。参加者として参戦できます'}</span><div>${allow ? [0, 1].map(t => `<button data-t="${t}">${TEAMS[t].icon} ${TEAMS[t].name}で参戦</button>`).join('') : '<button data-t="-1">⚔️ 参戦する</button>'}</div></div>` : '';
}

// ===== ボード定義 =====
// ===== メインステージ：外周ループ＋3つの分かれ道（分岐→合流）=====
const COLS = 14, ROWS = 9;
const PATH = [], NEXT = [], FORKS = {}, MERGES = new Set();
for (let c = 0; c < COLS; c++) PATH.push([c, 0]);
for (let r = 1; r < ROWS; r++) PATH.push([COLS - 1, r]);
for (let c = COLS - 2; c >= 0; c--) PATH.push([c, ROWS - 1]);
for (let r = ROWS - 2; r >= 1; r--) PATH.push([0, r]);
const PN = PATH.length; // 外周42マス
for (let i = 0; i < PN; i++) NEXT[i] = [(i + 1) % PN];
const PREV = [];

const TYPES = {
  start:{icon:'🚪',label:'ログイン'}, goal:{icon:'🏁',label:'ゴール'},
  pay:{icon:'💰',label:'臨時収入'}, loss:{icon:'💸',label:'ピンチ'},
  world:{icon:'🌍',label:'ワールド'}, job:{icon:'🛠️',label:'お仕事'},
  shukai:{icon:'🎪',label:'集会'}, event:{icon:'🎤',label:'個人イベ'},
  sugar:{icon:'🍬',label:'お砂糖'}, marry:{icon:'💍',label:'結婚'},
  date:{icon:'💞',label:'お砂糖デート'}, dj:{icon:'🎧',label:'DJイベ'},
  photo:{icon:'📸',label:'撮影会'}, shop:{icon:'🛒',label:'BOOTH'},
  trouble:{icon:'⚠️',label:'トラブル'}, gacha:{icon:'🎰',label:'ガチャ'},
  warp:{icon:'🌀',label:'ワープ'}, rest:{icon:'💤',label:'寝落ち'},
  collab:{icon:'🤝',label:'コラボ'}, social:{icon:'🍹',label:'交流'},
  quiz:{icon:'❓',label:'クイズ'}, item:{icon:'🎁',label:'アイテム'},
  ex:{icon:'💔',label:'元お砂糖'}, past:{icon:'🕵️',label:'お砂糖の過去'}, friend:{icon:'👫',label:'友達'},
  offkai:{icon:'🍻',label:'オフ会'},
  duel:{icon:'⚔️',label:'対戦'}, tax:{icon:'🏛️',label:'税金・寄付'}, invest:{icon:'🏗️',label:'制作投資'}, avatar:{icon:'👗',label:'着せ替え'},
  report:{icon:'🚨',label:'通報・BAN'}, gamble:{icon:'🃏',label:'ギャンブル'}, detective:{icon:'🔎',label:'探偵'}, rob:{icon:'💘',label:'略奪'}, alliance:{icon:'🔗',label:'同盟'}, divorce:{icon:'📄',label:'離婚'}, tata:{icon:'🌪️',label:'多糖・修羅場'}, sns:{icon:'📱',label:'SNS'}
};

const LAYOUT = ['start','world','pay','shukai','sugar','shop','friend','event','job','item','photo','trouble','date','duel',
 'dj','marry','invest','collab','warp','quiz','sugar','offkai','loss','job','social','shukai','rest','world','gacha','past',
 'date','divorce','event','report','ex','dj','quiz','tax','job','warp','sns','item'];
// 分かれ道：from=分岐マス / to=合流マス / cells=寄り道の座標 / types=各マスの種類 / opts=選択肢の名前（先頭は本道）
const BRANCHES = [
  { from: 38, to: 17, opts: ['外周を進む', '🌉近道ブリッジ（短縮・ドラマ多め）'],
    cells: [...Array(12)].map((_, i) => [i + 1, 4]),
    types: ['friend','ex','detective','offkai','item','rob','tata','duel','quiz','shukai','date','divorce'] },
  { from: 4, to: 7, opts: ['直進', '💎お宝の寄り道（稼げる）'],
    cells: [[4,1],[4,2],[5,2],[6,2],[7,2],[7,1]], types: ['shukai','event','item','dj','invest','gamble'] },
  { from: 24, to: 27, opts: ['直進', '🌙ラブ寄り道（恋愛イベ多め）'],
    cells: [[10,7],[10,6],[9,6],[8,6],[7,6],[7,7]], types: ['date','sugar','avatar','offkai','alliance','pay'] }
];
BRANCHES.forEach(b => {
  let prev = b.from;
  b.cells.forEach((xy, k) => { const id = PATH.length; PATH.push(xy); LAYOUT.push(b.types[k]); NEXT[id] = []; NEXT[prev].push(id); prev = id; });
  NEXT[prev].push(b.to); FORKS[b.from] = b.opts; MERGES.add(b.to);
});
NEXT.forEach((ns, i) => ns.forEach(j => (PREV[j] = PREV[j] || []).push(i)));

const TEXT = {
  pay:['ワールド売上が入った','アバター販売が好調','BOOTHで投げ銭をもらった','フレンドに奢ってもらった','お年玉イベで大量ゲット','衣装の受注制作が完売','Vket出展が大盛況','配信の投げ銭が止まらない'],
  loss:['回線が落ちて有料イベを逃した','フルトラがズレて機材を買い直し','課金アバターを衝動買い','PCが熱暴走して修理','HMDのケーブルを踏んで断線','イベ用の会場費を払った','コントローラーを床に叩きつけた'],
  job:['ワールド制作の納品','バーテンダーのバイト','ダンサーの出演料','ショップ店員の給料日','アバター改変の依頼','ライブ配信のスタッフ業'],
  world:[['夜景ワールドで友達と合流',300,0],['隠しギミックを見つけて話題に',200,1],['初見さんを案内してあげた',400,0],['ワールドのいいねが伸びた',500,1],['ミラーで自撮りしまくった',0,1],['迷子になって時間を溶かした',-200,0],['イベワールドで偶然フレンドと再会',300,0],['プライベートでまったり',400,0],['絶景ポイントで寝転んだ',300,0]],
  trouble:[['荒らしに絡まれてブロックした',-200,0,0],['マイクが入りっぱなしで独り言が流出',-300,-1,0],['改変アバターが透明になった',-300,0,0],['インスタンスが満員で待ちぼうけ',0,0,1],['炎上しかけたが謝罪で収まった',-400,-1,0],['グラボが逝った',-600,0,0],['変な噂を流された',-200,-1,0],['アップデートで入れなくなった',0,0,1]],
  gacha:[['大当たり！限定アバターを引いた',2000,1],['当たり！',800,0],['ハズレ…',-300,0],['ダブりばかり',-100,0],['SSR確定演出！',1500,0],['課金しすぎた',-600,0],['ミミックに噛まれた',-200,0]],
  date:[['お揃いアバターでデート',300,1],['記念日を祝った',800,0],['夜景ワールドで寝落ち通話',200,0],['ペアでフォトコンに入賞',900,1]]
};

// ゲーム内のお金の規模。数字を変えると全イベントの金額が一括で増減します（1000＝開始300万円・1回の収入が数十万〜数百万円。20なら数万円規模）
const MONEY_SCALE = 1000;
const START_MONEY = 3000 * MONEY_SCALE;
const COLORS = ['#ff9ec4', '#7cc4ff', '#ffd35c', '#9be08f']; // ピンク・水色・黄・緑（ログの名前バッジなどに使用）


const DEFAULT_TURNS = 6; // チーム戦は人数が多いので短め（ルーム作成者が変更可能。3〜99）

// ===== ゴールステージ（一本道・8列×3段の蛇行）=====
const PATH2 = [];
for (let r = 0; r < 3; r++) for (let c = 0; c < 8; c++) PATH2.push([r % 2 ? 7 - c : c, r]);
const LAYOUT2 = ['start','world','pay','shukai','item','sugar','duel','shop','gacha','dj','ex','date','quiz','rob','item','divorce',
 'marry','event','tata','tax','offkai','warp','gamble','goal'];
const GOAL_BONUS = [5000, 4000, 3000, 2500, 2000, 1500, 1000, 800, 600, 400]; // ゴール順ボーナス（基準額。11位以降は最後と同額）

// ===== アイテム =====
const ITEMS = {
  dice2:{icon:'🎲🎲',name:'ダブルダイス',desc:'サイコロ2個'},
  dice3:{icon:'🎲🎲🎲',name:'トリプルダイス',desc:'サイコロ3個'},
  plane:{icon:'✈️',name:'飛行機',desc:'10マス進む'},
  train:{icon:'🚄',name:'新幹線',desc:'8マス進む'},
  ship:{icon:'🚢',name:'船',desc:'6マス進む'},
  bike:{icon:'🛵',name:'バイク',desc:'出目+3'},
  thief:{icon:'🦹',name:'泥棒',desc:'相手1人のアイテムを1つ盗む（使ってもサイコロは振れる）',act:true},
  block:{icon:'🚫',name:'ブロック',desc:'相手1人を次の手番1回休みにする（使ってもサイコロは振れる）',act:true},
  mute:{icon:'🔇',name:'ミュート',desc:'相手1人は次の手番アイテムを使えない（使ってもサイコロは振れる）',act:true},
  swap:{icon:'🔄',name:'位置入れ替え',desc:'相手1人と位置を入れ替える（使ってもサイコロは振れる）',act:true},
  guard:{icon:'🛡️',name:'ガード',desc:'相手からの妨害・お砂糖の略奪などを1回無効にする（自動）'},
  scope:{icon:'🔭',name:'望遠鏡',desc:'(霧モード)見えないマスを5つ公開。取得した瞬間に使われる'},
  amulet:{icon:'🧿',name:'お守り',desc:'ピンチ・トラブルを1回無効(自動)'}
};
const ITEM_POOL = ['dice2','dice2','dice2','dice3','plane','train','ship','ship','bike','bike','amulet','amulet','thief','block','mute','swap','guard','guard'];
const HOSTILE = ['thief', 'block', 'mute', 'swap']; // 「対戦・妨害なし」のルームでは出ない

// ===== ステータスアイコンの説明（プレイヤー欄・凡例に表示）=====
const BADGES = {
  sugar:  { icon: '🍬', name: 'お砂糖', desc: '恋人。毎ターン収入が入る。2人以上（多糖）だと稼げるがバレるリスクも' },
  live:   { icon: '🏠', name: '同棲', desc: 'お砂糖と同棲中。毎ターンの収入アップ' },
  married:{ icon: '💍', name: '結婚', desc: '毎ターン家計の収入。多糖のまま結婚するとお砂糖が1人に絞られる' },
  friends:{ icon: '👫', name: '友達', desc: 'お砂糖に変化することがある' },
  exes:   { icon: '💔', name: '元お砂糖', desc: '遭遇イベで金を取られたり、復縁・和解することも' },
  fame:   { icon: '⭐', name: '人気度', desc: '1つにつきイベ収入+10%（最大5）。終了時に加点' },
  fbt:    { icon: '🕺', name: 'フルトラ', desc: '集会・イベ・DJなどの収入+30%' },
  pc:     { icon: '💻', name: '高性能PC', desc: 'ピンチ・損失が半分になる' },
  love:   { icon: '💗', name: '好感度', desc: 'お砂糖との仲の良さ(0〜10)。8以上で収入1.5倍、1以下だと自然消滅しやすい' },
  royal:  { icon: '📈', name: '印税', desc: 'ワールド制作の投資の見返り。残りターンの間、毎ターン収入' },
  ally:   { icon: '🔗', name: '同盟', desc: '同盟中。相手の収入の30%が自分にも入る。同盟マスで裏切ることも' },
  debt:   { icon: '💳', name: '借金', desc: '借りたお金。毎ターン利息がつき、最終得点から引かれる' },
  muted:  { icon: '🔇', name: 'ミュート', desc: '次の手番はアイテムを使えない' },
  regs:   { icon: '🎪', name: '常連', desc: '集会の常連。1人につき集会の収入+15%（最大5人）' },
  mission:{ icon: '🎴', name: 'ミッション', desc: '隠しミッションを持っている（内容は本人だけが見られる）' }
};
window.VER_DATA = '2026.10.25-t1';

// ===== クイズ（登録された問題を全員が回答）=====
const ANSWER_SEC = 20;        // 回答の制限時間（秒）
const QUIZ_REWARD = 1000;     // 正解者への報酬（基準額。MONEY_SCALE倍）
const QUIZ_AUTHOR_BONUS = 1500; // 全員不正解のときの出題者ボーナス
const QMAX = 3;               // 1人が登録できる問題数

// ===== 職業 / 着せ替え：得意なマスの収入が増える =====
const JOBS = {
  none:     { icon: '🛌', name: '無職', desc: '得意なマスはないが、出費（マイナス）が20%軽くなる', types: [], f: 1, lossF: 0.8 },
  maker:   { icon: '🛠️', name: 'ワールド制作者', desc: 'お仕事・制作投資・BOOTHの収入+30%', types: ['job', 'invest', 'shop'], f: 1.3 },
  dj:      { icon: '🎧', name: 'DJ', desc: 'DJ・個人イベ・集会の収入+30%', types: ['dj', 'event', 'shukai'], f: 1.3 },
  dancer:  { icon: '💃', name: 'ダンサー', desc: '撮影会・オフ会・個人イベ・デートの収入+25%', types: ['photo', 'offkai', 'event', 'date'], f: 1.25 },
  bartender:{ icon: '🍸', name: 'バーテンダー', desc: '集会・交流・お砂糖・友達の収入+30%', types: ['shukai', 'social', 'sugar', 'friend'], f: 1.3 },
  streamer:{ icon: '📺', name: '配信者', desc: 'SNS・撮影会・ガチャ・クイズの収入+30%', types: ['sns', 'photo', 'gacha', 'quiz'], f: 1.3 },
  designer:{ icon: '👗', name: 'アバター屋', desc: 'BOOTH・着せ替え・アイテム・ガチャの収入+30%', types: ['shop', 'avatar', 'item', 'gacha'], f: 1.3 }
};
const STYLES = {
  cute: { icon: '🎀', name: 'かわいい系', desc: 'お砂糖・デート・友達・結婚・撮影会の収入+30%', types: ['sugar', 'date', 'friend', 'marry', 'photo'], f: 1.3 },
  cool: { icon: '😎', name: 'かっこいい系', desc: 'DJ・個人イベ・集会・対戦の収入+25%', types: ['dj', 'event', 'shukai', 'duel'], f: 1.25 },
  meme: { icon: '🤡', name: 'ネタ系', desc: 'SNS・クイズ・ガチャ・ギャンブル・ワールドの収入+30%', types: ['sns', 'quiz', 'gacha', 'gamble', 'world'], f: 1.3 }
};

// ===== お砂糖の性格（好感度と収入に影響）=====
const TRAITS = {
  amae:  { icon: '🐶', name: '甘えん坊', desc: '収入は少なめ(×0.8)だが、毎ターン好感度が上がる', inc: 0.8 },
  tsun:  { icon: '😾', name: 'ツンデレ', desc: '収入は多め(×1.3)だが、好感度が毎ターン上下する', inc: 1.3 },
  shikkari:{ icon: '📋', name: 'しっかり者', desc: '収入やや多め(×1.1)で、好感度が下がっても自然消滅しない', inc: 1.1 },
  free:  { icon: '🦋', name: '自由人', desc: '収入ふつう。ときどき好感度が下がる', inc: 1.0 }
};

// ===== 隠しミッション（達成で最終得点にボーナス）=====
const MISSION_BONUS = 3000; // 基準額（MONEY_SCALE倍）
const MISSIONS = {
  sugar2:  { desc: 'お砂糖を2人以上にして終える', ok: p => p.sugar >= 2, prog: p => `${p.sugar}/2人` },
  shukai3: { desc: '集会を3回開く', ok: p => stc(p, 'shukai') >= 3, prog: p => `${stc(p, 'shukai')}/3回` },
  friend3: { desc: '友達を3人以上にして終える', ok: p => p.friends >= 3, prog: p => `${p.friends}/3人` },
  married: { desc: '結婚して終える', ok: p => p.married, prog: p => p.married ? '結婚中' : '未結婚' },
  laps2:   { desc: 'メインステージを2周する', ok: p => stc(p, 'laps') >= 2, prog: p => `${stc(p, 'laps')}/2周` },
  items4:  { desc: 'アイテムを4回使う', ok: p => stc(p, 'items') >= 4, prog: p => `${stc(p, 'items')}/4回` },
  duel2:   { desc: '対戦に2回勝つ', ok: p => stc(p, 'duel') >= 2, prog: p => `${stc(p, 'duel')}/2勝` },
  quiz2:   { desc: 'クイズに2回正解する', ok: p => stc(p, 'quiz') >= 2, prog: p => `${stc(p, 'quiz')}/2回` },
  fame3:   { desc: '人気度3以上で終える', ok: p => p.fame >= 3, prog: p => `⭐${p.fame}/3` },
  rich:    { desc: '最終所持金がトップで終える', ok: p => G.ps.every(q => q === p || q.money <= p.money), prog: p => G.ps.every(q => q === p || q.money <= p.money) ? '現在トップ' : '現在は2位以下' },
  reunion: { desc: '元お砂糖と復縁する', ok: p => stc(p, 'reunion') >= 1, prog: p => `${stc(p, 'reunion')}/1回` },
  invest:  { desc: 'ワールド制作に投資する', ok: p => stc(p, 'invest') >= 1, prog: p => `${stc(p, 'invest')}/1回` },
  rob1:    { desc: 'お砂糖の略奪に成功する', ok: p => stc(p, 'rob') >= 1, prog: p => `${stc(p, 'rob')}/1回` }
};
const stc = (p, k) => (p.st && p.st[k]) || 0;

// ===== 全体イベント（ラウンドの頭に全員へ効果）。rounds:1 のものは 3〜7ラウンド続く／rounds:0 は一回きり =====
const GLOBALS = [
  { icon: '🎪', name: 'Vketシーズン', desc: '集会・個人イベ・DJ・撮影会の収入が2倍', rounds: 1, types: ['shukai', 'event', 'dj', 'photo'], f: 2 },
  { icon: '🛠️', name: 'サーバーメンテナンス', desc: '全員が次の手番を1回休み', rounds: 0, skipAll: true },
  { icon: '🏷️', name: '大型セール', desc: '出費（マイナス）が半分になる', rounds: 1, lossF: 0.5 },
  { icon: '📉', name: '円安インフレ', desc: '出費（マイナス）が1.5倍になる', rounds: 1, lossF: 1.5 },
  { icon: '💞', name: 'ラブ週間', desc: 'お砂糖・デート・オフ会・友達・結婚の収入が1.5倍', rounds: 1, types: ['sugar', 'date', 'offkai', 'friend', 'marry'], f: 1.5 },
  { icon: '🎁', name: 'ワールドフェスタ', desc: '全員に臨時収入！', rounds: 0, gift: 600 },
  { icon: '💼', name: '転職フェア', desc: '全員が職業を選び直せる（無職もOK。手番は進まない）', rounds: 0, jobFair: true }
];

// ===== チーム戦 =====
const MAX_PLAYERS = 20, MAX_SPECS = 6, NEAR = 5, GOAL_ROUNDS_MAX = 4; // 参加者20人／観戦者6人／近くの駒を表示するマス数／ゴールステージの最大ラウンド
const TEAMS = [{ icon: '🔴', name: 'あかチーム' }, { icon: '🔵', name: 'あおチーム' }];
function hsl2hex(h, s, l) {
  s /= 100; l /= 100; const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l), f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return '#' + [f(0), f(8), f(4)].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
}
// チームごとの標準色（赤〜橙系 / 青〜緑系）。k = チーム内の何人目か
const teamColor = (team, k) => team ? hsl2hex(170 + (k % 10) * 8, 70, 58 + (k % 2) * 9) : hsl2hex((345 + (k % 10) * 8) % 360, 85, 66 - (k % 2) * 6);

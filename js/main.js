// ファイルのバージョン確認：一部だけ古いファイルが残っていると画面が崩れるため、警告を出す
(function () {
  const v = window.APP_VER, got = { 'js/data.js': window.VER_DATA, 'js/ui.js': window.VER_UI, 'js/net.js': window.VER_NET, 'js/game.js': window.VER_GAME, 'js/extra.js': window.VER_EXTRA, 'js/audio.js': window.VER_AUDIO };
  let css = ''; try { css = getComputedStyle(document.documentElement).getPropertyValue('--ver').replace(/["' ]/g, ''); } catch (e) {}
  got['css/style.css'] = css;
  const bad = Object.keys(got).filter(k => got[k] !== v);
  if (bad.length) {
    const d = document.createElement('div'); d.id = 'verwarn'; d.setAttribute('role', 'alert');
    d.textContent = '⚠️ ファイルの一部が古いままです（' + bad.join('、') + '）。GitHubへ全ファイルを上書きアップロードし、Ctrl+F5（スマホはキャッシュ削除して再読み込み）してください。';
    document.body.prepend(d);
  }
  const t = document.createElement('p'); t.className = 'ver'; t.textContent = 'バージョン ' + v; document.body.append(t);
})();
buildSetup(startGame);

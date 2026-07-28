// gen.mjs — data/json から個人専用サイト(static)を /site に生成する。
import { fileURLToPath } from 'url';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const JSON_DIR = path.join(ROOT, 'data', 'json');
const SITE = path.join(ROOT, 'site');

const machines = JSON.parse(fs.readFileSync(path.join(JSON_DIR, 'machines.json'), 'utf-8'));
const news = JSON.parse(fs.readFileSync(path.join(JSON_DIR, 'news.json'), 'utf-8'));
const pages = JSON.parse(fs.readFileSync(path.join(JSON_DIR, 'pages.json'), 'utf-8'));
const DASH_PATH = path.join(ROOT, 'data', 'dash.json');
const dashMap = fs.existsSync(DASH_PATH) ? JSON.parse(fs.readFileSync(DASH_PATH, 'utf-8')) : {};

// 画像ローカル化マップ（mirror.mjs が生成）。あれば src/thumb をローカルパスに置換。
const IMG_MAP_PATH = path.join(ROOT, 'data', 'img-map.json');
const imgMap = fs.existsSync(IMG_MAP_PATH) ? JSON.parse(fs.readFileSync(IMG_MAP_PATH, 'utf-8')) : {};
const rewriteImgs = (html) => {
  if (!html || !Object.keys(imgMap).length) return html;
  return html.replace(/(src|href)="(https:\/\/suroschool\.jp\/[^"]+)"/g, (m, attr, url) =>
    imgMap[url] ? `${attr}="${imgMap[url]}"` : m);
};
if (Object.keys(imgMap).length) {
  for (const m of machines) { m.nerai_html = rewriteImgs(m.nerai_html); m.kaiseki_html = rewriteImgs(m.kaiseki_html); if (imgMap[m.thumb]) m.thumb = imgMap[m.thumb]; }
  for (const a of news) { a.content_html = rewriteImgs(a.content_html); if (imgMap[a.thumb]) a.thumb = imgMap[a.thumb]; }
  for (const p of pages) { p.content_html = rewriteImgs(p.content_html); if (imgMap[p.thumb]) p.thumb = imgMap[p.thumb]; }
}
// 深さ1ページ(m/ n/ p/)からは ../ を前置。トップ階層はそのまま。
const fixDepth = (html, depth) => depth ? html.replace(/(src|href)="(img\/[^"]+)"/g, `$1="${'../'.repeat(depth)}$2"`) : html;

fs.mkdirSync(path.join(SITE, 'm'), { recursive: true });
fs.mkdirSync(path.join(SITE, 'n'), { recursive: true });
fs.mkdirSync(path.join(SITE, 'p'), { recursive: true });
fs.mkdirSync(path.join(SITE, 'assets'), { recursive: true });

const esc = (s) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fnameFor = (m) => m.slug + '.html';

// ===== 共通レイアウト =====
const layout = (title, body, depth = 0, extraHead = '') => {
  const root = '../'.repeat(depth);
  return `<!DOCTYPE html><html lang="ja"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow,noarchive">
<script>if(!localStorage.getItem('ssg_unlocked'))document.documentElement.classList.add('locked');</script>
<style>.pin-gate{display:none}html.locked .pin-gate{display:flex;position:fixed;inset:0;z-index:99999;background:#fff}html.locked body{overflow:hidden}</style>
<title>${esc(title)} | スマスロ期待値 (個人アーカイブ)</title>
<link rel="stylesheet" href="${root}assets/style.css">
<link rel="manifest" href="${root}manifest.webmanifest">
<meta name="theme-color" content="#ffffff">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<link rel="apple-touch-icon" href="${root}assets/icon.svg">
<link rel="icon" href="${root}assets/icon.svg">
<script>if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('${root}sw.js').catch(function(){})});}</script>
<script>window.__ROOT__='${root}';</script>
${extraHead}
</head><body>
<div class="pin-gate" id="pinGate">
  <form class="pin-card" id="pinForm">
    <div class="pin-emoji">🔒</div>
    <div class="pin-title">スマスロ期待値</div>
    <div class="pin-sub">4桁の数字を入力してください</div>
    <input id="pinInput" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" placeholder="••••" aria-label="4桁パスワード">
    <div class="pin-err" id="pinErr"></div>
  </form>
</div>
<header class="topbar" id="topbar">
  <a class="brand" href="${root}index.html">🎰 スマスロ期待値</a>
  <nav class="topnav">
    <a href="${root}index.html">機種</a>
    <a href="${root}news.html">お知らせ</a>
    <a href="${root}tool.html">期待値計算</a>
    <a href="${root}pages.html">資料</a>
  </nav>
  <button class="topbar-search" id="searchOpen" aria-label="検索">🔍</button>
</header>
<main>${body}</main>
<footer class="foot">個人アーカイブ（suroschool.jp / たかどらのスロ塾 会員コンテンツ）・閲覧用</footer>

<!-- スマホ用ボトムナビ（スクロールで隠れる/出る） -->
<nav class="botnav" id="botnav">
  <a href="${root}index.html" data-nav="index">🎰<span>機種</span></a>
  <button id="searchOpen2">🔍<span>検索</span></button>
  <a href="${root}index.html?fav=1">★<span>お気に入り</span></a>
  <a href="${root}news.html">📰<span>お知らせ</span></a>
  <a href="${root}tool.html">🧮<span>期待値</span></a>
</nav>

<!-- 全ページ横断の検索オーバーレイ -->
<div class="search-overlay" id="searchOverlay" hidden>
  <div class="search-head">
    <input id="globalSearch" type="search" placeholder="機種名で検索…" autocomplete="off">
    <button id="searchClose" aria-label="閉じる">✕</button>
  </div>
  <div id="searchResults" class="search-results"></div>
</div>

<script src="${root}assets/search-index.js"></script>
<script src="${root}assets/app.js"></script>
</body></html>`;
};

// ===== 機種ページ =====
for (const m of machines) {
  const nerai = fixDepth(m.nerai_html || '<p class="empty">狙い目データなし</p>', 1);
  const kaiseki = fixDepth(m.kaiseki_html || '', 1);
  const dash = dashMap[m.slug];
  const shukei = dash ? fixDepth(dash.html || '', 1) : '';
  const thumb = m.thumb ? fixDepth(`src="${esc(m.thumb)}"`, 1) : '';
  const tabs = `
  <div class="tabs">
    <button class="tab is-active" data-tab="nerai">狙い目</button>
    ${m.has_kaiseki ? '<button class="tab" data-tab="kaiseki">解析情報</button>' : ''}
    ${shukei ? '<button class="tab" data-tab="shukei">集計値</button>' : ''}
  </div>
  <section class="panel is-active" data-panel="nerai">${nerai}</section>
  ${m.has_kaiseki ? `<section class="panel" data-panel="kaiseki">${kaiseki}</section>` : ''}
  ${shukei ? `<section class="panel kdash" data-panel="shukei">${shukei}</section>` : ''}
  `;
  const body = `
  <article class="machine">
    <a class="back" href="../index.html">← 機種一覧</a>
    <div class="title-row">
      <h1>${esc(m.title)}</h1>
      <button id="favToggle" class="fav-toggle" data-u="m/${fnameFor(m)}" aria-label="お気に入り">☆ お気に入り</button>
    </div>
    ${m.thumb ? `<img class="thumb" ${thumb} alt="">` : ''}
    ${tabs}
  </article>`;
  fs.writeFileSync(path.join(SITE, 'm', fnameFor(m)), layout(m.title, body, 1));
}

// ===== 機種一覧(index) =====
const cardData = machines.map(m => ({
  t: m.title, u: 'm/' + fnameFor(m), k: m.has_kaiseki ? 1 : 0,
  s: dashMap[m.slug] ? 1 : 0,
  n: m.nerai_chars, kc: m.kaiseki_chars,
}));
const indexBody = `
<h1>機種一覧 <span class="count" id="resultCount">${machines.length}機種</span></h1>
<div class="toolbar">
  <input id="search" type="search" placeholder="機種名で検索…（例: モンキー / 北斗）" autocomplete="off">
  <select id="sortSel" title="並び替え">
    <option value="name">50音順</option>
    <option value="kaiseki">解析の充実度</option>
    <option value="nerai">狙い目の情報量</option>
  </select>
</div>
<div class="toolbar">
  <label class="chk"><input type="checkbox" id="onlyKaiseki"> 解析情報ありのみ</label>
  <label class="chk"><input type="checkbox" id="onlyFav"> ★お気に入りのみ</label>
</div>
<div id="grid" class="grid"></div>
<script>window.__MACHINES__=${JSON.stringify(cardData)};</script>
`;
fs.writeFileSync(path.join(SITE, 'index.html'), layout('機種一覧', indexBody, 0));

// ===== ニュース =====
for (const a of news) {
  const body = `<article class="post"><a class="back" href="../news.html">← お知らせ一覧</a>
  <h1>${esc(a.title)}</h1><div class="date">${esc((a.date||'').slice(0,10))}</div>
  <div class="content">${fixDepth(a.content_html || '', 1)}</div></article>`;
  fs.writeFileSync(path.join(SITE, 'n', a.slug + '.html'), layout(a.title, body, 1));
}
const newsBody = `<h1>お知らせ <span class="count">${news.length}件</span></h1>
<input id="search" type="search" placeholder="お知らせを検索…" data-target=".newslist li">
<ul class="newslist">${news.map(a => `<li><a href="n/${a.slug}.html">${esc(a.title)}</a><span class="date">${esc((a.date||'').slice(0,10))}</span></li>`).join('')}</ul>`;
fs.writeFileSync(path.join(SITE, 'news.html'), layout('お知らせ', newsBody, 0));

// ===== 資料ページ =====
for (const p of pages) {
  const body = `<article class="post"><a class="back" href="../pages.html">← 資料一覧</a>
  <h1>${esc(p.title)}</h1><div class="content">${fixDepth(p.content_html || '', 1)}</div></article>`;
  fs.writeFileSync(path.join(SITE, 'p', p.slug + '.html'), layout(p.title, body, 1));
}
const pagesBody = `<h1>資料・固定ページ</h1>
<ul class="newslist">${pages.map(p => `<li><a href="p/${p.slug}.html">${esc(p.title || p.slug)}</a></li>`).join('')}</ul>`;
fs.writeFileSync(path.join(SITE, 'pages.html'), layout('資料', pagesBody, 0));

// ===== 期待値計算ツール（自作・公開理論ベース） =====
const toolBody = `
<h1>期待値ツール</h1>
<p class="note">スロット稼働の期待収支・下振れ確率を概算し、実収支を記録するツール。公開されている計算理論に基づく自作（機種別の具体的な期待値は各機種ページの「狙い目」を参照）。</p>

<div class="card-box">
  <h2 style="margin-top:0">① 機械割ベース 期待収支</h2>
  <div class="calc">
    <div class="row">
      <div class="field"><label>機械割（%） 例: 102.5</label><input id="kw" type="number" step="0.1" value="102.5"></div>
      <div class="field"><label>回転数（G）</label><input id="games" type="number" step="100" value="8000"></div>
    </div>
    <div class="row">
      <div class="field"><label>1G あたり投入枚数</label><input id="bet" type="number" step="0.5" value="3"></div>
      <div class="field"><label>1枚あたりの価値（円） 等価=20</label><input id="coin" type="number" step="0.1" value="20"></div>
    </div>
    <div class="result" id="r1"></div>
  </div>
</div>

<div class="card-box">
  <h2 style="margin-top:0">② 期待差枚 → 期待収支・時給</h2>
  <div class="calc">
    <div class="row">
      <div class="field"><label>期待差枚（枚） 例: +800</label><input id="diff" type="number" step="50" value="800"></div>
      <div class="field"><label>交換率（円/枚） 等価=20 / 5.6枚=17.85…</label><input id="rate" type="number" step="0.05" value="20"></div>
    </div>
    <div class="row">
      <div class="field"><label>消化に要する時間（分）</label><input id="min" type="number" step="10" value="120"></div>
      <div class="field"><label>持ちメダル / 現金投資（任意・差枚に含めない場合は0）</label><input id="adj" type="number" step="100" value="0"></div>
    </div>
    <div class="result" id="r2"></div>
  </div>
</div>

<div class="card-box">
  <h2 style="margin-top:0">③ 天井期待値 ざっくり判定</h2>
  <div class="calc">
    <div class="row">
      <div class="field"><label>狙い始めG（現在ゲーム数）</label><input id="cur" type="number" step="50" value="500"></div>
      <div class="field"><label>天井G</label><input id="ceil" type="number" step="50" value="1000"></div>
    </div>
    <div class="row">
      <div class="field"><label>平均獲得枚数（天井到達時）</label><input id="payout" type="number" step="100" value="1500"></div>
      <div class="field"><label>1G投入</label><input id="bet3" type="number" step="0.5" value="3"></div>
    </div>
    <div class="result" id="r3"></div>
  </div>
</div>

<script>
function yen(n){return (n>=0?'+':'') + Math.round(n).toLocaleString() + '円';}
function cls(n){return n>=0?'pos':'neg';}
function calc(){
  // ①
  var kw=+kwEl.value, g=+gamesEl.value, bet=+betEl.value, coin=+coinEl.value;
  var inSheets = g*bet;                       // 総投入枚数
  var diff1 = inSheets*(kw/100-1);            // 期待差枚 = 投入 * (機械割-1)
  var yen1 = diff1*coin;
  r1.innerHTML='<div>総投入: '+Math.round(inSheets).toLocaleString()+'枚 / 期待差枚: <b>'+(diff1>=0?'+':'')+Math.round(diff1).toLocaleString()+'枚</b></div>'+
    '<div class="big '+cls(yen1)+'">'+yen(yen1)+'</div><div class="note">機械割×回転数からの理論期待収支</div>';
  // ②
  var diff=+diffEl.value, rate=+rateEl.value, mn=+minEl.value, adj=+adjEl.value;
  var yen2=(diff)*rate - adj;
  var hourly = mn>0 ? yen2/(mn/60) : 0;
  r2.innerHTML='<div class="big '+cls(yen2)+'">'+yen(yen2)+'</div>'+
    '<div>時給換算: <b class="'+cls(hourly)+'">'+yen(hourly)+'/時</b>（'+mn+'分）</div>';
  // ③
  var cur=+curEl.value, ceil=+ceilEl.value, pay=+payoutEl.value, bet3=+bet3El.value;
  var remain=Math.max(0,ceil-cur);
  var cost=remain*bet3;                        // 天井まで投資（枚）
  var net=pay-cost;                            // 到達時の素の差枚
  r3.innerHTML='<div>天井まで残り: '+remain+'G / 投資: '+Math.round(cost)+'枚</div>'+
    '<div class="big '+cls(net)+'">'+(net>=0?'+':'')+Math.round(net).toLocaleString()+'枚</div>'+
    '<div class="note">獲得−投資の素の差枚（小役/通常時の出玉は別途）。プラスなら天井狙いの目安。</div>';
}
var ids=['kw','games','bet','coin','diff','rate','min','adj','cur','ceil','payout','bet3'];
var kwEl=kw,gamesEl=games,betEl=bet,coinEl=coin,diffEl=diff,rateEl=rate,minEl=min,adjEl=adj,curEl=cur,ceilEl=ceil,payoutEl=payout,bet3El=bet3;
ids.forEach(function(id){var e=document.getElementById(id); if(e) e.addEventListener('input',calc);});
calc();
</script>

<div class="card-box">
  <h2 style="margin-top:0">④ 下振れシミュレーター</h2>
  <p class="note">期待値稼働の月収支のブレを正規分布で推定。「−○円以下になる確率」「今の結果が何σ」を出します。</p>
  <div class="calc">
    <div class="row">
      <div class="field"><label>稼働件数（台数）</label><input id="s_n" type="number" value="150"></div>
      <div class="field"><label>1台あたり平均期待値（円）</label><input id="s_ev" type="number" value="1000"></div>
    </div>
    <div class="row">
      <div class="field"><label>1台あたりのブレσ（円）目安1.5万〜2.5万</label><input id="s_sd" type="number" value="18000"></div>
      <div class="field"><label>判定したい結果（円）例:-150000</label><input id="s_res" type="number" value="-150000"></div>
    </div>
    <div class="result" id="s_out"></div>
  </div>
</div>

<div class="card-box">
  <h2 style="margin-top:0">⑤ 稼働ロガー（実収支 vs 理論期待値）</h2>
  <p class="note">1台ごとに理論期待値を記録 → 実収支との乖離で「運か実力か」を可視化。データは端末にのみ保存（お気に入りと同じ方式）。</p>
  <div class="calc">
    <div class="row">
      <div class="field"><label>機種名（任意）</label><input id="l_m" type="text" placeholder="例: 北斗転生2"></div>
      <div class="field"><label>理論期待値（円）狙った時の</label><input id="l_ev" type="number" placeholder="例: 1500"></div>
    </div>
    <div class="row">
      <div class="field"><label>投資（円）</label><input id="l_inv" type="number" placeholder="例: 20000"></div>
      <div class="field"><label>回収（円）</label><input id="l_rec" type="number" placeholder="例: 8000"></div>
    </div>
    <button id="l_add" class="mini-btn" style="padding:11px 20px;align-self:start">＋ 記録を追加</button>
    <div class="result" id="l_sum"></div>
    <div id="l_chart"></div>
    <div id="l_list"></div>
  </div>
</div>

<script>(function(){
  function gid(x){return document.getElementById(x);}
  function erf(x){var s=x<0?-1:1;x=Math.abs(x);var t=1/(1+0.3275911*x);var y=1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-0.284496736)*t+0.254829592)*t*Math.exp(-x*x);return s*y;}
  function ncdf(z){return 0.5*(1+erf(z/Math.SQRT2));}
  function yenS(n){return (n>=0?'+':'')+Math.round(n).toLocaleString()+'円';}
  function cl(n){return n>=0?'pos':'neg';}

  // ④ シミュレーター
  var Q=[[0.01,-2.326],[0.05,-1.645],[0.25,-0.674],[0.5,0],[0.75,0.674],[0.95,1.645],[0.99,2.326]];
  function sim(){
    var n=+gid('s_n').value,ev=+gid('s_ev').value,sd=+gid('s_sd').value,res=+gid('s_res').value;
    var mu=n*ev,sig=sd*Math.sqrt(n);
    if(!(sig>0)){gid('s_out').innerHTML='<span class="note">値を入力してください</span>';return;}
    var z=(res-mu)/sig,p=ncdf(z);
    var rows=Q.map(function(q){var v=mu+sig*q[1];return '<tr><td>'+(q[0]*100)+'%</td><td class="'+cl(v)+'">'+yenS(v)+'</td></tr>';}).join('');
    gid('s_out').innerHTML=
      '<div>期待収支: <b class="'+cl(mu)+'">'+yenS(mu)+'</b> ／ 月のブレσ: ±'+Math.round(sig).toLocaleString()+'円</div>'+
      '<div style="margin:8px 0">結果 '+yenS(res)+' は <b>'+z.toFixed(2)+'σ</b>。<b class="'+(p<0.5?'neg':'')+'">これ以下になる確率 '+(p*100).toFixed(1)+'%</b></div>'+
      '<table><thead><tr><th>下位</th><th>この収支以下に収まる</th></tr></thead><tbody>'+rows+'</tbody></table>'+
      '<div class="note">σ(ブレ)が支配的。1ヶ月は誤差の範囲で、件数が増えるほど期待収支へ収束する。</div>';
  }
  ['s_n','s_ev','s_sd','s_res'].forEach(function(id){var e=gid(id);if(e)e.addEventListener('input',sim);});
  if(gid('s_out'))sim();

  // ⑤ 稼働ロガー
  var LKEY='ssg_log';
  function lget(){try{return JSON.parse(localStorage.getItem(LKEY)||'[]');}catch(e){return[];}}
  function lset(a){try{localStorage.setItem(LKEY,JSON.stringify(a));}catch(e){}}
  function stdev(a,m){if(a.length<2)return 0;var s=0;for(var i=0;i<a.length;i++){var d=a[i]-m;s+=d*d;}return Math.sqrt(s/(a.length-1));}
  function spark(pts){
    if(pts.length<2)return '';
    var all=[0];pts.forEach(function(p){all.push(p[0],p[1]);});
    var mn=Math.min.apply(null,all),mx=Math.max.apply(null,all),W=320,H=110,pad=6,n=pts.length;
    function X(i){return pad+(W-2*pad)*i/(n-1);}
    function Y(v){return H-pad-(H-2*pad)*(v-mn)/((mx-mn)||1);}
    function P(sel){var d='';for(var i=0;i<n;i++){d+=(i?'L':'M')+X(i).toFixed(1)+' '+Y(pts[i][sel]).toFixed(1)+' ';}return d;}
    return '<svg viewBox="0 0 '+W+' '+H+'" style="width:100%;height:auto;border:1px solid var(--border);border-radius:8px;margin:10px 0;background:#fff">'+
      '<line x1="0" y1="'+Y(0).toFixed(1)+'" x2="'+W+'" y2="'+Y(0).toFixed(1)+'" stroke="#e5e7eb"/>'+
      '<path d="'+P(1)+'" fill="none" stroke="#9ca3af" stroke-width="1.5" stroke-dasharray="4 3"/>'+
      '<path d="'+P(0)+'" fill="none" stroke="#2563eb" stroke-width="2"/></svg>'+
      '<div class="note">青=実収支の累積 ／ 灰点線=理論期待値の累積。青が灰を大きく下回る＝下振れ(または実力不足)。</div>';
  }
  function renderLog(){
    var log=lget(),sum=gid('l_sum'),list=gid('l_list'),chart=gid('l_chart');
    if(!log.length){sum.innerHTML='<span class="note">まだ記録がありません。1台ずつ追加してください。</span>';list.innerHTML='';chart.innerHTML='';return;}
    var n=log.length,nets=log.map(function(x){return x.rec-x.inv;});
    var realTot=nets.reduce(function(s,v){return s+v;},0);
    var evTot=log.reduce(function(s,x){return s+(+x.ev||0);},0);
    var gap=realTot-evTot,sd=stdev(nets,realTot/n),sig=sd*Math.sqrt(n),z=sig>0?gap/sig:0;
    sum.innerHTML='<div>記録 <b>'+n+'台</b> ／ 実収支 <b class="'+cl(realTot)+'">'+yenS(realTot)+'</b> ／ 理論期待値合計 <b>'+yenS(evTot)+'</b></div>'+
      '<div style="margin-top:6px">乖離(実−理論): <b class="'+cl(gap)+'">'+yenS(gap)+'</b>'+(sig>0?'（<b>'+z.toFixed(2)+'σ</b>）':'')+'</div>'+
      '<div class="note">'+(n<100?'※'+n+'台は少なすぎ。数百台で「運か実力か」が見えてくる。':'乖離が±2σ以内なら概ね運の範囲＝理論どおり。継続的に−方向なら条件/立ち回りを見直し。')+'</div>';
    var cr=0,ce=0,pts=[];for(var i=0;i<log.length;i++){cr+=nets[i];ce+=(+log[i].ev||0);pts.push([cr,ce]);}
    chart.innerHTML=spark(pts);
    list.innerHTML='<table><thead><tr><th>#</th><th>機種</th><th>収支</th><th>理論EV</th><th></th></tr></thead><tbody>'+
      log.map(function(x,i){var net=x.rec-x.inv;return '<tr><td>'+(i+1)+'</td><td style="white-space:normal;text-align:left">'+(x.m||'-')+'</td><td class="'+cl(net)+'">'+yenS(net)+'</td><td>'+yenS(+x.ev||0)+'</td><td><button class="l_del" data-i="'+i+'" style="border:none;background:none;color:#dc2626;cursor:pointer;font-size:16px">×</button></td></tr>';}).join('')+'</tbody></table>';
    Array.prototype.forEach.call(document.querySelectorAll('.l_del'),function(btn){btn.addEventListener('click',function(){var lg=lget();lg.splice(+btn.dataset.i,1);lset(lg);renderLog();});});
  }
  var add=gid('l_add');
  if(add)add.addEventListener('click',function(){
    var m=gid('l_m').value.trim(),inv=+gid('l_inv').value||0,rec=+gid('l_rec').value||0,ev=+gid('l_ev').value||0;
    if(!inv&&!rec&&!ev){return;}
    var log=lget();log.push({m:m,inv:inv,rec:rec,ev:ev,t:Date.now()});lset(log);
    gid('l_m').value='';gid('l_inv').value='';gid('l_rec').value='';gid('l_ev').value='';
    renderLog();gid('l_m').focus();
  });
  if(gid('l_sum'))renderLog();
})();</script>
`;
fs.writeFileSync(path.join(SITE, 'tool.html'), layout('期待値ツール', toolBody, 0));

// ===== アイコン(SVG) =====
const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="96" fill="#ffffff"/><rect x="8" y="8" width="496" height="496" rx="92" fill="none" stroke="#e5e7eb" stroke-width="8"/><text x="50%" y="54%" font-size="300" text-anchor="middle" dominant-baseline="central">🎰</text></svg>`;
fs.writeFileSync(path.join(SITE, 'assets', 'icon.svg'), icon);

// robots.txt（検索エンジン除け）＆ GitHub Pages 用 .nojekyll
fs.writeFileSync(path.join(SITE, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
fs.writeFileSync(path.join(SITE, '.nojekyll'), '');

// 全ページ横断検索用インデックス（機種名＋ふりがな）
const searchIndex = machines.map(m => ({ t: m.title, u: 'm/' + fnameFor(m), k: m.has_kaiseki ? 1 : 0, s: dashMap[m.slug] ? 1 : 0 }));
fs.writeFileSync(path.join(SITE, 'assets', 'search-index.js'), 'window.__SEARCH__=' + JSON.stringify(searchIndex) + ';');

// ===== manifest =====
const manifest = {
  name: 'スマスロ期待値（個人アーカイブ）', short_name: 'スマスロ期待値',
  start_url: './index.html', scope: './', display: 'standalone',
  background_color: '#ffffff', theme_color: '#ffffff', lang: 'ja',
  icons: [{ src: 'assets/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
};
fs.writeFileSync(path.join(SITE, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2));

// ===== Service Worker（全ファイルをプリキャッシュ＝完全オフライン）=====
function walk(dir, base = SITE) {
  let out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const fp = path.join(dir, e.name);
    if (e.isDirectory()) out = out.concat(walk(fp, base));
    else if (e.name !== 'sw.js') out.push('./' + path.relative(base, fp).split(path.sep).join('/'));
  }
  return out;
}
const files = walk(SITE);
const core = files.filter(f => !f.startsWith('./img/'));   // HTML/CSS/JS/JSON/svg/manifest（軽量・必須）
const media = files.filter(f => f.startsWith('./img/'));   // 画像（重い・ベストエフォート）
// バージョンはコア資産(CSS/JS/HTMLの主要部)の内容ハッシュ。変更時に確実にSWキャッシュを更新。
const hashSrc = ['assets/style.css', 'assets/app.js', 'index.html', 'tool.html']
  .map(f => { try { return fs.readFileSync(path.join(SITE, f), 'utf-8'); } catch { return ''; } }).join('');
const VER = 'v' + crypto.createHash('md5').update(hashSrc).digest('hex').slice(0, 10) + '-' + files.length;
const sw = `// 自動生成: 全ファイルをプリキャッシュ。オフライン/低電波でも即表示（cache-first）。
// addAll は1件でも失敗すると全滅するため、個別 add + allSettled で堅牢化。コア優先→画像はベストエフォート。
const CACHE='smartslotgoal-${VER}';
const CORE=${JSON.stringify(core)};
const MEDIA=${JSON.stringify(media)};
async function cacheAll(c,list){await Promise.allSettled(list.map(u=>c.add(u)));}
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil((async()=>{
  const c=await caches.open(CACHE);
  await cacheAll(c,CORE);     // 必須（ページ・データ）を確実に
  cacheAll(c,MEDIA);          // 画像はバックグラウンドで（失敗しても可）
})());});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  e.respondWith(caches.match(e.request,{ignoreSearch:true}).then(r=>r||fetch(e.request).then(res=>{
    const cp=res.clone();caches.open(CACHE).then(c=>c.put(e.request,cp)).catch(()=>{});return res;
  }).catch(()=>caches.match('./index.html'))));
});`;
fs.writeFileSync(path.join(SITE, 'sw.js'), sw);

console.log(`生成完了: 機種 ${machines.length} / ニュース ${news.length} / 資料 ${pages.length}`);
console.log(`PWA: ${files.length}ファイルをプリキャッシュ (${VER}) / 画像ローカル化: ${Object.keys(imgMap).length}件`);
console.log('出力先:', SITE);

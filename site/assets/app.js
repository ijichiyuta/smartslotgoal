// app.js — 個人サイトの動作（機種一覧の検索/フィルタ/お気に入り、タブ切替、解析の全展開、ニュース検索）
(function () {
  'use strict';

  // ---- お気に入り(localStorage / 失敗時はcookieフォールバック) ----
  const FAV_KEY = 'smartslotgoal_favs';
  let storageOK = true;
  try { localStorage.setItem('__t', '1'); localStorage.removeItem('__t'); } catch (e) { storageOK = false; }
  const cookieGet = () => { const m = document.cookie.match(/(?:^|; )ssg_favs=([^;]*)/); return m ? decodeURIComponent(m[1]) : ''; };
  const cookieSet = (v) => { document.cookie = 'ssg_favs=' + encodeURIComponent(v) + ';path=/;max-age=31536000;SameSite=Lax'; };
  const getFavs = () => {
    try { if (storageOK) return JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); } catch (e) {}
    try { return JSON.parse(cookieGet() || '[]'); } catch (e) { return []; }
  };
  const setFavs = (a) => {
    const s = JSON.stringify(a);
    try { if (storageOK) localStorage.setItem(FAV_KEY, s); } catch (e) {}
    try { cookieSet(s); } catch (e) {}   // 冗長保存（localStorageが消えても復元）
  };
  const toggleFav = (u) => { const f = getFavs(); const i = f.indexOf(u); i >= 0 ? f.splice(i, 1) : f.unshift(u); setFavs(f); return f; };

  // プライベートブラウズ等でストレージ不可なら警告
  if (!storageOK) {
    window.addEventListener('DOMContentLoaded', () => {
      const w = document.createElement('div');
      w.style.cssText = 'background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;padding:8px 14px;font-size:13px;border-radius:8px;margin:10px 0';
      w.textContent = '⚠️ ブラウザの設定（プライベートブラウズ等）でお気に入りが保存できません。通常モードで開いてください。';
      const main = document.querySelector('main'); if (main) main.prepend(w);
    });
  }

  // ---- 機種一覧 ----
  const grid = document.getElementById('grid');
  if (grid && window.__MACHINES__) {
    const data = window.__MACHINES__;
    const search = document.getElementById('search');
    const onlyK = document.getElementById('onlyKaiseki');
    const onlyFav = document.getElementById('onlyFav');
    const sortSel = document.getElementById('sortSel');
    const norm = (s) => (s || '').toLowerCase().replace(/\s+/g, '');

    function render() {
      const favs = getFavs();
      const q = norm(search && search.value);
      let list = data.slice();
      if (q) list = list.filter(m => norm(m.t).includes(q));
      if (onlyK && onlyK.checked) list = list.filter(m => m.k);
      if (onlyFav && onlyFav.checked) list = list.filter(m => favs.includes(m.u));
      const sort = sortSel ? sortSel.value : 'name';
      if (sort === 'kaiseki') list.sort((a, b) => b.kc - a.kc);
      else if (sort === 'nerai') list.sort((a, b) => b.n - a.n);
      else list.sort((a, b) => a.t.localeCompare(b.t, 'ja'));

      const cnt = document.getElementById('resultCount');
      if (cnt) cnt.textContent = list.length + '件';

      grid.innerHTML = list.map(m => {
        const fav = favs.includes(m.u);
        return `<div class="card-wrap">
          <a class="card" href="${m.u}">
            <div class="name">${escapeHtml(m.t)}</div>
            <div class="badges">
              ${m.k ? '<span class="badge k">解析情報あり</span>' : '<span class="badge">狙い目</span>'}
              ${m.s ? '<span class="badge s">集計値</span>' : ''}
            </div>
          </a>
          <button class="favbtn${fav ? ' on' : ''}" data-u="${m.u}" title="お気に入り" aria-label="お気に入り">${fav ? '★' : '☆'}</button>
        </div>`;
      }).join('') || '<p class="empty">該当する機種がありません</p>';

      grid.querySelectorAll('.favbtn').forEach(b => b.addEventListener('click', (e) => {
        e.preventDefault(); toggleFav(b.dataset.u); render();
      }));
    }
    function escapeHtml(s) { return (s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
    if (search) search.addEventListener('input', render);
    if (onlyK) onlyK.addEventListener('change', render);
    if (onlyFav) onlyFav.addEventListener('change', render);
    if (sortSel) sortSel.addEventListener('change', render);
    render();
    if (search) search.focus();
  }

  // ---- タブ切替（機種ページ） ----
  const tabs = document.querySelectorAll('.tab');
  if (tabs.length) {
    tabs.forEach(t => t.addEventListener('click', () => {
      const name = t.dataset.tab;
      document.querySelectorAll('.tab').forEach(x => x.classList.toggle('is-active', x === t));
      document.querySelectorAll('.panel').forEach(p => p.classList.toggle('is-active', p.dataset.panel === name));
      history.replaceState(null, '', '#' + name);
    }));
    const h = (location.hash || '').replace('#', '');
    const target = [...tabs].find(t => t.dataset.tab === h);
    if (target) target.click();
  }

  // ---- 解析: 全展開/折りたたみボタンを自動付与 ----
  const kaiseki = document.querySelector('.panel[data-panel="kaiseki"]');
  if (kaiseki) {
    const details = kaiseki.querySelectorAll('details');
    if (details.length) {
      const bar = document.createElement('div');
      bar.className = 'expand-bar';
      bar.innerHTML = '<button id="expandAll" class="mini-btn">全て展開</button> <button id="collapseAll" class="mini-btn">全て折りたたみ</button>';
      kaiseki.prepend(bar);
      bar.querySelector('#expandAll').addEventListener('click', () => details.forEach(d => d.open = true));
      bar.querySelector('#collapseAll').addEventListener('click', () => details.forEach(d => d.open = false));
    }
  }

  // ---- 機種ページのお気に入りトグル ----
  const favToggle = document.getElementById('favToggle');
  if (favToggle) {
    const u = favToggle.dataset.u;
    const sync = () => {
      const on = getFavs().includes(u);
      favToggle.classList.toggle('on', on);
      favToggle.textContent = on ? '★ お気に入り済み' : '☆ お気に入り';
    };
    favToggle.addEventListener('click', () => { toggleFav(u); sync(); });
    sync();
  }

  // ---- 汎用リスト検索（ニュース等） ----
  const listSearch = document.querySelector('input[data-target]');
  if (listSearch) {
    const sel = listSearch.dataset.target;
    listSearch.addEventListener('input', () => {
      const q = listSearch.value.toLowerCase();
      document.querySelectorAll(sel).forEach(li => {
        li.style.display = li.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    });
  }
})();

// app.js — 個人サイトの動作（機種一覧の検索/フィルタ/お気に入り、タブ切替、解析の全展開、ニュース検索）
(function () {
  'use strict';

  // ---- お気に入り(localStorage) ----
  const FAV_KEY = 'smartslotgoal_favs';
  const getFavs = () => { try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); } catch { return []; } };
  const setFavs = (a) => localStorage.setItem(FAV_KEY, JSON.stringify(a));
  const toggleFav = (u) => { const f = getFavs(); const i = f.indexOf(u); i >= 0 ? f.splice(i, 1) : f.unshift(u); setFavs(f); return f; };

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

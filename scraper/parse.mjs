// parse.mjs — data/raw の保存HTMLを構造化JSONに変換する。
// 機種ページは 狙い目/解析情報 のHTMLを温存（表・書式そのまま）。不要要素(モーダル/チャット/ナビ/スクリプト)は除去。
import { load } from 'cheerio';
import { fileURLToPath } from 'url';
import fs from 'fs';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const MANIFEST = path.join(ROOT, 'data', 'manifest.json');
const OUT = path.join(ROOT, 'data', 'json');
fs.mkdirSync(OUT, { recursive: true });

const BASE = 'https://suroschool.jp';
const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf-8'));

// 不要要素セレクタ
const STRIP = [
  'script', 'style', 'noscript', '#machine-login-modal', '.machine-login-modal',
  '.machine-toc-fab', '.machine-toc-drawer', '.machine-toc-overlay', '#mobile-fixed-menu',
  '#mobile-panel', '.discord-chat', '[class*="discord-chat"]', '.machine-tabs', '.machine-tab',
  '.paywall-cta', '.machine-panel-lock-btn', '.js-open-login-modal', '#toc_container',
  '.kaiseki-toggle-all', 'header.site-header', 'footer', '.site-footer', '.comments-area',
  '#comments', '.nav-links', '.breadcrumb', '.breadcrumbs',
];

// img/src を絶対URL化（取得後の画像ミラーで差し替え可能）
function absolutize($, el) {
  $(el).find('img').each((i, im) => {
    const $im = $(im);
    let src = $im.attr('data-src') || $im.attr('src');
    if (src && src.startsWith('/')) src = BASE + src;
    if (src) { $im.attr('src', src); $im.removeAttr('data-src'); $im.removeAttr('loading'); $im.removeAttr('srcset'); }
  });
  $(el).find('a').each((i, a) => {
    const $a = $(a); let href = $a.attr('href');
    if (href && href.startsWith('/')) $a.attr('href', BASE + href);
  });
}

function cleanPanel($, panelEl) {
  const $p = $(panelEl).clone();
  STRIP.forEach(sel => $p.find(sel).remove());
  $p.find('[hidden]').removeAttr('hidden');
  $p.removeClass('is-active').removeAttr('hidden');
  absolutize($, $p);
  return $p.html() ? $p.html().trim() : '';
}

const machines = [], news = [], pages = [];

for (const [url, meta] of Object.entries(manifest)) {
  if (!meta.ok || !meta.file) continue;
  const file = path.join(ROOT, meta.file);
  if (!fs.existsSync(file)) continue;
  const $ = load(fs.readFileSync(file, 'utf-8'));

  const title = ($('h1').first().text() || $('meta[property="og:title"]').attr('content') || '').trim();
  const thumb = $('meta[property="og:image"]').attr('content') || '';
  const dateRaw = $('meta[property="article:published_time"]').attr('content')
    || $('time').attr('datetime') || '';

  if ($('.machine-tab-panel').length) {
    // 機種ページ
    const panels = {};
    $('.machine-tab-panel').each((i, el) => { panels[$(el).attr('data-panel')] = el; });
    const neraiHtml = panels.nerai ? cleanPanel($, panels.nerai) : '';
    const kaisekiHtml = panels.kaiseki ? cleanPanel($, panels.kaiseki) : '';
    const shukeiText = panels.shukei ? $(panels.shukei).text().replace(/\s+/g, '') : '';
    // 集計値ダッシュボード(kdashboard iframe)のURL抽出
    let kdashUrl = '';
    if (panels.shukei) {
      const raw = $(panels.shukei).html() || '';
      const mm = raw.match(/data-kdash-src="([^"]+)"/) || raw.match(/kaiseki_dash=\d+[^"'&]*/);
      if (mm) kdashUrl = (mm[1] || mm[0]).replace(/&amp;/g, '&');
      if (kdashUrl && !/^https?:/.test(kdashUrl)) kdashUrl = 'https://suroschool.jp/' + kdashUrl.replace(/^\/?/, '');
      kdashUrl = kdashUrl.replace(/&?theme=[^&]*/, '');
    }
    // kaiseki TOC
    const toc = [];
    if (panels.kaiseki) {
      $(panels.kaiseki).find('.kaiseki-section').each((i, sec) => {
        const t = $(sec).children('.kaiseki-section-title').first().text().trim();
        const subs = $(sec).find('.kaiseki-subsection-title').map((j, s) => $(s).text().trim()).get();
        if (t) toc.push({ section: t, subs });
      });
    }
    machines.push({
      type: 'machine', url, slug: meta.slug, title, thumb, date: dateRaw,
      nerai_html: neraiHtml,
      kaiseki_html: kaisekiHtml,
      has_kaiseki: kaisekiHtml.replace(/<[^>]*>/g, '').replace(/\s+/g, '').length > 50,
      kdash_url: kdashUrl,
      shukei_status: kdashUrl ? 'dashboard' : (shukeiText.includes('準備中') ? 'pending' : 'empty'),
      kaiseki_toc: toc,
      nerai_chars: neraiHtml.replace(/<[^>]*>/g, '').replace(/\s+/g, '').length,
      kaiseki_chars: kaisekiHtml.replace(/<[^>]*>/g, '').replace(/\s+/g, '').length,
    });
  } else {
    // news / page
    let contentEl = $('.entry-content').first();
    if (!contentEl.length) contentEl = $('article').first();
    if (!contentEl.length) contentEl = $('main').first();
    const $c = contentEl.clone();
    STRIP.forEach(sel => $c.find(sel).remove());
    absolutize($, $c);
    const rec = { type: meta.type, url, slug: meta.slug, title, thumb, date: dateRaw, content_html: ($c.html() || '').trim() };
    if (meta.type === 'news') news.push(rec); else pages.push(rec);
  }
}

const sortByDate = (a, b) => (b.date || '').localeCompare(a.date || '');
news.sort(sortByDate);

fs.writeFileSync(path.join(OUT, 'machines.json'), JSON.stringify(machines, null, 2));
fs.writeFileSync(path.join(OUT, 'news.json'), JSON.stringify(news, null, 2));
fs.writeFileSync(path.join(OUT, 'pages.json'), JSON.stringify(pages, null, 2));

const withKaiseki = machines.filter(m => m.has_kaiseki).length;
console.log(`machines: ${machines.length} (解析あり ${withKaiseki}) / news: ${news.length} / pages: ${pages.length}`);
console.log('集計値: ', [...new Set(machines.map(m => m.shukei_status))]);

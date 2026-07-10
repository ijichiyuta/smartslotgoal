// restfetch.mjs — WordPress REST API から全コンテンツを取得して data/json/* と data/dash.json を生成する。
// 認証不要（サイトのRESTが machine_kaiseki / machine_shukei 等を公開しているため）。月1更新の中核。
// 出力は gen.mjs がそのまま消費できる形（parse.mjs 相当）。slug は既存ファイル名と100%一致（お気に入り継続）。
import { fileURLToPath } from 'url';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'json');
const RAW = path.join(ROOT, 'data', 'rest');
const DASH_RAW = path.join(ROOT, 'data', 'raw', 'dash');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(RAW, { recursive: true });
fs.mkdirSync(DASH_RAW, { recursive: true });

const BASE = 'https://suroschool.jp';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function getJSON(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + url);
  return res.json();
}
async function getText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Referer': BASE + '/' } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.text();
}
// crawl.mjs と同じ slug 生成（既存ファイル名と一致）
const slugify = (url) => {
  const u = new URL(url);
  let p = decodeURIComponent(u.pathname).replace(/^\/+|\/+$/g, '');
  p = p.replace(/[^\w　-ヿ一-鿿\-]/g, '_');
  const h = crypto.createHash('md5').update(url).digest('hex').slice(0, 8);
  return (p || 'index') + '__' + h;
};
const strip = (h) => (h || '').replace(/<[^>]*>/g, '').replace(/\s+/g, '');
const absolutize = (h) => (h || '').replace(/(src|href)="\/(?!\/)/g, `$1="${BASE}/`);
// タイトル等の表示テキスト用にHTMLエンティティを実文字へ（&#8217;→’ 等）
const decodeEntities = (s) => (s || '')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
const cleanTitle = (t) => decodeEntities((t || '').trim());

// 全ページ取得（X-WP-TotalPages に従う）
async function fetchAll(type, fields) {
  const per = 100;
  let page = 1, out = [], totalPages = 1;
  do {
    const url = `${BASE}/wp-json/wp/v2/${type}?per_page=${per}&page=${page}&_fields=${fields}`;
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + url);
    totalPages = parseInt(res.headers.get('x-wp-totalpages') || '1', 10);
    const data = await res.json();
    out = out.concat(data);
    console.log(`  ${type} page ${page}/${totalPages}: +${data.length}`);
    page++;
    await sleep(600);
  } while (page <= totalPages);
  return out;
}

// メディアURLをまとめて取得（thumb用）
async function fetchMedia(ids) {
  const uniq = [...new Set(ids.filter(Boolean))];
  const map = {};
  for (let i = 0; i < uniq.length; i += 100) {
    const chunk = uniq.slice(i, i + 100);
    const url = `${BASE}/wp-json/wp/v2/media?include=${chunk.join(',')}&per_page=100&_fields=id,source_url`;
    try { for (const m of await getJSON(url)) map[m.id] = m.source_url; } catch (e) {}
    await sleep(500);
  }
  return map;
}

console.log('=== 機種 ===');
const rawMachines = await fetchAll('machine',
  'link,title,content,date,modified,machine_kaiseki,machine_shukei,machine_tenjo,machine_subtitle,featured_media');
fs.writeFileSync(path.join(RAW, 'machines.raw.json'), JSON.stringify(rawMachines, null, 2));

console.log('=== サムネ(media) ===');
const mediaMap = await fetchMedia(rawMachines.map(m => m.featured_media));

const machines = rawMachines.map(m => {
  const url = m.link;
  const slug = slugify(url);
  const nerai = absolutize((m.content && m.content.rendered) || '');
  const kaiseki = absolutize(m.machine_kaiseki || '');
  const tenjo = absolutize(m.machine_tenjo || '');
  const shukeiRaw = m.machine_shukei || '';
  const pid = (shukeiRaw.match(/pid="?(\d+)"?/) || [])[1] || (shukeiRaw.match(/kaiseki_dash=(\d+)/) || [])[1] || '';
  // thumb: featured_media優先、無ければ content 先頭画像（サイズ接尾辞を除去してフル画像化）
  let thumb = mediaMap[m.featured_media] || '';
  if (!thumb) { const im = nerai.match(/<img[^>]+src="([^"]+)"/); if (im) thumb = im[1].replace(/-\d+x\d+(\.\w+)$/, '$1'); }
  return {
    type: 'machine', url, slug, title: cleanTitle(m.title.rendered),
    subtitle: cleanTitle(m.machine_subtitle), thumb,
    date: m.modified || m.date || '',
    tenjo_html: tenjo,
    nerai_html: nerai,
    kaiseki_html: kaiseki,
    has_kaiseki: strip(kaiseki).length > 50,
    kdash_url: pid ? `${BASE}/?kaiseki_dash=${pid}` : '',
    shukei_status: pid ? 'dashboard' : (strip(shukeiRaw).includes('準備中') ? 'pending' : 'empty'),
    nerai_chars: strip(nerai).length,
    kaiseki_chars: strip(kaiseki).length,
  };
});
fs.writeFileSync(path.join(OUT, 'machines.json'), JSON.stringify(machines, null, 2));

console.log('=== ニュース ===');
const rawNews = await fetchAll('news', 'link,title,content,date,modified');
const news = rawNews.map(a => ({
  type: 'news', url: a.link, slug: slugify(a.link), title: cleanTitle(a.title.rendered),
  date: a.date || '', content_html: absolutize((a.content && a.content.rendered) || ''), thumb: '',
})).sort((x, y) => (y.date || '').localeCompare(x.date || ''));
fs.writeFileSync(path.join(OUT, 'news.json'), JSON.stringify(news, null, 2));

console.log('=== 固定ページ ===');
const rawPages = await fetchAll('pages', 'link,title,content,date,modified');
const pages = rawPages.map(p => ({
  type: 'page', url: p.link, slug: slugify(p.link), title: cleanTitle(p.title.rendered),
  date: p.date || '', content_html: absolutize((p.content && p.content.rendered) || ''), thumb: '',
}));
fs.writeFileSync(path.join(OUT, 'pages.json'), JSON.stringify(pages, null, 2));

console.log('=== 集計値ダッシュボード ===');
const dashTargets = machines.filter(m => m.kdash_url);
const dashMap = fs.existsSync(path.join(ROOT, 'data', 'dash.json'))
  ? JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'dash.json'), 'utf-8')) : {};
for (const m of dashTargets) {
  const pid = (m.kdash_url.match(/kaiseki_dash=(\d+)/) || [])[1];
  try {
    const html = await getText(m.kdash_url);
    fs.writeFileSync(path.join(DASH_RAW, pid + '.html'), html);
    // body内の script/style/link を除去して本文抽出
    let body = (html.match(/<body[^>]*>([\s\S]*?)<\/body>/i) || [, html])[1];
    body = body.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '')
               .replace(/<link[^>]*>/gi, '').replace(/<noscript[\s\S]*?<\/noscript>/gi, '');
    const tables = (body.match(/<table/gi) || []).length;
    dashMap[m.slug] = { url: m.kdash_url, title: m.title, html: absolutize(body).trim(), tables };
    console.log(`  ✓ ${m.title} (tables:${tables})`);
  } catch (e) { console.log(`  ✗ ${m.title}: ${String(e).slice(0, 60)}`); }
  await sleep(800);
}
fs.writeFileSync(path.join(ROOT, 'data', 'dash.json'), JSON.stringify(dashMap, null, 2));

console.log(`\n完了: 機種 ${machines.length}(解析${machines.filter(m => m.has_kaiseki).length}/集計${dashTargets.length}) / ニュース ${news.length} / ページ ${pages.length}`);

// crawl.mjs — 認証済みセッションで全ページの完全HTMLを低負荷・直列・再開可能に取得する。
// 方針（[[feedback-scraping-politeness]]）: 同時1・各リクエスト間2〜4秒・キャッシュ済みはスキップ・画像等はブロックして負荷軽減。
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROFILE_DIR = path.join(__dirname, '.profile');
const RAW = path.join(__dirname, '..', 'data', 'raw');
const MANIFEST = path.join(__dirname, '..', 'data', 'manifest.json');
const BASE = 'https://suroschool.jp';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const jitter = () => 2000 + Math.floor(Math.random() * 2000); // 2-4s

const SITEMAPS = {
  page:    `${BASE}/wp-sitemap-posts-page-1.xml`,
  machine: `${BASE}/wp-sitemap-posts-machine-1.xml`,
  news:    `${BASE}/wp-sitemap-posts-news-1.xml`,
};

const slugify = (url) => {
  const u = new URL(url);
  let p = decodeURIComponent(u.pathname).replace(/^\/+|\/+$/g, '');
  p = p.replace(/[^\w　-ヿ一-鿿\-]/g, '_');
  const h = crypto.createHash('md5').update(url).digest('hex').slice(0, 8);
  return (p || 'index') + '__' + h;   // URLハッシュ付与で衝突回避
};

const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
  headless: true,
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  locale: 'ja-JP',
});

// 負荷軽減: 画像/フォント/メディア/解析タグをブロック（HTML本体のみ取得）
await ctx.route('**/*', (route) => {
  const t = route.request().resourceType();
  if (['image', 'media', 'font'].includes(t)) return route.abort();
  return route.continue();
});

// ログイン確認（このサイトは独自Cookie custom_logged_in を使う）
const cookies = await ctx.cookies(BASE);
const loggedIn = cookies.some(c => c.name === 'custom_logged_in' && c.value === 'yes')
  || cookies.some(c => /^wordpress_logged_in/.test(c.name));
console.log('logged_in:', loggedIn, '/ cookies:', cookies.length);
if (!loggedIn) { console.error('未ログイン。先に `node login.mjs` を実行してください。'); await ctx.close(); process.exit(1); }

const page = await ctx.newPage();

// サイトマップからURL収集
async function collectUrls() {
  const all = [];
  for (const [type, sm] of Object.entries(SITEMAPS)) {
    const res = await page.goto(sm, { waitUntil: 'domcontentloaded' });
    const xml = await res.text();
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
    for (const u of locs) all.push({ type, url: u });
    console.log(`sitemap ${type}: ${locs.length}`);
    await sleep(jitter());
  }
  // 追加: トップページも
  all.push({ type: 'page', url: BASE + '/' });
  return all;
}

const targets = await collectUrls();

// manifest 読み込み（再開）
let manifest = {};
if (fs.existsSync(MANIFEST)) manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf-8'));

let done = 0, skipped = 0, failed = 0;
for (const { type, url } of targets) {
  const slug = slugify(url);
  const dir = path.join(RAW, type);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, slug + '.html');

  if (manifest[url]?.ok && fs.existsSync(file)) { skipped++; continue; }

  try {
    const res = await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
    const status = res ? res.status() : 0;
    // 集計/解析タブを開いた状態のHTMLを取りたいので、タブをアクティブ化してから取得
    await page.evaluate(() => {
      document.querySelectorAll('.machine-tab-panel').forEach(p => { p.hidden = false; p.classList.add('is-active'); });
      document.querySelectorAll('details').forEach(d => { d.open = true; });
    }).catch(() => {});
    const html = await page.content();
    fs.writeFileSync(file, html);
    manifest[url] = { ok: status >= 200 && status < 400, status, type, slug, file: path.relative(path.join(__dirname, '..'), file), bytes: html.length };
    done++;
    if (done % 10 === 0) fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
    console.log(`[${done + skipped}/${targets.length}] ${status} ${type} ${slug} (${html.length}b)`);
  } catch (e) {
    failed++;
    manifest[url] = { ok: false, error: String(e).slice(0, 200), type, slug };
    console.log(`[ERR] ${url} :: ${String(e).slice(0, 120)}`);
  }
  await sleep(jitter());
}

fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
console.log(`\n完了: 取得 ${done} / スキップ ${skipped} / 失敗 ${failed} / 合計 ${targets.length}`);
await ctx.close();
process.exit(0);

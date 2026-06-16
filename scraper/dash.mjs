// dash.mjs — 集計値ダッシュボード(kdashboard iframe)を認証付きで取得・アーカイブする。
// 低負荷（直列・~1.5s間隔）・キャッシュ済みskip・再開可能。data/dash.json に {slug: {html,title,url}} を出力。
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import fs from 'fs';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const STATE = path.join(ROOT, 'data', 'auth.json');
const RAW_DASH = path.join(ROOT, 'data', 'raw', 'dash');
const OUT = path.join(ROOT, 'data', 'dash.json');
fs.mkdirSync(RAW_DASH, { recursive: true });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const machines = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'json', 'machines.json'), 'utf-8'));
const targets = machines.filter(m => m.kdash_url);
console.log('集計値ダッシュボードあり:', targets.length, '機種');
if (!targets.length) { fs.writeFileSync(OUT, JSON.stringify({}, null, 2)); process.exit(0); }

const map = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf-8')) : {};

const b = await chromium.launch();
const ctx = await b.newContext({ storageState: STATE, locale: 'ja-JP',
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' });
const page = await ctx.newPage();

let done = 0, skip = 0, fail = 0;
for (const m of targets) {
  const id = (m.kdash_url.match(/kaiseki_dash=(\d+)/) || [])[1] || m.slug;
  const rawFile = path.join(RAW_DASH, id + '.html');
  if (map[m.slug] && fs.existsSync(rawFile)) { skip++; continue; }
  try {
    const url = m.kdash_url + (m.kdash_url.includes('?') ? '&' : '?') + 'theme=dark';
    const res = await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(1500);
    fs.writeFileSync(rawFile, await page.content());
    const data = await page.evaluate(() => {
      // script/style/link を除去して本文HTMLを取得
      const clone = document.body.cloneNode(true);
      clone.querySelectorAll('script,style,link,noscript').forEach(e => e.remove());
      return { html: clone.innerHTML.trim(), title: document.title || '', tables: document.querySelectorAll('table').length };
    });
    map[m.slug] = { url: m.kdash_url, title: m.title, html: data.html, tables: data.tables };
    done++;
    fs.writeFileSync(OUT, JSON.stringify(map, null, 2));
    console.log(`[${done + skip}/${targets.length}] ${res.status()} ${m.title} (tables:${data.tables}, ${data.html.length}b)`);
  } catch (e) {
    fail++; console.log('[ERR]', m.title, String(e).slice(0, 80));
  }
  await sleep(1500);
}
fs.writeFileSync(OUT, JSON.stringify(map, null, 2));
console.log(`完了: 取得 ${done} / skip ${skip} / 失敗 ${fail} → ${OUT}`);
await b.close();
process.exit(0);

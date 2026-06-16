// mirror.mjs — JSON内の suroschool 画像を全てローカル(site/img)へ保存し、url→localpath マップを作る。
// 低負荷（同時2・~400ms間隔）・キャッシュ済みskip・再開可能。
import { fileURLToPath } from 'url';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const JSON_DIR = path.join(ROOT, 'data', 'json');
const IMG_DIR = path.join(ROOT, 'site', 'img');
const MAP_PATH = path.join(ROOT, 'data', 'img-map.json');
fs.mkdirSync(IMG_DIR, { recursive: true });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const load = (f) => JSON.parse(fs.readFileSync(path.join(JSON_DIR, f), 'utf-8'));
const machines = load('machines.json'), news = load('news.json'), pages = load('pages.json');

// URL収集
const urls = new Set();
const addFromHtml = (h) => { if (!h) return; for (const m of h.matchAll(/(?:src|href)="(https:\/\/suroschool\.jp\/[^"]+\.(?:jpg|jpeg|png|gif|webp))"/gi)) urls.add(m[1]); };
for (const m of machines) { addFromHtml(m.nerai_html); addFromHtml(m.kaiseki_html); if (m.thumb) urls.add(m.thumb); }
for (const a of news) { addFromHtml(a.content_html); if (a.thumb) urls.add(a.thumb); }
for (const p of pages) { addFromHtml(p.content_html); if (p.thumb) urls.add(p.thumb); }
const list = [...urls].filter(u => /^https:\/\/suroschool\.jp\//.test(u));
console.log('ユニーク画像:', list.length);

const map = fs.existsSync(MAP_PATH) ? JSON.parse(fs.readFileSync(MAP_PATH, 'utf-8')) : {};
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

let done = 0, skip = 0, fail = 0;
const CONC = 2;
let i = 0;
async function worker() {
  while (i < list.length) {
    const url = list[i++];
    const ext = (url.split('?')[0].match(/\.(jpg|jpeg|png|gif|webp)$/i) || ['', 'jpg'])[1].toLowerCase();
    const name = crypto.createHash('md5').update(url).digest('hex').slice(0, 16) + '.' + ext;
    const local = 'img/' + name;
    const fp = path.join(IMG_DIR, name);
    if (map[url] && fs.existsSync(fp)) { skip++; continue; }
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, 'Referer': 'https://suroschool.jp/' } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const buf = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(fp, buf);
      map[url] = local; done++;
      if (done % 25 === 0) { fs.writeFileSync(MAP_PATH, JSON.stringify(map, null, 2)); console.log(`  ${done} 取得 / ${skip} skip`); }
    } catch (e) {
      fail++; console.log('  [ERR]', url.slice(40), String(e).slice(0, 60));
    }
    await sleep(400);
  }
}
await Promise.all(Array.from({ length: CONC }, worker));
fs.writeFileSync(MAP_PATH, JSON.stringify(map, null, 2));
console.log(`完了: 取得 ${done} / skip ${skip} / 失敗 ${fail} / マップ ${Object.keys(map).length}件 → ${MAP_PATH}`);

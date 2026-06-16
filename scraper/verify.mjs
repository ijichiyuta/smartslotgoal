// verify.mjs — 認証済みで複数の機種ページを開き、解析/集計タブが解除され実データが入っているか確認する。
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROFILE_DIR = path.join(__dirname, '.profile');
const BASE = 'https://suroschool.jp';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
  headless: true,
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  locale: 'ja-JP',
});
const page = await ctx.newPage();

// sitemap から機種URLを取得
const res = await page.goto(`${BASE}/wp-sitemap-posts-machine-1.xml`, { waitUntil: 'domcontentloaded' });
const xml = await res.text();
const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
console.log('total machines:', urls.length);

// 末尾(=古め=データありそう)から5件 + 先頭5件を検証
const sample = [...urls.slice(0, 5), ...urls.slice(-5)];
for (const u of sample) {
  await sleep(1500);
  await page.goto(u, { waitUntil: 'networkidle', timeout: 45000 });
  const info = await page.evaluate(() => {
    const tabs = [...document.querySelectorAll('.machine-tab')].map(t => `${t.dataset.tab}:${t.classList.contains('is-disabled') ? 'OFF' : 'ON'}`);
    const len = (sel) => { const e = document.querySelector(sel); return e ? e.innerText.replace(/\s+/g, '').length : 0; };
    const title = (document.querySelector('h1, .entry-title') || {}).innerText || '';
    return {
      title: title.trim().slice(0, 30),
      tabs: tabs.join(' '),
      nerai: len('.machine-tab-panel[data-panel="nerai"]'),
      kaiseki: len('.machine-tab-panel[data-panel="kaiseki"]'),
      shukei: len('.machine-tab-panel[data-panel="shukei"]'),
      gate: !!document.querySelector('.machine-panel-lock-btn, .paywall-cta'),
    };
  });
  console.log(`${info.gate ? '🔒' : '✅'} [${info.tabs}] nerai=${info.nerai} kaiseki=${info.kaiseki} shukei=${info.shukei} | ${info.title}`);
}
await ctx.close();
process.exit(0);

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import fs from 'fs';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROFILE_DIR = path.join(__dirname, '.profile');
const BASE = 'https://suroschool.jp';
const url = `${BASE}/archives/machine/l%e6%9d%b1%e4%ba%ac%e5%96%b0%e7%a8%ae`; // L東京喰種 (kaisekiあり)

const ctx = await chromium.launchPersistentContext(PROFILE_DIR, { headless: true, locale: 'ja-JP',
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' });
const page = await ctx.newPage();

// 集計タブのクリックで何かfetchが走るか監視
const reqs = [];
page.on('request', r => { const u = r.url(); if (/admin-ajax|wp-json|\.json|shukei|集計|api/i.test(u)) reqs.push(r.method() + ' ' + u); });

await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });

// shukeiタブを強制的にクリック（disabledでもJS発火を試す）
const clicked = await page.evaluate(() => {
  const t = document.querySelector('.machine-tab[data-tab="shukei"]');
  if (!t) return 'no-shukei-tab';
  t.classList.remove('is-disabled'); t.removeAttribute('data-locked');
  t.click();
  return 'clicked';
});
await page.waitForTimeout(3000);

const shukeiHtml = await page.evaluate(() => {
  const p = document.querySelector('.machine-tab-panel[data-panel="shukei"]');
  return p ? p.outerHTML : 'no-shukei-panel';
});
const kaisekiSample = await page.evaluate(() => {
  const p = document.querySelector('.machine-tab-panel[data-panel="kaiseki"]');
  if (!p) return 'no';
  // セクション構造の見出しを列挙
  const secs = [...p.querySelectorAll('.kaiseki-section-title, .kaiseki-subsection-title')].map(e => e.innerText.trim());
  return secs.slice(0, 40);
});

console.log('clicked:', clicked);
console.log('\n=== network requests (ajax/json/api) on load+click ===');
console.log(reqs.length ? reqs.join('\n') : '(none)');
console.log('\n=== shukei panel HTML (first 1500 chars) ===');
console.log(shukeiHtml.slice(0, 1500));
console.log('\n=== kaiseki section titles ===');
console.log(JSON.stringify(kaisekiSample, null, 1));

fs.writeFileSync('/tmp/tokyoghoul.html', await page.content());
console.log('\nsaved /tmp/tokyoghoul.html');
await ctx.close();
process.exit(0);

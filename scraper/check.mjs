// check.mjs — 永続プロファイルの全Cookieを表示し、機種ページがアンロックされているか確認する。
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROFILE_DIR = path.join(__dirname, '.profile');
const STATE_PATH = path.join(__dirname, '..', 'data', 'auth.json');
const BASE = 'https://suroschool.jp';

const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
  headless: true,
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  locale: 'ja-JP',
});

const cookies = await ctx.cookies(BASE);
console.log('=== suroschool.jp cookies ===');
for (const c of cookies) console.log(' ', c.name, '=', String(c.value).slice(0, 24) + (c.value.length > 24 ? '…' : ''));

const page = await ctx.newPage();
const machineUrl = `${BASE}/archives/machine/%e6%88%a6%e5%9b%bd%e4%b9%99%e5%a5%b35-%e6%a5%ad%e7%81%ab%e3%82%92%e7%a9%bf%e3%81%a4%e5%ae%bf%e7%84%94%e3%81%ae%e5%8f%8c%e5%88%83`;
const res = await page.goto(machineUrl, { waitUntil: 'networkidle', timeout: 45000 });
console.log('\n=== machine page status:', res.status(), '===');

const info = await page.evaluate(() => {
  const lockedTabs = [...document.querySelectorAll('.machine-tab')].map(t => ({
    tab: t.dataset.tab, locked: t.dataset.locked, disabled: t.classList.contains('is-disabled'),
  }));
  const hasGate = !!document.querySelector('.machine-panel-lock-btn, .paywall-cta');
  const gateText = (document.body.innerText.match(/会員限定|ログインが必要/g) || []).length;
  const kaiseki = document.querySelector('.machine-tab-panel[data-panel="kaiseki"]');
  const shukei = document.querySelector('.machine-tab-panel[data-panel="shukei"]');
  return {
    lockedTabs,
    hasGate,
    gateTextCount: gateText,
    kaisekiLen: kaiseki ? kaiseki.innerText.length : null,
    shukeiLen: shukei ? shukei.innerText.length : null,
    loginNameMaybe: (document.querySelector('.logged-in, .user-name, .member-name') || {}).innerText || null,
  };
});
console.log(JSON.stringify(info, null, 2));

// 全Cookie（ドメイン問わず）も保存して storageState を更新
await ctx.storageState({ path: STATE_PATH });
console.log('\nstorageState saved ->', STATE_PATH);
await ctx.close();
process.exit(0);

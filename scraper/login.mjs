// login.mjs — 実ブラウザを起動し、ユーザーが Discord ログインを完了するのを待ってセッションを保存する。
// パスワードは扱わない。ユーザーがウィンドウ内で操作する。
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROFILE_DIR = path.join(__dirname, '.profile');   // 永続プロファイル（Cookie保持）
const STATE_PATH = path.join(__dirname, '..', 'data', 'auth.json');

const isLoggedIn = (cookies) =>
  cookies.some(c => /^wordpress_logged_in/.test(c.name)) ||
  cookies.some(c => /^wordpress_sec/.test(c.name));

const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
  headless: false,
  viewport: { width: 1280, height: 900 },
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  locale: 'ja-JP',
});

const page = ctx.pages()[0] || await ctx.newPage();
await page.goto('https://suroschool.jp/simple-login/', { waitUntil: 'domcontentloaded' });

console.log('\n===========================================================');
console.log(' ブラウザのウィンドウで「Discordでログイン」を完了してください。');
console.log(' ログインを検知すると自動でセッションを保存して閉じます。');
console.log(' （最大10分待機します）');
console.log('===========================================================\n');

const deadline = Date.now() + 10 * 60 * 1000;
let ok = false;
while (Date.now() < deadline) {
  const cookies = await ctx.cookies('https://suroschool.jp');
  if (isLoggedIn(cookies)) { ok = true; break; }
  await new Promise(r => setTimeout(r, 2000));
}

if (!ok) {
  console.error('タイムアウト: ログインを検知できませんでした。再実行してください。');
  await ctx.close();
  process.exit(1);
}

await ctx.storageState({ path: STATE_PATH });
const cookies = await ctx.cookies('https://suroschool.jp');
console.log('✅ ログイン成功。セッションを保存しました:', STATE_PATH);
console.log('   保持クッキー数:', cookies.length, '/ logged_in:',
  cookies.filter(c => /wordpress_logged_in/.test(c.name)).map(c => c.name));
await ctx.close();
process.exit(0);

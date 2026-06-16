// open.mjs — 永続プロファイルで実ブラウザを再表示する（ログイン済み状態の目視確認用）。
// ログイン画面と機種ページの両方を開く。最大15分間ウィンドウを保持し、セッションを保存し続ける。
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROFILE_DIR = path.join(__dirname, '.profile');
const STATE_PATH = path.join(__dirname, '..', 'data', 'auth.json');
const BASE = 'https://suroschool.jp';

const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
  headless: false,
  viewport: { width: 1280, height: 900 },
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  locale: 'ja-JP',
});

const page = ctx.pages()[0] || await ctx.newPage();
await page.goto(`${BASE}/simple-login/`, { waitUntil: 'domcontentloaded' });

const cookies = await ctx.cookies(BASE);
const loggedIn = cookies.some(c => c.name === 'custom_logged_in' && c.value === 'yes');
const user = (cookies.find(c => c.name === 'custom_discord_user') || {}).value;
console.log('=== reopened ===');
console.log('logged_in:', loggedIn, '/ user:', user ? decodeURIComponent(user) : '(none)');
console.log('ウィンドウを開きました。ログイン状態を確認してください（最大15分保持）。');
console.log('再ログイン/別アカウントにしたい場合はこのウィンドウで操作してください。');

// セッションを保存しつつ、最大15分保持。ログイン状態が変わったら追従保存。
const deadline = Date.now() + 15 * 60 * 1000;
while (Date.now() < deadline) {
  try { await ctx.storageState({ path: STATE_PATH }); } catch {}
  await new Promise(r => setTimeout(r, 5000));
}
await ctx.close();
process.exit(0);

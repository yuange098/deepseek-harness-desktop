/** 看真实会话里每个代码文件的"完整/片段"判定，确认没误伤完整脚本。 */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const WORK = process.env.DSH_WORK || path.join(__dirname, '..');
const LOGS = 'E:\\DeepSeekHarness\\logs';

app.setPath('userData', path.join(WORK, '.electron-scratch-judge2'));
app.disableHardwareAcceleration();

function currentUrl() {
  const files = fs
    .readdirSync(LOGS)
    .filter((f) => f.startsWith('dsh-web-') && f.endsWith('.log'))
    .map((f) => ({ f, t: fs.statSync(path.join(LOGS, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  for (const { f } of files) {
    const m = fs.readFileSync(path.join(LOGS, f), 'utf8').match(/dsh web:\s+(\S+)/);
    if (m) return m[1];
  }
  throw new Error('no url');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    useContentSize: true,
    show: true,
    webPreferences: { paintWhenInitiallyHidden: true, backgroundThrottling: false },
  });
  await win.loadURL(currentUrl());
  await sleep(11000);
  await win.webContents.executeJavaScript(`(() => {
    const rows = [...document.querySelectorAll('button,[role="button"],a,div')]
      .filter((el) => {
        const b = el.getBoundingClientRect();
        return el.offsetParent && b.left < 300 && b.width > 140 && b.height > 20 && b.height < 70
          && /(\\d+)\\s*(小时|分钟)/.test(el.textContent);
      })
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    if (rows[0]) rows[0].click();
  })()`);
  await sleep(6000);
  await win.webContents.executeJavaScript(`(() => {
    const el = [...document.querySelectorAll('button,[role="button"],[role="tab"],div')]
      .reverse()
      .find((n) => n.children.length === 0 && n.textContent.trim().startsWith('代码') && n.offsetParent);
    if (el) (el.closest('button,[role=button],[role=tab]') || el).click();
  })()`);
  await sleep(6000);
  const list = await win.webContents.executeJavaScript(`(() => {
    const snap = window.__CH_SNAP__;
    if (!snap) return { error: 'no snapshot' };
    const tasks = snap.extracted.tasks.map((t) => ({
      turn: t.turn,
      intent: t.intent,
      prompt: String(t.prompt || '').slice(0, 40),
      modules: t.modules.map((m) => ({ name: m.name, lines: m.lines, complete: m.complete, reason: m.reason })),
    }));
    const tiles = document.querySelectorAll('.ch-tile').length;
    const chips = [...document.querySelectorAll('.ch-chip')].map((b) => b.textContent.trim());
    const hint = (document.querySelector('.ch-hint') || {}).textContent || '';
    return { tasks, tiles, chips, hint };
  })()`);
  if (list.error) {
    console.log('拿不到快照：' + list.error);
    app.exit(1);
    return;
  }
  for (const t of list.tasks) {
    console.log(`任务 ${t.turn} [${t.intent}] 「${t.prompt}」`);
    for (const m of t.modules) {
      console.log(`   ${m.complete ? '✓ 完整' : '✗ 片段'}  ${m.name}  ${m.lines} 行  (${m.reason})`);
    }
  }
  console.log('可见卡片: ' + list.tiles + '   工具栏: ' + JSON.stringify(list.chips));
  console.log('折叠提示: ' + list.hint.trim());
  app.exit(0);
});

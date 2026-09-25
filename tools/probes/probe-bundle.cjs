/** 查服务端实际发给页面的插件包是哪一份（是否含我刚加的标记）。 */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const WORK = process.env.DSH_WORK || path.join(__dirname, '..');
const LOGS = 'E:\\DeepSeekHarness\\logs';

app.setPath('userData', path.join(WORK, '.electron-scratch-bundle'));
app.disableHardwareAcceleration();

function currentUrl() {
  const files = fs
    .readdirSync(LOGS)
    .filter((f) => f.startsWith('dsh-web-') && f.endsWith('.log'))
    .map((f) => ({ f, t: fs.statSync(path.join(LOGS, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  for (const { f } of files) {
    const m = fs.readFileSync(path.join(LOGS, f), 'utf8').match(/dsh web:\s+(http\S+)/);
    if (m) return m[1];
  }
  throw new Error('no url');
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    useContentSize: true,
    show: true,
    webPreferences: { paintWhenInitiallyHidden: true, backgroundThrottling: false },
  });
  await win.loadURL(currentUrl());
  await new Promise((r) => setTimeout(r, 11000));

  const urls = await win.webContents.executeJavaScript(
    `performance.getEntriesByType('resource').map((e) => e.name).filter((u) => /plugin|client|bundle/i.test(u))`,
  );
  console.log('资源 URL：');
  for (const u of urls) console.log('  ' + u);

  const target = urls.find((u) => /code-history/i.test(u)) || urls.find((u) => /client/i.test(u));
  if (!target) {
    console.log('没找到插件包 URL');
    app.exit(0);
    return;
  }
  const text = await win.webContents.executeJavaScript(
    `fetch(${JSON.stringify(target)}).then((r) => r.text())`,
  );
  console.log(`\n抓到：${target}\n  长度 ${text.length}`);
  for (const marker of ['__CH_SNAP__', 'ch-tile', '[code-history] 解析耗时']) {
    console.log(`  含 ${marker}: ${text.includes(marker)}`);
  }
  fs.writeFileSync(path.join(WORK, 'served-bundle.js'), text, 'utf8');
  console.log('已存到 work/served-bundle.js');
  app.exit(0);
});

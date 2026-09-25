/** 从右栏面板往上量到 body：每一层的类名/宽高/布局方式/内联样式，找出"占位的容器"到底是哪一层。 */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const WORK = process.env.DSH_WORK || path.join(__dirname, "..", "..", ".probe-work");
const LOGS = 'E:\\DeepSeekHarness\\logs';
const PROFILE = process.argv[2] || '.electron-scratch-hug';

app.setPath('userData', path.join(WORK, PROFILE));
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

const PROBE = `(() => {
  const d = (el, i) => {
    const b = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      i,
      tag: el.tagName.toLowerCase(),
      cls: (el.className || '').toString().slice(0, 70),
      rect: Math.round(b.left) + ',' + Math.round(b.top) + ' ' + Math.round(b.width) + 'x' + Math.round(b.height),
      disp: cs.display, dir: cs.flexDirection, ai: cs.alignItems, jc: cs.justifyContent,
      w: cs.width, h: cs.height, flexBasis: cs.flexBasis, flexGrow: cs.flexGrow,
      inline: el.getAttribute('style') || '',
      kids: el.children.length,
    };
  };
  const pane = document.querySelector('[class*="_pane_"]');
  if (!pane) return { error: '未找到面板' };
  const chain = [];
  let n = pane;
  for (let i = 0; i < 9 && n; i += 1) {
    chain.push(d(n, i));
    n = n.parentElement;
  }
  // 顶层那一行里都有谁
  const col = pane.closest('[class*="rightbarCol"]') || pane;
  const row = col && col.parentElement;
  const rowKids = row
    ? [...row.children].map((el) => d(el, 0))
    : [];
  return { win: window.innerWidth + 'x' + window.innerHeight, chain, rowCls: row ? (row.className || '').toString().slice(0, 60) : '', rowKids };
})()`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1500,
    height: 950,
    useContentSize: true,
    x: 40,
    y: 30,
    show: true,
    webPreferences: { paintWhenInitiallyHidden: true, backgroundThrottling: false },
  });
  await win.loadURL(currentUrl());
  await new Promise((r) => setTimeout(r, 11000));
  let info;
  try {
    info = await win.webContents.executeJavaScript(PROBE);
  } catch (e) {
    info = { error: String((e && e.message) || e) };
  }
  fs.writeFileSync(path.join(WORK, 'pane-chain.json'), JSON.stringify(info, null, 1), 'utf8');
  console.log('写出 pane-chain.json');
  app.exit(0);
});

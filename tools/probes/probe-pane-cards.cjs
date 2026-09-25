/**
 * 取证：右栏 7 张卡片到底是什么元素、什么类名、什么层级、什么尺寸。
 * 只读，不改任何东西。改样式前必须先跑这个。
 */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const WORK = process.env.DSH_WORK || path.join(__dirname, "..", "..", ".probe-work");
const LOGS = 'E:\\DeepSeekHarness\\logs';

app.setPath('userData', path.join(WORK, '.electron-scratch'));
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
  const cls = (el) => (el && el.className ? el.className.toString() : '');
  const brief = (el) => {
    if (!el || el.nodeType !== 1) return null;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      tag: el.tagName.toLowerCase(),
      cls: cls(el).slice(0, 80),
      size: Math.round(r.width) + 'x' + Math.round(r.height),
      h: cs.height,
      minH: cs.minHeight,
      pad: cs.padding,
      gap: cs.gap,
      fs: cs.fontSize,
      br: cs.borderRadius,
      disp: cs.display,
      ai: cs.alignItems,
      dir: cs.flexDirection,
    };
  };
  const pane =
    document.querySelector('[class*="_paneBody"]') ||
    document.querySelector('[class*="paneBody"]');
  if (!pane) return { error: '未找到右栏' };

  const cards = [...pane.querySelectorAll('button,a,[role="button"]')]
    .filter((el) => {
      const r = el.getBoundingClientRect();
      return r.height > 34 && r.width > 140 && r.height < 200;
    })
    .map((el) => {
      const r = el.getBoundingClientRect();
      const chain = [];
      let n = el;
      for (let i = 0; i < 4 && n && n !== pane.parentElement; i += 1) {
        chain.push(brief(n));
        n = n.parentElement;
      }
      const kids = [...el.children].slice(0, 4).map((k) => brief(k));
      return {
        text: el.textContent.trim().replace(/\\s+/g, ' ').slice(0, 18),
        w: Math.round(r.width),
        h: Math.round(r.height),
        inlineStyle: el.getAttribute('style'),
        self: brief(el),
        kids,
        chain: chain.slice(1),
      };
    });

  // 容器层：卡片共同父节点
  const parents = cards
    .map((c) => pane.querySelector('button,a,[role="button"]'))
    .filter(Boolean);
  const listParents = [];
  const first = [...pane.querySelectorAll('button,a,[role="button"]')][0];
  if (first) {
    let n = first.parentElement;
    let i = 0;
    while (n && n !== pane.parentElement && i < 4) {
      listParents.push(brief(n));
      n = n.parentElement;
      i += 1;
    }
  }
  return {
    paneWidth: Math.round(pane.getBoundingClientRect().width),
    paneStyle: brief(pane),
    listParents,
    count: cards.length,
    cards,
    unused: parents.length ? undefined : null,
  };
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
  await new Promise((r) => setTimeout(r, 9000));
  const info = await win.webContents.executeJavaScript(PROBE);
  const out = path.join(WORK, 'pane-cards.json');
  fs.writeFileSync(out, JSON.stringify(info, null, 1), 'utf8');
  console.log('写出：' + out);
  app.exit(0);
});

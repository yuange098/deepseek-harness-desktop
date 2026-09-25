/**
 * 取证：代码页里到底有哪些"可拖拽的分隔条"。
 * 扫描 cursor:*resize*、role=separator、以及官方 handle 类。
 */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const WORK = process.env.DSH_WORK || path.join(__dirname, '..');
const LOGS = 'E:\\DeepSeekHarness\\logs';
const PROFILE = process.argv[2] || '.electron-scratch-split';

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

const SCAN = `(() => {
  const info = (el) => {
    const cs = getComputedStyle(el);
    const b = el.getBoundingClientRect();
    const chain = [];
    let n = el;
    for (let i = 0; i < 4 && n; i += 1) {
      chain.push('<' + n.tagName.toLowerCase() + '.' + String(n.className || '').slice(0, 40) + '>');
      n = n.parentElement;
    }
    return {
      cls: String(el.className || '').slice(0, 60),
      cursor: cs.cursor,
      size: Math.round(b.width) + 'x' + Math.round(b.height),
      at: Math.round(b.left) + ',' + Math.round(b.top),
      opacity: cs.opacity,
      bg: cs.backgroundColor,
      role: el.getAttribute('role') || '',
      ariaLabel: el.getAttribute('aria-label') || '',
      inline: (el.getAttribute('style') || '').slice(0, 70),
      chain,
    };
  };
  const all = [...document.querySelectorAll('*')];
  const resizers = all.filter((el) => /resize/.test(getComputedStyle(el).cursor));
  const separators = all.filter((el) => el.getAttribute('role') === 'separator');
  const handles = all.filter((el) => /handle/i.test(String(el.className || '')));
  return {
    win: window.innerWidth + 'x' + window.innerHeight,
    resizers: resizers.map(info),
    separators: separators.map(info),
    handles: handles.map(info).slice(0, 12),
  };
})()`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  await sleep(11000);

  // 打开第一个会话，再切到「代码」页签
  await win.webContents.executeJavaScript(`(() => {
    const rows = [...document.querySelectorAll('button,[role="button"],a,div')]
      .filter((el) => {
        const b = el.getBoundingClientRect();
        return el.offsetParent && b.left < 300 && b.width > 140 && b.height > 20 && b.height < 70
          && /(\\d+)\\s*(小时|分钟)/.test(el.textContent);
      })
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    if (rows[0]) rows[0].click();
    return rows.length;
  })()`);
  await sleep(6000);
  const tab = await win.webContents.executeJavaScript(`(() => {
    const el = [...document.querySelectorAll('button,[role="button"],[role="tab"],div')]
      .reverse()
      .find((n) => n.children.length === 0 && n.textContent.trim() === '代码' && n.offsetParent);
    if (!el) return '没找到代码页签';
    (el.closest('button,[role=button],[role=tab]') || el).click();
    return '已切到代码页签';
  })()`);
  console.log('页签: ' + tab);
  await sleep(4000);

  const info = await win.webContents.executeJavaScript(SCAN);
  fs.writeFileSync(path.join(WORK, 'splitters.json'), JSON.stringify(info, null, 1), 'utf8');
  console.log('窗口: ' + info.win);
  console.log('=== cursor 含 resize 的元素（' + info.resizers.length + '） ===');
  for (const r of info.resizers) {
    console.log(`  ${r.size} @${r.at} cursor=${r.cursor} cls=${r.cls} role=${r.role} bg=${r.bg} op=${r.opacity}`);
    console.log('      链: ' + r.chain.join(' ← '));
  }
  console.log('=== role=separator（' + info.separators.length + '） ===');
  for (const r of info.separators) console.log(`  ${r.size} @${r.at} cls=${r.cls}`);
  console.log('=== 类名含 handle（' + info.handles.length + '） ===');
  for (const r of info.handles) console.log(`  ${r.size} @${r.at} cls=${r.cls} cursor=${r.cursor} inline=${r.inline}`);

  app.exit(0);
});

/**
 * 验证"任务意图判定"：
 *  1. 用真实句子测规则（写文字 / 代码 / 数据 / 绘图 / 边界情况）
 *  2. 看代码页现在的折叠状态（是否把文字任务的代码折起来了、有没有误伤）
 */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const WORK = process.env.DSH_WORK || path.join(__dirname, '..');
const LOGS = 'E:\\DeepSeekHarness\\logs';
const PROFILE = process.argv[2] || '.electron-scratch-intent';

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

const CASES = [
  ['我上传了一个文档，帮我写一篇 800 字的引言，语气正式一点', 'text'],
  ['帮我把这段摘要润色成学术英语', 'text'],
  ['把这份中文翻译成英文，保留术语', 'text'],
  ['根据这份材料写个汇报稿，大概两页', 'text'],
  ['帮我写一段致谢', 'text'],
  ['这份论文的讨论部分帮我扩写一下', 'text'],
  ['用 python 帮我画一张气泡图，数据在这个 csv 里', 'code'],
  ['这段报错怎么解决：ModuleNotFoundError: No module named pandas', 'code'],
  ['帮我把这三个表按 id 合并，然后统计每个月的总量', 'code'],
  ['用 matplotlib 画分组箱线图，输出 png', 'code'],
  ['写个脚本批量重命名这个文件夹里的文件', 'code'],
  ['帮我看下这个函数的时间复杂度，能不能优化', 'code'],
  ['把数据清洗一下再画个热力图', 'code'],
  ['帮我做个山脊图', 'code'],
  ['帮我把这份数据整理成 Word 报告', 'text'],
  ['用 Python 把这份数据整理成报告', 'code'],
  ['帮我看看这个', 'code'],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1500,
    height: 950,
    useContentSize: true,
    show: true,
    webPreferences: { paintWhenInitiallyHidden: true, backgroundThrottling: false },
  });
  await win.loadURL(currentUrl());
  await sleep(11000);

  const has = await win.webContents.executeJavaScript(`typeof window.__CH_INTENT__`);
  console.log('规则是否已加载: ' + has);
  if (has !== 'object') {
    console.log('插件还没挂规则，中止');
    app.exit(1);
    return;
  }

  const verdicts = await win.webContents.executeJavaScript(
    `(() => {
      const f = window.__CH_INTENT__.classifyIntent;
      return ${JSON.stringify(CASES)}.map(([text, expect]) => ({ text, expect, got: f(text) }));
    })()`,
  );
  let ok = 0;
  for (const v of verdicts) {
    const pass = v.got === v.expect;
    if (pass) ok += 1;
    console.log(`  ${pass ? '✓' : '✗'} [期望 ${v.expect} / 实际 ${v.got}] ${v.text}`);
  }
  console.log(`规则命中：${ok}/${verdicts.length}`);

  // 打开一个会话看实际折叠效果
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
      .find((n) => n.children.length === 0 && n.textContent.trim() === '代码' && n.offsetParent);
    if (el) (el.closest('button,[role=button],[role=tab]') || el).click();
  })()`);
  await sleep(6000);

  const view = await win.webContents.executeJavaScript(`(() => {
    const snap = window.__CH_SNAP__;
    const tasks = snap && snap.extracted ? snap.extracted.tasks.map((t) => ({
      turn: t.turn, intent: t.intent, modules: t.modules.length, prompt: String(t.prompt || '').slice(0, 60),
    })) : [];
    const chip = [...document.querySelectorAll('.ch-chip')].map((b) => b.textContent.trim());
    return {
      tasks,
      chip,
      hint: (document.querySelector('.ch-hint') || {}).textContent || '',
      count: (document.querySelector('.ch-count') || {}).textContent || '',
      tiles: document.querySelectorAll('.ch-tile').length,
    };
  })()`);
  fs.writeFileSync(path.join(WORK, 'intent-check.json'), JSON.stringify({ verdicts, view }, null, 1), 'utf8');
  console.log('\n=== 当前会话的任务判定 ===');
  for (const t of view.tasks) console.log(`  任务 ${t.turn}  ${t.intent}  ${t.modules} 个模块  「${t.prompt}」`);
  console.log('工具栏 chip: ' + JSON.stringify(view.chip));
  console.log('折叠提示: ' + view.hint.trim());
  console.log('模块计数: ' + view.count + '   可见卡片: ' + view.tiles);
  app.exit(0);
});

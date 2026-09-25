'use strict';

/**
 * DeepSeek Harness 桌面壳。
 *
 * 职责：
 *  1. 在本机拉起 `dsh web`（子进程），工作目录与 DSH_HOME 都固定在 E:\DeepSeekHarness 下；
 *  2. 从子进程输出里取出带 token 的访问地址，用应用窗口加载它，不再依赖外部浏览器；
 *  3. 提供托盘常驻、菜单、重启服务、日志、外链外开等桌面体验。
 */

const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  shell,
  dialog,
  clipboard,
  nativeImage,
  screen,
  session,
} = require('electron');
const { spawn, execFile } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');

const DSH_BIN_RELATIVE = path.join('core', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');
const URL_PATTERN = /dsh web:\s+(http\S+)/;
const LOG_TAIL_LIMIT = 400;

let config = null;
let serverProc = null;
let serverUrl = null;
let splash = null;
let mainWindow = null;
let tray = null;
let quitting = false;
let trayHintShown = false;
let restarting = false;
/** 正在进行的启动任务（防止 second-instance / 重复点击触发第二次启动）。 */
let appLoadPromise = null;
const outputTail = [];

// ---------------------------------------------------------------- 配置解析

function findInstallRoot(startDir) {
  let dir = startDir;
  for (let depth = 0; depth < 6; depth += 1) {
    if (fs.existsSync(path.join(dir, DSH_BIN_RELATIVE))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function readJsonIfExists(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function loadConfig() {
  const exeDir = path.dirname(process.execPath);
  const appDir = app.getAppPath();
  const candidates = [
    process.env.DSH_DESKTOP_CONFIG,
    path.join(exeDir, 'config.json'),
    path.join(exeDir, 'resources', 'config.json'),
    path.join(appDir, 'config.json'),
    path.join(appDir, '..', 'config.json'),
    'E:\\DeepSeekHarness\\desktop\\config.json',
  ].filter(Boolean);

  let fileConfig = null;
  for (const file of candidates) {
    const parsed = readJsonIfExists(file);
    if (parsed) {
      fileConfig = parsed;
      break;
    }
  }

  const root =
    (fileConfig && fileConfig.root) ||
    findInstallRoot(exeDir) ||
    findInstallRoot(appDir) ||
    'E:\\DeepSeekHarness';

  const resolved = {
    root,
    core: (fileConfig && fileConfig.core) || path.join(root, 'core'),
    home: (fileConfig && fileConfig.home) || path.join(root, 'home'),
    workspace: (fileConfig && fileConfig.workspace) || path.join(root, 'workspace'),
    logs: (fileConfig && fileConfig.logs) || path.join(root, 'logs'),
    node: (fileConfig && fileConfig.node) || process.env.DSH_NODE || '',
    port: (fileConfig && fileConfig.port) || 3080,
    title: (fileConfig && fileConfig.title) || 'DeepSeek Harness',
  };
  resolved.bin = path.join(resolved.core, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');
  resolved.stateFile = path.join(resolved.home, 'desktop-window-state.json');
  resolved.storeDir = path.join(resolved.root, '.pnpm-store');
  return resolved;
}

function resolveNodeExecutable() {
  if (config.node && fs.existsSync(config.node)) return config.node;
  const base = path.dirname(process.execPath);
  const local = path.join(base, 'node.exe');
  if (fs.existsSync(local)) return local;
  return 'node';
}

// ------------------------------------------------------------ 通用小工具

function ensureDirs() {
  for (const dir of [config.home, config.workspace, config.logs]) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {
      /* 目录已存在或暂不可写，后续错误会体现在子进程输出里 */
    }
  }
}

function currentLogFile() {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return path.join(config.logs, `dsh-web-${stamp}.log`);
}

function appendLog(line) {
  outputTail.push(line);
  if (outputTail.length > LOG_TAIL_LIMIT) outputTail.shift();
  try {
    fs.appendFileSync(logFile, line + '\n');
  } catch {
    /* 日志写入失败不影响主流程 */
  }
}

let logFile = null;

function getFreePort(preferred) {
  return new Promise((resolve) => {
    const tryPort = (port, attempt) => {
      if (attempt > 25) return resolve(0);
      const tester = net.createServer();
      tester.unref();
      tester.once('error', () => tryPort(port + 1, attempt + 1));
      tester.once('listening', () => {
        tester.close(() => resolve(port));
      });
      tester.listen(port, '127.0.0.1');
    };
    tryPort(preferred, 0);
  });
}

function probeHttp(url) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: 2500 }, (res) => {
      res.resume();
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getWindowState() {
  const saved = readJsonIfExists(config.stateFile) || {};
  // 兜底：历史状态里可能存过比屏幕还大的尺寸（会让最大化/关闭按钮跑到屏幕外），
  // 这里统一按当前显示器工作区裁剪一次。
  let work;
  try {
    work = screen.getPrimaryDisplay().workArea;
  } catch {
    work = { x: 0, y: 0, width: 1920, height: 1080 };
  }
  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
  const width = clamp(Math.round(Number(saved.width)) || 1360, 900, work.width);
  const height = clamp(Math.round(Number(saved.height)) || 880, 600, work.height);
  const rawX = Number.isFinite(saved.x) ? saved.x : undefined;
  const rawY = Number.isFinite(saved.y) ? saved.y : undefined;
  const x =
    rawX === undefined ? undefined : clamp(rawX, work.x - 40, work.x + work.width - 160);
  const y = rawY === undefined ? undefined : clamp(rawY, work.y, work.y + work.height - 120);
  return {
    width,
    height,
    x,
    y,
    maximized: Boolean(saved.maximized),
  };
}

let saveStateTimer = null;
function saveWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) return;
  clearTimeout(saveStateTimer);
  saveStateTimer = setTimeout(() => {
    try {
      const bounds = mainWindow.isMaximized() ? mainWindow.getNormalBounds() : mainWindow.getBounds();
      fs.writeFileSync(
        config.stateFile,
        JSON.stringify({ ...bounds, maximized: mainWindow.isMaximized() }, null, 2),
      );
    } catch {
      /* 状态保存失败可忽略 */
    }
  }, 400);
}

// ------------------------------------------------------------- 子进程管理

function buildServerEnv() {
  const env = { ...process.env };
  env.DSH_HOME = config.home;
  env.npm_config_store_dir = config.storeDir;
  env.DSH_DESKTOP = '1';
  const pathKey = Object.keys(env).find((k) => k.toLowerCase() === 'path') || 'Path';
  env[pathKey] = config.core + path.delimiter + (env[pathKey] || '');
  return env;
}

function stopServer() {
  if (!serverProc || serverProc.killed) return;
  const pid = serverProc.pid;
  serverProc.removeAllListeners('exit');
  if (process.platform === 'win32') {
    try {
      execFile('taskkill', ['/pid', String(pid), '/T', '/F'], () => {});
    } catch {
      serverProc.kill('SIGKILL');
    }
  } else {
    serverProc.kill('SIGTERM');
  }
  serverProc = null;
}

/**
 * 清理上次遗留的 dsh 服务进程（只杀命令行里跑本安装目录 dsh bin 的 node 进程）。
 * 场景：上次异常退出/强杀后残留的服务会占着 3080，导致新服务被迫漂到 3081、出现两个实例。
 */
function killStaleServers() {
  return new Promise((resolve) => {
    const script =
      "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | " +
      "Where-Object { $_.CommandLine -like '*deepseek-ai\\dsh\\lib\\bin.js*' } | " +
      'ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }';
    try {
      execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true }, () =>
        resolve(),
      );
    } catch {
      resolve();
    }
  });
}

async function startServer() {
  logFile = currentLogFile();
  // 先清掉可能残留的旧服务，保证端口从 3080 开始、且只会有一个实例。
  await killStaleServers();
  const port = await getFreePort(config.port);
  const url = `http://127.0.0.1:${port}`;
  appendLog(`[desktop] starting dsh web on port ${port} (cwd=${config.workspace})`);

  const nodeExe = resolveNodeExecutable();
  serverProc = spawn(nodeExe, [config.bin, 'web', '--no-open', '--port', String(port)], {
    cwd: config.workspace,
    env: buildServerEnv(),
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  serverProc.stdout.setEncoding('utf8');
  serverProc.stderr.setEncoding('utf8');
  serverProc.stdout.on('data', handleServerOutput);
  serverProc.stderr.on('data', handleServerOutput);
  serverProc.on('exit', handleServerExit);

  const deadline = Date.now() + 4 * 60 * 1000;
  while (Date.now() < deadline) {
    if (!serverProc) throw new Error('服务进程已退出');
    if (serverUrl) {
      for (let attempt = 0; attempt < 40; attempt += 1) {
        if (await probeHttp(url)) return serverUrl;
        await delay(1000);
      }
      return serverUrl;
    }
    await delay(1000);
  }
  throw new Error('启动超时（4 分钟）');
}

function handleServerOutput(chunk) {
  const text = String(chunk);
  for (const line of text.split(/\r?\n/)) {
    if (line.trim().length === 0) continue;
    appendLog(`[dsh] ${line}`);
    const match = URL_PATTERN.exec(line);
    if (match && !serverUrl) {
      serverUrl = match[1];
      setSplashProgress(0.8); // 服务已给出访问地址
    } else if (!match) {
      setSplashProgress(0.45); // 服务开始输出日志
    }
  }
}

function handleServerExit(code, signal) {
  appendLog(`[desktop] server exited code=${code} signal=${signal}`);
  serverProc = null;
  if (quitting || restarting) return;
  const detail = outputTail.slice(-12).join('\n');
  dialog
    .showMessageBox({
      type: 'error',
      title: 'DSH 服务已退出',
      message: `本地服务意外退出（code=${code}）。`,
      detail: detail || '没有捕获到输出。',
      buttons: ['重新启动', '打开日志文件夹', '退出'],
      defaultId: 0,
      cancelId: 2,
    })
    .then(({ response }) => {
      if (response === 0) restartServer();
      else if (response === 1) {
        shell.openPath(config.logs);
        restartServer();
      } else {
        quitApp();
      }
    });
}

async function restartServer() {
  // 若上一次启动还在进行，等它收尾，避免两个启动流程互相踩
  if (appLoadPromise) {
    try {
      await appLoadPromise;
    } catch {
      /* 上一次启动失败也没关系，继续重启 */
    }
  }
  restarting = true;
  serverUrl = null;
  stopServer();
  await delay(600);
  restarting = false;
  await loadApp();
}

// ---------------------------------------------------------------- 窗口

function iconPath(extension) {
  const file = path.join(__dirname, '..', 'assets', `icon.${extension}`);
  return fs.existsSync(file) ? file : undefined;
}

/**
 * 建（或复用）主窗口。窗口本身是标准的不透明窗口：原生边框、最小化/最大化/关闭按钮、
 * 可自由拖拽缩放都在。服务还没就绪时先在窗口里显示启动画面，就绪后再导航到 DSH 界面。
 * @param url - 可选；给了就直接加载该地址，否则保持当前内容。
 */
function ensureMainWindow(url) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (url) mainWindow.loadURL(url);
    return mainWindow;
  }
  const state = getWindowState();
  mainWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#151517',
    title: config.title,
    icon: iconPath('ico'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      backgroundThrottling: false,
      // 隐藏状态下也先把首帧画好，这样 show() 时画面已经就绪
      paintWhenInitiallyHidden: true,
    },
  });

  if (state.maximized) mainWindow.maximize();
  try {
    mainWindow.setMaximizable(true);
  } catch {
    /* 平台不支持时忽略 */
  }
  if (url) mainWindow.loadURL(url);
  // 注意：这里不自动 show。主窗口先在后台把首帧渲染好（ready-to-show），
  // 由 loadApp() 在启动窗淡出之后再显示，避免两个窗口同时存在。

  // 启动后 15 秒内的“被动最小化”（非用户操作）会被还原，避免窗口刚起来就消失。
  let startupGuardActive = true;
  setTimeout(() => {
    startupGuardActive = false;
  }, 15000);
  mainWindow.on('minimize', () => {
    if (!startupGuardActive || quitting) return;
    setTimeout(() => {
      if (startupGuardActive && mainWindow && !mainWindow.isDestroyed() && mainWindow.isMinimized()) {
        mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
      }
    }, 1200);
  });
  mainWindow.on('resize', saveWindowState);
  mainWindow.on('move', saveWindowState);
  mainWindow.on('close', (event) => {
    if (quitting) return;
    event.preventDefault();
    mainWindow.hide();
    if (!trayHintShown && tray) {
      trayHintShown = true;
      try {
        tray.displayBalloon({
          title: 'DeepSeek Harness 仍在运行',
          content: '窗口已最小化到托盘，服务保持在线。右键托盘图标可退出。',
        });
      } catch {
        /* 部分环境不支持气泡提示 */
      }
    }
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    if (isLocal(target)) return { action: 'allow' };
    shell.openExternal(target);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, target) => {
    if (!isLocal(target)) {
      event.preventDefault();
      shell.openExternal(target);
    }
  });

  // 右键菜单：选中文字后能直接"复制"，输入框能粘贴，链接可外开。
  // （Electron 默认没有右键菜单，所以之前只能 Ctrl+C。）
  mainWindow.webContents.on('context-menu', (_event, params) => {
    const template = [];
    if (params.linkURL) {
      template.push(
        { label: '在默认浏览器中打开链接', click: () => shell.openExternal(params.linkURL) },
        { label: '复制链接地址', click: () => clipboard.writeText(params.linkURL) },
        { type: 'separator' },
      );
    }
    if (params.hasImageContents) {
      template.push({ label: '复制图片', role: 'copyImage' }, { type: 'separator' });
    }
    if (params.isEditable) {
      template.push(
        { label: '剪切', role: 'cut', enabled: params.editFlags.canCut },
        { label: '复制', role: 'copy', enabled: params.editFlags.canCopy },
        { label: '粘贴', role: 'paste', enabled: params.editFlags.canPaste },
        { label: '全选', role: 'selectAll' },
      );
    } else if (params.selectionText && params.selectionText.trim().length > 0) {
      template.push(
        { label: '复制', role: 'copy' },
        {
          label: '复制为纯文本',
          click: () => clipboard.writeText(params.selectionText.replace(/\r\n/g, '\n')),
        },
        { type: 'separator' },
        { label: '全选', role: 'selectAll' },
      );
    } else {
      template.push({ label: '全选', role: 'selectAll' });
    }
    Menu.buildFromTemplate(template).popup({ window: mainWindow });
  });
  return mainWindow;
}

/** 窗口立刻出现（先显示启动画面），不等服务起来。 */
/**
 * 启动画面：屏幕正中一个小长方形窗口，只有应用图标 + 名称 + 进度提示，
 * 服务就绪后关掉它再打开主窗口（360 那种启动样式）。
 */
function createSplash() {
  splash = new BrowserWindow({
    width: 260,
    height: 300,
    center: true,
    frame: false,
    resizable: false,
    movable: true,
    show: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    // 透明窗口：图标白底已去掉，只留黑色鲸鱼浮在桌面上
    transparent: true,
    backgroundColor: '#00000000',
    icon: iconPath('ico'),
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  splash.loadFile(path.join(__dirname, 'splash.html'));
  splash.once('ready-to-show', () => {
    if (splash && !splash.isDestroyed()) splash.show();
  });
  splash.on('closed', () => {
    splash = null;
  });
}

/** 推进启动窗里的进度条（0~1）。 */
function setSplashProgress(value) {
  if (splash && !splash.isDestroyed()) {
    splash.webContents
      .executeJavaScript(`window.setProgress && window.setProgress(${Number(value)})`)
      .catch(() => {});
  }
}

/** 关掉启动画面（如果还开着）。 */
function closeSplash() {
  if (splash && !splash.isDestroyed()) splash.destroy();
  splash = null;
}

/** 启动窗淡出，避免生硬地"啪"一下消失。 */
async function fadeOutSplash(durationMs = 170) {
  if (!splash || splash.isDestroyed()) return;
  const steps = 8;
  for (let i = steps - 1; i >= 0; i -= 1) {
    if (!splash || splash.isDestroyed()) return;
    try {
      splash.setOpacity(i / steps);
    } catch {
      break;
    }
    await delay(durationMs / steps);
  }
  closeSplash();
}

/**
 * 等待窗口/页面就绪事件；事件可能已经发生过时立即返回，最长等 timeoutMs。
 * @param win - 目标窗口。
 * @param event - 'ready-to-show'（首帧已绘制）或 'did-finish-load'（页面加载完成）。
 * @param timeoutMs - 兜底超时。
 */
function waitForWindowEvent(win, event, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(finish, timeoutMs);
    if (event === 'ready-to-show') {
      if (win.isVisible()) return finish();
      win.once('ready-to-show', finish);
    } else {
      if (!win.webContents.isLoading()) return finish();
      win.webContents.once('did-finish-load', finish);
    }
  });
}

function isLocal(target) {
  try {
    const parsed = new URL(target);
    return parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';
  } catch {
    return false;
  }
}

function showMainWindow() {
  // 启动过程中再次点击图标/菜单：只把启动窗提到前面，不要再跑一遍启动流程。
  if (appLoadPromise) {
    if (splash && !splash.isDestroyed()) {
      splash.show();
      splash.focus();
    }
    return;
  }
  if (!mainWindow || mainWindow.isDestroyed()) {
    boot();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

// ---------------------------------------------------------------- 托盘与菜单

function createTray() {
  const image = nativeImage.createFromPath(iconPath('png') || iconPath('ico') || '');
  tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image);
  tray.setToolTip('DeepSeek Harness');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '显示主窗口', click: showMainWindow },
      {
        label: '在默认浏览器中打开',
        click: () => {
          if (serverUrl) shell.openExternal(serverUrl);
        },
      },
      { type: 'separator' },
      { label: '检查更新…', click: () => checkForUpdates() },
      { label: '重启本地服务', click: () => restartServer() },
      { label: '打开日志文件夹', click: () => shell.openPath(config.logs) },
      { label: '打开工作区文件夹', click: () => shell.openPath(config.workspace) },
      { type: 'separator' },
      { label: '退出', click: () => quitApp() },
    ]),
  );
  tray.on('click', showMainWindow);
  tray.on('double-click', showMainWindow);
}

function buildMenu() {
  const template = [
    {
      label: '文件',
      submenu: [
        { label: '新建窗口', click: () => boot() },
        { label: '重启本地服务', accelerator: 'CmdOrCtrl+Shift+R', click: () => restartServer() },
        { type: 'separator' },
        { label: '在默认浏览器中打开', click: () => serverUrl && shell.openExternal(serverUrl) },
        { label: '打开工作区文件夹', click: () => shell.openPath(config.workspace) },
        { label: '打开日志文件夹', click: () => shell.openPath(config.logs) },
        { type: 'separator' },
        { label: '退出', accelerator: 'CmdOrCtrl+Q', click: () => quitApp() },
      ],
    },
    { label: '编辑', submenu: [{ role: 'undo', label: '撤销' }, { role: 'redo', label: '重做' }, { type: 'separator' }, { role: 'cut', label: '剪切' }, { role: 'copy', label: '复制' }, { role: 'paste', label: '粘贴' }, { role: 'selectAll', label: '全选' }] },
    { label: '视图', submenu: [{ label: '重新加载', accelerator: 'CmdOrCtrl+R', click: () => mainWindow && mainWindow.reload() }, { role: 'resetZoom', label: '实际大小' }, { role: 'zoomIn', label: '放大' }, { role: 'zoomOut', label: '缩小' }, { type: 'separator' }, { role: 'toggleDevTools', label: '开发者工具' }] },
    {
      label: '窗口',
      submenu: [{ role: 'minimize', label: '最小化' }, { role: 'zoom', label: '最大化' }, { role: 'close', label: '隐藏到托盘' }],
    },
    {
      label: '帮助',
      submenu: [
        { label: '检查更新…', click: () => checkForUpdates() },
        { type: 'separator' },
        {
          label: '关于',
          click: () =>
            dialog.showMessageBox({
              type: 'info',
              title: '关于',
              message: 'DeepSeek Harness 桌面客户端',
              detail: [
                `安装目录：${config.root}`,
                `DSH_HOME：${config.home}`,
                `工作区：${config.workspace}`,
                '',
                '本应用只是本地 dsh 运行时的桌面外壳，内容与浏览器版完全一致。',
              ].join('\n'),
              buttons: ['确定'],
            }),
        },
        { label: '官方文档', click: () => shell.openExternal('https://deepseek-harness.github.io/deepseek-harness/') },
        { label: '上游仓库', click: () => shell.openExternal('https://github.com/deepseek-ai/deepseek-harness') },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------------------------------------------------------------- 生命周期

function quitApp() {
  quitting = true;
  stopServer();
  app.quit();
}

// ------------------------------------------------------------ 检查更新（手动触发）

const REGISTRY = 'https://registry.npmjs.org';

/** 解析 semver（含预发布段）。 */
function parseVersion(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec(String(value || '').trim());
  if (!match) return null;
  return {
    numbers: [Number(match[1]), Number(match[2]), Number(match[3])],
    pre: match[4] ? match[4].split('.') : [],
  };
}

/** 比较两个版本号：a>b 返回正数，a<b 返回负数。 */
function compareVersions(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return 0;
  for (let i = 0; i < 3; i += 1) {
    if (left.numbers[i] !== right.numbers[i]) return left.numbers[i] - right.numbers[i];
  }
  if (left.pre.length === 0 && right.pre.length === 0) return 0;
  if (left.pre.length === 0) return 1; // 正式版高于预发布
  if (right.pre.length === 0) return -1;
  const length = Math.max(left.pre.length, right.pre.length);
  for (let i = 0; i < length; i += 1) {
    const x = left.pre[i];
    const y = right.pre[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const numericX = /^\d+$/.test(x);
    const numericY = /^\d+$/.test(y);
    if (numericX && numericY) {
      if (Number(x) !== Number(y)) return Number(x) - Number(y);
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
}

/** 取 npm registry 的 JSON（带超时）。 */
async function fetchJson(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/** 读取某个包在核心目录 / profile 目录里已安装的版本。 */
function readInstalledVersion(packageName) {
  const segments = packageName.split('/');
  const candidates = [
    path.join(config.core, 'node_modules', ...segments, 'package.json'),
    path.join(config.home, 'profiles', 'web', 'node_modules', ...segments, 'package.json'),
  ];
  for (const file of candidates) {
    const json = readJsonIfExists(file);
    if (json && json.version) return json.version;
  }
  return null;
}

/** 检查一个 npm 包是否有比已安装版本更新的发布版。 */
async function checkPackage(packageName, installed) {
  const meta = await fetchJson(`${REGISTRY}/${packageName.replace('/', '%2F')}`);
  const tags = meta['dist-tags'] || {};
  let bestTag = null;
  let bestVersion = null;
  for (const [tag, version] of Object.entries(tags)) {
    if (!bestVersion || compareVersions(version, bestVersion) > 0) {
      bestVersion = version;
      bestTag = tag;
    }
  }
  return {
    name: packageName,
    installed,
    latest: bestVersion,
    tag: bestTag,
    hasUpdate: Boolean(bestVersion) && compareVersions(bestVersion, installed) > 0,
  };
}

/** 收集核心与插件的更新情况。 */
async function collectUpdateInfo() {
  const coreInstalled = readInstalledVersion('@deepseek-ai/dsh') || 'unknown';
  const core = await checkPackage('@deepseek-ai/dsh', coreInstalled);

  const manifest = readJsonIfExists(path.join(config.home, 'profiles', 'web', 'package.json')) || {};
  const dependencies = Object.entries(manifest.dependencies || {});
  const plugins = [];
  const tasks = dependencies.map(async ([name, range]) => {
    if (/^(file|link|workspace|portal):/.test(String(range))) return; // 本地目录插件跳过
    const installed = readInstalledVersion(name);
    if (!installed) return;
    try {
      plugins.push(await checkPackage(name, installed));
    } catch {
      /* 单个包查不到就跳过，不影响整体结果 */
    }
  });
  await Promise.all(tasks);
  plugins.sort((a, b) => a.name.localeCompare(b.name));
  return { core, plugins, checkedAt: new Date().toISOString() };
}

/** 菜单里点击「检查更新」后的流程：查 → 弹窗报告 → 可一键复制更新命令。 */
async function checkForUpdates() {
  const previousTip = 'DeepSeek Harness';
  if (tray) tray.setToolTip(`${previousTip} · 正在检查更新…`);
  let info;
  try {
    info = await collectUpdateInfo();
  } catch (error) {
    if (tray) tray.setToolTip(previousTip);
    await dialog.showMessageBox({
      type: 'error',
      title: '检查更新失败',
      message: '无法访问 npm registry 获取版本信息。',
      detail: String((error && error.message) || error) + '\n\n可以检查网络/代理后重试。',
      buttons: ['确定'],
    });
    return;
  }
  if (tray) tray.setToolTip(previousTip);

  const updatablePlugins = info.plugins.filter((item) => item.hasUpdate);
  const coreLine = info.core.hasUpdate
    ? `Harness 核心：${info.core.installed} → ${info.core.latest}（npm 标签 ${info.core.tag}）`
    : `Harness 核心：${info.core.installed}（已是最新）`;
  const pluginLines = info.plugins.map((item) =>
    item.hasUpdate
      ? `• ${item.name}：${item.installed} → ${item.latest}`
      : `• ${item.name}：${item.installed}（已是最新）`,
  );
  const hasAny = info.core.hasUpdate || updatablePlugins.length > 0;

  const coreCommand = `npm install -g --prefix ${config.core} @deepseek-ai/dsh@${info.core.latest}`;
  const pluginCommand = `${config.root}\\dsh.cmd plugin --profile web update`;
  const commands = [coreCommand, pluginCommand].join('\n');

  const detail = [
    coreLine,
    '',
    `插件（${info.plugins.length} 个，${updatablePlugins.length} 个可更新）：`,
    ...pluginLines,
    '',
    hasAny ? '更新命令：' : '',
    hasAny ? coreCommand : '',
    hasAny && updatablePlugins.length ? pluginCommand : '',
    hasAny ? '\n提示：升级核心后，个别插件可能因 peer 版本检查被拒，建议核心与插件一起升级。' : '',
  ]
    .filter((line) => line !== '')
    .join('\n');

  const buttons = hasAny ? ['复制更新命令', '关闭'] : ['确定'];
  const { response } = await dialog.showMessageBox({
    type: hasAny ? 'info' : 'info',
    title: '检查更新',
    message: hasAny
      ? `发现可更新：核心 ${info.core.hasUpdate ? 1 : 0} 项、插件 ${updatablePlugins.length} 项`
      : '已是最新版本',
    detail,
    buttons,
    defaultId: 0,
    cancelId: buttons.length - 1,
  });

  if (hasAny && response === 0) {
    clipboard.writeText(commands);
    await dialog.showMessageBox({
      type: 'info',
      title: '已复制',
      message: '更新命令已复制到剪贴板',
      detail: '在 PowerShell 里粘贴执行即可。更新完成后重启本客户端。',
      buttons: ['确定'],
    });
  }
}

/**
 * 先弹小启动窗，等本地服务就绪后关掉它、打开主窗口；
 * 失败时弹对话框给出重试 / 打开日志 / 退出。
 */
/** 启动流程本体（只允许同时跑一个：重复调用会复用同一个 Promise）。 */
function loadApp() {
  if (appLoadPromise) return appLoadPromise;
  appLoadPromise = runLoadApp().finally(() => {
    appLoadPromise = null;
  });
  return appLoadPromise;
}

async function runLoadApp() {
  serverUrl = null;
  if (!splash || splash.isDestroyed()) createSplash();
  try {
    const url = await startServer();
    setSplashProgress(0.9);
    const isFreshWindow = !mainWindow || mainWindow.isDestroyed();
    const win = ensureMainWindow(url);
    // 先把主界面在后台渲染好，再收启动窗：这样切换时主窗口已经是画好的画面，不会露白。
    if (isFreshWindow) {
      await waitForWindowEvent(win, 'ready-to-show', 12000);
    }
    await waitForWindowEvent(win, 'did-finish-load', 12000);
    setSplashProgress(1);
    await delay(520); // 让进度条动画（0.5s）真正走满再收启动窗
    await fadeOutSplash(); // 启动窗先淡出消失
    if (win.isMinimized()) win.restore();
    if (!win.isVisible()) win.show();
    win.focus();
  } catch (error) {
    closeSplash();
    const detail = outputTail.slice(-15).join('\n');
    const { response } = await dialog.showMessageBox({
      type: 'error',
      title: 'DSH 启动失败',
      message: String(error && error.message ? error.message : error),
      detail: detail || '没有捕获到服务输出，请检查日志文件夹。',
      buttons: ['重试', '打开日志文件夹', '退出'],
      defaultId: 0,
      cancelId: 2,
    });
    if (response === 0) loadApp();
    else if (response === 1) {
      shell.openPath(config.logs);
      loadApp();
    } else quitApp();
  }
}

/** 兼容旧调用名。 */
const boot = loadApp;

// 命令行模式：`DeepSeek Harness.exe --check-updates` 只做检查、写 JSON、退出（便于脚本或手动排查）
if (process.argv.includes('--check-updates')) {
  app.whenReady().then(async () => {
    config = loadConfig();
    const reportFile = path.join(config.logs, 'update-check.json');
    try {
      const info = await collectUpdateInfo();
      fs.writeFileSync(reportFile, JSON.stringify(info, null, 2));
      process.stdout.write(JSON.stringify(info, null, 2) + '\n');
      app.exit(0);
    } catch (error) {
      try {
        fs.writeFileSync(reportFile, `ERROR: ${String((error && error.message) || error)}\n`);
      } catch {
        /* 写不进去也不影响退出码 */
      }
      process.stdout.write(`ERROR: ${String((error && error.message) || error)}\n`);
      app.exit(1);
    }
  });
} else if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showMainWindow);
  app.whenReady().then(async () => {
    config = loadConfig();
    ensureDirs();
    app.setAppUserModelId('com.deepseek.harness.desktop');
    // 每次启动清一次 HTTP 缓存：插件（例如主题）改版后界面不会卡在旧样式上。
    try {
      await session.defaultSession.clearCache();
    } catch {
      /* 缓存清理失败不影响启动 */
    }
    session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
      const allowed = [
        'notifications',
        'clipboard-read',
        'clipboard-sanitized-write',
        'media',
        'audioCapture',
        'videoCapture',
        'fullscreen',
        'geolocation',
      ];
      callback(allowed.includes(permission));
    });
    buildMenu();
    createTray();
    await boot();
  });

  app.on('activate', showMainWindow);
  app.on('before-quit', () => {
    quitting = true;
    stopServer();
  });
  app.on('window-all-closed', (event) => {
    event.preventDefault();
  });
}

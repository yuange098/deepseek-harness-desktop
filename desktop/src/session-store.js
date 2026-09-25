/**
 * 会话数据删除（只按 session id 精准删，所有路径都做包含性校验）。
 *
 * 实测的存放位置：
 *   home/sessions/<工作区目录>/<session-id>/session.v4.jsonl.zstd   ← 对话记录本体
 *   home/storages/session_projcache/sessions/<session-id>.json      ← 投影缓存
 *   home/storages/workspace.json                                    ← 登记着 sessionIds，要摘掉
 *
 * 注意：home/attachments/v1/objects 是内容寻址的**共享**附件库，没有"哪个会话引用"
 * 的映射，删单个会话时不动它（否则会连带其它对话的附件）。
 */
const fsp = require('node:fs/promises');
const path = require('node:path');

/** 会话 id：session-<uuid> 或裸 <uuid> 两种历史形态都认。 */
const SESSION_ID_PATTERN = /^(?:session-)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isValidSessionId = (id) => typeof id === 'string' && SESSION_ID_PATTERN.test(id);

/** child 必须在 parent 里面（且不是 parent 本身）——防止路径穿越。 */
const isInside = (child, parent) => {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
};

const exists = async (target) => {
  try {
    await fsp.stat(target);
    return true;
  } catch {
    return false;
  }
};

/** 递归统计一个目录的体积（会话目录通常只有几百 KB ~ 几 MB）。 */
async function dirSize(target) {
  let bytes = 0;
  let files = 0;
  let entries = [];
  try {
    entries = await fsp.readdir(target, { withFileTypes: true });
  } catch {
    return { bytes, files };
  }
  for (const entry of entries) {
    const child = path.join(target, entry.name);
    if (entry.isDirectory()) {
      const sub = await dirSize(child);
      bytes += sub.bytes;
      files += sub.files;
    } else if (entry.isFile()) {
      try {
        const stat = await fsp.stat(child);
        bytes += stat.size;
        files += 1;
      } catch {
        /* 读不到就跳过 */
      }
    }
  }
  return { bytes, files };
}

/**
 * 删除前给用户看"要删掉多大的东西"。
 * 元信息（标题/轮次/步骤/token/是否空白）直接从投影缓存里读，不用解压对话记录。
 */
async function describeSession(homeDir, sessionId) {
  if (!isValidSessionId(sessionId)) return { ok: false, error: 'invalid-session-id' };
  const dirs = await findSessionDirs(homeDir, sessionId);
  const caches = await findCacheFiles(homeDir, sessionId);
  let bytes = 0;
  let files = 0;
  for (const dir of dirs) {
    const size = await dirSize(dir);
    bytes += size.bytes;
    files += size.files;
  }
  for (const file of caches) {
    try {
      const stat = await fsp.stat(file);
      bytes += stat.size;
      files += 1;
    } catch {
      /* 忽略 */
    }
  }
  let meta = null;
  for (const file of caches) {
    try {
      const parsed = JSON.parse(await fsp.readFile(file, 'utf8'));
      const rows = parsed?.record?.rows ?? {};
      meta = {
        title: rows.title?.val ?? null,
        blank: Boolean(rows.sessionListMetadata?.val?.blank),
        turns: rows.sessionStats?.val?.turns ?? null,
        steps: rows.sessionStats?.val?.steps ?? null,
        tokens: rows.tokenUsage?.val?.totals ?? null,
        lastPromptAt: rows.sessionListMetadata?.val?.lastPromptAt ?? null,
      };
      break;
    } catch {
      /* 缓存坏了就只报体积 */
    }
  }
  return {
    ok: true,
    sessionId,
    bytes,
    files,
    dirCount: dirs.length,
    ...(meta ?? {}),
  };
}

/** 同一个会话可能出现在多个工作区目录下（换工作区后重建过），全都要删。 */
async function findSessionDirs(homeDir, sessionId) {
  const root = path.join(homeDir, 'sessions');
  let entries = [];
  try {
    entries = await fsp.readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const found = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(root, entry.name, sessionId);
    if (!isInside(candidate, root) || path.basename(candidate) !== sessionId) continue;
    try {
      const stat = await fsp.stat(candidate);
      if (stat.isDirectory()) found.push(candidate);
    } catch {
      /* 不存在就跳过 */
    }
  }
  return found;
}

async function findCacheFiles(homeDir, sessionId) {
  const dir = path.join(homeDir, 'storages', 'session_projcache', 'sessions');
  const file = path.join(dir, `${sessionId}.json`);
  if (!isInside(file, dir) || path.basename(file) !== `${sessionId}.json`) return [];
  return (await exists(file)) ? [file] : [];
}

/** 从 workspace.json 里摘掉这个会话的登记（sessionIds / pinned / archived）。 */
async function dropRegistryRefs(registryPath, sessionId) {
  let raw;
  try {
    raw = await fsp.readFile(registryPath, 'utf8');
  } catch {
    return false;
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return false;
  }
  let changed = false;
  const keep = (list) => {
    if (!Array.isArray(list)) return list;
    const next = list.filter((id) => id !== sessionId);
    if (next.length !== list.length) changed = true;
    return next;
  };
  const global = data.global ?? {};
  global.archivedSessionIds = keep(global.archivedSessionIds);
  global.pinnedSessionIds = keep(global.pinnedSessionIds);
  for (const workspace of Object.values(data.tables?.workspaces ?? {})) {
    if (!workspace || typeof workspace !== 'object') continue;
    workspace.sessionIds = keep(workspace.sessionIds);
  }
  if (!changed) return false;
  const tempPath = `${registryPath}.tmp-${process.pid}`;
  await fsp.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf8');
  await fsp.rename(tempPath, registryPath);
  return true;
}

/** 先算清楚要删哪些东西（dry-run 用它，测试也用它）。 */
async function planSessionDeletion(homeDir, sessionId) {
  if (!isValidSessionId(sessionId)) {
    return { ok: false, error: 'invalid-session-id' };
  }
  const targets = [
    ...(await findSessionDirs(homeDir, sessionId)),
    ...(await findCacheFiles(homeDir, sessionId)),
  ];
  return {
    ok: true,
    sessionId,
    targets,
    registry: path.join(homeDir, 'storages', 'workspace.json'),
  };
}

/**
 * 执行删除。
 * @param homeDir - DSH_HOME。
 * @param sessionId - 会话 id。
 * @param options.dryRun - 只列清单、不动文件。
 */
async function deleteSessionData(homeDir, sessionId, options = {}) {
  const plan = await planSessionDeletion(homeDir, sessionId);
  if (!plan.ok) return plan;
  if (options.dryRun) return { ...plan, removed: [], dryRun: true };

  const removed = [];
  const failed = [];
  for (const target of plan.targets) {
    try {
      await fsp.rm(target, { recursive: true, force: true });
      removed.push(target);
    } catch (error) {
      failed.push({ target, error: String((error && error.message) || error) });
    }
  }
  let registryChanged = false;
  try {
    registryChanged = await dropRegistryRefs(plan.registry, sessionId);
  } catch (error) {
    failed.push({ target: plan.registry, error: String((error && error.message) || error) });
  }
  return {
    ok: failed.length === 0,
    sessionId,
    removed,
    registryChanged,
    failed,
  };
}

module.exports = { isValidSessionId, planSessionDeletion, deleteSessionData, describeSession };

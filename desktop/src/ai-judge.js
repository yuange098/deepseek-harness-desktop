/**
 * 「这段代码能不能独立完成一个功能」——交给 AI 判断（带缓存，避免重复花钱）。
 *
 *   · 密钥：从 $DSH_HOME/.credentials.yaml 里取 DEEPSEEK_API_KEY 指向的 secret，
 *         只在本进程内使用，不写进日志、不返回给页面。
 *   · 缓存：$DSH_HOME/cache/code-history/judge.json，key = sha1(语言 + 代码)，
 *         同一段代码只问一次（以后翻历史都是免费的）。
 *   · 限额：每次调用最多问 maxCalls 段（默认 8），失败就返回原因，界面回退到本地规则。
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const DEFAULT_BASE_URL = 'https://api.deepseek.com';
const DEFAULT_MODEL = 'deepseek-chat';
const CACHE_VERSION = 1;
const MAX_CODE_CHARS = 4000;

/**
 * 从 .credentials.yaml 里取 DEEPSEEK_API_KEY（不外传、不打日志）。
 *
 * 实测这个文件里 refs 段直接存着密钥本体（sk- 开头）；records 段里还有一份 43 位的
 * secret，形态不同（不是这个接口用的）。所以：优先用 refs 里的值，
 * 万一将来改回"引用记录 id"的形态，再回退到按 id 找 records[].payload.secret。
 */
function readApiKey(homeDir) {
  let text;
  try {
    text = fs.readFileSync(path.join(homeDir, '.credentials.yaml'), 'utf8');
  } catch {
    return null;
  }
  const refMatch = text.match(/^\s*DEEPSEEK_API_KEY:\s*(\S+)\s*$/m);
  if (!refMatch) return null;
  const ref = refMatch[1].trim();
  // 形态一：refs 里就是密钥本身
  if (/^sk-[A-Za-z0-9\-_]{16,}$/.test(ref)) return ref;
  // 形态二：refs 里是记录 id，真正的密钥在 records[<id>].payload.secret
  let inRecords = false;
  let currentId = null;
  for (const rawLine of text.split(/\r?\n/)) {
    if (/^records:\s*$/.test(rawLine)) {
      inRecords = true;
      continue;
    }
    if (/^[A-Za-z]/.test(rawLine)) inRecords = false;
    if (!inRecords) continue;
    const idMatch = rawLine.match(/^ {2}([^\s:]+):\s*$/);
    if (idMatch) {
      currentId = idMatch[1];
      continue;
    }
    const secretMatch = rawLine.match(/^\s+secret:\s*(\S+)\s*$/);
    if (secretMatch && currentId === ref) return secretMatch[1];
  }
  return null;
}

const cachePath = (homeDir) => path.join(homeDir, 'cache', 'code-history', 'judge.json');

const hashCode = (lang, code) =>
  crypto.createHash('sha1').update(`${lang || ''}\u0000${code || ''}`).digest('hex').slice(0, 16);

async function loadCache(file) {
  try {
    const parsed = JSON.parse(await fsp.readFile(file, 'utf8'));
    if (parsed && parsed.version === CACHE_VERSION && parsed.items) return parsed;
  } catch {
    /* 首次运行或缓存损坏 */
  }
  return { version: CACHE_VERSION, items: {} };
}

async function saveCache(file, cache) {
  try {
    await fsp.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    await fsp.writeFile(tmp, JSON.stringify(cache), 'utf8');
    await fsp.rename(tmp, file);
  } catch {
    /* 缓存写失败不影响判断结果 */
  }
}

/** 解析模型返回的 JSON（容忍 ```json 围栏、前后夹带解释）。 */
function parseVerdict(text) {
  const body = String(text || "").trim();
  const fenced = body.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : body;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1));
    if (typeof parsed.usable !== "boolean") return null;
    return {
      usable: parsed.usable,
      feature: String(parsed.feature || "").slice(0, 24),
      reason: String(parsed.reason || "").slice(0, 40),
    };
  } catch {
    return null;
  }
}

const SYSTEM_PROMPT = [
  "你是代码审阅助手。判断用户给的代码能不能**独立完成一个明确功能**",
  "（例如：画一张图、合并/清洗数据、批量重命名、爬取页面、训练一个小模型、处理一份文件…）。",
  "标准：有入口或主流程、拿过去改个路径就能跑、能产出结果。",
  "只有几行、缺上下文、只是报错示例或片段 → usable=false。",
  "只输出 JSON，不要任何解释。",
].join("");

async function askModel({ apiKey, baseUrl, model, lang, name, code, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs || 25000);
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 200,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `文件名：${name || "(未命名)"}\n语言：${lang || "text"}\n\n\`\`\`\n${String(code || "").slice(0, MAX_CODE_CHARS)}\n\`\`\`\n\n输出 JSON：{"usable": true/false, "feature": "不超过12个字的中文功能名", "reason": "不超过20个字的中文理由"}`,
          },
        ],
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return { error: `HTTP ${response.status} ${detail.slice(0, 120)}` };
    }
    const payload = await response.json();
    const text = payload?.choices?.[0]?.message?.content ?? "";
    const verdict = parseVerdict(text);
    if (!verdict) return { error: "模型没有返回可解析的 JSON" };
    return { verdict, usage: payload?.usage || null };
  } catch (error) {
    return { error: String((error && error.message) || error) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 批量判断。items: [{ id, lang, name, code }]。
 * 返回 { ok, results: { [id]: { usable, feature, reason, cached } }, calls, error }
 */
async function judgeCodes(homeDir, items, options = {}) {
  const list = Array.isArray(items) ? items.filter((item) => item && item.code) : [];
  if (list.length === 0) return { ok: true, results: {}, calls: 0 };
  const file = cachePath(homeDir);
  const cache = await loadCache(file);
  const results = {};
  const pending = [];
  for (const item of list) {
    const key = hashCode(item.lang, item.code);
    const hit = cache.items[key];
    if (hit) {
      results[item.id] = { ...hit, cached: true };
      continue;
    }
    pending.push({ item, key });
  }
  if (pending.length === 0) return { ok: true, results, calls: 0 };

  const apiKey = process.env.DSH_JUDGE_KEY || readApiKey(homeDir);
  if (!apiKey) {
    return { ok: false, results, calls: 0, error: "没有找到可用的 API 密钥（.credentials.yaml 里没有 DEEPSEEK_API_KEY）" };
  }
  const baseUrl = options.baseUrl || process.env.DSH_JUDGE_BASE_URL || DEFAULT_BASE_URL;
  const model = options.model || process.env.DSH_JUDGE_MODEL || DEFAULT_MODEL;
  const maxCalls = Math.max(0, Number.isFinite(options.maxCalls) ? options.maxCalls : 8);
  const queue = pending.slice(0, maxCalls);
  const skipped = pending.length - queue.length;
  let calls = 0;
  let firstError = null;

  const run = async ({ item, key }) => {
    const outcome = await askModel({ apiKey, baseUrl, model, lang: item.lang, name: item.name, code: item.code });
    calls += 1;
    if (outcome.error) {
      if (!firstError) firstError = outcome.error;
      return;
    }
    cache.items[key] = { ...outcome.verdict, at: Date.now(), model };
    results[item.id] = { ...outcome.verdict, cached: false };
  };

  // 并发 2，别把接口打满
  for (let i = 0; i < queue.length; i += 2) {
    await Promise.all(queue.slice(i, i + 2).map(run));
  }
  await saveCache(file, cache);
  return {
    ok: calls > 0 && !firstError,
    results,
    calls,
    skipped,
    ...(firstError ? { error: firstError } : {}),
  };
}

module.exports = { readApiKey, parseVerdict, judgeCodes, hashCode };

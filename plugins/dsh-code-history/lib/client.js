window.__ModuleLoader__.load({
	id: "dsh-code-history",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const react = require("react");
		const h = react.createElement;

		// ---------------------------------------------------------------- 工具
		const FENCE = /```([A-Za-z0-9+#._-]*)\r?\n([\s\S]*?)```/g;
		const LANG_ALIAS = { py: "python", python: "python", js: "javascript", ts: "typescript", sh: "bash", powershell: "pwsh", ps1: "pwsh", r: "r", sql: "sql", json: "json", yaml: "yaml", yml: "yaml", md: "markdown" };
		const CODE_FILE = /\.(py|js|mjs|cjs|ts|tsx|jsx|r|sql|sh|ps1|bat|ipynb|json|ya?ml|toml|ini|java|cpp|c|cs|go|rs|rb|php|lua|m)$/i;
		const UNRUNNABLE = /^[\s\d.,:;!?，。：；、]+$/;

		const isCode = (text) => typeof text === "string" && text.length > 0 && !UNRUNNABLE.test(text);
		const baseName = (p) => String(p || "").replace(/\\/g, "/").split("/").pop() || "代码";
		const normLang = (lang) => LANG_ALIAS[String(lang || "").toLowerCase()] || String(lang || "").toLowerCase() || "text";
		const lines = (text) => String(text || "").split(/\r?\n/).length;
		const HOUR = 3600000;
		/** 相对时间：刚刚 / N 分钟前 / N 小时前 / N 天前。 */
		function timeAgo(ms) {
			if (!ms) return "";
			const diff = Date.now() - Number(ms);
			if (diff < 60000) return "刚刚";
			if (diff < HOUR) return Math.round(diff / 60000) + " 分钟前";
			if (diff < 24 * HOUR) return Math.round(diff / HOUR) + " 小时前";
			return Math.round(diff / (24 * HOUR)) + " 天前";
		}
		/** 智能预览：跳过编码声明/shebang/空行，优先展示文档串或首个说明性注释。 */
		function previewOf(code) {
			const rows = String(code || "").split(/\r?\n/);
			for (const row of rows) {
				const line = row.trim();
				if (!line) continue;
				if (/^#!/.test(line) || /coding[:=]/.test(line)) continue;
				if (/^("""|'''|#\s*[^\d])/.test(line)) return line.replace(/^#\s*/, "").slice(0, 70);
				if (/^(import|from|const|let|var|using|package)\b/.test(line)) continue;
				return line.slice(0, 70);
			}
			return rows.slice(0, 2).join(" ").slice(0, 60);
		}
		/** 代码特征摘要：函数/类数量 + 主要库。 */
		function digestOf(item) {
			const code = String(item.code || "");
			const defs = (code.match(/^\s*(def|class|function)\s+/gm) || []).length;
			const libs = [...new Set((code.match(/\b(matplotlib|seaborn|pandas|numpy|sklearn|plotly|requests|playwright|puppeteer|electron|tkinter)\b/gi) || []).map((s) => s.toLowerCase()))];
			const parts = [];
			if (defs) parts.push(defs + " 个函数/类");
			if (libs.length) parts.push(libs.slice(0, 3).join("/"));
			return parts.join(" · ");
		}
		/** 依赖清单：抓 import / from / require / using。 */
		function depsOf(code) {
			const text = String(code || "");
			const found = new Set();
			for (const m of text.matchAll(/^\s*(?:import|from)\s+([A-Za-z_][\w.]*)/gm)) found.add(m[1].split(".")[0]);
			for (const m of text.matchAll(/require\(\s*['"]([^'"./][^'"]*)['"]\s*\)/g)) found.add(m[1].split("/")[0]);
			for (const m of text.matchAll(/^\s*using\s+([A-Za-z_][\w.]*)/gm)) found.add(m[1].split(".")[0]);
			return [...found].filter((n) => !["os", "sys", "time", "math", "json", "re", "io"].includes(n)).slice(0, 6);
		}
		/** 输入 → 输出：从读写文件/保存图片的调用里推断。 */
		function flowOf(code) {
			const text = String(code || "");
			const pick = (re) => {
				const out = new Set();
				for (const m of text.matchAll(re)) if (m[1] && !/^https?:/.test(m[1])) out.add(m[1].split(/[\\/]/).pop());
				return [...out];
			};
			const inputs = pick(/(?:read_csv|read_excel|read_json|read_parquet|read_table|open|load|loadtxt|imread)\(\s*['"]([^'"]+)['"]/g);
			const outputs = pick(/(?:savefig|to_csv|to_excel|to_json|writeFileSync|writeFile|write_text|imsave|save)\(\s*['"]([^'"]+)['"]/g);
			return { inputs: inputs.slice(0, 3), outputs: outputs.slice(0, 3) };
		}

		/** 从一段文本里抽出围栏代码块。 */
		function fences(text) {
			const out = [];
			if (!isCode(text)) return out;
			FENCE.lastIndex = 0;
			let m;
			while ((m = FENCE.exec(text)) !== null) {
				if (isCode(m[2].trim())) out.push({ lang: normLang(m[1]), code: m[2].replace(/\s+$/, "") });
			}
			return out;
		}

		/**
		 * 抽出命令行里的多行内联脚本（heredoc 形式）：
		 *   python - <<'PY'
		 *   ...多行代码...
		 *   PY
		 * 只收 ≥3 行的，一行命令仍然忽略。
		 */
		function inlineScripts(text) {
			const out = [];
			if (!isCode(text) || text.length > 200000) return out;
			const lines = String(text).split(/\r?\n/);
			for (let i = 0; i < lines.length; i += 1) {
				const marker = /<<-?\s*['"]?([A-Za-z_][A-Za-z0-9_]*)['"]?\s*$/.exec(lines[i]);
				if (!marker) continue;
				const tag = marker[1];
				const head = lines[i].toLowerCase();
				const lang = /python|py\b/.test(head) ? "python" : /node|js\b/.test(head) ? "javascript" : "text";
				const body = [];
				let j = i + 1;
				for (; j < lines.length; j += 1) {
					if (lines[j].trim() === tag) break;
					body.push(lines[j]);
				}
				if (body.length >= 3 && j < lines.length) {
					out.push({ name: "内联脚本." + (lang === "python" ? "py" : lang === "javascript" ? "js" : "txt"), code: body.join("\n") });
				}
				i = j;
			}
			return out;
		}

		/** 取文本里最后一段像"说明"的内容作为模块名（标题优先，其次句子）。 */
		/**
		 * 任务意图：这个任务要的成果到底是「代码 / 数据 / 图表」，还是「文字」。
		 *
		 * 为什么需要：上传文档让 AI 写文字时，它可能顺手写个脚本处理文本、或在回答里夹几行代码
		 * —— 那些不是你要的，不该混进代码模块；而「问代码问题」「处理数据的脚本」「画图表的代码」
		 * 才是真正要归档的。
		 *
		 * 判定只看**用户提问原文**（关键词权重求和）：写文字的词 vs 代码/数据/绘图的词。
		 * 抓不到提问时一律按「代码任务」处理（宁可多留，不要漏掉真有用的代码）。
		 */
		const INTENT_RULES = [
			// —— 文字类：成果是文章 / 文档 ——
			{ kind: "text", w: 4, re: /润色|改写|扩写|缩写|降重|查重|译成|翻译|校对|proofread|polish|paraphrase|rewrite|translat/i },
			{ kind: "text", w: 3, re: /写(一|篇|段|份|个)?[^,，。;；]{0,8}(文章|论文|报告|文案|邮件|简历|讲稿|稿子|汇报稿|发言稿|综述|摘要|正文|段落|章节|说明|材料|评语|前言|引言|讨论|结论|致谢)/ },
			{ kind: "text", w: 3, re: /(摘要|引言|讨论|结论|致谢|参考文献|cover ?letter|审稿意见|回复信|返修信|写作|行文|汇报稿|发言稿|讲稿)/i },
			// 交付物是"文档形态"的，算文字任务（Word / 报告 / 排版…）；权重调高，
			// 这样"把数据整理成 Word 报告"这种会被判成文字任务（要的是报告，不是脚本）
			{ kind: "text", w: 3, re: /(文档|文稿|docx?|word|wps|pdf|报告|纪要|提纲|大纲|排版|格式规范|错别字|病句)/i },
			// —— 代码 / 数据类：成果是代码、数据、图表 ——
			{ kind: "code", w: 4, re: /(代码|源码|脚本|函数|类|模块|依赖|编译|报错|异常|调试|debug|重构|单测|单元测试|接口|api|正则|regex)/i },
			{ kind: "code", w: 4, re: /(python|pandas|numpy|matplotlib|seaborn|plotly|sklearn|scipy|r语言|ggplot|tidyverse|sql|mysql|sqlite|javascript|typescript|node\.?js|shell|bash|powershell|conda|pip|git)\b/i },
			{ kind: "code", w: 3, re: /(绘图|画图|作图|可视化|图表|折线|柱状|柱形|散点|箱线|箱型|热力|热图|气泡图|山脊|词云|饼图|雷达|桑基|直方图|小提琴)/ },
			{ kind: "code", w: 2, re: /(数据|数据集|统计|回归|聚类|相关性|显著性|清洗|预处理|合并|分组|透视|爬取|抓取|解析|批量|自动化)/ },
		];

		/** 提问 → "code" | "text"。抓不到提问或双方都不命中时按 code（保持原行为）。 */
		function classifyIntent(prompt) {
			const text = String(prompt || "").trim();
			if (!text) return "code";
			let code = 0;
			let writing = 0;
			for (const rule of INTENT_RULES) {
				if (!rule.re.test(text)) continue;
				if (rule.kind === "code") code += rule.w;
				else writing += rule.w;
			}
			return writing > code ? "text" : "code";
		}

		/** 轨迹里的 user 块：正文可能在 content / text 里，也可能是分片数组。 */
		function userTextOf(block) {
			const raw = (block && (block.content !== undefined ? block.content : block.text)) || "";
			if (typeof raw === "string") return raw;
			if (Array.isArray(raw)) {
				return raw
					.map((part) => (typeof part === "string" ? part : (part && (part.text || part.content)) || ""))
					.join(" ");
			}
			if (raw && typeof raw === "object") return String(raw.text || raw.content || "");
			return "";
		}

		function guessTitle(text) {
			if (!isCode(text)) return "";
			const cleaned = String(text).replace(FENCE, "\n").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
			for (let i = cleaned.length - 1; i >= 0; i -= 1) {
				const line = cleaned[i].replace(/^[#>*\-\s]+/, "").replace(/[*`]/g, "").replace(/[:：,，。.]+$/, "");
				if (line.length >= 6 && line.length <= 42 && !/[。；,;]$/.test(line)) return line;
			}
			const joined = cleaned.join(" ");
			return joined.length > 6 ? joined.slice(0, 24) : "";
		}

		/**
		 * 一次遍历同时喂对象和字符串（保持真实顺序，Map/Set 也认）。
		 * 客户端快照里 `nodes` 是 Map，不特殊处理会把内容整个漏掉。
		 */
		const HEAVY_KEY = /(reasoning|thinking|thought|image|base64|snapshot|diff|patch|stdout|stderr|output|trace)/i;
		const MAX_STRING = 200000;
		function walkAll(node, onObject, onString, depth = 0, maxDepth = 6) {
			if (node === null || node === undefined || depth > maxDepth) return;
			if (typeof node === "string") {
				if (node.length <= MAX_STRING) onString(node);
				return;
			}
			if (typeof node !== "object") return;
			if (node instanceof Map || node instanceof Set) {
				for (const value of node.values()) walkAll(value, onObject, onString, depth + 1);
				return;
			}
			if (Array.isArray(node)) {
				for (const item of node) walkAll(item, onObject, onString, depth + 1);
				return;
			}
			onObject(node);
			for (const key of Object.keys(node)) {
				// 思维链/图片/大日志这类内容与代码无关，跳过以免卡顿
				if (HEAVY_KEY.test(key)) continue;
				walkAll(node[key], onObject, onString, depth + 1, maxDepth);
			}
		}

		/** 递归找"文件写入"：同一个对象里既有路径又有大段内容。 */
		function writesFrom(node, out, depth = 0) {
			if (node === null || node === undefined || depth > 6) return out;
			if (Array.isArray(node)) {
				for (const item of node) writesFrom(item, out, depth + 1);
				return out;
			}
			if (typeof node !== "object") return out;
			const keys = Object.keys(node);
			const pathKey = keys.find((k) => /^(file_?path|filepath|path|filename|file)$/i.test(k));
			const bodyKey = keys.find((k) => /^(content|file_?text|new_?str(ing)?|text|code|source)$/i.test(k));
			const path = pathKey ? node[pathKey] : "";
			const body = bodyKey ? node[bodyKey] : "";
			if (typeof path === "string" && CODE_FILE.test(path) && isCode(body) && String(body).length > 60) {
				out.push({ path, code: String(body), lang: normLang(path.split(".").pop()) });
			}
			for (const key of keys) writesFrom(node[key], out, depth + 1);
			return out;
		}

		/**
		 * 汇总两类代码：
		 *  A「执行」= 轨迹快照里的文件写入（同一路径只保留最终版本，天然可直接运行）
		 *  B「回答」= 聊天快照里的围栏代码块（按出现顺序，最新在前）
		 * 只取文件写入与回答代码块，不收录一行命令。
		 */
		function extract(trajectory, chatSources) {
			const chats = Array.isArray(chatSources) ? chatSources.filter(Boolean) : [chatSources].filter(Boolean);
			// turn -> { turn, modules: Map<path, module> }：一个任务的代码归到一组
			const tasks = new Map();
			let clock = 0;
			/** 最近一条用户提问：user 块本身不带 turn，交给它后面第一个事件所在的 turn 认领。 */
			let pendingPrompt = "";
			/** 轨迹里的助理正文（带 turn），用它给「回答」页签的代码也补上任务归属。 */
			const trajAnswers = [];

			/** 一次文件写入：路径 + 内容。 */
			const addWrite = (turn, path, body, time) => {
				if (typeof path !== "string" || !CODE_FILE.test(path)) return;
				if (typeof body !== "string" || body.length < 60 || !isCode(body)) return;
				const key = path.toLowerCase();
				const task = tasks.get(turn) || { turn, modules: new Map() };
				tasks.set(turn, task);
				const prev = task.modules.get(key);
				const versions = prev && prev.versions ? prev.versions.slice() : [];
				versions.push({ code: body, lines: lines(body), time: time || 0 });
				// 同一个文件被写/改多次时，保留最后一次的内容（即最终可运行版本）
				task.modules.set(key, {
					path,
					name: baseName(path),
					lang: normLang(path.split(".").pop()),
					code: body,
					count: (prev ? prev.count : 0) + 1,
					lines: lines(body),
					order: (prev ? prev.order : 0) || ++clock,
					time: time || (prev ? prev.time : 0),
					origin: "自动执行",
					versions,
				});
			};

			/** 从对象里认"路径 + 内容"（兼容 content / new_string / file_text 等键名）。 */
			const considerObject = (turn, obj, time) => {
				const keys = Object.keys(obj);
				const pathKey = keys.find((k) => /^(file_?path|filepath|path|filename|file)$/i.test(k));
				const bodyKey = keys.find((k) => /^(content|file_?text|new_?str(ing)?|text|code|source)$/i.test(k));
				if (!pathKey || !bodyKey) return;
				addWrite(turn, obj[pathKey], obj[bodyKey], time);
			};

			/** 从字符串里认：① JSON 形式的工具参数 ② 带围栏的代码。 */
			const considerString = (turn, text, time) => {
				if (!isCode(text)) return;
				const trimmed = text.trim();
				if (trimmed.startsWith("{") && trimmed.endsWith("}") && trimmed.length < 200000) {
					try {
						considerObject(turn, JSON.parse(trimmed), time);
					} catch {
						/* 不是 JSON 就算了 */
					}
				}
			};

			// 只逐条走轨迹节点的 blocks，并且跳过 reasoning（思考链又大又没代码）
			if (trajectory && Array.isArray(trajectory.eventNodes)) {
				for (const node of trajectory.eventNodes) {
					if (!node || typeof node !== "object") continue;
					const turn = Number(node.turn) || 0;
					const time = Number(node.time) || 0;
					const blocks = Array.isArray(node.blocks) ? node.blocks : [node];
					// 运行状态：这个任务里出现过报错关键字就标红，有结果但没报错标绿
					const task = tasks.get(turn) || { turn, modules: new Map(), hadResult: false, failed: false };
					tasks.set(turn, task);
					// 这个 turn 认领之前攒下的那条提问（每个任务只认领一次）
					if (turn > 0 && !task.prompt && pendingPrompt) {
						task.prompt = pendingPrompt;
						pendingPrompt = "";
					}
					for (const block of blocks) {
						if (!block || typeof block !== "object") continue;
						const kind = String(block.kind || "").toLowerCase();
						// 用户提问（没有 turn，先攒着）与助理正文（有 turn，用来给回答代码找任务归属）
						if (kind === "user") {
							const prompt = userTextOf(block).trim();
							if (prompt) pendingPrompt = prompt.slice(0, 500);
							continue;
						}
						if (kind === "text" && typeof block.text === "string" && block.text) {
							trajAnswers.push({ turn, text: block.text, time });
						}
						if (kind.includes("tool")) task.hadResult = true;
						const raw = typeof block.text === "string" ? block.text : "";
						if (/(traceback|error:|exception|is not recognized|exit code:? [1-9]|退出码 [1-9]|failed)/i.test(raw)) task.failed = true;
					}
					for (const block of blocks) {
						if (!block || typeof block !== "object") continue;
						if (String(block.kind || "").toLowerCase().includes("reasoning")) continue;
						walkAll(
							block,
							(obj) => considerObject(turn, obj, time),
							(text) => {
								considerString(turn, text, time);
								// 命令行里的多行内联脚本（heredoc / python - <<）也算"执行过的代码"，
								// 但一行命令仍然不收。
								for (const script of inlineScripts(text)) addWrite(turn, script.name, script.code, time);
							},
							0,
							5,
						);
					}
				}
			}

			const answers = [];
			for (const chat of chats) {
				// ① 结构化代码部件（客户端把 markdown 拆成了部件）
				walkAll(
					chat,
					(obj) => {
						const keys = Object.keys(obj);
						const codeKey = keys.find((k) => /^(code|value|text|content|source)$/i.test(k));
						const langKey = keys.find((k) => /^(lang|language|languageid|syntax)$/i.test(k));
						const kindKey = keys.find((k) => /^(type|kind)$/i.test(k));
						if (!codeKey || !langKey || !kindKey) return;
						const kind = String(obj[kindKey] || "").toLowerCase();
						if (!/code/.test(kind)) return;
						const code = obj[codeKey];
						if (typeof code !== "string" || lines(code) < 3 || code.length < 40 || !isCode(code)) return;
						answers.push({
							title: guessTitle(code) || `回答代码 ${answers.length + 1}`,
							lang: normLang(obj[langKey]),
							code: code.replace(/\s+$/, ""),
							lines: lines(code),
							time: Number(obj.time) || 0,
							origin: "回答给出",
						});
					},
					// ② 仍然带围栏的文本
					(text) => {
						for (const block of fences(text)) {
							answers.push({ title: guessTitle(text) || `回答代码 ${answers.length + 1}`, lang: block.lang, code: block.code, lines: lines(block.code), time: 0, origin: "回答给出" });
						}
					},
				);
			}
			// 同一段代码可能同时出现在多个快照里（避免重复展示）
			const unique = new Map();
			// 轨迹里抽出来的那批带 turn：合并时把 turn 补到已有条目上，用来判定任务意图
			for (const entry of trajAnswers) {
				for (const block of fences(entry.text)) {
					answers.push({
						title: guessTitle(entry.text) || `回答代码 ${answers.length + 1}`,
						lang: block.lang,
						code: block.code,
						lines: lines(block.code),
						time: entry.time || 0,
						origin: "回答给出",
						turn: entry.turn || 0,
					});
				}
			}
			for (const item of answers) {
				const key = `${item.lang}|${item.code}`;
				const prev = unique.get(key);
				if (prev) {
					if (prev.turn === undefined && item.turn !== undefined) prev.turn = item.turn;
					continue;
				}
				unique.set(key, item);
			}
			// 同一份代码既被执行过、又出现在回答里 → 两边都打标记，避免"归类是不是错了"的疑惑
			const fingerprint = (item) => item.lang + "|" + String(item.code || "").replace(/\s+/g, "").slice(0, 160);
			const executedKeys = new Set([...tasks.values()].flatMap((task) => [...task.modules.values()]).map(fingerprint));
			const answerKeys = new Set([...unique.values()].map(fingerprint));
			for (const task of tasks.values()) {
				for (const module of task.modules.values()) {
					if (answerKeys.has(fingerprint(module))) module.also = "回答里也有";
				}
			}
			for (const item of unique.values()) {
				if (executedKeys.has(fingerprint(item))) item.also = "她也执行过";
			}
			// 缩略图：从对话快照里找图片链接，挂到最新任务的第一个模块上（找不到就不显示）
			const images = [];
			for (const chat of chats) {
				walkAll(
					chat,
					() => {},
					(text) => {
						if (/\.(png|jpe?g|webp|gif)(\?|$)/i.test(text) && /^(https?:|\/|data:image)/.test(text)) images.push(text);
					},
					0,
					6,
				);
			}
			const taskList = [...tasks.values()]
				.map((task) => ({
					turn: task.turn,
					status: task.failed ? "err" : task.hadResult ? "ok" : "idle",
					// 任务意图：这个任务要的成果是代码/数据/图表（code）还是文字（text）
					intent: classifyIntent(task.prompt),
					prompt: task.prompt || "",
					modules: [...task.modules.values()]
						.sort((a, b) => b.order - a.order)
						.map((item) => ({ ...item, status: task.failed ? "err" : task.hadResult ? "ok" : "idle" })),
				}))
				.sort((a, b) => b.turn - a.turn);
			return {
				tasks: taskList,
				total: taskList.reduce((count, task) => count + task.modules.length, 0),
				answers: [...unique.values()].reverse(),
				images,
			};
		}

		/** 把同话题的碎片合并成一份可运行代码（Python：import 去重、同名 def/class 取最后一次）。 */
		function mergeFragments(fragments) {
			const imports = new Map();
			const blocks = [];
			for (const piece of fragments) {
				const code = String(piece.code || "");
				const defs = new Map();
				const rest = [];
				const chunk = [];
				for (const line of code.split(/\r?\n/)) {
					if (/^\s*(import|from)\s+\S+/.test(line)) {
						imports.set(line.trim(), line);
						continue;
					}
					chunk.push(line);
				}
				const text = chunk.join("\n").trim();
				const defMatch = /^(async\s+)?(def|class)\s+([A-Za-z_]\w*)/.exec(text);
				if (defMatch) defs.set(defMatch[3], text);
				else if (text) rest.push(text);
				if (defs.size) blocks.push({ kind: "def", map: defs });
				if (rest.length) blocks.push({ kind: "free", code: rest.join("\n\n") });
			}
			const names = new Map();
			const order = [];
			const free = [];
			for (const block of blocks) {
				if (block.kind === "free") {
					free.push(block.code);
					continue;
				}
				for (const [name, code] of block.map) {
					if (!names.has(name)) order.push(name);
					names.set(name, code);
				}
			}
			return [...imports.values(), ...free, ...order.map((n) => names.get(n))].join("\n\n").trim();
		}

		// ---------------------------------------------------------------- 界面
		const CSS = `
.ch-root{display:flex;flex-direction:column;gap:10px;padding:14px 16px 24px;height:100%;box-sizing:border-box;color:var(--dsw-alias-label-primary);overflow:auto}
.ch-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.ch-seg{display:inline-flex;background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l2);border-radius:10px;padding:2px}
.ch-seg>button{border:none;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:13px;padding:5px 12px;border-radius:8px;cursor:pointer}
.ch-seg>button[data-on="1"]{background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground)}
.ch-count{color:var(--dsw-alias-label-tertiary);font-size:12px;margin-left:auto}
.ch-list{display:flex;flex-direction:column;gap:8px}
.ch-card{border:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-settings-card-fill);border-radius:12px;overflow:hidden}
.ch-bar{display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--dsw-alias-bg-layer-1);border-bottom:.5px solid var(--dsw-alias-border-l1)}
.ch-name{font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ch-tag{font-size:11px;color:var(--dsw-alias-label-tertiary);border:.5px solid var(--dsw-alias-border-l3);border-radius:6px;padding:0 6px}
.ch-btn{margin-left:auto;border:none;background:transparent;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:12px;cursor:pointer;border-radius:6px;padding:3px 8px}
.ch-btn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.ch-pre{margin:0;padding:10px 12px;overflow:auto;max-height:420px;font-family:var(--ds-font-family-code,ui-monospace,Consolas,monospace);font-size:12.5px;line-height:1.6;background:var(--dsw-alias-markdown-code-block)}
.ch-cell{border-top:.5px dashed var(--dsw-alias-border-l2)}
.ch-cell:first-child{border-top:none}
.ch-in{color:var(--dsw-alias-state-business-primary);font-size:11px;padding:6px 12px 0}
.ch-empty{color:var(--dsw-alias-label-tertiary);font-size:13px;padding:24px;text-align:center}
.ch-fold{display:flex;flex-direction:column;gap:8px;margin-top:6px}
.ch-sub{font-size:12px;color:var(--dsw-alias-label-tertiary)}
`;
		function Card({ item, index }) {
			const [open, setOpen] = react.useState(index < 2);
			const [copied, setCopied] = react.useState(false);
			const copy = () => {
				try {
					navigator.clipboard.writeText(item.code);
					setCopied(true);
					setTimeout(() => setCopied(false), 1200);
				} catch {
					/* 剪贴板不可用 */
				}
			};
			const body = item.lang === "python"
				? h("div", null, h("div", { className: "ch-in" }, "In [1]:"), h("pre", { className: "ch-pre" }, item.code))
				: h("pre", { className: "ch-pre" }, item.code);
			return h("section", { className: "ch-card" },
				h("header", { className: "ch-bar" },
					h("span", { className: "ch-name", title: item.path || item.title }, item.name || item.title),
					item.isMain ? h("span", { className: "ch-main" }, "主文件") : null,
					h("span", { className: "ch-tag" }, item.lang),
					h("span", { className: "ch-tag" }, `${item.lines} 行`),
					item.count > 1 ? h("span", { className: "ch-tag" }, `改过 ${item.count} 次`) : null,
					h("button", { className: "ch-btn", onClick: copy }, copied ? "已复制" : "复制"),
					h("button", { className: "ch-btn", onClick: () => setOpen(!open) }, open ? "收起" : "展开"),
				),
				open ? body : null,
			);
		}
		function CodeView(props) {
			const [tab, setTab] = react.useState("executed");
			// useTrajectory / useChat 由对话页的 slot props 注入：前者是工具调用轨迹，后者是消息
			const trajectory = props.useTrajectory ? props.useTrajectory((snapshot) => snapshot) : null;
			const chat = props.useChat ? props.useChat((snapshot) => snapshot) : null;
			// 消息正文在 conversation 快照的 views 里（useChat 只是节点索引），两个都走一遍
			const conversation = props.useConversation ? props.useConversation((snapshot) => snapshot) : null;
			const data = react.useMemo(
				() => extract(trajectory, [chat, conversation]),
				[trajectory, chat, conversation],
			);
			const debug = react.useMemo(() => {
				const trajCount = trajectory && trajectory.eventNodes ? trajectory.eventNodes.length : 0;
				const chatCount = chat && chat.order ? chat.order.length : 0;
				const convCount = conversation && conversation.views ? Object.keys(conversation.views).length : 0;
				return `轨迹节点 ${trajCount}｜消息 ${chatCount}｜视图 ${convCount}`;
			}, [trajectory, chat, conversation]);
			const list = tab === "executed" ? data.executed : data.answers;
			return h("div", { className: "ch-root" },
				h("style", null, CSS),
				h("div", { className: "ch-head" },
					h("div", { className: "ch-seg" },
						h("button", { "data-on": tab === "executed" ? "1" : "0", onClick: () => setTab("executed") }, "执行"),
						h("button", { "data-on": tab === "answers" ? "1" : "0", onClick: () => setTab("answers") }, "回答"),
					),
					h("span", { className: "ch-count" }, `${list.length} 个模块`),
				),
				list.length === 0
					? h("div", { className: "ch-empty" },
						"这个会话还没有代码记录",
						h("div", { className: "ch-sub" }, debug),
					)
					: h("div", { className: "ch-list" }, list.map((item, i) => h(Card, { key: `${item.name || item.title}-${i}`, item, index: i }))),
			);
		}

		// ---------------------------------------------------------------- 注册
		const EXTRA_CSS = `
.ch-tools{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.ch-chip{border:.5px solid var(--dsw-alias-border-l3);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;border-radius:999px;padding:3px 10px;cursor:pointer}
.ch-chip[data-on="1"]{border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-state-business-primary)}
.ch-group{border:.5px solid var(--dsw-alias-border-l2);border-radius:14px;background:var(--dsw-alias-bg-layer-1);padding:10px;display:flex;flex-direction:column;gap:8px}
.ch-group-head{display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--dsw-alias-label-secondary)}
.ch-group-title{font-weight:600;color:var(--dsw-alias-label-primary)}
.ch-main{font-size:11px;color:var(--dsw-alias-state-success-primary)}
.ch-sub-list{display:flex;flex-direction:column;gap:6px;padding-left:8px;border-left:2px solid var(--dsw-alias-border-l1)}
.ch-busy{font-size:12px;color:var(--dsw-alias-label-tertiary)}
.ch-hint{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--dsw-alias-label-tertiary);
border:.5px dashed var(--dsw-alias-border-l2);border-radius:10px;padding:6px 10px}
`;
		/** 新版视图：按任务分组 / 平铺可切换，带语言标注与过滤。 */
		function CodeView2(props) {
			const [tab, setTab] = react.useState("executed");
			const [layout, setLayout] = react.useState("task");
			const [langFilter, setLangFilter] = react.useState("all");

			// 只用原始类型订阅（避免每来一个 token 就重算整棵快照），快照存 ref
			const trajRef = react.useRef(null);
			const chatRef = react.useRef(null);
			const trajKey = props.useTrajectory
				? props.useTrajectory((snapshot) => {
						trajRef.current = snapshot;
						return snapshot && snapshot.eventNodes ? snapshot.eventNodes.length : 0;
					})
				: 0;
			const chatKey = props.useChat
				? props.useChat((snapshot) => {
						chatRef.current = snapshot;
						return snapshot && snapshot.order ? snapshot.order.length : 0;
					})
				: 0;

			const [data, setData] = react.useState({ tasks: [], answers: [], total: 0 });
			const [busy, setBusy] = react.useState(true);
			react.useEffect(() => {
				setBusy(true);
				const timer = setTimeout(() => {
					const started = Date.now();
					const next = extract(trajRef.current, [chatRef.current]);
					console.log("[code-history] 解析耗时", Date.now() - started, "ms");
					// 取证用：把这一轮的快照与解析结果挂到 window，方便外部探针读取（不额外占内存）
					try {
						window.__CH_SNAP__ = { traj: trajRef.current, chat: chatRef.current, extracted: next };
					} catch {
						/* 忽略 */
					}
					setData(next);
					setBusy(false);
				}, 500);
				return () => clearTimeout(timer);
			}, [trajKey, chatKey]);

			const keep = (item) => langFilter === "all" || (langFilter === "python" ? item.lang === "python" : item.lang !== "python");
			const tasks = data.tasks
				.map((task) => ({ ...task, modules: task.modules.filter(keep) }))
				.filter((task) => task.modules.length > 0);
			const flat = tasks.flatMap((task) => task.modules);
			const answers = data.answers.filter(keep);
			const langs = [...new Set([...flat, ...answers].map((item) => item.lang))];

			const card = (item, index, isMain) =>
				h(Card, { key: `${item.path || item.title}-${index}`, item: { ...item, isMain }, index: isMain ? 0 : 99 });
			const count = tab === "executed" ? (layout === "task" ? tasks.reduce((n, t) => n + t.modules.length, 0) : flat.length) : answers.length;

			return h("div", { className: "ch-root" },
				h("style", null, CSS),
				h("style", null, EXTRA_CSS),
				h("div", { className: "ch-head" },
					h("div", { className: "ch-seg" },
						h("button", { "data-on": tab === "executed" ? "1" : "0", onClick: () => setTab("executed") }, "执行"),
						h("button", { "data-on": tab === "answers" ? "1" : "0", onClick: () => setTab("answers") }, "回答"),
					),
					tab === "executed"
						? h("div", { className: "ch-seg" },
							h("button", { "data-on": layout === "task" ? "1" : "0", onClick: () => setLayout("task") }, "按任务"),
							h("button", { "data-on": layout === "flat" ? "1" : "0", onClick: () => setLayout("flat") }, "平铺"),
						)
						: null,
					busy ? h("span", { className: "ch-busy" }, "解析中…") : null,
					h("span", { className: "ch-count" }, `${count} 个模块`),
				),
				langs.length > 1
					? h("div", { className: "ch-tools" },
						h("button", { className: "ch-chip", "data-on": langFilter === "all" ? "1" : "0", onClick: () => setLangFilter("all") }, "全部"),
						...langs.map((lang) => h("button", { key: lang, className: "ch-chip", "data-on": langFilter === lang ? "1" : "0", onClick: () => setLangFilter(lang) }, lang)),
					)
					: null,
				count === 0
					? h("div", { className: "ch-empty" }, "这个会话还没有代码记录",
						h("div", { className: "ch-sub" }, `轨迹 ${trajKey} 条｜消息 ${chatKey} 条`))
					: tab === "answers"
						? h("div", { className: "ch-list" }, answers.map((item, i) => card(item, i, false)))
						: layout === "flat"
							? h("div", { className: "ch-list" }, flat.map((item, i) => card(item, i, i === 0)))
							: h("div", { className: "ch-list" }, tasks.map((task) =>
								h("section", { key: task.turn, className: "ch-group" },
									h("header", { className: "ch-group-head" },
										h("span", { className: "ch-group-title" }, task.turn ? `任务 ${task.turn}` : "未标记任务"),
										h("span", null, `${task.modules.length} 个模块`),
									),
									card(task.modules[0], 0, true),
									task.modules.length > 1
										? h("div", { className: "ch-sub-list" }, task.modules.slice(1).map((item, i) => card(item, i + 1, false)))
										: null,
								),
							)),
			);
		}
		const inject = ["slots", "uiConversation", "sessions"];
		/** 按代码特征给中文标题（本地规则，零耗时）：看名字就知道这块代码干什么。 */
		const TITLE_KEY = "dsh-code-history:titles";
		function customTitle(key) {
			try {
				const all = JSON.parse(localStorage.getItem(TITLE_KEY) || "{}");
				return all[key] || "";
			} catch {
				return "";
			}
		}
		function saveCustomTitle(key, value) {
			try {
				const all = JSON.parse(localStorage.getItem(TITLE_KEY) || "{}");
				if (value) all[key] = value;
				else delete all[key];
				localStorage.setItem(TITLE_KEY, JSON.stringify(all));
			} catch {
				/* 存储不可用 */
			}
		}
		const titleKey = (item) => item.path || item.title || String(item.lines);
		function titleOf(item) {
			const own = customTitle(titleKey(item));
			if (own) return own;
			const code = String(item.code || "");
			const lower = code.toLowerCase();
			const name = String(item.name || item.title || "");
			const has = (re) => re.test(lower);
			const type = String(item.lang || "").toLowerCase();
			const hint = /ridge/i.test(name) ? "山脊图" : /bubble/i.test(name) ? "气泡图" : /violin/i.test(name) ? "小提琴图" : "";
			if (has(/matplotlib|seaborn|plt\.|sns\./)) {
				if (has(/scatter/) && has(/(\bs\s*=)|size=/)) return "气泡图代码";
				if (has(/scatter/)) return "散点图代码";
				if (has(/violin/)) return "小提琴图代码";
				if (has(/hist/)) return "直方图代码";
				if (has(/barh|bar\(/)) return "柱状图代码";
				if (has(/heatmap|imshow/)) return "热力图代码";
				if (has(/pie\(/)) return "饼图代码";
				if (has(/boxplot/)) return "箱线图代码";
				if (has(/subplots?\(/) && has(/for .* in /)) return "多子图批量绘图";
				if (has(/plot\(/)) return "折线图代码";
				return hint ? hint + "代码" : "绘图代码";
			}
			if (has(/plotly|bokeh|pyecharts|echarts/)) return "交互图表代码";
			if (has(/read_csv|read_excel|read_parquet|to_csv|dataframe|pandas/)) return "数据读取与整理";
			if (has(/numpy|np\.|linalg/)) return "数值计算代码";
			if (has(/create table|select .* from |insert into/i)) return "数据库脚本";
			if (has(/sklearn|train_test_split|\.fit\(|\.predict\(/)) return "机器学习代码";
			if (has(/requests\.|httpx\.|urllib|axios|scrapy/)) return "网络抓取代码";
			if (has(/flask|fastapi|uvicorn|app\.route/)) return "服务接口代码";
			if (has(/tkinter|pyqt|pyside|wxpython/)) return "桌面界面代码";
			if (has(/argparse|sys\.argv|typer\./)) return "命令行脚本";
			if (has(/def test_|pytest|unittest/)) return "测试脚本";
			if (type === "python") return hint ? hint + "代码（Python）" : "Python 脚本";
			if (/^(js|mjs|cjs|ts|tsx|jsx)$/.test(type)) {
				if (has(/playwright|puppeteer|cdp|devtools|page\.|browser\.|screenshot/)) return "浏览器自动化脚本";
				if (has(/electron/)) return "桌面应用脚本";
				return "JavaScript 脚本";
			}
			if (/^(yaml|yml|json|toml|ini)$/.test(type)) return "配置文件";
			if (/^(pwsh|bash|sh)$/.test(type)) return "命令行脚本";
			if (type === "sql") return "SQL 查询";
			if (type === "markdown") return "说明文档";
			return hint ? hint + "代码" : "代码片段";
		}
		const GRID_CSS = [
			// auto-fit（不是 auto-fill）：卡片少时会撑满整行，不会留一条空列
			".ch-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:8px}",
			".ch-tile{border:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);border-radius:12px;padding:9px 11px;cursor:pointer;display:flex;flex-direction:column;gap:5px}",
			".ch-tile:hover{border-color:var(--dsw-alias-state-business-primary)}",
			'.ch-tile[data-open="1"]{grid-column:1/-1;cursor:default;background:var(--dsw-alias-settings-card-fill)}',
			".ch-tile-title{font-size:13px;font-weight:600;display:flex;align-items:center;gap:6px}",
			".ch-tile-meta{font-size:11.5px;color:var(--dsw-alias-label-tertiary);display:flex;gap:6px;flex-wrap:wrap;align-items:center}",
			".ch-peek{font-family:var(--ds-font-family-code,ui-monospace,Consolas,monospace);font-size:11px;color:var(--dsw-alias-label-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
			".ch-input{font:inherit;font-size:13px;border:.5px solid var(--dsw-alias-border-l3);border-radius:8px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);padding:3px 8px;min-width:180px}",
			".ch-select{user-select:text !important;-webkit-user-select:text !important;cursor:text}",
			".ch-origin{color:var(--dsw-alias-state-business-primary);font-size:11px}",
			".ch-badge{font-size:11px;border-radius:999px;padding:0 7px;border:.5px solid var(--dsw-alias-border-l3)}",
			".ch-badge-ok{color:var(--dsw-alias-state-success-primary);border-color:var(--dsw-alias-state-success-primary)}",
			".ch-badge-err{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}",
			".ch-badge-idle{color:var(--dsw-alias-label-tertiary)}",
			".ch-dep{font-size:11px;background:var(--dsw-alias-bg-layer-2);border-radius:6px;padding:0 6px;color:var(--dsw-alias-label-secondary)}",
			".ch-flow{font-size:11px;display:inline-flex;align-items:center;gap:4px;color:var(--dsw-alias-label-secondary)}",
			".ch-flow-in{background:var(--dsw-alias-state-business-tertiary);border-radius:6px;padding:0 6px}",
			".ch-flow-out{background:var(--dsw-alias-markdown-inline-code);border-radius:6px;padding:0 6px}",
			".ch-arrow{color:var(--dsw-alias-label-tertiary)}",
			".ch-thumb{max-width:100%;max-height:96px;border-radius:10px;border:.5px solid var(--dsw-alias-border-l2);object-fit:cover;margin-top:6px}",
			".ch-versions{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:6px}",
		].join("");
		/** 单个模块：折叠是圆角小卡片，点击展开成整行代码。 */
		function Tile({ item, groupName }) {
			const [open, setOpen] = react.useState(false);
			const [copied, setCopied] = react.useState(false);
			const [editing, setEditing] = react.useState(false);
			const [draft, setDraft] = react.useState("");
			const [title, setTitle] = react.useState(titleOf(item));
			const [version, setVersion] = react.useState(null);
			const [tip, setTip] = react.useState("");
			const preview = previewOf(item.code);
			const digest = digestOf(item);
			const copy = (event) => {
				event.stopPropagation();
				try {
					navigator.clipboard.writeText(item.code);
					setCopied(true);
					setTimeout(() => setCopied(false), 1200);
				} catch {
					/* 剪贴板不可用 */
				}
			};
			const startEdit = (event) => {
				event.stopPropagation();
				setDraft(title);
				setEditing(true);
			};
			const commit = () => {
				const value = draft.trim();
				saveCustomTitle(titleKey(item), value);
				setTitle(value || titleOf({ ...item, __force: true }));
				setEditing(false);
			};
			const reset = (event) => {
				event.stopPropagation();
				saveCustomTitle(titleKey(item), "");
				setTitle(titleOf({ ...item }));
				setEditing(false);
			};
			// 点击代码区域不收起卡片，方便框选文字后 Ctrl+C / 右键复制
			const keepOpen = (event) => event.stopPropagation();
			return h("article", { className: "ch-tile", "data-open": open ? "1" : "0", onClick: () => setOpen(!open) },
				editing
					? h("div", { className: "ch-tile-title", onClick: keepOpen },
						h("input", {
							className: "ch-input",
							value: draft,
							autoFocus: true,
							onChange: (e) => setDraft(e.target.value),
							onBlur: commit, // 点别处即保存，不需要保存按钮
							onKeyDown: (e) => {
								if (e.key === "Enter") e.target.blur();
								if (e.key === "Escape") setEditing(false);
							},
						}),
						h("button", { className: "ch-btn", onClick: reset }, "恢复"),
					)
					: h("div", { className: "ch-tile-title" },
						h("span", { title: "双击改标题", onDoubleClick: startEdit }, title),
						h("button", { className: "ch-btn", onClick: startEdit, title: "改标题" }, "✎"),
						item.isMain ? h("span", { className: "ch-main" }, "主文件") : null,
					),
				h("div", { className: "ch-tile-meta" },
					item.origin ? h("span", { className: "ch-origin" }, item.origin) : null,
					item.also ? h("span", { className: "ch-origin" }, item.also) : null,
					item.status
						? h("span", { className: "ch-badge ch-badge-" + item.status, title: item.status === "err" ? "这个任务里出现过报错" : item.status === "ok" ? "已执行" : "未执行" },
							item.status === "err" ? "❌ 有报错" : item.status === "ok" ? "✅ 已跑通" : "⚠️ 未执行")
						: null,
					item.time ? h("span", null, timeAgo(item.time)) : null,
					digest ? h("span", null, digest) : null,
				),
				h("div", { className: "ch-tile-meta" },
					...depsOf(item.code).map((dep) => h("span", { key: dep, className: "ch-dep" }, dep)),
					(() => {
						const flow = flowOf(item.code);
						const parts = [];
						if (flow.inputs.length) parts.push(h("span", { key: "in", className: "ch-flow-in" }, "⬅ " + flow.inputs.join(", ")));
						if (flow.inputs.length && flow.outputs.length) parts.push(h("span", { key: "ar", className: "ch-arrow" }, "→"));
						if (flow.outputs.length) parts.push(h("span", { key: "out", className: "ch-flow-out" }, flow.outputs.join(", ") + " ➡"));
						return parts.length ? h("span", { className: "ch-flow" }, ...parts) : null;
					})(),
				),
				h("div", { className: "ch-tile-meta" },
					h("span", null, item.lang),
					h("span", null, item.lines + " 行"),
					item.count > 1 ? h("span", null, "改过 " + item.count + " 次") : null,
					groupName ? h("span", null, groupName) : null,
					h("span", { style: { marginLeft: "auto" } }, item.name || ""),
				),
				h("code", { className: "ch-peek" }, preview),
				open
					? h("div", { onClick: keepOpen },
						h("div", { className: "ch-tile-meta" },
							h("button", { className: "ch-btn", onClick: copy }, copied ? "已复制" : "复制代码"),
							h("button", {
								className: "ch-btn",
								onClick: (event) => {
									event.stopPropagation();
									const prompt = `请用一句话说明这段代码做什么（中文，不超过 20 字）：\n\`\`\`${item.lang}\n${item.code.slice(0, 1500)}\n\`\`\``;
									try {
										navigator.clipboard.writeText(prompt);
										setTip("提示词已复制，粘贴到输入框回车即可");
									} catch {
										setTip("复制失败，可手动框选代码提问");
									}
								},
							}, "摘要"),
							h("button", {
								className: "ch-btn",
								onClick: (event) => {
									event.stopPropagation();
									const tab = [...document.querySelectorAll("button,[role=tab]")].find((el) => el.textContent.trim() === "对话");
									if (tab) tab.click();
									const turn = document.querySelector('[data-turn="' + (item.turn || "") + '"]');
									if (turn && turn.scrollIntoView) turn.scrollIntoView({ block: "center", behavior: "smooth" });
								},
							}, "定位对话"),
							tip ? h("span", { className: "ch-origin" }, tip) : null,
							h("span", { className: "ch-sub" }, "（可框选后 Ctrl+C 或右键复制片段）"),
							h("span", null, item.path || ""),
						),
						item.thumb ? h("img", { className: "ch-thumb", src: item.thumb, alt: "输出预览" }) : null,
						item.versions && item.versions.length > 1
							? h("div", { className: "ch-versions" },
								h("div", { className: "ch-sub" }, "修改轨迹（" + item.versions.length + " 版，点时间看那一版）"),
								...item.versions.map((v, i) =>
									h("button", {
										key: i,
										className: "ch-chip",
										"data-on": version === i ? "1" : "0",
										onClick: (event) => {
											event.stopPropagation();
											setVersion(i);
										},
									}, "第 " + (i + 1) + " 版 · " + (v.time ? timeAgo(v.time) : "-") + " · " + v.lines + " 行"),
								),
							)
							: null,
						item.lang === "python"
							? h("div", null, h("div", { className: "ch-in" }, "In [1]:"), h("pre", { className: "ch-pre ch-select" }, version !== null && item.versions ? item.versions[version].code : item.code))
							: h("pre", { className: "ch-pre ch-select" }, version !== null && item.versions ? item.versions[version].code : item.code),
					)
					: null,
			);
		}
		/** 代码页：进去隐藏底部输入框，切走恢复。 */
		function useHideComposer() {
			react.useEffect(() => {
				// 用注入 CSS 规则（而不是 inline style）：React 重渲染不会把它冲掉
				const style = document.createElement("style");
				style.id = "dsh-code-hide-composer";
				// 输入框可能是 textarea，也可能是 contenteditable / role=textbox（实测是后者）
				const input =
					document.querySelector("textarea") ||
					document.querySelector('[contenteditable="true"]') ||
					document.querySelector('[role="textbox"]');
				const host = input ? input.closest('[class*="card"]') || input.parentElement : null;
				const safe = (cls) => (/^[A-Za-z0-9_-]+$/.test(cls || "") ? "." + cls : "");
				const pick = (el) => {
					if (!el || el.tagName === "TEXTAREA") return "";
					const cls = [...(el.classList || [])].find((c) => c.includes("_"));
					if (!cls || !safe(cls)) return "";
					// 安全阀：类名命中的元素过多说明是公共类，绝不能拿它来隐藏
					try {
						if (document.querySelectorAll("." + cls).length > 3) return "";
					} catch {
						return "";
					}
					return safe(cls);
				};
				const selectors = [pick(host), pick(host && host.previousElementSibling), pick(host && host.nextElementSibling), pick(host && host.parentElement)]
					.filter(Boolean);
				style.textContent = selectors.length ? selectors.join(",") + "{display:none !important}" : "";
				document.head.appendChild(style);
				// 输入框可能比本视图晚挂载，补一次
				const retry = setTimeout(() => {
					if (!host) {
						const late =
							document.querySelector("textarea") ||
							document.querySelector('[contenteditable="true"]') ||
							document.querySelector('[role="textbox"]');
						const box = late ? late.closest('[class*="card"]') || late.parentElement : null;
						const cls = box && [...(box.classList || [])].find((c) => c.includes("_"));
						if (cls && safe(cls)) style.textContent = safe(cls) + "{display:none !important}";
					}
					// 注意：不要再"扫描 cursor:resize 的元素并隐藏它们"——那套按类名猜的做法
					// 会误伤共用类名的卡片（曾把「文件」「侧边对话」「记忆系统」藏掉）。
					// 调节把手最多只是偶尔露出来，不值得冒这个风险。
				}, 900);
				return () => {
					clearTimeout(retry);
					style.remove();
				};
			}, []);
		}
		/** 网格视图：一排 2~4 个圆角卡片，点击展开。 */
		function CodeView3(props) {
			const trajRef = react.useRef(null);
			const chatRef = react.useRef(null);
			const trajKey = props.useTrajectory
				? props.useTrajectory((snapshot) => {
						trajRef.current = snapshot;
						return snapshot && snapshot.eventNodes ? snapshot.eventNodes.length : 0;
					})
				: 0;
			const chatKey = props.useChat
				? props.useChat((snapshot) => {
						chatRef.current = snapshot;
						return snapshot && snapshot.order ? snapshot.order.length : 0;
					})
				: 0;
			const [data, setData] = react.useState({ tasks: [], answers: [], total: 0 });
			const [tab, setTab] = react.useState("executed");
			const [layout, setLayout] = react.useState("task");
			const [busy, setBusy] = react.useState(true);
			const [merged, setMerged] = react.useState(null);
			const [query, setQuery] = react.useState("");
			// 默认只显示"代码/数据/图表"任务；写文章、润色、翻译这类文字任务里产生的代码默认折叠
			const [includeText, setIncludeText] = react.useState(false);
			useHideComposer();
			react.useEffect(() => {
				setBusy(true);
				const timer = setTimeout(() => {
					const next = extract(trajRef.current, [chatRef.current]);
					// 取证用：把快照与解析结果挂到 window，供外部探针读取（不额外占内存）
					try {
						window.__CH_SNAP__ = { traj: trajRef.current, chat: chatRef.current, extracted: next };
					} catch {
						/* 忽略 */
					}
					setData(next);
					setBusy(false);
				}, 500);
				return () => clearTimeout(timer);
			}, [trajKey, chatKey]);
			const hit = (item) => {
				if (!query.trim()) return true;
				const text = (titleOf(item) + " " + (item.name || "") + " " + item.lang + " " + previewOf(item.code)).toLowerCase();
				return text.includes(query.trim().toLowerCase());
			};
			const tasks = data.tasks
				.map((task) => ({ ...task, modules: task.modules.filter(hit) }))
				.filter((task) => task.modules.length > 0);
			const answers = data.answers.filter(hit);
			/*
			 * 任务意图过滤：文字类任务（写文章/润色/翻译/整理文档…）里出现的代码只是过程副产品，
			 * 默认不展示；代码类任务（问代码、处理数据、绘图…）照常展示。
			 * 「含文字任务」按钮可以随时把被折叠的调出来看。
			 */
			const textTurns = new Set(data.tasks.filter((t) => t.intent === "text").map((t) => t.turn));
			const isTextAnswer = (item) => Boolean(item.turn) && textTurns.has(item.turn);
			const textTasks = tasks.filter((task) => task.intent === "text");
			const shownTasks = includeText ? tasks : tasks.filter((task) => task.intent !== "text");
			const shownAnswers = includeText ? answers : answers.filter((item) => !isTextAnswer(item));
			const flat = shownTasks.flatMap((task) => task.modules);
			const hiddenNow = includeText
				? 0
				: tab === "executed"
					? textTasks.reduce((n, task) => n + task.modules.length, 0)
					: answers.filter(isTextAnswer).length;
			const hiddenTotal = textTasks.reduce((n, task) => n + task.modules.length, 0)
				+ answers.filter(isTextAnswer).length;
			const count = tab === "executed" ? flat.length : shownAnswers.length;
			// 导出当前页签为 Markdown（浏览器直接下载）
			const exportMarkdown = () => {
				const blocks = [];
				blocks.push("# 代码历史", "");
				if (tab === "executed") {
					for (const task of shownTasks) {
						blocks.push(`## 任务 ${task.turn || "-"}`, "");
						for (const item of task.modules) {
							blocks.push(`### ${titleOf(item)}（${item.name || ""}${item.time ? " · " + timeAgo(item.time) : ""}）`, "```" + (item.lang === "text" ? "" : item.lang), item.code, "```", "");
						}
					}
				} else {
					for (const item of shownAnswers) {
						blocks.push(`### ${titleOf(item)}`, "```" + (item.lang === "text" ? "" : item.lang), item.code, "```", "");
					}
				}
				const text = blocks.join("\n");
				try {
					const url = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
					const a = document.createElement("a");
					a.href = url;
					a.download = "代码历史.md";
					a.click();
					setTimeout(() => URL.revokeObjectURL(url), 4000);
				} catch {
					try {
						navigator.clipboard.writeText(text);
					} catch {
						/* 剪贴板也不可用 */
					}
				}
			};
			// 回答类：把同一语言的过程片段合并成一份可直接运行的代码
			const mergeAnswers = () => {
				const items = data.answers;
				if (items.length === 0) return;
				const lang = items[0].lang;
				const same = items.filter((item) => item.lang === lang);
				const rest = items.filter((item) => item.lang !== lang);
				const code = mergeFragments([...same].reverse());
				setMerged({
					title: `合并后的完整${lang === "python" ? " Python" : ""}代码（${same.length} 段）`,
					lang,
					lines: lines(code),
					code,
					extras: rest.length,
				});
			};
			return h("div", { className: "ch-root" },
				h("style", null, CSS),
				h("style", null, GRID_CSS),
				h("div", { className: "ch-head" },
					h("div", { className: "ch-seg" },
						h("button", { "data-on": tab === "executed" ? "1" : "0", onClick: () => setTab("executed") }, "执行"),
						h("button", { "data-on": tab === "answers" ? "1" : "0", onClick: () => setTab("answers") }, "回答"),
					),
					tab === "executed"
						? h("div", { className: "ch-seg" },
							h("button", { "data-on": layout === "task" ? "1" : "0", onClick: () => setLayout("task") }, "按任务"),
							h("button", { "data-on": layout === "flat" ? "1" : "0", onClick: () => setLayout("flat") }, "平铺"),
						)
						: null,
					busy ? h("span", { className: "ch-busy" }, "解析中…") : null,
					tab === "answers" && data.answers.length > 1
						? h("button", { className: "ch-chip", onClick: mergeAnswers }, "合并成可运行版本")
						: null,
					h("input", {
						className: "ch-input",
						placeholder: "搜索标题 / 文件名 / 语言",
						value: query,
						onChange: (e) => setQuery(e.target.value),
						style: { minWidth: "150px" },
					}),
					hiddenTotal > 0
						? h("button", {
								className: "ch-chip",
								"data-on": includeText ? "1" : "0",
								title: "写文章 / 润色 / 翻译这类任务里产生的代码只是过程副产品，默认折叠；点这里可以显示或重新折叠",
								onClick: () => setIncludeText(!includeText),
							}, includeText ? "含文字任务 ✓" : "含文字任务")
						: null,
					count > 0 ? h("button", { className: "ch-chip", onClick: exportMarkdown }, "导出") : null,
					h("span", { className: "ch-count" }, count + " 个模块"),
				),
				hiddenNow > 0
					? h("div", { className: "ch-hint" },
						`已折叠 ${hiddenNow} 个模块：它们出自「写文字 / 文档」类任务（代码只是过程副产品）。`,
						h("button", { className: "ch-btn", onClick: () => setIncludeText(true) }, "显示出来"))
					: null,
				merged
					? h("div", { className: "ch-list" },
						h("div", { style: { display: "flex", alignItems: "center", gap: "8px" } },
							h("span", { className: "ch-sub" }, merged.title + (merged.extras ? `（另有 ${merged.extras} 段其它语言未合并）` : "")),
							h("button", { className: "ch-btn", onClick: () => setMerged(null) }, "收起"),
						),
						h(Tile, { key: "merged", item: { ...merged, isMain: true }, groupName: "合并结果" }),
					)
					: null,
				count === 0
					? h("div", { className: "ch-empty" }, "这个会话还没有代码记录",
						h("div", { className: "ch-sub" }, "轨迹 " + trajKey + " 条｜消息 " + chatKey + " 条"))
					: tab === "answers"
						? h("div", { className: "ch-grid" }, shownAnswers.map((item, i) => h(Tile, { key: "a" + i, item })))
						: layout === "flat"
							? h("div", { className: "ch-grid" }, flat.map((item, i) => h(Tile, { key: "f" + i, item, groupName: item.turn ? "任务 " + item.turn : "" })))
							: h("div", { className: "ch-list" }, shownTasks.map((task) =>
								h("section", { key: task.turn, className: "ch-group" },
									h("header", { className: "ch-group-head" },
										h("span", { className: "ch-group-title" }, task.turn ? "任务 " + task.turn : "未标记任务"),
										task.intent === "text" ? h("span", { className: "ch-tag" }, "文字任务") : null,
										h("span", null, task.modules.length + " 个模块"),
									),
									h("div", { className: "ch-grid" }, task.modules.map((item, i) => h(Tile, { key: task.turn + "-" + i, item, groupName: i === 0 ? "主文件" : "过程文件" }))),
								),
							)),
			);
		}
		function apply(ctx) {
			// 取证/自测入口：把意图判定暴露出来，方便外部探针用真实句子验证规则
			try {
				window.__CH_INTENT__ = { classifyIntent, INTENT_RULES, extract };
			} catch {
				/* 忽略 */
			}
			ctx.slots.inject("conversation.view", () =>
				ctx.slots.register(
					{ name: "conversation.view", id: "code", order: 30, label: "代码" },
					(props) => h(CodeView3, { ...props, ctx }),
				),
			);
		}
		exports.apply = apply;
		exports.inject = inject;
		exports.extract = extract;
		exports.classifyIntent = classifyIntent;
		exports.titleOf = titleOf;
		exports.mergeFragments = mergeFragments;
		return module.exports;
	},
});

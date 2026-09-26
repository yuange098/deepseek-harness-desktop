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
		/** 文本/文档类产物：这些归到「文本」模块，不混进代码。 */
		const DOC_FILE = /\.(md|markdown|txt|text|tex|rst|adoc|org|srt|vtt|csv|tsv|html?|xml|bib|ris)$/i;
		/** 二进制/容器类产物（写进来说明是"生成的文件"）：只登记名字与体积，不展示内容。 */
		const BINARY_FILE = /\.(docx?|xlsx?|pptx?|pdf|png|jpe?g|webp|gif|svg|zip|rar|7z|mp[34]|wav|svgz|eps|tiff?|bmp)$/i;

		/**
		 * 这段代码"能不能直接拿去过一遍"：
		 *   有导入/主流程/读写数据/绘图 → 大概率是完整脚本；
		 *   只有几行、又没有任何入口 → 判定为片段（默认不展示）。
		 * 返回 { complete: boolean, reason: string }。
		 */
		function judgeComplete(code, lang) {
			const text = String(code || "");
			const n = lines(text);
			const hasImport = /^\s*(import|from|#include|using |require\(|const .*=\s*require|library\(|import\s+)/m.test(text);
			const hasMain = /if\s+__name__\s*==|function\s+main\s*\(|^\s*main\s*\(|def\s+main\s*\(|public\s+static\s+void\s+main|<\s*script/im.test(text);
			const hasIo = /(read_csv|read_excel|open\(|readFile|writeFile|to_csv|to_excel|savefig|plt\.|fig\.|ggsave|write\.table|fwrite|read\.csv|pd\.read|np\.load|json\.dump|json\.load)/i.test(text);
			const hasDef = /^\s*(def|class|function|func)\s+\w+/m.test(text);
			if (hasMain) return { complete: true, reason: "有主流程" };
			if (hasIo && (hasImport || n >= 10)) return { complete: true, reason: "读写数据/绘图" };
			if (hasImport && n >= 12) return { complete: true, reason: "完整脚本" };
			if (n >= 20) return { complete: true, reason: "内容成篇" };
			if (hasDef && n >= 8) return { complete: false, reason: "单个函数/片段" };
			return { complete: false, reason: "片段" };
		}

		/** 文本相似度（2-gram Jaccard）：用来判断"这是同一段的第 N 版"。 */
		function similarText(a, b) {
			const grams = (text) => {
				const clean = String(text || "").replace(/\s+/g, "");
				const set = new Set();
				for (let i = 0; i < clean.length - 1; i += 1) set.add(clean.slice(i, i + 2));
				return set;
			};
			const A = grams(a);
			const B = grams(b);
			if (A.size === 0 || B.size === 0) return 0;
			let inter = 0;
			for (const g of A) if (B.has(g)) inter += 1;
			return inter / (A.size + B.size - inter);
		}

		/** 文本成品的标题：优先取首个 markdown 标题，其次第一行前 24 字。 */
		function textTitleOf(text) {
			const body = String(text || "").trim();
			const heading = body.match(/^#{1,4}\s+(.+)$/m);
			if (heading) return heading[1].trim().slice(0, 30);
			const first = body.split(/\r?\n/).find((line) => line.trim().length > 0) || "";
			return first.replace(/^[#>\-*\s]+/, "").trim().slice(0, 30) || "文本片段";
		}

		/** 文本统计：字数、段数、行数。 */
		function textStats(text) {
			const body = String(text || "");
			const chars = body.replace(/\s+/g, "").length;
			const paragraphs = body.split(/\n{2,}/).filter((p) => p.trim().length > 0).length;
			return { chars, paragraphs, lines: lines(body) };
		}

		/**
		 * 文本标题归一化：把"（初稿）/（终稿）/第一版/改后/v2"这类版本字样抹掉，
		 * 好让"同一段的第 N 版"能被认成同一个主题（不同段落标题不同，不会被误并）。
		 */
		function normalizeTextTitle(title) {
			return String(title || "")
				.replace(/[（(【\[][^)）】\]]*[)）】\]]/g, "")
				.replace(/(初稿|终稿|定稿|第一版|第二版|第三版|最终版|最新版|修改版|修订版|润色版|改后|润色后|版|v\d+)/gi, "")
				.replace(/[#>*\s\-—_·:：、。.,，]/g, "")
				.trim()
				.toLowerCase();
		}
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
			/** 写出的文档 / 生成的文件：同一个路径只留最后一次写入（版本折叠在源头做掉）。 */
			const docWrites = new Map();

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
				addDoc(turn, obj[pathKey], obj[bodyKey], time);
			};

			/**
			 * 文档 / 文件的写入：代码进「代码」模块，这里只管文本与生成的文件。
			 * 同一路径后写覆盖先写 —— 用户在文本里看到的永远是最新一版。
			 */
			const addDoc = (turn, path, body, time) => {
				if (typeof path !== "string") return;
				const name = baseName(path);
				if (DOC_FILE.test(path)) {
					if (typeof body !== "string" || body.trim().length < 30) return;
					const key = path.toLowerCase();
					const before = docWrites.get(key);
					docWrites.set(key, {
						path,
						name,
						text: body,
						time: time || 0,
						turn,
						kind: "text",
						// 同一文件写了几次就在卡片上标"共 N 版"，但内容只留最后一次
						versions: (before && before.versions ? before.versions : 0) + 1,
					});
					return;
				}
				if (BINARY_FILE.test(path)) {
					docWrites.set(path.toLowerCase(), {
						path,
						name,
						text: "",
						bytes: typeof body === "string" ? body.length : 0,
						time: time || 0,
						turn,
						kind: "file",
					});
				}
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
						.map((item) => ({
							...item,
							status: task.failed ? "err" : task.hadResult ? "ok" : "idle",
							...judgeComplete(item.code, item.lang),
						})),
				}))
				.sort((a, b) => b.turn - a.turn);
			// —— 文本模块：① 写出的文档文件（同路径只留最后一版）② 回答正文（每轮只留最后一段）
			const textItems = [];
			for (const entry of docWrites.values()) {
				const stats = textStats(entry.text || "");
				textItems.push({
					id: "f:" + String(entry.path).toLowerCase(),
					kind: entry.kind,
					source: "文件",
					title: entry.name,
					path: entry.path,
					text: entry.text || "",
					bytes: entry.bytes || 0,
					time: entry.time || 0,
					turn: entry.turn || 0,
					versions: entry.versions || 1,
					...stats,
				});
			}
			// 同一轮里助理可能说了好几段，只取最后一段（前面的多是"我来看看…"这类过程话）
			const lastTextByTurn = new Map();
			for (const entry of trajAnswers) {
				const body = String(entry.text || "").trim();
				if (!body) continue;
				lastTextByTurn.set(entry.turn, { turn: entry.turn, text: body, time: entry.time });
			}
			for (const entry of lastTextByTurn.values()) {
				const stats = textStats(entry.text);
				// 只把"成篇"的当成品：够长、或有 markdown 标题、或分了好几段
				const deliverable = stats.chars >= 120 || /^#{1,4}\s/m.test(entry.text) || stats.paragraphs >= 3;
				if (!deliverable) continue;
				textItems.push({
					id: "a:" + entry.turn,
					kind: "text",
					source: "回答",
					title: textTitleOf(entry.text),
					path: "",
					text: entry.text,
					time: entry.time || 0,
					turn: entry.turn || 0,
					versions: 1,
					...stats,
				});
			}
			/*
			 * 版本折叠：同一段内容被反复修改时，只保留最后一次（前面几版不显示，只记"共 N 版"）。
			 * 判定用 2-gram 相似度：≥0.55 认为是同一段的新版本；不同段落内容差异大，不会被误并。
			 */
			const mergedTexts = [];
			for (const item of textItems.sort((a, b) => (a.time || 0) - (b.time || 0))) {
				const itemKey = normalizeTextTitle(item.title);
				const prev = mergedTexts.find((other) => other.kind === item.kind && other.source === item.source
					&& (item.path && other.path ? other.path.toLowerCase() === item.path.toLowerCase() : true)
					&& (
						(itemKey && itemKey === normalizeTextTitle(other.title))   // 同一主题（如"引言"的初稿/终稿）
						|| similarText(other.text, item.text) >= 0.5               // 或内容明显是同一段
					));
				if (prev) {
					prev.text = item.text;
					prev.chars = item.chars;
					prev.paragraphs = item.paragraphs;
					prev.lines = item.lines;
					prev.time = item.time;
					prev.turn = item.turn;
					prev.versions = (prev.versions || 1) + 1;
					if (item.source === "回答") prev.title = item.title;
					continue;
				}
				mergedTexts.push(item);
			}
			return {
				tasks: taskList,
				total: taskList.reduce((count, task) => count + task.modules.length, 0),
				answers: [...unique.values()].map((item) => ({ ...item, ...judgeComplete(item.code, item.lang) })).reverse(),
				texts: mergedTexts.sort((a, b) => (b.time || 0) - (a.time || 0)),
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
		//#region 我的仓库：聊天里点「导入」进来的代码/文本（按会话存本机）
		const LIB_KEY = "dsh-code-history:library";
		const readLibrary = () => {
			try {
				const parsed = JSON.parse(localStorage.getItem(LIB_KEY) || "{}");
				return parsed && typeof parsed === "object" ? parsed : {};
			} catch {
				return {};
			}
		};
		const writeLibrary = (library) => {
			try {
				localStorage.setItem(LIB_KEY, JSON.stringify(library));
			} catch {
				/* 存储不可用就算了 */
			}
		};
		const currentSessionId = () => {
			try {
				const raw = localStorage.getItem("dsh.sessions.current");
				if (!raw) return "unknown";
				const parsed = JSON.parse(raw);
				return (typeof parsed === "string" ? parsed : parsed && parsed.sessionId) || "unknown";
			} catch {
				return "unknown";
			}
		};
		const itemId = (text) => {
			let hash = 0;
			const body = String(text || "");
			for (let i = 0; i < body.length; i += 1) hash = (hash * 31 + body.charCodeAt(i)) % 2147483647;
			return "i" + hash.toString(36) + "-" + body.length.toString(36);
		};
		/** 把一段代码/文本存进仓库；同名同内容只存一次。 */
		const addToLibrary = (kind, entry) => {
			const library = readLibrary();
			const session = currentSessionId();
			const bucket = library[session] || { code: [], text: [] };
			const list = bucket[kind] || [];
			const id = itemId(entry.code || entry.text || "");
			if (!list.some((item) => item.id === id)) {
				list.unshift({ ...entry, id, at: Date.now() });
				bucket[kind] = list;
				library[session] = bucket;
				writeLibrary(library);
				try {
					window.dispatchEvent(new CustomEvent("dsh-ch-library"));
				} catch {
					/* 忽略 */
				}
			}
			return id;
		};
		const removeFromLibrary = (kind, id) => {
			const library = readLibrary();
			const session = currentSessionId();
			const bucket = library[session];
			if (!bucket || !Array.isArray(bucket[kind])) return;
			bucket[kind] = bucket[kind].filter((item) => item.id !== id);
			library[session] = bucket;
			writeLibrary(library);
			try {
				window.dispatchEvent(new CustomEvent("dsh-ch-library"));
			} catch {
				/* 忽略 */
			}
		};

		/** 轻提示（导入成功/失败）。 */
		const toast = (text) => {
			let node = document.getElementById("dsh-ch-toast");
			if (!node) {
				node = document.createElement("div");
				node.id = "dsh-ch-toast";
				node.className = "dsh-ch-toast";
				document.body.appendChild(node);
			}
			node.textContent = text;
			node.dataset.on = "1";
			clearTimeout(node.__timer);
			node.__timer = setTimeout(() => {
				node.dataset.on = "0";
			}, 2200);
		};

		const IMPORT_CSS = `
.dsh-ch-import{position:absolute;top:6px;right:40px;z-index:5;display:inline-flex;align-items:center;justify-content:center;
width:24px;height:24px;border-radius:7px;border:.5px solid var(--dsw-alias-border-l2);
background:var(--dsw-alias-settings-card-fill,rgba(255,255,255,.9));color:var(--dsw-alias-label-secondary);
cursor:pointer;opacity:0;transition:opacity .12s ease;padding:0}
pre:hover>.dsh-ch-import,.dsh-ch-import:focus{opacity:1}
.dsh-ch-import-inline{position:static;opacity:.55;margin-right:2px}
*:hover>.dsh-ch-import-inline,pre:hover .dsh-ch-import-inline{opacity:1}
.dsh-ch-import:hover{color:var(--dsw-alias-state-business-primary);border-color:var(--dsw-alias-state-business-primary)}
.dsh-ch-import[data-done="1"]{opacity:1;color:var(--dsw-alias-state-success-primary);border-color:var(--dsw-alias-state-success-primary)}
.dsh-ch-toast{position:fixed;left:50%;bottom:56px;transform:translate(-50%,12px);z-index:2147482;
padding:8px 14px;border-radius:10px;font-size:13px;background:rgba(17,17,17,.92);color:#fff;
opacity:0;transition:opacity .18s ease,transform .18s ease;pointer-events:none}
.dsh-ch-toast[data-on="1"]{opacity:1;transform:translate(-50%,0)}
`;
		//#endregion
		//#region 聊天里的「导入仓库」按钮（代码框右上角一个小图标）
		/** 导入图标：托盘 + 向下箭头（直观表示"收进仓库"）。 */
		function importIcon() {
			const ns = "http://www.w3.org/2000/svg";
			const svg = document.createElementNS(ns, "svg");
			svg.setAttribute("width", "14");
			svg.setAttribute("height", "14");
			svg.setAttribute("viewBox", "0 0 16 16");
			svg.setAttribute("fill", "none");
			svg.setAttribute("aria-hidden", "true");
			// 书签 + 加号：表示"收藏/入库"，不再用像下载的箭头
			const path = document.createElementNS(ns, "path");
			path.setAttribute("d", "M4.2 2.6h5.1c.6 0 1.1.5 1.1 1.1v9.1L7.5 11 4.6 12.8V3.7c0-.6.5-1.1 1.1-1.1M12.4 4.4v4M10.4 6.4h4");
			path.setAttribute("stroke", "currentColor");
			path.setAttribute("stroke-width", "1.3");
			path.setAttribute("stroke-linecap", "round");
			path.setAttribute("stroke-linejoin", "round");
			svg.appendChild(path);
			return svg;
		}

		/** 导入时用的文件名：优先 AI/本地标题，退化成语言默认名。 */
		function suggestName(title, lang, code) {
			const ext = { python: "py", javascript: "js", typescript: "ts", r: "R", sql: "sql", bash: "sh", pwsh: "ps1", json: "json", yaml: "yaml" }[lang] || "txt";
			const base = String(title || "").replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 24) || "导入代码";
			// 代码里已经有明确文件名的（比如注释第一行写了 xxx.py）就用它
			const hint = String(code || "").match(/^[#/]{1,2}\s*([\w.-]+\.(?:py|js|mjs|ts|r|sql|sh|ps1|ipynb))\s*$/m);
			return hint ? hint[1] : `${base}.${ext}`;
		}

		/** 把聊天里的一个代码框导入仓库（顺带让 AI 起个中文名）。 */
		async function importCodeBlock(pre, button) {
			const codeEl = pre.querySelector("code");
			const code = String((codeEl ? codeEl.textContent : pre.textContent) || "").replace(/\s+$/, "");
			const langClass = codeEl ? String(codeEl.className || "") : "";
			const lang = normLang((langClass.match(/language-([\w+#.-]+)/) || [])[1] || "");
			let title = "";
			try {
				const api = window.dshDesktop;
				if (api && typeof api.judgeCode === "function") {
					const id = itemId(code);
					const result = await api.judgeCode([{ id, lang, name: suggestName("", lang, code), code }]);
					title = (result && result.results && result.results[id] && result.results[id].feature) || "";
				}
			} catch {
				/* 命名失败就用本地标题 */
			}
			const finalTitle = title || guessTitle(code) || "导入的代码";
			addToLibrary("code", {
				title: finalTitle,
				name: suggestName(finalTitle, lang, code),
				lang,
				code,
				time: Date.now(),
				source: "消息导入",
			});
			button.dataset.done = "1";
			button.title = "已导入：" + finalTitle + "（再点一次不会重复导入）";
			toast("已导入仓库：" + finalTitle);
		}

		/** 盯住聊天区域，给每个代码框加上导入按钮。 */
		function installImportButtons() {
			if (!document.getElementById("dsh-ch-import-css")) {
				const style = document.createElement("style");
				style.id = "dsh-ch-import-css";
				style.textContent = IMPORT_CSS;
				document.head.appendChild(style);
			}
			const inject = () => {
				for (const pre of document.querySelectorAll("pre")) {
					if (pre.closest(".ch-root")) continue; // 本模块自己的卡片不加
					if (pre.querySelector(":scope > .dsh-ch-import")) continue;
					const codeEl = pre.querySelector("code");
					const body = String((codeEl ? codeEl.textContent : pre.textContent) || "");
					if (body.trim().length < 40) continue; // 太短的不给导入
					if (getComputedStyle(pre).position === "static") pre.style.position = "relative";
					const button = document.createElement("button");
					button.type = "button";
					button.className = "dsh-ch-import";
					button.title = "导入到「代码和文本」仓库（AI 会顺手起个名字）";
					button.setAttribute("aria-label", "导入仓库");
					button.appendChild(importIcon());
					button.addEventListener("click", (event) => {
						event.preventDefault();
						event.stopPropagation();
						void importCodeBlock(pre, button);
					});
					// 尽量和官方的"复制"按钮排在同一行：插到复制按钮前面
					const wrapper = pre.parentElement || pre;
					const copyButton = [...wrapper.querySelectorAll("button")].find((b) => {
						const label = (b.getAttribute("title") || b.getAttribute("aria-label") || "").toLowerCase();
						return /复制|copy/.test(label);
					});
					if (copyButton && copyButton.parentElement) {
						button.classList.add("dsh-ch-import-inline");
						copyButton.parentElement.insertBefore(button, copyButton);
					} else {
						pre.appendChild(button);
					}
				}
			};
			inject();
			let timer = null;
			new MutationObserver(() => {
				if (timer !== null) return;
				timer = setTimeout(() => {
					timer = null;
					inject();
				}, 250);
			}).observe(document.body, { childList: true, subtree: true });
		}
		//#endregion
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
.ch-text{border:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-settings-card-fill);border-radius:12px;overflow:hidden;cursor:pointer}
.ch-text:hover{border-color:var(--dsw-alias-state-business-primary)}
.ch-text[data-open="1"]{grid-column:1/-1;cursor:default}
.ch-text-hint{font-size:11.5px;color:var(--dsw-alias-label-tertiary)}
.ch-text-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 12px;background:var(--dsw-alias-bg-layer-1);border-bottom:.5px solid var(--dsw-alias-border-l1)}
.ch-text-title{font-size:13.5px;font-weight:600;color:var(--dsw-alias-label-primary)}
.ch-text-meta{font-size:11.5px;color:var(--dsw-alias-label-tertiary);margin-left:auto}
.ch-text-body{margin:0;padding:10px 14px;max-height:340px;overflow:auto;white-space:pre-wrap;word-break:break-word;
font-size:13px;line-height:1.75;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2)}
.ch-tag-hi{border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-state-business-primary)}
.ch-seg-lg>button{font-size:13.5px;padding:5px 16px}
.ch-seg-sm>button{font-size:12.5px;padding:4px 10px}
.ch-langs{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.ch-langs-label{font-size:11.5px;color:var(--dsw-alias-label-tertiary)}
.ch-chip-py{border-color:#3b82f6;color:#2563eb;font-weight:600}
.ch-chip-py[data-on="1"]{background:rgba(59,130,246,.12)}
.ch-right{margin-left:auto;display:flex;align-items:center;gap:8px;flex-wrap:nowrap;flex:0 0 auto}
/* 顺序写死：计数 → 搜索框 → 展示方式（最右），不随其它样式跑偏 */
.ch-right>.ch-count{order:1;white-space:nowrap}
.ch-right>.ch-input{order:2;flex:0 0 auto}
.ch-right>.ch-view{order:3}
.ch-view{position:relative;display:inline-flex;flex:0 0 auto;width:26px;justify-content:center}
.ch-icon{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:8px;
border:.5px solid var(--dsw-alias-border-l3);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;padding:0}
.ch-icon:hover{background:var(--dsw-alias-interactive-bg-hover)}
.ch-icon[data-on="1"]{border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-state-business-primary)}
.ch-pop{position:absolute;right:0;top:32px;z-index:20;display:flex;flex-direction:column;gap:2px;min-width:104px;
border:.5px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-settings-card-fill,#fff);
box-shadow:0 8px 24px rgba(0,0,0,.18);padding:4px}
.ch-pop>button{border:none;background:transparent;text-align:left;font:inherit;font-size:12.5px;padding:6px 10px;
border-radius:7px;cursor:pointer;color:var(--dsw-alias-label-secondary)}
.ch-pop>button:hover{background:var(--dsw-alias-interactive-bg-hover)}
.ch-pop>button[data-on="1"]{color:var(--dsw-alias-state-business-primary);font-weight:600}
.ch-type{position:relative;display:inline-flex}
.ch-icon-lg{width:auto;gap:6px;padding:0 10px;height:28px;font-size:12.5px}
.ch-icon-label{white-space:nowrap}
.ch-pop-wide{min-width:190px;flex-direction:row;gap:10px;padding:8px}
.ch-pop-group{display:flex;flex-direction:column;gap:2px;min-width:80px}
.ch-pop-title{font-size:11px;color:var(--dsw-alias-label-tertiary);padding:2px 8px 4px}
.ch-cand{display:flex;align-items:center;gap:8px;border:.5px dashed var(--dsw-alias-border-l2);
border-radius:12px;padding:10px 12px;cursor:pointer;background:var(--dsw-alias-bg-layer-1)}
.ch-cand:hover{border-color:var(--dsw-alias-state-business-primary)}
.ch-cand-title{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ch-cand-meta{font-size:11.5px;color:var(--dsw-alias-label-tertiary);margin-left:auto}
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
			// AI 判出来的功能名优先于本地规则（更像人话，也更贴这段代码真正干的事）
			if (item && item.aiFeature) return item.aiFeature;
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
		function Tile({ item, groupName, onRemove }) {
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
			// AI 判出来的功能名是异步到的：没被用户改过标题时，跟着更新
			react.useEffect(() => {
				if (customTitle(titleKey(item))) return;
				setTitle(titleOf(item));
			}, [item.aiFeature, item.path, item.lines, item.title]);
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
						typeof onRemove === "function"
							? h("button", {
									className: "ch-btn",
									title: "从仓库移除（只影响这个列表，不影响对话）",
									onClick: (event) => {
										event.stopPropagation();
										onRemove();
									},
								}, "✕")
							: null,
						item.aiFeature
							? h("span", {
									className: "ch-tag" + (item.aiUsable === false ? " ch-tag-hi" : ""),
									title: "AI 判定：" + (item.aiReason || "") + (item.aiUsable === false ? "（这段代码不单独成篇，默认折叠）" : "（可独立运行）"),
								}, item.aiUsable === false ? "AI：片段" : "AI 判定")
							: null,
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
		/**
		 * 文本成品卡片：标题 + 来源 + 版本 + 字数；超长默认只显示开头，展开看全文、可整段复制。
		 * 同一段反复修改过的，这里已经是最后一版（历史版本只在计数里体现，不铺开）。
		 */
		function TextCard({ item, open, copied, onToggle, onCopy, onRemove }) {
			const preview = String(item.text || "");
			const clipped = preview.length > 420;
			const body = open || !clipped ? preview : preview.slice(0, 420) + "\n…";
			// 块状卡片：点一下就展开/收起；展开后横跨整行
			return h("article", { className: "ch-text", "data-open": open ? "1" : "0", onClick: onToggle },
				h("header", { className: "ch-text-head" },
					h("span", { className: "ch-text-title" }, item.title || "文本"),
					h("span", { className: "ch-tag" }, item.source === "文件" ? "文件" : "回答"),
					item.versions > 1 ? h("span", { className: "ch-tag ch-tag-hi" }, "共 " + item.versions + " 版 · 只留最新") : null,
					h("span", { className: "ch-text-meta" }, item.chars + " 字 · " + item.paragraphs + " 段"),
					h("button", {
						className: "ch-btn",
						onClick: (event) => {
							event.stopPropagation();
							onCopy();
						},
					}, copied ? "已复制" : "复制"),
					clipped ? h("span", { className: "ch-text-hint" }, open ? "收起" : "展开") : null,
					typeof onRemove === "function"
						? h("button", {
								className: "ch-btn",
								title: "从仓库移除（只影响这个列表，不影响对话）",
								onClick: (event) => {
									event.stopPropagation();
									onRemove();
								},
							}, "✕")
						: null,
				),
				h("pre", { className: "ch-text-body" }, body),
			);
		}

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
			// 顶层两个模块：代码（完整可运行）/ 文本（最终成品）
			const [module, setModule] = react.useState("code");
			// 片段（几行、没有入口的代码）默认不展示
			const [includeFragments, setIncludeFragments] = react.useState(false);
			// 每个任务默认只摊开"完整代码"，过程文件收起来
			const [openTasks, setOpenTasks] = react.useState(() => new Set());
			// 代码类型筛选（Python 优先/高亮）+ 展示方式气泡
			const [langFilter, setLangFilter] = react.useState("all");
			const [viewMenuOpen, setViewMenuOpen] = react.useState(false);
			// 类型气泡：代码类型 / 文本类型 两组
			const [typeMenuOpen, setTypeMenuOpen] = react.useState(false);
			// 文本模块的子筛选：全部 / 回答 / 文件
			const [textSource, setTextSource] = react.useState("all");
			// 我的仓库（导入进来的代码/文本）
			const [library, setLibrary] = react.useState(() => {
				const all = readLibrary();
				return all[currentSessionId()] || { code: [], text: [] };
			});
			react.useEffect(() => {
				const refresh = () => {
					const all = readLibrary();
					setLibrary(all[currentSessionId()] || { code: [], text: [] });
				};
				window.addEventListener("dsh-ch-library", refresh);
				window.addEventListener("focus", refresh);
				refresh();
				return () => {
					window.removeEventListener("dsh-ch-library", refresh);
					window.removeEventListener("focus", refresh);
				};
			}, []);
			// AI 判定：让模型判断"这段代码能不能独立完成一个功能"，结果按指纹缓存（主进程里缓存，重复看不再花钱）
			const [aiVerdicts, setAiVerdicts] = react.useState({});
			const [aiState, setAiState] = react.useState("idle"); // idle | running | off | fail
			const [aiOn, setAiOn] = react.useState(true);
			const aiKeyOf = (item) => String(item.path || `${item.title || ""}#${item.lines || 0}`);
			/** 把 AI 判定贴到代码对象上：能不能独立成篇 + 中文功能名。 */
			const decorate = (item) => {
				const verdict = aiVerdicts[aiKeyOf(item)];
				if (!verdict) return item;
				return {
					...item,
					aiFeature: verdict.feature || "",
					aiReason: verdict.reason || "",
					aiUsable: verdict.usable,
					complete: Boolean(verdict.usable),
					reason: verdict.usable ? "AI 判定可独立运行" : `AI：${verdict.reason || "片段"}`,
				};
			};
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
			/** 完整代码优先；片段只在打开「含片段」时出现。 */
			const keepCode = (item) => includeFragments || item.complete !== false;
			// 有哪些语言可选（Python 排最前，其它按出现次数；工具栏只列前 3 个）
			const langCounts = new Map();
			for (const item of [...data.tasks.flatMap((t) => t.modules), ...data.answers]) {
				const key = String(item.lang || "text");
				langCounts.set(key, (langCounts.get(key) || 0) + 1);
			}
			const langOptions = [...langCounts.entries()]
				.sort((a, b) => (a[0] === "python" ? -1 : b[0] === "python" ? 1 : b[1] - a[1]))
				.map(([name, n]) => ({ name, n }));
			const listedLangs = new Set(langOptions.slice(0, 3).map((option) => option.name));
			/** 代码类型筛选：python 单独成一档；「其它」= 工具栏没列出的语言。 */
			const keepLang = (item) => {
				if (langFilter === "all") return true;
				if (langFilter === "python") return item.lang === "python";
				if (langFilter === "other") return !listedLangs.has(item.lang);
				return item.lang === langFilter;
			};
			const tasks = data.tasks
				.map((task) => ({
					...task,
					modules: task.modules
						.map(decorate)
						.filter(hit)
						.filter(keepCode)
						.filter(keepLang)
						.sort((a, b) => (Number(b.complete) - Number(a.complete)) || (b.order - a.order)),
				}))
				.filter((task) => task.modules.length > 0);
			const answers = data.answers.map(decorate).filter(hit).filter(keepCode).filter(keepLang);
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
			// —— 文本模块：只列最终成品（同段反复改过的话，这里是最新一版）——
			/*
			 * 让 AI 判一遍：是不是"能独立完成一个功能"的代码。
			 * 只判还没判过的（主进程里按代码指纹缓存，翻旧会话不会重复花钱）；
			 * 一次最多 8 段，走 preload → 主进程 → 模型。
			 */
			react.useEffect(() => {
				const api = window.dshDesktop;
				if (!aiOn || busy || !api || typeof api.judgeCode !== "function") return;
				if (data.total === 0 && (data.answers || []).length === 0) return;
				const seen = new Set();
				const candidates = [];
				const push = (item) => {
					if (!item || !item.code) return;
					const id = aiKeyOf(item);
					if (seen.has(id)) return;
					seen.add(id);
					candidates.push({ id, lang: item.lang, name: item.name || item.title || "", code: item.code });
				};
				for (const task of data.tasks) for (const item of task.modules.slice(0, 2)) push(item);
				for (const item of (data.answers || []).slice(0, 3)) push(item);
				const todo = candidates.filter((item) => !aiVerdicts[item.id]).slice(0, 8);
				if (todo.length === 0) return;
				let cancelled = false;
				setAiState("running");
				api
					.judgeCode(todo)
					.then((result) => {
						if (cancelled) return;
						if (result && result.results) setAiVerdicts((prev) => ({ ...prev, ...result.results }));
						setAiState(result && result.ok ? "idle" : "fail");
					})
					.catch(() => {
						if (!cancelled) setAiState("fail");
					});
				return () => {
					cancelled = true;
				};
			}, [aiOn, busy, data, aiVerdicts]);

			const texts = data.texts || [];
			// 展示方式气泡：点别处关掉（点图标本身不算"别处"）
			react.useEffect(() => {
				if (!viewMenuOpen) return;
				const onDown = (event) => {
					const target = event.target;
					if (target && target.closest && target.closest(".ch-view")) return;
					setViewMenuOpen(false);
				};
				document.addEventListener("pointerdown", onDown, true);
				return () => document.removeEventListener("pointerdown", onDown, true);
			}, [viewMenuOpen]);
			const shownTexts = texts.filter((item) => {
				if (textSource === "answer" && item.source !== "回答") return false;
				if (textSource === "file" && item.source !== "文件") return false;
				if (!query.trim()) return true;
				const hay = (item.title + " " + (item.path || "") + " " + item.text.slice(0, 400)).toLowerCase();
				return hay.includes(query.trim().toLowerCase());
			});
			/** 回答页签「按任务」：把同一轮的代码归到一组，组标题带上当时的提问。 */
			const answerGroups = (() => {
				const byTurn = new Map();
				for (const item of shownAnswers) {
					const turn = Number(item.turn) || 0;
					if (!byTurn.has(turn)) byTurn.set(turn, []);
					byTurn.get(turn).push(item);
				}
				return [...byTurn.entries()]
					.sort((a, b) => b[0] - a[0])
					.map(([turn, items]) => {
						const task = data.tasks.find((t) => t.turn === turn);
						const prompt = task && task.prompt ? task.prompt.replace(/\s+/g, " ").slice(0, 20) : "";
						return { turn, items, title: turn ? `任务 ${turn}` + (prompt ? `｜${prompt}` : "") : "未标记任务" };
					});
			})();
			const [openText, setOpenText] = react.useState("");
			const [openVersionOf, setOpenVersionOf] = react.useState("");
			const [copied, setCopied] = react.useState("");

			/** 复制纯文本（文本模块用）。 */
			const copyPlain = (text, label) => {
				try {
					navigator.clipboard.writeText(String(text || ""));
					setCopied(label);
					setTimeout(() => setCopied(""), 1200);
				} catch {
					/* 剪贴板不可用就算了 */
				}
			};
			// 导出当前页签为 Markdown（浏览器直接下载）
			const exportMarkdown = () => {
				const blocks = [];
				blocks.push(module === "text" ? "# 文本成品" : "# 代码历史", "");
				if (module === "text") {
					for (const item of shownTexts) {
						blocks.push(`## ${item.title}（${item.source}${item.versions > 1 ? ` · 共 ${item.versions} 版，只留最新` : ""} · ${item.chars} 字）`, "", item.text, "", "---", "");
					}
					const text = blocks.join("\n");
					try {
						const url = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
						const a = document.createElement("a");
						a.href = url;
						a.download = "文本成品.md";
						a.click();
						setTimeout(() => URL.revokeObjectURL(url), 4000);
					} catch {
						copyPlain(text, "export");
					}
					return;
				}
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
					/* 第一层：代码 / 文本 平级 */
					h("div", { className: "ch-seg ch-seg-lg" },
						h("button", { "data-on": module === "code" ? "1" : "0", onClick: () => setModule("code") }, "代码"),
						h("button", { "data-on": module === "text" ? "1" : "0", onClick: () => setModule("text") }, "文本"),
					),
					/* 第二层：代码下面是执行/回答；文本下面是全部/回答/文件 */
					module === "code"
						? h("div", { className: "ch-seg ch-seg-sm" },
							h("button", { "data-on": tab === "executed" ? "1" : "0", onClick: () => setTab("executed") }, "执行"),
							h("button", { "data-on": tab === "answers" ? "1" : "0", onClick: () => setTab("answers") }, "回答"),
						)
						: h("div", { className: "ch-seg ch-seg-sm" },
							h("button", { "data-on": textSource === "all" ? "1" : "0", onClick: () => setTextSource("all") }, "全部"),
							h("button", { "data-on": textSource === "answer" ? "1" : "0", onClick: () => setTextSource("answer") }, "回答"),
							h("button", { "data-on": textSource === "file" ? "1" : "0", onClick: () => setTextSource("file") }, "文件"),
						),
					/* 代码类型：Python 单独高亮并排在最前 */
					module === "code" && langOptions.length > 1
						? h("div", { className: "ch-langs" },
							h("span", { className: "ch-langs-label" }, "类型"),
							h("button", { className: "ch-chip", "data-on": langFilter === "all" ? "1" : "0", onClick: () => setLangFilter("all") }, "全部"),
							// 只列最常用的几个（Python 永远第一）；其余语言靠搜索/标题里带语言名也能筛到
							...langOptions.slice(0, 3).map((option) => h("button", {
								key: option.name,
								className: "ch-chip" + (option.name === "python" ? " ch-chip-py" : ""),
								"data-on": langFilter === option.name ? "1" : "0",
								title: option.name === "python" ? "Python（处理数据最常用，已单独置顶）" : option.name,
								onClick: () => setLangFilter(langFilter === option.name ? "all" : option.name),
							}, option.name + " " + option.n)),
							langOptions.length > 3
								? h("button", {
										className: "ch-chip",
										"data-on": langFilter === "other" ? "1" : "0",
										title: "只看上面没列出的语言：" + langOptions.slice(3).map((o) => o.name).join(" / "),
										onClick: () => setLangFilter(langFilter === "other" ? "all" : "other"),
									}, "其它")
								: null,
						)
						: null,
					busy ? h("span", { className: "ch-busy" }, "解析中…") : null,
					module === "code" && tab === "answers" && data.answers.length > 1
						? h("button", { className: "ch-chip", onClick: mergeAnswers }, "合并成可运行版本")
						: null,
					hiddenTotal > 0
						? h("button", {
								className: "ch-chip",
								"data-on": includeText ? "1" : "0",
								title: "写文章 / 润色 / 翻译这类任务里产生的代码只是过程副产品，默认折叠；点这里可以显示或重新折叠",
								onClick: () => setIncludeText(!includeText),
							}, includeText ? "含文字任务 ✓" : "含文字任务")
						: null,
					module === "code" && (data.tasks.some((t) => t.modules.some((m) => m.complete === false))
						|| Object.values(aiVerdicts).some((v) => v && v.usable === false))
						? h("button", {
								className: "ch-chip",
								"data-on": includeFragments ? "1" : "0",
								title: "只有几行、没有入口的代码片段（例如报错示例、单行改法）默认不展示；点这里可以显示",
								onClick: () => setIncludeFragments(!includeFragments),
							}, includeFragments ? "含片段 ✓" : "含片段")
						: null,
					module === "code" && typeof (window.dshDesktop && window.dshDesktop.judgeCode) === "function"
						? h("button", {
								className: "ch-chip",
								"data-on": aiOn ? "1" : "0",
								title: "让 AI 判断每段代码能不能独立完成一个功能（结果按代码缓存，同一段只问一次）",
								onClick: () => setAiOn(!aiOn),
							},
							aiState === "running"
								? "AI 判断中…"
								: aiState === "fail"
									? "AI 判断失败（用本地规则）"
									: aiOn
										? "AI 判断 ✓"
										: "AI 判断")
						: null,
					count > 0 ? h("button", { className: "ch-chip", onClick: exportMarkdown }, "导出") : null,
					/* 最右：计数 → 搜索框 → 展示方式（点出气泡选 按任务/平铺） */
					h("div", { className: "ch-right" },
						h("span", { className: "ch-count" },
							module === "text" ? shownTexts.length + " 份文本" : count + " 个模块"),
						h("input", {
							className: "ch-input",
							placeholder: module === "text" ? "搜索文本" : "搜索标题 / 文件名 / 语言",
							value: query,
							onChange: (e) => setQuery(e.target.value),
							style: { minWidth: "140px" },
						}),
						module === "code"
							? h("div", { className: "ch-view" },
								h("button", {
									className: "ch-icon",
									"data-on": viewMenuOpen ? "1" : "0",
									title: layout === "task" ? "展示方式：按任务（点开可选平铺）" : "展示方式：平铺（点开可选按任务）",
									onClick: (e) => {
										e.stopPropagation();
										setViewMenuOpen(!viewMenuOpen);
									},
								},
									h("svg", { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none" },
										h("path", { d: "M2 4.2h12M2 8h12M2 11.8h12", stroke: "currentColor", "stroke-width": "1.3", "stroke-linecap": "round" }),
									),
								),
								viewMenuOpen
									? h("div", { className: "ch-pop" },
										h("button", {
											"data-on": layout === "task" ? "1" : "0",
											onClick: (e) => {
												e.stopPropagation();
												setLayout("task");
												setViewMenuOpen(false);
											},
										}, "按任务"),
										h("button", {
											"data-on": layout === "flat" ? "1" : "0",
											onClick: (e) => {
												e.stopPropagation();
												setLayout("flat");
												setViewMenuOpen(false);
											},
										}, "平铺"),
									)
									: null,
							)
							: null,
					),
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
				module === "text"
					? shownTexts.length === 0
						? h("div", { className: "ch-empty" }, "还没有文本成品",
							h("div", { className: "ch-sub" }, "写得够长的正文、或写成文件的文字才会出现在这里；同一段反复改只留最后一版"))
						: h("div", { className: "ch-grid" }, shownTexts.map((item) => h(TextCard, {
								key: item.id,
								item,
								open: openText === item.id,
								copied: copied === item.id,
								onToggle: () => setOpenText(openText === item.id ? "" : item.id),
								onCopy: () => copyPlain((item.title ? item.title + "\n\n" : "") + item.text, item.id),
							})))
					: count === 0
					? h("div", { className: "ch-empty" }, "这个会话还没有代码记录",
						h("div", { className: "ch-sub" }, "轨迹 " + trajKey + " 条｜消息 " + chatKey + " 条"))
					: tab === "answers"
						? layout === "task"
							? h("div", { className: "ch-list" }, answerGroups.map((group) =>
								h("section", { key: group.turn, className: "ch-group" },
									h("header", { className: "ch-group-head" },
										h("span", { className: "ch-group-title" }, group.title),
										h("span", null, group.items.length + " 段"),
									),
									h("div", { className: "ch-grid" }, group.items.map((item, i) => h(Tile, { key: "a" + group.turn + "-" + i, item }))),
								),
							))
							: h("div", { className: "ch-grid" }, shownAnswers.map((item, i) => h(Tile, { key: "a" + i, item })))
						: layout === "flat"
							? h("div", { className: "ch-grid" }, flat.map((item, i) => h(Tile, { key: "f" + i, item, groupName: item.turn ? "任务 " + item.turn : "" })))
							: h("div", { className: "ch-list" }, shownTasks.map((task) =>
								h("section", { key: task.turn, className: "ch-group" },
									h("header", { className: "ch-group-head" },
										h("span", { className: "ch-group-title" }, task.turn ? "任务 " + task.turn : "未标记任务"),
										task.intent === "text" ? h("span", { className: "ch-tag" }, "文字任务") : null,
										h("span", null, task.modules.length + " 个文件"),
										task.modules[0] ? h("span", { className: "ch-main" }, task.modules[0].complete ? "完整代码" + (task.modules[0].reason ? "（" + task.modules[0].reason + "）" : "") : "片段") : null,
									),
									h("div", { className: "ch-grid" }, h(Tile, { key: task.turn + "-0", item: task.modules[0], groupName: task.modules[0].complete ? "完整代码" : "片段" })),
									task.modules.length > 1
										? h("button", {
												className: "ch-btn",
												onClick: () => setOpenTasks((prev) => {
													const next = new Set(prev);
													if (next.has(task.turn)) next.delete(task.turn);
													else next.add(task.turn);
													return next;
												}),
											},
											(openTasks.has(task.turn) ? "收起过程文件（" : "过程文件（") + (task.modules.length - 1) + "）")
										: null,
									openTasks.has(task.turn) && task.modules.length > 1
										? h("div", { className: "ch-grid" }, task.modules.slice(1).map((item, i) => h(Tile, { key: task.turn + "-p" + i, item, groupName: "过程文件" })))
										: null,
								),
							)),
			);
		}
		//#region 「代码和文本」主视图：只显示你自己导入的代码/文本
		/**
		 * 兜底：新视图一旦渲染报错，自动退回旧视图（并显示错误原因），
		 * 不会出现"整块空白"这种没法诊断的情况。
		 */
		class SafeView extends react.Component {
			constructor(props) {
				super(props);
				this.state = { error: "" };
			}
			static getDerivedStateFromError(error) {
				return { error: String((error && (error.message || error)) || error) };
			}
			componentDidCatch(error, info) {
				console.error("[code-history] 新视图渲染失败，已退回旧视图：", error, info);
			}
			render() {
				if (this.state.error) {
					return this.props.fallback(this.state.error);
				}
				return this.props.children;
			}
		}
		/** 文本/文件的类型标签：Word 排第一。 */
		function textKindOf(item) {
			const p = String((item && (item.path || item.name)) || "").toLowerCase();
			if (/\.(docx?|dotx?|rtf)$/.test(p)) return "Word";
			if (/\.(md|markdown)$/.test(p)) return "Markdown";
			if (/\.(txt|text)$/.test(p)) return "TXT";
			if (/\.(csv|tsv|xlsx?)$/.test(p)) return "表格";
			if (/\.(tex|latex)$/.test(p)) return "LaTeX";
			if (/\.pdf$/.test(p)) return "PDF";
			return "其它";
		}
		const sortTypes = (list, first) =>
			[...list].sort((a, b) => (a === first ? -1 : b === first ? 1 : a.localeCompare(b)));

		/**
		 * 主视图：聊天的代码框点「导入」后进这里；只显示导入过的，不再自动归纳。
		 * 层级：代码 / 文本（平级）→ 类型（气泡里分「代码类型」「文本类型」两组）。
		 */
		function LibraryView(props) {
			const [module, setModule] = react.useState("code");
			const [layout, setLayout] = react.useState("type");
			const [typeMenuOpen, setTypeMenuOpen] = react.useState(false);
			const [viewMenuOpen, setViewMenuOpen] = react.useState(false);
			const [codeType, setCodeType] = react.useState("all");
			const [textType, setTextType] = react.useState("all");
			const [query, setQuery] = react.useState("");
			const [openItem, setOpenItem] = react.useState("");
			const [copied, setCopied] = react.useState("");
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
			const [data, setData] = react.useState({ texts: [] });
			const [busy, setBusy] = react.useState(true);
			const [library, setLibrary] = react.useState(() => {
				const all = readLibrary();
				return all[currentSessionId()] || { code: [], text: [] };
			});
			useHideComposer();
			react.useEffect(() => {
				const refresh = () => {
					const all = readLibrary();
					setLibrary(all[currentSessionId()] || { code: [], text: [] });
				};
				window.addEventListener("dsh-ch-library", refresh);
				window.addEventListener("focus", refresh);
				refresh();
				return () => {
					window.removeEventListener("dsh-ch-library", refresh);
					window.removeEventListener("focus", refresh);
				};
			}, []);
			react.useEffect(() => {
				setBusy(true);
				const timer = setTimeout(() => {
					// 只为了拿到"本会话检测到的文本/文件"，好让它们也能一键导入
					setData(extract(trajRef.current, [chatRef.current]));
					setBusy(false);
				}, 500);
				return () => clearTimeout(timer);
			}, [trajKey, chatKey]);
			react.useEffect(() => {
				if (!typeMenuOpen && !viewMenuOpen) return;
				const onDown = (event) => {
					const target = event.target;
					if (target && target.closest && (target.closest(".ch-type") || target.closest(".ch-view"))) return;
					setTypeMenuOpen(false);
					setViewMenuOpen(false);
				};
				document.addEventListener("pointerdown", onDown, true);
				return () => document.removeEventListener("pointerdown", onDown, true);
			}, [typeMenuOpen, viewMenuOpen]);

			const copyPlain = (text, label) => {
				try {
					navigator.clipboard.writeText(String(text || ""));
					setCopied(label);
					setTimeout(() => setCopied(""), 1200);
				} catch {
					/* 剪贴板不可用 */
				}
			};
			const match = (item) => {
				if (!query.trim()) return true;
				const hay = [item.title, item.name, item.path, item.lang, item.code, item.text].filter(Boolean).join(" ").toLowerCase();
				return hay.includes(query.trim().toLowerCase());
			};
			const codeAll = library.code || [];
			const textAll = library.text || [];
			const codeTypes = sortTypes(new Set(codeAll.map((item) => String(item.lang || "其它"))), "python");
			// 候选：本会话检测到的文本/文件（还没导入的），也参与类型列表
			const candidates = (data.texts || []).filter((item) => item.text && !textAll.some((own) => own.id === itemId(item.text)));
			const textTypes = sortTypes(new Set([...textAll.map(textKindOf), ...candidates.map(textKindOf)]), "Word");
			const codeList = codeAll.filter((item) => (codeType === "all" || String(item.lang || "其它") === codeType) && match(item));
			const textList = textAll.filter((item) => (textType === "all" || textKindOf(item) === textType) && match(item));
			const candidateList = candidates.filter((item) => textType === "all" || textKindOf(item) === textType);
			const count = module === "code" ? codeList.length : textList.length + candidateList.length;
			const groupsOf = (list, keyOf) => {
				if (layout === "flat") return [{ key: "", title: "", items: list }];
				const map = new Map();
				for (const item of list) {
					const key = keyOf(item);
					if (!map.has(key)) map.set(key, []);
					map.get(key).push(item);
				}
				const first = module === "code" ? "python" : "Word";
				return [...map.entries()]
					.sort((a, b) => (a[0] === first ? -1 : b[0] === first ? 1 : a[0].localeCompare(b[0])))
					.map(([key, items]) => ({ key, title: key, items }));
			};
			const importText = (item) => {
				const title = item.title || textTitleOf(item.text || "");
				addToLibrary("text", {
					title,
					name: item.name || title,
					path: item.path || "",
					text: item.text || "",
					time: Date.now(),
					source: item.source === "文件" ? "文件导入" : "回答导入",
				});
				toast("已导入文本：" + title);
			};
			const exportLibrary = () => {
				const blocks = [module === "code" ? "# 我的代码仓库" : "# 我的文本仓库", ""];
				for (const item of module === "code" ? codeList : textList) {
					blocks.push(`## ${item.title || item.name}`, "");
					blocks.push(module === "code" ? "```" + (item.lang === "text" ? "" : item.lang) : "");
					blocks.push(module === "code" ? item.code : item.text, module === "code" ? "```" : "", "");
				}
				const text = blocks.join("\n");
				try {
					const url = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
					const a = document.createElement("a");
					a.href = url;
					a.download = module === "code" ? "我的代码仓库.md" : "我的文本仓库.md";
					a.click();
					setTimeout(() => URL.revokeObjectURL(url), 4000);
				} catch {
					copyPlain(text, "export");
				}
			};
			const typeLabel = module === "code"
				? codeType === "all" ? "全部类型" : codeType
				: textType === "all" ? "全部类型" : textType;

			return h("div", { className: "ch-root" },
				h("style", null, CSS),
				h("style", null, GRID_CSS),
				h("div", { className: "ch-head" },
					h("div", { className: "ch-seg ch-seg-lg" },
						h("button", { "data-on": module === "code" ? "1" : "0", onClick: () => setModule("code") }, "代码"),
						h("button", { "data-on": module === "text" ? "1" : "0", onClick: () => setModule("text") }, "文本"),
					),
					/* 类型：一个按钮 + 气泡，里面分「代码类型」「文本类型」两组 */
					h("div", { className: "ch-type" },
						h("button", {
							className: "ch-icon ch-icon-lg",
							"data-on": typeMenuOpen ? "1" : "0",
							title: "筛选类型",
							onClick: (event) => {
								event.stopPropagation();
								setTypeMenuOpen(!typeMenuOpen);
								setViewMenuOpen(false);
							},
						}, filterIcon(), h("span", { className: "ch-icon-label" }, typeLabel), chevronIcon()),
						typeMenuOpen
							? h("div", { className: "ch-pop ch-pop-wide" },
								h("div", { className: "ch-pop-group" },
									h("div", { className: "ch-pop-title" }, "代码类型"),
									h("button", {
										"data-on": module === "code" && codeType === "all" ? "1" : "0",
										onClick: () => { setModule("code"); setCodeType("all"); setTypeMenuOpen(false); },
									}, "全部"),
									...codeTypes.map((name) => h("button", {
										key: name,
										"data-on": module === "code" && codeType === name ? "1" : "0",
										onClick: () => { setModule("code"); setCodeType(name); setTypeMenuOpen(false); },
									}, name === "python" ? "Python ★" : name)),
								),
								h("div", { className: "ch-pop-group" },
									h("div", { className: "ch-pop-title" }, "文本类型"),
									h("button", {
										"data-on": module === "text" && textType === "all" ? "1" : "0",
										onClick: () => { setModule("text"); setTextType("all"); setTypeMenuOpen(false); },
									}, "全部"),
									...textTypes.map((name) => h("button", {
										key: name,
										"data-on": module === "text" && textType === name ? "1" : "0",
										onClick: () => { setModule("text"); setTextType(name); setTypeMenuOpen(false); },
									}, name === "Word" ? "Word ★" : name)),
								),
							)
							: null,
					),
					busy ? h("span", { className: "ch-busy" }, "解析中…") : null,
					count > 0
						? h("button", { className: "ch-icon", title: "导出当前列表（Markdown）", onClick: exportLibrary }, downloadIcon())
						: null,
					h("div", { className: "ch-right" },
						h("span", { className: "ch-count" }, count + (module === "code" ? " 段代码" : " 份文本")),
						h("input", {
							className: "ch-input",
							placeholder: "搜索标题 / 文件名 / 内容",
							value: query,
							onChange: (event) => setQuery(event.target.value),
							style: { minWidth: "150px" },
						}),
						h("div", { className: "ch-view" },
							h("button", {
								className: "ch-icon",
								"data-on": viewMenuOpen ? "1" : "0",
								title: layout === "type" ? "按类型分组（可切平铺）" : "平铺（可切按类型）",
								onClick: (event) => {
									event.stopPropagation();
									setViewMenuOpen(!viewMenuOpen);
									setTypeMenuOpen(false);
								},
							}, layout === "type" ? gridIcon() : rowsIcon()),
							viewMenuOpen
								? h("div", { className: "ch-pop" },
									h("button", {
										"data-on": layout === "type" ? "1" : "0",
										onClick: () => { setLayout("type"); setViewMenuOpen(false); },
									}, "按类型"),
									h("button", {
										"data-on": layout === "flat" ? "1" : "0",
										onClick: () => { setLayout("flat"); setViewMenuOpen(false); },
									}, "平铺"),
								)
								: null,
						),
					),
				),
				module === "code"
					? codeList.length === 0
						? h("div", { className: "ch-empty" }, "还没有导入代码",
							h("div", { className: "ch-sub" }, "在聊天里，鼠标移到 AI 给出的代码框右上角 → 点导入图标；导入时 AI 会顺手给它起个名字"))
						: h("div", { className: "ch-list" }, groupsOf(codeList, (item) => String(item.lang || "其它")).map((group) =>
							group.title
								? h("section", { key: group.title, className: "ch-group" },
									h("header", { className: "ch-group-head" },
										h("span", { className: "ch-group-title" }, group.title === "python" ? "Python" : group.title),
										h("span", null, group.items.length + " 段"),
									),
									h("div", { className: "ch-grid" }, group.items.map((item) => h(Tile, {
										key: item.id,
										item: { ...item, complete: true },
										groupName: "我的仓库",
										onRemove: () => {
											removeFromLibrary("code", item.id);
											toast("已从仓库移除");
										},
									}))),
								)
								: h("div", { key: "flat", className: "ch-grid" }, group.items.map((item) => h(Tile, {
									key: item.id,
									item: { ...item, complete: true },
									groupName: "我的仓库",
									onRemove: () => {
										removeFromLibrary("code", item.id);
										toast("已从仓库移除");
									},
								}))),
						))
					: (textList.length === 0 && candidateList.length === 0)
						? h("div", { className: "ch-empty" }, "还没有导入文本",
							h("div", { className: "ch-sub" }, "在聊天里点代码框旁的导入图标；下面也会列出本会话生成的文件/文本，可直接一键导入"))
						: h("div", { className: "ch-list" },
							candidateList.length
								? h("section", { className: "ch-group" },
									h("header", { className: "ch-group-head" },
										h("span", { className: "ch-group-title" }, "本会话生成的文件 / 文本"),
										h("span", null, candidateList.length + " 项待导入"),
									),
									h("div", { className: "ch-grid" }, candidateList.map((item) => h("article", {
											key: "candidate" + item.id,
											className: "ch-cand",
											onClick: () => importText(item),
											title: "点一下导入仓库",
										},
										h("span", { className: "ch-cand-title" }, item.title || item.name || "文本"),
										h("span", { className: "ch-tag" }, textKindOf(item)),
										h("span", { className: "ch-cand-meta" }, (item.chars || 0) + " 字"),
										item.versions > 1 ? h("span", { className: "ch-tag ch-tag-hi" }, "共 " + item.versions + " 版") : null,
									))),
								)
								: null,
							textList.length
								? h("section", { className: "ch-group" },
									h("header", { className: "ch-group-head" },
										h("span", { className: "ch-group-title" }, "我的文本仓库"),
										h("span", null, textList.length + " 份"),
									),
									h("div", { className: "ch-grid" }, textList.map((item) => h(TextCard, {
										key: item.id,
										item: { ...item, kind: textKindOf(item) },
										open: openItem === item.id,
										copied: copied === item.id,
										onToggle: () => setOpenItem(openItem === item.id ? "" : item.id),
										onCopy: () => copyPlain((item.title ? item.title + "\n\n" : "") + (item.text || ""), item.id),
										onRemove: () => {
											removeFromLibrary("text", item.id);
											toast("已从仓库移除");
										},
									}))),
								)
								: null,
						),
			);
		}
		/*
		 * 图标统一 16px 线性风。
		 * 注意：这里必须返回 **React 元素**（h("svg",…)），不能用 document.createElementNS
		 * 造原生节点再塞进 h(...) —— 原生 SVG 节点不是合法的 React 子元素，
		 * 会直接抛 React error #31（"Objects are not valid as a React child"）把整块视图干掉。
		 * （聊天里那个导入按钮是 appendChild 进真 DOM 的，所以那边用原生节点没问题。）
		 */
		const svgIcon = (children, size) =>
			h("svg", {
				width: size || 16,
				height: size || 16,
				viewBox: "0 0 16 16",
				fill: "none",
				"aria-hidden": "true",
			}, ...(Array.isArray(children) ? children : [children]));
		const strokeProps = { stroke: "currentColor", strokeWidth: 1.3, strokeLinecap: "round", strokeLinejoin: "round" };
		function filterIcon() {
			return svgIcon(h("path", { d: "M2 4h12M4.5 8h7M6.5 12h3", ...strokeProps }), 14);
		}
		function chevronIcon() {
			return svgIcon(h("path", { d: "M4.5 6.5L8 10l3.5-3.5", ...strokeProps }), 12);
		}
		function downloadIcon() {
			return svgIcon(h("path", { d: "M8 2.6v7.2m0 0L5.3 7.1M8 9.8l2.7-2.7M2.8 12.4h10.4", ...strokeProps }));
		}
		function gridIcon() {
			return svgIcon([[2.5, 2.5], [9, 2.5], [2.5, 9], [9, 9]].map(([x, y], index) =>
				h("rect", {
					key: index,
					x,
					y,
					width: 4.5,
					height: 4.5,
					rx: 1.2,
					stroke: "currentColor",
					strokeWidth: 1.2,
				})));
		}
		function rowsIcon() {
			return svgIcon([3, 6.5, 10].map((y, index) =>
				h("rect", {
					key: index,
					x: 2.5,
					y,
					width: 11,
					height: 2.6,
					rx: 1,
					stroke: "currentColor",
					strokeWidth: 1.2,
				})));
		}
		//#endregion

		function apply(ctx) {
			installImportButtons();
			// 取证/自测入口：把意图判定暴露出来，方便外部探针用真实句子验证规则
			try {
				window.__CH_INTENT__ = { classifyIntent, INTENT_RULES, extract };
			} catch {
				/* 忽略 */
			}
			ctx.slots.inject("conversation.view", () =>
				ctx.slots.register(
					{ name: "conversation.view", id: "code", order: 30, label: "代码和文本" },
					(props) => h(SafeView, {
						fallback: (error) => h("div", null,
							h("div", { className: "ch-hint" }, "新视图渲染失败，已临时退回旧视图 —— 报错：" + error),
							h(CodeView3, { ...props, ctx }),
						),
					}, h(LibraryView, { ...props, ctx })),
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

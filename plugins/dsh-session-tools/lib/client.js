window.__ModuleLoader__.load({
	id: "dsh-session-tools",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		//#region 会话行上的「删除对话」按钮
		/**
		 * 为什么要做成插件 + 桌面壳配合：
		 *   官方客户端**没有**删除会话的接口（session API 只有 create/rename/list/…），
		 *   会话数据在磁盘上：home/sessions/<工作区>/<会话id>/ + storages/session_projcache/…，
		 *   所以最终删除由桌面壳（Electron 主进程，有文件系统权限）执行，
		 *   页面这边只负责"每行一个按钮 + 二次确认"。
		 *
		 * 行的结构（实测）：div[data-row-key="session:<id>"] > span.rowActions
		 *   rowActions 是官方已有的悬停动作区（CSS 里 hover 才显示），把按钮塞进去最稳。
		 */
		const ROW_SELECTOR = '[data-row-key^="session:"]';
		const ACTIONS_SELECTOR = '[class*="rowActions"]';
		const TITLE_SELECTOR = '[class*="title"]';
		const MARK = "data-dsh-del";

		const CSS = [
			".dsh-del-btn{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;",
			"border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;padding:0}",
			".dsh-del-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06));color:#d92d20}",
			".dsh-del-mask{position:fixed;inset:0;z-index:2147483;background:rgba(0,0,0,.42);",
			"display:flex;align-items:center;justify-content:center;padding:24px}",
			".dsh-del-dialog{width:400px;max-width:100%;box-sizing:border-box;border-radius:14px;padding:20px 22px 16px;",
			"background:var(--dsw-alias-settings-card-fill,#fff);color:var(--dsw-alias-label-primary,#111);",
			"border:.5px solid var(--dsw-alias-border-l2,rgba(0,0,0,.1));",
			"box-shadow:0 18px 48px rgba(0,0,0,.28)}",
			".dsh-del-title{font-size:16px;font-weight:600;margin:0 0 6px}",
			".dsh-del-sub{font-size:13px;color:var(--dsw-alias-label-secondary,#555);margin:0 0 14px;",
			"word-break:break-all;line-height:1.5}",
			".dsh-del-warn{font-size:13px;line-height:1.6;border-radius:10px;padding:10px 12px;",
			"background:rgba(217,45,32,.08);border:.5px solid rgba(217,45,32,.3);color:#b42318}",
			".dsh-del-status{font-size:12.5px;margin-top:10px;color:var(--dsw-alias-label-tertiary,#777)}",
			".dsh-del-status[data-kind=error]{color:#b42318}",
			".dsh-del-foot{display:flex;gap:10px;justify-content:flex-end;margin-top:16px}",
			".dsh-del-foot>button{font:inherit;font-size:13.5px;border-radius:9px;padding:7px 16px;cursor:pointer;border:.5px solid transparent}",
			".dsh-del-cancel{background:transparent;border-color:var(--dsw-alias-border-l3,rgba(0,0,0,.2));",
			"color:var(--dsw-alias-label-primary,#111)}",
			".dsh-del-cancel:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06))}",
			".dsh-del-danger{background:#d92d20;color:#fff}",
			".dsh-del-danger:hover{background:#b42318}",
			".dsh-del-danger[disabled],.dsh-del-cancel[disabled]{opacity:.55;cursor:default}",
		].join("");

		const installCss = () => {
			if (document.getElementById("dsh-session-tools-css")) return;
			const style = document.createElement("style");
			style.id = "dsh-session-tools-css";
			style.textContent = CSS;
			document.head.appendChild(style);
		};

		/** 垃圾桶图标（跟官方 iconButton 一样的 16px 线性图标）。 */
		const trashIcon = () => {
			const ns = "http://www.w3.org/2000/svg";
			const svg = document.createElementNS(ns, "svg");
			svg.setAttribute("width", "16");
			svg.setAttribute("height", "16");
			svg.setAttribute("viewBox", "0 0 16 16");
			svg.setAttribute("fill", "none");
			svg.setAttribute("aria-hidden", "true");
			const p = document.createElementNS(ns, "path");
			p.setAttribute("d",
				"M3 4.6h10M6.6 4.6V3.3c0-.4.3-.7.7-.7h1.4c.4 0 .7.3.7.7v1.3"
				+ "M4.9 4.6l.6 8.1c0 .5.4.8.9.8h3.2c.5 0 .9-.3.9-.8l.6-8.1");
			p.setAttribute("stroke", "currentColor");
			p.setAttribute("stroke-width", "1.2");
			p.setAttribute("stroke-linecap", "round");
			p.setAttribute("stroke-linejoin", "round");
			svg.appendChild(p);
			return svg;
		};

		const sessionTitle = (row) => {
			const node = row.querySelector(TITLE_SELECTOR);
			const text = (node ? node.textContent : row.textContent) || "";
			return text.trim().slice(0, 80) || "（未命名对话）";
		};

		//#region 确认弹窗
		let openDialog = null;

		const closeDialog = () => {
			if (openDialog) {
				openDialog.remove();
				openDialog = null;
			}
		};

		/**
		 * 二次确认：说清"删什么、删完会怎样、能不能恢复"。
		 * 桌面壳里的删除接口是 window.dshDesktop.deleteSession（preload 暴露）。
		 */
		const showConfirm = (sessionId, title) => {
			closeDialog();
			const mask = document.createElement("div");
			mask.className = "dsh-del-mask";
			const box = document.createElement("div");
			box.className = "dsh-del-dialog";
			box.setAttribute("role", "dialog");
			box.setAttribute("aria-modal", "true");

			const h = document.createElement("h2");
			h.className = "dsh-del-title";
			h.textContent = "删除这个对话？";
			const sub = document.createElement("p");
			sub.className = "dsh-del-sub";
			sub.textContent = "「" + title + "」";
			const warn = document.createElement("div");
			warn.className = "dsh-del-warn";
			const warnStrong = document.createElement("strong");
			warnStrong.textContent = "删除后无法恢复。";
			warn.appendChild(warnStrong);
			warn.appendChild(document.createTextNode(
				"这个对话的全部记录数据都会被永久删除：消息与轨迹、代码归档、以及相关的本地缓存。",
			));
			const status = document.createElement("div");
			status.className = "dsh-del-status";

			const foot = document.createElement("div");
			foot.className = "dsh-del-foot";
			const cancel = document.createElement("button");
			cancel.type = "button";
			cancel.className = "dsh-del-cancel";
			cancel.textContent = "取消";
			const confirm = document.createElement("button");
			confirm.type = "button";
			confirm.className = "dsh-del-danger";
			confirm.textContent = "永久删除";
			foot.appendChild(cancel);
			foot.appendChild(confirm);

			box.appendChild(h);
			box.appendChild(sub);
			box.appendChild(warn);
			box.appendChild(status);
			box.appendChild(foot);
			mask.appendChild(box);

			const onKey = (event) => {
				if (event.key === "Escape") {
					event.preventDefault();
					closeDialog();
				}
			};
			mask.addEventListener("pointerdown", (event) => {
				if (event.target === mask) closeDialog();
			});
			cancel.addEventListener("click", closeDialog);
			document.addEventListener("keydown", onKey, true);

			const cleanupKey = () => document.removeEventListener("keydown", onKey, true);
			const finish = () => {
				cleanupKey();
				closeDialog();
			};
			cancel.addEventListener("click", cleanupKey);

			confirm.addEventListener("click", async () => {
				const api = window.dshDesktop;
				if (!api || typeof api.deleteSession !== "function") {
					status.dataset.kind = "error";
					status.textContent = "当前不是在桌面客户端里打开的，删不了。请用桌面版（DeepSeek Harness.exe）操作。";
					return;
				}
				confirm.disabled = true;
				cancel.disabled = true;
				status.dataset.kind = "";
				status.textContent = "正在删除…";
				try {
					const result = await api.deleteSession(sessionId);
					if (result && result.ok) {
						const n = (result.removed || []).length;
						status.textContent = "已删除（清理了 " + n + " 处数据），正在刷新列表…";
						setTimeout(() => {
							finish();
							window.location.reload();
						}, 900);
						return;
					}
					status.dataset.kind = "error";
					const failed = result && result.failed && result.failed.length
						? "（" + result.failed.map((f) => f.error).join("; ") + "）"
						: "";
					status.textContent = "删除失败" + failed + "。可以看日志：E:\\DeepSeekHarness\\logs";
				} catch (error) {
					status.dataset.kind = "error";
					status.textContent = "删除失败：" + String((error && error.message) || error);
				}
				confirm.disabled = false;
				cancel.disabled = false;
			});

			document.body.appendChild(mask);
			openDialog = mask;
			cancel.focus();
			box.addEventListener("click", (event) => event.stopPropagation());
		};
		//#endregion

		//#region 往每一行塞按钮
		const injectInto = (row) => {
			const actions = row.querySelector(ACTIONS_SELECTOR);
			if (!actions || actions.querySelector("[" + MARK + "]")) return;
			const id = (row.getAttribute("data-row-key") || "").slice("session:".length);
			if (!id) return;
			const button = document.createElement("button");
			button.type = "button";
			button.className = "dsh-del-btn";
			button.setAttribute(MARK, id);
			button.setAttribute("aria-label", "删除对话（不可恢复）");
			button.title = "删除对话（不可恢复）";
			button.appendChild(trashIcon());
			button.addEventListener("pointerdown", (event) => event.stopPropagation());
			button.addEventListener("click", (event) => {
				event.preventDefault();
				event.stopPropagation();
				showConfirm(id, sessionTitle(row));
			});
			actions.appendChild(button);
		};

		const injectAll = () => {
			for (const row of document.querySelectorAll(ROW_SELECTOR)) injectInto(row);
		};
		//#endregion

		/**
		 * 插件入口：装上样式、塞按钮，并盯着列表（官方重渲染会把按钮冲掉）。
		 * @param ctx - 客户端 cordis 上下文。
		 */
		function apply(ctx) {
			installCss();
			injectAll();
			let timer = null;
			new MutationObserver(() => {
				if (timer !== null) return;
				timer = setTimeout(() => {
					timer = null;
					injectAll();
				}, 200);
			}).observe(document.body, { childList: true, subtree: true });
			// 兜底：极少数情况下观察器漏掉（例如行被就地改写），每 4 秒补一次
			setInterval(injectAll, 4000);
		}
		exports.apply = apply;
		return module.exports;
	}
});

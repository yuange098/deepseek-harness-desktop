window.__ModuleLoader__.load({
	id: "dsh-harness-site",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		//#region Harness 官网配色
		/**
		 * 取自官网 (deepseek.com/harness) 的设计变量：
		 *   浅色 = #f9f8f8 画布 + 半透明白玻璃面 + 近黑主按钮 (#1a1615) + 品牌蓝链接 (#4d6bfe)
		 *   深色 = #0a0a0a 画布 + 白色叠加玻璃面 + 白色主按钮 + #6799fe 链接
		 * 每个 token 同时给 light / dark，切换配色时不会失读。
		 */
		const TOKENS = {
			// —— 分层底色（全部不透明）——
			// 曾试过"整窗 acrylic + 半透明面板"的真玻璃方案，但 Windows 上透明窗口会：
			//   ① 丢原生最小化/最大化/关闭按钮、② 边框不能拖拽缩放、③ 首帧出现慢、
			//   ④ 打开开始菜单时 acrylic 去模糊导致局部变暗。
			// 为稳定性改回不透明，仍然保留"外壳 → 内容面 → 浮层"三层的明暗层次。
			"--dsw-alias-bg-base": { light: "#F9F8F8", dark: "#0F0F0F" },
			"--dsw-alias-bg-layer-1": { light: "#FFFFFF", dark: "#1A1A1A" },
			"--dsw-alias-bg-layer-2": { light: "#FFFFFF", dark: "#202020" },
			"--dsw-alias-bg-layer-3": { light: "#FFFFFF", dark: "#232323" },
			"--dsw-alias-bg-module-platform": { light: "#F4F2EF", dark: "#1E1E1E" },
			"--dsw-alias-bg-overlay": { light: "#FFFFFF", dark: "#262626" },
			"--dsw-alias-bg-skeleton": { light: "rgba(0, 0, 0, 0.06)", dark: "rgba(255, 255, 255, 0.08)" },
			"--dsw-alias-settings-card-fill": { light: "#FFFFFF", dark: "#202020" },
			"--dsw-alias-tooltip-bg": { light: "#2A1310", dark: "#282828" },
			"--dsw-alias-toast-bg": { light: "#FFFFFF", dark: "#282828" },
			// —— 专用 token（dsh-client-ui-sidebar 等核心包直接读这些）——
			// 侧栏底色：官方默认是实心色，这里换成玻璃，让它和画布一样透。
			"--dsw-specific-sidebar-fill": { light: "#FFFFFF", dark: "#151515" },
			"--dsw-specific-sidebar-nav-item-hover": { light: "rgba(0, 0, 0, 0.05)", dark: "rgba(255, 255, 255, 0.07)" },
			"--dsw-specific-sidebar-nav-item-active": { light: "rgba(0, 0, 0, 0.08)", dark: "rgba(255, 255, 255, 0.12)" },
			"--dsw-specific-sidebar-nav-item-active-accent": { light: "rgba(77, 107, 254, 0.14)", dark: "rgba(103, 153, 254, 0.18)" },
			// 内容面：输入框、气泡、下拉触发器 —— 中等透明度
			"--dsw-specific-input-major": { light: "#FFFFFF", dark: "#1E1E1E" },
			"--dsw-specific-login-input": { light: "#FFFFFF", dark: "#1E1E1E" },
			// 用户自己的消息气泡：淡蓝底，和助手回答一眼区分
			"--dsw-specific-bubble": { light: "#E8F0FE", dark: "#1E2B45" },
			"--dsw-specific-bubble-highlight": { light: "#D6E4FF", dark: "#24365A" },
			"--dsw-specific-selector": { light: "#F4F2EF", dark: "#242424" },
			// 浮层/菜单/提示 —— 最低透明度（仍带一点玻璃感，但保证可读）
			"--dsw-specific-menu": { light: "#F8F9FA", dark: "#303136" },
			"--dsw-specific-tip": { light: "#F0EEEA", dark: "#282828" },
			"--dsw-alias-settings-card-stroke": { light: "#EDEAE6", dark: "rgba(255, 255, 255, 0.10)" },
			// —— 描边 ——
			"--dsw-alias-border-l1": { light: "rgba(0, 0, 0, 0.08)", dark: "rgba(255, 255, 255, 0.10)" },
			"--dsw-alias-border-l2": { light: "rgba(0, 0, 0, 0.12)", dark: "rgba(255, 255, 255, 0.16)" },
			"--dsw-alias-border-l3": { light: "rgba(0, 0, 0, 0.16)", dark: "rgba(255, 255, 255, 0.22)" },
			"--dsw-alias-border-l4": { light: "rgba(0, 0, 0, 0.20)", dark: "rgba(255, 255, 255, 0.28)" },
			// —— 主按钮：官网浅色是近黑 CTA，深色是白 CTA ——
			"--dsw-alias-brand-primary": { light: "#1A1615", dark: "#FFFFFF" },
			"--dsw-alias-brand-primary-soft": { light: "rgba(26, 22, 21, 0.08)", dark: "rgba(255, 255, 255, 0.12)" },
			"--dsw-alias-brand-text": { light: "#FFFFFF", dark: "#0A0A0A" },
			// 官网品牌蓝：发送按钮、信息类强调都用它
			"--dsw-alias-brand-primary-new-colorprimary-new-color": { light: "#4D6BFE", dark: "#6799FE" },
			"--dsw-alias-button-info-fill": { light: "#4D6BFE", dark: "#6799FE" },
			"--dsw-alias-button-info-hover": { light: "#3A5AE0", dark: "#7FA8FE" },
			"--dsw-alias-button-primary-fill": { light: "#1A1615", dark: "#FFFFFF" },
			"--dsw-alias-button-primary-hover": { light: "#2B2523", dark: "rgba(255, 255, 255, 0.85)" },
			"--dsw-alias-button-primary-dimmed": { light: "rgba(26, 22, 21, 0.45)", dark: "rgba(255, 255, 255, 0.45)" },
			"--dsw-alias-button-elevated-fill": { light: "#FFFFFF", dark: "#1E1E1E" },
			"--dsw-alias-interactive-bg-hover": { light: "rgba(0, 0, 0, 0.04)", dark: "rgba(255, 255, 255, 0.06)" },
			"--dsw-alias-interactive-bg-active": { light: "rgba(0, 0, 0, 0.08)", dark: "rgba(255, 255, 255, 0.12)" },
			"--dsw-alias-interactive-bg-hover-accent": { light: "rgba(77, 107, 254, 0.08)", dark: "rgba(103, 153, 254, 0.10)" },
			"--dsw-alias-onboarding-accent": { light: "#4D6BFE", dark: "#6799FE" },
			// —— 文字与链接（官网品牌蓝只用于链接/强调，不抢主按钮）——
			"--dsw-alias-label-primary": { light: "#1E232C", dark: "#FFFFFF" },
			"--dsw-alias-label-primary-bluish": { light: "#121C31", dark: "#FFFFFF" },
			"--dsw-alias-label-secondary": { light: "rgba(0, 0, 0, 0.70)", dark: "rgba(255, 255, 255, 0.80)" },
			"--dsw-alias-label-tertiary": { light: "rgba(0, 0, 0, 0.55)", dark: "rgba(255, 255, 255, 0.50)" },
			"--dsw-alias-label-caption": { light: "#8691A1", dark: "rgba(255, 255, 255, 0.30)" },
			"--dsw-alias-link": { light: "#4176E6", dark: "#6799FE" },
			// —— 代码块与滚动条 ——
			"--dsw-alias-markdown-code-block": { light: "rgba(0, 0, 0, 0.05)", dark: "rgba(0, 0, 0, 0.35)" },
			"--dsw-alias-markdown-inline-code": { light: "rgba(0, 0, 0, 0.05)", dark: "rgba(255, 255, 255, 0.08)" },
			"--dsw-alias-scrollbar-bg-l1": { light: "rgba(0, 0, 0, 0.10)", dark: "rgba(255, 255, 255, 0.20)" },
			"--dsw-alias-scrollbar-bg-l2": { light: "rgba(0, 0, 0, 0.16)", dark: "rgba(255, 255, 255, 0.28)" },
			"--dsw-alias-scrollbar-hover-l1": { light: "rgba(0, 0, 0, 0.22)", dark: "rgba(255, 255, 255, 0.32)" },
			"--dsw-alias-scrollbar-hover-l2": { light: "rgba(0, 0, 0, 0.30)", dark: "rgba(255, 255, 255, 0.45)" },
			// —— 信息/状态色跟随官网蓝，其余保持语义 ——
			"--dsw-alias-state-business-primary": { light: "#4176E6", dark: "#6799FE" },
			"--dsw-alias-state-business-tertiary": { light: "rgba(65, 118, 230, 0.12)", dark: "rgba(103, 153, 254, 0.16)" },
			"--dsw-alias-state-warn-primary": { light: "#B26A00", dark: "#F0A93B" },
			"--dsw-alias-state-error-primary": { light: "#C62828", dark: "#FF6B6B" },
			"--dsw-alias-state-success-primary": { light: "#2E7D32", dark: "#6FBF73" },
		};
		//#endregion
		/** 依赖的主题服务。 */
		const inject = ["theme"];
		/**
		 * 界面细节调整（都以「不改变功能、可随时删掉」为前提）：
		 *  1. 侧栏底部「洞察 / 设置」两个入口并排显示；
		 *  2. 把「上下文洞察」改名为「洞察」；
		 *  3. 右侧面板默认 631px 太宽，限制到 420px；
		 *  4. 用户消息气泡加一圈淡蓝描边（底色由 --dsw-specific-bubble 控制）。
		 */
		function installUiTweaks() {
			if (document.getElementById("dsh-ui-tweaks")) return;
			const style = document.createElement("style");
			style.id = "dsh-ui-tweaks";
			style.textContent = [
				/* 1) 底部入口并排 */
				".hHd-Xa_footArea{flex-direction:row !important;align-items:center !important;gap:8px !important}",
				".hHd-Xa_footArea > *{flex:1 1 0 !important;min-width:0 !important}",
				/* 4) 气泡描边 */
				'[class*="_bubble"]{box-shadow:inset 0 0 0 1px rgba(77,107,254,.35) !important}',
				/*
				 * 5) 干掉"聊天内容宽度"的拖拽手柄。
				 * 官方 dsh-client-ui-conversation 在聊天列两侧各放了一条 widthHandle
				 * （10px 宽、整列高、cursor:col-resize，位置跟着 --dsh-chat-content-width 走），
				 * 鼠标扫过去就会变成左右箭头、还能把聊天列拖宽拖窄 —— 在「代码」页这种
				 * 聊天列已经隐藏的视图里尤其容易误触（用户反馈过两次）。
				 * 只隐藏手柄本身，不动容器、不动布局，也不碰右侧面板那根把手
				 * （那是"拖一次记住宽度"用的，属于要保留的功能）。
				 */
				'[class*="widthHandle"]{display:none !important}',
			].join("");
			document.head.appendChild(style);

			installPaneFill();
			installPanelWidthMemory();

			/* 2) 改名：上下文洞察 → 洞察（菜单重建后会自动再改一次） */
			const rename = () => {
				for (const el of document.querySelectorAll(".lc-ov-entry-label")) {
					if (el.textContent.trim() === "上下文洞察") el.textContent = "洞察";
				}
			};
			rename();
			let timer = null;
			new MutationObserver(() => {
				if (timer !== null) return;
				timer = setTimeout(() => {
					timer = null;
					rename();
				}, 400);
			}).observe(document.body, { childList: true, subtree: true });
		}
		/**
		 * 右侧面板宽度的「全局记忆」。
		 *
		 * 官方把布局存在 `dsh.sidebar-right.v1.<会话id>` 里 —— 按会话分开存，
		 * 所以换个会话打开就回到默认宽度（看起来像"没记忆"）。
		 * 这里做两件事，都不锁上限、拖拽照常：
		 *  1. 监听该存储的写入，把宽度抄一份到全局键；
		 *  2. 面板挂载时，把全局宽度套用回去。
		 */
		function installPanelWidthMemory() {
			const WIDTH_KEY = "dsh-harness-site:panel-width";
			const STORE_PREFIX = "dsh.sidebar-right.v1.";
			const MIN = 300;
			const MAX = 1600;
			// 「容器刚好放下里面的按钮」：这里记住"容器是按多宽的按钮算出来的"。
			// 按钮宽度一变（我改样式 / 官方升级），容器就按新宽度重新收窄一次；
			// 按钮没变时不动，你手动拖出来的宽度一直有效。
			const HUG_BASE_KEY = "dsh-harness-site:panel-hug-base";

			const remember = (width) => {
				const value = Math.round(Number(width));
				if (!Number.isFinite(value) || value < MIN || value > MAX) return;
				try {
					localStorage.setItem(WIDTH_KEY, String(value));
				} catch {
					/* 存储不可用就算了 */
				}
			};

			const savedWidth = () => {
				try {
					const value = Math.round(Number(localStorage.getItem(WIDTH_KEY)));
					return Number.isFinite(value) && value >= MIN && value <= MAX ? value : null;
				} catch {
					return null;
				}
			};

			/**
			 * 量按钮（卡片）本身的宽度。量不到（比如当前显示的是文件树）返回 null，
			 * 等下一次 DOM 变化再试。
			 */
			const measureCard = () => {
				const col = document.querySelector('[class*="rightbarCol"]');
				const pane = col && col.querySelector('[class*="_pane_"]');
				if (!pane) return null;
				const cell = pane.querySelector('[class*="_entryCell"]');
				if (!cell) return null;
				const card = Math.round(cell.getBoundingClientRect().width);
				if (!card || card < 80 || card > 900) return null;
				return { card, chrome: Math.max(0, pane.offsetWidth - pane.clientWidth) };
			};
			/**
			 * 容器需要的宽度 = 按钮宽 + 面板内边距(6×2) + 列表内边距(8×2) + 滚动条 + 2px 余量。
			 * 内边距用常量：installPaneFill() 已把它们强制成固定值，
			 * 这里不能用 getComputedStyle 现量 —— 样式可能还没装上，会量到官方的旧值。
			 */
			const hugWidthFor = (card, chrome) => Math.round(card + 6 * 2 + 8 * 2 + chrome + 2);

			/**
			 * 按钮宽度变了 → 容器跟着重新收窄。记的是"这个宽度是按多宽的按钮算的"：
			 *  · 第一次 → 收一次；
			 *  · 按钮改宽/改窄了 → 自动跟着重算（这就是"容器随按钮自动适应"）；
			 *  · 按钮没动、你自己拖过宽度 → 保持你的宽度，绝不插手。
			 */
			const applyHug = () => {
				const info = measureCard();
				if (info === null) return;
				let base = null;
				try {
					const raw = Number(localStorage.getItem(HUG_BASE_KEY));
					base = Number.isFinite(raw) && raw > 0 ? Math.round(raw) : null;
				} catch {
					return; // 存储不可用就保持原样
				}
				if (base !== null && Math.abs(base - info.card) <= 2) return;
				const target = hugWidthFor(info.card, info.chrome);
				// 除了存起来，还要在内存里记住"这一轮必须收到这个宽度"：
				// 存储值随时会被 app 自己的尺寸观察器用旧宽度盖掉，只有内存里的目标能顶住。
				hugTarget = target;
				remember(target);
				try {
					localStorage.setItem(HUG_BASE_KEY, String(info.card));
				} catch {
					/* 忽略 */
				}
			};

			/* 1) 抄宽度：官方保存布局时顺手记下 */
			try {
				const originalSetItem = Storage.prototype.setItem;
				Storage.prototype.setItem = function patchedSetItem(key, value) {
					try {
						if (typeof key === "string" && key.indexOf(STORE_PREFIX) === 0) {
							const bySession = (JSON.parse(value) || {}).bySession || {};
							for (const entry of Object.values(bySession)) {
								if (entry && entry.width !== undefined) remember(entry.width);
							}
						}
					} catch {
						/* 解析失败不影响原行为 */
					}
					return originalSetItem.call(this, key, value);
				};
			} catch {
				/* 某些环境不允许改写 Storage */
			}

			/**
			 * 把右侧把手挪到占位列的左边缘。
			 * 把手是绝对定位（inline left），app 只在自己拖拽时更新它；
			 * 我们改了宽度就得跟着挪，否则鼠标移到老位置还会出现拉伸光标。
			 */
			/**
			 * 用"一次真实拖拽"把右侧栏调到指定宽度。
			 *
			 * 为什么不用内联宽度硬改：侧栏宽度是 app 自己的布局状态
			 * （面板上写着 --dsh-sidebar-width，占位列、把手位置都由它算），
			 * 硬写内联宽度会被它的下一次渲染覆盖，而且"面板宽 560、内容层宽 476"
			 * 这种不一致会在右侧留出一条空白。让 app 自己拖一次，三层就永远一致。
			 */
			const dragSidebarTo = (targetWidth) => {
				const handle = [...document.querySelectorAll('[class*="handle"]')]
					.map((el) => ({ el, box: el.getBoundingClientRect() }))
					.filter((h) => h.box.height > 100 && h.box.width <= 16
						&& h.box.left > window.innerWidth * 0.4)
					.sort((a, b) => b.box.left - a.box.left)[0];
				if (!handle) return false;
				const startX = handle.box.left + handle.box.width / 2;
				const y = handle.box.top + handle.box.height / 2;
				const endX = window.innerWidth - targetWidth;
				if (Math.abs(endX - startX) <= 2) return true;
				const pointer = (type, x, buttons) => new PointerEvent(type, {
					bubbles: true, cancelable: true, composed: true,
					clientX: x, clientY: y, screenX: x, screenY: y,
					pointerId: 1, pointerType: "mouse", isPrimary: true, buttons,
				});
				const mouse = (type, x, buttons) => new MouseEvent(type, {
					bubbles: true, cancelable: true, composed: true,
					clientX: x, clientY: y, buttons, view: window,
					movementX: x - lastX, movementY: 0,
				});
				let lastX = startX;
				try {
					handle.el.dispatchEvent(pointer("pointerdown", startX, 1));
					handle.el.dispatchEvent(mouse("mousedown", startX, 1));
					const steps = 10;
					for (let i = 1; i <= steps; i += 1) {
						const x = startX + ((endX - startX) * i) / steps;
						// 事件要发给把手本身：app 的监听挂在把手上（或靠冒泡到 document），
						// 只发给 document 时它收不到后续位移（实测只吃掉第一步）。
						lastX = x;
						handle.el.dispatchEvent(pointer("pointermove", x, 1));
						handle.el.dispatchEvent(mouse("mousemove", x, 1));
					}
					handle.el.dispatchEvent(pointer("pointerup", endX, 0));
					handle.el.dispatchEvent(mouse("mouseup", endX, 0));
				} catch {
					return false;
				}
				return true;
			};
			/* 2) 套用宽度：同时改「占位列 + 面板变量 + 面板内容层」，让整条布局一起收窄 */
			let observedPane = null;
			const watchPane = (pane) => {
				if (observedPane === pane || typeof ResizeObserver !== "function") return;
				observedPane = pane;
				let resizeTimer = null;
				new ResizeObserver(() => {
					if (resizeTimer !== null) clearTimeout(resizeTimer);
					resizeTimer = setTimeout(() => {
						resizeTimer = null;
						remember(pane.getBoundingClientRect().width);
					}, 600);
				}).observe(pane);
			};
			/**
			 * 清掉旧版本写在这两层上的内联宽度（只清一次）。
			 * 老做法给面板内容层写过 width / flex：它会被 app 的重渲染覆盖，
			 * 而且纵向 flex 上的 flex-basis 会把内容压成方块 —— 右侧那条空白和
			 * "面板只占上半截"都是这么来的。清掉之后宽度完全交给 app 自己算。
			 */
			const cleanupOldInlineWidth = (pane) => {
				const FLAG = "dsh-harness-site:width-cleanup";
				try {
					if (localStorage.getItem(FLAG) === "2") return;
				} catch {
					return; // 存储不可用就别乱动
				}
				const body = pane.closest('[class*="P3OORG_panelBody"]');
				for (const el of [pane, body]) {
					if (!el || !el.style) continue;
					if (el.style.width) el.style.width = "";
					if (el.style.flex) el.style.flex = "";
					if (el.style.maxWidth) el.style.maxWidth = "";
				}
				try {
					localStorage.setItem(FLAG, "2");
				} catch {
					/* 忽略 */
				}
			};
			const applyWidth = () => {
				const col = document.querySelector('[class*="rightbarCol"]');
				const pane = (col && col.querySelector('[class*="_pane_"]'))
					|| document.querySelector('[class*="_pane_"]');
				if (!pane || !col) return;
				// 无论有没有全局值，都开始盯着这个面板：拖出来的宽度会被记住
				watchPane(pane);
				cleanupOldInlineWidth(pane);
				applyHug();
				// 收窄目标优先于存储值：存储值可能刚被 app 用旧宽度盖掉
				let width = savedWidth();
				if (hugTarget !== null) width = hugTarget;
				if (width === null) return;
				// 早先版本在这里写过内联宽度（含面板与内容层），
				// 结果被 app 的重渲染覆盖、还在纵向 flex 上把高度压成方块。
				// 现在改成：宽度对不上就"替用户拖一次"，其余交给 app。
				if (Math.abs(pane.getBoundingClientRect().width - width) <= 6) {
					if (hugTarget !== null) hugTarget = null; // 已经是目标宽度，收工
					return;
				}
				// 用户刚刚自己动过鼠标（很可能正在拖宽度）：这两秒内不插手
				if (Date.now() - lastUserInput < 2000) return;
				if (dragGuard) return;
				dragGuard = true;
				let done = false;
				try {
					done = dragSidebarTo(width);
				} finally {
					setTimeout(() => {
						dragGuard = false;
					}, 500);
				}
				if (done && hugTarget !== null) hugTarget = null;
			};
			let dragGuard = false;
			// 这一轮必须收到的宽度（按钮宽度变了才有值），优先级高于存储值
			let hugTarget = null;
			// 记录用户真实操作时间：他拖宽度时我们绝不抢方向盘
			let lastUserInput = 0;
			for (const type of ["pointerdown", "mousedown", "touchstart"]) {
				window.addEventListener(type, () => {
					lastUserInput = Date.now();
				}, true);
			}
			applyWidth();
			let timer = null;
			new MutationObserver(() => {
				if (timer !== null) return;
				timer = setTimeout(() => {
					timer = null;
					applyWidth();
				}, 300);
			}).observe(document.body, { childList: true, subtree: true });
		}
		/**
		 * 右栏被拖宽后，里面的卡片仍是固定宽度（官方写死 380px），右侧会留一片空白。
		 * 这里在运行时找出"宽度受限的卡片"，把它们改成自适应填满。
		 */
		function installPaneFill() {
			const style = document.createElement("style");
			style.id = "dsh-pane-fill";
			document.head.appendChild(style);
			const apply = () => {
				const pane = document.querySelector('[class*="_paneBody"], [class*="paneBody"]');
				if (!pane) return;
				if (style.dataset.applied === "1") return;
				// 说明：曾两次"按尺寸猜元素"改卡片，都猜到容器层（越改越高），已回退。
				// 现在改尺寸的依据是实测取证（work/probe-pane-cards.cjs）：
				//   右栏 7 行 = [class*="_entryCell"] > div(display:contents) > 行元素
				//   官方 6 行的行元素就是 button[class*="_entry"]（56px / padding 14px 20px / 圆角 20px）
				//   第 7 行（插件）行元素是 div[class*="_entry"]，里面再套一个 button
				// 因此只按"层级位置"命中行元素，不再按尺寸猜。
				const SCOPE = '[class*="_paneBody"] ';
				// 按钮尺寸（按需求）：宽度 380 → 253（缩小 1/3），高度 → 50。
				// 容器（侧栏）宽度由 applyHug() 按这个宽度自动算，不用手动同步。
				const CARD_W = "253px";
				const ROW =
					"height:50px !important;min-height:50px !important;max-height:50px !important;" +
					"padding:6px 12px !important;gap:10px !important;border-radius:12px !important;" +
					"font-size:13.5px !important;";
				style.textContent = [
					// 贴边：右栏内容只留很窄的内边距，不再出现右侧空条
					'[class*="_paneBody"]{padding-left:6px !important;padding-right:6px !important}',
					'[class*="paneBody"]{padding-left:6px !important;padding-right:6px !important}',
					// 注意：这里**不要**再给面板加 max-width 上限。
					// 之前加过 min(560px,42vw)，结果"面板表面"被卡在 560、
					// "面板内容层"是另一个宽度，右侧就多出一条空白。
					// 现在宽度由 applyWidth() 同时写给「占位列 + 面板 + 内容层」，三层永远一致。
					// —— 卡片尺寸：宽 380 → 253（缩小 1/3）、高 50、圆角 20 → 12、行距 14 → 8 ——
					SCOPE + '[class*="_entryCell"]{height:auto !important;min-height:0 !important;'
						+ 'width:' + CARD_W + ' !important;min-width:0 !important;max-width:' + CARD_W + ' !important}',
					SCOPE + '[class*="_entryCell"]>[class*="_entry"],'
						+ SCOPE + '[class*="_entryCell"]>div>[class*="_entry"]{width:100% !important;' + ROW + '}',
					// 行内再套按钮的那种（插件卡片）：内层按钮跟着行高走
					SCOPE + '[class*="_entryCell"]>div>[class*="_entry"]>button,'
						+ SCOPE + '[class*="_entryCell"]>div>[class*="_entry"] button{'
						+ 'width:100% !important;height:100% !important;min-height:0 !important;max-height:100% !important;'
						+ 'padding:0 !important;font-size:13.5px !important;line-height:1.2 !important}',
					SCOPE + '[class*="_entryIcon"]{width:20px !important;height:20px !important;font-size:13px !important}',
					SCOPE + '[class*="_entryText"]{font-size:13.5px !important}',
					SCOPE + '[class*="_guide"]{gap:8px !important;padding-left:8px !important;padding-right:8px !important}',
				].join("");
				style.dataset.applied = "1";
			};
			apply();
			// 右栏是"收起状态"启动时，面板 DOM 会晚很多才挂载（甚至要等用户点开才挂载），
			// 所以不能只在启动时试三次：一直盯着，等面板出现再装样式（装好就停）。
			let timer = null;
			const observer = new MutationObserver(() => {
				if (style.dataset.applied === "1") {
					observer.disconnect();
					return;
				}
				if (timer !== null) return;
				timer = setTimeout(() => {
					timer = null;
					apply();
				}, 300);
			});
			observer.observe(document.body, { childList: true, subtree: true });
			setTimeout(apply, 1200);
			setTimeout(apply, 4000);
		}
		/**
		 * 把官网配色作为覆盖层压在当前主题之上：深浅两套都适配，
		 * 用户在「设置 → 外观」切换浅色/深色即可看到官网的对应版本。
		 * @param ctx - 客户端 cordis 上下文。
		 */
		function apply(ctx) {
			ctx.theme.overrideTokens("dsh-harness-site", TOKENS);
			installUiTweaks();
		}
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

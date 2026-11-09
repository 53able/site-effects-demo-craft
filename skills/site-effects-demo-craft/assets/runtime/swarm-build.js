/*!
SwarmBuild standalone 2D runtime; IIFE global SwarmBuild.
Ported from https://github.com/habom2310/swarm-build.

MIT License

Copyright (c) 2026 Ha Nguyen
Copyright (c) 2026 swarm-build-canvas contributors
Copyright (c) 2026 53able

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
var SwarmBuild = (function(exports) {
	Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
	// runtime-src/clip.ts
	/** Hides an element. */
	const HIDDEN = "inset(0 0 100% 0)";
	const inset = ({ x, y, w, h }, hPct = h) => `inset(${y}% ${100 - x - w}% ${100 - y - hPct}% ${x}%)`;
	/**
	* The single source of the sweep geometry at progress `e` (0..1) for a block at `rect`.
	* The sweep reaches 40px past the top, left and right edges so most shadows show as it builds;
	* its bottom edge moves from the block's top down to 40px below its bottom.
	*/
	function sweepFront(rect, e) {
		const terms = {
			top: -40,
			right: -40,
			left: -40,
			bottomPct: (1 - e) * 100,
			bottomPx: e * 40
		};
		const frontY = rect.top + rect.height - (terms.bottomPct / 100 * rect.height - terms.bottomPx);
		const left = rect.left + terms.left;
		const right = rect.left + rect.width - terms.right;
		const top = rect.top + terms.top;
		const bottom = Math.max(top, frontY);
		return {
			inset: terms,
			visible: {
				left,
				top,
				right,
				bottom,
				width: right - left,
				height: bottom - top
			},
			frontY
		};
	}
	const ORIGIN = {
		left: 0,
		top: 0,
		width: 0,
		height: 0
	};
	/** The clip-path for progress `e`, built from the same terms as {@link sweepFront}. */
	const sweep = (e) => {
		const { top, right, left, bottomPct, bottomPx } = sweepFront(ORIGIN, e).inset;
		return `inset(${top}px ${right}px calc(${bottomPct}% - ${bottomPx}px) ${left}px)`;
	};
	// runtime-src/dom.ts
	function el(tag, style = {}, parent) {
		const node = document.createElement(tag);
		Object.assign(node.style, style);
		parent?.appendChild(node);
		return node;
	}
	function imageSource(node) {
		if (node instanceof HTMLImageElement) return node.currentSrc || node.src;
		return getComputedStyle(node).backgroundImage.match(/^url\(["']?(.*?)["']?\)$/)?.[1] ?? "";
	}
	/** Plain text a block can type in, or null when it holds elements or too much text. */
	function typeable(node) {
		if (![...node.childNodes].every((n) => n.nodeType === Node.TEXT_NODE)) return null;
		const text = node.textContent ?? "";
		return text.trim().length > 0 && text.length <= 240 ? text : null;
	}
	// runtime-src/easing.ts
	const easeInOut = (t) => t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
	const easeOut = (t) => 1 - (1 - t) ** 2;
	const easeIn = (t) => t * t;
	const lerp = (a, b, t) => a + (b - a) * t;
	// runtime-src/regions.ts
	/** A header, a sidebar, a main block and two cards: a fallback for when no regions are given. */
	function autoRegions() {
		return [
			{
				x: 0,
				y: 0,
				w: 100,
				h: 12
			},
			{
				x: 0,
				y: 12,
				w: 28,
				h: 88
			},
			{
				x: 28,
				y: 12,
				w: 72,
				h: 42
			},
			{
				x: 28,
				y: 54,
				w: 36,
				h: 46
			},
			{
				x: 64,
				y: 54,
				w: 36,
				h: 46
			}
		];
	}
	/** Parses "x y w h, x y w h" (percent of the image) into regions. */
	function parseRegions(text) {
		return text.split(/[,;]/).map((part) => part.trim().split(/\s+/).map(Number)).filter((n) => n.length === 4 && n.every(Number.isFinite)).map(([x, y, w, h]) => ({
			x,
			y,
			w,
			h
		}));
	}
	// runtime-src/loop.ts
	/** Rejection reason for tweens once the swarm has ended; never logged. */
	const ABORT = Symbol("swarm-build destroyed");
	/**
	* One rAF loop drives every tween. Each tick runs in a fixed order: settle the tweens (which
	* write clip-paths), then `onFrame` (which builds the scene and hands it to the renderer).
	*/
	function createLoop(onFrame, initialSpeed) {
		const active = /* @__PURE__ */ new Set();
		let speed = initialSpeed;
		let frame = 0;
		let last = 0;
		/** Loop time in ms: real time times the speed, from the first frame. */
		let elapsed = 0;
		let ended = false;
		let done = false;
		const settle = (tw, t) => {
			tw.update(t);
			if (t >= 1) {
				active.delete(tw);
				tw.resolve();
			}
		};
		const tick = (now) => {
			if (ended) return;
			const dt = last ? Math.min(now - last, 100) * speed : 0;
			last = now;
			elapsed += dt;
			for (const tw of [...active]) settle(tw, Math.min(1, tw.t += dt / tw.duration));
			onFrame();
			frame = requestAnimationFrame(tick);
		};
		const tween = (seconds, update = () => {}) => new Promise((resolve, reject) => {
			if (ended) return reject(ABORT);
			const tw = {
				t: 0,
				duration: Math.max(1, seconds * 1e3),
				update,
				resolve,
				reject
			};
			if (done) settle(tw, 1);
			else active.add(tw);
		});
		return {
			tween,
			start() {
				frame = requestAnimationFrame(tick);
			},
			/** Every future tween settles at once. */
			markDone() {
				done = true;
			},
			/** Every running tween jumps to its end. */
			settleActive() {
				[...active].forEach((tw) => settle(tw, 1));
			},
			get done() {
				return done;
			},
			/** Seconds of loop time (scaled by the speed) since the loop started. */
			get time() {
				return elapsed / 1e3;
			},
			/** Cancels the frame and rejects every running tween with ABORT. */
			stop() {
				ended = true;
				cancelAnimationFrame(frame);
				active.forEach((tw) => tw.reject(ABORT));
				active.clear();
			},
			setSpeed(value) {
				speed = value;
			}
		};
	}
	// runtime-src/roles.ts
	/** What an agent builds. Each default agent is named after its role: `type-agent` and so on. */
	const ROLES = [
		"layout",
		"type",
		"grid",
		"color",
		"icon",
		"motion",
		"image",
		"copy",
		"link",
		"form",
		"chart",
		"review"
	];
	const isRole = (value) => !!value && ROLES.includes(value);
	/**
	* The role an agent works in: its own `role`, else one in its name (`image-agent`, `image-2`,
	* `image`), else none.
	*/
	function roleOfAgent(agent) {
		if (agent.role) return agent.role;
		const match = /^([a-z]+)(?:-agent|-\d+)?$/.exec(agent.name);
		return match && isRole(match[1]) ? match[1] : void 0;
	}
	const CONTROLS = "button, input, select, textarea, form, label, [role=button], [role=checkbox], [role=switch]";
	const CHARTS = "table, canvas, meter, progress, [data-chart]";
	const LAYOUT_TAGS = /* @__PURE__ */ new Set([
		"section",
		"header",
		"footer",
		"main",
		"nav",
		"aside",
		"article",
		"body"
	]);
	/**
	* The role that builds a block, from its features: an explicit `data-swarm-role` first, then
	* forms, charts, pictures (decorative ones to `color`, or `motion` when they animate), icons,
	* links, text (headings to `type`, other text to `copy`), decoration (gradients and plain colour
	* boxes to `color`, animated parts to `motion`), and containers (cards and grids to `grid`,
	* sections and other boxes to `layout`). Anything else goes to `review`.
	*/
	function classifyRole(f) {
		if (isRole(f.override)) return f.override;
		if (f.form) return "form";
		if (f.chart) return "chart";
		if (f.picture && f.decorative) return f.animated ? "motion" : "color";
		if (f.picture) return "image";
		if (f.svg) return "icon";
		if (f.link) return "link";
		if (f.typing || f.heading) return f.heading ? "type" : "copy";
		if (f.gradient || f.swatch) return "color";
		if (f.animated) return "motion";
		if (f.grid) return "grid";
		if (f.container || LAYOUT_TAGS.has(f.tag)) return "layout";
		return "review";
	}
	/** Reads a block's features from the DOM, once, as its task is made. */
	function blockFeatures(el, typing) {
		const cs = getComputedStyle(el);
		const tag = el.localName;
		const only = el.children.length === 1 && !(el.textContent ?? "").trim() ? el.children[0] : null;
		const bg = cs.backgroundImage ?? "";
		const ownText = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim());
		return {
			tag,
			override: el.getAttribute("data-swarm-role"),
			typing,
			heading: !!el.closest("h1, h2, h3, h4, h5, h6, [role=heading]"),
			svg: tag === "svg" || only?.localName === "svg" || /(^|[\s_-])icon($|[\s_-])/i.test(el.getAttribute("class") ?? ""),
			decorative: el.getAttribute("alt") === "" || el.getAttribute("aria-hidden") === "true" || el.getAttribute("role") === "presentation",
			swatch: el.children.length === 0 && !(el.textContent ?? "").trim() && !/^(transparent|rgba\(.*,\s*0\))$/.test(cs.backgroundColor ?? "transparent"),
			picture: [
				"img",
				"picture",
				"video"
			].includes(tag) || [
				"img",
				"picture",
				"video"
			].includes(only?.localName ?? "") || /url\(/.test(bg) && !ownText,
			gradient: /gradient\(/.test(bg) && !ownText,
			animated: !!cs.animationName && cs.animationName !== "none",
			link: tag === "a" || el.getAttribute("role") === "link" || only?.localName === "a",
			form: el.matches(CONTROLS) || !!only?.matches(CONTROLS),
			chart: el.matches(CHARTS) || !!only?.matches(CHARTS),
			grid: cs.display === "grid" || cs.display === "inline-grid" || tag === "article" || /card/i.test(el.getAttribute("class") ?? ""),
			container: el.children.length > 0
		};
	}
	/**
	* Which task an idle agent takes from `available` (in reading order): the first of its own
	* role; else the first whose role has no other free agent to take it (work stealing), or that
	* has no role. `canSteal` may hold a task back from stealing for now (its own agents may yet
	* come for it). An agent with no role takes the first. Undefined: it waits.
	*/
	function pickTask(available, role, freeRoles, canSteal = () => true) {
		if (!role) return available[0];
		return available.find((t) => t.role === role) ?? available.find((t) => !t.role || !freeRoles.has(t.role) && canSteal(t));
	}
	/**
	* `available` reordered for `pick: "nearest"`: blocks whose top is above `line` (in view) before
	* blocks below it (taken early by look-ahead); within each, by the distance from the cursor at
	* (`x`, `y`) to the block's top-left, plus `readingWeight` times its top (viewport px), so of two
	* blocks about as far away the higher one comes first and a block far down never jumps ahead of
	* the ones above it. Ties keep reading order.
	*/
	function byDistance(available, rectOf, x, y, line, readingWeight = .5) {
		const keyed = available.map((task, i) => {
			const r = rectOf(task);
			return {
				task,
				i,
				below: r.top > line ? 1 : 0,
				d: Math.hypot(r.left - x, r.top - y) + readingWeight * Math.max(0, r.top)
			};
		});
		keyed.sort((a, b) => a.below - b.below || a.d - b.d || a.i - b.i);
		return keyed.map((k) => k.task);
	}
	/**
	* `available` reordered for `pick: "urgent"`: the blocks about to leave the viewport first. While
	* the page scrolls down (`direction` 1), or before it has scrolled (0), by how close a block's top
	* is to the viewport's top; while it scrolls up (-1), by how close its bottom is to the viewport's
	* bottom (`viewportHeight`). Blocks within `band` (a share of the viewport height) of each other
	* count as equally urgent and go by the distance from the cursor at (`x`, `y`) to their top-left;
	* then reading order. A parent's top is above its children's (bottom below), so it comes first.
	*/
	function byUrgency(available, rectOf, x, y, viewportHeight, direction, band = .1) {
		const step = Math.max(1, viewportHeight * band);
		const keyed = available.map((task, i) => {
			const r = rectOf(task);
			const urgency = direction < 0 ? viewportHeight - r.bottom : r.top;
			return {
				task,
				i,
				bucket: Math.floor(urgency / step),
				d: Math.hypot(r.left - x, r.top - y)
			};
		});
		keyed.sort((a, b) => a.bucket - b.bucket || a.d - b.d || a.i - b.i);
		return keyed.map((k) => k.task);
	}
	/** `pick: "urgent"`: the share of the viewport height, at the edge the scroll leaves by, that is the exit band. */
	const EXIT_BAND = .25;
	/**
	* `pick: "urgent"`: true when a block is in the exit band, the `share` of the viewport nearest
	* the edge the page scrolls away from: while it scrolls down (`direction` 1), or before it has
	* scrolled (0), its top is in the top band; while it scrolls up (-1), its bottom is in the bottom
	* band. Any free agent takes such a block at once, whatever its role.
	*/
	function inExitBand(rect, viewportHeight, direction, share = EXIT_BAND) {
		return direction < 0 ? rect.bottom > viewportHeight * (1 - share) : rect.top < viewportHeight * share;
	}
	// runtime-src/agents.ts
	/**
	* Twelve agents named after what they build (`layout-agent`, `type-agent`, ...), one per role.
	* Kept for existing callers; their name tags show the short form (`layout`, `type`; see
	* agentLabel). With roles in use the swarm now sizes its own cast by default (`agents: "auto"`).
	*/
	const AGENT_NAMES = ROLES.map((role) => `${role}-agent`);
	/** How many agents `agents: "auto"` runs, at most (never more than there are blocks). */
	const AUTO_HEADCOUNT = 12;
	const COLORS = [
		{
			color: "var(--color-champagne)",
			text: "var(--color-ink)"
		},
		{
			color: "var(--color-platinum)",
			text: "var(--color-ink)"
		},
		{
			color: "var(--color-rose-gold)",
			text: "var(--color-ink)"
		},
		{
			color: "var(--color-bronze)",
			text: "var(--color-ink)"
		},
		{
			color: "var(--color-gunmetal)",
			text: "var(--color-pearl)"
		},
		{
			color: "var(--color-pearl)",
			text: "var(--color-ink)"
		}
	];
	/** The six default agents: the first six roles. Colours are theme tokens; the renderer resolves them. */
	const DEFAULT_AGENTS = ROLES.slice(0, 6).map((role, i) => ({
		name: `${role}-agent`,
		role,
		...COLORS[i]
	}));
	/** An agent's name tag: `type-agent` shows as `type`; any other name as it is. */
	function agentLabel(name) {
		const match = /^([a-z]+)-agent$/.exec(name);
		return match && ROLES.includes(match[1]) ? match[1] : name;
	}
	/**
	* Seats per role for `total` agents, in proportion to how many blocks each role has (largest
	* remainder; ties go to the role first in ROLES). A role with no blocks gets none; every role
	* that has blocks gets at least one while `total` allows, taken from the role most over its quota.
	*/
	function allocateHeadcount(histogram, total = 12) {
		const present = ROLES.filter((r) => (histogram[r] ?? 0) > 0);
		const blocks = present.reduce((sum, r) => sum + histogram[r], 0);
		const seats = /* @__PURE__ */ new Map();
		if (!blocks || total <= 0) return seats;
		const quota = new Map(present.map((r) => [r, total * histogram[r] / blocks]));
		for (const r of present) seats.set(r, Math.floor(quota.get(r)));
		let left = total - [...seats.values()].reduce((a, b) => a + b, 0);
		const byRemainder = [...present].sort((a, b) => {
			const fa = quota.get(a) % 1;
			return quota.get(b) % 1 - fa || ROLES.indexOf(a) - ROLES.indexOf(b);
		});
		for (const r of byRemainder) {
			if (left <= 0) break;
			seats.set(r, seats.get(r) + 1);
			left--;
		}
		for (const r of present) {
			if (seats.get(r) > 0) continue;
			let donor;
			for (const d of present) {
				if (seats.get(d) < 2) continue;
				const over = seats.get(d) - quota.get(d);
				if (!donor || over > seats.get(donor) - quota.get(donor)) donor = d;
			}
			if (!donor) break;
			seats.set(donor, seats.get(donor) - 1);
			seats.set(r, 1);
		}
		for (const r of present) if (!seats.get(r)) seats.delete(r);
		return seats;
	}
	/**
	* The cast for `agents: "auto"`: `total` agents split over the roles of `roles` (one entry per
	* block) by allocateHeadcount. Named after their role, numbered within it when it has more than
	* one (`type-1` … `type-4`, `layout`), and ordered round-robin from the busiest role, so the first
	* cursors in cover different roles. Colours cycle through the defaults; the palette replaces them.
	*/
	function autoAgents(roles, total = 12) {
		const histogram = {};
		for (const r of roles) if (r) histogram[r] = (histogram[r] ?? 0) + 1;
		const seats = allocateHeadcount(histogram, Math.min(total, roles.length));
		const order = [...seats.keys()].sort((a, b) => histogram[b] - histogram[a] || ROLES.indexOf(a) - ROLES.indexOf(b));
		const agents = [];
		for (let round = 0; agents.length < [...seats.values()].reduce((a, b) => a + b, 0); round++) for (const role of order) {
			const n = seats.get(role);
			if (round >= n) continue;
			const i = agents.length;
			agents.push({
				name: n > 1 ? `${role}-${round + 1}` : role,
				role,
				...COLORS[i % COLORS.length]
			});
		}
		return agents;
	}
	// runtime-src/theme-fallback.ts
	/**
	* The swarm palette, used only when a theme token cannot be read from the page (for example
	* before the stylesheet loads). Existing page tokens take precedence.
	*/
	const THEME_FALLBACK = {
		"--color-champagne": "#E8D3A2",
		"--color-platinum": "#D9DDE3",
		"--color-rose-gold": "#D8A39D",
		"--color-bronze": "#B08D57",
		"--color-gunmetal": "#4A4E57",
		"--color-pearl": "#F3EFE7",
		"--color-ink": "#0B0B0D"
	};
	/** The gold every band, caret and hairline is tinted with. */
	const GOLD_TOKEN = "var(--color-champagne)";
	// runtime-src/render/colors.ts
	const TOKEN = /^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)$/;
	/** Parses `rgb()`/`rgba()` and six-digit hex, the forms computed colours and the fallbacks use. */
	function parseColor(value) {
		const v = value.trim();
		const rgb = v.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/);
		if (rgb) return [
			Number(rgb[1]) / 255,
			Number(rgb[2]) / 255,
			Number(rgb[3]) / 255
		];
		const hex = v.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
		if (hex) return [
			parseInt(hex[1], 16) / 255,
			parseInt(hex[2], 16) / 255,
			parseInt(hex[3], 16) / 255
		];
		return null;
	}
	/** Any CSS colour to RGB through a 1×1 2D canvas, for forms like oklch() that parseColor skips. */
	function paint(value) {
		const ctx = document.createElement("canvas").getContext("2d");
		if (!ctx) return null;
		ctx.fillStyle = value;
		ctx.fillRect(0, 0, 1, 1);
		const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
		return a ? [
			r / 255,
			g / 255,
			b / 255
		] : null;
	}
	/**
	* Resolves colour strings, theme tokens like `var(--color-champagne)` included, to RGB at
	* runtime: through the computed style of a probe element, or THEME_FALLBACK when the page does
	* not define the token. Results are cached; the probe never stays in the document.
	*/
	function createColorResolver() {
		const cache = /* @__PURE__ */ new Map();
		const champagne = parseColor(THEME_FALLBACK["--color-champagne"]);
		const viaProbe = (css) => {
			const probe = document.createElement("span");
			probe.style.display = "none";
			probe.style.color = css;
			document.body.appendChild(probe);
			const computed = getComputedStyle(probe).color;
			probe.remove();
			return parseColor(computed) ?? paint(computed);
		};
		const resolve = (css) => {
			const token = css.trim().match(TOKEN);
			if (token) {
				const [, name, fallback] = token;
				const defined = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
				if (!defined) {
					const known = THEME_FALLBACK[name] ?? fallback;
					return known && (parseColor(known) ?? resolve(known)) || champagne;
				}
				return viaProbe(css) ?? parseColor(defined) ?? paint(defined) ?? parseColor(THEME_FALLBACK[name] ?? "") ?? champagne;
			}
			return parseColor(css) ?? viaProbe(css) ?? paint(css) ?? champagne;
		};
		return (css) => {
			let rgb = cache.get(css);
			if (!rgb) {
				rgb = resolve(css);
				cache.set(css, rgb);
			}
			return rgb;
		};
	}
	// runtime-src/palette.ts
	/**
	* The swarm's colours. The effects keep their metallic shading; their colours come from the host
	* page: an explicit `palette` option, or `extractPalette()` reading the page's own accents.
	*/
	const AGENT_COUNT = 6;
	/** Below this HSL chroma a colour counts as a grey. */
	const MIN_CHROMA = .16;
	/** Hues closer than this (degrees) are one colour. */
	const HUE_MERGE = 20;
	/** Greys closer than this in lightness are one colour. */
	const GREY_MERGE = .1;
	/** WCAG 2.x minimum for graphical objects against the page background. */
	const MIN_CONTRAST = 3;
	/** Elements read per selector group, so a long page stays cheap. */
	const MAX_PER_GROUP = 300;
	/** Custom properties read from :root. */
	const MAX_VARS = 300;
	/** Where the page keeps its accents, with how much each sighting counts. */
	const GROUPS = [
		{
			selector: "button, [role=button], input[type=submit], input[type=button], [class*=btn], [class*=button], [class*=cta]",
			weight: 3,
			props: [
				"backgroundColor",
				"backgroundImage",
				"borderTopColor",
				"color"
			]
		},
		{
			selector: "a[href]",
			weight: 1,
			props: ["color"]
		},
		{
			selector: "h1, h2, h3, h4",
			weight: 1,
			props: ["color"]
		},
		{
			selector: ":is(h1, h2, h3, h4) :is(span, em, strong, mark, i, b)",
			weight: 2,
			props: [
				"color",
				"backgroundColor",
				"backgroundImage"
			]
		},
		{
			selector: "mark, hr, [class*=badge], [class*=tag], [class*=chip], [class*=pill], [class*=label], [class*=accent], [class*=primary], [class*=brand]",
			weight: 2,
			props: [
				"backgroundColor",
				"backgroundImage",
				"borderTopColor",
				"color"
			]
		}
	];
	const clamp01 = (v) => Math.min(1, Math.max(0, v));
	function hexToRgb(hex) {
		const m = hex.match(/^#([0-9a-f]{3,8})$/i);
		if (!m || ![
			3,
			4,
			6,
			8
		].includes(m[1].length)) return null;
		const s = m[1].length <= 4 ? [...m[1]].map((c) => c + c).join("") : m[1];
		if (s.length === 8 && parseInt(s.slice(6, 8), 16) < 128) return null;
		return [
			parseInt(s.slice(0, 2), 16) / 255,
			parseInt(s.slice(2, 4), 16) / 255,
			parseInt(s.slice(4, 6), 16) / 255
		];
	}
	function hslToRgb({ h, s, l }) {
		const c = (1 - Math.abs(2 * l - 1)) * s;
		const hp = (h % 360 + 360) % 360 / 60;
		const x = c * (1 - Math.abs(hp % 2 - 1));
		const [r, g, b] = hp < 1 ? [
			c,
			x,
			0
		] : hp < 2 ? [
			x,
			c,
			0
		] : hp < 3 ? [
			0,
			c,
			x
		] : hp < 4 ? [
			0,
			x,
			c
		] : hp < 5 ? [
			x,
			0,
			c
		] : [
			c,
			0,
			x
		];
		const m = l - c / 2;
		return [
			clamp01(r + m),
			clamp01(g + m),
			clamp01(b + m)
		];
	}
	function rgbToHsl([r, g, b]) {
		const max = Math.max(r, g, b);
		const min = Math.min(r, g, b);
		const l = (max + min) / 2;
		const d = max - min;
		if (d === 0) return {
			h: 0,
			s: 0,
			l
		};
		const s = d / (1 - Math.abs(2 * l - 1));
		return {
			h: ((max === r ? (g - b) / d % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60 + 360) % 360,
			s: clamp01(s),
			l
		};
	}
	/**
	* One opaque colour from a CSS colour string: rgb()/rgba(), hsl()/hsla() and hex. Transparent
	* and mostly transparent colours are null, so `transparent` backgrounds never count.
	*/
	function readColor(value) {
		const v = value.trim().toLowerCase();
		if (!v || v === "transparent" || v === "none") return null;
		if (v.startsWith("#")) return hexToRgb(v);
		const alpha = v.match(/^(?:rgb|hsl)a?\([^)]*?[,/]\s*([\d.]+)(%?)\s*\)$/);
		if (alpha && (v.match(/[\d.]+%?/g)?.length ?? 0) >= 4) {
			if (Number(alpha[1]) / (alpha[2] ? 100 : 1) < .5) return null;
		}
		const hsl = v.match(/^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%/);
		if (hsl) return hslToRgb({
			h: Number(hsl[1]),
			s: Number(hsl[2]) / 100,
			l: Number(hsl[3]) / 100
		});
		return parseColor(v);
	}
	/** Every colour inside a gradient or other `background-image`. */
	function colorsIn(image) {
		if (!image || image === "none") return [];
		return (image.match(/rgba?\([^)]*\)|hsla?\([^)]*\)|#[0-9a-f]{3,8}\b/gi) ?? []).map(readColor).filter((c) => c !== null);
	}
	const chroma = ({ s, l }) => (1 - Math.abs(2 * l - 1)) * s;
	const hueDistance = (a, b) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
	const isChromatic = (c) => chroma(c) >= MIN_CHROMA && c.l >= .12 && c.l <= .92;
	function luminance([r, g, b]) {
		const lin = (v) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
		return .2126 * lin(r) + .7152 * lin(g) + .0722 * lin(b);
	}
	function contrast(a, b) {
		const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
		return (hi + .05) / (lo + .05);
	}
	/** Moves a colour's lightness away from the background until it reaches MIN_CONTRAST. */
	function ensureContrast(c, bg) {
		const darker = luminance(bg) > .4;
		let out = c;
		for (let i = 0; i < 40 && contrast(hslToRgb(out), bg) < MIN_CONTRAST; i++) out = {
			...out,
			l: clamp01(out.l + (darker ? -.02 : .02))
		};
		return out;
	}
	const css = ([r, g, b]) => `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
	/** The page's background: body's, else html's, else white. */
	function backgroundOf(doc) {
		const view = doc.defaultView ?? window;
		for (const el of [doc.body, doc.documentElement]) {
			if (!el) continue;
			const bg = readColor(view.getComputedStyle(el).backgroundColor);
			if (bg) return bg;
		}
		return [
			1,
			1,
			1
		];
	}
	/** Custom properties declared on :root or html, from the stylesheets and the computed style. */
	function rootVariables(doc) {
		const names = /* @__PURE__ */ new Set();
		const addFrom = (style) => {
			for (let i = 0; i < style.length && names.size < MAX_VARS; i++) if (style[i].startsWith("--")) names.add(style[i]);
		};
		for (const sheet of [...doc.styleSheets]) {
			let rules;
			try {
				rules = sheet.cssRules;
			} catch {
				continue;
			}
			for (const rule of [...rules]) {
				if (!("selectorText" in rule) || !("style" in rule)) continue;
				const selector = String(rule.selectorText);
				if (/(^|,)\s*(:root|html)\s*(,|$)/.test(selector)) addFrom(rule.style);
			}
		}
		addFrom((doc.defaultView ?? window).getComputedStyle(doc.documentElement));
		return [...names].sort();
	}
	const ownText = (node) => [...node.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim());
	function collect(doc) {
		const view = doc.defaultView ?? window;
		const samples = /* @__PURE__ */ new Map();
		let order = 0;
		const add = (rgb, weight) => {
			if (!rgb) return;
			const key = css(rgb);
			const known = samples.get(key);
			if (known) known.weight += weight;
			else samples.set(key, {
				rgb,
				weight,
				first: order++
			});
		};
		const viewportArea = Math.max(1, view.innerWidth * view.innerHeight);
		for (const { selector, weight, props } of GROUPS) {
			const nodes = [...doc.querySelectorAll(selector)].slice(0, MAX_PER_GROUP);
			for (const node of nodes) {
				const style = view.getComputedStyle(node);
				if (style.display === "none" || style.visibility === "hidden") continue;
				const rect = node.getBoundingClientRect();
				const small = rect.width * rect.height <= viewportArea / 4;
				for (const prop of props) if (prop === "color") {
					if (ownText(node)) add(readColor(style.color), weight);
				} else if (prop === "backgroundColor") {
					if (small) add(readColor(style.backgroundColor), weight);
				} else if (prop === "backgroundImage") {
					if (small) colorsIn(style.backgroundImage).forEach((c) => add(c, weight));
				} else if (style.borderTopStyle !== "none" && parseFloat(style.borderTopWidth) > 0) add(readColor(style.borderTopColor), weight);
			}
		}
		const rootStyle = view.getComputedStyle(doc.documentElement);
		for (const name of rootVariables(doc)) add(readColor(rootStyle.getPropertyValue(name)), 2);
		return [...samples.values()].sort((a, b) => b.weight - a.weight || a.first - b.first);
	}
	/** Merges colours of one hue (greys: of one lightness); each cluster keeps its heaviest colour. */
	function cluster(samples, grey) {
		const clusters = [];
		for (const s of samples) {
			const near = clusters.find((c) => grey ? Math.abs(c.hsl.l - s.hsl.l) < GREY_MERGE : hueDistance(c.hsl.h, s.hsl.h) < HUE_MERGE);
			if (near) near.weight += s.weight;
			else clusters.push({ ...s });
		}
		return clusters.sort((a, b) => b.weight - a.weight);
	}
	/** Fills up to six colours: hue shifts of the page's own (lightness steps for greys). */
	function expand(base, grey) {
		const out = base.slice(0, AGENT_COUNT);
		const distinct = (c) => out.every((o) => grey ? Math.abs(o.l - c.l) >= GREY_MERGE : hueDistance(o.h, c.h) >= HUE_MERGE);
		const shifts = grey ? [
			.15,
			-.15,
			.3,
			-.3,
			.45,
			-.45
		] : [
			30,
			-30,
			60,
			-60,
			-90,
			90,
			-120,
			120,
			150,
			180
		];
		for (const shift of shifts) for (const b of base) {
			if (out.length >= AGENT_COUNT) return out;
			const next = grey ? {
				...b,
				l: clamp01(b.l + shift)
			} : {
				...b,
				h: (b.h + shift + 360) % 360
			};
			if (distinct(next)) out.push(next);
		}
		for (let i = 0; out.length < AGENT_COUNT; i++) out.push(out[i % out.length]);
		return out;
	}
	/** The metallic defaults: what the swarm shows when the page gives nothing to work with. */
	const FALLBACK_PALETTE = {
		agents: DEFAULT_AGENTS.map((a) => a.color),
		accent: GOLD_TOKEN,
		source: "fallback"
	};
	/**
	* Reads the page's own accent colours: links, buttons, heading accents, small badges and
	* borders, and colour custom properties on :root. Greys, near-white and near-black count only
	* when the page has no other colour. Colours of one hue are merged; each is moved in lightness
	* until it stands out against the page background. Gives six cursor colours (hue shifts of the
	* page's own when it has fewer) and the accent, the most frequent saturated colour. The same DOM
	* gives the same palette. FALLBACK_PALETTE when the page has no usable colour.
	*/
	function extractPalette(doc = document) {
		if (!doc.documentElement) return FALLBACK_PALETTE;
		const samples = collect(doc).map((s) => ({
			hsl: rgbToHsl(s.rgb),
			weight: s.weight
		}));
		const chromatic = samples.filter((s) => isChromatic(s.hsl));
		const grey = chromatic.length === 0;
		const pool = grey ? samples : chromatic;
		if (!pool.length) return FALLBACK_PALETTE;
		const bg = backgroundOf(doc);
		const agents = expand(cluster(pool, grey).map((c) => c.hsl), grey).map((c) => css(hslToRgb(ensureContrast(c, bg))));
		return {
			agents,
			accent: agents[0],
			source: "page"
		};
	}
	/** Label text that reads on a pill of this colour. */
	function textOn(rgb) {
		return luminance(rgb) > .36 ? "var(--color-ink)" : "var(--color-pearl)";
	}
	/**
	* The cursors and the accent for one swarm. `palette.agents` recolours the agents (named by
	* `agents` or the defaults), cycling when it is shorter; a palette without `accent` uses its
	* first agent colour. Without `palette`, explicit `agents` keep their colours and the rest comes
	* from extractPalette().
	*/
	function resolvePalette(options, doc = document, cast = DEFAULT_AGENTS) {
		const named = options.agents?.length ? options.agents : cast;
		const explicit = options.palette;
		const auto = explicit ? null : extractPalette(doc);
		const colors = explicit?.agents?.length ? explicit.agents : !options.agents?.length && auto?.source === "page" ? auto.agents : null;
		const accent = explicit ? explicit.accent ?? explicit.agents?.[0] ?? "var(--color-champagne)" : auto.accent;
		if (!colors) return {
			agents: named,
			accent
		};
		const resolve = createColorResolver();
		return {
			agents: named.map((agent, i) => {
				const color = colors[i % colors.length];
				return {
					...agent,
					color,
					text: textOn(resolve(color))
				};
			}),
			accent
		};
	}
	// runtime-src/render/shaders/quad.ts
	/**
	* Shared vertex stage: a unit quad placed at `uRect` (x, y, width, height in CSS pixels).
	* `vLocal` is the fragment's offset from the rect's top-left, in CSS pixels.
	*/
	const QUAD_VS = `#version 300 es
layout(location = 0) in vec2 aPos;
uniform vec4 uRect;
uniform vec2 uViewport;
out vec2 vLocal;
void main() {
  vLocal = aPos * uRect.zw;
  vec2 clip = (uRect.xy + vLocal) / uViewport * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}
`;
	/**
	* Every fragment shader's only output: a valid premultiplied colour (rgb <= a). The overlay
	* canvas is composited normally (premultiplied source-over), so the marks must read on light
	* pages as well as dark: metal bodies with a dark hairline and a soft shadow under them.
	*
	* `over` stacks two premultiplied layers; `metal` shades a colour as polished metal along t in
	* 0..1 (bright top, a horizon line at the middle, a darker lower half lifting again at the bottom);
	* `inkOf` is the dark hairline tinted towards a colour.
	*/
	const PREMUL = `
vec4 premul(vec3 color, float a) {
  a = clamp(a, 0.0, 1.0);
  return vec4(clamp(color, 0.0, 1.0) * a, a);
}
vec4 over(vec4 top, vec4 bottom) {
  return top + bottom * (1.0 - top.a);
}
vec3 metal(vec3 c, float t) {
  vec3 hi = mix(c, vec3(1.0), 0.65);
  vec3 lo = c * 0.62;
  float h = smoothstep(0.44, 0.56, t);
  vec3 top = mix(hi, c, smoothstep(0.0, 0.5, t));
  vec3 bottom = mix(lo, mix(c, hi, 0.3), smoothstep(0.5, 1.0, t));
  return mix(top, bottom, h);
}
vec3 inkOf(vec3 c) {
  return mix(vec3(0.06, 0.055, 0.05), c * 0.35, 0.35);
}
float mhash(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}
float mnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(mhash(i), mhash(i + vec2(1.0, 0.0)), u.x), mix(mhash(i + vec2(0.0, 1.0)), mhash(i + 1.0), u.x), u.y);
}
// Brushed metal: fine hairline streaks along \`axis\` (unit), 0..1. Stretched value noise: high
// frequency across the axis, almost none along it.
float brushed(vec2 p, vec2 axis) {
  vec2 q = vec2(dot(p, vec2(-axis.y, axis.x)), dot(p, axis));
  return 0.6 * mnoise(vec2(q.x * 2.3, q.y * 0.06)) + 0.4 * mnoise(vec2(q.x * 5.1 + 3.0, q.y * 0.11));
}
// A soft studio environment along t in 0..1 (top to bottom): a bright softbox near the top, a dark
// band, a lit floor, so a surface reads as a reflection rather than a flat gradient.
float studio(float t) {
  float box = smoothstep(0.08, 0.2, t) * (1.0 - smoothstep(0.32, 0.44, t));
  float floor_ = smoothstep(0.62, 0.95, t) * 0.55;
  return 0.18 + 0.82 * box + floor_;
}
// A machined metal surface in colour c: studio reflection along t, brushed streaks along axis,
// a bevel from the shape's signed distance d (< 0 inside) and its outward normal n (bright
// upper-left chamfer, dark lower-right), a sharp specular band at s (0 = on it, \`gain\` bright)
// and a Fresnel rim.
vec3 metalSurface(vec3 c, vec2 p, float t, vec2 axis, float d, vec2 n, float bevel, float s, float gain) {
  float edge = 1.0 - smoothstep(0.0, bevel, -d);
  float lit = dot(n, normalize(vec2(-0.62, -0.78)));
  float env = studio(clamp(t - 0.18 * lit * edge, 0.0, 1.0));
  vec3 col = c * (0.42 + 0.7 * env) + vec3(1.0) * 0.38 * pow(env, 4.0);
  col *= 0.86 + 0.28 * brushed(p, axis);
  col = mix(col, mix(c, vec3(1.0), 0.85), edge * max(lit, 0.0) * 0.9);
  col = mix(col, c * 0.22, edge * max(-lit, 0.0) * 0.75);
  col += vec3(1.0, 0.99, 0.96) * gain * exp(-s * s);
  col += vec3(1.0) * 0.12 * edge;
  return clamp(col, 0.0, 1.0);
}
`;
	/** Signed distance to a rounded box centred on the origin. */
	const SD_ROUND_BOX = `
float sdRoundBox(vec2 p, vec2 halfSize, float r) {
  r = min(r, min(halfSize.x, halfSize.y));
  vec2 q = abs(p) - halfSize + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
`;
	/**
	* Option D's reveal glow (plan §3.3): a polished metal line at the sweep front from
	* sweepFront(rect, e), with a specular sweep travelling along it and a slight chromatic sheen at
	* its edges, a thin dark shadow line just under it so it reads on white, a subtle warm glow
	* above it and faint gold noise drifting through the strip being revealed. Composited normally
	* over the page; the side overhang fades in softly.
	*/
	const BAND_FS = `#version 300 es
precision highp float;
in vec2 vLocal;
uniform vec4 uRect;
uniform float uFront;
uniform float uTop;
uniform float uE;
uniform float uTime;
uniform vec3 uColor;
uniform vec3 uGold;
out vec4 fragColor;
${PREMUL}

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + 1.0), u.x), u.y);
}
float fbm(vec2 p) {
  return 0.55 * noise(p) + 0.3 * noise(p * 2.03 + 7.1) + 0.15 * noise(p * 4.1 + 3.7);
}

void main() {
  vec2 p = uRect.xy + vLocal;
  if (p.y < uTop) discard;
  float dy = uFront - p.y;
  float side = smoothstep(0.0, 40.0, p.x - uRect.x) * smoothstep(0.0, 40.0, uRect.x + uRect.z - p.x);
  float fade = (1.0 - smoothstep(0.82, 1.0, uE)) * side;
  vec3 gold = mix(uColor, uGold, 0.75);
  float line = 1.0 - smoothstep(0.55, 1.05, abs(dy));
  float shade = exp(-pow(dy + 1.7, 2.0) / 0.45) * 0.38;
  float glow = dy >= 0.0 ? exp(-dy / 10.0) * 0.12 : 0.0;
  float strip = clamp(dy / ${56 .toFixed(1)}, 0.0, 1.0);
  float n = fbm(vec2(p.x * 0.03, p.y * 0.05 - uTime * 0.6));
  float shimmer = step(0.0, dy) * (1.0 - strip) * (1.0 - strip) * smoothstep(0.45, 0.85, n) * 0.12;
  // The line is a polished rod: lit on its upper half, dark under it, with a hot specular core.
  float across = clamp(dy * 0.5 + 0.5, 0.0, 1.0);
  vec3 rod = gold * (0.45 + 0.75 * studio(1.0 - across)) + vec3(1.0) * 0.25 * pow(studio(1.0 - across), 4.0);
  float w = uRect.z;
  float pos = mod(uTime * 520.0, w + 400.0) - 200.0;
  float sweep = exp(-pow((p.x - uRect.x - pos) / 70.0, 2.0));
  float glint = pow(max(0.0, sin(p.x * 0.031 - uTime * 3.5)), 24.0) * 0.5;
  vec3 hot = vec3(1.0, 0.99, 0.95);
  // Chromatic sheen: warm just above the core, cool just below, only where the sweep is.
  vec3 sheen = mix(vec3(1.0, 0.82, 0.55), vec3(0.6, 0.85, 1.0), smoothstep(-0.8, 0.8, -dy));
  vec3 edge = mix(rod, hot, clamp(sweep + glint, 0.0, 1.0) * 0.9);
  edge = mix(edge, sheen, sweep * 0.25 * (1.0 - smoothstep(0.0, 0.6, abs(abs(dy) - 0.7))));
  float lineA = line * (0.9 + 0.1 * sweep);
  float halo = exp(-pow(dy / 2.2, 2.0)) * sweep * 0.35;
  vec4 o = over(premul(edge, lineA), over(premul(hot, halo), over(premul(gold * 0.8, glow + shimmer), premul(inkOf(gold), shade))));
  fragColor = premul(o.rgb / max(o.a, 1e-4), o.a * fade);
}
`;
	// runtime-src/render/shaders/box.ts
	/**
	* The drag box (swarm-build.js:257-272): a thin polished metal wire in the agent's colour warmed
	* towards gold, with a specular glint travelling along its length, a faint dark under-stroke
	* offset down and right so it reads on white, and a barely-there fill, inside the border radius.
	* The line, its under-stroke and the glint are `uLine` (the scale) times as wide.
	*/
	const BOX_FS = `#version 300 es
precision highp float;
in vec2 vLocal;
uniform vec4 uRect;
uniform vec2 uSize;
uniform float uRadius;
uniform vec3 uColor;
uniform vec3 uGold;
uniform float uOpacity;
uniform float uTime;
uniform float uLine;
out vec4 fragColor;
${SD_ROUND_BOX}${PREMUL}
void main() {
  vec2 q = vLocal - uRect.zw * 0.5;
  float d = sdRoundBox(q, uSize * 0.5, uRadius);
  float inside = 1.0 - smoothstep(-0.5, 0.5, d);
  float hair = inside * smoothstep(-0.5 - uLine, -0.5, d);
  float du = sdRoundBox(q - vec2(0.6, 1.0) * uLine, uSize * 0.5, uRadius);
  float under = (1.0 - smoothstep(-0.5, 0.5, du)) * smoothstep(-0.6 - uLine, -0.6, du) * 0.32;
  vec3 c = mix(uColor, uGold, 0.45);
  vec2 n = (q + uSize * 0.5) / max(uSize, vec2(1.0));
  // Polished wire: a hard studio reflection by side (top and left catch the light), and a glint
  // running around the perimeter.
  float side = abs(q.x / max(uSize.x, 1.0)) > abs(q.y / max(uSize.y, 1.0)) ? (q.x < 0.0 ? 0.15 : 0.75) : (q.y < 0.0 ? 0.12 : 0.85);
  vec3 line = c * (0.45 + 0.7 * studio(side)) + vec3(1.0) * 0.3 * pow(studio(side), 4.0);
  float per = 2.0 * (uSize.x + uSize.y);
  float u = atan(q.y * uSize.x, q.x * uSize.y) / 6.2831 + 0.5;
  float g = fract(u - uTime * 0.35);
  float glint = exp(-pow(min(g, 1.0 - g) * per / (18.0 * uLine), 2.0));
  line = mix(line, vec3(1.0, 0.99, 0.95), glint * 0.85);
  vec4 o = over(premul(line, hair * (0.85 + 0.15 * glint)), over(premul(inkOf(c), under), premul(c, 0.07 * inside)));
  fragColor = premul(o.rgb / max(o.a, 1e-4), o.a * uOpacity);
}
`;
	/**
	* A machined-metal pill with text from the text atlas: the agent's name tag
	* (swarm-build.js:188-201) and the "W × H" badge (swarm-build.js:275-291). Brushed along its
	* length, reflecting a studio light, bevelled (bright upper-left, dark lower-right), with a slow
	* specular glint, a dark hairline edge and a soft drop shadow. The pill (uSize) sits uPad
	* (PILL_PAD at the scale) inside the quad; the hairline, bevel, shadow, brushing and glint grow
	* with uScale. The text is white in the atlas and tinted here.
	*/
	const LABEL_FS = `#version 300 es
precision highp float;
in vec2 vLocal;
uniform vec4 uRect;
uniform vec2 uSize;
uniform float uRadius;
uniform vec3 uColor;
uniform vec3 uTextColor;
uniform float uOpacity;
uniform sampler2D uAtlas;
uniform vec4 uUV;
uniform vec4 uText;
uniform float uHasText;
uniform float uTime;
uniform float uScale;
uniform float uPad;
out vec4 fragColor;
${SD_ROUND_BOX}${PREMUL}
void main() {
  vec2 local = vLocal - vec2(uPad);
  vec2 half_ = uSize * 0.5;
  float d = sdRoundBox(local - half_, half_, uRadius);
  float cover = 1.0 - smoothstep(-0.5, 0.5, d);
  float rim = cover * smoothstep(-0.5 - uScale, -0.5, d);
  float ds = sdRoundBox(local - half_ - vec2(0.0, 1.2 * uScale), half_, uRadius);
  float shadow = (1.0 - smoothstep(-1.0 * uScale, 2.5 * uScale, ds)) * 0.24;
  vec2 grad = vec2(dFdx(d), dFdy(d));
  vec2 n = length(grad) > 1e-5 ? normalize(grad) : vec2(0.0, -1.0);
  float s = (local.x - mod(uTime * 40.0 * uScale + uRect.x * 3.0, uSize.x + 160.0 * uScale) + 40.0 * uScale + (local.y - half_.y) * 0.6) / (5.0 * uScale);
  vec3 col = metalSurface(uColor, local * 2.0 / uScale, clamp(local.y / uSize.y, 0.0, 1.0), vec2(1.0, 0.0), d, n, 2.2 * uScale, s, 0.32);
  col = mix(col, inkOf(uColor), rim * 0.55);
  vec2 t = (local - uText.xy) / uText.zw;
  if (uHasText > 0.5 && all(greaterThanEqual(t, vec2(0.0))) && all(lessThanEqual(t, vec2(1.0)))) {
    float ink = texture(uAtlas, mix(uUV.xy, uUV.zw, t)).a;
    col = mix(col, uTextColor, ink);
  }
  vec4 o = over(premul(col, cover), premul(vec3(0.0), shadow));
  fragColor = premul(o.rgb / max(o.a, 1e-4), o.a * uOpacity);
}
`;
	/**
	* A typing block's caret: a 2px polished metal-gold bar (lit left face, dark right face, a
	* specular glint running down it) with a dark hairline shadow beside it and a pulsing four-point
	* glint at its top.
	*/
	const CARET_FS = `#version 300 es
precision highp float;
in vec2 vLocal;
uniform vec4 uRect;
uniform vec3 uGold;
uniform float uTime;
out vec4 fragColor;
${PREMUL}

void main() {
  vec2 p = vLocal - vec2(${10 .toFixed(1)});
  float h = uRect.w - ${20 .toFixed(1)};
  float span = step(0.0, p.y) * step(p.y, h);
  float bar = (1.0 - smoothstep(0.75, 1.5, abs(p.x))) * span;
  float shade = (1.0 - smoothstep(0.4, 1.0, abs(p.x - 1.8))) * span * 0.35;
  vec2 g = p - vec2(0.0, 1.0);
  float pulse = 0.7 + 0.3 * sin(uTime * 6.0);
  float star = (exp(-abs(g.x) * 1.4) * exp(-abs(g.y) * 0.35) + exp(-abs(g.y) * 1.4) * exp(-abs(g.x) * 0.35)) * pulse;
  float face = clamp(p.x * 0.5 + 0.5, 0.0, 1.0);
  vec3 gold = uGold * (0.45 + 0.75 * studio(0.15 + face * 0.7)) + vec3(1.0) * 0.3 * pow(studio(0.15 + face * 0.7), 4.0);
  float run = mod(uTime * 1.6, 1.6) * h - 0.3 * h;
  gold = mix(gold, vec3(1.0, 0.99, 0.95), exp(-pow((p.y - run) / 3.0, 2.0)) * 0.85);
  vec4 o = over(premul(mix(uGold, vec3(1.0), 0.5), star * 0.6), over(premul(gold * 0.85, bar), premul(inkOf(uGold), shade)));
  fragColor = premul(o.rgb / max(o.a, 1e-4), o.a);
}
`;
	const CURSOR_BOX = {
		width: 22,
		height: 26
	};
	/** Where the arrow's tip sits, in arrow units from the cursor's anchor. */
	const CURSOR_TIP = {
		x: 1.5,
		y: 1.5
	};
	/**
	* A machined-metal arrow for light and dark pages alike, from the signed distance field of the
	* original path: a brushed body in the agent's colour reflecting a studio light, bevelled edges
	* (bright upper-left, dark lower-right), a Fresnel rim, a dark hairline and a soft drop shadow.
	* A sharp specular band sits across the direction of travel and slides forward with speed.
	*/
	const CURSOR_FS = `#version 300 es
precision highp float;
in vec2 vLocal;
uniform float uScale;
uniform vec3 uColor;
uniform float uTime;
uniform vec2 uDir;
out vec4 fragColor;
${PREMUL}

const int N = 7;
const vec2 P[7] = vec2[7](
  vec2(1.5, 1.5), vec2(1.5, 16.5), vec2(5.5, 12.5), vec2(8.5, 18.7),
  vec2(11.1, 17.5), vec2(8.1, 11.4), vec2(13.7, 11.4)
);

float sdArrow(vec2 p) {
  float d = dot(p - P[0], p - P[0]);
  float s = 1.0;
  int j = N - 1;
  for (int i = 0; i < N; i++) {
    vec2 e = P[j] - P[i];
    vec2 w = p - P[i];
    vec2 b = w - e * clamp(dot(w, e) / dot(e, e), 0.0, 1.0);
    d = min(d, dot(b, b));
    bvec3 c = bvec3(p.y >= P[i].y, p.y < P[j].y, e.x * w.y > e.y * w.x);
    if (all(c) || all(not(c))) s = -s;
    j = i;
  }
  return s * sqrt(d);
}

void main() {
  vec2 p = vLocal / uScale - ${3 .toFixed(1)};
  float d = sdArrow(p);
  float aa = max(fwidth(d), 1e-3);
  float outer = 1.0 - smoothstep(0.6 - aa, 0.6 + aa, d);
  float fill = 1.0 - smoothstep(-0.4 - aa, -0.4 + aa, d);
  float ds = sdArrow(p - vec2(0.7, 1.3));
  float shadow = (1.0 - smoothstep(-1.2, 1.8, ds)) * 0.26;

  float speed = length(uDir);
  vec2 dir = speed > 1e-3 ? uDir / speed : vec2(0.7071, 0.7071);
  // Centred on the arrow at rest; up to 6 units towards its leading side when it moves fast,
  // with a slow drift so it lives at rest too.
  vec2 c = vec2(7.0, 10.0);
  float slide = clamp(speed * 0.5, 0.0, 6.0) + sin(uTime * 1.3) * 1.5;
  float s = (dot(p - c, dir) - slide) / 2.2;
  vec2 grad = vec2(dFdx(d), dFdy(d));
  vec2 n = length(grad) > 1e-5 ? normalize(grad) : vec2(0.0, -1.0);
  float t = clamp((p.y * 0.85 + p.x * 0.35) / 19.0, 0.0, 1.0);
  vec3 body = metalSurface(uColor, p * 4.0, t, normalize(vec2(0.35, 0.94)), d, n, 1.6, s, 1.0);

  vec4 o = over(premul(body, fill), over(premul(inkOf(uColor), outer * 0.9), premul(vec3(0.0), shadow)));
  fragColor = premul(o.rgb / max(o.a, 1e-4), o.a);
}
`;
	// runtime-src/render/shaders/ripple.ts
	/** Seconds a ripple lasts. */
	const RIPPLE_SECONDS = .6;
	/**
	* As a block is built: a single specular light sweeps diagonally across its rect (light only,
	* SWEEP_LIGHT_SECONDS), and a thin metal-rimmed ring leaves its outline (a fine gold core, lit
	* on its outer edge, over a faint dark shadow ring), easing outwards and fading by RIPPLE_SECONDS.
	*/
	const RIPPLE_FS = `#version 300 es
precision highp float;
in vec2 vLocal;
uniform vec4 uRect;
uniform vec2 uBlock;
uniform float uRadius;
uniform float uAge;
uniform vec3 uColor;
uniform vec3 uGold;
out vec4 fragColor;
${SD_ROUND_BOX}${PREMUL}
void main() {
  float k = clamp(uAge / ${RIPPLE_SECONDS.toFixed(2)}, 0.0, 1.0);
  float d = sdRoundBox(vLocal - uRect.zw * 0.5, uBlock * 0.5, uRadius);
  float r = (1.0 - (1.0 - k) * (1.0 - k)) * ${28 .toFixed(1)};
  float x = d - r;
  float core = 1.0 - smoothstep(0.3, 0.8, abs(x));
  float shade = exp(-pow(x - 1.3, 2.0) / 0.6) * 0.26;
  float life = (1.0 - k) * (1.0 - k) * smoothstep(0.0, 0.06, k) * step(0.0, d);
  vec3 gold = mix(uColor, uGold, 0.7);
  vec3 rim = mix(gold * 0.55, mix(gold, vec3(1.0), 0.8), smoothstep(-0.6, 0.6, x));
  vec4 ring = over(premul(rim, core * 0.95), premul(inkOf(gold), shade));
  ring.rgb *= life;
  ring.a *= life;
  // The light sweep: a soft diagonal band crossing the block once, inside it only.
  float ks = clamp(uAge / ${.42.toFixed(2)}, 0.0, 1.0);
  vec2 local = (vLocal - uRect.zw * 0.5) / max(uBlock, vec2(1.0)) + 0.5;
  float diag = (local.x + local.y * 0.45) / 1.45;
  float pos = mix(-0.25, 1.25, ks);
  float band = exp(-pow((diag - pos) / 0.07, 2.0)) * step(d, 0.0) * (1.0 - step(1.0, ks));
  vec4 light = premul(vec3(1.0, 0.99, 0.96), band * 0.22);
  vec4 o = over(ring, light);
  fragColor = premul(o.rgb / max(o.a, 1e-4), o.a);
}
`;
	/**
	* A tapered metal comet behind a cursor along the polyline through uPts (oldest first): a
	* bright metal core in the agent's colour that darkens towards its edges, so it reads on white
	* as well as on colour. Width tapers to 0 and opacity fades towards the oldest point; it is
	* uWidth (the scale) times as wide.
	*/
	const TRAIL_FS = `#version 300 es
precision highp float;
in vec2 vLocal;
uniform vec4 uRect;
uniform vec2 uPts[24];
uniform int uCount;
uniform vec3 uColor;
uniform vec3 uGold;
uniform float uWidth;
out vec4 fragColor;
${PREMUL}

void main() {
  vec2 p = uRect.xy + vLocal;
  float cover = 0.0;
  float edge = 1.0;
  float fade = 0.0;
  float last = float(max(uCount - 1, 1));
  for (int i = 0; i < 23; i++) {
    if (i + 1 >= uCount) break;
    vec2 a = uPts[i];
    vec2 b = uPts[i + 1];
    vec2 ab = b - a;
    float h = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-4), 0.0, 1.0);
    float d = length(p - a - ab * h);
    float age = (float(i) + h) / last;
    float w = (1.7 * age + 0.15) * uWidth;
    float c = clamp(w - d + 0.5, 0.0, 1.0);
    if (c > cover) {
      cover = c;
      edge = clamp(d / w, 0.0, 1.0);
      fade = age * age;
    }
  }
  vec3 tint = mix(uColor, uGold, 0.4);
  vec3 col = mix(mix(tint, vec3(1.0), 0.45), inkOf(tint), smoothstep(0.25, 1.0, edge));
  fragColor = premul(col, cover * fade * 0.9);
}
`;
	// runtime-src/render/text-atlas.ts
	/** Name tags: 600 11px/16px (swarm-build.js:196). */
	const LABEL_STYLE = {
		font: "600 11px system-ui, sans-serif",
		lineHeight: 16
	};
	/** "W × H" badges: 500 10px/14px with tabular numbers (swarm-build.js:286). */
	const BADGE_STYLE = {
		font: "500 10px system-ui, sans-serif",
		lineHeight: 14
	};
	const SIZE = 1024;
	const GAP = 2;
	/**
	* Strings rendered once into a 2D canvas, white on transparent, for the overlay to upload as one
	* texture. Labels are drawn once per agent; a badge only when its text changes. When the canvas
	* fills up it starts over, and the strings still in use are drawn again on the next frame.
	* After the first upload only the newly drawn strings are uploaded (`takeUpload`): a drag adds a
	* badge every frame, and re-sending the whole 1024² canvas for it was the overlay's main cost.
	*/
	var TextAtlas = class TextAtlas {
		dpr;
		canvas;
		/** Goes up each time the atlas starts over, which invalidates every entry handed out before. */
		generation = 0;
		ctx;
		entries = /* @__PURE__ */ new Map();
		x = 0;
		y = 0;
		row = 0;
		/** The whole canvas needs uploading: nothing was uploaded yet, or it started over. */
		full = true;
		/** Device-pixel bounds drawn since the last upload, or null. */
		drawn = null;
		constructor(canvas, ctx, dpr) {
			this.dpr = dpr;
			this.canvas = canvas;
			this.ctx = ctx;
		}
		/** Null when the browser has no 2D canvas. */
		static create(dpr) {
			const canvas = document.createElement("canvas");
			canvas.width = SIZE;
			canvas.height = SIZE;
			const ctx = canvas.getContext("2d", { willReadFrequently: true });
			return ctx ? new TextAtlas(canvas, ctx, dpr) : null;
		}
		get size() {
			return this.entries.size;
		}
		/**
		* The entry for `text` in `style`, drawn `scale` times as large: at scale × the device pixel
		* ratio, so a larger tag stays as crisp as a scale-1 one. Its size is in CSS px at that scale.
		*/
		get(text, style, scale = 1) {
			const key = `${style.font}|${scale}|${text}`;
			const hit = this.entries.get(key);
			if (hit) return hit;
			const { ctx } = this;
			const dpr = this.dpr * scale;
			ctx.font = style.font;
			const base = ctx.measureText(text).width;
			const width = Math.ceil(base * scale);
			const lineHeight = style.lineHeight * scale;
			const w = Math.ceil(width * this.dpr) + GAP;
			const h = Math.ceil(lineHeight * this.dpr) + GAP;
			if (this.x + w > SIZE) {
				this.x = 0;
				this.y += this.row;
				this.row = 0;
			}
			if (this.y + h > SIZE) this.reset();
			const px = this.x;
			const py = this.y;
			ctx.save();
			ctx.setTransform(dpr, 0, 0, dpr, px, py);
			ctx.font = style.font;
			ctx.fillStyle = "white";
			ctx.textBaseline = "middle";
			ctx.fillText(text, 0, style.lineHeight / 2);
			ctx.restore();
			this.x += w;
			this.row = Math.max(this.row, h);
			const d = this.drawn;
			this.drawn = d ? {
				x0: Math.min(d.x0, px),
				y0: Math.min(d.y0, py),
				x1: Math.max(d.x1, px + w),
				y1: Math.max(d.y1, py + h)
			} : {
				x0: px,
				y0: py,
				x1: px + w,
				y1: py + h
			};
			const entry = {
				width,
				height: lineHeight,
				uv: [
					px / SIZE,
					py / SIZE,
					(px + width * this.dpr) / SIZE,
					(py + lineHeight * this.dpr) / SIZE
				]
			};
			this.entries.set(key, entry);
			return entry;
		}
		/** What changed since the last call, for the overlay to upload; null when nothing did. */
		takeUpload() {
			const d = this.drawn;
			this.drawn = null;
			if (this.full) {
				this.full = false;
				return { full: true };
			}
			if (!d) return null;
			const x1 = Math.min(d.x1, SIZE);
			const y1 = Math.min(d.y1, SIZE);
			return {
				full: false,
				x: d.x0,
				y: d.y0,
				pixels: this.ctx.getImageData(d.x0, d.y0, x1 - d.x0, y1 - d.y0)
			};
		}
		reset() {
			this.generation++;
			this.full = true;
			this.drawn = null;
			this.ctx.clearRect(0, 0, SIZE, SIZE);
			this.entries.clear();
			this.x = 0;
			this.y = 0;
			this.row = 0;
		}
		dispose() {
			this.entries.clear();
			this.canvas.width = 0;
			this.canvas.height = 0;
		}
	};
	/** A ring buffer of a cursor's last positions, oldest first. */
	var Trail = class {
		xs = /* @__PURE__ */ new Float32Array(24);
		ys = /* @__PURE__ */ new Float32Array(24);
		head = 0;
		size = 0;
		push(x, y) {
			if (this.size) {
				const last = (this.head - 1 + 24) % 24;
				if (Math.hypot(x - this.xs[last], y - this.ys[last]) > 200) this.size = 0;
			}
			this.xs[this.head] = x;
			this.ys[this.head] = y;
			this.head = (this.head + 1) % 24;
			this.size = Math.min(this.size + 1, 24);
		}
		get length() {
			return this.size;
		}
		/** A copy of the points, oldest first. */
		points() {
			const out = [];
			const start = (this.head - this.size + 24) % 24;
			for (let i = 0; i < this.size; i++) {
				const k = (start + i) % 24;
				out.push({
					x: this.xs[k],
					y: this.ys[k]
				});
			}
			return out;
		}
	};
	/** The newest points of a trail, oldest first, at most TRAIL_REACH px long along the path. */
	function trimTrail(points) {
		if (!points.length) return [];
		const out = [points[points.length - 1]];
		let length = 0;
		for (let i = points.length - 2; i >= 0 && out.length < 24; i--) {
			const a = points[i];
			const b = out[0];
			const step = Math.hypot(b.x - a.x, b.y - a.y);
			if (length + step > 120) {
				const k = (120 - length) / step;
				if (k > 0) out.unshift({
					x: b.x + (a.x - b.x) * k,
					y: b.y + (a.y - b.y) * k
				});
				break;
			}
			length += step;
			out.unshift(a);
		}
		return out;
	}
	// runtime-src/render/webgl-overlay.ts
	const FRAGMENTS = {
		cursor: CURSOR_FS,
		trail: TRAIL_FS,
		box: BOX_FS,
		label: LABEL_FS,
		ripple: RIPPLE_FS,
		band: BAND_FS,
		caret: CARET_FS
	};
	/** Frames a sample waits for its caret or cursors before resolving 0 (about two seconds). */
	const SAMPLE_PATIENCE = 120;
	/**
	* The context the last overlay left behind, for the next one. WebKit counts a context lost with
	* `loseContext()` as active until it is garbage collected, so a new context per Replay makes it
	* warn and drop the oldest after about 16. Reusing one context keeps the page at one for the swarm.
	*/
	let kept = null;
	/** Loses the context kept between swarms, if any. */
	function releaseKeptContext() {
		const k = kept;
		kept = null;
		if (k && !k.gl.isContextLost()) k.gl.getExtension("WEBGL_lose_context")?.loseContext();
	}
	/** The first length in a CSS border-radius, in px. */
	const radiusPx = (radius) => parseFloat(radius) || 0;
	/**
	* The swarm's one full-screen WebGL2 canvas: cursors, trails, drag boxes, badges, name tags,
	* ripples, reveal bands and typing carets, all from a plain-data Scene
	* each frame.
	*/
	var WebGLOverlay = class WebGLOverlay {
		canvas;
		lost = false;
		disposed = false;
		gl;
		loseExt;
		dpr;
		programs = /* @__PURE__ */ new Map();
		buffer;
		vao;
		atlasTexture;
		atlas = null;
		color = createColorResolver();
		lastPos = /* @__PURE__ */ new Map();
		samples = [];
		/** Trail points, reused every frame. */
		trailPoints = /* @__PURE__ */ new Float32Array(48);
		onLost = () => {
			this.lost = true;
			this.flushSamples();
		};
		/** Null when the browser has no WebGL2. */
		static create(opts) {
			const reuse = kept;
			kept = null;
			if (reuse && !reuse.gl.isContextLost()) return new WebGLOverlay(reuse.canvas, reuse.gl, opts);
			const canvas = document.createElement("canvas");
			const gl = canvas.getContext("webgl2", {
				alpha: true,
				premultipliedAlpha: true,
				antialias: false,
				depth: false,
				stencil: false,
				preserveDrawingBuffer: false
			});
			if (!gl) return null;
			return new WebGLOverlay(canvas, gl, opts);
		}
		constructor(canvas, gl, { zIndex }) {
			this.canvas = canvas;
			this.gl = gl;
			this.dpr = Math.min(window.devicePixelRatio || 1, 2);
			this.loseExt = gl.getExtension("WEBGL_lose_context");
			canvas.setAttribute("aria-hidden", "true");
			canvas.setAttribute("data-swarm-overlay", "");
			Object.assign(canvas.style, {
				position: "fixed",
				left: "0",
				top: "0",
				pointerEvents: "none",
				zIndex: String(zIndex)
			});
			canvas.style.removeProperty("mix-blend-mode");
			canvas.addEventListener("webglcontextlost", this.onLost);
			document.body.appendChild(canvas);
			try {
				for (const name of Object.keys(FRAGMENTS)) this.programs.set(name, this.link(FRAGMENTS[name]));
			} catch (error) {
				this.dispose();
				if (kept?.gl === gl) releaseKeptContext();
				throw error;
			}
			this.buffer = gl.createBuffer();
			gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
			gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
				0,
				0,
				1,
				0,
				0,
				1,
				1,
				1
			]), gl.STATIC_DRAW);
			this.vao = gl.createVertexArray();
			gl.bindVertexArray(this.vao);
			gl.enableVertexAttribArray(0);
			gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
			this.atlasTexture = gl.createTexture();
			gl.bindTexture(gl.TEXTURE_2D, this.atlasTexture);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
			gl.enable(gl.BLEND);
			gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
			(document.fonts?.ready ?? Promise.resolve()).then(() => {
				if (!this.disposed) this.atlas = TextAtlas.create(this.dpr);
			});
		}
		link(fragment, vertex = QUAD_VS) {
			const { gl } = this;
			const compile = (type, source) => {
				const shader = gl.createShader(type);
				gl.shaderSource(shader, source);
				gl.compileShader(shader);
				if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
					const log = gl.getShaderInfoLog(shader);
					gl.deleteShader(shader);
					throw new Error(`swarm-build: shader failed to compile: ${log}`);
				}
				return shader;
			};
			const vs = compile(gl.VERTEX_SHADER, vertex);
			let fs;
			try {
				fs = compile(gl.FRAGMENT_SHADER, fragment);
			} catch (error) {
				gl.deleteShader(vs);
				throw error;
			}
			const program = gl.createProgram();
			gl.attachShader(program, vs);
			gl.attachShader(program, fs);
			gl.bindAttribLocation(program, 0, "aPos");
			gl.linkProgram(program);
			gl.detachShader(program, vs);
			gl.detachShader(program, fs);
			gl.deleteShader(vs);
			gl.deleteShader(fs);
			if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
				const log = gl.getProgramInfoLog(program);
				gl.deleteProgram(program);
				throw new Error(`swarm-build: shader program failed to link: ${log}`);
			}
			return {
				program,
				uniforms: /* @__PURE__ */ new Map()
			};
		}
		use(name, viewport) {
			const { gl } = this;
			const p = this.programs.get(name);
			gl.useProgram(p.program);
			const at = (uniform) => {
				if (!p.uniforms.has(uniform)) p.uniforms.set(uniform, gl.getUniformLocation(p.program, uniform));
				return p.uniforms.get(uniform);
			};
			gl.uniform2f(at("uViewport"), viewport.width, viewport.height);
			return at;
		}
		quad(at, x, y, w, h) {
			const { gl } = this;
			gl.uniform4f(at("uRect"), x, y, w, h);
			gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
		}
		rgb(at, uniform, css) {
			const [r, g, b] = this.color(css);
			this.gl.uniform3f(at(uniform), r, g, b);
		}
		frame(scene) {
			if (this.disposed || this.lost) return;
			const { gl, dpr } = this;
			const { viewport: vp } = scene;
			const width = Math.max(1, Math.round(vp.width * dpr));
			const height = Math.max(1, Math.round(vp.height * dpr));
			if (this.canvas.width !== width || this.canvas.height !== height) {
				this.canvas.width = width;
				this.canvas.height = height;
				this.canvas.style.width = `${vp.width}px`;
				this.canvas.style.height = `${vp.height}px`;
			}
			gl.viewport(0, 0, width, height);
			gl.clearColor(0, 0, 0, 0);
			gl.clear(gl.COLOR_BUFFER_BIT);
			gl.bindVertexArray(this.vao);
			const time = scene.time / 1e3;
			const scale = scene.scale ?? 1;
			const atlas = this.atlas;
			const lookup = () => ({
				badgeText: scene.boxes.map((b) => b.badge && atlas?.get(b.badge, BADGE_STYLE, scale) || null),
				labelText: scene.labels.map((l) => atlas?.get(l.name, LABEL_STYLE, scale) ?? null)
			});
			const generation = atlas?.generation;
			let { badgeText, labelText } = lookup();
			if (atlas && atlas.generation !== generation) ({badgeText, labelText} = lookup());
			const upload = atlas?.takeUpload();
			if (upload) {
				gl.bindTexture(gl.TEXTURE_2D, this.atlasTexture);
				if (upload.full) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas.canvas);
				else gl.texSubImage2D(gl.TEXTURE_2D, 0, upload.x, upload.y, gl.RGBA, gl.UNSIGNED_BYTE, upload.pixels);
			}
			const gold = scene.accent ?? "var(--color-champagne)";
			if (scene.bands.length) {
				const at = this.use("band", vp);
				this.rgb(at, "uGold", gold);
				gl.uniform1f(at("uTime"), time);
				for (const b of scene.bands) {
					this.rgb(at, "uColor", b.color);
					gl.uniform1f(at("uFront"), b.frontY);
					gl.uniform1f(at("uTop"), b.top);
					gl.uniform1f(at("uE"), b.e);
					this.quad(at, b.left, b.frontY - 56, b.width, 68);
				}
			}
			if (scene.ripples.length) {
				const at = this.use("ripple", vp);
				this.rgb(at, "uGold", gold);
				for (const r of scene.ripples) {
					if (r.age >= .6) continue;
					this.rgb(at, "uColor", r.color);
					gl.uniform2f(at("uBlock"), r.width, r.height);
					gl.uniform1f(at("uRadius"), r.radius);
					gl.uniform1f(at("uAge"), r.age);
					const pad = 40;
					this.quad(at, r.x - pad, r.y - pad, r.width + 80, r.height + 80);
				}
			}
			if (scene.boxes.length) {
				const at = this.use("box", vp);
				this.rgb(at, "uGold", gold);
				gl.uniform1f(at("uTime"), time);
				gl.uniform1f(at("uLine"), scale);
				const pad = 4 * scale;
				for (const b of scene.boxes) {
					if (b.width < 1 || b.height < 1) continue;
					this.rgb(at, "uColor", b.color);
					gl.uniform1f(at("uRadius"), radiusPx(b.radius));
					gl.uniform1f(at("uOpacity"), b.opacity);
					gl.uniform2f(at("uSize"), b.width, b.height);
					this.quad(at, b.x - pad, b.y - pad, b.width + pad * 2, b.height + pad * 2);
				}
			}
			if (scene.carets.length) {
				const at = this.use("caret", vp);
				this.rgb(at, "uGold", gold);
				gl.uniform1f(at("uTime"), time);
				for (const c of scene.carets) this.quad(at, c.x - 10, c.y - 10, 20, c.height + 20);
			}
			if (scene.trails.length) {
				const at = this.use("trail", vp);
				this.rgb(at, "uGold", gold);
				gl.uniform1f(at("uWidth"), scale);
				const pts = this.trailPoints;
				for (const t of scene.trails) {
					const kept = trimTrail(t.points);
					const n = kept.length;
					if (n < 2) continue;
					let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
					for (let i = 0; i < n; i++) {
						const p = kept[i];
						pts[i * 2] = p.x;
						pts[i * 2 + 1] = p.y;
						x0 = Math.min(x0, p.x);
						y0 = Math.min(y0, p.y);
						x1 = Math.max(x1, p.x);
						y1 = Math.max(y1, p.y);
					}
					if (x1 - x0 < .5 && y1 - y0 < .5) continue;
					this.rgb(at, "uColor", t.color);
					gl.uniform2fv(at("uPts"), pts);
					gl.uniform1i(at("uCount"), n);
					const pad = 12 * scale;
					this.quad(at, x0 - pad, y0 - pad, x1 - x0 + pad * 2, y1 - y0 + pad * 2);
				}
			}
			if (scene.boxes.some((b) => b.badge)) this.drawBadges(scene, badgeText);
			if (scene.cursors.length) {
				const at = this.use("cursor", vp);
				gl.uniform1f(at("uTime"), time);
				for (const c of scene.cursors) {
					const last = this.lastPos.get(c.name);
					const dx = last ? c.x - last.x : 0;
					const dy = last ? c.y - last.y : 0;
					const dir = Math.hypot(dx, dy) > .25 ? {
						dx,
						dy
					} : last ?? {
						dx: 0,
						dy: 0
					};
					this.lastPos.set(c.name, {
						x: c.x,
						y: c.y,
						dx: dir.dx,
						dy: dir.dy
					});
					this.rgb(at, "uColor", c.color);
					gl.uniform1f(at("uScale"), c.scale);
					gl.uniform2f(at("uDir"), dir.dx, dir.dy);
					const pad = 3 * c.scale;
					this.quad(at, c.x - pad, c.y - pad, CURSOR_BOX.width * c.scale, CURSOR_BOX.height * c.scale);
				}
			}
			if (scene.labels.length) {
				const at = this.use("label", vp);
				gl.uniform1f(at("uTime"), time);
				for (const [i, l] of scene.labels.entries()) {
					const text = labelText[i];
					const width = text ? text.width + 16 * scale : l.width;
					const x = l.flip ? l.x + l.width - width : l.x;
					this.pill(at, x, l.y, width, l.height, 999, l.color, l.text, l.opacity ?? 1, text, 8 * scale, 2 * scale, scale);
				}
			}
			this.flushSamples(scene);
		}
		drawBadges(scene, texts) {
			const at = this.use("label", scene.viewport);
			this.gl.uniform1f(at("uTime"), scene.time / 1e3);
			const scale = scene.scale ?? 1;
			for (const [i, b] of scene.boxes.entries()) {
				if (!b.badge) continue;
				const text = texts[i];
				const width = (text ? text.width : b.badge.length * 5.6 * scale) + 8 * scale;
				const height = 16 * scale;
				const x = b.x + b.width / 2 - width / 2;
				const gap = 4 * scale;
				const y = b.badgeInside ? b.y + b.height - gap - height : b.y + b.height + gap;
				this.pill(at, x, y, width, height, 3 * scale, b.color, b.text, b.opacity, text, 4 * scale, 1 * scale, scale);
			}
		}
		pill(at, x, y, width, height, radius, color, textColor, opacity, text, padX, padY, scale) {
			const { gl, dpr } = this;
			const snap = (v) => Math.round(v * dpr) / dpr;
			x = snap(x);
			y = snap(y);
			width = snap(width);
			height = snap(height);
			padX = snap(padX);
			padY = snap(padY);
			const pad = snap(4 * scale);
			gl.uniform1f(at("uScale"), scale);
			gl.uniform1f(at("uPad"), pad);
			this.rgb(at, "uColor", color);
			this.rgb(at, "uTextColor", textColor);
			gl.uniform2f(at("uSize"), width, height);
			gl.uniform1f(at("uRadius"), radius);
			gl.uniform1f(at("uOpacity"), opacity);
			gl.uniform1f(at("uHasText"), text ? 1 : 0);
			if (text) {
				gl.activeTexture(gl.TEXTURE0);
				gl.bindTexture(gl.TEXTURE_2D, this.atlasTexture);
				gl.uniform1i(at("uAtlas"), 0);
				gl.uniform4f(at("uUV"), ...text.uv);
				gl.uniform4f(at("uText"), padX, padY, text.width, text.height);
			}
			this.quad(at, x - pad, y - pad, width + pad * 2, height + pad * 2);
		}
		sample(opts = {}) {
			if (this.disposed || this.lost) return Promise.resolve(0);
			return new Promise((resolve) => this.samples.push({
				opts,
				frames: 0,
				resolve
			}));
		}
		/** Reads pending samples from the frame just drawn; without a scene, resolves them all to 0. */
		flushSamples(scene) {
			if (!this.samples.length) return;
			if (!scene) {
				this.samples.splice(0).forEach((s) => s.resolve(0));
				return;
			}
			this.samples = this.samples.filter((s) => {
				const squares = this.squares(scene, s.opts);
				if (!squares.length && ++s.frames < SAMPLE_PATIENCE) return true;
				s.resolve(squares.reduce((sum, sq) => sum + this.countOpaque(sq), 0));
				return false;
			});
		}
		squares(scene, { around, radius = 24 }) {
			const { width, height } = scene.viewport;
			if (!around) return [{
				x: 0,
				y: 0,
				w: width,
				h: height
			}];
			return (around === "caret" ? scene.carets.map((c) => ({
				x: c.x,
				y: c.y + c.height / 2
			})) : scene.cursors.map((c) => ({
				x: c.x + CURSOR_TIP.x * c.scale + 6,
				y: c.y + CURSOR_TIP.y * c.scale + 8
			}))).map((c) => {
				const x = Math.max(0, c.x - radius);
				const y = Math.max(0, c.y - radius);
				return {
					x,
					y,
					w: Math.min(width, c.x + radius) - x,
					h: Math.min(height, c.y + radius) - y
				};
			}).filter((sq) => sq.w > 0 && sq.h > 0);
		}
		countOpaque({ x, y, w, h }) {
			const { gl, dpr } = this;
			const px = Math.floor(x * dpr);
			const pw = Math.max(1, Math.round(w * dpr));
			const ph = Math.max(1, Math.round(h * dpr));
			const py = this.canvas.height - Math.floor(y * dpr) - ph;
			const data = new Uint8Array(pw * ph * 4);
			gl.readPixels(px, Math.max(0, py), pw, ph, gl.RGBA, gl.UNSIGNED_BYTE, data);
			let count = 0;
			for (let i = 3; i < data.length; i += 4) if (data[i] > 0) count++;
			return count;
		}
		dispose() {
			if (this.disposed) return;
			this.disposed = true;
			const { gl } = this;
			this.flushSamples();
			this.canvas.removeEventListener("webglcontextlost", this.onLost);
			for (const { program } of this.programs.values()) gl.deleteProgram(program);
			this.programs.clear();
			if (this.atlasTexture) gl.deleteTexture(this.atlasTexture);
			if (this.buffer) gl.deleteBuffer(this.buffer);
			if (this.vao) gl.deleteVertexArray(this.vao);
			this.atlas?.dispose();
			this.atlas = null;
			this.canvas.remove();
			if (gl.isContextLost()) return;
			if (kept) this.loseExt?.loseContext();
			else {
				this.canvas.width = this.canvas.height = 1;
				kept = {
					canvas: this.canvas,
					gl
				};
			}
		}
	};
	// runtime-src/render/factory.ts
	/**
	* The WebGL2 overlay, or null without WebGL2 or when its shaders fail to build. Null makes the
	* swarm show the finished page at once (plan §3.1 principle 3); a context lost later switches
	* the remaining blocks to the CSS fallback instead.
	*/
	const defaultRendererFactory = (opts) => {
		try {
			return WebGLOverlay.create(opts);
		} catch (error) {
			console.warn(error);
			return null;
		}
	};
	let factory = defaultRendererFactory;
	/** Swaps the factory every later swarm uses; null restores the default. */
	function setRendererFactory(next) {
		factory = next ?? defaultRendererFactory;
	}
	function createRenderer(opts) {
		return factory(opts);
	}
	// runtime-src/reveal/band-reveal.ts
	/** Seconds a sweep takes (swarm-build.js:612). */
	const SWEEP_SECONDS = .45;
	/**
	* The block's clip-path opens top to bottom over 0.45s, and each step reports `e` so
	* the overlay draws the band at the same front on the same frame.
	*/
	const bandReveal = {
		kind: "band",
		async reveal({ node, tween, progress }) {
			await tween(SWEEP_SECONDS, (t) => {
				const e = easeOut(t);
				node.style.clipPath = sweep(e);
				progress(e);
			});
		}
	};
	/** The band the overlay draws for a block at `rect`, from the same geometry as its clip-path. */
	function bandOf(rect, e, color) {
		const { visible, frontY } = sweepFront(rect, e);
		return {
			left: visible.left,
			top: visible.top,
			width: visible.width,
			height: visible.height,
			frontY,
			e,
			color
		};
	}
	// runtime-src/reveal/caret-reveal.ts
	/**
	* The caret after the text typed so far: the right edge of the last client rect of `typed`.
	* Before the first character (or where ranges have no rects) it sits at the block's top-left,
	* one line tall.
	*/
	function caretAt(typed, block) {
		if (typed.length > 0) {
			const range = document.createRange();
			range.setStart(typed, 0);
			range.setEnd(typed, typed.length);
			const rects = typeof range.getClientRects === "function" ? range.getClientRects() : null;
			const last = rects && rects.length ? rects[rects.length - 1] : null;
			range.detach();
			if (last) return {
				x: last.right,
				y: last.top,
				height: last.height
			};
		}
		const box = block.getBoundingClientRect();
		const style = getComputedStyle(block);
		const line = parseFloat(style.lineHeight) || (parseFloat(style.fontSize) || 16) * 1.2;
		return {
			x: box.left,
			y: box.top,
			height: line
		};
	}
	/** Width of a tag at scale 1, measured without the DOM: 6.5px per character plus the padding. */
	const labelWidth = (text, scale = 1) => (16 + text.length * 6.5) * scale;
	/**
	* The places a cursor's tag may sit, best first, for a cursor at (x, y): below right of the arrow
	* (left of it near the right edge, so it is never cut off), then the other side, then above on
	* either side. Only the spots that fit in the viewport are offered, unless none does (a cursor
	* offstage): a tag cut off at the edge cannot be read. All sizes grow with `scale`.
	*/
	function labelSpots(x, y, width, scale, viewportWidth, viewportHeight = Infinity) {
		const right = {
			x: x + 14 * scale,
			flip: false
		};
		const left = {
			x: x - width - 2 * scale,
			flip: true
		};
		const sides = x > viewportWidth - width - 24 * scale ? [left, right] : [right, left];
		const below = y + 18 * scale;
		const above = y - 22 * scale;
		const spots = [...sides.map((s) => ({
			...s,
			y: below
		})), ...sides.map((s) => ({
			...s,
			y: above
		}))];
		const fits = (s) => s.x >= 0 && s.x + width <= viewportWidth && s.y >= 0 && s.y + 20 * scale <= viewportHeight;
		const inside = spots.filter(fits);
		return inside.length ? inside : spots;
	}
	/**
	* Keeps name tags apart (greedy, in cursor order): each tag takes its first spot that does not
	* overlap a tag placed before it (with `gap` px between them), trying its `prefer`red spot (the
	* one it had last frame) first, so tags do not hop between spots. A tag with no free spot takes
	* the one it overlaps least, but keeps its preferred spot unless that halves the overlap, and is
	* marked `crowded`, for the caller to fade. A tag with `keep` set stays on its preferred spot
	* whatever it overlaps (crowded when it does). Returns the spot index per tag.
	*/
	function separateLabels(spots, width, height, gap = 2, prefer = [], keep = []) {
		const placed = [];
		/** Area of `s` (width `w`) that overlaps the tags placed so far, gaps included. */
		const covered = (s, w) => placed.reduce((sum, p) => {
			const ox = Math.min(s.x + w, p.x + p.w) + gap - Math.max(s.x, p.x);
			const oy = Math.min(s.y + height, p.y + height) + gap - Math.max(s.y, p.y);
			return sum + (ox > 0 && oy > 0 ? ox * oy : 0);
		}, 0);
		return spots.map((options, i) => {
			const area = options.map((s) => covered(s, width[i]));
			const p = prefer[i] !== void 0 && prefer[i] < options.length ? prefer[i] : void 0;
			let spot = p !== void 0 && (area[p] === 0 || keep[i]) ? p : area.indexOf(0);
			if (spot < 0) {
				spot = area.indexOf(Math.min(...area));
				if (p !== void 0 && area[spot] > area[p] / 2) spot = p;
			}
			placed.push({
				x: options[spot].x,
				y: options[spot].y,
				w: width[i]
			});
			return {
				spot,
				crowded: area[spot] > 0
			};
		});
	}
	// runtime-src/run-swarm.ts
	const stopped = {
		finished: Promise.resolve(),
		finish() {},
		destroy() {},
		setSpeed() {}
	};
	const STAT_OF = {
		band: "bandReveals",
		css: "cssFallbacks"
	};
	function debugEnabled() {
		if (typeof window === "undefined") return false;
		if (window.__SWARM_DEBUG__ === true) return true;
		return new URLSearchParams(window.location.search).has("swarmDebug");
	}
	/** Stats for one swarm, published as `window.__swarm` only when debugging is on. */
	function createDebug() {
		const stats = {
			bandReveals: 0,
			cssFallbacks: 0,
			skipped: 0
		};
		const debug = {
			stats,
			routing: {
				matched: 0,
				stolen: 0
			},
			offscreenBuilt: 0,
			agents: {
				count: 0,
				idleMs: 0,
				workingMs: 0
			},
			startedAt: null,
			firstViewBuiltAt: null,
			doneAt: null,
			sampleOverlay: () => Promise.resolve(0),
			get mode() {
				if (stats.skipped > 0) return "skipped";
				const used = Object.keys(STAT_OF).filter((k) => stats[STAT_OF[k]] > 0);
				return used.length > 1 ? "mixed" : used[0] ?? "none";
			}
		};
		if (debugEnabled()) window.__swarm = debug;
		return debug;
	}
	/** Shows everything at once and does nothing else: for reduced motion, no input or no overlay. */
	function skip(unpend, onDone) {
		unpend();
		onDone?.();
		const debug = createDebug();
		debug.stats.skipped++;
		debug.doneAt = performance.now();
		return stopped;
	}
	/** `sizeTiming`: the shortest drag and reveal, as a share of the full time. */
	const SIZE_TIMING_FLOOR = .35;
	/**
	* `sizeTiming`: the share of the full drag and reveal time a `width` × `height` block takes: the
	* square root of its area over SIZE_TIMING_EDGE, between SIZE_TIMING_FLOOR and 1.
	*/
	function sizeFactor(width, height) {
		return Math.min(1, Math.max(SIZE_TIMING_FLOOR, Math.sqrt(Math.max(0, width * height)) / 160));
	}
	/**
	* `sizeTiming`: the fastest a drag box may grow, in CSS px of its longer side per second of loop
	* time (at its peak, mid-drag): a large or wide block takes longer rather than rush across.
	*/
	const DRAG_MAX_SPEED = 2400;
	/** The peak slope of easeInOut, the drag's easing: its top speed over its mean speed. */
	const DRAG_EASE_PEAK = 2;
	/**
	* Seconds a `sizeTiming` drag over a `width` × `height` box takes, from the full time `seconds`:
	* shorter for small blocks (sizeFactor), never so short that it grows faster than DRAG_MAX_SPEED.
	*/
	function dragSeconds(seconds, width, height) {
		return Math.max(seconds * sizeFactor(width, height), Math.max(width, height) * DRAG_EASE_PEAK / DRAG_MAX_SPEED);
	}
	/** The time a cursor takes to travel to its next block (`sizeTiming`: the longest travel). */
	const TRAVEL_SECONDS = .7;
	/** `sizeTiming`: the shortest travel, however short the hop. */
	const TRAVEL_MIN_SECONDS = .2;
	/** `sizeTiming`: a hop at least this many px long takes the full TRAVEL_SECONDS. */
	const TRAVEL_FULL_DISTANCE = 1200;
	/**
	* Seconds a `sizeTiming` cursor takes to travel `distance` px: TRAVEL_SECONDS times the square
	* root of the distance over TRAVEL_FULL_DISTANCE (short hops are quicker), never less than
	* TRAVEL_MIN_SECONDS nor more than TRAVEL_SECONDS.
	*/
	function travelSeconds(distance) {
		return Math.min(TRAVEL_SECONDS, Math.max(TRAVEL_MIN_SECONDS, TRAVEL_SECONDS * Math.sqrt(Math.max(0, distance) / TRAVEL_FULL_DISTANCE)));
	}
	/** A name tag's opacity while its agent is idle or on its way to a task. */
	const IDLE_TAG_OPACITY = .35;
	/** True when `node` sits in an element that scrolls (or clips) sideways. */
	function inSideScroller(node) {
		for (let p = node?.parentElement; p && p !== document.body; p = p.parentElement) if (p.scrollWidth > p.clientWidth + 1 && getComputedStyle(p).overflowX !== "visible") return true;
		return false;
	}
	/**
	* The shared engine: a swarm of cursors works through `tasks`. Each task is a rectangle the
	* cursor drags out, then a `reveal` tween. A task starts once it has scrolled into view and
	* its `parent` task is built.
	*/
	function runSwarm(tasks, { prepare, observe, settleAll, unpend, onFinish, onFrame = () => {}, options }) {
		const { start = "now", zIndex = 2147483e3, onDone, onTaskBuilt } = options;
		const created = createRenderer({ zIndex });
		if (!created) return skip(unpend, onDone);
		const renderer = created;
		const routing = options.routing ?? "role";
		const pick = options.pick ?? "order";
		const pipeline = options.pipeline === true;
		const sizeTiming = options.sizeTiming === true;
		const scale = (options.scale ?? 0) > 0 ? options.scale : 1;
		const cast = options.agents === "auto" || options.agents === void 0 && routing === "role" && tasks.some((t) => t.role) ? autoAgents(tasks.map((t) => t.role), options.headcount) : [];
		const explicit = options.agents === "auto" ? void 0 : options.agents;
		const { agents, accent } = resolvePalette({
			palette: options.palette,
			agents: cast.length ? void 0 : explicit
		}, document, cast.length ? cast : void 0);
		const debug = createDebug();
		debug.sampleOverlay = (opts) => renderer.sample?.(opts) ?? Promise.resolve(0);
		let state = "idle";
		let resolveFinished = () => {};
		let rejectFinished = () => {};
		const finished = new Promise((resolve, reject) => {
			resolveFinished = resolve;
			rejectFinished = reject;
		});
		const cleanups = [];
		const initialSpeed = options.speed ?? 0;
		const loop = createLoop(() => render(), initialSpeed > 0 ? initialSpeed : 1);
		const tween = loop.tween;
		cleanups.push(() => renderer.dispose());
		cleanups.push(prepare());
		const wakers = /* @__PURE__ */ new Set();
		const wake = () => {
			wakers.forEach((r) => r());
			wakers.clear();
		};
		cleanups.push(observe(wake));
		/** A task is being drawn from the moment it is taken until it is built. */
		const drawing = () => tasks.some((t) => t.taken && !t.built);
		/**
		* Blocks that never came into view (copies in a marquee that scrolled the other way) would keep
		* the swarm running for good. Once the page is scrolled to the end, nothing is being drawn and
		* every block left is out of view to the side, they are built at once, where nobody sees them.
		*/
		const offscreenLeft = () => {
			if (loop.done || drawing()) return [];
			if ((document.scrollingElement ?? document.documentElement).scrollHeight - innerHeight - scrollY > 2) return [];
			const rest = tasks.filter((t) => !t.taken);
			if (!rest.length || rest.some((t) => t.seen && (!t.parent || t.parent.built))) return [];
			const out = (t) => {
				const r = t.rect();
				if (r.left + r.width < 0 || r.left >= innerWidth) return true;
				return (r.bottom < 0 || r.top > innerHeight) && inSideScroller(t.node);
			};
			return rest.every(out) ? rest : [];
		};
		const instant = async (_seconds, update) => update?.(1);
		const buildOffscreen = async (rest) => {
			rest.forEach((t) => t.taken = true);
			const hooks = {
				band() {},
				count: (kind) => debug.stats[STAT_OF[kind]]++,
				caret() {},
				overlayLost: () => renderer.lost === true,
				zIndex
			};
			for (const t of rest) {
				await t.reveal(instant, hooks);
				t.built = true;
				debug.offscreenBuilt++;
				onTaskBuilt?.(t);
			}
		};
		const idle = /* @__PURE__ */ new Set();
		const fair = options.steal === "fair";
		let share = 1;
		/** Each free task's place among the free tasks of its role, in reading order. */
		const rank = /* @__PURE__ */ new Map();
		const patience = Math.max(0, options.stealAfter ?? 0);
		/** Loop time each task was first found free. */
		const freeSince = /* @__PURE__ */ new Map();
		const waitLeft = (t) => !patience || !t.role || !staffed.has(t.role) ? 0 : patience - (freeSince.has(t) ? loop.time - freeSince.get(t) : 0);
		const stealable = (t) => patience ? waitLeft(t) <= 0 : !fair || !t.role || rank.get(t) >= (staffed.get(t.role) ?? 0) * share;
		let firstView = null;
		const next = async (c) => {
			idle.add(c);
			const idleSince = performance.now();
			try {
				for (;;) {
					if (state === "ended") throw ABORT;
					const open = tasks.filter((t) => !t.taken && (loop.done || t.seen));
					const ready = open.filter((t) => !t.parent || t.parent.built);
					const early = pipeline && !loop.done ? open.filter((t) => t.parent && !t.parent.built && t.parent.taken) : [];
					const available = early.length ? [...ready, ...early] : ready;
					for (const t of ready) if (!freeSince.has(t)) freeSince.set(t, loop.time);
					let task;
					const order = (list) => pick === "order" || loop.done || list.length < 2 ? list : pick === "nearest" ? byDistance(list, rectOf, ...posOf(c), innerHeight * .9) : byUrgency(list, rectOf, ...posOf(c), innerHeight, scrollDirection);
					const ordered = early.length ? [...order(ready), ...order(early)] : order(ready);
					const band = pick === "urgent" && routing === "role" && !loop.done ? ordered.filter((t) => inExitBand(rectOf(t), innerHeight, scrollDirection)) : [];
					if (routing === "any" || loop.done) task = ordered[0];
					else {
						const free = /* @__PURE__ */ new Set();
						for (const o of idle) if (o !== c && o.role) free.add(o.role);
						if (fair) {
							share = Math.max(1, Math.ceil(available.length / cursors.length));
							const seen = /* @__PURE__ */ new Map();
							for (const t of available) {
								if (!t.role) continue;
								rank.set(t, seen.get(t.role) ?? 0);
								seen.set(t.role, rank.get(t) + 1);
							}
						}
						if (band.length) {
							const isReady = (t) => !t.parent || !!t.parent.built;
							task = pickTask(band.filter(isReady), c.role, free) ?? pickTask(band, c.role, free);
						}
						task ??= pickTask(ordered, c.role, free, stealable);
					}
					if (task) {
						firstView ??= tasks.filter((t) => t.seen);
						task.taken = true;
						idle.delete(c);
						if (c.role && task.role) debug.routing[task.role === c.role ? "matched" : "stolen"]++;
						if (available.length > 1) wake();
						return task;
					}
					if (tasks.every((t) => t.taken)) return null;
					const rest = offscreenLeft();
					if (rest.length) {
						await buildOffscreen(rest);
						wake();
						continue;
					}
					const woken = new Promise((r) => wakers.add(r));
					const left = routing === "role" ? ready.map(waitLeft).filter((s) => s > 0) : [];
					if (!left.length) await woken;
					else {
						const timer = tween(Math.min(...left));
						timer.catch(() => {});
						await Promise.race([woken, timer]);
					}
				}
			} finally {
				idle.delete(c);
				debug.agents.idleMs += performance.now() - idleSince;
			}
		};
		const rects = /* @__PURE__ */ new Map();
		const rectOf = (task) => {
			let r = rects.get(task);
			if (!r) rects.set(task, r = task.rect());
			return r;
		};
		/** An anchor is a point in fractions of a task's rectangle, or in viewport pixels. */
		const resolve = (a) => {
			if (!("task" in a)) return a;
			const r = rectOf(a.task);
			return {
				x: r.left + a.fx * r.width,
				y: r.top + a.fy * r.height
			};
		};
		/** Where a cursor is now, in viewport pixels. */
		const posOf = (c) => {
			const a = resolve(c.from);
			const b = resolve(c.to);
			const t = c.ease(c.p);
			return [lerp(a.x, b.x, t), lerp(a.y, b.y, t)];
		};
		const count = Math.max(1, Math.min(agents.length, tasks.length));
		debug.agents.count = count;
		const cursors = Array.from({ length: count }, (_, a) => {
			const { name, color, text = "var(--color-pearl)" } = agents[a % agents.length];
			const agent = {
				name,
				color,
				text
			};
			const role = routing === "role" ? roleOfAgent(agents[a % agents.length]) : void 0;
			const angle = ((a + .5) / count - .5) * Math.PI;
			const offstage = () => {
				const reach = Math.hypot(innerWidth, innerHeight) * .6;
				return {
					x: innerWidth / 2 + Math.cos(angle) * reach,
					y: innerHeight / 2 + Math.sin(angle) * reach
				};
			};
			const startAt = offstage();
			const label = agentLabel(name);
			const trail = new Trail();
			return {
				agent,
				role,
				label,
				labelWidth: labelWidth(label, scale),
				flip: false,
				working: false,
				tag: null,
				offstage,
				from: startAt,
				to: startAt,
				p: 1,
				ease: easeInOut,
				scale: 1,
				trail
			};
		});
		/** How many cursors work in each role. */
		const staffed = /* @__PURE__ */ new Map();
		for (const c of cursors) if (c.role) staffed.set(c.role, (staffed.get(c.role) ?? 0) + 1);
		const boxes = /* @__PURE__ */ new Set();
		const bands = /* @__PURE__ */ new Map();
		const carets = /* @__PURE__ */ new Map();
		const ripples = /* @__PURE__ */ new Set();
		let lastScene = null;
		const buildScene = () => {
			rects.clear();
			const scene = {
				time: performance.now(),
				accent,
				scale,
				viewport: {
					width: innerWidth,
					height: innerHeight
				},
				cursors: [],
				labels: [],
				boxes: [],
				trails: [],
				ripples: [],
				bands: [],
				carets: []
			};
			const at = cursors.map((c) => {
				const [x, y] = posOf(c);
				return {
					x,
					y
				};
			});
			const spots = cursors.map((c, i) => labelSpots(at[i].x, at[i].y, c.labelWidth, scale, innerWidth, innerHeight));
			const height = 20 * scale;
			const now = loop.time * 1e3;
			const keep = cursors.map(({ tag }) => !!tag && (now - tag.since < 400 || tag.overlapSince === null || now - tag.overlapSince < 250));
			const order = cursors.map((_, i) => i).sort((a, b) => Number(cursors[b].working) - Number(cursors[a].working));
			const placed = separateLabels(order.map((i) => spots[i]), order.map((i) => cursors[i].labelWidth), height, 2 * scale, order.map((i) => cursors[i].tag?.spot), order.map((i) => keep[i]));
			const chosen = new Array(cursors.length);
			order.forEach((i, k) => chosen[i] = placed[k]);
			const dt = lastScene === null ? 0 : Math.max(0, now - lastScene);
			lastScene = now;
			const slide = 1 - Math.exp(-dt / 45);
			const fade = 1 - Math.exp(-dt / 75);
			cursors.forEach((c, i) => {
				const { x, y } = at[i];
				const { spot: index, crowded } = chosen[i];
				const spot = spots[i][index];
				const target = crowded ? .3 : c.working ? 1 : IDLE_TAG_OPACITY;
				const tag = c.tag ??= {
					spot: index,
					since: now,
					overlapSince: null,
					opacity: target,
					dx: spot.x - x,
					dy: spot.y - y
				};
				if (tag.spot !== index) {
					tag.spot = index;
					tag.since = now;
					tag.overlapSince = null;
				}
				tag.overlapSince = crowded ? tag.overlapSince ?? now : null;
				tag.opacity += (target - tag.opacity) * fade;
				tag.dx += (spot.x - x - tag.dx) * slide;
				tag.dy += (spot.y - y - tag.dy) * slide;
				c.flip = spot.flip;
				const { name, color, text } = c.agent;
				c.trail.push(x, y);
				scene.trails.push({
					name,
					color,
					points: c.trail.points()
				});
				scene.cursors.push({
					name,
					color,
					text,
					x,
					y,
					scale: c.scale * scale,
					flip: c.flip
				});
				scene.labels.push({
					name: c.label,
					color,
					text,
					x: x + tag.dx,
					y: y + tag.dy,
					width: c.labelWidth,
					height,
					flip: c.flip,
					opacity: tag.opacity
				});
			});
			for (const b of boxes) {
				const r = rectOf(b.task);
				const box = {
					x: r.left,
					y: r.top,
					width: b.e * r.width,
					height: b.e * r.height,
					color: b.cursor.agent.color,
					text: b.cursor.agent.text,
					radius: b.task.radius ?? "0",
					opacity: b.opacity,
					badge: b.badge,
					badgeInside: b.badgeInside
				};
				scene.boxes.push(box);
			}
			for (const [task, { e, color }] of bands) scene.bands.push(bandOf(rectOf(task), e, color));
			for (const [task, typed] of carets) scene.carets.push({
				...caretAt(typed, task.node),
				color: accent
			});
			for (const { task, color, age } of ripples) {
				const r = rectOf(task);
				const radius = parseFloat(task.radius ?? "") || 0;
				scene.ripples.push({
					x: r.left,
					y: r.top,
					width: r.width,
					height: r.height,
					radius,
					color,
					age
				});
			}
			return scene;
		};
		let scrollDirection = 0;
		let lastScrollY = scrollY;
		const render = () => {
			if (scrollY !== lastScrollY) {
				scrollDirection = Math.sign(scrollY - lastScrollY);
				lastScrollY = scrollY;
			}
			onFrame();
			renderer.frame(buildScene());
		};
		const move = (c, to, seconds, ease = easeInOut, update = () => {}) => {
			c.from = c.to;
			c.to = to;
			c.ease = ease;
			c.p = 0;
			return tween(seconds, (t) => {
				c.p = t;
				update(t);
			});
		};
		const reveals = [];
		let fail = () => {};
		const failed = new Promise((_, reject) => fail = reject);
		failed.catch(() => {});
		async function draw(c, task) {
			const box = {
				task,
				cursor: c,
				e: 0,
				opacity: 1,
				badge: null,
				badgeInside: false
			};
			const corner = {
				task,
				fx: 0,
				fy: 0
			};
			const [x, y] = posOf(c);
			const to = resolve(corner);
			await move(c, corner, sizeTiming ? travelSeconds(Math.hypot(to.x - x, to.y - y)) : TRAVEL_SECONDS);
			if (task.parent && !task.parent.built) {
				const waitingSince = performance.now();
				try {
					while (!task.parent.built) {
						if (state === "ended") throw ABORT;
						await new Promise((r) => wakers.add(r));
					}
				} finally {
					debug.agents.idleMs += performance.now() - waitingSince;
				}
			}
			c.working = true;
			const workingSince = performance.now();
			c.scale = .85;
			boxes.add(box);
			render();
			const { width, height } = task.size();
			const rect = task.rect();
			box.badgeInside = rect.bottom > innerHeight - 24 * scale;
			const area = Math.min(1, rect.width * rect.height / (innerWidth * innerHeight));
			const f = sizeTiming ? sizeFactor(rect.width, rect.height) : 1;
			const full = .4 + area * .6;
			const seconds = sizeTiming ? dragSeconds(full, rect.width, rect.height) : full;
			await move(c, {
				task,
				fx: 1,
				fy: 1
			}, seconds, easeInOut, (t) => {
				box.e = easeInOut(t);
				const w = Math.round(box.e * width);
				const h = Math.round(box.e * height);
				box.badge = w && h ? `${w} × ${h}` : null;
			});
			c.scale = 1;
			const timed = f === 1 ? tween : (seconds, update) => tween(seconds * f, update);
			const stop = () => {
				c.working = false;
				debug.agents.workingMs += performance.now() - workingSince;
			};
			if (!pipeline) return reveal(c, task, box, timed, stop);
			stop();
			const revealing = reveal(c, task, box, timed, () => {});
			revealing.catch(fail);
			reveals.push(revealing);
		}
		/** Reveals a dragged-out task, marks it built, and plays its ripple; `stop` ends the agent's work. */
		async function reveal(c, task, box, timed, stop) {
			try {
				await task.reveal(timed, {
					band: (e) => e === null ? bands.delete(task) : bands.set(task, {
						e,
						color: c.agent.color
					}),
					count: (kind) => debug.stats[STAT_OF[kind]]++,
					caret: (typed) => typed && task.node ? carets.set(task, typed) : carets.delete(task),
					overlayLost: () => renderer.lost === true,
					zIndex
				});
			} finally {
				bands.delete(task);
				carets.delete(task);
				stop();
			}
			task.built = true;
			wake();
			const ripple = {
				task,
				color: c.agent.color,
				age: 0
			};
			ripples.add(ripple);
			tween(RIPPLE_SECONDS, (t) => ripple.age = t * RIPPLE_SECONDS).catch(() => {}).finally(() => ripples.delete(ripple));
			onTaskBuilt?.(task);
			if (firstView && debug.firstViewBuiltAt === null && firstView.every((t) => t.built)) debug.firstViewBuiltAt = performance.now();
			tween(.25, (t) => box.opacity = 1 - t).catch(() => {}).finally(() => boxes.delete(box));
		}
		async function run() {
			debug.startedAt = performance.now();
			loop.start();
			const agentsDone = Promise.all(cursors.map(async (c, a) => {
				await tween(a * .2);
				for (let task = await next(c); task; task = await next(c)) await draw(c, task);
			}));
			await Promise.race([agentsDone, failed]);
			const exits = cursors.map((c) => tween(.2).then(() => move(c, c.offstage(), .9, easeIn)));
			const exited = Promise.all(exits);
			exited.catch(() => {});
			await Promise.race([Promise.all(reveals), failed]);
			await settleAll(tween);
			await exited;
		}
		/** Removes everything the swarm added; `completed` decides whether onDone runs. */
		const end = (completed, failure) => {
			if (state === "ended") return;
			state = "ended";
			loop.stop();
			wake();
			for (const cleanup of cleanups.splice(0).reverse()) try {
				cleanup();
			} catch (reason) {
				failure ??= { reason };
			}
			debug.doneAt = performance.now();
			if (!failure && completed) try {
				onDone?.();
			} catch (reason) {
				failure = { reason };
			}
			if (failure) rejectFinished(failure.reason);
			else resolveFinished();
		};
		const begin = () => {
			if (state !== "idle") return;
			state = "running";
			run().then(() => end(true), (error) => {
				end(false, error === ABORT ? void 0 : { reason: error });
			});
		};
		render();
		if (start === "now") begin();
		else {
			const waitForView = async () => {
				while (state === "idle" && !tasks.some((t) => t.seen)) await new Promise((r) => wakers.add(r));
				begin();
			};
			waitForView();
		}
		return {
			finished,
			/** Jumps to the finished result and removes the swarm; onDone runs. */
			finish() {
				if (state === "idle") return end(true);
				if (state !== "running") return;
				loop.markDone();
				onFinish?.();
				wake();
				loop.settleActive();
			},
			/** Removes everything now, wherever the build is; onDone does not run. */
			destroy() {
				end(false);
			},
			/** Changes the speed while it runs: 2 is twice as fast. */
			setSpeed(value) {
				if (value > 0) loop.setSpeed(value);
			}
		};
	}
	// runtime-src/skip.ts
	function shouldSkip(nodes) {
		const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
		const fallbackShown = nodes.some((node) => node.getAnimations?.().some((a) => a.animationName === "swarm-build-fallback" && a.playState === "finished"));
		return reduced || fallbackShown || nodes.length === 0;
	}
	// runtime-src/view-watcher.ts
	/**
	* True when an ancestor that clips its overflow hides `node`'s top edge (where the observer sees a
	* hidden block) while some of the block shows inside it and the viewport.
	*/
	function topClipped(node, r) {
		let clip = {
			left: 0,
			top: 0,
			right: innerWidth,
			bottom: innerHeight
		};
		for (let p = node.parentElement; p && p !== document.body; p = p.parentElement) {
			const cs = getComputedStyle(p);
			if (cs.overflowX === "visible" && cs.overflowY === "visible") continue;
			const b = p.getBoundingClientRect();
			clip = {
				left: Math.max(clip.left, b.left),
				top: Math.max(clip.top, b.top),
				right: Math.min(clip.right, b.right),
				bottom: Math.min(clip.bottom, b.bottom)
			};
		}
		const shows = Math.min(r.right, clip.right) > Math.max(r.left, clip.left) && Math.min(r.bottom, clip.bottom) > Math.max(r.top, clip.top);
		const edge = r.top >= clip.top && r.top < clip.bottom && Math.min(r.right, clip.right) > Math.max(r.left, clip.left);
		return shows && !edge;
	}
	/**
	* Marks tasks as seen when their element scrolls into view. `lookahead` (viewport heights) moves
	* the line a block's top must pass from 90% of the viewport down by that much: 0.5 marks blocks
	* up to half a screen below the viewport as seen.
	*/
	function viewWatcher(tasks, nodeOf, lookahead = 0, viewportRatio = .9) {
		const ahead = Math.max(0, lookahead);
		const ratio = Number.isFinite(viewportRatio) ? Math.min(1, Math.max(0, viewportRatio)) : .9;
		return (wake) => {
			const byNode = /* @__PURE__ */ new Map();
			tasks.forEach((t) => {
				const node = nodeOf(t);
				if (!byNode.has(node)) byNode.set(node, []);
				byNode.get(node).push(t);
			});
			const line = () => innerHeight * (ratio + ahead);
			const stuck = (r, left) => left <= 2 || r.top - left > line();
			const check = () => {
				let seen = false;
				const left = (document.scrollingElement ?? document.documentElement).scrollHeight - innerHeight - scrollY;
				byNode.forEach((list, node) => {
					if (list.every((t) => t.seen)) return;
					const held = list.some((t) => !t.seen && t.parent && !t.parent.built);
					const r = node.getBoundingClientRect();
					if (r.bottom <= 0 || r.right < 0 || r.left > innerWidth || r.top >= Math.max(innerHeight, line())) return;
					if (r.top > line() && !stuck(r, left)) return;
					if (r.top >= 0 && r.top <= line() && !held && !stuck(r, left) && !topClipped(node, r)) return;
					list.forEach((t) => t.seen = true);
					io.unobserve(node);
					seen = true;
				});
				return seen;
			};
			const io = new IntersectionObserver((entries) => {
				for (const e of entries) {
					if (!e.isIntersecting) continue;
					byNode.get(e.target)?.forEach((t) => t.seen = true);
					io.unobserve(e.target);
				}
				check();
				wake();
			}, { rootMargin: `0px 0px ${Math.round((ratio + ahead - 1) * 100)}% 0px` });
			byNode.forEach((_, node) => io.observe(node));
			let frame = 0;
			const onScroll = () => {
				if (frame) return;
				frame = requestAnimationFrame(() => {
					frame = 0;
					if (check()) wake();
				});
			};
			addEventListener("scroll", onScroll, {
				capture: true,
				passive: true
			});
			let poll = 0;
			let frames = 0;
			const tick = () => {
				poll = 0;
				if (++frames % 12 === 0 && check()) wake();
				if (tasks.some((t) => !t.seen)) poll = requestAnimationFrame(tick);
			};
			poll = requestAnimationFrame(tick);
			return () => {
				cancelAnimationFrame(frame);
				cancelAnimationFrame(poll);
				io.disconnect();
				removeEventListener("scroll", onScroll, { capture: true });
			};
		};
	}
	// runtime-src/image-mode.ts
	function normalizeImages(targets) {
		return (Array.isArray(targets) ? targets : [targets]).filter((t) => Boolean(t)).flatMap((t) => {
			const node = t instanceof Element ? t : t.el;
			if (!node?.parentElement) return [];
			const given = t instanceof Element ? null : t.regions;
			const parsed = node.dataset.swarmRegions ? parseRegions(node.dataset.swarmRegions) : [];
			const regions = given?.length ? given : parsed.length ? parsed : autoRegions();
			const src = (t instanceof Element ? null : t.src) || imageSource(node);
			if (!src) {
				console.warn("swarm-build: no image URL for", node);
				return [];
			}
			return [{
				node,
				regions,
				src
			}];
		});
	}
	/** The image paints in its content box; tasks measure against that. */
	function contentBox(node) {
		const cs = getComputedStyle(node);
		const px = (v) => parseFloat(v) || 0;
		const r = node.getBoundingClientRect();
		const l = px(cs.borderLeftWidth) + px(cs.paddingLeft);
		const t = px(cs.borderTopWidth) + px(cs.paddingTop);
		const width = r.width - l - px(cs.borderRightWidth) - px(cs.paddingRight);
		const height = r.height - t - px(cs.borderBottomWidth) - px(cs.paddingBottom);
		return {
			left: r.left + l,
			top: r.top + t,
			width,
			height,
			bottom: r.top + t + height
		};
	}
	/**
	* Builds each target image region by region: a blank canvas covers the image and each region
	* of it sweeps in after a cursor drags its box. `finished` always resolves. `onDone` runs once
	* when the build completes or `finish()` is called, never after `destroy()`.
	*/
	function swarmBuild(targets, options = {}) {
		const items = normalizeImages(targets);
		const unpend = () => items.forEach(({ node }) => node.removeAttribute("data-swarm-pending"));
		if (shouldSkip(items.map((i) => i.node))) return skip(unpend, options.onDone);
		const { canvas = "white" } = options;
		const layers = [];
		const places = [];
		const tasks = items.flatMap((item, target) => item.regions.map((region) => {
			const { node } = item;
			const { x, y, w, h } = region;
			const task = {
				item,
				target,
				region,
				seen: false,
				rect: () => {
					const b = contentBox(node);
					const r = {
						left: b.left + x / 100 * b.width,
						top: b.top + y / 100 * b.height
					};
					return {
						...r,
						width: w / 100 * b.width,
						height: h / 100 * b.height,
						bottom: r.top + h / 100 * b.height
					};
				},
				size: () => {
					const img = node;
					return {
						width: (img.naturalWidth || node.offsetWidth) * w / 100,
						height: (img.naturalHeight || node.offsetHeight) * h / 100
					};
				},
				reveal: (tween) => tween(.45, (t) => layers[target].tiles.get(task).style.clipPath = inset(region, easeOut(t) * h))
			};
			return task;
		}));
		const prepare = () => {
			const parents = /* @__PURE__ */ new Map();
			const undo = [];
			items.forEach(({ node, src }, target) => {
				const parent = node.parentElement;
				if (!parents.has(parent)) {
					parents.set(parent, parent.style.position);
					if (["static", ""].includes(getComputedStyle(parent).position)) parent.style.position = "relative";
				}
				const layer = el("div", {
					position: "absolute",
					pointerEvents: "none",
					zIndex: "1",
					overflow: "hidden"
				});
				layer.setAttribute("aria-hidden", "true");
				node.after(layer);
				const place = () => {
					const b = contentBox(node);
					const p = parent.getBoundingClientRect();
					Object.assign(layer.style, {
						left: `${b.left - p.left - parent.clientLeft + parent.scrollLeft}px`,
						top: `${b.top - p.top - parent.clientTop + parent.scrollTop}px`,
						width: `${b.width}px`,
						height: `${b.height}px`,
						borderRadius: getComputedStyle(node).borderRadius
					});
				};
				place();
				places.push(place);
				const observer = new ResizeObserver(place);
				observer.observe(node);
				const cover = el("div", {
					position: "absolute",
					inset: "0",
					background: canvas
				}, layer);
				const tiles = /* @__PURE__ */ new Map();
				tasks.filter((t) => t.target === target).forEach((t) => tiles.set(t, el("div", {
					position: "absolute",
					inset: "0",
					backgroundImage: `url(${JSON.stringify(src)})`,
					backgroundSize: "100% 100%",
					clipPath: inset(t.region, 0)
				}, layer)));
				layers[target] = {
					cover,
					tiles
				};
				undo.push(() => {
					observer.disconnect();
					layer.remove();
				});
			});
			unpend();
			return () => {
				undo.forEach((fn) => fn());
				parents.forEach((position, parent) => parent.style.position = position);
			};
		};
		const settleAll = (tween) => tween(.4, (t) => layers.forEach(({ cover }) => cover.style.opacity = String(1 - t)));
		return runSwarm(tasks, {
			prepare,
			observe: viewWatcher(tasks, (t) => t.item.node, options.lookahead),
			settleAll,
			unpend,
			onFrame: () => places.forEach((place) => place()),
			options: {
				start: "visible",
				...options
			}
		});
	}
	// runtime-src/ownership.ts
	/** Each block's own clip-path, kept while any swarm holds it, so overlapping swarms restore it once. */
	const owned = /* @__PURE__ */ new WeakMap();
	function hold(node) {
		const entry = owned.get(node) ?? {
			clip: node.style.clipPath,
			inert: node.inert,
			count: 0
		};
		entry.count++;
		owned.set(node, entry);
		return entry;
	}
	function release(node) {
		const entry = owned.get(node);
		if (!entry || --entry.count > 0) return;
		owned.delete(node);
		node.style.clipPath = entry.clip;
		node.inert = entry.inert;
	}
	/** How many swarms hold `node` right now (0 when none). */
	function heldCount(node) {
		return owned.get(node)?.count ?? 0;
	}
	// runtime-src/reveal/css-fallback.ts
	/** Height of the gold glow above the sweep front, in px. */
	const GLOW = 28;
	/**
	* The same clip sweep, with a gold gradient at its front drawn by a fixed div of its own rather
	* than the overlay: for transformed blocks and after the overlay's context is lost. The div is
	* at the overlay's z-index and the block's own styles (position included) are never touched.
	*/
	const cssFallback = {
		kind: "css",
		async reveal({ node, tween, zIndex }) {
			const glow = el("div", {
				position: "fixed",
				left: "0",
				top: "0",
				height: `${GLOW}px`,
				pointerEvents: "none",
				zIndex: String(zIndex),
				background: `linear-gradient(to bottom, transparent, color-mix(in srgb, ${GOLD_TOKEN} 55%, transparent) 85%, ${GOLD_TOKEN})`,
				opacity: "0"
			});
			glow.setAttribute("aria-hidden", "true");
			glow.setAttribute("data-swarm-fallback", "");
			document.body.appendChild(glow);
			try {
				await tween(SWEEP_SECONDS, (t) => {
					const e = easeOut(t);
					node.style.clipPath = sweep(e);
					const { visible, frontY } = sweepFront(node.getBoundingClientRect(), e);
					const top = Math.max(visible.top, frontY - GLOW);
					Object.assign(glow.style, {
						transform: `translate3d(${visible.left}px, ${top}px, 0)`,
						width: `${visible.width}px`,
						height: `${Math.max(0, frontY - top)}px`,
						opacity: String(1 - e * e)
					});
				});
			} finally {
				glow.remove();
			}
		}
	};
	// runtime-src/reveal/strategy.ts
	function chooseReveal({ typing, transformed, overlayLost }) {
		if (typing) return "caret";
		if (overlayLost || transformed()) return "css";
		return "band";
	}
	/** True when `node` or an ancestor has a CSS transform. */
	function hasTransform(node) {
		for (let n = node; n; n = n.parentElement) {
			const t = getComputedStyle(n).transform;
			if (t && t !== "none") return true;
		}
		return false;
	}
	// runtime-src/page-mode.ts
	/**
	* Builds live page elements in place. Every block is hidden, then a cursor drags out its box and
	* it sweeps in; plain-text blocks type themselves in. A block inside another block waits for it.
	* Blocks below the fold wait until they scroll into view.
	*/
	function swarmBuildPage(blocks = "[data-swarm-block]", options = {}) {
		const list = typeof blocks === "string" ? document.querySelectorAll(blocks) : blocks ?? [];
		const nodes = [...new Set(list)].filter((n) => n instanceof Element && n.isConnected && n.checkVisibility?.() !== false);
		const unpend = () => nodes.forEach((n) => n.removeAttribute("data-swarm-pending"));
		if (shouldSkip(nodes)) return skip(unpend, options.onDone);
		const typeSpeed = (options.typeSpeed ?? 0) > 0 ? options.typeSpeed : 1;
		const strategy = options.reveal ?? bandReveal;
		const byNode = /* @__PURE__ */ new Map();
		const tasks = nodes.map((node) => {
			const text = typeable(node);
			const task = {
				node,
				seen: false,
				text,
				role: classifyRole(blockFeatures(node, text !== null)),
				clip: "",
				inert: false,
				restore: null,
				radius: getComputedStyle(node).borderRadius,
				rect: () => node.getBoundingClientRect(),
				size: () => {
					const box = node;
					if (box instanceof HTMLElement) return {
						width: box.offsetWidth,
						height: box.offsetHeight
					};
					const r = box.getBoundingClientRect();
					return {
						width: Math.round(r.width),
						height: Math.round(r.height)
					};
				},
				reveal: async (tween, hooks) => {
					if (heldCount(node) === 1) node.inert = task.inert;
					const path = chooseReveal({
						typing: task.text !== null,
						transformed: () => hasTransform(node),
						overlayLost: hooks.overlayLost()
					});
					if (path !== "caret") {
						const chosen = path === "css" ? cssFallback : strategy;
						hooks.count(chosen.kind);
						await chosen.reveal({
							node,
							tween,
							progress: (e) => hooks.band(e),
							zIndex: hooks.zIndex
						});
						hooks.band(null);
						node.style.clipPath = task.clip;
						return;
					}
					const original = [...node.childNodes];
					const typed = document.createTextNode("");
					const rest = el("span", { color: "transparent" });
					const line = el("span");
					line.append(typed, rest);
					node.replaceChildren(line);
					node.style.clipPath = task.clip;
					const text = task.text;
					const restore = () => node.replaceChildren(...original);
					task.restore = restore;
					hooks.caret(typed);
					await tween(Math.min(1.6, .15 + text.length * .03) / typeSpeed, (t) => {
						const n = Math.round(t * text.length);
						typed.data = text.slice(0, n);
						rest.textContent = text.slice(n);
					});
					hooks.caret(null);
					restore();
					task.restore = null;
				}
			};
			byNode.set(node, task);
			return task;
		});
		tasks.forEach((task) => {
			for (let p = task.node.parentElement; p && !task.parent; p = p.parentElement) task.parent = byNode.get(p);
		});
		const prepare = () => {
			tasks.forEach((t) => {
				({clip: t.clip, inert: t.inert} = hold(t.node));
				t.node.style.clipPath = HIDDEN;
				t.node.inert = true;
			});
			unpend();
			return () => {
				tasks.forEach((t) => {
					t.restore?.();
					release(t.node);
				});
			};
		};
		return runSwarm(tasks, {
			prepare,
			observe: viewWatcher(tasks, (t) => t.node, options.lookahead, options.viewportRatio),
			settleAll: async () => {},
			unpend,
			options
		});
	}
	// runtime-src/index.ts
	/** Builds every element with a `data-swarm` attribute, each with its own swarm. */
	function swarmBuildAll(selector = "[data-swarm]", options) {
		return [...document.querySelectorAll(selector)].map((node) => swarmBuild(node, options));
	}
	exports.AGENT_NAMES = AGENT_NAMES;
	exports.AUTO_HEADCOUNT = AUTO_HEADCOUNT;
	exports.DEFAULT_AGENTS = DEFAULT_AGENTS;
	exports.FALLBACK_PALETTE = FALLBACK_PALETTE;
	exports.HIDDEN = HIDDEN;
	exports.ROLES = ROLES;
	exports.agentLabel = agentLabel;
	exports.allocateHeadcount = allocateHeadcount;
	exports.autoAgents = autoAgents;
	exports.autoRegions = autoRegions;
	exports.blockFeatures = blockFeatures;
	exports.classifyRole = classifyRole;
	exports.createRenderer = createRenderer;
	exports.defaultRendererFactory = defaultRendererFactory;
	exports.extractPalette = extractPalette;
	exports.parseRegions = parseRegions;
	exports.pickTask = pickTask;
	exports.resolvePalette = resolvePalette;
	exports.roleOfAgent = roleOfAgent;
	exports.setRendererFactory = setRendererFactory;
	exports.swarmBuild = swarmBuild;
	exports.swarmBuildAll = swarmBuildAll;
	exports.swarmBuildPage = swarmBuildPage;
	exports.sweep = sweep;
	exports.sweepFront = sweepFront;
	return exports;
})({});

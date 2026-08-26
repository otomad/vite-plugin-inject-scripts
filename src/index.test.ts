import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "vite";
import { describe, expect, it } from "vitest";
import injectScripts from "./index.js";
import type { PluginOptions } from "./type.js";

/**
 * Build a plugin instance, run `configResolved`, and expose its hooks for
 * direct invocation. Most tests drive the plugin this way so they stay fast and
 * deterministic without starting a real Vite server.
 */
function setupPlugin(options: PluginOptions, command: "serve" | "build" = "serve") {
	const plugin = injectScripts(options) as any;
	plugin.configResolved({ root: "/project", command });
	return plugin;
}

/**
 * Full dev pipeline: `configResolved` + `configureServer` (which populates the
 * internal bundle -> route map for external scripts), plus a `render` helper
 * that invokes the `transformIndexHtml` handler directly.
 */
function makeRenderer(options: PluginOptions, command: "serve" | "build" = "serve") {
	const plugin = setupPlugin(options, command);
	const routes = new Map<string, (req: any, res: any) => void>();
	plugin.configureServer({
		middlewares: { use: (route: string, fn: (req: any, res: any) => void) => routes.set(route, fn) },
	});
	return {
		plugin,
		routes,
		render: (html: string, filename = "/project/index.html") =>
			plugin.transformIndexHtml.handler(html, { filename, path: filename }),
	};
}

const HTML = `<!doctype html>
<html>
	<head>
		<title>t</title>
	</head>
	<body>
		<div id="app"></div>
	</body>
</html>`;

describe("injectTo positions", () => {
	it("places scripts at head-prepend/head-append/body-prepend/body-append", async () => {
		const { render } = makeRenderer({
			minifyHtml: false,
			scripts: [
				{ src: "a.js", source: "/* head-prepend */", injectTo: "head-prepend", inline: true },
				{ src: "b.js", source: "/* head-append */", injectTo: "head-append", inline: true },
				{ src: "c.js", source: "/* body-prepend */", injectTo: "body-prepend", inline: true },
				{ src: "d.js", source: "/* body-append */", injectTo: "body-append", inline: true },
			],
		});
		const out = await render(HTML);

		const iHeadPre = out.indexOf("/* head-prepend */");
		const iHeadApp = out.indexOf("/* head-append */");
		const iBodyPre = out.indexOf("/* body-prepend */");
		const iBodyApp = out.indexOf("/* body-append */");
		const iTitle = out.indexOf("<title>t</title>");
		const iApp = out.indexOf('<div id="app">');

		expect(iHeadPre).toBeGreaterThan(-1);
		expect(iHeadPre).toBeLessThan(iTitle); // prepended to head, before <title>
		expect(iHeadApp).toBeGreaterThan(iTitle); // appended to head, after <title>
		expect(iHeadApp).toBeLessThan(out.indexOf("</head>"));
		expect(iBodyPre).toBeGreaterThan(out.indexOf("<body>"));
		expect(iBodyPre).toBeLessThan(iApp); // prepended to body, before #app
		expect(iBodyApp).toBeGreaterThan(iApp); // appended to body, after #app
	});
});

describe("entry module detection", () => {
	const ENTRY_HTML = `<!doctype html>
<html>
	<head>
		<title>t</title>
		<script type="module" crossorigin src="/index.js"></script>
	</head>
	<body></body>
</html>`;

	it("inserts head-append before the entry module script", async () => {
		const { render } = makeRenderer({
			minifyHtml: false,
			scripts: [{ src: "a.js", source: "/* a */", injectTo: "head-append", inline: true }],
		});
		const out = await render(ENTRY_HTML);
		expect(out.indexOf("/* a */")).toBeLessThan(out.indexOf('src="/index.js"'));
	});

	it("appends to head when no entry matches", async () => {
		const { render } = makeRenderer({
			minifyHtml: false,
			scripts: [{ src: "a.js", source: "/* a */", injectTo: "head-append", inline: true }],
		});
		const out = await render(HTML);
		expect(out.indexOf("/* a */")).toBeGreaterThan(out.indexOf("<title>t</title>"));
		expect(out.indexOf("/* a */")).toBeLessThan(out.indexOf("</head>"));
	});

	it("respects a custom entryFile name", async () => {
		const { render } = makeRenderer({
			minifyHtml: false,
			entryFile: "main.js",
			scripts: [{ src: "a.js", source: "/* a */", injectTo: "head-append", inline: true }],
		});
		const out = await render(ENTRY_HTML.replace("/index.js", "/main.js"));
		expect(out.indexOf("/* a */")).toBeLessThan(out.indexOf('src="/main.js"'));
	});
});

describe("inline vs external", () => {
	it("inlines content without src when inline: true", async () => {
		const { render } = makeRenderer({
			minifyHtml: false,
			scripts: [{ src: "foo.js", source: "console.log(1);", inline: true }],
		});
		const out = await render(HTML);
		expect(out).toContain("<script>console.log(1);</script>");
		expect(out).not.toContain("/@inject-scripts/");
	});

	it("references the dev route when not inline", async () => {
		const { render } = makeRenderer({
			minifyHtml: false,
			scripts: [{ src: "foo.js", source: "console.log(1);" }],
		});
		const out = await render(HTML);
		expect(out).toContain('src="/@inject-scripts/foo.js"');
		expect(out).not.toContain("console.log(1);");
	});

	it("uses a .json route for json scripts", async () => {
		const { render } = makeRenderer({
			minifyHtml: false,
			scripts: [{ src: "data.json", source: "{}", type: "importmap" }],
		});
		const out = await render(HTML);
		expect(out).toContain('src="/@inject-scripts/data.json"');
	});
});

describe("type attribute", () => {
	it("omits type for classic/script/iife", async () => {
		for (const type of ["classic", "script", "iife"] as const) {
			const { render } = makeRenderer({
				minifyHtml: false,
				scripts: [{ src: "a.js", source: "x", type, inline: true }],
			});
			const out = await render(HTML);
			expect(out).not.toContain("type=");
		}
	});

	it("maps known and custom types", async () => {
		for (const [type, value] of [
			["module", "module"],
			["importmap", "importmap"],
			["text/foo", "text/foo"],
		] as const) {
			const { render } = makeRenderer({
				minifyHtml: false,
				scripts: [{ src: "a.js", source: "x", type, inline: true }],
			});
			const out = await render(HTML);
			expect(out).toContain(`type="${value}"`);
		}
	});
});

describe("script attributes", () => {
	it("passes through boolean and string attributes", async () => {
		const { render } = makeRenderer({
			minifyHtml: false,
			scripts: [
				{
					src: "foo.js",
					source: "x",
					inline: true,
					async: true,
					defer: true,
					crossOrigin: "anonymous",
					blocking: ["render"],
					noModule: true,
					referrerPolicy: "no-referrer",
					fetchPriority: "high",
				},
			],
		});
		const out = await render(HTML);
		expect(out).toContain("async");
		expect(out).toContain("defer");
		expect(out).toContain('crossorigin="anonymous"');
		expect(out).toContain('blocking="render"');
		expect(out).toContain("nomodule");
		expect(out).toContain('referrerpolicy="no-referrer"');
		expect(out).toContain('fetchpriority="high"');
	});

	it("does not leak the internal isJson flag as an attribute", async () => {
		const { render } = makeRenderer({
			minifyHtml: false,
			scripts: [{ src: "data.json", source: "{}", type: "importmap", inline: true }],
		});
		const out = await render(HTML);
		expect(out).toContain('type="importmap"');
		expect(out).not.toMatch(/isjson/i);
	});
});

describe("filterHtml", () => {
	it("filters by function", async () => {
		const { render } = makeRenderer({
			minifyHtml: false,
			scripts: [{ src: "a.js", source: "/* a */", inline: true, filterHtml: f => f.includes("index") }],
		});
		expect(await render(HTML, "/project/index.html")).toContain("/* a */");
		expect(await render(HTML, "/project/admin.html")).toBeUndefined();
	});

	it("filters by RegExp", async () => {
		const { render } = makeRenderer({
			minifyHtml: false,
			scripts: [{ src: "a.js", source: "/* a */", inline: true, filterHtml: /index\.html$/ }],
		});
		expect(await render(HTML, "/project/index.html")).toContain("/* a */");
		expect(await render(HTML, "/project/index.htmlx")).toBeUndefined();
	});

	it("filters by exact string", async () => {
		const { render } = makeRenderer({
			minifyHtml: false,
			scripts: [{ src: "a.js", source: "/* a */", inline: true, filterHtml: "/project/index.html" }],
		});
		expect(await render(HTML, "/project/index.html")).toContain("/* a */");
		expect(await render(HTML, "/project/admin.html")).toBeUndefined();
	});

	it("filters by array (any match)", async () => {
		const { render } = makeRenderer({
			minifyHtml: false,
			scripts: [
				{ src: "a.js", source: "/* a */", inline: true, filterHtml: [/admin\.html$/, "/project/index.html"] },
			],
		});
		expect(await render(HTML, "/project/index.html")).toContain("/* a */");
		expect(await render(HTML, "/project/admin.html")).toContain("/* a */");
		expect(await render(HTML, "/project/other.html")).toBeUndefined();
	});

	it("filters each script independently", async () => {
		const { render } = makeRenderer({
			minifyHtml: false,
			scripts: [
				{ src: "a.js", source: "/* a */", inline: true, filterHtml: /index\.html$/ },
				{ src: "b.js", source: "/* b */", inline: true, filterHtml: /admin\.html$/ },
			],
		});
		const indexHtml = await render(HTML, "/project/index.html");
		expect(indexHtml).toContain("/* a */");
		expect(indexHtml).not.toContain("/* b */");

		const adminHtml = await render(HTML, "/project/admin.html");
		expect(adminHtml).toContain("/* b */");
		expect(adminHtml).not.toContain("/* a */");
	});

	it("does not let another script's filter gate an unfiltered script", async () => {
		const { render } = makeRenderer({
			minifyHtml: false,
			scripts: [
				{ src: "a.js", source: "/* a */", inline: true, filterHtml: /index\.html$/ },
				{ src: "b.js", source: "/* b */", inline: true },
			],
		});
		const admin = await render(HTML, "/project/admin.html");
		expect(admin).toContain("/* b */");
		expect(admin).not.toContain("/* a */");
	});
});

describe("source transforms", () => {
	it("applies modify() to source", async () => {
		const { render } = makeRenderer({
			minifyHtml: false,
			scripts: [{ src: "foo.js", source: "const N = 1;", inline: true, modify: s => s.replace("1", "42") }],
		});
		const out = await render(HTML);
		expect(out).toContain("const N = 42;");
		expect(out).not.toContain("const N = 1;");
	});

	it("wraps iife type with use strict", async () => {
		const { render } = makeRenderer({
			minifyHtml: false,
			scripts: [{ src: "foo.js", source: "console.log(1);", inline: true, type: "iife" }],
		});
		const out = await render(HTML);
		expect(out).toContain('"use strict"');
		expect(out).toContain("console.log(1);");
	});

	it("compiles TypeScript sources", async () => {
		const { render } = makeRenderer({
			minifyHtml: false,
			scripts: [{ src: "foo.ts", source: "const x: number = 1;", inline: true, type: "module" }],
		});
		const out = await render(HTML);
		expect(out).toContain("const x = 1");
		expect(out).not.toContain(": number");
	});
});

describe("html minification", () => {
	it("keeps formatting when minifyHtml is false", async () => {
		const { render } = makeRenderer({
			minifyHtml: false,
			scripts: [{ src: "a.js", source: "/* a */", inline: true }],
		});
		const out = await render(HTML);
		expect(out).toContain("\n");
	});

	it("minifies when minifyHtml is true (default)", async () => {
		const { render } = makeRenderer({
			minifyHtml: true,
			scripts: [{ src: "a.js", source: "/* a */", inline: true }],
		});
		const out = await render(HTML);
		expect(out).not.toContain("\n");
	});
});

describe("generateBundle", () => {
	it("emits assets for external scripts and skips inline ones", () => {
		const plugin = setupPlugin(
			{
				minifyHtml: false,
				scripts: [
					{ src: "foo.js", source: "console.log(1);" },
					{ src: "data.json", source: "{}", type: "importmap" },
					{ src: "inline.js", source: "/* inline */", inline: true },
				],
			},
			"build",
		);

		const emitted: { type: string; name: string; source: string }[] = [];
		const filenames: Record<string, string> = {};
		const ctx = {
			emitFile(file: { type: string; name: string; source: string }) {
				const id = `ref${emitted.length}`;
				emitted.push(file);
				filenames[id] = `assets/${file.name}`;
				return id;
			},
			getFileName(id: string) {
				return filenames[id];
			},
		};
		plugin.generateBundle.call(ctx);

		expect(emitted.map(e => e.name)).toEqual(["foo.js", "data.json"]);
		expect(emitted.every(e => e.type === "asset")).toBe(true);
	});
});

describe("integration with vite", () => {
	it("transforms index html through a real dev server", async () => {
		const root = mkdtempSync(join(tmpdir(), "inject-scripts-"));
		const server = await createServer({
			root,
			configFile: false,
			logLevel: "silent",
			server: { middlewareMode: true },
			plugins: [
				injectScripts({
					minifyHtml: false,
					scripts: [{ src: "foo.js", source: "console.log(1);", inline: true }],
				}),
			],
		});
		try {
			const html = await server.transformIndexHtml(
				"/index.html",
				"<!doctype html><html><head></head><body></body></html>",
			);
			expect(html).toContain("<script>console.log(1);</script>");
		} finally {
			await server.close();
			rmSync(root, { recursive: true, force: true });
		}
	});
});

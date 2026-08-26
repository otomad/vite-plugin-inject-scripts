import { readFileSync } from "node:fs";
import path, { posix, resolve as resolve_ } from "node:path";
import { compileTypeScript, minifyHtml, minifyJavaScript, wrapIife } from "js-build-utils";
import { parseHTML } from "linkedom";
import type { Plugin, ResolvedConfig } from "vite";
import type { Filter, PriorScript, Tag, PluginOptions } from "./type.js";
export type { PriorScript, PluginOptions };

export default ({
	scripts: scripts_,
	entryFile = "index.js",
	minifyHtml: shouldMinifyHtml = true,
}: PluginOptions): Plugin => {
	let config: ResolvedConfig;
	const resolve = (...paths: string[]) => resolve_(config.root, ...paths);
	let isDev: boolean;
	let scripts: (PriorScript & { source: string; isJson: boolean })[];
	const filters: Filter[] = [];
	const bundles = new Map<string, string>();

	return {
		name: "vite-plugin-inject-scripts",
		enforce: "pre",

		async configResolved(resolvedConfig) {
			config = resolvedConfig;
			isDev = config.command === "serve";

			scripts = scripts_.map(script => {
				if (typeof script === "string") script = { src: script };
				script.src = script.src.trim();
				script.type ??= "classic";
				script.injectTo ??= "head-append";
				if (script.filterHtml) filters.push(script.filterHtml);
				const isJson =
					["importmap", "speculationrules", "application/json", "text/json"].includes(script.type) ||
					path.extname(script.src).toLowerCase() === ".json";

				let source = readFileSync(resolve(script.src), "utf-8");
				if (script.modify) source = script.modify(source);
				if (script.type === "iife") source = wrapIife(source);
				if (script.src.match(/\.[cm]?tsx?/i)) source = compileTypeScript(source);
				if (!isDev && !isJson) source = minifyJavaScript(source, "oxc");

				return Object.assign(script, { source, isJson });
			});
		},

		generateBundle() {
			for (const { src, source, inline, isJson } of scripts) {
				if (inline) continue;
				const name = path.parse(src).name + (isJson ? ".json" : ".js");
				const referenceId = this.emitFile({
					type: "asset",
					name,
					source,
				});
				bundles.set(src, this.getFileName(referenceId));
			}
		},

		configureServer(server) {
			for (const { src, source, inline, isJson } of scripts) {
				if (inline) continue;
				let route = posix.join("/@inject-scripts", src);
				route = posix.format({ ...path.parse(route), base: "", ext: isJson ? ".json" : ".js" });
				server.middlewares.use(route, (_, res) => {
					res.setHeader("Content-Type", isJson ? "application/json" : "text/javascript");
					res.end(source);
				});
				bundles.set(src, route);
			}
		},

		transformIndexHtml: {
			order: "post",
			async handler(html, { filename, path }) {
				if (!filterHtmlFilename(filename, filters as never)) return;

				const tags = scripts
					.map(script => {
						const {
							src,
							type,
							injectTo,
							modify: _modify,
							filterHtml,
							inline,
							blocking,
							source,
							...attrs
						} = script;
						if (!filterHtmlFilename(filename, filterHtml)) return undefined!;

						if (blocking) attrs.blocking = blocking.join(" ");
						if (!inline) attrs.src = bundles.get(src);
						attrs.type = type === "classic" || type === "script" || type === "iife" ? undefined : type;

						const result: Tag = {
							tag: "script",
							injectTo: injectTo!,
							attrs,
							children: inline ? source : undefined,
						};
						return result;
					})
					.filter(Boolean);
				const group = Object.groupBy(tags, ({ injectTo }) => injectTo);

				const dom = parseHTML(html);
				const { document } = dom.window;
				const entry = dom.window.document.head.querySelector(
					`script[type="module"][crossorigin]:is([src$="/${entryFile}"], [src$="${entryFile}"])`,
				);
				const createElement = (tag: Tag) => {
					const script = document.createElement(tag.tag) as HTMLScriptElement;
					if (tag.children) script.textContent = tag.children;
					for (const [attr, value] of Object.entries(tag.attrs ?? {}))
						if (value != null && value !== false) script.setAttribute(attr, value === true ? "" : value);
					return script;
				};
				group["head-prepend"]?.toReversed().forEach(tag => document.head.prepend(createElement(tag)));
				group["body-prepend"]?.toReversed().forEach(tag => document.body.prepend(createElement(tag)));
				group["body-append"]?.forEach(tag => document.body.append(createElement(tag)));
				group["head-append"]?.forEach(tag => {
					const script = createElement(tag);
					if (!entry) document.head.append(script);
					else document.head.insertBefore(script, entry);
				});

				let newHtml = dom.document.toString();
				if (shouldMinifyHtml)
					newHtml = await minifyHtml(newHtml, { html: "terser", js: "oxc", css: "lightningcss" });
				return newHtml;
			},
		},
	};
};

function filterHtmlFilename(filename: string, filter?: Filter): boolean {
	if (typeof filter === "function") return filter(filename);
	if (filter instanceof RegExp) return filter.test(filename);
	if (typeof filter === "string") return filename === filter;
	if (Array.isArray(filter) && filter.length > 0)
		return filter.some(oneFilter => filterHtmlFilename(filename, oneFilter));
	return true;
}

# vite-plugin-inject-scripts

A [Vite](https://vitejs.dev/) plugin that injects `<script>` tags into the generated HTML files.

## Overview

This plugin lets you declare a list of "prior" scripts and decide exactly **where** and **how** each one is inserted into every (or selected) HTML file:

- Inline the script content or reference it via `src`;
- Place it at the beginning/end of `<head>` or `<body>`;
- Set a `type` (`module`, `importmap`, `speculationrules`, IIFE, or a custom value);
- Pass through arbitrary attributes (`async`, `defer`, `crossorigin`, `nonce`, …);
- Restrict injection to specific HTML files;
- Transform TypeScript sources on the fly.

It works both during development (`vite serve`) and at build time (`vite build`).

## Comparison with [`vite-plugin-inject-script`](https://www.npmjs.com/package/vite-plugin-inject-script)

The two names differ by a single letter, but the plugins do fundamentally different things:

| | `vite-plugin-inject-script` | `vite-plugin-inject-scripts` (this plugin) |
| --- | --- | --- |
| **What it modifies** | The JavaScript **bundle** | The **HTML** document |
| **Where it injects** | Prepends a JavaScript snippet (as a string) to the top of the entry JS file — the one named by Rollup/Rolldown's `output.entryFileNames` (commonly `index.js`) | Inserts `<script>` elements into `<head>` / `<body>` |
| **What it injects** | Raw JS source code | `<script>` tags — inline or external, any `type` |
| **Control over placement** | Single, fixed position (before all entry code) | Four positions (`head-prepend`, `head-append`, `body-prepend`, `body-append`) |

In short:

- `vite-plugin-inject-script` changes the **JavaScript output** — it prepends code into the bundled entry file.
- `vite-plugin-inject-scripts` changes the **HTML output** — it adds `<script>` tags to the page.

If you need to run some code *before your app's entry module* by injecting it into the JS chunk itself, use `vite-plugin-inject-script`. If you need to add `<script>` tags to the page (polyfills, import maps, speculation rules, analytics, inline config, …), use this plugin.

## Installation

```bash
npm install --save-dev vite-plugin-inject-scripts
# or
pnpm add -D vite-plugin-inject-scripts
# or
yarn add -D vite-plugin-inject-scripts
```

## Usage

```ts
// vite.config.ts
import { defineConfig } from "vite";
import injectScripts from "vite-plugin-inject-scripts";

export default defineConfig({
	plugins: [
		injectScripts({
			scripts: [
				// A script file, injected at the end of <head>.
				{ src: "src/polyfills.js" },
				// An inline module snippet, injected at the start of <body>.
				{ src: "config.js", source: "window.__APP__ = {};", type: "module", injectTo: "body-prepend", inline: true },
			],
		}),
	],
});
```

## Options

### `scripts`

Type: `(string | PriorScript)[]` (required)

The scripts to inject. Each entry is either a plain path string (equivalent to `{ src: "…" }`) or a [`PriorScript`](#priorscript) object. The order in the array is preserved within each injection position.

### `entryFile`

Type: `string` — default: `"index.js"`

The name of the entry JS file. It is used to locate the entry `<script type="module" crossorigin src="…">` tag in the document head, so that scripts injected at `head-append` are inserted **before** the entry (and therefore execute first). If no matching entry tag is found, `head-append` scripts are simply appended to the end of `<head>`.

### `minifyHtml`

Type: `boolean` — default: `true`

Minify the resulting HTML (HTML via [terser](https://github.com/terser/html-minifier-terser), inline JS via [oxc-minify](https://oxc.rs/), CSS via [lightningcss](https://lightningcss.dev/)). Set to `false` to keep the original formatting.

## `PriorScript`

Each script object accepts the following fields:

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `src` | `string` | — | Path to the script (`js` / `ts` / `tsx` / `jsx` / `json`), resolved from Vite's `root`. When `source` is set, the file is not read and `src` is only used to derive the output file name/extension. |
| `source` | `string` | — | The script content. When set, it overrides the file read from `src`. |
| `type` | `string` | `"classic"` | See [script types](#type). |
| `injectTo` | `"head-prepend" \| "head-append" \| "body-prepend" \| "body-append"` | `"head-append"` | Where to insert the `<script>` tag. |
| `modify` | `(code: string) => string` | — | Transform the source before it is compiled/minified. |
| `filterHtml` | `Filter` | — | Only inject into matching HTML files. See [filtering](#filtering). |
| `inline` | `boolean` | `false` | Inline the content directly (no `src` attribute). |
| `async` | `boolean` | — | The `async` attribute. |
| `blocking` | `("render")[]` | — | The `blocking` attribute (values are joined). |
| `crossOrigin` | `"anonymous" \| "use-credentials"` | — | The `crossorigin` attribute. |
| `defer` | `boolean` | — | The `defer` attribute. |
| `fetchPriority` | `"high" \| "low" \| "auto"` | — | The `fetchpriority` attribute. |
| `integrity` | `string` | — | The `integrity` attribute. |
| `noModule` | `boolean` | — | The `nomodule` attribute. |
| `nonce` | `boolean` | — | The `nonce` attribute. |
| `referrerPolicy` | `string` | — | The `referrerpolicy` attribute. |
| *(any other)* | `string` | — | Any additional attribute is passed through to the `<script>` tag. |

### `type`

| Value | Emitted `type` | Notes |
| --- | --- | --- |
| `"classic"` / `"script"` | *(none)* | A classic script. |
| `"module"` | `type="module"` | A JavaScript module. |
| `"iife"` | *(none)* | The content is wrapped in an IIFE and marked `"use strict"`. |
| `"importmap"` | `type="importmap"` | An import map (JSON). |
| `"speculationrules"` | `type="speculationrules"` | Speculation rules (JSON). |
| any other string | `type="…"` | Passed through verbatim. |

### Filtering

`filterHtml` accepts a `string` (exact file path match), a `RegExp`, a function `(filename: string) => boolean`, or an array of these (matched if **any** applies). The filter is matched against the resolved path of the HTML file being transformed. Scripts without a `filterHtml` are injected into every HTML file.

```ts
injectScripts({
	scripts: [
		{ src: "src/analytics.js", filterHtml: /index\.html$/ },
		{ src: "src/admin.js", filterHtml: filename => filename.includes("/admin/") },
		{ src: "src/one-off.js", filterHtml: ["/project/index.html", /about\.html$/] },
	],
});
```

## How it works

- **Resolving files**: `src` is resolved relative to Vite's `root`. Setting `source` skips the file read.
- **Transformations** (in order): `modify` → IIFE wrapping (`type: "iife"`) → TypeScript compilation (`.ts` / `.tsx` / `.mts` / `.cts`) → JS minification (build only, skipped for JSON).
- **Development**: non-inline scripts are served from a `/@inject-scripts/…` route.
- **Build**: non-inline scripts are emitted as assets (`.js` / `.json`) and referenced by their hashed file name; JSON content is left unminified.

## Examples

### Inline a config module before the app

```ts
injectScripts({
	scripts: [
		{
			src: "app.config.js",
			source: `export default ${JSON.stringify({ apiBase: "/api" })};`,
			type: "module",
			injectTo: "head-prepend",
			inline: true,
		},
	],
});
```

### TypeScript source compiled on the fly

```ts
injectScripts({
	scripts: [
		{ src: "src/bootstrap.ts", type: "module" },
	],
});
```

### Import map

```ts
injectScripts({
	scripts: [
		{
			src: "import-map.json",
			source: JSON.stringify({ imports: { vue: "https://esm.sh/vue" } }),
			type: "importmap",
		},
	],
});
```

### An IIFE with custom attributes

```ts
injectScripts({
	scripts: [
		{ src: "src/legacy.js", type: "iife", injectTo: "body-append", defer: true },
	],
});
```

## License

[MIT](./LICENSE)

# vite-plugin-inject-scripts

[![npm](https://img.shields.io/npm/v/vite-plugin-inject-scripts?logo=npm&logoColor=%23CB3837&label=npm&labelColor=white&color=%23CB3837)](https://www.npmjs.org/package/vite-plugin-inject-scripts)
[![GitHub](https://img.shields.io/npm/v/vite-plugin-inject-scripts?logo=github&label=GitHub&color=%23181717)](https://github.com/otomad/vite-plugin-inject-scripts)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)][license-url]

[license-url]: https://opensource.org/licenses/MIT

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

## Installation

```bash
# npm
npm install --save-dev vite-plugin-inject-scripts

# yarn
yarn add --dev vite-plugin-inject-scripts

# pnpm
pnpm add --save-dev vite-plugin-inject-scripts

# bun
bun add --dev vite-plugin-inject-scripts
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
				{ src: "config.js", source: `window.__APP__ = {};`, type: "module", injectTo: "body-prepend", inline: true },
			],
		}),
	],
});
```

## Options

### `scripts`

**Type:** `(string | PriorScript)[]`\
**(Required)**

The scripts to inject. Each entry is either a plain path string (equivalent to `{ src: "…" }`) or a [`PriorScript`](#priorscript) object. The order in the array is preserved within each injection position.

### `entryFile`

**Type:** `string | true | RegExp | ((jsFilePath: string) => boolean)`\
**Default:** `true`

Selects the entry `<script type="module" crossorigin>` element in `<head>`. Scripts injected at `head-append` are placed immediately **before** it, so they execute first. If no element matches, `head-append` scripts are appended to the end of `<head>`.

- `true` (default): the **last** `<script type="module" crossorigin>` in `<head>`.
- `string`: the script whose `src` ends with `/name` or equals `name`.
- `RegExp`: the first script whose `src` matches the pattern.
- `function`: the first script whose `src` makes the callback return `true`.

### `minifyHtml`

**Type:** `boolean | "terser" | "next" | "swc"`\
**Default:** `true`

Minify the HTML output when building. `true` uses the default engine `terser` ([html-minifier-terser](https://github.com/terser/html-minifier-terser)). Pass an engine name to use a different engine — you must install that engine yourself. Set `false` to disable HTML minification (inline `<script>` / `<style>` content is then left untouched as well).

### `minifyJS`

**Type:** `boolean | "oxc" | "swc" | "esbuild" | "terser"`\
**Default:** `true`

Minify the JavaScript output when building. `true` uses the default engine `oxc` ([oxc-minify](https://oxc.rs/)). Pass an engine name to use a different engine — you must install that engine yourself. This also controls the minifier used for inline `<script>` content during HTML minification. Set `false` to disable.

> **Note:** JSON scripts (`.json`, `importmap`, `speculationrules`, …) are always minified and are not affected by this option.

### `minifyCSS`

**Type:** `boolean | "lightningcss" | "esbuild" | "cssnano" | "clean-css" | "csso"`\
**Default:** `true`

Choose the CSS minification engine used during HTML minification (for inline `<style>` content). `true` uses the default engine `lightningcss`. Pass an engine name to use a different engine — you must install that engine yourself. Set `false` to disable.

## `PriorScript`

Each script object accepts the following fields:

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `src` | `string` | — | Path to the script (`js` / `ts` / `jsx` / `tsx` / `json`), resolved from Vite's `root`.<br>When `source` is set, the file is not read and `src` is only used for the output file name/extension;<br>When `source` is set and `inline` is `true`, `src` is only checked for a `.json` extension to treat the content as JSON. |
| `source` | `string` | — | Override the script content with an inline string.<br>**Not recommended** unless the code is very simple — prefer a separate file referenced by `src`, since inline content loses editor highlighting and autocompletion. |
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

See [`HTMLScriptElement.supports()`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLScriptElement/supports_static) static method.

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
- **Transformations** (in order): `modify` → IIFE wrapping (`type: "iife"`) → TypeScript compilation (`.ts` / `.tsx` / `.mts` / `.cts`) → minification (build only).
- **Minification**: controlled by [`minifyHtml`](#minifyhtml), [`minifyJS`](#minifyjs) and [`minifyCSS`](#minifycss); JSON scripts are always minified.
- **Development**: non-inline scripts are served from a `/@inject-scripts/…` virtual route.
- **Build**: non-inline scripts are emitted as assets (`.js` / `.json`) and referenced by their hashed file name.

## Examples

### TypeScript source compiled on the fly

```ts
injectScripts({
	scripts: [
		{ src: "src/bootstrap.ts", type: "module" },
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

## License

[MIT](LICENSE)

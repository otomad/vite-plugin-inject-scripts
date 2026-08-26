import type { HtmlTagDescriptor } from "vite";

export type Filter = (RegExp | string)[] | RegExp | string | ((filename: string) => boolean);

export type Tag = Override<HtmlTagDescriptor, { injectTo: NonNullable<PriorScript["injectTo"]>; children?: string; }>;

type Override<TSource, TOverrider> = Omit<TSource, keyof TOverrider> & TOverrider;

export interface PluginOptions {
	/**
	 * Prior scripts.
	 */
	scripts: (string | PriorScript)[];
	/**
	 * Specify the entry js file name.
	 * @default "index.js"
	 */
	entryFile?: string;
	/**
	 * Minify HTML when building?
	 * @default true
	 */
	minifyHtml?: boolean;
}

export interface PriorScript {
	/** Path to the script (js/ts/jsx/tsx). */
	src: string;
	/**
	 * - `"classic" | "script"`: Classic script.
	 * - `"module"`: JavaScript module.
	 * - `"iife"`: Wrap the script content with IIFE, and mark as "use strict".
	 * - `"importmap"`: Import map (JSON).
	 * - `"speculationrules"`: Speculation rules (JSON).
	 * - Others - Directly pass to the type attribute.
	 * @default "classic"
	 */
	type?: "classic" | "script" | "module" | "iife" | "importmap" | "speculationrules" | string & {};
	/**
	 * Select where to insert the script.
	 * @default "head-append"
	 */
	injectTo?: "head-prepend" | "head-append" | "body-prepend" | "body-append";
	/** Modify the source script content. */
	modify?(html: string): string;
	/** Filter the HTML files to be injected with the script. */
	filterHtml?: Filter;
	/** Directly set the script innerText? */
	inline?: boolean;
	/** The script will be fetched in parallel to parsing and evaluated as soon as it is available. */
	async?: boolean;
	/** Certain operations should be blocked on the fetching of the script. */
	blocking?: ("render")[];
	/** Allow error logging for sites which use a separate domain for static media. */
	crossOrigin?: "anonymous" | "use-credentials";
	/** Indicate the script is meant to be executed after the document has been parsed, but before firing `DOMContentLoaded` event. */
	defer?: boolean;
	/** Provide a hint of the relative priority to use when fetching an external script. */
	fetchPriority?: "high" | "low" | "auto";
	/** Contain inline metadata that a user agent can use to verify that a fetched resource has been delivered without unexpected manipulation. */
	integrity?: string;
	/** Serve fallback scripts to older browsers that do not support modular JavaScript code. */
	noModule?: boolean;
	/** A cryptographic nonce (number used once) to allow scripts in a script-src Content-Security-Policy. */
	nonce?: boolean;
	/** Indicate which referrer to send when fetching the script, or resources fetched by the script. */
	referrerPolicy?: "no-referrer" | "no-referrer-when-downgrade" | "origin" | "origin-when-cross-origin" | "same-origin" | "strict-origin" | "strict-origin-when-cross-origin" | "unsafe-url";
	/** Any other custom attributes. */
	[x: string]: any;
}

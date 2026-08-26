import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["src/**/*.ts", "!src/**/*.test.ts"],
	root: "src",
	format: ["esm", "cjs"],
	dts: true,
	unbundle: true,
	shims: false,
	treeshake: true,
	deps: {
		neverBundle: true,
	},
});

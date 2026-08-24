import { defineConfig } from "oxfmt";

export default defineConfig({
	printWidth: 120,
	tabWidth: 4,
	useTabs: true,
	semi: true,
	singleQuote: false,
	arrowParens: "avoid",
	htmlWhitespaceSensitivity: "ignore",
	jsdoc: false,
	sortImports: {
		partitionByComment: true,
		partitionByNewline: true,
		newlinesBetween: false,
	},
	vueIndentScriptAndStyle: true,
});

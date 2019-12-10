import fs from "fs";
import dts from "rollup-plugin-dts";

const external = id => id.startsWith("stardazed/");
const paths = id => id.startsWith("stardazed/") && `${id.replace("stardazed", "..")}`;

function module(name) {
	return [
		{
			input: `build/${name}/index.js`,
			output: [{
				file: `dist/${name}/index.js`,
				format: "esm",
				paths
			}],
			plugins: [],
			external
		},
		{
			input: `build/${name}/index.d.ts`,
			output: [{
				file: `dist/${name}/index.d.ts`,
				format: "esm",
				paths,
				banner: `/// <reference path="../global-types.d.ts" />`
			}],
			plugins: [
				dts()
			],
			external
		}
	];
}

fs.mkdirSync("dist", { recursive: true });
fs.copyFileSync("src/global-types.d.ts", "dist/global-types.d.ts");

export default [
	"core",
	"container",
	"vector",
	"geometry",
].flatMap(module);
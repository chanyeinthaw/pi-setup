import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../..");
const outputDirectory = resolve(root, "dist");
const output = resolve(outputDirectory, "subagents");

await mkdir(outputDirectory, { recursive: true });
await rm(output, { force: true });

const result = await Bun.build({
  entrypoints: [resolve(root, "packages/subagents/src/main.tsx")],
  compile: { outfile: output },
  define: {
    "process.env.OPENTUI_LIBC": JSON.stringify("glibc"),
  },
  minify: false,
  sourcemap: "none",
  target: "bun",
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

console.log(`Built ${output}`);

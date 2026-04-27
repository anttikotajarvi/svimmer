// tsup.config.ts
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/**/*.ts"],
  outDir: "dist",
  format: ["esm"],
  bundle: false,
  splitting: false,
  sourcemap: true,
  dts: false
});
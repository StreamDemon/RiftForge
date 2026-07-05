import { defineConfig } from "vite-plus";

export default defineConfig({
  // `convex dev` regenerates _generated in its own (prettier) style on every
  // run; formatting it would just fight the code generator.
  fmt: { ignorePatterns: ["packages/backend/convex/_generated/**"] },
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
  run: {
    cache: true,
  },
  test: {
    // Run each package as its own Vitest project so root-level `vp test`
    // applies per-package configs (plugins, resolve conditions, environments)
    // exactly like `vp run <pkg>#test` does. Without this the root config is
    // the only one loaded — apps/web then resolves solid-js to its
    // non-reactive server build and the Convex bindings tests fail.
    projects: ["apps/*", "packages/*"],
  },
});

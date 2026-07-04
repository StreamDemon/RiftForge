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
});

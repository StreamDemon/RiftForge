import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: {},
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  test: {
    // convex-test runs Convex functions in an isolated JS runtime that
    // matches the Convex server environment more closely than Node.
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
  },
});

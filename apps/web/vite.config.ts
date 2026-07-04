import tailwindcss from "@tailwindcss/vite";
import solid from "vite-plugin-solid";
import { defineConfig, type PluginOption } from "vite-plus";

// The cast bridges the plugins' own `vite` type identities and Vite+'s core
// types — same plugin contract, different declaration files.
const plugins = [solid(), tailwindcss()] as PluginOption[];

export default defineConfig({
  fmt: {},
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  plugins,
  // The bindings tests exercise signals, not the DOM — no jsdom needed.
  test: { environment: "node" },
  // Vitest loads this same config. Under Node's default resolve conditions
  // solid-js resolves to its non-reactive server build, where effects never
  // run — so point tests at the browser build instead.
  resolve: process.env.VITEST ? { conditions: ["browser", "development"] } : undefined,
});

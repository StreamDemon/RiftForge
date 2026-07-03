/* Minimal typing for Vite's `import.meta.glob`, which the tests use to hand
 * convex-test the Convex function modules. (The full `vite/client` types
 * aren't resolvable here: vite is consumed through vite-plus.) */
interface ImportMeta {
  glob(pattern: string): Record<string, () => Promise<unknown>>;
}

/** Stylesheets are side-effect imports handled by Vite. */
declare module "*.css" {}

/** Vite-injected environment variables used by the app. */
interface ImportMetaEnv {
  /** Convex deployment URL, e.g. http://127.0.0.1:3210 for the anonymous local backend. */
  readonly VITE_CONVEX_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

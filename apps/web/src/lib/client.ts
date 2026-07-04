import { ConvexClient } from "convex/browser";

const url = import.meta.env.VITE_CONVEX_URL;
if (!url) {
  throw new Error("VITE_CONVEX_URL is not set — point it at your Convex deployment.");
}

/** The app-wide Convex connection. Connects on first import. */
export const convex = new ConvexClient(url);

/** Runs once when the server starts. */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.AUTH_DEV_LOGIN === "1") {
    const where = process.env.NODE_ENV === "production" ? "a PRODUCTION build" : "development";
    console.warn(
      [
        "",
        "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!",
        `!!  AUTH_DEV_LOGIN=1: dev sign-in is ENABLED in ${where}.`,
        "!!  Anyone can sign in as any email at /dev-login. Use it for local tests only.",
        "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!",
        "",
      ].join("\n")
    );
  }
  if (process.env.NODE_ENV === "production" && !process.env.AUTH_SECRET) {
    console.error("[auth] AUTH_SECRET is not set: sign-in will fail until it is.");
  }
  // Book search: load Project Gutenberg's catalog and the browse lists a few seconds after start,
  // when they are missing or stale (they are kept in SQLite, so most restarts fetch nothing).
  if (process.env.CATALOG_WARMUP !== "0") {
    const timer = setTimeout(() => {
      import("@/lib/server/catalog")
        .then((m) => m.warmCatalog())
        .catch((err) => console.warn("[catalog] warm-up failed:", err instanceof Error ? err.message : err));
    }, 5000);
    timer.unref?.();
  }
}

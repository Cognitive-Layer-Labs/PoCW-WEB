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
}

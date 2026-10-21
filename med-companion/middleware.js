import { NextResponse } from "next/server";

export function middleware(request) {
  const host = request.headers.get("host") || "";
  let allowed = false;
  try {
    const hostname = new URL(`http://${host}`).hostname;
    allowed =
      !/[\s\\/@]/.test(host) &&
      (["localhost", "127.0.0.1", "[::1]"].includes(hostname) ||
        (!!process.env.COMPANION_ORIGIN &&
          new URL(process.env.COMPANION_ORIGIN).protocol === "https:" &&
          new URL(process.env.COMPANION_ORIGIN).host === host));
  } catch {}
  if (!allowed)
    return new NextResponse(
      "Unrecognized host. Configure COMPANION_ORIGIN for remote access.",
      { status: 403 },
    );
  if (
    process.env.COMPANION_ORIGIN?.startsWith("https://") &&
    new URL(process.env.COMPANION_ORIGIN).host === host &&
    request.nextUrl.protocol !== "https:"
  ) {
    if (request.nextUrl.pathname.startsWith("/api/"))
      return NextResponse.json(
        { error: "Use HTTPS for remote access." },
        { status: 426 },
      );
    const destination = new URL(process.env.COMPANION_ORIGIN);
    destination.pathname = request.nextUrl.pathname;
    destination.search = request.nextUrl.search;
    return NextResponse.redirect(destination, 308);
  }
  // This app uses raster data URLs, not Next's remote image optimizer.
  if (request.nextUrl.pathname === "/_next/image")
    return new NextResponse("Not found", { status: 404 });
  if (
    request.nextUrl.pathname.startsWith("/api/") &&
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    return NextResponse.json(
      { error: "Cross-site requests are not allowed." },
      { status: 403 },
    );
  return NextResponse.next();
}
export const config = { matcher: ["/((?!_next/static|_next/webpack-hmr).*)"] };

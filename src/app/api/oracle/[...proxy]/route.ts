import { NextRequest, NextResponse } from "next/server";

const ORACLE_BASE_URL = process.env.POCW_ORACLE_BASE_URL;
const ORACLE_API_KEY = process.env.POCW_API_KEY;

const ALLOWED_ROOTS = new Set(["index", "verify", "upload"]);

function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message, code: "INVALID_CONFIG" }, { status });
}

function buildTargetUrl(pathSegments: string[], request: NextRequest): URL {
  if (!ORACLE_BASE_URL) {
    throw new Error("POCW_ORACLE_BASE_URL is missing in frontend server env");
  }

  const root = pathSegments[0];
  if (!root || !ALLOWED_ROOTS.has(root)) {
    throw new Error("Requested oracle route is not allowed");
  }

  const base = ORACLE_BASE_URL.endsWith("/") ? ORACLE_BASE_URL.slice(0, -1) : ORACLE_BASE_URL;
  const path = pathSegments.join("/");
  const url = new URL(`${base}/api/${path}`);

  request.nextUrl.searchParams.forEach((value, key) => {
    url.searchParams.append(key, value);
  });

  return url;
}

async function proxy(request: NextRequest, pathSegments: string[]): Promise<NextResponse> {
  if (!ORACLE_API_KEY) {
    return jsonError("POCW_API_KEY is missing in frontend server env", 500);
  }

  let targetUrl: URL;
  try {
    targetUrl = buildTargetUrl(pathSegments, request);
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Invalid oracle proxy request", 400);
  }

  const headers = new Headers();
  headers.set("Authorization", `Bearer ${ORACLE_API_KEY}`);

  const contentType = request.headers.get("content-type");
  if (contentType) {
    headers.set("content-type", contentType);
  }

  const accept = request.headers.get("accept");
  if (accept) {
    headers.set("accept", accept);
  }

  const method = request.method;
  let body: BodyInit | undefined;

  if (method !== "GET" && method !== "HEAD") {
    body = await request.arrayBuffer();
  }

  let upstream: Response;
  try {
    upstream = await fetch(targetUrl, {
      method,
      headers,
      body,
      cache: "no-store",
    });
  } catch {
    return jsonError("Cannot reach oracle service from frontend proxy", 502);
  }

  const responseHeaders = new Headers();
  const responseType = upstream.headers.get("content-type");
  if (responseType) {
    responseHeaders.set("content-type", responseType);
  }

  const retryAfter = upstream.headers.get("retry-after");
  if (retryAfter) {
    responseHeaders.set("retry-after", retryAfter);
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ proxy: string[] }> }
): Promise<NextResponse> {
  const { proxy: pathSegments } = await context.params;
  return proxy(request, pathSegments);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ proxy: string[] }> }
): Promise<NextResponse> {
  const { proxy: pathSegments } = await context.params;
  return proxy(request, pathSegments);
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ proxy: string[] }> }
): Promise<NextResponse> {
  const { proxy: pathSegments } = await context.params;
  return proxy(request, pathSegments);
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ proxy: string[] }> }
): Promise<NextResponse> {
  const { proxy: pathSegments } = await context.params;
  return proxy(request, pathSegments);
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ proxy: string[] }> }
): Promise<NextResponse> {
  const { proxy: pathSegments } = await context.params;
  return proxy(request, pathSegments);
}

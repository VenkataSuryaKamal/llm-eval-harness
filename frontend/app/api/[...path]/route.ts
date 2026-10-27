/**
 * Server-side proxy: browser -> Next.js (/api/...) -> FastAPI backend.
 *
 * Why: the backend API key lives only on the server (BACKEND_API_KEY) and is
 * attached here, so it is never shipped to the browser. Only known API paths and
 * methods are forwarded, which prevents this route being abused as an open proxy (SSRF).
 */
import { NextRequest, NextResponse } from "next/server";

const BACKEND = (process.env.BACKEND_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");
const API_KEY = process.env.BACKEND_API_KEY ?? "";
const MAX_BODY = 2_000_000; // bytes
const ALLOWED_ROOTS = new Set(["models", "config", "datasets", "runs", "playground"]);
const SEGMENT = /^[A-Za-z0-9_.-]+$/;

async function forward(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  if (!path.length || !ALLOWED_ROOTS.has(path[0]) || !path.every((p) => SEGMENT.test(p) && p !== ".." && p !== ".")) {
    return NextResponse.json({ detail: "Not found." }, { status: 404 });
  }

  const headers: Record<string, string> = {};
  const contentType = req.headers.get("content-type");
  if (contentType) headers["content-type"] = contentType;
  if (API_KEY) headers["x-api-key"] = API_KEY;
  // Client-supplied X-Forwarded-For is deliberately NOT forwarded: it is trivially
  // forged and would let callers dodge the backend's per-IP rate limit.

  let body: ArrayBuffer | undefined;
  if (req.method !== "GET" && req.method !== "DELETE") {
    const declared = Number(req.headers.get("content-length") ?? 0);
    if (declared > MAX_BODY) return NextResponse.json({ detail: "Request too large." }, { status: 413 });
    body = await req.arrayBuffer();
    if (body.byteLength > MAX_BODY) return NextResponse.json({ detail: "Request too large." }, { status: 413 });
  }

  const url = `${BACKEND}/api/${path.map(encodeURIComponent).join("/")}${req.nextUrl.search}`;
  try {
    const res = await fetch(url, { method: req.method, headers, body, cache: "no-store", redirect: "manual" });
    const out = new Headers();
    for (const h of ["content-type", "content-disposition"]) {
      const v = res.headers.get(h);
      if (v) out.set(h, v);
    }
    return new NextResponse(res.status === 204 ? null : await res.arrayBuffer(), { status: res.status, headers: out });
  } catch {
    return NextResponse.json({ detail: "Backend is unreachable. Is the FastAPI server running?" }, { status: 502 });
  }
}

export const GET = forward;
export const POST = forward;
export const DELETE = forward;

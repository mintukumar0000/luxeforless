import { NextRequest, NextResponse } from "next/server";

function getVtoBaseUrl(): string {
  return (
    process.env.VTO_SERVICE_URL ||
    process.env.NEXT_PUBLIC_VTO_SERVICE_URL ||
    "http://localhost:8000"
  ).replace(/\/$/, "");
}

/** Proxy try-on PNG from Kaggle/ngrok — img tags cannot send ngrok-skip-browser-warning. */
export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get("path");
  if (!path || !path.startsWith("/v1/results/")) {
    return NextResponse.json({ error: "Invalid result path" }, { status: 400 });
  }

  const vtoBase = getVtoBaseUrl();
  const res = await fetch(`${vtoBase}${path}`, {
    headers: { "ngrok-skip-browser-warning": "true" },
    cache: "no-store",
  });

  if (!res.ok) {
    return NextResponse.json(
      { error: "Try-on result not found on VTO service" },
      { status: res.status }
    );
  }

  const bytes = await res.arrayBuffer();
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": res.headers.get("content-type") || "image/png",
      "Cache-Control": "public, max-age=600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

import { NextResponse } from "next/server";
import { proxyLocalTryOn, resolveVtoBackend, submitFashnTryOn } from "@/lib/fashn-router";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { useFashn, model } = resolveVtoBackend();

    if (useFashn) {
      const { id } = await submitFashnTryOn(body);
      return NextResponse.json({
        job_id: id,
        backend: "fashn",
        model,
        status: "processing",
        progress: "generating",
      });
    }

    const res = await proxyLocalTryOn({
      ...body,
      preserve_background: body.preserve_background ?? true,
    });
    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json(data, { status: res.status });
    }
    return NextResponse.json({ ...data, backend: "local" });
  } catch (e) {
    const message = e instanceof Error ? e.message : "VTO submit failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

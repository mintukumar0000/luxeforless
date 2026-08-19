import { NextResponse } from "next/server";
import { pollFashnJob, pollLocalJob } from "@/lib/fashn-router";

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const id = params.id;
  const url = new URL(req.url);
  const backend = url.searchParams.get("backend") ?? "local";

  try {
    if (backend === "fashn") {
      const job = await pollFashnJob(id);
      if (job.status === "completed" && job.output?.[0]) {
        return NextResponse.json({
          job_id: id,
          status: "completed",
          result_url: job.output[0],
          progress: "done",
          processing_time_ms: 0,
        });
      }
      if (job.status === "failed") {
        return NextResponse.json({
          job_id: id,
          status: "failed",
          error: job.error?.message ?? "FASHN try-on failed",
          progress: "error",
        });
      }
      return NextResponse.json({
        job_id: id,
        status: "processing",
        progress: job.status === "processing" ? "generating" : "queued",
      });
    }

    const res = await pollLocalJob(id);
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Status check failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

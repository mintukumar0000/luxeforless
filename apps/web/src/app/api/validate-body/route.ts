import { NextRequest, NextResponse } from "next/server";
import { VTO_SERVICE_URL } from "@/lib/utils";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const image = formData.get("image") as Blob;

  if (!image) {
    return NextResponse.json({ error: "Image required" }, { status: 400 });
  }

  const vtoForm = new FormData();
  vtoForm.append("image", image);

  const res = await fetch(`${VTO_SERVICE_URL}/v1/validate-body`, {
    method: "POST",
    body: vtoForm,
  });

  if (!res.ok) {
    const detail = await res.text();
    return NextResponse.json(
      { error: "Body validation failed", detail },
      { status: res.status }
    );
  }

  const result = await res.json();
  return NextResponse.json(result);
}

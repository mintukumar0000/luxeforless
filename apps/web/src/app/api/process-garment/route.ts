import { NextRequest, NextResponse } from "next/server";
import { VTO_SERVICE_URL } from "@/lib/utils";
import { saveFile } from "@/lib/storage";
import { randomUUID } from "crypto";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const image = formData.get("image") as Blob;
  const category = formData.get("category") as string | null;

  if (!image) {
    return NextResponse.json({ error: "Image required" }, { status: 400 });
  }

  const vtoForm = new FormData();
  vtoForm.append("image", image);
  if (category) vtoForm.append("category", category);

  const res = await fetch(`${VTO_SERVICE_URL}/v1/process-garment`, {
    method: "POST",
    body: vtoForm,
  });

  if (!res.ok) {
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  const result = await res.json();

  const imgBuffer = Buffer.from(result.vto_ready_image, "base64");
  const filename = `${randomUUID()}.png`;
  const url = await saveFile("garments", filename, imgBuffer);

  return NextResponse.json({
    ...result,
    vtoReadyUrl: url,
  });
}

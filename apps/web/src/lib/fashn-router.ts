/**
 * Server-side VTO router — FASHN Try-On Max/v1.6 when API key set, else Kaggle/local GPU.
 */

const FASHN_BASE = "https://api.fashn.ai";

export type VtoBackend = "fashn" | "local";

export function resolveVtoBackend(): { useFashn: boolean; model: string } {
  const key = process.env.FASHN_API_KEY;
  const mode = (process.env.VTO_BACKEND ?? "auto").toLowerCase();
  if (!key) return { useFashn: false, model: "local" };
  if (mode === "local" || mode === "kaggle" || mode === "v15") {
    return { useFashn: false, model: "local" };
  }
  if (mode === "fashn-v16" || mode === "v16") {
    return { useFashn: true, model: "tryon-v1.6" };
  }
  return { useFashn: true, model: "tryon-max" };
}

function fashnHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${process.env.FASHN_API_KEY}`,
    "Content-Type": "application/json",
  };
}

function mapCategory(category: string): string {
  const c = category.replace("_", "-");
  if (c === "one-pieces") return "one-pieces";
  if (c === "bottoms") return "bottoms";
  return "tops";
}

export async function submitFashnTryOn(body: {
  person_image: string;
  garment_image: string;
  category: string;
  garment_photo_type: string;
}): Promise<{ id: string }> {
  const { model } = resolveVtoBackend();
  const person = body.person_image.startsWith("data:")
    ? body.person_image
    : `data:image/jpeg;base64,${body.person_image}`;
  const garment = body.garment_image.startsWith("data:")
    ? body.garment_image
    : `data:image/jpeg;base64,${body.garment_image}`;

  let inputs: Record<string, unknown>;
  if (model === "tryon-v1.6") {
    inputs = {
      model_image: person,
      garment_image: garment,
      category: mapCategory(body.category),
      garment_photo_type: "auto",
      segmentation_free: true,
      mode: process.env.FASHN_V16_MODE ?? "quality",
      output_format: "png",
    };
  } else {
    inputs = {
      model_image: person,
      product_image: garment,
      resolution: process.env.FASHN_RESOLUTION ?? "1k",
      generation_mode: process.env.FASHN_GENERATION_MODE ?? "balanced",
      output_format: "png",
      prompt:
        process.env.FASHN_PROMPT ??
        (body.category.includes("bottom")
          ? "keep original pose, background, and upper clothing unchanged; swap pants only"
          : "keep original pose, background, and pants unchanged; swap upper garment only"),
    };
  }

  const res = await fetch(`${FASHN_BASE}/v1/run`, {
    method: "POST",
    headers: fashnHeaders(),
    body: JSON.stringify({ model_name: model, inputs }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || `FASHN submit failed (${res.status})`);
  }
  if (data.error) throw new Error(String(data.error));
  return { id: data.id };
}

export async function pollFashnJob(id: string): Promise<{
  status: string;
  output?: string[];
  error?: { message?: string };
}> {
  const res = await fetch(`${FASHN_BASE}/v1/status/${id}`, {
    headers: fashnHeaders(),
    cache: "no-store",
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || `FASHN status failed (${res.status})`);
  }
  return data;
}

export async function proxyLocalTryOn(body: unknown): Promise<Response> {
  const base = process.env.VTO_SERVICE_URL || process.env.NEXT_PUBLIC_VTO_SERVICE_URL;
  if (!base) throw new Error("VTO_SERVICE_URL not configured");
  return fetch(`${base}/v1/tryon`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "ngrok-skip-browser-warning": "true",
    },
    body: JSON.stringify(body),
  });
}

export async function pollLocalJob(id: string): Promise<Response> {
  const base = process.env.VTO_SERVICE_URL || process.env.NEXT_PUBLIC_VTO_SERVICE_URL;
  if (!base) throw new Error("VTO_SERVICE_URL not configured");
  return fetch(`${base}/v1/jobs/${id}`, {
    headers: { "ngrok-skip-browser-warning": "true" },
    cache: "no-store",
  });
}

import { VTO_CATEGORY_MAP } from "@/lib/utils";

export function getVtoBaseUrl(): string {
  return process.env.NEXT_PUBLIC_VTO_SERVICE_URL || "http://localhost:8000";
}

function vtoHeaders(extra?: Record<string, string>): Record<string, string> {
  return { "ngrok-skip-browser-warning": "true", ...extra };
}

export async function urlToDataUrl(url: string): Promise<string> {
  const absolute = url.startsWith("http") ? url : `${window.location.origin}${url}`;
  const res = await fetch(absolute);
  if (!res.ok) throw new Error(`Failed to load garment image (${res.status})`);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read garment image"));
    reader.readAsDataURL(blob);
  });
}

export async function submitTryOnJob(params: {
  personImageBase64: string;
  garmentDataUrl: string;
  category: keyof typeof VTO_CATEGORY_MAP | string;
  garmentPhotoType: "model" | "flat-lay";
  preserveBackground?: boolean;
}): Promise<{ job_id: string; status: string }> {
  const vtoBase = getVtoBaseUrl();
  const person = params.personImageBase64.includes(",")
    ? params.personImageBase64.split(",")[1]
    : params.personImageBase64;
  const garment = params.garmentDataUrl.includes(",")
    ? params.garmentDataUrl.split(",")[1]
    : params.garmentDataUrl;

  const res = await fetch(`${vtoBase}/v1/tryon`, {
    method: "POST",
    headers: vtoHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      person_image: person,
      garment_image: garment,
      category: VTO_CATEGORY_MAP[params.category] || params.category,
      garment_photo_type: params.garmentPhotoType,
      preserve_background: params.preserveBackground ?? true,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`VTO submit failed (${res.status}): ${detail}`);
  }

  const data = await res.json();
  if (data.status === "failed") {
    throw new Error(data.error || "Try-on failed to start");
  }
  return data;
}

export async function pollTryOnJob(
  jobId: string,
  options?: {
    intervalMs?: number;
    maxWaitMs?: number;
    onProgress?: (progress: string | null) => void;
  }
): Promise<{ result_url: string; processing_time_ms: number }> {
  const vtoBase = getVtoBaseUrl();
  const intervalMs = options?.intervalMs ?? 3000;
  const maxWaitMs = options?.maxWaitMs ?? 1_800_000;
  const start = Date.now();
  let lastError = "VTO service unavailable";

  while (Date.now() - start < maxWaitMs) {
    await new Promise((r) => setTimeout(r, intervalMs));
    try {
      const res = await fetch(`${vtoBase}/v1/jobs/${jobId}`, { headers: vtoHeaders() });
      if (!res.ok) {
        lastError = `Status check failed (${res.status})`;
        continue;
      }
      const job = await res.json();
      options?.onProgress?.(job.progress ?? null);
      if (job.status === "completed") {
        return {
          result_url: job.result_url,
          processing_time_ms: job.processing_time_ms ?? 0,
        };
      }
      if (job.status === "failed") {
        throw new Error(job.error || "Try-on failed on VTO service");
      }
      lastError = "";
    } catch (e) {
      if (e instanceof Error && e.message.includes("Try-on failed")) throw e;
      lastError = e instanceof Error ? e.message : "fetch failed";
    }
  }

  throw new Error(
    lastError
      ? `Cannot reach VTO service at ${vtoBase}. Is your Kaggle notebook running? (${lastError})`
      : "Try-on timed out after 30 minutes"
  );
}

export function resolveVtoResultUrl(resultUrl: string): string {
  return resultUrl.startsWith("http") ? resultUrl : `${getVtoBaseUrl()}${resultUrl}`;
}

/** Same-origin URL for displaying try-on images (ngrok blocks raw img src). */
export function toProxiedResultUrl(resultUrl: string): string {
  const path = resultUrl.startsWith("http")
    ? new URL(resultUrl).pathname
    : resultUrl.startsWith("/")
      ? resultUrl
      : `/${resultUrl}`;

  if (path.startsWith("/v1/results/")) {
    return `/api/vto-result?path=${encodeURIComponent(path)}`;
  }

  return resolveVtoResultUrl(resultUrl);
}

export async function preprocessPersonCapture(imageBlob: Blob): Promise<{
  imageDataUrl: string;
  backgroundRemoved: boolean;
}> {
  const vtoBase = getVtoBaseUrl();
  const form = new FormData();
  form.append("image", imageBlob, "capture.jpg");
  form.append("keep_background", "true");
  const res = await fetch(`${vtoBase}/v1/preprocess-person`, {
    method: "POST",
    headers: vtoHeaders(),
    body: form,
  });
  if (!res.ok) {
    throw new Error(`Studio preprocess failed (${res.status})`);
  }
  const data = await res.json();
  return {
    imageDataUrl: `data:image/png;base64,${data.image}`,
    backgroundRemoved: Boolean(data.background_removed),
  };
}

export async function validateBodyCapture(imageBlob: Blob): Promise<{
  valid: boolean;
  issues: string[];
  estimates: Record<string, number> | null;
}> {
  const vtoBase = getVtoBaseUrl();
  const form = new FormData();
  form.append("image", imageBlob, "capture.jpg");
  const res = await fetch(`${vtoBase}/v1/validate-body`, {
    method: "POST",
    headers: vtoHeaders(),
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || err.error || `Validation failed (${res.status})`);
  }
  return res.json();
}

export async function processGarmentImage(
  file: File,
  category?: string
): Promise<{
  vto_ready_image: string;
  detected_color: string;
  suggested_category: string;
  background_removed: boolean;
}> {
  const vtoBase = getVtoBaseUrl();
  const form = new FormData();
  form.append("image", file);
  if (category) form.append("category", category);
  const res = await fetch(`${vtoBase}/v1/process-garment`, {
    method: "POST",
    headers: vtoHeaders(),
    body: form,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Garment processing failed (${res.status}): ${err}`);
  }
  return res.json();
}

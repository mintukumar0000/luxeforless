export const VTO_SERVICE_URL = process.env.VTO_SERVICE_URL || "http://localhost:8000";
export const APP_NAME = "LuxeForLess";
export const APP_TAGLINE = "AI Virtual Try-On Smart Mirror";

export const PRIVACY_NOTICE = {
  retentionDays: 7,
  summary:
    "Your photo is used only for virtual try-on during this session. It is stored for up to 7 days and can be deleted on request.",
};

export const CATEGORY_LABELS: Record<string, string> = {
  tops: "Tops",
  bottoms: "Bottoms",
  one_pieces: "Dresses & Jumpsuits",
};

export const VTO_CATEGORY_MAP: Record<string, "tops" | "bottoms" | "one-pieces"> = {
  tops: "tops",
  bottoms: "bottoms",
  one_pieces: "one-pieces",
};

export function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export function formatPrice(price: number | string): string {
  const n = typeof price === "string" ? parseFloat(price) : price;
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}

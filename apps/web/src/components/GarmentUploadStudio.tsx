"use client";

import { useState, useRef } from "react";
import { Upload, Loader2, CheckCircle } from "lucide-react";
import { cn, CATEGORY_LABELS } from "@/lib/utils";

interface GarmentUploadStudioProps {
  storeId: string;
  onProductCreated?: () => void;
}

const DEFAULT_SIZES = ["XS", "S", "M", "L", "XL", "XXL"];

const DEFAULT_SIZE_CHART: Record<string, { chestCm: number; shoulderCm: number; waistCm: number; lengthCm: number }> = {
  XS: { chestCm: 81, shoulderCm: 38, waistCm: 66, lengthCm: 64 },
  S: { chestCm: 86, shoulderCm: 40, waistCm: 71, lengthCm: 66 },
  M: { chestCm: 91, shoulderCm: 42, waistCm: 76, lengthCm: 68 },
  L: { chestCm: 97, shoulderCm: 44, waistCm: 81, lengthCm: 70 },
  XL: { chestCm: 102, shoulderCm: 46, waistCm: 86, lengthCm: 72 },
  XXL: { chestCm: 107, shoulderCm: 48, waistCm: 91, lengthCm: 74 },
};

export function GarmentUploadStudio({ storeId, onProductCreated }: GarmentUploadStudioProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [processing, setProcessing] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [processed, setProcessed] = useState<{
    vtoReadyUrl: string;
    detected_color: string;
    suggested_category: string;
    background_removed: boolean;
  } | null>(null);
  const [form, setForm] = useState({
    name: "",
    brand: "",
    basePrice: "",
    category: "tops",
    color: "",
  });
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleFile = async (file: File) => {
    setProcessing(true);
    setSuccess(false);
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(file);

    const formData = new FormData();
    formData.append("image", file);

    try {
      const formData = new FormData();
      formData.append("image", file);
      const res = await fetch("/api/process-garment", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Process failed");
      const data = await res.json();
      setProcessed({
        vtoReadyUrl: data.vtoReadyUrl,
        detected_color: data.detected_color,
        suggested_category: data.suggested_category,
        background_removed: data.background_removed,
      });
      setForm((f) => ({
        ...f,
        color: data.detected_color,
        category: data.suggested_category,
      }));
    } catch {
      alert("Failed to process garment image");
    } finally {
      setProcessing(false);
    }
  };

  const handleSave = async () => {
    if (!processed || !form.name || !form.basePrice) return;
    setSaving(true);

    const category = form.category === "one-pieces" ? "one_pieces" : form.category;
    const sizeChart = DEFAULT_SIZES.map((size) => ({
      size,
      ...DEFAULT_SIZE_CHART[size],
    }));

    try {
      await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId,
          name: form.name,
          brand: form.brand || "LuxeForLess",
          category,
          basePrice: parseFloat(form.basePrice),
          color: form.color,
          sizes: DEFAULT_SIZES,
          sizeChart,
          vtoReadyUrl: processed.vtoReadyUrl,
          garmentPhotoType: "flat_lay",
        }),
      });
      setSuccess(true);
      setPreview(null);
      setProcessed(null);
      setForm({ name: "", brand: "", basePrice: "", category: "tops", color: "" });
      onProductCreated?.();
    } catch {
      alert("Failed to save product");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-serif">Garment Upload Studio</h2>
        <p className="text-stone-500 text-sm mt-1">
          Upload flat-lay or model-worn photos. Background is removed automatically and a VTO-ready asset is created.
        </p>
      </div>

      <div
        onClick={() => fileRef.current?.click()}
        className={cn(
          "border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition",
          "border-stone-300 hover:border-stone-500 hover:bg-stone-50"
        )}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
        {processing ? (
          <div className="flex flex-col items-center gap-2 text-stone-500">
            <Loader2 className="animate-spin" size={32} />
            <p>Processing: removing background, detecting color & category...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-stone-500">
            <Upload size={32} />
            <p>Drop garment photo or click to upload</p>
            <p className="text-xs">Supports flat-lay and model-worn photos</p>
          </div>
        )}
      </div>

      {preview && processed && (
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <p className="text-sm font-medium mb-2">VTO-Ready Preview</p>
            <div className="aspect-square bg-stone-100 rounded-xl overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={processed.vtoReadyUrl} alt="Processed" className="w-full h-full object-contain" />
            </div>
            <div className="flex gap-2 mt-2 text-xs text-stone-500">
              <span className="px-2 py-1 bg-stone-100 rounded capitalize">{processed.detected_color}</span>
              <span className="px-2 py-1 bg-stone-100 rounded">
                {processed.background_removed ? "BG removed" : "BG kept"}
              </span>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Product Name *</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-lg"
                placeholder="Classic Cotton Tee"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Brand</label>
              <input
                value={form.brand}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
                className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-lg"
                placeholder="Brand name"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Price (INR) *</label>
                <input
                  type="number"
                  value={form.basePrice}
                  onChange={(e) => setForm({ ...form, basePrice: e.target.value })}
                  className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-lg"
                  placeholder="1299"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Color</label>
                <input
                  value={form.color}
                  onChange={(e) => setForm({ ...form, color: e.target.value })}
                  className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-lg"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Category</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-lg"
              >
                <option value="tops">{CATEGORY_LABELS.tops}</option>
                <option value="bottoms">{CATEGORY_LABELS.bottoms}</option>
                <option value="one-pieces">{CATEGORY_LABELS.one_pieces}</option>
              </select>
            </div>
            <p className="text-xs text-stone-400">
              Default size chart (XS–XXL) will be applied. Edit measurements in the admin panel later.
            </p>
            <button
              onClick={handleSave}
              disabled={saving || !form.name || !form.basePrice}
              className="w-full py-3 rounded-xl bg-stone-900 text-white font-medium disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Product to Catalog"}
            </button>
          </div>
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 text-green-700 bg-green-50 p-4 rounded-xl">
          <CheckCircle size={18} />
          Product saved successfully!
        </div>
      )}
    </div>
  );
}

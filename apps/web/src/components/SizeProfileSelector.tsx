"use client";

import { SizeProfile, UPPER_SIZES, LOWER_SIZES } from "@/lib/size-options";
import { cn } from "@/lib/utils";
import { Shirt, Ruler } from "lucide-react";

interface SizeProfileSelectorProps {
  previewImage: string;
  value: SizeProfile;
  onChange: (profile: SizeProfile) => void;
  onContinue: () => void;
  onRetake: () => void;
}

function SizeChipGroup({
  label,
  icon,
  options,
  selected,
  onSelect,
}: {
  label: string;
  icon: React.ReactNode;
  options: readonly string[];
  selected: string;
  onSelect: (size: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium text-stone-700">
        {icon}
        {label}
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((size) => (
          <button
            key={size}
            type="button"
            onClick={() => onSelect(size)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-sm border transition-colors",
              selected === size
                ? "bg-stone-900 text-white border-stone-900"
                : "bg-white text-stone-600 border-stone-200 hover:border-stone-400"
            )}
          >
            {size}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SizeProfileSelector({
  previewImage,
  value,
  onChange,
  onContinue,
  onRetake,
}: SizeProfileSelectorProps) {
  return (
    <div className="space-y-5">
      <div className="text-center space-y-1">
        <h3 className="text-xl font-serif">Your usual sizes</h3>
        <p className="text-sm text-stone-500">
          Select before we create your studio portrait — improves fit recommendations
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-4 items-start">
        <div className="aspect-[3/4] max-h-[320px] mx-auto w-full bg-stone-100 rounded-2xl overflow-hidden border border-stone-200">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewImage} alt="Your capture" className="w-full h-full object-cover" />
        </div>

        <div className="space-y-5 bg-white rounded-2xl border border-stone-200 p-4">
          <SizeChipGroup
            label="Upper (tops, dresses)"
            icon={<Shirt size={16} className="text-stone-400" />}
            options={UPPER_SIZES}
            selected={value.upper}
            onSelect={(upper) => onChange({ ...value, upper })}
          />
          <SizeChipGroup
            label="Lower (jeans, trousers)"
            icon={<Ruler size={16} className="text-stone-400" />}
            options={LOWER_SIZES}
            selected={value.lower}
            onSelect={(lower) => onChange({ ...value, lower })}
          />
          <p className="text-xs text-stone-400">
            Tip: pick what you normally buy in-store. AI will combine this with your body scan.
          </p>
        </div>
      </div>

      <div className="flex gap-3 justify-center">
        <button
          type="button"
          onClick={onRetake}
          className="px-5 py-2.5 rounded-xl border border-stone-300 text-stone-600"
        >
          Retake photo
        </button>
        <button
          type="button"
          onClick={onContinue}
          className="px-6 py-2.5 rounded-xl bg-stone-900 text-white font-medium"
        >
          Continue · Create studio portrait
        </button>
      </div>
    </div>
  );
}

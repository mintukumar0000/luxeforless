"use client";

import { SizeProfile, UPPER_SIZES, LOWER_SIZES } from "@/lib/size-options";
import {
  TRY_ON_FOCUS_OPTIONS,
  TryOnFocus,
  focusShowsLower,
  focusShowsUpper,
} from "@/lib/try-on-focus";
import { cn } from "@/lib/utils";
import { Shirt, Ruler, Sparkles } from "lucide-react";

interface SizeProfileSelectorProps {
  previewImage: string;
  focus: TryOnFocus;
  onFocusChange: (focus: TryOnFocus) => void;
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
  focus,
  onFocusChange,
  value,
  onChange,
  onContinue,
  onRetake,
}: SizeProfileSelectorProps) {
  return (
    <div className="space-y-5">
      <div className="text-center space-y-1">
        <h3 className="text-xl font-serif">Quick setup</h3>
        <p className="text-sm text-stone-500">What are you trying on today? Pick sizes — one tap to browse next.</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {TRY_ON_FOCUS_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => onFocusChange(opt.id)}
            className={cn(
              "rounded-xl border p-3 text-left transition",
              focus === opt.id
                ? "border-stone-900 bg-stone-900 text-white"
                : "border-stone-200 bg-white hover:border-stone-400"
            )}
          >
            <p className="text-sm font-medium">{opt.label}</p>
            <p className={cn("text-xs mt-0.5", focus === opt.id ? "text-stone-300" : "text-stone-400")}>
              {opt.hint}
            </p>
          </button>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4 items-start">
        <div className="aspect-[3/4] max-h-[280px] mx-auto w-full bg-stone-100 rounded-2xl overflow-hidden border border-stone-200">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewImage} alt="Your capture" className="w-full h-full object-cover" />
        </div>

        <div className="space-y-4 bg-white rounded-2xl border border-stone-200 p-4">
          {focusShowsUpper(focus) && (
            <SizeChipGroup
              label="Your top size"
              icon={<Shirt size={16} className="text-stone-400" />}
              options={UPPER_SIZES}
              selected={value.upper}
              onSelect={(upper) => onChange({ ...value, upper })}
            />
          )}
          {focusShowsLower(focus) && (
            <SizeChipGroup
              label="Your waist / jeans size"
              icon={<Ruler size={16} className="text-stone-400" />}
              options={LOWER_SIZES}
              selected={value.lower}
              onSelect={(lower) => onChange({ ...value, lower })}
            />
          )}
          <div className="flex items-start gap-2 text-xs text-stone-500 bg-stone-50 p-3 rounded-lg">
            <Sparkles size={14} className="mt-0.5 shrink-0 text-amber-500" />
            <span>
              Full-body photo is always used. {focus === "upper" && "Only the top garment changes."}
              {focus === "lower" && "Only bottoms change — your top stays as captured."}
              {focus === "full" && "Try tops and bottoms — mix & match freely."}
            </span>
          </div>
        </div>
      </div>

      <div className="flex gap-3 justify-center">
        <button type="button" onClick={onRetake} className="px-5 py-2.5 rounded-xl border border-stone-300 text-stone-600">
          Retake
        </button>
        <button type="button" onClick={onContinue} className="px-6 py-2.5 rounded-xl bg-stone-900 text-white font-medium">
          Continue → Studio portrait
        </button>
      </div>
    </div>
  );
}

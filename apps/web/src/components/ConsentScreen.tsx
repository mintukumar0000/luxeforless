"use client";

import { PRIVACY_NOTICE, APP_NAME } from "@/lib/utils";

interface ConsentScreenProps {
  onAccept: () => void;
  onDecline: () => void;
}

export function ConsentScreen({ onAccept, onDecline }: ConsentScreenProps) {
  return (
    <div className="max-w-lg mx-auto p-8 bg-white rounded-2xl shadow-xl border border-stone-200">
      <div className="text-center mb-6">
        <h1 className="text-3xl font-serif text-stone-900 tracking-tight">{APP_NAME}</h1>
        <p className="text-stone-500 mt-1">Virtual Try-On Experience</p>
      </div>

      <div className="space-y-4 text-stone-700 text-sm leading-relaxed">
        <p>
          Before we use your photo, please review how your data is handled:
        </p>
        <ul className="list-disc pl-5 space-y-2">
          <li>Your photo is used only to generate AI try-on previews during this session.</li>
          <li>Images are retained for up to <strong>{PRIVACY_NOTICE.retentionDays} days</strong>, then automatically deleted.</li>
          <li>You may request deletion at any time by speaking with store staff.</li>
          <li>Body measurements shown are <strong>estimates</strong>, not exact measurements.</li>
          <li>Try-on results are AI-generated previews and may not perfectly match physical fit.</li>
        </ul>
        <p className="text-xs text-stone-400 pt-2">
          By continuing, you consent to photo capture or upload and processing as described above.
        </p>
      </div>

      <div className="flex gap-3 mt-8">
        <button
          onClick={onDecline}
          className="flex-1 px-4 py-3 rounded-xl border border-stone-300 text-stone-600 hover:bg-stone-50 transition"
        >
          Decline
        </button>
        <button
          onClick={onAccept}
          className="flex-1 px-4 py-3 rounded-xl bg-stone-900 text-white hover:bg-stone-800 transition font-medium"
        >
          I Consent — Start
        </button>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { GarmentUploadStudio } from "@/components/GarmentUploadStudio";
import { APP_NAME } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";

export default function StudioPage() {
  const [storeId, setStoreId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    fetch("/api/demo/init", { method: "POST" })
      .then((r) => r.json())
      .then((data) => setStoreId(data.store.id));
  }, []);

  return (
    <div className="min-h-screen">
      <header className="bg-white border-b border-stone-200">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-4">
          <Link href="/" className="text-stone-500 hover:text-stone-900">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-xl font-serif">{APP_NAME} — Upload Studio</h1>
            <p className="text-xs text-stone-400">Staff garment onboarding</p>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {storeId ? (
          <GarmentUploadStudio
            key={refreshKey}
            storeId={storeId}
            onProductCreated={() => setRefreshKey((k) => k + 1)}
          />
        ) : (
          <p className="text-center text-stone-500 py-12">Initializing...</p>
        )}
      </main>
    </div>
  );
}

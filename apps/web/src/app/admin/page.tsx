"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";

interface SizeChartRow {
  size: string;
  chestCm?: number | null;
  shoulderCm?: number | null;
  waistCm?: number | null;
  hipCm?: number | null;
  lengthCm?: number | null;
}

interface AdminProduct {
  id: string;
  name: string;
  category: string;
  sizeChart: SizeChartRow[];
}

export default function AdminPage() {
  const [storeId, setStoreId] = useState<string | null>(null);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [chart, setChart] = useState<SizeChartRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/demo/init")
      .then((r) => r.json())
      .then((d) => setStoreId(d.stores?.[0]?.id ?? null));
  }, []);

  useEffect(() => {
    if (!storeId) return;
    fetch(`/api/products?storeId=${storeId}`)
      .then((r) => r.json())
      .then(setProducts);
  }, [storeId]);

  useEffect(() => {
    const p = products.find((x) => x.id === selectedId);
    setChart(p?.sizeChart ?? []);
  }, [selectedId, products]);

  const saveChart = async () => {
    if (!selectedId) return;
    setSaving(true);
    setMessage(null);
    const res = await fetch(`/api/products/${selectedId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sizeChart: chart }),
    });
    setSaving(false);
    if (res.ok) {
      setMessage("Size chart saved.");
      const updated = await res.json();
      setProducts((prev) => prev.map((p) => (p.id === selectedId ? updated : p)));
    } else {
      setMessage("Save failed.");
    }
  };

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="bg-white border-b border-stone-200 px-4 py-3 flex items-center justify-between">
        <h1 className="font-serif text-xl">Staff Admin · Size Charts</h1>
        <Link href="/" className="text-sm text-stone-600 hover:text-stone-900">
          ← Mirror
        </Link>
      </header>

      <main className="max-w-4xl mx-auto p-6 space-y-6">
        <p className="text-sm text-stone-500">
          Edit chest/waist measurements per size. Changes apply to fit recommendations immediately.
        </p>

        <select
          className="w-full border border-stone-200 rounded-xl px-4 py-2 bg-white"
          value={selectedId ?? ""}
          onChange={(e) => setSelectedId(e.target.value || null)}
        >
          <option value="">Select product...</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.category})
            </option>
          ))}
        </select>

        {selectedId && (
          <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-stone-100">
                <tr>
                  <th className="p-2 text-left">Size</th>
                  <th className="p-2">Chest</th>
                  <th className="p-2">Shoulder</th>
                  <th className="p-2">Waist</th>
                  <th className="p-2">Hip</th>
                  <th className="p-2">Length</th>
                </tr>
              </thead>
              <tbody>
                {chart.map((row, i) => (
                  <tr key={row.size} className="border-t border-stone-100">
                    <td className="p-2 font-medium">{row.size}</td>
                    {(["chestCm", "shoulderCm", "waistCm", "hipCm", "lengthCm"] as const).map((field) => (
                      <td key={field} className="p-1">
                        <input
                          type="number"
                          className="w-full border border-stone-200 rounded px-2 py-1 text-center"
                          value={row[field] ?? ""}
                          onChange={(e) => {
                            const val = e.target.value ? parseFloat(e.target.value) : null;
                            setChart((prev) =>
                              prev.map((r, j) => (j === i ? { ...r, [field]: val } : r))
                            );
                          }}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="p-4 flex items-center gap-3">
              <button
                type="button"
                onClick={saveChart}
                disabled={saving}
                className="px-5 py-2 rounded-xl bg-stone-900 text-white disabled:opacity-50 flex items-center gap-2"
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                Save size chart
              </button>
              {message && <span className="text-sm text-green-700">{message}</span>}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

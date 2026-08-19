"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { Camera, RefreshCw, CheckCircle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { validateBodyCapture } from "@/lib/vto-client";
import { BodyEstimates } from "@/lib/fit-scoring";

interface WebcamCaptureProps {
  onCapture: (imageBase64: string, estimates: BodyEstimates | null) => void;
  onCancel?: () => void;
}

interface ValidationState {
  valid: boolean;
  issues: string[];
  estimates: BodyEstimates | null;
}

export function WebcamCapture({ onCapture, onCancel }: WebcamCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState<ValidationState | null>(null);
  const [captured, setCaptured] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setReady(true);
        setError(null);
      }
    } catch {
      setError("Camera access denied. Please allow camera permissions and try again.");
    }
  }, []);

  useEffect(() => {
    startCamera();
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [startCamera]);

  const captureFrame = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    if (!video.videoWidth || !video.videoHeight) {
      setError("Camera not ready yet. Wait a moment and try again.");
      return;
    }

    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Mirror horizontally to match preview
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    setCaptured(dataUrl);
    setValidating(true);
    setValidation(null);
    setError(null);

    try {
      const blob = await fetch(dataUrl).then((r) => r.blob());
      const form = new FormData();
      form.append("image", blob, "capture.jpg");

      const res = await validateBodyCapture(blob).then(
        (result) => ({ ok: true as const, result }),
        (err) => ({ ok: false as const, error: err instanceof Error ? err.message : "Validation failed" })
      );
      if (!res.ok) {
        throw new Error(res.error);
      }
      setValidation(res.result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Validation service unavailable";
      const isServiceError =
        msg.includes("fetch") || msg.includes("500") || msg.includes("Validation failed");
      setValidation({
        valid: isServiceError,
        issues: isServiceError
          ? ["Pose check unavailable — you can continue, but size recommendations may be less accurate."]
          : [msg],
        estimates: null,
      });
    } finally {
      setValidating(false);
    }
  }, []);

  const confirmCapture = () => {
    if (captured) {
      onCapture(captured, validation?.estimates || null);
    }
  };

  const retake = () => {
    setCaptured(null);
    setValidation(null);
  };

  return (
    <div className="space-y-4">
      <div className="relative aspect-[3/4] max-h-[520px] mx-auto bg-stone-900 rounded-2xl overflow-hidden">
        {!captured ? (
          <video
            ref={videoRef}
            className="w-full h-full object-cover mirror"
            playsInline
            muted
            style={{ transform: "scaleX(-1)" }}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={captured} alt="Captured" className="w-full h-full object-cover" />
        )}

        {!captured && ready && (
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute inset-x-8 inset-y-12 border-2 border-dashed border-white/40 rounded-xl" />
            <p className="absolute bottom-4 left-0 right-0 text-center text-white/80 text-sm">
              Stand fully in frame · arms at sides · good lighting
            </p>
          </div>
        )}

        <canvas ref={canvasRef} className="hidden" />
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 p-3 rounded-lg">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {validating && (
        <div className="text-center text-stone-500 text-sm animate-pulse">
          Checking pose and lighting...
        </div>
      )}

      {validation && !validating && (
        <div
          className={cn(
            "p-4 rounded-xl text-sm",
            validation.valid ? "bg-green-50 text-green-800" : "bg-amber-50 text-amber-800"
          )}
        >
          <div className="flex items-center gap-2 font-medium mb-2">
            {validation.valid ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
            {validation.valid ? "Great shot! Ready to continue." : "Please adjust and retake:"}
          </div>
          {validation.issues.length > 0 && (
            <ul className="list-disc pl-5 space-y-1">
              {validation.issues.map((issue, i) => (
                <li key={i}>{issue}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex gap-3 justify-center">
        {onCancel && (
          <button onClick={onCancel} className="px-5 py-2.5 rounded-xl border border-stone-300 text-stone-600">
            Back
          </button>
        )}

        {!captured ? (
          <button
            onClick={captureFrame}
            disabled={!ready}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-stone-900 text-white disabled:opacity-50"
          >
            <Camera size={18} />
            Capture
          </button>
        ) : (
          <>
            <button onClick={retake} className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-stone-300">
              <RefreshCw size={16} />
              Retake
            </button>
            <button
              onClick={confirmCapture}
              disabled={!captured}
              className="px-6 py-2.5 rounded-xl bg-stone-900 text-white disabled:opacity-40"
            >
              {validation?.valid ? "Use This Photo" : "Use Anyway"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

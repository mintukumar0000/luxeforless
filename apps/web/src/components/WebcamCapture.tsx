"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { Camera, RefreshCw, CheckCircle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { validateBodyCapture, preprocessPersonCapture } from "@/lib/vto-client";
import { BodyEstimates } from "@/lib/fit-scoring";
import { SizeProfileSelector } from "@/components/SizeProfileSelector";
import { DEFAULT_SIZE_PROFILE, SizeProfile } from "@/lib/size-options";

type CapturePhase = "camera" | "sizes" | "processing" | "review";

interface WebcamCaptureProps {
  onCapture: (imageBase64: string, estimates: BodyEstimates | null, sizeProfile: SizeProfile) => void;
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
  const [phase, setPhase] = useState<CapturePhase>("camera");
  const [ready, setReady] = useState(false);
  const [validation, setValidation] = useState<ValidationState | null>(null);
  const [rawCapture, setRawCapture] = useState<string | null>(null);
  const [studioCapture, setStudioCapture] = useState<string | null>(null);
  const [sizeProfile, setSizeProfile] = useState<SizeProfile>(DEFAULT_SIZE_PROFILE);
  const [processingLabel, setProcessingLabel] = useState("");
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

  const captureFrame = useCallback(() => {
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
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    setRawCapture(dataUrl);
    setStudioCapture(null);
    setValidation(null);
    setError(null);
    setPhase("sizes");
  }, []);

  const runStudioPipeline = useCallback(async () => {
    if (!rawCapture) return;

    setPhase("processing");
    setProcessingLabel("Removing background and creating studio portrait...");

    const blob = await fetch(rawCapture).then((r) => r.blob());

    const preprocessPromise = preprocessPersonCapture(blob)
      .then(({ imageDataUrl }) => {
        setStudioCapture(imageDataUrl);
      })
      .catch(() => {
        setStudioCapture(rawCapture);
      });

    setProcessingLabel("Checking pose and lighting...");
    try {
      const [validationRes] = await Promise.all([
        validateBodyCapture(blob).then(
          (result) => ({ ok: true as const, result }),
          (err) => ({ ok: false as const, error: err instanceof Error ? err.message : "Validation failed" })
        ),
        preprocessPromise,
      ]);

      if (!validationRes.ok) {
        throw new Error(validationRes.error);
      }
      setValidation(validationRes.result);
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
      if (!studioCapture) setStudioCapture(rawCapture);
    } finally {
      setPhase("review");
      setProcessingLabel("");
    }
  }, [rawCapture, studioCapture]);

  const confirmCapture = () => {
    const finalImage = studioCapture || rawCapture;
    if (finalImage) {
      onCapture(finalImage, validation?.estimates || null, sizeProfile);
    }
  };

  const retake = () => {
    setRawCapture(null);
    setStudioCapture(null);
    setValidation(null);
    setSizeProfile(DEFAULT_SIZE_PROFILE);
    setPhase("camera");
  };

  if (phase === "sizes" && rawCapture) {
    return (
      <SizeProfileSelector
        previewImage={rawCapture}
        value={sizeProfile}
        onChange={setSizeProfile}
        onContinue={runStudioPipeline}
        onRetake={retake}
      />
    );
  }

  const displayImage = phase === "review" ? studioCapture || rawCapture : null;

  return (
    <div className="space-y-4">
      <div className="relative aspect-[3/4] max-h-[520px] mx-auto bg-stone-900 rounded-2xl overflow-hidden">
        {phase === "camera" ? (
          <video
            ref={videoRef}
            className="w-full h-full object-cover mirror"
            playsInline
            muted
            style={{ transform: "scaleX(-1)" }}
          />
        ) : displayImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={displayImage} alt="Captured" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white/70 text-sm px-6 text-center">
            {processingLabel || "Processing..."}
          </div>
        )}

        {phase === "camera" && ready && (
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

      {phase === "processing" && (
        <div className="text-center text-stone-500 text-sm animate-pulse">{processingLabel}</div>
      )}

      {phase === "review" && validation && (
        <div
          className={cn(
            "p-4 rounded-xl text-sm",
            validation.valid ? "bg-green-50 text-green-800" : "bg-amber-50 text-amber-800"
          )}
        >
          <div className="flex items-center gap-2 font-medium mb-2">
            {validation.valid ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
            {validation.valid ? "Studio portrait ready!" : "You can continue, or retake for better results:"}
          </div>
          <p className="text-stone-600 mb-2">
            Your sizes: <strong>{sizeProfile.upper}</strong> top · <strong>{sizeProfile.lower}</strong> bottom
          </p>
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
        {onCancel && phase === "camera" && (
          <button onClick={onCancel} className="px-5 py-2.5 rounded-xl border border-stone-300 text-stone-600">
            Back
          </button>
        )}

        {phase === "camera" && (
          <button
            onClick={captureFrame}
            disabled={!ready}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-stone-900 text-white disabled:opacity-50"
          >
            <Camera size={18} />
            Capture
          </button>
        )}

        {phase === "review" && (
          <>
            <button onClick={retake} className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-stone-300">
              <RefreshCw size={16} />
              Retake
            </button>
            <button
              onClick={confirmCapture}
              className="px-6 py-2.5 rounded-xl bg-stone-900 text-white"
            >
              {validation?.valid ? "Start browsing" : "Continue anyway"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

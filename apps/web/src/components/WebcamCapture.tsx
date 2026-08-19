"use client";

import { useRef, useState, useCallback, useEffect, ChangeEvent } from "react";
import { Camera, RefreshCw, CheckCircle, AlertCircle, Monitor, Smartphone, ImageUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { validateBodyCapture } from "@/lib/vto-client";
import { BodyEstimates } from "@/lib/fit-scoring";
import { SizeProfileSelector } from "@/components/SizeProfileSelector";
import { DEFAULT_SIZE_PROFILE, SizeProfile } from "@/lib/size-options";
import { TryOnFocus } from "@/lib/try-on-focus";

type CapturePhase = "camera" | "sizes" | "processing" | "review";
export type CaptureInputMode = "live" | "camera" | "upload";
export type CaptureSource = "live" | "file";

interface WebcamCaptureProps {
  onCapture: (
    imageBase64: string,
    estimates: BodyEstimates | null,
    sizeProfile: SizeProfile,
    tryOnFocus: TryOnFocus,
    validationPassed: boolean,
    source: CaptureSource
  ) => void;
  onCancel?: () => void;
}

interface ValidationState {
  valid: boolean;
  issues: string[];
  estimates: BodyEstimates | null;
}

function defaultInputMode(): CaptureInputMode {
  if (typeof window === "undefined") return "live";
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ? "camera" : "live";
}

const INPUT_MODES: {
  id: CaptureInputMode;
  label: string;
  short: string;
  icon: typeof Monitor;
  hint: string;
}[] = [
  {
    id: "live",
    label: "Live mirror",
    short: "Kiosk / webcam",
    icon: Monitor,
    hint: "In-store display or laptop webcam — continuous preview",
  },
  {
    id: "camera",
    label: "Take photo",
    short: "Phone / tablet",
    icon: Smartphone,
    hint: "Opens your device camera — best for mobile shoppers",
  },
  {
    id: "upload",
    label: "Upload photo",
    short: "Gallery",
    icon: ImageUp,
    hint: "Pick an existing full-body photo from your library",
  },
];

export function WebcamCapture({ onCapture, onCancel }: WebcamCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [inputMode, setInputMode] = useState<CaptureInputMode>(defaultInputMode);
  const [captureSource, setCaptureSource] = useState<CaptureSource>("live");
  const [phase, setPhase] = useState<CapturePhase>("camera");
  const [ready, setReady] = useState(false);
  const [validation, setValidation] = useState<ValidationState | null>(null);
  const [rawCapture, setRawCapture] = useState<string | null>(null);
  const [studioCapture, setStudioCapture] = useState<string | null>(null);
  const [sizeProfile, setSizeProfile] = useState<SizeProfile>(DEFAULT_SIZE_PROFILE);
  const [tryOnFocus, setTryOnFocus] = useState<TryOnFocus>("full");
  const [processingLabel, setProcessingLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setReady(false);
  }, []);

  const startCamera = useCallback(async () => {
    stopCamera();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1920 }, height: { ideal: 1080 } },
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
      setError("Camera access denied. Use Take photo or Upload instead.");
    }
  }, [stopCamera]);

  useEffect(() => {
    if (inputMode === "live" && phase === "camera") {
      startCamera();
    } else {
      stopCamera();
    }
    return stopCamera;
  }, [inputMode, phase, startCamera, stopCamera]);

  const beginWithImage = useCallback((dataUrl: string, source: CaptureSource) => {
    setCaptureSource(source);
    setRawCapture(dataUrl);
    setStudioCapture(null);
    setValidation(null);
    setError(null);
    setPhase("sizes");
  }, []);

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
    beginWithImage(canvas.toDataURL("image/jpeg", 0.92), "live");
  }, [beginWithImage]);

  const handleFileSelect = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        setError("Please choose a JPEG, PNG, or WebP photo.");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => beginWithImage(reader.result as string, "file");
      reader.onerror = () => setError("Could not read that photo. Try another file.");
      reader.readAsDataURL(file);
    },
    [beginWithImage]
  );

  const openFilePicker = () => fileInputRef.current?.click();

  const runStudioPipeline = useCallback(async () => {
    if (!rawCapture) return;

    setPhase("processing");
    setProcessingLabel("Checking pose — your background stays exactly as captured...");
    setStudioCapture(rawCapture);

    const blob = await fetch(rawCapture).then((r) => r.blob());

    try {
      const validationRes = await validateBodyCapture(blob).then(
        (result) => ({ ok: true as const, result }),
        (err) => ({ ok: false as const, error: err instanceof Error ? err.message : "Validation failed" })
      );

      if (!validationRes.ok) {
        setValidation({
          valid: false,
          issues: [
            "Pose check service unavailable. Retake when VTO GPU is running, or check your connection.",
          ],
          estimates: null,
        });
      } else {
        setValidation(validationRes.result);
      }
    } catch {
      setValidation({
        valid: false,
        issues: ["Could not validate pose. Retake your photo when the VTO service is online."],
        estimates: null,
      });
    } finally {
      setPhase("review");
      setProcessingLabel("");
    }
  }, [rawCapture]);

  const confirmCapture = () => {
    if (!validation?.valid) return;
    const finalImage = studioCapture || rawCapture;
    if (finalImage) {
      onCapture(
        finalImage,
        validation.estimates || null,
        sizeProfile,
        tryOnFocus,
        validation.valid,
        captureSource
      );
    }
  };

  const retake = () => {
    setRawCapture(null);
    setStudioCapture(null);
    setValidation(null);
    setSizeProfile(DEFAULT_SIZE_PROFILE);
    setTryOnFocus("full");
    setCaptureSource(inputMode === "live" ? "live" : "file");
    setPhase("camera");
  };

  const switchInputMode = (mode: CaptureInputMode) => {
    setInputMode(mode);
    setCaptureSource(mode === "live" ? "live" : "file");
    setError(null);
  };

  if (phase === "sizes" && rawCapture) {
    return (
      <SizeProfileSelector
        previewImage={rawCapture}
        focus={tryOnFocus}
        onFocusChange={setTryOnFocus}
        value={sizeProfile}
        onChange={setSizeProfile}
        onContinue={runStudioPipeline}
        onRetake={retake}
      />
    );
  }

  const displayImage = phase === "review" ? studioCapture || rawCapture : null;

  const activeMode = INPUT_MODES.find((m) => m.id === inputMode)!;

  return (
    <div className="space-y-4">
      {phase === "camera" && (
        <div className="flex gap-1 p-1 bg-stone-100 rounded-xl">
          {INPUT_MODES.map((mode) => {
            const Icon = mode.icon;
            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => switchInputMode(mode.id)}
                className={cn(
                  "flex-1 flex flex-col items-center gap-0.5 py-2 px-1 rounded-lg text-[11px] font-medium transition-all",
                  inputMode === mode.id
                    ? "bg-white text-stone-900 shadow-sm"
                    : "text-stone-500 hover:text-stone-700"
                )}
              >
                <Icon size={16} />
                <span className="hidden sm:inline">{mode.label}</span>
                <span className="sm:hidden">{mode.short}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="relative aspect-[3/4] max-h-[520px] mx-auto bg-stone-900 rounded-2xl overflow-hidden">
        {phase === "camera" && inputMode === "live" ? (
          <video
            ref={videoRef}
            className="w-full h-full object-cover mirror"
            playsInline
            muted
            style={{ transform: "scaleX(-1)" }}
          />
        ) : phase === "camera" ? (
          <div className="w-full h-full flex flex-col items-center justify-center text-white p-6 text-center gap-4">
            {inputMode === "camera" ? (
              <Smartphone size={40} className="text-white/70" />
            ) : (
              <ImageUp size={40} className="text-white/70" />
            )}
            <div>
              <p className="font-medium">{activeMode.label}</p>
              <p className="text-sm text-white/70 mt-1 max-w-xs">{activeMode.hint}</p>
            </div>
            <button
              type="button"
              onClick={openFilePicker}
              className="px-5 py-2.5 rounded-xl bg-white text-stone-900 font-medium"
            >
              {inputMode === "camera" ? "Open camera" : "Choose photo"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture={inputMode === "camera" ? "user" : undefined}
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>
        ) : displayImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={displayImage} alt="Captured" className="w-full h-full object-contain bg-stone-950" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white/70 text-sm px-6 text-center">
            {processingLabel || "Processing..."}
          </div>
        )}

        {phase === "camera" && inputMode === "live" && ready && (
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
            {validation.valid ? "Photo ready — background & pose kept" : "Fix these issues and retake:"}
          </div>
          <p className="text-stone-600 mb-2">
            Mode: <strong>{tryOnFocus === "upper" ? "Tops" : tryOnFocus === "lower" ? "Bottoms" : "Full outfit"}</strong>
            {" · "}
            {tryOnFocus !== "lower" && <>Top {sizeProfile.upper}</>}
            {tryOnFocus === "full" && " · "}
            {tryOnFocus !== "upper" && <>Waist {sizeProfile.lower}</>}
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

        {phase === "camera" && inputMode === "live" && (
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
              disabled={!validation?.valid}
              className="px-6 py-2.5 rounded-xl bg-stone-900 text-white disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Start browsing
            </button>
          </>
        )}
      </div>
    </div>
  );
}

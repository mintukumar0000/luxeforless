"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { BodyEstimates } from "@/lib/fit-scoring";

interface DemoContext {
  organizationId: string;
  storeId: string;
  mirrorId: string;
}

interface SessionContextType {
  sessionId: string | null;
  demo: DemoContext | null;
  captureImage: string | null;
  bodyEstimates: BodyEstimates | null;
  setSessionId: (id: string) => void;
  setDemo: (demo: DemoContext) => void;
  setCaptureImage: (img: string) => void;
  setBodyEstimates: (est: BodyEstimates) => void;
  initDemo: () => Promise<void>;
  startSession: () => Promise<string>;
}

const SessionContext = createContext<SessionContextType | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [demo, setDemo] = useState<DemoContext | null>(null);
  const [captureImage, setCaptureImage] = useState<string | null>(null);
  const [bodyEstimates, setBodyEstimates] = useState<BodyEstimates | null>(null);

  const initDemo = useCallback(async () => {
    const res = await fetch("/api/demo/init", { method: "POST" });
    const data = await res.json();
    setDemo({
      organizationId: data.organization.id,
      storeId: data.store.id,
      mirrorId: data.mirror.id,
    });
  }, []);

  const startSession = useCallback(async () => {
    if (!demo) await initDemo();
    const demoRes = await fetch("/api/demo/init");
    const demoData = await demoRes.json();
    const store = demoData.stores?.[0];
    const mirror = store?.mirrors?.[0];

    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        storeId: store?.id || demo?.storeId,
        mirrorId: mirror?.id || demo?.mirrorId,
        consentGiven: true,
      }),
    });
    const session = await res.json();
    setSessionId(session.id);
    setDemo({
      organizationId: demoData.id,
      storeId: store?.id,
      mirrorId: mirror?.id,
    });
    return session.id;
  }, [demo, initDemo]);

  return (
    <SessionContext.Provider
      value={{
        sessionId,
        demo,
        captureImage,
        bodyEstimates,
        setSessionId,
        setDemo,
        setCaptureImage,
        setBodyEstimates,
        initDemo,
        startSession,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}

"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

/** Shown only on the public demo deployment (DEMO_MODE=true on the server). */
export function DemoBanner() {
  const [demo, setDemo] = useState(false);
  useEffect(() => {
    api.config().then((c) => setDemo(Boolean(c.demo_mode))).catch(() => {});
  }, []);
  if (!demo) return null;
  return (
    <div className="demo-banner" role="note">
      <strong>Public demo.</strong> Please don&apos;t enter private or personal data. Limits are small, the first visit after a quiet spell
      can take up to a minute to wake up, and saved evaluations may be cleared at any time.
    </div>
  );
}

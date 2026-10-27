"use client";

import { useId, useState } from "react";

/** A small "?" button that reveals a plain-language explanation underneath. */
export function Help({ children, label = "What does this mean?" }: { children: React.ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <>
      <button type="button" className="help-btn" aria-label={label} aria-expanded={open} aria-controls={id}
        title={label} onClick={(e) => { e.preventDefault(); setOpen((o) => !o); }}>?</button>
      {open && <span id={id} role="note" className="help-box">{children}</span>}
    </>
  );
}

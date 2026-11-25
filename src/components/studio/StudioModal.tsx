"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

/** Fenêtre modale du studio : même structure et même accessibilité que celles de JARVIS. */
export function ModalShell({ title, eyebrow, children, onClose, wide = false }: { title: string; eyebrow: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const before = document.activeElement as HTMLElement;
    const timer = window.setTimeout(() => ref.current?.querySelector<HTMLElement>("input, textarea, button")?.focus(), 30);
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !ref.current) return;
      const items = Array.from(ref.current.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), textarea, select, a[href]"));
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); closeRef.current(); } };
    window.addEventListener("keydown", trap);
    window.addEventListener("keydown", onKey, true);
    return () => { window.clearTimeout(timer); window.removeEventListener("keydown", trap); window.removeEventListener("keydown", onKey, true); before?.focus(); };
  }, []);

  return <div className="studio-modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div ref={ref} className={`studio-modal ${wide ? "modal-wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby="studio-modal-title">
      <div className="modal-heading"><div><span className="eyebrow">{eyebrow}</span><h2 id="studio-modal-title">{title}</h2></div><button type="button" className="icon-button" aria-label="Fermer la fenêtre" onClick={onClose}><X size={14} /></button></div>
      {children}
    </div>
  </div>;
}

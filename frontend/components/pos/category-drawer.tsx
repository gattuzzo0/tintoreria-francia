"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export type CategoryDrawerItem = {
  id: string;
  label: string;
  count?: number;
  selected: boolean;
};

const SLIDE = { duration: 0.32, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] };

export function CategoryDrawer({
  open,
  items,
  onPick,
  onClose,
}: {
  open: boolean;
  items: CategoryDrawerItem[];
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const reduce = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const transition = reduce ? { duration: 0 } : SLIDE;

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = requestAnimationFrame(() => {
      const selected = panelRef.current?.querySelector<HTMLButtonElement>("[aria-current='true']");
      (selected ?? panelRef.current?.querySelector("button"))?.focus();
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const trapTab = (e: React.KeyboardEvent) => {
    if (e.key !== "Tab" || !panelRef.current) return;
    const nodes = [...panelRef.current.querySelectorAll<HTMLButtonElement>("button")];
    if (nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50">
          <motion.div
            className="absolute inset-0 bg-foreground/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={transition}
            onClick={onClose}
          />
          <motion.div
            ref={panelRef}
            id="category-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="category-drawer-title"
            tabIndex={-1}
            onKeyDown={trapTab}
            className="absolute inset-y-0 left-0 flex w-[min(22rem,100%)] flex-col bg-background shadow-2xl outline-none"
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={transition}
          >
            <div className="flex items-center gap-3 border-b px-4 py-4">
              <h2 id="category-drawer-title" className="min-w-0 flex-1 text-lg font-semibold tracking-tight">
                Categorías
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar categorías"
                className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/30"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
            <ul className="flex flex-1 flex-col gap-1 overflow-y-auto p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
              {items.map((item) => (
                <li key={item.id || "todos"}>
                  <button
                    type="button"
                    aria-current={item.selected ? "true" : undefined}
                    onClick={() => onPick(item.id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/30",
                      item.selected ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                    )}
                  >
                    <span className="min-w-0 flex-1 leading-snug">{item.label}</span>
                    {item.count !== undefined && (
                      <span className={cn("font-mono text-xs", item.selected ? "text-primary-foreground/80" : "text-muted-foreground")}>
                        {item.count}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

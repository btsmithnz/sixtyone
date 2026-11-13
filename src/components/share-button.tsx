"use client";

import { Check, Share } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Shares a link to part of the site. Phones open the share sheet; elsewhere
 * the link is copied, which is what people expect on a computer (desktop
 * share sheets are patchy). `path` is relative to the site, so links work on
 * whichever deployment you're on.
 */
export function ShareButton({
  path,
  title,
  label,
  className,
}: {
  path: string;
  /** What's being shared, for the share sheet and screen readers. */
  title: string;
  /** Visible text beside the icon; without it, it's an icon button. */
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const share = async () => {
    const url = new URL(path, location.href).href;
    const sheet = () =>
      navigator.share({ title, url }).catch(() => {
        // Closing the share sheet rejects too: nothing to do.
      });
    const canShare = "share" in navigator;
    if (canShare && matchMedia("(pointer: coarse)").matches) {
      await sheet();
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      if (canShare) await sheet();
    }
  };

  const Icon = copied ? Check : Share;
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1", className)}>
      <button
        type="button"
        onClick={share}
        aria-label={label ? undefined : `Share ${title}`}
        title={label ? undefined : "Share"}
        className={cn(
          "inline-flex items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2",
          label
            ? "gap-1.5 border-2 border-border bg-card px-2.5 py-1 text-sm font-medium hover:border-ink/40"
            : "size-8 hover:bg-secondary",
        )}
      >
        <Icon className="size-4" aria-hidden />
        {label}
      </button>
      <output className="text-xs text-muted-foreground">
        {copied ? "Link copied" : ""}
      </output>
    </span>
  );
}

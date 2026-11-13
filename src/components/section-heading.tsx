import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A section's h2, linkable as /page#id. The heading text is the link, so
 * clicking it puts the address in the URL bar to copy, and a "#" shows on
 * hover (see .heading-link). The id also names the section for
 * aria-labelledby.
 */
export function SectionHeading({
  id,
  className,
  children,
}: {
  id: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <h2 id={id} className={cn("scroll-mt-6", className)}>
      <a href={`#${id}`} className="heading-link">
        {children}
      </a>
    </h2>
  );
}

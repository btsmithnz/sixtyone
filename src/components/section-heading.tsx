import { cn } from "@/lib/utils";
import { ShareButton } from "./share-button";

/**
 * A section's h2, linkable as /page#id. The heading text is the link, so
 * clicking it puts the address in the URL bar to copy, and a "#" shows on
 * hover (see .heading-link). The id also names the section for
 * aria-labelledby.
 *
 * `share` adds a share button for the section's link: /page#id, or a share
 * page like /party-vote where the section has its own preview image.
 * `shareTitle` names it in the share sheet, if the heading alone doesn't
 * ("Wellington Bays: party vote" rather than "Party vote here").
 */
export function SectionHeading({
  id,
  className,
  share,
  shareTitle,
  children,
}: {
  id: string;
  className?: string;
  share?: string;
  shareTitle?: string;
  children: string;
}) {
  const heading = (
    <h2
      id={id}
      className={cn("scroll-mt-6", className)}
      data-shared={share ? "" : undefined}
    >
      <a href={`#${id}`} className="heading-link">
        {children}
      </a>
    </h2>
  );
  if (!share) return heading;
  return (
    <div className="flex items-center gap-1.5">
      {heading}
      <ShareButton path={share} title={shareTitle ?? children} />
    </div>
  );
}

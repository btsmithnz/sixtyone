import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false },
};

export default function NotFound() {
  return (
    <div className="max-w-[60ch] space-y-5 pt-10">
      <p className="font-display text-7xl font-extrabold [font-stretch:75%]">
        404
      </p>
      <h1 className="font-display text-4xl font-extrabold tracking-tight [font-stretch:85%]">
        That page isn’t on the ballot
      </h1>
      <p className="text-lg text-muted-foreground">
        The link may be wrong or out of date. Electorate pages use the
        electorate’s name, like /electorates/auckland-central.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link
          href="/"
          className="sticker inline-block !rounded-full bg-primary px-5 py-2 font-semibold text-primary-foreground"
        >
          See the live results
        </Link>
        <Link
          href="/electorates"
          className="sticker inline-block !rounded-full px-5 py-2 font-semibold"
        >
          Browse all electorates
        </Link>
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import { ScrollToSection } from "@/components/scroll-to-hash";
import { buildParliament } from "@/lib/parliament";
import { getOverview } from "@/lib/results";
import { shareMetadata } from "@/lib/site";
import ParliamentPage from "../page";

/** Who's out's share page (see /party-vote). */
export async function generateMetadata(): Promise<Metadata> {
  const overview = await getOverview();
  const lost = buildParliament(overview).leaving.filter(
    (m) => m.reason === "lost",
  );
  const title = "Who’s out";
  const names = lost.slice(0, 3).map((m) => m.name);
  const description = lost.length
    ? `${lost.length === 1 ? "1 MP" : `${lost.length} MPs`} lost their seats, including ${names.join(", ")}. Who's in and who's out in the 2026 NZ election.`
    : "The MPs leaving Parliament after the 2026 New Zealand election.";
  return {
    title,
    description,
    ...shareMetadata({
      title: `${title} | NZ election 2026`,
      description,
      path: "/parliament/whos-out",
      canonical: "/parliament",
      image: "/og/parliament/whos-out",
      imageAlt: "MPs leaving Parliament after the 2026 New Zealand election",
      version: overview.version,
    }),
  };
}

export default function WhosOutPage() {
  return (
    <>
      <ParliamentPage />
      <ScrollToSection id="whos-out" />
    </>
  );
}

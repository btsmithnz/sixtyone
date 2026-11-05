import type { Metadata } from "next";
import { shareMetadata } from "@/lib/site";

const description =
  "Where SixtyOne's numbers come from, how seats are worked out under MMP, and why 61 is the magic number.";

export const metadata: Metadata = {
  title: "About",
  description,
  ...shareMetadata({
    title: "About SixtyOne",
    description,
    path: "/about",
    version: null,
  }),
};

export default function AboutPage() {
  return (
    <article className="max-w-[68ch] space-y-6 pt-2 text-lg leading-relaxed">
      <h1 className="font-display text-5xl font-extrabold tracking-tight [font-stretch:80%] sm:text-6xl">
        Why 61?
      </h1>
      <p>
        New Zealand’s Parliament usually has 120 seats. To govern, a party or
        group of parties needs a majority: 61. SixtyOne follows the count on
        election night and keeps asking one question: who can get there?
      </p>

      <h2 className="pt-4 font-display text-3xl font-extrabold [font-stretch:85%]">
        Where the numbers come from
      </h2>
      <p>
        Every few minutes we check the Electoral Commission’s public results
        feed and keep a copy of each update. That history is what powers the
        charts showing how the night unfolded.
      </p>
      <p>
        Election-night results are preliminary. They include advance and
        election-day votes, but not special votes, which are counted for the
        official result about three weeks later. Specials can change close
        electorates and the last seat or two.
      </p>

      <h2 className="pt-4 font-display text-3xl font-extrabold [font-stretch:85%]">
        How seats are worked out
      </h2>
      <p>
        When the Commission publishes its own seat allocation, we show that. If
        it hasn’t yet, we project seats ourselves the same way: parties with 5%
        of the party vote or an electorate seat share the 120 seats in
        proportion to party votes (the Sainte-Laguë method). A party keeps every
        electorate it wins, so if it wins more electorates than its share, the
        extra seats are overhang and Parliament grows past 120, which also
        raises the bar for a majority.
      </p>
      <p>
        The “usual blocs” in the race to 61 are National, ACT and NZ First
        against Labour, the Greens and Te Pāti Māori. Use Build-a-government to
        try any other combination.
      </p>

      <h2 className="pt-4 font-display text-3xl font-extrabold [font-stretch:85%]">
        Credits
      </h2>
      <p>
        Results: Electoral Commission. Electorate boundaries: Stats NZ and the
        Representation Commission (2025 boundaries), used under CC BY 4.0.
        SixtyOne is independent and isn’t affiliated with the Electoral
        Commission or any party.
      </p>
    </article>
  );
}

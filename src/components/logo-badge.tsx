import { getOverview } from "@/lib/results";
import { raisedMajority } from "@/lib/seats";

/**
 * The "61" sticker in the header. If an overhang raises the bar, it becomes
 * "62*", explained by a tooltip here and a note by the race to 61.
 */
export function LogoBadge({
  majority,
  houseSize,
}: {
  majority?: number | null;
  houseSize?: number;
}) {
  return (
    <span
      className="sticker relative grid size-11 -rotate-6 place-items-center !rounded-xl bg-primary font-display text-2xl leading-none font-extrabold text-primary-foreground transition-transform group-hover:rotate-3 [font-stretch:80%]"
      title={
        majority
          ? `*Overhang: a ${houseSize}-seat House, so ${majority} to govern`
          : undefined
      }
    >
      {majority ?? 61}
      {majority ? (
        <span
          aria-hidden
          className="absolute -top-2.5 -right-2.5 grid size-5 place-items-center rounded-full border-2 border-foreground bg-live text-sm leading-none text-white"
        >
          *
        </span>
      ) : null}
    </span>
  );
}

/** The badge with the current results; render inside <Suspense>. */
export async function LiveLogoBadge() {
  const overview = await getOverview();
  return (
    <LogoBadge
      majority={raisedMajority(overview)}
      houseSize={overview.houseSize}
    />
  );
}

import type { DailyPanchangResult } from 'panchang-ts';

/**
 * Bhadrā = Viṣṭi karaṇa.  IMPORTANT: Bhadrā is an interval, not a whole-day
 * boolean.  A day containing Viṣṭi must not be rejected after Viṣṭi ends.
 *
 * panchang-ts exposes `bhadra` for the day's Bhadrā state and the karaṇa
 * sequence gives the actual sunrise-to-next-sunrise boundaries.  The first
 * karaṇa is clipped to sunrise by the daily Panchāṅga, so when Viṣṭi began
 * before sunrise we deliberately say "prevailing at sunrise" rather than
 * inventing a pre-sunrise start time.
 */
export interface BhadraLike {
  isActive: boolean;
  location: 'earth' | 'heaven' | 'paatal';
}

export interface BhadraInterval {
  start: Date;
  end: Date;
  location: 'earth' | 'heaven' | 'paatal';
  blocking: boolean;
  clippedAtSunrise: boolean;
}

function isVishti(name: string): boolean {
  const n = name.toLowerCase();
  return n.includes('vishti') || n.includes('viṣṭi') || n.includes('bhadra') || n.includes('bhadrā');
}

/** Sunrise-to-next-sunrise Viṣṭi intervals visible in this daily Panchāṅga. */
export function getBhadraIntervals(panchang: DailyPanchangResult): BhadraInterval[] {
  const out: BhadraInterval[] = [];
  let start = panchang.sunrise;
  const location = panchang.bhadra?.location ?? 'earth';

  panchang.karanas.forEach((karana, index) => {
    const end = karana.endTime;
    if (end && isVishti(karana.name)) {
      out.push({
        start,
        end,
        location,
        blocking: location === 'earth',
        clippedAtSunrise: index === 0,
      });
    }
    if (end) start = end;
  });
  return out;
}

export function getBhadraVerdict(bhadra: BhadraLike | null | undefined): { blocked: boolean; note: string } {
  if (!bhadra || !bhadra.isActive) return { blocked: false, note: 'Bhadrā not active — clear.' };
  if (bhadra.location === 'earth') {
    return {
      blocked: true,
      note: 'Mṛtyuloka Bhadrā is present during part of this Panchāṅga day. Only the actual Viṣṭi interval is excluded; the rest of the day remains eligible for the other Muhūrta checks.',
    };
  }
  const loka = bhadra.location === 'heaven' ? 'Svarga (Heaven)' : 'Pātāla (Netherworld)';
  return { blocked: false, note: `Bhadrā occurs in ${loka}; it is shown as a caution, not used as a whole-day rejection.` };
}

/** Day-level verdict. Never hard-block merely because Bhadrā occurs for a few hours. */
export function getBhadraDayVerdict(panchang: DailyPanchangResult): { blocked: false; hasBlockingInterval: boolean; note: string } {
  const intervals = getBhadraIntervals(panchang);
  const blocking = intervals.filter((x) => x.blocking);
  if (blocking.length === 0) {
    const v = getBhadraVerdict(panchang.bhadra);
    return { blocked: false, hasBlockingInterval: false, note: v.note };
  }
  const lastEnd = blocking[blocking.length - 1].end;
  return {
    blocked: false,
    hasBlockingInterval: true,
    note: `Mṛtyuloka Bhadrā occurs only during the Viṣṭi interval and ends at ${lastEnd.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'UTC' })}. Times after it ends are NOT rejected for Bhadrā; they continue through the remaining Muhūrta checks.`,
  };
}

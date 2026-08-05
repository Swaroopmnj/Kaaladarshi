// Ayana (the Sun's northward/southward course) as used in day-to-day Hindu
// almanacs follows the sidereal Sankranti convention, not the tropical
// solstice: Uttarayana runs from Makar Sankranti (Sun enters sidereal
// Capricorn) to Karka Sankranti (Sun enters sidereal Cancer) — roughly
// mid-January to mid-July. This is ~23 days offset from the actual
// astronomical solstice because of the ayanamsa, but it's what every
// panchang/almanac in circulation actually reports, so we match that.

export type Ayana = 'Uttarayana' | 'Dakshinayana';

// Rashi indices: 0 Mesha … 11 Meena. Uttarayana = Sun in Makara(9) through
// Mithuna(2); Dakshinayana = Sun in Karka(3) through Dhanu(8).
export function getAyana(sunRashiIndex: number): Ayana {
  const uttarayanaRashis = [9, 10, 11, 0, 1, 2];
  return uttarayanaRashis.includes(sunRashiIndex) ? 'Uttarayana' : 'Dakshinayana';
}

// Activities with a documented Uttarayana requirement.
//
// Upanayanam: validated against multiple sources including Kanchi Mutt's
// Deivathin Kural teaching (Sri Chandrasekharendra Saraswati) — stated
// unambiguously and repeatedly that Upanayanam should NEVER be performed in
// Dakshinayana, with no exception offered ("if for some reason celebrated
// during this period, I would ask for its performance again in
// Uttarayana"). Unlike Vivaha, this is treated as a HARD exclusion here —
// no scoring exception softens it.
//
// Vivaha: Dakshinayana avoidance is a strong North Indian preference but
// not universal — South Indian (especially Tamil) tradition permits it
// routinely. Kept as a warning, not a hard block.
//
// Griha Pravesh: Uttarayana is preferred, but classical practice (and the
// Chaturmas cycle specifically) opens a second good window within
// Dakshinayana — see CHATURMASA_BLOCKED_ACTIVITIES / KARTIKA_EXCEPTION
// below.
export const DAKSHINAYANA_HARD_BLOCK = new Set(['upanayanam']);

export const DAKSHINAYANA_WARN: Record<string, { strength: 'strict' | 'regional'; note: string }> = {
  upanayanam: {
    strength: 'strict',
    note: 'Upanayanam must never be performed in Dakshinayana — multiple classical sources (incl. Kanchi Mutt teaching) state this with no exception. Rejected outright, not just warned.',
  },
  vivah: {
    strength: 'regional',
    note: 'Marriage in Dakshinayana is avoided in North Indian tradition, but is routine practice in many South Indian (esp. Tamil) traditions. Check your family/regional custom.',
  },
  grihaPravesh: {
    strength: 'regional',
    note: 'Griha Pravesh prefers Uttarayana; within Dakshinayana it is still avoided except during Kartika Masa, which classically remains good for house-warming (this date does not fall in Kartika).',
  },
};

// Chaturmas — the ~4 lunar months (Devshayani Ekadashi in Ashadha to
// Prabodhini Ekadashi in Kartika) during which Vishnu is in yogic sleep.
// New-beginning ceremonies (Vivaha, Griha Pravesh, Upanayanam) are
// traditionally paused entirely. Approximated here at whole-lunar-month
// granularity (Ashadha–Ashwina) rather than the precise Ekadashi-to-Ekadashi
// boundary, since exact Ekadashi timing needs separate tithi lookups this
// build doesn't yet do — this may be a few days wider than the precise
// classical window at each end.
export const CHATURMASA_MASAS = new Set(['Ashadha', 'Shravana', 'Bhadrapada', 'Ashwina']);
export const CHATURMASA_BLOCKED_ACTIVITIES = new Set(['vivah', 'grihaPravesh', 'upanayanam']);

// Within Dakshinayana, Kartika Masa (right after Chaturmas ends) is
// classically the one masa still considered good for Griha Pravesh despite
// the Sun's southward course — this is the specific exception the user
// validated from personal/family tradition. Applied only to Griha Pravesh;
// Upanayanam has no Dakshinayana exception at all (see above), and Vivaha's
// Dakshinayana handling is the separate regional-warning case.
export const KARTIKA_DAKSHINAYANA_EXCEPTION = new Set(['grihaPravesh']);


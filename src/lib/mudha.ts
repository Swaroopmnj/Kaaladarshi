// Guru Mudha (Jupiter combust) and Shukra Mudha / Shukra Asta (Venus combust)
// — Vedic Muhurta strictly avoids major samskaras while these planets sit
// too close to the Sun to be seen ("asta" = set).
//
// IMPORTANT approximation: true Asta is a heliacal visibility event (depends
// on the planet's altitude relative to the Sun at twilight, which varies
// with latitude and the planet's own brightness) and the real avoidance
// window commonly runs for WEEKS around inferior/superior conjunction, not
// just a narrow degree band on one day. What we compute here is a simpler,
// commonly-used proxy: whether the planet's sidereal longitude is within a
// stated orb of the Sun's ("combust"). This will correctly flag the heart
// of every Mudha period but may be a few days narrower than the full
// traditional Asta window at the edges. Treat a "clear" verdict here as
// "not combust" rather than "definitely visible and safe."
//
// Orbs used (commonly cited figures): Venus 10°, Jupiter 11°.

export interface MudhaStatus {
  shukraMudha: boolean;
  guruMudha: boolean;
}

function angularSeparation(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

export function getMudhaStatus(sunLongitude: number, venusLongitude: number, jupiterLongitude: number): MudhaStatus {
  return {
    shukraMudha: angularSeparation(sunLongitude, venusLongitude) <= 10,
    guruMudha: angularSeparation(sunLongitude, jupiterLongitude) <= 11,
  };
}

// Activities where classical sources explicitly name Shukra Mudha as a
// blocker (Vivaha most strictly; Upanayanam, Griha Pravesh, and vehicle
// purchase are also commonly cited).
export const SHUKRA_MUDHA_SENSITIVE = new Set(['vivah', 'upanayanam', 'grihaPravesh', 'vahanKharidi']);

// Guru Mudha is cited most strongly for Vivaha and Upanayanam (Jupiter =
// husband/knowledge significator), Griha Pravesh (expansion/prosperity),
// and vehicle purchase — user-validated against South Indian family
// practice; matches the same four-activity list Shukra Mudha applies to.
export const GURU_MUDHA_SENSITIVE = new Set(['vivah', 'upanayanam', 'grihaPravesh', 'vahanKharidi']);

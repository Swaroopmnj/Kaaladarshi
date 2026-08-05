// Sthira (fixed) / Chara (movable) / Dwiswabhava (dual) Lagna classification
// — a widely-used general heuristic in Muhurta selection: functions wanting
// permanence favour a Sthira Lagna, functions involving movement favour a
// Chara Lagna, and Dwiswabhava sits in between. This is the coarse,
// commonly-cited layer; the fuller classical picture also checks the Lagna
// lord's strength, benefics in kendras, and malefics avoided from the
// Lagna/Chandra — that finer layer needs a cast chart and is future work
// (see the Mahadosha table below for the same caveat).

export type LagnaType = 'Sthira' | 'Chara' | 'Dwiswabhava';

const STHIRA = [1, 4, 7, 10]; // Vrishabha, Simha, Vrishchika, Kumbha
const CHARA = [0, 3, 6, 9]; // Mesha, Karka, Tula, Makara
const DWISWABHAVA = [2, 5, 8, 11]; // Mithuna, Kanya, Dhanu, Meena

export function classifyLagna(rashiIndex: number): LagnaType {
  if (STHIRA.includes(rashiIndex)) return 'Sthira';
  if (CHARA.includes(rashiIndex)) return 'Chara';
  return DWISWABHAVA.includes(rashiIndex) ? 'Dwiswabhava' : 'Dwiswabhava';
}

export type LagnaVerdict = 'auspicious' | 'medium' | 'avoid';

// Activities wanting permanence/stability prefer Sthira; movement-oriented
// activities prefer Chara. Ceremonies not listed default to the
// "permanence" group, which is the more commonly cited default in Muhurta
// literature for samskaras generally.
const MOVEMENT_ACTIVITIES = new Set(['travelStart', 'vahanKharidi', 'shopOpening']);

export function lagnaVerdictFor(activityKey: string, type: LagnaType): LagnaVerdict {
  const wantsMovement = MOVEMENT_ACTIVITIES.has(activityKey);
  if (wantsMovement) {
    if (type === 'Chara') return 'auspicious';
    if (type === 'Dwiswabhava') return 'medium';
    return 'avoid'; // Sthira — stagnation for a movement-oriented activity
  }
  if (type === 'Sthira') return 'auspicious';
  if (type === 'Dwiswabhava') return 'medium';
  return 'avoid'; // Chara — instability for a permanence-oriented activity
}

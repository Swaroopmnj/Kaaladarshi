export type RuleGrade = 'prashasta' | 'permissible' | 'conditional' | 'varjya' | 'unspecified';

export interface ActivityNakshatraRule {
  grade: RuleGrade;
  reason: string;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');

// Phase-2 rule layer.  This is deliberately separate from the generic
// panchang-ts scoring table: an activity-level varjya cannot be rescued by
// unrelated positive points.
const GRIHA_PRAVESH_PRASHASTA = new Set([
  'rohini','mrigashira','uttaraphalguni','hasta','chitra','swati','anuradha',
  'uttaraashadha','uttarashada','shravana','dhanishtha','uttarabhadrapada','revati',
].map(norm));

// Conservative śubha-karma exclusions used for Gṛha Praveśa in the selected
// Telugu/South-Indian working profile. Mūla is explicitly included here.
const GRIHA_PRAVESH_VARJYA = new Set([
  'bharani','ardra','ashlesha','magha','purvaphalguni','jyeshtha','moola','mula',
  'purvaashadha','purvashada','purvabhadrapada',
].map(norm));

export function activityNakshatraRule(activityKey: string, nakshatra: string): ActivityNakshatraRule {
  const n = norm(nakshatra);
  if (activityKey === 'grihaPravesh') {
    if (GRIHA_PRAVESH_PRASHASTA.has(n)) return { grade: 'prashasta', reason: `${nakshatra} is in the primary Gṛha Praveśa nakṣatra set for the selected working tradition.` };
    if (GRIHA_PRAVESH_VARJYA.has(n)) return { grade: 'varjya', reason: `${nakshatra} is treated as Varjya for Gṛha Praveśa in the selected working tradition; positive points do not override this activity-level exclusion.` };
    return { grade: 'conditional', reason: `${nakshatra} is not in the primary Gṛha Praveśa list and is not being called universally prohibited. It requires an explicit tradition/apavāda before it can be promoted.` };
  }
  return { grade: 'unspecified', reason: 'No additional activity-specific nakṣatra hierarchy is configured yet.' };
}

import { useEffect, useMemo, useState } from 'react';
import {
  getDailyPanchang,
  getInstantPanchang,
  scoreMuhurta,
  computeAshtakoot,
  computeLagna,
  computeRashiChart,
  computeNavamsa,
  computeShadbala,
  computeDignity,
  computeVimshottariDashaFromBirth,
  computePlanetaryPositions,
  computeTarabala,
  computeChandraBalam,
  STOCK_MUHURTA_RULES,
  type MuhurtaRule,
  type MuhurtaScore,
  type DailyPanchangResult,
  type TimePeriod,
  type AshtakootResult,
  type BirthChart,
} from 'panchang-ts';
import { ACTIVITIES, NAKSHATRAS, RASHIS, PANCHAKA_ACTIVITY_KEY, DEFAULT_CITY_INDEX, CUSTOM_LOCATION_INDEX, resolveCity } from './lib/constants';
import { panchakaTypeFromNakshatra, getPanchakaVerdict, calculatePanchakaRahita, extractTithiNumber, varaNumberFromName } from './lib/panchaka';
import { MAHADOSHAS } from './lib/mahadoshas';
import { evaluateElectionMahadoshas, RASHI_LORD } from './lib/electionDoshas';
import { getGoodTimeWindows, type NamedWindow } from './lib/timewindows';
import {
  getAyana,
  DAKSHINAYANA_WARN,
  DAKSHINAYANA_HARD_BLOCK,
  CHATURMASA_MASAS,
  CHATURMASA_BLOCKED_ACTIVITIES,
  KARTIKA_DAKSHINAYANA_EXCEPTION,
} from './lib/ayana';
import { getMudhaStatus, SHUKRA_MUDHA_SENSITIVE, GURU_MUDHA_SENSITIVE } from './lib/mudha';
import { classifyLagna, lagnaVerdictFor } from './lib/lagnaSuitability';
import { isChakraShuddhi } from './lib/chakraShuddhi';
import { getBhadraDayVerdict } from './lib/bhadra';
import { SOUTH_INDIAN_GRID, planetAbbr, RASHI_DEVANAGARI } from './lib/southIndianChart';
import { runMuhurtaSearch, describeTara, type EnrichedDay } from './lib/search';
import { localDateAtMidnight, localDateTime, toRealInstant, DISPLAY_TZ, REAL_TZ, isNextCalendarDay } from './lib/dateUtils';
import { searchIndiaPlaces, type IndiaPlaceResult } from './lib/locationSearch';
import './App.css';

function fmtDate(d: Date) {
  return d.toLocaleDateString('en-IN', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', timeZone: REAL_TZ });
}

function fmtTime(d: Date | null | undefined) {
  if (!d) return '—';
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: DISPLAY_TZ });
}

// Appends "(next day)" when the time has rolled past midnight relative to
// the panchang's own reference day (its sunrise) — see isNextCalendarDay.
function fmtTimeDay(d: Date | null | undefined, referenceDay: Date | null | undefined) {
  if (!d) return '—';
  const base = fmtTime(d);
  if (referenceDay && isNextCalendarDay(d, referenceDay)) return `${base} (next day)`;
  return base;
}

function fmtPeriod(p: TimePeriod | null | undefined, referenceDay?: Date | null) {
  if (!p) return 'Not applicable today';
  return `${fmtTimeDay(p.start, referenceDay)} – ${fmtTimeDay(p.end, referenceDay)}`;
}

function fmtWindow(w: NamedWindow, referenceDay?: Date | null) {
  return `${w.label}: ${fmtTimeDay(w.start, referenceDay)} – ${fmtTimeDay(w.end, referenceDay)}`;
}

// Renders a limb sequence (tithi/nakshatra/yoga/karana) as explicit
// start–end ranges instead of just "upto END", so both boundaries of every
// segment are visible, with "(next day)" markers where a segment crosses
// midnight relative to the day's own sunrise.
function fmtLimbSequence(
  items: { name: string; endTime: Date | null }[],
  dayStart: Date,
  referenceDay: Date,
): string {
  return items
    .map((item, i) => {
      const start = i === 0 ? dayStart : items[i - 1].endTime;
      const startStr = start ? fmtTimeDay(start, referenceDay) : '?';
      const endStr = item.endTime ? fmtTimeDay(item.endTime, referenceDay) : 'end of this Hindu day';
      return `${item.name} (${startStr} – ${endStr})`;
    })
    .join(' → ');
}

interface ChartPlanet {
  planet: string;
  rashi: { index: number; name: string };
  degreeInRashi: number;
  isRetrograde: boolean;
}

function tierLabel(tier: 'strict' | 'compromised' | 'rejected'): string {
  if (tier === 'strict') return '🏆 Uttama — Best';
  if (tier === 'compromised') return '✓ Madhyama — Good, with exceptions';
  return '✗ Adhama — Avoid';
}

function tierLabelShort(tier: 'strict' | 'compromised' | 'rejected'): string {
  if (tier === 'strict') return 'Uttama (Best)';
  if (tier === 'compromised') return 'Madhyama (Good, with exceptions)';
  return 'Adhama (Avoid)';
}

// A day can have 2 (rarely 3) tithis/nakshatras in sequence. The compact
// day-summary line always shows the first one for brevity, but a specific
// time window late in the day may actually fall under the SECOND one after
// a transition. This picks whichever element's range actually contains the
// given moment, so per-window detail is accurate rather than inherited
// from the day's first-listed value.
function activeLimbAt<T extends { name: string; endTime: Date | null }>(items: T[], moment: Date): T {
  for (const item of items) {
    if (!item.endTime || moment.getTime() < item.endTime.getTime()) return item;
  }
  return items[items.length - 1];
}

// Derives nakshatra + pada from a sidereal longitude (27 nakshatras of
// 13°20' each, 4 padas of 3°20' each) — used for the Kundali planetary
// positions table, since PlanetPlacement gives rashi/degree but not
// nakshatra directly.
// The 6 classical Ritus (seasons) follow a fixed 2-lunar-month mapping —
// well-established, deterministic, no library function needed for it.
const RITU_BY_MASA: Record<string, string> = {
  Chaitra: 'Vasanta (Spring)', Vaishakha: 'Vasanta (Spring)',
  Jyeshtha: 'Grishma (Summer)', Ashadha: 'Grishma (Summer)',
  Shravana: 'Varsha (Monsoon)', Bhadrapada: 'Varsha (Monsoon)',
  Ashwina: 'Sharad (Autumn)', Kartika: 'Sharad (Autumn)',
  Margashirsha: 'Hemanta (Pre-winter)', Pausha: 'Hemanta (Pre-winter)',
  Magha: 'Shishira (Winter)', Phalguna: 'Shishira (Winter)',
};
const SHUBHA_PLANETS = new Set(['Jupiter', 'Venus', 'Mercury', 'Moon']);

function rituFromMasa(masaName: string): string {
  const base = masaName.replace('Adhika ', '');
  return RITU_BY_MASA[base] ?? '—';
}

// Vimshottari nakshatra-lord cycle (Ketu→Venus→Sun→Moon→Mars→Rahu→Jupiter→
// Saturn→Mercury, repeating 3× across the 27 nakshatras) — used to show each
// planet's Nakshatra Lord in the Kundali graha table.
const NAKSHATRA_LORD_CYCLE = ['Ketu', 'Venus', 'Sun', 'Moon', 'Mars', 'Rahu', 'Jupiter', 'Saturn', 'Mercury'];
function nakshatraLordFromLongitude(longitude: number): string {
  const idx = Math.floor(longitude / (360 / 27)) % 27;
  return NAKSHATRA_LORD_CYCLE[idx % 9];
}

// Which houses (from the given Lagna) a planet rules, based on which two (or
// one, for Sun/Moon) rashis it is lord of.
function housesRuledBy(planetName: string, lagnaRashiIdx: number): number[] {
  const owned: number[] = [];
  RASHI_LORD.forEach((lord, rashiIdx) => {
    if (lord === planetName) owned.push(((rashiIdx - lagnaRashiIdx + 12) % 12) + 1);
  });
  return owned;
}

function nakshatraFromLongitude(longitude: number): { name: string; pada: number } {
  const span = 360 / 27;
  const idx = Math.floor(longitude / span) % 27;
  const withinNak = longitude % span;
  const pada = Math.floor(withinNak / (span / 4)) + 1;
  return { name: NAKSHATRAS[idx], pada };
}


function IndiaLocationSearch({ onPick }: { onPick: (place: IndiaPlaceResult) => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<IndiaPlaceResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function search() {
    setBusy(true); setError('');
    try { setResults(await searchIndiaPlaces(q)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Location search failed'); }
    finally { setBusy(false); }
  }
  return (
    <div className="india-location-search">
      <label>Search any Indian city / town / village</label>
      <div className="inline-fields">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Amalapuram, Konaseema" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void search(); } }} />
        <button type="button" className="secondary" disabled={busy || q.trim().length < 2} onClick={() => void search()}>{busy ? 'Searching…' : 'Search'}</button>
      </div>
      {error && <small className="bad">{error}</small>}
      {results.length > 0 && <div className="place-results">{results.map((r, i) => (
        <button type="button" className="place-result" key={`${r.latitude}-${r.longitude}-${i}`} onClick={() => { onPick(r); setResults([]); setQ(r.displayName); }}>
          {r.displayName}
        </button>
      ))}</div>}
      <small>India-only place search. Data © OpenStreetMap contributors. For production traffic, use a hosted/self-hosted geocoder rather than the public demo endpoint.</small>
    </div>
  );
}

function panchakaRahitaAtWindow(tithi: unknown, varaName: string, nakshatraName: string, lagnaIndex: number) {
  const t = extractTithiNumber(tithi);
  const v = varaNumberFromName(varaName);
  const n = NAKSHATRAS.findIndex((x) => nakshatraName.toLowerCase().startsWith(x.toLowerCase().slice(0, 6)));
  if (!t || !v || n < 0) return null;
  return calculatePanchakaRahita(t, v, n + 1, lagnaIndex + 1);
}

function SouthIndianChart({ lagnaRashiIndex, planets }: { lagnaRashiIndex: number; planets: ChartPlanet[] }) {
  const cellSize = 90;
  const grid = SOUTH_INDIAN_GRID;
  const planetsByRashi = new Map<number, ChartPlanet[]>();
  for (const p of planets) {
    const list = planetsByRashi.get(p.rashi.index) ?? [];
    list.push(p);
    planetsByRashi.set(p.rashi.index, list);
  }
  return (
    <svg viewBox="0 0 360 360" className="south-indian-chart" role="img" aria-label="South Indian Rasi chart">
      <rect x={0} y={0} width={360} height={360} fill="none" stroke="var(--accent-dark, #8a4513)" strokeWidth={2} />
      {grid.map((cell) => {
        const x = cell.col * cellSize;
        const y = cell.row * cellSize;
        const rashiPlanets = planetsByRashi.get(cell.rashiIndex) ?? [];
        const isLagna = cell.rashiIndex === lagnaRashiIndex;
        return (
          <g key={cell.rashiIndex}>
            <rect x={x} y={y} width={cellSize} height={cellSize} fill={isLagna ? '#fdf2df' : 'none'} stroke="var(--border, #e6dcc8)" strokeWidth={1} />
            <text x={x + 5} y={y + 13} fontSize={10} fill="var(--muted, #7a6a55)">{RASHI_DEVANAGARI[cell.rashiIndex]}</text>
            {isLagna && <text x={x + cellSize - 8} y={y + 13} fontSize={9} fontWeight={700} fill="var(--accent-dark, #8a4513)" textAnchor="end">Asc</text>}
            {rashiPlanets.map((p, i) => (
              <text key={p.planet} x={x + 6} y={y + 28 + i * 13} fontSize={11} fontWeight={600} fill="#2b1d0e">
                {planetAbbr(p.planet)}{p.isRetrograde ? '(R)' : ''}
              </text>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

export default function App() {
  const [tab, setTab] = useState<'finder' | 'panchang' | 'personal' | 'fullReport' | 'kundali' | 'guide'>('panchang');
  const [birthDate, setBirthDate] = useState('');
  const [birthTime, setBirthTime] = useState('12:00');
  const [birthCityIdx, setBirthCityIdx] = useState(DEFAULT_CITY_INDEX);
  const [birthChart, setBirthChart] = useState<{ nakshatra: string; pada: number; rashi: string; lagna: string } | null>(null);
  const [birthError, setBirthError] = useState<string | null>(null);
  const [pDate, setPDate] = useState(new Date().toISOString().slice(0, 10));
  const [pCityIdx, setPCityIdx] = useState(DEFAULT_CITY_INDEX);
  const [panchang, setPanchang] = useState<DailyPanchangResult | null>(null);

  const [activityKey, setActivityKey] = useState('vivah');
  const today = new Date();
  const inThreeMonths = new Date();
  inThreeMonths.setMonth(inThreeMonths.getMonth() + 3);
  const [startDate, setStartDate] = useState(today.toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(inThreeMonths.toISOString().slice(0, 10));
  const [cityIdx, setCityIdx] = useState(DEFAULT_CITY_INDEX);
  const [nakshatraIdx, setNakshatraIdx] = useState(0);
  const [rashiIdx, setRashiIdx] = useState(0);
  const [groomNakshatraIdx, setGroomNakshatraIdx] = useState(0);
  const [groomRashiIdx, setGroomRashiIdx] = useState(0);
  const [usePersonalisation, setUsePersonalisation] = useState(false);
  const [brideNakshatraIdx, setBrideNakshatraIdx] = useState(0);
  const [brideRashiIdx, setBrideRashiIdx] = useState(0);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [reportCharts] = useState<Record<string, BirthChart>>({});
  const [selectedFullReport, setSelectedFullReport] = useState<{ key: string; day: EnrichedDay; city: ReturnType<typeof resolveCity>; activityKey: string; activityLabel: string } | null>(null);

  const [kundaliDate, setKundaliDate] = useState('');
  const [kundaliTime, setKundaliTime] = useState('12:00');
  const [kundaliPlace, setKundaliPlace] = useState<{ name: string; latitude: number; longitude: number; timezone: number } | null>(null);
  const [kundaliResult, setKundaliResult] = useState<{
    d1: BirthChart;
    d9: ReturnType<typeof computeNavamsa>;
    dasha: ReturnType<typeof computeVimshottariDashaFromBirth>;
  } | null>(null);
  const [kundaliError, setKundaliError] = useState<string | null>(null);

  function generateKundali() {
    setKundaliError(null);
    if (!kundaliDate) { setKundaliError('Please enter a birth date.'); return; }
    if (!kundaliPlace) { setKundaliError('Please search for and select a birth place.'); return; }
    try {
      const birthMoment = localDateTime(kundaliDate, kundaliTime, kundaliPlace.timezone);
      const location = { latitude: kundaliPlace.latitude, longitude: kundaliPlace.longitude };
      const d1 = computeRashiChart(birthMoment, location);
      const d9 = computeNavamsa(birthMoment, location);
      const dasha = computeVimshottariDashaFromBirth(birthMoment, 'lahiri');
      setKundaliResult({ d1, d9, dasha });
    } catch (e) {
      setKundaliError(e instanceof Error ? e.message : String(e));
    }
  }

  function openFullReport(key: string, r: EnrichedDay, forCity: ReturnType<typeof resolveCity>) {
    // Full Report evaluates every surviving Lagna window for the selected day.
    // Do not anchor the report to the first window; that could hide the best election.
    setSelectedFullReport({ key, day: r, city: forCity, activityKey, activityLabel: activity.label });
    setTab('fullReport');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const [results, setResults] = useState<EnrichedDay[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isVivah = activityKey === 'vivah';
  const ashtakoot: AshtakootResult | null = useMemo(() => {
    if (!isVivah || !usePersonalisation) return null;
    return computeAshtakoot(
      { rashi: groomRashiIdx, nakshatra: groomNakshatraIdx },
      { rashi: brideRashiIdx, nakshatra: brideNakshatraIdx },
    );
  }, [isVivah, usePersonalisation, groomRashiIdx, groomNakshatraIdx, brideRashiIdx, brideNakshatraIdx]);

  const [customLat, setCustomLat] = useState(20.0);
  const [customLng, setCustomLng] = useState(78.0);
  const activity = useMemo(() => ACTIVITIES.find((a) => a.key === activityKey)!, [activityKey]);
  const city = resolveCity(cityIdx, customLat, customLng);
  const pCity = resolveCity(pCityIdx, customLat, customLng);

  useEffect(() => {
    const result = getDailyPanchang(
      localDateAtMidnight(pDate, pCity.timezone),
      { latitude: pCity.latitude, longitude: pCity.longitude },
      { timezone: pCity.timezone },
    );
    setPanchang(result);
  }, [pDate, pCityIdx]);

  const dayContext = useMemo(() => {
    if (!panchang) return null;
    const sunRashiIdx = Math.floor(panchang.siderealSunAtSunrise / 30);
    const ayana = getAyana(sunRashiIdx);
    const positions = computePlanetaryPositions(toRealInstant(panchang.sunrise, pCity.timezone), 'lahiri');
    const mudha = getMudhaStatus(positions.sun.siderealLongitude, positions.venus.siderealLongitude, positions.jupiter.siderealLongitude);
    return { ayana, mudha };
  }, [panchang]);

  interface ActivityStatus {
    key: string;
    label: string;
    available: boolean;
    score: MuhurtaScore;
    panchakaBlocked: boolean;
    panchakaNote: string;
    ayanaWarn?: string;
    shukraMudhaWarn: boolean;
    guruMudhaWarn: boolean;
    windows: NamedWindow[];
    kalasaChakraShuddhi?: boolean;
    vrishabhaChakraShuddhi?: boolean;
    bhadraBlocked: boolean;
    bhadraNote: string;
  }

  const [expandedActivity, setExpandedActivity] = useState<string | null>(null);

  const activityChecklist: ActivityStatus[] = useMemo(() => {
    if (!panchang || !dayContext) return [];
    return ACTIVITIES.map((a) => {
      const rule: MuhurtaRule = { ...STOCK_MUHURTA_RULES[a.key], excludePanchaka: false, excludeBhadra: false };
      const score = scoreMuhurta(
        localDateAtMidnight(pDate, pCity.timezone),
        { latitude: pCity.latitude, longitude: pCity.longitude },
        rule,
        { timezone: pCity.timezone },
      );
      const nakshatraName = panchang.nakshatras[0]?.name ?? '';
      const type = panchakaTypeFromNakshatra(nakshatraName);
      const panchakaKey = PANCHAKA_ACTIVITY_KEY[a.key] ?? a.key;
      const verdict = getPanchakaVerdict(panchakaKey, panchang.panchaka, type);
      const bhadraVerdict = getBhadraDayVerdict(panchang);
      const inKartikaException = a.key === 'grihaPravesh' && KARTIKA_DAKSHINAYANA_EXCEPTION.has(a.key) && panchang.chandramasa.name === 'Kartika';
      const ayanaHardBlocked = dayContext.ayana === 'Dakshinayana' && DAKSHINAYANA_HARD_BLOCK.has(a.key);
      const chaturmasaBlocked = CHATURMASA_MASAS.has(panchang.chandramasa.name) && CHATURMASA_BLOCKED_ACTIVITIES.has(a.key);
      const dWarn = dayContext.ayana === 'Dakshinayana' && !inKartikaException && !ayanaHardBlocked ? DAKSHINAYANA_WARN[a.key] : undefined;
      let kalasaChakraShuddhi: boolean | undefined;
      let vrishabhaChakraShuddhi: boolean | undefined;
      if (a.key === 'grihaPravesh') {
        const dayNakIdx = NAKSHATRAS.findIndex((n) => nakshatraName.toLowerCase().startsWith(n.toLowerCase().slice(0, 6)));
        if (dayNakIdx >= 0) {
          const shuddhi = isChakraShuddhi(dayNakIdx);
          kalasaChakraShuddhi = shuddhi;
          vrishabhaChakraShuddhi = shuddhi;
        }
      }
      const lagnaWindows = getGoodTimeWindows(panchang, { latitude: pCity.latitude, longitude: pCity.longitude }, pCity.timezone);
      return {
        key: a.key,
        label: a.label,
        available: score.passes && !verdict.blocked && !ayanaHardBlocked && !chaturmasaBlocked && lagnaWindows.length > 0,
        score,
        panchakaBlocked: verdict.blocked,
        panchakaNote: verdict.note,
        bhadraBlocked: false,
        bhadraNote: bhadraVerdict.note,
        ayanaWarn: ayanaHardBlocked
          ? DAKSHINAYANA_WARN[a.key]?.note
          : chaturmasaBlocked
            ? 'Falls within Chaturmas — Vivaha, Griha Pravesh, and Upanayanam are traditionally paused entirely during this window.'
            : dWarn?.note,
        shukraMudhaWarn: dayContext.mudha.shukraMudha && SHUKRA_MUDHA_SENSITIVE.has(a.key),
        guruMudhaWarn: dayContext.mudha.guruMudha && GURU_MUDHA_SENSITIVE.has(a.key),
        windows: lagnaWindows,
        kalasaChakraShuddhi,
        vrishabhaChakraShuddhi,
      };
    });
  }, [panchang, dayContext, pDate, pCityIdx]);

  function runSearch() {
    setError(null);
    setLoading(true);
    try {
      const enriched = runMuhurtaSearch({
        activityKey,
        startDate,
        endDate,
        city,
        isVivah,
        personalize: tab === 'personal' ? true : usePersonalisation,
        nakshatraIdx,
        rashiIdx,
        groomNakshatraIdx,
        groomRashiIdx,
        brideNakshatraIdx,
        brideRashiIdx,
      });
      setResults(enriched);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function computeBirthChart() {
    setBirthError(null);
    if (!birthDate) {
      setBirthError('Please enter a birth date.');
      return;
    }
    try {
      const birthCity = resolveCity(birthCityIdx, customLat, customLng);
      const location = { latitude: birthCity.latitude, longitude: birthCity.longitude };
      const birthMoment = localDateTime(birthDate, birthTime, birthCity.timezone);
      const instant = getInstantPanchang(birthMoment, location);
      if (!instant) {
        setBirthError('Could not compute a panchang for this date/time/location (e.g. polar sunrise issue).');
        return;
      }
      const lagna = computeLagna(birthMoment, location, 'lahiri');

      const nakIdx = NAKSHATRAS.findIndex((n) => instant.nakshatra.name.toLowerCase().startsWith(n.toLowerCase().slice(0, 6)));
      const rashiIdx2 = RASHIS.findIndex((r) => instant.chandraRashi.name.toLowerCase().startsWith(r.toLowerCase().slice(0, 4)));
      if (nakIdx >= 0) {
        setNakshatraIdx(nakIdx);
        setGroomNakshatraIdx(nakIdx);
      }
      if (rashiIdx2 >= 0) {
        setRashiIdx(rashiIdx2);
        setGroomRashiIdx(rashiIdx2);
      }

      setBirthChart({
        nakshatra: instant.nakshatra.name,
        pada: instant.nakshatra.pada,
        rashi: instant.chandraRashi.name,
        lagna: lagna.rashi.name,
      });
    } catch (e) {
      setBirthError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="page">
      <header>
        <h1>Kāladarśī</h1>
        <p className="tagline">
          Panchāṅga-based auspicious timing, checked against Panchaka, the Ekaviṃśati Mahādoṣas,
          and (optionally) your birth star / rāśi.
        </p>
      </header>

      <section className="tribute-strip" aria-label="With reverence">
        <div className="tribute-item">
          <svg viewBox="0 0 44 44" className="tribute-icon"><path d="M22 4 L16 12 M22 4 L28 12 M22 4 L22 14" stroke="var(--accent-dark)" strokeWidth="2" fill="none" strokeLinecap="round"/><line x1="22" y1="14" x2="22" y2="34" stroke="var(--accent-dark)" strokeWidth="2"/><ellipse cx="22" cy="24" rx="7" ry="4" stroke="var(--accent-dark)" strokeWidth="1.6" fill="none"/><path d="M15 24 Q22 20 29 24" stroke="var(--accent-dark)" strokeWidth="1.2" fill="none"/><path d="M13 8 A5 5 0 0 1 20 6" stroke="var(--accent-dark)" strokeWidth="1.6" fill="none" strokeLinecap="round"/></svg>
          <span>महाकाल<br/><small>Lord of Time</small></span>
        </div>
        <div className="tribute-item">
          <svg viewBox="0 0 44 44" className="tribute-icon"><text x="22" y="24" fontSize="20" textAnchor="middle" fill="var(--accent-dark)" fontFamily="serif">ॐ</text><path d="M22 30 Q18 34 22 38 Q26 34 22 30 Z" stroke="var(--accent-dark)" strokeWidth="1.4" fill="none"/></svg>
          <span>गणेश<br/><small>Patron of the Art</small></span>
        </div>
        <div className="tribute-item">
          <svg viewBox="0 0 44 44" className="tribute-icon"><circle cx="22" cy="22" r="8" stroke="var(--accent-dark)" strokeWidth="1.8" fill="none"/>{Array.from({length:12}).map((_,i)=>{const a=(i*30)*Math.PI/180;const x1=22+11*Math.sin(a),y1=22-11*Math.cos(a),x2=22+17*Math.sin(a),y2=22-17*Math.cos(a);return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--accent-dark)" strokeWidth="1.6" strokeLinecap="round"/>;})}</svg>
          <span>सूर्य<br/><small>Sūrya Siddhānta</small></span>
        </div>
        <div className="tribute-item">
          <svg viewBox="0 0 44 44" className="tribute-icon">{Array.from({length:8}).map((_,i)=>{const a=(i*45)*Math.PI/180;const x=22+10*Math.sin(a),y=22-10*Math.cos(a);return <ellipse key={i} cx={x} cy={y} rx="4" ry="7" transform={`rotate(${i*45} ${x} ${y})`} stroke="var(--accent-dark)" strokeWidth="1.2" fill="none"/>;})}<circle cx="22" cy="22" r="3" fill="var(--accent-dark)"/></svg>
          <span>बृहस्पति<br/><small>Guru of Jyotiṣa</small></span>
        </div>
        <div className="tribute-item">
          <svg viewBox="0 0 44 44" className="tribute-icon"><path d="M14 30 Q14 20 22 20 Q30 20 30 30 Z" stroke="var(--accent-dark)" strokeWidth="1.6" fill="none"/><line x1="22" y1="20" x2="22" y2="10" stroke="var(--accent-dark)" strokeWidth="1.4"/><line x1="26" y1="20" x2="30" y2="10" stroke="var(--accent-dark)" strokeWidth="1.4" strokeLinecap="round"/><line x1="34" y1="8" x2="14" y2="34" stroke="var(--accent-dark)" strokeWidth="1.6" strokeLinecap="round"/></svg>
          <span>पराशर<br/><small>Father of Jyotiṣa</small></span>
        </div>
      </section>

      <nav className="tabs">
        <button className={tab === 'panchang' ? 'active' : ''} onClick={() => setTab('panchang')}>Today's Panchāṅga</button>
        <button className={tab === 'finder' ? 'active' : ''} onClick={() => setTab('finder')}>Muhurat Finder</button>
        <button className={tab === 'personal' ? 'active' : ''} onClick={() => setTab('personal')}>Personalised Muhurat</button>
        <button className={tab === 'fullReport' ? 'active' : ''} onClick={() => setTab('fullReport')}>Full Muhurat Report</button>
        <button className={tab === 'kundali' ? 'active' : ''} onClick={() => setTab('kundali')}>Kundali</button>
      </nav>

      {tab === 'panchang' && (
        <section className="panel">
          <div className="field-row">
            <div className="field">
              <label>Date</label>
              <input type="date" value={pDate} onChange={(e) => setPDate(e.target.value)} />
            </div>
            <div className="field">
              <label>Location</label>
              <p className="current-location">📍 {pCity.name}</p>
            </div>
          </div>
          <IndiaLocationSearch onPick={(place) => { setCustomLat(place.latitude); setCustomLng(place.longitude); setPCityIdx(CUSTOM_LOCATION_INDEX); }} />
          {pCityIdx === CUSTOM_LOCATION_INDEX && (
            <div className="field-row">
              <div className="field">
                <label>Latitude</label>
                <input type="number" step="0.0001" value={customLat} onChange={(e) => setCustomLat(Number(e.target.value))} />
              </div>
              <div className="field">
                <label>Longitude</label>
                <input type="number" step="0.0001" value={customLng} onChange={(e) => setCustomLng(Number(e.target.value))} />
              </div>
            </div>
          )}

          {!panchang && <p>No sunrise could be computed for this date/location (polar latitude).</p>}

          {panchang && (
            <>
            <div className="panchang-grid">
              <div className="pg-card">
                <h4>Pañcāṅga (5 limbs)</h4>
                <dl>
                  <dt>Tithi</dt><dd>{fmtLimbSequence(panchang.tithis, panchang.sunrise, panchang.sunrise)}</dd>
                  <dt>Vāra</dt><dd>{panchang.vara.name} ({panchang.vara.englishName})</dd>
                  <dt>Nakṣatra</dt><dd>{fmtLimbSequence(panchang.nakshatras.map((n) => ({ name: `${n.name} (pada ${n.pada})`, endTime: n.endTime })), panchang.sunrise, panchang.sunrise)}</dd>
                  <dt>Yoga</dt><dd>{fmtLimbSequence(panchang.yogas, panchang.sunrise, panchang.sunrise)}</dd>
                  <dt>Karaṇa</dt><dd>{fmtLimbSequence(panchang.karanas, panchang.sunrise, panchang.sunrise)}</dd>
                </dl>
              </div>

              <div className="pg-card">
                <h4>Sun &amp; Moon</h4>
                <dl>
                  <dt>Sunrise</dt><dd>{fmtTime(panchang.sunrise)}</dd>
                  <dt>Sunset</dt><dd>{fmtTime(panchang.sunset)}</dd>
                  <dt>Moonrise</dt><dd>{fmtTime(panchang.moonrise)}</dd>
                  <dt>Moonset</dt><dd>{fmtTime(panchang.moonset)}</dd>
                  <dt>Chandra Rāśi</dt><dd>{panchang.chandraRashi?.name}</dd>
                  <dt>Sūrya Nakṣatra</dt><dd>{panchang.suryaNakshatra?.name}</dd>
                  <dt>Dinamāna</dt><dd>{Math.floor(panchang.dinamanaMinutes / 60)}h {Math.round(panchang.dinamanaMinutes % 60)}m</dd>
                  <dt>Rātrimāna</dt><dd>{Math.floor(panchang.ratrimanaMinutes / 60)}h {Math.round(panchang.ratrimanaMinutes % 60)}m</dd>
                </dl>
              </div>

              <div className="pg-card">
                <h4>Calendar</h4>
                <dl>
                  <dt>Pakṣa</dt><dd>{panchang.tithis[0]?.paksha}</dd>
                  <dt>Ṛtu</dt><dd>{rituFromMasa(panchang.chandramasa.name)}</dd>
                  <dt>Chāndra Māsa</dt><dd>{panchang.chandramasa.name}{panchang.chandramasa.isAdhika ? ' (Adhika)' : ''}</dd>
                  <dt>Vikram Samvat</dt><dd>{panchang.samvat.vikramSamvat}</dd>
                  <dt>Śaka Samvat</dt><dd>{panchang.samvat.shakaSamvat}</dd>
                </dl>
              </div>

              <div className="pg-card warn">
                <h4>Inauspicious periods</h4>
                <dl>
                  <dt>Rāhu Kālam</dt><dd>{fmtPeriod(panchang.rahuKalam, panchang.sunrise)}</dd>
                  <dt>Yamagaṇḍa</dt><dd>{fmtPeriod(panchang.yamaganda, panchang.sunrise)}</dd>
                  <dt>Gulika Kālam</dt><dd>{fmtPeriod(panchang.gulikaKalam, panchang.sunrise)}</dd>
                  <dt>Dur Muhūrta</dt><dd>{panchang.durMuhurta.map((p) => fmtPeriod(p, panchang.sunrise)).join(' · ')}</dd>
                  <dt>Panchaka</dt><dd>{panchang.panchaka ? `Active — ${panchakaTypeFromNakshatra(panchang.nakshatras[0]?.name ?? '') ?? 'unknown type'} Panchaka` : 'Not active'}</dd>
                </dl>
              </div>

              <div className="pg-card good">
                <h4>Auspicious windows</h4>
                <dl>
                  <dt>Abhijit Muhūrta</dt><dd>{fmtPeriod(panchang.abhijitMuhurta, panchang.sunrise)}</dd>
                  <dt>Brahma Muhūrta</dt><dd>{fmtPeriod(panchang.brahmaMuhurta, panchang.sunrise)}</dd>
                  {panchang.specialYogas.length > 0 && (
                    <>
                      <dt>Special Yogas</dt>
                      <dd>{panchang.specialYogas.map((y) => y.name).join(', ')}</dd>
                    </>
                  )}
                </dl>
              </div>
            </div>

            <div className="pg-card hora-card">
              <h4>Hora (Planetary Hours)</h4>
              <p className="hint">
                Each Hora is ruled by one of the 7 classical planets (12 per day, 12 per night, Chaldean
                order). Shubha (auspicious) Horas — Jupiter, Venus, Mercury, Moon — are marked green;
                Pāpa (malefic) Horas — Sun, Mars, Saturn — are marked red.
              </p>
              <div className="hora-grid">
                <div>
                  <p className="sub-label">Day</p>
                  <ul className="hora-list">
                    {panchang.hora.day.map((h, i) => (
                      <li key={i} className={SHUBHA_PLANETS.has(h.planet) ? 'hora-shubha' : 'hora-papa'}>
                        {h.planet}: {fmtTimeDay(h.start, panchang.sunrise)} – {fmtTimeDay(h.end, panchang.sunrise)}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="sub-label">Night</p>
                  <ul className="hora-list">
                    {panchang.hora.night.map((h, i) => (
                      <li key={i} className={SHUBHA_PLANETS.has(h.planet) ? 'hora-shubha' : 'hora-papa'}>
                        {h.planet}: {fmtTimeDay(h.start, panchang.sunrise)} – {fmtTimeDay(h.end, panchang.sunrise)}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
            </>
          )}

          {dayContext && (
            <div className={`ayana-banner ${dayContext.ayana === 'Dakshinayana' ? 'warn' : ''}`}>
              <strong>{dayContext.ayana}</strong>
              {dayContext.mudha.shukraMudha && <span className="mudha-tag">Shukra Mudha (Venus combust)</span>}
              {dayContext.mudha.guruMudha && <span className="mudha-tag">Guru Mudha (Jupiter combust)</span>}
            </div>
          )}

          {activityChecklist.length > 0 && (
            <div className="activity-checklist">
              <p className="sub-label">Which muhurats are available today:</p>
              {activityChecklist.map((a) => {
                const isOpen = expandedActivity === a.key;
                const hasWarn = !!a.ayanaWarn || a.shukraMudhaWarn || a.guruMudhaWarn;
                return (
                  <div key={a.key} className={`checklist-row ${a.available ? 'yes' : 'no'}`}>
                    <button className="checklist-head" onClick={() => setExpandedActivity(isOpen ? null : a.key)}>
                      <span className="mark">{a.available ? '✅' : '❌'}</span>
                      <span className="label">{a.label}</span>
                      {hasWarn && <span className="warn-mark">⚠️</span>}
                      <span className="chev">{isOpen ? '▲' : '▼'}</span>
                    </button>
                    {isOpen && (
                      <div className="checklist-detail">
                        {a.available ? (
                          <>
                            <ul className="reasons">
                              {a.score.reasons.map((r, i) => <li key={i}>{r}</li>)}
                              <li>{a.panchakaNote}</li>
                              <li>{a.bhadraNote}</li>
                              {a.ayanaWarn && <li className="warn">⚠️ {a.ayanaWarn}</li>}
                              {a.shukraMudhaWarn && <li className="warn">⚠️ Shukra Mudha active — Venus is combust; classical sources say avoid this activity while Venus is invisible near the Sun.</li>}
                              {a.guruMudhaWarn && <li className="warn">⚠️ Guru Mudha active — Jupiter is combust; classical sources say avoid this activity while Jupiter is invisible near the Sun.</li>}
                              {a.kalasaChakraShuddhi !== undefined && (
                                <li className={a.kalasaChakraShuddhi ? 'chakra-ok' : 'chakra-bad'}>
                                  {a.kalasaChakraShuddhi ? '🟢' : '🔴'} Kalasa Chakra Shuddhi: {a.kalasaChakraShuddhi ? 'pure' : 'not pure — avoid'}
                                </li>
                              )}
                              {a.vrishabhaChakraShuddhi !== undefined && (
                                <li className={a.vrishabhaChakraShuddhi ? 'chakra-ok' : 'chakra-bad'}>
                                  {a.vrishabhaChakraShuddhi ? '🟢' : '🔴'} Vrishabha Chakra Shuddhi: {a.vrishabhaChakraShuddhi ? 'pure' : 'not pure — avoid'}
                                </li>
                              )}
                            </ul>
                            {a.windows.length > 0 ? (
                              <>
                                <p className="sub-label">Candidate Lagna windows today (after interval exclusions):</p>
                                <ul className="reasons">
                                  {a.windows.map((w, i) => (
                                    <li key={i} className={w.note ? 'warn' : ''}>{fmtWindow(w, panchang?.sunrise)}{w.note ? ` — ${w.note}` : ''}</li>
                                  ))}
                                </ul>
                              </>
                            ) : (
                              <p className="sub-label">No surviving Lagna window remains after the currently implemented interval checks.</p>
                            )}
                          </>
                        ) : (
                          <>
                            <p className="sub-label">Not available today because:</p>
                            <ul className="reasons">
                              {!a.score.passes && a.score.reasons.map((r, i) => <li key={i} className="bad">{r}</li>)}
                              {a.panchakaBlocked && <li className="bad">{a.panchakaNote}</li>}
                              {a.bhadraBlocked && <li className="bad">{a.bhadraNote}</li>}
                            </ul>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {tab === 'finder' && (
      <>
      <section className="panel form-panel">
        <div className="field">
          <label>Activity (Muhūrta)</label>
          <select value={activityKey} onChange={(e) => setActivityKey(e.target.value)}>
            {ACTIVITIES.map((a) => (
              <option key={a.key} value={a.key}>{a.label}</option>
            ))}
          </select>
        </div>

        <div className="field-row">
          <div className="field">
            <label>From</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="field">
            <label>To</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>

        <div className="field">
          <label>Location</label>
          <p className="current-location">📍 {city.name}</p>
        </div>
        <IndiaLocationSearch onPick={(place) => { setCustomLat(place.latitude); setCustomLng(place.longitude); setCityIdx(CUSTOM_LOCATION_INDEX); }} />
        {cityIdx === CUSTOM_LOCATION_INDEX && (
          <div className="field-row">
            <div className="field">
              <label>Latitude</label>
              <input type="number" step="0.0001" value={customLat} onChange={(e) => setCustomLat(Number(e.target.value))} />
            </div>
            <div className="field">
              <label>Longitude</label>
              <input type="number" step="0.0001" value={customLng} onChange={(e) => setCustomLng(Number(e.target.value))} />
            </div>
          </div>
        )}

        <label className="checkbox-field">
          <input type="checkbox" checked={usePersonalisation} onChange={(e) => setUsePersonalisation(e.target.checked)} />
          Personalise with Nakshatra/Rāśi (optional — leave off for a general search)
        </label>

        {usePersonalisation && isVivah ? (
          <>
            <div className="field-row">
              <div className="field">
                <label>Groom's Nakshatra</label>
                <select value={groomNakshatraIdx} onChange={(e) => setGroomNakshatraIdx(Number(e.target.value))}>
                  {NAKSHATRAS.map((n, i) => <option key={n} value={i}>{n}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Groom's Rāśi</label>
                <select value={groomRashiIdx} onChange={(e) => setGroomRashiIdx(Number(e.target.value))}>
                  {RASHIS.map((r, i) => <option key={r} value={i}>{r}</option>)}
                </select>
              </div>
            </div>
            <div className="field-row">
              <div className="field">
                <label>Bride's Nakshatra</label>
                <select value={brideNakshatraIdx} onChange={(e) => setBrideNakshatraIdx(Number(e.target.value))}>
                  {NAKSHATRAS.map((n, i) => <option key={n} value={i}>{n}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Bride's Rāśi</label>
                <select value={brideRashiIdx} onChange={(e) => setBrideRashiIdx(Number(e.target.value))}>
                  {RASHIS.map((r, i) => <option key={r} value={i}>{r}</option>)}
                </select>
              </div>
            </div>
            {ashtakoot && (
              <div className={`verdict-card ${ashtakoot.totalScore >= 18 ? 'good' : 'blocked'}`}>
                <h4>Ashtakoot Guna Milan: {ashtakoot.totalScore}/36</h4>
                <p className="sub-label">{ashtakoot.totalScore >= 18 ? 'Meets the commonly used 18/36 minimum threshold.' : 'Below the commonly used 18/36 minimum threshold.'}</p>
                <ul className="reasons">
                  {ashtakoot.koots.map((k) => (
                    <li key={k.name}>{k.name}: {k.score}/{k.maxScore} — {k.description}</li>
                  ))}
                  {ashtakoot.cancellations.map((c, i) => <li key={`c${i}`}>Cancellation applied: {c}</li>)}
                </ul>
              </div>
            )}
          </>
        ) : usePersonalisation ? (
          <div className="field-row">
            <div className="field">
              <label>Nakshatra</label>
              <select value={nakshatraIdx} onChange={(e) => setNakshatraIdx(Number(e.target.value))}>
                {NAKSHATRAS.map((n, i) => (
                  <option key={n} value={i}>{n}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Rāśi (Moon sign)</label>
              <select value={rashiIdx} onChange={(e) => setRashiIdx(Number(e.target.value))}>
                {RASHIS.map((r, i) => (
                  <option key={r} value={i}>{r}</option>
                ))}
              </select>
            </div>
          </div>
        ) : null}

        <button className="primary" onClick={runSearch} disabled={loading}>
          {loading ? 'Calculating…' : 'Find Auspicious Dates'}
        </button>
        {error && <p className="error">{error}</p>}
      </section>

      {results && (
        <section className="panel results-panel">
          <h2>{activity.label} — {results.length} candidate date{results.length === 1 ? '' : 's'}</h2>
          {results.length === 0 && <p>No dates in this range passed the base Panchāṅga rule. Try widening the range.</p>}
          <div className="results-list">
            {results.map((r) => {
              const key = r.raw.date.toISOString();
              const isOpen = expandedDate === key;
              const windows = isOpen ? getGoodTimeWindows(r.raw.panchang, { latitude: city.latitude, longitude: city.longitude }, city.timezone) : [];
              return (
                <article key={key} className={`result-card clickable ${r.tier === 'rejected' ? 'blocked' : r.tier === 'strict' ? 'good' : 'ok'}`} onClick={() => setExpandedDate(isOpen ? null : key)}>
                  <div className="result-head">
                    <h3>{fmtDate(r.raw.date)}</h3>
                    <span className={`tier-badge tier-${r.tier}`}>
                      {tierLabel(r.tier)}
                    </span>
                    <span className="score">{r.finalScore}/100</span>
                  </div>
                  <p className="tier-explain">{r.tierNote}</p>
                  <p className="panchang-line">
                    {r.raw.panchang.tithis[0]?.name} · {r.raw.panchang.vara.englishName} · {r.raw.panchang.nakshatras[0]?.name} · {r.raw.panchang.yogas[0]?.name} yoga
                  </p>
                  <ul className="reasons">
                    {r.raw.reasons.map((reason, i) => <li key={i}>{reason}</li>)}
                    <li className={r.panchakaBlocked ? 'bad' : ''}>{r.panchakaNote}</li>
                    <li className={r.bhadraBlocked ? 'bad' : ''}>{r.bhadraNote}</li>
                    {r.ayanaHardBlocked && <li className="bad">🚫 {r.tierNote}</li>}
                    {r.chaturmasaBlocked && <li className="bad">🚫 {r.tierNote}</li>}
                    {r.autoDoshaHits.map((h, i) => <li key={`d${i}`} className="bad">{h}</li>)}
                    {r.ayanaWarn && <li className="warn">⚠️ {r.ayanaWarn}</li>}
                    {r.shukraMudhaWarn && <li className="warn">⚠️ Shukra Mudha active (Venus combust) — classically avoided for this activity.</li>}
                    {r.guruMudhaWarn && <li className="warn">⚠️ Guru Mudha active (Jupiter combust) — classically avoided for this activity.</li>}
                    {r.kalasaChakraShuddhi !== undefined && (
                      <li className={r.kalasaChakraShuddhi ? 'chakra-ok' : 'chakra-bad'}>
                        {r.kalasaChakraShuddhi ? '🟢' : '🔴'} Kalasa Chakra Shuddhi (Griha Pravesh): {r.kalasaChakraShuddhi ? 'pure' : 'not pure — avoid'}
                      </li>
                    )}
                    {r.vrishabhaChakraShuddhi !== undefined && (
                      <li className={r.vrishabhaChakraShuddhi ? 'chakra-ok' : 'chakra-bad'}>
                        {r.vrishabhaChakraShuddhi ? '🟢' : '🔴'} Vrishabha Chakra Shuddhi (Griha Arambha): {r.vrishabhaChakraShuddhi ? 'pure' : 'not pure — avoid'}
                      </li>
                    )}
                    {r.taraNote && <li>Tārābala: {r.taraNote}</li>}
                    {r.brideTaraNote && <li>Tārābala: {r.brideTaraNote}</li>}
                    {r.chandraNote && <li>{r.chandraNote}</li>}
                  </ul>
                  {(r.merits.length > 0 || r.demerits.length > 0) && <div className="merit-summary">
                    {r.merits.length > 0 && <><p className="sub-label">Merits</p><ul className="reasons">{r.merits.map((m,i)=><li key={`m-${i}`} className="chakra-ok">✓ {m}</li>)}</ul></>}
                    {r.demerits.length > 0 && <><p className="sub-label">Demerits</p><ul className="reasons">{r.demerits.map((m,i)=><li key={`d-${i}`} className="bad">✗ {m}</li>)}</ul></>}
                  </div>}
                  <p className="expand-hint">{isOpen ? '▲ Hide time windows' : '▼ Click to see what time the good muhurats are on this date'}</p>
                  {isOpen && (
                    <div className="time-windows">
                      {r.clearedChecks.length > 0 && (
                        <>
                          <p className="sub-label">Doshas checked and cleared:</p>
                          <ul className="reasons">
                            {r.clearedChecks.map((c, i) => <li key={i} className="chakra-ok">✓ {c}</li>)}
                          </ul>
                        </>
                      )}
                      {r.compromises.length > 0 && (
                        <>
                          <p className="sub-label">Exceptions / compromises relied on (thumb rule + why):</p>
                          <ul className="reasons">
                            {r.compromises.map((c, i) => <li key={i} className="warn">⚠️ {c}</li>)}
                          </ul>
                        </>
                      )}
                      {windows.length === 0 ? (
                        <p className="sub-label">No surviving Lagna window found after the currently implemented interval checks.</p>
                      ) : (
                        <ul className="reasons">
                          {windows.map((w, i) => {
                            const lagna = computeLagna(toRealInstant(w.start, city.timezone), { latitude: city.latitude, longitude: city.longitude }, 'lahiri');
                            const lagnaType = classifyLagna(lagna.rashi.index ?? 0);
                            const lagnaVerdict = lagnaVerdictFor(activityKey, lagnaType);
                            const activeTithi = activeLimbAt(r.raw.panchang.tithis, w.start);
                            const activeNak = activeLimbAt(r.raw.panchang.nakshatras, w.start);
                            const pr = panchakaRahitaAtWindow(activeTithi, r.raw.panchang.vara.englishName, activeNak.name, lagna.rashi.index ?? 0);
                            return (
                              <li key={i} className={w.note ? 'warn' : ''}>
                                {fmtWindow(w, r.raw.panchang.sunrise)}{w.note ? ` — ${w.note}` : ''}
                                <br />
                                <span className="window-limb-tag">At this time: {activeTithi.name}, {activeNak.name}</span>
                                <br />
                                <span className={`lagna-tag ${lagnaVerdict}`}>
                                  Lagna: {lagna.rashi.name} ({lagnaType}) — {lagnaVerdict === 'auspicious' ? '✅ favourable' : lagnaVerdict === 'medium' ? '➖ acceptable' : '⚠️ generally avoided'} for {activity.label}
                                </span>
                                {pr && <><br /><span className={`lagna-tag ${pr.rahita ? 'auspicious' : 'avoid'}`}>Panchaka Rahita: {pr.rahita ? '✅ Rahita' : `⚠️ ${pr.type} Panchaka`} — remainder {pr.remainder}</span></>}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                      <button className="secondary" onClick={(e) => { e.stopPropagation(); openFullReport(key, r, city); }}>📋 Open Full Muhurat Report</button>
                      {reportCharts[key] && (
                        <div className="report-block" onClick={(e) => e.stopPropagation()}>
                          <h4>Full Report — {activity.label}, {fmtDate(r.raw.date)}</h4>
                          <p className="sub-label">Chart cast for the first surviving Lagna window's start time ({windows[0] ? fmtWindow(windows[0], r.raw.panchang.sunrise) : 'day sunrise'}), {city.name}.</p>
                          <div className="report-grid">
                            <SouthIndianChart lagnaRashiIndex={reportCharts[key].lagna.rashi.index} planets={reportCharts[key].planets} />
                            <div className="report-text">
                              <p><strong>Lagna:</strong> {reportCharts[key].lagna.rashi.name} ({reportCharts[key].lagna.degreeInRashi.toFixed(1)}°), {reportCharts[key].lagna.nakshatra.name} pada {reportCharts[key].lagna.pada}</p>
                              <p><strong>Tier:</strong> {tierLabelShort(r.tier)}</p>
                              <ul className="reasons">
                                {reportCharts[key].planets.map((pl) => (
                                  <li key={pl.planet}>{pl.planet}: {pl.rashi.name} {pl.degreeInRashi.toFixed(1)}° (house {pl.house}){pl.isRetrograde ? ' (R)' : ''}</li>
                                ))}
                              </ul>
                              <h4>Phase 2 — Election-chart Mahādoṣa checks</h4>
                              <ul className="reasons">
                                {evaluateElectionMahadoshas(reportCharts[key]).map((d) => (
                                  <li key={d.n} className={d.state === 'present' ? 'bad' : ''}>
                                    <strong>#{d.n} {d.name}:</strong> {d.state === 'present' ? '❌ detected' : '✅ clear'} — {d.detail}
                                  </li>
                                ))}
                              </ul>
                              <p className="hint"><strong>Important:</strong> this layer detects the chart configuration only. It does not yet silently cancel a detected doṣa. Apavāda/doṣa-bhaṅga will be evaluated separately, with the activity and textual tradition shown explicitly.</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}
      </>
      )}

      {tab === 'personal' && (
        <>
        <section className="panel form-panel">
          <p className="sub-label">Enter your birth details to compute your Nakshatra, Rāśi and Lagna, which then personalise every search below.</p>
          <div className="field-row">
            <div className="field">
              <label>Birth Date</label>
              <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
            </div>
            <div className="field">
              <label>Birth Time</label>
              <input type="time" value={birthTime} onChange={(e) => setBirthTime(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label>Birth Place</label>
            <p className="current-location">📍 {resolveCity(birthCityIdx, customLat, customLng).name}</p>
          </div>
          <IndiaLocationSearch onPick={(place) => { setCustomLat(place.latitude); setCustomLng(place.longitude); setBirthCityIdx(CUSTOM_LOCATION_INDEX); }} />
          {birthCityIdx === CUSTOM_LOCATION_INDEX && (
            <div className="field-row">
              <div className="field">
                <label>Latitude</label>
                <input type="number" step="0.0001" value={customLat} onChange={(e) => setCustomLat(Number(e.target.value))} />
              </div>
              <div className="field">
                <label>Longitude</label>
                <input type="number" step="0.0001" value={customLng} onChange={(e) => setCustomLng(Number(e.target.value))} />
              </div>
            </div>
          )}
          <button className="primary" onClick={computeBirthChart}>Compute My Chart</button>
          {birthError && <p className="error">{birthError}</p>}

          {birthChart && (
            <div className="verdict-card good">
              <h4>Your birth chart</h4>
              <ul className="reasons">
                <li>Nakshatra: {birthChart.nakshatra} (pada {birthChart.pada})</li>
                <li>Rāśi (Moon sign): {birthChart.rashi}</li>
                <li>Lagna (Ascendant): {birthChart.lagna}</li>
              </ul>
              <p className="hint">
                This is a quick summary (Nakṣatra/Rāśi/Lagna only). For your full birth chart — Rāśi
                (D1) and Navāṁśa (D9) charts, every planet's house, and your Vimśottari Daśā — generate
                it in the <button type="button" className="link-button" onClick={() => setTab('kundali')}>Kundali tab</button>.
                Once generated, muhurat searches here and the Full Muhurat Report will also cross-check
                candidate Lagnas against your own natal Lagna for a more precise result.
              </p>
            </div>
          )}
        </section>

        {birthChart && (
          <>
            <section className="panel form-panel">
              <div className="field">
                <label>Activity (Muhūrta)</label>
                <select value={isVivah ? 'vivah-blocked' : activityKey} onChange={(e) => setActivityKey(e.target.value)}>
                  {ACTIVITIES.filter((a) => a.key !== 'vivah').map((a) => (
                    <option key={a.key} value={a.key}>{a.label}</option>
                  ))}
                </select>
                <p className="hint">Marriage isn't listed here since it needs both partners' details — use the Muhurat Finder tab for that (your details are pre-filled there).</p>
              </div>
              <div className="field-row">
                <div className="field">
                  <label>From</label>
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
                <div className="field">
                  <label>To</label>
                  <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </div>
              </div>
              <div className="field">
                <label>Location for the event</label>
                <p className="current-location">📍 {city.name}</p>
              </div>
              <IndiaLocationSearch onPick={(place) => { setCustomLat(place.latitude); setCustomLng(place.longitude); setCityIdx(CUSTOM_LOCATION_INDEX); }} />
              {cityIdx === CUSTOM_LOCATION_INDEX && (
                <div className="field-row">
                  <div className="field">
                    <label>Latitude</label>
                    <input type="number" step="0.0001" value={customLat} onChange={(e) => setCustomLat(Number(e.target.value))} />
                  </div>
                  <div className="field">
                    <label>Longitude</label>
                    <input type="number" step="0.0001" value={customLng} onChange={(e) => setCustomLng(Number(e.target.value))} />
                  </div>
                </div>
              )}
              <button className="primary" onClick={runSearch} disabled={loading || isVivah}>
                {loading ? 'Calculating…' : 'Find My Personalised Muhurats'}
              </button>
              {error && <p className="error">{error}</p>}
            </section>

            {results && !isVivah && (
              <section className="panel results-panel">
                <h2>{activity.label} — {results.length} candidate date{results.length === 1 ? '' : 's'} personalised to your chart</h2>
                {results.length === 0 && <p>No dates in this range passed the base Panchāṅga rule. Try widening the range.</p>}
                <div className="results-list">
                  {results.map((r) => {
                    const key = r.raw.date.toISOString();
                    const isOpen = expandedDate === key;
                    const windows = isOpen ? getGoodTimeWindows(r.raw.panchang, { latitude: city.latitude, longitude: city.longitude }, city.timezone) : [];
                    return (
                      <article key={key} className={`result-card clickable ${r.tier === 'rejected' ? 'blocked' : r.tier === 'strict' ? 'good' : 'ok'}`} onClick={() => setExpandedDate(isOpen ? null : key)}>
                        <div className="result-head">
                          <h3>{fmtDate(r.raw.date)}</h3>
                          <span className={`tier-badge tier-${r.tier}`}>
                            {tierLabel(r.tier)}
                          </span>
                          <span className="score">{r.finalScore}/100</span>
                        </div>
                        <p className="tier-explain">{r.tierNote}</p>
                        <p className="panchang-line">
                          {r.raw.panchang.tithis[0]?.name} · {r.raw.panchang.vara.englishName} · {r.raw.panchang.nakshatras[0]?.name} · {r.raw.panchang.yogas[0]?.name} yoga
                        </p>
                        <ul className="reasons">
                          {r.raw.reasons.map((reason, i) => <li key={i}>{reason}</li>)}
                          <li className={r.panchakaBlocked ? 'bad' : ''}>{r.panchakaNote}</li>
                          <li className={r.bhadraBlocked ? 'bad' : ''}>{r.bhadraNote}</li>
                          {r.ayanaHardBlocked && <li className="bad">🚫 {r.tierNote}</li>}
                          {r.chaturmasaBlocked && <li className="bad">🚫 {r.tierNote}</li>}
                          {r.ayanaWarn && <li className="warn">⚠️ {r.ayanaWarn}</li>}
                          {r.shukraMudhaWarn && <li className="warn">⚠️ Shukra Mudha active (Venus combust).</li>}
                          {r.guruMudhaWarn && <li className="warn">⚠️ Guru Mudha active (Jupiter combust).</li>}
                          {r.kalasaChakraShuddhi !== undefined && (
                            <li className={r.kalasaChakraShuddhi ? 'chakra-ok' : 'chakra-bad'}>
                              {r.kalasaChakraShuddhi ? '🟢' : '🔴'} Kalasa Chakra Shuddhi: {r.kalasaChakraShuddhi ? 'pure' : 'not pure — avoid'}
                            </li>
                          )}
                          {r.vrishabhaChakraShuddhi !== undefined && (
                            <li className={r.vrishabhaChakraShuddhi ? 'chakra-ok' : 'chakra-bad'}>
                              {r.vrishabhaChakraShuddhi ? '🟢' : '🔴'} Vrishabha Chakra Shuddhi: {r.vrishabhaChakraShuddhi ? 'pure' : 'not pure — avoid'}
                            </li>
                          )}
                          {r.taraNote && <li>Tārābala: {r.taraNote}</li>}
                          {r.chandraNote && <li>{r.chandraNote}</li>}
                        </ul>
                        {(r.merits.length > 0 || r.demerits.length > 0) && <div className="merit-summary">
                          {r.merits.length > 0 && <><p className="sub-label">Merits</p><ul className="reasons">{r.merits.map((m,i)=><li key={`m-${i}`} className="chakra-ok">✓ {m}</li>)}</ul></>}
                          {r.demerits.length > 0 && <><p className="sub-label">Demerits</p><ul className="reasons">{r.demerits.map((m,i)=><li key={`d-${i}`} className="bad">✗ {m}</li>)}</ul></>}
                        </div>}
                        <p className="expand-hint">{isOpen ? '▲ Hide time windows' : '▼ Click to see what time the good muhurats are on this date'}</p>
                        {isOpen && (
                          <div className="time-windows">
                            {r.clearedChecks.length > 0 && (
                              <>
                                <p className="sub-label">Doshas checked and cleared:</p>
                                <ul className="reasons">
                                  {r.clearedChecks.map((c, i) => <li key={i} className="chakra-ok">✓ {c}</li>)}
                                </ul>
                              </>
                            )}
                            {r.compromises.length > 0 && (
                              <>
                                <p className="sub-label">Exceptions / compromises relied on (thumb rule + why):</p>
                                <ul className="reasons">
                                  {r.compromises.map((c, i) => <li key={i} className="warn">⚠️ {c}</li>)}
                                </ul>
                              </>
                            )}
                            {windows.length === 0 ? (
                              <p className="sub-label">No surviving Lagna window found after the currently implemented interval checks.</p>
                            ) : (
                              <ul className="reasons">
                                {windows.map((w, i) => {
                                  const lagna = computeLagna(toRealInstant(w.start, city.timezone), { latitude: city.latitude, longitude: city.longitude }, 'lahiri');
                                  const lagnaType = classifyLagna(lagna.rashi.index ?? 0);
                                  const lagnaVerdict = lagnaVerdictFor(activityKey, lagnaType);
                                  const activeTithi = activeLimbAt(r.raw.panchang.tithis, w.start);
                                  const activeNak = activeLimbAt(r.raw.panchang.nakshatras, w.start);
                                  const pr = panchakaRahitaAtWindow(activeTithi, r.raw.panchang.vara.englishName, activeNak.name, lagna.rashi.index ?? 0);
                                  return (
                                    <li key={i} className={w.note ? 'warn' : ''}>
                                      {fmtWindow(w, r.raw.panchang.sunrise)}{w.note ? ` — ${w.note}` : ''}
                                      <br />
                                      <span className="window-limb-tag">At this time: {activeTithi.name}, {activeNak.name}</span>
                                      <br />
                                      <span className={`lagna-tag ${lagnaVerdict}`}>
                                        Lagna: {lagna.rashi.name} ({lagnaType}) — {lagnaVerdict === 'auspicious' ? '✅ favourable' : lagnaVerdict === 'medium' ? '➖ acceptable' : '⚠️ generally avoided'}
                                      </span>
                                      {pr && <><br /><span className={`lagna-tag ${pr.rahita ? 'auspicious' : 'avoid'}`}>Panchaka Rahita: {pr.rahita ? '✅ Rahita' : `⚠️ ${pr.type} Panchaka`} — remainder {pr.remainder}</span></>}
                                    </li>
                                  );
                                })}
                              </ul>
                            )}
                            <button className="secondary" onClick={(e) => { e.stopPropagation(); openFullReport(key, r, city); }}>📋 Open Full Muhurat Report</button>
                            {reportCharts[key] && (
                              <div className="report-block" onClick={(e) => e.stopPropagation()}>
                                <h4>Full Report — {fmtDate(r.raw.date)}</h4>
                                <p className="sub-label">Chart cast for the first surviving Lagna window's start time ({windows[0] ? fmtWindow(windows[0], r.raw.panchang.sunrise) : 'day sunrise'}), {city.name}.</p>
                                <div className="report-grid">
                                  <SouthIndianChart lagnaRashiIndex={reportCharts[key].lagna.rashi.index} planets={reportCharts[key].planets} />
                                  <div className="report-text">
                                    <p><strong>Lagna:</strong> {reportCharts[key].lagna.rashi.name} ({reportCharts[key].lagna.degreeInRashi.toFixed(1)}°), {reportCharts[key].lagna.nakshatra.name} pada {reportCharts[key].lagna.pada}</p>
                                    <p><strong>Tier:</strong> {tierLabelShort(r.tier)}</p>
                                    <ul className="reasons">
                                      {reportCharts[key].planets.map((pl) => (
                                        <li key={pl.planet}>{pl.planet}: {pl.rashi.name} {pl.degreeInRashi.toFixed(1)}° (house {pl.house}){pl.isRetrograde ? ' (R)' : ''}</li>
                                      ))}
                                    </ul>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        )}
        </>
      )}

      {tab === 'fullReport' && (
        <section className="panel results-panel">
          <h2>Full Muhurat Report</h2>
          {!selectedFullReport ? (
            <div className="report-block">
              <p>Select a Muhūrta from the Finder or Personalised Muhurat list and click <strong>Open Full Muhurat Report</strong>.</p>
              <p className="sub-label">The public list remains broad. The full decision report is intentionally personalised.</p>
            </div>
          ) : !(birthChart || usePersonalisation) ? (
            <div className="report-block">
              <h3>Personal details required</h3>
              <p>To unlock the full decision report, provide either your birth details or your known Janma Nakṣatra and Chandra Rāśi. This is required for Tārābala, Chandrabala and natal-dependent Muhūrta checks.</p>
              <button className="primary" onClick={() => setTab('personal')}>Enter Birth Details / Rāśi &amp; Nakṣatra</button>
              <p className="sub-label">The general Muhūrta list remains available without birth details.</p>
            </div>
          ) : (() => {
            const sr = selectedFullReport;
            const windows = getGoodTimeWindows(
              sr.day.raw.panchang,
              { latitude: sr.city.latitude, longitude: sr.city.longitude },
              sr.city.timezone,
            );
            const reportNakName = sr.day.raw.panchang.nakshatras[0]?.name ?? '';
            const reportNakIdx = NAKSHATRAS.findIndex(n => reportNakName.toLowerCase().startsWith(n.toLowerCase().slice(0,6)));
            const reportMoonName = sr.day.raw.panchang.chandraRashi?.name ?? '';
            const reportMoonIdx = RASHIS.findIndex(x => x.toLowerCase().startsWith(reportMoonName.toLowerCase().slice(0,4)));
            const personalTara = reportNakIdx >= 0 ? computeTarabala(nakshatraIdx, reportNakIdx) : null;
            const personalChandra = reportMoonIdx >= 0 ? computeChandraBalam(rashiIdx, reportMoonIdx) : null;

            const candidates = windows.map((w, index) => {
              // Cast near the middle of each surviving interval, rather than at the exact
              // transition boundary. This keeps the chart safely inside the elected Lagna.
              const midpoint = new Date((w.start.getTime() + w.end.getTime()) / 2);
              const realInstant = toRealInstant(midpoint, sr.city.timezone);
              const location = { latitude: sr.city.latitude, longitude: sr.city.longitude };
              const chart = computeRashiChart(realInstant, location);
              const navamsa = computeNavamsa(realInstant, location);
              const shadbala = computeShadbala(realInstant, location);
              const natalLagnaIdx = kundaliResult?.d1.lagna.rashi.index;
              const checks = evaluateElectionMahadoshas(chart, {
                activityKey: sr.activityKey,
                navamsaLagnaRashiIndex: navamsa.lagnaRashi.index,
                natalLagnaRashiIndex: natalLagnaIdx,
                shadbala,
              });
              const lagnaType = classifyLagna(chart.lagna.rashi.index ?? 0);
              const lagnaVerdict = lagnaVerdictFor(sr.activityKey, lagnaType);
              const activeTithi = activeLimbAt(sr.day.raw.panchang.tithis, midpoint);
              const activeNak = activeLimbAt(sr.day.raw.panchang.nakshatras, midpoint);
              const pr = panchakaRahitaAtWindow(activeTithi, sr.day.raw.panchang.vara.englishName, activeNak.name, chart.lagna.rashi.index ?? 0);
              const major = checks.filter(c => c.state === 'present' && c.severity === 'major').length;
              const moderate = checks.filter(c => c.state === 'present' && c.severity === 'moderate').length;
              const ashtamaFromNatalLagna = natalLagnaIdx !== undefined
                ? (checks.find(c => c.n === 12)?.state === 'present')
                : null;
              // Personalisation is recomputed PER WINDOW using the nakshatra actually
              // active at this window's moment — not the day's first-listed nakshatra.
              // A day can genuinely transition (e.g. Purva Ashadha → Uttara Ashadha)
              // partway through; a window after that transition should be judged on
              // the nakshatra that's really active then, not penalised for a nakshatra
              // that has already passed by the time this window occurs.
              const windowNakIdx = NAKSHATRAS.findIndex(n => activeNak.name.toLowerCase().startsWith(n.toLowerCase().slice(0, 6)));
              const windowTara = usePersonalisation && windowNakIdx >= 0 ? computeTarabala(nakshatraIdx, windowNakIdx) : null;
              const windowTaraBad = windowTara ? (windowTara.englishName === 'Janma' || windowTara.quality !== 'auspicious') : false;
              const nakshatraChangesThisDay = sr.day.raw.panchang.nakshatras.length > 1;
              // Ranking is deliberately hierarchical: hard election-chart defects dominate;
              // positive features cannot erase them. The numeric value only sorts survivors.
              const rank = (major ? -1000 * major : 0)
                + (lagnaVerdict === 'auspicious' ? 60 : lagnaVerdict === 'medium' ? 25 : -80)
                + (pr?.rahita ? 45 : pr ? -60 : 0)
                - moderate * 20
                + (windowTaraBad ? -40 : windowTara ? 20 : 0)
                + Math.max(0, Math.round((w.end.getTime() - w.start.getTime()) / 60000 / 10));
              return { index, w, midpoint, chart, checks, lagnaType, lagnaVerdict, activeTithi, activeNak, pr, major, moderate, rank, ashtamaFromNatalLagna, windowTara, windowTaraBad, nakshatraChangesThisDay };
            }).sort((a,b) => b.rank - a.rank);
            return <div className="report-block">
              <h3>{sr.activityLabel} — {fmtDate(sr.day.raw.date)}</h3>
              <p><strong>Location:</strong> {sr.city.name}</p>
              <p><strong>Day-level verdict:</strong> {tierLabelShort(sr.day.tier)}</p>
              <p className="tier-explain"><strong>Full-report method:</strong> every surviving Lagna interval on this Panchāṅga day is cast and evaluated separately. The first interval is no longer assumed to be the Muhūrta. The highest-ranked surviving election is marked <strong>Best available on this day</strong>; all other Lagnas remain visible for comparison.</p>
              {birthChart && <p><strong>Natal reference:</strong> {birthChart.nakshatra}, {birthChart.rashi}, Lagna {birthChart.lagna}</p>}
              {!birthChart && usePersonalisation && <p><strong>Natal reference:</strong> {NAKSHATRAS[nakshatraIdx]}, {RASHIS[rashiIdx]} (star/sign mode)</p>}

              <div className="plain-summary">
                <h4>At a glance</h4>
                <p><strong>What this report does:</strong> it compares every usable Lagna window on this day and shows the strongest available choice. <strong>“Best available” means best among this day’s surviving windows — not automatically a perfect Muhūrta.</strong></p>
                <p><strong>How to read it:</strong> 🟢 favourable · 🟡 caution/compromise · 🔴 avoid unless a valid classical exception or doṣa-bhaṅga applies · ⚪ not yet evaluated.</p>
              </div>

              <h4>Your personal suitability for this day</h4>
              <div className="simple-checks">
                {personalTara && <div className={personalTara.englishName === 'Janma' || personalTara.quality !== 'auspicious' ? 'simple-check warn-check' : 'simple-check good-check'}><strong>{personalTara.englishName === 'Janma' || personalTara.quality !== 'auspicious' ? '🟡' : '🟢'} Tārābala (day's first-listed nakṣatra)</strong><span>{describeTara(personalTara)}. This tells how the day's Nakṣatra relates to your birth Nakṣatra.{sr.day.raw.panchang.nakshatras.length > 1 ? ' ⚠️ This day\'s nakṣatra changes partway through — this line reflects only the FIRST nakṣatra of the day. Check each candidate Lagna below for its own window-specific Tārābala, since a later window may fall under a different (possibly better) nakṣatra.' : ''}</span></div>}
                {personalChandra && <div className={personalChandra.quality === 'strong' ? 'simple-check good-check' : 'simple-check warn-check'}><strong>{personalChandra.quality === 'strong' ? '🟢' : '🟡'} Chandrabala</strong><span>{personalChandra.quality} — transit Moon is house {personalChandra.house} from your Janma Rāśi. This measures support from the Moon for you personally.</span></div>}
                {sr.day.brideTaraNote && <div className="simple-check"><strong>Personal note</strong><span>{sr.day.brideTaraNote}</span></div>}
              </div>

              <h4>All available Lagna Muhūrtas ({candidates.length})</h4>
              {candidates.length === 0 ? <p className="bad">No Lagna interval survives the currently implemented time exclusions on this day.</p> : candidates.map((c, pos) => {
                const byNo = new Map(c.checks.map(x => [x.n, x]));
                const isBest = pos === 0;
                return <details key={`${c.w.start.getTime()}-${c.chart.lagna.rashi.index}`} className="report-block" open={isBest}>
                  <summary><strong>{isBest ? '🏆 Best available on this day — ' : ''}{c.chart.lagna.rashi.name} Lagna</strong> · {fmtTimeDay(c.w.start, sr.day.raw.panchang.sunrise)} – {fmtTimeDay(c.w.end, sr.day.raw.panchang.sunrise)} · {c.major ? `❌ ${c.major} major detected` : c.pr && !c.pr.rahita ? `⚠️ ${c.pr.type} Panchaka` : '✓ candidate'}{c.ashtamaFromNatalLagna ? ' · ❌ 8th from your natal Lagna' : ''}</summary>
                  <div className="report-grid">
                    <SouthIndianChart lagnaRashiIndex={c.chart.lagna.rashi.index} planets={c.chart.planets} />
                    <div className="report-text">
                      <p><strong>Election time used for chart:</strong> {fmtTimeDay(c.midpoint, sr.day.raw.panchang.sunrise)} (midpoint of surviving interval)</p>
                      <p><strong>Lagna:</strong> {c.chart.lagna.rashi.name} {c.chart.lagna.degreeInRashi.toFixed(1)}° — {c.chart.lagna.nakshatra.name} pada {c.chart.lagna.pada}</p>
                      <p><strong>Activity Lagna classification:</strong> {c.lagnaType} — {c.lagnaVerdict === 'auspicious' ? 'favourable' : c.lagnaVerdict === 'medium' ? 'acceptable' : 'generally avoided'} for {sr.activityLabel}</p>
                      <p><strong>At this time:</strong> {c.activeTithi.name}, {c.activeNak.name}</p>
                      <p><strong>Panchaka Rahita:</strong> {c.pr ? (c.pr.rahita ? `✓ Rahita — remainder ${c.pr.remainder}` : `⚠️ ${c.pr.type} Panchaka — remainder ${c.pr.remainder}`) : 'Could not evaluate'}</p>
                    </div>
                  </div>
                  <div className="plain-summary candidate-summary">
                    <h4>Simple verdict for this Lagna</h4>
                    <p>{c.major > 0 ? <>🔴 <strong>Avoid / needs a verified cancellation:</strong> {c.major} major election-chart doṣa{c.major > 1 ? 's are' : ' is'} detected.</> : c.pr && !c.pr.rahita ? <>🟡 <strong>Usable only with caution:</strong> this window has {c.pr.type} Panchaka. Check the activity-specific exception before choosing it.</> : c.lagnaVerdict === 'avoid' ? <>🟡 <strong>Not preferred:</strong> this Lagna type is generally avoided for {sr.activityLabel}, although the detailed chart still remains visible for comparison.</> : <>🟢 <strong>Promising candidate among the checks completed so far.</strong> No currently evaluated major election-chart doṣa is detected in this window.</>}</p>
                    <p className="sub-label">This verdict is provisional while some Ekaviṃśati rules remain unevaluated. “Clear” means the named defect was specifically checked and not found; it does not mean the whole Muhūrta is flawless.</p>
                  </div>

                  <h4>Important election-chart checks — in plain language</h4>
                  <div className="simple-checks">
                    {c.windowTara && (
                      <div className={c.windowTaraBad ? 'simple-check bad-check' : 'simple-check good-check'}>
                        <strong>{c.windowTaraBad ? '🔴' : '🟢'} Tārābala at this exact window</strong>
                        <span>
                          {describeTara(c.windowTara)}, computed from {c.activeNak.name} — the nakṣatra actually active at
                          {' '}{fmtTimeDay(c.midpoint, sr.day.raw.panchang.sunrise)}, not the day's first-listed nakṣatra.
                          {c.nakshatraChangesThisDay ? ' This day\'s nakṣatra changes partway through — windows before and after the change can have different Tārābala; each is checked at its own time here.' : ''}
                        </span>
                      </div>
                    )}
                    {c.checks.map(x => <div key={x.n} className={`simple-check ${x.state === 'present' ? 'bad-check' : 'good-check'}`}>
                      <strong>{x.state === 'present' ? '🔴' : '🟢'} #{x.n} {MAHADOSHAS.find(m => m.n === x.n)?.name ?? 'Mahādoṣa'}</strong>
                      <span>{x.state === 'present' ? 'Defect detected: ' : 'Clear: '}{x.detail}</span>
                    </div>)}
                    {MAHADOSHAS.filter(m => !byNo.has(m.n) && !m.automated).length > 0 && <div className="simple-check pending-check"><strong>⚪ Checks still pending</strong><span>{MAHADOSHAS.filter(m => !byNo.has(m.n) && !m.automated).length} Ekaviṃśati rules are not yet fully evaluated by the engine. They are shown in the technical audit below so the report never pretends they passed.</span></div>}
                  </div>
                  {c.ashtamaFromNatalLagna === null && (
                    <p className="hint">Tip: generate your <button type="button" className="link-button" onClick={() => setTab('kundali')}>Kundali</button> to unlock a natal Ashtama-Lagna cross-check specific to you on every candidate Lagna.</p>
                  )}

                  <details className="technical-details">
                    <summary><strong>Show technical Ekaviṃśati audit (all 21)</strong></summary>
                    <p className="sub-label">For advanced users/astrologers. “Checked in base engine” means the rule is handled at the day/time-filter layer rather than by this election-chart function. “Not yet evaluated” means no verdict has been made.</p>
                    <div className="table-wrap"><table><thead><tr><th>#</th><th>Mahādoṣa</th><th>Status</th><th>What it means / result</th></tr></thead><tbody>
                      {MAHADOSHAS.map(m => { const x=byNo.get(m.n); return <tr key={m.n}><td>{m.n}</td><td>{m.name}</td><td className={x?.state==='present'?'bad':x?.state==='clear'?'chakra-ok':''}>{x ? (x.state==='present'?'🔴 Detected':'🟢 Clear') : (m.automated ? '✓ Checked in day/time engine' : '⚪ Not yet evaluated')}</td><td>{x?.detail ?? m.issue}</td></tr>; })}
                    </tbody></table></div>
                  </details>

                  <details className="technical-details">
                    <summary><strong>Show planetary positions</strong></summary>
                    <p className="sub-label">House numbers are counted from the elected Lagna. “R” means retrograde.</p>
                    <ul className="reasons">{c.chart.planets.map(pl => <li key={pl.planet}>{pl.planet}: {pl.rashi.name} {pl.degreeInRashi.toFixed(1)}° — house {pl.house}{pl.isRetrograde ? ' (retrograde)' : ''}</li>)}</ul>
                  </details>
                </details>;
              })}

              <h4>Day-level merits</h4>
              <ul className="reasons">{sr.day.merits.length ? sr.day.merits.map((x,i)=><li key={i} className="chakra-ok">✓ {x}</li>) : <li>No special merit recorded by the current rule layer.</li>}</ul>
              <h4>Day-level demerits / cautions</h4>
              <ul className="reasons">{sr.day.demerits.length ? sr.day.demerits.map((x,i)=><li key={i} className="bad">✗ {x}</li>) : <li>No activity-level demerit recorded.</li>}{sr.day.compromises.map((x,i)=><li key={`c-${i}`} className="warn">⚠️ {x}</li>)}</ul>
              <p className="tier-explain"><strong>Decision principle:</strong> the ranking is for comparison only. A detected hard Varjya or uncancelled major doṣa is not rescued by positive points. As more Ekaviṃśati/apavāda rules become fully implemented, they will automatically tighten this comparison.</p>
            </div>;
          })()}
        </section>
      )}

      {tab === 'kundali' && (
        <section className="panel form-panel">
          <p className="sub-label">Generate a Vedic birth chart (Kundali) — Rāśi (D1), Navāṁśa (D9), planetary positions, and Vimśottari Daśā.</p>
          {birthDate && (birthDate !== kundaliDate || birthTime !== kundaliTime) && (
            <button
              type="button"
              className="secondary"
              onClick={() => { setKundaliDate(birthDate); setKundaliTime(birthTime); }}
            >
              Use birth date/time from Personalised Muhurat tab ({birthDate} {birthTime})
            </button>
          )}
          <div className="field-row">
            <div className="field">
              <label>Birth Date</label>
              <input type="date" value={kundaliDate} onChange={(e) => setKundaliDate(e.target.value)} />
            </div>
            <div className="field">
              <label>Birth Time (local, as recorded — don't convert)</label>
              <input type="time" value={kundaliTime} onChange={(e) => setKundaliTime(e.target.value)} />
            </div>
          </div>
          <IndiaLocationSearch onPick={(place) => setKundaliPlace({ name: place.displayName, latitude: place.latitude, longitude: place.longitude, timezone: place.timezone })} />
          {kundaliPlace && <p className="hint">Selected: {kundaliPlace.name} ({kundaliPlace.latitude.toFixed(4)}, {kundaliPlace.longitude.toFixed(4)})</p>}
          <p className="hint">Search covers every mapped Indian city, town, and village (live geocoding), not a fixed list — type at least 2 characters and press Search.</p>
          <button className="primary" onClick={generateKundali}>Generate Kundali</button>
          {kundaliError && <p className="error">{kundaliError}</p>}

          {kundaliResult && (
            <div className="report-block">
              <h4>Rāśi (D1) &amp; Navāṁśa (D9)</h4>
              <p className="sub-label">
                Lagna: {kundaliResult.d1.lagna.rashi.name} {kundaliResult.d1.lagna.degreeInRashi.toFixed(1)}° — {kundaliResult.d1.lagna.nakshatra.name} pada {kundaliResult.d1.lagna.pada}
              </p>
              <div className="report-grid">
                <div>
                  <p className="sub-label" style={{ textAlign: 'center' }}>Rāśi (D1)</p>
                  <SouthIndianChart lagnaRashiIndex={kundaliResult.d1.lagna.rashi.index} planets={kundaliResult.d1.planets} />
                </div>
                <div>
                  <p className="sub-label" style={{ textAlign: 'center' }}>Navāṁśa (D9)</p>
                  <SouthIndianChart lagnaRashiIndex={kundaliResult.d9.lagnaRashi.index} planets={kundaliResult.d9.planets} />
                </div>
              </div>

              <h4>Planetary Positions (D1)</h4>
              <table className="dosha-table">
                <thead><tr><th>Graha</th><th>Rāśi</th><th>Degree</th><th>Nakṣatra (pada)</th><th>Nakṣatra Lord</th><th>House</th><th>Rules</th><th>Dignity</th><th>Retro</th></tr></thead>
                <tbody>
                  {kundaliResult.d1.planets.map((pl) => {
                    const nak = nakshatraFromLongitude(pl.longitude);
                    const rulesHouses = housesRuledBy(pl.planet, kundaliResult.d1.lagna.rashi.index);
                    let dignity = '—';
                    try { dignity = computeDignity(pl.planet as any, pl.rashi.index); } catch { /* Rahu/Ketu have no classical dignity */ }
                    return (
                      <tr key={pl.planet}>
                        <td>{pl.planet}</td>
                        <td>{pl.rashi.name}</td>
                        <td>{pl.degreeInRashi.toFixed(2)}°</td>
                        <td>{nak.name} ({nak.pada})</td>
                        <td>{nakshatraLordFromLongitude(pl.longitude)}</td>
                        <td>{pl.house}</td>
                        <td>{rulesHouses.length ? rulesHouses.join(', ') : '—'}</td>
                        <td>{dignity}</td>
                        <td>{pl.isRetrograde ? 'R' : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <h4>Vimśottari Daśā</h4>
              <p className="sub-label">Current Mahādaśā: {kundaliResult.dasha.currentMahaDashaLord}</p>
              <table className="dosha-table">
                <thead><tr><th>Lord</th><th>Start</th><th>End</th><th>Years</th></tr></thead>
                <tbody>
                  {kundaliResult.dasha.mahaDashas.map((md, i) => (
                    <tr key={i} className={i === kundaliResult.dasha.currentIndex ? 'auto' : ''}>
                      <td>{md.lord}{i === kundaliResult.dasha.currentIndex ? ' (current)' : ''}</td>
                      <td>{fmtDate(md.startDate)}</td>
                      <td>{fmtDate(md.endDate)}</td>
                      <td>{md.years.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="hint">
                <strong>Note:</strong> this is a calculated chart, not a fixed verdict — interpretation depends on
                birth-time accuracy, house system, and full chart context. Doṣa/Yoga detection layers (Karthari,
                Kujāṣṭama, etc. — see the Full Muhurat Report for the same engine applied to a muhurta) can be
                cross-referenced here once you have your own Lagna, but a proper reading should go through your
                family astrologer.
              </p>
            </div>
          )}
        </section>
      )}

      {tab === 'guide' && (
      <section className="panel about-panel">
        <h2>How Kāladarśī decides — and why we still show you the "no"s</h2>
        <p>
          Classical Muhūrta texts are rarely a single yes/no switch. Most rules have a documented
          exception, a regional variant, or a "later authorities relaxed this" history. Our
          philosophy: <strong>we don't quietly drop a date just because one factor is unfavourable</strong>.
          Every date that clears the base Panchāṅga rule is shown, tagged with a tier, and — when
          something is compromised — the classical thumb rule AND the reason it's not treated as an
          automatic disqualifier. You (and your family astrologer) make the final call; we just make
          sure you're deciding with the full picture, not a black box.
        </p>

        <h3>The three tiers</h3>
        <table className="dosha-table">
          <thead><tr><th>Tier</th><th>Meaning</th></tr></thead>
          <tbody>
            <tr className="auto"><td>🏆 {tierLabelShort('strict')}</td><td>Every checked factor is clean — Panchāṅga, Panchaka, Bhadra, Ayana, Mudha, Chakra Shuddhi. No exception is being relied on. Genuinely rare, by design.</td></tr>
            <tr><td>✓ {tierLabelShort('compromised')}</td><td>Passes overall, but leans on one or more documented exceptions or outweighed soft factors — every one of them listed with its thumb rule, so you can judge whether it's acceptable for your family/tradition.</td></tr>
            <tr className="manual"><td>✗ {tierLabelShort('rejected')}</td><td>Fails a genuine hard exclusion (Ekādaśī, eclipse, Adhika Māsa, severe Gaṇḍānta, earthly Bhadra, un-excused Panchaka, Chaturmās, or — for Upanayanam specifically — Dakṣiṇāyana with no exception). Not shown as a live option, but the specific reason is always stated.</td></tr>
          </tbody>
        </table>

        <h3>Panchaka Rahita vs Nakshatra Panchaka</h3>
        <p>
          These are now kept separate. The Telugu/AP-TS Panchaka Rahita test is calculated for the
          elected moment from <strong>Tithi + Vāra + Nakṣatra + Udaya Lagna</strong>, divided by 9.
          Remainders 1/2/4/6/8 are Mṛtyu/Agni/Rāja/Chora/Roga; 0/3/5/7 are Rahita. The terminal
          five-nakṣatra Panchaka (Dhaniṣṭhā through Revatī) remains a separate caution and is no longer
          incorrectly used to manufacture those five Panchaka-Rahita labels. Candidate windows show the
          Panchaka-Rahita result at the window start; a later precision pass should split windows whenever
          Tithi, Nakṣatra or Lagna changes.
        </p>

        <h3>Bhadra (Vishṭi Karaṇa)</h3>
        <p>
          Bhadra "resides" in Svarga (Heaven), Pātāla (Netherworld), or Earth depending on the Moon's
          rāśi. Only Earth-abode Bhadra is treated as genuinely harmful — Svarga/Pātāla Bhadra is
          harmless to earthly activities per multiple classical sources (Muhūrta Mārtāṇḍa among them).
          We check the actual loka, not just whether Bhadra is active.
        </p>

        <h3>Ayana, Chaturmās, and Kārtika</h3>
        <ul className="reasons">
          <li><strong>Upanayanam:</strong> Uttarāyaṇa only — no exception. Validated against direct classical/Maṭha teaching stating this without qualification.</li>
          <li><strong>Vivāha:</strong> Dakṣiṇāyana avoidance is a North Indian preference; many South Indian (esp. Tamil) traditions marry in Dakṣiṇāyana routinely — shown as a regional flag, not a block.</li>
          <li><strong>Griha Praveśa:</strong> Uttarāyaṇa preferred; Dakṣiṇāyana still shown (compromised), except during Chaturmās (hard-blocked) — with Kārtika Māsa, right after Chaturmās ends, restored as the classical exception window even though it's still Dakṣiṇāyana.</li>
          <li><strong>Chaturmās</strong> (Āṣāḍha–Āśvina, approximated at whole-month resolution): Vivāha, Griha Praveśa, and Upanayanam are traditionally paused entirely — Viṣṇu's yogic sleep.</li>
        </ul>

        <h3>Guru &amp; Śukra Mudha (combustion)</h3>
        <p>
          Flagged, not blocked, for Vivāha, Upanayanam, Griha Praveśa, and vehicle purchase — no
          specific classical exception excuses combustion, so it's always shown as a compromise to
          weigh against the rest of the day's strength. Computed as a degree-based proxy for true
          heliacal visibility (Venus 10°, Jupiter 11° orb from the Sun) — see code notes for the
          precision caveat.
        </p>

        <h3>Kalasa &amp; Vṛṣabha Chakra Śuddhi (Griha Praveśa)</h3>
        <p>
          The muhūrta nakṣatra's counted distance from Revatī should fall in the auspicious band
          (6–13 or 22–27 positions); outside that band, no exception applies — it's a real compromise.
        </p>

        <table className="dosha-table">
          <thead><tr><th>#</th><th>Mahādoṣa</th><th>Checked here?</th></tr></thead>
          <tbody>
            {MAHADOSHAS.map((m) => (
              <tr key={m.n} className={m.automated ? 'auto' : 'manual'}>
                <td>{m.n}</td>
                <td>{m.name}<br /><small>{m.issue}</small></td>
                <td>{m.automated ? '✅ automatic' : m.basis === 'chart' ? '⏳ needs Lagna/birth chart — Phase 2' : '📋 contextual, not automatable'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="hint">
          Doṣas needing a cast Lagna chart (Karthari, Chandra in 6/8/12, Sagraha Chandra, Udayasta
          Śuddhi, Pāpaṣaḍvarga, Bhṛgu Ṣaṣṭha, Kujāṣṭama, Aṣṭama Lagna, Rāśi Viṣa Ghaṭikā, Kunavāṁśa)
          are being implemented in Phase 2. Karthari, Chandra 6/8/12, Sagraha Chandra, Bhṛgu Ṣaṣṭha and Kujāṣṭama are now evaluated from the election D1 chart; Udayāsta Śuddhi, Pāpaṣaḍvarga, Aṣṭama Lagna, Rāśi Viṣa Ghaṭikā and Kunavāṁśa remain pending because they require additional strength/divisional/natal logic. The underlying library exposes
          <code> computeLagna</code>, <code>computeBhava</code> and <code>computeAspects</code>, so
          wiring them in is additive, not a rewrite.
        </p>

        <h3>A note on Matāntara (differing classical opinions)</h3>
        <p>
          Kalaprakāśika, Muhūrta Chintāmaṇi, Muhūrta Mārtāṇḍa, Nirṇaya Sindhu, Dharma Sindhu, and
          Bṛhat Saṃhitā don't always agree with each other — that disagreement (Matāntara) is itself
          a classical, citable category, not a flaw. Right now Kāladarśī follows one digested ruling
          per rule (sourced in the code). A planned next step is surfacing dates that a stricter
          authority would reject but a documented alternate opinion accepts — labelled explicitly as
          "per [text]'s view" rather than silently blended in, so it adds real options without
          hiding which authority you're relying on.
        </p>

        <p className="hint">
          <strong>Note on regional panchangams:</strong> many published traditional South Indian
          (Telugu/Andhra) panchangams compute tithi, nakṣatra and muhūrta times off a single fixed
          reference point — historically Rajahmundry's longitude/latitude — and apply that same
          clock time across the whole region. Because tithi/nakṣatra boundaries and Lagna both shift
          with longitude (and, for sunrise-anchored elements, with latitude too), a panchangam printed
          for Rajahmundry can be a few minutes to over an hour off for a city like Mumbai or Delhi.
          Kāladarśī instead computes every element fresh for the exact latitude/longitude you select,
          so the tithi/nakṣatra/Lagna/muhūrta times shown here are accurate for your chosen location,
          not borrowed from a regional reference point.
        </p>
      </section>
      )}
    </div>
  );
}

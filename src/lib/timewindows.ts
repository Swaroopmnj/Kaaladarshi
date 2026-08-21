import type { DailyPanchangResult } from 'panchang-ts';
import { computeLagna } from 'panchang-ts';
import { getBhadraIntervals } from './bhadra';
import { toRealInstant } from './dateUtils';

export interface NamedWindow {
  label: string;
  start: Date;
  end: Date;
  note?: string;
}

interface Period { start: Date; end: Date; label: string }
export interface WindowLocation { latitude: number; longitude: number }

/** Which day-limb (tithi/nakshatra/yoga/karana) is actually active at a given moment. */
export function activeLimbAt<T extends { name: string; endTime: Date | null }>(items: T[], moment: Date): T {
  for (const item of items) {
    if (!item.endTime || moment.getTime() < item.endTime.getTime()) return item;
  }
  return items[items.length - 1];
}

function subtractPeriod(parts: NamedWindow[], bad: Period): NamedWindow[] {
  const out: NamedWindow[] = [];
  for (const part of parts) {
    if (part.end <= bad.start || part.start >= bad.end) { out.push(part); continue; }
    if (part.start < bad.start) out.push({ ...part, end: bad.start });
    if (part.end > bad.end) out.push({ ...part, start: bad.end });
  }
  return out;
}

function subtractBadPeriods(window: NamedWindow, badPeriods: Period[]): NamedWindow[] {
  let parts = [window];
  for (const bad of badPeriods) parts = subtractPeriod(parts, bad);
  return parts.filter((p) => p.end.getTime() - p.start.getTime() >= 5 * 60 * 1000);
}

function badPeriodsFor(panchang: DailyPanchangResult): Period[] {
  return [
    panchang.rahuKalam && { ...panchang.rahuKalam, label: 'Rāhu Kāla' },
    panchang.yamaganda && { ...panchang.yamaganda, label: 'Yamaganda' },
    panchang.gulikaKalam && { ...panchang.gulikaKalam, label: 'Gulika Kāla' },
    ...panchang.durMuhurta.map((p) => ({ ...p, label: 'Dur Muhūrta' })),
    ...getBhadraIntervals(panchang).filter((b) => b.blocking).map((b) => ({ start: b.start, end: b.end, label: 'Mṛtyuloka Bhadrā' })),
  ].filter(Boolean) as Period[];
}

function rashiAt(wallClock: Date, location: WindowLocation, timezone: number): { index: number; name: string } {
  const l = computeLagna(toRealInstant(wallClock, timezone), location, 'lahiri');
  return { index: l.rashi.index ?? 0, name: l.rashi.name };
}

/** Find the wall-clock instant where Lagna changes, to about one-second precision. */
function refineBoundary(lo: Date, hi: Date, oldIndex: number, location: WindowLocation, timezone: number): Date {
  let a = lo.getTime(), b = hi.getTime();
  while (b - a > 1000) {
    const m = Math.floor((a + b) / 2);
    if (rashiAt(new Date(m), location, timezone).index === oldIndex) a = m; else b = m;
  }
  return new Date(b);
}

/**
 * Phase 2 candidate discovery is LAGNA-FIRST, not Choghadiya-first.
 * Every rising sign between local sunrise and the following sunrise is considered.
 * Blocking clock intervals are subtracted, never converted into whole-day rejection.
 * Choghadiya/Abhijit remain Panchanga annotations only and do not decide whether a
 * Lagna is allowed to enter the Muhurta engine.
 */
export function getLagnaWindows(
  panchang: DailyPanchangResult,
  location: WindowLocation,
  timezone: number,
): NamedWindow[] {
  const start = panchang.sunrise;
  // panchang-ts daily output is offset-adjusted wall-clock data. +24h therefore
  // means the next local sunrise closely enough for discovery; the final segment
  // is additionally bounded by the day's last limb end when available.
  const limbEnds = [
    ...panchang.tithis.map(x => x.endTime),
    ...panchang.nakshatras.map(x => x.endTime),
    ...panchang.yogas.map(x => x.endTime),
    ...panchang.karanas.map(x => x.endTime),
  ].filter((x): x is Date => !!x && x > start);
  const maxLimbEnd = limbEnds.length ? new Date(Math.max(...limbEnds.map(x => x.getTime()))) : null;
  const nominalEnd = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const end = maxLimbEnd && Math.abs(maxLimbEnd.getTime() - nominalEnd.getTime()) < 3 * 60 * 60 * 1000 ? maxLimbEnd : nominalEnd;

  const raw: NamedWindow[] = [];
  const step = 2 * 60 * 1000;
  let segStart = start;
  let current = rashiAt(start, location, timezone);
  let t = start.getTime() + step;
  while (t <= end.getTime()) {
    const probe = new Date(Math.min(t, end.getTime()));
    const next = rashiAt(probe, location, timezone);
    if (next.index !== current.index) {
      const prevProbe = new Date(Math.max(segStart.getTime(), probe.getTime() - step));
      const boundary = refineBoundary(prevProbe, probe, current.index, location, timezone);
      raw.push({ label: `${current.name} Lagna`, start: segStart, end: boundary });
      segStart = boundary;
      current = rashiAt(new Date(boundary.getTime() + 1000), location, timezone);
    }
    t += step;
  }
  if (segStart < end) raw.push({ label: `${current.name} Lagna`, start: segStart, end });

  const bad = badPeriodsFor(panchang);
  return raw.flatMap(w => subtractBadPeriods(w, bad)).sort((a,b) => a.start.getTime() - b.start.getTime());
}

/**
 * Backwards-compatible entry point. When location is supplied it uses the Phase-2
 * Lagna-first engine. The old Choghadiya path is retained only as a safe fallback
 * for callers that do not yet have coordinates.
 */
export function getGoodTimeWindows(
  panchang: DailyPanchangResult,
  location?: WindowLocation,
  timezone = 330,
): NamedWindow[] {
  if (location) return getLagnaWindows(panchang, location, timezone);

  const candidates: NamedWindow[] = [];
  for (const slot of [...panchang.choghadiya.day, ...panchang.choghadiya.night]) {
    if (slot.quality === 'auspicious') candidates.push({ label: `${slot.name} Choghadiya`, start: slot.start, end: slot.end });
  }
  if (panchang.abhijitMuhurta) candidates.push({ label: 'Abhijit Muhurta', start: panchang.abhijitMuhurta.start, end: panchang.abhijitMuhurta.end });
  return candidates.flatMap(w => subtractBadPeriods(w, badPeriodsFor(panchang))).sort((a,b) => a.start.getTime() - b.start.getTime());
}

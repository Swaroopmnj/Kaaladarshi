// BUG FIX: `new Date(dateString + 'T00:00:00')` is parsed by the browser in
// the VISITOR'S SYSTEM TIMEZONE, not the timezone of the location the user
// selected in the app. If a visitor's OS/browser timezone differs from IST
// (e.g. it's set to UTC, or the browser's Intl default differs from the
// system clock for any reason), the resulting Date represents a different
// real-world instant than "midnight in India" — which then throws off every
// downstream sunrise/sunset/tithi/nakshatra calculation by however many
// hours the visitor's timezone differs from IST. This produced the reported
// "11:04 AM sunrise" bug.
//
// Fix: construct the UTC instant explicitly from the calendar date and the
// KNOWN target-location offset (always +330 minutes / IST for every preset
// in this app), completely independent of whatever timezone the visitor's
// machine happens to be set to.

export function localDateAtMidnight(dateStr: string, tzOffsetMinutes: number): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - tzOffsetMinutes * 60000);
}

export function localDateTime(dateStr: string, timeStr: string, tzOffsetMinutes: number): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh, mm, 0) - tzOffsetMinutes * 60000);
}

// SECOND, DISTINCT bug found on top of the above: panchang-ts's own README
// states its output Date objects are "offset-adjusted" to the requested
// timezone and must be READ VIA getUTC*() — i.e. the library deliberately
// encodes the target location's local wall-clock time into the UTC fields
// of the Date object, rather than returning a genuine UTC instant. Because
// our display code used `.toLocaleTimeString()` without forcing a
// timezone, it fell back to the VISITOR'S SYSTEM TIMEZONE, which then
// re-interpreted those "fake UTC" fields as if they really were UTC and
// converted them again — silently adding the visitor's own UTC offset on
// top of a value that was already the correct local time. On a browser
// whose system timezone isn't UTC, this produces exactly the kind of
// multi-hour-wrong sunrise (e.g. 11:04 AM instead of ~5:55 AM) that was
// reported. Fix: always format panchang-ts Date output with `timeZone:
// 'UTC'` explicitly (equivalent to reading getUTCHours()/getUTCMinutes()),
// regardless of the visitor's own system timezone.
export const DISPLAY_TZ = 'UTC';

// THIRD, related pitfall: functions like computeLagna and
// computePlanetaryPositions expect a genuine real-time UTC instant as
// input (per their own README examples, e.g. `new Date('1995-08-15T05:30:00Z')`
// or `new Date()`) — NOT the "offset-adjusted" convention that
// getDailyPanchang/findAuspiciousDates use for their OUTPUT Date fields
// (panchang.sunrise, choghadiya slot times, abhijitMuhurta, etc). Feeding
// one of those offset-adjusted output dates straight into computeLagna or
// computePlanetaryPositions reintroduces the exact same class of bug one
// level deeper — the "local time" gets misread as a genuine UTC instant,
// shifting the astronomical calculation by the timezone offset. Use this
// to convert an offset-adjusted Date (from panchang-ts's daily/window
// output) back into a real UTC instant before passing it to a function
// that expects one.
export function toRealInstant(offsetAdjustedDate: Date, tzOffsetMinutes: number): Date {
  return new Date(offsetAdjustedDate.getTime() - tzOffsetMinutes * 60000);
}

// FOURTH bug, found from a user screenshot (header said "Sun, 20 Sept" but
// the Panchāṅga line said "Monday" for the same card): there are actually
// TWO different Date conventions inside panchang-ts depending on which
// function produced the value, and DISPLAY_TZ='UTC' is only correct for
// one of them.
//
//   1. getDailyPanchang() OUTPUT FIELDS (sunrise, sunset, choghadiya slots,
//      rahuKalam, abhijitMuhurta, durMuhurta, tithi/nakshatra transition
//      times, etc.) — these ARE "offset-adjusted": the local IST clock time
//      is encoded directly into the Date's UTC fields. Format these with
//      `timeZone: 'UTC'` (== DISPLAY_TZ, used by fmtTime).
//
//   2. findAuspiciousDates()/scoreMuhurta() `date` field (i.e. MuhurtaDay.date,
//      what fmtDate formats for each result card's header) — this is a
//      GENUINE real UTC instant (e.g. 2026-09-20T18:30:00Z for midnight IST
//      on 21 Sept). Formatting this with 'UTC' silently reads the WRONG
//      calendar day/weekday — it must be formatted with the real
//      'Asia/Kolkata' timezone to land on the correct date.
//
// Verified empirically: for a MuhurtaDay with panchang.vara.englishName ===
// 'Monday', d.date formats as "Mon, 21 Sept" under 'Asia/Kolkata' (correct,
// matches the vara) but "Sun, 20 Sept" under 'UTC' (wrong — this was the
// reported bug). Use REAL_TZ for this category of date instead.
export const REAL_TZ = 'Asia/Kolkata';

// Reported confusion: transition times like "upto 06:20 am" or a Choghadiya
// window like "01:35 am – 03:10 am" don't say WHICH calendar day that
// clock time falls on — if it's past midnight, is it still "today" or has
// it rolled into tomorrow? Since these are offset-adjusted Dates (local
// clock time encoded in UTC fields — see DISPLAY_TZ above), comparing their
// UTC calendar date against a reference (the panchang's own sunrise) tells
// us which real day it is.
export function isNextCalendarDay(d: Date, referenceDay: Date): boolean {
  return (
    d.getTime() > referenceDay.getTime() &&
    (d.getUTCDate() !== referenceDay.getUTCDate() ||
      d.getUTCMonth() !== referenceDay.getUTCMonth() ||
      d.getUTCFullYear() !== referenceDay.getUTCFullYear())
  );
}

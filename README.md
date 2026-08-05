# Kāladarśī (kaladarshi.com) — Muhūrta Calculator, Phase 1

A Vedic-astrology Muhurat finder: real sidereal-ephemeris Panchāṅga (via
`panchang-ts`, backed by `astronomy-engine`), 13 classical activity rules
(Vivaha, Griha Pravesh, Upanayanam, Travel, Shop Opening, etc.), Panchaka
detection with its classical sub-type + per-activity exceptions, and a
first pass at the Ekaviṃśati Mahādoṣas (21 great doshas).

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
```

```bash
npm run build    # production build to dist/
```

## What's implemented

- **Panchāṅga engine** — tithi / vāra / nakṣatra / yoga / karaṇa, sunrise-anchored,
  Lahiri ayanāṁśa, via `panchang-ts`.
- **General muhurat catalog** — the library's 13 stock occasion rules (sourced
  from Muhūrta Chintāmaṇi / Muhūrta Darpaṇa), scored 0–100.
- **Panchaka elimination with exceptions** — `src/lib/panchaka.ts` classifies
  active Panchaka into Mṛtyu/Agni/Rāja/Chora/Roga by the terminal nakṣatra
  (Dhanishtha→Revati) and applies the documented per-activity exception rules
  (e.g. marriage tolerates Agni/Rāja/Chora, must avoid Roga/Mṛtyu).
- **Ekaviṃśati Mahādoṣas** — `src/lib/mahadoshas.ts` catalogs all 21 with source
  notes. 7 of the 21 are Panchāṅga-only and checked automatically (Panchanga
  Suddhi, Surya Sankramana, Durmuhurtha, Gandanthara, Grahanothpatha, Krura
  Samyuta, Mahapatha/Vyatipata, Vaidhruthi). The remaining ~10 depend on a cast
  Lagna chart and are flagged but not yet computed (see below).
- **Personalisation** — Tārābala (birth-star compatibility with the transit
  Moon's nakṣatra) and Chandra Balam (birth Rāśi vs. transit Moon rāśi), both
  via the library's `computeTarabala` / `computeChandraBalam`.

## Known gaps / Phase 2

- **Lagna-dependent Mahādoṣas** (Karthari, Chandra in 6/8/12, Sagraha Chandra,
  Udayasta Śuddhi, Pāpaṣaḍvarga, Bhṛgu Ṣaṣṭha, Kujāṣṭama, Aṣṭama Lagna, Rāśi
  Viṣa Ghaṭikā, Kunavāṁśa) require casting the election Lagna (and, for some,
  the birth Lagna of the people involved) and checking planetary placements.
  `panchang-ts` already exposes `computeLagna`, `computeBhava`,
  `computeAspects`, `computeDignity` — this is additive work, not a rewrite.
- **"Full birth details" personalisation** currently behaves the same as
  "star only" (Nakṣatra + Rāśi). Wiring true birth-time chart comparison
  (Ashtama Lagna check against each party's Janma Lagna, etc.) is part of the
  Phase 2 work above.
- Text-by-text divergence: where Kalaprakasika, Muhurta Chintamani, Muhurta
  Martanda, Nirnaya Sindhu, Dharma Sindhu and Brihat Samhita disagree on a
  specific rule, this build currently follows one digested tradition per rule
  (cited inline in the source files) rather than showing multi-text verdicts.
  A "compare across texts" view is a reasonable Phase 3 addition.
- No time-of-day drill-down yet (Rahu Kalam / Choghadiya / Abhijit Muhurta are
  all in the underlying library's daily output — just not surfaced in the UI).

## Structure

```
src/
  lib/
    constants.ts    # nakshatra/rashi lists, city presets, activity catalog
    panchaka.ts      # panchaka sub-type + exception rules
    mahadoshas.ts    # the 21 mahadoshas reference table
  App.tsx            # single-page UI
  App.css
```

## Phase 1 completion note — interval-safe Bhadrā

Bhadrā (Viṣṭi karaṇa) is now treated as a time interval, not a whole-day rejection. If Mṛtyuloka Bhadrā ends during the day, later times remain eligible and continue through the other Muhūrta checks. Candidate Choghadiya/Abhijit display windows subtract Rāhu Kāla, Yamaganda, Gulika, Dur Muhūrta and blocking Bhadrā overlaps instead of discarding the entire date.

The daily Panchāṅga karaṇa sequence is sunrise-anchored. If Viṣṭi began before sunrise, the UI labels it as "prevailing at sunrise" rather than falsely claiming sunrise was the astronomical beginning of Bhadrā.

Phase 1 scope is the general Panchāṅga/date-candidate layer. Full election-Lagna Mahādoṣa/bhaṅga logic and deep natal personalisation remain Phase 2 and should not be represented as completed classical checks.

## Phase 2 engine corrections (v2)

- Candidate discovery is now **Lagna-first** from local sunrise to the following sunrise. Every rising sign is considered; Choghadiya no longer decides which Lagnas appear.
- Lagna boundaries are refined to approximately one-second precision from the sidereal Lahiri Lagna calculation.
- Rāhu Kāla, Yamaganda, Gulika, Dur Muhūrta and blocking Mṛtyuloka Bhadrā are subtracted as intervals from each Lagna window rather than rejecting the whole date.
- Fixed the Bhadrā display double-timezone conversion. `panchang-ts` daily output encodes local wall-clock time in UTC fields, so Bhadrā interval labels are formatted in UTC just like the rest of the daily Panchāṅga.
- Choghadiya and Abhijit remain visible Panchāṅga information, but are supplementary annotations rather than the primary Muhūrta candidate generator.
- Panchaka Rahita is evaluated at the elected Lagna/window, keeping it separate from terminal Nakshatra Panchaka.
- Phase-2 election-chart Mahādoṣa checks remain in `electionDoshas.ts`; uncertain classical cancellation rules are not fabricated as automatic passes.

// The 21 Mahadoshas (Ekaviṃśati Mahādoṣas) as catalogued in classical
// Muhurta literature (this reference list follows B.V. Raman's Muhurtha,
// Ch. V, itself a digest of the older Nirnaya Sindhu / Muhurta Chintamani
// tradition — cross-referenced here as vedastro.org's chapter guide).
//
// Doshas 1, 2, 7, 8, 18, 20, 21 depend only on the Panchanga (tithi / vara /
// nakshatra / yoga / karana / solar longitude) for a given date & place —
// these we can check automatically from panchang-ts output alone.
//
// Doshas 3, 4, 5, 6, 9, 10, 11, 12, 13, 14 depend on the Lagna (ascendant)
// of the elected moment and/or the birth chart(s) of the people involved —
// these require full chart casting (computeLagna / computeBhava /
// computeAspects, which panchang-ts also exposes) and are marked
// "chart-based" here; wiring them in is the next build phase.
//
// Doshas 15, 17, 19 are either activity-contextual (no fixed panchang rule)
// or require live weather data — flagged "manual / contextual".

export type DoshaBasis = 'panchanga' | 'chart' | 'manual';

export interface MahadoshaDef {
  n: number;
  name: string;
  sanskrit: string;
  issue: string;
  basis: DoshaBasis;
  automated: boolean; // true once wired to a live check in this app
}

export const MAHADOSHAS: MahadoshaDef[] = [
  { n: 1, name: 'Panchanga Suddhi', sanskrit: 'पञ्चाङ्ग शुद्धि', issue: 'Impure tithi, vara, nakshatra, yoga, or karana', basis: 'panchanga', automated: true },
  { n: 2, name: 'Surya Sankramana', sanskrit: 'सूर्य संक्रमण', issue: 'Within 16 ghatis of the Sun changing sign', basis: 'panchanga', automated: true },
  { n: 3, name: 'Karthari Dosha', sanskrit: 'कर्तरी दोष', issue: 'Malefics flanking the Lagna on both sides', basis: 'chart', automated: true },
  { n: 4, name: 'Shashtashta Riphagatha Chandra', sanskrit: 'षष्टाष्टरिफगत चन्द्र', issue: 'Moon in 6th, 8th, or 12th from Lagna', basis: 'chart', automated: true },
  { n: 5, name: 'Sagraha Chandra', sanskrit: 'सग्रह चन्द्र', issue: 'Moon conjoined with any planet', basis: 'chart', automated: true },
  { n: 6, name: 'Udayasta Suddhi', sanskrit: 'उदयास्त शुद्धि', issue: 'Weak Lagna or 7th house', basis: 'chart', automated: false },
  { n: 7, name: 'Durmuhurtha', sanskrit: 'दुर्मुहूर्त', issue: 'Falls within one of the inauspicious ~48-minute muhurtas of the day/night', basis: 'panchanga', automated: true },
  { n: 8, name: 'Gandanthara', sanskrit: 'गण्डान्त', issue: 'Tithi / rasi / nakshatra junction point', basis: 'panchanga', automated: true },
  { n: 9, name: 'Papashadvarga', sanskrit: 'पापषड्वर्ग', issue: 'Malefics strong across the six divisional charts', basis: 'chart', automated: false },
  { n: 10, name: 'Bhrigu Shatka', sanskrit: 'भृगु षष्ठ', issue: 'Venus in the 6th house (no exception, even exalted)', basis: 'chart', automated: true },
  { n: 11, name: 'Kujasthama', sanskrit: 'कुजाष्टम', issue: 'Mars in the 8th house — "unthinkable" for marriage', basis: 'chart', automated: true },
  { n: 12, name: 'Ashtama Lagna', sanskrit: 'अष्टम लग्न', issue: "Election Lagna is 8th from either party's birth Lagna", basis: 'chart', automated: false },
  { n: 13, name: 'Rasi Visha Ghatika', sanskrit: 'राशि विष घटिका', issue: 'Lagna falls in its own "poisoned" (Thyajya) period', basis: 'chart', automated: false },
  { n: 14, name: 'Kunavamsa', sanskrit: 'कुनवांश', issue: 'Lagna occupies the Navamsa of a malefic', basis: 'chart', automated: false },
  { n: 15, name: 'Varadosha', sanskrit: 'वारदोष', issue: 'Weekday unsuited to the specific activity', basis: 'manual', automated: false },
  { n: 16, name: 'Grahanothpatha', sanskrit: 'ग्रहणोत्पथ', issue: 'Eclipse-tainted constellation (6-month avoidance for marriage)', basis: 'panchanga', automated: true },
  { n: 17, name: 'Ekargala', sanskrit: 'एकार्गल', issue: 'Daytime-only dosha on certain yogas; low significance', basis: 'manual', automated: false },
  { n: 18, name: 'Krura Samyuta', sanskrit: 'क्रूर संयुत', issue: "Sun's nakshatra ± 1 (3-nakshatra combust zone)", basis: 'panchanga', automated: true },
  { n: 19, name: 'Akalagharjitha Vrishti', sanskrit: 'अकालगर्जित वृष्टि', issue: 'Unseasonal thunder/rain on the day', basis: 'manual', automated: false },
  { n: 20, name: 'Mahapatha (Vyatipata)', sanskrit: 'व्यतीपात', issue: 'Sun & Moon equidistant from the equator, same side', basis: 'panchanga', automated: true },
  { n: 21, name: 'Vaidhruthi', sanskrit: 'वैधृति', issue: 'Vaidhriti — the other most inauspicious nithya yoga', basis: 'panchanga', automated: true },
];

// Doṣa-bhaṅga is intentionally NOT represented as a generic global list.
// Cancellation/apavāda must be attached to the specific doṣa + activity +
// textual tradition and evaluated from the actual election chart. Broad
// statements such as "Jupiter in Lagna cancels everything" are unsafe for an
// automated engine unless the exact source, scope and prerequisites are encoded.
export const NEUTRALISATIONS: string[] = [];

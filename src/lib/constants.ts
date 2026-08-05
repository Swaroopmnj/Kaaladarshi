export const NAKSHATRAS = [
  'Ashwini', 'Bharani', 'Krittika', 'Rohini', 'Mrigashira', 'Ardra',
  'Punarvasu', 'Pushya', 'Ashlesha', 'Magha', 'Purva Phalguni', 'Uttara Phalguni',
  'Hasta', 'Chitra', 'Swati', 'Vishakha', 'Anuradha', 'Jyeshtha',
  'Moola', 'Purva Ashadha', 'Uttara Ashadha', 'Shravana', 'Dhanishtha',
  'Shatabhisha', 'Purva Bhadrapada', 'Uttara Bhadrapada', 'Revati',
] as const;

export const RASHIS = [
  'Mesha (Aries)', 'Vrishabha (Taurus)', 'Mithuna (Gemini)', 'Karka (Cancer)',
  'Simha (Leo)', 'Kanya (Virgo)', 'Tula (Libra)', 'Vrishchika (Scorpio)',
  'Dhanu (Sagittarius)', 'Makara (Capricorn)', 'Kumbha (Aquarius)', 'Meena (Pisces)',
] as const;

export interface ActivityDef {
  key: string; // matches panchang-ts STOCK_MUHURTA_RULES key & panchaka exception activity key
  label: string;
}

// Keys must match panchang-ts's STOCK_MUHURTA_RULES object keys.
export const ACTIVITIES: ActivityDef[] = [
  { key: 'vivah', label: 'Vivaha (Marriage)' },
  { key: 'grihaPravesh', label: 'Griha Pravesh (Housewarming)' },
  { key: 'namakarana', label: 'Namakarana (Naming ceremony)' },
  { key: 'vidyarambh', label: 'Vidyarambha (Starting education)' },
  { key: 'vahanKharidi', label: 'Vahan Kharidi (Vehicle purchase)' },
  { key: 'annaprashan', label: 'Annaprashana (First feeding)' },
  { key: 'mundan', label: 'Mundan (Tonsure)' },
  { key: 'upanayanam', label: 'Upanayanam (Sacred thread)' },
  { key: 'karnavedha', label: 'Karnavedha (Ear piercing)' },
  { key: 'aksharabhyasam', label: 'Aksharabhyasam (First letters)' },
  { key: 'seemantham', label: 'Seemantham (Baby shower)' },
  { key: 'shopOpening', label: 'Shop / Business Opening' },
  { key: 'travelStart', label: 'Travel Start' },
];

// Maps a panchang-ts occasion key to the classical-exception key used in panchaka.ts
export const PANCHAKA_ACTIVITY_KEY: Record<string, string> = {
  vivah: 'vivah',
  upanayanam: 'upanayanam',
  grihaPravesh: 'griha_pravesh',
  shopOpening: 'shop_opening',
  travelStart: 'travel_start',
  vahanKharidi: 'vahan_kharidi',
};

export interface CityPreset {
  name: string;
  latitude: number;
  longitude: number;
  timezone: number; // minutes offset from UTC
}

export const CITY_PRESETS: CityPreset[] = [
  // Andhra Pradesh
  { name: 'Amaravati/Vijayawada, AP', latitude: 16.5062, longitude: 80.648, timezone: 330 },
  { name: 'Visakhapatnam, AP', latitude: 17.6868, longitude: 83.2185, timezone: 330 },
  { name: 'Tirupati, AP', latitude: 13.6288, longitude: 79.4192, timezone: 330 },
  { name: 'Rajahmundry (Rajamahendravaram), AP', latitude: 17.0005, longitude: 81.804, timezone: 330 },
  { name: 'Guntur, AP', latitude: 16.3067, longitude: 80.4365, timezone: 330 },
  // Arunachal Pradesh
  { name: 'Itanagar, AR', latitude: 27.0844, longitude: 93.6053, timezone: 330 },
  // Assam
  { name: 'Guwahati, AS', latitude: 26.1445, longitude: 91.7362, timezone: 330 },
  { name: 'Dibrugarh, AS', latitude: 27.4728, longitude: 94.912, timezone: 330 },
  // Bihar
  { name: 'Patna, BR', latitude: 25.5941, longitude: 85.1376, timezone: 330 },
  { name: 'Gaya, BR', latitude: 24.7955, longitude: 84.9994, timezone: 330 },
  // Chhattisgarh
  { name: 'Raipur, CG', latitude: 21.2514, longitude: 81.6296, timezone: 330 },
  { name: 'Bilaspur, CG', latitude: 22.0797, longitude: 82.1409, timezone: 330 },
  // Goa
  { name: 'Panaji, GA', latitude: 15.4909, longitude: 73.8278, timezone: 330 },
  // Gujarat
  { name: 'Gandhinagar, GJ', latitude: 23.2156, longitude: 72.6369, timezone: 330 },
  { name: 'Ahmedabad, GJ', latitude: 23.0225, longitude: 72.5714, timezone: 330 },
  { name: 'Surat, GJ', latitude: 21.1702, longitude: 72.8311, timezone: 330 },
  { name: 'Vadodara, GJ', latitude: 22.3072, longitude: 73.1812, timezone: 330 },
  { name: 'Rajkot, GJ', latitude: 22.3039, longitude: 70.8022, timezone: 330 },
  { name: 'Dwarka, GJ', latitude: 22.2442, longitude: 68.9685, timezone: 330 },
  // Haryana
  { name: 'Chandigarh, HR/PB', latitude: 30.7333, longitude: 76.7794, timezone: 330 },
  { name: 'Gurugram, HR', latitude: 28.4595, longitude: 77.0266, timezone: 330 },
  { name: 'Faridabad, HR', latitude: 28.4089, longitude: 77.3178, timezone: 330 },
  { name: 'Kurukshetra, HR', latitude: 29.9695, longitude: 76.8783, timezone: 330 },
  // Himachal Pradesh
  { name: 'Shimla, HP', latitude: 31.1048, longitude: 77.1734, timezone: 330 },
  { name: 'Dharamshala, HP', latitude: 32.219, longitude: 76.3234, timezone: 330 },
  // Jharkhand
  { name: 'Ranchi, JH', latitude: 23.3441, longitude: 85.3096, timezone: 330 },
  { name: 'Jamshedpur, JH', latitude: 22.8046, longitude: 86.2029, timezone: 330 },
  // Karnataka
  { name: 'Bengaluru, KA', latitude: 12.9716, longitude: 77.5946, timezone: 330 },
  { name: 'Mysuru, KA', latitude: 12.2958, longitude: 76.6394, timezone: 330 },
  { name: 'Hubballi, KA', latitude: 15.3647, longitude: 75.124, timezone: 330 },
  { name: 'Mangaluru, KA', latitude: 12.9141, longitude: 74.856, timezone: 330 },
  { name: 'Udupi, KA', latitude: 13.3409, longitude: 74.7421, timezone: 330 },
  // Kerala
  { name: 'Thiruvananthapuram, KL', latitude: 8.5241, longitude: 76.9366, timezone: 330 },
  { name: 'Kochi, KL', latitude: 9.9312, longitude: 76.2673, timezone: 330 },
  { name: 'Kozhikode, KL', latitude: 11.2588, longitude: 75.7804, timezone: 330 },
  { name: 'Guruvayur, KL', latitude: 10.5949, longitude: 76.0413, timezone: 330 },
  // Madhya Pradesh
  { name: 'Bhopal, MP', latitude: 23.2599, longitude: 77.4126, timezone: 330 },
  { name: 'Indore, MP', latitude: 22.7196, longitude: 75.8577, timezone: 330 },
  { name: 'Jabalpur, MP', latitude: 23.1815, longitude: 79.9864, timezone: 330 },
  { name: 'Gwalior, MP', latitude: 26.2183, longitude: 78.1828, timezone: 330 },
  { name: 'Ujjain, MP', latitude: 23.1765, longitude: 75.7885, timezone: 330 },
  // Maharashtra
  { name: 'Mumbai, MH', latitude: 19.076, longitude: 72.8777, timezone: 330 },
  { name: 'Pune, MH', latitude: 18.5204, longitude: 73.8567, timezone: 330 },
  { name: 'Nagpur, MH', latitude: 21.1458, longitude: 79.0882, timezone: 330 },
  { name: 'Nashik, MH', latitude: 19.9975, longitude: 73.7898, timezone: 330 },
  { name: 'Aurangabad (Chh. Sambhajinagar), MH', latitude: 19.8762, longitude: 75.3433, timezone: 330 },
  { name: 'Pandharpur, MH', latitude: 17.6792, longitude: 75.3316, timezone: 330 },
  // Manipur
  { name: 'Imphal, MN', latitude: 24.817, longitude: 93.9368, timezone: 330 },
  // Meghalaya
  { name: 'Shillong, ML', latitude: 25.5788, longitude: 91.8933, timezone: 330 },
  // Mizoram
  { name: 'Aizawl, MZ', latitude: 23.7271, longitude: 92.7176, timezone: 330 },
  // Nagaland
  { name: 'Kohima, NL', latitude: 25.6751, longitude: 94.1086, timezone: 330 },
  // Odisha
  { name: 'Bhubaneswar, OD', latitude: 20.2961, longitude: 85.8245, timezone: 330 },
  { name: 'Puri, OD', latitude: 19.8135, longitude: 85.8312, timezone: 330 },
  { name: 'Cuttack, OD', latitude: 20.4625, longitude: 85.8828, timezone: 330 },
  // Punjab
  { name: 'Amritsar, PB', latitude: 31.634, longitude: 74.8723, timezone: 330 },
  { name: 'Ludhiana, PB', latitude: 30.901, longitude: 75.8573, timezone: 330 },
  // Rajasthan
  { name: 'Jaipur, RJ', latitude: 26.9124, longitude: 75.7873, timezone: 330 },
  { name: 'Udaipur, RJ', latitude: 24.5854, longitude: 73.7125, timezone: 330 },
  { name: 'Jodhpur, RJ', latitude: 26.2389, longitude: 73.0243, timezone: 330 },
  { name: 'Ajmer/Pushkar, RJ', latitude: 26.4499, longitude: 74.6399, timezone: 330 },
  { name: 'Kota, RJ', latitude: 25.2138, longitude: 75.8648, timezone: 330 },
  // Sikkim
  { name: 'Gangtok, SK', latitude: 27.3389, longitude: 88.6065, timezone: 330 },
  // Tamil Nadu
  { name: 'Chennai, TN', latitude: 13.0827, longitude: 80.2707, timezone: 330 },
  { name: 'Coimbatore, TN', latitude: 11.0168, longitude: 76.9558, timezone: 330 },
  { name: 'Madurai, TN', latitude: 9.9252, longitude: 78.1198, timezone: 330 },
  { name: 'Tiruchirappalli, TN', latitude: 10.7905, longitude: 78.7047, timezone: 330 },
  { name: 'Rameswaram, TN', latitude: 9.2876, longitude: 79.3129, timezone: 330 },
  { name: 'Kanchipuram, TN', latitude: 12.8342, longitude: 79.7036, timezone: 330 },
  { name: 'Thanjavur, TN', latitude: 10.787, longitude: 79.1378, timezone: 330 },
  // Telangana
  { name: 'Hyderabad, TS', latitude: 17.385, longitude: 78.4867, timezone: 330 },
  { name: 'Warangal, TS', latitude: 17.9689, longitude: 79.5941, timezone: 330 },
  { name: 'Karimnagar, TS', latitude: 18.4386, longitude: 79.1288, timezone: 330 },
  // Tripura
  { name: 'Agartala, TR', latitude: 23.8315, longitude: 91.2868, timezone: 330 },
  // Uttar Pradesh
  { name: 'Lucknow, UP', latitude: 26.8467, longitude: 80.9462, timezone: 330 },
  { name: 'Kanpur, UP', latitude: 26.4499, longitude: 80.3319, timezone: 330 },
  { name: 'Varanasi, UP', latitude: 25.3176, longitude: 82.9739, timezone: 330 },
  { name: 'Agra, UP', latitude: 27.1767, longitude: 78.0081, timezone: 330 },
  { name: 'Prayagraj (Allahabad), UP', latitude: 25.4358, longitude: 81.8463, timezone: 330 },
  { name: 'Mathura/Vrindavan, UP', latitude: 27.4924, longitude: 77.6737, timezone: 330 },
  { name: 'Ayodhya, UP', latitude: 26.7922, longitude: 82.1998, timezone: 330 },
  // Uttarakhand
  { name: 'Dehradun, UK', latitude: 30.3165, longitude: 78.0322, timezone: 330 },
  { name: 'Haridwar, UK', latitude: 29.9457, longitude: 78.1642, timezone: 330 },
  { name: 'Rishikesh, UK', latitude: 30.0869, longitude: 78.2676, timezone: 330 },
  { name: 'Badrinath, UK', latitude: 30.7433, longitude: 79.4938, timezone: 330 },
  // West Bengal
  { name: 'Kolkata, WB', latitude: 22.5726, longitude: 88.3639, timezone: 330 },
  { name: 'Darjeeling, WB', latitude: 27.041, longitude: 88.2663, timezone: 330 },
  { name: 'Siliguri, WB', latitude: 26.7271, longitude: 88.3953, timezone: 330 },
  // Union Territories
  { name: 'New Delhi, DL', latitude: 28.6139, longitude: 77.209, timezone: 330 },
  { name: 'Srinagar, JK', latitude: 34.0837, longitude: 74.7973, timezone: 330 },
  { name: 'Jammu, JK', latitude: 32.7266, longitude: 74.857, timezone: 330 },
  { name: 'Leh, Ladakh', latitude: 34.1526, longitude: 77.577, timezone: 330 },
  { name: 'Puducherry', latitude: 11.9416, longitude: 79.8083, timezone: 330 },
  { name: 'Port Blair, A&N Islands', latitude: 11.6234, longitude: 92.7265, timezone: 330 },
  { name: 'Daman', latitude: 20.3974, longitude: 72.8328, timezone: 330 },
  { name: 'Kavaratti, Lakshadweep', latitude: 10.5669, longitude: 72.6420, timezone: 330 },
  { name: 'Search any India city / town / village', latitude: NaN, longitude: NaN, timezone: 330 },
];

export const DEFAULT_CITY_INDEX = CITY_PRESETS.findIndex((c) => c.name.startsWith('Hyderabad'));
export const CUSTOM_LOCATION_INDEX = CITY_PRESETS.findIndex((c) => c.name.startsWith('Search any India'));

export function resolveCity(idx: number, customLat: number, customLng: number): CityPreset {
  if (idx === CUSTOM_LOCATION_INDEX) {
    return { name: 'Custom location', latitude: customLat, longitude: customLng, timezone: 330 };
  }
  return CITY_PRESETS[idx];
}

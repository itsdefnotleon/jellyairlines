// Airports you can fly between. Real airports are fine; the airline is fictional.
// Coordinates are runway-area approximations, which is plenty for a seatback map.

export interface Airport {
  code: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
  tz: string;
}

export const AIRPORTS: Airport[] = [
  { code: 'AKL', city: 'Auckland', country: 'New Zealand', lat: -37.0082, lon: 174.785, tz: 'Pacific/Auckland' },
  { code: 'AMS', city: 'Amsterdam', country: 'Netherlands', lat: 52.3105, lon: 4.7683, tz: 'Europe/Amsterdam' },
  { code: 'ARN', city: 'Stockholm', country: 'Sweden', lat: 59.6498, lon: 17.9238, tz: 'Europe/Stockholm' },
  { code: 'ATH', city: 'Athens', country: 'Greece', lat: 37.9364, lon: 23.9445, tz: 'Europe/Athens' },
  { code: 'BKK', city: 'Bangkok', country: 'Thailand', lat: 13.69, lon: 100.7501, tz: 'Asia/Bangkok' },
  { code: 'BOM', city: 'Mumbai', country: 'India', lat: 19.0896, lon: 72.8656, tz: 'Asia/Kolkata' },
  { code: 'CAI', city: 'Cairo', country: 'Egypt', lat: 30.1219, lon: 31.4056, tz: 'Africa/Cairo' },
  { code: 'CDG', city: 'Paris', country: 'France', lat: 49.0097, lon: 2.5479, tz: 'Europe/Paris' },
  { code: 'CPH', city: 'Copenhagen', country: 'Denmark', lat: 55.618, lon: 12.6508, tz: 'Europe/Copenhagen' },
  { code: 'CPT', city: 'Cape Town', country: 'South Africa', lat: -33.9715, lon: 18.6021, tz: 'Africa/Johannesburg' },
  { code: 'DEL', city: 'Delhi', country: 'India', lat: 28.5562, lon: 77.1, tz: 'Asia/Kolkata' },
  { code: 'DOH', city: 'Doha', country: 'Qatar', lat: 25.2731, lon: 51.6081, tz: 'Asia/Qatar' },
  { code: 'DUB', city: 'Dublin', country: 'Ireland', lat: 53.4264, lon: -6.2499, tz: 'Europe/Dublin' },
  { code: 'DXB', city: 'Dubai', country: 'UAE', lat: 25.2532, lon: 55.3657, tz: 'Asia/Dubai' },
  { code: 'EZE', city: 'Buenos Aires', country: 'Argentina', lat: -34.8222, lon: -58.5358, tz: 'America/Argentina/Buenos_Aires' },
  { code: 'FCO', city: 'Rome', country: 'Italy', lat: 41.8003, lon: 12.2389, tz: 'Europe/Rome' },
  { code: 'FRA', city: 'Frankfurt', country: 'Germany', lat: 50.0379, lon: 8.5622, tz: 'Europe/Berlin' },
  { code: 'GRU', city: 'São Paulo', country: 'Brazil', lat: -23.4356, lon: -46.4731, tz: 'America/Sao_Paulo' },
  { code: 'HKG', city: 'Hong Kong', country: 'China', lat: 22.308, lon: 113.9185, tz: 'Asia/Hong_Kong' },
  { code: 'HND', city: 'Tokyo', country: 'Japan', lat: 35.5494, lon: 139.7798, tz: 'Asia/Tokyo' },
  { code: 'HNL', city: 'Honolulu', country: 'USA', lat: 21.3187, lon: -157.9225, tz: 'Pacific/Honolulu' },
  { code: 'ICN', city: 'Seoul', country: 'South Korea', lat: 37.4602, lon: 126.4407, tz: 'Asia/Seoul' },
  { code: 'IST', city: 'Istanbul', country: 'Türkiye', lat: 41.2753, lon: 28.7519, tz: 'Europe/Istanbul' },
  { code: 'JFK', city: 'New York', country: 'USA', lat: 40.6413, lon: -73.7781, tz: 'America/New_York' },
  { code: 'JNB', city: 'Johannesburg', country: 'South Africa', lat: -26.1392, lon: 28.246, tz: 'Africa/Johannesburg' },
  { code: 'KEF', city: 'Reykjavík', country: 'Iceland', lat: 63.985, lon: -22.6056, tz: 'Atlantic/Reykjavik' },
  { code: 'LAX', city: 'Los Angeles', country: 'USA', lat: 33.9416, lon: -118.4085, tz: 'America/Los_Angeles' },
  { code: 'LHR', city: 'London', country: 'UK', lat: 51.47, lon: -0.4543, tz: 'Europe/London' },
  { code: 'LIS', city: 'Lisbon', country: 'Portugal', lat: 38.7742, lon: -9.1342, tz: 'Europe/Lisbon' },
  { code: 'MAD', city: 'Madrid', country: 'Spain', lat: 40.4983, lon: -3.5676, tz: 'Europe/Madrid' },
  { code: 'MEL', city: 'Melbourne', country: 'Australia', lat: -37.669, lon: 144.841, tz: 'Australia/Melbourne' },
  { code: 'MEX', city: 'Mexico City', country: 'Mexico', lat: 19.4361, lon: -99.0719, tz: 'America/Mexico_City' },
  { code: 'MIA', city: 'Miami', country: 'USA', lat: 25.7959, lon: -80.287, tz: 'America/New_York' },
  { code: 'NBO', city: 'Nairobi', country: 'Kenya', lat: -1.3192, lon: 36.9278, tz: 'Africa/Nairobi' },
  { code: 'ORD', city: 'Chicago', country: 'USA', lat: 41.9742, lon: -87.9073, tz: 'America/Chicago' },
  { code: 'PEK', city: 'Beijing', country: 'China', lat: 40.0799, lon: 116.6031, tz: 'Asia/Shanghai' },
  { code: 'PRN', city: 'Pristina', country: 'Kosovo', lat: 42.5728, lon: 21.0358, tz: 'Europe/Belgrade' },
  { code: 'SFO', city: 'San Francisco', country: 'USA', lat: 37.6213, lon: -122.379, tz: 'America/Los_Angeles' },
  { code: 'SIN', city: 'Singapore', country: 'Singapore', lat: 1.3644, lon: 103.9915, tz: 'Asia/Singapore' },
  { code: 'SYD', city: 'Sydney', country: 'Australia', lat: -33.9399, lon: 151.1753, tz: 'Australia/Sydney' },
  { code: 'TIA', city: 'Tirana', country: 'Albania', lat: 41.4147, lon: 19.7206, tz: 'Europe/Tirane' },
  { code: 'VIE', city: 'Vienna', country: 'Austria', lat: 48.1103, lon: 16.5697, tz: 'Europe/Vienna' },
  { code: 'WAW', city: 'Warsaw', country: 'Poland', lat: 52.1657, lon: 20.9671, tz: 'Europe/Warsaw' },
  { code: 'YVR', city: 'Vancouver', country: 'Canada', lat: 49.1967, lon: -123.1815, tz: 'America/Vancouver' },
  { code: 'YYZ', city: 'Toronto', country: 'Canada', lat: 43.6777, lon: -79.6248, tz: 'America/Toronto' },
  { code: 'ZRH', city: 'Zurich', country: 'Switzerland', lat: 47.4582, lon: 8.5555, tz: 'Europe/Zurich' },
];

export const DEFAULT_FROM = 'LHR';
export const DEFAULT_TO = 'JFK';

export function airport(code: string | undefined): Airport | undefined {
  return AIRPORTS.find((a) => a.code === code);
}

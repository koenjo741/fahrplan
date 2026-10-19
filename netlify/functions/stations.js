const { createClient } = require('hafas-client');
const { profile: oebbProfile } = require('hafas-client/p/oebb/index.js');
const { handleCorsPreflight, jsonResponse } = require('./utils/httpHelper');

const hafas = createClient(oebbProfile, 'oebb-westbahn-fahrplan-stations-v1');

// Predefined Austrian hub stations for fast fallback & priority matching
const PRESET_STATIONS = [
  { id: '8103000', name: 'Wien Hauptbahnhof', shortName: 'Wien Hbf', code: 'WBF', tags: ['wien', 'vienna', 'hauptbahnhof'] },
  { id: '8100003', name: 'Wien Westbahnhof', shortName: 'Wien West', code: 'WW', tags: ['wien', 'westbahnhof'] },
  { id: '1293001', name: 'Flughafen Wien', shortName: 'Flughafen Wien', code: 'VIE', tags: ['flughafen', 'schwechat', 'airport'] },
  { id: '8100013', name: 'Linz/Donau Hbf', shortName: 'Linz Hbf', code: 'LNZ', tags: ['linz', 'oberoesterreich'] },
  { id: '8100002', name: 'Salzburg Hbf', shortName: 'Salzburg Hbf', code: 'SBG', tags: ['salzburg'] },
  { id: '8100008', name: 'St.Pölten Hbf', shortName: 'St. Pölten Hbf', code: 'STP', tags: ['st. pölten', 'poelten'] },
  { id: '8100015', name: 'Wels Hbf', shortName: 'Wels Hbf', code: 'WLS', tags: ['wels'] },
  { id: '8100108', name: 'Amstetten N.Ö.', shortName: 'Amstetten', code: 'AMS', tags: ['amstetten'] },
  { id: '8100001', name: 'Attnang-Puchheim', shortName: 'Attnang-Puchheim', code: 'ATT', tags: ['attnang'] },
  { id: '8100514', name: 'Wien Meidling', shortName: 'Wien Meidling', code: 'WM', tags: ['meidling'] },
  { id: '8100027', name: 'Innsbruck Hbf', shortName: 'Innsbruck Hbf', code: 'INN', tags: ['innsbruck', 'tirol'] },
  { id: '8100173', name: 'Bregenz', shortName: 'Bregenz', code: 'BRG', tags: ['bregenz', 'vorarlberg'] },
  { id: '8100114', name: 'Graz Hbf', shortName: 'Graz Hbf', code: 'GRZ', tags: ['graz', 'steiermark'] },
  { id: '8100085', name: 'Klagenfurt Hbf', shortName: 'Klagenfurt Hbf', code: 'KLG', tags: ['klagenfurt', 'kaernten'] }
];

/**
 * Filter presets matching query substring in name, shortName or tags.
 * @param {string} qLower - Lowercase search query
 * @returns {Array} Matching preset stations
 */
function filterPresetStations(qLower) {
  return PRESET_STATIONS.filter(s =>
    s.name.toLowerCase().includes(qLower) ||
    s.shortName.toLowerCase().includes(qLower) ||
    s.tags.some(t => t.includes(qLower))
  );
}

/**
 * Clean raw HAFAS location name to remove internal/platform brackets like (Bahnsteige 3-12).
 * @param {string} rawName
 * @returns {string} Cleaned station name
 */
function cleanStationName(rawName = '') {
  if (!rawName) return '';
  return rawName
    .replace(/\s*\(Bahnsteig[^)]*\)/gi, '')
    .replace(/\s*\(U\)$/i, '')
    .replace(/\s*Bahnhst$/i, '')
    .trim();
}

/**
 * Clean raw HAFAS location name into short display format.
 * @param {string} rawName
 * @returns {string} Cleaned short name
 */
function cleanStationShortName(rawName = '') {
  return cleanStationName(rawName)
    .replace(/Linz\/Donau/gi, 'Linz')
    .replace(/Wien Westbahnhof/gi, 'Wien West')
    .replace(/Wien Hauptbahnhof/gi, 'Wien Hbf')
    .trim();
}

/**
 * Netlify Function handler for station lookup and autocomplete.
 */
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return handleCorsPreflight('GET, OPTIONS');
  }

  const query = (event.queryStringParameters?.q || event.queryStringParameters?.query || '').trim();

  // If empty query, return popular preset stations
  if (!query) {
    return jsonResponse(200, {
      success: true,
      stations: PRESET_STATIONS
    });
  }

  const qLower = query.toLowerCase();

  try {
    const matchedPresets = filterPresetStations(qLower);

    // Call ÖBB HAFAS locations API
    const rawLocations = await hafas.locations(query, {
      results: 10,
      stops: true,
      addresses: false,
      poi: false
    });

    const seenIds = new Set();
    const stations = [];

    // Prioritize matched preset hubs
    for (const p of matchedPresets) {
      seenIds.add(p.id);
      stations.push({
        id: p.id,
        name: cleanStationName(p.name),
        shortName: p.shortName,
        isPopular: true
      });
    }

    // Merge live HAFAS locations avoiding duplicates
    for (const loc of rawLocations) {
      if (!seenIds.has(loc.id)) {
        seenIds.add(loc.id);
        stations.push({
          id: loc.id,
          name: cleanStationName(loc.name),
          shortName: cleanStationShortName(loc.name),
          isPopular: false,
          location: loc.location ? { lat: loc.location.latitude, lon: loc.location.longitude } : null
        });
      }
    }

    return jsonResponse(200, {
      success: true,
      query,
      count: stations.length,
      stations
    });
  } catch (err) {
    console.error('Error fetching stations:', err);

    // Fallback to presets matching query
    const fallbackStations = filterPresetStations(qLower);

    return jsonResponse(200, {
      success: true,
      query,
      count: fallbackStations.length,
      stations: fallbackStations,
      warning: 'Fallback auf vordefinierte Bahnhöfe aktiv (HAFAS nicht erreichbar).'
    });
  }
};

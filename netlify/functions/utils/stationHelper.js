/**
 * Station metadata and helper utilities.
 * Verified Austrian railway hub stations with exact ÖBB/UIC station IDs.
 */

const PRESET_STATIONS = [
  { id: '8103000', name: 'Wien Hauptbahnhof', shortName: 'Wien Hbf', code: 'WBF', tags: ['wien', 'vienna', 'hauptbahnhof'] },
  { id: '8100003', name: 'Wien Westbahnhof', shortName: 'Wien West', code: 'WW', tags: ['wien', 'westbahnhof'] },
  { id: '1293001', name: 'Flughafen Wien', shortName: 'Flughafen Wien', code: 'VIE', tags: ['flughafen', 'schwechat', 'airport'] },
  { id: '8100013', name: 'Linz/Donau Hbf', shortName: 'Linz Hbf', code: 'LNZ', tags: ['linz', 'oberoesterreich'] },
  { id: '8100002', name: 'Salzburg Hbf', shortName: 'Salzburg Hbf', code: 'SBG', tags: ['salzburg'] },
  { id: '8100008', name: 'St.Pölten Hbf', shortName: 'St. Pölten Hbf', code: 'STP', tags: ['st. pölten', 'poelten'] },
  { id: '8100014', name: 'Wels Hbf', shortName: 'Wels Hbf', code: 'WLS', tags: ['wels'] },
  { id: '1230501', name: 'Amstetten NÖ Bahnhof', shortName: 'Amstetten', code: 'AMS', tags: ['amstetten'] },
  { id: '1241703', name: 'Attnang-Puchheim Bahnhof', shortName: 'Attnang-Puchheim', code: 'ATT', tags: ['attnang'] },
  { id: '8100514', name: 'Wien Meidling', shortName: 'Wien Meidling', code: 'WM', tags: ['meidling'] },
  { id: '8100108', name: 'Innsbruck Hbf', shortName: 'Innsbruck Hbf', code: 'INN', tags: ['innsbruck', 'tirol'] },
  { id: '1280202', name: 'Bregenz Bahnhof', shortName: 'Bregenz', code: 'BRG', tags: ['bregenz', 'vorarlberg'] },
  { id: '8100173', name: 'Graz Hbf', shortName: 'Graz Hbf', code: 'GRZ', tags: ['graz', 'steiermark'] },
  { id: '8100085', name: 'Klagenfurt Hbf', shortName: 'Klagenfurt Hbf', code: 'KLG', tags: ['klagenfurt', 'kaernten'] }
];

/**
 * Filter preset stations matching a lowercase query substring in name, shortName, code or tags.
 * @param {string} qLower
 * @returns {Array} Matching preset stations
 */
function filterPresetStations(qLower) {
  if (!qLower) return [...PRESET_STATIONS];
  return PRESET_STATIONS.filter(s =>
    s.name.toLowerCase().includes(qLower) ||
    s.shortName.toLowerCase().includes(qLower) ||
    (s.code && s.code.toLowerCase().includes(qLower)) ||
    s.tags.some(t => t.includes(qLower))
  );
}

/**
 * Remove parenthetical platform noise, local transit tags, and internal suffixes from station names.
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
 * Clean raw station name into short display format.
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

module.exports = {
  PRESET_STATIONS,
  filterPresetStations,
  cleanStationName,
  cleanStationShortName
};

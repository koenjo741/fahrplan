const { createClient } = require('hafas-client');
const { profile: oebbProfile } = require('hafas-client/p/oebb/index.js');
const { handleCorsPreflight, jsonResponse } = require('./utils/httpHelper');
const {
  PRESET_STATIONS,
  filterPresetStations,
  cleanStationName,
  cleanStationShortName
} = require('./utils/stationHelper');

const hafas = createClient(oebbProfile, 'oebb-westbahn-fahrplan-stations-v1');

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

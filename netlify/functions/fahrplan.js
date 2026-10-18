const { createClient } = require('hafas-client');
const { profile: oebbProfile } = require('hafas-client/p/oebb/index.js');
const {
  identifyLegCarrier,
  summarizeJourneyCarriers,
  formatDuration,
  formatDelay
} = require('./utils/carrierHelper');

const hafas = createClient(oebbProfile, 'oebb-westbahn-fahrplan-v1');

const HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};

/**
 * Resolve input to a valid station ID or stop object.
 * If already an ID, returns it. If text, searches HAFAS.
 */
async function resolveStation(stationInput) {
  if (!stationInput) return null;
  const trimmed = stationInput.trim();

  // If purely numeric ID (e.g. 8100003, 1293001), use directly
  if (/^\d+$/.test(trimmed)) {
    return { id: trimmed, name: trimmed };
  }

  // Lookup station by name
  const results = await hafas.locations(trimmed, {
    results: 3,
    stops: true,
    addresses: false,
    poi: false
  });

  if (!results || results.length === 0) {
    throw new Error(`Bahnhof "${trimmed}" konnte nicht gefunden werden.`);
  }

  return {
    id: results[0].id,
    name: results[0].name
  };
}

/**
 * Netlify Function Handler for timetable queries.
 */
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: HEADERS, body: '' };
  }

  const params = event.queryStringParameters || {};
  const originInput = params.origin || params.from;
  const destinationInput = params.destination || params.to;
  const dateParam = params.date; // YYYY-MM-DD
  const timeParam = params.time; // HH:mm
  const directOnly = params.direct === 'true' || params.direct === '1';
  const carrierFilter = (params.carrier || 'all').toLowerCase(); // 'all', 'oebb', 'westbahn'
  const maxResults = Math.min(Math.max(parseInt(params.results || '8', 10), 1), 20);
  const earlierRef = params.earlierRef || null;
  const laterRef = params.laterRef || null;

  if (!originInput || !destinationInput) {
    return {
      statusCode: 400,
      headers: HEADERS,
      body: JSON.stringify({
        success: false,
        error: 'Bitte Start- und Zielbahnhof angeben (Parameter "origin" und "destination").'
      })
    };
  }

  try {
    // 1. Resolve origin and destination
    const [originStation, destinationStation] = await Promise.all([
      resolveStation(originInput),
      resolveStation(destinationInput)
    ]);

    // 2. Parse departure time
    let departureDate = new Date();
    if (dateParam && timeParam) {
      // Parse local time string
      const parsed = new Date(`${dateParam}T${timeParam}:00`);
      if (!isNaN(parsed.getTime())) {
        departureDate = parsed;
      }
    } else if (dateParam) {
      const parsed = new Date(`${dateParam}T00:00:00`);
      if (!isNaN(parsed.getTime())) {
        departureDate = parsed;
      }
    }

    // 3. Configure HAFAS query options
    const queryOptions = {
      results: maxResults,
      stopovers: true,
      remarks: true,
      tickets: false
    };

    if (earlierRef) {
      queryOptions.earlierThan = earlierRef;
    } else if (laterRef) {
      queryOptions.laterThan = laterRef;
    } else {
      queryOptions.departure = departureDate;
    }

    // 4. Query journeys from HAFAS
    const rawResult = await hafas.journeys(originStation.id, destinationStation.id, queryOptions);
    const rawJourneys = rawResult.journeys || [];

    // 5. Transform and enrich each journey
    let formattedJourneys = rawJourneys.map((j, idx) => {
      const legs = j.legs || [];
      if (legs.length === 0) return null;

      const firstLeg = legs[0];
      const lastLeg = legs[legs.length - 1];

      const plannedDep = firstLeg.plannedDeparture ? new Date(firstLeg.plannedDeparture) : new Date(firstLeg.departure);
      const actualDep = firstLeg.departure ? new Date(firstLeg.departure) : plannedDep;
      const plannedArr = lastLeg.plannedArrival ? new Date(lastLeg.plannedArrival) : new Date(lastLeg.arrival);
      const actualArr = lastLeg.arrival ? new Date(lastLeg.arrival) : plannedArr;

      const durationMinutes = Math.max(0, Math.round((actualArr - actualDep) / 60000));
      const depDelay = formatDelay(firstLeg.departureDelay);
      const arrDelay = formatDelay(lastLeg.arrivalDelay);

      // Transfers count: train/bus/transit changes (excluding walks)
      const transitLegs = legs.filter(l => !l.walking && l.line);
      const transfers = Math.max(0, transitLegs.length - 1);
      const isDirect = transfers === 0;

      // Carrier summary
      const carrierSummary = summarizeJourneyCarriers(legs);

      // Detailed leg data
      const enrichedLegs = legs.map((leg) => {
        const legCarrier = identifyLegCarrier(leg);
        const legPlannedDep = leg.plannedDeparture || leg.departure;
        const legActualDep = leg.departure || legPlannedDep;
        const legPlannedArr = leg.plannedArrival || leg.arrival;
        const legActualArr = leg.arrival || legPlannedArr;
        const legDurationMin = Math.round((new Date(legActualArr) - new Date(legActualDep)) / 60000);

        // Stopovers / intermediate stops
        const stopovers = (leg.stopovers || []).map(s => ({
          name: s.stop?.name || 'Unbekannter Halt',
          arrival: s.arrival,
          plannedArrival: s.plannedArrival,
          departure: s.departure,
          plannedDeparture: s.plannedDeparture,
          platform: s.platform || s.plannedPlatform || null
        }));

        // Remarks / alerts
        const remarks = (leg.remarks || []).map(r => ({
          text: r.text || r.summary || '',
          type: r.type || 'hint',
          code: r.code || ''
        })).filter(r => r.text);

        return {
          walking: !!leg.walking,
          carrier: legCarrier,
          line: leg.line ? {
            name: leg.line.name || '',
            product: leg.line.product || '',
            productName: leg.line.productName || leg.line.product || '',
            direction: leg.direction || '',
            adminCode: leg.line.adminCode || ''
          } : null,
          origin: {
            name: leg.origin?.name || '',
            id: leg.origin?.id || '',
            platform: leg.plannedPlatform || leg.platform || null
          },
          destination: {
            name: leg.destination?.name || '',
            id: leg.destination?.id || '',
            platform: leg.plannedArrivalPlatform || leg.arrivalPlatform || null
          },
          departure: legActualDep,
          plannedDeparture: legPlannedDep,
          arrival: legActualArr,
          plannedArrival: legPlannedArr,
          durationMinutes: legDurationMin,
          durationFormatted: formatDuration(legDurationMin),
          departureDelay: formatDelay(leg.departureDelay),
          arrivalDelay: formatDelay(leg.arrivalDelay),
          cancelled: !!leg.cancelled,
          stopovers,
          remarks
        };
      });

      return {
        id: j.refreshToken || `journey-${idx}-${actualDep.getTime()}`,
        departureTime: actualDep.toISOString(),
        plannedDepartureTime: plannedDep.toISOString(),
        arrivalTime: actualArr.toISOString(),
        plannedArrivalTime: plannedArr.toISOString(),
        durationMinutes,
        durationFormatted: formatDuration(durationMinutes),
        transfers,
        isDirect,
        carrierSummary,
        departureDelay: depDelay,
        arrivalDelay: arrDelay,
        originName: firstLeg.origin?.name || originStation.name,
        destinationName: lastLeg.destination?.name || destinationStation.name,
        departurePlatform: firstLeg.plannedPlatform || firstLeg.platform || null,
        arrivalPlatform: lastLeg.plannedArrivalPlatform || lastLeg.arrivalPlatform || null,
        legs: enrichedLegs
      };
    }).filter(Boolean);

    // Apply filters
    if (directOnly) {
      formattedJourneys = formattedJourneys.filter(j => j.isDirect);
    }

    if (carrierFilter === 'westbahn') {
      formattedJourneys = formattedJourneys.filter(j => j.carrierSummary.hasWestbahn);
    } else if (carrierFilter === 'oebb') {
      formattedJourneys = formattedJourneys.filter(j => j.carrierSummary.hasOebb);
    }

    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify({
        success: true,
        query: {
          origin: originStation,
          destination: destinationStation,
          date: dateParam || new Date().toISOString().slice(0, 10),
          time: timeParam || new Date().toTimeString().slice(0, 5),
          carrierFilter,
          directOnly
        },
        pagination: {
          earlierRef: rawResult.earlierRef || null,
          laterRef: rawResult.laterRef || null
        },
        count: formattedJourneys.length,
        journeys: formattedJourneys
      })
    };
  } catch (err) {
    console.error('Fahrplan query error:', err);
    return {
      statusCode: 500,
      headers: HEADERS,
      body: JSON.stringify({
        success: false,
        error: err.message || 'Fehler beim Abrufen des Fahrplans. Bitte überprüfe die Bahnhöfe oder versuche es erneut.'
      })
    };
  }
};

const { createClient } = require('hafas-client');
const { profile: oebbProfile } = require('hafas-client/p/oebb/index.js');
const {
  identifyLegCarrier,
  summarizeJourneyCarriers,
  formatDuration,
  formatDelay
} = require('./utils/carrierHelper');
const { handleCorsPreflight, jsonResponse } = require('./utils/httpHelper');

const hafas = createClient(oebbProfile, 'oebb-westbahn-fahrplan-v1');

/**
 * Resolve Austrian local date and time (Europe/Vienna) to an exact UTC Date object,
 * avoiding UTC/server timezone offsets on Netlify/AWS Lambda.
 * @param {string} dateStr - YYYY-MM-DD
 * @param {string} timeStr - HH:mm
 * @returns {Date} UTC Date corresponding to Vienna local time
 */
function parseViennaDateTime(dateStr, timeStr) {
  if (!dateStr) return new Date();
  const time = timeStr || '00:00';
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, min] = time.split(':').map(Number);

  // Initial UTC guess
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, min));

  // Determine what time that is in Austrian local time (Europe/Vienna)
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Vienna',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false
  });

  const parts = formatter.formatToParts(utcGuess);
  const viennaMap = {};
  parts.forEach(p => { viennaMap[p.type] = p.value; });

  const vYear = Number(viennaMap.year);
  const vMonth = Number(viennaMap.month);
  const vDay = Number(viennaMap.day);
  let vHour = Number(viennaMap.hour);
  if (vHour === 24) vHour = 0;
  const vMin = Number(viennaMap.minute);

  const viennaDateAsUTC = new Date(Date.UTC(vYear, vMonth - 1, vDay, vHour, vMin));
  const diffMs = viennaDateAsUTC.getTime() - utcGuess.getTime();

  return new Date(utcGuess.getTime() - diffMs);
}

/**
 * Helper to enforce hard timeout limits on async promises.
 * @param {Promise} promise
 * @param {number} ms
 * @param {string} desc
 * @returns {Promise}
 */
function withTimeout(promise, ms, desc = 'Anfrage') {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${desc} überschritt Zeitlimit von ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}

/**
 * Resolve input to a valid station ID or stop object.
 * If already an ID, returns it. If text, searches HAFAS.
 * @param {string} stationInput
 * @returns {Promise<Object>} { id, name }
 */
async function resolveStation(stationInput) {
  if (!stationInput) return null;
  const trimmed = stationInput.trim();

  // If purely numeric ID (e.g. 8100003, 1293001), use directly
  if (/^\d+$/.test(trimmed)) {
    return { id: trimmed, name: trimmed };
  }

  // Lookup station by name with 7s timeout
  const results = await withTimeout(
    hafas.locations(trimmed, {
      results: 3,
      stops: true,
      addresses: false,
      poi: false
    }),
    7000,
    `Bahnhofssuche "${trimmed}"`
  );

  if (!results || results.length === 0) {
    throw new Error(`Bahnhof "${trimmed}" konnte nicht gefunden werden.`);
  }

  return {
    id: results[0].id,
    name: cleanStationName(results[0].name)
  };
}

/**
 * Remove parenthetical platform noise and internal suffixes from station names.
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
 * Transform a raw HAFAS leg into an enriched leg object.
 * @param {Object} leg
 * @returns {Object} Enriched leg
 */
function enrichLeg(leg) {
  const legCarrier = identifyLegCarrier(leg);
  const legPlannedDep = leg.plannedDeparture || leg.departure;
  const legActualDep = leg.departure || legPlannedDep;
  const legPlannedArr = leg.plannedArrival || leg.arrival;
  const legActualArr = leg.arrival || legPlannedArr;
  const legDurationMin = Math.round((new Date(legActualArr) - new Date(legActualDep)) / 60000);

  // Intermediate stops
  const stopovers = (leg.stopovers || []).map(s => ({
    name: cleanStationName(s.stop?.name || 'Unbekannter Halt'),
    arrival: s.arrival,
    plannedArrival: s.plannedArrival,
    departure: s.departure,
    plannedDeparture: s.plannedDeparture,
    platform: s.platform || s.plannedPlatform || null
  }));

  // Remarks & hints
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
      name: cleanStationName(leg.origin?.name || ''),
      id: leg.origin?.id || '',
      platform: leg.plannedPlatform || leg.platform || null
    },
    destination: {
      name: cleanStationName(leg.destination?.name || ''),
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
}

/**
 * Transform a raw HAFAS journey into a clean, structured object.
 * @param {Object} j - Raw journey
 * @param {number} idx - Index
 * @param {Object} originStation
 * @param {Object} destinationStation
 * @returns {Object|null} Formatted journey
 */
function formatJourney(j, idx, originStation, destinationStation) {
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

  // Carrier summary across all legs
  const carrierSummary = summarizeJourneyCarriers(legs);

  // Detailed enriched legs
  const enrichedLegs = legs.map(enrichLeg);

  return {
    id: j.refreshToken || `journey-${idx}-${actualDep.getTime()}`,
    depTimestamp: actualDep.getTime(),
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
    originName: cleanStationName(firstLeg.origin?.name || originStation.name),
    destinationName: cleanStationName(lastLeg.destination?.name || destinationStation.name),
    departurePlatform: firstLeg.plannedPlatform || firstLeg.platform || null,
    arrivalPlatform: lastLeg.plannedArrivalPlatform || lastLeg.arrivalPlatform || null,
    legs: enrichedLegs
  };
}

/**
 * Fetch journeys across a requested time window or via pagination tokens.
 * @param {Object} originStation
 * @param {Object} destinationStation
 * @param {Date} startTime
 * @param {Date} endTime
 * @param {string|null} earlierRef
 * @param {string|null} laterRef
 * @returns {Promise<Object>} { rawJourneys, earlierRef, laterRef }
 */
async function fetchTimeWindowJourneys(originStation, destinationStation, startTime, endTime, earlierRef, laterRef) {
  const rawJourneys = [];
  let paginationEarlierRef = null;
  let paginationLaterRef = null;
  let isPartial = false;

  if (earlierRef || laterRef) {
    // Single-batch pagination request
    const queryOptions = {
      results: 10,
      stopovers: true,
      remarks: true,
      tickets: false
    };
    if (earlierRef) queryOptions.earlierThan = earlierRef;
    if (laterRef) queryOptions.laterThan = laterRef;

    const res = await withTimeout(
      hafas.journeys(originStation.id, destinationStation.id, queryOptions),
      15000,
      'HAFAS Pagination'
    );
    if (res.journeys) rawJourneys.push(...res.journeys);
    paginationEarlierRef = res.earlierRef || null;
    paginationLaterRef = res.laterRef || null;
  } else {
    // Multi-batch search covering up to the requested time window
    let currentLaterRef = null;
    let iterations = 0;
    const MAX_ITERATIONS = 6;
    const FUNCTION_DEADLINE_MS = 22000; // 22 seconds limit within the 26s Netlify timeout
    const fetchStartTime = Date.now();

    while (iterations < MAX_ITERATIONS) {
      // Check if we are approaching the function execution limit
      if (iterations > 0 && (Date.now() - fetchStartTime) > FUNCTION_DEADLINE_MS) {
        console.warn(`[Timeout-Schutz] Zeitgrenze (${Date.now() - fetchStartTime}ms) erreicht. Liefere ${rawJourneys.length} Teil-Verbindungen.`);
        isPartial = true;
        break;
      }

      iterations++;
      const queryOptions = {
        results: 10,
        stopovers: true,
        remarks: true,
        tickets: false
      };

      if (currentLaterRef) {
        queryOptions.laterThan = currentLaterRef;
      } else {
        queryOptions.departure = startTime;
      }

      try {
        // Individual batch timeout: 9 seconds
        const res = await withTimeout(
          hafas.journeys(originStation.id, destinationStation.id, queryOptions),
          9000,
          `HAFAS Batch ${iterations}`
        );

        if (!paginationEarlierRef && res.earlierRef) {
          paginationEarlierRef = res.earlierRef;
        }

        const batch = res.journeys || [];
        if (batch.length === 0) break;

        rawJourneys.push(...batch);
        paginationLaterRef = res.laterRef || null;

        const lastLeg = batch[batch.length - 1]?.legs?.[0];
        const lastDep = lastLeg ? new Date(lastLeg.departure) : null;

        // Stop once we have reached or passed the end of the time window
        if (!res.laterRef || (lastDep && lastDep >= endTime)) {
          break;
        }
        currentLaterRef = res.laterRef;
      } catch (err) {
        console.warn(`[HAFAS Batch ${iterations} Warnung]: ${err.message}`);
        // Possibility 2: Partial Results on timeout or upstream error!
        if (rawJourneys.length > 0) {
          console.info(`[Partial Results] Liefere ${rawJourneys.length} bereits gefundene Verbindungen aus.`);
          isPartial = true;
          break;
        }
        // If not even the first batch could be fetched, rethrow so retry mechanism can engage
        throw err;
      }
    }
  }

  return {
    rawJourneys,
    earlierRef: paginationEarlierRef,
    laterRef: paginationLaterRef,
    isPartial
  };
}

/**
 * Deduplicate, sort, and filter journeys according to search criteria.
 * @param {Array} rawJourneys
 * @param {Object} options
 * @returns {Array} Clean formatted journeys
 */
function processAndFilterJourneys(rawJourneys, {
  originStation,
  destinationStation,
  startTime,
  endTime,
  earlierRef,
  laterRef,
  directOnly,
  carrierFilter
}) {
  const seenKeys = new Set();
  const formattedJourneys = [];

  for (let i = 0; i < rawJourneys.length; i++) {
    const formatted = formatJourney(rawJourneys[i], i, originStation, destinationStation);
    if (!formatted) continue;

    // Unique key: departure timestamp + first leg line name
    const firstLegLine = formatted.legs[0]?.line?.name || 'train';
    const key = `${formatted.depTimestamp}-${firstLegLine}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    // Strict filter: only trains >= requested startTime (unless paginating backwards)
    if (!earlierRef && formatted.depTimestamp < startTime.getTime()) {
      continue;
    }

    // Window limit (unless paginating forwards)
    if (!laterRef && formatted.depTimestamp > endTime.getTime()) {
      continue;
    }

    formattedJourneys.push(formatted);
  }

  // Sort strictly chronologically
  formattedJourneys.sort((a, b) => a.depTimestamp - b.depTimestamp);

  // Direct trains filter
  let result = directOnly ? formattedJourneys.filter(j => j.isDirect) : formattedJourneys;

  // Carrier filter
  if (carrierFilter === 'westbahn') {
    result = result.filter(j => j.carrierSummary.hasWestbahn);
  } else if (carrierFilter === 'oebb') {
    result = result.filter(j => j.carrierSummary.hasOebb);
  }

  return result;
}

/**
 * Netlify Function Handler for timetable queries.
 */
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return handleCorsPreflight('GET, POST, OPTIONS');
  }

  const params = event.queryStringParameters || {};
  const originInput = params.origin || params.from;
  const destinationInput = params.destination || params.to;
  const dateParam = params.date;
  const timeParam = params.time;
  const directOnly = params.direct === 'true' || params.direct === '1';
  const carrierFilter = (params.carrier || 'all').toLowerCase();
  const earlierRef = params.earlierRef || null;
  const laterRef = params.laterRef || null;
  const windowHours = Math.min(Math.max(parseInt(params.hours || '12', 10), 1), 24);

  if (!originInput || !destinationInput) {
    return jsonResponse(400, {
      success: false,
      error: 'Bitte Start- und Zielbahnhof angeben (Parameter "origin" und "destination").'
    });
  }

  try {
    // 1. Resolve stations
    const [originStation, destinationStation] = await Promise.all([
      resolveStation(originInput),
      resolveStation(destinationInput)
    ]);

    // 2. Parse departure time in Europe/Vienna timezone
    const startTime = parseViennaDateTime(dateParam, timeParam);
    const endTime = new Date(startTime.getTime() + windowHours * 60 * 60 * 1000);

    // 3. Query journeys from HAFAS
    const { rawJourneys, earlierRef: paginationEarlierRef, laterRef: paginationLaterRef, isPartial } =
      await fetchTimeWindowJourneys(originStation, destinationStation, startTime, endTime, earlierRef, laterRef);

    // 4. Transform, deduplicate and filter
    const journeys = processAndFilterJourneys(rawJourneys, {
      originStation,
      destinationStation,
      startTime,
      endTime,
      earlierRef,
      laterRef,
      directOnly,
      carrierFilter
    });

    return jsonResponse(200, {
      success: true,
      query: {
        origin: originStation,
        destination: destinationStation,
        date: dateParam || new Date().toISOString().slice(0, 10),
        time: timeParam || new Date().toTimeString().slice(0, 5),
        startISO: startTime.toISOString(),
        endISO: endTime.toISOString(),
        windowHours,
        carrierFilter,
        directOnly
      },
      pagination: {
        earlierRef: paginationEarlierRef,
        laterRef: paginationLaterRef
      },
      count: journeys.length,
      isPartial: !!isPartial,
      journeys
    });
  } catch (err) {
    console.error('Fahrplan query error:', err);
    return jsonResponse(500, {
      success: false,
      error: err.message || 'Fehler beim Abrufen des Fahrplans. Bitte überprüfe die Bahnhöfe oder versuche es erneut.'
    });
  }
};

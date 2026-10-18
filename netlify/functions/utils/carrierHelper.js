/**
 * Carrier & Journey helper utilities for Austrian train timetable queries.
 * Distinguishes between ÖBB, WESTbahn, and regional/local operators.
 */

/**
 * Determine operator category and metadata for an individual leg.
 * @param {Object} leg - Hafas leg object
 * @returns {Object} { key: 'westbahn'|'oebb'|'local'|'walk', name: string, badgeClass: string, isTrain: boolean }
 */
function identifyLegCarrier(leg) {
  if (!leg) return { key: 'unknown', name: 'Unbekannt', badgeClass: 'badge-gray', isTrain: false };
  if (leg.walking) {
    return { key: 'walk', name: 'Fußweg', badgeClass: 'badge-walk', isTrain: false };
  }

  const opName = (leg.line?.operator?.name || leg.operator?.name || '').toLowerCase();
  const opId = (leg.line?.operator?.id || leg.operator?.id || '').toLowerCase();
  const lineName = (leg.line?.name || '').toUpperCase();
  const productName = (leg.line?.productName || leg.line?.product || '').toUpperCase();
  const adminCode = leg.line?.adminCode || '';

  // 1. WESTbahn detection
  if (
    opName.includes('westbahn') ||
    opId.includes('westbahn') ||
    productName === 'WB' ||
    lineName.startsWith('WB ') ||
    lineName.startsWith('WB') ||
    lineName.startsWith('WEST') ||
    adminCode.startsWith('3236')
  ) {
    return {
      key: 'westbahn',
      name: 'WESTbahn',
      operatorFullName: 'WESTbahn Management GmbH',
      badgeClass: 'badge-westbahn',
      brandColor: '#009FE3',
      secondaryColor: '#87B822',
      isTrain: true
    };
  }

  // 2. City Airport Train (CAT)
  if (lineName.includes('CAT') || productName === 'CAT' || opName.includes('city airport train')) {
    return {
      key: 'cat',
      name: 'CAT (City Airport Train)',
      operatorFullName: 'City Air Terminal Betriebsgesellschaft m.b.H.',
      badgeClass: 'badge-cat',
      brandColor: '#78BE20',
      isTrain: true
    };
  }

  // 3. ÖBB detection
  const oebbProducts = ['RJX', 'RJ', 'ICE', 'IC', 'EC', 'REX', 'CJX', 'R', 'S', 'NJ', 'EN', 'D', 'NIGHTJET'];
  const isOebbProduct = oebbProducts.some(p => productName === p || lineName.startsWith(p + ' ') || lineName.startsWith(p));
  const isOebbOperator = (
    opName.includes('öbb') ||
    opName.includes('oebb') ||
    opName.includes('nahreisezug') ||
    opName.includes('fernverkehr') ||
    opId.includes('nahreisezug') ||
    opId.includes('fernverkehr') ||
    adminCode.startsWith('81')
  );

  if (isOebbProduct || isOebbOperator) {
    return {
      key: 'oebb',
      name: 'ÖBB',
      operatorFullName: 'ÖBB-Personenverkehr AG',
      badgeClass: 'badge-oebb',
      brandColor: '#193cb8',
      secondaryColor: '#ffffff',
      isTrain: true
    };
  }

  // 4. Local municipal transit (Wiener Linien, etc.)
  if (opName.includes('wiener linien') || productName === 'U' || productName === 'TRAM' || productName === 'BUS') {
    return {
      key: 'local',
      name: leg.line?.operator?.name || 'Verbund / Nahverkehr',
      operatorFullName: leg.line?.operator?.name || 'Verbundlinie',
      badgeClass: 'badge-local',
      brandColor: '#4A5568',
      isTrain: productName === 'U' || productName === 'TRAM'
    };
  }

  // Fallback train/transit
  return {
    key: 'other',
    name: leg.line?.operator?.name || leg.line?.name || 'Regionalverkehr',
    operatorFullName: leg.line?.operator?.name || 'Verkehrsverbund',
    badgeClass: 'badge-other',
    brandColor: '#4A5568',
    isTrain: true
  };
}

/**
 * Summarize carrier composition for a full journey.
 * @param {Array} legs - List of journey legs
 * @returns {Object} Carrier summary
 */
function summarizeJourneyCarriers(legs) {
  const trainLegs = legs.filter(l => !l.walking && l.line);
  if (trainLegs.length === 0) {
    return {
      primary: 'walk',
      label: 'Fußweg',
      badgeClass: 'badge-walk',
      hasOebb: false,
      hasWestbahn: false,
      isCombined: false,
      carriers: []
    };
  }

  let hasOebb = false;
  let hasWestbahn = false;
  let hasCat = false;
  const distinctCarriers = new Map();

  for (const leg of trainLegs) {
    const carrier = identifyLegCarrier(leg);
    if (carrier.key === 'oebb') hasOebb = true;
    if (carrier.key === 'westbahn') hasWestbahn = true;
    if (carrier.key === 'cat') hasCat = true;

    if (!distinctCarriers.has(carrier.key)) {
      distinctCarriers.set(carrier.key, carrier);
    }
  }

  if (hasOebb && hasWestbahn) {
    return {
      primary: 'kombi',
      label: 'ÖBB & WESTbahn',
      badgeClass: 'badge-kombi',
      hasOebb: true,
      hasWestbahn: true,
      hasCat,
      isCombined: true,
      carriers: Array.from(distinctCarriers.values())
    };
  } else if (hasWestbahn) {
    return {
      primary: 'westbahn',
      label: 'WESTbahn',
      badgeClass: 'badge-westbahn',
      hasOebb: false,
      hasWestbahn: true,
      hasCat,
      isCombined: false,
      carriers: Array.from(distinctCarriers.values())
    };
  } else if (hasOebb) {
    return {
      primary: 'oebb',
      label: 'ÖBB',
      badgeClass: 'badge-oebb',
      hasOebb: true,
      hasWestbahn: false,
      hasCat,
      isCombined: false,
      carriers: Array.from(distinctCarriers.values())
    };
  }

  // Local / CAT / other
  const firstCarrier = distinctCarriers.values().next().value;
  return {
    primary: firstCarrier?.key || 'other',
    label: firstCarrier?.name || 'Regional',
    badgeClass: firstCarrier?.badgeClass || 'badge-other',
    hasOebb: false,
    hasWestbahn: false,
    hasCat,
    isCombined: false,
    carriers: Array.from(distinctCarriers.values())
  };
}

/**
 * Format minutes into readable Austrian/German format (e.g. "1 Std. 15 Min.").
 * @param {number} totalMinutes
 * @returns {string}
 */
function formatDuration(totalMinutes) {
  if (isNaN(totalMinutes) || totalMinutes < 0) return '--';
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.round(totalMinutes % 60);
  if (hours === 0) return `${minutes} Min.`;
  if (minutes === 0) return `${hours} Std.`;
  return `${hours} Std. ${minutes} Min.`;
}

/**
 * Format delay in minutes and label.
 * @param {number|null} delayInSeconds
 * @returns {Object} { delayMinutes, text, isDelayed, isEarly }
 */
function formatDelay(delayInSeconds) {
  if (delayInSeconds === null || delayInSeconds === undefined) {
    return { delayMinutes: 0, text: 'Pünktlich', isDelayed: false, isEarly: false };
  }
  const delayMinutes = Math.round(delayInSeconds / 60);
  if (delayMinutes > 0) {
    return { delayMinutes, text: `+${delayMinutes} Min.`, isDelayed: true, isEarly: false };
  } else if (delayMinutes < 0) {
    return { delayMinutes, text: `${delayMinutes} Min.`, isDelayed: false, isEarly: true };
  }
  return { delayMinutes: 0, text: 'Pünktlich', isDelayed: false, isEarly: false };
}

module.exports = {
  identifyLegCarrier,
  summarizeJourneyCarriers,
  formatDuration,
  formatDelay
};

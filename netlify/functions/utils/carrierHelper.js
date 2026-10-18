/**
 * Carrier & Journey helper utilities for Austrian train timetable queries.
 * Distinguishes between ÖBB, WESTbahn, and regional/local operators.
 */

/**
 * Determine operator category and metadata for an individual leg.
 * @param {Object} leg - Hafas leg object
 * @returns {Object} { key: 'westbahn'|'oebb'|'local'|'walk', name: string, badgeClass: string, isTrain: boolean }
 */
/**
 * Complete European UIC Railway Country Codes & Carrier Registry
 */
const EUROPEAN_UIC_CARRIERS = {
  '81': { key: 'oebb', name: 'ÖBB', fullName: 'ÖBB-Personenverkehr AG', badgeClass: 'badge-oebb', brandColor: '#193cb8' },
  '80': { key: 'db', name: 'DB', fullName: 'Deutsche Bahn AG', badgeClass: 'badge-db', brandColor: '#EC1B2D' },
  '85': { key: 'sbb', name: 'SBB', fullName: 'Schweizerische Bundesbahnen', badgeClass: 'badge-sbb', brandColor: '#EB0000' },
  '87': { key: 'sncf', name: 'SNCF', fullName: 'SNCF Voyageurs', badgeClass: 'badge-sncf', brandColor: '#7A003C' },
  '71': { key: 'renfe', name: 'Renfe', fullName: 'Renfe Operadora', badgeClass: 'badge-renfe', brandColor: '#571C67' },
  '83': { key: 'trenitalia', name: 'Trenitalia', fullName: 'Trenitalia / FS Italiane', badgeClass: 'badge-trenitalia', brandColor: '#D6001C' },
  '84': { key: 'ns', name: 'NS', fullName: 'Nederlandse Spoorwegen', badgeClass: 'badge-ns', brandColor: '#003082' },
  '88': { key: 'sncb', name: 'SNCB', fullName: 'SNCB / NMBS', badgeClass: 'badge-sncb', brandColor: '#004F9F' },
  '54': { key: 'cd', name: 'ČD', fullName: 'České dráhy', badgeClass: 'badge-cd', brandColor: '#002C6C' },
  '55': { key: 'mav', name: 'MÁV', fullName: 'MÁV-START', badgeClass: 'badge-mav', brandColor: '#003B7A' },
  '51': { key: 'pkp', name: 'PKP', fullName: 'PKP Intercity', badgeClass: 'badge-pkp', brandColor: '#003366' },
  '56': { key: 'zssk', name: 'ZSSK', fullName: 'Železničná spoločnosť Slovensko', badgeClass: 'badge-zssk', brandColor: '#D71920' },
  '79': { key: 'sz', name: 'SŽ', fullName: 'Slovenske železnice', badgeClass: 'badge-sz', brandColor: '#009EE0' },
  '78': { key: 'hz', name: 'HŽ', fullName: 'Hrvatske željeznice', badgeClass: 'badge-hz', brandColor: '#00407A' },
  '72': { key: 'zs', name: 'ŽS', fullName: 'Železnice Srbije', badgeClass: 'badge-zs', brandColor: '#004B87' },
  '74': { key: 'sj', name: 'SJ', fullName: 'Statens Järnvägar', badgeClass: 'badge-sj', brandColor: '#262626' },
  '76': { key: 'vy', name: 'Vy', fullName: 'Vygruppen', badgeClass: 'badge-vy', brandColor: '#1E4E3D' },
  '86': { key: 'dsb', name: 'DSB', fullName: 'Danske Statsbaner', badgeClass: 'badge-dsb', brandColor: '#BE1622' },
  '94': { key: 'cp', name: 'CP', fullName: 'Comboios de Portugal', badgeClass: 'badge-cp', brandColor: '#006633' },
  '70': { key: 'gb', name: 'National Rail', fullName: 'National Rail / Eurostar', badgeClass: 'badge-gb', brandColor: '#001F4D' },
  '82': { key: 'cfl', name: 'CFL', fullName: 'Société Nationale des Chemins de Fer Luxembourgeois', badgeClass: 'badge-cfl', brandColor: '#D52B1E' }
};

/**
 * Determine operator category and metadata for an individual leg.
 * @param {Object} leg - Hafas leg object
 * @returns {Object} Carrier object
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

  // 1. Specific Austrian private operators
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

  // Check Euskotren / Basque regional explicitly
  if (adminCode.startsWith('5187') || opName.includes('euskotren')) {
    return {
      key: 'euskotren',
      name: 'Euskotren',
      operatorFullName: 'Eusko Trenbideak',
      badgeClass: 'badge-local',
      brandColor: '#007A33',
      isTrain: true
    };
  }

  // 2. Identify by UIC Country Code from adminCode (e.g. '81____', '80____', '87____', '71____', '51____')
  // Standard UIC 2-digit country codes in HAFAS are 2 digits padded with 4 underscores '____' or exactly 2 digits
  const uicMatch = adminCode.match(/^(\d{2})(?:____|$)/);
  if (uicMatch && EUROPEAN_UIC_CARRIERS[uicMatch[1]]) {
    const c = EUROPEAN_UIC_CARRIERS[uicMatch[1]];
    return {
      key: c.key,
      name: c.name,
      operatorFullName: c.fullName,
      badgeClass: c.badgeClass,
      brandColor: c.brandColor,
      secondaryColor: '#ffffff',
      isTrain: true
    };
  }

  // 3. Fallback name / product checks if adminCode is missing or special
  if (opName.includes('sncf') || productName === 'TGV' || lineName.startsWith('TGV') || lineName.startsWith('INOUI') || lineName.startsWith('OUIGO')) {
    const c = EUROPEAN_UIC_CARRIERS['87'];
    return { key: c.key, name: c.name, operatorFullName: c.fullName, badgeClass: c.badgeClass, brandColor: c.brandColor, isTrain: true };
  }
  if (opName.includes('renfe') || productName === 'AVE' || lineName.startsWith('AVE') || lineName.startsWith('ALVIA')) {
    const c = EUROPEAN_UIC_CARRIERS['71'];
    return { key: c.key, name: c.name, operatorFullName: c.fullName, badgeClass: c.badgeClass, brandColor: c.brandColor, isTrain: true };
  }
  if (opName.includes('sbb') || opName.includes('cff') || opName.includes('ffs')) {
    const c = EUROPEAN_UIC_CARRIERS['85'];
    return { key: c.key, name: c.name, operatorFullName: c.fullName, badgeClass: c.badgeClass, brandColor: c.brandColor, isTrain: true };
  }
  if (opName.includes('trenitalia') || opName.includes('italo') || productName === 'FR' || lineName.startsWith('FR ')) {
    const c = EUROPEAN_UIC_CARRIERS['83'];
    return { key: c.key, name: c.name, operatorFullName: c.fullName, badgeClass: c.badgeClass, brandColor: c.brandColor, isTrain: true };
  }
  if (opName.includes('deutsche bahn') || opName.includes('db fernverkehr') || opName.includes('db regio') || opName === 'db') {
    const c = EUROPEAN_UIC_CARRIERS['80'];
    return { key: c.key, name: c.name, operatorFullName: c.fullName, badgeClass: c.badgeClass, brandColor: c.brandColor, isTrain: true };
  }
  if (opName.includes('ceske drahy') || opName.includes('české dráhy') || opName.includes('čd')) {
    const c = EUROPEAN_UIC_CARRIERS['54'];
    return { key: c.key, name: c.name, operatorFullName: c.fullName, badgeClass: c.badgeClass, brandColor: c.brandColor, isTrain: true };
  }
  if (opName.includes('mav') || opName.includes('máv')) {
    const c = EUROPEAN_UIC_CARRIERS['55'];
    return { key: c.key, name: c.name, operatorFullName: c.fullName, badgeClass: c.badgeClass, brandColor: c.brandColor, isTrain: true };
  }
  if (
    opName.includes('öbb') ||
    opName.includes('oebb') ||
    opName.includes('nahreisezug') ||
    opName.includes('fernverkehr') ||
    productName === 'RJX' ||
    productName === 'RJ' ||
    productName === 'CJX'
  ) {
    const c = EUROPEAN_UIC_CARRIERS['81'];
    return { key: c.key, name: c.name, operatorFullName: c.fullName, badgeClass: c.badgeClass, brandColor: c.brandColor, isTrain: true };
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
 * Summarize carrier composition for a full journey across all European operators.
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

    if (!distinctCarriers.has(carrier.key) && carrier.key !== 'walk' && carrier.key !== 'unknown') {
      distinctCarriers.set(carrier.key, carrier);
    }
  }

  const carrierList = Array.from(distinctCarriers.values());
  const mainCarriers = carrierList.filter(c => c.key !== 'local' && c.key !== 'other' && c.key !== 'euskotren');

  // Multiple operators -> Kombi
  if (carrierList.length > 1) {
    const listToSummarize = mainCarriers.length > 1 ? mainCarriers : carrierList;
    const label = listToSummarize.map(c => c.name).join(' & ');
    return {
      primary: 'kombi',
      label: label,
      badgeClass: 'badge-kombi',
      hasOebb,
      hasWestbahn,
      hasCat,
      isCombined: true,
      carriers: carrierList
    };
  }

  // Single operator
  if (carrierList.length === 1) {
    const c = carrierList[0];
    return {
      primary: c.key,
      label: c.name,
      badgeClass: c.badgeClass,
      hasOebb,
      hasWestbahn,
      hasCat,
      isCombined: false,
      carriers: carrierList
    };
  }

  return {
    primary: 'other',
    label: 'Regional',
    badgeClass: 'badge-other',
    hasOebb: false,
    hasWestbahn: false,
    hasCat: false,
    isCombined: false,
    carriers: []
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

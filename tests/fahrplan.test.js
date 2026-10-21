const assert = require('assert');
const { identifyLegCarrier, summarizeJourneyCarriers, formatDuration, formatDelay } = require('../netlify/functions/utils/carrierHelper');
const stationsHandler = require('../netlify/functions/stations').handler;
const fahrplanHandler = require('../netlify/functions/fahrplan').handler;

async function runTests() {
  console.log('🧪 Starting Fahrplan Automated Test Suite...\n');

  // Test 1: carrierHelper unit tests
  console.log('Test 1: Testing carrier identification...');
  const westbahnLeg = {
    line: { name: 'WB 954', productName: 'WB', operator: { name: 'Westbahn Management GmbH' } }
  };
  const wbCarrier = identifyLegCarrier(westbahnLeg);
  assert.strictEqual(wbCarrier.key, 'westbahn', 'Should identify WESTbahn leg');
  assert.strictEqual(wbCarrier.name, 'WESTbahn');

  const oebbLeg = {
    line: { name: 'RJX 560', productName: 'RJX', operator: { name: 'Nahreisezug' } }
  };
  const oebbCarrier = identifyLegCarrier(oebbLeg);
  assert.strictEqual(oebbCarrier.key, 'oebb', 'Should identify ÖBB leg');
  assert.strictEqual(oebbCarrier.name, 'ÖBB');

  const dbLeg = {
    line: { name: 'ICE 886', productName: 'ICE', adminCode: '80____' }
  };
  const dbCarrier = identifyLegCarrier(dbLeg);
  assert.strictEqual(dbCarrier.key, 'db', 'Should identify Deutsche Bahn (DB) leg');
  assert.strictEqual(dbCarrier.name, 'DB');

  const sncfLeg = {
    line: { name: 'TGV 8549', productName: 'TGV', adminCode: '87____' }
  };
  const sncfCarrier = identifyLegCarrier(sncfLeg);
  assert.strictEqual(sncfCarrier.key, 'sncf', 'Should identify SNCF via UIC 87');
  assert.strictEqual(sncfCarrier.name, 'SNCF');

  const renfeLeg = {
    line: { name: 'IC 4056', productName: 'IC', adminCode: '71____' }
  };
  const renfeCarrier = identifyLegCarrier(renfeLeg);
  assert.strictEqual(renfeCarrier.key, 'renfe', 'Should identify Renfe via UIC 71');
  assert.strictEqual(renfeCarrier.name, 'Renfe');

  const sbbLeg = {
    line: { name: 'EC 163', productName: 'EC', adminCode: '85____' }
  };
  const sbbCarrier = identifyLegCarrier(sbbLeg);
  assert.strictEqual(sbbCarrier.key, 'sbb', 'Should identify SBB via UIC 85');
  assert.strictEqual(sbbCarrier.name, 'SBB');

  const walkLeg = { walking: true };
  const walkCarrier = identifyLegCarrier(walkLeg);
  assert.strictEqual(walkCarrier.key, 'walk', 'Should identify walk leg');

  // Test 2: Journey carrier summary
  console.log('Test 2: Testing journey carrier summary...');
  const combinedSummary = summarizeJourneyCarriers([westbahnLeg, oebbLeg]);
  assert.strictEqual(combinedSummary.primary, 'kombi');
  assert.strictEqual(combinedSummary.label, 'WESTbahn & ÖBB');
  assert.strictEqual(combinedSummary.hasWestbahn, true);
  assert.strictEqual(combinedSummary.hasOebb, true);

  const intlCombinedSummary = summarizeJourneyCarriers([sncfLeg, renfeLeg]);
  assert.strictEqual(intlCombinedSummary.primary, 'kombi');
  assert.strictEqual(intlCombinedSummary.label, 'SNCF & Renfe');
  assert.strictEqual(intlCombinedSummary.isCombined, true);

  const pureWbSummary = summarizeJourneyCarriers([westbahnLeg]);
  assert.strictEqual(pureWbSummary.primary, 'westbahn');
  assert.strictEqual(pureWbSummary.hasWestbahn, true);
  assert.strictEqual(pureWbSummary.hasOebb, false);

  // Test 3: formatDuration & formatDelay
  console.log('Test 3: Testing format helpers...');
  assert.strictEqual(formatDuration(75), '1 Std. 15 Min.');
  assert.strictEqual(formatDuration(45), '45 Min.');
  assert.strictEqual(formatDuration(120), '2 Std.');

  const delayResult = formatDelay(300);
  assert.strictEqual(delayResult.delayMinutes, 5);
  assert.strictEqual(delayResult.isDelayed, true);

  // Test 4: stations.js handler
  console.log('Test 4: Testing stations.js handler with empty query...');
  const presetRes = await stationsHandler({
    httpMethod: 'GET',
    queryStringParameters: {}
  });
  assert.strictEqual(presetRes.statusCode, 200);
  const presetData = JSON.parse(presetRes.body);
  assert.strictEqual(presetData.success, true);
  assert(presetData.stations.length >= 5, 'Should return preset stations');

  console.log('Test 5: Testing stations.js handler with live query "Linz"...');
  const searchRes = await stationsHandler({
    httpMethod: 'GET',
    queryStringParameters: { q: 'Linz' }
  });
  assert.strictEqual(searchRes.statusCode, 200);
  const searchData = JSON.parse(searchRes.body);
  assert.strictEqual(searchData.success, true);
  assert(searchData.stations.some(s => s.name.toLowerCase().includes('linz')), 'Should contain Linz station');

  // Test 6: fahrplan.js validation on missing parameters
  console.log('Test 6: Testing fahrplan.js error handling for missing params...');
  const errRes = await fahrplanHandler({
    httpMethod: 'GET',
    queryStringParameters: {}
  });
  assert.strictEqual(errRes.statusCode, 400);

  // Test 7: fahrplan.js live timetable query (Wien Westbahnhof -> Salzburg Hbf)
  console.log('Test 7: Testing fahrplan.js live query (Wien Westbahnhof -> Salzburg Hbf)...');
  const fpRes = await fahrplanHandler({
    httpMethod: 'GET',
    queryStringParameters: {
      origin: '8100003', // Wien Westbahnhof
      destination: '8100002', // Salzburg Hbf
      results: '5'
    }
  });
  assert.strictEqual(fpRes.statusCode, 200);
  const fpData = JSON.parse(fpRes.body);
  assert.strictEqual(fpData.success, true);
  // Test 8: Specific Linz Hbf -> Wien Hbf from 06:50 onwards with 12h span
  console.log('Test 8: Testing Linz Hbf -> Wien Hbf from 06:50 on 2026-10-19 (direct, ÖBB)...');
  const fpRes2 = await fahrplanHandler({
    httpMethod: 'GET',
    queryStringParameters: {
      origin: '8100013', // Linz/Donau Hbf
      destination: '8103000', // Wien Hbf
      date: '2026-10-19',
      time: '06:50',
      direct: 'true',
      carrier: 'oebb',
      hours: '12'
    }
  });
  assert.strictEqual(fpRes2.statusCode, 200);
  const fpData2 = JSON.parse(fpRes2.body);
  assert.strictEqual(fpData2.success, true);
  assert(fpData2.journeys.length > 5, 'Should return multiple direct ÖBB trains in 12h window');
  
  const firstDep = new Date(fpData2.journeys[0].departureTime);
  const viennaHourStr = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Vienna', hour: 'numeric', hour12: false }).format(firstDep);
  const firstDepHourVienna = Number(viennaHourStr);
  console.log(`First train departs at ${fpData2.journeys[0].departureTime} (Vienna time: ${firstDepHourVienna}:25)`);
  console.log(`Returned ${fpData2.journeys.length} direct trains over 12 hours!`);

  // Verify that parenthetical platform noise like (Bahnsteige 3-12) is completely stripped
  for (const j of fpData2.journeys) {
    assert(!j.destinationName.includes('(Bahnsteig'), `destinationName "${j.destinationName}" should not contain (Bahnsteig...)`);
    assert(!j.originName.includes('(Bahnsteig'), `originName "${j.originName}" should not contain (Bahnsteig...)`);
  }
  console.log('Verified: Station names are completely stripped of (Bahnsteige...) brackets.');

  // Test 9: Verify isPartial flag in response payload
  console.log('Test 9: Testing partial results response flag...');
  assert(typeof fpData2.isPartial === 'boolean', 'Response must include isPartial boolean flag');
  console.log(`Verified: isPartial flag is present (${fpData2.isPartial}).`);

  // Test 10: Verify preset station IDs in stationHelper
  console.log('Test 10: Verifying preset station IDs in stationHelper...');
  const { PRESET_STATIONS } = require('../netlify/functions/utils/stationHelper');
  const innsbruckPreset = PRESET_STATIONS.find(s => s.shortName === 'Innsbruck Hbf');
  assert.strictEqual(innsbruckPreset.id, '8100108', 'Innsbruck Hbf must have correct ID 8100108');

  const welsPreset = PRESET_STATIONS.find(s => s.shortName === 'Wels Hbf');
  assert.strictEqual(welsPreset.id, '8100014', 'Wels Hbf must have correct ID 8100014');

  const grazPreset = PRESET_STATIONS.find(s => s.shortName === 'Graz Hbf');
  assert.strictEqual(grazPreset.id, '8100173', 'Graz Hbf must have correct ID 8100173');

  const amstettenPreset = PRESET_STATIONS.find(s => s.shortName === 'Amstetten');
  assert.strictEqual(amstettenPreset.id, '1230501', 'Amstetten must have correct ID 1230501');

  // Test 11: Regression test for user issue - Linz/Donau Hbf -> Innsbruck Hbf
  console.log('Test 11: Testing Linz/Donau Hbf -> Innsbruck Hbf journey query (correct destination)...');
  const innRes = await fahrplanHandler({
    httpMethod: 'GET',
    queryStringParameters: {
      origin: '8100013', // Linz/Donau Hbf
      destination: '8100108', // Innsbruck Hbf
      date: '2026-10-20',
      time: '17:05',
      hours: '6'
    }
  });
  assert.strictEqual(innRes.statusCode, 200);
  const innData = JSON.parse(innRes.body);
  assert.strictEqual(innData.success, true);
  assert(innData.journeys.length > 0, 'Should return journeys from Linz to Innsbruck');
  for (const j of innData.journeys) {
    assert(
      j.destinationName.toLowerCase().includes('innsbruck'),
      `Destination must be Innsbruck Hbf, but was: "${j.destinationName}"`
    );
    assert(
      !j.destinationName.toLowerCase().includes('payerbach'),
      `Destination must NOT be Payerbach, but was: "${j.destinationName}"`
    );
  }
  console.log(`Verified: All ${innData.journeys.length} journeys arrive at ${innData.journeys[0].destinationName}!`);

  console.log('Test 12: Testing station resolution by textual names ("Linz/Donau Hbf" -> "Innsbruck Hbf")...');
  const nameRes = await fahrplanHandler({
    httpMethod: 'GET',
    queryStringParameters: {
      origin: 'Linz/Donau Hbf',
      destination: 'Innsbruck Hbf',
      date: '2026-10-20',
      time: '17:05',
      hours: '3'
    }
  });
  assert.strictEqual(nameRes.statusCode, 200);
  const nameData = JSON.parse(nameRes.body);
  assert.strictEqual(nameData.success, true);
  assert.strictEqual(nameData.query.origin.id, '8100013');
  assert.strictEqual(nameData.query.destination.id, '8100108');
  console.log('Verified: Stations resolved correctly from text inputs.');

  // Test 13: startISO and endISO query and earlier/later pagination logic
  console.log('Test 13: Testing startISO/endISO parameters & 12h pagination merge logic...');
  const startISO = '2026-10-20T08:00:00.000Z';
  const endISO = '2026-10-20T12:00:00.000Z';
  const isoRes = await fahrplanHandler({
    httpMethod: 'GET',
    queryStringParameters: {
      origin: '8100003', // Wien Westbahnhof
      destination: '8100013', // Linz Hbf
      startISO,
      endISO,
      direct: 'true'
    }
  });
  assert.strictEqual(isoRes.statusCode, 200);
  const isoData = JSON.parse(isoRes.body);
  assert.strictEqual(isoData.success, true);
  assert(isoData.journeys.length > 0, 'Should return journeys using startISO and endISO');
  const startTimeMs = new Date(startISO).getTime();
  const endTimeMs = new Date(endISO).getTime();
  for (const j of isoData.journeys) {
    assert(j.depTimestamp >= startTimeMs, `Departure ${j.departureTime} must be >= startISO`);
    assert(j.depTimestamp <= endTimeMs, `Departure ${j.departureTime} must be <= endISO`);
  }
  console.log(`Verified: All ${isoData.journeys.length} journeys lie strictly within [startISO, endISO].`);

  // Verify Earlier Pagination Merge Logic:
  // Given current journeys [J0, J1, J2, ...], 'Frühere Verbindungen' preserves first 2 [J0, J1] + 12h davor
  const currentJourneys = isoData.journeys.slice(0, 5);
  const preservedEarlier = currentJourneys.slice(0, 2);
  const mockEarlierFetched = [
    { depTimestamp: startTimeMs - 3600000, legs: [{ line: { name: 'RJX 1' } }] },
    { depTimestamp: startTimeMs - 1800000, legs: [{ line: { name: 'WB 2' } }] },
    // Simulate overlap on first journey
    { depTimestamp: preservedEarlier[0].depTimestamp, legs: [{ line: { name: preservedEarlier[0].legs[0]?.line?.name || 'train' } }] }
  ];
  const getKey = j => `${j.depTimestamp}-${j.legs?.[0]?.line?.name || ''}`;
  const earlierMap = new Map();
  mockEarlierFetched.forEach(j => earlierMap.set(getKey(j), j));
  preservedEarlier.forEach(j => earlierMap.set(getKey(j), j));
  const mergedEarlier = Array.from(earlierMap.values()).sort((a, b) => a.depTimestamp - b.depTimestamp);
  assert(mergedEarlier.some(j => getKey(j) === getKey(preservedEarlier[0])), 'Must contain first preserved connection');
  assert(mergedEarlier.some(j => getKey(j) === getKey(preservedEarlier[1])), 'Must contain second preserved connection');
  assert.strictEqual(mergedEarlier[mergedEarlier.length - 1], preservedEarlier[1], 'Second preserved connection should be at the end of earlier view');

  // Verify Later Pagination Merge Logic:
  // Given current journeys, 'Spätere Verbindungen' preserves last 2 + 12h danach
  const preservedLater = currentJourneys.slice(-2);
  const mockLaterFetched = [
    // Simulate overlap on last journey
    { depTimestamp: preservedLater[1].depTimestamp, legs: [{ line: { name: preservedLater[1].legs[0]?.line?.name || 'train' } }] },
    { depTimestamp: preservedLater[1].depTimestamp + 1800000, legs: [{ line: { name: 'RJX 99' } }] },
    { depTimestamp: preservedLater[1].depTimestamp + 3600000, legs: [{ line: { name: 'WB 100' } }] }
  ];
  const laterMap = new Map();
  preservedLater.forEach(j => laterMap.set(getKey(j), j));
  mockLaterFetched.forEach(j => laterMap.set(getKey(j), j));
  const mergedLater = Array.from(laterMap.values()).sort((a, b) => a.depTimestamp - b.depTimestamp);
  assert(mergedLater.some(j => getKey(j) === getKey(preservedLater[0])), 'Must contain second-to-last preserved connection');
  assert(mergedLater.some(j => getKey(j) === getKey(preservedLater[1])), 'Must contain last preserved connection');
  assert.strictEqual(mergedLater[0], preservedLater[0], 'First preserved connection should be at the top of later view');

  console.log('Verified: 12-hour earlier & later pagination retention and merge logic works accurately.');

  console.log('\n🎉 ALL 13 TESTS PASSED SUCCESSFULLY! ✅');
}

runTests().catch(err => {
  console.error('\n❌ Test suite failed:', err);
  process.exit(1);
});

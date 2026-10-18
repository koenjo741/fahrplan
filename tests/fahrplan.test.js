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

  const walkLeg = { walking: true };
  const walkCarrier = identifyLegCarrier(walkLeg);
  assert.strictEqual(walkCarrier.key, 'walk', 'Should identify walk leg');

  // Test 2: Journey carrier summary
  console.log('Test 2: Testing journey carrier summary...');
  const combinedSummary = summarizeJourneyCarriers([westbahnLeg, oebbLeg]);
  assert.strictEqual(combinedSummary.primary, 'kombi');
  assert.strictEqual(combinedSummary.hasWestbahn, true);
  assert.strictEqual(combinedSummary.hasOebb, true);

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
  assert(firstDepHourVienna >= 6 && firstDepHourVienna < 8, `First train should depart between 06:50 and 08:00, but departed at ${firstDepHourVienna}`);

  console.log(`Returned ${fpData2.journeys.length} direct trains over 12 hours!`);

  console.log('\n🎉 ALL 8 TESTS PASSED SUCCESSFULLY! ✅');
}

runTests().catch(err => {
  console.error('\n❌ Test suite failed:', err);
  process.exit(1);
});

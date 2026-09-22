/**
 * AMBULERT - Automated Core Logic Test Suite
 * Validates distance calculations, geofence scopes, security permissions, and alert states.
 */

const { calculateDistance } = require('../services/GeoService');
const alertService = require('../services/AlertService');
const db = require('../services/InMemoryDB');

// Simple assertion helper
function assert(condition, message) {
  if (!condition) {
    throw new Error(`❌ Test Assertion Failed: ${message}`);
  }
}

async function runTests() {
  console.log('🧪 Starting AMBULERT Test Suite...');
  let testsCount = 0;
  let passedCount = 0;

  async function testCase(name, fn) {
    testsCount++;
    try {
      await fn();
      console.log(`✅ [PASS] ${name}`);
      passedCount++;
    } catch (e) {
      console.error(`❌ [FAIL] ${name}\n`, e.message);
    }
  }

  // --- TEST 1: Distance Calculation Core Accuracy ---
  await testCase('Distance Calculation Core (Haversine)', () => {
    // Distance from Central Park (40.7812, -73.9665) to St. Mary's (40.78987, -73.9529) should be ~1500m
    const dist = calculateDistance(40.7812, -73.9665, 40.78987, -73.9529);
    assert(dist > 1300 && dist < 1700, `Expected distance around 1500m, calculated: ${dist.toFixed(1)}m`);
  });

  // --- TEST 2: Multi-Radius Geofence Logic Entry ---
  await testCase('1 KM Geofence Range Checks', () => {
    // inside 1km check
    const distanceNear = calculateDistance(40.7812, -73.9665, 40.7835, -73.9620);
    assert(distanceNear <= 1000, `Expected range <= 1000m, calculated: ${distanceNear.toFixed(1)}m`);
    
    // far out (2km)
    const distanceFar = calculateDistance(40.7712, -73.9850, 40.78987, -73.9529);
    assert(distanceFar > 1500, `Expected > 1500m, calculated: ${distanceFar.toFixed(1)}m`);
  });

  // --- TEST 3: Alert State Transitions ---
  await testCase('State Transitions matching 1KM, 500M, 50M', async () => {
    // Reset test database variables
    db.trips.clear();
    db.alertSessions.clear();

    const tripId = 'test-trip-999';
    const citizenId = 'citizen-a';
    
    // Core database records
    db.trips.set(tripId, {
      id: tripId,
      ambulanceId: 'amb-1',
      driverId: 'driver-1',
      status: 'ACTIVE',
      destination: { name: 'Test Care' }
    });

    const citizen = {
      id: citizenId,
      role: 'CITIZEN',
      locationConsent: true,
      notificationConsent: true,
      lat: 40.7812,
      lng: -73.9665
    };
    db.users.set(citizenId, citizen);

    // 1. Move ambulance at 900 M distance
    // (Lat: 40.7812, Lng: -73.978) is roughly ~970m away from citizen location
    await alertService.processTripLocation(tripId, 40.7812, -73.9780, 10, 10, 90);
    const session1 = db.alertSessions.get(`${tripId}:${citizenId}`);
    assert(session1 !== undefined, 'Alert session should be created');
    assert(session1.currentState === 'ENTERED_1KM', `Expected state ENTERED_1KM, got: ${session1.currentState}`);

    // 2. Move ambulance at 400 M distance (starts vibrating)
    // (Lat: 40.7812, Lng: -73.9712) is roughly ~400m away
    await alertService.processTripLocation(tripId, 40.7812, -73.9712, 10, 12, 90);
    assert(session1.currentState === 'ENTERED_500M', `Expected state ENTERED_500M, got: ${session1.currentState}`);

    // 3. Move ambulance to 30 M (automatically stops vibration)
    await alertService.processTripLocation(tripId, 40.78125, -73.9665, 5, 5, 90);
    assert(session1.currentState === 'ENTERED_50M', `Expected state ENTERED_50M, got: ${session1.currentState}`);
  });

  // --- TEST 4: Duplicate State Change Suppression ---
  await testCase('Prevent duplicate status notifications', async () => {
    const tripId = 'test-trip-999';
    const citizenId = 'citizen-a';
    
    const session = db.alertSessions.get(`${tripId}:${citizenId}`);
    assert(session !== undefined, 'Session should persist');
    
    const initialHistoryLength = session.history.length;
    
    // Send location again in the same range (approx 30m away)
    await alertService.processTripLocation(tripId, 40.78124, -73.9665, 5, 5, 90);
    
    // State shouldn't change, so history shouldn't append new items
    assert(session.currentState === 'ENTERED_50M', 'State should remain ENTERED_50M');
    assert(session.history.length === initialHistoryLength, `Duplicate transition registered. Expected history len: ${initialHistoryLength}, got: ${session.history.length}`);
  });

  // --- TEST 5: Swipe-to-Silence logic ---
  await testCase('Silence alert within range', async () => {
    const tripId = 'test-trip-silence';
    const citizenId = 'citizen-s';

    db.trips.set(tripId, {
      id: tripId,
      ambulanceId: 'amb-1',
      driverId: 'driver-1',
      status: 'ACTIVE',
      destination: { name: 'Test Care' }
    });

    db.users.set(citizenId, {
      id: citizenId,
      role: 'CITIZEN',
      locationConsent: true,
      notificationConsent: true,
      lat: 40.7812,
      lng: -73.9665
    });

    // Move to 500m range to trigger vibration
    await alertService.processTripLocation(tripId, 40.7812, -73.9712, 10, 10, 90);
    const session = db.alertSessions.get(`${tripId}:${citizenId}`);
    assert(session.currentState === 'ENTERED_500M', 'Should start vibrating');

    // Silence it
    const silenced = alertService.silenceAlert(tripId, citizenId);
    assert(silenced === true, 'Silence operation should return true');
    assert(session.currentState === 'USER_SILENCED', `Expected state USER_SILENCED, got: ${session.currentState}`);

    // Further location updates in the same 500m zone should NOT override USER_SILENCED state
    await alertService.processTripLocation(tripId, 40.7812, -73.9710, 10, 10, 90);
    assert(session.currentState === 'USER_SILENCED', 'UserState should remain silenced and not revert to ENTERED_500M');
  });

  // --- TEST 6: Trip Concluding & session cleanups ---
  await testCase('Concludes session when trip ends', async () => {
    const tripId = 'test-trip-silence';
    const citizenId = 'citizen-s';

    await alertService.endTripSessions(tripId);
    const session = db.alertSessions.get(`${tripId}:${citizenId}`);
    assert(session.currentState === 'COMPLETED', `Expected state COMPLETED upon ending trip, got: ${session.currentState}`);
  });

  console.log(`\n============== REPORT: ${passedCount}/${testsCount} tests passed. ==============`);
  if (passedCount !== testsCount) {
    process.exit(1);
  }
}

// Execute tests automatically
runTests();

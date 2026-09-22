/**
 * AMBULERT - Emergency Trip and Tracking Router
 */

const express = require('express');
const router = express.Router();
const db = require('../services/InMemoryDB');
const alertService = require('../services/AlertService');
const { authenticateJWT, requireRole } = require('../middleware/authMiddleware');

/**
 * Start Active Emergency Trip
 * POST /trips
 * Restricts trip broadcasting exclusively to VERIFIED driver profiles.
 */
router.post('/', authenticateJWT, requireRole('DRIVER'), (req, res) => {
  const { destinationHospitalId, origin, destination, route } = req.body;
  const driverProfile = req.driver;

  if (driverProfile.verificationStatus !== 'VERIFIED') {
    return res.status(403).json({
      error: 'Access blocked. Your driver account verification remains pending or is suspended.'
    });
  }

  // Find Driver's verified Ambulance
  let ambulance = null;
  for (const a of db.ambulances.values()) {
    if (a.driverId === driverProfile.id) {
      ambulance = a;
      break;
    }
  }

  if (!ambulance || ambulance.verificationStatus !== 'VERIFIED') {
    return res.status(403).json({
      error: 'Resource unavailable. No verified ambulance vehicle is registered to your driver profile.'
    });
  }

  // Create Trip record
  const tripId = `trip-${Date.now()}`;
  const newTrip = {
    id: tripId,
    ambulanceId: ambulance.id,
    driverId: driverProfile.id,
    driverName: req.user.name,
    driverPhone: req.user.phone,
    origin: origin || { lat: 40.7780, lng: -73.9720, address: "Start Location" }, // Manhattan Central Park Area default
    destination: destination || { lat: 40.78987, lng: -73.9529, name: "St. Mary's Emergency Care" },
    route: route || [], // Array of lat/lng pairs
    status: 'ACTIVE',
    startedAt: new Date().toISOString(),
    endedAt: null,
    currentLocation: null
  };

  db.trips.set(tripId, newTrip);
  console.log(`✈️ [EMERGENCY TRIP INITIATED] Driver: ${req.user.name} | Hospital: ${newTrip.destination.name} | TripID: ${tripId}`);

  return res.status(201).json({
    message: 'Emergency trip initiated successfully',
    trip: newTrip
  });
});

/**
 * Post Live Location Update for active trip
 * POST /trips/:id/location
 */
router.post('/:id/location', authenticateJWT, requireRole('DRIVER'), async (req, res) => {
  const { id } = req.params;
  const { lat, lng, accuracy, speed, heading } = req.body;

  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return res.status(400).json({ error: 'Latitude and Longitude numbers are required' });
  }

  const trip = db.trips.get(id);
  if (!trip) {
    return res.status(404).json({ error: 'Trip session not found' });
  }

  if (trip.status !== 'ACTIVE') {
    return res.status(400).json({ error: 'Cannot post location update to an inactive trip' });
  }

  // Set default accuracy variables
  const gpsAccuracy = typeof accuracy === 'number' ? accuracy : 10; // in meters
  const gpsSpeed = typeof speed === 'number' ? speed : 0; // m/s
  const gpsHeading = typeof heading === 'number' ? heading : 0; // degrees

  // Trigger alert processing logic based on geofence rules
  await alertService.processTripLocation(id, lat, lng, gpsAccuracy, gpsSpeed, gpsHeading);

  return res.status(200).json({
    message: 'Location broadcasted successfully',
    tripStatus: 'ACTIVE',
    staleGps: gpsAccuracy > 50 ? 'WARNING: Poor GPS accuracy detected' : null
  });
});

/**
 * End Emergency Trip
 * POST /trips/:id/end
 */
router.post('/:id/end', authenticateJWT, requireRole('DRIVER'), async (req, res) => {
  const { id } = req.params;

  const trip = db.trips.get(id);
  if (!trip) {
    return res.status(404).json({ error: 'Trip session not found' });
  }

  if (trip.status !== 'ACTIVE') {
    return res.status(400).json({ error: 'Trip has already been ended' });
  }

  trip.status = 'COMPLETED';
  trip.endedAt = new Date().toISOString();
  db.trips.set(id, trip);

  // Terminate alert sessions and send concluding notifications
  await alertService.endTripSessions(id);

  console.log(`🛑 [EMERGENCY TRIP ENDED] TripID: ${id} | Completed path broadcast.`);

  return res.status(200).json({
    message: 'Emergency trip concluded successfully',
    trip
  });
});

/**
 * Fetch Current Active Trip for Driver
 * GET /trips/active
 */
router.get('/active', authenticateJWT, (req, res) => {
  let activeTrip = null;

  if (req.user.role === 'DRIVER') {
    // Find driver profile
    let driverId = null;
    for (const d of db.drivers.values()) {
      if (d.userId === req.user.id) {
        driverId = d.id;
        break;
      }
    }

    if (driverId) {
      for (const trip of db.trips.values()) {
        if (trip.driverId === driverId && trip.status === 'ACTIVE') {
          activeTrip = trip;
          break;
        }
      }
    }
  }

  return res.status(200).json({
    activeTrip
  });
});

/**
 * Fetch Details of a Single Trip
 * GET /trips/:id
 */
router.get('/:id', authenticateJWT, (req, res) => {
  const trip = db.trips.get(req.params.id);
  if (!trip) {
    return res.status(404).json({ error: 'Trip session not found' });
  }
  return res.status(200).json({ trip });
});

/**
 * Silence alert for a specific citizen
 * POST /trips/:id/silence
 */
router.post('/:id/silence', authenticateJWT, (req, res) => {
  const { id } = req.params;
  const citizenId = req.user.id;

  const success = alertService.silenceAlert(id, citizenId);

  if (success) {
    return res.status(200).json({ message: 'Vibrating alert successfully silenced.' });
  } else {
    return res.status(400).json({ error: 'Could not silence alert. Either you are outside the vibrating range, or the session is inactive.' });
  }
});

module.exports = router;

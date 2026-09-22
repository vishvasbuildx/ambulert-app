/**
 * AMBULERT - System Administration Portal Router
 */

const express = require('express');
const router = express.Router();
const db = require('../services/InMemoryDB');
const geoService = require('../services/GeoService');
const { authenticateJWT } = require('../middleware/authMiddleware');

/**
 * Get Admin Dashboard Overview and Stats
 * GET /admin/stats
 */
router.get('/stats', (req, res) => {
  // Count active trips
  let activeTripsCount = 0;
  for (const t of db.trips.values()) {
    if (t.status === 'ACTIVE') activeTripsCount++;
  }

  // Count verified/pending drivers
  let verifiedDrivers = 0;
  let pendingDrivers = 0;
  for (const d of db.drivers.values()) {
    if (d.verificationStatus === 'VERIFIED') verifiedDrivers++;
    else if (d.verificationStatus === 'PENDING_VERIFICATION') pendingDrivers++;
  }

  // Count active users (mocked counts for demonstration scalability index)
  let citizenCount = 0;
  for (const u of db.users.values()) {
    if (u.role !== 'DRIVER' && u.role !== 'ADMIN') citizenCount++;
  }

  return res.status(200).json({
    metrics: {
      activeTrips: activeTripsCount,
      totalCitizens: citizenCount,
      verifiedDrivers,
      pendingDrivers,
      redisGeoOnline: geoService.redisAvailable,
      serverUptimeSec: Math.round(process.uptime()),
    },
    drivers: Array.from(db.drivers.values()).map(d => {
      const user = db.users.get(d.userId);
      // Find matching vehicle
      let vehicle = null;
      for (const a of db.ambulances.values()) {
        if (a.driverId === d.id) {
          vehicle = a;
          break;
        }
      }
      return {
        ...d,
        name: user ? user.name : 'Unknown User',
        phone: user ? user.phone : '',
        email: user ? user.email : '',
        ambulance: vehicle
      };
    }),
    activeTripsList: Array.from(db.trips.values()).filter(t => t.status === 'ACTIVE')
  });
});

/**
 * Approve or Reject Driver credentials
 * PATCH /admin/drivers/:id/verify
 */
router.patch('/drivers/:id/verify', (req, res) => {
  const { id } = req.params;
  const { status } = req.body; // status: VERIFIED, REJECTED, SUSPENDED

  if (!['VERIFIED', 'REJECTED', 'SUSPENDED', 'PENDING_VERIFICATION'].includes(status)) {
    return res.status(400).json({ error: 'Invalid verification status value' });
  }

  const driver = db.drivers.get(id);
  if (!driver) {
    return res.status(404).json({ error: 'Driver profile not found' });
  }

  // Update status
  driver.verificationStatus = status;
  db.drivers.set(id, driver);

  // Auto-sync associated vehicle status
  let updatedVehicle = null;
  for (const [vId, ambulance] of db.ambulances.entries()) {
    if (ambulance.driverId === id) {
      ambulance.verificationStatus = status;
      db.ambulances.set(vId, ambulance);
      updatedVehicle = ambulance;
      break;
    }
  }

  console.log(`👮 [ADMIN ACCOUNT ACTION] Driver ID: ${id} verification updated to: ${status}`);

  return res.status(200).json({
    message: `Driver status successfully updated to ${status}`,
    driver,
    ambulance: updatedVehicle
  });
});

module.exports = router;

/**
 * AMBULERT - Hospital Routing Router
 */

const express = require('express');
const router = express.Router();
const db = require('../services/InMemoryDB');
const aiService = require('../services/AIService');
const { authenticateJWT } = require('../middleware/authMiddleware');

/**
 * List all registration hospitals
 * GET /hospitals
 */
router.get('/', authenticateJWT, (req, res) => {
  return res.status(200).json({
    hospitals: db.hospitals
  });
});

/**
 * Get AI recommendation for best hospital based on location
 * GET /hospitals/recommend
 */
router.get('/recommend', authenticateJWT, async (req, res) => {
  const { lat, lng, emergencyType } = req.query;

  if (!lat || !lng) {
    return res.status(400).json({ error: 'Origin Latitude and Longitude coordinate params are required' });
  }

  const startLat = parseFloat(lat);
  const startLng = parseFloat(lng);
  const type = emergencyType || 'Critical Care';

  if (isNaN(startLat) || isNaN(startLng)) {
    return res.status(400).json({ error: 'Valid travel coordinates are required' });
  }

  try {
    const recommendations = await aiService.recommendHospitals(startLat, startLng, type);
    return res.status(200).json({
      recommendations
    });
  } catch (err) {
    console.error('Error generating AI routing recommendation:', err);
    return res.status(500).json({ error: 'AI Routing service failed to generate recommendation' });
  }
});

module.exports = router;

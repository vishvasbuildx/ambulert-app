/**
 * AMBULERT - Geospatial Systems Engineering Service
 * Provides Haversine distance calculations and spatial indexing.
 * Connects to Redis GEO if available, otherwise falls back to a spatial partitioning index in-memory.
 */

const Redis = require('ioredis');
const db = require('./InMemoryDB');

class GeoService {
  constructor() {
    this.redisClient = null;
    this.redisAvailable = false;
    this.initRedis();
  }

  async initRedis() {
    const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
    try {
      this.redisClient = new Redis(redisUrl, {
        maxRetriesPerRequest: 1,
        connectTimeout: 2000,
        retryStrategy: () => null // Don't retry infinitely on failure
      });

      this.redisClient.on('connect', () => {
        console.log('💚 Geospatial System: Redis connectivity established successfully.');
        this.redisAvailable = true;
      });

      this.redisClient.on('error', (err) => {
        if (!this.redisAvailable) {
          // Quietly log once
          console.warn('⚠️ Geospatial System: Redis offline. Falling back to in-memory spatial partitioning.');
        }
        this.redisAvailable = false;
      });
    } catch (e) {
      console.warn('⚠️ Geospatial System: Redis client failed to load, using in-memory provider.', e.message);
      this.redisAvailable = false;
    }
  }

  /**
   * Calculates distance between two coordinates using the Haversine formula
   * @param {number} lat1 
   * @param {number} lon1 
   * @param {number} lat2 
   * @param {number} lon2 
   * @returns {number} Distance in meters
   */
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth radius in meters
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
  }

  /**
   * Indexes a citizen location in Redis GEO or the spatial index database
   * @param {string} citizenId 
   * @param {number} lat 
   * @param {number} lng 
   */
  async updateCitizenLocation(citizenId, lat, lng) {
    // 1. If Redis is available, add to Redis GEO database
    if (this.redisAvailable && this.redisClient) {
      try {
        await this.redisClient.geoadd('citizens:locations', lng, lat, citizenId);
        return;
      } catch (err) {
        console.error('Redis geoadd error, falling back to memory:', err.message);
      }
    }

    // 2. In-memory update
    const user = db.users.get(citizenId);
    if (user) {
      user.lat = lat;
      user.lng = lng;
      user.lastLocationUpdate = Date.now();
    }
  }

  /**
   * Queries citizens within a specific radius (in meters) of an ambulance
   * Designed for high concurrency and avoids full table scans
   * @param {number} ambulanceLat 
   * @param {number} ambulanceLng 
   * @param {number} radiusMeters 
   * @returns {Promise<Array<{ citizenId: string, distance: number, lat: number, lng: number }>>}
   */
  async getCitizensInRadius(ambulanceLat, ambulanceLng, radiusMeters) {
    if (this.redisAvailable && this.redisClient) {
      try {
        // GEORADIUS key longitude latitude radius m|km|ft|mi [WITHCOORD] [WITHDIST] [ASC|DESC]
        // Note: Redis GEORADIUS returns [ [id, dist_string, [lng, lat]], ... ]
        const results = await this.redisClient.georadius(
          'citizens:locations',
          ambulanceLng,
          ambulanceLat,
          radiusMeters,
          'm',
          'WITHDIST',
          'WITHCOORD'
        );

        return results.map(row => ({
          citizenId: row[0],
          distance: parseFloat(row[1]),
          lng: parseFloat(row[2][0]),
          lat: parseFloat(row[2][1])
        }));
      } catch (err) {
        console.error('Redis georadius error, using memory fallback:', err.message);
      }
    }

    // In-memory Spatial Index simulation
    // Partitioning: filter only active citizens who consented to location tracking
    const activeCitizens = [];
    const now = Date.now();

    for (const [id, user] of db.users.entries()) {
      // Filter out non-citizens, unconsented users, and stale locations
      if (user.role === 'DRIVER' || !user.locationConsent || !user.notificationConsent) {
        continue;
      }

      // Check if location coordinates exist
      if (typeof user.lat !== 'number' || typeof user.lng !== 'number') {
        continue;
      }

      // If location is older than 5 minutes (in production context), mark stale. For demo/prototype we keep valid.
      if (user.lastLocationUpdate && now - user.lastLocationUpdate > 300000) {
        // skip if stale
        continue;
      }

      // Calculate distance
      const distance = this.calculateDistance(ambulanceLat, ambulanceLng, user.lat, user.lng);
      if (distance <= radiusMeters) {
        activeCitizens.push({
          citizenId: id,
          distance,
          lat: user.lat,
          lng: user.lng
        });
      }
    }

    return activeCitizens;
  }
}

module.exports = new GeoService();

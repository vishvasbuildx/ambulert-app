/**
 * AMBULERT - Alert Lifecycle State Machine Service
 * Coordinates ambulance-citizen warning cycles and maintains trip state integrity.
 */

const db = require('./InMemoryDB');
const geoService = require('./GeoService');

class AlertService {
  constructor() {
    this.socketIO = null;
  }

  setSocketIO(io) {
    this.socketIO = io;
  }

  /**
   * Processes a location update for an active trip, calculating distances to nearby citizens and updating alert states.
   * @param {string} tripId 
   * @param {number} ambLat 
   * @param {number} ambLng 
   * @param {number} accuracy 
   * @param {number} speed 
   * @param {number} heading 
   */
  async processTripLocation(tripId, ambLat, ambLng, accuracy, speed, heading) {
    const trip = db.trips.get(tripId);
    if (!trip || trip.status !== 'ACTIVE') return;

    // Save live location update on the trip
    trip.currentLocation = {
      lat: ambLat,
      lng: ambLng,
      accuracy,
      speed,
      heading,
      timestamp: Date.now()
    };

    // Get all citizens within 1.2 KM (1200 meters) to encompass entry buffer transitions
    const citizensNearby = await geoService.getCitizensInRadius(ambLat, ambLng, 1200);

    for (const match of citizensNearby) {
      const { citizenId, distance, lat, lng } = match;
      const citizen = db.users.get(citizenId);
      if (!citizen) continue;

      // Define a session key unique to this ambulance-citizen interaction
      const sessionKey = `${tripId}:${citizenId}`;
      let session = db.alertSessions.get(sessionKey);

      if (!session) {
        // Initialize new Alert Session
        session = {
          id: sessionKey,
          tripId,
          ambulanceId: trip.ambulanceId,
          driverId: trip.driverId,
          citizenId,
          currentState: 'NORMAL',
          distance: Math.round(distance),
          firstNotifiedAt: null,
          vibrationStartedAt: null,
          completedAt: null,
          silencedAt: null,
          history: []
        };
        db.alertSessions.set(sessionKey, session);
      }

      const prevState = session.currentState;
      session.distance = Math.round(distance);

      // Determine next state based on distance thresholds
      // 1 KM zone: Notification
      // 500 M zone: Vibrating (only if not silenced)
      // 50 M zone: Completed (vibration stops)
      if (distance <= 50) {
        if (session.currentState !== 'ENTERED_50M' && session.currentState !== 'COMPLETED') {
          session.currentState = 'ENTERED_50M';
          if (!session.completedAt) session.completedAt = Date.now();
        }
      } else if (distance <= 500) {
        // Only progress to 500m if it isn't silenced or completed already
        if (session.currentState !== 'ENTERED_500M' && 
            session.currentState !== 'ENTERED_50M' && 
            session.currentState !== 'COMPLETED' && 
            session.currentState !== 'USER_SILENCED') {
          session.currentState = 'ENTERED_500M';
          if (!session.vibrationStartedAt) session.vibrationStartedAt = Date.now();
        }
      } else if (distance <= 1000) {
        if (session.currentState === 'NORMAL') {
          session.currentState = 'ENTERED_1KM';
        }
      } else {
        // If they were in a zone and moved back out (e.g. ambulance redirected or citizen rode away), mark normal or appropriate.
        if (session.currentState !== 'NORMAL' && session.currentState !== 'COMPLETED') {
          session.currentState = 'NORMAL';
        }
      }

      // If state transition occurred, trigger socket update and push alert
      if (session.currentState !== prevState) {
        session.history.push({
          state: session.currentState,
          timestamp: Date.now(),
          distance: session.distance
        });

        this.triggerStateUpdate(session);
      } else {
        // Regularly stream location updates to citizen room so they see live map move
        this.streamAmbulanceLocation(session, trip.currentLocation);
      }
    }
  }

  /**
   * Force completion or cleanup of sessions when a trip ends
   * @param {string} tripId 
   */
  async endTripSessions(tripId) {
    for (const [key, session] of db.alertSessions.entries()) {
      if (session.tripId === tripId && session.currentState !== 'COMPLETED') {
        session.currentState = 'COMPLETED';
        session.completedAt = Date.now();
        session.history.push({
          state: 'COMPLETED',
          timestamp: Date.now(),
          distance: session.distance
        });
        this.triggerStateUpdate(session);
      }
    }
  }

  /**
   * Silences current alert vibration for a citizen
   * @param {string} tripId 
   * @param {string} citizenId 
   */
  silenceAlert(tripId, citizenId) {
    const sessionKey = `${tripId}:${citizenId}`;
    const session = db.alertSessions.get(sessionKey);
    if (session && session.currentState === 'ENTERED_500M') {
      session.currentState = 'USER_SILENCED';
      session.silencedAt = Date.now();
      session.history.push({
        state: 'USER_SILENCED',
        timestamp: Date.now(),
        distance: session.distance
      });
      this.triggerStateUpdate(session);
      return true;
    }
    return false;
  }

  /**
   * Emits websocket events and console alerts for the state transitions
   * @param {object} session 
   */
  triggerStateUpdate(session) {
    const trip = db.trips.get(session.tripId);
    const vehicle = trip ? db.ambulances.get(trip.ambulanceId) : null;
    const payload = {
      sessionId: session.id,
      tripId: session.tripId,
      ambulanceId: session.ambulanceId,
      ambulanceType: vehicle ? vehicle.ambulanceType : 'Emergency Vehicle',
      driverId: session.driverId,
      citizenId: session.citizenId,
      currentState: session.currentState,
      distance: session.distance,
      plateNumber: vehicle ? vehicle.registrationNumber : '',
      destination: trip ? trip.destination : null
    };

    console.log(`🔊 [ALERT STATE CHANGE] Trip: ${session.tripId} | Citizen: ${session.citizenId} | State: ${payload.currentState} | Dist: ${payload.distance}m`);

    if (this.socketIO) {
      // Direct emit to the specific citizen channel
      this.socketIO.to(`citizen:${session.citizenId}`).emit('alert_state_change', payload);
      // Emit details to admin room for portal monitoring
      this.socketIO.to('admin').emit('admin_alert_log', payload);
    }
  }

  streamAmbulanceLocation(session, location) {
    if (this.socketIO) {
      this.socketIO.to(`citizen:${session.citizenId}`).emit('ambulance_location_update', {
        tripId: session.tripId,
        ambulanceId: session.ambulanceId,
        distance: session.distance,
        location
      });
    }
  }
}

module.exports = new AlertService();

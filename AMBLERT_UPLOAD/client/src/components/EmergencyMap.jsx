import React, { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import '../EmergencyMap.css';

const MAP_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

// Coimbatore Coordinates
const COIMBATORE = { lng: 76.9660, lat: 11.0045 };
const HOSPITAL = { name: "Coimbatore Govt GH", lng: 76.9660, lat: 11.0045 };
const DEFAULT_AMBULANCE = { lng: 76.9800, lat: 11.0150, heading: -120, speed: 45 };

// Simple static route from Ambulance to Hospital
const ROUTE = [
  [76.9800, 11.0150],
  [76.9750, 11.0100],
  [76.9700, 11.0070],
  [HOSPITAL.lng, HOSPITAL.lat]
];

function haversineKm(a, b) {
  const R = 6371;
  const toRad = v => (v * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export default function EmergencyMap({ socket }) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const ambulanceMarkerRef = useRef(null);
  const ambulanceElRef = useRef(null);

  const [distance, setDistance] = useState("0.0 km");
  const [eta, setEta] = useState("00:00 min");
  const [speed, setSpeed] = useState("0 km/h");
  const [time, setTime] = useState("");
  const [date, setDate] = useState("");

  const currentAmbulance = useRef({ ...DEFAULT_AMBULANCE });

  // Update Clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      setDate(now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }));
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  const updateDashboard = () => {
    const km = haversineKm(currentAmbulance.current, HOSPITAL);
    setDistance(`${km.toFixed(1)} km`);
    const currSpeed = currentAmbulance.current.speed || 45;
    const etaMinutes = Math.max(1, Math.round((km / currSpeed) * 60));
    setEta(`${String(etaMinutes).padStart(2, '0')}:00 min`);
    setSpeed(`${Math.round(currSpeed)} km/h`);
  };

  const updateAmbulanceLocation = (data) => {
    if (!data || !Number.isFinite(data.lat) || !Number.isFinite(data.lng)) return;

    currentAmbulance.current = { ...currentAmbulance.current, ...data };
    
    if (ambulanceMarkerRef.current) {
      ambulanceMarkerRef.current.setLngLat([currentAmbulance.current.lng, currentAmbulance.current.lat]);
    }
    
    if (ambulanceElRef.current && Number.isFinite(currentAmbulance.current.heading)) {
      ambulanceElRef.current.style.transform = `rotate(${currentAmbulance.current.heading}deg)`;
    }

    updateDashboard();
  };

  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: MAP_STYLE,
      center: [COIMBATORE.lng, COIMBATORE.lat],
      zoom: 14.5,
      pitch: 55,
      maxPitch: 60,
      bearing: -20,
      attributionControl: true
    });

    mapInstanceRef.current = map;

    // 1. Create Ambulance 3D Marker
    const ambEl = document.createElement("div");
    ambEl.className = "ambulance-marker";
    ambEl.innerHTML = `
      <div class="ambulance-shadow-3d"></div>
      <div class="headlight-beam"></div>
      <div class="ambulance-radar-3d"></div>
      <div class="ambulance-3d-box">
        <div class="box-face face-roof">
          <div class="lightbar-3d">
            <div class="siren-led red"></div>
            <div class="siren-led blue"></div>
          </div>
          <div class="roof-cross"></div>
        </div>
        <div class="box-face face-front">
          <div class="windshield-3d"></div>
          <div class="grill-3d">
            <div class="headlight-led"></div>
            <div class="headlight-led"></div>
          </div>
        </div>
        <div class="box-face face-rear">
          <div class="rear-doors-3d"></div>
          <div class="grill-3d">
            <div class="taillight-led"></div>
            <div class="taillight-led"></div>
          </div>
        </div>
        <div class="box-face face-side-left">
          <div class="side-stripe"></div><div class="side-cross"></div>
        </div>
        <div class="box-face face-side-right">
          <div class="side-stripe"></div><div class="side-cross"></div>
        </div>
        <div class="wheel-3d w-fl"></div><div class="wheel-3d w-fr"></div>
        <div class="wheel-3d w-rl"></div><div class="wheel-3d w-rr"></div>
      </div>
    `;
    ambulanceElRef.current = ambEl;

    ambulanceMarkerRef.current = new maplibregl.Marker({ element: ambEl, anchor: "center" })
      .setLngLat([currentAmbulance.current.lng, currentAmbulance.current.lat])
      .addTo(map);

    // 2. Create Hospital Marker
    const hospEl = document.createElement("div");
    hospEl.className = "hospital-marker-3d";
    hospEl.innerHTML = `
      <div class="hospital-badge-icon">+</div>
      <span>${HOSPITAL.name}</span>
    `;
    new maplibregl.Marker({ element: hospEl, anchor: "bottom" })
      .setLngLat([HOSPITAL.lng, HOSPITAL.lat])
      .addTo(map);

    map.on('load', () => {
      // Emergency GeoJSON Route Layer
      map.addSource("emergency-route", {
        type: "geojson",
        data: {
          type: "Feature",
          geometry: { type: "LineString", coordinates: ROUTE }
        }
      });
      map.addLayer({
        id: "emergency-route-glow",
        type: "line",
        source: "emergency-route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#ff3b47", "line-width": 18, "line-opacity": 0.25, "line-blur": 6 }
      });
      map.addLayer({
        id: "emergency-route-outer",
        type: "line",
        source: "emergency-route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#ff3b47", "line-width": 8, "line-opacity": 0.85 }
      });
      map.addLayer({
        id: "emergency-route-center",
        type: "line",
        source: "emergency-route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#ffffff", "line-width": 2, "line-opacity": 0.95 }
      });

      updateDashboard();
    });

  }, []);

  // Socket Connection or Simulation
  useEffect(() => {
    let simTimer;
    
    if (socket) {
      socket.on("ambulance:location", updateAmbulanceLocation);
      socket.on("ambulance_location_update", (payload) => {
        if(payload.location) {
          updateAmbulanceLocation({
            lat: payload.location.lat,
            lng: payload.location.lng,
            heading: payload.location.heading,
            speed: payload.location.speed || 45
          });
        }
      });
    } else {
      // Standalone simulation for Coimbatore emergency route
      let simIndex = 0;
      simTimer = setInterval(() => {
        if (simIndex >= ROUTE.length) simIndex = 0;
        const [lng, lat] = ROUTE[simIndex];
        let heading = currentAmbulance.current.heading;
        if (simIndex < ROUTE.length - 1) {
          const [nextLng, nextLat] = ROUTE[simIndex + 1];
          heading = Math.atan2(nextLng - lng, nextLat - lat) * 180 / Math.PI;
        }
        updateAmbulanceLocation({ lng, lat, heading, speed: 45 });
        simIndex++;
      }, 2500);
    }

    return () => {
      if (socket) {
        socket.off("ambulance:location");
        socket.off("ambulance_location_update");
      }
      if (simTimer) clearInterval(simTimer);
    };
  }, [socket]);

  return (
    <div className="emergency-map-wrap">
      <div ref={mapContainerRef} className="map-container" />

      {/* Top Navbar */}
      <div className="topbar">
        <div className="brand-block">
          <div className="brand-logo">
            <svg viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-1 6h2v4h4v2h-4v4h-2v-4H7v-2h4V7z"/></svg>
          </div>
          <div>
            <div className="brand-title">AMBULERT</div>
            <div className="brand-sub">EMERGENCY CORRIDOR · TAMIL NADU</div>
          </div>
        </div>

        <div className="mission-status-pill">
          <span className="status-dot"></span>
          <span className="status-text">MISSION STATUS: ACTIVE · CRITICAL</span>
        </div>

        <div className="header-right">
          <div className="header-time-block">
            <div className="header-time">{time}</div>
            <div className="header-date">{date}</div>
          </div>
          <div className="bell-btn" title="Notifications">
            <div className="bell-badge"></div>
            🔔
          </div>
        </div>
      </div>

      {/* Right Tools Panel */}
      <div className="right-tools-stack">
        <button className="right-tool-btn" onClick={() => !document.fullscreenElement ? document.documentElement.requestFullscreen() : document.exitFullscreen()}>⛶</button>
        <button className="right-tool-btn active" onClick={() => mapInstanceRef.current?.flyTo({ center: [currentAmbulance.current.lng, currentAmbulance.current.lat], zoom: 15.5, pitch: 55 })}>🎯</button>
      </div>

      {/* Bottom HUD */}
      <div className="bottom-hud">
        <div className="hud-metrics-card">
          <div className="metric-item">
            <div className="metric-label">🏥 Destination Hospital</div>
            <div className="metric-value" style={{ fontSize: '16px', color: '#00e676' }}>{HOSPITAL.name}</div>
          </div>
          <div className="metric-item">
            <div className="metric-label">📍 Distance</div>
            <div className="metric-value highlight">{distance}</div>
          </div>
          <div className="metric-item">
            <div className="metric-label">⏱️ ETA</div>
            <div className="metric-value highlight">{eta}</div>
          </div>
          <div className="metric-item">
            <div className="metric-label">🏎️ Speed</div>
            <div className="metric-value highlight">{speed}</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <div className="hud-traffic-card">
            <div className="metric-item">
              <div className="metric-label">🚦 Next Signal</div>
              <div className="metric-value green">Green Priority</div>
            </div>
          </div>
          <div className="zoom-controls-stack">
            <button className="right-tool-btn" onClick={() => mapInstanceRef.current?.zoomIn()}>+</button>
            <button className="right-tool-btn" onClick={() => mapInstanceRef.current?.zoomOut()}>−</button>
          </div>
        </div>
      </div>
    </div>
  );
}

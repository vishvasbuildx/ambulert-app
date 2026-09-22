/**
 * AMBULERT - Leaflet Map Integration Component
 * Directly integrates Leaflet.js to render routes, moving ambulance indicators, 
 * citizen position points, and destination hospitals with no styling asset leaks.
 */

import React, { useEffect, useRef } from 'react';

export default function MapView({ 
  center = [40.7812, -73.9665], 
  zoom = 14, 
  ambulance = null, 
  user = null, 
  route = [], 
  hospitals = [],
  citizens = [] 
}) {
  const mapElementRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef({
    ambulance: null,
    user: null,
    hospitals: [],
    citizens: []
  });
  const polylineRef = useRef(null);

  // Initialize Map Instance
  useEffect(() => {
    // Import Leaflet dynamically or read from window.L to bypass build/ESM import quirks
    const L = window.L;
    if (!L || !mapElementRef.current) return;

    if (!mapInstanceRef.current) {
      mapInstanceRef.current = L.map(mapElementRef.current, {
        zoomControl: false,
        attributionControl: false
      }).setView(center, zoom);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19
      }).addTo(mapInstanceRef.current);

      // Re-add Zoom control in bottom right out of the notch area
      L.control.zoom({ position: 'bottomright' }).addTo(mapInstanceRef.current);
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update Viewport Center when requested
  useEffect(() => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView(center, mapInstanceRef.current.getZoom());
    }
  }, [center]);

  // Update Marks, Polylines, and overlays on coordinate modifications
  useEffect(() => {
    const L = window.L;
    if (!L || !mapInstanceRef.current) return;

    const map = mapInstanceRef.current;

    // 1. Draw Route line
    if (polylineRef.current) {
      map.removeLayer(polylineRef.current);
      polylineRef.current = null;
    }
    if (route && route.length > 0) {
      const latLngs = route.map(pt => [pt.lat, pt.lng]);
      polylineRef.current = L.polyline(latLngs, {
        color: '#B91C1C',
        weight: 4,
        opacity: 0.7,
        dashArray: '8, 8'
      }).addTo(map);
    }

    // 2. Manage Ambulance Marker
    if (markersRef.current.ambulance) {
      map.removeLayer(markersRef.current.ambulance);
      markersRef.current.ambulance = null;
    }
    if (ambulance && typeof ambulance.lat === 'number') {
      const ambIcon = L.divIcon({
        className: 'custom-amb-icon',
        html: `
          <div style="position: relative;">
            <div class="map-ping-ring" style="top: -23px; left: -23px;"></div>
            <div style="width: 16px; height: 16px; background-color: #B91C1C; border: 2.5px solid white; border-radius: 50%; box-shadow: 0 2px 8px rgba(0,0,0,0.3); display:flex; align-items:center; justify-content:center;">
              <span style="font-size: 8px; color: white;">🚑</span>
            </div>
          </div>
        `,
        iconSize: [16, 16],
        iconAnchor: [8, 8]
      });
      markersRef.current.ambulance = L.marker([ambulance.lat, ambulance.lng], { icon: ambIcon }).addTo(map);
    }

    // 3. Manage User Citizen Marker (focus)
    if (markersRef.current.user) {
      map.removeLayer(markersRef.current.user);
      markersRef.current.user = null;
    }
    if (user && typeof user.lat === 'number') {
      const userIcon = L.divIcon({
        className: 'custom-user-icon',
        html: `
          <div style="width: 14px; height: 14px; background-color: #1E3A8A; border: 2px solid white; border-radius: 50%; box-shadow: 0 2px 6px rgba(0,0,0,0.25);"></div>
        `,
        iconSize: [14, 14],
        iconAnchor: [7, 7]
      });
      markersRef.current.user = L.marker([user.lat, user.lng], { icon: userIcon }).addTo(map);
    }

    // 4. Manage Hospitals Pins
    markersRef.current.hospitals.forEach(m => map.removeLayer(m));
    markersRef.current.hospitals = [];
    if (hospitals && hospitals.length > 0) {
      hospitals.forEach(hosp => {
        const hospIcon = L.divIcon({
          className: 'custom-hosp-icon',
          html: `
            <div style="width: 14px; height: 14px; background-color: #15803D; border: 2px solid white; border-radius: 50%; box-shadow: 0 2px 6px rgba(0,0,0,0.2); display: flex; align-items:center; justify-content:center;">
              <span style="font-size: 7px; color: white;">H</span>
            </div>
          `,
          iconSize: [14, 14],
          iconAnchor: [7, 7]
        });
        const marker = L.marker([hosp.lat, hosp.lng], { icon: hospIcon })
          .addTo(map)
          .bindPopup(`<b>${hosp.name}</b><br/><span style="font-size: 11px; color:#555;">${hosp.address}</span>`);
        markersRef.current.hospitals.push(marker);
      });
    }

    // 5. Manage Simulation Citizens Pins (Admin / Driver view only)
    markersRef.current.citizens.forEach(m => map.removeLayer(m));
    markersRef.current.citizens = [];
    if (citizens && citizens.length > 0) {
      citizens.forEach(cit => {
        // Skip current user active citizen so they don't overlap double indicators
        if (user && cit.id === user.id) return;
        const citizenIcon = L.divIcon({
          className: 'custom-citizen-icon',
          html: `
            <div style="width: 10px; height: 10px; background-color: #6B7280; border: 1.5px solid white; border-radius: 50%; box-shadow: 0 1px 3px rgba(0,0,0,0.2);"></div>
          `,
          iconSize: [10, 10],
          iconAnchor: [5, 5]
        });
        const marker = L.marker([cit.lat, cit.lng], { icon: citizenIcon })
          .addTo(map)
          .bindPopup(`<b>${cit.name} (Citizen)</b>`);
        markersRef.current.citizens.push(marker);
      });
    }

  }, [ambulance, user, route, hospitals, citizens]);

  return (
    <div 
      ref={mapElementRef} 
      className="leaflet-container" 
      style={{ width: '100%', height: '100%', minHeight: '180px' }} 
    />
  );
}

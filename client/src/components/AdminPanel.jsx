/**
 * AMBULERT - Administration and Telemetry Panel Component
 * Renders verified driver audits, vehicle permit licensing cards, and 
 * the simulation controller dashboard to test distance alerts.
 */

import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Activity, 
  CheckCircle, 
  AlertCircle, 
  Radio, 
  Play, 
  Pause, 
  SkipForward, 
  RefreshCw,
  FolderOpen
} from 'lucide-react';

export default function AdminPanel({ 
  socket, 
  activeTrip, 
  simulationStep, 
  totalWaypoints, 
  onTriggerSimulationStep,
  onAutoPlaySimulation,
  isAutoPlay,
  alertLogs = [] 
}) {
  const [stats, setStats] = useState({
    activeTrips: 0,
    totalCitizens: 3,
    verifiedDrivers: 1,
    pendingDrivers: 1,
    redisGeoOnline: false,
    serverUptimeSec: 0
  });

  const [drivers, setDrivers] = useState([]);

  // Fetch admin telemetry stats periodically
  const fetchStats = async () => {
    try {
      const res = await fetch('http://localhost:5000/api/admin/stats');
      const data = await res.json();
      setStats(data.metrics);
      setDrivers(data.drivers || []);
    } catch (e) {
      // offline default stats
      setStats({
        activeTrips: activeTrip ? 1 : 0,
        totalCitizens: 3,
        verifiedDrivers: drivers.filter(d => d.verificationStatus === 'VERIFIED').length || 1,
        pendingDrivers: drivers.filter(d => d.verificationStatus === 'PENDING_VERIFICATION').length || 1,
        redisGeoOnline: false,
        serverUptimeSec: 0
      });
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 4000);
    return () => clearInterval(interval);
  }, [activeTrip, drivers]);

  // Initial load drivers list
  useEffect(() => {
    // Populate default drivers for mockup simulation if server is offline
    setDrivers([
      {
        id: 'driver-1',
        name: 'Marcus Vance',
        phone: '+15550999',
        verificationStatus: 'VERIFIED',
        drivingLicence: { number: 'DL-AMB-NYC-4921', validity: '2029-12-31', classCategory: 'Class E - Emergency' },
        professionalDetails: { employer: 'NYC Emergency Ambulance Corp', credentials: 'EMT-Paramedic, EVOC Course' },
        ambulance: { registrationNumber: 'NYC-AMB-01', ambulanceType: 'ALS (Advanced Life Support)', verificationStatus: 'VERIFIED' }
      },
      {
        id: 'driver-2',
        name: 'Jack Miller',
        phone: '+15550777',
        verificationStatus: 'PENDING_VERIFICATION',
        drivingLicence: { number: 'DL-AMB-NYC-7890', validity: '2028-06-15', classCategory: 'Class D' },
        professionalDetails: { employer: 'Rapid Response Medical Transport', credentials: 'EMT-Basic' },
        ambulance: { registrationNumber: 'NYC-AMB-99', ambulanceType: 'BLS (Basic Life Support)', verificationStatus: 'PENDING_VERIFICATION' }
      }
    ]);
  }, []);

  const handleUpdateDriverStatus = async (driverId, newStatus) => {
    try {
      const res = await fetch(`http://localhost:5000/api/admin/drivers/${driverId}/verify`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      const data = await res.json();
      
      // Update local state
      setDrivers(drivers.map(d => {
        if (d.id === driverId) {
          return {
            ...d,
            verificationStatus: newStatus,
            ambulance: d.ambulance ? { ...d.ambulance, verificationStatus: newStatus } : null
          };
        }
        return d;
      }));

      // Broadcast changes on sockets to notify driver instance dashboard
      if (socket) {
        socket.emit('admin_verify_driver', { driverId, status: newStatus });
      }
    } catch (e) {
      // offline status update simulation
      setDrivers(drivers.map(d => {
        if (d.id === driverId) {
          return {
            ...d,
            verificationStatus: newStatus,
            ambulance: d.ambulance ? { ...d.ambulance, verificationStatus: newStatus } : null
          };
        }
        return d;
      }));
    }
  };

  return (
    <div className="admin-sidebar" style={{ gap: '16px' }}>
      
      {/* Header */}
      <div style={{ borderBottom: '1.5px solid var(--border-light)', paddingBottom: '10px' }}>
        <h3 style={{ fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Activity size={16} style={{ color: '#B91C1C' }} /> Telemetry Control Panel
        </h3>
        <p style={{ fontSize: '11px', color: '#6B7280', marginTop: '2px' }}>
          Verify drivers and automate route simulations.
        </p>
      </div>

      {/* Demo Simulation Controller */}
      <div style={{ backgroundColor: '#FAF9F6', border: '1.5px solid var(--border-light)', borderRadius: '10px', padding: '12px' }}>
        <div style={{ fontSize: '11px', fontWeight: '700', color: '#111', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', justifyContent: 'space-between' }}>
          <span>🚀 Sim Route Player</span>
          <span style={{ color: activeTrip ? '#B91C1C' : '#888' }}>
            {activeTrip ? 'ACTIVE RUN' : 'LOCKED'}
          </span>
        </div>

        {activeTrip ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContext:'space-between', justifyContent: 'space-between', fontSize: '11px', color: '#555' }}>
              <span>Waypoint: <b>{simulationStep + 1} / {totalWaypoints}</b></span>
              <span>Dist: <b>{activeTrip.destination.name.substring(0, 10)}...</b></span>
            </div>

            <div style={{ width: '100%', height: '4px', backgroundColor: '#E5E7EB', borderRadius: '2px', overflow: 'hidden' }}>
              <div style={{ width: `${((simulationStep + 1) / totalWaypoints) * 100}%`, height: '100%', backgroundColor: '#B91C1C', transition: 'width 0.3s' }}></div>
            </div>

            <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
              <button 
                onClick={onAutoPlaySimulation}
                className="btn btn-secondary" 
                style={{ flex: 1, padding: '6px', fontSize: '10px', display: 'flex', justifyContent: 'center', gap: '4px' }}
              >
                {isAutoPlay ? <Pause size={12} /> : <Play size={12} />}
                {isAutoPlay ? 'Pause Drive' : 'Auto Drive'}
              </button>
              
              <button 
                onClick={onTriggerSimulationStep}
                className="btn btn-primary"
                style={{ width: '40px', padding: '6px', display: 'flex', justifyContent: 'center' }}
                disabled={isAutoPlay}
              >
                <SkipForward size={12} />
              </button>
            </div>
            <div style={{ fontSize: '9px', color: '#6B7280', fontStyle: 'italic', textAlign:'center', marginTop:'3px' }}>
              *Auto Drive updates location coordinates along path nodes sequentially.
            </div>
          </div>
        ) : (
          <div style={{ fontSize: '11px', color: '#888', textAlign: 'center', padding: '10px 0' }}>
            Start an Emergency Trip on the Driver Simulator to activate path controllers.
          </div>
        )}
      </div>

      {/* Verification Auditing List */}
      <div>
        <div style={{ fontSize:'11px', fontWeight:'700', color:'#555', textTransform:'uppercase', marginBottom:'8px', display:'flex', gap:'5px', alignItems:'center' }}>
          <Users size={13} /> Driver verification desk
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {drivers.map(drv => (
            <div 
              key={drv.id} 
              style={{ 
                backgroundColor: 'white', 
                border: '1.5px solid #E8E7E3', 
                borderRadius: '8px', 
                padding: '10px', 
                fontSize: '11px',
                borderColor: drv.verificationStatus === 'VERIFIED' ? '#D1FAE5' : '#FEF3C7'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <span style={{ fontWeight: '700', color: '#111' }}>{drv.name}</span>
                  <div style={{ fontSize: '10px', color: '#666', marginTop: '1px' }}>Mobile: {drv.phone}</div>
                </div>

                <span style={{ 
                  fontSize: '9px', 
                  fontWeight: '700', 
                  backgroundColor: drv.verificationStatus === 'VERIFIED' ? '#D1FAE5' : '#FEF3C7', 
                  color: drv.verificationStatus === 'VERIFIED' ? '#065F46' : '#92400E', 
                  padding: '2px 6px', 
                  borderRadius: '4px' 
                }}>
                  {drv.verificationStatus === 'VERIFIED' ? 'VERIFIED' : 'PENDING'}
                </span>
              </div>

              <div style={{ backgroundColor: '#F9FAFB', padding: '6px', borderRadius: '4px', marginTop: '6px', fontSize: '9.5px', color:'#555', border: '1px solid #E5E7EB' }}>
                🚗 Vehicle: <b>{drv.ambulance?.registrationNumber || 'Not Associated'}</b> ({drv.ambulance?.ambulanceType || 'None'})<br/>
                🛡️ License Class: {drv.drivingLicence?.classCategory || 'Category Standard'}<br/>
                🏥 Operator: {drv.professionalDetails?.employer || 'Volunteer'}
              </div>

              <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                {drv.verificationStatus === 'PENDING_VERIFICATION' ? (
                  <button 
                    onClick={() => handleUpdateDriverStatus(drv.id, 'VERIFIED')}
                    className="btn btn-green btn-full" 
                    style={{ padding: '4px 8px', fontSize: '9.5px', height:'26px' }}
                  >
                    Approve Driver
                  </button>
                ) : (
                  <button 
                    onClick={() => handleUpdateDriverStatus(drv.id, 'PENDING_VERIFICATION')}
                    className="btn btn-secondary btn-full" 
                    style={{ padding: '4px 8px', fontSize: '9.5px', height:'26px', color:'#B91C1C' }}
                  >
                    Revoke License
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Geospatial and Notifications live logger */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize:'11px', fontWeight:'700', color:'#555', textTransform:'uppercase', marginBottom:'6px', display:'flex', gap:'5px', alignItems:'center' }}>
          <Radio size={12} style={{ color: '#B91C1C' }} /> Geofencing Audit Logs
        </div>

        <div 
          style={{ 
            flex: 1, 
            backgroundColor: '#1E293B', 
            color: '#34D399', 
            fontFamily: 'monospace', 
            fontSize: '9.5px', 
            padding: '10px', 
            borderRadius: '6px', 
            overflowY: 'auto',
            maxHeight: '180px',
            border: '1.5px solid #0F172A',
            lineHeight: '1.4'
          }}
        >
          {alertLogs.length === 0 ? (
            <div style={{ color: '#94A3B8', fontStyle: 'italic', textAlign: 'center', marginTop: '40px' }}>
              &lt; Live geofence transition telemetry streaming... &gt;
            </div>
          ) : (
            alertLogs.map((log, index) => (
              <div key={index} style={{ borderBottom: '1px solid #334155', paddingBottom: '3px', marginBottom: '3px' }}>
                [{new Date().toLocaleTimeString()}] Citizen:{log.citizenId ? log.citizenId.substring(8).toUpperCase() : '?'}<br/>
                ➔ State: <span style={{ color: log.currentState?.startsWith('ENTERED_50') || log.currentState === 'VIBRATING' ? '#F87171' : '#60A5FA' }}>{log.currentState}</span> | distance: {log.distance}m
              </div>
            ))
          )}
        </div>
      </div>

    </div>
  );
}

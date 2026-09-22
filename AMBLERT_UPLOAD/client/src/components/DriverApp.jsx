/**
 * AMBULERT - Ambulance Driver Application Component
 * Enforces verified driver profiles, coordinates AI hospital routing suggestions, 
 * maps active trip indicators, and provides coordinate progression toggles for demo simulation.
 */

import React, { useState, useEffect } from 'react';
import { 
  ShieldAlert, 
  MapPin, 
  Search, 
  Activity, 
  CheckCircle, 
  Compass, 
  Clock, 
  Navigation,
  FileText,
  UserCheck,
  AlertCircle
} from 'lucide-react';
import MapView from './MapView';

export default function DriverApp({ 
  socket, 
  activeAmbulanceLoc, 
  activeTrip, 
  onStartTrip, 
  onEndTrip, 
  onLocationUpdate,
  onUserLogin
}) {
  const [currentUser, setCurrentUser] = useState(null);
  const [driverProfile, setDriverProfile] = useState(null);
  const [ambulanceProfile, setAmbulanceProfile] = useState(null);
  const [authStep, setAuthStep] = useState('landing'); // landing, login, pending-verify, dashboard
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  
  // Doctor/Operator Info fields
  const [licenseNumber, setLicenseNumber] = useState('');
  const [employer, setEmployer] = useState('');
  const [regNumber, setRegNumber] = useState('');
  const [ambulanceType, setAmbulanceType] = useState('ALS (Advanced Life Support)');

  // Routing and Recommendations states
  const [hospitals, setHospitals] = useState([]);
  const [selectedHospital, setSelectedHospital] = useState(null);
  const [emergencyType, setEmergencyType] = useState('Cardiac Arrest');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiRecommendations, setAiRecommendations] = useState([]);
  const [token, setToken] = useState(localStorage.getItem('driver_token') || '');

  // GPS Simulation states
  const [gpsAccuracy, setGpsAccuracy] = useState(10); // in meters
  const [gpsIssues, setGpsIssues] = useState(false);
  const [trafficTimeCode, setTrafficTimeCode] = useState('NORMAL');

  // Load preset driver logins for easy testing
  const selectDemoDriver = (type) => {
    if (type === 'verified') {
      setPhone('+15550999');
    } else {
      setPhone('+15550777'); // Jack Miller (Pending)
    }
  };

  const handleSendOtp = async () => {
    if (!phone) return alert('Enter phone number');
    try {
      const res = await fetch('http://localhost:5000/api/auth/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, role: 'DRIVER' })
      });
      const data = await res.json();
      setOtp(data.demoOtp || '123456');
      setAuthStep('login');
    } catch (e) {
      // offline fallback
      setOtp('123456');
      setAuthStep('login');
    }
  };

  const handleVerifyOtp = async () => {
    if (!otp) return alert('Enter code');
    try {
      const res = await fetch('http://localhost:5000/api/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code: otp, role: 'DRIVER' })
      });
      const data = await res.json();
      if (data.isRegistered) {
        setToken(data.token);
        localStorage.setItem('driver_token', data.token);
        
        // Fetch full profile info
        fetchDriverProfile(data.token);
      } else {
        setAuthStep('register');
      }
    } catch (e) {
      // Offline mock authentication login
      mockOfflineLogin(phone);
    }
  };

  const mockOfflineLogin = (phoneNumber) => {
    if (phoneNumber === '+15550999') {
      // Marcus - Verified
      const mockUser = { id: 'drv-user-1', name: 'Marcus Vance', phone: phoneNumber, role: 'DRIVER' };
      const mockDriver = { id: 'driver-1', verificationStatus: 'VERIFIED', professionalDetails: { employer: 'NYC EMS' } };
      const mockAmb = { id: 'amb-1', registrationNumber: 'NYC-AMB-01', ambulanceType: 'ALS (Advanced Life Support)', verificationStatus: 'VERIFIED' };
      setCurrentUser(mockUser);
      setDriverProfile(mockDriver);
      setAmbulanceProfile(mockAmb);
      onUserLogin(mockUser);
      setAuthStep('dashboard');
    } else {
      // Jack - Pending
      const mockUser = { id: 'drv-user-2', name: 'Jack Miller', phone: phoneNumber, role: 'DRIVER' };
      const mockDriver = { id: 'driver-2', verificationStatus: 'PENDING_VERIFICATION', professionalDetails: { employer: 'Rapid Response' } };
      const mockAmb = { id: 'amb-2', registrationNumber: 'NYC-AMB-99', ambulanceType: 'BLS (Basic Life Support)', verificationStatus: 'PENDING_VERIFICATION' };
      setCurrentUser(mockUser);
      setDriverProfile(mockDriver);
      setAmbulanceProfile(mockAmb);
      onUserLogin(mockUser);
      setAuthStep('pending-verify');
    }
  };

  const fetchDriverProfile = async (loginToken) => {
    try {
      const res = await fetch('http://localhost:5000/api/auth/me', {
        headers: { 'Authorization': `Bearer ${loginToken}` }
      });
      const data = await res.json();
      setCurrentUser(data.user);
      setDriverProfile(data.driver);
      setAmbulanceProfile(data.ambulance);
      onUserLogin(data.user);

      if (data.driver.verificationStatus === 'VERIFIED') {
        setAuthStep('dashboard');
      } else {
        setAuthStep('pending-verify');
      }
    } catch (e) {
      mockOfflineLogin(phone);
    }
  };

  const handleRegister = async () => {
    const payload = {
      phone,
      role: 'DRIVER',
      name: 'Emergency Driver',
      licenseNumber: licenseNumber || 'DL-AMB-NYC-4921',
      employer: employer || 'Emergency Fleet Corp',
      regNumber: regNumber || 'NYC-AMB-01',
      ambulanceType: ambulanceType
    };

    try {
      const res = await fetch('http://localhost:5000/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.token) {
        setToken(data.token);
        localStorage.setItem('driver_token', data.token);
        fetchDriverProfile(data.token);
      }
    } catch (e) {
      mockOfflineLogin(phone);
    }
  };

  // AI Recommendation Trigger
  const getAIHospitalRecommendations = async () => {
    setAiLoading(true);
    // Simulate NY central coordinate lat/lng if unavailable
    const lat = 40.7780;
    const lng = -73.9720;

    try {
      const res = await fetch(`http://localhost:5000/api/hospitals/recommend?lat=${lat}&lng=${lng}&emergencyType=${emergencyType}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setAiRecommendations(data.recommendations);
      setSelectedHospital(data.recommendations[0]); // default to recommended St. Mary's 
    } catch (e) {
      // offline recom fallback
      const mockRecoms = [
        {
          id: 'hosp-1',
          name: "St. Mary's Emergency Care",
          lat: 40.78987,
          lng: -73.9529,
          distanceKm: 1.5,
          travelTimeSec: 180,
          emergencyRating: 'Level 1 Trauma Center',
          aiExplanation: `Recommended: St. Mary's is a Level 1 center suited for ${emergencyType}. Path travel time is estimated at 3 mins.`
        },
        {
          id: 'hosp-2',
          name: 'Metropolitan Hospital Center',
          lat: 40.7845,
          lng: -73.9439,
          distanceKm: 2.1,
          travelTimeSec: 290,
          emergencyRating: 'Level 2 Trauma Center',
          aiExplanation: `Secondary choice. Metropolitan Hospital is located 2.1 km away with 4.8 min travel path.`
        }
      ];
      setAiRecommendations(mockRecoms);
      setSelectedHospital(mockRecoms[0]);
    }
    setAiLoading(false);
  };

  const handleStartTrip = () => {
    if (!selectedHospital) return alert('Select destination hospital first.');
    onStartTrip(selectedHospital);
  };

  // Request credentials check periodically in pending state (refresh logic)
  useEffect(() => {
    if (authStep === 'pending-verify' && token) {
      const checkDriver = setInterval(() => {
        fetchDriverProfile(token);
      }, 5000);
      return () => clearInterval(checkDriver);
    }
  }, [authStep, token]);

  const handleLogout = () => {
    localStorage.removeItem('driver_token');
    setCurrentUser(null);
    setDriverProfile(null);
    setAmbulanceProfile(null);
    setAuthStep('landing');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      
      {/* 1. Selecting Driver landing choice */}
      {authStep === 'landing' && (
        <div className="choice-container" style={{ justifyContent: 'space-between', padding: '32px 24px' }}>
          <div>
            <div style={{ fontSize: '32px', margin: '20px 0 10px 0' }}>🚒</div>
            <h2 style={{ fontSize: '20px', marginBottom: '8px' }}>Driver Workspace</h2>
            <p style={{ fontSize: '13px', color: '#666', lineHeight: '1.4' }}>
              Broadcast real-time emergency trip path parameters. Alert nearby citizens using geofence indexation when sirens are on.
            </p>
          </div>

          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ fontSize: '11px', textAlign: 'left', fontWeight: '600', color: '#6B7280', textTransform:'uppercase' }}>Quick Login Simulation</div>
            
            <button 
              onClick={() => selectDemoDriver('verified')}
              className={`btn btn-secondary ${phone === '+15550999' ? 'active' : ''}`}
              style={{ justifyContent: 'space-between', padding: '12px 14px', borderStyle:'solid', borderWidth:'1.5px', borderColor: phone === '+15550999' ? '#1E3A8A' : '#E8E7E3', background: phone === '+15550999' ? '#EFF6FF' : 'white' }}
            >
              <div style={{ textAlign: 'left', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle size={14} style={{ color: '#15803D' }} />
                <div>
                  <div style={{ fontSize:'12px', fontWeight:'600' }}>Marcus Vance</div>
                  <div style={{ fontSize:'10px', color:'#666' }}>Role: Verified Driver (EMP-4921)</div>
                </div>
              </div>
            </button>

            <button 
              onClick={() => selectDemoDriver('pending')}
              className={`btn btn-secondary ${phone === '+15550777' ? 'active' : ''}`}
              style={{ justifyContent: 'space-between', padding: '12px 14px', borderStyle:'solid', borderWidth:'1.5px', borderColor: phone === '+15550777' ? '#1E3A8A' : '#E8E7E3', background: phone === '+15550777' ? '#EFF6FF' : 'white' }}
            >
              <div style={{ textAlign: 'left', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertCircle size={14} style={{ color: '#D97706' }} />
                <div>
                  <div style={{ fontSize:'12px', fontWeight:'600' }}>Jack Miller</div>
                  <div style={{ fontSize:'10px', color:'#666' }}>Role: Pending Verification driver</div>
                </div>
              </div>
            </button>
          </div>

          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div className="form-group">
              <label>Professional Mobile phone</label>
              <input 
                type="tel" 
                value={phone} 
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+15550000" 
                className="input-field" 
              />
            </div>
            <button className="btn btn-primary btn-full" onClick={handleSendOtp}>
              Validate Driver Credentials
            </button>
          </div>
        </div>
      )}

      {/* 2. Entering verification verification codes */}
      {authStep === 'login' && (
        <div className="choice-container">
          <h2 style={{ fontSize: '18px', marginBottom: '8px' }}>OTP Code verification</h2>
          <p style={{ fontSize: '12px', color: '#666', marginBottom: '16px' }}>
            Authorized mobile: <span style={{ fontWeight: '600' }}>{phone}</span>
          </p>
          <div className="form-group" style={{ width: '100%' }}>
            <label>OTP Verification Code</label>
            <input 
              type="text" 
              value={otp} 
              onChange={(e) => setOtp(e.target.value)}
              placeholder="123456" 
              className="input-field" 
              style={{ textAlign: 'center', fontSize: '18px', letterSpacing: '4px' }}
            />
          </div>
          <button className="btn btn-primary btn-full" onClick={handleVerifyOtp} style={{ marginTop: '12px' }}>
            Verify Identity Check
          </button>
          <button className="btn btn-secondary btn-full" onClick={() => setAuthStep('landing')} style={{ marginTop: '8px' }}>
            Back
          </button>
        </div>
      )}

      {/* 3. Driver Registration Details Form */}
      {authStep === 'register' && (
        <div style={{ padding: '20px', overflowY:'auto', flex: 1, display: 'flex', flexDirection:'column', gap:'12px' }}>
          <h2 style={{ fontSize: '17px', borderBottom: '1px solid #eee', paddingBottom: '8px' }}>Driver Operator Intake</h2>
          
          <div className="form-group">
            <label>Driving Licence Number</label>
            <input type="text" className="input-field" placeholder="DL-AMB-NYC-4921" value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} />
          </div>

          <div className="form-group">
            <label>Ambulance Employer</label>
            <input type="text" className="input-field" placeholder="NYC Emergency Ambulance Corp" value={employer} onChange={(e) => setEmployer(e.target.value)} />
          </div>

          <div className="form-group">
            <label>Vehicle Plate Number</label>
            <input type="text" className="input-field" placeholder="NYC-AMB-01" value={regNumber} onChange={(e) => setRegNumber(e.target.value)} />
          </div>

          <div className="form-group">
            <label>Ambulance Category</label>
            <select className="input-field" value={ambulanceType} onChange={(e) => setAmbulanceType(e.target.value)}>
              <option>ALS (Advanced Life Support)</option>
              <option>BLS (Basic Life Support)</option>
              <option>Critical Care Mobile Transport</option>
            </select>
          </div>

          <div style={{ fontSize: '11px', color: '#D97706', backgroundColor: '#FEF3C7', padding: '10px', borderRadius: '6px', lineHeight: '1.4' }}>
            🔔 Verification Policy: Every driver application starts as <b>Pending Verification</b>. Upload photocopies for admin verification.
          </div>

          <button className="btn btn-primary btn-full" onClick={handleRegister} style={{ marginTop: '8px' }}>
            Submit Credentials For Check
          </button>
        </div>
      )}

      {/* 4. Displaying profile verification block */}
      {authStep === 'pending-verify' && currentUser && (
        <div className="choice-container" style={{ justifyContent: 'space-between', padding: '32px 24px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '48px', height: '48px', backgroundColor: '#FEF3C7', color: '#D97706', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent: 'center', margin: '20px auto' }}>
              <Compass size={24} className="simulate-vibrate" style={{ animationDuration: '2s' }} />
            </div>

            <h2 style={{ fontSize: '18px', fontWeight: '800' }}>Pending Inspector Audit</h2>
            <div style={{ display: 'inline-block', backgroundColor: '#FEF3C7', color: '#92400E', padding: '4px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: '700' }}>
              PENDING VERIFICATION
            </div>

            <p style={{ fontSize: '12px', color: '#555', lineHeight: '1.5', marginTop: '10px' }}>
              Welcome, <span style={{ fontWeight: '600' }}>{currentUser.name}</span>. Your registered license details and ambulance plate registration are being reviewed by safety compliance administrators.
            </p>
          </div>

          <div style={{ width: '100%', border: '1px solid #E8E7E3', borderRadius: '8px', padding: '12px', textAlign: 'left', backgroundColor: 'white' }}>
            <div style={{ fontSize: '11px', fontWeight: '700', color: '#555', display:'flex', gap:'5px', alignItems:'center', marginBottom:'4px' }}>
              <FileText size={12} /> VERIFICATION AUDIT LOG
            </div>
            <div style={{ fontSize: '10px', color: '#666', lineHeight: '1.4' }}>
              • License validation: <span style={{ color: '#D97706' }}>In review</span><br/>
              • Vehicle permit audit: <span style={{ color: '#D97706' }}>In review</span><br/>
              • Operator dispatch approval: <span style={{ color: '#D97706' }}>Awaiting admin action</span>
            </div>
            <div style={{ fontSize: '10px', color: '#6B7280', fontStyle: 'italic', marginTop: '10px' }}>
              💡 Demo Tip: Click "Approve Driver" in the Admin Panel sidebar to verify instantly!
            </div>
          </div>

          <button className="btn btn-secondary btn-full" onClick={handleLogout}>
            Logout Account
          </button>
        </div>
      )}

      {/* 5. Driver active trip setup / Dashboard */}
      {authStep === 'dashboard' && currentUser && !activeTrip && (
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', flex: 1, overflowY: 'auto', gap: '16px' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #E8E7E3', paddingBottom: '10px' }}>
            <div>
              <div style={{ fontSize: '10px', color: '#15803D', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <CheckCircle size={10} /> VERIFIED DRIVER
              </div>
              <h2 style={{ fontSize: '15px' }}>{currentUser.name}</h2>
            </div>
            <button onClick={handleLogout} style={{ fontSize: '10px', color: '#888', background: '#F3F4F6', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}>
              Logout
            </button>
          </div>

          {/* AI Recommended Hospital Section */}
          <div style={{ border: '1.5px solid #1E3A8A', backgroundColor: '#EFF6FF', borderRadius: '12px', padding: '14px' }}>
            <h3 style={{ fontSize: '13px', color: '#1E3A8A', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              <Navigation size={14} /> AI Hospital Recommendation
            </h3>
            
            <div className="form-group">
              <label style={{ color: '#1E3A8A' }}>Specify Emergency Class</label>
              <select className="input-field" value={emergencyType} onChange={(e) => setEmergencyType(e.target.value)} style={{ borderColor: '#BFDBFE', backgroundColor: 'white' }}>
                <option>Cardiac Arrest</option>
                <option>Severe Trauma</option>
                <option>Respiratory Distress</option>
                <option>Stroke Protocol</option>
              </select>
            </div>

            <button 
              className="btn btn-primary btn-full" 
              onClick={getAIHospitalRecommendations} 
              style={{ padding: '8px', fontSize: '11px', display: 'flex', gap: '6px', justifyContent: 'center' }}
              disabled={aiLoading}
            >
              {aiLoading ? 'Accessing Routing AI...' : 'Find Best Hospital Recommendation'}
            </button>

            {aiRecommendations.length > 0 && (
              <div style={{ marginTop: '12px', borderTop: '1px solid #BFDBFE', paddingTop: '10px' }}>
                <div style={{ fontSize: '11px', color: '#1E3A8A', fontWeight: '700', marginBottom: '4px' }}>
                  AI RECOMMENDATIONS DETAILS:
                </div>
                {aiRecommendations.map((r, i) => (
                  <div 
                    key={r.id} 
                    onClick={() => setSelectedHospital(r)}
                    style={{ 
                      padding: '8px 10px', 
                      backgroundColor: selectedHospital?.id === r.id ? 'white' : 'transparent',
                      borderRadius: '6px', 
                      border: selectedHospital?.id === r.id ? '1.5px solid #1E3A8A' : '1px solid transparent',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '8px',
                      marginBottom: '6px'
                    }}
                  >
                    <input type="radio" checked={selectedHospital?.id === r.id} onChange={() => setSelectedHospital(r)} style={{ marginTop: '3px' }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '11px', fontWeight: '700', color:'#111' }}>
                        {r.name} {i === 0 && <span style={{ color: '#15803D', fontStyle: 'italic' }}>(Shortest Route)</span>}
                      </div>
                      <div style={{ fontSize: '10px', color: '#555', marginTop: '2px' }}>
                        Distance: {r.distanceKm} km | Time: {Math.round(r.travelTimeSec / 60)} mins | Bed Capacity: 8 ICU available
                      </div>
                      <div style={{ fontSize: '9.5px', color: '#4B5563', backgroundColor:'#F3F4F6', padding:'4px 6px', borderRadius:'4px', marginTop:'4px', fontStyle:'italic' }}>
                        "{r.aiExplanation}"
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: '13px', marginBottom: '8px' }}>Or pick manually below:</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ fontSize: '11px', backgroundColor:'#F9FAFB', border: '1px solid #E8E7E3', padding: '10px', borderRadius:'6px' }}>
                📍 Vehicle Location: <b>Manhattan Central Park</b><br/>
                🚑 Ambulance Class: <b>{ambulanceProfile?.ambulanceType || 'ALS (Advanced Life Support)'}</b>
              </div>
            </div>
          </div>

          <button 
            className="btn btn-emergency btn-full" 
            onClick={handleStartTrip} 
            style={{ padding: '14px', fontSize: '13px', fontWeight: '700' }}
          >
            START EMERGENCY TRIP
          </button>
        </div>
      )}

      {/* 6. Active emergency driving mode HUD */}
      {authStep === 'dashboard' && activeTrip && (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', flex: 1, position: 'relative' }}>
          
          {/* Top banner minimize driver distraction */}
          <div style={{ backgroundColor: '#B91C1C', color: 'white', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div className="simulate-vibrate" style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'white', animationDuration: '1.5s' }}></div>
              <span style={{ fontSize: '12px', fontWeight: '800', letterSpacing:'0.03em' }}>EMERGENCY MODE LIVE</span>
            </div>
            
            <div style={{ fontSize: '10px', backgroundColor: 'rgba(255,255,255,0.2)', padding:'4px 8px', borderRadius:'4px' }}>
              Broadcasting Route Parameters
            </div>
          </div>

          {/* Minimalist Dashboard Map */}
          <div style={{ flex: 1, position: 'relative' }}>
            <MapView 
              center={[activeAmbulanceLoc.lat, activeAmbulanceLoc.lng]}
              zoom={15}
              ambulance={activeAmbulanceLoc}
              user={null}
              route={activeTrip.route}
              hospitals={[activeTrip.destination]}
            />
          </div>

          {/* District Driver distraction free panel info */}
          <div className="bottom-sheet" style={{ borderTopColor: '#B91C1C', borderTopWidth: '2px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px', borderBottom: '1px solid #eee', paddingBottom: '12px' }}>
              <div>
                <div style={{ fontSize: '10px', color: '#6B7280', fontWeight: '600' }}>DESTINATION HOSPITAL</div>
                <div style={{ fontSize: '12px', fontWeight: '700', color: '#111', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {activeTrip.destination.name}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '10px', color: '#6B7280', fontWeight: '600' }}>CURRENT VEHICLE STATUS</div>
                <div style={{ fontSize: '12px', fontWeight: '700', color: '#B91C1C' }}>SIRENS ACTIVE</div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', textAlign: 'center', marginBottom: '14px' }}>
              <div style={{ backgroundColor: '#F9FAFB', padding: '6px', borderRadius: '6px' }}>
                <Compass size={14} style={{ margin: '0 auto 2px auto', color:'#555' }} />
                <div style={{ fontSize: '9px', color: '#666' }}>HEADING</div>
                <div style={{ fontSize: '11px', fontWeight: '700' }}>{activeAmbulanceLoc.heading}° NE</div>
              </div>
              <div style={{ backgroundColor: '#F9FAFB', padding: '6px', borderRadius: '6px' }}>
                <Clock size={14} style={{ margin: '0 auto 2px auto', color:'#555' }} />
                <div style={{ fontSize: '9px', color: '#666' }}>ETA</div>
                <div style={{ fontSize: '11px', fontWeight: '700', color: '#B91C1C' }}>
                  {activeAmbulanceLoc.etaSec ? `${Math.ceil(activeAmbulanceLoc.etaSec / 60)} min` : '3 min'}
                </div>
              </div>
              <div style={{ backgroundColor: '#F9FAFB', padding: '6px', borderRadius: '6px' }}>
                <Navigation size={14} style={{ margin: '0 auto 2px auto', color:'#555' }} />
                <div style={{ fontSize: '9px', color: '#666' }}>REMAINING</div>
                <div style={{ fontSize: '11px', fontWeight: '700' }}>
                  {activeAmbulanceLoc.distRemainingKm ? `${activeAmbulanceLoc.distRemainingKm} km` : '1.2 km'}
                </div>
              </div>
            </div>

            <button 
              className="btn btn-primary btn-full" 
              onClick={onEndTrip}
              style={{ backgroundColor: '#111827', color:'white', padding: '12px', fontWeight: '700' }}
            >
              END EMERGENCY TRIP
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

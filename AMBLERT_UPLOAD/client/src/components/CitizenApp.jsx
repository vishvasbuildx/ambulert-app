/**
 * AMBULERT - Citizen Application Component
 * Implements login steps, explicit safety consent requests, Leaflet tracking,
 * and the 1KM notification, 500M vibrating warning, and swipe-to-silence state machines.
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Bell, 
  MapPin, 
  Info, 
  Heart, 
  CornerDownRight, 
  VolumeX, 
  Volume2, 
  User, 
  ArrowRight,
  ShieldCheck,
  Check
} from 'lucide-react';
import MapView from './MapView';

// Coordinates setup
const DEMO_CITIZENS = [
  { id: 'citizen-a', name: 'Alex Smith', phone: '+15550100', lat: 40.7812, lng: -73.9665, condition: 'Mild Asthma' },
  { id: 'citizen-b', name: 'Bobby Brown', phone: '+15550200', lat: 40.7835, lng: -73.9620, condition: 'None' },
  { id: 'citizen-c', name: 'Charlie Davis', phone: '+15550300', lat: 40.7870, lng: -73.9550, condition: 'Hypertension' }
];

export default function CitizenApp({ 
  socket, 
  triggerParentVibration, 
  activeAmbulanceLoc, 
  activeTrip,
  activeAlertSession,
  onSilenceAlert,
  onUserLogin
}) {
  const [currentUser, setCurrentUser] = useState(null);
  const [authStep, setAuthStep] = useState('landing'); // landing, login, register, consent-location, consent-notif, main
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [demoCitizens, setDemoCitizens] = useState(DEMO_CITIZENS);
  
  // Registration States
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState('Male');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('New York');
  const [state, setState] = useState('NY');
  const [pinCode, setPinCode] = useState('10021');
  
  // Medical
  const [bloodGroup, setBloodGroup] = useState('O+');
  const [allergies, setAllergies] = useState('');
  const [meds, setMeds] = useState('');
  const [emergencyContact, setEmergencyContact] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');

  // Sockets config
  const [token, setToken] = useState(localStorage.getItem('citizen_token') || '');

  // UI States
  const [showRouteOnMap, setShowRouteOnMap] = useState(true);
  const [toastNotification, setToastNotification] = useState(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [dismissedToastTripId, setDismissedToastTripId] = useState(null);

  // Swipe-to-silence state variables
  const swipeTrackRef = useRef(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const startXRef = useRef(0);

  // Sound ref
  const audioContextRef = useRef(null);

  // Audio vibration beep simulator
  useEffect(() => {
    if (activeAlertSession && activeAlertSession.currentState === 'ENTERED_500M' && soundEnabled) {
      // Trigger a soft sound warning beep in coordination with the vibration
      const playBeep = () => {
        try {
          if (!audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
          }
          const ctx = audioContextRef.current;
          if (ctx.state === 'suspended') {
            ctx.resume();
          }
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(880, ctx.currentTime); // High pitch warning
          gain.gain.setValueAtTime(0.08, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + 0.35);
        } catch (e) {
          // ignore silent audio errors
        }
      };

      const interval = setInterval(playBeep, 800);
      return () => clearInterval(interval);
    }
  }, [activeAlertSession, soundEnabled]);

  // Track parent vibration trigger
  useEffect(() => {
    if (activeAlertSession) {
      if (activeAlertSession.currentState === 'ENTERED_500M') {
        triggerParentVibration(true);
      } else {
        triggerParentVibration(false);
      }
    } else {
      triggerParentVibration(false);
    }
  }, [activeAlertSession]);

  // Display top Toast notifications based on alert state transitions
  useEffect(() => {
    if (activeAlertSession) {
      const state = activeAlertSession.currentState;
      const tripId = activeAlertSession.tripId;
      
      if (state === 'ENTERED_1KM' && dismissedToastTripId !== tripId) {
        setToastNotification({
          title: 'Ambulance Approaching',
          msg: 'An emergency vehicle is responding within 1 KM of your area. Please prepare to clear the lane.'
        });
      } else if (state === 'ENTERED_500M') {
        setToastNotification({
          title: 'Ambulance Very Close',
          msg: 'Critical: The vehicle is within 500 Meters. Please safely pull to the side now.'
        });
      } else if (state === 'ENTERED_50M') {
        setToastNotification({
          title: 'Ambulance Passing Nearby',
          msg: 'Within 50 Meters range. Yield right immediately.'
        });
      }
    } else {
      // Revert toast once session completes
      if (toastNotification) {
        setToastNotification(null);
      }
    }
  }, [activeAlertSession, dismissedToastTripId]);

  // Auto loading preset profile for testing
  const selectDemoProfile = (cit) => {
    setPhone(cit.phone);
    setName(cit.name);
  };

  const handleSendOtp = async () => {
    if (!phone) return alert('Enter phone number');
    // Call server auth or simulate
    try {
      const res = await fetch('http://localhost:5000/api/auth/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, role: 'CITIZEN' })
      });
      const data = await res.json();
      setOtp(data.demoOtp || '123456'); // pre-fill demo otp code
      setAuthStep('login'); 
    } catch (e) {
      // Fallback
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
        body: JSON.stringify({ phone, code: otp, role: 'CITIZEN' })
      });
      const data = await res.json();
      if (data.isRegistered) {
        setToken(data.token);
        localStorage.setItem('citizen_token', data.token);
        setCurrentUser(data.user);
        onUserLogin(data.user);
        
        // Check permissions consent states
        if (!data.user.locationConsent) {
          setAuthStep('consent-location');
        } else if (!data.user.notificationConsent) {
          setAuthStep('consent-notif');
        } else {
          setAuthStep('main');
          // Join socket room
          if (socket) socket.emit('join_citizen_room', data.user.id);
        }
      } else {
        // User details form registration
        setAuthStep('register');
      }
    } catch (e) {
      // Offline fallback profile
      const fallbackUser = {
        id: phone === '+15550200' ? 'citizen-b' : phone === '+15550300' ? 'citizen-c' : 'citizen-a',
        name: name || 'Demo Citizen',
        phone,
        locationConsent: true,
        notificationConsent: true,
        lat: phone === '+15550200' ? 40.7835 : phone === '+15550300' ? 40.7870 : 40.7812,
        lng: phone === '+15550200' ? -73.9620 : phone === '+15550300' ? -73.9550 : -73.9665,
        emergencyProfile: { bloodGroup: 'B+', allergies: 'Shellfish', conditions: 'Asthma' }
      };
      setCurrentUser(fallbackUser);
      onUserLogin(fallbackUser);
      setAuthStep('main');
      if (socket) socket.emit('join_citizen_room', fallbackUser.id);
    }
  };

  const handleRegister = async () => {
    const payload = {
      phone,
      role: 'CITIZEN',
      name,
      email,
      dateOfBirth: dob,
      gender,
      address,
      city,
      state,
      pinCode,
      emergencyProfile: {
        bloodGroup,
        allergies,
        conditions: meds,
        medications: meds,
        contactName: emergencyContact,
        contactNumber: emergencyPhone
      }
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
        localStorage.setItem('citizen_token', data.token);
        setCurrentUser(data.user);
        onUserLogin(data.user);
        setAuthStep('consent-location');
      }
    } catch (e) {
      // offline register
      const mockReg = {
        id: `usr-${Date.now()}`,
        name,
        phone,
        email,
        lat: 40.7812,
        lng: -73.9665,
        locationConsent: true,
        notificationConsent: true,
        emergencyProfile: { bloodGroup, allergies, conditions: meds }
      };
      setCurrentUser(mockReg);
      onUserLogin(mockReg);
      setAuthStep('main');
    }
  };

  const handleGrantConsent = async (type) => {
    let loc = type === 'location' ? true : currentUser.locationConsent;
    let notif = type === 'notification' ? true : currentUser.notificationConsent;

    try {
      const res = await fetch('http://localhost:5000/api/auth/consent', {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ locationConsent: loc, notificationConsent: notif })
      });
      const data = await res.json();
      setCurrentUser(data.user);
    } catch (e) {
      // update state offline
      currentUser.locationConsent = loc;
      currentUser.notificationConsent = notif;
      setCurrentUser({ ...currentUser });
    }

    if (type === 'location') {
      setAuthStep('consent-notif');
    } else {
      setAuthStep('main');
      if (socket) socket.emit('join_citizen_room', currentUser.id);
    }
  };

  // Swipe Action Handlers
  const handleTouchStart = (e) => {
    setIsSwiping(true);
    startXRef.current = e.touches[0].clientX;
  };

  const handleMouseDown = (e) => {
    setIsSwiping(true);
    startXRef.current = e.clientX;
  };

  const handleMove = (clientX) => {
    if (!isSwiping || !swipeTrackRef.current) return;
    const trackWidth = swipeTrackRef.current.clientWidth;
    const maxOffset = trackWidth - 52; // subtract size of button icon
    let diff = clientX - startXRef.current;
    if (diff < 0) diff = 0;
    if (diff > maxOffset) diff = maxOffset;
    setSwipeOffset(diff);
  };

  const handleTouchMove = (e) => {
    handleMove(e.touches[0].clientX);
  };

  const handleMouseMove = (e) => {
    handleMove(e.clientX);
  };

  const handleEnd = () => {
    if (!isSwiping) return;
    setIsSwiping(false);
    const trackWidth = swipeTrackRef.current.clientWidth;
    const maxOffset = trackWidth - 52;

    if (swipeOffset >= maxOffset * 0.85) {
      // Trigger Silence Mode
      setSwipeOffset(maxOffset);
      onSilenceAlert();
    } else {
      // Reset back to left
      setSwipeOffset(0);
    }
  };

  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isSwiping) handleEnd();
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [isSwiping, swipeOffset]);

  // Watch for alerts disappearing resets
  useEffect(() => {
    if (!activeAlertSession || activeAlertSession.currentState !== 'USER_SILENCED') {
      setSwipeOffset(0);
    }
  }, [activeAlertSession]);

  // Logouts
  const handleLogout = () => {
    localStorage.removeItem('citizen_token');
    setCurrentUser(null);
    setToken('');
    setAuthStep('landing');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      
      {/* 1. Landing View */}
      {authStep === 'landing' && (
        <div className="choice-container" style={{ justifyContent: 'space-between', padding: '32px 24px' }}>
          <div>
            <div style={{ fontSize: '32px', margin: '20px 0 10px 0' }}>🔔</div>
            <h2 style={{ fontSize: '20px', marginBottom: '8px' }}>Citizen Workspace</h2>
            <p style={{ fontSize: '13px', color: '#666', lineHeight: '1.4' }}>
              Receive proximity sounds and vibration alerts immediately when verified emergency ambulances approach your street GPS zone.
            </p>
          </div>

          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ fontSize: '11px', textAlign: 'left', fontWeight: '600', color: '#6B7280', textTransform:'uppercase' }}>Quick Demo Presets</div>
            {demoCitizens.map(c => (
              <button 
                key={c.id} 
                onClick={() => selectDemoProfile(c)}
                className={`btn btn-secondary ${phone === c.phone ? 'active' : ''}`}
                style={{ justifyContent: 'space-between', padding: '12px 16px', borderColor: phone === c.phone ? '#1E3A8A' : '#E8E7E3', borderStyle: 'solid', borderWidth:'1.5px', background: phone === c.phone ? '#EFF6FF' : 'white' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', textAlign: 'left' }}>
                  <User size={14} />
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: '600' }}>{c.name}</div>
                    <div style={{ fontSize: '10px', color: '#888' }}>Med Profile: {c.condition}</div>
                  </div>
                </div>
                {phone === c.phone ? <Check size={14} style={{ color: '#1E3A8A' }} /> : <ArrowRight size={12} />}
              </button>
            ))}
          </div>

          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div className="form-group">
              <label>Enter Registered Mobile Number</label>
              <input 
                type="tel" 
                placeholder="+15550000" 
                value={phone} 
                onChange={(e) => setPhone(e.target.value)}
                className="input-field" 
              />
            </div>
            <button className="btn btn-primary btn-full" onClick={handleSendOtp}>
              Send Verification OTP CODE
            </button>
          </div>
        </div>
      )}

      {/* 2. OTP Verification View */}
      {authStep === 'login' && (
        <div className="choice-container">
          <h2 style={{ fontSize: '18px', marginBottom: '8px' }}>Secure OTP Check</h2>
          <p style={{ fontSize: '12px', color: '#666', marginBottom: '16px' }}>
            We sent a verification SMS to <span style={{ fontWeight: '600' }}>{phone}</span>.
          </p>

          <div className="form-group" style={{ width: '100%' }}>
            <label>OTP Code (Mock verification number)</label>
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
            Verify & Proceed
          </button>
          
          <button className="btn btn-secondary btn-full" onClick={() => setAuthStep('landing')} style={{ marginTop: '8px' }}>
            Go Back
          </button>
        </div>
      )}

      {/* 3. Citizen Registration Form */}
      {authStep === 'register' && (
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <h2 style={{ fontSize: '18px', borderBottom: '1px solid #eee', paddingBottom: '8px' }}>Account Registration</h2>
          
          <div className="form-group">
            <label>Full name (Identification tag)</label>
            <input type="text" className="input-field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Alex Smith" />
          </div>

          <div className="form-group">
            <label>Email Address (Account records)</label>
            <input type="email" className="input-field" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="alex.smith@gmail.com" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div className="form-group">
              <label>Date of Birth</label>
              <input type="date" className="input-field" value={dob} onChange={(e) => setDob(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Gender</label>
              <select className="input-field" value={gender} onChange={(e) => setGender(e.target.value)}>
                <option>Male</option>
                <option>Female</option>
                <option>Non-binary</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>Residential Address</label>
            <input type="text" className="input-field" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="740 Park Avenue Apt 4" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
            <input type="text" className="input-field" value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" />
            <input type="text" className="input-field" value={state} onChange={(e) => setState(e.target.value)} placeholder="State" />
            <input type="text" className="input-field" value={pinCode} onChange={(e) => setPinCode(e.target.value)} placeholder="Zip" />
          </div>

          <div style={{ fontSize: '12px', fontWeight: '700', color: '#B91C1C', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Heart size={13} /> EMERGENCY MEDICAL DETAILS (OPTIONAL)
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: '10px' }}>
            <div className="form-group">
              <label>Blood Type</label>
              <select className="input-field" value={bloodGroup} onChange={(e) => setBloodGroup(e.target.value)}>
                <option>O+</option><option>O-</option><option>A+</option><option>A-</option>
                <option>B+</option><option>B-</option><option>AB+</option><option>AB-</option>
              </select>
            </div>
            <div className="form-group">
              <label>Known Allergies</label>
              <input type="text" className="input-field" value={allergies} onChange={(e) => setAllergies(e.target.value)} placeholder="e.g. Penicillin, Nuts" />
            </div>
          </div>

          <div className="form-group">
            <label>Existing Medical Conditions / Medication</label>
            <input type="text" className="input-field" value={meds} onChange={(e) => setMeds(e.target.value)} placeholder="e.g. Asthma, Hypertension, Lisinopril" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div className="form-group">
              <label>Ice Contact Name</label>
              <input type="text" className="input-field" value={emergencyContact} onChange={(e) => setEmergencyContact(e.target.value)} placeholder="Sarah Smith (Wife)" />
            </div>
            <div className="form-group">
              <label>ICE Contact Phone</label>
              <input type="tel" className="input-field" value={emergencyPhone} onChange={(e) => setEmergencyPhone(e.target.value)} placeholder="+15550000" />
            </div>
          </div>

          <button className="btn btn-primary btn-full" onClick={handleRegister} style={{ marginTop: '8px' }}>
            Register Citizen Profile
          </button>
        </div>
      )}

      {/* 4. Geography Consent Verification Page */}
      {authStep === 'consent-location' && (
        <div className="choice-container" style={{ padding: '32px 24px', justifyContent: 'space-between' }}>
          <div>
            <div style={{ width: '48px', height: '48px', backgroundColor: '#DBEAFE', color:'#1E3A8A', borderRadius:'50%', display:'flex', alignItems:'center', justifyContext:'center', justifyContent: 'center', margin:'20px auto 16px auto' }}>
              <MapPin size={24} />
            </div>
            <h2 style={{ fontSize: '18px', marginBottom: '10px' }}>Location Consent Needed</h2>
            <p style={{ fontSize: '12px', color: '#555', lineHeight: '1.5' }}>
              AMBULERT uses your background coordinate location exclusively to determine when a verified ambulance active responder is approaching within a 1 KM radius of your coordinates.
            </p>
            <p style={{ fontSize: '11px', color: '#888', marginTop: '12px', fontStyle: 'italic' }}>
              *We protect your identity. Your address details, medical information, and names are never broadcast to the public maps.
            </p>
          </div>
          <button className="btn btn-primary btn-full" onClick={() => handleGrantConsent('location')}>
            Grant Location Access
          </button>
        </div>
      )}

      {/* 5. Notification Alert Permission Page */}
      {authStep === 'consent-notif' && (
        <div className="choice-container" style={{ padding: '32px 24px', justifyContent: 'space-between' }}>
          <div>
            <div style={{ width: '48px', height: '48px', backgroundColor: '#FEE2E2', color: '#B91C1C', borderRadius:'50%', display:'flex', alignItems:'center', justifyContext:'center', justifyContent: 'center', margin:'20px auto 16px auto' }}>
              <Bell size={24} />
            </div>
            <h2 style={{ fontSize: '18px', marginBottom: '10px' }}>Allow Warnings System</h2>
            <p style={{ fontSize: '12px', color: '#555', lineHeight: '1.5' }}>
              AMBULERT requests permission to push custom auditory and vibrating alerts when ambulances are dangerously close (500 Meters) to your coordinate path.
            </p>
          </div>
          <button className="btn btn-primary btn-full" onClick={() => handleGrantConsent('notification')}>
            Enable Warning Notifications
          </button>
        </div>
      )}

      {/* 6. Main Live Map Track interface */}
      {authStep === 'main' && currentUser && (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', flex: 1, position: 'relative' }}>
          
          {/* Top Info bar */}
          <div style={{ backgroundColor: 'white', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #E8E7E3', zIndex: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ fontWidth: '800', fontWeight: '800', color: '#B91C1C', fontSize: '13px' }}>AMBULERT CITIZEN</div>
              <ShieldCheck size={14} style={{ color: '#15803D' }} />
            </div>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <button 
                onClick={() => setSoundEnabled(!soundEnabled)} 
                style={{ background: 'none', border:'none', padding: '4px', cursor:'pointer' }}
                title={soundEnabled ? 'Disable beeps' : 'Enable beeps'}
              >
                {soundEnabled ? <Volume2 size={15} style={{ color: '#555' }} /> : <VolumeX size={15} style={{ color: '#888' }} />}
              </button>
              <button onClick={handleLogout} style={{ fontSize: '10px', backgroundColor: '#F3F4F6', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}>
                Logout
              </button>
            </div>
          </div>

          {/* Active 1 KM Geofence Toast Warning overlay */}
          {toastNotification && (
            <div className="notification-banner">
              <div style={{ width: '20px', height: '20px', backgroundColor: '#FEE2E2', color: '#B91C1C', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent: 'center', flexShrink:0 }}>
                🚨
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#111' }}>{toastNotification.title}</div>
                <div style={{ fontSize: '11px', color: '#555', marginTop: '2px', lineHeight: '1.3' }}>{toastNotification.msg}</div>
              </div>
              <button 
                onClick={() => {
                  if (activeAlertSession) {
                    setDismissedToastTripId(activeAlertSession.tripId);
                  }
                  setToastNotification(null);
                }} 
                style={{ fontSize:'10px', color: '#888', background:'none', border:'none', cursor:'pointer', fontWeight:'bold', padding:'2px' }}
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Full Screen Map Block */}
          <div style={{ flex: 1, position: 'relative' }}>
            <MapView 
              center={[currentUser.lat, currentUser.lng]}
              zoom={14}
              user={{ lat: currentUser.lat, lng: currentUser.lng, name: currentUser.name }}
              ambulance={activeAmbulanceLoc}
              route={showRouteOnMap && activeTrip ? activeTrip.route : []}
              hospitals={activeTrip ? [activeTrip.destination] : []}
            />

            {/* Float Menu Toggle to show/hide path details */}
            {activeTrip && (
              <div style={{ position: 'absolute', top: toastNotification ? '135px' : '65px', right: '10px', zIndex: 10, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <button 
                  onClick={() => setShowRouteOnMap(!showRouteOnMap)}
                  style={{ backgroundColor: 'white', border: '1px solid #CCC', borderRadius:'8px', padding: '6px 12px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', boxShadow: '0 2px 6px rgba(0,0,0,0.15)' }}
                >
                  {showRouteOnMap ? 'Hide Route path' : 'Show Route path'}
                </button>
              </div>
            )}
          </div>

          {/* Dynamic State Machine Bottom Screen HUD */}
          <div 
            className="bottom-sheet" 
            style={{ 
              borderColor: activeAlertSession?.currentState === 'ENTERED_500M' ? '#B91C1C' : '#E8E7E3',
              borderWidth: activeAlertSession?.currentState === 'ENTERED_500M' ? '1.5px' : '1px',
              borderStyle: 'solid'
            }}
          >
            <div className="bottom-sheet-handle"></div>

            {/* State NORMAL (No ambulance nearby) */}
            {(!activeAlertSession || activeAlertSession.currentState === 'NORMAL' || activeAlertSession.currentState === 'COMPLETED') && (
              <div style={{ textAlign: 'center', padding: '4px 0 10px 0' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', backgroundColor: '#DCFCE7', color: '#166534', padding: '4px 12px', borderRadius: '50px', fontSize: '11px', fontWeight: '700', marginBottom: '8px' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#15803D' }}></span>
                  NO EMERGENCY NEARBY
                </div>
                <h3 style={{ fontSize: '14px', fontWeight: '600' }}>Your Road corridor is Clear</h3>
                <p style={{ fontSize: '11px', color: '#6B7280', marginTop: '2px' }}>
                  AMBULERT is polling GPS coordinates in the background. Ready to alert you.
                </p>
              </div>
            )}

            {/* State ENTERED_1KM (Approaching Alert) */}
            {activeAlertSession && activeAlertSession.currentState === 'ENTERED_1KM' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', backgroundColor: '#FEF3C7', color: '#92400E', padding: '4px 12px', borderRadius: '50px', fontSize: '11px', fontWeight: '700' }}>
                    🚑 AMBULANCE IN 1 KM RADIUS
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: '800', color: '#92400E' }}>
                    {activeAlertSession.distance}m away
                  </div>
                </div>
                
                <h3 style={{ fontSize: '14px', fontWeight: '700' }}>Approaching Rescue Vehicle</h3>
                <p style={{ fontSize: '11px', color: '#555', marginTop: '2px', lineHeight: '1.4' }}>
                  A verified responsive ambulance is streaming location. Intended destination: <span style={{ fontWeight: '600' }}>{activeAlertSession.destination?.name || 'Local Hospital'}</span>.
                </p>
                <div style={{ fontSize: '10px', color: '#B91C1C', marginTop: '6px', fontWeight: '600', backgroundColor: '#FEE2E2', padding: '4px 8px', borderRadius: '4px' }}>
                  💡 Instruction: Prepare to yield and safely make way if on the road.
                </div>
              </div>
            )}

            {/* State ENTERED_500M (Close Proximity Alarm - Vibrations) */}
            {activeAlertSession && activeAlertSession.currentState === 'ENTERED_500M' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', backgroundColor: '#FEE2E2', color: '#991B1B', padding: '4px 10px', borderRadius: '50px', fontSize: '10px', fontWeight: '800' }}>
                    🚨 VIBRATING WARNING
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: '800', color: '#B91C1C' }}>
                    {activeAlertSession.distance}m away
                  </div>
                </div>

                <div style={{ margin: '4px 0' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: '800', color: '#B91C1C' }}>Ambulance is Very Close</h3>
                  <p style={{ fontSize: '11px', color: '#111', marginTop: '1px', lineHeight: '1.3' }}>
                    Please pull over right to clear the path. Speed: <b>{Math.round((activeAmbulanceLoc?.speed || 12) * 3.6)} km/h</b>.
                  </p>
                </div>

                {/* Swipe right to silence container widget */}
                <div 
                  className="swipe-track" 
                  ref={swipeTrackRef}
                  onTouchStart={handleTouchStart}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleEnd}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleEnd}
                >
                  <div 
                    className="swipe-handle"
                    style={{ transform: `translateX(${swipeOffset}px)` }}
                  >
                    ➔
                  </div>
                  <span className="swipe-label">Swipe right to silence</span>
                </div>
              </div>
            )}

            {/* State USER_SILENCED (Silenced but still in ranges) */}
            {activeAlertSession && activeAlertSession.currentState === 'USER_SILENCED' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', backgroundColor: '#E5E7EB', color: '#374151', padding: '4px 12px', borderRadius: '50px', fontSize: '10px', fontWeight: '700' }}>
                    🔕 WARNING SILENCED
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: '#374151' }}>
                    {activeAlertSession.distance}m away
                  </div>
                </div>
                <h3 style={{ fontSize: '13px', fontWeight: '600' }}>Vibration Alerts Suspended</h3>
                <p style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>
                  You Silenced the warning vibration. Live tracking remains active until the ambulance passes.
                </p>
              </div>
            )}

            {/* State ENTERED_50M (Passing by - Automatic Stop) */}
            {activeAlertSession && activeAlertSession.currentState === 'ENTERED_50M' && (
              <div style={{ textAlign: 'center', padding: '4px 0' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', backgroundColor: '#FEE2E2', color: '#B91C1C', padding: '4px 12px', borderRadius: '50px', fontSize: '11px', fontWeight: '800', marginBottom: '6px' }}>
                  🛑 AMBULANCE IMMINENT
                </div>
                <h3 style={{ fontSize: '14px', fontWeight: '800', color: '#B91C1C' }}>Ambulance is Passing Now</h3>
                <p style={{ fontSize: '11px', color: '#555', marginTop: '2px' }}>
                  Vibrations disabled automatically to prevent hazard distraction. Please hold position.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

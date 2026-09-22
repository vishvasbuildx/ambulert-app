/**
 * AMBULERT - Authentication and Profile Management Router
 */

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const db = require('../services/InMemoryDB');
const { authenticateJWT, JWT_SECRET } = require('../middleware/authMiddleware');

// Store pending OTP verification codes in-memory (phone -> OTP block)
const pendingOtps = new Map();

/**
 * Send OTP Code (Mocked phone gateway)
 * POST /auth/otp/send
 */
router.post('/otp/send', (req, res) => {
  const { phone, role } = req.body;

  if (!phone) {
    return res.status(400).json({ error: 'Mobile number is required' });
  }

  // Generate a mock 6-digit OTP code (e.g. 123456 by default for demo ease)
  const otpCode = process.env.MOCK_OTP_CODE || '123456';
  pendingOtps.set(phone, {
    code: otpCode,
    expiresAt: Date.now() + 300000 // 5 Minute expiration
  });

  console.log(`✉️ [SMS MOCK GATEWAY] Sent OTP [${otpCode}] to ${phone} for role: ${role || 'CITIZEN'}`);

  return res.status(200).json({
    message: 'OTP verification code sent safely via SMS',
    phone,
    demoOtp: otpCode // Expose for easy testing in client simulator
  });
});

/**
 * Verify OTP Code
 * POST /auth/otp/verify
 */
router.post('/otp/verify', (req, res) => {
  const { phone, code, role } = req.body;

  if (!phone || !code) {
    return res.status(400).json({ error: 'Mobile phone number and OTP code are required' });
  }

  const storedOtp = pendingOtps.get(phone);

  if (!storedOtp) {
    return res.status(400).json({ error: 'No active OTP verification session found for this number' });
  }

  if (Date.now() > storedOtp.expiresAt) {
    pendingOtps.delete(phone);
    return res.status(400).json({ error: 'OTP code has expired. Please request a new one.' });
  }

  if (storedOtp.code !== code) {
    return res.status(400).json({ error: 'Invalid verification code' });
  }

  // Clear OTP code once verified
  pendingOtps.delete(phone);

  // Check if User already exists
  const existingUser = db.findUserByPhone(phone);

  if (existingUser) {
    // User exists - sign token and return Profile details
    const token = jwt.sign({ id: existingUser.id, role: existingUser.role }, JWT_SECRET, { expiresIn: '7d' });
    
    // Retrieve associated driver status if applicable
    let driverStatus = null;
    if (existingUser.role === 'DRIVER') {
      for (const d of db.drivers.values()) {
        if (d.userId === existingUser.id) {
          driverStatus = d.verificationStatus;
          break;
        }
      }
    }

    return res.status(200).json({
      isRegistered: true,
      token,
      user: existingUser,
      driverStatus
    });
  } else {
    // User does not exist yet - prompt Client to display Registration Forms
    return res.status(200).json({
      isRegistered: false,
      message: 'Mobile number verified successfully. Please submit registration forms.',
      phone
    });
  }
});

/**
 * Full Registration for Citizen and Drivers
 * POST /auth/register
 */
router.post('/register', (req, res) => {
  const { 
    phone, 
    role, 
    name, 
    email, 
    dateOfBirth, 
    gender, 
    address, 
    city, 
    state, 
    pinCode, 
    emergencyProfile,
    // Driver & vehicle fields
    licenseNumber,
    licenseValidity,
    licenseClass,
    employer,
    driverID,
    credentials,
    regNumber,
    ambulanceType,
    insuranceExpiry,
    fitnessExpiry
  } = req.body;

  if (!phone || !role || !name) {
    return res.status(400).json({ error: 'Name, verification phone, and Role are mandatory' });
  }

  // Double check duplicates
  if (db.findUserByPhone(phone)) {
    return res.status(500).json({ error: 'A profile is already registered under this mobile number' });
  }

  const userId = `usr-${Date.now()}`;
  const newUser = {
    id: userId,
    name,
    phone,
    email: email || '',
    dateOfBirth,
    gender,
    address,
    city,
    state,
    pinCode,
    role: role || 'CITIZEN',
    accountStatus: 'ACTIVE',
    locationConsent: false, // Explicit consent needed from user post-auth
    notificationConsent: false,
    createdAt: new Date().toISOString()
  };

  if (role === 'CITIZEN') {
    // Save optional emergency profile files
    newUser.emergencyProfile = {
      bloodGroup: emergencyProfile?.bloodGroup || '',
      allergies: emergencyProfile?.allergies || '',
      conditions: emergencyProfile?.conditions || '',
      medications: emergencyProfile?.medications || '',
      contactName: emergencyProfile?.contactName || '',
      contactNumber: emergencyProfile?.contactNumber || ''
    };
    db.users.set(userId, newUser);
  } else if (role === 'DRIVER') {
    // Create Driver profile
    const driverId = `drv-${Date.now()}`;
    const newDriver = {
      id: driverId,
      userId: userId,
      drivingLicence: {
        number: licenseNumber || '',
        validity: licenseValidity || '',
        classCategory: licenseClass || ''
      },
      professionalDetails: {
        employer: employer || '',
        driverID: driverID || '',
        credentials: credentials || ''
      },
      verificationStatus: 'PENDING_VERIFICATION', // Every new driver profile starts here
      createdAt: new Date().toISOString()
    };

    // Create Ambulance vehicle profile
    const ambId = `amb-${Date.now()}`;
    const newAmbulance = {
      id: ambId,
      driverId: driverId,
      registrationNumber: regNumber || '',
      ambulanceType: ambulanceType || 'BLS (Basic Life Support)',
      verificationStatus: 'PENDING_VERIFICATION',
      insuranceExpiry: insuranceExpiry || '',
      fitnessPermitExpiry: fitnessExpiry || '',
      createdAt: new Date().toISOString()
    };

    db.users.set(userId, newUser);
    db.drivers.set(driverId, newDriver);
    db.ambulances.set(ambId, newAmbulance);
  } else if (role === 'ADMIN') {
    newUser.role = 'ADMIN';
    db.users.set(userId, newUser);
  }

  const token = jwt.sign({ id: userId, role: newUser.role }, JWT_SECRET, { expiresIn: '7d' });

  return res.status(201).json({
    message: 'Registered account successfully',
    token,
    user: newUser,
    driverStatus: role === 'DRIVER' ? 'PENDING_VERIFICATION' : null
  });
});

/**
 * Fetch Current Authorized Profile
 * GET /auth/me
 */
router.get('/me', authenticateJWT, (req, res) => {
  let driverProfile = null;
  let vehicleProfile = null;

  if (req.user.role === 'DRIVER') {
    for (const d of db.drivers.values()) {
      if (d.userId === req.user.id) {
        driverProfile = d;
        // Fetch driver's vehicle info
        for (const a of db.ambulances.values()) {
          if (a.driverId === d.id) {
            vehicleProfile = a;
            break;
          }
        }
        break;
      }
    }
  }

  return res.status(200).json({
    user: req.user,
    driver: driverProfile,
    ambulance: vehicleProfile
  });
});

/**
 * Update Location & Notification Permissions Consent
 * PATCH /auth/consent
 */
router.patch('/consent', authenticateJWT, (req, res) => {
  const { locationConsent, notificationConsent } = req.body;
  
  if (typeof locationConsent === 'boolean') {
    req.user.locationConsent = locationConsent;
  }
  if (typeof notificationConsent === 'boolean') {
    req.user.notificationConsent = notificationConsent;
  }

  db.users.set(req.user.id, req.user);

  return res.status(200).json({
    message: 'Permissions consent state updated successfully',
    user: req.user
  });
});

/**
 * Update Emergency Health Profile
 * PATCH /auth/emergency-profile
 */
router.patch('/emergency-profile', authenticateJWT, (req, res) => {
  const { emergencyProfile } = req.body;

  if (!emergencyProfile) {
    return res.status(400).json({ error: 'Emergency profile payload cannot be empty' });
  }

  req.user.emergencyProfile = {
    bloodGroup: emergencyProfile.bloodGroup || '',
    allergies: emergencyProfile.allergies || '',
    conditions: emergencyProfile.conditions || '',
    medications: emergencyProfile.medications || '',
    contactName: emergencyProfile.contactName || '',
    contactNumber: emergencyProfile.contactNumber || ''
  };

  db.users.set(req.user.id, req.user);

  return res.status(200).json({
    message: 'Medical summary profile updated successfully',
    user: req.user
  });
});

module.exports = router;

/**
 * AMBULERT - In-Memory Database and State Manager
 * Ensures fallback-first robustness for real-time demonstration
 */

const mockHospitals = [
  {
    id: "hosp-1",
    name: "St. Mary's Emergency Care",
    lat: 40.78987,
    lng: -73.9529,
    address: "1190 5th Ave, New York, NY 10029",
    phone: "+1 212-241-6500",
    distanceKm: 0.8,
    travelTimeSec: 180,
    icuBedsAvailable: 8,
    emergencyRating: "Level 1 Trauma Center"
  },
  {
    id: "hosp-2",
    name: "Metropolitan Hospital Center",
    lat: 40.7845,
    lng: -73.9439,
    address: "1901 1st Ave, New York, NY 10029",
    phone: "+1 212-423-6262",
    distanceKm: 1.4,
    travelTimeSec: 290,
    icuBedsAvailable: 4,
    emergencyRating: "Level 2 Trauma Center"
  },
  {
    id: "hosp-3",
    name: "Lenox Hill Emergency Room",
    lat: 40.7699,
    lng: -73.9602,
    address: "100 E 77th St, New York, NY 10075",
    phone: "+1 212-434-2000",
    distanceKm: 2.1,
    travelTimeSec: 420,
    icuBedsAvailable: 12,
    emergencyRating: "Level 1 Trauma Center"
  }
];

class InMemoryDB {
  constructor() {
    this.users = new Map();
    this.drivers = new Map();
    this.ambulances = new Map();
    this.trips = new Map();
    this.locations = new Map();
    this.alertSessions = new Map();
    this.hospitals = [...mockHospitals];

    this.initializeDemoData();
  }

  initializeDemoData() {
    // 1. Create Demo Citizens (with their locations set along the Park Avenue / 5th Ave route)
    const demoCitizens = [
      {
        id: "citizen-a",
        name: "Alex Smith",
        phone: "+15550100",
        email: "alex.smith@example.com",
        dateOfBirth: "1990-05-15",
        gender: "Male",
        address: "740 Park Ave",
        city: "New York",
        state: "NY",
        pinCode: "10021",
        accountStatus: "ACTIVE",
        locationConsent: true,
        notificationConsent: true,
        lat: 40.7812, // Citizen A (Around 71st St)
        lng: -73.9665,
        emergencyProfile: {
          bloodGroup: "O+",
          allergies: "Penicillin",
          conditions: "Mild asthma",
          medications: "Albuterol inhaler",
          contactName: "Sarah Smith (Wife)",
          contactNumber: "+15550105"
        }
      },
      {
        id: "citizen-b",
        name: "Bobby Brown",
        phone: "+15550200",
        email: "bobby.b@example.com",
        dateOfBirth: "1985-11-20",
        gender: "Male",
        address: "930 5th Ave",
        city: "New York",
        state: "NY",
        pinCode: "10021",
        accountStatus: "ACTIVE",
        locationConsent: true,
        notificationConsent: true,
        lat: 40.7835, // Citizen B (Around 74th St)
        lng: -73.9620,
        emergencyProfile: {
          bloodGroup: "A-",
          allergies: "Nuts",
          conditions: "None",
          medications: "None",
          contactName: "James Brown (Father)",
          contactNumber: "+15550205"
        }
      },
      {
        id: "citizen-c",
        name: "Charlie Davis",
        phone: "+15550300",
        email: "charlie.d@example.com",
        dateOfBirth: "1962-02-08",
        gender: "Non-binary",
        address: "1060 5th Ave",
        city: "New York",
        state: "NY",
        pinCode: "10028",
        accountStatus: "ACTIVE",
        locationConsent: true,
        notificationConsent: true,
        lat: 40.7870, // Citizen C (Around 87th St)
        lng: -73.9550,
        emergencyProfile: {
          bloodGroup: "B+",
          allergies: "Shellfish",
          conditions: "Hypertension",
          medications: "Lisinopril",
          contactName: "Mary Davis (Sister)",
          contactNumber: "+15550305"
        }
      }
    ];

    demoCitizens.forEach(c => this.users.set(c.id, c));

    // 2. Create Demo Drivers (some Verified, one Pending for Demo purposes)
    const driver1User = {
      id: "drv-user-1",
      name: "Marcus Vance",
      phone: "+15550999",
      email: "marcus.vance@ambulert-fleet.org",
      dateOfBirth: "1982-04-12",
      gender: "Male",
      address: "14 Broad St",
      city: "New York",
      state: "NY",
      pinCode: "10005",
      accountStatus: "ACTIVE",
      role: "DRIVER"
    };
    this.users.set(driver1User.id, driver1User);

    const driver1Profile = {
      id: "driver-1",
      userId: "drv-user-1",
      drivingLicence: {
        number: "DL-AMB-NYC-4921",
        validity: "2029-12-31",
        classCategory: "Class E - Emergency Vehicle"
      },
      professionalDetails: {
        employer: "NYC Emergency Ambulance Corp",
        driverID: "EMP-4921",
        credentials: "EMT-Paramedic, EVOC (Emergency Vehicle Operator Course) Certified",
      },
      verificationStatus: "VERIFIED" // Verified Driver
    };
    this.drivers.set(driver1Profile.id, driver1Profile);

    const vehicle1 = {
      id: "amb-1",
      driverId: "driver-1",
      operatorId: "operator-nyc-ems",
      registrationNumber: "NYC-AMB-01",
      ambulanceType: "ALS (Advanced Life Support)",
      verificationStatus: "VERIFIED",
      insuranceExpiry: "2027-08-01",
      fitnessPermitExpiry: "2027-04-15"
    };
    this.ambulances.set(vehicle1.id, vehicle1);

    // Unverified/Pending Driver
    const driver2User = {
      id: "drv-user-2",
      name: "Jack Miller",
      phone: "+15550777",
      email: "jack.miller@rapidmedical.net",
      dateOfBirth: "1994-09-30",
      gender: "Male",
      address: "58 Pine St",
      city: "New York",
      state: "NY",
      pinCode: "10005",
      accountStatus: "ACTIVE",
      role: "DRIVER"
    };
    this.users.set(driver2User.id, driver2User);

    const driver2Profile = {
      id: "driver-2",
      userId: "drv-user-2",
      drivingLicence: {
        number: "DL-AMB-NYC-7890",
        validity: "2028-06-15",
        classCategory: "Class D - Standard Commercial"
      },
      professionalDetails: {
        employer: "Rapid Response Medical transport LLC",
        driverID: "EMP-519",
        credentials: "EMT-Basic",
      },
      verificationStatus: "PENDING_VERIFICATION" // Mock Admin View approval
    };
    this.drivers.set(driver2Profile.id, driver2Profile);

    const vehicle2 = {
      id: "amb-2",
      driverId: "driver-2",
      operatorId: "operator-rapid",
      registrationNumber: "NYC-AMB-99",
      ambulanceType: "BLS (Basic Life Support)",
      verificationStatus: "PENDING_VERIFICATION",
      insuranceExpiry: "2027-01-10",
      fitnessPermitExpiry: "2026-11-20"
    };
    this.ambulances.set(vehicle2.id, vehicle2);
  }

  // Database Accessors Helper
  findUserByPhone(phone) {
    for (const user of this.users.values()) {
      if (user.phone === phone) return user;
    }
    return null;
  }
}

// Singleton structure
const dbInstance = new InMemoryDB();
module.exports = dbInstance;

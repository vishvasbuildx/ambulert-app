/**
 * AMBULERT - Map Only Application
 * Replaces the dashboard with a full-screen emergency control map.
 */
import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import EmergencyMap from './components/EmergencyMap';

export default function App() {
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    // Attempt connection to background Express service
    const s = io('http://localhost:5000', {
      transports: ['websocket'],
      timeout: 2000
    });

    s.on('connect', () => {
      console.log('AMBULERT Backend Connected');
      setSocket(s);
    });

    return () => s.disconnect();
  }, []);

  return <EmergencyMap socket={socket} />;
}

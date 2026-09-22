/**
 * AMBULERT - Smartphone Chassis Wrapper Component
 * Emulates physical Android/iOS frames for browser side-by-side cockpit viewing.
 */

import React from 'react';
import { Wifi, Battery, Radio } from 'lucide-react';

export default function DeviceSimulator({ title, subtitle, children, darkStatusBar = false, headerColor = '#FAF9F6' }) {
  // Get time format to display on the status bar
  const formatTime = () => {
    const d = new Date();
    let hrs = d.getHours();
    let mins = d.getMinutes();
    const ampm = hrs >= 12 ? 'PM' : 'AM';
    hrs = hrs % 12;
    hrs = hrs ? hrs : 12;
    mins = mins < 10 ? '0' + mins : mins;
    return `${hrs}:${mins} ${ampm}`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
      <div style={{ fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6B7280' }}>
        {title} <span style={{ fontWeight: '400', textTransform: 'none' }}>({subtitle})</span>
      </div>
      
      <div className="phone-casing">
        <div className="phone-notch"></div>
        <div className="phone-screen">
          {/* Simulated Hardware Status Bar */}
          <div 
            className={`phone-status-bar ${darkStatusBar ? 'light-text' : 'dark-text'}`}
            style={{ backgroundColor: headerColor, transition: 'background-color 0.3s' }}
          >
            <span>{formatTime()}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Radio size={10} style={{ color: '#10B981' }} />
              <span style={{ fontSize: '9px', fontWeight: '500' }}>GPS</span>
              <Wifi size={11} />
              <Battery size={13} style={{ transform: 'rotate(0deg)' }} />
            </div>
          </div>
          
          {/* App Body Content */}
          <div className="phone-body">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

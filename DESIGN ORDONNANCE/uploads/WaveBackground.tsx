import React from 'react';

export const WaveBackground: React.FC = () => {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
      {/* Gradient Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50" />
      
      {/* Animated Waves SVG */}
      <svg
        className="absolute w-full h-full wave-animation"
        viewBox="0 0 1200 800"
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Wave 1 - Light Emerald */}
        <path
          d="M0,300 Q300,250 600,300 T1200,300 L1200,0 L0,0 Z"
          fill="rgba(16, 185, 129, 0.08)"
          opacity="0.9"
        />
        
        {/* Wave 2 - Medium Teal */}
        <path
          d="M0,400 Q300,350 600,400 T1200,400 L1200,100 Q600,50 0,100 Z"
          fill="rgba(20, 184, 166, 0.06)"
          opacity="0.7"
        />
        
        {/* Wave 3 - Light Cyan */}
        <path
          d="M0,500 Q300,450 600,500 T1200,500 L1200,250 Q600,150 0,250 Z"
          fill="rgba(6, 182, 212, 0.05)"
          opacity="0.5"
        />
        
        {/* Soft Circles for Depth */}
        <circle cx="100" cy="200" r="150" fill="rgba(16, 185, 129, 0.03)" />
        <circle cx="1100" cy="600" r="200" fill="rgba(20, 184, 166, 0.04)" />
        <circle cx="600" cy="800" r="250" fill="rgba(6, 182, 212, 0.02)" />
      </svg>
    </div>
  );
};

export default WaveBackground;

/* Hero artwork: a glossy, extruded electric-blue lightning bolt on a glass base, with restrained energy rings.
   Pure SVG (no raster asset, no text inside the artwork). Decorative: hidden from assistive technology. */
export default function EnergyBolt() {
  const bolt = 'M177 20 L80 211 Q75 222 89 220 L138 210 L101 379 L233 170 Q240 159 224 161 L169 171 Z';
  return (
    <svg viewBox="0 0 320 470" role="presentation" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="lpb-front" x1="0.15" y1="0" x2="0.85" y2="1">
          <stop offset="0%" stopColor="#e9fbff" />
          <stop offset="22%" stopColor="#7fdcff" />
          <stop offset="55%" stopColor="#2a8cf5" />
          <stop offset="100%" stopColor="#0b48b0" />
        </linearGradient>
        <linearGradient id="lpb-side" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1557c4" />
          <stop offset="100%" stopColor="#082f78" />
        </linearGradient>
        <linearGradient id="lpb-edge" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#7fdcff" stopOpacity="0.2" />
        </linearGradient>
        <radialGradient id="lpb-aura" cx="50%" cy="46%" r="50%">
          <stop offset="0%" stopColor="#8fe0ff" stopOpacity="0.55" />
          <stop offset="60%" stopColor="#8fe0ff" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#8fe0ff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="lpb-base" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#bfdcf3" stopOpacity="0.6" />
        </linearGradient>
        <filter id="lpb-soft" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>

      {/* soft aura behind the bolt */}
      <ellipse cx="160" cy="215" rx="158" ry="205" fill="url(#lpb-aura)" />

      {/* energy rings */}
      <ellipse cx="160" cy="220" rx="132" ry="44" fill="none" stroke="#5bc8ff" strokeOpacity="0.55" strokeWidth="1.6" transform="rotate(-14 160 220)" />
      <ellipse cx="160" cy="232" rx="150" ry="52" fill="none" stroke="#9fe3ff" strokeOpacity="0.35" strokeWidth="1" transform="rotate(10 160 232)" />

      {/* glass base */}
      <ellipse cx="160" cy="432" rx="104" ry="22" fill="#2a8cf5" opacity="0.25" filter="url(#lpb-soft)" />
      <ellipse cx="160" cy="420" rx="96" ry="20" fill="url(#lpb-base)" stroke="#ffffff" strokeOpacity="0.9" />
      <ellipse cx="160" cy="416" rx="70" ry="12" fill="#e9f6ff" stroke="#9fd6f7" strokeOpacity="0.8" />

      {/* extruded bolt: side face, then front face */}
      <g transform="translate(8 10)">
        <path d={bolt} transform="translate(12 10)" fill="url(#lpb-side)" />
        <path d={bolt} fill="url(#lpb-front)" stroke="url(#lpb-edge)" strokeWidth="3.5" strokeLinejoin="round" />
        <path d="M176 32 L105 195 L151 186 L126 333 L214 174 L159 184 Z" fill="#d6f8ff" fillOpacity="0.28" />
        <path d="M185 43 L121 188" stroke="#ffffff" strokeOpacity="0.85" strokeWidth="5" strokeLinecap="round" />
        <path d="M150 220 L122 336" stroke="#ffffff" strokeOpacity="0.45" strokeWidth="3" strokeLinecap="round" />
      </g>

      {/* restrained cyan trails (the only motion; disabled for reduced-motion users) */}
      <path className="lp-trail" d="M44 150 C8 206 26 284 70 312" fill="none" stroke="#36c6f4" strokeOpacity="0.75" strokeWidth="2" strokeLinecap="round" />
      <path className="lp-trail" d="M262 110 C306 152 312 226 268 270" fill="none" stroke="#5aa8ff" strokeOpacity="0.6" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

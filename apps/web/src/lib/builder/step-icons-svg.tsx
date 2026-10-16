import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { className?: string };

export function IconCpu({ className, ...p }: P) {
  return (
    <svg viewBox="0 0 64 64" fill="none" className={className} {...p}>
      <rect x="16" y="16" width="32" height="32" rx="3" stroke="currentColor" strokeWidth="2.5" fill="none"/>
      <rect x="21" y="21" width="22" height="22" rx="1.5" stroke="currentColor" strokeWidth="1.5" fill="currentColor" fillOpacity="0.15"/>
      <line x1="22" y1="28" x2="22" y2="36" stroke="currentColor" strokeWidth="1.2"/>
      <line x1="27" y1="28" x2="27" y2="36" stroke="currentColor" strokeWidth="1.2"/>
      <line x1="32" y1="28" x2="32" y2="36" stroke="currentColor" strokeWidth="1.2"/>
      <line x1="37" y1="28" x2="37" y2="36" stroke="currentColor" strokeWidth="1.2"/>
      <line x1="28" y1="22" x2="36" y2="22" stroke="currentColor" strokeWidth="1.2"/>
      <line x1="28" y1="42" x2="36" y2="42" stroke="currentColor" strokeWidth="1.2"/>
      {/* Pins top */}
      {[20,24,28,32,36,40,44].map(x => <rect key={`t${x}`} x={x} y="8" width="2" height="8" rx="1" fill="currentColor"/>)}
      {/* Pins bottom */}
      {[20,24,28,32,36,40,44].map(x => <rect key={`b${x}`} x={x} y="48" width="2" height="8" rx="1" fill="currentColor"/>)}
      {/* Pins left */}
      {[20,24,28,32,36,40,44].map(y => <rect key={`l${y}`} x="8" y={y} width="8" height="2" rx="1" fill="currentColor"/>)}
      {/* Pins right */}
      {[20,24,28,32,36,40,44].map(y => <rect key={`r${y}`} x="48" y={y} width="8" height="2" rx="1" fill="currentColor"/>)}
    </svg>
  );
}

export function IconMotherboard({ className, ...p }: P) {
  return (
    <svg viewBox="0 0 64 64" fill="none" className={className} {...p}>
      <rect x="6" y="8" width="52" height="48" rx="3" stroke="currentColor" strokeWidth="2" fill="currentColor" fillOpacity="0.08"/>
      {/* CPU socket */}
      <rect x="22" y="18" width="14" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.5" fill="none"/>
      <rect x="25" y="21" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1" fill="currentColor" fillOpacity="0.2"/>
      {/* RAM slots */}
      <rect x="40" y="12" width="4" height="20" rx="1" stroke="currentColor" strokeWidth="1.2" fill="currentColor" fillOpacity="0.15"/>
      <rect x="46" y="12" width="4" height="20" rx="1" stroke="currentColor" strokeWidth="1.2" fill="currentColor" fillOpacity="0.15"/>
      {/* PCIe slot */}
      <rect x="10" y="38" width="36" height="4" rx="1" stroke="currentColor" strokeWidth="1.2" fill="currentColor" fillOpacity="0.15"/>
      <rect x="10" y="44" width="24" height="4" rx="1" stroke="currentColor" strokeWidth="1.2" fill="currentColor" fillOpacity="0.15"/>
      {/* Connectors */}
      <rect x="10" y="12" width="8" height="6" rx="1" stroke="currentColor" strokeWidth="1" fill="currentColor" fillOpacity="0.2"/>
      {/* Traces */}
      <path d="M36 25 L40 25" stroke="currentColor" strokeWidth="1" strokeDasharray="1 1"/>
      <path d="M36 22 L40 22" stroke="currentColor" strokeWidth="1" strokeDasharray="1 1"/>
    </svg>
  );
}

export function IconRam({ className, ...p }: P) {
  return (
    <svg viewBox="0 0 64 64" fill="none" className={className} {...p}>
      <rect x="8" y="20" width="48" height="24" rx="2" stroke="currentColor" strokeWidth="2" fill="currentColor" fillOpacity="0.1"/>
      {/* Chips */}
      {[12,20,28,36,44].map(x => (
        <rect key={x} x={x} y="25" width="5" height="8" rx="1" stroke="currentColor" strokeWidth="1.2" fill="currentColor" fillOpacity="0.3"/>
      ))}
      {/* Notch */}
      <rect x="30" y="42" width="4" height="4" rx="0.5" fill="currentColor" fillOpacity="0.4"/>
      {/* Gold contacts */}
      {[10,13,16,19,22,25,28,31,34,37,40,43,46,49].map(x => (
        <rect key={x} x={x} y="44" width="2" height="6" rx="0.5" fill="currentColor" fillOpacity="0.6"/>
      ))}
      {/* Top notch */}
      <rect x="28" y="18" width="8" height="3" rx="0.5" fill="var(--background)" stroke="currentColor" strokeWidth="1"/>
    </svg>
  );
}

export function IconGpu({ className, ...p }: P) {
  return (
    <svg viewBox="0 0 64 64" fill="none" className={className} {...p}>
      <rect x="4" y="16" width="56" height="32" rx="3" stroke="currentColor" strokeWidth="2" fill="currentColor" fillOpacity="0.08"/>
      {/* Fan circles */}
      <circle cx="22" cy="32" r="10" stroke="currentColor" strokeWidth="1.5" fill="none"/>
      <circle cx="22" cy="32" r="3" stroke="currentColor" strokeWidth="1.2" fill="currentColor" fillOpacity="0.3"/>
      <path d="M22 22 Q26 27 22 32 Q18 27 22 22Z" fill="currentColor" fillOpacity="0.4"/>
      <path d="M32 32 Q27 28 22 32 Q27 36 32 32Z" fill="currentColor" fillOpacity="0.4"/>
      <path d="M22 42 Q18 37 22 32 Q26 37 22 42Z" fill="currentColor" fillOpacity="0.4"/>
      <path d="M12 32 Q17 36 22 32 Q17 28 12 32Z" fill="currentColor" fillOpacity="0.4"/>
      {/* Second fan */}
      <circle cx="42" cy="32" r="10" stroke="currentColor" strokeWidth="1.5" fill="none"/>
      <circle cx="42" cy="32" r="3" stroke="currentColor" strokeWidth="1.2" fill="currentColor" fillOpacity="0.3"/>
      <path d="M42 22 Q46 27 42 32 Q38 27 42 22Z" fill="currentColor" fillOpacity="0.4"/>
      <path d="M52 32 Q47 28 42 32 Q47 36 52 32Z" fill="currentColor" fillOpacity="0.4"/>
      <path d="M42 42 Q38 37 42 32 Q46 37 42 42Z" fill="currentColor" fillOpacity="0.4"/>
      <path d="M32 32 Q37 36 42 32 Q37 28 32 32Z" fill="currentColor" fillOpacity="0.4"/>
      {/* PCIe connector */}
      {[8,11,14,17,20,23,26,29,32,35,38,41,44,47,50,53].map(x => (
        <rect key={x} x={x} y="46" width="1.5" height="5" rx="0.5" fill="currentColor" fillOpacity="0.5"/>
      ))}
    </svg>
  );
}

export function IconSsd({ className, ...p }: P) {
  return (
    <svg viewBox="0 0 64 64" fill="none" className={className} {...p}>
      {/* M.2 form factor */}
      <rect x="28" y="8" width="8" height="48" rx="2" stroke="currentColor" strokeWidth="2" fill="currentColor" fillOpacity="0.08"/>
      {/* Chips on M.2 */}
      <rect x="30" y="13" width="4" height="6" rx="0.5" fill="currentColor" fillOpacity="0.4"/>
      <rect x="30" y="22" width="4" height="6" rx="0.5" fill="currentColor" fillOpacity="0.4"/>
      <rect x="30" y="31" width="4" height="6" rx="0.5" fill="currentColor" fillOpacity="0.4"/>
      {/* Gold edge contacts */}
      {[10,12,14,16,18,20,22,24].map(y => (
        <rect key={y} x="27" y={y+34} width="2" height="1.2" rx="0.3" fill="currentColor" fillOpacity="0.7"/>
      ))}
      {/* Mounting hole */}
      <circle cx="32" cy="52" r="2" stroke="currentColor" strokeWidth="1.2" fill="none"/>
    </svg>
  );
}

export function IconHdd({ className, ...p }: P) {
  return (
    <svg viewBox="0 0 64 64" fill="none" className={className} {...p}>
      <rect x="8" y="14" width="48" height="36" rx="4" stroke="currentColor" strokeWidth="2" fill="currentColor" fillOpacity="0.08"/>
      {/* Platter */}
      <circle cx="28" cy="32" r="14" stroke="currentColor" strokeWidth="1.5" fill="none"/>
      <circle cx="28" cy="32" r="8" stroke="currentColor" strokeWidth="1" fill="currentColor" fillOpacity="0.1"/>
      <circle cx="28" cy="32" r="3" stroke="currentColor" strokeWidth="1" fill="currentColor" fillOpacity="0.3"/>
      {/* Read arm */}
      <line x1="28" y1="32" x2="44" y2="22" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <circle cx="44" cy="22" r="2.5" fill="currentColor" fillOpacity="0.5"/>
      {/* Connectors */}
      <rect x="40" y="36" width="12" height="4" rx="1" stroke="currentColor" strokeWidth="1" fill="currentColor" fillOpacity="0.15"/>
      <rect x="40" y="42" width="8" height="4" rx="1" stroke="currentColor" strokeWidth="1" fill="currentColor" fillOpacity="0.15"/>
      {/* Screws */}
      <circle cx="12" cy="18" r="2" stroke="currentColor" strokeWidth="1" fill="none"/>
      <circle cx="52" cy="18" r="2" stroke="currentColor" strokeWidth="1" fill="none"/>
      <circle cx="12" cy="46" r="2" stroke="currentColor" strokeWidth="1" fill="none"/>
      <circle cx="52" cy="46" r="2" stroke="currentColor" strokeWidth="1" fill="none"/>
    </svg>
  );
}

export function IconPsu({ className, ...p }: P) {
  return (
    <svg viewBox="0 0 64 64" fill="none" className={className} {...p}>
      <rect x="8" y="10" width="48" height="44" rx="4" stroke="currentColor" strokeWidth="2" fill="currentColor" fillOpacity="0.08"/>
      {/* Fan grill */}
      <circle cx="32" cy="32" r="14" stroke="currentColor" strokeWidth="1.5" fill="none"/>
      <circle cx="32" cy="32" r="4" stroke="currentColor" strokeWidth="1.2" fill="currentColor" fillOpacity="0.3"/>
      {/* Grill lines */}
      <line x1="18" y1="32" x2="46" y2="32" stroke="currentColor" strokeWidth="1" opacity="0.4"/>
      <line x1="32" y1="18" x2="32" y2="46" stroke="currentColor" strokeWidth="1" opacity="0.4"/>
      <line x1="22" y1="22" x2="42" y2="42" stroke="currentColor" strokeWidth="1" opacity="0.4"/>
      <line x1="42" y1="22" x2="22" y2="42" stroke="currentColor" strokeWidth="1" opacity="0.4"/>
      {/* Cable holes */}
      <rect x="10" y="12" width="6" height="4" rx="1" fill="currentColor" fillOpacity="0.3"/>
      <rect x="18" y="12" width="6" height="4" rx="1" fill="currentColor" fillOpacity="0.3"/>
      {/* On/off switch */}
      <rect x="46" y="12" width="8" height="5" rx="1.5" stroke="currentColor" strokeWidth="1" fill="currentColor" fillOpacity="0.2"/>
    </svg>
  );
}

export function IconCase({ className, ...p }: P) {
  return (
    <svg viewBox="0 0 64 64" fill="none" className={className} {...p}>
      {/* Case body */}
      <rect x="12" y="6" width="36" height="52" rx="3" stroke="currentColor" strokeWidth="2" fill="currentColor" fillOpacity="0.08"/>
      {/* Side panel window */}
      <rect x="16" y="12" width="20" height="28" rx="2" stroke="currentColor" strokeWidth="1.2" fill="currentColor" fillOpacity="0.12"/>
      {/* Drive bays */}
      <rect x="16" y="44" width="8" height="5" rx="1" stroke="currentColor" strokeWidth="1" fill="currentColor" fillOpacity="0.2"/>
      <rect x="26" y="44" width="8" height="5" rx="1" stroke="currentColor" strokeWidth="1" fill="currentColor" fillOpacity="0.2"/>
      {/* Power button */}
      <circle cx="40" cy="13" r="3" stroke="currentColor" strokeWidth="1.2" fill="none"/>
      {/* USB ports */}
      <rect x="38" y="20" width="6" height="3" rx="0.5" stroke="currentColor" strokeWidth="1" fill="currentColor" fillOpacity="0.2"/>
      <rect x="38" y="25" width="6" height="3" rx="0.5" stroke="currentColor" strokeWidth="1" fill="currentColor" fillOpacity="0.2"/>
      {/* Feet */}
      <rect x="16" y="56" width="8" height="3" rx="1" fill="currentColor" fillOpacity="0.4"/>
      <rect x="40" y="56" width="8" height="3" rx="1" fill="currentColor" fillOpacity="0.4"/>
    </svg>
  );
}

export function IconCooler({ className, ...p }: P) {
  return (
    <svg viewBox="0 0 64 64" fill="none" className={className} {...p}>
      {/* Heatsink fins */}
      {[10,15,20,25,30,35,40,45,50].map(x => (
        <rect key={x} x={x} y="14" width="3" height="28" rx="1" stroke="currentColor" strokeWidth="1" fill="currentColor" fillOpacity="0.2"/>
      ))}
      {/* Fan frame */}
      <rect x="14" y="10" width="36" height="36" rx="3" stroke="currentColor" strokeWidth="1.8" fill="none"/>
      {/* Fan blades */}
      <circle cx="32" cy="28" r="13" stroke="currentColor" strokeWidth="1.2" fill="none"/>
      <circle cx="32" cy="28" r="4" stroke="currentColor" strokeWidth="1.5" fill="currentColor" fillOpacity="0.4"/>
      <path d="M32 15 Q38 21 32 28 Q26 21 32 15Z" fill="currentColor" fillOpacity="0.5"/>
      <path d="M45 28 Q39 22 32 28 Q39 34 45 28Z" fill="currentColor" fillOpacity="0.5"/>
      <path d="M32 41 Q26 35 32 28 Q38 35 32 41Z" fill="currentColor" fillOpacity="0.5"/>
      <path d="M19 28 Q25 34 32 28 Q25 22 19 28Z" fill="currentColor" fillOpacity="0.5"/>
      {/* Base/mounting */}
      <rect x="20" y="46" width="24" height="6" rx="2" stroke="currentColor" strokeWidth="1.5" fill="currentColor" fillOpacity="0.15"/>
      <rect x="24" y="52" width="4" height="4" rx="1" fill="currentColor" fillOpacity="0.3"/>
      <rect x="36" y="52" width="4" height="4" rx="1" fill="currentColor" fillOpacity="0.3"/>
    </svg>
  );
}

export function IconMonitor({ className, ...p }: P) {
  return (
    <svg viewBox="0 0 64 64" fill="none" className={className} {...p}>
      <rect x="6" y="8" width="52" height="36" rx="3" stroke="currentColor" strokeWidth="2" fill="currentColor" fillOpacity="0.08"/>
      <rect x="10" y="12" width="44" height="28" rx="1.5" stroke="currentColor" strokeWidth="1" fill="currentColor" fillOpacity="0.12"/>
      <line x1="32" y1="44" x2="32" y2="52" stroke="currentColor" strokeWidth="2"/>
      <rect x="20" y="52" width="24" height="4" rx="2" stroke="currentColor" strokeWidth="1.5" fill="currentColor" fillOpacity="0.2"/>
      <circle cx="32" cy="41" r="1.5" fill="currentColor" fillOpacity="0.5"/>
    </svg>
  );
}

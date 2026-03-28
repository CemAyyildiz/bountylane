import { useState, useEffect } from "react";

export function Navbar() {
  const [time, setTime] = useState(new Date());
  
  useEffect(() => {
    const iv = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(iv);
  }, []);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b-2 border-[var(--c-white)] bg-[var(--c-black)]">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <img src="/Bountylane.png" alt="Bountylane" className="w-6 h-6" />
          <span className="font-bold text-sm tracking-wider">BOUNTYLANE</span>
        </div>

        {/* Nav Links */}
        <div className="hidden md:flex items-center gap-8 text-xs">
          <a href="#agent" className="text-dim hover:text-[var(--c-white)] transition-colors">
            [HYBRID AGENT]
          </a>
          <a href="#demo" className="text-dim hover:text-[var(--c-white)] transition-colors">
            [DEMO]
          </a>
          <a 
            href="https://monadscan.com" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-dim hover:text-[var(--c-white)] transition-colors"
          >
            [EXPLORER]
          </a>
        </div>

        {/* Status */}
        <div className="flex items-center gap-4">
          <span className="text-xs text-dim font-mono">
            {time.toLocaleTimeString("en-US", { hour12: false })}
          </span>
          <div className="badge badge-accent">
            MAINNET
          </div>
        </div>
      </div>
    </nav>
  );
}

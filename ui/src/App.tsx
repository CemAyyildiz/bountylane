import { Navbar } from "./components/Navbar";
import { Hero } from "./components/Hero";
import { Agent } from "./components/Agent";
import { Demo } from "./components/Demo";

export default function App() {
  return (
    <div className="min-h-screen bg-[var(--c-black)]">
      {/* Grid background */}
      <div className="fixed inset-0 grid-bg opacity-30 pointer-events-none" />
      
      {/* Content */}
      <div className="relative z-10">
        <Navbar />
        <Hero />
        <Agent />
        <Demo />
        
        {/* Footer */}
        <footer className="border-t-2 border-[var(--c-white)] py-8 px-6">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <span className="text-dim text-xs">
              BOUNTYLANE © 2026 — MONAD MAINNET
            </span>
            <span className="text-dim text-xs">
              v1.0.0
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}

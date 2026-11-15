import React from 'react';

interface HeaderProps {
  backendOk: boolean;
  modelUsed?: string;
  onOpenWorkspace?: () => void;
  hasResult?: boolean;
}

export default function Header({ backendOk, onOpenWorkspace, hasResult }: HeaderProps) {
  return (
    <header className="absolute top-0 left-80 right-0 h-14 z-20 flex items-center justify-between px-6 bg-[#0b1329]/90 backdrop-blur-md border-b border-slate-800/80 shadow-lg">
      <div className="flex items-center gap-3">
        <h1 className="text-sm font-semibold tracking-wide text-slate-100 flex items-center gap-1.5">
          <span>FloodScope</span>
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400 font-extrabold">
            AI
          </span>
        </h1>
        <span className="text-slate-700 text-xs">|</span>
        <span className="text-xs text-slate-400 hidden sm:inline">
          Satellite Synthetic Aperture Radar (SAR) Flood Response Decision-Support System
        </span>
      </div>

      <div className="flex items-center gap-3">
        {hasResult && onOpenWorkspace && (
          <button
            onClick={onOpenWorkspace}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white shadow-sm transition"
          >
            <span>🔬</span> Analysis Workspace
          </button>
        )}

        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900/90 border border-slate-800 text-xs">
          <span
            className={`w-2 h-2 rounded-full ${
              backendOk ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'
            }`}
          />
          <span className="text-slate-300 text-[11px] font-medium">
            {backendOk ? 'Satellite Backend Online' : 'Offline Mode'}
          </span>
        </div>

        <span className="hidden md:inline-flex px-2.5 py-0.5 rounded text-[11px] font-medium bg-blue-950/80 border border-blue-800/60 text-blue-300 font-mono">
          Sentinel-1 IW GRD
        </span>
        <span className="hidden md:inline-flex px-2.5 py-0.5 rounded text-[11px] font-medium bg-cyan-950/80 border border-cyan-800/60 text-cyan-300 font-mono">
          U-Net + ResNet34
        </span>
      </div>
    </header>
  );
}

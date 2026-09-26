/**
 * Goblin King Heist - Controls & Rules Quick Help Modal
 */

import React from 'react';
import { X, Keyboard, MousePointer, ShieldAlert, Package, Trophy, Download } from 'lucide-react';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl flex flex-col gap-5 text-slate-100">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Keyboard className="w-5 h-5 text-cyan-400" />
            <h3 className="font-bold text-base text-cyan-400">
              Controls & Gameplay Guide
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Controls Grid */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-center gap-2.5">
            <span className="px-2 py-1 bg-slate-800 font-mono font-bold text-amber-400 rounded">W A S D</span>
            <span className="text-slate-300">Move Hero</span>
          </div>

          <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-center gap-2.5">
            <span className="px-2 py-1 bg-slate-800 font-mono font-bold text-amber-400 rounded">MOUSE</span>
            <span className="text-slate-300">Aim Weapon</span>
          </div>

          <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-center gap-2.5">
            <span className="px-2 py-1 bg-slate-800 font-mono font-bold text-emerald-400 rounded">L-CLICK</span>
            <span className="text-slate-300">Basic Attack</span>
          </div>

          <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-center gap-2.5">
            <span className="px-2 py-1 bg-slate-800 font-mono font-bold text-amber-400 rounded">F KEY</span>
            <span className="text-slate-300">Open / Drop Crate</span>
          </div>

          <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-center gap-2.5">
            <span className="px-2 py-1 bg-slate-800 font-mono font-bold text-cyan-400 rounded">Q KEY</span>
            <span className="text-slate-300">Skill Q (Wave 1+)</span>
          </div>

          <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-center gap-2.5">
            <span className="px-2 py-1 bg-slate-800 font-mono font-bold text-cyan-400 rounded">E KEY</span>
            <span className="text-slate-300">Skill E (Wave 2+)</span>
          </div>

          <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-center gap-2.5">
            <span className="px-2 py-1 bg-slate-800 font-mono font-bold text-purple-400 rounded">R KEY</span>
            <span className="text-slate-300">Skill R (Wave 3)</span>
          </div>

          <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-center gap-2.5">
            <span className="px-2 py-1 bg-slate-800 font-mono font-bold text-slate-300 rounded">1 - 5</span>
            <span className="text-slate-300">Switch Active Hero</span>
          </div>
        </div>

        {/* Objective Rules */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 flex flex-col gap-2.5 text-xs text-slate-300 leading-relaxed">
          <div className="font-bold text-amber-400 flex items-center gap-1.5">
            <Package className="w-4 h-4 text-emerald-400" />
            MISSION RULES:
          </div>
          <div>
            • <strong>Wave 1:</strong> Find & deliver <strong>3 real crates</strong> out of 15 scattered in the sector. Beware! 12 of them are booby-trapped with ambush goblins!
          </div>
          <div>
            • <strong>Mint-Green Base:</strong> Carry real crates into the extraction base at bottom-left to secure delivery progress.
          </div>
          <div>
            • <strong>Goblin King & Towers:</strong> Destroy the 3 Ancient Towers to strip the King's defense. Boss takes 25% damage initially, up to 100% when all 3 towers fall!
          </div>
          <div>
            • <strong>Wave Progression:</strong> Advance waves by completing deliveries. Completing Wave 3 wins the match!
          </div>
        </div>

        {/* Share & Download Game ZIP */}
        <div className="bg-gradient-to-r from-amber-950/40 to-slate-900 border border-amber-500/30 rounded-xl p-3 flex items-center justify-between gap-3">
          <div className="flex flex-col">
            <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
              <Download className="w-3.5 h-3.5 text-amber-400" />
              Download Game Source (.ZIP)
            </span>
            <span className="text-[11px] text-slate-400">
              Complete React + TypeScript project ready to run with <code className="text-amber-200">npm install && npm run dev</code>
            </span>
          </div>
          <a
            href="/goblin-king-heist-source.zip"
            download="goblin-king-heist-game.zip"
            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg transition shrink-0 flex items-center gap-1 shadow"
          >
            <Download className="w-3.5 h-3.5" />
            Download
          </a>
        </div>

        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition"
        >
          Got It!
        </button>

      </div>
    </div>
  );
};

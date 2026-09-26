/**
 * Goblin King Heist - Match Defeat Modal
 */

import React from 'react';
import { GameState } from '../../types/game';
import { Skull, RotateCcw, AlertTriangle } from 'lucide-react';

interface DefeatModalProps {
  gameState: GameState;
  onRetryWave: () => void;
  onRestartMatch: () => void;
}

export const DefeatModal: React.FC<DefeatModalProps> = ({
  gameState,
  onRetryWave,
  onRestartMatch,
}) => {
  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-rose-500/60 rounded-2xl max-w-md w-full p-6 shadow-2xl flex flex-col gap-5 text-slate-100 ring-2 ring-rose-500/20">
        
        {/* Header */}
        <div className="text-center flex flex-col items-center">
          <div className="w-16 h-16 rounded-full bg-rose-500/20 border-2 border-rose-500 flex items-center justify-center text-rose-400 mb-2">
            <Skull className="w-9 h-9" />
          </div>
          <h2 className="text-3xl font-black text-rose-400 tracking-wide">
            TEAM WIPED OUT
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            All team lives exhausted in Wave {gameState.wave}. The Goblin King's army overran the extraction zone.
          </p>
        </div>

        {/* Tip */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 flex items-start gap-2.5 text-xs text-slate-300">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-amber-300">Tactical Tip:</span> Destroy the 3 ancient towers first to strip the Goblin King's runic armor, and use Squad Orders to focus fire on ambushing trap goblins!
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2.5">
          <button
            onClick={onRetryWave}
            className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition shadow flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            RETRY WAVE {gameState.wave} (RESTORE 5 LIVES)
          </button>

          <button
            onClick={onRestartMatch}
            className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition border border-slate-700"
          >
            RESTART FROM WAVE 1
          </button>
        </div>

      </div>
    </div>
  );
};

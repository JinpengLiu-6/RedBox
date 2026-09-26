/**
 * Goblin King Heist - Wave Clear Summary Modal
 */

import React from 'react';
import { GameState, Hero } from '../../types/game';
import { Package, Award, ArrowRight, ShieldCheck } from 'lucide-react';

interface WaveSummaryModalProps {
  gameState: GameState;
  heroes: Hero[];
  onProceedNextWave: () => void;
}

export const WaveSummaryModal: React.FC<WaveSummaryModalProps> = ({
  gameState,
  heroes,
  onProceedNextWave,
}) => {
  const nextWave = gameState.wave + 1;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl flex flex-col gap-5 text-slate-100">
        
        {/* Header */}
        <div className="text-center flex flex-col items-center">
          <div className="w-14 h-14 rounded-full bg-emerald-500/20 border border-emerald-500/50 flex items-center justify-center text-emerald-400 mb-2">
            <Award className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-black text-amber-400">
            WAVE {gameState.wave} COMPLETED!
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            All required treasure crates secured at Extraction Base!
          </p>
        </div>

        {/* Stats Breakdown */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between text-xs pb-2 border-b border-slate-800">
            <span className="text-slate-400 flex items-center gap-1.5">
              <Package className="w-4 h-4 text-emerald-400" />
              Crates Delivered:
            </span>
            <span className="font-mono font-bold text-emerald-400 text-sm">
              {gameState.cratesDelivered} / {gameState.requiredDeliveries}
            </span>
          </div>

          <div className="flex items-center justify-between text-xs pb-2 border-b border-slate-800">
            <span className="text-slate-400">Team Lives Remaining:</span>
            <span className="font-mono font-bold text-rose-400">
              {gameState.teamLives} / {gameState.maxTeamLives}
            </span>
          </div>

          {/* Squad Contributions */}
          <div className="mt-1">
            <div className="text-[11px] font-bold text-slate-400 mb-2">SQUAD CONTRIBUTIONS</div>
            <div className="flex flex-col gap-1.5 text-xs">
              {heroes.map(hero => (
                <div key={hero.id} className="flex items-center justify-between bg-slate-900/60 px-2.5 py-1 rounded">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: hero.color }} />
                    <span className="text-slate-200">{hero.title}</span>
                  </div>
                  <div className="flex items-center gap-3 font-mono text-[11px] text-slate-400">
                    <span>{hero.cratesDelivered} crates</span>
                    <span>{hero.kills} kills</span>
                    <span className="text-amber-400">{hero.damageDealt} dmg</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Next Wave Unlocks Preview */}
        <div className="bg-cyan-950/30 border border-cyan-800/60 rounded-xl p-3.5 flex items-center gap-3">
          <ShieldCheck className="w-6 h-6 text-cyan-400 shrink-0" />
          <div className="text-xs">
            <div className="font-bold text-cyan-300">
              Wave {nextWave} Preparation:
            </div>
            <div className="text-slate-400 text-[11px] mt-0.5">
              {nextWave === 2 && 'Skill [E] is now UNLOCKED for all heroes! Enemies are +20% stronger.'}
              {nextWave === 3 && 'Ultimate Skill [R] is now UNLOCKED! Enemies are +30% stronger.'}
            </div>
          </div>
        </div>

        {/* Action Button */}
        <button
          onClick={onProceedNextWave}
          className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm transition shadow-lg flex items-center justify-center gap-2"
        >
          START WAVE {nextWave}
          <ArrowRight className="w-4 h-4" />
        </button>

      </div>
    </div>
  );
};

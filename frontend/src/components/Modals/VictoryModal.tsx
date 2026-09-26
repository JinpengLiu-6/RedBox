/**
 * Goblin King Heist - Match Victory Modal
 */

import React from 'react';
import { GameState, Hero } from '../../types/game';
import { Trophy, RotateCcw, Package, Skull } from 'lucide-react';

interface VictoryModalProps {
  gameState: GameState;
  heroes: Hero[];
  bossDefeated: boolean;
  onRestartMatch: () => void;
}

export const VictoryModal: React.FC<VictoryModalProps> = ({
  gameState,
  heroes,
  bossDefeated,
  onRestartMatch,
}) => {
  const totalCrates = heroes.reduce((acc, h) => acc + h.cratesDelivered, 0);
  const totalKills = heroes.reduce((acc, h) => acc + h.kills, 0);
  const totalDamage = heroes.reduce((acc, h) => acc + h.damageDealt, 0);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-amber-500/60 rounded-2xl max-w-lg w-full p-6 shadow-2xl flex flex-col gap-5 text-slate-100 ring-2 ring-amber-500/20">
        
        {/* Banner image or Trophy Icon */}
        <div className="text-center flex flex-col items-center">
          <div className="w-16 h-16 rounded-full bg-amber-500/20 border-2 border-amber-400 flex items-center justify-center text-amber-400 mb-2 shadow-lg animate-pulse">
            <Trophy className="w-9 h-9" />
          </div>
          <h2 className="text-3xl font-black text-amber-400 tracking-wide">
            HEIST ACCOMPLISHED!
          </h2>
          <p className="text-xs text-slate-300 mt-1">
            Wave 3 complete! The royal vault has been successfully plundered.
          </p>
        </div>

        {/* Highlights */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-slate-950/80 border border-slate-800 p-2.5 rounded-xl">
            <div className="text-slate-400 text-[11px]">Crates Delivered</div>
            <div className="text-lg font-black text-emerald-400 font-mono mt-0.5">{totalCrates}</div>
          </div>
          <div className="bg-slate-950/80 border border-slate-800 p-2.5 rounded-xl">
            <div className="text-slate-400 text-[11px]">Goblins Defeated</div>
            <div className="text-lg font-black text-rose-400 font-mono mt-0.5">{totalKills}</div>
          </div>
          <div className="bg-slate-950/80 border border-slate-800 p-2.5 rounded-xl">
            <div className="text-slate-400 text-[11px]">Goblin King</div>
            <div className="text-lg font-black text-amber-400 font-mono mt-0.5">
              {bossDefeated ? 'SLAIN 👑' : 'SURVIVED'}
            </div>
          </div>
        </div>

        {/* Hero Performance Roster */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5">
          <div className="text-[11px] font-bold text-slate-400 mb-2">HERO PERFORMANCE</div>
          <div className="flex flex-col gap-1.5 text-xs">
            {heroes.map(hero => (
              <div key={hero.id} className="flex items-center justify-between bg-slate-900/60 px-3 py-1.5 rounded">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: hero.color }} />
                  <span className="font-semibold text-slate-200">{hero.title}</span>
                </div>
                <div className="font-mono text-slate-400 text-[11px] flex gap-3">
                  <span>{hero.cratesDelivered} Crates</span>
                  <span>{hero.kills} Kills</span>
                  <span className="text-amber-400">{hero.damageDealt} Dmg</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Play Again Button */}
        <button
          onClick={onRestartMatch}
          className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm transition shadow-lg flex items-center justify-center gap-2"
        >
          <RotateCcw className="w-4 h-4" />
          PLAY AGAIN
        </button>

      </div>
    </div>
  );
};

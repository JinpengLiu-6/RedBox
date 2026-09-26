/**
 * Goblin King Heist - Hero Selection Modal
 */

import React from 'react';
import { HeroClass } from '../../types/game';
import { HERO_TEMPLATES } from '../../config/gameConfig';
import { Swords, Shield, Zap, Sparkles, UserCheck, ArrowLeft } from 'lucide-react';

interface HeroSelectModalProps {
  selectedClass: HeroClass;
  onSelectClass: (heroClass: HeroClass) => void;
  onStartMatch: () => void;
  onOpenMultiplayer: () => void;
  onBackToMenu?: () => void;
}

export const HeroSelectModal: React.FC<HeroSelectModalProps> = ({
  selectedClass,
  onSelectClass,
  onStartMatch,
  onOpenMultiplayer,
  onBackToMenu,
}) => {
  const classes: HeroClass[] = [
    'elf_mage',
    'axe_troll',
    'human_brawler',
    'dwarf_demolitionist',
    'dual_blade_warrior',
  ];

  const currentHero = HERO_TEMPLATES[selectedClass];

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-4xl w-full p-6 shadow-2xl flex flex-col gap-6 text-slate-100">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            {onBackToMenu && (
              <button
                onClick={onBackToMenu}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition border border-slate-700"
                title="Back to Main Menu"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <div>
              <h1 className="text-2xl font-black tracking-wider text-amber-400">
                GOBLIN KING HEIST
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                5-Player Cooperative 2D Action MVP · Select Your Hero
              </p>
            </div>
          </div>

          <button
            onClick={onOpenMultiplayer}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-400 text-xs font-semibold border border-slate-700 transition"
          >
            <UserCheck className="w-4 h-4" />
            Co-op Room Info
          </button>
        </div>

        {/* Hero Archetypes Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {classes.map(cls => {
            const tmpl = HERO_TEMPLATES[cls];
            const isSelected = selectedClass === cls;

            return (
              <button
                key={cls}
                onClick={() => onSelectClass(cls)}
                className={`flex flex-col items-center p-3 rounded-xl border text-center transition-all ${
                  isSelected
                    ? 'bg-amber-500/20 border-amber-400 ring-2 ring-amber-400/50 scale-[1.03] shadow-lg'
                    : 'bg-slate-800/60 border-slate-700/60 hover:bg-slate-700/60'
                }`}
              >
                <div 
                  className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-black text-white shadow mb-2"
                  style={{ backgroundColor: tmpl.color }}
                >
                  {tmpl.title[0]}
                </div>
                <span className="font-bold text-xs text-slate-200">{tmpl.title}</span>
                <span className="text-[10px] text-slate-400 mt-0.5">{tmpl.name.split(' ')[0]}</span>
              </button>
            );
          })}
        </div>

        {/* Selected Hero Details & Abilities */}
        {currentHero && (
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row gap-5 items-start">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-amber-300">{currentHero.name}</span>
                <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                  {currentHero.title}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">
                {currentHero.description}
              </p>

              <div className="flex items-center gap-4 mt-3 text-xs text-slate-400 font-mono">
                <span>HP: <strong className="text-emerald-400">{currentHero.maxHp}</strong></span>
                <span>Speed: <strong className="text-cyan-400">{currentHero.speed}</strong></span>
                <span>Base Dmg: <strong className="text-amber-400">{currentHero.attackDmg}</strong></span>
              </div>
            </div>

            {/* Skill Progression */}
            <div className="flex-1 w-full border-t md:border-t-0 md:border-l border-slate-800 pt-3 md:pt-0 md:pl-5 flex flex-col gap-2">
              <div className="text-[11px] font-bold text-slate-400 tracking-wider">HERO SKILL KIT</div>

              <div className="flex flex-col gap-1.5 text-xs">
                <div className="flex items-start gap-2 bg-slate-900/80 p-2 rounded border border-slate-800">
                  <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono font-bold text-[10px]">
                    Q · Wave 1
                  </span>
                  <div>
                    <div className="font-semibold text-slate-200">{currentHero.skills.q.name}</div>
                    <div className="text-[11px] text-slate-400">{currentHero.skills.q.description}</div>
                  </div>
                </div>

                <div className="flex items-start gap-2 bg-slate-900/80 p-2 rounded border border-slate-800">
                  <span className="px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-mono font-bold text-[10px]">
                    E · Wave 2
                  </span>
                  <div>
                    <div className="font-semibold text-slate-200">{currentHero.skills.e.name}</div>
                    <div className="text-[11px] text-slate-400">{currentHero.skills.e.description}</div>
                  </div>
                </div>

                <div className="flex items-start gap-2 bg-slate-900/80 p-2 rounded border border-slate-800">
                  <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-mono font-bold text-[10px]">
                    R · Wave 3
                  </span>
                  <div>
                    <div className="font-semibold text-slate-200">{currentHero.skills.r.name}</div>
                    <div className="text-[11px] text-slate-400">{currentHero.skills.r.description}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Start Game Action */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-800">
          <div className="text-xs text-slate-400">
            Unselected heroes will join as intelligent AI bot teammates!
          </div>

          <button
            onClick={onStartMatch}
            className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm transition shadow-lg hover:shadow-amber-500/20 flex items-center gap-2"
          >
            <Swords className="w-4 h-4" />
            START HEIST (WAVE 1)
          </button>
        </div>

      </div>
    </div>
  );
};

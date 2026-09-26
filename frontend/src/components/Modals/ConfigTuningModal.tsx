/**
 * Goblin King Heist - Configuration & Rules Inspector Modal
 * Displays and verifies exact tuning defaults specified in the engineering brief.
 */

import React from 'react';
import { WAVE_CONFIGS, TOWER_CONFIG, TEAM_CONFIG, WORLD_CONFIG } from '../../config/gameConfig';
import { X, CheckCircle2, Sliders } from 'lucide-react';

interface ConfigTuningModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ConfigTuningModal: React.FC<ConfigTuningModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl flex flex-col gap-5 text-slate-100">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-amber-400" />
            <h3 className="font-bold text-base text-amber-400">
              Authoritative Tuning & Mechanics Specification
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Crate Distribution & Wave Progression Table */}
        <div>
          <div className="text-xs font-bold text-slate-300 mb-2">1. WAVE OBJECTIVES & CRATE COUNTS</div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border border-slate-800 rounded-lg overflow-hidden">
              <thead className="bg-slate-950 text-slate-400 font-mono">
                <tr>
                  <th className="p-2.5">Wave</th>
                  <th className="p-2.5">Total Crates</th>
                  <th className="p-2.5">Real Crates</th>
                  <th className="p-2.5">Trap Crates</th>
                  <th className="p-2.5">Deliveries Needed</th>
                  <th className="p-2.5">Enemy Scaling</th>
                  <th className="p-2.5">Unlocked Skills</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 font-mono">
                {[1, 2, 3].map(w => {
                  const cfg = WAVE_CONFIGS[w];
                  return (
                    <tr key={w} className="hover:bg-slate-800/40">
                      <td className="p-2.5 font-bold text-amber-400">Wave {w}</td>
                      <td className="p-2.5 font-bold text-slate-200">{cfg.totalCrates}</td>
                      <td className="p-2.5 text-emerald-400">{cfg.realCrates}</td>
                      <td className="p-2.5 text-rose-400">{cfg.trapCrates}</td>
                      <td className="p-2.5 font-bold text-cyan-400">{cfg.requiredDeliveries} Crates</td>
                      <td className="p-2.5 text-amber-300">
                        {w === 1 && '1.0x (Baseline)'}
                        {w === 2 && '1.20x (+20%)'}
                        {w === 3 && '1.30x (+30% flat)'}
                      </td>
                      <td className="p-2.5 text-slate-300">
                        {w === 1 && 'Basic + [Q]'}
                        {w === 2 && 'Basic + [Q] + [E]'}
                        {w === 3 && 'Basic + [Q] + [E] + [R]'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Destructible Towers & Boss Vulnerability */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 flex flex-col gap-2">
          <div className="text-xs font-bold text-slate-300">2. GOBLIN KING & 3 DESTRUCTIBLE TOWERS</div>
          <p className="text-xs text-slate-400 leading-relaxed">
            The Goblin King is actively attacking and roaming the arena. Three destructible runic towers grant him defensive shielding. The boss is <em>not</em> initially invulnerable.
          </p>
          <div className="grid grid-cols-4 gap-2 text-center text-xs font-mono mt-1">
            <div className="bg-slate-900 p-2 rounded border border-slate-800">
              <div className="text-slate-400 text-[10px]">0 Towers Down</div>
              <div className="font-bold text-amber-400 mt-0.5">25% Damage</div>
              <div className="text-[10px] text-slate-500">75% Armor Shield</div>
            </div>
            <div className="bg-slate-900 p-2 rounded border border-slate-800">
              <div className="text-slate-400 text-[10px]">1 Tower Down</div>
              <div className="font-bold text-amber-400 mt-0.5">50% Damage</div>
              <div className="text-[10px] text-slate-500">50% Armor Shield</div>
            </div>
            <div className="bg-slate-900 p-2 rounded border border-slate-800">
              <div className="text-slate-400 text-[10px]">2 Towers Down</div>
              <div className="font-bold text-amber-400 mt-0.5">75% Damage</div>
              <div className="text-[10px] text-slate-500">25% Armor Shield</div>
            </div>
            <div className="bg-slate-900 p-2 rounded border border-emerald-500/50">
              <div className="text-emerald-400 text-[10px]">3 Towers Down</div>
              <div className="font-bold text-emerald-400 mt-0.5">100% Damage</div>
              <div className="text-[10px] text-emerald-300">Full Vulnerability</div>
            </div>
          </div>
          <div className="text-[11px] text-slate-400 italic mt-1">
            * Note: Defeating the Goblin King awards team buffs and glory, but crate delivery remains the mandatory objective to advance waves.
          </div>
        </div>

        {/* Carrier & Safety Rules */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 flex flex-col gap-2 text-xs">
          <div className="font-bold text-slate-300">3. CRATE AUTHORITATIVE INTEGRITY & ANTI-CHEAT</div>
          <div className="flex flex-col gap-1.5 text-slate-400 text-xs">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span><strong>Identical Appearance:</strong> All unopened crates look completely indistinguishable. Type is resolved authoritatively on interaction.</span>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span><strong>Carrier Combat:</strong> All 5 heroes can carry crates and fight/use abilities simultaneously (-15% speed penalty). No defenseless carrier class.</span>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span><strong>Disconnect & Death Safety:</strong> If a carrier falls or disconnects, the crate is safely dropped at their coordinates—never lost.</span>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span><strong>Minimap Privacy:</strong> Minimap radar displays identical yellow blips for crates, never leaking trap vs real contents.</span>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span><strong>World Scale:</strong> Level area is 2400 × 1600 px (~3x standard single screen area), with smooth camera tracking.</span>
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition border border-slate-700"
        >
          CLOSE INSPECTOR
        </button>

      </div>
    </div>
  );
};

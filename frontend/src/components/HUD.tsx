/**
 * Goblin King Heist - Production Game HUD Component
 * Full Game UI/UX Redesign:
 * - Compact Squad Roster (Active hero highlighted, others compressed)
 * - Epic Raid Boss Health Bar with 3 Crystal Tower Rune Sockets
 * - Sleek Objective Tracker with Visual Crate Extraction Slots & Radar
 * - Primary Combat Skill Deck with Cooldown Sweeps & Wave Padlocks
 * - Collapsible / Minimalist Settings Toolbar (No more raw debug clutter)
 * - 100% English Game UI
 */

import React, { useState } from 'react';
import { Hero, Enemy, Crate, Tower, GameState, SquadOrder } from '../types/game';
import { TOWER_CONFIG, WORLD_CONFIG } from '../config/gameConfig';
import { 
  Heart, 
  Volume2, 
  VolumeX, 
  Users, 
  Sliders, 
  Package, 
  ShieldAlert, 
  Radio, 
  Swords, 
  Compass, 
  HelpCircle,
  Skull,
  Sparkles,
  Zap,
  Flame,
  Download,
  RotateCw,
  Wind,
  Lock,
  Crown,
  Settings,
  ChevronDown
} from 'lucide-react';
import { sound } from '../audio/soundEngine';

interface HUDProps {
  gameState: GameState;
  heroes: Hero[];
  activeHeroId: string;
  enemies: Enemy[];
  crates: Crate[];
  towers: Tower[];
  onSelectHero: (heroId: string) => void;
  onSetSquadOrder: (order: SquadOrder) => void;
  onTriggerSkill: (key: 'Q' | 'E' | 'R') => void;
  onInteract: () => void;
  onOpenConfig: () => void;
  onOpenMultiplayer: () => void;
  onOpenHelp: () => void;
}

export const HUD: React.FC<HUDProps> = ({
  gameState,
  heroes,
  activeHeroId,
  enemies,
  crates,
  towers,
  onSelectHero,
  onSetSquadOrder,
  onTriggerSkill,
  onInteract,
  onOpenConfig,
  onOpenMultiplayer,
  onOpenHelp,
}) => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const activeHero = heroes.find(h => h.id === activeHeroId) || heroes[0];
  const boss = enemies.find(e => e.type === 'goblin_king');
  const destroyedTowersCount = towers.filter(t => t.isDestroyed).length;
  const bossMultiplier = TOWER_CONFIG.getBossDamageMultiplier(destroyedTowersCount);

  // Near interactive crate check for HUD prompt
  const nearCrate = activeHero && crates.some(c => 
    !c.isDelivered && !c.isDestroyed && !c.isCarried &&
    Math.hypot(c.x - activeHero.x, c.y - activeHero.y) <= 80
  );

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-3 select-none">
      
      {/* -------------------------------------------------------------
          TOP BAR: Compact Squad Roster (Left) | Boss Bar (Center) | Objectives & Settings (Right)
          ------------------------------------------------------------- */}
      <div className="flex items-start justify-between gap-4 pointer-events-auto">
        
        {/* 1. COMPACT SQUAD ROSTER */}
        <div className="bg-slate-950/85 border border-slate-800/90 rounded-2xl p-2.5 shadow-2xl backdrop-blur-md flex flex-col gap-2 min-w-[240px] max-w-[280px]">
          {/* Header with Team Lives */}
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-300 px-1 border-b border-slate-800/80 pb-1.5">
            <span className="flex items-center gap-1.5 uppercase tracking-wider text-cyan-400">
              <Users className="w-3.5 h-3.5" />
              Squad Vitals
            </span>
            <div className="flex items-center gap-1 bg-rose-950/60 border border-rose-800/60 px-2 py-0.5 rounded-full text-rose-300 font-mono text-[10px]">
              <Heart className="w-3 h-3 fill-rose-500 text-rose-500" />
              <span>{gameState.teamLives} / {gameState.maxTeamLives}</span>
            </div>
          </div>

          {/* Active Hero Highlight Card */}
          {activeHero && (
            <div className="bg-gradient-to-r from-amber-500/15 via-slate-900 to-slate-900 border border-amber-500/40 rounded-xl p-2 shadow-sm">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <div 
                    className="w-7 h-7 rounded-lg flex items-center justify-center font-black text-xs text-slate-950 shadow-md ring-1 ring-amber-400"
                    style={{ backgroundColor: activeHero.color }}
                  >
                    {activeHero.name[0]}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-amber-300 leading-none">
                      {activeHero.name}
                    </div>
                    <div className="text-[10px] text-slate-400 font-medium">
                      {activeHero.title} · <span className="text-amber-400 font-semibold">{activeHero.isBot ? 'BOT' : 'YOU'}</span>
                    </div>
                  </div>
                </div>

                {activeHero.carryingCrateId && (
                  <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500 text-slate-950 text-[9px] font-black animate-pulse">
                    <Package className="w-2.5 h-2.5" /> CARRIER
                  </span>
                )}
              </div>

              {/* Active Hero HP Bar */}
              <div className="flex items-center justify-between text-[10px] font-mono mb-1">
                <span className="text-slate-400">HEALTH</span>
                <span className="text-emerald-400 font-bold">
                  {Math.round(activeHero.hp)} / {activeHero.maxHp}
                </span>
              </div>
              <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
                <div 
                  className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-200"
                  style={{ width: `${Math.max(0, (activeHero.hp / activeHero.maxHp) * 100)}%` }}
                />
              </div>
            </div>
          )}

          {/* Compressed Teammates Row (Heroes 2 to 5) */}
          <div className="grid grid-cols-4 gap-1.5 pt-1">
            {heroes.map((hero, idx) => {
              const isCurrent = hero.id === activeHeroId;
              const hpPct = Math.max(0, (hero.hp / hero.maxHp) * 100);

              return (
                <button
                  key={hero.id}
                  onClick={() => onSelectHero(hero.id)}
                  title={`[${idx + 1}] ${hero.name} (${hero.title}) - ${hero.isDead ? 'FALLEN' : `${Math.round(hero.hp)}/${hero.maxHp} HP`}`}
                  className={`relative p-1.5 rounded-xl border flex flex-col items-center gap-1 transition-all ${
                    isCurrent
                      ? 'bg-amber-500/20 border-amber-400 shadow-md ring-1 ring-amber-400'
                      : 'bg-slate-900/90 border-slate-800 hover:border-slate-600 hover:bg-slate-800/80'
                  }`}
                >
                  {/* Hero Initial Avatar */}
                  <div 
                    className="relative w-6 h-6 rounded-lg flex items-center justify-center font-bold text-[11px] text-white shadow-inner"
                    style={{ backgroundColor: hero.color }}
                  >
                    {hero.name[0]}
                    {hero.carryingCrateId && (
                      <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-400 rounded-full ring-1 ring-slate-900" />
                    )}
                    {hero.isDead && (
                      <span className="absolute inset-0 bg-slate-950/80 rounded-lg flex items-center justify-center">
                        <Skull className="w-3.5 h-3.5 text-rose-500" />
                      </span>
                    )}
                  </div>

                  {/* Micro HP indicator line */}
                  <div className="w-full bg-slate-950 rounded-full h-1 overflow-hidden">
                    <div 
                      className={`h-full ${hpPct > 40 ? 'bg-emerald-500' : 'bg-rose-500'}`}
                      style={{ width: `${hpPct}%` }}
                    />
                  </div>

                  {/* Hotkey Number */}
                  <span className="text-[9px] font-mono font-bold text-slate-400">
                    {idx + 1}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. EPIC RAID BOSS BAR (Goblin King) */}
        {boss && (
          <div className="bg-slate-950/90 border border-slate-800 rounded-2xl px-5 py-2.5 shadow-2xl backdrop-blur-md flex flex-col items-center gap-1.5 max-w-lg w-full">
            {/* Boss Title & HP Header */}
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <Crown className="w-4 h-4 text-amber-400 drop-shadow" />
                <span className="text-xs font-black tracking-wider text-amber-300 uppercase">
                  GOBLIN KING {boss.isDead ? '· DEFEATED' : '· VAULT TYRANT'}
                </span>
              </div>
              <span className="text-xs font-mono font-bold text-slate-300">
                {Math.round(Math.max(0, boss.hp))} / {boss.maxHp} HP
              </span>
            </div>

            {/* Boss Segmented HP Bar */}
            <div className="w-full bg-slate-950 rounded-full h-3 overflow-hidden border border-slate-700/80 shadow-inner p-0.5">
              <div 
                className="h-full bg-gradient-to-r from-rose-600 via-amber-500 to-yellow-300 rounded-full transition-all duration-200"
                style={{ width: `${Math.max(0, (boss.hp / boss.maxHp) * 100)}%` }}
              />
            </div>

            {/* 3 Destructible Crystal Towers & Damage Multiplier */}
            <div className="flex items-center justify-between w-full pt-1 border-t border-slate-800/80 text-[11px]">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mr-1">Towers:</span>
                {towers.map((tower, idx) => (
                  <div
                    key={tower.id}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-mono border transition-all ${
                      tower.isDestroyed
                        ? 'bg-rose-950/40 border-rose-900/60 text-rose-500/70 line-through'
                        : 'bg-cyan-950/60 border-cyan-500/50 text-cyan-300 shadow-sm'
                    }`}
                  >
                    <Zap className="w-2.5 h-2.5" />
                    <span>T{idx + 1}</span>
                  </div>
                ))}
              </div>

              {/* Vulnerability status badge */}
              <div className="font-mono text-[10px] font-bold">
                {destroyedTowersCount === 3 ? (
                  <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse">
                    ★ 100% VULNERABLE ★
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                    Takes {Math.round(bossMultiplier * 100)}% Dmg
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 3. RIGHT PANEL: Minimalist Settings, Objectives & Radar */}
        <div className="flex flex-col items-end gap-2.5">
          
          {/* Top Quick Settings Toolbar */}
          <div className="bg-slate-950/85 border border-slate-800/90 rounded-xl px-2.5 py-1.5 shadow-xl backdrop-blur-md flex items-center gap-2 text-slate-300 text-xs">
            <button
              onClick={() => sound.toggleMute()}
              className="p-1 hover:text-white hover:bg-slate-800 rounded-lg transition"
              title={sound.isMuted() ? 'Unmute Audio' : 'Mute Audio'}
            >
              {sound.isMuted() ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-cyan-400" />}
            </button>

            <div className="w-px h-3.5 bg-slate-800" />

            <button
              onClick={onOpenMultiplayer}
              className="flex items-center gap-1 px-2 py-1 hover:text-white hover:bg-slate-800 rounded-lg transition font-medium text-[11px]"
              title="Co-op Room Code"
            >
              <Users className="w-3.5 h-3.5 text-cyan-400" />
              <span>Co-op</span>
            </button>

            <button
              onClick={onOpenHelp}
              className="p-1 hover:text-white hover:bg-slate-800 rounded-lg transition"
              title="Controls & Guide"
            >
              <HelpCircle className="w-4 h-4 text-amber-400" />
            </button>

            <button
              onClick={() => setIsSettingsOpen(!isSettingsOpen)}
              className="p-1 hover:text-white hover:bg-slate-800 rounded-lg transition"
              title="Settings & Tools"
            >
              <Settings className="w-4 h-4 text-slate-300" />
            </button>
          </div>

          {/* Collapsible Settings Dropdown */}
          {isSettingsOpen && (
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-2 shadow-2xl flex flex-col gap-1 text-xs min-w-[140px] z-50">
              <button
                onClick={() => {
                  setIsSettingsOpen(false);
                  onOpenConfig();
                }}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-slate-200 hover:bg-slate-800 text-left transition"
              >
                <Sliders className="w-3.5 h-3.5 text-amber-400" />
                Game Tuning
              </button>
              <a
                href="/goblin-king-heist-source.zip"
                download="goblin-king-heist-game.zip"
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-slate-200 hover:bg-slate-800 text-left transition"
              >
                <Download className="w-3.5 h-3.5 text-cyan-400" />
                Download ZIP
              </a>
            </div>
          )}

          {/* Wave & Crate Extraction Objectives */}
          <div className="bg-slate-950/85 border border-slate-800/90 rounded-2xl p-3 shadow-xl backdrop-blur-md min-w-[210px]">
            <div className="flex items-center justify-between text-xs font-black text-amber-400 border-b border-slate-800/80 pb-1.5 tracking-wider">
              <span>WAVE {gameState.wave} / 3</span>
              <span className="text-[10px] text-slate-400 font-mono font-normal">
                {gameState.enemyStatMultiplier === 1.0 
                  ? 'Standard' 
                  : `+${Math.round((gameState.enemyStatMultiplier - 1.0) * 100)}% Threat`}
              </span>
            </div>

            <div className="mt-2 flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300 flex items-center gap-1 font-medium">
                  <Package className="w-3.5 h-3.5 text-emerald-400" />
                  Crates Secured:
                </span>
                <span className="font-mono font-bold text-emerald-400">
                  {gameState.cratesDelivered} / {gameState.requiredDeliveries}
                </span>
              </div>

              {/* Visual Delivery Slot Indicators */}
              <div className="flex items-center gap-1.5">
                {Array.from({ length: gameState.requiredDeliveries }).map((_, idx) => {
                  const isDelivered = idx < gameState.cratesDelivered;
                  return (
                    <div
                      key={idx}
                      className={`flex-1 h-2 rounded-full border transition-all ${
                        isDelivered
                          ? 'bg-emerald-500 border-emerald-400 shadow-sm shadow-emerald-500/50'
                          : 'bg-slate-900 border-slate-700'
                      }`}
                    />
                  );
                })}
              </div>

              <div className="text-[10px] text-slate-400 font-mono">
                Vault Sector: {gameState.totalCratesInWave} unopened crates
              </div>
            </div>
          </div>

          {/* Minimap Radar */}
          <Minimap
            heroes={heroes}
            activeHeroId={activeHeroId}
            crates={crates}
            towers={towers}
            boss={boss}
          />
        </div>

      </div>

      {/* -------------------------------------------------------------
          BOTTOM BAR: Squad Orders (Left) | Hero Skill Deck (Center Anchor) | Controls Hint (Right)
          ------------------------------------------------------------- */}
      <div className="flex items-end justify-between gap-4 pointer-events-auto">
        
        {/* Squad Command Selector */}
        <div className="bg-slate-950/85 border border-slate-800/90 rounded-2xl p-2.5 shadow-2xl backdrop-blur-md flex flex-col gap-1.5">
          <div className="text-[10px] font-bold text-slate-400 flex items-center gap-1 px-1 uppercase tracking-wider">
            <Radio className="w-3 h-3 text-cyan-400" />
            Squad Orders
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            {(['FOLLOW', 'GATHER_CRATES', 'DEFEND_BASE', 'FOCUS_BOSS'] as SquadOrder[]).map(cmd => {
              const isActive = gameState.squadOrder === cmd;
              return (
                <button
                  key={cmd}
                  onClick={() => onSetSquadOrder(cmd)}
                  className={`px-2 py-1 text-[10px] font-bold rounded-lg transition-all ${
                    isActive
                      ? 'bg-cyan-500 text-slate-950 shadow-md ring-1 ring-cyan-300'
                      : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
                  }`}
                >
                  {cmd.replace('_', ' ')}
                </button>
              );
            })}
          </div>
        </div>

        {/* PRIMARY COMBAT SKILL DECK (Center Stage) */}
        {activeHero && (
          <div className="bg-slate-950/95 border border-slate-800/90 rounded-3xl px-6 py-3.5 shadow-2xl backdrop-blur-md flex items-center gap-4">
            
            {/* Hero Class Emblem */}
            <div className="pr-4 border-r border-slate-800 hidden sm:flex flex-col">
              <span className="text-xs font-black text-amber-300 tracking-wide uppercase">
                {activeHero.name}
              </span>
              <span className="text-[10px] text-slate-400 font-medium">
                {activeHero.title}
              </span>
            </div>

            {/* Left-Click (Basic Attack) */}
            <div className="flex flex-col items-center gap-1">
              <button
                className="w-13 h-13 rounded-2xl bg-gradient-to-b from-slate-800 to-slate-900 border border-slate-700 flex flex-col items-center justify-center text-slate-200 hover:border-amber-400 transition group shadow-lg"
                title="Basic Attack (Left Mouse Click or Spacebar)"
              >
                <Swords className="w-5 h-5 text-amber-400 group-hover:scale-110 transition" />
              </button>
              <span className="text-[10px] font-mono font-bold text-slate-400">L-CLICK</span>
            </div>

            {/* Q Skill (Unlocked Wave 1+) */}
            <SkillButton
              skill={activeHero.skills.q}
              keyName="Q"
              isUnlocked={gameState.wave >= activeHero.skills.q.unlockedWave}
              unlockedWave={activeHero.skills.q.unlockedWave}
              onClick={() => onTriggerSkill('Q')}
            />

            {/* E Skill (Unlocks Wave 2+) */}
            <SkillButton
              skill={activeHero.skills.e}
              keyName="E"
              isUnlocked={gameState.wave >= activeHero.skills.e.unlockedWave}
              unlockedWave={activeHero.skills.e.unlockedWave}
              onClick={() => onTriggerSkill('E')}
            />

            {/* R Skill (Ultimate - Unlocks Wave 3) */}
            <SkillButton
              skill={activeHero.skills.r}
              keyName="R"
              isUnlocked={gameState.wave >= activeHero.skills.r.unlockedWave}
              unlockedWave={activeHero.skills.r.unlockedWave}
              isUltimate={true}
              onClick={() => onTriggerSkill('R')}
            />

            <div className="w-px h-10 bg-slate-800 mx-1" />

            {/* Contextual Action [F] */}
            <div className="flex flex-col items-center gap-1">
              <button
                onClick={onInteract}
                className={`w-13 h-13 rounded-2xl border flex flex-col items-center justify-center transition shadow-lg ${
                  activeHero.carryingCrateId
                    ? 'bg-amber-500 border-amber-300 text-slate-950 font-bold animate-pulse shadow-amber-500/20'
                    : nearCrate
                      ? 'bg-emerald-500 border-emerald-300 text-slate-950 font-bold animate-bounce shadow-emerald-500/20'
                      : 'bg-slate-900 border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
                title={activeHero.carryingCrateId ? 'Drop Crate [F]' : 'Extract Crate [F]'}
              >
                <Package className="w-5 h-5" />
              </button>
              <span className="text-[10px] font-mono font-bold text-slate-400">
                {activeHero.carryingCrateId ? 'F (DROP)' : nearCrate ? 'F (OPEN)' : 'F'}
              </span>
            </div>

          </div>
        )}

        {/* Minimalist Controls Guide Hint */}
        <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl px-3 py-2 text-[10px] text-slate-400 font-mono hidden md:flex flex-col gap-0.5">
          <div>KEYS 1-5: SWITCH HERO</div>
          <div>WASD: MOVE · MOUSE: AIM</div>
        </div>

      </div>

    </div>
  );
};

/* =========================================================================
   SUB-COMPONENTS: SkillButton & Minimap
   ========================================================================= */

interface SkillButtonProps {
  skill: {
    id: string;
    name: string;
    description: string;
    cooldown: number;
    currentCooldown: number;
  };
  keyName: string;
  isUnlocked: boolean;
  unlockedWave: number;
  isUltimate?: boolean;
  onClick: () => void;
}

const SkillButton: React.FC<SkillButtonProps> = ({
  skill,
  keyName,
  isUnlocked,
  unlockedWave,
  isUltimate,
  onClick,
}) => {
  const onCooldown = skill.currentCooldown > 0;

  if (!isUnlocked) {
    return (
      <div className="flex flex-col items-center gap-1 opacity-60" title={`${skill.name} unlocks in Wave ${unlockedWave}`}>
        <div className="w-13 h-13 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col items-center justify-center text-slate-500 text-[10px] font-mono gap-1 shadow-inner">
          <Lock className="w-4 h-4 text-slate-600" />
          <span>W{unlockedWave}</span>
        </div>
        <span className="text-[10px] font-mono text-slate-500 font-bold">{keyName}</span>
      </div>
    );
  }

  const getSkillIcon = () => {
    switch (keyName) {
      case 'Q': return <Zap className="w-5 h-5 text-cyan-400" />;
      case 'E': return <ShieldAlert className="w-5 h-5 text-emerald-400" />;
      case 'R': return <Crown className="w-5 h-5 text-purple-400" />;
      default: return <Sparkles className="w-5 h-5 text-amber-400" />;
    }
  };

  return (
    <div className="flex flex-col items-center gap-1 relative group">
      <button
        onClick={onClick}
        disabled={onCooldown}
        className={`w-13 h-13 rounded-2xl border relative overflow-hidden flex flex-col items-center justify-center transition-all duration-150 shadow-lg ${
          onCooldown
            ? 'bg-slate-950 border-slate-800 text-slate-500 cursor-not-allowed'
            : isUltimate
              ? 'bg-gradient-to-b from-purple-950/80 to-slate-900 border-purple-500/80 hover:border-purple-300 hover:scale-105 active:scale-95 shadow-purple-500/20'
              : 'bg-gradient-to-b from-slate-800 to-slate-900 border-cyan-500/60 hover:border-cyan-300 hover:scale-105 active:scale-95'
        }`}
        title={`${skill.name} [${keyName}]: ${skill.description}`}
      >
        {/* Cooldown sweep overlay */}
        {onCooldown && (
          <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-[1px] flex items-center justify-center text-xs font-mono font-bold text-amber-400">
            {skill.currentCooldown.toFixed(1)}s
          </div>
        )}
        {getSkillIcon()}
      </button>

      <div className="flex flex-col items-center">
        <span className="text-[10px] font-mono text-slate-300 font-bold">{keyName}</span>
        <span className="text-[9px] text-cyan-400/80 font-medium truncate max-w-[56px] text-center hidden sm:block">
          {skill.name}
        </span>
      </div>
    </div>
  );
};

interface MinimapProps {
  heroes: Hero[];
  activeHeroId: string;
  crates: Crate[];
  towers: Tower[];
  boss?: Enemy;
}

const Minimap: React.FC<MinimapProps> = ({
  heroes,
  activeHeroId,
  crates,
  towers,
  boss,
}) => {
  const mapW = 160;
  const mapH = 107; // 2400 / 1600 ratio = 1.5

  const toMapX = (wx: number) => (wx / WORLD_CONFIG.width) * mapW;
  const toMapY = (wy: number) => (wy / WORLD_CONFIG.height) * mapH;

  return (
    <div className="bg-slate-950/85 border border-slate-800/90 rounded-2xl p-2 shadow-xl backdrop-blur-md">
      <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 mb-1 px-0.5 uppercase tracking-wider">
        <span className="flex items-center gap-1">
          <Compass className="w-3 h-3 text-cyan-400" />
          Radar
        </span>
        <span className="text-[9px] text-slate-500 font-mono">2400x1600</span>
      </div>

      <div 
        className="relative bg-slate-950 border border-slate-800/90 rounded-xl overflow-hidden"
        style={{ width: mapW, height: mapH }}
      >
        {/* Extraction Base */}
        <div
          className="absolute bg-emerald-500/25 border border-emerald-400/80 rounded"
          style={{
            left: toMapX(WORLD_CONFIG.baseZone.x),
            top: toMapY(WORLD_CONFIG.baseZone.y),
            width: toMapX(WORLD_CONFIG.baseZone.width),
            height: toMapY(WORLD_CONFIG.baseZone.height),
          }}
        />

        {/* Destructible Towers */}
        {towers.map(tower => (
          <div
            key={tower.id}
            className={`absolute w-2 h-2 rounded-full transform -translate-x-1/2 -translate-y-1/2 ${
              tower.isDestroyed ? 'bg-slate-700' : 'bg-cyan-400 ring-1 ring-cyan-200'
            }`}
            style={{ left: toMapX(tower.x), top: toMapY(tower.y) }}
          />
        ))}

        {/* Unopened Crates: Always yellow dots, NEVER reveal real vs trap! */}
        {crates.map(c => {
          if (c.isDelivered || c.isDestroyed || c.isCarried) return null;
          return (
            <div
              key={c.id}
              className="absolute w-1.5 h-1.5 bg-amber-400/90 rounded-sm transform -translate-x-1/2 -translate-y-1/2"
              style={{ left: toMapX(c.x), top: toMapY(c.y) }}
            />
          );
        })}

        {/* Goblin King Boss */}
        {boss && !boss.isDead && (
          <div
            className="absolute w-3 h-3 bg-rose-500 rounded-full ring-2 ring-amber-400 transform -translate-x-1/2 -translate-y-1/2 animate-pulse"
            style={{ left: toMapX(boss.x), top: toMapY(boss.y) }}
          />
        )}

        {/* Heroes */}
        {heroes.map(hero => {
          const isMe = hero.id === activeHeroId;
          return (
            <div
              key={hero.id}
              className={`absolute w-2.5 h-2.5 rounded-full transform -translate-x-1/2 -translate-y-1/2 ${
                hero.isDead 
                  ? 'bg-rose-900 border border-rose-500' 
                  : isMe ? 'bg-cyan-400 ring-2 ring-white z-10' : 'bg-blue-400'
              }`}
              style={{ left: toMapX(hero.x), top: toMapY(hero.y) }}
            />
          );
        })}
      </div>
    </div>
  );
};

/**
 * Goblin King Heist - Main Menu Modal
 * Allows players to choose between Single Player (Solo with AI bots)
 * and Multiplayer (Co-op via Room Code). 100% English Game UI.
 */

import React, { useState } from 'react';
import { 
  Users, 
  Gamepad2, 
  Play, 
  Copy, 
  Check, 
  Sparkles, 
  Radio, 
  Shield, 
  Crown, 
  ArrowRight,
  HelpCircle,
  Volume2,
  VolumeX,
  Swords
} from 'lucide-react';
import { netSync } from '../../network/multiplayerSync';
import { sound } from '../../audio/soundEngine';

interface MainMenuModalProps {
  isOpen: boolean;
  onStartSolo: () => void;
  onStartMultiplayer: (roomCode: string, isHost: boolean) => void;
  onOpenHelp: () => void;
  onToggleMute: () => void;
  isMuted: boolean;
}

export const MainMenuModal: React.FC<MainMenuModalProps> = ({
  isOpen,
  onStartSolo,
  onStartMultiplayer,
  onOpenHelp,
  onToggleMute,
  isMuted,
}) => {
  const [mode, setMode] = useState<'SELECT' | 'MULTIPLAYER_SETUP'>('SELECT');
  const [multiplayerAction, setMultiplayerAction] = useState<'HOST' | 'JOIN'>('HOST');
  const [hostRoomCode, setHostRoomCode] = useState(() => `HEIST-${Math.floor(1000 + Math.random() * 9000)}`);
  const [joinRoomCode, setJoinRoomCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [joinError, setJoinError] = useState('');

  if (!isOpen) return null;

  const handleCopyCode = () => {
    navigator.clipboard.writeText(hostRoomCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  const handleCreateRoom = () => {
    const code = hostRoomCode.trim().toUpperCase();
    if (!code) return;
    netSync.initChannel(code);
    sound.playClick();
    onStartMultiplayer(code, true);
  };

  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    const code = joinRoomCode.trim().toUpperCase();
    if (!code) {
      setJoinError('Please enter a valid Room Code');
      return;
    }
    setJoinError('');
    netSync.initChannel(code);
    sound.playClick();
    onStartMultiplayer(code, false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4">
      {/* Background ambient decorative glow */}
      <div className="absolute w-[500px] h-[500px] bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute w-[400px] h-[400px] bg-cyan-500/10 rounded-full blur-3xl -top-20 -right-20 pointer-events-none" />

      <div className="relative bg-slate-900/95 border border-slate-700/80 rounded-3xl max-w-2xl w-full p-8 shadow-2xl flex flex-col gap-7 text-slate-100 overflow-hidden">
        
        {/* Top bar with audio & help shortcuts */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1">
              <Crown className="w-3 h-3" /> MVP 1.0
            </span>
            <span className="text-xs text-slate-400 font-medium">Tactical 2D Squad Action</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onToggleMute}
              className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition border border-slate-700"
              title={isMuted ? 'Unmute Audio' : 'Mute Audio'}
            >
              {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-cyan-400" />}
            </button>
            <button
              onClick={onOpenHelp}
              className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition border border-slate-700"
              title="Gameplay & Controls Guide"
            >
              <HelpCircle className="w-4 h-4 text-amber-400" />
            </button>
          </div>
        </div>

        {/* Hero Title Section */}
        <div className="text-center flex flex-col items-center gap-2">
          <div className="inline-flex p-3 rounded-2xl bg-gradient-to-br from-amber-500/20 to-red-500/20 border border-amber-500/30 mb-1">
            <Crown className="w-8 h-8 text-amber-400 drop-shadow-md" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-black tracking-wider bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-500 bg-clip-text text-transparent">
            GOBLIN KING HEIST
          </h1>
          <p className="text-sm text-slate-300 max-w-md font-medium leading-relaxed">
            Infiltrate the vault, retrieve authentic treasure crates, destroy power crystals, and defeat the Goblin King!
          </p>
        </div>

        {/* Main Mode Selection */}
        {mode === 'SELECT' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Solo Mode Card */}
            <button
              onClick={() => {
                sound.playClick();
                onStartSolo();
              }}
              className="group text-left p-6 rounded-2xl bg-gradient-to-b from-slate-800/90 to-slate-900/90 border border-slate-700 hover:border-amber-400/80 hover:shadow-lg hover:shadow-amber-500/10 transition-all duration-200 flex flex-col justify-between"
            >
              <div className="flex flex-col gap-3">
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 group-hover:scale-110 group-hover:bg-amber-500/20 transition-all">
                  <Gamepad2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white group-hover:text-amber-300 transition">
                    Solo Expedition
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Deploy instantly with 4 autonomous AI squadmates. Command squad orders and clear waves solo.
                  </p>
                </div>
              </div>

              <div className="mt-5 pt-3 border-t border-slate-800 flex items-center justify-between text-xs font-semibold text-amber-400">
                <span>Select Hero</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition" />
              </div>
            </button>

            {/* Multiplayer Mode Card */}
            <button
              onClick={() => {
                sound.playClick();
                setMode('MULTIPLAYER_SETUP');
              }}
              className="group text-left p-6 rounded-2xl bg-gradient-to-b from-slate-800/90 to-slate-900/90 border border-slate-700 hover:border-cyan-400/80 hover:shadow-lg hover:shadow-cyan-500/10 transition-all duration-200 flex flex-col justify-between"
            >
              <div className="flex flex-col gap-3">
                <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 group-hover:scale-110 group-hover:bg-cyan-500/20 transition-all">
                  <Users className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white group-hover:text-cyan-300 transition">
                    Co-op Multiplayer
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Squad up with 2–5 players across browser tabs or network. Join matches instantly via Room Code.
                  </p>
                </div>
              </div>

              <div className="mt-5 pt-3 border-t border-slate-800 flex items-center justify-between text-xs font-semibold text-cyan-400">
                <span>Create / Join Room</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition" />
              </div>
            </button>
          </div>
        ) : (
          /* Multiplayer Setup Screen */
          <div className="flex flex-col gap-5">
            {/* Tabs: Host vs Join */}
            <div className="grid grid-cols-2 p-1 bg-slate-950 rounded-xl border border-slate-800">
              <button
                onClick={() => {
                  sound.playClick();
                  setMultiplayerAction('HOST');
                }}
                className={`py-2 text-xs font-bold rounded-lg transition ${
                  multiplayerAction === 'HOST'
                    ? 'bg-cyan-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Host Room
              </button>
              <button
                onClick={() => {
                  sound.playClick();
                  setMultiplayerAction('JOIN');
                }}
                className={`py-2 text-xs font-bold rounded-lg transition ${
                  multiplayerAction === 'JOIN'
                    ? 'bg-cyan-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Join by Code
              </button>
            </div>

            {multiplayerAction === 'HOST' ? (
              /* Host Panel */
              <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-5 flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs text-slate-400">Your Active Room Code:</span>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={hostRoomCode}
                      onChange={(e) => setHostRoomCode(e.target.value.toUpperCase())}
                      className="flex-1 bg-slate-900 border border-cyan-500/40 rounded-xl px-4 py-2.5 text-base font-mono font-bold text-cyan-300 tracking-wider focus:outline-none focus:border-cyan-400"
                    />
                    <button
                      type="button"
                      onClick={handleCopyCode}
                      className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition"
                    >
                      {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-slate-300" />}
                      {copied ? 'Copied!' : 'Copy Code'}
                    </button>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-cyan-950/30 border border-cyan-800/40 text-xs text-cyan-300/80 leading-relaxed">
                  💡 <strong>Squad Tip:</strong> Share this code with teammates. Any unselected hero will be automatically piloted by cooperative AI bots so you can start immediately!
                </div>

                <div className="flex gap-3 mt-2">
                  <button
                    onClick={() => {
                      sound.playClick();
                      setMode('SELECT');
                    }}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleCreateRoom}
                    className="flex-1 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-sm tracking-wide shadow-lg shadow-cyan-500/20 transition flex items-center justify-center gap-2"
                  >
                    <Play className="w-4 h-4 fill-slate-950" />
                    Launch Room & Select Hero
                  </button>
                </div>
              </div>
            ) : (
              /* Join Panel */
              <form onSubmit={handleJoinRoom} className="bg-slate-950/60 border border-slate-800 rounded-2xl p-5 flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-slate-400">Enter Host Room Code:</label>
                  <input
                    type="text"
                    value={joinRoomCode}
                    onChange={(e) => {
                      setJoinRoomCode(e.target.value.toUpperCase());
                      if (joinError) setJoinError('');
                    }}
                    placeholder="e.g. HEIST-8848"
                    className="bg-slate-900 border border-slate-700 focus:border-cyan-400 rounded-xl px-4 py-2.5 text-base font-mono font-bold text-amber-300 tracking-wider focus:outline-none"
                    autoFocus
                  />
                  {joinError && (
                    <span className="text-xs text-rose-400 font-medium">{joinError}</span>
                  )}
                </div>

                <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-xs text-slate-400 leading-relaxed">
                  ⚡ <strong>Instant Connect:</strong> Entering a valid code will sync your client to the host's session channel.
                </div>

                <div className="flex gap-3 mt-2">
                  <button
                    type="button"
                    onClick={() => {
                      sound.playClick();
                      setMode('SELECT');
                    }}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm tracking-wide shadow-lg shadow-amber-500/20 transition flex items-center justify-center gap-2"
                  >
                    <Users className="w-4 h-4 text-slate-950" />
                    Connect & Join Match
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* Footer info */}
        <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-800/80">
          <span>WASD Move · Left-Click Attack · Q / E / R Abilities · F Interact</span>
          <span className="text-slate-400">5-Player Co-op & Tactical Bot Fill</span>
        </div>

      </div>
    </div>
  );
};

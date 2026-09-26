/**
 * Goblin King Heist - Multiplayer & 5-Player Co-op Room Modal
 */

import React, { useState } from 'react';
import { netSync } from '../../network/multiplayerSync';
import { Users, Copy, Check, ExternalLink, X, Shield, Sparkles } from 'lucide-react';

interface MultiplayerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRoomChanged: (roomId: string) => void;
}

export const MultiplayerModal: React.FC<MultiplayerModalProps> = ({
  isOpen,
  onClose,
  onRoomChanged,
}) => {
  const [roomId, setRoomId] = useState(netSync.getRoomId());
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopyLink = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  const handleApplyRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (roomId.trim()) {
      netSync.initChannel(roomId.trim());
      onRoomChanged(roomId.trim());
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl flex flex-col gap-5 text-slate-100">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-cyan-400" />
            <h3 className="font-bold text-base text-cyan-400">
              5-Player Cooperative Session Setup
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Room Info */}
        <form onSubmit={handleApplyRoom} className="flex flex-col gap-2">
          <label className="text-xs text-slate-300 font-semibold">
            Active Game Room Code:
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value.toUpperCase())}
              className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-amber-300 focus:outline-none focus:border-cyan-400"
              placeholder="e.g. HEIST-ALPHA"
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs transition"
            >
              Set Room
            </button>
          </div>
        </form>

        {/* How to Play with 5 Players */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 flex flex-col gap-2.5 text-xs text-slate-300">
          <div className="font-bold text-amber-400 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-amber-400" />
            HOW TO PLAY 5-PLAYER CO-OP:
          </div>
          <ol className="list-decimal list-inside space-y-1.5 text-slate-400 leading-relaxed">
            <li>
              <strong>Multi-Tab Testing:</strong> Open 2 to 5 browser tabs or windows on this same URL.
            </li>
            <li>
              <strong>Pick Different Heroes:</strong> In each tab, select one of the 5 distinct heroes (Elf Mage, Axe Troll, Human Brawler, Dwarf Demolitionist, Dual-Blade Warrior).
            </li>
            <li>
              <strong>Real-Time Sync:</strong> Tabs connect instantly in the room. Movement, attacks, crate carrying, and skills are synced across clients!
            </li>
            <li>
              <strong>Smart Bot Fill:</strong> Any unassigned hero slot is seamlessly piloted by cooperative AI bots so you can play immediately solo or with any group size up to 5.
            </li>
          </ol>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <button
            onClick={handleCopyLink}
            className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition border border-slate-700 flex items-center justify-center gap-1.5"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Link Copied to Clipboard!' : 'Copy Game Link'}
          </button>

          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition"
          >
            Done
          </button>
        </div>

      </div>
    </div>
  );
};

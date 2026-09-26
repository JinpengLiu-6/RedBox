import { drawElfMage, drawAxeTroll, drawHumanBrawler, drawDwarfDemolitionist, drawDualBladeWarrior, drawGoblinKing, drawRedGoblinMinion } from '../components/CharacterSprites';
import type { ClassId } from '@redbox/shared';

export const HERO_ART = [drawElfMage, drawAxeTroll, drawHumanBrawler, drawDwarfDemolitionist, drawDualBladeWarrior];
export { drawGoblinKing, drawRedGoblinMinion };
export const HERO_META: Record<ClassId, { role: string; title: string; description: string; color: string }> = {
  mage: { role: 'RANGED · CONTROL', title: 'A little magic. A lot of trouble.', description: 'Keep your distance. Slow the horde with frost, then blink out of danger.', color: '#9b69d2' },
  troll: { role: 'FRONTLINE · TANK', title: 'Big axe. Bigger distractions.', description: 'Hold the front line and draw the King away while your crew steals his gold.', color: '#639d64' },
  brawler: { role: 'MELEE · DISRUPTOR', title: 'Let your fists do the talking.', description: 'Charge into the fight, scatter goblins, and make room for the carriers.', color: '#c66953' },
  dwarf: { role: 'SCANNER · DEMOLITION', title: 'Find the gold. Bring the boom.', description: 'Scan treasure twice as fast. Keep your distance and crack towers with explosives.', color: '#5a92b5' },
  warrior: { role: 'MOBILE · DUELIST', title: 'In, out, and off with the loot.', description: 'Our fastest hero. Cut through the guards and find a safe route home.', color: '#c09642' },
};

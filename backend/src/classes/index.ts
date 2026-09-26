/** Owned by the integrator. Every hero is pre-registered; agents only edit their hero file. */

import type { ClassId, ClassModule } from '@redbox/shared';
import { brawlerModule } from './brawler.js';
import { dwarfModule } from './dwarf.js';
import { mageModule } from './mage.js';
import { trollModule } from './troll.js';
import { warriorModule } from './warrior.js';

export const CLASS_MODULES: Record<ClassId, ClassModule> = {
  mage: mageModule,
  troll: trollModule,
  brawler: brawlerModule,
  dwarf: dwarfModule,
  warrior: warriorModule,
};

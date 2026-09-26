/** Owned by the integrator. Every class is pre-registered; agents only edit their class file. */

import type { ClassId, ClassModule } from '@redbox/shared';
import { carrierModule } from './carrier.js';
import { rangedModule } from './ranged.js';
import { scannerModule } from './scanner.js';
import { supportModule } from './support.js';
import { tankModule } from './tank.js';

export const CLASS_MODULES: Record<ClassId, ClassModule> = {
  tank: tankModule,
  ranged: rangedModule,
  carrier: carrierModule,
  support: supportModule,
  scanner: scannerModule,
};

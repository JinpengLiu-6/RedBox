import { Crystal } from '@redbox/shared/schema';
import type { System, World } from '@redbox/shared';
import { TOWERS, bossDamageMultiplier, spotsOf } from '@redbox/shared';

export function createTowersSystem(): System {
  return {
    id: 'towers',
    onWaveStart(w: World) {
      const spots = spotsOf('T');
      for (let i = 0; i < spots.length; i++) {
        const spot = spots[i];
        if (!spot) continue;
        const id = `tower-${w.wave}-${i}`;
        w.state.crystals.set(id, Object.assign(new Crystal(), {
          id,
          x: spot.x,
          y: spot.y,
          hp: TOWERS.HP,
          maxHp: TOWERS.HP,
          destroyed: false,
        }));
      }
    },
    update(w: World) {
      for (const tower of w.state.crystals.values()) {
        if (tower.hp === 0 && !tower.destroyed) {
          tower.destroyed = true;
          w.state.crystalsDestroyed += 1;
          w.state.bossDamageMult = bossDamageMultiplier(w.state.crystalsDestroyed);
          w.fx('crystal_break', { x: tower.x, y: tower.y });
          w.emit({ type: 'crystal_destroyed', crystalId: tower.id, atMs: w.now });
        }
      }
    },
  };
}

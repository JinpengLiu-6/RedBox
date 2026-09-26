import type { System, World, Player } from '@redbox/shared';
import { GOBLINS, wavePlan, spotsOf, MOD } from '@redbox/shared';

interface GoblinState {
  nextRetargetTime: number;
  recoverUntilMs: number;
}

export function createGoblinsSystem(): System {
  const states = new Map<string, GoblinState>();

  return {
    id: 'goblins',
    
    onWaveStart(w: World) {
      states.clear();
      const wave = w.wave;
      const spots = spotsOf('g');
      const count = Math.min(GOBLINS.GUARDS_PER_WAVE, spots.length);
      
      for (let i = 0; i < count; i++) {
        w.spawnCreep(spots[i]!, wave);
      }
      
      w.emit({ type: 'goblins_spawned', atMs: w.now });
    },

    update(w: World) {
      let aliveCount = 0;
      
      const creeps = Array.from(w.state.creeps.values());
      
      for (const creep of creeps) {
        if (creep.hp === 0) {
          w.fx('death', creep);
          w.removeEntity('creep', creep.id);
          states.delete(creep.id);
          continue;
        }

        aliveCount++;
        if (aliveCount > GOBLINS.MAX_ALIVE) {
          w.removeEntity('creep', creep.id);
          states.delete(creep.id);
          continue;
        }

        let st = states.get(creep.id);
        if (!st) {
          st = { nextRetargetTime: 0, recoverUntilMs: 0 };
          states.set(creep.id, st);
        }

        if (w.modifier(creep.id, MOD.Stunned, 0) > 0) {
          creep.behaviour = 'stunned';
          continue;
        }

        if (creep.behaviour === 'stunned') {
          creep.behaviour = 'idle';
        }

        let found = creep.targetId ? w.findEntity(creep.targetId) : undefined;
        let target = found?.entity as Player | undefined;
        let targetAlive = found && found.kind === 'player' && target && target.alive;
        
        if (!targetAlive || w.now >= st.nextRetargetTime) {
          let bestDist = Infinity;
          let bestId = '';
          
          for (const p of w.alivePlayers()) {
            const dist = w.distance(creep, p);
            if (dist <= GOBLINS.AGGRO_RADIUS && dist < bestDist && w.reachable(creep, p)) {
              bestDist = dist;
              bestId = p.id;
            }
          }
          
          creep.targetId = bestId;
          st.nextRetargetTime = w.now + GOBLINS.RETARGET_MS;
          found = bestId ? w.findEntity(bestId) : undefined;
          target = found?.entity as Player | undefined;
        }

        if (!creep.targetId || !target) {
          creep.behaviour = 'idle';
          continue;
        }

        const distToTarget = w.distance(creep, target);

        switch (creep.behaviour) {
          case 'idle':
          case 'chase':
            if (distToTarget <= GOBLINS.ATTACK_RANGE) {
              creep.behaviour = 'windup';
              creep.windupUntilMs = w.now + GOBLINS.WINDUP_MS;
            } else {
              creep.behaviour = 'chase';
              const speed = GOBLINS.SPEED * w.modifier(creep.id, MOD.SpeedMult, 1.0);
              const dir = w.nextStep(creep, target);
              const nx = creep.x + dir.x * speed * w.dt;
              const ny = creep.y + dir.y * speed * w.dt;
              if (w.walkable(nx, ny)) { creep.x = nx; creep.y = ny; }
              else if (w.walkable(nx, creep.y)) creep.x = nx;
              else if (w.walkable(creep.x, ny)) creep.y = ny;
              creep.facing = Math.atan2(dir.y, dir.x);
            }
            break;
            
          case 'windup':
            if (w.now >= creep.windupUntilMs) {
              if (distToTarget <= GOBLINS.ATTACK_RANGE) {
                const dmg = Math.round(GOBLINS.DAMAGE * wavePlan(creep.tier).enemyMult);
                w.damage(creep.targetId, dmg, { sourceId: creep.id });
              }
              creep.behaviour = 'recover';
              st.recoverUntilMs = w.now + GOBLINS.RECOVER_MS;
            }
            break;
            
          case 'recover':
            if (w.now >= st.recoverUntilMs) {
              st.nextRetargetTime = 0;
              creep.behaviour = 'idle';
            }
            break;
        }
      }
    }
  };
}

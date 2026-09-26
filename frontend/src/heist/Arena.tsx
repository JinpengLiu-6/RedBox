import { useEffect, useRef } from 'react';
import { ARENA_ROWS, ARENA_W, ARENA_H, TILE, MAP, BOSS, CRATES, BoxMark, BoxState, MatchPhase, classOf, hpPct, type FxPayload } from '@redbox/shared';
import type { Net } from '../net';
import { HERO_ART, drawGoblinKing, drawRedGoblinMinion } from './art';

export type VisualFx = FxPayload & { born: number };
export type ArenaControls = { skill(slot: 0 | 1 | 2): void; interact(): void; move(x: number, y: number): void; attack(): void };
const TAU = Math.PI * 2;
const colorOf = (n: number) => '#' + n.toString(16).padStart(6, '0');
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export function Portrait({ index, large = false }: { index: number; large?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current!.getContext('2d')!;
    ctx.clearRect(0, 0, 180, 160);
    ctx.save(); ctx.translate(90, 105); ctx.scale(large ? 2.25 : 2, large ? 2.25 : 2);
    HERO_ART[index]?.(ctx, { vx: 0, vy: 0, angle: 0.3 }, 0);
    ctx.restore();
  }, [index, large]);
  return <canvas width="180" height="160" ref={ref} className="portrait" aria-hidden="true" />;
}

export function Arena({ net, fx, disabled, controls, overview }: { net: Net; fx: React.RefObject<VisualFx[]>; disabled: boolean; controls: React.RefObject<ArenaControls | null>; overview: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const disabledRef = useRef(disabled);
  const overviewRef = useRef(overview);
  disabledRef.current = disabled; overviewRef.current = overview;
  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    let width = 800, height = 600, raf = 0, lastAttack = 0, held = false, hasAim = false;
    let camX = 0, camY = 0, zoom = 1;
    const pointer = { x: width / 2, y: height / 2 };
    const keys = new Set<string>();
    let sent = '';
    const resize = new ResizeObserver(([entry]) => {
      width = entry.contentRect.width; height = entry.contentRect.height;
      const dpr = Math.min(2, devicePixelRatio || 1);
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    });
    resize.observe(canvas);
    const allowed = () => !disabledRef.current && net.state?.phase === MatchPhase.Playing && !!net.me?.alive;
    const sendMove = () => {
      const dx = allowed() ? Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft')) : 0;
      const dy = allowed() ? Number(keys.has('s') || keys.has('arrowdown')) - Number(keys.has('w') || keys.has('arrowup')) : 0;
      const sig = `${dx},${dy}`;
      if (sig !== sent) { net.move(dx, dy); sent = sig; }
    };
    const aim = () => {
      if (hasAim) return { x: pointer.x / zoom + camX, y: pointer.y / zoom + camY };
      const me = net.me;
      if (!me) return MAP.BOSS_ZONE;
      const targets = [...net.state.creeps.values(), ...[...net.state.crystals.values()].filter(c => !c.destroyed), ...(net.state.boss.alive ? [net.state.boss] : [])];
      targets.sort((a,b) => Math.hypot(a.x-me.x,a.y-me.y)-Math.hypot(b.x-me.x,b.y-me.y));
      return targets[0] ?? { x: me.x + Math.cos(me.facing)*200, y: me.y + Math.sin(me.facing)*200 };
    };
    controls.current = {
      skill(slot) { if (allowed()) { const a = aim(); net.useAbility(slot, a.x, a.y); } },
      interact() { if (allowed()) net.interact(); },
      move(x,y) { if (allowed()) net.move(x,y); else net.move(0,0); },
      attack() { if (allowed()) { const a = aim(); net.attack(a.x,a.y); } },
    };
    const release = () => { keys.clear(); held = false; net.move(0, 0); sent = ''; };
    const keyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea, select')) return;
      const k = e.key.toLowerCase();
      if ('wasdqerf '.includes(k) || k.startsWith('arrow')) e.preventDefault();
      keys.add(k); sendMove();
      if (e.repeat) return;
      if ('qer'.includes(k) && k.length === 1) controls.current?.skill('qer'.indexOf(k) as 0|1|2);
      if (k === 'f') controls.current?.interact();
      if (k === ' ') controls.current?.attack();
    };
    const keyUp = (e: KeyboardEvent) => { keys.delete(e.key.toLowerCase()); sendMove(); };
    const pointerMove = (e: PointerEvent) => { const r = canvas.getBoundingClientRect(); pointer.x = e.clientX-r.left; pointer.y = e.clientY-r.top; hasAim = true; };
    const pointerDown = (e: PointerEvent) => { if (e.button !== 0) return; pointerMove(e); held = true; controls.current?.attack(); lastAttack = performance.now(); };
    const pointerUp = () => { held = false; };
    const visibility = () => { if (document.hidden) release(); };
    window.addEventListener('keydown', keyDown); window.addEventListener('keyup', keyUp);
    window.addEventListener('blur', release); window.addEventListener('pointerup', pointerUp);
    document.addEventListener('visibilitychange', visibility);
    canvas.addEventListener('pointermove', pointerMove); canvas.addEventListener('pointerdown', pointerDown);

    // Cache the static arena. All collision boundaries come from the shared grid.
    const ground = document.createElement('canvas'); ground.width = MAP.WIDTH_PX; ground.height = MAP.HEIGHT_PX;
    const g = ground.getContext('2d')!;
    for (let y = 0; y < ARENA_H; y++) for (let x = 0; x < ARENA_W; x++) {
      const tile = ARENA_ROWS[y][x], px = x*TILE, py = y*TILE;
      const n = (x*37 + y*19 + x*y*7) % 11;
      g.fillStyle = ['#d6c8a5','#d2c3a0','#cfc09e','#d8caaa'][n%4]; g.fillRect(px,py,TILE,TILE);
      g.strokeStyle = '#b9aa862d'; g.strokeRect(px+.5,py+.5,TILE-1,TILE-1);
      if (n < 3) { g.fillStyle = '#b9aa8660'; g.fillRect(px+7+n*5,py+12,2,2); }
      if (tile === ',') {
        g.fillStyle = '#b1b183'; g.fillRect(px,py,TILE,TILE);
        g.strokeStyle = '#879165'; g.lineWidth = 1.4;
        for (let j=0;j<4;j++) { const tx=px+5+j*7,ty=py+12+(j%2)*12; g.beginPath(); g.moveTo(tx-3,ty);g.lineTo(tx,ty-6);g.lineTo(tx+2,ty-1);g.stroke(); }
      }
      if (tile === '#') {
        g.fillStyle = '#514c3d44'; g.fillRect(px+5,py+9,TILE+3,TILE+5);
        g.fillStyle = '#726d53'; g.fillRect(px,py,TILE,TILE);
        g.fillStyle = ['#929074','#8c896d','#969376'][n%3]; g.fillRect(px+1,py+1,TILE-2,TILE-9);
        g.fillStyle='#b3af8d';g.fillRect(px+2,py+1,TILE-4,3);
        g.strokeStyle='#5d5c47';g.strokeRect(px+.5,py+.5,TILE-1,TILE-1);
        if(n<3) {g.strokeStyle='#76785d';g.beginPath();g.moveTo(px+8,py+4);g.lineTo(px+14,py+12);g.lineTo(px+10,py+21);g.stroke();}
      }
    }
    const circle = (x:number,y:number,r:number,fill:string,stroke?:string) => {ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=2;ctx.stroke();}};
    const label = (text:string,x:number,y:number,color='#fff',size=11) => {ctx.font=`600 ${size}px "Trebuchet MS", sans-serif`;ctx.textAlign='center';ctx.fillStyle=color;ctx.fillText(text,x,y);};
    const bar = (x:number,y:number,w:number,p:number,color:string) => {ctx.fillStyle='#302e28cc';ctx.fillRect(x-w/2,y,w,5);ctx.fillStyle=color;ctx.fillRect(x-w/2+1,y+1,(w-2)*clamp(p,0,1),3);};
    const crate = (x:number,y:number,mark:number,small=false) => {
      ctx.save();ctx.translate(x,y);if(small)ctx.scale(.7,.7);
      ctx.fillStyle='#4b362b40';ctx.beginPath();ctx.ellipse(2,13,18,7,0,0,TAU);ctx.fill();
      ctx.fillStyle=mark===BoxMark.Fake?'#956052':'#95683c';ctx.strokeStyle='#513c2d';ctx.lineWidth=2;
      ctx.fillRect(-14,-12,28,25);ctx.strokeRect(-14,-12,28,25);
      ctx.fillStyle='#c09859';ctx.fillRect(-14,-13,28,8);ctx.strokeRect(-14,-13,28,8);
      ctx.fillStyle='#e3c17c';ctx.fillRect(-10,-12,3,24);ctx.fillRect(7,-12,3,24);ctx.fillRect(-3,-4,6,8);
      if(mark!==BoxMark.Unknown) {circle(12,-14,9,mark===BoxMark.Real?'#428465':'#ac4940','#eee4c7');label(mark===BoxMark.Real?'✓':'×',12,-10,'#fff',13);}
      ctx.restore();
    };
    const draw = (now:number) => {
      raf = requestAnimationFrame(draw);
      const s=net.state; if(!s?.players || !s.boss) return;
      sendMove();
      if (held && now-lastAttack>100) { controls.current?.attack(); lastAttack=now; }
      const dpr=Math.min(2,devicePixelRatio||1);ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
      const me=net.me; const tracked=me?.alive?me:[...s.players.values()].find(p=>p.alive)??me;
      const p=tracked?net.positionOf(tracked.id,tracked):MAP.BASE;
      zoom=overviewRef.current?Math.min(width/MAP.WIDTH_PX,height/MAP.HEIGHT_PX):clamp(width/850,0.85,1.35);
      const vw=width/zoom,vh=height/zoom;
      camX=vw>MAP.WIDTH_PX?(MAP.WIDTH_PX-vw)/2:clamp(p.x-vw/2,0,MAP.WIDTH_PX-vw);
      camY=vh>MAP.HEIGHT_PX?(MAP.HEIGHT_PX-vh)/2:clamp(p.y-vh/2,0,MAP.HEIGHT_PX-vh);
      ctx.fillStyle='#a9a182';ctx.fillRect(0,0,width,height);
      ctx.save();ctx.scale(zoom,zoom);ctx.translate(-camX,-camY);ctx.drawImage(ground,0,0);
      // Home is both the extraction circle and a real server-side healing area.
      circle(MAP.BASE.x,MAP.BASE.y,MAP.BASE.radius,'#5aaf8d33','#539876');
      ctx.setLineDash([8,7]);circle(MAP.BASE.x,MAP.BASE.y,MAP.BASE.radius-9,'#0000','#96c8a9');ctx.setLineDash([]);
      label('EXTRACTION',MAP.BASE.x,MAP.BASE.y-54,'#37634e',13);
      label('RETURN THE LOOT · RECOVER HP',MAP.BASE.x,MAP.BASE.y+69,'#37634e',8);
      ctx.strokeStyle='#4d8f6c';ctx.lineWidth=3;ctx.strokeRect(MAP.BASE.x-13,MAP.BASE.y-12,26,24);
      ctx.beginPath();ctx.moveTo(MAP.BASE.x-5,MAP.BASE.y-18);ctx.lineTo(MAP.BASE.x+5,MAP.BASE.y-18);ctx.stroke();
      for (const [,r] of s.revives) if(!r.claimed) { const pulse=Math.sin(now/300)*3;circle(r.x,r.y,21+pulse,'#6ea9af22','#80b4b8');ctx.fillStyle='#e4ffff';ctx.fillRect(r.x-3,r.y-10,6,20);ctx.fillRect(r.x-10,r.y-3,20,6);label('REVIVE',r.x,r.y+34,'#486c70',9); }
      for (const [,c] of s.crystals) {
        circle(c.x,c.y,28,'#534a3640');
        if(c.destroyed){label('◇',c.x,c.y+6,'#80785d',24);continue;}
        circle(c.x,c.y,31,'#78b4ae30','#81aaa2');
        ctx.save();ctx.translate(c.x,c.y+Math.sin(now/450)*3);ctx.shadowBlur=20;ctx.shadowColor='#90e2cb';ctx.fillStyle='#63a69b';ctx.strokeStyle='#d9f1ce';ctx.lineWidth=2;
        ctx.beginPath();ctx.moveTo(0,-39);ctx.lineTo(16,-10);ctx.lineTo(0,13);ctx.lineTo(-16,-10);ctx.closePath();ctx.fill();ctx.stroke();
        ctx.fillStyle='#a5dcc2';ctx.beginPath();ctx.moveTo(0,-37);ctx.lineTo(0,10);ctx.lineTo(-14,-10);ctx.closePath();ctx.fill();ctx.restore();
        bar(c.x,c.y+26,48,hpPct(c),'#66bcb0');label('CRYSTAL',c.x,c.y+43,'#526451',8);
      }
      for (const [,b] of s.boxes) {
        if(b.state!==BoxState.Idle&&b.state!==BoxState.Dropped)continue;
        crate(b.x,b.y,b.mark);
        if(b.scan>0&&b.mark===BoxMark.Unknown){bar(b.x,b.y-30,38,b.scan/100,'#64bac7');label(`${b.scan}%`,b.x,b.y-38,'#31565b',10);}
        if(me?.alive&&!me.carryingBoxId&&Math.hypot(b.x-me.x,b.y-me.y)<=CRATES.PICKUP_RADIUS){circle(b.x,b.y,24,'#fff1','#f9eec9');label(b.mark===BoxMark.Fake?'TRAP · AVOID':'F · PICK UP',b.x,b.y+36,b.mark===BoxMark.Fake?'#a43c36':'#514831',10);}
      }
      for(const [,h] of s.hazards){circle(h.x,h.y,h.radius,'#a584cd25','#8165a4');label(h.kind.replaceAll('_',' ').toUpperCase(),h.x,h.y+4,'#5c447a',9);if(h.detonateAtMs>0)label(`${Math.max(0,(h.detonateAtMs-s.elapsedMs)/1000).toFixed(1)}s`,h.x,h.y+19,'#5c447a',10);}
      const boss=s.boss;
      if(boss.alive&&boss.attack){
        const spec=BOSS.ATTACKS[boss.attack as keyof typeof BOSS.ATTACKS];
        const progress=spec?clamp(1-(boss.attackAtMs-s.elapsedMs)/spec.windupMs,0,1):0;
        ctx.fillStyle=`rgba(185,54,45,${.15+progress*.3})`;ctx.strokeStyle='#b03e37';ctx.lineWidth=3;
        ctx.save();ctx.beginPath();
        if(boss.attack==='slam'){ctx.arc(boss.attackX,boss.attackY,BOSS.ATTACKS.slam.radius,0,TAU);}
        else {ctx.translate(boss.x,boss.y);ctx.rotate(Math.atan2(boss.attackY-boss.y,boss.attackX-boss.x));if(boss.attack==='charge'){const a=BOSS.ATTACKS.charge;ctx.rect(0,-a.width/2,a.distance,a.width);}else{const a=BOSS.ATTACKS.sweep;ctx.moveTo(0,0);ctx.arc(0,0,a.range,-a.arcDeg*Math.PI/360,a.arcDeg*Math.PI/360);ctx.closePath();}}
        ctx.fill();ctx.stroke();ctx.restore();
        label(`${boss.attack.toUpperCase()} · DODGE`,boss.x,boss.y-87,'#a6322e',12);
      }
      const actors: {y:number;draw():void}[]=[];
      for (const [id,c] of s.creeps) {
        const pos=net.positionOf(id,c);actors.push({y:pos.y,draw(){
          ctx.save();ctx.translate(pos.x,pos.y);circle(0,9,14,'#34281c35');
          drawRedGoblinMinion(ctx,{x:pos.x,y:pos.y,vx:c.behaviour==='chase'?80:0,vy:0,angle:c.facing,radius:13,type:'red_goblin'},now/1000);
          ctx.restore();if(c.hp<c.maxHp)bar(pos.x,pos.y-27,26,hpPct(c),'#c66650');if(c.windupUntilMs>s.elapsedMs)label('!',pos.x,pos.y-33,'#b12e23',23);
        }});
      }
      if(boss.alive){const bp=net.positionOf('boss',boss);actors.push({y:bp.y,draw(){ctx.save();ctx.translate(bp.x,bp.y);circle(0,20,48,'#4a271938');drawGoblinKing(ctx,{x:bp.x,y:bp.y,vx:boss.behaviour==='chase'?80:0,vy:0,angle:boss.facing,radius:34,type:'goblin_king'},now/1000);ctx.restore();bar(bp.x,bp.y-68,80,hpPct(boss),'#ba5541');}});}
      for(const [id,hero] of s.players){const pos=net.positionOf(id,hero);actors.push({y:pos.y,draw(){
        const col=colorOf(classOf(hero).color);
        if(!hero.alive){circle(pos.x,pos.y,15,'#71565b44','#ac7878');label('✚',pos.x,pos.y+5,'#9c5549',19);return;}
        circle(pos.x,pos.y+9,19,'#41372236');
        if(id===net.sessionId){circle(pos.x,pos.y+5,24,'#fffc','#fff8');circle(pos.x,pos.y+5,22,'#0000',col);}
        ctx.save();ctx.translate(pos.x,pos.y);HERO_ART[hero.classIndex]?.(ctx,{vx:hero.moving?90:0,vy:0,angle:hero.facing},now/1000);ctx.restore();
        if(hero.carryingBoxId)crate(pos.x+18,pos.y-25,BoxMark.Real,true);
        bar(pos.x,pos.y-53,38,hpPct(hero),col);label(id===net.sessionId?'YOU':hero.isBot?`${classOf(hero).name.split(' ')[0]} · BOT`:hero.name.slice(0,16),pos.x,pos.y-61,'#413e31',9);
      }});}
      actors.sort((a,b)=>a.y-b.y);actors.forEach(a=>a.draw());
      fx.current=fx.current.filter(f=>now-f.born<950);
      for(const f of fx.current){const age=(now-f.born)/950;ctx.save();ctx.globalAlpha=1-age;
        const heal=f.kind==='heal'||f.kind==='revive'||f.kind==='deliver';const c=heal?'#519676':f.kind==='hit'?'#b34935':'#e2b350';
        if(f.kind==='hit'||f.kind==='heal'){label(`${heal?'+':'−'}${f.value??''}`,f.x,f.y-28-age*35,c,16);}
        else if(f.kind==='attack'){const source=f.sourceId?s.players.get(f.sourceId):null;const angle=source?.facing??0;ctx.strokeStyle=c;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(f.x,f.y);ctx.lineTo(f.x+Math.cos(angle)*60*(age+.2),f.y+Math.sin(angle)*60*(age+.2));ctx.stroke();}
        else {circle(f.x,f.y,8+age*(f.kind==='explosion'?100:55),'#0000',c);for(let i=0;i<6;i++){const a=i*TAU/6;circle(f.x+Math.cos(a)*age*60,f.y+Math.sin(a)*age*60,3*(1-age),c);}}
        ctx.restore();
      }
      if(me?.carryingBoxId){const angle=Math.atan2(MAP.BASE.y-me.y,MAP.BASE.x-me.x);const ax=me.x+Math.cos(angle)*57,ay=me.y+Math.sin(angle)*57;ctx.save();ctx.translate(ax,ay);ctx.rotate(angle);ctx.fillStyle='#397351';ctx.beginPath();ctx.moveTo(12,0);ctx.lineTo(-6,-7);ctx.lineTo(-6,7);ctx.fill();ctx.restore();}
      if(hasAim&&allowed()){const a=aim();ctx.strokeStyle='#463c2a99';ctx.lineWidth=1.5;circle(a.x,a.y,7,'#0000','#463c2a99');ctx.beginPath();ctx.moveTo(a.x-11,a.y);ctx.lineTo(a.x-4,a.y);ctx.moveTo(a.x+4,a.y);ctx.lineTo(a.x+11,a.y);ctx.stroke();}
      ctx.restore();
      // Compact, always-visible map. Red = King, gold = unresolved crates, green = home.
      const mw=Math.min(174,width*.25),mh=mw/2,mx=width-mw-16,my=height-mh-16,ms=mw/MAP.WIDTH_PX;
      ctx.fillStyle='#262d25df';ctx.fillRect(mx-6,my-6,mw+12,mh+12);ctx.strokeStyle='#d7cfab77';ctx.strokeRect(mx-6,my-6,mw+12,mh+12);
      ctx.save();ctx.translate(mx,my);ctx.scale(ms,ms);
      for(let ty=0;ty<ARENA_H;ty++)for(let tx=0;tx<ARENA_W;tx++)if(ARENA_ROWS[ty][tx]==='#'){ctx.fillStyle='#89907c';ctx.fillRect(tx*TILE,ty*TILE,TILE,TILE);}
      circle(MAP.BASE.x,MAP.BASE.y,85,'#78c597');for(const [,b]of s.boxes)if(b.state===BoxState.Idle||b.state===BoxState.Dropped)circle(b.x,b.y,20,b.mark===BoxMark.Fake?'#c56a53':b.mark===BoxMark.Real?'#89d7a5':'#ddc48d');
      for(const [,c]of s.crystals)if(!c.destroyed)circle(c.x,c.y,24,'#83d6d3');
      if(boss.alive)circle(boss.x,boss.y,34,'#e0765b');for(const [id,h]of s.players)if(h.alive)circle(h.x,h.y,id===net.sessionId?30:22,id===net.sessionId?'#fff':'#a5bcdd');
      ctx.strokeStyle='#fffa';ctx.lineWidth=10;ctx.strokeRect(camX,camY,vw,vh);ctx.restore();
    };
    raf=requestAnimationFrame(draw);
    return () => {cancelAnimationFrame(raf);resize.disconnect();release();controls.current=null;window.removeEventListener('keydown',keyDown);window.removeEventListener('keyup',keyUp);window.removeEventListener('blur',release);window.removeEventListener('pointerup',pointerUp);document.removeEventListener('visibilitychange',visibility);canvas.removeEventListener('pointermove',pointerMove);canvas.removeEventListener('pointerdown',pointerDown);};
  }, [net, fx, controls]);
  return <canvas className="arena" ref={ref} aria-label="Heist arena. WASD to move, mouse to aim and attack, Q E R for skills, F to interact." />;
}

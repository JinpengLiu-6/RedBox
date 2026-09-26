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
      // High-contrast dark fantasy stone floor
      g.fillStyle = ['#121824','#101620','#151c28','#0e131b'][n%4]; g.fillRect(px,py,TILE,TILE);
      g.strokeStyle = '#1e293b44'; g.strokeRect(px+.5,py+.5,TILE-1,TILE-1);
      if (n < 3) { g.fillStyle = '#38bdf815'; g.fillRect(px+7+n*5,py+12,2,2); }
      if (tile === ',') {
        // Ancient dungeon moss / overgrown stone
        g.fillStyle = '#14251e'; g.fillRect(px,py,TILE,TILE);
        g.strokeStyle = '#1d3e2f'; g.lineWidth = 1.4;
        for (let j=0;j<4;j++) { const tx=px+5+j*7,ty=py+12+(j%2)*12; g.beginPath(); g.moveTo(tx-3,ty);g.lineTo(tx,ty-6);g.lineTo(tx+2,ty-1);g.stroke(); }
        if (n % 2 === 0) { g.fillStyle = '#10b98144'; g.fillRect(px+10, py+14, 2, 2); }
      }
      if (tile === '#') {
        // Carved basalt masonry wall with 3D depth and highlight
        g.fillStyle = '#05080c99'; g.fillRect(px+5,py+9,TILE+3,TILE+5);
        g.fillStyle = '#0a0f17'; g.fillRect(px,py,TILE,TILE);
        g.fillStyle = ['#1a2436','#1e293d','#243147'][n%3]; g.fillRect(px+1,py+1,TILE-2,TILE-9);
        g.fillStyle = '#38bdf844'; g.fillRect(px+2,py+1,TILE-4,2); // stone rim highlight
        g.strokeStyle = '#2d3e58'; g.strokeRect(px+.5,py+.5,TILE-1,TILE-1);
        if(n<3) {g.strokeStyle='#3b5172';g.beginPath();g.moveTo(px+8,py+4);g.lineTo(px+14,py+12);g.lineTo(px+10,py+21);g.stroke();}
      }
    }
    const circle = (x:number,y:number,r:number,fill:string,stroke?:string,lineWidth=2) => {
      ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fillStyle=fill;ctx.fill();
      if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lineWidth;ctx.stroke();}
    };
    const label = (text:string,x:number,y:number,color='#fff',size=11,weight=600) => {
      ctx.font=`${weight} ${size}px "DM Sans", "Trebuchet MS", sans-serif`;
      ctx.textAlign='center';ctx.fillStyle=color;ctx.fillText(text,x,y);
    };
    const bar = (x:number,y:number,w:number,p:number,color:string) => {
      ctx.fillStyle='#090e17dd';ctx.fillRect(x-w/2,y,w,6);
      ctx.strokeStyle='#1e293b';ctx.lineWidth=1;ctx.strokeRect(x-w/2,y,w,6);
      ctx.fillStyle=color;ctx.fillRect(x-w/2+1,y+1,(w-2)*clamp(p,0,1),4);
    };
    const crate = (x:number,y:number,mark:number,small=false) => {
      ctx.save();ctx.translate(x,y);if(small)ctx.scale(.7,.7);
      ctx.fillStyle='rgba(0,0,0,0.45)';ctx.beginPath();ctx.ellipse(2,13,18,7,0,0,TAU);ctx.fill();
      // Ornate wooden treasure chest with polished metal bands
      ctx.fillStyle=mark===BoxMark.Fake?'#6b211d':'#854d0e';ctx.strokeStyle='#26150b';ctx.lineWidth=2;
      ctx.fillRect(-14,-12,28,25);ctx.strokeRect(-14,-12,28,25);
      // Gold trim
      ctx.fillStyle='#d97706';ctx.fillRect(-14,-13,28,8);ctx.strokeRect(-14,-13,28,8);
      ctx.fillStyle='#fbbf24';ctx.fillRect(-10,-12,3,24);ctx.fillRect(7,-12,3,24);ctx.fillRect(-3,-4,6,8);
      if(mark!==BoxMark.Unknown) {
        circle(12,-14,10,mark===BoxMark.Real?'#10b981':'#ef4444','#ffffff',2);
        label(mark===BoxMark.Real?'✓':'×',12,-10,'#fff',12,700);
      }
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
      ctx.fillStyle='#090d14';ctx.fillRect(0,0,width,height);
      ctx.save();ctx.scale(zoom,zoom);ctx.translate(-camX,-camY);ctx.drawImage(ground,0,0);
      
      // Home is both the extraction circle and a real server-side healing area.
      const basePulse = Math.sin(now / 350) * 4;
      circle(MAP.BASE.x,MAP.BASE.y,MAP.BASE.radius + basePulse*0.5,'rgba(16, 185, 129, 0.12)','#10b981',2.5);
      ctx.setLineDash([8,7]);circle(MAP.BASE.x,MAP.BASE.y,MAP.BASE.radius-10,'#0000','rgba(52, 211, 153, 0.5)',1.5);ctx.setLineDash([]);
      label('EXTRACTION BASE',MAP.BASE.x,MAP.BASE.y-54,'#34d399',13,700);
      label('SECURE LOOT · RECOVER HP',MAP.BASE.x,MAP.BASE.y+72,'#6ee7b7',9,600);
      ctx.strokeStyle='#10b981';ctx.lineWidth=3;ctx.strokeRect(MAP.BASE.x-13,MAP.BASE.y-12,26,24);
      ctx.beginPath();ctx.moveTo(MAP.BASE.x-5,MAP.BASE.y-18);ctx.lineTo(MAP.BASE.x+5,MAP.BASE.y-18);ctx.stroke();

      for (const [,r] of s.revives) if(!r.claimed) {
        const pulse=Math.sin(now/280)*4;
        circle(r.x,r.y,22+pulse,'rgba(6, 182, 212, 0.2)','#06b6d4',2.5);
        ctx.fillStyle='#a5f3fc';ctx.fillRect(r.x-3,r.y-10,6,20);ctx.fillRect(r.x-10,r.y-3,20,6);
        label('REVIVE',r.x,r.y+36,'#22d3ee',10,700);
      }
      for (const [,c] of s.crystals) {
        circle(c.x,c.y,28,'rgba(0,0,0,0.4)');
        if(c.destroyed){label('◇',c.x,c.y+6,'#64748b',24);continue;}
        circle(c.x,c.y,31,'rgba(6, 182, 212, 0.22)','#0891b2',2);
        ctx.save();ctx.translate(c.x,c.y+Math.sin(now/450)*4);ctx.shadowBlur=22;ctx.shadowColor='#06b6d4';ctx.fillStyle='#0891b2';ctx.strokeStyle='#e0f2fe';ctx.lineWidth=2;
        ctx.beginPath();ctx.moveTo(0,-39);ctx.lineTo(16,-10);ctx.lineTo(0,13);ctx.lineTo(-16,-10);ctx.closePath();ctx.fill();ctx.stroke();
        ctx.fillStyle='#38bdf8';ctx.beginPath();ctx.moveTo(0,-37);ctx.lineTo(0,10);ctx.lineTo(-14,-10);ctx.closePath();ctx.fill();ctx.restore();
        bar(c.x,c.y+26,48,hpPct(c),'#06b6d4');label('TOWER CRYSTAL',c.x,c.y+44,'#94a3b8',9,600);
      }
      for (const [,b] of s.boxes) {
        if(b.state!==BoxState.Idle&&b.state!==BoxState.Dropped)continue;
        crate(b.x,b.y,b.mark);
        // Animated scanning gauge
        if(b.scan>0&&b.mark===BoxMark.Unknown){
          bar(b.x,b.y-30,40,b.scan/100,'#38bdf8');
          label(`SCANNING ${b.scan}%`,b.x,b.y-38,'#38bdf8',10,700);
        }
        // In-World Diegetic Floating Prompt
        if(me?.alive&&!me.carryingBoxId&&Math.hypot(b.x-me.x,b.y-me.y)<=CRATES.PICKUP_RADIUS){
          const isTrap = b.mark === BoxMark.Fake;
          const isReal = b.mark === BoxMark.Real;
          const auraPulse = Math.sin(now/250)*3;
          circle(b.x,b.y,25+auraPulse,isTrap?'rgba(239,68,68,0.15)':isReal?'rgba(16,185,129,0.18)':'rgba(245,158,11,0.18)',isTrap?'#ef4444':isReal?'#10b981':'#f59e0b',2);
          
          // Floating Arcade Pill Badge
          const pillText = isTrap ? 'TRAP DETECTED · AVOID' : isReal ? '[F] SECURE TREASURE' : b.scan > 0 ? `SCANNING ${b.scan}%` : '[F] PICK UP / SCAN';
          const pillBg = isTrap ? '#7f1d1ddd' : isReal ? '#064e3bdd' : '#78350fdd';
          const pillBorder = isTrap ? '#ef4444' : isReal ? '#10b981' : '#f59e0b';
          const pillTextColor = isTrap ? '#fca5a5' : isReal ? '#a7f3d0' : '#fef08a';
          
          ctx.save();
          ctx.font = '700 10px "DM Sans", sans-serif';
          const txtW = ctx.measureText(pillText).width;
          const pillY = b.y - 42;
          ctx.fillStyle = pillBg;
          ctx.strokeStyle = pillBorder;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.roundRect(b.x - txtW/2 - 8, pillY - 10, txtW + 16, 20, 10);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = pillTextColor;
          ctx.textAlign = 'center';
          ctx.fillText(pillText, b.x, pillY + 4);
          ctx.restore();
        }
      }
      for(const [,h] of s.hazards){
        circle(h.x,h.y,h.radius,'rgba(168, 85, 247, 0.15)','#a855f7',2);
        label(h.kind.replaceAll('_',' ').toUpperCase(),h.x,h.y+4,'#c084fc',9,700);
        if(h.detonateAtMs>0)label(`${Math.max(0,(h.detonateAtMs-s.elapsedMs)/1000).toFixed(1)}s`,h.x,h.y+19,'#f3e8ff',10,700);
      }
      const boss=s.boss;
      if(boss.alive&&boss.attack){
        const spec=BOSS.ATTACKS[boss.attack as keyof typeof BOSS.ATTACKS];
        const progress=spec?clamp(1-(boss.attackAtMs-s.elapsedMs)/spec.windupMs,0,1):0;
        ctx.fillStyle=`rgba(239, 68, 68, ${0.18 + progress * 0.35})`;
        ctx.strokeStyle='#ef4444';ctx.lineWidth=3;
        ctx.save();ctx.beginPath();
        if(boss.attack==='slam'){ctx.arc(boss.attackX,boss.attackY,BOSS.ATTACKS.slam.radius,0,TAU);}
        else {ctx.translate(boss.x,boss.y);ctx.rotate(Math.atan2(boss.attackY-boss.y,boss.attackX-boss.x));if(boss.attack==='charge'){const a=BOSS.ATTACKS.charge;ctx.rect(0,-a.width/2,a.distance,a.width);}else{const a=BOSS.ATTACKS.sweep;ctx.moveTo(0,0);ctx.arc(0,0,a.range,-a.arcDeg*Math.PI/360,a.arcDeg*Math.PI/360);ctx.closePath();}}
        ctx.fill();ctx.stroke();ctx.restore();
        label(`⚠ ${boss.attack.toUpperCase()} · DODGE!`,boss.x,boss.y-87,'#f87171',13,700);
      }
      const actors: {y:number;draw():void}[]=[];
      for (const [id,c] of s.creeps) {
        const pos=net.positionOf(id,c);actors.push({y:pos.y,draw(){
          ctx.save();ctx.translate(pos.x,pos.y);circle(0,9,14,'rgba(0,0,0,0.4)');
          drawRedGoblinMinion(ctx,{x:pos.x,y:pos.y,vx:c.behaviour==='chase'?80:0,vy:0,angle:c.facing,radius:13,type:'red_goblin'},now/1000);
          ctx.restore();if(c.hp<c.maxHp)bar(pos.x,pos.y-27,26,hpPct(c),'#ef4444');
          if(c.windupUntilMs>s.elapsedMs)label('!',pos.x,pos.y-33,'#ef4444',24,800);
        }});
      }
      if(boss.alive){const bp=net.positionOf('boss',boss);actors.push({y:bp.y,draw(){
        ctx.save();ctx.translate(bp.x,bp.y);circle(0,20,48,'rgba(0,0,0,0.5)');
        drawGoblinKing(ctx,{x:bp.x,y:bp.y,vx:boss.behaviour==='chase'?80:0,vy:0,angle:boss.facing,radius:34,type:'goblin_king'},now/1000);
        ctx.restore();bar(bp.x,bp.y-68,80,hpPct(boss),'#ef4444');
        label('GOBLIN KING',bp.x,bp.y-75,'#fca5a5',10,700);
      }});}
      for(const [id,hero] of s.players){const pos=net.positionOf(id,hero);actors.push({y:pos.y,draw(){
        const col=colorOf(classOf(hero).color);
        if(!hero.alive){
          circle(pos.x,pos.y,16,'rgba(239, 68, 68, 0.2)','#ef4444',2);
          label('✚ DOWN',pos.x,pos.y+5,'#f87171',12,700);return;
        }
        circle(pos.x,pos.y+9,19,'rgba(0,0,0,0.45)');
        if(id===net.sessionId){
          // Luminous local player halo
          circle(pos.x,pos.y+5,24,'rgba(255,255,255,0.08)','rgba(255,255,255,0.6)',2);
          circle(pos.x,pos.y+5,21,'#0000',col,1.5);
        }
        ctx.save();ctx.translate(pos.x,pos.y);HERO_ART[hero.classIndex]?.(ctx,{vx:hero.moving?90:0,vy:0,angle:hero.facing},now/1000);ctx.restore();
        if(hero.carryingBoxId)crate(pos.x+18,pos.y-25,BoxMark.Real,true);
        bar(pos.x,pos.y-53,38,hpPct(hero),col);
        label(id===net.sessionId?'YOU':hero.isBot?`${classOf(hero).name.split(' ')[0]} (BOT)`:hero.name.slice(0,16),pos.x,pos.y-61,id===net.sessionId?'#fef08a':'#f1f5f9',9,700);
      }});}
      actors.sort((a,b)=>a.y-b.y);actors.forEach(a=>a.draw());
      fx.current=fx.current.filter(f=>now-f.born<950);
      for(const f of fx.current){const age=(now-f.born)/950;ctx.save();ctx.globalAlpha=1-age;
        const heal=f.kind==='heal'||f.kind==='revive'||f.kind==='deliver';
        const c=heal?'#10b981':f.kind==='hit'?'#ef4444':'#fbbf24';
        if(f.kind==='hit'||f.kind==='heal'){label(`${heal?'+':'−'}${f.value??''}`,f.x,f.y-28-age*35,c,16,700);}
        else if(f.kind==='attack'){const source=f.sourceId?s.players.get(f.sourceId):null;const angle=source?.facing??0;ctx.strokeStyle=c;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(f.x,f.y);ctx.lineTo(f.x+Math.cos(angle)*60*(age+.2),f.y+Math.sin(angle)*60*(age+.2));ctx.stroke();}
        else {circle(f.x,f.y,8+age*(f.kind==='explosion'?100:55),'#0000',c,2);for(let i=0;i<6;i++){const a=i*TAU/6;circle(f.x+Math.cos(a)*age*60,f.y+Math.sin(a)*age*60,3*(1-age),c);}}
        ctx.restore();
      }
      if(me?.carryingBoxId){
        // Glowing navigational extraction guide arrow
        const angle=Math.atan2(MAP.BASE.y-me.y,MAP.BASE.x-me.x);
        const ax=me.x+Math.cos(angle)*58,ay=me.y+Math.sin(angle)*58;
        ctx.save();ctx.translate(ax,ay);ctx.rotate(angle);
        ctx.fillStyle='#10b981';ctx.beginPath();ctx.moveTo(14,0);ctx.lineTo(-7,-8);ctx.lineTo(-7,8);ctx.fill();
        ctx.restore();
      }
      // Tactical Reticle / Crosshair in Celestial Cyan
      if(hasAim&&allowed()){
        const a=aim();
        ctx.strokeStyle='#38bdf8';ctx.lineWidth=1.5;
        circle(a.x,a.y,7,'rgba(56, 189, 248, 0.1)','#38bdf8',1.5);
        ctx.beginPath();
        ctx.moveTo(a.x-12,a.y);ctx.lineTo(a.x-4,a.y);
        ctx.moveTo(a.x+4,a.y);ctx.lineTo(a.x+12,a.y);
        ctx.moveTo(a.x,a.y-12);ctx.lineTo(a.x,a.y-4);
        ctx.moveTo(a.x,a.y+4);ctx.lineTo(a.x,a.y+12);
        ctx.stroke();
      }
      ctx.restore();
      
      // Modern High-Contrast Minimap
      const mw=Math.min(174,width*.25),mh=mw/2,mx=width-mw-16,my=height-mh-16,ms=mw/MAP.WIDTH_PX;
      ctx.fillStyle='#090e17ee';ctx.fillRect(mx-6,my-6,mw+12,mh+12);
      ctx.strokeStyle='#38bdf855';ctx.lineWidth=1.5;ctx.strokeRect(mx-6,my-6,mw+12,mh+12);
      ctx.save();ctx.translate(mx,my);ctx.scale(ms,ms);
      for(let ty=0;ty<ARENA_H;ty++)for(let tx=0;tx<ARENA_W;tx++)if(ARENA_ROWS[ty][tx]==='#'){ctx.fillStyle='#1e293b';ctx.fillRect(tx*TILE,ty*TILE,TILE,TILE);}
      circle(MAP.BASE.x,MAP.BASE.y,85,'rgba(16, 185, 129, 0.8)');
      for(const [,b]of s.boxes)if(b.state===BoxState.Idle||b.state===BoxState.Dropped)circle(b.x,b.y,20,b.mark===BoxMark.Fake?'#ef4444':b.mark===BoxMark.Real?'#10b981':'#f59e0b');
      for(const [,c]of s.crystals)if(!c.destroyed)circle(c.x,c.y,24,'#06b6d4');
      if(boss.alive)circle(boss.x,boss.y,36,'#ef4444');
      for(const [id,h]of s.players)if(h.alive)circle(h.x,h.y,id===net.sessionId?32:24,id===net.sessionId?'#ffffff':'#38bdf8');
      ctx.strokeStyle='#f8fafcaa';ctx.lineWidth=10;ctx.strokeRect(camX,camY,vw,vh);
      ctx.restore();
    };
    raf=requestAnimationFrame(draw);
    return () => {cancelAnimationFrame(raf);resize.disconnect();release();controls.current=null;window.removeEventListener('keydown',keyDown);window.removeEventListener('keyup',keyUp);window.removeEventListener('blur',release);window.removeEventListener('pointerup',pointerUp);document.removeEventListener('visibilitychange',visibility);canvas.removeEventListener('pointermove',pointerMove);canvas.removeEventListener('pointerdown',pointerDown);};
  }, [net, fx, controls]);
  return <canvas className="arena" ref={ref} aria-label="Heist arena. WASD to move, mouse to aim and attack, Q E R for skills, F to interact." />;
}

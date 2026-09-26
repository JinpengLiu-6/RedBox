import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowLeft, ArrowRight, Box, Check, ChevronRight, CircleHelp, Copy, Crown, Diamond, Flag, Heart, LoaderCircle, Map, Radio, ScanLine, Shield, Skull, Sparkles, Swords, Target, Trophy, Users, Volume2, VolumeX, X, Zap } from 'lucide-react';
import { CLASS_IDS, CLASSES, CRATES, MatchPhase, Outcome, BoxMark, BoxState, classOf, classIdOf, hpPct, isAbilityReady, abilityCooldownProgress, type ClassId, type DebriefPayload, type MatchEvent } from '@redbox/shared';
import { Net, VoicePlayer } from '../net';
import { sound } from '../audio/soundEngine';
import banner from '../assets/images/goblin_heist_banner_1790428280362.jpg';
import { Arena, Portrait, type ArenaControls, type VisualFx } from './Arena';
import { HERO_META } from './art';

const clock = (ms: number) => `${Math.floor(Math.max(0,ms)/60000)}:${String(Math.floor(Math.max(0,ms)/1000)%60).padStart(2,'0')}`;
const color = (n:number) => '#' + n.toString(16).padStart(6,'0');
const statNames: Partial<Record<MatchEvent['type'],string>> = { box_delivered:'Treasure secured', trap_triggered:'A trap released 3 goblins!', crystal_destroyed:'Crystal shattered · King weakened', player_died:'A hero has fallen', player_respawned:'A hero returned to base', player_revived:'A teammate was revived', boss_defeated:'The Goblin King is down', wave_start:'A new wave begins', box_scanned:'A crate has been identified' };
const skillIcons = [Sparkles, Zap, Swords];

export default function HeistApp() {
  const [selected,setSelected]=useState<ClassId>('dwarf');
  const [name,setName]=useState('Adventurer');
  const [status,setStatus]=useState<'idle'|'connecting'|'online'|'reconnecting'|'offline'>('idle');
  const [network,setNetwork]=useState<Net|null>(null);
  const [screen,setScreen]=useState<'home'|'multiplayer'>('home');
  const [roomCode,setRoomCode]=useState('');
  const [error,setError]=useState('');
  const [help,setHelp]=useState(false);
  const [muted,setMuted]=useState(false);
  const [overview,setOverview]=useState(false);
  const [notice,setNotice]=useState('');
  const [copied,setCopied]=useState(false);
  const [events,setEvents]=useState<MatchEvent[]>([]);
  const [debrief,setDebrief]=useState<DebriefPayload|null>(null);
  const [,refresh]=useState(0);
  const current=useRef<Net|null>(null);
  const voice=useRef(new VoicePlayer(.7));
  const fx=useRef<VisualFx[]>([]);
  const controls=useRef<ArenaControls|null>(null);
  const connecting=useRef(false);
  const generation=useRef(0);
  const recap=useRef(false);
  const seenPhase=useRef<number>(-1);
  const snapshot=network?.room?.state;
  // Colyseus resolves the seat reservation before its first full state patch.
  const s=snapshot?.boss && snapshot.director && snapshot.players ? snapshot : undefined;
  const me=s?.players?.get(network?.sessionId??'');
  const players=s?.players?[...s.players.values()]:[];
  const isLobby=!!s&&s.phase===MatchPhase.Lobby;
  const playing=!!s&&s.phase!==MatchPhase.Lobby;
  const spec=CLASSES[me?classIdOf(me):selected];
  const meta=HERO_META[spec.id];

  useEffect(()=>{
    const unlock=voice.current.unlockOnGesture();
    const timer=window.setInterval(()=>refresh(v=>v+1),80);
    return()=>{clearInterval(timer);unlock();voice.current.stop();generation.current++;void current.current?.leave();};
  },[]);
  useEffect(()=>{sound.setMuted(muted);voice.current.volume=muted?0:.7;},[muted]);
  useEffect(()=>{if(!notice)return;const t=setTimeout(()=>setNotice(''),4200);return()=>clearTimeout(t);},[notice]);
  useEffect(()=>{
    const key=(e:KeyboardEvent)=>{if((e.target as HTMLElement)?.closest('input,textarea'))return;if(e.key==='Escape')setHelp(h=>!h);if(e.key.toLowerCase()==='m')setMuted(m=>!m);if(e.key==='Tab'&&network){e.preventDefault();setOverview(m=>!m);}};
    window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);
  },[network]);
  useEffect(()=>{
    if(s?.phase===undefined||seenPhase.current===s.phase)return;
    seenPhase.current=s.phase;
    if(recap.current&&s.phase!==MatchPhase.Ended){voice.current.stop();recap.current=false;}
    if(s.phase===MatchPhase.Lobby){setDebrief(null);setEvents([]);fx.current=[];}
    if(s.phase===MatchPhase.Playing)sound.playClick();
  },[s?.phase]);

  async function connect(mode:'create'|'join', instant=false){
    if(connecting.current)return;
    if(mode==='join'&&!/^[A-HJ-NP-Z2-9]{4}$/.test(roomCode.trim().toUpperCase())){setError('Enter the 4-character code from your friend’s lobby.');return;}
    connecting.current=true;const token=++generation.current;
    sound.playClick();void voice.current.unlock();setError('');setStatus('connecting');setEvents([]);setDebrief(null);
    const net=new Net();
    try{
      await net.connect({name:name.trim().slice(0,24)||'Adventurer',classId:selected,mode,roomCode:mode==='join'?roomCode.trim():undefined,
        endpoint:import.meta.env.VITE_GAME_SERVER||(import.meta.env.DEV?`${location.protocol==='https:'?'wss':'ws'}://${location.host}/game`:undefined)}, {
        onFx(f){if(current.current!==net)return;fx.current.push({...f,born:performance.now()});if(fx.current.length>180)fx.current.splice(0,fx.current.length-180);
          if(f.kind==='deliver')sound.playDeliverySuccess();else if(f.kind==='trap')sound.playTrapAlert();else if(f.kind==='explosion'&&f.sourceId===net.sessionId)sound.playExplosion();else if(f.kind==='attack'&&f.sourceId===net.sessionId)sound.playAttack('bolt');},
        onEvent(e){if(current.current!==net)return;setEvents(a=>[...a,e].slice(-500));if(statNames[e.type])setNotice(statNames[e.type]!);},
        onDebrief(d){if(current.current===net)setDebrief(d);},
        onBossVoice(audio){if(current.current!==net)return;recap.current=false;void voice.current.play(audio);},
        onDebriefVoice(audio){if(current.current!==net||net.state.phase!==MatchPhase.Ended)return;recap.current=true;void voice.current.play(audio);},
        onError(_code,message){if(current.current===net)setError(message);},
        onReconnecting(){if(current.current===net)setStatus('reconnecting');},
        onReconnected(){if(current.current===net)setStatus('online');},
        onLeave(){if(current.current===net){setStatus('offline');setError('The connection closed. Return to camp to join a fresh expedition.');}},
      });
      if(token!==generation.current){await net.leave();return;}
      current.current=net;setNetwork(net);setStatus('online');
      if(instant)net.ready();
    }catch(err){if(token===generation.current){setStatus('idle');setError(`${err instanceof Error?err.message:'Unable to reach the game server.'} Check that the demo server is running, then try again.`);}}
    finally{connecting.current=false;}
  }
  function leave(){generation.current++;const net=current.current;current.current=null;void net?.leave();voice.current.stop();fx.current=[];setNetwork(null);setStatus('idle');setError('');setEvents([]);setDebrief(null);setNotice('');seenPhase.current=-1;}
  function choose(id:ClassId){sound.playClick();setSelected(id);if(isLobby)network?.pickClass(id);}
  async function copyCode(){try{await navigator.clipboard.writeText(s?.roomCode??'');setCopied(true);setTimeout(()=>setCopied(false),1800);}catch{setNotice(`Room code: ${s?.roomCode}`);}}
  const chosenIndex=CLASS_IDS.indexOf(spec.id);
  const busy=status==='connecting';
  const nearBox=me&&s?[...s.boxes.values()].filter(b=>b.state===BoxState.Idle||b.state===BoxState.Dropped).sort((a,b)=>Math.hypot(a.x-me.x,a.y-me.y)-Math.hypot(b.x-me.x,b.y-me.y))[0]:undefined;
  const inReach=nearBox&&me&&Math.hypot(nearBox.x-me.x,nearBox.y-me.y)<=CRATES.PICKUP_RADIUS;
  const scan=inReach&&nearBox.mark===BoxMark.Unknown;
  const deliveries=events.filter(e=>e.type==='box_delivered').length;
  const towers=events.filter(e=>e.type==='crystal_destroyed').length;
  const deaths=events.filter(e=>e.type==='player_died').length;
  const eventFeed=events.filter(e=>statNames[e.type]).slice(-4).reverse();

  return <div className={`heist-app ${playing?'in-game':''}`}>
    <header className="topbar">
      <button className="brand" onClick={()=>{if(!network)setScreen('home');else setHelp(true);}} aria-label="Goblin King Heist"><span className="brand-mark"><Crown size={23}/></span><span>GOBLIN KING <b>HEIST</b></span></button>
      <div className="top-mid">{playing?<><span className="live-dot"/>EXPEDITION IN PROGRESS</>:<>A COOPERATIVE DUNGEON CAPER <span> / </span> 01</>}</div>
      <div className="top-actions"><button className="icon-btn" onClick={()=>setMuted(v=>!v)} aria-label={muted?'Enable audio':'Mute audio'} title="Audio (M)">{muted?<VolumeX size={19}/>:<Volume2 size={19}/>}</button><button className="icon-btn" onClick={()=>setHelp(true)} aria-label="How to play"><CircleHelp size={19}/></button>{network&&<button className="text-btn" onClick={leave}>Leave expedition <ArrowRight size={15}/></button>}</div>
    </header>

    {!network&&<main className="camp">
      <section className="hero-section">
        <div className="hero-copy"><div className="eyebrow"><span/> FIVE HEROES. ONE VERY ANGRY KING.</div><h1>His treasure.<br/>Your <em>problem.</em></h1><p>Gather your crew. Find the real loot.<br/>Make it home before the King finds you.</p><div className="hero-tags"><span><Users size={14}/> 1–5 players</span><span><Flag size={14}/> 3 waves</span><span><Swords size={14}/> 7-minute heist</span></div></div>
        <div className="hero-art"><img src={banner} alt="Five adventurers face the Goblin King in a treasure-filled dungeon"/><div className="art-stamp"><Crown size={20}/><span>THE KING'S VAULT<br/><b>ENTER AT YOUR OWN RISK</b></span></div><div className="art-caption"><span>THE CREW IS SMALL.</span><strong>The ambition isn't.</strong></div></div>
      </section>
      <section className="draft"><div className="section-label"><span><b>01</b> CHOOSE YOUR TROUBLEMAKER</span><small>Every hero fights. Every hero can carry.</small></div><div className="hero-cards">{CLASS_IDS.map((id,i)=><button key={id} className={`hero-card ${selected===id?'selected':''}`} style={{'--hero':HERO_META[id].color} as CSSProperties} onClick={()=>choose(id)} aria-pressed={selected===id}><span className="hero-number">0{i+1}</span>{selected===id&&<span className="selected-check"><Check size={13}/></span>}<Portrait index={i}/><strong>{CLASSES[id].name}</strong><small>{HERO_META[id].role}</small></button>)}</div></section>
      <section className="loadout"><div className="loadout-title"><span className="eyebrow">YOUR SPECIALTY</span><h2>{meta.title}</h2><p>{meta.description}</p></div><div className="ability-preview">{spec.abilities.map((a,i)=>{const Icon=skillIcons[i];return <div key={a.id} title={a.description}><span className="skill-icon"><Icon size={21}/><kbd>{'QER'[i]}</kbd></span><strong>{a.name}</strong><small>{i===0?'READY FROM WAVE 1':`UNLOCKS IN WAVE ${i+1}`}</small></div>;})}</div></section>
      <section className="launch-panel"><label className="name-field"><span>WHAT SHOULD THE CREW CALL YOU?</span><input aria-label="Your name" value={name} onChange={e=>setName(e.target.value)} maxLength={24} placeholder="Adventurer"/></label><div className="launch-note"><Users size={21}/><p>Going solo?<br/><strong>Four bot companions have your back.</strong></p></div><div className="launch-actions"><button className="secondary" disabled={busy} onClick={()=>{setScreen('multiplayer');setError('');}}><Users size={17}/> Play with friends</button><button className="primary" disabled={busy} onClick={()=>void connect('create',true)}>{busy?<LoaderCircle className="spin" size={18}/>:<Swords size={18}/>} {busy?'Gathering your crew…':'Start a solo heist'} {!busy&&<ArrowRight size={18}/>}</button></div></section>
      {error&&<div className="error-banner" role="alert">{error}</div>}
      <footer className="camp-footer"><span><span className="live-dot"/> PLAYABLE DEMO · SERVER-AUTHORITATIVE CO-OP</span><button className="text-btn" onClick={()=>setHelp(true)}>Read the field guide <ArrowRight size={14}/></button></footer>
    </main>}

    {network&&s&&isLobby&&<main className="lobby"><button className="text-btn" onClick={leave}><ArrowLeft size={16}/> Back to camp</button><div className="lobby-heading"><div><div className="eyebrow">THE CREW ASSEMBLES</div><h1>A good heist<br/>starts with <em>company.</em></h1><p>Share this code before anyone readies up. Empty seats become bot companions when the expedition starts.</p></div><button className="room-ticket" onClick={()=>void copyCode()}><span>YOUR PRIVATE ROOM</span><strong>{s.roomCode}</strong><small>{copied?<><Check size={15}/> Copied</>:<><Copy size={15}/> Copy invite code</>}</small></button></div><div className="hero-cards">{CLASS_IDS.map((id,i)=>{const p=players.find(p=>p.classIndex===i),taken=!!p&&p.id!==network.sessionId;return <button key={id} disabled={taken||me?.ready} onClick={()=>choose(id)} className={`hero-card ${me?.classIndex===i?'selected':''}`} style={{'--hero':HERO_META[id].color} as CSSProperties}><Portrait index={i}/><strong>{CLASSES[id].name}</strong><small>{p?`${p.name}${p.id===network.sessionId?' · YOU':''}`:'BOT WILL FILL THIS SEAT'}</small><span className="seat-status">{p?.ready?'✓ READY':p?'CHOOSING GEAR':'OPEN SEAT'}</span></button>;})}</div><div className="lobby-bottom"><p><Radio size={17}/> {players.length} / 5 adventurers connected</p><button className="primary" disabled={!me||me.ready||status!=='online'} onClick={()=>network.ready()}>{me?.ready?<><LoaderCircle className="spin" size={18}/> Waiting for the crew…</>:<>Ready for the heist <ArrowRight size={18}/></>}</button></div></main>}
    {network&&!s?.players&&<div className="loading"><LoaderCircle className="spin"/> Loading the vault…</div>}

    {network&&s&&playing&&<>
      <div className="mission-bar"><div className="wave-mark"><Flag size={20}/><div><small>THE KING'S VAULT</small><strong>Wave {s.stage} <span>/ 3</span></strong></div><div className="wave-pips">{[1,2,3].map(i=><i key={i} className={i<=s.stage?'active':''}/>)}</div></div><div className="objective"><Box size={23}/><div><strong>{s.boxesDelivered} <span>/ {s.boxesRequired||3}</span></strong><small>TREASURE SECURED</small></div></div><div className="objective crystals"><Diamond size={22}/><div><strong>{s.crystalsDestroyed} <span>/ 3</span></strong><small>CRYSTALS SHATTERED</small></div></div><div className="timer"><small>TIME REMAINING</small><strong className={s.timeRemainingMs<60000?'danger':''}>{clock(s.timeRemainingMs)}</strong></div><button className="map-btn" onClick={()=>setOverview(v=>!v)} aria-pressed={overview}><Map size={17}/><span>{overview?'Follow hero':'View map'} <kbd>Tab</kbd></span></button></div>
      <main className="battle-layout">
        <aside className="squad-panel"><div className="panel-heading"><Users size={15}/> YOUR CREW <span>5</span></div><div className="squad-list">{players.map(p=><div className={`squad-member ${p.id===network.sessionId?'is-you':''} ${!p.alive?'down':''}`} key={p.id}><div className="mini-portrait" style={{'--hero':color(classOf(p).color)} as CSSProperties}><Portrait index={p.classIndex}/></div><div className="member-info"><strong>{p.id===network.sessionId?'You':p.isBot?classOf(p).name.split(' ')[0]:p.name.slice(0,14)} <span>{p.isBot?'BOT':p.id===network.sessionId?'':'LIVE'}</span></strong><small>{classOf(p).name}</small><div className="health-track"><i style={{width:`${hpPct(p)*100}%`,background:color(classOf(p).color)}}/></div><div className="member-meta"><span>{Array.from({length:3},(_,i)=><Heart key={i} size={9} fill={i<p.lives?'currentColor':'none'} opacity={i<p.lives?1:.25}/>)}</span><small>{p.carryingBoxId?'CARRYING LOOT':!p.alive?(p.lives>0?'RESPAWNING':'NEEDS REVIVAL'):`${p.hp} HP`}</small></div></div></div>)}</div><div className="crew-tip"><Shield size={20}/><strong>Better together.</strong><p>Return to the green base to deliver treasure and recover health.</p></div><div className="room-id"><span className="live-dot"/> {status==='online'?'CONNECTED':status.toUpperCase()}<small>ROOM {s.roomCode}</small></div></aside>
        <section className="arena-wrap"><Arena net={network} fx={fx} disabled={help||status!=='online'} controls={controls} overview={overview}/>
          {s.boss.alive && <div className="boss-raid-banner"><div className="boss-raid-info"><Crown size={15} className="boss-crown-icon"/><span className="boss-raid-name">THE GOBLIN KING</span><span className="boss-raid-dmg">×{s.bossDamageMult.toFixed(2)} DMG</span><span className="boss-raid-hp">{s.boss.hp.toLocaleString()} / {s.boss.maxHp.toLocaleString()} HP</span></div><div className="boss-raid-bar"><i style={{width:`${hpPct(s.boss)*100}%`}}/></div></div>}
          <div className="arena-label"><span className="live-dot"/> {overview?'TACTICAL OVERVIEW':'THE KING’S VAULT'} <span> / </span> WAVE 0{s.stage}</div>{notice&&<div className="toast" role="status"><Sparkles size={15}/>{notice}</div>}
          {s.phase===MatchPhase.Countdown&&<div className="stage-overlay"><span className="eyebrow">YOUR CREW IS READY</span><h2>The heist begins.</h2><p>Get the treasure. Get everyone home.</p><LoaderCircle className="spin"/></div>}
          {s.phase===MatchPhase.WaveTransition&&<div className="stage-overlay"><Check size={38}/><span className="eyebrow">WAVE {s.stage} COMPLETE</span><h2>Nice haul, crew.</h2><p>Wave {s.stage+1} is coming. Your {'QER'[s.stage]} skill unlocks next.</p><div className="transition-progress"/></div>}
          {me&&!me.alive&&s.phase===MatchPhase.Playing&&<div className="down-notice"><Heart size={20}/><strong>{me.lives>0?`Back in ${Math.max(0,Math.ceil((me.respawnAtMs-s.elapsedMs)/1000))}s`:'Waiting for a revival'}</strong><span>{me.lives>0?'You will respawn at the extraction base.':'A teammate can collect a blue revival resource.'}</span></div>}
          <div className="interaction-hint">{me?.carryingBoxId?<><Box size={18}/><strong>Treasure in hand</strong><span>Follow the green arrow home · F to drop</span></>:scan?<><ScanLine size={18}/><strong>Scanning {nearBox.scan}%</strong><span>Stand still · {spec.id==='dwarf'?'Dwarf scans in 3 seconds':'6 seconds'} · damage resets scan</span></>:inReach?<><kbd>F</kbd><strong>{nearBox.mark===BoxMark.Fake?'Trap detected — leave it closed':'Pick up treasure'}</strong></>:<><kbd>F</kbd><span>Interact</span><span className="hint-divider"/><ScanLine size={15}/><span>Stand near a crate to scan</span></>}</div>
        </section>
        <aside className="intel-panel"><div className="panel-heading"><Crown size={16}/> THE GOBLIN KING</div><div className="boss-badge"><Crown size={31}/></div><div className="boss-title"><h3>{s.boss.alive?'His Royal Grumpiness':'The crown has fallen'}</h3><small>{s.boss.alive?'THIEF-HATING. TREASURE-HOARDING.':'DEFEATED FOR THIS WAVE'}</small></div><div className="boss-health"><i style={{width:`${hpPct(s.boss)*100}%`}}/></div><div className="boss-numbers"><span>{s.boss.hp.toLocaleString()} / {s.boss.maxHp.toLocaleString()} HP</span><b>×{s.bossDamageMult.toFixed(2)} DMG</b></div><div className="intel-block"><div className="eyebrow"><Target size={13}/> {s.director.source==='llm'?'AI DIRECTOR':'BOSS INSTINCT'}</div><p>{s.director.taunt?`“${s.director.taunt}”`:s.boss.targetId?`Hunting ${s.players.get(s.boss.targetId)?.name??'the crew'}. Keep the carrier protected.`:'The King is guarding his vault. Watch for red attack warnings.'}</p><small>{s.director.reasoning||'Targets react to proximity, damage, and carried treasure.'}</small></div><div className="mission-note"><span className="eyebrow">THE PLAN</span><p><span>01</span> Scan before you grab.</p><p><span>02</span> Bring real crates to base.</p><p><span>03</span> {s.bossRequired?'Finish the King to win.':'Break crystals to weaken him.'}</p>{s.bossRequired&&<b className="final-objective">FINAL WAVE: LOOT + BOSS</b>}</div><div className="field-log"><div className="eyebrow">FIELD NOTES</div>{eventFeed.length?eventFeed.map((e,i)=><p key={`${e.atMs}-${i}`}><span>{clock(e.atMs)}</span>{statNames[e.type]}</p>):<p>The vault is quiet. For now.</p>}</div></aside>
      </main>
      <footer className="combat-bar"><div className="active-hero"><div className="active-portrait" style={{'--hero':meta.color} as CSSProperties}><Portrait index={chosenIndex}/></div><div><small>YOUR HERO</small><strong>{spec.name}</strong><div className="player-hp"><Heart size={12}/>{me?.hp??0} / {me?.maxHp??spec.maxHp}<span> {me?.lives??0} lives</span></div></div></div><div className="skill-tray">{spec.abilities.map((a,i)=>{const locked=!me?.ranks[i],remaining=Math.max(0,((me?.cooldownReadyAtMs[i]??0)-s.elapsedMs)/1000),ready=!!me&&isAbilityReady(me,i,s.elapsedMs)&&s.phase===MatchPhase.Playing;const Icon=skillIcons[i];return <button key={a.id} className={`ability ${locked?'locked':''} ${ready?'ready':''}`} disabled={!ready||help||status!=='online'} onClick={()=>controls.current?.skill(i as 0|1|2)} title={`${a.description} Cooldown: ${a.cooldownMs/1000}s`} style={{'--progress':`${me?abilityCooldownProgress(me,i,s.elapsedMs)*100:0}%`} as CSSProperties}><kbd>{'QER'[i]}</kbd><Icon size={23}/><span><strong>{a.name}</strong><small>{locked?`WAVE ${i+1}`:me?.carryingBoxId?'CARRYING LOOT':remaining>0?`${remaining.toFixed(1)}s`:'READY'}</small></span></button>;})}</div><div className="controls-note"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> MOVE</span><span><Swords size={13}/> HOLD CLICK TO ATTACK</span></div><div className="touch-controls"><div>{[['↑',0,-1],['←',-1,0],['↓',0,1],['→',1,0]].map(([a,x,y])=><button key={a} onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);controls.current?.move(Number(x),Number(y));}} onPointerUp={()=>controls.current?.move(0,0)} onPointerCancel={()=>controls.current?.move(0,0)} aria-label={`Move ${a}`}>{a}</button>)}</div><button onClick={()=>controls.current?.interact()}>F · Loot</button><button onClick={()=>controls.current?.attack()}>Attack</button></div></footer>
    </>}

    {!network&&screen==='multiplayer'&&<div className="modal-backdrop"><section className="modal multiplayer-modal" role="dialog" aria-modal="true" aria-labelledby="friends-title"><button className="close" onClick={()=>{setScreen('home');setError('');}} aria-label="Close multiplayer"><X/></button><div className="modal-icon"><Users size={27}/></div><span className="eyebrow">A LITTLE HELP FROM YOUR FRIENDS</span><h2 id="friends-title">Build your crew.</h2><p>Create a private room and share the code, or join a friend already waiting at camp.</p><button className="primary wide" disabled={busy} onClick={()=>void connect('create')}>{busy?<LoaderCircle className="spin" size={17}/>:<Flag size={17}/>} Create a private room</button><div className="or-divider">OR JOIN A CREW</div><form onSubmit={e=>{e.preventDefault();void connect('join');}}><label>INVITE CODE<input className="code-input" value={roomCode} onChange={e=>setRoomCode(e.target.value.toUpperCase())} placeholder="AB3K" maxLength={4} autoComplete="off" aria-label="Invite code"/></label><button className="secondary wide" disabled={busy||roomCode.trim().length!==4}>Join expedition <ArrowRight size={16}/></button></form>{error&&<p className="error-banner" role="alert">{error}</p>}<small>Friends must use the same game server. Up to 5 players.</small></section></div>}

    {s?.phase===MatchPhase.Ended&&<div className="modal-backdrop results-backdrop"><section className="modal results" role="dialog" aria-modal="true" aria-labelledby="result-title"><div className="modal-icon">{s.outcome===Outcome.Victory?<Trophy size={36}/>:<Skull size={36}/>}</div><span className="eyebrow">EXPEDITION COMPLETE · {clock(s.elapsedMs)}</span><h2 id="result-title">{s.outcome===Outcome.Victory?'A royal robbery.':s.outcome===Outcome.Timeout?'Time caught up.':'The King keeps his gold.'}</h2><p>{s.outcome===Outcome.Victory?'Eight crates secured. Three waves survived. One very empty vault.':'Every good crew has a story like this. Regroup, choose your hero, and give it another shot.'}</p><div className="result-stats"><div><Box/><b>{deliveries}</b><span>CRATES SECURED</span></div><div><Diamond/><b>{towers}</b><span>CRYSTALS BROKEN</span></div><div><Heart/><b>{deaths}</b><span>HEROES DOWNED</span></div></div><div className="recap"><span className="eyebrow">THE HEIST REPORT</span><p>{debrief?.summary??'Your field report is being prepared…'}</p>{debrief?.highlights.map((h,i)=><div key={i}><Check size={13}/>{h}</div>)}</div><div className="result-actions"><button className="secondary" onClick={leave}>Back to camp</button><button className="primary" disabled={status!=='online'} onClick={()=>{voice.current.stop();setHelp(false);network?.restart();}}>Another heist <ArrowRight size={16}/></button></div></section></div>}

    {help&&<div className="modal-backdrop"><section className="modal guide" role="dialog" aria-modal="true" aria-labelledby="guide-title"><button className="close" onClick={()=>setHelp(false)} aria-label="Close field guide"><X/></button><span className="eyebrow">THE ADVENTURER'S FIELD GUIDE</span><h2 id="guide-title">A plan worth stealing.</h2><div className="guide-grid"><article><ScanLine/><h3>01 · Read the room</h3><p>Stand still beside a closed crate for 6 seconds to scan it. The Dwarf takes 3 seconds. A green check means treasure; a red cross means a trap. Taking damage resets scanning.</p></article><article><Box/><h3>02 · Make the getaway</h3><p>Press F to pick up a crate. Return to the green extraction circle to deliver automatically. Carrying slows you by 25% and disables combat. F drops your cargo.</p></article><article><Diamond/><h3>03 · Break his defenses</h3><p>Each crystal destroyed increases damage to the King by 25%. Red areas warn you about his sweep, slam, and charge. Get out before they land.</p></article><article><Flag/><h3>04 · Finish the job</h3><p>Deliver 3, then 2, then 3 real crates across the three waves. In wave 3 you must also defeat the King. Q, E and R unlock across waves. Each hero has 3 lives and one possible revival.</p></article></div><div className="guide-keys"><span><kbd>WASD / ↑↓←→</kbd> Move</span><span><kbd>Mouse</kbd> Aim & hold to attack</span><span><kbd>Q E R</kbd> Skills</span><span><kbd>F</kbd> Pick up / drop / revive</span><span><kbd>Tab</kbd> Map</span><span><kbd>M</kbd> Audio</span></div>{network&&<p className="live-warning">This is a live co-op match. The game keeps running while the guide is open.</p>}<button className="primary wide" onClick={()=>setHelp(false)}>Got it. Let's make some trouble. <ArrowRight size={16}/></button></section></div>}
    {(status==='reconnecting'||status==='offline')&&<div className="connection-banner" role="alert">{status==='reconnecting'?<><LoaderCircle className="spin" size={16}/> Reconnecting… Your seat is held for 30 seconds.</>:<><Radio size={16}/>{error}<button onClick={leave}>Return to camp</button></>}</div>}
    {network&&error&&status==='online'&&<div className="connection-banner" role="alert">{error}<button onClick={()=>setError('')}>Dismiss</button></div>}
  </div>;
}

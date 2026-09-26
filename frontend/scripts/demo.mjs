import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const gamePort=Number(process.env.GAME_PORT||2577), clientPort=Number(process.env.CLIENT_PORT||5180);
async function available(port){return new Promise((resolve,reject)=>{const server=createServer();server.once('error',()=>reject(new Error(`Port ${port} is already in use. Set GAME_PORT and CLIENT_PORT to free ports.`)));server.listen(port,()=>server.close(resolve));});}
try{await available(gamePort);await available(clientPort);}catch(e){console.error(e.message);process.exit(1);}
const env={...process.env,PORT:String(gamePort),GAME_PORT:String(gamePort),CLIENT_PORT:String(clientPort),STUB:'0'};
const processes=[];let stopping=false;
function stop(code=0){if(stopping)return;stopping=true;for(const p of processes)p.kill('SIGTERM');setTimeout(()=>process.exit(code),300).unref();}
for(const args of [['--import','tsx','backend/src/index.ts'],['node_modules/vite/bin/vite.js','--config','frontend/vite.config.ts','frontend']]){
 const p=spawn(process.execPath,args,{cwd:root,env,stdio:'inherit'});processes.push(p);p.on('error',e=>{console.error(e);stop(1);});p.on('exit',code=>stop(code??0));
}
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
console.log(`\nGoblin King Heist · live demo\nOpen http://localhost:${clientPort}\nGame server: ${gamePort} · protocol v3 · real simulation\n`);

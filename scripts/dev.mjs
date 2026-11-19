import { spawn } from 'node:child_process';
const preview=process.argv.includes('--preview');
const procs = [spawn(process.execPath,['server/index.mjs'],{stdio:'inherit',env:{...process.env,PORT:'3001',ATENCION_PUBLIC_ORIGIN:process.env.ATENCION_PUBLIC_ORIGIN||(preview?'http://127.0.0.1:4173':'http://127.0.0.1:5173')}}),spawn(process.execPath,['node_modules/vite/bin/vite.js',...(preview?['preview']:[])],{stdio:'inherit'})];
let closing=false;
function stop(code=0){if(closing)return;closing=true;for(const p of procs)p.kill();setTimeout(()=>process.exit(code),100);}
procs.forEach(p=>p.on('exit',code=>stop(code||0)));
process.on('SIGINT',()=>stop()); process.on('SIGTERM',()=>stop());

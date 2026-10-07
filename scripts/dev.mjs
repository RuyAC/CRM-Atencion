import { spawn } from 'node:child_process';
const procs = [spawn(process.execPath,['server/index.mjs'],{stdio:'inherit',env:{...process.env,PORT:'3001'}}),spawn(process.execPath,['node_modules/vite/bin/vite.js'],{stdio:'inherit'})];
let closing=false;
function stop(code=0){if(closing)return;closing=true;for(const p of procs)p.kill();setTimeout(()=>process.exit(code),100);}
procs.forEach(p=>p.on('exit',code=>stop(code||0)));
process.on('SIGINT',()=>stop()); process.on('SIGTERM',()=>stop());

import {verifyFullBackup} from '../server/backups.mjs';
import {mkdirSync,readdirSync,existsSync,copyFileSync} from 'node:fs';
import path from 'node:path';
const [source,target]=process.argv.slice(2);
if(!source||!target)throw new Error('Uso: node scripts/restore-full.mjs CARPETA_RESPALDO DESTINO_NUEVO_VACÍO');
const root=path.resolve(source),destination=path.resolve(target);if(root===destination||destination.startsWith(root+path.sep)||root.startsWith(destination+path.sep))throw new Error('El destino debe estar separado del respaldo.');
const manifest=verifyFullBackup(root);
if(existsSync(destination)&&readdirSync(destination).length)throw new Error('El destino debe estar vacío. Detén el servicio y restaura en una carpeta nueva.');
mkdirSync(destination,{recursive:true,mode:0o700});
for(const file of manifest.files){const dest=path.resolve(destination,file.path);mkdirSync(path.dirname(dest),{recursive:true});copyFileSync(path.resolve(root,file.path),dest);}
console.log(`Restauración verificada en ${destination}. Configura DB_PATH=${path.join(destination,'data','platform.sqlite')} y MEDIA_DIR=${path.join(destination,'uploads')} antes de iniciar.`);

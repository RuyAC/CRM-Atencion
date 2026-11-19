import {existsSync,readdirSync} from 'node:fs';
import path from 'node:path';
// Keep the existing installation when upgrading its application name.
export function defaultDatabasePath(root){
 const directory=path.join(root,'data'),preferred=path.join(directory,'atencion.sqlite');
 if(existsSync(preferred)||!existsSync(directory))return preferred;
 const candidates=readdirSync(directory,{withFileTypes:true}).filter(entry=>entry.isFile()&&entry.name.endsWith('.sqlite'));
 if(candidates.length>1)throw new Error('Hay varias bases de datos; configura DB_PATH explícitamente.');
 return candidates.length===1?path.join(directory,candidates[0].name):preferred;
}

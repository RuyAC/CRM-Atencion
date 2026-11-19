import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import {cpSync,existsSync} from 'node:fs';
import path from 'node:path';
const proxy={'/api':'http://127.0.0.1:3001','/uploads':'http://127.0.0.1:3001'};
// Restaurant uploads must never become public website assets in a release.
const publicAssets={name:'auntoque-public-assets',writeBundle(options){for(const name of ['assets','icon.svg','icon-192.png','icon-512.png','manifest.webmanifest','offline.html','sw.js']){const source=path.resolve('public',name);if(existsSync(source))cpSync(source,path.join(options.dir,name),{recursive:true});}}};
export default defineConfig({plugins:[react(),publicAssets],server:{host:'127.0.0.1',port:5173,strictPort:true,proxy},preview:{host:'127.0.0.1',port:4173,strictPort:true,proxy},build:{outDir:'dist',copyPublicDir:false}});

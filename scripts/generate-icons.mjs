import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/ruyal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({headless:true,channel:'msedge'});
try{const page=await browser.newPage(),svg=await readFile('public/icon.svg','utf8');for(const size of [192,512]){await page.setViewportSize({width:size,height:size});await page.setContent(`<style>body{margin:0}svg{display:block;width:100vw;height:100vh}</style>${svg}`);await page.screenshot({path:`public/icon-${size}.png`,omitBackground:true});}}finally{await browser.close();}

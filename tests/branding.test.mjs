import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync,mkdirSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {defaultDatabasePath} from '../server/database-path.mjs';
import {isLocalBackupFormat,LOCAL_BACKUP_FORMAT} from '../shared/backup-format.mjs';
test('renaming the application preserves existing database selection and rejects ambiguity',()=>{
 const root=mkdtempSync(path.join(os.tmpdir(),'atencion-path-'));
 try{
  assert.equal(defaultDatabasePath(root),path.join(root,'data','atencion.sqlite'));
  mkdirSync(path.join(root,'data'));
  const old=path.join(root,'data','previous.sqlite');writeFileSync(old,'');assert.equal(defaultDatabasePath(root),old);
  writeFileSync(path.join(root,'data','second.sqlite'),'');assert.throws(()=>defaultDatabasePath(root),/DB_PATH/);
  const preferred=path.join(root,'data','atencion.sqlite');writeFileSync(preferred,'');assert.equal(defaultDatabasePath(root),preferred);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('local backup version one survives product renaming without accepting other schemas',()=>{
 assert.equal(LOCAL_BACKUP_FORMAT,'atencion-local-v1');
 for(const value of [LOCAL_BACKUP_FORMAT,'previous-brand-local-v1'])assert.equal(isLocalBackupFormat(value),true);
 for(const value of [null,{},'other','atencion-local-v2','atencion-release-v1'])assert.equal(isLocalBackupFormat(value),false);
});

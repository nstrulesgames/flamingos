import { DatabaseSync, backup } from 'node:sqlite';
import { mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { createPostgresDatabase } from '../lib/postgres-db.js';
import { exportPostgresBackup } from '../lib/postgres-backup.js';
import { loadDatabaseEnvironment } from './database-config.js';
const root=fileURLToPath(new URL('..',import.meta.url));
const connectionString=loadDatabaseEnvironment();
if(connectionString&&!process.argv.includes('--demo')) {
  const db=createPostgresDatabase(connectionString);
  try {
    const content=await exportPostgresBackup(db);
    const folder=resolve(root,'data/backups');mkdirSync(folder,{recursive:true});
    const target=resolve(folder,`flamingo-postgres-${new Date().toISOString().replace(/[:.]/g,'-')}.json`);
    await writeFile(target,JSON.stringify(content,null,2),{flag:'wx',mode:0o600});
    console.log(`Copia consistente de PostgreSQL guardada en: ${target}`);
  } catch(error) { console.error(`No se pudo completar el respaldo PostgreSQL (${error.code||'conexión/configuración'}).`);process.exitCode=1; }
  finally {await db.close();}
} else {
const source=process.env.DATABASE_PATH||resolve(root,'data',process.argv.includes('--demo')?'demo.sqlite':'flamingo.sqlite');
if(!existsSync(source)) { console.error('No existe la base de datos. Inicia y configura el negocio primero.');process.exit(1); }
const folder=resolve(root,'data/backups');mkdirSync(folder,{recursive:true});
const target=resolve(folder,`${process.argv.includes('--demo')?'demo':'flamingo'}-${new Date().toISOString().replace(/[:.]/g,'-')}.sqlite`);
const db=new DatabaseSync(source,{readOnly:true});
try {await backup(db,target);console.log(`Copia consistente guardada en: ${target}`);}finally {db.close();}
}

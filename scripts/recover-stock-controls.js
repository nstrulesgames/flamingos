import {loadDatabaseEnvironment} from './database-config.js';
import {createPostgresDatabase} from '../lib/postgres-db.js';
import {recoverStockControls} from '../lib/stock-recovery.js';

const ref='oozvdybbdajbmfwikczt',url=loadDatabaseEnvironment(),parsed=new URL(url);
if(!(parsed.hostname===`db.${ref}.supabase.co`||(parsed.hostname.endsWith('.pooler.supabase.com')&&decodeURIComponent(parsed.username).endsWith(`.${ref}`))))throw Error('Proyecto diferente al autorizado para esta recuperación.');
const apply=process.argv.includes('--apply'),db=createPostgresDatabase(url);
try{console.log(JSON.stringify({applied:apply,...await recoverStockControls(db,{apply})},null,2));}
catch(error){console.error(error.code?'No se pudo recuperar ('+error.code+').':error.message);process.exitCode=1;}
finally{await db.close();}

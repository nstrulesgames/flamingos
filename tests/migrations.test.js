import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createPostgresDatabase} from '../lib/postgres-db.js';
import {exportPostgresBackup} from '../lib/postgres-backup.js';

const migrations=await Promise.all(['202610060001_flamingo_initial.sql','202610060002_client_menu.sql','202610090001_units_and_packages.sql','202610090002_customer_credit.sql'].map(name=>readFile(new URL(`../supabase/migrations/${name}`,import.meta.url),'utf8')));

test('migration guards prevent partial, out-of-order and repeated upgrades; new tables remain private',async t=>{
  const db=new PGlite();t.after(()=>db.close());
  await db.exec(migrations[0]);await db.exec(migrations[1]);
  const version=async()=> (await db.query("SELECT value FROM flamingo.settings WHERE key='schema_version'")).rows[0].value;
  await assert.rejects(db.exec(migrations[3]),/requiere el esquema 2/);await db.exec('ROLLBACK');assert.equal(await version(),'1');
  await db.exec(migrations[2]);assert.equal(await version(),'2');
  await assert.rejects(db.exec(migrations[2]),/requiere el esquema 1/);await db.exec('ROLLBACK');assert.equal(await version(),'2');
  await db.exec(migrations[3]);assert.equal(await version(),'3');
  await assert.rejects(db.exec(migrations[3]),/requiere el esquema 2/);await db.exec('ROLLBACK');
  const rows=(await db.query("SELECT relname,relrowsecurity FROM pg_class WHERE oid IN ('flamingo.customers'::regclass,'flamingo.credit_movements'::regclass)")).rows;
  assert.equal(rows.length,2);assert(rows.every(row=>row.relrowsecurity));
  await db.exec('CREATE ROLE test_public; SET ROLE test_public');
  await assert.rejects(db.query('SELECT * FROM flamingo.customers'),/permission denied/);
  await db.exec('RESET ROLE; SET ROLE flamingo_app');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM flamingo.credit_movements')).rows[0].n,0);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM flamingo.inventory WHERE pack_size<>1')).rows[0].n,0);
});

test('a consistent backup works before migration 2 and records the actual schema version',async t=>{
  const db=new PGlite();t.after(()=>db.close());await db.exec(migrations[0]);await db.exec(migrations[1]);
  await db.exec('SET ROLE flamingo_app');
  const pool={connect:async()=>({query:async(sql,args)=>{const result=await db.query(sql,args);return {...result,rowCount:result.affectedRows};},release:()=>{}}),end:()=>{}};
  const backup=await exportPostgresBackup(createPostgresDatabase(undefined,pool));
  assert.equal(backup.schemaVersion,'1');assert.equal(backup.tables.products.length,60);
  assert.equal('customers' in backup.tables,false);assert.equal('sessions' in backup.tables,false);
});

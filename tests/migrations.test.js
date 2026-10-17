import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createPostgresDatabase} from '../lib/postgres-db.js';
import {exportPostgresBackup} from '../lib/postgres-backup.js';

const migrations=await Promise.all(['202610060001_flamingo_initial.sql','202610060002_client_menu.sql','202610090001_units_and_packages.sql','202610090002_customer_credit.sql','20261013122250_weighted_sales.sql','20261015135011_free_price_sales.sql'].map(name=>readFile(new URL(`../supabase/migrations/${name}`,import.meta.url),'utf8')));

test('migration guards prevent partial, out-of-order and repeated upgrades; new tables remain private',async t=>{
  const db=new PGlite();t.after(()=>db.close());
  await db.exec(migrations[0]);await db.exec(migrations[1]);
  const version=async()=> (await db.query("SELECT value FROM flamingo.settings WHERE key='schema_version'")).rows[0].value;
  await assert.rejects(db.exec(migrations[5]),/requiere el esquema 4/);await db.exec('ROLLBACK');assert.equal(await version(),'1');
  await assert.rejects(db.exec(migrations[4]),/requiere el esquema 3/);await db.exec('ROLLBACK');assert.equal(await version(),'1');
  await assert.rejects(db.exec(migrations[3]),/requiere el esquema 2/);await db.exec('ROLLBACK');assert.equal(await version(),'1');
  await db.exec(migrations[2]);assert.equal(await version(),'2');
  await assert.rejects(db.exec(migrations[2]),/requiere el esquema 1/);await db.exec('ROLLBACK');assert.equal(await version(),'2');
  await db.exec(migrations[3]);assert.equal(await version(),'3');
  await assert.rejects(db.exec(migrations[3]),/requiere el esquema 2/);await db.exec('ROLLBACK');
  await db.exec(migrations[4]);assert.equal(await version(),'4');
  await assert.rejects(db.exec(migrations[4]),/requiere el esquema 3/);await db.exec('ROLLBACK');
  await db.exec("INSERT INTO flamingo.products(name,category,price,art,description,menu_key,pricing_mode,inventory_mode) VALUES('Helado de Açaí','Helados',1850,'icecream','','helado-de-acai','weight','untracked')");
  await db.exec(migrations[5]);assert.equal(await version(),'5');
  const acai=(await db.query("SELECT price,pricing_mode,allow_manual_price FROM flamingo.products WHERE menu_key='helado-de-acai'")).rows[0];
  assert.deepEqual(acai,{price:1850,pricing_mode:'unit',allow_manual_price:1});
  assert.equal((await db.query('SELECT count(*)::int n FROM flamingo.products WHERE allow_manual_price=1')).rows[0].n,1);
  await assert.rejects(db.exec(migrations[5]),/requiere el esquema 4/);await db.exec('ROLLBACK');
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

test('schema 6 is guarded, preserves existing credit and sales, and keeps customer tables private',async t=>{
  const db=new PGlite();t.after(()=>db.close());const upgrade=await readFile(new URL('../supabase/migrations/20261017150819_customer_debts_and_archives.sql',import.meta.url),'utf8');
  await db.exec(migrations[0]);await db.exec(migrations[1]);
  await assert.rejects(db.exec(upgrade),/requiere el esquema 5/);await db.exec('ROLLBACK');
  for(const migration of migrations.slice(2))await db.exec(migration);
  await db.exec("INSERT INTO flamingo.users(id,name,username,password,role) VALUES(999,'Dueña','migration-test','not-a-password','admin'); INSERT INTO flamingo.customers(id,name,created_by,balance) VALUES(999,'Saldo existente',999,1234)");
  await db.exec(upgrade);
  assert.deepEqual((await db.query('SELECT balance,allow_fiado,credit_limit FROM flamingo.customers WHERE id=999')).rows[0],{balance:1234,allow_fiado:0,credit_limit:0});
  assert.equal((await db.query("SELECT value FROM flamingo.settings WHERE key='schema_version'")).rows[0].value,'6');
  await assert.rejects(db.exec(upgrade),/requiere el esquema 5/);await db.exec('ROLLBACK');
  await db.exec('SET ROLE flamingo_app; UPDATE flamingo.customers SET balance=-100 WHERE id=999');
  await assert.rejects(db.query('DELETE FROM flamingo.customers WHERE id=999'),/permission denied/);
  await db.exec('RESET ROLE');
  assert((await db.query("SELECT relrowsecurity FROM pg_class WHERE oid='flamingo.customers'::regclass")).rows[0].relrowsecurity);
  await db.exec('CREATE ROLE schema6_public; SET ROLE schema6_public');await assert.rejects(db.query('SELECT * FROM flamingo.customers'),/permission denied/);
});

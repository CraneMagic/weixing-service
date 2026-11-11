import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { ensureAlarmExpirySchema, expirePendingDefectRecords, ALARM_EXPIRY_MS } from '../src/services/alarm-expiry';
async function main() {
 if (!process.env.TEST_DATABASE_URL) throw Error('TEST_DATABASE_URL must point to an isolated test database');
 const db=new Pool({connectionString:process.env.TEST_DATABASE_URL});
 const client=await db.connect();
 const now=Date.now(),old=new Date(now-ALARM_EXPIRY_MS),young=new Date(now-ALARM_EXPIRY_MS+1);
 try {
  await client.query('CREATE TEMP TABLE quality_records (client_ip text, label text, status text, capture_time timestamptz, object_key text, review_result text)');
  await client.query("INSERT INTO quality_records VALUES ('legacy','fail',NULL,$1,'keep.jpg',NULL)",[old]);
  await ensureAlarmExpirySchema(client);
  await ensureAlarmExpirySchema(client);
  const legacyAge=(await client.query("SELECT alarm_received_at FROM quality_records WHERE client_ip='legacy'")).rows[0].alarm_received_at;
  assert.equal(legacyAge.getTime(),old.getTime(),'schema/startup does not reset persisted age');
  const received=(await client.query("INSERT INTO quality_records (client_ip,label,status) VALUES ('default','pass','IGNORED') RETURNING alarm_received_at")).rows[0].alarm_received_at;
  assert.ok(received.getTime()>=now-1000,'new records use server receipt time');
  await client.query("INSERT INTO quality_records (client_ip,label,status,alarm_received_at) VALUES ('new','fail',NULL,$1),('reviewed','fail','RESOLVED',$2),('manual','fail','INREVIEW',$2),('pass','pass',NULL,$2)",[young,old]);
  const isolated={connect:async()=>({query:client.query.bind(client),release:()=>{}})} as unknown as Pick<Pool,'connect'>;
  const first=await expirePendingDefectRecords(now,isolated);
  assert.deepEqual(first,{expired:1,hasPending:true});
  const rows=(await client.query('SELECT * FROM quality_records')).rows;
  assert.equal(rows.find(r=>r.client_ip==='legacy').status,'EXPIRED');
  assert.equal(rows.find(r=>r.client_ip==='legacy').object_key,'keep.jpg');
  assert.equal(rows.find(r=>r.client_ip==='legacy').review_result,null);
  assert.equal(rows.find(r=>r.client_ip==='manual').status,'INREVIEW');
  assert.equal(rows.find(r=>r.client_ip==='reviewed').status,'RESOLVED');
  assert.equal(rows.find(r=>r.client_ip==='pass').status,null);
  const second=await expirePendingDefectRecords(now+1,isolated);
  assert.deepEqual(second,{expired:1,hasPending:false});
  assert.deepEqual(await expirePendingDefectRecords(now+1,isolated),{expired:0,hasPending:false},'repeat/startup scan is idempotent');
  assert.equal((await client.query("SELECT count(*)::int n FROM quality_records WHERE label='fail' AND status IS NULL")).rows[0].n,0,'live popup query excludes expired records');
  await client.query("UPDATE quality_records SET status='RESOLVED',review_result='fail' WHERE status='EXPIRED'");
  assert.equal((await client.query("SELECT count(*)::int n FROM quality_records WHERE status='RESOLVED'")).rows[0].n,3,'expired records remain reviewable');
  console.log('PASS: real PostgreSQL migration, age boundary, pending-only expiry, image retention, review, idempotence');
 }finally{client.release();await db.end();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});

import assert from 'node:assert/strict'
import test from 'node:test'
import Database from 'better-sqlite3'
import sharp from 'sharp'
import { readFileSync } from 'node:fs'
import { createWhatsappWorkerRuntime } from './whatsappWorkerRuntime.js'
import { prepareCampaignImage } from './campaignImage.js'

const time = new Date('2030-07-01T12:00:00.000Z')
function fixture() {
 const db = new Database(':memory:')
 db.exec(`
 CREATE TABLE tenants(id TEXT PRIMARY KEY,name TEXT,status TEXT);
 CREATE TABLE subscriptions(tenant_id TEXT,status TEXT,current_period_end TEXT);
 CREATE TABLE whatsapp_settings(tenant_id TEXT,promo_enabled INTEGER);
 CREATE TABLE clients(tenant_id TEXT,user_id TEXT,marketing_whatsapp_opt_in INTEGER,phone_normalized TEXT);
 CREATE TABLE whatsapp_marketing_campaigns(id TEXT PRIMARY KEY,tenant_id TEXT,name TEXT,message_text TEXT,image_data_url TEXT,status TEXT,total_recipients INTEGER,sent_count INTEGER DEFAULT 0,failed_count INTEGER DEFAULT 0,skipped_count INTEGER DEFAULT 0,created_at TEXT,started_at TEXT,completed_at TEXT,cancelled_at TEXT,last_error TEXT);
 CREATE TABLE whatsapp_marketing_recipients(id TEXT PRIMARY KEY,campaign_id TEXT,tenant_id TEXT,client_user_id TEXT,phone_normalized TEXT,client_name TEXT,status TEXT,attempts INTEGER DEFAULT 0,created_at TEXT,dispatch_started_at TEXT,claimed_at TEXT,provider_message_id TEXT,sent_at TEXT,last_error TEXT,next_attempt_at TEXT);
 CREATE TABLE whatsapp_campaign_delivery_guard(tenant_id TEXT PRIMARY KEY,next_allowed_at TEXT);
 INSERT INTO tenants VALUES('t','Studio','ACTIVE');INSERT INTO subscriptions VALUES('t','ACTIVE',NULL);INSERT INTO whatsapp_settings VALUES('t',1);
 INSERT INTO whatsapp_marketing_campaigns(id,tenant_id,name,message_text,status,total_recipients,created_at) VALUES('c','t','Novidade','Oi {{nome}} no {{espaco}}','QUEUED',2,'2030-07-01T11:00:00.000Z');
 INSERT INTO clients VALUES('t','a',1,'5511999990001'),('t','b',1,'5511999990002');
 INSERT INTO whatsapp_marketing_recipients(id,campaign_id,tenant_id,client_user_id,phone_normalized,client_name,status,created_at) VALUES('a','c','t','a','5511999990001','Ana','PENDING','2030-07-01T11:00:00.000Z'),('b','c','t','b','5511999990002','Bia','PENDING','2030-07-01T11:00:01.000Z');
 `)
 return db
}
function worker(db:Database.Database, send:Parameters<typeof createWhatsappWorkerRuntime>[0]['sendWhatsappTextForTenant'], options: { now?:()=>Date; health?:()=>Promise<Response> } = {}) {
 return createWhatsappWorkerRuntime({db,mediaDir:'/tmp',campaignsEnabled:true,campaignSendIntervalSeconds:8,requireWhatsappConfig:()=>({baseUrl:'https://evolution.example',apiKey:'test',instanceName:'studio'}),resolveExternalHttpsBaseUrl:async url=>url,sendWhatsappTextForTenant:send,fetchFn:options.health ?? (async()=>new Response(JSON.stringify({instance:{state:'open'}}))),now:options.now ?? (()=>time),logger:{error: error=>{throw error}}})
}
test('campaign guard serializes workers, enforces interval and never repeats accepted recipients',async()=>{
 const db=fixture();let count=0,clock=time
 const send=async()=>{count++;return true}, one=worker(db,send,{now:()=>clock}),two=worker(db,send,{now:()=>clock})
 await Promise.all([one.processMarketingCampaignQueue(),two.processMarketingCampaignQueue()]);assert.equal(count,1)
 await two.processMarketingCampaignQueue();assert.equal(count,1)
 clock=new Date(time.getTime()+60000);await two.processMarketingCampaignQueue();assert.equal(count,2)
 await one.processMarketingCampaignQueue();assert.equal(count,2);assert.equal((db.prepare("SELECT status FROM whatsapp_marketing_campaigns WHERE id='c'").get() as {status:string}).status,'COMPLETED');db.close()
})
test('unconfirmed delivery stops the campaign and is never automatically retried',async()=>{
 const db=fixture();let count=0;const runtime=worker(db,async()=>{count++;return false})
 await runtime.processMarketingCampaignQueue();await runtime.processMarketingCampaignQueue();assert.equal(count,1)
 assert.deepEqual(db.prepare('SELECT status,failed_count,skipped_count FROM whatsapp_marketing_campaigns').get(),{status:'FAILED',failed_count:1,skipped_count:1});db.close()
})
test('stale in-flight recipient after restart is stopped instead of replayed',async()=>{
 const db=fixture();db.prepare("UPDATE whatsapp_marketing_recipients SET status='SENDING',claimed_at=? WHERE id='a'").run(new Date(time.getTime()-6*60000).toISOString());let count=0
 await worker(db,async()=>{count++;return true}).processMarketingCampaignQueue();assert.equal(count,0);assert.equal((db.prepare('SELECT status FROM whatsapp_marketing_campaigns').get() as {status:string}).status,'FAILED');db.close()
})
test('opt-out and cancellation during health check are revalidated before sending',async()=>{
 for(const mode of ['consent','cancel']) {
  const db=fixture();let count=0;const runtime=worker(db,async()=>{count++;return true},{health:async()=>{if(mode==='consent')db.prepare("UPDATE clients SET marketing_whatsapp_opt_in=0 WHERE user_id='a'").run();else db.prepare("UPDATE whatsapp_marketing_campaigns SET status='CANCELLED'").run();return new Response(JSON.stringify({instance:{state:'open'}}))}})
  await runtime.processMarketingCampaignQueue();assert.equal(count,0);assert.equal((db.prepare("SELECT status FROM whatsapp_marketing_recipients WHERE id='a'").get() as {status:string}).status,'SKIPPED');db.close()
 }
})
test('daily cap, contact frequency and disabled account cannot leak sends',async()=>{
 for(const mode of ['daily','recent','disabled']) {
  const db=fixture();let count=0
  if(mode==='daily')for(let i=0;i<50;i++)db.prepare("INSERT INTO whatsapp_marketing_recipients(id,tenant_id,status,dispatch_started_at) VALUES(?,'t','SENT',?)").run(`old-${i}`,time.toISOString())
  if(mode==='recent')db.prepare("INSERT INTO whatsapp_marketing_recipients(id,tenant_id,phone_normalized,status,dispatch_started_at) VALUES('old','t','5511999990001','SENT',?)").run(time.toISOString())
  if(mode==='disabled')db.prepare("UPDATE tenants SET status='SUSPENDED'").run()
  await worker(db,async()=>{count++;return true}).processMarketingCampaignQueue();assert.equal(count,0);db.close()
 }
})
test('campaign image travels in the same send with its personalized caption',async()=>{
 const db=fixture();db.prepare("UPDATE whatsapp_marketing_campaigns SET image_data_url='data:image/jpeg;base64,aGVsbG8='").run()
 let media:string|null|undefined,caption=''
 await worker(db,async(_tenant,_phone,text,options)=>{media=options?.mediaDataUrl;caption=text;return true}).processMarketingCampaignQueue()
 assert.equal(media,'data:image/jpeg;base64,aGVsbG8=');assert.equal(caption,'Oi Ana no Studio');db.close()
})
test('campaign image decoding rejects URLs and corrupted data, normalizes valid raster bytes',async()=>{
 for(const value of ['https://example.com/logo.png','data:image/svg+xml;base64,PHN2Zz4=','data:image/png;base64,aGVsbG8='])await assert.rejects(()=>prepareCampaignImage(value))
 const input=await sharp({create:{width:16,height:8,channels:4,background:'#972d57'}}).png().toBuffer()
 const normalized=await prepareCampaignImage(`data:image/png;base64,${input.toString('base64')}`);assert.ok(normalized?.startsWith('data:image/jpeg;base64,'));const info=await sharp(Buffer.from(normalized!.split(',')[1],'base64')).metadata();assert.equal(info.width,16);assert.equal(info.format,'jpeg');assert.equal(info.exif,undefined)
})

test('campaigns expire without sending stale promotions after 24 hours',async()=>{
 const db=fixture();db.prepare("UPDATE whatsapp_marketing_campaigns SET created_at='2030-06-29T10:00:00.000Z'").run();let count=0
 await worker(db,async()=>{count++;return true}).processMarketingCampaignQueue();assert.equal(count,0);assert.deepEqual(db.prepare('SELECT status,skipped_count FROM whatsapp_marketing_campaigns').get(),{status:'FAILED',skipped_count:2});db.close()
})
test('migration 50 preserves recent sends for the new frequency guard',()=>{
 const db=new Database(':memory:');db.exec(`CREATE TABLE tenants(id TEXT PRIMARY KEY);CREATE TABLE whatsapp_marketing_campaigns(id TEXT);CREATE TABLE whatsapp_marketing_recipients(id TEXT,tenant_id TEXT,phone_normalized TEXT,status TEXT,attempts INTEGER,sent_at TEXT,claimed_at TEXT,created_at TEXT);INSERT INTO whatsapp_marketing_recipients VALUES('sent','t','1','SENT',1,'2030-07-01',NULL,'2030-06-30'),('sending','t','2','SENDING',1,NULL,'2030-07-01','2030-06-30'),('failed','t','3','FAILED',1,NULL,NULL,'2030-07-01'),('pending','t','4','PENDING',0,NULL,NULL,'2030-07-01');`)
 const source=readFileSync(new URL('./migrate.ts',import.meta.url),'utf8'),start=source.indexOf('apply(50,'),sql=source.slice(start).split('db.exec(`')[1].split('`))')[0];db.exec(sql)
 assert.deepEqual(db.prepare('SELECT id,dispatch_started_at as timestamp FROM whatsapp_marketing_recipients ORDER BY id').all(),[{id:'failed',timestamp:'2030-07-01'},{id:'pending',timestamp:null},{id:'sending',timestamp:'2030-07-01'},{id:'sent',timestamp:'2030-07-01'}]);db.close()
})

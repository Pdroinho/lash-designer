import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import test, { after } from 'node:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import express from 'express'
const directory=mkdtempSync(path.join(tmpdir(),'luma-brand-'))
process.env.NODE_ENV='test';process.env.DATABASE_PATH=path.join(directory,'isolated.db')
const {createAdminLumaAssistantRouter}=await import('./adminLumaAssistantRoutes.js')
const {ASSISTANT_DAILY_LIMIT,ASSISTANT_MONTHLY_LIMIT}=await import('../assistant.js')
const {getZonedDateTimeParts}=await import('../dateTime.js')
const {handleError}=await import('../http.js')
const {closeDb}=await import('../db.js')
after(()=>{closeDb();rmSync(directory,{recursive:true,force:true})})
const palettes=Array.from({length:3},(_,i)=>({name:`Paleta ${i}`,primary:'#972D57',secondary:'#33272D',background:'#FCF7F9',rationale:'Legível.'}))
const answer={palettes,logoPresentation:{layout:'FULL' as const,size:'L' as const,rationale:'Logo com nome.'},inputTokens:10,outputTokens:20,costUsd:.001,model:'qa-principal'}
const body={businessName:'Estúdio',logoDataUrl:'data:image/png;base64,iVBORw0KGgo='}
async function fixture(enabled=true){
 const db=new Database(':memory:')
 db.exec(`CREATE TABLE tenant_settings(tenant_id TEXT PRIMARY KEY,timezone TEXT);
 CREATE TABLE assistant_usage(id TEXT PRIMARY KEY,tenant_id TEXT,user_id TEXT,request_day TEXT,input_chars INTEGER,input_tokens INTEGER,output_tokens INTEGER,reasoning_tokens INTEGER,cost_usd REAL,tool_calls INTEGER,vision_inputs INTEGER,agent_steps INTEGER,status TEXT,model TEXT,created_at TEXT,credit_source TEXT DEFAULT 'INCLUDED');
 CREATE TABLE assistant_message_credit_ledger(id TEXT PRIMARY KEY,tenant_id TEXT,user_id TEXT,delta_messages INTEGER,source TEXT,note TEXT,reference_order_nsu TEXT,created_at TEXT);
 INSERT INTO tenant_settings VALUES('one','America/Bahia'),('two','America/Manaus');`)
 const state={brandCalls:0,chatCalls:0,generate:async()=>answer}
 const app=express();app.use(express.json({limit:'1mb'}));app.use((req,_res,next)=>{if(req.headers['x-role'])req.sessionUser={id:'admin',role:req.headers['x-role'] as 'ADMIN',tenantId:req.headers['x-tenant']==='two'?'two':'one',sessionId:'qa',persistent:false,trustedDeviceId:null};next()})
 app.use('/api/admin',createAdminLumaAssistantRouter({db,lumaAssistantLimiter:(_req,_res,next)=>next(),assistantEnabled:enabled,assistantProvider:{apiKey:'qa-key',model:'qa-principal',name:'QA'},generateBrandSetupSuggestions:async()=>{state.brandCalls++;return state.generate()},generateAssistantAnswer:async()=>{state.chatCalls++;return {text:'ok',inputTokens:1,outputTokens:1,reasoningTokens:0,costUsd:.001,model:'qa-principal',steps:1,toolCalls:0,visionInputs:0,pendingActions:[]}},confirmLumaAction:()=>({ok:true})}));app.use(handleError)
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();assert.ok(address && typeof address==='object');const base=`http://127.0.0.1:${address.port}/api/admin`
 const call=async(url:string,data?:unknown,role='ADMIN',tenant='one')=>{const response=await fetch(base+url,{method:data?'POST':'GET',headers:{'content-type':'application/json',...(role?{'x-role':role}:{}),'x-tenant':tenant},...(data?{body:JSON.stringify(data)}:{})});return {status:response.status,data:await response.json()}}
 const seed=(total:number,monthly=false)=>{const now=new Date(),day=getZonedDateTimeParts(now,'America/Bahia')!.ymd;const created=monthly?day.slice(0,8)+'01T15:00:00.000Z':now.toISOString();for(let i=0;i<total;i++)db.prepare("INSERT INTO assistant_usage(id,tenant_id,user_id,request_day,cost_usd,status,created_at,credit_source) VALUES(?,'one','admin',?,0,'COMPLETED',?,'INCLUDED')").run(`seed-${i}`,monthly?day.slice(0,8)+'01':day,created)}
 const credits=()=>db.prepare("INSERT INTO assistant_message_credit_ledger(id,tenant_id,user_id,delta_messages,source,created_at) VALUES(?,'one','admin',1,'PURCHASE',?)").run(randomUUID(),new Date().toISOString())
 return {db,state,call,seed,credits,close:async()=>{server.close();await once(server,'close');db.close()}}
}
test('visual analysis shares included messages and tenant isolation with chat',async()=>{const f=await fixture();try{
 assert.equal((await f.call('/assistant/brand-suggestions',body,'')).status,401)
 assert.equal((await f.call('/assistant/brand-suggestions',body,'STAFF')).status,403)
 assert.equal((await f.call('/assistant/brand-suggestions',{...body,logoDataUrl:'data:image/svg+xml;base64,AAA='})).status,400)
 assert.equal(f.state.brandCalls,0)
 const result=await f.call('/assistant/brand-suggestions',body);assert.equal(result.status,200);assert.equal(result.data.usage.used,1);assert.deepEqual(result.data.logoPresentation,answer.logoPresentation)
 assert.equal((await f.call('/assistant/message',{message:'Olá'})).status,200)
 assert.equal((await f.call('/assistant/usage')).data.used,2)
 assert.equal((await f.call('/assistant/usage',undefined,'ADMIN','two')).data.used,0)
 assert.equal((f.db.prepare('SELECT COUNT(*) AS n FROM assistant_usage WHERE status=?').get('COMPLETED') as {n:number}).n,2)
}finally{await f.close()}})
test('visual analysis enforces shared quota, extra credits and refunds failed output',async()=>{const f=await fixture();try{
 f.seed(ASSISTANT_DAILY_LIMIT);assert.equal((await f.call('/assistant/brand-suggestions',body)).data.code,'ASSISTANT_INCLUDED_LIMIT');assert.equal(f.state.brandCalls,0)
 f.credits();assert.equal((await f.call('/assistant/brand-suggestions',body)).status,200);assert.equal((await f.call('/assistant/usage')).data.extraCreditBalance,0)
 f.credits();f.state.generate=async()=>{throw new Error('QA provider failed')};assert.equal((await f.call('/assistant/brand-suggestions',body)).status,502);assert.equal((await f.call('/assistant/usage')).data.extraCreditBalance,1)
 f.state.generate=async()=>({...answer,logoPresentation:{...answer.logoPresentation,size:'900px' as 'L'}});assert.equal((await f.call('/assistant/brand-suggestions',body)).status,502);assert.equal((await f.call('/assistant/usage')).data.extraCreditBalance,1)
 assert.equal((f.db.prepare("SELECT COUNT(*) AS n FROM assistant_message_credit_ledger WHERE source='REFUND'").get() as {n:number}).n,2)
 assert.equal((await f.call('/assistant/usage')).data.used,ASSISTANT_DAILY_LIMIT)
}finally{await f.close()}})
test('simultaneous chat and brand requests cannot exceed the final included slot',async()=>{const f=await fixture();let release=()=>{};try{
 f.seed(ASSISTANT_DAILY_LIMIT-1);let entered=()=>{};const started=new Promise<void>(resolve=>{entered=resolve});const held=new Promise<void>(resolve=>{release=resolve});f.state.generate=async()=>{entered();await held;return answer}
 const pending=f.call('/assistant/brand-suggestions',body);await started
 assert.equal((await f.call('/assistant/message',{message:'Concorrente'})).data.code,'ASSISTANT_INCLUDED_LIMIT');assert.equal(f.state.chatCalls,0);release();assert.equal((await pending).status,200);assert.equal((await f.call('/assistant/usage')).data.used,ASSISTANT_DAILY_LIMIT)
}finally{release();await f.close()}})
test('monthly quota and disabled provider prevent visual requests without charging',async()=>{const f=await fixture();try{f.seed(ASSISTANT_MONTHLY_LIMIT,true);assert.equal((await f.call('/assistant/brand-suggestions',body)).data.code,'ASSISTANT_INCLUDED_LIMIT');assert.equal(f.state.brandCalls,0)}finally{await f.close()}const off=await fixture(false);try{assert.equal((await off.call('/assistant/brand-suggestions',body)).data.code,'ASSISTANT_DISABLED');assert.equal((off.db.prepare('SELECT COUNT(*) AS n FROM assistant_usage').get() as {n:number}).n,0)}finally{await off.close()}})

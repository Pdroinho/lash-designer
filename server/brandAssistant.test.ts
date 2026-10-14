import assert from 'node:assert/strict'
import test, { after } from 'node:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
const directory = mkdtempSync(path.join(tmpdir(), 'brand-assistant-'))
process.env.DATABASE_PATH = path.join(directory, 'test.db')
process.env.NODE_ENV = 'test'
process.env.OPENROUTER_API_KEY = 'qa-fake-key-not-a-real-credential'
process.env.OPENROUTER_MODEL = 'qa/principal-vision'
process.env.OPENROUTER_SETUP_MODEL = 'qa/legacy-separate-model'
process.env.LUMA_SETUP_USE_PRIMARY_MODEL = 'true'
const { generateBrandSetupSuggestions, assistantProvider } = await import('./assistant.js')
const { closeDb } = await import('./db.js')
after(()=>{closeDb();rmSync(directory,{recursive:true,force:true})})
const palettes = Array.from({length:3},(_,i)=>({name:`Paleta ${i}`,primary:'#972D57',secondary:'#33272D',background:'#FCF7F9',rationale:'Contraste seguro.'}))
test('brand analysis inherits configured principal model and constrains logo output without generated CSS', async () => {
  const original = globalThis.fetch
  let request: Record<string, unknown> = {}
  globalThis.fetch = async (_url, init) => {
    request = JSON.parse(String(init?.body))
    return Response.json({choices:[{message:{content:JSON.stringify({palettes,logoPresentation:{layout:'FULL',size:'L',rationale:'Marca completa legível.'}})}}],usage:{prompt_tokens:100,completion_tokens:140,cost:.001}})
  }
  try {
    assert.equal(assistantProvider.setupModel,'qa/principal-vision')
    const answer = await generateBrandSetupSuggestions({businessName:'Estúdio',preferences:'Elegante',logoDataUrl:'data:image/png;base64,AAAA'})
    assert.equal(request.model,'qa/principal-vision')
    assert.equal(request.max_tokens,850)
    assert.ok(JSON.stringify(request.messages).includes('SYMBOL_NAME'))
    assert.ok(JSON.stringify(request.messages).includes('"detail":"high"'))
    assert.deepEqual(answer.logoPresentation,{layout:'FULL',size:'L',rationale:'Marca completa legível.'})
    assert.equal(answer.palettes.length,3)
    assert.equal(answer.costUsd,.001)
  } finally { globalThis.fetch = original }
})
test('brand analysis rejects model-generated arbitrary layout, size or style', async () => {
  const original = globalThis.fetch
  try {
    for(const logoPresentation of [{layout:'FULL',size:'900px',rationale:'x'},{layout:'HTML',size:'M',rationale:'x'},{layout:'FULL',size:'M',rationale:'x',css:'position:fixed'}]) {
      globalThis.fetch = async () => Response.json({choices:[{message:{content:JSON.stringify({palettes,logoPresentation})}}]})
      await assert.rejects(generateBrandSetupSuggestions({businessName:'Estúdio',preferences:''}))
    }
  } finally { globalThis.fetch = original }
})

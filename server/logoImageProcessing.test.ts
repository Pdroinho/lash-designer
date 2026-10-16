import assert from 'node:assert/strict'
import test from 'node:test'
import sharp from 'sharp'
import { prepareLogoImage } from './logoImageProcessing.js'
const url = (buffer: Buffer) => `data:image/png;base64,${buffer.toString('base64')}`
async function logo(transparent = false) {
  const foreground = await sharp({ create: { width: 40, height: 20, channels: 4, background: '#972d57' } }).png().toBuffer()
  const white = await sharp({ create: { width: 8, height: 8, channels: 4, background: '#fff' } }).png().toBuffer()
  return url(await sharp({ create: { width: 100, height: 80, channels: 4, background: transparent ? '#ffffff00' : '#fff' } }).composite([{ input: foreground, left: 30, top: 30 }, { input: white, left: 45, top: 35 }]).png().toBuffer())
}
test('uniform background is removed, including enclosed letter counters, and empty margins cropped', async () => {
  const prepared = await prepareLogoImage(await logo(), 'REMOVE_BACKGROUND_AND_TRIM')
  assert.equal(prepared.width, 44); assert.equal(prepared.height, 24)
  assert.equal(prepared.removedBackground, true)
  const { data, info } = await sharp(Buffer.from(prepared.imageDataUrl.split(',')[1], 'base64')).raw().toBuffer({ resolveWithObject: true })
  assert.equal(data[3], 0)
  const center = (10 * info.width + 20) * 4
  assert.equal(data[center + 3], 0)
  const ink = (3 * info.width + 3) * 4
  assert.deepEqual([...data.subarray(ink, ink + 4)], [151, 45, 87, 255])
})
test('transparent originals and trim-only keep the correct alpha', async () => {
  for (const transparent of [true, false]) {
    const prepared = await prepareLogoImage(await logo(transparent), 'TRIM')
    assert.equal(prepared.width, 44); assert.equal(prepared.removedBackground, false)
    const data = await sharp(Buffer.from(prepared.imageDataUrl.split(',')[1], 'base64')).ensureAlpha().raw().toBuffer()
    assert.equal(data[3], transparent ? 0 : 255)
  }
})
test('ambiguous backgrounds, blank logos, remote URLs and malformed images fail safely', async () => {
  const gradient = Buffer.alloc(40 * 40 * 4)
  for (let p = 0; p < 1600; p++) { gradient[p * 4] = (p % 40) * 6; gradient[p * 4 + 1] = Math.floor(p / 40) * 6; gradient[p * 4 + 3] = 255 }
  await assert.rejects(prepareLogoImage(url(await sharp(gradient, { raw: { width: 40, height: 40, channels: 4 } }).png().toBuffer()), 'REMOVE_BACKGROUND_AND_TRIM'), /uniforme/)
  const blank = url(await sharp({ create: { width: 40, height: 40, channels: 4, background: '#fff' } }).png().toBuffer())
  await assert.rejects(prepareLogoImage(blank, 'TRIM'), /desenho/)
  await assert.rejects(prepareLogoImage('https://example.com/logo.png', 'TRIM'))
  await assert.rejects(prepareLogoImage('data:image/png;base64,AAAA', 'TRIM'))
  await assert.rejects(prepareLogoImage('data:image/svg+xml;base64,AAAA', 'TRIM'))
})

test('explicit white cleanup clears residues inside already transparent logos without changing trim-only', async () => {
 const input=await logo(true)
 const output=await prepareLogoImage(input,'CLEAN_WHITE')
 const {data,info}=await sharp(Buffer.from(output.imageDataUrl.split(',')[1],'base64')).raw().toBuffer({resolveWithObject:true})
 assert.equal(data[(10*info.width+20)*4+3],0)
 const kept=await prepareLogoImage(input,'TRIM')
 const original=await sharp(Buffer.from(kept.imageDataUrl.split(',')[1],'base64')).raw().toBuffer()
 assert.equal(original[(10*info.width+20)*4+3],255)
})
test('white antialias fringe is unmatted into colored alpha instead of a light halo',async()=>{
 for(const transparent of [false,true]) {
 const raw=Buffer.alloc(20*20*4,transparent?0:255)
 for(let y=5;y<15;y++)for(let x=4;x<15;x++){
  const i=(y*20+x)*4, color=x===4?[203,150,171]:[151,45,87]
  color.forEach((value,c)=>{raw[i+c]=value});raw[i+3]=255
 }
 const output=await prepareLogoImage(url(await sharp(raw,{raw:{width:20,height:20,channels:4}}).png().toBuffer()),transparent?'CLEAN_WHITE':'REMOVE_BACKGROUND_AND_TRIM')
 const {data,info}=await sharp(Buffer.from(output.imageDataUrl.split(',')[1],'base64')).raw().toBuffer({resolveWithObject:true})
 const i=(6*info.width+2)*4
 assert.ok(data[i+3]>120&&data[i+3]<135)
 for(const [c,value] of [151,45,87].entries())assert.ok(Math.abs(data[i+c]-value)<=2)
 }
})
test('real product wordmark rasterized on white has no opaque white remnants after preparation',async()=>{
 const input=await sharp('public/brand/logo-horizontal-dark.png').flatten({background:'#fff'}).png().toBuffer()
 const output=await prepareLogoImage(url(input),'REMOVE_BACKGROUND_AND_TRIM')
 const raw=await sharp(Buffer.from(output.imageDataUrl.split(',')[1],'base64')).ensureAlpha().raw().toBuffer()
 let colored=0
 for(let i=0;i<raw.length;i+=4)if(raw[i+3]>0){colored++;assert.ok(Math.min(raw[i],raw[i+1],raw[i+2])<231)}
 assert.ok(colored>100)
})

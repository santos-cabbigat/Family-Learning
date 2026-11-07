import test from 'node:test';
import assert from 'node:assert/strict';
import {seedRecords,envelope} from '../docs/core.js';
let count=0;
async function setup(handler){
 const values=new Map();globalThis.localStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 globalThis.window={google:{accounts:{oauth2:{hasGrantedAllScopes:()=>true,initTokenClient:({callback})=>({requestAccessToken:()=>callback({access_token:'test-only',expires_in:3600})})}}}};
 globalThis.fetch=async(url,options)=>String(url).includes('config.json')?Response.json({googleClientId:'12345-test.apps.googleusercontent.com'}):handler(String(url),options);
 const drive=await import(`../docs/drive.js?test=${++count}`);await drive.prepareDrive();await drive.connectDrive();return drive;
}
const state=()=>({workspaceId:'family',deviceId:'test-device',records:seedRecords(),settings:{thresholdMB:20,thresholdHours:24,masteryTarget:80}});
test('Drive verifies uploaded backup before returning synced IDs and paginates remote files',async()=>{
 let uploaded,pages=0;const remote=envelope('family',[...seedRecords(),{id:'remote-child',kind:'profile',childId:'older',name:'Remote revision',createdAt:'2026-11-06T01:00:00Z'}],'other');
 const drive=await setup(async(url,opts)=>{
 if(url.includes('/upload/')){const raw=await opts.body.text();uploaded=JSON.parse(raw.split('Content-Type: application/json\r\n\r\n')[1].split('\r\n--')[0]);return Response.json({id:'saved'});}
 if(url.includes('/saved?'))return Response.json(uploaded);
 if(url.includes('/remote?'))return Response.json(remote);
 if(url.includes('application%2Fvnd.google-apps.folder'))return Response.json({files:[{id:'folder',appProperties:{workspace:'family'}}]});
 pages++;return Response.json(pages===1?{files:[{id:'remote',appProperties:{workspace:'family'}}],nextPageToken:'next'}:{files:[]});
 });const result=await drive.syncDrive(state(),()=>{});assert.equal(pages,2);assert.ok(result.syncedIds.includes('remote-child'));assert.equal(uploaded.settings.masteryTarget,80);assert.equal(result.savedId,'saved');
});
test('failed upload does not return success and retry succeeds without altering local state',async()=>{
 let fail=true,uploaded;const local=state(),before=structuredClone(local);const drive=await setup(async(url,opts)=>{
 if(url.includes('/upload/')){if(fail)return Response.json({error:{message:'Storage quota exceeded'}},{status:403});const raw=await opts.body.text();uploaded=JSON.parse(raw.split('Content-Type: application/json\r\n\r\n')[1].split('\r\n--')[0]);return Response.json({id:'saved'});}
 if(url.includes('/saved?'))return Response.json(uploaded);
 return Response.json({files:url.includes('application%2Fvnd.google-apps.folder')?[{id:'folder',appProperties:{workspace:'family'}}]:[]});
 });await assert.rejects(drive.syncDrive(local,()=>{}),/Storage quota exceeded/);assert.deepEqual(local,before);fail=false;assert.equal((await drive.syncDrive(local,()=>{})).savedId,'saved');
});
test('expired authorization disconnects and leaves data pending',async()=>{const drive=await setup(()=>Response.json({error:{}},{status:401}));await assert.rejects(drive.syncDrive(state(),()=>{}),/expired/);assert.equal(drive.isConnected(),false);});
test('verification mismatch prevents claiming success',async()=>{const drive=await setup(async(url)=>{if(url.includes('/upload/'))return Response.json({id:'saved'});if(url.includes('/saved?'))return Response.json(envelope('different',seedRecords(),'d'));return Response.json({files:url.includes('application%2Fvnd.google-apps.folder')?[{id:'folder',appProperties:{workspace:'family'}}]:[]});});await assert.rejects(drive.syncDrive(state(),()=>{}),/mismatched|verified/);});
test('lesson packs upload separately from grades and verify server checksum',async()=>{
 const blob=new Blob(['pack-test-content'],{type:'application/zip'}),checksum=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(b=>b.toString(16).padStart(2,'0')).join('');let payload;
 const drive=await setup(async(url,options)=>{if(url.includes('/upload/')){payload=await options.body.text();return Response.json({id:'pack-saved'});}if(url.includes('/pack-saved?'))return Response.json({sha256Checksum:checksum,size:String(blob.size)});if(url.includes('application%2Fvnd.google-apps.folder'))return Response.json({files:[{id:'materials-folder'}]});return Response.json({files:[]});});
 assert.equal(await drive.uploadLessonPack({id:'a',title:'Test Pack'},blob,()=>{}),'pack-saved');assert.ok(payload.includes('lesson-pack'));assert.ok(payload.includes('pack-test-content'));assert.equal(payload.includes('chapter_result'),false);
});
test('selective lesson download rejects oversized files and returns bytes for valid files',async()=>{let tooLarge=true;const drive=await setup(url=>url.includes('alt=media')?new Response(new Blob(['ZIP bytes'])):Response.json({size:tooLarge?101*1024*1024:9}));await assert.rejects(drive.downloadLessonPack('pack'),/100 MB/);tooLarge=false;assert.equal(await (await drive.downloadLessonPack('pack')).text(),'ZIP bytes');});

test('published Google configuration can be refreshed without reinstalling and invalidates a changed client session',async()=>{
 const drive=await setup(()=>{throw new Error('Connecting must not call Drive or upload records');});
 assert.equal(drive.isConnected(),true);
 let published='';globalThis.fetch=async()=>Response.json({googleClientId:published});
 assert.equal(await drive.prepareDrive(true),false);assert.equal(drive.isConnected(),false);
 published='67890-published.apps.googleusercontent.com';
 assert.equal(await drive.prepareDrive(true),true);assert.equal(drive.configuredClientId(),published);
 await drive.connectDrive();assert.equal(drive.isConnected(),true);
});
test('cancelled account switching clears the previous account session',async()=>{
 const drive=await setup(()=>{throw new Error('No Drive requests expected');});
 assert.equal(drive.isConnected(),true);
 window.google.accounts.oauth2.initTokenClient=({error_callback})=>({requestAccessToken:()=>error_callback({type:'popup_closed'})});
 await assert.rejects(drive.connectDrive(),/closed or blocked/);assert.equal(drive.isConnected(),false);
});

test('a verified legacy lesson backup gains its grade and subject without uploading the ZIP again', async () => {
  const zip = new Blob(['saved lesson pack']);
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await zip.arrayBuffer()))]
    .map(value => value.toString(16).padStart(2,'0')).join('');
  const prior = { app:'family-learning', type:'lesson-pack', material:'phonics-a', sha256:hash };
  const updates = [];
  const drive = await setup((url, options) => {
    if (options.method === 'PATCH') {
      updates.push(JSON.parse(options.body).appProperties);
      return Response.json({id:'existing'});
    }
    assert.ok(url.includes('pageSize='), 'Only the listing and metadata update are needed');
    return Response.json({files:[{id:'existing',appProperties:prior}]});
  });
  const id = await drive.uploadLessonPack({id:'phonics-a',title:'Phonics A',subject:'Phonics',grade:'Grade 1'},zip,()=>{});
  assert.equal(id,'existing');
  assert.deepEqual(updates,[{...prior,grade:'Grade 1',subject:'Phonics'}]);
});

test('a named personal Phonics ZIP can be found without prior app backup tags', async () => {
  const drive = await setup(url => {
    const parameters = new URL(url).searchParams;
    assert.equal(parameters.get('q'), "trashed = false and name = 'Phonics-A-Lesson-Pack.zip'");
    return Response.json({files:[{id:'accessible-private-file'}]});
  });
  assert.equal(await drive.findLessonZip('Phonics-A-Lesson-Pack.zip'), 'accessible-private-file');
  await assert.rejects(drive.findLessonZip("x' or trashed = true.zip"), /Invalid/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {downloadJob,downloadEvents,reportDownload,startDownloads} from '../docs/download-job.js';

test('a transfer survives its screen unsubscribing and prevents a duplicate batch',async()=>{
 let finish;
 const wait=new Promise(resolve=>{finish=resolve;});
 const first=()=>{};downloadEvents.addEventListener('change',first);
 const job=startDownloads(async()=>{reportDownload('Book one',10,100);await wait;return 'Saved';});
 downloadEvents.removeEventListener('change',first);
 await startDownloads(()=>assert.fail('second batch started'));
 assert.equal(downloadJob.running,true);assert.equal(downloadJob.done,10);
 const seen=[];const next=()=>seen.push(downloadJob.label);
 downloadEvents.addEventListener('change',next);
 finish();await job;downloadEvents.removeEventListener('change',next);
 assert.deepEqual(seen,['Saved']);assert.equal(downloadJob.running,false);
});

test('evidence grades keep zero scores and allow artwork to be ungraded',async()=>{
 const {scanScore}=await import('../docs/evidence.js');
 assert.deepEqual(scanScore('0','10'),{score:0,possible:10});
 assert.deepEqual(scanScore('',''),{});
 for(const bad of [['','10'],['3','0'],['4','3'],['1','']])assert.throws(()=>scanScore(...bad));
});

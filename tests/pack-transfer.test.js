import test from 'node:test';
import assert from 'node:assert/strict';
import {readPackResponse} from '../docs/pack-transfer.js';

for (const size of [0,5]) {
  test('download reports actual chunk sizes with total '+size,async () => {
    const body = new ReadableStream({start(controller) {
      controller.enqueue(Uint8Array.of(1,2));
      controller.enqueue(Uint8Array.of(3,4,5));
      controller.close();
    }});
    const reports = [];
    const file = await readPackResponse(new Response(body),(read,total)=>reports.push([read,total]),size);
    assert.deepEqual(reports,[[0,size],[2,size],[5,size]]);
    assert.deepEqual(new Uint8Array(await file.arrayBuffer()),Uint8Array.of(1,2,3,4,5));
  });
}
test('interrupted downloads reject before a pack can be installed',async () => {
  const body = new ReadableStream({start(controller){controller.error(new Error('Disconnected'));}});
  await assert.rejects(readPackResponse(new Response(body)),/Disconnected/);
});

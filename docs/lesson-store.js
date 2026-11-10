import { unzip, zip } from './vendor/fflate.js';
import {zipDigest} from './pack-transfer.js';
import { validatePack } from './learning-core.js';

let connection;
function database() {
  if (!connection) connection = new Promise((resolve, reject) => {
    const request = indexedDB.open('family-learning-materials', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('packs', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { connection=undefined; reject(request.error); };
    request.onblocked = () => { connection=undefined; reject(new Error('Close other Family Learning tabs and retry.')); };
  });
  return connection;
}
export async function getPack(id) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction('packs').objectStore('packs').get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function listPacks() {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction('packs').objectStore('packs').openCursor();
    const manifests = [];
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return resolve(manifests);
      manifests.push(cursor.value.manifest);
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
  });
}
export async function importPack(file, expected = {}) {
  if (!file || file.size > 100 * 1024 * 1024) throw new Error('Choose a lesson pack smaller than 100 MB.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  let total = 0;
  const files = await new Promise((resolve, reject) => {
    unzip(bytes, {
      filter(entry) {
        total += entry.originalSize;
        if (total > 180 * 1024 * 1024) return false;
        return entry.name === 'manifest.json' || entry.name === 'workbook.pdf' ||
          /^resources\/[a-zA-Z0-9_-]+\.pdf$/.test(entry.name) ||
          /^cards\/[a-zA-Z0-9_-]+\.(webp|png|jpg)$/.test(entry.name);
      }
    }, (error, result) => error ? reject(new Error('The ZIP could not be opened. Download it again and retry.')) : resolve(result));
  });
  if (total > 180 * 1024 * 1024) throw new Error('This lesson pack expands beyond the supported size.');
  let manifest;
  try { manifest = JSON.parse(new TextDecoder().decode(files['manifest.json'])); }
  catch { throw new Error('Choose a prepared Family Learning lesson pack ZIP. A workbook PDF alone is not a lesson pack.'); }
  validatePack(manifest, files);
  if (expected.id && expected.id !== manifest.id) throw new Error('The downloaded pack does not match the selected material.');
  if (expected.subject && expected.subject !== manifest.subject) throw new Error('This pack belongs to ' + manifest.subject + '. Open that subject to add it.');
  if (expected.grade && manifest.grade && expected.grade !== manifest.grade && !expected.id) {
    throw new Error('This pack is filed under ' + manifest.grade + '. Choose that grade or All grades and try again.');
  }
  if (expected.grade) manifest.grade = expected.grade;
  manifest.zipHash = await zipDigest(file);
  const assets = {};
  for (const [path, value] of Object.entries(files)) {
    if (path === 'manifest.json') continue;
    const type = path.endsWith('.pdf') ? 'application/pdf' : path.endsWith('.webp') ? 'image/webp' :
      path.endsWith('.png') ? 'image/png' : 'image/jpeg';
    assets[path] = new Blob([value], { type });
  }
  const db = await database();
  await new Promise((resolve, reject) => {
    const tx = db.transaction('packs', 'readwrite');
    tx.objectStore('packs').put({ id: manifest.id, manifest, assets, sourceZip: new Blob([bytes],{type:'application/zip'}) });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('This device could not store the lesson pack.'));
  });
  return manifest;
}

export async function exportPack(id) {
 const pack=await getPack(id);if(!pack)throw new Error('Import this lesson pack on the device first.');
 if(pack.sourceZip)return pack.sourceZip;
 const files={'manifest.json':new TextEncoder().encode(JSON.stringify(pack.manifest))};
 for(const [path,blob] of Object.entries(pack.assets))files[path]=new Uint8Array(await blob.arrayBuffer());
 return new Promise((resolve,reject)=>zip(files,{level:0},(error,data)=>error?reject(error):resolve(new Blob([data],{type:'application/zip'}))));
}

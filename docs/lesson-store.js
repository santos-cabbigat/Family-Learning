import { unzip } from './vendor/fflate.js';
import { validatePack } from './learning-core.js';

let connection;
function database() {
  if (!connection) connection = new Promise((resolve, reject) => {
    const request = indexedDB.open('family-learning-materials', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('packs', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
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
    const request = db.transaction('packs').objectStore('packs').getAll();
    request.onsuccess = () => resolve(request.result.map(p => p.manifest));
    request.onerror = () => reject(request.error);
  });
}
export async function importPack(file) {
  if (!file || file.size > 100 * 1024 * 1024) throw new Error('Choose a lesson pack smaller than 100 MB.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  let total = 0;
  const files = await new Promise((resolve, reject) => {
    unzip(bytes, {
      filter(entry) {
        total += entry.originalSize;
        if (total > 180 * 1024 * 1024) return false;
        return entry.name === 'manifest.json' || entry.name === 'workbook.pdf' ||
          /^cards\/[a-zA-Z0-9_-]+\.(webp|png|jpg)$/.test(entry.name);
      }
    }, (error, result) => error ? reject(new Error('The ZIP could not be opened. Download it again and retry.')) : resolve(result));
  });
  if (total > 180 * 1024 * 1024) throw new Error('This lesson pack expands beyond the supported size.');
  let manifest;
  try { manifest = JSON.parse(new TextDecoder().decode(files['manifest.json'])); }
  catch { throw new Error('Choose the prepared Phonics A Lesson Pack ZIP.'); }
  validatePack(manifest, files);
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
    tx.objectStore('packs').put({ id: manifest.id, manifest, assets });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('This device could not store the lesson pack.'));
  });
  return manifest;
}

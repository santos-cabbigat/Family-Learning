// Earlier downloads predate teacherHint in the manifest. Their private answer
// indexes are readable offline with the workbook already installed on this device.
const indexes = new WeakMap();
const legacyFiles = new Map([['k5-phonics-a','hints-a.json'],['k5-phonics-b','hints-b.json']]);
export function legacyPictureHints(pack) {
  const file = legacyFiles.get(pack.id);
  const workbook = pack.assets?.['workbook.pdf'];
  if (!file || !workbook) return Promise.resolve({});
  if (!indexes.has(pack)) {
    const pending = (async () => {
      const response = await fetch('./'+file);
      if (!response.ok) throw new Error('Picture hints could not load.');
      const bytes = Uint8Array.from(atob(await response.json()),letter=>letter.charCodeAt(0));
      const digest = await crypto.subtle.digest('SHA-256',await workbook.arrayBuffer());
      const key = await crypto.subtle.importKey('raw',digest,'AES-GCM',false,['decrypt']);
      const plain = await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.slice(0,12)},key,bytes.slice(12));
      return JSON.parse(new TextDecoder().decode(plain));
    })().catch(() => { indexes.delete(pack); return {}; });
    indexes.set(pack,pending);
  }
  return indexes.get(pack);
}

import {readPackResponse} from './pack-transfer.js';
import {importPack,listPacks} from './lesson-store.js';
import {GRADES, materialGrade} from './students.js';
import {SUBJECTS} from './learning-core.js';
import * as driveApi from './drive.js';
const {isConnected, availableLessonPacks, downloadLessonPack} = driveApi;

function validPackageUrl(value) {
  try {
    const url = new URL(value, location.href);
    return url.protocol === 'https:' || (url.protocol === 'http:' && url.origin === location.origin);
  } catch { return false; }
}

const validId = value => typeof value === 'string' && /^[a-z0-9-]+$/.test(value);
// Personal shortcuts stay in this browser. ZIP data is requested only after a Download tap.
// Only descriptive metadata is public. Each licensed workbook stays in its owner's Drive.
const privateBooks = [
  {id:'k5-phonics-a', title:'Phonics A', subject:'Phonics', filename:'Phonics-A-Lesson-Pack.zip'},
  {id:'k5-phonics-b', title:'Phonics B', subject:'Phonics', filename:'Phonics-B-Lesson-Pack.zip', grades:['Grade 1','Grade 2']}
];
const retiredSamples = new Set(['family-making-ten','family-observing-leaves']);
const privateKey = 'family-learning-personal-pack-links';
function privateLinks() {
  try { return JSON.parse(localStorage.getItem(privateKey) || '[]').filter(validPrivate); }
  catch { return []; }
}
function validPrivate(item) {
  return item && validId(item.id) && typeof item.file === 'string' && /^[a-zA-Z0-9_-]{12,128}$/.test(item.file) &&
    SUBJECTS.includes(item.subject) && typeof item.title === 'string' && item.title.length > 0 && item.title.length <= 140;
}
export function rememberDownloadLink(hash) {
  if (!hash.startsWith('#downloads?')) return;
  const params = new URLSearchParams(hash.slice(hash.indexOf('?')+1));
  const item = {id:params.get('pack'), file:params.get('file'), title:params.get('name'), subject:params.get('subject')};
  if (!validPrivate(item)) return;
  const items = privateLinks().filter(existing => existing.id !== item.id);
  try { localStorage.setItem(privateKey,JSON.stringify([...items.slice(-49),item])); } catch { return; }
  return item;
}
async function publishedMaterials() {
  const response = await fetch('./catalog.json', {cache:'no-store', signal:AbortSignal.timeout(12000)});
  if (!response.ok) throw new Error('Catalog unavailable');
  const catalog = await response.json();
  if (catalog.version !== 1 || !Array.isArray(catalog.packages)) throw new Error('Invalid catalog');
  return catalog.packages.filter(item => item && validId(item.id) && GRADES.includes(item.grade) &&
    SUBJECTS.includes(item.subject) && typeof item.title === 'string' && typeof item.url === 'string' &&
    item.url.trim() && validPackageUrl(item.url));
}

export async function mountDownloads(panel, options) {
  // Previous service workers cached lessons.js but fetched this module from the network.
  if (typeof options === 'function') {
    const container = panel;
    const previousRefresh = options;
    const host = document.createElement('section');
    host.className = 'card stack subject-materials';
    container.append(host);
    async function show(selectedId) {
      const installed = await listPacks();
      if (!host.isConnected) return;
      const grade = container.querySelector('#grade-filter')?.value || 'All grades';
      await mountDownloads(host, {grade, installed, records:[], selectedId, refresh:async id => {
        await previousRefresh();
        if (host.isConnected) await show(id);
      }});
    }
    return show();
  }
  const {grade, subject, installed, records, refresh, selectedId} = options;
  panel.innerHTML = `<form class="stack material-search">
      <label>Search materials<input type="search" placeholder="e.g. Phonics" autocomplete="off"></label>
      <div><button class="btn" type="submit">Search online</button></div></form>
    <label>Available materials<select class="material-select"></select></label>
    <div><button class="btn primary material-action" type="button">Download</button></div>
    <progress class="download-progress" aria-label="Lesson pack download progress" max="100" hidden></progress>
    <section class="material-permission stack" hidden>
      <strong>Download from your Google account</strong>
      <p>Google asks for permission to see and download all your Drive files. Family Learning uses this permission to find and download the selected lesson pack. Choose the account that holds it.</p>
      <div><button class="btn primary material-allow" type="button">Allow and download</button></div>
    </section>
    <p class="material-status muted" role="status" aria-live="polite"></p>
    <div class="material-source muted" role="status"></div>
    <div><button class="btn material-connect" type="button" hidden>Show my Drive backups</button></div>
    <details><summary>Import a file already on this device</summary>
      <label>Lesson pack ZIP<input type="file" accept=".zip,application/zip,application/x-zip-compressed"></label></details>`;
  const get = rule => panel.querySelector(rule);
  const selector = get('.material-select'), action = get('.material-action');
  const search = get('input[type=search]'), form = get('form');
  const status = get('.material-status'), source = get('.material-source');
  const permission = get('.material-permission'), allow = get('.material-allow');
  const connect = get('.material-connect'), fileInput = get('input[type=file]');
  const progress = get('.download-progress');
  function reportBytes(received,total) {
    const mb = (received / 1048576).toFixed(1);
    if (total && received <= total) {
      const percent = Math.floor(received * 100 / total);
      progress.value = percent;
      status.textContent = 'Downloading · '+percent+'% ('+mb+' MB)';
    } else {
      progress.removeAttribute('value');
      status.textContent = 'Downloading · '+mb+' MB received';
    }
  }
  const local = new Set(installed.map(pack => pack.id));
  const materials = new Map();
  const shortcuts = privateLinks().map(item => ({...privateBooks.find(book=>book.id===item.id),...item}));
  let chosenId = selectedId;
  let pendingPrivate;
  let busy = false;
  let loading = false;
  let revision = 0;

  function include(item) {
    if (!validId(item.id) || retiredSamples.has(item.id) || materials.has(item.id)) return;
    if (local.has(item.id) && !installed.includes(item)) return;
    const assigned = materialGrade(records,item);
    const privatePack = item.driveId || item.file || item.filename;
    if (subject && item.subject !== subject && !(privatePack && !item.subject)) return;
    if (assigned === 'Unassigned' && GRADES.includes(grade) && item.grades && !item.grades.includes(grade)) return;
    if (grade !== 'All grades' && assigned !== grade && !(privatePack && assigned === 'Unassigned' && !local.has(item.id))) return;
    materials.set(item.id,{...item,grade:assigned});
  }
  function draw() {
    const query = search.value.trim().toLowerCase().replace(/phonetics?/g,'phonics');
    selector.replaceChildren();
    for (const item of materials.values()) {
      if (![item.title,item.subject,item.grade,item.description].join(' ').toLowerCase().includes(query)) continue;
      const label = local.has(item.id) ? 'Ready on this device' : item.driveId ? 'My Drive backup' :
        item.file || item.filename ? 'Requires your private pack' : 'Available';
      selector.add(new Option([item.title,item.subject,item.grade === 'Unassigned' ? item.grades?.join(' / ') : item.grade,label].filter(Boolean).join(' · '),item.id));
    }
    if (Array.from(selector.options).some(option => option.value === chosenId)) selector.value = chosenId;
    const item = materials.get(selector.value);
    if (!item) selector.add(new Option(loading ? 'Searching…' : 'No matching materials',''));
    selector.disabled = busy || !item;
    action.hidden = !item || pendingPrivate?.id === item.id;
    action.disabled = busy;
    action.textContent = local.has(item?.id) ? 'Open material' : 'Download';
    permission.hidden = !pendingPrivate || pendingPrivate.id !== item?.id;
    allow.disabled = busy;
    connect.disabled = busy;
    fileInput.disabled = busy;
    search.disabled = busy;
    for (const filter of panel.parentElement?.querySelectorAll('.download-filters select') || []) filter.disabled = busy;
    form.querySelector('button').disabled = busy || loading;
  }
  function resetChoice() {
    pendingPrivate = undefined;
    status.textContent = '';
    draw();
  }
  async function searchOnline() {
    const current = ++revision;
    loading = true;
    source.textContent = 'Searching the online catalog…';
    draw();
    const [catalog, backups] = await Promise.allSettled([publishedMaterials(),isConnected() ? availableLessonPacks() : []]);
    if (!panel.isConnected || current !== revision) return;
    materials.clear();
    installed.forEach(include);
    if (backups.status === 'fulfilled') {
      for (const file of backups.value) {
        const p = file.appProperties || {};
        const book=privateBooks.find(item=>item.id===p.material);
        include({...book,id:p.material,title:file.name.replace(/ - Lesson Pack\.zip$/i,''),grade:p.grade,
          subject:p.subject || book?.subject,driveId:file.id});
      }
    }
    if (catalog.status === 'fulfilled') catalog.value.forEach(include);
    [...shortcuts,...privateBooks].forEach(include);
    source.textContent = [catalog.status === 'rejected' && 'Online catalog unavailable. Tap Search online to retry.',
      backups.status === 'rejected' && 'Your Drive backups could not load. Reconnect and search again.'].filter(Boolean).join(' ');
    connect.hidden = isConnected() && backups.status === 'fulfilled';
    loading = false;
    draw();
  }
  async function install(read,item = {}) {
    if (busy) return;
    busy = true;
    draw();
    progress.removeAttribute('value');
    progress.hidden = false;
    status.textContent = 'Downloading '+(item.title || 'lesson pack')+'…';
    try {
      const blob = await read();
      if (!blob) return;
      const assigned = GRADES.includes(item.grade) ? item.grade : GRADES.includes(grade) ? grade : item.grades?.[0];
      progress.removeAttribute('value');
      status.textContent = 'Saving lessons on this device…';
      const pack = await importPack(blob,{id:item.id,subject:item.subject || subject,grade:assigned});
      if (panel.isConnected) await refresh(pack.id);
    } catch (error) {
      status.textContent = error.message || 'Download failed. Try again.';
    } finally { progress.hidden = true; busy = false; if (panel.isConnected) draw(); }
  }
  async function askForRead(item) {
    status.textContent = 'Preparing Google sign-in…';
    if (!await driveApi.prepareDrive()) throw new Error('Google Drive setup is missing in Settings.');
    pendingPrivate = item;
    status.textContent = '';
    return null;
  }
  action.onclick = () => {
    const item = materials.get(selector.value);
    if (!item || busy) return;
    if (local.has(item.id)) { location.hash = 'level/'+encodeURIComponent(item.id); return; }
    if (item.driveId) { install(() => downloadLessonPack(item.driveId,undefined,reportBytes),item); return; }
    if (item.file || item.filename) {
      install(async () => {
        if (isConnected()) {
          const blob = await driveApi.readPrivateMaterial(item,undefined,reportBytes);
          if (blob) return blob;
        }
        return askForRead(item);
      },item);
      return;
    }
    install(async () => {
      const response = await fetch(new URL(item.url,location.href),{credentials:'omit',signal:AbortSignal.timeout(120000)});
      if (!response.ok) throw new Error('This package could not be downloaded. Try Search online again.');
      return readPackResponse(response,reportBytes);
    },item);
  };
  allow.onclick = () => {
    const item = pendingPrivate;
    if (!item || busy) return;
    install(async () => {
      const readToken = await driveApi.authorizeMaterialRead();
      status.textContent = 'Finding '+item.title+' in your Drive…';
      const blob = await driveApi.readPrivateMaterial(item,readToken,reportBytes);
      if (!blob) throw new Error(item.title+' was not found in that Google account. Retry with the account that holds the prepared pack.');
      return blob;
    },item);
  };
  connect.onclick = async () => {
    if (busy) return;
    try {
      busy = true; draw();
      if (!window.google?.accounts?.oauth2 || !driveApi.configuredClientId()) {
        if (!await driveApi.prepareDrive()) throw new Error('Google Drive setup is missing in Settings.');
        status.textContent = 'Google is ready. Tap Show my Drive backups to sign in.';
        return;
      }
      await driveApi.connectDrive();
      status.textContent = '';
      await searchOnline();
    } catch (error) { status.textContent = error.message; }
    finally { busy = false; draw(); }
  };
  fileInput.onchange = () => {
    const file = fileInput.files[0]; fileInput.value = '';
    if (file) install(() => file);
  };
  form.onsubmit = event => { event.preventDefault(); if (!busy) { resetChoice(); searchOnline(); } };
  selector.onchange = () => { chosenId = selector.value; resetChoice(); };
  search.oninput = resetChoice;
  installed.forEach(include);
  [...shortcuts,...privateBooks].forEach(include);
  if (selectedId && local.has(selectedId)) status.textContent = 'Ready on this device. Find this material in Subjects → '+installed.find(p => p.id === selectedId).subject+'.';
  await searchOnline();
}

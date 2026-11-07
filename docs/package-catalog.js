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
// Describe the compatible private workbook without publishing a family's Drive file ID.
const phonicsA = {id:'k5-phonics-a', title:'Phonics A', subject:'Phonics', filename:'Phonics-A-Lesson-Pack.zip'};
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
  panel.innerHTML = `<h2>Materials</h2>
    <label>Choose a material<select class="material-select"></select></label>
    <div class="actions"><button class="btn primary material-action" type="button"></button>
    <button class="btn material-import" type="button">Add lesson pack ZIP</button></div>
    <div class="material-recovery actions" hidden></div><p class="material-status muted" role="status" aria-live="polite"></p>
    <p class="material-source muted"></p>`;
  const selector = panel.querySelector('select');
  const action = panel.querySelector('.material-action');
  const add = panel.querySelector('.material-import');
  const status = panel.querySelector('.material-status');
  const source = panel.querySelector('.material-source');
  const recovery = panel.querySelector('.material-recovery');
  const materials = new Map();
  const local = new Set(installed.map(pack => pack.id));
  const shortcuts = privateLinks();
  let installing = false;
  let remoteLoading = true;
  let chosenId = selectedId;
  function include(item) {
    if (!validId(item.id) || materials.has(item.id)) return;
    const assigned = materialGrade(records, item);
    const legacyDrive = Boolean(item.driveId || item.file || item.filename);
    if (subject && item.subject !== subject && !(legacyDrive && !item.subject)) return;
    if (grade !== 'All grades' && assigned !== grade && !(legacyDrive && assigned === 'Unassigned')) return;
    materials.set(item.id, {...item, grade:assigned});
  }
  function draw() {
    const previous = chosenId || selector.value;
    selector.replaceChildren();
    for (const item of materials.values()) {
      const state = local.has(item.id) ? 'Ready on this device' : (item.driveId || item.file) ? 'My Drive' : item.filename ? 'Private lesson pack' : 'Available';
      selector.add(new Option([item.title,item.subject,item.grade === 'Unassigned' ? '' : item.grade,state].filter(Boolean).join(' · '), item.id));
    }
    if (materials.has(previous)) selector.value = previous;
    const item = materials.get(selector.value);
    if (!item) selector.add(new Option(remoteLoading ? 'Checking available materials…' : 'No materials for this selection', ''));
    selector.disabled = installing || !item;
    action.hidden = !item;
    action.disabled = installing;
    action.textContent = local.has(item?.id) ? 'Open material' : 'Download';
    add.disabled = installing;
  }
  async function install(readFile, expected) {
    if (installing) return;
    installing = true;
    draw();
    status.textContent = 'Saving the lesson pack on this device…';
    let receivedFile = false;
    try {
      const file = await readFile();
      receivedFile = true;
      const pack = await importPack(file, expected);
      if (panel.isConnected) await refresh(pack.id);
    } catch (error) {
      status.textContent = error.message || 'Download failed. Try again.';
      if (!receivedFile && (expected.file || expected.filename) && panel.isConnected) showPrivateImport(expected);
    } finally {
      installing = false;
      if (panel.isConnected) draw();
    }
  }
  function pickFile(expected) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip,application/zip,application/x-zip-compressed';
    input.hidden = true;
    panel.append(input);
    input.oncancel = () => input.remove();
    input.onchange = () => {
      const file = input.files[0];
      input.remove();
      if (file) install(() => file, expected);
    };
    input.click();
  }
  function showPrivateImport(expected) {
    const link = document.createElement('a');
    link.className = 'btn primary';
    link.href = expected.file ? 'https://drive.google.com/file/d/' + encodeURIComponent(expected.file) + '/view' :
      'https://drive.google.com/drive/search?q=' + encodeURIComponent(expected.filename);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = expected.file ? 'Get ZIP from My Drive' : 'Find ZIP in My Drive';
    const importButton = document.createElement('button');
    importButton.type = 'button';
    importButton.className = 'btn';
    importButton.textContent = 'Select lesson ZIP';
    importButton.onclick = () => pickFile(expected);
    recovery.replaceChildren(link,importButton);
    recovery.hidden = false;
    status.textContent = (expected.filename ? 'Choose '+expected.filename+' from your files or Google Drive.' :
      'Save the ZIP from your Drive, then select it here.')+' Once saved, open Subjects → '+expected.subject+'.';
  }
  function optionsFor(item = {}) {
    const assigned = GRADES.includes(item.grade) ? item.grade : GRADES.includes(grade) ? grade : undefined;
    return {id:item.id, file:item.file, filename:item.filename, subject:item.subject || subject, grade:assigned};
  }
  add.onclick = () => pickFile(optionsFor());
  selector.onchange = () => { chosenId = selector.value; recovery.hidden = true; status.textContent = ''; draw(); };
  action.onclick = () => {
    const item = materials.get(selector.value);
    if (!item || installing) return;
    if (local.has(item.id)) { location.hash = 'level/' + encodeURIComponent(item.id); return; }
    if (item.file) {
      if (!isConnected()) { showPrivateImport(optionsFor(item)); return; }
      install(() => downloadLessonPack(item.file), optionsFor(item)); return;
    }
    if (item.driveId) { install(() => downloadLessonPack(item.driveId), optionsFor(item)); return; }
    if (item.filename) {
      const expected = optionsFor(item);
      if (!isConnected()) { showPrivateImport(expected); return; }
      install(async () => {
        const id = await driveApi.findLessonZip?.(item.filename);
        if (!id) throw new Error('Select the ZIP from your Drive to add this pack.');
        return downloadLessonPack(id);
      }, expected);
      return;
    }
    const url = new URL(item.url, location.href);
    if (url.origin !== location.origin) {
      window.open(url.href,'_blank','noopener,noreferrer');
      status.textContent = 'Save the ZIP, then select Add lesson pack ZIP to install it here.';
      return;
    }
    install(async () => {
      const response = await fetch(url);
      if (!response.ok) throw new Error('The file could not be downloaded. Try again.');
      return response.blob();
    }, optionsFor(item));
  };
  function addPersonalChoices() {
    // An installed pack is filed only under its actual grade, even when another source lacks a grade.
    for (const item of [...shortcuts, phonicsA]) if (!local.has(item.id)) include(item);
  }
  installed.forEach(include);
  addPersonalChoices();
  draw();
  const connected = isConnected();
  const [catalog, drive] = await Promise.allSettled([publishedMaterials(), connected ? availableLessonPacks() : []]);
  if (!panel.isConnected) return;
  // Drive files are listed newest first. Prefer the user's saved copy over a published duplicate.
  materials.clear();
  installed.forEach(include);
  if (drive.status === 'fulfilled') {
    for (const file of drive.value) {
      const properties = file.appProperties || {};
      if (local.has(properties.material)) continue;
      include({id:properties.material, title:file.name.replace(/ - Lesson Pack\.zip$/i,''), grade:properties.grade,
        subject:properties.subject || (properties.material === phonicsA.id ? phonicsA.subject : undefined), driveId:file.id});
    }
  }
  addPersonalChoices();
  if (catalog.status === 'fulfilled') catalog.value.filter(item => !local.has(item.id)).forEach(include);
  remoteLoading = false;
  draw();
  const hints = [];
  if (drive.status === 'rejected') hints.push('Your Drive list could not load. Reconnect in Google Drive settings and reopen Downloads.');
  if (catalog.status === 'rejected') hints.push('The online catalog could not load.');
  if (!materials.size) hints.push('No available packs for this grade and subject. Choose another filter or add your ZIP.');
  if (materials.size && !local.size) hints.push('Downloaded lessons appear automatically in Subjects.');
  source.textContent = hints.join(' ');
}

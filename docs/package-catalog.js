import {importPack,listPacks} from './lesson-store.js';
import {GRADES, materialGrade} from './students.js';
import {SUBJECTS} from './learning-core.js';
import {isConnected, availableLessonPacks, downloadLessonPack} from './drive.js';

function validPackageUrl(value) {
  try {
    const url = new URL(value, location.href);
    return url.protocol === 'https:' || (url.protocol === 'http:' && url.origin === location.origin);
  } catch { return false; }
}

const validId = value => typeof value === 'string' && /^[a-z0-9-]+$/.test(value);
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
    <p class="material-status muted" role="status" aria-live="polite"></p>
    <p class="material-source muted"></p>`;
  const selector = panel.querySelector('select');
  const action = panel.querySelector('.material-action');
  const add = panel.querySelector('.material-import');
  const status = panel.querySelector('.material-status');
  const source = panel.querySelector('.material-source');
  const materials = new Map();
  const local = new Set(installed.map(pack => pack.id));
  let installing = false;
  let remoteLoading = true;
  let chosenId = selectedId;
  function include(item) {
    if (!validId(item.id) || materials.has(item.id)) return;
    const assigned = materialGrade(records, item);
    const legacyDrive = Boolean(item.driveId);
    if (subject && item.subject !== subject && !(legacyDrive && !item.subject)) return;
    if (grade !== 'All grades' && assigned !== grade && !(legacyDrive && assigned === 'Unassigned')) return;
    materials.set(item.id, {...item, grade:assigned});
  }
  function draw() {
    const previous = chosenId || selector.value;
    selector.replaceChildren();
    for (const item of materials.values()) {
      const state = local.has(item.id) ? 'Ready on this device' : item.driveId ? 'My Drive' : 'Available';
      selector.add(new Option([item.title,item.grade,state].join(' · '), item.id));
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
    try {
      const file = await readFile();
      const pack = await importPack(file, expected);
      if (panel.isConnected) await refresh(pack.id);
    } catch (error) {
      status.textContent = error.message || 'Download failed. Try again.';
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
  function optionsFor(item = {}) {
    const assigned = GRADES.includes(item.grade) ? item.grade : GRADES.includes(grade) ? grade : undefined;
    return {id:item.id, subject:item.subject || subject, grade:assigned};
  }
  add.onclick = () => pickFile(optionsFor());
  selector.onchange = () => { chosenId = selector.value; status.textContent = ''; draw(); };
  action.onclick = () => {
    const item = materials.get(selector.value);
    if (!item || installing) return;
    if (local.has(item.id)) { location.hash = 'level/' + encodeURIComponent(item.id); return; }
    if (item.driveId) { install(() => downloadLessonPack(item.driveId), optionsFor(item)); return; }
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
  installed.forEach(include);
  draw();
  const connected = isConnected();
  const [catalog, drive] = await Promise.allSettled([publishedMaterials(), connected ? availableLessonPacks() : []]);
  if (!panel.isConnected) return;
  // Drive files are listed newest first. Prefer the user's saved copy over a published duplicate.
  if (drive.status === 'fulfilled') {
    for (const file of drive.value) {
      const properties = file.appProperties || {};
      include({id:properties.material, title:file.name.replace(/ - Lesson Pack\.zip$/i,''), grade:properties.grade,
        subject:properties.subject, driveId:file.id});
    }
  }
  if (catalog.status === 'fulfilled') catalog.value.forEach(include);
  remoteLoading = false;
  draw();
  const hints = [];
  if (drive.status === 'rejected') hints.push('Your Drive list could not load. Reconnect in Google Drive settings and reopen Subjects.');
  if (catalog.status === 'rejected') hints.push('The online catalog could not load.');
  if (!connected) {
    hints.push('Connect Google Drive in Settings to see lesson packs you backed up with Family Learning.');
  } else if (drive.status === 'fulfilled' && !drive.value.length) {
    hints.push('Your connected Drive has no lesson packs backed up by Family Learning yet.');
  }
  hints.push('For a ZIP already in your files or personal Drive, choose Add lesson pack ZIP. Pick a grade first to file an ungraded pack there.');
  source.textContent = hints.join(' ');
}

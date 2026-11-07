import {GRADES,activeStudents,materialGrade} from './students.js';
import { record, latestProfiles } from './core.js';
import { SUBJECTS, latestStop, chapterProgress } from './learning-core.js';
import { getPack, listPacks, importPack } from './lesson-store.js';
import {mountDownloads} from './package-catalog.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const button = (id, label, primary = false) => '<button class="btn' + (primary ? ' primary' : '') + '" id="' + id + '">' + label + '</button>';
const date = value => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

export function createLessons({ main, getState, mutate, toast, dialog, closeDialog, onError }) {
  let controller;
  let activePack;
  let pictureUrl;
  let routeVersion = 0;
  const query = selector => main.querySelector(selector);
  const people = () => activeStudents(getState().records);
  let gradeFilter='All grades';
  try {
    const saved = localStorage.getItem('family-learning-subject-grade');
    if ([...GRADES,'Unassigned'].includes(saved)) gradeFilter = saved;
  } catch {}
  function selectGrade(value) {
    gradeFilter = value;
    try { localStorage.setItem('family-learning-subject-grade', value); } catch {}
  }
  const grades=()=>['All grades',...GRADES,'Unassigned'];
  const gradeControl=()=>'<label class="chapter-search">Grade level<select id="grade-filter">'+grades().map(g=>'<option'+(g===gradeFilter?' selected':'')+'>'+g+'</option>').join('')+'</select></label>';
  const matchesGrade=p=>gradeFilter==='All grades'||materialGrade(getState().records,p)===gradeFilter;
  const target = () => getState().settings.masteryTarget ?? 80;

  function reset() {
    controller?.abort();
    controller = new AbortController();
    if (pictureUrl) URL.revokeObjectURL(pictureUrl);
    pictureUrl = null;
    document.body.classList.remove('lesson-presentation');
    routeVersion++;
    return routeVersion;
  }
  function listen(element, type, handler) {
    element?.addEventListener(type, handler, { signal: controller.signal });
  }
  function title(text, subtitle) {
    return '<div class="page-heading"><div><h1>' + escape(text) + '</h1><p class="muted">' + escape(subtitle) + '</p></div></div>';
  }
  function loading() { main.innerHTML = '<p role="status">Opening the lesson collection…</p>'; }
  function result(childId, materialId, chapterId) {
    return chapterProgress(getState().records, childId, materialId, chapterId, target());
  }
  async function choosePack() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip,application/zip';
    input.setAttribute('aria-label', 'Choose lesson pack ZIP');
    input.hidden = true;
    document.body.append(input);
    input.addEventListener('cancel', () => input.remove(), { once: true });
    input.onchange = async () => {
      const file = input.files[0];
      input.remove();
      if (!file) return;
      dialog('<h2>Opening lesson pack</h2><p role="status">Checking the cards and saving them for use on this device…</p>');
      try {
        const manifest = await importPack(file);
        closeDialog();
        toast('Lesson pack ready on this device.');
        if (location.hash === '#level/' + manifest.id) await level(manifest.id);
        else location.hash = '#level/' + manifest.id;
      } catch (error) { onError('Lesson pack could not open', error.message); }
    };
    input.click();
  }
  function installPanel() {
    return '<article class="card pack-setup"><h2>Add a lesson pack</h2>' +
      '<p>The app comes without purchased workbooks. Choose a prepared Family Learning ZIP from your files, or download a pack you previously backed up to your own Google Drive.</p>' +
      '<div class="actions">'+button('choose-pack', 'Open lesson pack', true)+'<a class="btn" href="#settings/backup">My Drive lesson packs</a></div>' +
      '<p class="muted">Import once per device for offline use. Your scores are separate from the pack. Use materials you own or have permission to use.</p></article>';
  }
  function materialPanel(packs, name, selectedId, refresh) {
    const panel = main.querySelector('.subject-materials');
    mountDownloads(panel, {grade:gradeFilter, subject:name, records:getState().records, installed:packs, selectedId, refresh})
      .catch(error => { if (panel.isConnected) panel.textContent = 'Could not open materials. ' + error.message; });
  }
  async function subjects(selectedId) {
    const version = reset();
    loading();
    const packs = await listPacks();
    if (version !== routeVersion) return;
    main.innerHTML = title('Learning subjects', 'Choose a grade to download or open a material.') + gradeControl() +
      '<section class="card stack subject-materials" aria-label="Materials by grade"></section>' +
      '<div class="subject-grid">' + SUBJECTS.map(subject => {
        const count = packs.filter(pack => pack.subject === subject && matchesGrade(pack)).length;
        return '<a class="card subject-tile" href="#subject/' + encodeURIComponent(subject) + '"><h2>' + escape(subject) +
          '</h2><p class="muted">' + count + ' ready on this device</p></a>';
      }).join('') + '</div><div class="actions lesson-secondary"><a class="btn" href="#library">Other teaching materials</a><a class="btn" href="#learning-progress">View progress</a></div>';
    listen(query('#grade-filter'), 'change', event => { selectGrade(event.target.value); subjects(); });
    materialPanel(packs, undefined, selectedId, subjects);
  }
  async function subject(name, selectedId) {
    const version = reset();
    loading();
    const packs = await listPacks();
    if (version !== routeVersion) return;
    const matching = packs.filter(pack => pack.subject === name && matchesGrade(pack));
    const aliases = {Mathematics:'Math','Reading comprehension':'Reading Comprehension',Phonetics:'Phonics'};
    const resources = getState().records.filter(r => r.kind === 'course' &&
      (aliases[r.subject] || r.subject).toLowerCase() === name?.toLowerCase() &&
      (gradeFilter === 'All grades' || (r.grade || 'Unassigned') === gradeFilter));
    main.innerHTML = '<a class="text-link" href="#subjects">All subjects</a>' + title(name, 'Choose a material to download or open.') +
      gradeControl() + '<section class="card stack subject-materials" aria-label="Subject materials"></section>' +
      '<div class="grid">' + matching.map(pack => '<a class="card subject-tile" href="#level/' + encodeURIComponent(pack.id) +
        '"><h2>' + escape(pack.title) + '</h2><p>' + escape(pack.level) + ' · ' + pack.chapters.length + (pack.chapters.length === 1 ? ' chapter' : ' chapters') +
        '</p><small>Ready on this device</small></a>').join('') + '</div>';
    if (resources.length) main.insertAdjacentHTML('beforeend','<h2 class="lesson-secondary">Teaching materials</h2><div class="grid">'+resources.map(r=>'<a class="card subject-tile" href="#book/'+encodeURIComponent(r.id)+'"><h3>'+escape(r.title)+'</h3><p>'+escape(r.level)+'</p></a>').join('')+'</div>');
    listen(query('#grade-filter'), 'change', event => { selectGrade(event.target.value); subject(name); });
    materialPanel(packs, name, selectedId, id => subject(name, id));
  }
  async function level(id) {
    const version = reset();
    loading();
    const loaded = await getPack(id);
    if (version !== routeVersion) return;
    activePack = loaded;
    if (!activePack) {
      main.innerHTML = title('Lesson pack needed', 'Import this material before opening its cards.') + installPanel();
      listen(query('#choose-pack'), 'click', choosePack);
      return;
    }
    const m = activePack.manifest;
    const stop = latestStop(getState().records, id);
    const savedChapter = m.chapters.find(c => c.id === stop?.chapterId);
    const savedCard = savedChapter?.cards.find(c => c.id === stop?.cardId);
    const resume = savedCard ? '#lesson/' + id + '/' + savedChapter.id + '/' + savedCard.id :
      '#lesson/' + id + '/' + m.chapters[0].id;
    main.innerHTML = '<a class="text-link" href="#subject/' + encodeURIComponent(m.subject) + '">' + escape(m.subject) + '</a>' +
      title(m.title, m.level + ' · '+materialGrade(getState().records,m)) +
      '<div class="actions lesson-secondary"><label>Material grade<select id="material-grade"><option value="">Choose grade</option>'+GRADES.map(g=>'<option'+(materialGrade(getState().records,m)===g?' selected':'')+'>'+g+'</option>').join('')+'</select></label>'+button('save-material-grade','Save grade')+'</div>' +
      '<div class="resume-card"><div><h2>' + (savedCard ? 'Continue your lesson' : 'Begin teaching') + '</h2><p>' +
      (savedCard ? escape(savedChapter.title) + ' · Workbook page ' + savedCard.page + ' · ' + escape(savedCard.label) :
        'Open a chapter and present one activity at a time.') + '</p></div><a class="btn primary" href="' + resume + '">' +
      (savedCard ? 'Continue lesson' : 'Start Level A') + '</a></div>' +
      '<div class="section-heading"><h2>Chapters</h2><a class="text-link" href="#learning-progress">Individual progress</a></div>' +
      '<p class="muted">Parent teaching view · You can open any chapter. Each child’s next step is based on their own completed work and score.</p>' +
      '<label class="chapter-search">Find a sound or page<input id="find-chapter" type="search" placeholder="For example, short u or 136"></label>' +
      '<div class="chapter-list" id="chapters"></div>';
    listen(query('#save-material-grade'),'click',async()=>{const grade=query('#material-grade').value;if(!GRADES.includes(grade))return toast('Choose a grade first.');try{await mutate(s=>s.records.push(record('material_profile',{materialId:id,grade})));toast('Material grade saved.');}catch(error){onError('Grade could not save',error.message);}});
    const drawChapters = term => {
      query('#chapters').innerHTML = m.chapters.filter(c => {
        const page = Number(term);
        return !term || c.title.toLowerCase().includes(term) || (page >= c.startPage && page <= c.endPage);
      }).map((ch) => '<article class="chapter-row"><div><h3>' + escape(ch.title) + '</h3><small>Workbook pages ' +
        ch.startPage + '–' + ch.endPage + ' · ' + ch.cards.length + ' cards</small><div class="child-statuses">' +
        people().map(p => {
          const r = result(p.childId, id, ch.id);
          return '<span class="status-pill ' + (r.mastered ? 'mastered' : '') + '">' + escape(p.name) + ' · ' +
            r.status + (r.percentage !== null ? ' · ' + r.percentage + '%' : '') + '</span>';
        }).join('') + '</div></div><a class="btn" href="#lesson/' + id + '/' + ch.id + '">Teach chapter</a></article>').join('');
    };
    main.insertAdjacentHTML('beforeend', '<div class="actions lesson-secondary">' + button('replace-pack', 'Open updated lesson pack') + '</div>');
    listen(query('#replace-pack'), 'click', choosePack);
    drawChapters('');
    listen(query('#find-chapter'), 'input', e => drawChapters(e.target.value.trim().toLowerCase()));
  }
  function openWorkbook(page) {
    const blob = activePack?.assets['workbook.pdf'];
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    window.open(url + '#page=' + page, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 600000);
  }
  async function player(materialId, chapterId, cardId) {
    const version = reset();
    loading();
    const loaded = activePack?.id === materialId ? activePack : await getPack(materialId);
    if (version !== routeVersion) return;
    activePack = loaded;
    if (!activePack) { await level(materialId); return; }
    const m = activePack.manifest;
    const chapter = m.chapters.find(c => c.id === chapterId);
    if (!chapter) { location.hash = '#level/' + materialId; return; }
    let index = Math.max(0, chapter.cards.findIndex(c => c.id === cardId));
    document.body.classList.add('lesson-presentation');
    main.innerHTML = '<section class="presentation" aria-label="Lesson presentation"><div class="presentation-toolbar">' +
      '<a class="btn" href="#level/' + materialId + '">← Chapters</a><div class="presentation-title"><strong>' +
      escape(chapter.title) + '</strong><small>'+escape(m.title)+'</small></div>' + button('teacher-guide', 'Teacher’s guide') +
      '</div><div class="card-reference"><span id="page-ref"></span><label>Card <select id="card-picker" aria-label="Choose lesson card">' +
      chapter.cards.map((c, i) => '<option value="' + i + '">' + (i + 1) + ' · p. ' + c.page + ' · ' + escape(c.label) + '</option>').join('') +
      '</select></label></div><div class="teaching-card" id="teaching-card" tabindex="0" aria-label="Teaching card"></div>' +
      '<div class="presentation-controls">' + button('previous-card', '← Previous') + '<span id="card-count" role="status" aria-live="polite"></span>' +
      button('next-card', 'Next →') + '</div><div class="presentation-save"><span id="saved-stop" class="muted"></span>' +
      '<div class="actions">' + button('present-fullscreen', 'Full screen') + button('end-lesson', 'End lesson here', true) +
      '</div></div></section>';
    function display() {
      const card = chapter.cards[index];
      if (pictureUrl) URL.revokeObjectURL(pictureUrl);
      pictureUrl = card.image ? URL.createObjectURL(activePack.assets[card.image]) : null;
      query('#teaching-card').innerHTML = pictureUrl ? '<img src="' + pictureUrl + '" alt="' +
        escape(card.label + ' from '+m.title+', workbook page ' + card.page) + '" draggable="false">' :
        '<div class="word-card">' + escape(card.text) + '</div>';
      query('#page-ref').textContent = 'Workbook page ' + card.page + ' · ' + card.label;
      query('#card-count').textContent = (index + 1) + ' of ' + chapter.cards.length;
      query('#card-picker').value = index;
      query('#previous-card').disabled = index === 0;
      query('#next-card').disabled = index === chapter.cards.length - 1;
      const saved = latestStop(getState().records, materialId);
      query('#saved-stop').textContent = saved?.cardId === card.id ? 'Saved stopping point · ' + date(saved.createdAt) : '';
      // This URL supports browsing back to a card. Only End lesson here writes a learning record.
      history.replaceState(null, '', '#lesson/' + materialId + '/' + chapter.id + '/' + card.id);
    }
    function step(amount) {
      index = Math.max(0, Math.min(chapter.cards.length - 1, index + amount));
      display();
    }
    display();
    listen(query('#previous-card'), 'click', () => step(-1));
    listen(query('#next-card'), 'click', () => step(1));
    listen(query('#card-picker'), 'change', e => { index = Number(e.target.value); display(); });
    listen(document, 'keydown', e => {
      if (document.querySelector('dialog[open]') || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    });
    let touch;
    listen(query('#teaching-card'), 'touchstart', e => {
      touch = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
    });
    listen(query('#teaching-card'), 'touchend', e => {
      if (!touch || !e.changedTouches[0]) return;
      const dx = e.changedTouches[0].clientX - touch.x, dy = e.changedTouches[0].clientY - touch.y;
      if (Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
      touch = null;
    });
    listen(query('#present-fullscreen'), 'click', async () => {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
        else toast('The teaching view already fills the available screen. Rotate your iPad for a wider view.');
      } catch { toast('Full screen is unavailable in this browser.'); }
    });
    listen(query('#teacher-guide'), 'click', () => {
      const card = chapter.cards[index];
      dialog('<div class="guide-heading"><h2>Teacher’s guide</h2><button class="btn" data-close>Close</button></div><h3>' +
        escape(chapter.title) + '</h3><p class="muted">Workbook page ' + card.page + ' · Card ' + (index + 1) +
        '</p><p>' + escape(card.guide) + '</p><div class="note green">Give each child their own turn. Record a score such as 4 out of 5 based on the work you actually checked.</div>' +
        '<div class="actions lesson-secondary">' + button('show-workbook', 'Open workbook for printing') +
        button('chapter-score', 'Record chapter scores') + '</div><p class="muted lesson-secondary">Your workbook is included in this private pack. Keep materials within their permitted use.</p>');
      document.querySelector('#show-workbook').onclick = () => openWorkbook(card.pdfPage);
      document.querySelector('#chapter-score').onclick = () => endLesson(m, chapter, card, false, display);
    });
    listen(query('#end-lesson'), 'click', () => endLesson(m, chapter, chapter.cards[index], true, display));
  }
  function endLesson(material, chapter, card, saveStop, afterSave) {
    const last = chapter.cards.at(-1).id === card.id;
    dialog('<div class="guide-heading"><h2>' + (saveStop ? 'End lesson here' : 'Chapter scores') +
      '</h2><button class="btn" data-close>Cancel</button></div><p>' + escape(chapter.title) + ' · Workbook page ' +
      card.page + '</p><form id="lesson-results" class="stack">' + people().map((p, i) => {
        const previous = result(p.childId, material.id, chapter.id);
        return '<fieldset class="child-result"><legend>' + escape(p.name) + '</legend>' +
          '<label class="check-label"><input type="checkbox" name="attended-' + i + '" checked> Took part in this lesson</label>' +
          '<div class="form-grid"><label>Correct answers<input type="number" name="earned-' + i + '" min="0" step="1" inputmode="numeric"></label>' +
          '<label>Total questions<input type="number" name="total-' + i + '" min="1" step="1" inputmode="numeric"></label></div>' +
          '<p class="score-preview" id="score-preview-' + i + '">Score can be recorded later</p>' +
          '<label class="check-label"><input type="checkbox" name="complete-' + i + '"' +
          (previous.latest?.complete ? ' checked' : '') + '> Chapter activities completed</label>' +
          '<label>Notes (optional)<input name="notes-' + i + '" maxlength="1000" placeholder="For example, needs help with the middle sound"></label>' +
          (previous.latest ? '<small>Previous result · ' + previous.status + (previous.percentage !== null ? ' · ' + previous.percentage + '%' : '') + '</small>' : '') +
          '</fieldset>';
      }).join('') + '<p class="muted">' + (last ? 'You are on this chapter’s last card. ' : '') +
      'A completed chapter with a score of at least ' + target() + '% is marked mastered. Each child is assessed separately.</p>' +
      '<p id="result-error" class="form-error" role="alert"></p><button class="btn primary" type="submit">' +
      (saveStop ? 'Save stopping point and results' : 'Save chapter results') + '</button></form>');
    const form = document.querySelector('#lesson-results');
    form.oninput = () => {
      people().forEach((p, i) => {
        const earned = form.elements['earned-' + i].value, total = form.elements['total-' + i].value;
        document.querySelector('#score-preview-' + i).textContent = earned !== '' && Number(total) > 0 ?
          Math.round(Number(earned) / Number(total) * 100) + '%' : 'Score can be recorded later';
      });
    };
    form.onsubmit = async e => {
      e.preventDefault();
      const submit = e.submitter;
      submit.disabled = true;
      try {
        const records = [], childIds = [];
        for (const [i, p] of people().entries()) {
          if (!form.elements['attended-' + i].checked) continue;
          childIds.push(p.childId);
          const earnedText = form.elements['earned-' + i].value;
          const totalText = form.elements['total-' + i].value;
          if ((earnedText === '') !== (totalText === '')) throw new Error('Enter both score fields for ' + p.name + ', or leave both empty.');
          const earned = earnedText === '' ? null : Number(earnedText);
          const total = totalText === '' ? null : Number(totalText);
          if (total !== null && (!Number.isInteger(earned) || !Number.isInteger(total) || total <= 0 || earned < 0 || earned > total)) {
            throw new Error('Check the score for ' + p.name + '. Correct answers must be between zero and the total.');
          }
          const complete = form.elements['complete-' + i].checked;
          const notes = form.elements['notes-' + i].value.trim();
          const previous = result(p.childId, material.id, chapter.id).latest;
          // A bookmark-only save must preserve a previously recorded assessment.
          if (earned !== null || notes || !previous || complete !== Boolean(previous?.complete)) {
            records.push(record('chapter_result', {
              materialId: material.id, chapterId: chapter.id, childId: p.childId,
              earned: earned ?? previous?.earned ?? null, total: total ?? previous?.total ?? null, complete, notes: notes || previous?.notes || '', page: card.page
            }));
          }
        }
        if (!childIds.length) throw new Error('Select at least one child who took part.');
        if (!saveStop && !records.length) throw new Error('Enter a score, a note, or change the chapter completion checkbox.');
        if (saveStop) records.push(record('lesson_stop', {
          materialId: material.id, chapterId: chapter.id, cardId: card.id, page: card.page, childIds
        }));
        await mutate(s => { s.records.push(...records); });
        closeDialog();
        afterSave?.();
        toast('Saved on this device. Export a backup to keep a separate copy.');
      } catch (error) { document.querySelector('#result-error').textContent = error.message; }
      finally { submit.disabled = false; }
    };
  }
  async function progress(selectedChild) {
    const version = reset();
    loading();
    const packs = await listPacks();
    if (version !== routeVersion) return;
    const ps = people();
    const childId = ps.some(p => p.childId === selectedChild) ? selectedChild : ps[0]?.childId;
    main.innerHTML = title('Learning progress', 'Chapter results and attempts for each child.') +
      '<div class="progress-options"><label>Learner<select id="progress-child">' +
      ps.map(p => '<option value="' + escape(p.childId) + '"' + (p.childId === childId ? ' selected' : '') + '>' + escape(p.name) + '</option>').join('') +
      '</select></label><label>Mastery target (%)<input id="mastery-target" type="number" min="1" max="100" step="1" value="' +
      target() + '"></label>' + button('save-target', 'Save target') + '</div><div id="progress-body"></div>';
    function draw() {
      const currentChild = query('#progress-child').value;
      query('#progress-body').innerHTML = packs.map(m => {
        const rs = m.chapters.map(ch => result(currentChild, m.id, ch.id));
        const mastered = rs.filter(r => r.mastered).length;
        const covered = rs.filter(r => r.latest?.complete).length;
        let unlocked = true;
        return '<section class="progress-section"><h2>' + escape(m.title) + '</h2><p>' +
          covered + ' of ' + m.chapters.length + ' chapters covered · ' + mastered + ' mastered</p>' +
          '<progress value="' + mastered + '" max="' + m.chapters.length + '" aria-label="Mastered chapters"></progress>' +
          '<div class="chapter-list">' + m.chapters.map((ch, i) => {
            const r = rs[i], ready = unlocked;
            unlocked = unlocked && r.mastered;
            return '<article class="chapter-row"><div><h3>' + escape(ch.title) + '</h3><span class="status-pill ' +
              (r.mastered ? 'mastered' : '') + '">' + r.status + '</span>' +
              (r.percentage === null ? '' : '<strong class="chapter-percentage">' + r.latest.earned + '/' + r.latest.total + ' · ' + r.percentage + '%</strong>') +
              '<small class="chapter-pages">Workbook pages ' + ch.startPage + '–' + ch.endPage + '</small>' +
              (r.attempts.length ? '<details class="attempt-history"><summary>' + r.attempts.length + ' saved attempt' +
                (r.attempts.length === 1 ? '' : 's') + '</summary>' + r.attempts.slice().reverse().map(a =>
                  '<p>' + date(a.createdAt) + ' · ' + (a.total ? a.earned + '/' + a.total : 'Score pending') +
                  (a.notes ? ' · ' + escape(a.notes) : '') + '</p>').join('') + '</details>' : '') +
              '</div><a class="btn" href="#lesson/' + m.id + '/' + ch.id + '">' +
              (r.mastered ? 'Review' : ready ? 'Continue learning' : 'Parent access') + '</a></article>';
          }).join('') + '</div></section>';
      }).join('') || '<div class="empty">Open the matching lesson packs to see their chapters here. Existing scores remain in your learning backup.</div><a class="btn" href="#level/k5-phonics-a">Open a lesson pack</a>';
    }
    draw();
    listen(query('#progress-child'), 'change', draw);
    listen(query('#save-target'), 'click', async () => {
      const value = Number(query('#mastery-target').value);
      if (!Number.isInteger(value) || value < 1 || value > 100) return toast('Choose a whole percentage from 1 to 100.');
      try { await mutate(s => { s.settings.masteryTarget = value; }); draw(); toast('Mastery target saved.'); }
      catch (error) { onError('Target could not save', error.message); }
    });
  }
  return { reset, subjects, subject, level, player, progress };
}


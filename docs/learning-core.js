export const SUBJECTS = ['Math', 'Grammar', 'Writing', 'Phonics', 'Reading Comprehension', 'Science'];

export function latestStop(records, materialId) {
  return records.filter(r => r.kind === 'lesson_stop' && r.materialId === materialId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))[0];
}

export function chapterProgress(records, childId, materialId, chapterId, target = 80) {
  const attempts = records.filter(r => r.kind === 'chapter_result' && r.childId === childId &&
    r.materialId === materialId && r.chapterId === chapterId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const latest = attempts.at(-1);
  const percentage = latest?.total > 0 ? Math.round(latest.earned / latest.total * 100) : null;
  let status = 'Not started';
  if (latest) {
    status = 'In progress';
    if (latest.complete) status = percentage === null ? 'Awaiting score' : 'Needs practice';
    if (latest.complete && percentage !== null && (latest.earned / latest.total * 100) >= target) status = 'Mastered';
  }
  return { attempts, latest, percentage, status, mastered: status === 'Mastered' };
}

export function validateLearningRecord(r) {
  if (typeof r.materialId !== 'string' || !r.materialId ||
      typeof r.chapterId !== 'string' || !r.chapterId) throw new Error('A lesson record is incomplete.');
  if (r.kind === 'lesson_stop') {
    if (typeof r.cardId !== 'string' || !Array.isArray(r.childIds) ||
        !r.childIds.length || r.childIds.some(id => typeof id !== 'string')) {
      throw new Error('The lesson stopping point is invalid.');
    }
  } else {
    if (typeof r.childId !== 'string' || typeof r.complete !== 'boolean' ||
        typeof r.notes !== 'string') throw new Error('The chapter result is incomplete.');
    const blank = r.earned === null && r.total === null;
    if (!blank && (!Number.isFinite(r.earned) || !Number.isFinite(r.total) ||
        r.total <= 0 || r.earned < 0 || r.earned > r.total)) {
      throw new Error('Enter a score from zero up to the total number of questions.');
    }
  }
}

export function validatePack(manifest, files) {
  if (manifest?.format !== 'family-learning-pack' || manifest.version !== 1 ||
      typeof manifest.id !== 'string' || !/^[a-z0-9-]+$/.test(manifest.id) ||
      typeof manifest.title !== 'string' || !Array.isArray(manifest.chapters) ||
      !manifest.chapters.length || manifest.chapters.length > 500) {
    throw new Error('Choose a Family Learning lesson pack ZIP.');
  }
  const ids = new Set();
  let count = 0;
  for (const chapter of manifest.chapters) {
    if (typeof chapter.id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(chapter.id) || ids.has(chapter.id) || typeof chapter.title !== 'string' ||
        !Array.isArray(chapter.cards) || !chapter.cards.length) throw new Error('A chapter in this pack is invalid.');
    ids.add(chapter.id);
    for (const card of chapter.cards) {
      count++;
      if (typeof card.id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(card.id) || ids.has(card.id) || !Number.isInteger(card.page) || card.page < 1 ||
          typeof card.guide !== 'string' || typeof card.label !== 'string') throw new Error('A lesson card is invalid.');
      ids.add(card.id);
      if (card.image) {
        if (!/^cards\/[a-zA-Z0-9_-]+\.(webp|png|jpg)$/.test(card.image) || !files[card.image]) {
          throw new Error('An illustration is missing from this lesson pack.');
        }
      } else if (typeof card.text !== 'string' || !card.text.trim()) {
        throw new Error('A lesson card has no content.');
      }
    }
  }
  if (count > 5000 || manifest.original !== 'workbook.pdf' || !files['workbook.pdf']) {
    throw new Error('This lesson pack is incomplete or too large.');
  }
  return manifest;
}

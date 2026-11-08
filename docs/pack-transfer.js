const limit = 100 * 1024 * 1024;

// Drive can supply the file size from metadata even when the media response omits it.
export async function readPackResponse(response, report, sizeHint) {
  const total = Number(sizeHint) || Number(response.headers.get('content-length')) || 0;
  const tooLarge = () => new Error('This lesson pack exceeds the 100 MB limit.');
  if (total > limit) throw tooLarge();
  if (!response.body?.getReader) {
    const blob = await response.blob();
    if (blob.size > limit) throw tooLarge();
    report?.(blob.size, total);
    return blob;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  try {
    while (true) {
      const {value,done} = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > limit) { await reader.cancel(); throw tooLarge(); }
      chunks.push(value);
      report?.(received,total);
    }
    return new Blob(chunks,{type:'application/zip'});
  } finally { reader.releaseLock(); }
}

const JSZip = require('jszip');

// docx previewing decompresses the uploaded zip via mammoth/jszip. A crafted
// docx can pass the (compressed, ~10MB-capped) upload signature check yet
// inflate to gigabytes, exhausting memory when mammoth extracts it.
const MAX_DOCX_UNCOMPRESSED_BYTES = 100 * 1024 * 1024; // 100 MB
const MAX_DOCX_ZIP_ENTRIES = 5000;

// Inflate one entry, counting real output bytes, and stop as soon as the
// shared budget is exhausted. Resolves with the bytes produced by this entry.
function measureEntry(entry, remainingBudget) {
  return new Promise((resolve, reject) => {
    let produced = 0;
    let settled = false;
    const helper = entry.internalStream('uint8array');
    helper
      .on('data', (chunk) => {
        if (settled) return;
        produced += chunk.length;
        if (produced > remainingBudget) {
          settled = true;
          helper.pause();
          reject(new Error('docx_uncompressed_too_large'));
        }
      })
      .on('error', (err) => {
        if (settled) return;
        settled = true;
        reject(err);
      })
      .on('end', () => {
        if (settled) return;
        settled = true;
        resolve(produced);
      })
      .resume();
  });
}

// The size fields in a zip's central directory are attacker-controlled and
// are NOT verified until an entry has been fully inflated, so they cannot be
// trusted to bound memory. Reject on the declared figures first (cheap), then
// enforce the cap on bytes actually produced by inflation.
async function assertSafeDocxForPreview(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const entries = Object.values(zip.files).filter((entry) => !entry.dir);
  if (Object.keys(zip.files).length > MAX_DOCX_ZIP_ENTRIES) {
    throw new Error('docx_too_many_entries');
  }
  let declared = 0;
  for (const entry of entries) {
    declared += entry._data?.uncompressedSize || 0;
    if (declared > MAX_DOCX_UNCOMPRESSED_BYTES) {
      throw new Error('docx_uncompressed_too_large');
    }
  }
  let total = 0;
  for (const entry of entries) {
    total += await measureEntry(entry, MAX_DOCX_UNCOMPRESSED_BYTES - total);
  }
}

function decodeBase64Payload(contentBase64) {
  if (typeof contentBase64 !== 'string' || !contentBase64.trim()) return null;
  const normalized = contentBase64.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized) || normalized.length % 4 !== 0) {
    return null;
  }

  try {
    const buffer = Buffer.from(normalized, 'base64');
    return buffer.length > 0 ? buffer : null;
  } catch {
    return null;
  }
}

function isPdfBuffer(buffer) {
  return buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-';
}

function isDocxBuffer(buffer) {
  if (buffer.length < 4) return false;
  const signature = buffer.subarray(0, 4).toString('binary');
  if (!['PK\u0003\u0004', 'PK\u0005\u0006', 'PK\u0007\u0008'].includes(signature)) {
    return false;
  }

  return buffer.includes(Buffer.from('[Content_Types].xml'))
    && buffer.includes(Buffer.from('word/'));
}

function isLikelyPlainTextBuffer(buffer) {
  if (buffer.includes(0x00)) return false;
  let suspiciousControlBytes = 0;

  for (const byte of buffer) {
    const isWhitespace = byte === 9 || byte === 10 || byte === 13;
    const isPrintableAscii = byte >= 32 && byte <= 126;
    const isExtendedUtf8LeadOrTrail = byte >= 128;
    if (!isWhitespace && !isPrintableAscii && !isExtendedUtf8LeadOrTrail) {
      suspiciousControlBytes += 1;
    }
  }

  return suspiciousControlBytes <= Math.max(2, Math.floor(buffer.length * 0.02));
}

function inferDocumentMimeType(buffer) {
  if (isPdfBuffer(buffer)) return 'application/pdf';
  if (isDocxBuffer(buffer)) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (isLikelyPlainTextBuffer(buffer)) return 'text/plain';
  return null;
}

function inspectDocumentPayload(document, options = {}) {
  const { allowMimeInference = false } = options;
  const buffer = decodeBase64Payload(document?.contentBase64);
  if (!buffer) {
    return { valid: false, reason: 'invalid_base64' };
  }

  const declaredMimeType = document?.mimeType || null;
  const effectiveMimeType = allowMimeInference
    ? ((declaredMimeType === 'application/pdf'
      || declaredMimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      || declaredMimeType === 'text/plain')
        ? declaredMimeType
        : (declaredMimeType === null || declaredMimeType === 'application/octet-stream'
          ? inferDocumentMimeType(buffer)
          : declaredMimeType))
    : declaredMimeType;
  switch (effectiveMimeType) {
    case 'application/pdf':
      return isPdfBuffer(buffer)
        ? { valid: true, buffer, safeMimeType: 'application/pdf' }
        : { valid: false, reason: 'invalid_pdf_signature' };
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return isDocxBuffer(buffer)
        ? { valid: true, buffer, safeMimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }
        : { valid: false, reason: 'invalid_docx_signature' };
    case 'text/plain':
      return isLikelyPlainTextBuffer(buffer)
        ? { valid: true, buffer, safeMimeType: 'text/plain' }
        : { valid: false, reason: 'invalid_text_signature' };
    default:
      return { valid: false, reason: 'unsupported_mime_type' };
  }
}

module.exports = {
  inspectDocumentPayload,
  assertSafeDocxForPreview,
  MAX_DOCX_UNCOMPRESSED_BYTES
};

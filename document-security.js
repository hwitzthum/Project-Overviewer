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
  inspectDocumentPayload
};

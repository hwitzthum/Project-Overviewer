'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const JSZip = require('jszip');
const { assertSafeDocxForPreview } = require('../document-security');

async function buildZip(files) {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(files)) zip.file(name, content);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

// Overwrite the uncompressed-size field of a named entry in the central
// directory, simulating an attacker who lies about how large an entry is.
function lieAboutSize(buffer, entryName, fakeSize) {
  const out = Buffer.from(buffer);
  let i = 0;
  while ((i = out.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]), i)) !== -1) {
    const nameLen = out.readUInt16LE(i + 28);
    if (out.toString('utf8', i + 46, i + 46 + nameLen) === entryName) {
      out.writeUInt32LE(fakeSize, i + 24);
    }
    i += 4;
  }
  return out;
}

test('accepts an ordinary small docx-shaped archive', async () => {
  const buf = await buildZip({
    '[Content_Types].xml': '<Types/>',
    'word/document.xml': '<w:document>hello</w:document>',
  });
  await assertSafeDocxForPreview(buf);
});

test('rejects an archive whose declared sizes exceed the cap', async () => {
  const buf = await buildZip({ 'word/document.xml': 'A'.repeat(1024) });
  const lying = lieAboutSize(buf, 'word/document.xml', 0x7ffffff0);
  await assert.rejects(assertSafeDocxForPreview(lying), /docx_uncompressed_too_large/);
});

test('rejects a bomb whose central directory understates its real size', async () => {
  const buf = await buildZip({
    '[Content_Types].xml': '<Types/>',
    // ~110 MB deflates to ~110 KB.
    'word/document.xml': Buffer.alloc(110 * 1024 * 1024, 0x41),
  });
  const lying = lieAboutSize(buf, 'word/document.xml', 200);
  await assert.rejects(assertSafeDocxForPreview(lying), /docx_uncompressed_too_large/);
});

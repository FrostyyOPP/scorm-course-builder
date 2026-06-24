/*
 * scorm.js — SCORM 1.2 packaging primitives (no H5P, no heavy deps).
 *   slugify, listFiles, buildManifest (imsmanifest.xml), zipDir.
 */
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'course';
}

// recursively list every file under dir, as forward-slash paths relative to dir
function listFiles(dir, base = dir) {
  let out = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) out = out.concat(listFiles(full, base));
    else out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}

function xmlEscape(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildManifest(title, files) {
  const id = 'COURSE-' + slugify(title).toUpperCase();
  const fileEls = files.map((f) => `      <file href="${xmlEscape(f)}"/>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<manifest identifier="${id}" version="1.0"
  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>1.2</schemaversion>
  </metadata>
  <organizations default="ORG-1">
    <organization identifier="ORG-1">
      <title>${xmlEscape(title)}</title>
      <item identifier="ITEM-1" identifierref="RES-1" isvisible="true">
        <title>${xmlEscape(title)}</title>
        <adlcp:masteryscore>50</adlcp:masteryscore>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="RES-1" type="webcontent" adlcp:scormtype="sco" href="index.html">
${fileEls}
    </resource>
  </resources>
</manifest>
`;
}

function zipDir(srcDir, outFile) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outFile);
    const archive = archiver('zip', { zlib: { level: 1 } }); // light: media is already compressed
    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);
    archive.directory(srcDir, false);
    archive.finalize();
  });
}

module.exports = { slugify, listFiles, buildManifest, zipDir, xmlEscape };

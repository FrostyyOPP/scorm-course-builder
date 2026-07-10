/*
 * tools.js — resolve external binaries for the SELF-CONTAINED SCORM Studio folder.
 *
 * Everything ships inside `SCORM Studio/runtime/` so the folder is drag-and-drop
 * portable on Windows. Resolution order for each tool:
 *   1. explicit env override (e.g. SCORM_FFMPEG=/path/to/ffmpeg.exe)
 *   2. the vendored copy under <studio>/runtime/
 *   3. the bare command name (assume it is on PATH) — last resort
 *
 * <studio> is the SCORM Studio folder (two levels up from app/src).
 * Use this module from Node; skills/agents read the same paths from tools.json
 * (written by `node app/src/tools.js --emit`).
 */
const fs = require('fs');
const path = require('path');

const STUDIO = path.resolve(__dirname, '..', '..');           // .../SCORM Studio
const RUNTIME = path.join(STUDIO, 'runtime');

function pick(envVar, vendored, fallback) {
  const e = process.env[envVar];
  if (e && fs.existsSync(e)) return e;
  if (fs.existsSync(vendored)) return vendored;
  return fallback;                                            // bare name → rely on PATH
}

const TOOLS = {
  studio: STUDIO,
  runtime: RUNTIME,
  node:    pick('SCORM_NODE',    path.join(RUNTIME, 'node', 'node.exe'),               'node'),
  ffmpeg:  pick('SCORM_FFMPEG',  path.join(RUNTIME, 'ffmpeg', 'ffmpeg.exe'),           'ffmpeg'),
  ffprobe: pick('SCORM_FFPROBE', path.join(RUNTIME, 'ffmpeg', 'ffprobe.exe'),          'ffprobe'),
  whisper: pick('SCORM_WHISPER', path.join(RUNTIME, 'whisper', 'Release', 'whisper-cli.exe'), 'whisper-cli'),
  whisperModel: pick('SCORM_WHISPER_MODEL', path.join(RUNTIME, 'whisper', 'ggml-base.en.bin'), ''),
};

TOOLS.vendored = {
  node: fs.existsSync(path.join(RUNTIME, 'node', 'node.exe')),
  ffmpeg: fs.existsSync(path.join(RUNTIME, 'ffmpeg', 'ffmpeg.exe')),
  whisper: fs.existsSync(path.join(RUNTIME, 'whisper', 'Release', 'whisper-cli.exe')),
};

module.exports = TOOLS;

// `node src/tools.js` prints resolved paths; `--emit` also writes <studio>/tools.json
if (require.main === module) {
  console.log(JSON.stringify(TOOLS, null, 2));
  if (process.argv.includes('--emit')) {
    fs.writeFileSync(path.join(STUDIO, 'tools.json'), JSON.stringify(TOOLS, null, 2));
    console.log('\nwrote ' + path.join(STUDIO, 'tools.json'));
  }
}

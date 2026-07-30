/*
 * localize.js — COURSE-AGNOSTIC localization pipeline.
 *
 * Turns an English course (videos + outline + quiz) into a fully localized SCORM package.
 * Nothing about any specific course lives in here; everything comes from the course folder.
 *
 * INPUT CONTRACT — the only three things the client supplies:
 *   <course>/Videos_en/**.mp4        English source videos, in Module N/Lesson N folders
 *   <course>/Outline/*.docx          outline (module/lesson/video titles + per-module readings)
 *   <course>/Quizzes/*.docx          graded assessment
 *
 * CONFIG — <course>/.localize.json:
 *   { "lang": "fr", "langLabel": "Français", "voiceId": "<elevenlabs voice>",
 *     "ttsSpeed": 1.2, "concurrency": {...} }
 * CREDENTIAL — <course>/.eleven-key (never committed)
 *
 * STAGES:  transcribe -> tts -> menuvo -> dub -> caption -> compress -> package
 *   `translate` is deliberately NOT a stage: it needs a language model, not a script.
 *   The pipeline HARD-STOPS before tts if narration-<lang>/ is not fully populated.
 *
 * Usage:
 *   node app/localize.js <courseDir> [--from <stage>] [--only <stage>] [--check]
 * Every stage is resumable; existing outputs are skipped.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const { execFile, execFileSync } = require('child_process');

const ROOT = path.resolve(process.argv[2] || '.');
const STUDIO = path.resolve(__dirname, '..');
const cfgPath = path.join(ROOT, '.localize.json');
if (!fs.existsSync(cfgPath)) { console.error('missing ' + cfgPath); process.exit(1); }
const CFG = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
const LANG = CFG.lang || 'fr';
const TTS_SPEED = CFG.ttsSpeed != null ? CFG.ttsSpeed : 1.2;   // see HARD RULE L4
const CORES = os.cpus().length;
const C = Object.assign({
  transcribe: Math.min(10, Math.max(2, CORES - 4)),
  tts: 6,                                   // ElevenLabs rate limit, not CPU
  dub: 6,
  caption: Math.min(10, Math.max(2, CORES - 4)),
  compress: 8,
}, CFG.concurrency || {});

const tool = (...p) => path.join(STUDIO, 'runtime', ...p);
const FFMPEG = fs.existsSync(tool('ffmpeg', 'ffmpeg.exe')) ? tool('ffmpeg', 'ffmpeg.exe') : 'ffmpeg';
const FFPROBE = fs.existsSync(tool('ffmpeg', 'ffprobe.exe')) ? tool('ffmpeg', 'ffprobe.exe') : 'ffprobe';
const WHISPER = tool('whisper', 'Release', 'whisper-cli.exe');
const WMODEL = tool('whisper', 'ggml-small.bin');            // multilingual, required for non-EN
const WVAD = tool('whisper', 'ggml-silero-v5.1.2.bin');
const NODE = tool('node', 'node.exe');
const BUILDV2 = path.join(STUDIO, 'app', 'build-v2.js');

// `sourceVideos` lets the localized course read the English masters in place (absolute path,
// or relative to the course folder) instead of duplicating a multi-GB video tree per language.
const DIR = {
  src: CFG.sourceVideos ? path.resolve(ROOT, CFG.sourceVideos) : path.join(ROOT, 'Videos_en'),
  dub: path.join(ROOT, 'Videos'),
  min: path.join(ROOT, 'Videos_min'),
  narr: path.join(ROOT, `narration-${LANG}`),
  audio: path.join(ROOT, `audio-${LANG}`, 'video'),
  chunks: path.join(ROOT, `audio-${LANG}`, 'chunks'),
  vo: path.join(ROOT, 'Voiceovers'),
  parts: path.join(ROOT, 'Voiceovers', '.parts'),
  cap: path.join(ROOT, 'captions'),
  wavEn: path.join(ROOT, '_wav-en'),
  wavTl: path.join(ROOT, `_wav-${LANG}`),
  src_: path.join(ROOT, '_src'),
};

const t0 = Date.now();
const LOG = path.join(ROOT, 'logs', 'localize.log');
fs.mkdirSync(path.dirname(LOG), { recursive: true });
function log(m) {
  const line = `[${((Date.now() - t0) / 60000).toFixed(1).padStart(5)}m] ${m}`;
  fs.appendFileSync(LOG, line + '\n'); console.log(line);
}
function run(c, a) { return new Promise((res, rej) => execFile(c, a, { maxBuffer: 1 << 26 }, (e, so, se) => e ? rej(new Error((se || e.message).slice(0, 250))) : res(so))); }
const dur = f => parseFloat(execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim());
function walk(d, ext = '.mp4') { let o = []; if (!fs.existsSync(d)) return o; for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) o = o.concat(walk(p, ext)); else if (e.name.endsWith(ext)) o.push(p); } return o; }
async function pool(items, n, fn) {
  let i = 0; const failed = [];
  await Promise.all(Array.from({ length: Math.max(1, Math.min(n, items.length)) }, async () => {
    while (i < items.length) { const k = i++; try { await fn(items[k]); } catch (e) { failed.push({ item: items[k], err: e.message }); } }
  }));
  return failed;
}

// ------------------------------------------------------------------ TTS core
function ttsOnce(text, out, key, voice) {
  const body = JSON.stringify({ text, model_id: 'eleven_multilingual_v2',
    voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0, use_speaker_boost: true, speed: TTS_SPEED } });
  const opts = { method: 'POST', hostname: 'api.elevenlabs.io',
    path: `/v1/text-to-speech/${voice}?output_format=mp3_44100_128`,
    headers: { 'xi-api-key': key, 'content-type': 'application/json', accept: 'audio/mpeg', 'content-length': Buffer.byteLength(body) } };
  return new Promise((res, rej) => {
    const r = https.request(opts, (rs) => {
      if (rs.statusCode !== 200) { let e = ''; rs.on('data', d => e += d); rs.on('end', () => rej({ status: rs.statusCode, body: e.slice(0, 200) })); return; }
      const ws = fs.createWriteStream(out); rs.pipe(ws); ws.on('finish', () => ws.close(res)); ws.on('error', rej);
    });
    r.on('error', rej); r.write(body); r.end();
  });
}
async function ttsRetry(text, out, tag, key, voice) {
  for (let a = 1; a <= 6; a++) {
    try { await ttsOnce(text, out, key, voice); return; }
    catch (e) { const s = e.status || 'ERR'; log(`  ! ${tag} attempt ${a} (${s})`);
      if (a === 6) throw e; await new Promise(r => setTimeout(r, (s === 429 ? 8000 : 3000) * a)); }
  }
}
function concatMp3(parts, out) {
  if (parts.length === 1) { fs.copyFileSync(parts[0], out); return; }
  const lf = out + '.txt';
  fs.writeFileSync(lf, parts.map(p => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'));
  execFileSync(FFMPEG, ['-y', '-f', 'concat', '-safe', '0', '-i', lf, '-c', 'copy', out], { stdio: 'ignore' });
  fs.unlinkSync(lf);
}
// HARD RULE L0b: the voice id is a per-course input supplied by the client. It is never
// defaulted, never inherited from a sibling course, and never chosen from the catalogue.
// Fail fast rather than generate hours of narration in the wrong voice.
function creds() {
  const kp = path.join(ROOT, '.eleven-key');
  if (!fs.existsSync(kp)) throw new Error('missing .eleven-key in course folder');
  const vf = path.join(ROOT, '.eleven-voice');
  const voice = (CFG.voiceId || (fs.existsSync(vf) ? fs.readFileSync(vf, 'utf-8').trim() : '')).trim();
  if (!voice) {
    throw new Error('no ElevenLabs voice id for this course. The client supplies one PER COURSE - '
      + 'do not reuse another course\'s voice and do not pick one. Set "voiceId" in .localize.json '
      + '(or write .eleven-voice) once they provide it, then re-run.');
  }
  if (/^(TODO|TBD|CHANGEME|<.*>)$/i.test(voice)) {
    throw new Error(`voiceId is still a placeholder ("${voice}") - wait for the real id.`);
  }
  return { key: fs.readFileSync(kp, 'utf-8').trim(), voice };
}
function vttTime(s) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${sec.toFixed(3).padStart(6, '0')}`;
}
// deterministic VTT from known script text (HARD RULE L6)
function authorVtt(text, total, outBase) {
  const sents = (text.match(/[^.!?]+[.!?]+\s*|[^.!?]+$/g) || [text]).map(x => x.trim()).filter(Boolean);
  const chars = sents.reduce((a, s) => a + s.length, 0) || 1;
  let t = 0; const cues = [];
  sents.forEach((s, i) => { const span = i === sents.length - 1 ? total - t : (s.length / chars) * total;
    cues.push({ s: t, e: Math.min(total, t + span), txt: s }); t += span; });
  const vtt = 'WEBVTT\n\n' + cues.map((c, i) => `${i + 1}\n${vttTime(c.s)} --> ${vttTime(c.e)}\n${c.txt}\n`).join('\n');
  for (const code of [LANG, 'en']) fs.writeFileSync(`${outBase}.${code}.vtt`, vtt);
  return cues.length;
}

// ------------------------------------------------------------------ stages
async function stageTranscribe() {
  fs.mkdirSync(DIR.cap, { recursive: true }); fs.mkdirSync(DIR.wavEn, { recursive: true });
  const vids = walk(DIR.src);
  if (!vids.length) throw new Error(`no videos under ${DIR.src}`);
  const todo = vids.filter(v => !fs.existsSync(path.join(DIR.cap, path.basename(v, '.mp4') + '.en.vtt')));
  if (!todo.length) return log(`transcribe: all ${vids.length} done`);
  log(`transcribe: ${todo.length}/${vids.length} @ ${C.transcribe}-way`);
  const failed = await pool(todo, C.transcribe, async (v) => {
    const b = path.basename(v, '.mp4');
    const w = path.join(DIR.wavEn, b.replace(/[^\w\-]+/g, '_') + '.wav');
    if (!fs.existsSync(w)) await run(FFMPEG, ['-y', '-i', v, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', w]);
    await run(WHISPER, ['-m', WMODEL, '-l', 'en', '-f', w, '-ml', '40', '-sow', '-ovtt', '-otxt',
      '--vad', '--vad-model', WVAD, '-t', '4', '-of', path.join(DIR.cap, b + '.en')]);
  });
  log(`transcribe: done, ${failed.length} failed`);
}

// GATE: translation is a language-model task, not a scriptable one.
function gateTranslation() {
  const vids = walk(DIR.src).map(v => path.basename(v, '.mp4'));
  const missing = vids.filter(b => !fs.existsSync(path.join(DIR.narr, `${b}.${LANG}.txt`)));
  if (missing.length) {
    log(`TRANSLATION GATE: ${missing.length}/${vids.length} narration files missing under ${path.basename(DIR.narr)}/`);
    missing.slice(0, 8).forEach(m => log(`   - ${m}.${LANG}.txt`));
    if (missing.length > 8) log(`   ... and ${missing.length - 8} more`);
    throw new Error('translate the transcripts first (see skills/localize/SKILL.md), then re-run');
  }
  log(`translation gate: all ${vids.length} narration files present`);
}

async function stageTts() {
  gateTranslation();
  const { key, voice } = creds();
  fs.mkdirSync(DIR.audio, { recursive: true }); fs.mkdirSync(DIR.chunks, { recursive: true });
  const items = fs.readdirSync(DIR.narr).filter(f => f.endsWith(`.${LANG}.txt`)).map(f => ({
    id: f.replace(new RegExp(`\\.${LANG}\\.txt$`), ''),
    text: fs.readFileSync(path.join(DIR.narr, f), 'utf-8').trim(),
  }));
  const todo = items.filter(i => { const o = path.join(DIR.audio, i.id + '.mp3'); return !(fs.existsSync(o) && fs.statSync(o).size > 2000); });
  if (!todo.length) return log(`tts: all ${items.length} done`);
  log(`tts: ${todo.length}/${items.length} @ ${C.tts}-way, speed ${TTS_SPEED}`);
  const failed = await pool(todo, C.tts, async (it) => {
    const out = path.join(DIR.audio, it.id + '.mp3');
    const MAX = 9000; const parts = [];
    const chunks = it.text.length <= MAX ? [it.text]
      : (it.text.match(/[^.!?:]+[.!?:]+\s*|[^.!?:]+$/g) || [it.text]).reduce((acc, s) => {
          if (!acc.length || (acc[acc.length - 1] + s).length > MAX) acc.push(s); else acc[acc.length - 1] += s;
          return acc; }, []);
    for (let i = 0; i < chunks.length; i++) {
      const cp = path.join(DIR.chunks, `${it.id.replace(/[^\w\-]+/g, '_')}__${i}.mp3`);
      await ttsRetry(chunks[i], cp, `${it.id}#${i}`, key, voice); parts.push(cp);
    }
    concatMp3(parts, out);
  });
  log(`tts: done, ${failed.length} failed`);
}

// Menu/index slide narration: separate clips + concat, cues from real durations (HARD RULE L5)
async function stageMenuVo() {
  const scriptPath = path.join(DIR.src_, `menu-vo-${LANG}.json`);
  if (!fs.existsSync(scriptPath)) return log(`menuvo: no ${path.basename(scriptPath)}, skipping`);
  const { key, voice } = creds();
  const menu = JSON.parse(fs.readFileSync(scriptPath, 'utf-8'));
  const tpl = CFG.menuTemplates;
  if (!tpl) return log('menuvo: no menuTemplates in .localize.json, skipping cued build');
  fs.mkdirSync(DIR.parts, { recursive: true });
  const isCued = k => k === 'home' || /^m\d+$/.test(k) || /^m\d+l\d+$/.test(k);
  const levelOf = k => k === 'home' ? 'course' : /^m\d+$/.test(k) ? 'module' : 'lesson';
  const cuesPath = path.join(DIR.vo, 'cues.json');
  const cues = fs.existsSync(cuesPath) ? JSON.parse(fs.readFileSync(cuesPath, 'utf-8')) : {};
  const cache = new Map(); let n = 0;
  const clip = async (text, tag) => {
    if (cache.has(text)) return cache.get(text);
    const f = path.join(DIR.parts, `part${++n}.mp3`);
    if (!fs.existsSync(f) || fs.statSync(f).size < 500) await ttsRetry(text, f, tag, key, voice);
    const info = { file: f, duration: dur(f) }; cache.set(text, info); return info;
  };
  // simple (non-cued) clips first
  const simple = Object.keys(menu).filter(k => !isCued(k));
  for (const k of simple) {
    const out = path.join(DIR.vo, k + '.mp3');
    if (fs.existsSync(out) && fs.statSync(out).size > 2000) continue;
    fs.mkdirSync(DIR.vo, { recursive: true });
    await ttsRetry(menu[k], out, 'vo/' + k, key, voice);
    log(`+ vo/${k}`);
  }
  // cued index slides
  for (const k of Object.keys(menu).filter(isCued)) {
    const out = path.join(DIR.vo, k + '.mp3');
    if (fs.existsSync(out) && fs.statSync(out).size > 2000 && cues[k]) continue;
    const intro = tpl.intro[levelOf(k)], outro = tpl.outro, ords = tpl.ordinals;
    let b = menu[k].trim();
    if (!b.startsWith(intro) || !b.endsWith(outro)) { log(`! ${k}: script does not match menuTemplates, skipping`); continue; }
    b = b.slice(intro.length, b.length - outro.length).trim();
    const pos = ords.map(o => b.indexOf(o + ',')).filter(i => i !== -1).sort((a, c) => a - c);
    const items = pos.map((s, i) => b.slice(s, i + 1 < pos.length ? pos[i + 1] : b.length).trim());
    const ic = await clip(intro, `${k}:intro`);
    const items_ = []; for (let i = 0; i < items.length; i++) items_.push(await clip(items[i], `${k}:i${i + 1}`));
    const oc = await clip(outro, `${k}:outro`);
    concatMp3([ic.file, ...items_.map(x => x.file), oc.file], out);
    let t = ic.duration; const kc = [];
    for (const c of items_) { kc.push(Math.round(t * 100) / 100); t += c.duration; }
    cues[k] = kc; fs.writeFileSync(cuesPath, JSON.stringify(cues, null, 2));
    log(`+ vo/${k}: ${items.length} items, cues=${JSON.stringify(kc)}`);
  }
  log('menuvo: done');
}

async function stageDub() {
  const CLAMP_LO = 0.9, CLAMP_HI = CFG.tempoClampHi || 1.32, TOL = 0.06;
  const vids = walk(DIR.src);
  log(`dub: ${vids.length} videos @ ${C.dub}-way`);
  const over = [];
  const failed = await pool(vids, C.dub, async (src) => {
    const rel = path.relative(DIR.src, src), b = path.basename(src, '.mp4');
    const audio = path.join(DIR.audio, b + '.mp3'), out = path.join(DIR.dub, rel);
    if (!fs.existsSync(audio)) throw new Error('no dubbed audio');
    if (fs.existsSync(out) && fs.statSync(out).size > 100000) return;
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const V = dur(src), A = dur(audio), ratio = A / V;
    let filter = null, tempo = 1;
    if (Math.abs(ratio - 1) > TOL) { tempo = Math.min(CLAMP_HI, Math.max(CLAMP_LO, ratio)); filter = `atempo=${tempo.toFixed(4)}`; }
    if (ratio > CLAMP_HI) over.push({ b, ratio, cut: (A / tempo) - V });
    await run(FFMPEG, ['-y', '-i', src, '-i', audio, '-filter_complex', `[1:a]${filter ? filter + ',' : ''}apad[a]`,
      '-map', '0:v:0', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
      '-t', V.toFixed(3), '-shortest', out]);
  });
  log(`dub: done, ${failed.length} failed`);
  // HARD RULE L4: truncation is a build failure, not a warning to skim past.
  if (over.length) {
    log(`dub: FAIL - ${over.length} clip(s) exceed the ${CLAMP_HI} tempo clamp; narration WILL be cut:`);
    over.forEach(o => log(`   ! ${o.b} ratio ${o.ratio.toFixed(3)} cuts ~${o.cut.toFixed(1)}s`));
    throw new Error(`${over.length} clip(s) would lose narration. Raise ttsSpeed (max 1.2) and/or tempoClampHi, delete audio-${LANG}/video + Videos, and re-run from tts.`);
  }
  log('dub: no truncation - every clip fits its picture');
}

async function stageCaption() {
  fs.mkdirSync(DIR.wavTl, { recursive: true });
  // 1. authored VO clips get deterministic captions (HARD RULE L6)
  const scriptPath = path.join(DIR.src_, `menu-vo-${LANG}.json`);
  if (fs.existsSync(scriptPath)) {
    const menu = JSON.parse(fs.readFileSync(scriptPath, 'utf-8'));
    const isCued = k => k === 'home' || /^m\d+$/.test(k) || /^m\d+l\d+$/.test(k);
    let a = 0;
    for (const k of Object.keys(menu)) {
      const mp3 = path.join(DIR.vo, k + '.mp3');
      if (!fs.existsSync(mp3)) continue;
      if (isCued(k)) continue;                      // cued ones are handled by their own cue map
      authorVtt(menu[k], dur(mp3), path.join(DIR.cap, `vo-${k}`)); a++;
    }
    log(`caption: authored ${a} VO caption pair(s) from script text (not transcribed)`);
  }
  // 2. dubbed videos get transcribed in the target language
  const items = walk(DIR.dub).map(v => ({ id: path.basename(v, '.mp4'), src: v, out: path.join(DIR.cap, path.basename(v, '.mp4') + '.' + LANG) }));
  const todo = items.filter(i => !fs.existsSync(i.out + '.vtt'));
  if (!todo.length) return log(`caption: all ${items.length} video captions done`);
  log(`caption: ${todo.length}/${items.length} videos @ ${C.caption}-way`);
  const failed = await pool(todo, C.caption, async (it) => {
    const w = path.join(DIR.wavTl, it.id.replace(/[^\w\-]+/g, '_') + '.wav');
    if (!fs.existsSync(w)) await run(FFMPEG, ['-y', '-i', it.src, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', w]);
    await run(WHISPER, ['-m', WMODEL, '-l', LANG, '-f', w, '-ml', '40', '-sow', '-ovtt',
      '--vad', '--vad-model', WVAD, '-t', '4', '-of', it.out]);
  });
  log(`caption: done, ${failed.length} failed`);
}

async function stageCompress() {
  const vids = walk(DIR.dub);
  const todo = vids.filter(v => { const o = path.join(DIR.min, path.relative(DIR.dub, v)); return !(fs.existsSync(o) && fs.statSync(o).size > 10000); });
  if (!todo.length) return log(`compress: all ${vids.length} done`);
  log(`compress: ${todo.length}/${vids.length} @ ${C.compress}-way`);
  const failed = await pool(todo, C.compress, async (v) => {
    const o = path.join(DIR.min, path.relative(DIR.dub, v));
    fs.mkdirSync(path.dirname(o), { recursive: true });
    await run(FFMPEG, ['-y', '-nostdin', '-i', v, '-vf', 'scale=-2:720', '-c:v', 'libx264', '-crf', '28',
      '-preset', 'veryfast', '-c:a', 'aac', '-b:a', '96k', o]);
  });
  log(`compress: done, ${failed.length} failed`);
}

async function stagePackage() {
  // HARD RULE L7: assert the model points at the LOCALIZED compressed tree before packaging.
  const mp = path.join(ROOT, '.pipeline', 'course.model.json');
  if (!fs.existsSync(mp)) throw new Error('no .pipeline/course.model.json - build the model first');
  const model = JSON.parse(fs.readFileSync(mp, 'utf-8'));
  if (model.videosDir !== 'Videos_min') {
    throw new Error(`model.videosDir is "${model.videosDir}" - it must be "Videos_min" (the localized compressed tree), otherwise the zip ships the ENGLISH videos. Rebuild the model pointing at Videos_min.`);
  }
  log('package: videosDir check passed (Videos_min)');
  await run(NODE, [BUILDV2, ROOT, '--emit']);
  const out = await run(NODE, [BUILDV2, ROOT]);
  log(String(out).trim().split('\n').filter(Boolean).join(' | '));
  // verify the produced zip
  const zip = fs.readdirSync(ROOT).filter(f => f.endsWith('.zip')).map(f => path.join(ROOT, f))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
  if (!zip) throw new Error('no zip produced');
  const list = execFileSync('unzip', ['-l', zip]).toString();
  const count = re => (list.match(re) || []).length;
  log(`package: ${(fs.statSync(zip).size / 1e6).toFixed(0)}MB | manifest=${count(/imsmanifest/g)} mp4=${count(/\.mp4/g)} vtt=${count(/\.vtt/g)} vo=${count(/vo-[^\s]*\.mp3/g)}`);
  if (!count(/imsmanifest/g)) throw new Error('zip has no imsmanifest.xml');
}

const STAGES = { transcribe: stageTranscribe, tts: stageTts, menuvo: stageMenuVo, dub: stageDub, caption: stageCaption, compress: stageCompress, package: stagePackage };

(async () => {
  const args = process.argv.slice(3);
  if (args.includes('--check')) { gateTranslation(); return; }
  const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
  const from = args.includes('--from') ? args[args.indexOf('--from') + 1] : null;
  let names = Object.keys(STAGES);
  if (only) names = [only]; else if (from) names = names.slice(names.indexOf(from));
  log(`LOCALIZE ${path.basename(ROOT)} -> ${LANG} | cores=${CORES} | ${names.join(' -> ')}`);
  for (const n of names) { log(`--- ${n} ---`); await STAGES[n](); }
  log(`DONE in ${((Date.now() - t0) / 60000).toFixed(1)} min`);
})().catch(e => { log('FATAL ' + e.message); process.exit(1); });

/*
 * make-captions.js — generate WebVTT captions for a course's videos (WCAG 1.2.2).
 * For each video it extracts 16 kHz mono audio with ffmpeg and transcribes it with
 * whisper.cpp, writing <courseFolder>/captions/<videoname>.vtt — which the builder
 * then attaches to each video automatically.
 *
 * Requirements (one-time):
 *   brew install ffmpeg whisper-cpp
 *   download a model, e.g. ggml-small.en.bin, into ./models/
 *     curl -L -o models/ggml-small.en.bin \
 *       https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin
 *
 * Usage: node src/make-captions.js <course-folder> [--model <path>] [--force]
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

function findVideoFolder(courseDir) {
  const dirs = fs.readdirSync(courseDir).map((d) => path.join(courseDir, d))
    .filter((d) => { try { return fs.statSync(d).isDirectory(); } catch (e) { return false; } });
  return dirs.find((d) => fs.readdirSync(d).some((f) => /\.(mp4|webm|m4v|mov)$/i.test(f)));
}

function have(cmd) { try { execFileSync('which', [cmd], { stdio: 'ignore' }); return true; } catch (e) { return false; } }

async function makeCaptions(courseDir, opts = {}) {
  if (!have('ffmpeg')) throw new Error('ffmpeg not found. Install: brew install ffmpeg');
  if (!have('whisper-cli')) throw new Error('whisper-cli not found. Install: brew install whisper-cpp');
  const model = opts.model || path.join(ROOT, 'models', 'ggml-small.en.bin');
  if (!fs.existsSync(model)) throw new Error('Model not found: ' + model + '\nDownload one, e.g.:\n  curl -L -o models/ggml-small.en.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin');

  const videoDir = findVideoFolder(courseDir);
  if (!videoDir) throw new Error('No video folder found under ' + courseDir);
  const captionsDir = path.join(courseDir, 'captions');
  fs.mkdirSync(captionsDir, { recursive: true });

  const videos = fs.readdirSync(videoDir).filter((f) => /\.(mp4|webm|m4v|mov)$/i.test(f)).sort();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-'));
  const made = []; const skipped = [];
  try {
    for (let i = 0; i < videos.length; i++) {
      const v = videos[i];
      const base = v.replace(/\.[^.]+$/, '');
      const outVtt = path.join(captionsDir, base + '.vtt');
      if (fs.existsSync(outVtt) && !opts.force) { skipped.push(v); console.log(`[${i + 1}/${videos.length}] ⏭  ${v} (exists)`); continue; }

      const wav = path.join(tmp, base + '.wav');
      process.stdout.write(`[${i + 1}/${videos.length}] 🎧 ${v} … `);
      execFileSync('ffmpeg', ['-y', '-i', path.join(videoDir, v), '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wav], { stdio: 'ignore' });
      execFileSync('whisper-cli', ['-m', model, '-f', wav, '-ovtt', '-of', path.join(captionsDir, base), '-l', 'en', '--threads', String(opts.threads || 8)], { stdio: 'ignore' });
      fs.rmSync(wav, { force: true });
      console.log('✓ ' + path.basename(outVtt));
      made.push(v);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  return { captionsDir, made, skipped, total: videos.length };
}

module.exports = { makeCaptions };

if (require.main === module) {
  const args = process.argv.slice(2);
  const dir = path.resolve(args.find((a) => !a.startsWith('--')) || '.');
  const get = (f) => { const k = args.indexOf(f); return k >= 0 ? args[k + 1] : undefined; };
  makeCaptions(dir, { model: get('--model'), force: args.includes('--force'), threads: get('--threads') })
    .then((r) => console.log(`\n✅ Captions in: ${r.captionsDir}\n   ${r.made.length} created, ${r.skipped.length} skipped, ${r.total} videos total.\n   Re-run the build to embed them.\n`))
    .catch((e) => { console.error('\n❌ ' + e.message + '\n'); process.exit(1); });
}

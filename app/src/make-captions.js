/*
 * make-captions.js — generate WebVTT captions for a course's videos (WCAG 1.2.2).
 * For each video it extracts 16 kHz mono audio with ffmpeg and transcribes it with
 * whisper.cpp, writing <courseFolder>/captions/<videoname>.vtt — which the builder
 * then attaches to each video automatically.
 *
 * Requirements (one-time):
 *   macOS/Linux:  brew install ffmpeg whisper-cpp
 *   Windows:      winget install Gyan.FFmpeg   (or: choco install ffmpeg)
 *                 build whisper.cpp and put whisper-cli.exe on your PATH (see README)
 *   download a model, e.g. ggml-small.en.bin, into ./models/  (use curl.exe on Windows —
 *   PowerShell's `curl` is an alias for Invoke-WebRequest and takes different flags):
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
const IS_WIN = process.platform === 'win32';

function findVideoFolder(courseDir) {
  const dirs = fs.readdirSync(courseDir).map((d) => path.join(courseDir, d))
    .filter((d) => { try { return fs.statSync(d).isDirectory(); } catch (e) { return false; } });
  return dirs.find((d) => fs.readdirSync(d).some((f) => /\.(mp4|webm|m4v|mov)$/i.test(f)));
}

// Cross-platform "is this command on PATH?": `where` on Windows, `which` elsewhere.
function have(cmd) {
  const probe = IS_WIN ? 'where' : 'which';
  try { execFileSync(probe, [cmd], { stdio: 'ignore' }); return true; } catch (e) { return false; }
}

async function makeCaptions(courseDir, opts = {}) {
  const ffmpegHint = IS_WIN ? 'winget install Gyan.FFmpeg  (or: choco install ffmpeg)' : 'brew install ffmpeg';
  const whisperHint = IS_WIN ? 'build whisper.cpp and put whisper-cli.exe on your PATH (see README)' : 'brew install whisper-cpp';
  if (!have('ffmpeg')) throw new Error('ffmpeg not found. Install: ' + ffmpegHint);
  if (!have('whisper-cli')) throw new Error('whisper-cli not found. Install: ' + whisperHint);
  const model = opts.model || path.join(ROOT, 'models', 'ggml-small.en.bin');
  if (!fs.existsSync(model)) {
    const dl = IS_WIN
      ? 'curl.exe -L -o models\\ggml-small.en.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin'
      : 'curl -L -o models/ggml-small.en.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin';
    throw new Error('Model not found: ' + model + '\nDownload one, e.g.:\n  ' + dl);
  }

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

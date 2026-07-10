/* Live preview of the assembled v2 course — streams videos/images from source
 * (no multi-GB copy). Serves the real shell-v2 engine + assembled COURSE. */
const fs=require('fs'), path=require('path'), http=require('http'), os=require('os');
const { assemble, indexHtml } = require('./build-v2');
const SHELL=path.join(__dirname,'src','shell-v2');
const COURSE_DIR=process.env.COURSE_DIR||path.join(__dirname,'example-project');
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.mp4':'video/mp4','.vtt':'text/vtt; charset=utf-8','.png':'image/png','.json':'application/json'};
function stream(file,req,res){ let st; try{st=fs.statSync(file);}catch(e){res.writeHead(404);return res.end('nf');} if(!st.isFile()){res.writeHead(404);return res.end('nf');}
  const type=MIME[path.extname(file).toLowerCase()]||'application/octet-stream'; const r=req.headers.range;
  if(r){ const m=/bytes=(\d*)-(\d*)/.exec(r)||[]; const s=m[1]?+m[1]:0; const e=m[2]?+m[2]:st.size-1;
    res.writeHead(206,{'Content-Type':type,'Content-Range':`bytes ${s}-${e}/${st.size}`,'Accept-Ranges':'bytes','Content-Length':e-s+1,'Cache-Control':'no-store'}); fs.createReadStream(file,{start:s,end:e}).pipe(res); }
  else { res.writeHead(200,{'Content-Type':type,'Content-Length':st.size,'Accept-Ranges':'bytes','Cache-Control':'no-store'}); fs.createReadStream(file).pipe(res); } }
(async()=>{
  const a=await assemble(COURSE_DIR);
  const map={}; a.assets.forEach(x=>{ map['/assets/'+path.basename(x.dest)]=x.src; });
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'v2course-'));
  fs.mkdirSync(path.join(tmp,'vendor'),{recursive:true});
  for(const f of ['styles.css','player.js']) fs.copyFileSync(path.join(SHELL,f),path.join(tmp,f));
  for(const f of fs.readdirSync(path.join(SHELL,'vendor'))) fs.copyFileSync(path.join(SHELL,'vendor',f),path.join(tmp,'vendor',f));
  fs.copyFileSync(path.join(__dirname,'src','shell','scorm-api.js'),path.join(tmp,'scorm-api.js'));
  fs.writeFileSync(path.join(tmp,'index.html'), indexHtml(a.title, JSON.stringify({title:a.title,passPercentage:70,slides:a.slides})));
  http.createServer((req,res)=>{ let u=decodeURIComponent((req.url||'/').split('?')[0]); if(u==='/')u='/index.html';
    if(map[u]) return stream(map[u],req,res);
    const safe=path.normalize(u).replace(/^(\.\.[/\\])+/,''); const f=path.join(tmp,safe);
    if(!f.startsWith(tmp)){res.writeHead(403);return res.end();} stream(f,req,res); })
  .listen(8099,()=>console.log('v2 course preview on http://localhost:8099 — '+a.slides.length+' slides, '+a.assets.length+' assets'));
})().catch(e=>{console.error(e.stack);process.exit(1);});

/* =====================================================================
   Starweaver Course Engine v2 — slide player
   - 16:9 stage scaled to viewport
   - slide types: home, moduleIndex, lessonIndex, video, quizIntro, question, result, exit
   - GSAP entrance timelines (auto-play on entry + replay)
   - one media controller (play/pause, seek, replay, volume, captions, speed, fullscreen)
     bound to the active media of the slide (<video> or slide-VO <audio>)
   - per-module quiz counter (1 of N), aggregate SCORM scoring, exit button
   ===================================================================== */
(function () {
  "use strict";
  var C = window.COURSE || { slides: [] };
  var S = C.slides || [];
  // ---- bilingual/localizable UI chrome: defaults here are overridden per-course via model.ui
  // (see build-v2.js UI_DEFAULTS) and delivered as window.COURSE.ui. t(key, fallback, vars)
  // looks up UI[key] (falling back to `fallback`) and substitutes {placeholders} from `vars`.
  var UI = C.ui || {};
  function t(key, fallback, vars) {
    var s = (UI[key] != null) ? UI[key] : fallback;
    if (vars) s = String(s).replace(/\{(\w+)\}/g, function (_, k) { return (vars[k] != null ? vars[k] : ""); });
    return s;
  }
  var i = 0;
  var answered = {};          // global question slide index -> {chosen, correct}
  var activity = {};          // dragdrop slideId -> {score, max, done} (graded activities feed the LMS score)
  var visited = {};
  var completed = {};         // slideId -> true (video watched / activity done / reading opened)
  var hist = [];              // visited-index stack for the Back button
  var voReset = null;         // current menu slide's "re-hide cards" fn, so manual play re-runs the reveal animation with the voice
  var gsapOK = !!window.gsap;

  // ---------- hierarchy (hub-and-spoke navigation) ----------
  var byId = {}; S.forEach(function (s) { byId[s.id] = s; });
  var parentMap = {};
  S.forEach(function (s) { ["modules", "lessons", "videos", "screens"].forEach(function (k) { (s[k] || []).forEach(function (c) { if (c && c.target) parentMap[c.target] = s.id; }); }); });
  (function () { var curMod = null; S.forEach(function (s) {
    if (s.type === "moduleIndex") curMod = s.id;
    if (!(s.id in parentMap)) {
      if (s.type === "title" || s.type === "home" || s.type === "exit") parentMap[s.id] = null;
      else if (s.id === "intro" || s.id === "outro") parentMap[s.id] = "home";
      else parentMap[s.id] = curMod || "home";
    }
  }); })();
  // a leaf is "needs completion" (video / question); an index auto-completes when its children do
  function isComplete(id) {
    if (completed[id]) return true;
    var s = byId[id]; if (!s) return false;
    if (s.type === "lessonIndex") return (s.videos || []).length > 0 && (s.videos || []).every(function (v) { return isComplete(v.target); });
    if (s.type === "quizIntro") { var rid = S.filter(function (x) { return x.type === "result" && parentMap[x.id] === parentMap[s.id]; }).map(function (x) { return x.id; })[0]; return rid ? !!completed[rid] : false; }
    if (s.type === "moduleIndex") {
      // a module is complete only when ALL its lessons (videos) or screens, readings and quiz questions are done.
      // (standalone intro/outro videos aren't menu-reachable, so they aren't required for completion.)
      var lessonsOk = (s.lessons || []).every(function (l) { return isComplete(l.target); });
      var screensOk = (s.screens || []).every(function (c) { return isComplete(c.target); });
      var direct = S.filter(function (x) { return parentMap[x.id] === s.id && (x.type === "reading" || x.type === "question"); });
      var directOk = direct.every(function (x) { return completed[x.id]; });
      var anyContent = (s.lessons || []).length > 0 || (s.screens || []).length > 0 || direct.length > 0;
      return anyContent && lessonsOk && screensOk && directOk;
    }
    return false;
  }

  // ---------- dom ----------
  var stage = document.getElementById("stage");
  var slideHost = document.getElementById("slide-host");
  var bar = document.getElementById("topbar-fill");
  var cb = document.getElementById("controlbar");
  var navBack = document.getElementById("nav-back");
  var navNext = document.getElementById("nav-next");
  var ccOverlay = document.getElementById("cc-overlay");
  var live = document.getElementById("live");

  function esc(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
  function el(html){var d=document.createElement("div");d.innerHTML=html.trim();return d.firstElementChild;}
  function announce(m){ if(live){live.textContent="";setTimeout(function(){live.textContent=m;},30);} }
  function fmt(t){t=Math.max(0,t||0);var m=Math.floor(t/60),s=Math.floor(t%60);return m+":"+(s<10?"0":"")+s;}

  // ---------- icons ----------
  var IC = {
    play:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
    pause:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>',
    replay:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>',
    volume:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 9v6h4l5 5V4L8 9H4z"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12"/></svg>',
    mute:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 9v6h4l5 5V4L8 9H4z"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M22 9l-6 6M16 9l6 6"/></svg>',
    cc:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 10.5a2.5 2.5 0 1 0 0 3M17 10.5a2.5 2.5 0 1 0 0 3" stroke-linecap="round"/></svg>',
    full:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
    back:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>',
    next:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
    chev:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
    exit:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>',
    ext:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/></svg>'
  };
  // flat + glassmorphism gradient-mesh background
  function deco(){
    return '<div class="bg" aria-hidden="true"><span class="blob b1"></span><span class="blob b2"></span><span class="blob b3"></span></div>';
  }
  function imgBlock(src,cls,alt){
    var inner = src ? '<img src="'+esc(src)+'" alt="'+esc(alt||"")+'">' : '';
    return '<div class="hero-img '+(cls||"")+'">'+inner+'<span class="ring"></span></div>';
  }

  // ---------- fit-to-box text shrinking (bilingual "Français (English)" labels can run long;
  // shrink font-size step-wise, down to a floor, rather than let them overflow their box) ----------
  function fitText(elm, opts) {
    if (!elm) return;
    opts = opts || {};
    var min = opts.min || 0.6, mode = opts.mode || "auto";
    var base = parseFloat(elm.getAttribute("data-fit-base") || "");
    if (!base) { base = parseFloat(window.getComputedStyle(elm).fontSize) || 16; elm.setAttribute("data-fit-base", base); }
    var size = base, tries = 0;
    elm.style.fontSize = size + "px";
    // +2px tolerance: fractional line-height rounding otherwise makes scrollHeight read a couple
    // px taller than clientHeight even when nothing is actually being clipped.
    function overflowing() {
      var wOver = elm.scrollWidth > elm.clientWidth + 2, hOver = elm.scrollHeight > elm.clientHeight + 2;
      if (mode === "width") return wOver; if (mode === "height") return hOver; return wOver || hOver;
    }
    while (overflowing() && size > base * min && tries < 60) { size -= 1; elm.style.fontSize = size + "px"; tries++; }
  }
  // shrinks a set of same-role elements (e.g. every answer option) by the SAME factor so they stay
  // visually uniform, stopping once the shared container fits its box.
  function fitGroup(container, selector, opts) {
    if (!container) return;
    opts = opts || {};
    var min = opts.min || 0.6;
    var items = [].slice.call(container.querySelectorAll(selector));
    if (!items.length) return;
    var base = parseFloat(items[0].getAttribute("data-fit-base") || "");
    if (!base) { base = parseFloat(window.getComputedStyle(items[0]).fontSize) || 16; items.forEach(function (x) { x.setAttribute("data-fit-base", base); }); }
    var size = base, tries = 0;
    items.forEach(function (x) { x.style.fontSize = size + "px"; });
    while (container.scrollHeight > container.clientHeight + 1 && size > base * min && tries < 60) {
      size -= 1; items.forEach(function (x) { x.style.fontSize = size + "px"; }); tries++;
    }
  }
  // shrink all matched elements inside `container` by ONE shared factor until the container stops
  // overflowing its own (bounded) box. Used to keep a whole index-card list on-slide: the bilingual
  // titles wrap freely, then this scales them down together so the card column fits its safe area.
  function fitContainerGroup(container, selector, min) {
    if (!container) return;
    min = min || 0.5;
    var items = [].slice.call(container.querySelectorAll(selector));
    if (!items.length) return;
    var base = parseFloat(items[0].getAttribute("data-fit-base") || "");
    if (!base) { base = parseFloat(window.getComputedStyle(items[0]).fontSize) || 16; }
    items.forEach(function (x) { x.setAttribute("data-fit-base", base); });
    var size = base, tries = 0;
    items.forEach(function (x) { x.style.fontSize = size + "px"; });
    while (container.scrollHeight > container.clientHeight + 2 && size > base * min && tries < 80) {
      size -= 1; items.forEach(function (x) { x.style.fontSize = size + "px"; }); tries++;
    }
  }
  // run every fit pass relevant to the current slide (called after the slide DOM is in the document)
  function fitSlide(node) {
    // .hero/h1.title are NOT height-fit here: they have no overflow:hidden/max-height (they simply
    // wrap and the card grows), so there is no real clipping risk to measure.
    // Index titles wrap freely; shrink them together so the whole card column fits the safe area
    // (bilingual labels can run several lines). The .title-safe box is the bound.
    var safe = node.querySelector(".title-safe");
    if (safe && node.querySelector(".index-item .it-title")) fitContainerGroup(safe, ".index-item .it-title", 0.5);
    [].forEach.call(node.querySelectorAll(".q-actions .start-btn,.exit-actions .exit-btn,#start-btn,#quiz-start"), function (elm) { fitText(elm, { mode: "width", min: 0.5 }); });
    var opts = node.querySelector(".options"); if (opts) fitGroup(opts, ".opt-text", { min: 0.6 });
    var qq = node.querySelector(".q-question"); if (qq) fitText(qq, { mode: "height", min: 0.6 });
  }

  // ---------- stage scaling ----------
  function fit(){
    var sw=window.innerWidth, sh=window.innerHeight;
    var scale=Math.min(sw/1920, sh/1080);
    stage.style.setProperty("--scale", scale);
  }
  window.addEventListener("resize", fit);

  // =====================================================================
  //  MEDIA CONTROLLER  (binds control bar to current slide's media)
  // =====================================================================
  var media=null, mediaKind=null, cues=[], ccOn=true, lastVol=1, speed=1;
  var seekEl, progEl, bufEl, knobEl, timeEl, ppBtn, ppIcon, volBtn, volRange, ccBtn, speedBtn, speedMenu, fsBtn, lottiePlay, lottieAnim, cbMedia, cbPrev, cbNext;
  var ccLangBtn, ccLangMenu, capTracks=[], capLang=null, preferredCapLang=null;   // multi-language captions (see course-model.js captionLangs)

  function buildControlbar(){
    cb.innerHTML =
      '<div id="cb-media">'+
        '<button class="cbtn" id="cb-play" aria-label="Play/Pause">'+IC.play+'</button>'+
        '<button class="cbtn" id="cb-replay" aria-label="Replay">'+IC.replay+'</button>'+
        '<div class="seek" id="cb-seek" role="slider" aria-label="Seek" tabindex="0"><div class="buf"></div><div class="prog"></div><div class="knob"></div></div>'+
        '<span class="time" id="cb-time">0:00 / 0:00</span>'+
        '<div class="vol"><button class="cbtn" id="cb-vol" aria-label="Mute">'+IC.volume+'</button><input id="cb-volrange" type="range" min="0" max="1" step="0.05" value="1" aria-label="Volume"></div>'+
        '<div class="cc-wrap"><button class="cbtn" id="cb-cc" aria-label="Captions">'+IC.cc+'</button>'+
          '<button class="cc-lang-btn" id="cb-cclang" style="display:none;" aria-label="Caption language"></button>'+
          '<div class="cc-lang-menu" id="cb-cclangmenu"></div></div>'+
        '<div class="speed"><button class="speed-btn" id="cb-speed">1x</button><div class="speed-menu" id="cb-speedmenu"></div></div>'+
        '<button class="cbtn" id="cb-full" aria-label="Fullscreen">'+IC.full+'</button>'+
      '</div>'+
      '<div id="cb-nav">'+
        '<button class="cb-navbtn" id="cb-prev" aria-label="Previous slide">'+IC.back+'<span>'+esc(t("prevSlideBtn","Prev"))+'</span></button>'+
        '<button class="cb-navbtn" id="cb-next" aria-label="Next slide"><span>'+esc(t("nextSlideBtn","Next"))+'</span>'+IC.next+'</button>'+
      '</div>';
    cbMedia=cb.querySelector("#cb-media");
    // in-player Prev/Next (video slides). Corner-pill Prev/Next (index/reading) are separate (navBack/navNext).
    cbPrev=cb.querySelector("#cb-prev"); cbNext=cb.querySelector("#cb-next");
    cbPrev.addEventListener("click", goPrev); cbNext.addEventListener("click", goNext);
    seekEl=cb.querySelector("#cb-seek"); progEl=cb.querySelector(".prog"); bufEl=cb.querySelector(".buf"); knobEl=cb.querySelector(".knob");
    timeEl=cb.querySelector("#cb-time"); ppBtn=cb.querySelector("#cb-play"); ppIcon=ppBtn;
    volBtn=cb.querySelector("#cb-vol"); volRange=cb.querySelector("#cb-volrange");
    ccBtn=cb.querySelector("#cb-cc"); speedBtn=cb.querySelector("#cb-speed"); speedMenu=cb.querySelector("#cb-speedmenu"); fsBtn=cb.querySelector("#cb-full");
    ccLangBtn=cb.querySelector("#cb-cclang"); ccLangMenu=cb.querySelector("#cb-cclangmenu");

    ppBtn.addEventListener("click", togglePlay);
    cb.querySelector("#cb-replay").addEventListener("click", replay);
    seekEl.addEventListener("click", function(e){ if(!media)return; var r=seekEl.getBoundingClientRect(); var p=(e.clientX-r.left)/r.width; media.currentTime=p*(media.duration||0); });
    seekEl.addEventListener("keydown", function(e){ if(!media)return; if(e.key==="ArrowRight"){media.currentTime=Math.min((media.duration||0),media.currentTime+5);} else if(e.key==="ArrowLeft"){media.currentTime=Math.max(0,media.currentTime-5);} });
    volBtn.addEventListener("click", toggleMute);
    volRange.addEventListener("input", function(){ if(media){media.volume=+volRange.value; media.muted=(+volRange.value===0);} updateVolIcon(); });
    ccBtn.addEventListener("click", toggleCC);
    ccLangBtn.addEventListener("click", function(e){ e.stopPropagation(); ccLangMenu.classList.toggle("open"); });
    document.addEventListener("click", function(e){ if(ccLangMenu && !ccLangMenu.contains(e.target) && e.target!==ccLangBtn) ccLangMenu.classList.remove("open"); });
    fsBtn.addEventListener("click", toggleFull);
    [0.5,0.75,1,1.25,1.5,2].forEach(function(r){ var b=document.createElement("button"); b.textContent=r+"x"; if(r===1)b.className="active";
      b.addEventListener("click",function(){ speed=r; if(media)media.playbackRate=r; speedBtn.textContent=r+"x"; [].forEach.call(speedMenu.children,function(c){c.classList.toggle("active",c===b);}); speedMenu.classList.remove("open"); });
      speedMenu.appendChild(b); });
    speedBtn.addEventListener("click", function(){ speedMenu.classList.toggle("open"); });
  }

  function bindMedia(elm, kind, captionsUrl, captionsTracks){
    media=elm; mediaKind=kind; cues=[];
    capTracks = (captionsTracks && captionsTracks.length) ? captionsTracks : (captionsUrl ? [{lang:"en",label:"English",src:captionsUrl,default:true}] : []);
    if(!media){ cb.style.display="none"; renderCapMenu(); return; }
    cb.style.display="flex";
    media.volume=+volRange.value; media.playbackRate=speed;
    media.addEventListener("timeupdate", onTime);
    media.addEventListener("durationchange", onTime);
    media.addEventListener("progress", onBuf);
    media.addEventListener("play", reflectPP); media.addEventListener("pause", reflectPP);
    media.addEventListener("ended", onEnded);
    if(capTracks.length){
      // sticky language choice across slides when available on the new slide, else the track's own default, else first
      var want = (preferredCapLang && capTracks.some(function(tr){return tr.lang===preferredCapLang;})) ? preferredCapLang
                 : ((capTracks.filter(function(tr){return tr.default;})[0]||capTracks[0]).lang);
      setCapLang(want, true);
    } else { capLang=null; renderCapMenu(); }
    var hideTracks=function(){ try{ for(var tt=0;tt<media.textTracks.length;tt++) media.textTracks[tt].mode='hidden'; }catch(e){} };
    hideTracks(); media.addEventListener('loadedmetadata',hideTracks); setTimeout(hideTracks,300); setTimeout(hideTracks,1200);
    updateVolIcon(); reflectPP(); onTime();
  }
  // switch which caption track is loaded (and, unless `silent`, remember the choice for later slides)
  function setCapLang(lang, silent){
    var tr=capTracks.filter(function(x){return x.lang===lang;})[0] || capTracks[0];
    if(!tr) return;
    capLang=tr.lang; if(!silent) preferredCapLang=capLang;
    loadCaptions(tr.src);
    renderCapMenu();
  }
  function renderCapMenu(){
    if(!ccLangBtn) return;
    if(capTracks.length>1){
      ccLangBtn.style.display="inline-flex";
      ccLangBtn.textContent=(capLang||"").toUpperCase();
      ccLangMenu.innerHTML="";
      capTracks.forEach(function(tr){
        var b=document.createElement("button");
        b.textContent=tr.label||tr.lang.toUpperCase();
        if(tr.lang===capLang) b.className="active";
        b.addEventListener("click",function(){ setCapLang(tr.lang); ccLangMenu.classList.remove("open"); });
        ccLangMenu.appendChild(b);
      });
    } else {
      ccLangBtn.style.display="none";
      if(ccLangMenu){ ccLangMenu.classList.remove("open"); }
    }
  }
  function onTime(){ if(!media)return; var d=media.duration||0,c=media.currentTime||0; var p=d?c/d*100:0;
    progEl.style.width=p+"%"; knobEl.style.left=p+"%"; timeEl.textContent=fmt(c)+" / "+fmt(d); seekEl.setAttribute("aria-valuenow",Math.round(p)); renderCue(c); if(typeof syncTranscript==="function") syncTranscript(); }
  function onBuf(){ if(!media||!media.buffered||!media.buffered.length)return; try{var end=media.buffered.end(media.buffered.length-1);bufEl.style.width=((end/(media.duration||1))*100)+"%";}catch(e){} }
  function togglePlay(){ if(!media)return; if(media.paused)media.play(); else media.pause(); }
  function replay(){ if(media){media.currentTime=0;media.play();} runEntrance(true); }
  function reflectPP(){ var playing=media&&!media.paused; ppBtn.innerHTML=playing?IC.pause:IC.play;
    var sp=slideHost.querySelector(".slide-play"); if(sp){ var spi=sp.querySelector(".sp-icon"); if(spi) spi.innerHTML = playing?IC.pause:IC.play; } }
  function narrate(){ if(!media)return;
    if(!media.paused){ media.pause(); return; }                       // playing -> pause (card reveals pause too)
    var atEdge = media.ended || media.currentTime<0.05 || (media.duration && media.currentTime>=media.duration-0.05);
    if(atEdge){ if(voReset) voReset(); media.currentTime=0; }          // restart -> re-hide cards so the reveal animation replays in step with the voice
    media.play().catch(function(){});
  }
  function onEnded(){ reflectPP(); var sp=slideHost.querySelector(".slide-play"); if(sp)sp.classList.remove("hidden");
    var s=S[i]; if(s&&s.type==="video"){ completed[s.id]=true; updateNav(); persist();
      // when the video finishes its timeline, advance to its Next slide
      // (lesson video -> its lesson index; the module's LAST video -> the reading slide)
      var here=i, p=nextTarget(s);
      if(p){ setTimeout(function(){ if(i===here) jumpToId(p); }, 900); } } }
  function toggleMute(){ if(!media)return; if(media.muted||media.volume===0){media.muted=false;media.volume=lastVol||1;volRange.value=media.volume;} else {lastVol=media.volume;media.muted=true;media.volume=0;volRange.value=0;} updateVolIcon(); }
  function updateVolIcon(){ var m=media&&(media.muted||media.volume===0); volBtn.innerHTML=m?IC.mute:IC.volume; }
  function toggleFull(){ if(document.fullscreenElement)document.exitFullscreen(); else (document.getElementById("viewport")||stage).requestFullscreen().catch(function(){}); }
  function toggleCC(){ ccOn=!ccOn; ccBtn.classList.toggle("toggle-off",!ccOn); ccOverlay.classList.toggle("hidden",!ccOn); if(media&&media.textTracks&&media.textTracks[0])media.textTracks[0].mode=ccOn?"hidden":"disabled"; }

  // captions: parse VTT into cues, render over stage (works for audio + video)
  function loadCaptions(url){
    fetch(url).then(function(r){return r.text();}).then(function(t){ cues=parseVtt(t); }).catch(function(){});
  }
  function parseVtt(text){
    var blocks=text.replace(/\r/g,"").split(/\n\n+/), out=[];
    blocks.forEach(function(b){ var lines=b.split("\n").filter(Boolean); var tl=lines.find(function(l){return /-->/.test(l);}); if(!tl)return;
      var m=/(\d{1,2}:)?(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\s*-->\s*(\d{1,2}:)?(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?/.exec(tl); if(!m)return;
      function sec(h,mn,s,ms){return (h?parseInt(h):0)*3600+parseInt(mn)*60+parseInt(s)+(ms?parseInt(ms)/1000:0);}
      var start=sec(m[1]&&m[1].replace(":",""),m[2],m[3],m[4]), end=sec(m[5]&&m[5].replace(":",""),m[6],m[7],m[8]);
      var txt=lines.slice(lines.indexOf(tl)+1).join(" "); out.push({start:start,end:end,txt:txt}); });
    return out;
  }
  function renderCue(c){ if(!ccOn||!cues.length){ccOverlay.innerHTML="";return;} var hit=null; for(var k=0;k<cues.length;k++){if(c>=cues[k].start&&c<=cues[k].end){hit=cues[k];break;}} ccOverlay.innerHTML=hit?'<span>'+esc(hit.txt)+'</span>':""; }

  // =====================================================================
  //  GSAP entrance
  // =====================================================================
  var tl=null;
  function runEntrance(force){
    if(!gsapOK)return;
    if(tl)tl.kill();
    var sc=slideHost.firstElementChild; if(!sc)return;
    var s=S[i];
    tl=gsap.timeline();
    var eb=sc.querySelector(".eyebrow,.q-counter,.v-course");
    var head=sc.querySelector(".hero,h1.title,h2.title,.q-question,.v-title");
    var rule=sc.querySelector(".accent-rule");
    var img=sc.querySelector(".hero-img");
    // on VO menus, the cards are revealed in sync with the narration (voSyncCards) — keep them out of the entrance stagger
    var itemSel = isVoMenu(s) ? ".option,.lead,.body,.pill,.exit-btn,.score-ring,.start-btn"
                              : ".index-item,.option,.lead,.body,.pill,.exit-btn,.score-ring,.start-btn";
    // exclude the quiz action buttons (Prev/Submit/Next) — animating them can leave a stray transform that misaligns the row
    var items=[].slice.call(sc.querySelectorAll(itemSel)).filter(function(el){ return !el.closest(".q-actions"); });
    if(eb)tl.from(eb,{opacity:0,y:-20,duration:.5,ease:"power2.out"},0);
    if(head){ if(s&&s.type==="reading") tl.from(head,{opacity:0,x:-90,duration:.8,ease:"power3.out"},.1); else tl.from(head,{opacity:0,y:64,duration:.8,ease:"power3.out"},.1); }
    if(rule)tl.from(rule,{scaleX:0,transformOrigin:"left center",duration:.5,ease:"power2.out"},.3);
    if(img)tl.from(img,{opacity:0,scale:.9,duration:.7,ease:"back.out(1.5)"},.25);
    if(items&&items.length)tl.from(items,{opacity:0,y:28,duration:.6,ease:"power2.out",stagger:.09},.35);
  }

  // =====================================================================
  //  RENDERERS
  // =====================================================================
  // menu slides whose cards (modules / lessons / videos) reveal in step with the narration
  function isVoMenu(s){ return !!(s && s.vo && (s.type==="home" || s.type==="moduleIndex" || s.type==="lessonIndex")); }
  function prepVoCards(node, s){ if(!isVoMenu(s)) return; [].forEach.call(node.querySelectorAll(".index-item"), function(c){ c.classList.add("vo-card"); }); }
  function voSyncCards(node, a, s, firstVisit){
    voReset=null;
    if(!isVoMenu(s)) return;
    var cards=[].slice.call(node.querySelectorAll(".index-item"));
    if(!cards.length || !a) return;
    var N=cards.length, timers=[];
    // exact second each card is named in the narration (built from per-item clip durations); fallback if absent
    var cues = (s.voCues && s.voCues.length>=N) ? s.voCues : null;
    function cueAt(k){ if(cues) return cues[k]; var d=(isFinite(a.duration) && a.duration>1)?a.duration:(N*2+2); var intro=0.2; return d*(intro+(1-intro)*(k/N)); }
    // a card counts as "revealed" once it loses the vo-card class -> DOM is the single source of truth, so replays re-animate cleanly
    function reveal(k){ var c=cards[k]; if(!c || !c.classList.contains("vo-card")) return; c.classList.add("vo-in");
      setTimeout(function(){ c.classList.remove("vo-card"); c.classList.remove("vo-in"); }, 650); }
    function revealAll(){ for(var k=0;k<N;k++) reveal(k); }
    function clearTimers(){ timers.forEach(clearTimeout); timers=[]; }
    function schedule(){ clearTimers(); if(a.paused) return; var t=a.currentTime;
      for(var k=0;k<N;k++){ if(!cards[k].classList.contains("vo-card")) continue; var dl=(cueAt(k)-t)*1000;
        if(dl<=0) reveal(k); else timers.push(setTimeout((function(kk){return function(){ if(!a.paused) reveal(kk); };})(k), dl)); } }
    function hide(){ clearTimers(); cards.forEach(function(c){ c.style.transition="none"; c.classList.add("vo-card"); c.classList.remove("vo-in"); void c.offsetWidth; c.style.transition=""; }); }
    a.addEventListener("play", schedule);
    a.addEventListener("playing", schedule);
    a.addEventListener("seeked", schedule);
    a.addEventListener("pause", clearTimers);            // pausing the narration also pauses the card reveals
    a.addEventListener("ended", function(){ clearTimers(); revealAll(); });
    a.addEventListener("timeupdate", function(){ if(a.paused) return; var t=a.currentTime; for(var k=0;k<N;k++){ if(t>=cueAt(k)) reveal(k); } });  // backup for the precise timers
    voReset = hide;   // narrate() calls this on manual replay so the reveal animation re-runs in step with the voice
    if(firstVisit){
      // cards were hidden up-front by prepVoCards; reveal them as the auto-played narration names each one
      setTimeout(function(){ if(a.paused && a.currentTime<0.1){ cards.forEach(function(c,k){ setTimeout(function(){ reveal(k); }, k*500); }); } }, 1300);  // autoplay blocked fallback
      if(!a.paused) schedule();
    }
  }
  function render(){
    var s=S[i]; var firstVisit=!visited[i]; visited[i]=true;   // narration auto-plays only on the first visit this session
    slideHost.innerHTML="";
    var node=(R[s.type]||R.blank)(s);
    slideHost.appendChild(node);
    stage.setAttribute("data-accent", s.accent||"indigo");
    fit();
    fitSlide(node);   // shrink long bilingual titles/buttons to fit their box (see fitText/fitGroup above)
    // chrome
    bar.style.width=Math.round(i/(S.length-1)*100)+"%";
    if(s.type==="reading"||s.type==="result"||s.type==="content") completed[s.id]=true; // these complete on view
    applyGreying(node); updateNav();
    if(firstVisit) prepVoCards(node, s);   // hide menu cards up-front so they can reveal in sync with the narration (first visit only)
    // media + nav bar
    ccOverlay.innerHTML="";
    var v=node.querySelector("video");
    var a=node.querySelector("audio");
    if(v){ bindMedia(v,"video", s.captions, s.captionsTracks); v.play().catch(function(){}); }
    else if(a){ bindMedia(a,"audio", s.captions, s.captionsTracks); if(firstVisit) a.play().catch(function(){ reflectPP(); }); }   // voiceover auto-plays first visit only; on revisit it stays in its completed state until the learner clicks play
    else { media=null; }
    reflectPP();   // show the narration play/replay button immediately (visible affordance even if autoplay is blocked)
    var spBtn=node.querySelector(".slide-play");
    if(spBtn){ spBtn.addEventListener("click",narrate); spBtn.addEventListener("keydown",function(e){ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); narrate(); } }); }
    // the in-player control bar (with its Prev/Next) shows on video slides only
    cb.style.display = (s.type==="video") ? "flex" : "none";
    if(cbMedia) cbMedia.style.display = media ? "flex" : "none";
    if(typeof updateTabs==="function") updateTabs();   // header tabs: Transcript/Resources on video slides; close any open panel
    if(firstVisit) runEntrance();   // animate the entrance on first visit only; revisits show the settled/saved state with no animation
    voSyncCards(node, a, s, firstVisit);   // arm card-reveal sync every render so the play/pause button animates the cards in step with the voice; auto-reveals only on first visit
    var focusEl=node.querySelector("[data-focus]"); if(focusEl){focusEl.setAttribute("tabindex","-1");focusEl.focus({preventScroll:true});}
    announce(label(s));
    persist();
  }
  function label(s){ if(s.type==="question")return t("questionCounterTpl","Question {index} of {total}",{index:s.index,total:s.total}); return (s.kicker||s.type)+". "+(s.title||""); }

  function applyGreying(node){ [].forEach.call(node.querySelectorAll(".index-item"),function(it){ if(isComplete(it.getAttribute("data-target"))) it.classList.add("done"); }); }
  // forward target for the Next button: leaves/indexes return to their parent hub; special cases below
  // post-lesson sequence within a module, in slide order: readings then quiz intro
  function moduleTail(mid){ return S.filter(function(x){ return parentMap[x.id]===mid && (x.type==="reading"||x.type==="quizIntro"); }).map(function(x){ return x.id; }); }
  function moduleOfVid(vid){ var li=parentMap[vid]; if(!li||!byId[li]||byId[li].type!=="lessonIndex") return null; var mi=parentMap[li]; return (byId[mi]&&byId[mi].type==="moduleIndex")?mi:null; }
  function lastVideoOfModule(mid){ var last=null; S.forEach(function(x){ if(x.type==="video" && moduleOfVid(x.id)===mid) last=x.id; }); return last; }
  function firstReadingOfModule(mid){ var t=moduleTail(mid); for(var k=0;k<t.length;k++){ if(byId[t[k]]&&byId[t[k]].type==="reading") return t[k]; } return null; }
  function nextTarget(s){
    if(s.type==="question") return null;                 // handled by inline Submit/Next
    // LINEAR courses (model.flow="linear", e.g. slide-based courses with no video tree) simply walk the
    // deck in authored order; the index slides remain clickable shortcuts rather than mandatory hubs.
    if(C.flow==="linear"){ if(s.type==="exit") return null; return (i<S.length-1)?"__go1":null; }
    if(s.type==="title") return byId["intro"]?"intro":"home";   // title -> course intro -> home
    if(s.id==="outro") return byId["exit"]?"exit":"home";       // course outro -> ending slide
    if(s.type==="quizIntro") return "__go1";             // start quiz (linear +1)
    if(s.type==="home"){ var o=S.filter(function(x){return x.id==="outro"||x.type==="exit";})[0]; return o?o.id:null; }
    if(s.type==="lessonIndex"){ return parentMap[s.id]; } // a lesson's Next returns to its module index
    if(s.type==="moduleIndex"){ var t=moduleTail(s.id); return t[0]||null; } // after lessons, Next continues into readings -> quiz
    if(s.type==="reading"){ var mid=parentMap[s.id], t=moduleTail(mid), k=t.indexOf(s.id); return t[k+1]||mid; } // reading -> next reading -> quiz; last -> module index
    if(s.type==="video"){ var vm=moduleOfVid(s.id); if(vm && s.id===lastVideoOfModule(vm)){ var fr=firstReadingOfModule(vm); if(fr) return fr; } return parentMap[s.id]; } // module's last video -> reading; else -> lesson index
    if(s.type==="result"){ var rs=S.filter(function(x){return x.type==="result";}); var ex=S.filter(function(x){return x.type==="exit";})[0];
      if(rs.length && rs[rs.length-1].id===s.id) return byId["outro"] ? "outro" : (ex?ex.id:"home");   // FINAL module's result -> course outro -> ending slide
      return "home"; }                                                  // other modules' results -> module index (course menu)
    var p=parentMap[s.id]; if(p) return p;
    var ex=S.filter(function(x){return x.type==="exit";})[0]; return (ex&&ex.id!==s.id)?ex.id:null;
  }
  function updateNav(){ var s=S[i];
    var corner = (s.type==="moduleIndex" || s.type==="lessonIndex" || s.type==="reading" || s.type==="result" || s.type==="quizIntro"
                  || s.type==="content" || s.type==="knowledgeCheck" || s.type==="dragdrop");  // corner pills here
    // linear courses walk the whole deck with the corner pills; the slides that own their own
    // forward control (title/quizIntro Start, inline question Next, video gating) are the exceptions
    if(C.flow==="linear") corner = (s.type!=="title" && s.type!=="video" && s.type!=="question" && s.type!=="exit");
    var showNext = corner && s.type!=="quizIntro";   // quiz intro moves forward via its own Start button; keep only Prev here
    // a graded activity must be attempted before the learner can move on (SCORM: no skipping to the result)
    var lockedActivity = (s.type==="dragdrop" && s.graded && !completed[s.id]);
    var atStart = (i===0 && hist.length===0);
    var noFwd = !nextTarget(s);
    if(navBack){ navBack.style.display = corner?"flex":"none"; navBack.disabled = atStart; }
    if(navNext){ navNext.style.display = showNext?"flex":"none"; navNext.disabled = noFwd || lockedActivity; }
    var gated = (s.type==="video" && !completed[s.id]) || (s.type==="question" && !answered[i]) || lockedActivity;  // in-player nav (video)
    if(cbPrev) cbPrev.disabled = atStart;
    if(cbNext) cbNext.disabled = gated || noFwd;
  }

  var R={};
  R.blank=function(){return el('<section class="slide"></section>');};

  R.title=function(s){
    var bg=s.image?'<img src="'+esc(s.image)+'" alt="'+esc(s.imageAlt||"Course background image")+'">':"";
    var n=el('<section class="slide" data-type="title">'+
      '<div class="home-bg">'+bg+'</div>'+
      '<div class="slide-body"><div class="title-safe" style="display:flex;flex-direction:column;justify-content:center;gap:26px;">'+
        '<h1 class="hero" data-focus style="max-width:1420px;">'+esc(s.title)+'</h1>'+
        (s.subtitle?'<p class="lead" style="max-width:1120px;">'+esc(s.subtitle)+'</p>':"")+
        '<div style="margin-top:16px;"><button class="start-btn" id="start-btn">'+esc(t("startCourseBtn","Start course"))+' <span class="bchev">'+IC.chev+'</span></button></div>'+
      '</div></div>'+ slidePlay(s) + audio(s) +'</section>');
    n.querySelector('#start-btn').addEventListener('click',function(){ if(i<S.length-1)go(1); });
    return n;
  };

  R.reading=function(s){
    var readings = s.readings || (s.url ? [{ title: s.title, url: s.url }] : []);
    var btns = readings.map(function(r, idx){
      var vkey = s.id + "#" + idx;                                   // persisted per-button visited state
      var done = !!completed[vkey];
      return '<a class="start-btn read-btn'+(done?" visited":"")+'" data-vkey="'+esc(vkey)+'" href="'+esc(r.url)+'" target="_blank" rel="noopener"><span class="rb-label">'+esc(r.title)+'</span> <span class="bchev">'+IC.ext+'</span></a>';
    }).join("");
    var n=el('<section class="slide" data-type="reading">'+deco()+
      '<div class="slide-body"><div class="title-safe" style="display:flex;gap:64px;align-items:center;">'+
        '<div style="flex:0 0 540px;height:680px;">'+imgBlock(s.image,"octagon",s.imageAlt||("Illustration for "+(s.title||s.kicker||"this section")))+'</div>'+
        '<div style="flex:1 1 0;display:flex;flex-direction:column;gap:18px;">'+
          '<div class="eyebrow">'+esc(t("readingMaterialLabel","Reading Material"))+'</div>'+
          '<h1 class="title" data-focus>'+esc(s.title||"Recommended Reading")+'</h1>'+
          '<div class="accent-rule"></div>'+
          '<p class="lead">'+esc(s.desc||"Open each reading in a new tab, then continue the course.")+'</p>'+
          '<div class="read-tabs" style="display:flex;flex-direction:column;gap:14px;margin-top:8px;">'+btns+'</div>'+
        '</div>'+
      '</div></div>'+ slidePlay(s) + audio(s) +'</section>');
    [].forEach.call(n.querySelectorAll(".read-btn"), function(rb){
      rb.addEventListener("click", function(){ rb.classList.add("visited"); var vk=rb.getAttribute("data-vkey"); if(vk) completed[vk]=true; completed[s.id]=true; persist(); });
    });
    return n;
  };

  // ---------- content: on-screen text + optional supporting photo, or a card grid ----------
  var CARD_IC={
    heart:'<path d="M12 21s-7-4.5-9.2-9A5.2 5.2 0 0 1 12 6.6 5.2 5.2 0 0 1 21.2 12c-2.2 4.5-9.2 9-9.2 9z"/>',
    shield:'<path d="M12 3l7 3v6c0 4.4-3 8-7 9-4-1-7-4.6-7-9V6z"/>',
    rise:'<path d="M3 17l6-6 4 4 8-8"/><path d="M21 7v5h-5"/>',
    alert:'<path d="M12 4l9 16H3z"/><path d="M12 10v4"/><path d="M12 17.5v.5"/>',
    voice:'<path d="M12 3v18"/><path d="M8 7v10"/><path d="M16 7v10"/><path d="M4 10v4"/><path d="M20 10v4"/>',
    airway:'<path d="M4 15c3-1 5-3 7-7"/><path d="M11 8c3 0 6 2 8 5"/><path d="M6 19h12"/>',
    breath:'<path d="M4 12h4l2-4 3 8 2-4h5"/>',
    flame:'<path d="M12 3c3 4 6 6 6 10a6 6 0 0 1-12 0c0-2 1-3 2-4 .5 1.5 1.5 2 2 2 0-3 1-6 2-8z"/>',
    plaster:'<rect x="3" y="8" width="18" height="8" rx="4" transform="rotate(-20 12 12)"/><path d="M10 11.5v1M14 11.5v1"/>',
    bandage:'<rect x="3" y="9" width="18" height="6" rx="3"/><path d="M9 9v6M15 9v6"/>',
    drop:'<path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/>',
    pause:'<rect x="7" y="5" width="3.5" height="14" rx="1"/><rect x="13.5" y="5" width="3.5" height="14" rx="1"/>',
    ice:'<path d="M12 3v18M4 7.5l16 9M20 7.5l-16 9"/>'
  };
  function cardIcon(name){ return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">'+(CARD_IC[name]||CARD_IC.shield)+'</svg>'; }
  R.content=function(s){
    var head='<div class="eyebrow">'+esc(s.kicker||"")+'</div>'+
      '<h1 class="title" data-focus>'+esc(s.title||"")+'</h1><div class="accent-rule"></div>'+
      (s.subtitle?'<p class="lead">'+esc(s.subtitle)+'</p>':"");
    var body;
    if(s.layout==="cards"){
      var cards=(s.cards||[]).map(function(c,n){
        return '<div class="nu-card ct-card" style="--d:'+n+';">'+
          '<span class="ct-ic">'+cardIcon(c.icon)+'</span>'+
          '<span class="ct-label">'+esc(c.label)+'</span>'+
          (c.text?'<span class="ct-text">'+esc(c.text)+'</span>':"")+'</div>';
      }).join("");
      body='<div class="slide-body"><div class="title-safe ct-wrap">'+head+
        '<div class="ct-grid" data-n="'+(s.cards||[]).length+'">'+cards+'</div></div></div>';
    } else {
      var pts=(s.points||[]).map(function(p,n){ return '<li style="--d:'+n+';"><span class="ct-tick"></span><span>'+esc(p)+'</span></li>'; }).join("");
      var textCol='<div class="ct-col">'+head+
        (s.callout?'<div class="nu-inset ct-callout">'+esc(s.callout)+'</div>':"")+
        (pts?'<ul class="ct-points">'+pts+'</ul>':"")+'</div>';
      if(!s.image){
        // no supporting photo: give the copy the full stage rather than leaving an empty media well
        body='<div class="slide-body"><div class="title-safe ct-solo">'+textCol+'</div></div>';
      } else {
        var imgCol='<div class="ct-media">'+imgBlock(s.image,"nu-photo",s.imageAlt||("Photograph illustrating "+(s.title||"this step")))+'</div>';
        var cols=(s.imageSide==="left")?(imgCol+textCol):(textCol+imgCol);
        body='<div class="slide-body"><div class="title-safe ct-split'+(s.imageSide==="left"?" img-left":"")+'">'+cols+'</div></div>';
      }
    }
    return el('<section class="slide" data-type="content">'+deco()+body+ slidePlay(s) + audio(s) +'</section>');
  };

  R.home=function(s){
    var modules=(s.modules||[]).map(function(m,n){ return indexItemHtml(m,n+1,"Module","glass"); }).join("");
    var bg=s.image?'<img src="'+esc(s.image)+'" alt="'+esc(s.imageAlt||"Course background image")+'">':"";
    var n=el('<section class="slide" data-type="home">'+
      '<div class="home-bg">'+bg+'</div>'+
      '<div class="slide-body"><div class="title-safe" style="display:flex;flex-direction:column;gap:24px;">'+
        '<div class="eyebrow">'+esc(s.kicker||t("homeKicker","Course"))+'</div>'+
        '<h1 class="hero" data-focus style="max-width:1320px;">'+esc(s.title)+'</h1>'+
        (s.subtitle?'<p class="lead" style="max-width:1100px;">'+esc(s.subtitle)+'</p>':"")+
        '<div class="index" style="margin-top:8px;display:grid;grid-template-columns:1fr 1fr;gap:18px;max-width:1400px;">'+modules+'</div>'+
      '</div></div>'+ slidePlay(s) + audio(s) +'</section>');
    wireIndex(n); return n;
  };
  R.moduleIndex=function(s){
    var kids=(s.screens&&s.screens.length)?s.screens:(s.lessons||[]);
    var kind=(s.screens&&s.screens.length)?"Part":"Lesson";
    var lessons=kids.map(function(m,n){ return indexItemHtml(m,n+1,kind); }).join("");
    var n=el('<section class="slide" data-type="moduleIndex">'+deco()+
      '<div class="slide-body"><div class="title-safe" style="display:flex;gap:64px;align-items:center;">'+
        '<div style="flex:0 0 560px;height:720px;">'+imgBlock(s.image,"octagon",s.imageAlt||("Illustration for "+(s.title||s.kicker||"this section")))+'</div>'+
        '<div style="flex:1 1 0;display:flex;flex-direction:column;gap:24px;">'+
          '<div class="eyebrow">'+esc(s.kicker||"Module")+'</div>'+
          '<h1 class="title" data-focus>'+esc(s.title)+'</h1>'+
          '<div class="accent-rule"></div>'+
          '<div class="index" style="margin-top:8px;">'+lessons+'</div>'+
        '</div>'+
      '</div></div>'+ slidePlay(s) + audio(s) +'</section>');
    wireIndex(n); return n;
  };
  R.lessonIndex=function(s){
    var vids=(s.videos||[]).map(function(m,n){ return indexItemHtml(m,n+1,"Video"); }).join("");
    var n=el('<section class="slide" data-type="lessonIndex">'+deco()+
      '<div class="slide-body"><div class="title-safe" style="display:flex;gap:64px;align-items:center;">'+
        '<div style="flex:1 1 0;display:flex;flex-direction:column;gap:24px;">'+
          '<div class="eyebrow">'+esc(s.kicker||"Lesson")+'</div>'+
          '<h1 class="title" data-focus>'+esc(s.title)+'</h1>'+
          '<div class="accent-rule"></div>'+
          '<div class="index" style="margin-top:8px;">'+vids+'</div>'+
        '</div>'+
        '<div style="flex:0 0 560px;height:720px;">'+imgBlock(s.image,"octagon",s.imageAlt||("Illustration for "+(s.title||s.kicker||"this section")))+'</div>'+
      '</div></div>'+ slidePlay(s) + audio(s) +'</section>');
    wireIndex(n); return n;
  };
  R.video=function(s){
    var tracks = (s.captionsTracks&&s.captionsTracks.length) ? s.captionsTracks : (s.captions?[{lang:"en",label:"English",src:s.captions,default:true}]:[]);
    var trackHtml = tracks.map(function(tr){ return '<track kind="captions" src="'+esc(tr.src)+'" srclang="'+esc(tr.lang)+'" label="'+esc(tr.label||tr.lang)+'"'+(tr.default?' default':'')+'>'; }).join("");
    return el('<section class="slide video-slide" data-type="video">'+
      '<div class="video-stage" data-focus tabindex="-1"><video preload="metadata" src="'+esc(s.src)+'" playsinline aria-label="'+esc((s.module?s.module+" — ":"")+(s.title||"Course video"))+'">'+trackHtml+'</video></div>'+
      '</section>');
  };
  R.quizIntro=function(s){
    var n=el('<section class="slide" data-type="quizIntro">'+deco()+
      '<div class="slide-body"><div class="title-safe" style="display:flex;gap:72px;align-items:center;">'+
        '<div style="flex:1 1 0;display:flex;flex-direction:column;gap:24px;">'+
          '<div class="eyebrow">'+esc(s.module||"Quiz")+'</div>'+
          '<h1 class="hero" data-focus>'+esc(s.title||"Graded Quiz")+'</h1>'+
          '<div class="accent-rule"></div>'+
          '<p class="lead">'+esc(t("quizLeadTpl","{count} questions. Select an answer, submit it to see feedback, then continue. Your score appears at the end.",{count:s.count}))+'</p>'+
          '<div><span class="pill">'+esc(t("questionsPillTpl","{count} Questions",{count:s.count}))+'</span></div>'+
          '<div style="margin-top:10px;"><button class="start-btn" id="quiz-start">'+esc(t("startQuizBtn","Start quiz"))+' <span class="bchev">'+IC.chev+'</span></button></div>'+
        '</div>'+
        '<div style="flex:0 0 560px;height:700px;">'+imgBlock(s.image,"octagon",s.imageAlt||("Illustration for "+(s.title||s.kicker||"this section")))+'</div>'+
      '</div></div>'+ slidePlay(s) + audio(s) +'</section>');
    n.querySelector('#quiz-start').addEventListener('click',function(){ if(i<S.length-1)go(1); });
    return n;
  };
  R.question=function(s){
    var opts=s.options.map(function(o,n){ return '<div class="option" role="radio" aria-checked="false" tabindex="'+(n===0?"0":"-1")+'" data-n="'+n+'">'+
      '<span class="mark">'+String.fromCharCode(65+n)+'</span><span class="opt-text">'+esc(o.text)+'</span></div>'; }).join("");
    var n=el('<section class="slide" data-type="question">'+deco()+
      '<div class="slide-body"><div class="title-safe q-layout">'+
        '<div class="q-head"><div class="q-counter" data-focus>'+esc(t("questionCounterTpl","Question {index} of {total}",{index:s.index,total:s.total}))+'</div><span class="pill teal">'+esc(s.module||"")+'</span></div>'+
        '<h2 class="q-question">'+esc(s.question)+'</h2>'+
        '<div class="options" role="radiogroup" aria-label="Answer options">'+opts+'</div>'+
        '<div class="feedback"><p class="fb-head"></p><p class="fb-body"></p></div>'+
        '<div class="q-actions">'+
          '<button class="start-btn ghost" id="q-prev"'+(s.index>1?'':' style="display:none;"')+'><span class="bchev" style="transform:rotate(180deg);">'+IC.chev+'</span> '+esc(t("previousBtn","Previous"))+'</button>'+
          '<div style="flex:1 1 auto;"></div>'+
          '<button class="start-btn" id="q-submit" disabled>'+esc(t("submitBtn","Submit"))+'</button>'+
          '<button class="start-btn ghost" id="q-next" style="display:none;">'+esc(s.index>=s.total?t("seeScoreBtn","See score"):t("nextQuestionBtn","Next question"))+' <span class="bchev">'+IC.chev+'</span></button></div>'+
      '</div></div></section>');
    wireQuestion(n,s); return n;
  };
  // ---------- knowledgeCheck: ungraded, unlimited attempts, instant feedback ----------
  R.knowledgeCheck=function(s){
    var opts=s.options.map(function(o,n){ return '<div class="option nu-raised" role="radio" aria-checked="false" tabindex="'+(n===0?"0":"-1")+'" data-n="'+n+'">'+
      '<span class="mark">'+String.fromCharCode(65+n)+'</span><span class="opt-text">'+esc(o.text)+'</span></div>'; }).join("");
    var n=el('<section class="slide" data-type="knowledgeCheck">'+deco()+
      '<div class="slide-body"><div class="title-safe q-layout">'+
        '<div class="q-head"><div class="q-counter" data-focus>'+esc(s.title||"Knowledge Check")+'</div><span class="pill teal">Not graded</span></div>'+
        '<h2 class="q-question">'+esc(s.question)+'</h2>'+
        '<div class="options" role="radiogroup" aria-label="Answer options">'+opts+'</div>'+
        '<div class="feedback"><p class="fb-head"></p><p class="fb-body"></p></div>'+
        '<div class="q-actions"><div style="flex:1 1 auto;"></div>'+
          '<button class="start-btn" id="kc-submit" disabled>Check answer</button>'+
          '<button class="start-btn ghost" id="kc-next" style="display:none;">Continue <span class="bchev">'+IC.chev+'</span></button></div>'+
      '</div></div>'+ slidePlay(s) + audio(s) +'</section>');
    wireKnowledgeCheck(n,s); return n;
  };
  function wireKnowledgeCheck(node,s){
    var opts=[].slice.call(node.querySelectorAll(".option"));
    var submitBtn=node.querySelector("#kc-submit"), nextBtn=node.querySelector("#kc-next"), fb=node.querySelector(".feedback");
    var chosen=-1;
    function select(n){ chosen=n; opts.forEach(function(o,k){o.classList.toggle("selected",k===n);o.setAttribute("aria-checked",k===n?"true":"false");o.setAttribute("tabindex",k===n?"0":"-1");}); submitBtn.disabled=false; opts[n].focus(); }
    opts.forEach(function(o,n){ o.addEventListener("click",function(){ if(!o.classList.contains("locked")) select(n); });
      o.addEventListener("keydown",function(e){ if(e.key===" "||e.key==="Enter"){e.preventDefault();select(n);} else if(e.key==="ArrowDown"||e.key==="ArrowRight"){e.preventDefault();select((n+1)%opts.length);} else if(e.key==="ArrowUp"||e.key==="ArrowLeft"){e.preventDefault();select((n-1+opts.length)%opts.length);} }); });
    submitBtn.addEventListener("click",function(){
      if(chosen<0)return;
      var ok=!!s.options[chosen].correct;
      fb.classList.remove("ok","no"); fb.classList.add("show",ok?"ok":"no");
      node.querySelector(".fb-head").textContent=ok?"Correct":"Not quite";
      node.querySelector(".fb-body").textContent=s.options[chosen].feedback||"";
      announce((ok?"Correct. ":"Not quite. ")+(s.options[chosen].feedback||""));
      if(gsapOK)gsap.fromTo(fb,{y:14,opacity:0},{y:0,opacity:1,duration:.4,ease:"power2.out"});
      if(ok){
        // lock on the correct answer and let the learner move on; wrong answers stay retryable (unlimited attempts)
        opts.forEach(function(o,k){ o.classList.add("locked"); o.setAttribute("tabindex","-1"); if(k===chosen)o.classList.add("correct"); });
        submitBtn.style.display="none"; nextBtn.style.display="inline-flex"; nextBtn.focus();
        completed[s.id]=true; updateNav(); persist();
      } else {
        opts[chosen].classList.add("wrong"); submitBtn.disabled=true; chosen=-1;
        setTimeout(function(){ opts.forEach(function(o){o.classList.remove("wrong","selected");o.setAttribute("aria-checked","false");}); },900);
      }
    });
    nextBtn.addEventListener("click",function(){ var t=nextTarget(s); if(t==="__go1"){go(1);}else if(t){jumpToId(t);}else{go(1);} });
  }

  // ---------- dragdrop: match / sequence (one item per slot) and sort (many items per bin) ----------
  // Every activity ships a keyboard path: focus an item, press Enter to pick it up, focus a slot, press Enter to place.
  R.dragdrop=function(s){
    var isSort=(s.mode==="sort");
    var slots=isSort?(s.bins||[]):(s.mode==="sequence"?(s.slots||[]).map(function(t,n){return {id:"slot"+n,text:t};}):(s.targets||[]));
    var slotHtml=slots.map(function(t,n){
      return '<div class="dd-slot nu-inset'+(isSort?" dd-bin":"")+'" data-slot="'+esc(t.id||("slot"+n))+'" role="button" tabindex="0" '+
        'aria-label="'+esc(t.text)+', drop zone, empty">'+
        '<span class="dd-slot-label">'+esc(t.text)+'</span><div class="dd-drop"></div></div>';
    }).join("");
    // items are presented shuffled; the model order is the answer key
    var items=(s.items||[]).map(function(it,n){ return {it:it,n:n}; });
    for(var k=items.length-1;k>0;k--){ var j=Math.floor(Math.random()*(k+1)); var tmp=items[k]; items[k]=items[j]; items[j]=tmp; }
    var itemHtml=items.map(function(o){
      return '<div class="dd-item nu-raised" draggable="true" data-i="'+o.n+'" role="button" tabindex="0" '+
        'aria-label="'+esc(o.it.text)+', draggable. Press Enter to pick up.">'+
        '<span class="dd-grip"></span><span class="dd-text">'+esc(o.it.text)+'</span></div>';
    }).join("");
    var attemptsTxt=(s.attempts>0)?('<span class="pill">'+s.attempts+' attempts</span>'):'<span class="pill teal">Not graded</span>';
    var n=el('<section class="slide" data-type="dragdrop">'+deco()+
      '<div class="slide-body"><div class="title-safe dd-wrap'+(isSort?" dd-sort":" dd-match")+'">'+
        '<div class="dd-head"><div><div class="eyebrow">'+esc(s.kicker||"Activity")+'</div>'+
          '<h1 class="title" data-focus>'+esc(s.title)+'</h1></div>'+attemptsTxt+'</div>'+
        '<p class="dd-prompt">'+esc(s.prompt||"")+'</p>'+
        '<div class="dd-stage">'+
          (isSort?('<div class="dd-tray" id="dd-tray">'+itemHtml+'</div><div class="dd-bins">'+slotHtml+'</div>')
                 :('<div class="dd-slots">'+slotHtml+'</div><div class="dd-tray" id="dd-tray">'+itemHtml+'</div>'))+
        '</div>'+
        '<div class="feedback"><p class="fb-head"></p><p class="fb-body"></p></div>'+
        '<div class="q-actions"><div class="dd-status" aria-live="polite"></div><div style="flex:1 1 auto;"></div>'+
          '<button class="start-btn ghost" id="dd-reset">Reset</button>'+
          '<button class="start-btn" id="dd-submit" disabled>Submit</button>'+
          '<button class="start-btn ghost" id="dd-next" style="display:none;">Continue <span class="bchev">'+IC.chev+'</span></button></div>'+
      '</div></div>'+ slidePlay(s) + audio(s) +'</section>');
    wireDragDrop(n,s,isSort); return n;
  };

  function wireDragDrop(node,s,isSort){
    var tray=node.querySelector("#dd-tray");
    var submitBtn=node.querySelector("#dd-submit"), nextBtn=node.querySelector("#dd-next"), resetBtn=node.querySelector("#dd-reset");
    var fb=node.querySelector(".feedback"), status=node.querySelector(".dd-status");
    var itemEls=[].slice.call(node.querySelectorAll(".dd-item"));
    var slotEls=[].slice.call(node.querySelectorAll(".dd-slot"));
    var total=(s.items||[]).length, used=0, picked=null, tries=0, locked=false;

    function key(it){ return isSort?it.bin:(s.mode==="sequence"?("slot"+it.slot):it.target); }
    function slotOf(elm){ var p=elm.closest(".dd-slot"); return p?p.getAttribute("data-slot"):null; }
    function countPlaced(){ return node.querySelectorAll(".dd-slot .dd-item").length; }
    function refresh(){
      used=countPlaced();
      submitBtn.disabled=locked||(used<total);
      status.textContent=used+" of "+total+" placed";
      slotEls.forEach(function(sl){
        var inside=sl.querySelectorAll(".dd-item");
        var names=[].map.call(inside,function(x){return x.querySelector(".dd-text").textContent;});
        var lbl=sl.querySelector(".dd-slot-label").textContent;
        sl.setAttribute("aria-label",lbl+", drop zone, "+(names.length?("contains "+names.join(", ")):"empty"));
      });
    }
    function place(item,slot){
      if(locked)return;
      // match/sequence hold exactly one item: bounce any current occupant back to the tray
      if(!isSort){ var cur=slot.querySelector(".dd-item"); if(cur&&cur!==item) tray.appendChild(cur); }
      slot.querySelector(".dd-drop").appendChild(item);
      item.classList.add("placed");
      if(gsapOK)gsap.fromTo(item,{scale:.94},{scale:1,duration:.28,ease:"back.out(2)"});
      refresh();
    }
    function toTray(item){ if(locked)return; tray.appendChild(item); item.classList.remove("placed"); refresh(); }
    function setPicked(item){
      if(picked)picked.classList.remove("picked");
      picked=item||null;
      if(picked){ picked.classList.add("picked"); announce(picked.querySelector(".dd-text").textContent+" picked up. Choose a drop zone and press Enter."); }
    }

    // --- pointer drag ---
    itemEls.forEach(function(item){
      item.addEventListener("dragstart",function(e){ if(locked){e.preventDefault();return;} e.dataTransfer.setData("text/plain",item.getAttribute("data-i")); item.classList.add("dragging"); });
      item.addEventListener("dragend",function(){ item.classList.remove("dragging"); });
      item.addEventListener("click",function(){ if(locked)return; if(item.classList.contains("placed")){toTray(item);setPicked(null);} else {setPicked(picked===item?null:item);} });
      item.addEventListener("keydown",function(e){
        if(e.key==="Enter"||e.key===" "){ e.preventDefault();
          if(item.classList.contains("placed")){ toTray(item); item.focus(); }
          else setPicked(picked===item?null:item);
        } else if(e.key==="Escape"){ setPicked(null); }
      });
    });
    slotEls.forEach(function(slot){
      slot.addEventListener("dragover",function(e){ if(locked)return; e.preventDefault(); slot.classList.add("over"); });
      slot.addEventListener("dragleave",function(){ slot.classList.remove("over"); });
      slot.addEventListener("drop",function(e){ e.preventDefault(); slot.classList.remove("over"); if(locked)return;
        var idx=e.dataTransfer.getData("text/plain"); var item=node.querySelector('.dd-item[data-i="'+idx+'"]'); if(item)place(item,slot); setPicked(null); });
      function activate(){ if(locked)return; if(picked){ place(picked,slot); var p=picked; setPicked(null); p.focus(); } }
      slot.addEventListener("click",activate);
      slot.addEventListener("keydown",function(e){ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); activate(); } });
    });
    // clicking empty tray space returns the picked item
    tray.addEventListener("dragover",function(e){ if(!locked)e.preventDefault(); });
    tray.addEventListener("drop",function(e){ e.preventDefault(); if(locked)return; var idx=e.dataTransfer.getData("text/plain"); var item=node.querySelector('.dd-item[data-i="'+idx+'"]'); if(item)toTray(item); });

    function grade(){
      var right=0;
      itemEls.forEach(function(item){
        var model=(s.items||[])[+item.getAttribute("data-i")];
        var ok=slotOf(item)===key(model);
        if(ok)right++;
        item.classList.toggle("dd-ok",ok); item.classList.toggle("dd-no",!ok);
      });
      return right;
    }
    function reveal(){
      locked=true;
      itemEls.forEach(function(item){
        item.setAttribute("draggable","false"); item.setAttribute("tabindex","-1");
        var model=(s.items||[])[+item.getAttribute("data-i")];
        var want=node.querySelector('.dd-slot[data-slot="'+key(model)+'"]');
        if(want&&slotOf(item)!==key(model)){ want.querySelector(".dd-drop").appendChild(item); item.classList.add("placed"); }
        item.classList.remove("dd-no"); item.classList.add("dd-ok","revealed");
      });
      slotEls.forEach(function(sl){ sl.setAttribute("tabindex","-1"); });
      refresh();
    }
    function finish(right){
      var full=(right===total);
      activity[s.id]={score:right,max:total,done:true,graded:s.graded!==false};
      completed[s.id]=true;
      submitBtn.style.display="none"; resetBtn.style.display="none";
      nextBtn.style.display="inline-flex"; nextBtn.focus();
      fb.classList.remove("ok","no"); fb.classList.add("show",full?"ok":"no");
      node.querySelector(".fb-head").textContent=full?"Correct":(tries>=s.attempts&&s.attempts>0?"Here are the correct answers":"Not quite");
      node.querySelector(".fb-body").textContent=full?(s.feedbackCorrect||""):(s.feedbackIncorrect||"");
      announce((full?"Correct. ":"")+right+" of "+total+" correct. "+node.querySelector(".fb-body").textContent);
      if(gsapOK)gsap.fromTo(fb,{y:14,opacity:0},{y:0,opacity:1,duration:.4,ease:"power2.out"});
      reportScore(); updateNav(); persist();
    }
    submitBtn.addEventListener("click",function(){
      if(locked||countPlaced()<total)return;
      tries++;
      var right=grade();
      var full=(right===total);
      var lastTry=(s.attempts>0&&tries>=s.attempts);
      if(full||lastTry){ if(!full)reveal(); else locked=true; finish(full?total:right); return; }
      // attempts remain (or the activity is ungraded): show feedback and let them retry
      fb.classList.remove("ok","no"); fb.classList.add("show","no");
      node.querySelector(".fb-head").textContent="Not quite";
      node.querySelector(".fb-body").textContent=(s.feedbackIncorrect||"")+(s.attempts>0?(" You have "+(s.attempts-tries)+" attempt"+((s.attempts-tries)===1?"":"s")+" left."):"");
      announce(right+" of "+total+" correct. "+node.querySelector(".fb-body").textContent);
      if(gsapOK)gsap.fromTo(fb,{y:14,opacity:0},{y:0,opacity:1,duration:.4,ease:"power2.out"});
      setTimeout(function(){ itemEls.forEach(function(x){x.classList.remove("dd-ok","dd-no");}); },1400);
    });
    resetBtn.addEventListener("click",function(){ if(locked)return; itemEls.forEach(function(x){ tray.appendChild(x); x.classList.remove("placed","dd-ok","dd-no"); }); setPicked(null); fb.classList.remove("show","ok","no"); refresh(); });
    nextBtn.addEventListener("click",function(){ var t=nextTarget(s); if(t==="__go1"){go(1);}else if(t){jumpToId(t);}else{go(1);} });

    // restored state: the activity was already completed in a previous session
    if(activity[s.id]&&activity[s.id].done){ tries=Math.max(1,s.attempts); reveal(); finish(activity[s.id].score); }
    else refresh();
  }

  R.result=function(s){
    var q=S.filter(function(x,ix){return x.type==="question"&&x.moduleKey===s.moduleKey;});
    var idxs=[]; S.forEach(function(x,ix){if(x.type==="question"&&x.moduleKey===s.moduleKey)idxs.push(ix);});
    var correct=idxs.reduce(function(a,ix){return a+((answered[ix]&&answered[ix].correct)?1:0);},0);
    var total=idxs.length, pct=total?Math.round(correct/total*100):0;
    var detail=t("answeredDetailTpl","You answered {correct} of {total} questions correctly.",{correct:correct,total:total});
    // When graded activities count toward the score, the FINAL result slide reports the whole course,
    // so what the learner sees matches what the LMS receives.
    var results=S.filter(function(x){return x.type==="result";});
    var isFinal=results.length&&results[results.length-1].id===s.id;
    if(isFinal&&C.scoring&&C.scoring.includeActivities&&gradedActivities().length){
      var p=scoreParts();
      var actPts=p.earned-correct, actMax=p.max-total;
      pct=p.max?Math.round(p.earned/p.max*100):0;
      detail=t("answeredWithActivitiesTpl","You answered {correct} of {total} questions correctly, and scored {actPts} of {actMax} on the drag-and-drop activities.",{correct:correct,total:total,actPts:actPts,actMax:actMax});
    }
    var pass=pct>=(C.passPercentage||70);
    reportScore();
    var n=el('<section class="slide" data-type="result">'+deco()+
      '<div class="result"><div class="eyebrow" style="justify-content:center;">'+esc(s.module||"")+' · '+esc(t("resultKickerLabel","Result"))+'</div>'+
        '<div class="score-ring" style="--pct:'+pct+';"><div class="pct">'+pct+'%</div><div class="lbl">'+esc(t("yourScoreLabel","Your Score"))+'</div></div>'+
        '<h1 class="title" data-focus style="text-align:center;">'+esc(pass?t("wellDoneTitle","Well done!"):t("keepGoingTitle","Keep going"))+'</h1>'+
        '<p class="lead" style="text-align:center;">'+esc(detail)+'</p>'+
        '<p class="small" style="text-align:center;">'+esc(pass?t("passedDetailTpl","You met the {pct}% pass mark.",{pct:C.passPercentage||70}):t("failedDetailTpl","You need {pct}% to pass. Review the quiz and try again.",{pct:C.passPercentage||70}))+'</p>'+
        (idxs.length?'<div style="margin-top:6px;"><button class="start-btn ghost" id="review-quiz">'+IC.replay+' '+esc(pass?t("reviewQuizBtn","Review Quiz"):t("retakeQuizBtn","Retake Quiz"))+'</button></div>':'')+
      '</div></section>');
    var rq=n.querySelector("#review-quiz");
    // Passing -> review the attempts read-only. Failing -> a true retake: clear the answers first
    // so the questions are live again (Part D: allow a retake on fail).
    if(rq) rq.addEventListener("click",function(){
      if(!pass){ idxs.forEach(function(ix){ delete answered[ix]; delete completed[S[ix].id]; }); delete completed[s.id]; persist(); }
      navTo(idxs[0]);
    });
    return n;
  };
  R.exit=function(s){
    var n=el('<section class="slide" data-type="exit">'+deco()+
      '<div class="result"><span class="pill teal">'+esc(t("courseCompletePill","Course Complete"))+'</span>'+
        '<h1 class="hero" data-focus style="text-align:center;">'+esc(s.title||"You did it!")+'</h1>'+
        (s.subtitle?'<p class="lead" style="text-align:center;max-width:1100px;">'+esc(s.subtitle)+'</p>':"")+
        '<div class="exit-actions">'+
          '<button class="exit-btn exit-secondary" id="restart-btn">'+IC.replay+' '+esc(t("startOverBtn","Start Over"))+'</button>'+
          '<button class="exit-btn" id="exit-btn">'+IC.exit+' '+esc(t("exitCourseBtn","Exit Course"))+'</button>'+
        '</div>'+
      '</div>'+ slidePlay(s) + audio(s) +'</section>');
    n.querySelector("#exit-btn").addEventListener("click", doExit);
    n.querySelector("#restart-btn").addEventListener("click", function(){ hist=[]; visited={}; i=0; render(); });   // replay the course from the title
    return n;
  };

  function indexItemHtml(m,num,kind,extra){
    return '<div class="index-item '+(extra||"")+'" role="button" tabindex="0" data-target="'+esc(m.target)+'"'+(m.nav?' data-nav="'+esc(m.nav)+'"':"")+'>'+
      '<span class="ix">'+num+'</span>'+
      '<span class="it-txt"><span class="it-kicker">'+esc(m.label||kind+" "+num)+'</span><span class="it-title">'+esc(m.title)+'</span></span>'+
      '<span class="chev">'+IC.chev+'</span></div>';
  }
  function wireIndex(node){
    [].forEach.call(node.querySelectorAll(".index-item"),function(it){
      function go(){ var t=it.getAttribute("data-nav")||it.getAttribute("data-target"); jumpToId(t); }   // data-nav (e.g. module intro) takes priority; data-target stays the completion target
      it.addEventListener("click",go);
      it.addEventListener("keydown",function(e){if(e.key==="Enter"||e.key===" "){e.preventDefault();go();}});
    });
  }
  function slidePlay(s){ if(!s.vo)return ""; return '<div class="slide-play" id="slide-play" role="button" tabindex="0" aria-label="Play or replay narration" title="Play narration"><span class="sp-icon">'+IC.play+'</span></div>'; }
  function audio(s){ return s.vo?'<audio preload="auto" src="'+esc(s.vo)+'"></audio>':""; }

  function wireQuestion(node,s){
    var opts=[].slice.call(node.querySelectorAll(".option"));
    var submitBtn=node.querySelector("#q-submit"); var nextBtn=node.querySelector("#q-next"); var fb=node.querySelector(".feedback");
    var chosen=answered[i]?answered[i].chosen:-1; var done=!!answered[i];
    function select(n){ if(done)return; chosen=n; opts.forEach(function(o,k){o.classList.toggle("selected",k===n);o.setAttribute("aria-checked",k===n?"true":"false");o.setAttribute("tabindex",k===n?"0":"-1");}); submitBtn.disabled=false; opts[n].focus(); }
    opts.forEach(function(o,n){ o.addEventListener("click",function(){select(n);});
      o.addEventListener("keydown",function(e){ if(e.key===" "||e.key==="Enter"){e.preventDefault();select(n);} else if(e.key==="ArrowDown"||e.key==="ArrowRight"){e.preventDefault();select((n+1)%opts.length);} else if(e.key==="ArrowUp"||e.key==="ArrowLeft"){e.preventDefault();select((n-1+opts.length)%opts.length);} }); });
    function reveal(){ var ci=s.options.findIndex(function(o){return o.correct;});
      opts.forEach(function(o,n){ o.classList.add("locked"); o.setAttribute("tabindex","-1"); if(n===ci)o.classList.add("correct"); else if(n===chosen)o.classList.add("wrong"); });
      var ok=chosen===ci; fb.classList.add("show",ok?"ok":"no");
      node.querySelector(".fb-head").textContent=ok?t("correctLabel","Correct"):t("notQuiteLabel","Not quite");
      node.querySelector(".fb-body").textContent=(s.options[chosen]&&s.options[chosen].feedback)||s.options[ci].feedback||"";
      submitBtn.style.display="none"; nextBtn.style.display="inline-flex"; answered[i]={chosen:chosen,correct:ok}; completed[S[i].id]=true; updateNav();
      announce((ok?"Correct. ":"Not quite. ")+node.querySelector(".fb-body").textContent);
      if(gsapOK)gsap.fromTo(fb,{y:14,opacity:0},{y:0,opacity:1,duration:.4,ease:"power2.out"});
      reportScore(); persist(); nextBtn.focus();
    }
    submitBtn.addEventListener("click",function(){ if(chosen>=0)reveal(); });
    nextBtn.addEventListener("click",function(){ if(i<S.length-1)go(1); });
    var prevBtn=node.querySelector("#q-prev");
    if(prevBtn) prevBtn.addEventListener("click",function(){ go(-1); });   // step back to review the previous attempted question
    if(done){ opts.forEach(function(o){o.classList.add("locked");}); reveal(); }
  }

  // =====================================================================
  //  NAV
  // =====================================================================
  function navTo(n){ if(n<0||n>=S.length||n===i)return; hist.push(i); i=n; render(); }
  function go(d){ navTo(i+d); }
  function jumpToIndex(n){ navTo(n); }
  function jumpToId(id){ var n=S.findIndex(function(x){return x.id===id;}); if(n>=0)navTo(n); }
  function goPrev(){ if(hist.length){ i=hist.pop(); render(); } else if(i>0){ i=i-1; render(); } }
  function goNext(){ var s=S[i]; if(s.type==="video"&&!completed[s.id])return; if(s.type==="question")return;
    if(s.type==="dragdrop"&&s.graded&&!completed[s.id])return;   // graded activity must be attempted first
    var t=nextTarget(s); if(!t)return; if(t==="__go1"){go(1);return;} jumpToId(t); }
  // corner-pill Prev/Next (module index / lesson index / reading); in-player ones wired in buildControlbar
  navBack.addEventListener("click", goPrev); navNext.addEventListener("click", goNext);
  document.addEventListener("keydown",function(e){
    if(e.target.closest&&(e.target.closest(".options")||e.target.closest(".index")||e.target.closest("#controlbar")))return;
    if(e.key==="ArrowRight")goNext(); else if(e.key==="ArrowLeft")goPrev();
  });
  function doExit(){ if(window.SCORM){try{SCORM.setComplete(true);SCORM.finish();}catch(e){}} announce("Course exited.");
    window.close(); setTimeout(function(){ var sc=slideHost.firstElementChild; if(sc)sc.insertAdjacentHTML("beforeend",'<p class="small" style="text-align:center;margin-top:20px;">You may now close this window.</p>'); },200); }

  // =====================================================================
  //  SCORM (aggregate across all questions)
  // =====================================================================
  // Score = quiz questions, plus graded activity points when model.scoring.includeActivities is set.
  function gradedActivities(){ return S.filter(function(x){ return x.type==="dragdrop" && x.graded; }); }
  function scoreParts(){
    var qs=S.filter(function(x){return x.type==="question";}).length;
    var qDone=Object.keys(answered).length;
    var earned=Object.keys(answered).reduce(function(a,k){return a+(answered[k].correct?1:0);},0);
    var max=qs, allDone=(qDone>=qs);
    if(C.scoring&&C.scoring.includeActivities){
      gradedActivities().forEach(function(x){
        var a=activity[x.id];
        max+=(x.items||[]).length;
        if(a&&a.done)earned+=a.score; else allDone=false;
      });
    }
    return {earned:earned,max:max,allDone:allDone&&max>0};
  }
  function reportScore(){ if(!window.SCORM||!SCORM.available())return;
    var p=scoreParts();
    var pct=p.max?Math.round(p.earned/p.max*100):0; SCORM.setScore(pct,0,100);
    if(p.allDone){ SCORM.setComplete(pct>=(C.passPercentage||70)); }
  }
  function encodeState(){ var parts=[]; Object.keys(answered).forEach(function(k){parts.push(k+":"+answered[k].chosen);});
    var acts=Object.keys(activity).filter(function(k){return activity[k].done;}).map(function(k){return k+":"+activity[k].score+":"+activity[k].max;});
    return i+"|"+parts.join(",")+"|"+Object.keys(completed).join(",")+"|"+acts.join(","); }
  function restoreState(){ if(!window.SCORM||!SCORM.available())return; var raw=SCORM.getSuspend()||""; if(!raw)return;
    try{ var b=raw.split("|"); (b[1]||"").split(",").filter(Boolean).forEach(function(p){ var kv=p.split(":"),qi=+kv[0],ch=+kv[1],s=S[qi]; if(s&&s.type==="question"){var ci=s.options.findIndex(function(o){return o.correct;});answered[qi]={chosen:ch,correct:ch===ci};} }); (b[2]||"").split(",").filter(Boolean).forEach(function(id){ completed[id]=true; });
      (b[3]||"").split(",").filter(Boolean).forEach(function(p){ var kv=p.split(":"); if(kv.length>=3) activity[kv[0]]={score:+kv[1],max:+kv[2],done:true,graded:true}; });
      var si=+b[0]; if(si>=0&&si<S.length)i=si; }catch(e){} }
  function persist(){ if(window.SCORM&&SCORM.available()){SCORM.setBookmark(i);SCORM.setSuspend(encodeState());} }

  // =====================================================================
  //  BOOT
  // =====================================================================
  buildControlbar();
  navBack.innerHTML=IC.back+'<span>'+esc(t("previousBtn","Previous"))+'</span>'; navNext.innerHTML='<span>'+esc(t("nextBtn","Next"))+'</span>'+IC.next;  // corner pills (index/reading)
  // persistent header: course title (left) + tabs (right) — Transcript · Resources · Menu
  var IC_MENU='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>';
  var IC_DOC='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2h8l4 4v16H6z"/><path d="M14 2v4h4"/><path d="M9 13h6M9 17h6"/></svg>';
  var IC_DL='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0l-4-4m4 4l4-4"/><path d="M5 21h14"/></svg>';
  var coursebar=document.createElement("div"); coursebar.id="coursebar"; coursebar.setAttribute("role","banner");
  coursebar.innerHTML='<span class="cb-title">'+esc(C.titleShort||C.title||"")+'</span>'+
    '<div class="cb-tabs">'+
      '<button class="cb-tab" id="tab-transcript">'+IC_DOC+'<span>'+esc(t("transcriptTab","Transcript"))+'</span></button>'+
      '<button class="cb-tab" id="tab-menu">'+IC_MENU+'<span>'+esc(t("menuTab","Menu"))+'</span></button>'+
    '</div>';
  stage.appendChild(coursebar);
  var tabTranscript=coursebar.querySelector("#tab-transcript"), tabResources=coursebar.querySelector("#tab-resources"), tabMenu=coursebar.querySelector("#tab-menu");
  fitText(coursebar.querySelector(".cb-title"), { mode:"width", min:0.7 });   // long bilingual course titles shrink instead of relying on the ellipsis fallback

  // Menu overlay — course structure + current position + restricted (gated) navigation
  var menuCollapsed={};   // group id -> true when collapsed
  var menuPanel=el('<div id="menu-panel" class="side-panel" hidden><div class="sp-head"><span>'+esc(t("menuPanelTitle","Menu"))+'</span><button class="ov-close" id="menu-close" aria-label="Close">✕</button></div><div class="sp-body" id="menu-body"></div></div>');
  stage.appendChild(menuPanel);
  var trPanel=el('<div id="transcript-panel" class="side-panel" hidden><div class="sp-head"><span>'+esc(t("transcriptPanelTitle","Transcript"))+'</span><button class="ov-close" id="tr-close" aria-label="Close">✕</button></div><div class="sp-body" id="tr-body"></div></div>');
  stage.appendChild(trPanel);
  var resPanel=el('<div id="resources-panel" class="side-panel" hidden><div class="sp-head"><span>'+esc(t("resourcesTitle","Downloadable Resources"))+'</span><button class="ov-close" id="res-close" aria-label="Close">✕</button></div><div class="sp-body" id="res-body"></div></div>');
  stage.appendChild(resPanel);
  function closePanels(){ menuPanel.hidden=true; trPanel.hidden=true; resPanel.hidden=true; }
  function fmtT(t){ var m=Math.floor(t/60),s=Math.floor(t%60); return m+":"+(s<10?"0":"")+s; }
  function moduleUnlocked(mid){ var mods=S.filter(function(x){return x.type==="moduleIndex";}); var idx=mods.map(function(x){return x.id;}).indexOf(mid); if(idx<=0) return true; return isComplete(mods[idx-1].id); }
  function moduleOfSlide(id){ var m=id,g=0; while(m && byId[m] && byId[m].type!=="moduleIndex" && g++<30){ m=parentMap[m]; } return (byId[m]&&byId[m].type==="moduleIndex")?m:null; }
  function menuLabel(s){ switch(s.type){ case "title":return t("menuTitleLabel","Title"); case "home":return t("menuHomeLabel","Home"); case "moduleIndex":return t("menuOverviewLabel","Overview");
    case "reading":return t("readingMaterialLabel","Reading Material"); case "exit":return t("courseCompletePill","Course Complete"); case "result":return t("menuResultsLabel","Results");
    case "question":return t("questionMenuLabelTpl","Question {n}",{n:s.index||""});
    case "knowledgeCheck":return s.title||"Knowledge Check"; case "dragdrop":return s.title||"Activity";
    default:return s.title||s.id; } }
  function openMenu(){ closePanels(); var body=menuPanel.querySelector("#menu-body");
    function idxOf(id){ return S.findIndex(function(x){return x.id===id;}); }
    var groups=[]; var intro=[]; ["title","intro","home"].forEach(function(id){ var k=idxOf(id); if(k>=0) intro.push(k); });
    if(intro.length) groups.push({gid:"gi",title:t("gettingStartedLabel","Getting Started"),idxs:intro});
    var mn=0; S.forEach(function(m,mi){ if(m.type!=="moduleIndex") return; mn++;
      var idxs=[mi]; S.forEach(function(x,k){ if(k!==mi && moduleOfSlide(x.id)===m.id && x.type!=="result") idxs.push(k); });
      groups.push({gid:"gm"+mn,title:t("moduleLabelTpl","Module {n}",{n:mn})+": "+m.title,idxs:idxs}); });
    var wrap=[]; ["outro","exit"].forEach(function(id){ var k=idxOf(id); if(k>=0) wrap.push(k); });
    if(wrap.length) groups.push({gid:"gw",title:t("wrapUpLabel","Wrap Up"),idxs:wrap});
    body.innerHTML=groups.map(function(g){ var collapsed=!!menuCollapsed[g.gid];
      var head='<button class="menu-grp" data-grp="'+g.gid+'"><span class="grp-tri">'+(collapsed?"▸":"▾")+'</span><span class="grp-t">'+esc(g.title)+'</span></button>';
      var items=collapsed?"":g.idxs.map(function(k){ var s=S[k];
        var lvl=(s.type==="question" || (s.type==="video" && byId[parentMap[s.id]] && byId[parentMap[s.id]].type==="lessonIndex"))?2:1;
        var vis=!!visited[k], cur=(k===i), can=vis||cur;   // restricted: only visited (or current) slides are clickable
        return '<button class="menu-row lvl'+lvl+' '+s.type+(cur?" current":"")+(vis?" visited":"")+'" data-goi="'+k+'"'+(can?"":" disabled")+'>'+
          '<span class="mr-t">'+esc(menuLabel(s))+'</span>'+(vis?'<span class="mr-check">✓</span>':"")+'</button>'; }).join("");
      return '<div class="menu-group">'+head+items+'</div>'; }).join("");
    [].forEach.call(body.querySelectorAll(".menu-grp"),function(b){ b.addEventListener("click",function(){ var g=b.getAttribute("data-grp"); menuCollapsed[g]=!menuCollapsed[g]; openMenu(); }); });
    [].forEach.call(body.querySelectorAll(".menu-row"),function(b){ if(b.hasAttribute("disabled"))return; b.addEventListener("click",function(){ closePanels(); jumpToIndex(+b.getAttribute("data-goi")); }); });
    menuPanel.hidden=false;
    var curEl=body.querySelector(".menu-row.current"); if(curEl) curEl.scrollIntoView({block:"center"}); }
  function openTranscript(){ closePanels(); var body=trPanel.querySelector("#tr-body");
    if(!cues||!cues.length){ body.innerHTML='<p class="sp-empty">'+esc(t("transcriptLoadingMsg","Transcript is loading, or not available for this video."))+'</p>'; }
    else { body.innerHTML=cues.map(function(c){ return '<button class="tr-line" data-t="'+c.start+'"><span class="tr-time">'+fmtT(c.start)+'</span><span class="tr-txt">'+esc(c.txt)+'</span></button>'; }).join("");
      [].forEach.call(body.querySelectorAll(".tr-line"),function(b){ b.addEventListener("click",function(){ if(media){ media.currentTime=+b.getAttribute("data-t"); media.play().catch(function(){}); } }); }); }
    trPanel.hidden=false; }
  function syncTranscript(){ if(trPanel.hidden||!media||!cues.length)return; var c=media.currentTime; var lines=trPanel.querySelectorAll(".tr-line");
    for(var k=0;k<cues.length;k++){ var on=(c>=cues[k].start&&c<=cues[k].end); if(lines[k]){ if(on&&!lines[k].classList.contains("active")){ lines[k].classList.add("active"); lines[k].scrollIntoView({block:"nearest"}); } else if(!on){ lines[k].classList.remove("active"); } } } }
  function openResources(){ closePanels(); var list=(S[i].resources||[]); var body=resPanel.querySelector("#res-body");
    body.innerHTML=list.length?list.map(function(r){ return '<a class="res-line" href="'+esc(r.url)+'" download target="_blank" rel="noopener">'+IC_DL+'<span>'+esc(r.name||r.url)+'</span></a>'; }).join(""):'<p class="sp-empty">'+esc(t("noResourcesMsg","No downloadable resources for this video."))+'</p>';
    resPanel.hidden=false; }
  function updateTabs(){ var s=S[i], isVideo=(s.type==="video"); closePanels();
    tabTranscript.style.display=isVideo?"inline-flex":"none"; }
  tabMenu.addEventListener("click",function(){ menuPanel.hidden?openMenu():closePanels(); });
  tabTranscript.addEventListener("click",function(){ trPanel.hidden?openTranscript():closePanels(); });
  menuPanel.querySelector("#menu-close").addEventListener("click",closePanels);
  menuPanel.addEventListener("click",function(e){ if(e.target===menuPanel) closePanels(); });
  trPanel.querySelector("#tr-close").addEventListener("click",closePanels);
  resPanel.querySelector("#res-close").addEventListener("click",closePanels);
  if(window.SCORM){SCORM.init();restoreState();}
  window.addEventListener("beforeunload",function(){if(window.SCORM){persist();SCORM.finish();}});
  // review-mode deep link: ?s=<slideId> jumps to a slide; postMessage lets a host (review app) drive it
  try{ var sid=new URLSearchParams(location.search).get("s"); if(sid){ var qi=S.findIndex(function(x){return x.id===sid;}); if(qi>=0) i=qi; } }catch(e){}
  window.addEventListener("message",function(e){ var d=e.data||{}; if(d.gotoSlide){ var n=S.findIndex(function(x){return x.id===d.gotoSlide;}); if(n>=0) jumpToIndex(n); } });
  fit();
  render();
})();

/* Accessible (WCAG 2.1 AA-minded) slide-by-slide course player.
   Renders window.COURSE one screen at a time, runs the quiz, supports keyboard
   operation + screen-reader announcements, and reports to the LMS via window.SCORM
   including resume (bookmark + suspend_data) and session time. */
(function () {
  var C = window.COURSE || { screens: [] };
  var screens = C.screens || [];
  var i = 0;
  var answered = {}; // questionScreenIndex -> { chosen, correct }

  var stage = document.getElementById('stage');
  var fill = document.getElementById('progress-fill');
  var rail = document.getElementById('progress-rail');
  var counter = document.getElementById('counter');
  var backBtn = document.getElementById('back');
  var nextBtn = document.getElementById('next');
  var live = document.getElementById('live');

  function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
  function el(html){var d=document.createElement('div');d.innerHTML=html.trim();return d.firstChild;}
  function announce(msg){ if(live){ live.textContent=''; setTimeout(function(){ live.textContent=msg; },30); } }
  function qScreens(){return screens.filter(function(s){return s.type==='question';});}
  function totalQuestions(){return qScreens().length;}

  // ---------- resume (SCORM suspend_data) ----------
  function encodeState(){
    var parts=[]; Object.keys(answered).forEach(function(k){ parts.push(k+':'+answered[k].chosen); });
    return i+'|'+parts.join(',');
  }
  function restoreState(){
    if(!window.SCORM || !SCORM.available()) return;
    var raw=SCORM.getSuspend()||''; if(!raw) return;
    try{
      var bits=raw.split('|'); var savedI=parseInt(bits[0],10);
      (bits[1]||'').split(',').filter(Boolean).forEach(function(p){
        var kv=p.split(':'); var qi=parseInt(kv[0],10), ch=parseInt(kv[1],10);
        var s=screens[qi]; if(s&&s.type==='question'){ var correctIx=s.options.findIndex(function(o){return o.correct;}); answered[qi]={chosen:ch,correct:ch===correctIx}; }
      });
      if(!isNaN(savedI)&&savedI>=0&&savedI<screens.length) i=savedI;
    }catch(e){}
  }
  function persist(){
    if(window.SCORM && SCORM.available()){ SCORM.setBookmark(i); SCORM.setSuspend(encodeState()); }
  }

  // ---------- render ----------
  function render(){
    var s = screens[i];
    stage.innerHTML='';
    var node = ({cover:renderCover,module:renderModule,lesson:renderLesson,video:renderVideo,reading:renderReading,
                 quizIntro:renderQuizIntro,question:renderQuestion,summary:renderSummary}[s.type]||function(){return el('<section class="screen"></section>');})(s);
    stage.appendChild(node);
    window.scrollTo(0,0);

    var pct = Math.round((i/(screens.length-1))*100);
    fill.style.width = pct+'%';
    if(rail){ rail.setAttribute('aria-valuenow', String(i+1)); }
    counter.textContent=(i+1)+' / '+screens.length;
    backBtn.disabled = i===0;
    var isQ = s.type==='question';
    nextBtn.disabled = i>=screens.length-1 || (isQ && !answered[i]);
    nextBtn.textContent = i>=screens.length-1 ? 'Finish' : 'Next';

    // focus the heading for screen-reader + keyboard users
    var h = node.querySelector('[data-focus]');
    if(h){ h.setAttribute('tabindex','-1'); h.focus({preventScroll:true}); }
    announce('Screen '+(i+1)+' of '+screens.length+'. '+screenLabel(s));
    persist();
  }
  function screenLabel(s){
    if(s.type==='question') return 'Question '+s.index+' of '+s.total;
    if(s.type==='cover') return 'Course overview';
    if(s.type==='module') return 'Module: '+(s.title||'');
    if(s.type==='lesson') return 'Lesson: '+(s.title||'');
    if(s.type==='summary') return 'Course summary';
    return (s.eyebrow||s.badge||s.type)+': '+(s.title||'');
  }

  function renderCover(s){
    var outline=(s.items||[]).map(function(it,n){
      return '<li class="outline-item"><span class="ix" aria-hidden="true">'+(n+1)+'</span><span>'+esc(it)+'</span></li>';
    }).join('');
    return el('<section class="screen" aria-label="Course overview"><div class="cover">'+
      '<p class="kicker">'+esc(s.kicker||'Course')+'</p>'+
      '<h1 data-focus>'+esc(s.title)+'</h1>'+
      (s.subtitle?'<p class="cover-sub">'+esc(s.subtitle)+'</p>':'')+
      (outline?'<ul class="outline">'+outline+'</ul>':'')+
      '</div></section>');
  }
  function renderModule(s){
    return el('<section class="screen module-screen">'+
      '<p class="pill pill-navy">Module</p>'+
      '<h1 class="title" data-focus>'+esc(s.title)+'</h1>'+
      '<div class="accent-rule"></div>'+
      (s.subtitle?'<p class="body-text" style="color:var(--slate-muted)">'+esc(s.subtitle)+'</p>':'')+
      '</section>');
  }
  function renderLesson(s){
    return el('<section class="screen lesson-screen">'+
      '<p class="eyebrow">'+esc(s.eyebrow||'Lesson')+'</p>'+
      '<h2 class="title" data-focus>'+esc(s.title)+'</h2>'+
      '<div class="accent-rule"></div>'+
      (s.subtitle?'<p class="body-text" style="color:var(--slate-muted)">'+esc(s.subtitle)+'</p>':'')+
      '</section>');
  }
  function renderVideo(s){
    var track = s.captions ? '<track kind="captions" src="'+esc(s.captions)+'" srclang="en" label="English" default>' : '';
    return el('<section class="screen">'+
      '<p class="eyebrow">'+esc(s.eyebrow||'Video')+'</p>'+
      '<h2 class="title" data-focus>'+esc(s.title)+'</h2>'+
      '<div class="accent-rule"></div>'+
      '<div class="media"><video controls preload="metadata" src="'+esc(s.src)+'" aria-label="'+esc(s.title)+' video">'+track+'</video></div>'+
      (s.captions?'':'<p class="caption">Captions can be added by placing a matching .vtt file in a captions/ folder.</p>')+
      '</section>');
  }
  function renderReading(s){
    return el('<section class="screen">'+
      '<p class="pill pill-navy">Read</p>'+
      '<h2 class="title" data-focus>'+esc(s.title)+'</h2>'+
      '<div class="accent-rule"></div>'+
      '<div class="body-text">'+(s.html||'')+'</div>'+
      '</section>');
  }
  function renderQuizIntro(s){
    return el('<section class="screen" style="text-align:center;padding-top:18px;">'+
      '<p class="pill pill-navy">Graded Quiz</p>'+
      '<h2 class="title" data-focus style="font-size:48px;">'+esc(s.title)+'</h2>'+
      '<div class="accent-rule" style="margin:0 auto 26px;"></div>'+
      '<p class="body-text" style="color:var(--slate-muted)">'+s.count+' questions. Answer each, then select Check Answer. Your score appears at the end.</p>'+
      '</section>');
  }
  function renderQuestion(s){
    var opts=s.options.map(function(o,n){
      return '<div class="option" role="radio" aria-checked="false" tabindex="'+(n===0?'0':'-1')+'" data-n="'+n+'">'+
        '<span class="radio" aria-hidden="true"></span><span class="opt-text">'+esc(o.text)+'</span></div>';
    }).join('');
    var node=el('<section class="screen">'+
      '<p class="eyebrow" data-focus>Question '+s.index+' of '+s.total+'</p>'+
      '<h2 class="q-question" id="qtext">'+esc(s.question)+'</h2>'+
      '<div class="options" role="radiogroup" aria-labelledby="qtext">'+opts+'</div>'+
      '<div class="feedback" role="status"><p class="fb-head"></p><p class="fb-body"></p></div>'+
      '<div style="margin-top:24px;"><button class="btn btn-primary btn-lg" id="check">Check Answer</button></div>'+
      '</section>');
    wireQuestion(node,s);
    return node;
  }
  function wireQuestion(node,s){
    var opts=[].slice.call(node.querySelectorAll('.option'));
    var checkBtn=node.querySelector('#check');
    var fb=node.querySelector('.feedback');
    var chosen = answered[i] ? answered[i].chosen : -1;
    var done = !!answered[i];

    function roving(){ opts.forEach(function(o,n){ o.setAttribute('tabindex', n===Math.max(chosen,0)?'0':'-1'); }); }
    function select(n){
      if(done) return; chosen=n;
      opts.forEach(function(o,k){ o.classList.toggle('selected',k===n); o.setAttribute('aria-checked', k===n?'true':'false'); });
      roving(); checkBtn.disabled=false; opts[n].focus();
    }
    opts.forEach(function(o,n){
      o.addEventListener('click', function(){ select(n); });
      o.addEventListener('keydown', function(e){
        if(done) return;
        if(e.key===' '||e.key==='Enter'){ e.preventDefault(); select(n); }
        else if(e.key==='ArrowDown'||e.key==='ArrowRight'){ e.preventDefault(); select((n+1)%opts.length); }
        else if(e.key==='ArrowUp'||e.key==='ArrowLeft'){ e.preventDefault(); select((n-1+opts.length)%opts.length); }
      });
    });
    checkBtn.disabled = chosen<0;

    function reveal(){
      var correctIx=s.options.findIndex(function(o){return o.correct;});
      opts.forEach(function(o,n){
        o.classList.add('locked'); o.setAttribute('aria-disabled','true'); o.setAttribute('tabindex','-1');
        if(n===correctIx) o.classList.add('correct');
        else if(n===chosen) o.classList.add('wrong');
      });
      var ok=chosen===correctIx;
      fb.classList.add('show', ok?'ok':'no');
      node.querySelector('.fb-head').textContent = ok?'Correct':'Not quite';
      var fbText = (s.options[chosen] && s.options[chosen].feedback) || s.options[correctIx].feedback || '';
      node.querySelector('.fb-body').textContent = fbText;
      checkBtn.style.display='none';
      answered[i]={chosen:chosen,correct:ok};
      nextBtn.disabled = i>=screens.length-1;
      announce((ok?'Correct. ':'Not quite. ')+fbText);
      reportProgress(); persist();
      nextBtn.focus();
    }
    if(done){ reveal(); }
    else { checkBtn.addEventListener('click', function(){ if(chosen>=0) reveal(); }); roving(); }
  }
  function renderSummary(s){
    var total=totalQuestions();
    var correct=Object.keys(answered).reduce(function(a,k){return a+(answered[k].correct?1:0);},0);
    var pct=total?Math.round(correct/total*100):0;
    var pass=pct>=(C.passPercentage||50);
    reportFinal(pct,pass);
    announce('Course complete. You scored '+pct+' percent.');
    return el('<section class="screen summary">'+
      '<p class="pill pill-navy">'+(pass?'Course Complete':'Keep Going')+'</p>'+
      '<div class="scorering" role="img" aria-label="Score '+pct+' percent"><div class="pct">'+pct+'%</div><div class="lbl">Your Score</div></div>'+
      '<h2 class="title" data-focus style="text-align:center;">'+(pass?'Well done!':'Almost there')+'</h2>'+
      '<p class="body-text" style="text-align:center;color:var(--slate-muted)">You answered '+correct+' of '+total+' questions correctly.</p>'+
      (total>correct?'<div style="margin-top:18px;"><button class="btn btn-ghost" id="retry">Retry quiz</button></div>':'')+
      '</section>');
  }

  function reportProgress(){
    var total=totalQuestions();
    var correct=Object.keys(answered).reduce(function(a,k){return a+(answered[k].correct?1:0);},0);
    if(window.SCORM) SCORM.setScore(total?Math.round(correct/total*100):0,0,100);
  }
  function reportFinal(pct,pass){ if(window.SCORM){ SCORM.setScore(pct,0,100); SCORM.setComplete(pass); } }

  function go(d){ var n=i+d; if(n<0||n>=screens.length) return; i=n; render(); }
  backBtn.addEventListener('click', function(){ go(-1); });
  nextBtn.addEventListener('click', function(){ if(i<screens.length-1) go(1); });
  document.addEventListener('click', function(e){
    if(e.target && e.target.id==='retry'){ answered={}; i=screens.findIndex(function(s){return s.type==='quizIntro';}); if(i<0)i=0; render(); }
  });
  // global keyboard: left/right arrows page between screens (when not inside a radiogroup)
  document.addEventListener('keydown', function(e){
    if(e.target.closest && e.target.closest('.options')) return;
    if(e.key==='ArrowRight' && !nextBtn.disabled){ go(1); }
    else if(e.key==='ArrowLeft' && !backBtn.disabled){ go(-1); }
  });

  if(window.SCORM){ SCORM.init(); restoreState(); }
  window.addEventListener('beforeunload', function(){ if(window.SCORM){ persist(); SCORM.finish(); } });
  render();
})();

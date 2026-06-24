/* SCORM 1.2 runtime wrapper — hardened: find API, init/finish, score, completion,
   bookmark (lesson_location), resume (suspend_data), and session time. */
var SCORM = (function () {
  var api = null, started = false, finished = false, startMs = Date.now();

  function findAPI(win) {
    var tries = 0;
    while (win && !win.API && win.parent && win.parent !== win && tries < 12) { win = win.parent; tries++; }
    return win && win.API ? win.API : null;
  }
  function get() {
    if (api) return api;
    api = findAPI(window);
    if (!api && window.opener) api = findAPI(window.opener);
    return api;
  }
  function set(k, v) { var a = get(); if (a) a.LMSSetValue(k, String(v)); }
  function commit() { var a = get(); if (a) a.LMSCommit(''); }

  // SCORM 1.2 CMITimespan: HHHH:MM:SS.SS
  function sessionTime() {
    var s = Math.floor((Date.now() - startMs) / 1000);
    var hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return p(hh) + ':' + p(mm) + ':' + p(ss) + '.00';
  }

  return {
    available: function () { return !!get(); },
    init: function () {
      var a = get(); if (!a || started) return;
      a.LMSInitialize('');
      var status = a.LMSGetValue('cmi.core.lesson_status');
      if (!status || status === 'not attempted' || status === 'unknown') {
        a.LMSSetValue('cmi.core.lesson_status', 'incomplete');
      }
      a.LMSSetValue('cmi.core.exit', 'suspend'); // allow resume by default
      a.LMSCommit('');
      started = true;
    },
    getBookmark: function () { var a = get(); return a ? a.LMSGetValue('cmi.core.lesson_location') : ''; },
    setBookmark: function (loc) { set('cmi.core.lesson_location', loc); commit(); },
    getSuspend: function () { var a = get(); return a ? a.LMSGetValue('cmi.suspend_data') : ''; },
    setSuspend: function (data) { set('cmi.suspend_data', String(data).slice(0, 4000)); commit(); },
    setScore: function (raw, min, max) {
      set('cmi.core.score.raw', raw); set('cmi.core.score.min', min == null ? 0 : min);
      set('cmi.core.score.max', max == null ? 100 : max); commit();
    },
    setComplete: function (passed) {
      var status = passed === false ? 'failed' : (passed === true ? 'passed' : 'completed');
      set('cmi.core.lesson_status', status);
      var a = get(); if (a) a.LMSSetValue('cmi.core.exit', ''); // finished, no resume needed
      commit();
    },
    finish: function () {
      var a = get(); if (!a || finished) return; finished = true;
      a.LMSSetValue('cmi.core.session_time', sessionTime());
      a.LMSCommit(''); a.LMSFinish('');
    }
  };
})();

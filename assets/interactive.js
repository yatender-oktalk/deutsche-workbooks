/* ==========================================================================
   interactive.js  —  turn a print-first workbook page into a fillable quiz
   --------------------------------------------------------------------------
   Injected by app-shell.js. Self-gates: only runs on pages that have
   `.section .exercise .answer-block` (the grammar workbooks + some
   exam-prep pages). Adds a Print ⇄ Interaktiv toggle to `.controls`.

   In interactive mode each exercise gets an input field; the answer box is
   hidden until checked. Short gap-fill answers (≤ 3 words, no circled
   digits) are auto-graded with light typo tolerance; anything sentence-
   length reveals the model answer with a "Hatte ich / Nochmal" self-grade.
   Answers + results + revealed state are saved per page in localStorage
   so a reload resumes where you left off. Nothing leaves the device.
   Print mode is the original page, untouched.
   ========================================================================== */
(function () {
  "use strict";

  if (!document.querySelector(".section .exercise .answer-block, .section .exercise .model-answer-block")) return;

  var MODE_KEY = "dw.workbookMode";               // "print" | "interactive"
  var STORE_KEY = "dw.wb:" + location.pathname;

  function readMode() {
    var m = null; try { m = localStorage.getItem(MODE_KEY); } catch (e) {}
    if (m === "print" || m === "interactive") return m;
    return (window.matchMedia && window.matchMedia("(max-width: 640px)").matches) ? "interactive" : "print";
  }
  function writeMode(m) { try { localStorage.setItem(MODE_KEY, m); } catch (e) {} }

  var state = { a: {}, r: {}, shown: {} };
  try {
    var raw = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
    if (raw && typeof raw === "object") {
      state.a = raw.a || {}; state.r = raw.r || {}; state.shown = raw.shown || {};
    }
  } catch (e) {}
  var saveT;
  function persist() {
    clearTimeout(saveT);
    saveT = setTimeout(function () {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {}
    }, 250);
  }

  /* ---- helpers ---------------------------------------------------------- */

  function norm(s) {
    return String(s).toLowerCase()
      .replace(/[„“”"‚‘’.,;:!?()\[\]…–—-]/g, " ")
      .replace(/\s+/g, " ").trim();
  }
  function coreAnswer(ab) {
    var c = ab.cloneNode(true);
    c.querySelectorAll(".label, .why").forEach(function (n) { n.remove(); });
    return (c.textContent || "").replace(/\s+/g, " ").trim();
  }
  function variantsOf(core) {
    return core.split(/\s*\/\s*|\s+oder\s+/i).map(function (v) { return norm(v); }).filter(Boolean);
  }
  function lev(a, b) {
    if (a === b) return 0;
    var m = a.length, n = b.length;
    if (!m) return n; if (!n) return m;
    var prev = [], i, j;
    for (j = 0; j <= n; j++) prev[j] = j;
    for (i = 1; i <= m; i++) {
      var cur = [i];
      for (j = 1; j <= n; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1));
      }
      prev = cur;
    }
    return prev[n];
  }
  function gradeShort(userText, core) {
    var u = norm(userText);
    if (!u) return "empty";
    var vs = variantsOf(core);
    for (var i = 0; i < vs.length; i++) {
      if (u === vs[i] || u.replace(/\s/g, "") === vs[i].replace(/\s/g, "")) return "ok";
    }
    for (var k = 0; k < vs.length; k++) {
      var tol = Math.max(1, Math.floor(vs[k].length * 0.16));
      if (lev(u, vs[k]) <= tol) return "close";
    }
    return "no";
  }

  /* ---- css ------------------------------------------------------------- */

  var style = document.createElement("style");
  style.textContent = [
    ".dw-ix-bar{display:flex;flex-wrap:wrap;gap:10px 14px;align-items:center;margin:14px 0 4px;font-family:var(--sans);font-size:12.5px}",
    ".dw-ix-bar button{font-family:var(--sans);font-size:12.5px;padding:6px 12px;border:1px solid var(--ink);background:var(--paper);color:var(--ink);cursor:pointer}",
    ".dw-ix-bar .dw-ix-primary{background:var(--ink);color:var(--paper);font-weight:700}",
    ".dw-ix-prog{color:var(--muted)}",
    ".dw-ix-prog b{color:var(--ink)}",
    ".dw-ix-reset{border:none!important;background:none!important;color:var(--muted)!important;text-decoration:underline;padding:0!important;cursor:pointer;font-family:var(--sans);font-size:12px}",
    "body:not(.dw-ix-on) .dw-ix-field,body:not(.dw-ix-on) .dw-ix-btns,body:not(.dw-ix-on) .dw-ix-fb{display:none!important}",
    ".dw-ix-on .exercise .write-line,.dw-ix-on .exercise .write-area{display:none!important}",
    ".dw-ix-on .exercise .answer-block[data-ixhide],.dw-ix-on .exercise .model-answer-block[data-ixhide]{display:none!important}",
    ".dw-ix-field{width:100%;box-sizing:border-box;margin:8px 0 0;padding:9px 11px;font-family:var(--serif);font-size:16px;line-height:1.5;border:1px solid var(--rule-strong);background:var(--paper);color:var(--ink)}",
    "textarea.dw-ix-field{min-height:70px;resize:vertical}",
    ".dw-ix-field.is-ok{border-color:#2f7d32;box-shadow:inset 3px 0 0 #2f7d32}",
    ".dw-ix-field.is-close{border-color:var(--signal);box-shadow:inset 3px 0 0 var(--signal)}",
    ".dw-ix-field.is-no{border-color:#b3261e;box-shadow:inset 3px 0 0 #b3261e}",
    ".dw-ix-btns{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0 0}",
    ".dw-ix-btns button{font-family:var(--sans);font-size:12.5px;padding:7px 13px;border:1px solid var(--ink);background:var(--paper);color:var(--ink);cursor:pointer}",
    ".dw-ix-btns .dw-ix-primary{background:var(--ink);color:var(--paper);font-weight:700}",
    ".dw-ix-fb{margin:8px 0 0;font-family:var(--sans);font-size:12.5px;line-height:1.5}",
    ".dw-ix-fb .tag{font-weight:700}",
    ".dw-ix-fb.is-ok .tag{color:#2f7d32}",
    ".dw-ix-fb.is-close .tag{color:var(--signal)}",
    ".dw-ix-fb.is-no .tag{color:#b3261e}",
    "@media print{.dw-ix-bar,.dw-ix-field,.dw-ix-btns,.dw-ix-fb{display:none!important}" +
      ".exercise .write-line,.exercise .write-area,.exercise .answer-block,.exercise .model-answer-block{display:block!important}}"
  ].join("");
  document.head.appendChild(style);

  /* ---- build the interactive layer once ------------------------------- */

  var items = [];
  var built = false;

  function build() {
    if (built) return;
    built = true;

    var exNodes = document.querySelectorAll(".section .exercise");
    exNodes.forEach(function (ex) {
      var ab = ex.querySelector(".answer-block");
      var mb = ex.querySelector(".model-answer-block");
      if (!ab && !mb) return;                       // e.g. blank template rows

      var idx = items.length;
      var line = ex.querySelector(".write-line");
      var area = ex.querySelector(".write-area");
      var core = ab ? coreAnswer(ab) : "";
      var circled = /[①-⑳]/.test(core);
      var wordCount = core ? core.split(/\s+/).length : 0;
      var autoGradable = !!ab && !mb && !circled && wordCount > 0 && wordCount <= 3;
      var big = !!mb || circled || wordCount > 6 || (area && area.classList.contains("tall"));

      var input = document.createElement(big ? "textarea" : "input");
      input.className = "dw-ix-field";
      if (!big) input.type = "text";
      input.setAttribute("aria-label", "Deine Antwort");
      input.placeholder = mb ? "Dein Text (wird nicht bewertet)…" : "Deine Antwort…";
      if (state.a[idx] != null) input.value = state.a[idx];

      var btns = document.createElement("div");
      btns.className = "dw-ix-btns";
      var checkBtn = document.createElement("button");
      checkBtn.type = "button";
      checkBtn.className = "dw-ix-primary";
      checkBtn.textContent = autoGradable ? "Prüfen" : "Lösung zeigen";
      var againBtn = document.createElement("button");
      againBtn.type = "button";
      againBtn.textContent = "Zurücksetzen";
      againBtn.hidden = true;
      btns.appendChild(checkBtn);
      btns.appendChild(againBtn);

      var fb = document.createElement("div");
      fb.className = "dw-ix-fb";
      fb.hidden = true;

      var answerBox = ab || mb;
      var anchor = area || line || answerBox;
      anchor.parentNode.insertBefore(input, anchor.nextSibling);
      input.parentNode.insertBefore(btns, input.nextSibling);
      btns.parentNode.insertBefore(fb, btns.nextSibling);

      var it = {
        idx: idx, ex: ex, input: input, btns: btns, fb: fb, checkBtn: checkBtn, againBtn: againBtn,
        answerBox: answerBox, autoGradable: autoGradable, core: core, isModel: !!mb
      };
      items.push(it);

      input.addEventListener("input", function () {
        state.a[idx] = input.value;
        persist();
      });
      checkBtn.addEventListener("click", function () { doCheck(it); });
      againBtn.addEventListener("click", function () { doReset(it); });

      // restore saved result / shown state
      if (state.r[idx]) applyResult(it, state.r[idx], true);
      else if (state.shown[idx]) revealModel(it, true);
    });

    injectBar();
    updateProgress();
  }

  function applyResult(it, result, silent) {
    it.input.classList.remove("is-ok", "is-close", "is-no");
    it.fb.classList.remove("is-ok", "is-close", "is-no");
    it.answerBox.removeAttribute("data-ixhide");
    it.againBtn.hidden = false;
    it.checkBtn.hidden = true;
    it.fb.hidden = false;

    if (result === "ok") {
      it.input.classList.add("is-ok"); it.fb.classList.add("is-ok");
      it.fb.innerHTML = '<span class="tag">✓ Richtig.</span> Lösung unten zum Vergleich.';
    } else if (result === "close") {
      it.input.classList.add("is-close"); it.fb.classList.add("is-close");
      it.fb.innerHTML = '<span class="tag">~ Fast.</span> Kleiner Fehler — vergleiche mit der Lösung unten.';
    } else if (result === "no") {
      it.input.classList.add("is-no"); it.fb.classList.add("is-no");
      it.fb.innerHTML = '<span class="tag">✗ Noch nicht.</span> Lösung unten.';
    } else if (result === "self-ok") {
      it.fb.classList.add("is-ok");
      it.fb.innerHTML = '<span class="tag">✓ Selbst als richtig markiert.</span>';
    } else if (result === "self-no") {
      it.fb.classList.add("is-no");
      it.fb.innerHTML = '<span class="tag">✗ Nochmal üben.</span>';
    }
    if (!silent) {
      state.r[it.idx] = result; persist(); updateProgress();
      if (window.DW && DW.logActivity) {
        DW.logActivity("workbook", "exercise", { page: location.pathname.split("/").pop(), r: result });
      }
    }
  }

  function revealModel(it, silent) {
    it.answerBox.removeAttribute("data-ixhide");
    it.checkBtn.hidden = true;
    it.fb.hidden = false;
    it.fb.classList.remove("is-ok", "is-no");
    it.fb.innerHTML = it.isModel
      ? 'Modellantwort unten. Vergleiche selbst — Inhalt, Grammatik, Wortstellung.'
      : 'Lösung unten. Hattest du es im Kern richtig? ' +
        '<button type="button" class="dw-ix-sg" data-v="self-ok" style="border:1px solid #2f7d32;background:none;color:#2f7d32;padding:3px 9px;margin:4px 4px 0 0;cursor:pointer;font-family:var(--sans);font-size:12px">Hatte ich ✓</button>' +
        '<button type="button" class="dw-ix-sg" data-v="self-no" style="border:1px solid #b3261e;background:none;color:#b3261e;padding:3px 9px;margin-top:4px;cursor:pointer;font-family:var(--sans);font-size:12px">Nochmal</button>';
    it.fb.querySelectorAll(".dw-ix-sg").forEach(function (b) {
      b.addEventListener("click", function () {
        applyResult(it, b.getAttribute("data-v"));
      });
    });
    it.againBtn.hidden = false;
    if (!silent) { state.shown[it.idx] = 1; persist(); }
  }

  function doCheck(it) {
    if (it.autoGradable) {
      var res = gradeShort(it.input.value, it.core);
      if (res === "empty") { flash(it.input); return; }
      applyResult(it, res);
    } else {
      revealModel(it);
    }
  }

  function doReset(it) {
    delete state.r[it.idx]; delete state.shown[it.idx];
    it.input.classList.remove("is-ok", "is-close", "is-no");
    it.input.value = ""; delete state.a[it.idx];
    it.fb.hidden = true; it.fb.innerHTML = "";
    it.checkBtn.hidden = false;
    it.againBtn.hidden = true;
    it.answerBox.setAttribute("data-ixhide", "");
    persist(); updateProgress();
    it.input.focus();
  }

  function flash(el) {
    el.style.transition = "background .15s";
    el.style.background = "rgba(179,38,30,.12)";
    setTimeout(function () { el.style.background = ""; }, 300);
  }

  /* ---- top bar (toggle + progress) ---------------------------------- */

  var bar, progEl;
  function injectBar() {
    bar = document.createElement("div");
    bar.className = "dw-ix-bar no-print";

    var toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "dw-ix-primary";
    toggle.addEventListener("click", function () {
      var next = document.body.classList.contains("dw-ix-on") ? "print" : "interactive";
      writeMode(next); apply(next);
    });
    bar._toggle = toggle;

    progEl = document.createElement("span");
    progEl.className = "dw-ix-prog";

    var reset = document.createElement("button");
    reset.type = "button";
    reset.className = "dw-ix-reset";
    reset.textContent = "Alles zurücksetzen";
    reset.addEventListener("click", function () {
      if (!confirm("Alle Antworten auf dieser Seite löschen?")) return;
      state = { a: {}, r: {}, shown: {} };
      try { localStorage.removeItem(STORE_KEY); } catch (e) {}
      items.forEach(function (it) {
        it.input.value = ""; it.input.classList.remove("is-ok", "is-close", "is-no");
        it.fb.hidden = true; it.fb.innerHTML = "";
        it.checkBtn.hidden = false; it.againBtn.hidden = true;
        it.answerBox.setAttribute("data-ixhide", "");
      });
      updateProgress();
    });

    bar.appendChild(toggle);
    bar.appendChild(progEl);
    bar.appendChild(reset);

    var host = document.querySelector(".doc-header") || document.querySelector(".controls") || document.body;
    host.parentNode.insertBefore(bar, host.nextSibling);
  }

  function updateProgress() {
    if (!progEl) return;
    var total = items.length;
    var done = 0, ok = 0;
    items.forEach(function (it) {
      var r = state.r[it.idx];
      if (r) { done++; if (r === "ok" || r === "close" || r === "self-ok") ok++; }
      else if (state.shown[it.idx]) done++;
    });
    progEl.innerHTML = "<b>" + done + "</b> / " + total + " bearbeitet · <b>" + ok + "</b> richtig";
    if (bar && bar._toggle) {
      bar._toggle.textContent = document.body.classList.contains("dw-ix-on")
        ? "🖨  Zur Druckansicht" : "▶  Interaktiv üben";
    }
  }

  /* ---- apply a mode ------------------------------------------------- */

  function apply(mode) {
    if (mode === "interactive") {
      document.body.classList.add("dw-ix-on");
      items.forEach(function (it) {
        if (!state.r[it.idx] && !state.shown[it.idx]) it.answerBox.setAttribute("data-ixhide", "");
      });
    } else {
      document.body.classList.remove("dw-ix-on");
      items.forEach(function (it) { it.answerBox.removeAttribute("data-ixhide"); });
    }
    updateProgress();
  }

  // build the interactive layer up front (hidden by CSS in print mode) so the
  // Print ⇄ Interaktiv toggle is always present, then apply the saved mode.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { build(); apply(readMode()); });
  } else {
    build();
    apply(readMode());
  }
})();

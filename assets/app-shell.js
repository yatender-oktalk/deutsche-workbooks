/* ==========================================================================
   app-shell.js  —  the "Register" app chrome, vanilla, no dependencies
   --------------------------------------------------------------------------
   Included (defer) at the end of <body> on every current-format page:

       <script defer src="<REL>/assets/app-shell.js"></script>

   It:
     · injects a fixed top bar (menu button + breadcrumb + exam countdown)
     · builds a slide-over "Index" for jump-anywhere navigation ( "/" opens it )
     · on first visit, runs a 3-step splash (name -> level -> optional exam date)
     · stores the profile in localStorage under  dw.profile
     · exposes window.DW for index.html and study-plan.html to build the hub
       "Diese Woche" panel and the generated study timeline

   The page list lives here once (DW.PAGES) and feeds both the slide-over
   index and the hub register.
   ========================================================================== */
(function () {
  "use strict";

  /* ---- where is the site root? derive it from our own <script src> ---- */
  var here = document.currentScript && document.currentScript.src;
  if (!here) {
    var ss = document.getElementsByTagName("script");
    for (var i = ss.length - 1; i >= 0; i--) {
      if (ss[i].src && /app-shell\.js/.test(ss[i].src)) { here = ss[i].src; break; }
    }
  }
  var ROOT = (here || "").replace(/assets\/app-shell\.js.*$/, "");
  var CURRENT = location.href.replace(/[?#].*$/, "");

  /* ====================================================================
     Page registry
     ==================================================================== */

  var GROUPS = [
    { key: "grammar",     ord: "01", label: "Grammatik",       en: "Grammar" },
    { key: "exam",        ord: "02", label: "Prüfungstraining", en: "Exam practice" },
    { key: "interactive", ord: "03", label: "Üben",             en: "Practice" },
    { key: "reference",   ord: "04", label: "Referenz",         en: "Reference" },
    { key: "legacy",      ord: "05", label: "Ältere Hefte",     en: "Older workbooks" }
  ];

  /* Top level of the register: one bucket per CEFR level, plus interactive and
     reference. Each page lands in exactly one bucket; within a bucket the rows
     are sub-grouped by GROUPS (Grammatik / Prüfungstraining / …). */
  var LEVEL_BUCKETS = [
    { key: "interactive", label: "Interaktiv üben", en: "Interactive practice", lv: "ref",
      match: function (pg) { return pg.g === "interactive"; } },
    { key: "a1", label: "A1", en: "A1", lv: "a1",
      match: function (pg) { return pg.lv === "a1"; } },
    { key: "a2", label: "A2", en: "A2", lv: "a2",
      match: function (pg) { return pg.lv === "a2"; } },
    { key: "b1", label: "B1", en: "B1", lv: "b1",
      match: function (pg) { return pg.lv === "b1" || (pg.g === "exam" && pg.tag === "B1"); } },
    { key: "b2", label: "B2", en: "B2", lv: "b2",
      match: function (pg) { return pg.lv === "b2" || (pg.g === "exam" && pg.tag === "B2"); } },
    { key: "reference", label: "Referenz & Pläne", en: "Reference & plans", lv: "ref",
      match: function (pg) { return pg.g === "reference"; } }
  ];

  var PAGES = [
    // 01 — Grammatik
    { p: "workbooks/A1/workbook-3-artikel-nomen.html",              t: "Artikel, Nomen & Plural",      g: "grammar", lv: "a1", tag: "A1" },
    { p: "workbooks/A1/workbook-4-praesens.html",                   t: "Präsens: Verben konjugieren",  g: "grammar", lv: "a1", tag: "A1" },
    { p: "workbooks/A1/workbook-5-akkusativ.html",                  t: "Der Akkusativ",                g: "grammar", lv: "a1", tag: "A1" },
    { p: "workbooks/A1/workbook-6-possessivartikel.html",           t: "Possessivartikel",            g: "grammar", lv: "a1", tag: "A1" },
    { p: "workbooks/A1/workbook-7-modalverben.html",                t: "Modalverben (A1)",            g: "grammar", lv: "a1", tag: "A1" },
    { p: "workbooks/A1/workbook-8-w-fragen-satzbau.html",           t: "W-Fragen, Satzbau & trennbare Verben", g: "grammar", lv: "a1", tag: "A1" },
    { p: "workbooks/A2/workbook-9-dativ.html",                      t: "Der Dativ",                    g: "grammar", lv: "a2", tag: "A2" },
    { p: "workbooks/A2/workbook-10-wechselpraepositionen.html",     t: "Wechselpräpositionen",         g: "grammar", lv: "a2", tag: "A2" },
    { p: "workbooks/A2/workbook-11-komparativ-superlativ.html",     t: "Komparativ & Superlativ",      g: "grammar", lv: "a2", tag: "A2" },
    { p: "workbooks/A2/workbook-12-nebensaetze.html",               t: "Nebensätze (weil, dass, wenn)", g: "grammar", lv: "a2", tag: "A2" },
    { p: "workbooks/A2/workbook-13-perfekt.html",                   t: "Perfekt & Partizip II",        g: "grammar", lv: "a2", tag: "A2" },
    { p: "workbooks/A2/workbook-14-praeteritum.html",               t: "Präteritum (sein/haben/Modalverben)", g: "grammar", lv: "a2", tag: "A2" },
    { p: "workbooks/A2/workbook-7-adjektivendungen-vergleich.html", t: "Adjektivendungen & Vergleich", g: "grammar", lv: "a2", tag: "A2" },
    { p: "workbooks/A2/workbook-8-reflexive-verben.html",           t: "Reflexive Verben",             g: "grammar", lv: "a2", tag: "A2" },
    { p: "workbooks/B1/workbook-1-praeteritum-perfekt.html",  t: "Präteritum & Perfekt",              g: "grammar", lv: "b1", tag: "B1" },
    { p: "workbooks/B1/workbook-2-passive-voice.html",        t: "Passiv (Vorgangspassiv)",           g: "grammar", lv: "b1", tag: "B1" },
    { p: "workbooks/B1/workbook-3-relative-clauses.html",     t: "Relativsätze",                      g: "grammar", lv: "b1", tag: "B1" },
    { p: "workbooks/B1/workbook-4-genitive-case.html",        t: "Genitiv",                           g: "grammar", lv: "b1", tag: "B1" },
    { p: "workbooks/B1/workbook-5-adjective-declension.html", t: "Adjektivdeklination (komplett)",     g: "grammar", lv: "b1", tag: "B1" },
    { p: "workbooks/B1/workbook-6-konjunktiv-ii.html",        t: "Konjunktiv II & zweiteilige Konnektoren", g: "grammar", lv: "b1", tag: "B1" },
    { p: "workbooks/B1/workbook-7-modalverben.html",          t: "Modalverben — subjektiv & doppelter Infinitiv", g: "grammar", lv: "b1", tag: "B1" },
    { p: "workbooks/B1/workbook-8-satzleiter.html",           t: "Die Satzleiter — Nebensätze stapeln", g: "grammar", lv: "b1", tag: "B1" },
    { p: "workbooks/B2/workbook-1-konjunktiv-i-reported-speech.html", t: "Konjunktiv I & Indirekte Rede", g: "grammar", lv: "b2", tag: "B2" },
    { p: "workbooks/B2/workbook-2-passive-advanced.html",     t: "Passiv mit Modalverben & Zustandspassiv", g: "grammar", lv: "b2", tag: "B2" },
    { p: "workbooks/B2/workbook-3-advanced-connectors.html",  t: "Fortgeschrittene Konnektoren",       g: "grammar", lv: "b2", tag: "B2" },
    { p: "workbooks/B2/workbook-4-nominalization-partizip.html", t: "Nominalisierung & Partizipialattribute", g: "grammar", lv: "b2", tag: "B2" },
    { p: "workbooks/B2/workbook-5-relative-clauses-advanced.html", t: "Relativsätze (fortgeschritten)", g: "grammar", lv: "b2", tag: "B2" },
    { p: "workbooks/B2/workbook-6-futur-modal-speculation.html", t: "Futur I/II & Modalverben der Vermutung", g: "grammar", lv: "b2", tag: "B2" },
    { p: "workbooks/B2/workbook-7-satzkreis.html", t: "Der Satzkreis — Satzumformung", g: "grammar", lv: "b2", tag: "B2" },

    // 02 — Prüfungstraining
    { p: "exam-prep/B1/leseverstehen-practice.html",        t: "Leseverstehen",         g: "exam", lv: "exam", tag: "B1" },
    { p: "exam-prep/B1/hoerverstehen-practice.html",        t: "Hörverstehen",          g: "exam", lv: "exam", tag: "B1" },
    { p: "exam-prep/B1/sprachbausteine-practice.html",      t: "Sprachbausteine",       g: "exam", lv: "exam", tag: "B1" },
    { p: "exam-prep/B1/schriftlicher-ausdruck-guide.html",  t: "Schriftlicher Ausdruck", g: "exam", lv: "exam", tag: "B1" },
    { p: "exam-prep/B2/leseverstehen-practice.html",        t: "Leseverstehen",         g: "exam", lv: "exam", tag: "B2" },
    { p: "exam-prep/B2/hoerverstehen-practice.html",        t: "Hörverstehen",          g: "exam", lv: "exam", tag: "B2" },
    { p: "exam-prep/B2/sprachbausteine-practice.html",      t: "Sprachbausteine",       g: "exam", lv: "exam", tag: "B2" },
    { p: "exam-prep/B2/schriftlicher-ausdruck-guide.html",  t: "Schriftlicher Ausdruck", g: "exam", lv: "exam", tag: "B2" },
    { p: "exam-prep/B2/muendliche-pruefung-guide.html",     t: "Mündliche Prüfung",     g: "exam", lv: "exam", tag: "B2" },

    // 03 — Üben (interactive trainers)
    { p: "vocab/index.html",      t: "Vokabeltrainer",   g: "interactive", lv: "mixed", tag: "A1–B2" },
    { p: "situations/index.html", t: "Gesprächstrainer", g: "interactive", lv: "mixed", tag: "B1–B2" },

    // 04 — Referenz
    { p: "study-plan.html",                        t: "Studienplan & Zeitplan",           g: "reference", lv: "ref", tag: "PLAN" },
    { p: "narration-plan.html",                    t: "Selbstnarration — 3-Wochen-Plan",  g: "reference", lv: "ref", tag: "PLAN" },
    { p: "workbooks/satztraining.html",            t: "Satztraining — Kreis & Leiter (interaktiv)", g: "interactive", lv: "ref", tag: "B1–B2" },
    { p: "workbooks/connectors-reference.html",    t: "Konnektoren — Gesamtübersicht",    g: "reference", lv: "ref", tag: "REF" },
    { p: "cheatsheets/master.html",                t: "Kasus & Pronomen — Spickzettel",   g: "reference", lv: "ref", tag: "REF" },
    { p: "cheatsheets/master-2.html",              t: "Kasus & Pronomen — Spickzettel v2", g: "reference", lv: "ref", tag: "REF" },

    // 05 — Ältere Hefte (legacy Tailwind pages, kept linked, not restyled)
    { p: "workbooks/A1/workbook-1.html",              t: "A1 — Kasus & Possessiv",              g: "legacy", lv: "a1", tag: "A1" },
    { p: "workbooks/A1/workbook-2.html",              t: "A1 — Kasus, Konnektoren, Sprechen",   g: "legacy", lv: "a1", tag: "A1" },
    { p: "workbooks/A2/workbook-1.html",              t: "A2 — Konnektoren",                    g: "legacy", lv: "a2", tag: "A2" },
    { p: "workbooks/A2/workbook-2-modal-verbs.html",  t: "A2 — Modalverben (interaktiv)",       g: "legacy", lv: "a2", tag: "A2" },
    { p: "workbooks/A2/workbook-3-reflexive-verbs.html", t: "A2 — Reflexive Verben (interaktiv)", g: "legacy", lv: "a2", tag: "A2" },
    { p: "workbooks/A2/workbook-4-separable-verbs.html", t: "A2 — Trennbare Verben",            g: "legacy", lv: "a2", tag: "A2" },
    { p: "workbooks/A2/workbook-5-prepositions.html", t: "A2 — Präpositionen",                  g: "legacy", lv: "a2", tag: "A2" },
    { p: "workbooks/A2/workbook-6-perfekt.html",      t: "A2 — Perfekt",                        g: "legacy", lv: "a2", tag: "A2" }
  ];

  var LEVEL_LABELS = {
    a1: "A1", a2: "A2 → B1 Brücke", b1: "B1 Grammatik",
    b2: "B2 Grammatik", exam: "Prüfungstraining", ref: "Referenz", mixed: "Üben"
  };
  var LEVEL_LABELS_EN = {
    a1: "A1", a2: "A2 → B1 bridge", b1: "B1 grammar",
    b2: "B2 grammar", exam: "Exam practice", ref: "Reference", mixed: "Practice"
  };

  /* ====================================================================
     UI language  (chrome only — never the exercise content)
     dw.uiLang = "de" | "en" ; default "de"
     ==================================================================== */

  var LANG = "de";
  try { var _l = localStorage.getItem("dw.uiLang"); if (_l === "en" || _l === "de") LANG = _l; } catch (e) {}
  document.documentElement.setAttribute("data-uilang", LANG);

  function t(de, en) { return (LANG === "en" && en != null) ? en : de; }

  function setUiLang(l) {
    l = (l === "en") ? "en" : "de";
    if (l === LANG) return;
    LANG = l;
    try { localStorage.setItem("dw.uiLang", LANG); } catch (e) {}
    document.documentElement.setAttribute("data-uilang", LANG);
    refreshChrome();
    if (typeof DW.onUiLangChange === "function") DW.onUiLangChange(LANG);
  }

  /* re-render every piece of chrome that carries translatable text */
  function refreshChrome() {
    var crumb = document.querySelector(".dw-crumb");
    if (crumb) crumb.innerHTML = crumbHTML();
    var mw = document.querySelector(".dw-menu-word");
    if (mw) mw.textContent = t("Index", "Index");
    var lb = document.getElementById("dw-lang-btn");
    if (lb) { lb.textContent = LANG === "en" ? "DE" : "EN"; lb.setAttribute("aria-label", t("Sprache der Oberfläche wechseln", "Switch interface language")); }
    var gb = document.getElementById("dw-gloss-btn");
    if (gb) gb.setAttribute("aria-label", t("Seiten-Glossar", "Page glossary"));
    renderCountdown();
    var ih = document.querySelector(".dw-index-head h2");
    if (ih) ih.textContent = t("Index", "Index");
    if (indexFilter) indexFilter.setAttribute("placeholder", t("Filtern…  ( / )", "Filter…  ( / )"));
    var scroll = document.getElementById("dw-index-scroll");
    if (scroll) renderRegister(scroll);
  }

  /* ====================================================================
     Study-plan phase model  (shared with study-plan.html)
     ==================================================================== */

  var PHASES = [
    { key: "setup", title: "Setup", w: 1,
      note: "Prüfungstermin fixieren & anmelden. Plan überfliegen. Kurzer Selbsttest: B1-Text ohne Wörterbuch lesbar?",
      pick: function (pg) { return pg.g === "reference"; } },
    { key: "b1g", title: "B1-Grammatik", w: 4,
      note: "B1-Lücke schließen: Präteritum/Perfekt, Passiv, Relativsätze, Genitiv, Adjektivdeklination, Konjunktiv II.",
      pick: function (pg) { return pg.g === "grammar" && (pg.lv === "a2" || pg.lv === "b1"); } },
    { key: "b1e", title: "B1-Prüfungstechnik", w: 2,
      note: "Checkpoint: heute schon B1-reif? Timed Leseverstehen, Hörverstehen, Sprachbausteine und 2–3 Briefe unter Zeitdruck.",
      pick: function (pg) { return pg.g === "exam" && pg.tag === "B1"; } },
    { key: "b2g", title: "B2-Grammatik", w: 6,
      note: "Der eigentliche Anstieg: Konjunktiv I, erweitertes Passiv, fortgeschrittene Konnektoren, Nominalisierung, Relativsätze, Futur/Vermutung.",
      pick: function (pg) { return pg.g === "grammar" && pg.lv === "b2"; } },
    { key: "b2e", title: "B2-Prüfungstechnik", w: 3,
      note: "Timed B2-Leseverstehen/Hörverstehen/Sprachbausteine; alle 3 Aufsätze unter Zeitdruck schreiben, dann mit den Modelltexten vergleichen.",
      pick: function (pg) { return pg.g === "exam" && pg.tag === "B2"; } },
    { key: "kons", title: "Konsolidierung", w: 2,
      note: "Jeden Spickzettel aus dem Gedächtnis neu schreiben. Schwächste 2–3 Hefte wiederholen. Ein voller Mock. Die letzten 2 Tage ausruhen.",
      pick: function (pg) { return pg.g === "reference"; } }
  ];
  var PHASE_TOTAL = PHASES.reduce(function (s, p) { return s + p.w; }, 0); // 18

  /* ---- date helpers (local, no UTC drift) ---- */
  function parseISO(s) { var a = String(s).split("-"); return new Date(+a[0], +a[1] - 1, +a[2]); }
  function toISO(dt) {
    var p = function (n) { return String(n).padStart(2, "0"); };
    return dt.getFullYear() + "-" + p(dt.getMonth() + 1) + "-" + p(dt.getDate());
  }
  function addDays(dt, n) { var r = new Date(dt); r.setDate(r.getDate() + n); return r; }
  function startOfToday() { var n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); }
  function daysBetween(a, b) { return Math.round((b - a) / 86400000); }

  function fmtDE(dt) {
    return dt.toLocaleDateString("de-DE", { day: "numeric", month: "short" });
  }

  /* Build the generated timeline from an exam date (ISO). */
  function buildTimeline(examISO) {
    var today = startOfToday();
    var exam = parseISO(examISO);
    var totalDays = daysBetween(today, exam);
    var weeksLeft = Math.round(totalDays / 7);
    var usableWeeks = Math.max(6, weeksLeft);           // 6 = one week per phase, the floor
    var compressed = weeksLeft < 12;

    // proportional split, min 1 week each, fix rounding drift onto the biggest phases
    var raw = PHASES.map(function (ph) { return Math.max(1, Math.round(ph.w / PHASE_TOTAL * usableWeeks)); });
    var drift = usableWeeks - raw.reduce(function (s, n) { return s + n; }, 0);
    var order = PHASES.map(function (_, i) { return i; }).sort(function (a, b) { return PHASES[b].w - PHASES[a].w; });
    var oi = 0;
    while (drift !== 0) {
      var idx = order[oi % order.length];
      if (drift > 0) { raw[idx]++; drift--; }
      else if (raw[idx] > 1) { raw[idx]--; drift++; }
      oi++;
      if (oi > 400) break;
    }

    // lay phases out backward from the exam date
    var phases = [];
    var cursorEnd = exam;
    for (var i = PHASES.length - 1; i >= 0; i--) {
      var wk = raw[i];
      var start = addDays(cursorEnd, -wk * 7);
      phases.unshift({
        key: PHASES[i].key, title: PHASES[i].title, note: PHASES[i].note,
        weeks: wk, startISO: toISO(start), endISO: toISO(cursorEnd),
        isNow: today >= start && today < cursorEnd,
        isPast: today >= cursorEnd
      });
      cursorEnd = start;
    }
    // if today is before the whole plan starts, the first phase is "now"
    if (!phases.some(function (p) { return p.isNow; }) && today < parseISO(phases[0].startISO)) {
      phases[0].isNow = true;
    }
    return { weeksLeft: weeksLeft, compressed: compressed, phases: phases, planStartISO: phases[0].startISO };
  }

  function phaseKeyForToday(examISO) {
    var tl = buildTimeline(examISO);
    var now = tl.phases.filter(function (p) { return p.isNow; })[0];
    return now ? now.key : (tl.weeksLeft <= 0 ? "exam" : tl.phases[0].key);
  }

  /* Which pages to surface in the hub "Diese Woche" panel. */
  function currentFocus(profile) {
    profile = profile || readProfile() || {};
    var phaseKey, note, heading;

    if (profile.examDate) {
      var tl = buildTimeline(profile.examDate);
      if (tl.weeksLeft <= 0) {
        return { heading: "Prüfungszeit", note: "Viel Erfolg. Ruhig bleiben, sauber schreiben, die Zeit im Blick behalten.", links: pagesFor(function (pg) { return pg.g === "reference"; }, 3) };
      }
      phaseKey = phaseKeyForToday(profile.examDate);
      var ph = PHASES.filter(function (p) { return p.key === phaseKey; })[0] || PHASES[1];
      heading = ph.title;
      note = ph.note;
      if (tl.compressed) note = "Verdichteter Plan (" + tl.weeksLeft + " Wochen). " + note;
      return { heading: heading, note: note, links: pagesFor(ph.pick, 4) };
    }

    // no exam date -> steer by declared level alone
    var lv = profile.level || "b1";
    if (lv === "a1" || lv === "a2") {
      return { heading: "A2 → B1 Brücke", note: "Adjektivendungen, Vergleich und reflexive Verben abschließen, dann in die B1-Grammatik.", links: pagesFor(function (pg) { return pg.g === "grammar" && pg.lv === "a2"; }, 3) };
    }
    if (lv === "b1") {
      return { heading: "B1-Grammatik", note: "Ein Heft-Abschnitt pro Sitzung — schreiben, Lösung prüfen, Fehler notieren.", links: pagesFor(function (pg) { return pg.g === "grammar" && pg.lv === "b1"; }, 4) };
    }
    return { heading: "B2-Grammatik", note: "~1 Heft pro Woche. Danach B2-Prüfungstechnik unter Zeitdruck.", links: pagesFor(function (pg) { return pg.g === "grammar" && pg.lv === "b2"; }, 4) };
  }

  function pagesFor(pred, n) {
    return PAGES.filter(pred).slice(0, n).map(function (pg) {
      return { title: pg.t, href: ROOT + pg.p, tag: pg.tag };
    });
  }

  /* ====================================================================
     localStorage profile
     ==================================================================== */

  var LS_KEY = "dw.profile";

  function readProfile() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function writeProfile(p) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(p)); } catch (e) {}
  }

  function fireProfileChange() {
    renderCountdown();
    if (typeof window.DW.onProfileChange === "function") {
      try { window.DW.onProfileChange(readProfile()); } catch (e) {}
    }
  }

  /* ====================================================================
     DOM helpers
     ==================================================================== */

  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === "text") n.textContent = attrs[k];
      else if (k === "html") n.innerHTML = attrs[k];
      else if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }

  /* ====================================================================
     Top bar
     ==================================================================== */

  function crumbHTML() {
    var lv = (document.body.className.match(/level-(\w+)/) || [])[1];
    var map = LANG === "en" ? LEVEL_LABELS_EN : LEVEL_LABELS;
    var levelText = lv && map[lv] ? map[lv] : "";
    var title = (document.title || "").split(/[—–|]/)[0].trim();
    var parts = ["Deutsch"];
    if (levelText) parts.push(levelText);
    var lead = parts.join(" · ");
    return "<b>" + lead + "</b>" + (title && title !== "Deutsch Workbooks" ? " · " + title : "");
  }

  function injectTopbar() {
    var bar = el("div", { "class": "dw-topbar no-print" });
    var inner = el("div", { "class": "dw-topbar-inner" });

    var menuBtn = el("button", { "class": "dw-menu-btn", type: "button", "aria-label": t("Index öffnen", "Open index"),
      html: "≡<span class=\"dw-menu-word\">" + t("Index", "Index") + "</span>" });
    menuBtn.addEventListener("click", openIndex);

    var crumb = el("span", { "class": "dw-crumb", html: crumbHTML() });
    var spring = el("span", { "class": "dw-topbar-spring" });

    var glossBtn = el("button", { "class": "dw-tb-btn", id: "dw-gloss-btn", type: "button",
      "aria-label": t("Seiten-Glossar", "Page glossary"), text: "📖" });
    glossBtn.addEventListener("click", function () { if (window.DWGloss) window.DWGloss.toggle(); });

    var langBtn = el("button", { "class": "dw-tb-btn", id: "dw-lang-btn", type: "button",
      "aria-label": t("Sprache der Oberfläche wechseln", "Switch interface language"),
      text: LANG === "en" ? "DE" : "EN" });
    langBtn.addEventListener("click", function () { setUiLang(LANG === "en" ? "de" : "en"); });

    var cd = el("button", { "class": "dw-countdown", type: "button", id: "dw-countdown",
      "aria-label": t("Prüfungstermin bearbeiten", "Edit exam date"), text: "…" });
    cd.addEventListener("click", openProfileEditor);

    inner.appendChild(menuBtn);
    inner.appendChild(crumb);
    inner.appendChild(spring);
    inner.appendChild(glossBtn);
    inner.appendChild(langBtn);
    inner.appendChild(cd);
    bar.appendChild(inner);

    var spacer = el("div", { "class": "dw-topbar-spacer no-print" });
    document.body.insertBefore(spacer, document.body.firstChild);
    document.body.insertBefore(bar, document.body.firstChild);
    renderCountdown();
  }

  function renderCountdown() {
    var cd = document.getElementById("dw-countdown");
    if (!cd) return;
    var p = readProfile();
    if (!p || !p.examDate) {
      cd.removeAttribute("data-live");
      cd.textContent = t("Kein Termin", "No exam date");
      return;
    }
    var d = daysBetween(startOfToday(), parseISO(p.examDate));
    cd.setAttribute("data-live", "");
    if (d < 0) cd.textContent = t("Prüfung vorbei", "Exam passed");
    else if (d === 0) cd.textContent = t("Prüfung heute", "Exam today");
    else if (d <= 21) cd.textContent = t("noch " + d + " Tag" + (d === 1 ? "" : "e"), d + (d === 1 ? " day left" : " days left"));
    else cd.textContent = t("noch " + Math.round(d / 7) + " Wochen", Math.round(d / 7) + " weeks left");
  }

  /* ====================================================================
     Register list  (rendered into the slide-over index and the hub)
     ==================================================================== */

  function renderRegister(mount) {
    mount.innerHTML = "";
    LEVEL_BUCKETS.forEach(function (lvl) {
      var items = PAGES.filter(lvl.match);
      if (!items.length) return;

      var bucket = el("div", { "class": "dw-bucket" });
      var bhead = el("div", { "class": "dw-bucket-head lv-" + lvl.lv });
      bhead.appendChild(el("span", { "class": "dw-bucket-label", text: t(lvl.label, lvl.en) }));
      bhead.appendChild(el("span", { "class": "dw-bucket-count", text: String(items.length) }));
      bucket.appendChild(bhead);

      var subs = GROUPS.filter(function (grp) {
        return items.some(function (pg) { return pg.g === grp.key; });
      });
      subs.forEach(function (grp) {
        var g = el("div", { "class": "dw-group" });
        if (subs.length > 1) {
          g.appendChild(el("div", { "class": "dw-group-head", text: t(grp.label, grp.en) }));
        }
        items.filter(function (pg) { return pg.g === grp.key; }).forEach(function (pg) {
          var href = ROOT + pg.p;
          var row = el("a", { "class": "dw-row", href: href });
          if (href === CURRENT) row.setAttribute("aria-current", "page");
          row.appendChild(el("span", { "class": "dw-row-title", text: pg.t }));
          row.appendChild(el("span", { "class": "dw-row-lead" }));
          row.appendChild(el("span", { "class": "dw-row-tag lv-" + pg.lv, text: pg.tag }));
          g.appendChild(row);
        });
        bucket.appendChild(g);
      });
      mount.appendChild(bucket);
    });
  }

  /* ====================================================================
     Slide-over index
     ==================================================================== */

  var scrim, indexPanel, indexFilter;

  function buildIndex() {
    scrim = el("div", { "class": "dw-scrim no-print" });
    scrim.addEventListener("click", closeOverlays);

    indexPanel = el("aside", { "class": "dw-index no-print", "aria-hidden": "true" });
    var head = el("div", { "class": "dw-index-head" });
    head.appendChild(el("h2", { text: t("Index", "Index") }));
    var x = el("button", { "class": "dw-index-close", type: "button", "aria-label": t("Schließen", "Close"), text: "×" });
    x.addEventListener("click", closeOverlays);
    head.appendChild(x);

    indexFilter = el("input", { "class": "dw-index-filter", type: "search",
      placeholder: t("Filtern…  ( / )", "Filter…  ( / )"), "aria-label": t("Seiten filtern", "Filter pages") });
    indexFilter.addEventListener("input", applyFilter);
    indexFilter.addEventListener("keydown", function (e) { if (e.key === "Escape") closeOverlays(); });

    var scroll = el("div", { "class": "dw-index-scroll", id: "dw-index-scroll" });

    indexPanel.appendChild(head);
    indexPanel.appendChild(indexFilter);
    indexPanel.appendChild(scroll);
    document.body.appendChild(scrim);
    document.body.appendChild(indexPanel);
    renderRegister(scroll, {});
  }

  function applyFilter() {
    var q = indexFilter.value.trim().toLowerCase();
    var scroll = document.getElementById("dw-index-scroll");
    scroll.querySelectorAll(".dw-group").forEach(function (g) {
      var shown = 0;
      g.querySelectorAll(".dw-row").forEach(function (r) {
        var hit = !q || r.textContent.toLowerCase().indexOf(q) !== -1;
        r.classList.toggle("is-hidden", !hit);
        if (hit) shown++;
      });
      g.classList.toggle("is-empty", shown === 0);
    });
    scroll.querySelectorAll(".dw-bucket").forEach(function (b) {
      b.classList.toggle("is-empty", !b.querySelector(".dw-row:not(.is-hidden)"));
    });
  }

  function openIndex() {
    if (!indexPanel) buildIndex();
    scrim.classList.add("is-open");
    indexPanel.classList.add("is-open");
    indexPanel.setAttribute("aria-hidden", "false");
    setTimeout(function () { indexFilter && indexFilter.focus(); }, 60);
  }

  function closeOverlays() {
    if (indexPanel) { indexPanel.classList.remove("is-open"); indexPanel.setAttribute("aria-hidden", "true"); }
    if (miniPanel) miniPanel.classList.remove("is-open");
    if (scrim) scrim.classList.remove("is-open");
  }

  /* ====================================================================
     Splash  (first visit)
     ==================================================================== */

  var LEVELS = [
    { v: "a1", cap: "Grundlagen" },
    { v: "a2", cap: "Brücke" },
    { v: "b1", cap: "Mittelstufe" },
    { v: "b2", cap: "Ziel" }
  ];

  function runSplash() {
    var draft = { name: "", level: "b1", examDate: null };
    var step = 0;

    var wrap = el("div", { "class": "dw-splash", id: "dw-splash" });
    var inner = el("div", { "class": "dw-splash-inner" });
    wrap.appendChild(inner);
    document.body.appendChild(wrap);

    function dots() {
      return "<span class=\"dw-dots\">" +
        [0, 1, 2].map(function (i) { return "<i class=\"" + (i <= step ? "on" : "") + "\"></i>"; }).join("") +
        "</span>";
    }

    function render() {
      inner.innerHTML = "<div class=\"dw-splash-kicker\">Deutsch · Einrichten</div>";
      var body = el("div", { "class": "dw-step" });

      if (step === 0) {
        body.appendChild(el("h1", { text: "Willkommen." }));
        body.appendChild(el("p", { "class": "dw-sub", text: "Wie heißt du? (optional)" }));
        var nf = el("input", { "class": "dw-field", type: "text", maxlength: "40",
          placeholder: "Dein Name", value: draft.name });
        nf.addEventListener("input", function () { draft.name = nf.value; });
        nf.addEventListener("keydown", function (e) { if (e.key === "Enter") next(); });
        body.appendChild(nf);
        body.appendChild(navRow(null, "Weiter"));
        setTimeout(function () { nf.focus(); }, 40);
      } else if (step === 1) {
        body.appendChild(el("h1", { text: "Wo stehst du gerade?" }));
        body.appendChild(el("p", { "class": "dw-sub", text: "Damit die Startseite dir den nächsten Schritt zeigt." }));
        var grid = el("div", { "class": "dw-level-grid" });
        LEVELS.forEach(function (L) {
          var b = el("button", { "class": "dw-level-opt" + (draft.level === L.v ? " is-sel" : ""), type: "button",
            html: "<span class=\"dw-lv-ord\">" + L.v.toUpperCase() + "</span><span class=\"dw-lv-cap\">" + L.cap + "</span>" });
          b.addEventListener("click", function () {
            draft.level = L.v;
            grid.querySelectorAll(".dw-level-opt").forEach(function (x) { x.classList.remove("is-sel"); });
            b.classList.add("is-sel");
          });
          grid.appendChild(b);
        });
        body.appendChild(grid);
        body.appendChild(navRow("Zurück", "Weiter"));
      } else {
        body.appendChild(el("h1", { text: "Hast du einen Prüfungstermin?" }));
        body.appendChild(el("p", { "class": "dw-sub", text: "Wenn ja, rechnen wir den Studienplan rückwärts vom Datum." }));
        var df = el("input", { "class": "dw-field", type: "date", value: draft.examDate || "" });
        df.addEventListener("input", function () { draft.examDate = df.value || null; });
        body.appendChild(df);
        var row = navRow("Zurück", draft.examDate ? "Fertig" : "Fertig");
        var skip = el("button", { "class": "dw-btn dw-btn--ghost", type: "button", text: "Noch keinen Termin" });
        skip.addEventListener("click", function () { draft.examDate = null; finish(); });
        row.insertBefore(skip, row.lastChild);
        body.appendChild(row);
      }

      inner.appendChild(body);
      var nav = inner.querySelector(".dw-splash-nav");
      if (nav) nav.insertAdjacentHTML("afterbegin", dots());
    }

    function navRow(backLabel, nextLabel) {
      var row = el("div", { "class": "dw-splash-nav" });
      if (backLabel) {
        var b = el("button", { "class": "dw-btn dw-btn--ghost", type: "button", text: backLabel });
        b.addEventListener("click", prev);
        row.appendChild(b);
      }
      var n = el("button", { "class": "dw-btn dw-btn--primary", type: "button", text: nextLabel });
      n.addEventListener("click", next);
      row.appendChild(n);
      return row;
    }

    function next() { if (step < 2) { step++; render(); } else { finish(); } }
    function prev() { if (step > 0) { step--; render(); } }

    function finish() {
      writeProfile({
        name: (draft.name || "").trim(),
        level: draft.level,
        examDate: draft.examDate || null,
        createdAt: toISO(startOfToday())
      });
      wrap.parentNode && wrap.parentNode.removeChild(wrap);
      fireProfileChange();
    }

    render();
  }

  /* ====================================================================
     Mini profile / exam editor
     ==================================================================== */

  var miniPanel;

  function openProfileEditor() {
    var p = readProfile() || { name: "", level: "b1", examDate: null };
    if (!scrim) { buildIndex(); }          // reuse the scrim
    if (!miniPanel) {
      miniPanel = el("div", { "class": "dw-mini no-print" });
      document.body.appendChild(miniPanel);
    }
    miniPanel.innerHTML = "";
    miniPanel.appendChild(el("h2", { text: "Profil & Termin" }));

    miniPanel.appendChild(el("div", { "class": "dw-mini-label", text: "Name" }));
    var nf = el("input", { "class": "dw-field", type: "text", maxlength: "40", value: p.name || "", placeholder: "Dein Name" });
    miniPanel.appendChild(nf);

    miniPanel.appendChild(el("div", { "class": "dw-mini-label", text: "Niveau" }));
    var grid = el("div", { "class": "dw-level-grid" });
    var lvl = p.level || "b1";
    LEVELS.forEach(function (L) {
      var b = el("button", { "class": "dw-level-opt" + (lvl === L.v ? " is-sel" : ""), type: "button",
        html: "<span class=\"dw-lv-ord\">" + L.v.toUpperCase() + "</span><span class=\"dw-lv-cap\">" + L.cap + "</span>" });
      b.addEventListener("click", function () {
        lvl = L.v;
        grid.querySelectorAll(".dw-level-opt").forEach(function (x) { x.classList.remove("is-sel"); });
        b.classList.add("is-sel");
      });
      grid.appendChild(b);
    });
    miniPanel.appendChild(grid);

    miniPanel.appendChild(el("div", { "class": "dw-mini-label", text: "Prüfungstermin" }));
    var df = el("input", { "class": "dw-field", type: "date", value: p.examDate || "" });
    miniPanel.appendChild(df);

    var actions = el("div", { "class": "dw-mini-actions" });
    var clear = el("button", { "class": "dw-btn dw-btn--danger", type: "button", text: "Termin löschen" });
    clear.addEventListener("click", function () { df.value = ""; });
    var cancel = el("button", { "class": "dw-btn dw-btn--ghost", type: "button", text: "Abbrechen" });
    cancel.addEventListener("click", closeOverlays);
    var save = el("button", { "class": "dw-btn dw-btn--primary", type: "button", text: "Speichern" });
    save.addEventListener("click", function () {
      writeProfile({
        name: nf.value.trim(), level: lvl,
        examDate: df.value || null,
        createdAt: (p.createdAt || toISO(startOfToday()))
      });
      closeOverlays();
      fireProfileChange();
    });
    actions.appendChild(clear);
    actions.appendChild(cancel);
    actions.appendChild(save);
    miniPanel.appendChild(actions);

    scrim.classList.add("is-open");
    miniPanel.classList.add("is-open");
  }

  /* ====================================================================
     Global key: "/" opens the index
     ==================================================================== */

  document.addEventListener("keydown", function (e) {
    if (e.key === "/" && !/^(INPUT|TEXTAREA|SELECT)$/.test((e.target || {}).tagName) && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      openIndex();
    } else if (e.key === "Escape") {
      closeOverlays();
    }
  });

  /* ====================================================================
     Public API
     ==================================================================== */

  window.DW = {
    ROOT: ROOT,
    PAGES: PAGES,
    GROUPS: GROUPS,
    LEVEL_BUCKETS: LEVEL_BUCKETS,
    LEVEL_LABELS: LEVEL_LABELS,
    PHASES: PHASES,
    readProfile: readProfile,
    writeProfile: function (p) { writeProfile(p); fireProfileChange(); },
    openIndex: openIndex,
    openProfileEditor: openProfileEditor,
    startOnboarding: runSplash,
    renderRegister: renderRegister,
    buildTimeline: buildTimeline,
    currentFocus: currentFocus,
    fmtDE: fmtDE,
    uiLang: function () { return LANG; },
    setUiLang: setUiLang,
    onProfileChange: null,
    onUiLangChange: null
  };

  /* ====================================================================
     Boot
     ==================================================================== */

  function loadScript(rel) {
    var s = document.createElement("script");
    s.src = ROOT + rel;
    s.async = false;   // keep insertion order: glossary-data.js before glossary.js
    document.head.appendChild(s);
  }

  function boot() {
    injectTopbar();
    loadScript("assets/glossary-data.js");
    loadScript("assets/glossary.js");
    loadScript("assets/interactive.js");
    if (!readProfile() && !document.body.hasAttribute("data-dw-nosplash")) {
      runSplash();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();

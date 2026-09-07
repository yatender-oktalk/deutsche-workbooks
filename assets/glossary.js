/* ==========================================================================
   glossary.js  —  the 📖 "Nachschlagen" panel (look-up)
   --------------------------------------------------------------------------
   Injected by app-shell.js (which also loads glossary-data.js and puts the
   toggle button in the top bar). The panel has two parts:

     1. a free word search box that checks the curated grammar glossary
        (window.DW_GLOSSARY) AND the vocab trainer's ~5,860-word dictionary
        (vocab/data/*.js, lazy-loaded on first search), plus one-tap links
        to dict.cc / LEO / Wiktionary for anything not found;

     2. below it, the terms from window.DW_GLOSSARY that appear on the
        current page (read-only — never rewrites the page).

   Screen-only.
   ========================================================================== */
(function () {
  "use strict";

  var G = {}, KEYS = [];
  function ensureData() {
    if (KEYS.length || !window.DW_GLOSSARY) return;
    G = window.DW_GLOSSARY;
    KEYS = Object.keys(G).sort(function (a, b) { return b.length - a.length; });
  }

  var panel, listEl, filterEl, searchEl, resultEl, scrim, built = false, open = false;

  /* ---- vocab dictionary (lazy) --------------------------------------- */

  var vocabState = "idle"; // idle | loading | ready | failed
  function loadVocab(cb) {
    if (vocabState === "ready" || vocabState === "failed") return cb();
    if (vocabState === "loading") { setTimeout(function () { loadVocab(cb); }, 200); return; }
    vocabState = "loading";
    var root = (window.DW && DW.ROOT) || "";
    var levels = ["a1", "a2", "b1", "b2"], done = 0, ok = 0;
    levels.forEach(function (lv) {
      var s = document.createElement("script");
      s.src = root + "vocab/data/" + lv + ".js";
      s.async = false;
      s.onload = function () { ok++; step(); };
      s.onerror = step;
      document.head.appendChild(s);
      function step() { if (++done === levels.length) { vocabState = ok ? "ready" : "failed"; cb(); } }
    });
  }
  function searchVocab(q) {
    var raw = window.VOCAB_RAW || {};
    var ql = q.toLowerCase();
    var all = [];
    ["a1", "a2", "b1", "b2"].forEach(function (lv) { (raw[lv] || []).forEach(function (e) { all.push(e); }); });
    function score(e) {
      var w = (e.word || "").toLowerCase();
      var wb = w.replace(/^(der|die|das|sich)\s+/, "");
      if (w === ql || wb === ql) return 100;
      if (w.indexOf(ql) === 0 || wb.indexOf(ql) === 0) return 80;
      if (w.indexOf(ql) !== -1) return 55;
      if ((e.translation_en || "").toLowerCase().indexOf(ql) !== -1) return 30;
      return 0;
    }
    return all.map(function (e) { return { e: e, s: score(e) }; })
      .filter(function (x) { return x.s > 0; })
      .sort(function (a, b) { return b.s - a.s || (a.e.word || "").length - (b.e.word || "").length; })
      .slice(0, 8).map(function (x) { return x.e; });
  }

  /* ---- css ---------------------------------------------------------- */

  function css() {
    if (document.getElementById("dw-gloss-css")) return;
    var s = document.createElement("style");
    s.id = "dw-gloss-css";
    s.textContent = [
      ".dw-gloss-scrim{position:fixed;inset:0;background:rgba(20,18,14,.28);opacity:0;pointer-events:none;transition:opacity .18s;z-index:60}",
      ".dw-gloss-scrim.is-open{opacity:1;pointer-events:auto}",
      ".dw-gloss{position:fixed;top:0;right:0;height:100%;width:min(400px,92vw);background:var(--paper,#faf8f3);",
      "  border-left:1px solid var(--rule-strong,#c9c1b0);box-shadow:-10px 0 34px rgba(20,18,14,.14);",
      "  transform:translateX(102%);transition:transform .2s ease;z-index:61;display:flex;flex-direction:column}",
      ".dw-gloss.is-open{transform:none}",
      ".dw-gloss-head{display:flex;align-items:baseline;justify-content:space-between;gap:10px;padding:16px 20px 6px}",
      ".dw-gloss-head h2{font-family:var(--serif,Georgia,serif);font-size:17px;margin:0;color:var(--ink,#1c1a17)}",
      ".dw-gloss-close{border:none;background:none;font-size:22px;line-height:1;cursor:pointer;color:var(--muted,#8a8272);padding:0 2px}",
      ".dw-gloss-search{margin:2px 20px 4px;padding:9px 11px;font:15px/1.3 var(--sans,system-ui);",
      "  border:1px solid var(--ink,#1c1a17);background:var(--paper,#fff);color:var(--ink,#1c1a17);width:calc(100% - 40px);box-sizing:border-box}",
      ".dw-look{margin:2px 20px 6px;font-family:var(--sans,system-ui);font-size:13px;line-height:1.5}",
      ".dw-look .hit{border-left:3px solid var(--accent,#7a2048);padding:6px 0 6px 10px;margin:8px 0}",
      ".dw-look .hit .w{font-family:var(--serif,Georgia,serif);font-size:15.5px;color:var(--ink,#1c1a17)}",
      ".dw-look .hit .tr{color:var(--ink,#1c1a17)}",
      ".dw-look .hit .lvl{font-size:10px;font-weight:700;letter-spacing:.06em;color:var(--muted,#8a8272);margin-left:6px}",
      ".dw-look .hit .ex{color:var(--muted,#6b6456);margin-top:3px;font-size:12px}",
      ".dw-look .ext{margin-top:8px}",
      ".dw-look .ext a{display:inline-block;margin:0 8px 4px 0;padding:3px 9px;border:1px solid var(--rule-strong,#c9c1b0);",
      "  color:var(--ink,#1c1a17);text-decoration:none;font-size:12px}",
      ".dw-look .note{color:var(--muted,#8a8272);font-size:12px}",
      ".dw-gloss-sub{font-family:var(--sans,system-ui);font-size:10.5px;text-transform:uppercase;letter-spacing:.12em;",
      "  color:var(--muted,#8a8272);margin:14px 20px 2px;border-top:1px solid var(--rule,#e4ded0);padding-top:12px}",
      ".dw-gloss-filter{margin:4px 20px 6px;padding:7px 10px;font:13px/1.3 var(--sans,system-ui);",
      "  border:1px solid var(--rule-strong,#c9c1b0);background:var(--paper,#fff);color:var(--ink,#1c1a17);width:calc(100% - 40px);box-sizing:border-box}",
      ".dw-gloss-scroll{overflow-y:auto;padding:0 20px 40px;flex:1}",
      ".dw-gloss-scroll dl{margin:0}",
      ".dw-gloss-scroll dt{font-family:var(--serif,Georgia,serif);font-size:14.5px;color:var(--ink,#1c1a17);margin-top:12px;font-weight:700}",
      ".dw-gloss-scroll dd{margin:2px 0 0;font-family:var(--sans,system-ui);font-size:12.5px;line-height:1.5;color:var(--muted,#6b6456)}",
      ".dw-gloss-empty{font-family:var(--sans,system-ui);font-size:12.5px;color:var(--muted,#8a8272);margin-top:10px;line-height:1.6}",
      "@media print{.dw-gloss,.dw-gloss-scrim{display:none!important}}"
    ].join("");
    document.head.appendChild(s);
  }

  function visibleText() {
    var clone = document.body.cloneNode(true);
    ["dw-topbar", "dw-topbar-inner", "dw-index", "dw-scrim", "dw-gloss", "dw-gloss-scrim",
     "dw-splash", "dw-mini", "controls", "doc-footer"].forEach(function (c) {
      clone.querySelectorAll("." + c).forEach(function (n) { n.remove(); });
    });
    return clone.innerText || clone.textContent || "";
  }
  function findTerms() {
    ensureData();
    var hay = visibleText().toLowerCase();
    var hits = [], taken = "";
    KEYS.forEach(function (k) {
      var lc = k.toLowerCase();
      if (hay.indexOf(lc) === -1) return;
      if (taken.indexOf("|" + lc + "|") !== -1) return;
      hits.push(k); taken += "|" + lc + "|";
    });
    hits.sort(function (a, b) { return a.localeCompare(b, "de"); });
    return hits;
  }

  /* ---- look-up rendering ------------------------------------------- */

  function esc(s) { return String(s).replace(/[<>&"]/g, function (c) { return ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]; }); }

  function extLinks(q) {
    var e = encodeURIComponent(q);
    return '<div class="ext">' +
      '<a href="https://www.dict.cc/?s=' + e + '" target="_blank" rel="noopener">dict.cc &#8599;</a>' +
      '<a href="https://dict.leo.org/englisch-deutsch/' + e + '" target="_blank" rel="noopener">LEO &#8599;</a>' +
      '<a href="https://de.wiktionary.org/wiki/' + e + '" target="_blank" rel="noopener">Wiktionary &#8599;</a>' +
      '</div>';
  }

  function renderLookup() {
    ensureData();
    var q = searchEl.value.trim();
    if (!q) { resultEl.innerHTML = ""; return; }

    var html = "";

    // grammar glossary
    var gk = null, ql = q.toLowerCase();
    KEYS.forEach(function (k) { if (!gk && (k.toLowerCase() === ql || (ql.length >= 3 && k.toLowerCase().indexOf(ql) !== -1))) gk = k; });
    if (gk) {
      html += '<div class="hit"><span class="w">' + esc(gk) + '</span> <span class="lvl">GRAMMATIK</span>' +
        '<div class="tr">' + esc(G[gk]) + '</div></div>';
    }

    // vocab dictionary
    if (vocabState === "ready") {
      var vs = searchVocab(q);
      vs.forEach(function (e) {
        var ex = (e.examples && e.examples[0]) ? '<div class="ex">' + esc(e.examples[0].de) +
          (e.examples[0].en ? '<br><i>' + esc(e.examples[0].en) + '</i>' : "") + '</div>' : "";
        html += '<div class="hit"><span class="w">' + esc(e.full || e.word) + '</span>' +
          '<span class="lvl">' + esc((e.level || "").toUpperCase()) + '</span>' +
          '<div class="tr">' + esc(e.translation_en || "") + '</div>' + ex + '</div>';
      });
      if (!gk && !vs.length) html += '<p class="note">Nicht im Vokabeltrainer (A1&ndash;B2). Extern nachschlagen:</p>';
    } else if (vocabState === "loading") {
      html += '<p class="note">Wörterbuch lädt&hellip;</p>';
    } else if (vocabState === "failed") {
      html += '<p class="note">Wörterbuch offline nicht verfügbar. Extern:</p>';
    }

    html += extLinks(q);
    resultEl.innerHTML = html;
  }

  var lookT;
  function onSearchInput() {
    clearTimeout(lookT);
    lookT = setTimeout(function () {
      if (vocabState === "idle" && searchEl.value.trim()) loadVocab(renderLookup);
      renderLookup();
    }, 160);
  }

  /* ---- build & populate the page-terms list ----------------------- */

  function build() {
    if (built) return;
    built = true;
    css();

    scrim = document.createElement("div");
    scrim.className = "dw-gloss-scrim no-print";
    scrim.addEventListener("click", close);

    panel = document.createElement("aside");
    panel.className = "dw-gloss no-print";
    panel.setAttribute("aria-hidden", "true");
    panel.innerHTML =
      '<div class="dw-gloss-head"><h2>Nachschlagen</h2>' +
      '<button class="dw-gloss-close" type="button" aria-label="Schließen">&times;</button></div>' +
      '<input class="dw-gloss-search" type="search" placeholder="Wort suchen — z. B. Änderung" aria-label="Wort nachschlagen" autocomplete="off">' +
      '<div class="dw-look" id="dw-look-r"></div>' +
      '<div class="dw-gloss-sub">Fachbegriffe auf dieser Seite</div>' +
      '<input class="dw-gloss-filter" type="search" placeholder="Liste filtern…" aria-label="Begriffe filtern">' +
      '<div class="dw-gloss-scroll"><dl></dl><p class="dw-gloss-empty" hidden></p></div>';

    panel.querySelector(".dw-gloss-close").addEventListener("click", close);
    searchEl = panel.querySelector(".dw-gloss-search");
    resultEl = panel.querySelector("#dw-look-r");
    filterEl = panel.querySelector(".dw-gloss-filter");
    listEl = panel.querySelector("dl");
    searchEl.addEventListener("input", onSearchInput);
    searchEl.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
    filterEl.addEventListener("input", applyFilter);
    filterEl.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });

    document.body.appendChild(scrim);
    document.body.appendChild(panel);
  }

  function populate() {
    var terms = findTerms();
    listEl.innerHTML = "";
    var empty = panel.querySelector(".dw-gloss-empty");
    if (!terms.length) {
      empty.hidden = false;
      empty.textContent = "Keine bekannten Fachbegriffe auf dieser Seite. Nutze die Suche oben.";
      return;
    }
    empty.hidden = true;
    var frag = document.createDocumentFragment();
    terms.forEach(function (t) {
      var dt = document.createElement("dt"); dt.textContent = t;
      var dd = document.createElement("dd"); dd.textContent = G[t];
      frag.appendChild(dt); frag.appendChild(dd);
    });
    listEl.appendChild(frag);
  }

  function applyFilter() {
    var q = filterEl.value.trim().toLowerCase();
    listEl.querySelectorAll("dt").forEach(function (dt) {
      var dd = dt.nextElementSibling;
      var hit = !q || dt.textContent.toLowerCase().indexOf(q) !== -1 ||
        (dd && dd.textContent.toLowerCase().indexOf(q) !== -1);
      dt.hidden = !hit;
      if (dd) dd.hidden = !hit;
    });
  }

  function openPanel() {
    build();
    populate();
    open = true;
    scrim.classList.add("is-open");
    panel.classList.add("is-open");
    panel.setAttribute("aria-hidden", "false");
    document.addEventListener("keydown", escClose);
    setTimeout(function () { try { searchEl.focus(); } catch (e) {} }, 60);
  }
  function close() {
    if (!built) return;
    open = false;
    scrim.classList.remove("is-open");
    panel.classList.remove("is-open");
    panel.setAttribute("aria-hidden", "true");
    document.removeEventListener("keydown", escClose);
  }
  function escClose(e) { if (e.key === "Escape") close(); }
  function toggle() { open ? close() : openPanel(); }

  window.DWGloss = { open: openPanel, close: close, toggle: toggle, isOpen: function () { return open; } };
})();

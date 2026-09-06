/* ==========================================================================
   glossary.js  —  the 📖 "page glossary" panel
   --------------------------------------------------------------------------
   Injected by app-shell.js (which also loads glossary-data.js and puts the
   toggle button in the top bar). On open it scans the visible text of the
   current page for the German terms in window.DW_GLOSSARY and lists the ones
   it finds, each with a one-line English gloss. Read-only: it never rewrites
   the page. Screen-only.
   ========================================================================== */
(function () {
  "use strict";

  var G = {}, KEYS = [];
  function ensureData() {
    if (KEYS.length || !window.DW_GLOSSARY) return;
    G = window.DW_GLOSSARY;
    KEYS = Object.keys(G).sort(function (a, b) { return b.length - a.length; }); // longest first
  }
  var panel, listEl, filterEl, scrim, built = false, open = false;

  function css() {
    if (document.getElementById("dw-gloss-css")) return;
    var s = document.createElement("style");
    s.id = "dw-gloss-css";
    s.textContent = [
      ".dw-gloss-scrim{position:fixed;inset:0;background:rgba(20,18,14,.28);opacity:0;pointer-events:none;transition:opacity .18s;z-index:60}",
      ".dw-gloss-scrim.is-open{opacity:1;pointer-events:auto}",
      ".dw-gloss{position:fixed;top:0;right:0;height:100%;width:min(380px,90vw);background:var(--paper,#faf8f3);",
      "  border-left:1px solid var(--rule-strong,#c9c1b0);box-shadow:-10px 0 34px rgba(20,18,14,.14);",
      "  transform:translateX(102%);transition:transform .2s ease;z-index:61;display:flex;flex-direction:column}",
      ".dw-gloss.is-open{transform:none}",
      ".dw-gloss-head{display:flex;align-items:baseline;justify-content:space-between;gap:10px;padding:16px 20px 8px}",
      ".dw-gloss-head h2{font-family:var(--serif,Georgia,serif);font-size:17px;margin:0;color:var(--ink,#1c1a17)}",
      ".dw-gloss-head .n{font-family:var(--sans,system-ui);font-size:11px;color:var(--muted,#8a8272)}",
      ".dw-gloss-close{border:none;background:none;font-size:22px;line-height:1;cursor:pointer;color:var(--muted,#8a8272);padding:0 2px}",
      ".dw-gloss-filter{margin:2px 20px 8px;padding:7px 10px;font:13px/1.3 var(--sans,system-ui);",
      "  border:1px solid var(--rule-strong,#c9c1b0);background:var(--paper,#fff);color:var(--ink,#1c1a17);width:calc(100% - 40px);box-sizing:border-box}",
      ".dw-gloss-scroll{overflow-y:auto;padding:0 20px 40px;flex:1}",
      ".dw-gloss-scroll dl{margin:0}",
      ".dw-gloss-scroll dt{font-family:var(--serif,Georgia,serif);font-size:14.5px;color:var(--ink,#1c1a17);margin-top:12px;font-weight:700}",
      ".dw-gloss-scroll dd{margin:2px 0 0;font-family:var(--sans,system-ui);font-size:12.5px;line-height:1.5;color:var(--muted,#6b6456)}",
      ".dw-gloss-empty{font-family:var(--sans,system-ui);font-size:12.5px;color:var(--muted,#8a8272);margin-top:16px;line-height:1.6}",
      ".dw-gloss-hint{font-family:var(--sans,system-ui);font-size:11px;color:var(--muted,#8a8272);margin:14px 20px 6px;line-height:1.5}",
      "@media print{.dw-gloss,.dw-gloss-scrim{display:none!important}}"
    ].join("");
    document.head.appendChild(s);
  }

  function visibleText() {
    // main content only — skip our own chrome
    var clone = document.body.cloneNode(true);
    ["dw-topbar", "dw-topbar-inner", "dw-index", "dw-scrim", "dw-gloss", "dw-gloss-scrim",
     "dw-splash", "dw-mini", "controls", "doc-footer"].forEach(function (c) {
      clone.querySelectorAll("." + c).forEach(function (n) { n.remove(); });
    });
    return clone.innerText || clone.textContent || "";
  }

  function findTerms() {
    ensureData();
    var hay = visibleText();
    var hayLc = hay.toLowerCase();
    var hits = [];
    var taken = "";
    KEYS.forEach(function (k) {
      var lc = k.toLowerCase();
      if (hayLc.indexOf(lc) === -1) return;
      // skip if this key is only a substring of an already-taken longer key match
      if (taken.indexOf("|" + lc + "|") !== -1) return;
      hits.push(k);
      taken += "|" + lc + "|";
    });
    hits.sort(function (a, b) { return a.localeCompare(b, "de"); });
    return hits;
  }

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
      '<div class="dw-gloss-head"><h2>Glossar &mdash; diese Seite</h2>' +
      '<span class="n"></span>' +
      '<button class="dw-gloss-close" type="button" aria-label="Schließen">&times;</button></div>' +
      '<p class="dw-gloss-hint">Deutsche Grammatik-Begriffe auf dieser Seite, kurz auf Englisch erklärt.</p>' +
      '<input class="dw-gloss-filter" type="search" placeholder="Filtern…" aria-label="Begriffe filtern">' +
      '<div class="dw-gloss-scroll"><dl></dl><p class="dw-gloss-empty" hidden></p></div>';

    panel.querySelector(".dw-gloss-close").addEventListener("click", close);
    filterEl = panel.querySelector(".dw-gloss-filter");
    listEl = panel.querySelector("dl");
    filterEl.addEventListener("input", applyFilter);
    filterEl.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });

    document.body.appendChild(scrim);
    document.body.appendChild(panel);
  }

  function populate() {
    var terms = findTerms();
    panel.querySelector(".n").textContent = terms.length + (terms.length === 1 ? " Begriff" : " Begriffe");
    listEl.innerHTML = "";
    var empty = panel.querySelector(".dw-gloss-empty");
    if (!terms.length) {
      empty.hidden = false;
      empty.textContent = "Keine bekannten Fachbegriffe auf dieser Seite gefunden.";
      return;
    }
    empty.hidden = true;
    var frag = document.createDocumentFragment();
    terms.forEach(function (t) {
      var dt = document.createElement("dt");
      dt.textContent = t;
      var dd = document.createElement("dd");
      dd.textContent = G[t];
      frag.appendChild(dt);
      frag.appendChild(dd);
    });
    listEl.appendChild(frag);
  }

  function applyFilter() {
    var q = filterEl.value.trim().toLowerCase();
    var dts = listEl.querySelectorAll("dt");
    dts.forEach(function (dt) {
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
    setTimeout(function () { try { filterEl.focus(); } catch (e) {} }, 60);
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

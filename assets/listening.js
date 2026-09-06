/* Browser text-to-speech playback for Hörverstehen practice pages.
   No audio files are hosted — this reads the hidden German transcript
   aloud using the device's own speechSynthesis voices (works offline
   in Safari/Chrome once the page has loaded).

   Sound quality is entirely a function of which installed voice is used.
   The default `de-DE` voice on many devices (Apple "Anna (compact)",
   Linux eSpeak, low-tier Google TTS) is the robotic one. This file:
     1. ranks the available German voices and auto-picks the best one,
     2. lets the user override that choice with a picker (remembered per
        device via localStorage),
     3. speaks sentence by sentence, which sounds more natural and also
        dodges Chrome's ~15-second cut-off bug.

   MOBILE NOTE: on phones — and especially an installed/standalone PWA —
   `speechSynthesis.getVoices()` is frequently empty until the first time
   `speak()` actually runs after a user gesture, and `onvoiceschanged`
   often never fires. So we (a) prime the engine with a muted utterance on
   the first tap/keypress, (b) rebuild the picker right after playback,
   (c) poll for a while, and (d) always show at least a "which voice / how
   to install a better one" row so the control is never just missing.

   To get a genuinely natural voice you usually have to install one:
     • iOS / iPadOS: Settings › Accessibility › Spoken Content ›
       Voices › German › pick a "Premium"/"Enhanced" voice to download.
       (On iOS every browser, Chrome included, uses these same voices.)
     • Android: Settings › Text-to-speech output › prefer "Google" engine,
       Install voice data › German (or Samsung TTS › German).
     • Chrome desktop (online): "Google Deutsch" appears automatically. */

var LISTENING_VOICE_KEY = 'listening.voiceURI';

function _lvGet() { try { return localStorage.getItem(LISTENING_VOICE_KEY); } catch (e) { return null; } }
function _lvSet(v) { try { localStorage.setItem(LISTENING_VOICE_KEY, v); } catch (e) {} }

/* --- voice selection ---------------------------------------------------- */

function getGermanVoices() {
  var voices = window.speechSynthesis.getVoices() || [];
  return voices.filter(function (v) {
    return v.lang && v.lang.toLowerCase().indexOf('de') === 0;
  });
}

/* Higher score = more natural-sounding. */
function scoreVoice(v) {
  var s = 0;
  var name = (v.name || '').toLowerCase();
  var uri = (v.voiceURI || '').toLowerCase();
  var hay = name + ' ' + uri;

  if (/natural|neural/.test(hay)) s += 120;
  if (hay.indexOf('google') !== -1) s += 90;
  if (/premium/.test(hay)) s += 80;
  if (/enhanced|erweitert/.test(hay)) s += 60;
  if (uri.indexOf('siri') !== -1) s += 55;
  if (/\bonline\b/.test(hay)) s += 30;

  if (v.lang && v.lang.toLowerCase() === 'de-de') s += 10;

  if (/compact|kompakt/.test(hay)) s -= 60;
  if (/espeak|pico/.test(hay)) s -= 100;
  // Apple "novelty" character voices — fun, but not for exam listening.
  if (/\b(grandma|grandpa|rocko|bubbles|boing|bells|jester|organ|trinoids|wobble|zarvox|whisper|superstar|cellos|junior|bahh|bad news|good news)\b/.test(hay)) s -= 40;
  // Legacy low-quality default German voices.
  if (name === 'anna' || name === 'yannick' || name === 'petra') s -= 15;

  return s;
}

function rankedGermanVoices() {
  return getGermanVoices().slice().sort(function (a, b) {
    return scoreVoice(b) - scoreVoice(a);
  });
}

function resolveVoice() {
  var voices = getGermanVoices();
  if (!voices.length) return null;

  var saved = _lvGet();
  if (saved) {
    var match = voices.find(function (v) { return v.voiceURI === saved; });
    if (match) return match;
  }
  return rankedGermanVoices()[0] || null;
}

/* --- voice picker UI ------------------------------------------------------
   Idempotent: safe to call repeatedly. Builds the row once, then just
   refreshes the <select> options / current-voice label on later calls as
   more voices become known. */

function _currentVoiceLabel() {
  var v = resolveVoice();
  return v ? (v.name + ' (' + v.lang + ')') : 'System-Standard';
}

function _voicesDump() {
  var all = window.speechSynthesis.getVoices() || [];
  if (!all.length) {
    return 'speechSynthesis.getVoices() ist noch leer.\n\nAuf dem Handy wird die Liste oft erst nach dem ersten Abspielen gefüllt: einmal auf \u25B6 tippen, kurz warten, dann hier noch einmal schauen.';
  }
  return all.map(function (v, i) {
    return (i + 1) + '. ' + v.name + '  [' + v.lang + ']  ' +
      (v.localService ? 'lokal' : 'online') +
      (/^de/i.test(v.lang) ? '   \u2190 Deutsch' : '');
  }).join('\n');
}

function _installHelpText() {
  return 'Installierte Stimmen auf diesem Ger\u00e4t:\n\n' + _voicesDump() +
    '\n\n\u2014 Bessere deutsche Stimme installieren \u2014\n' +
    'iPhone/iPad: Einstellungen \u203a Bedienungshilfen \u203a Gesprochene Inhalte \u203a Stimmen \u203a Deutsch \u2014 eine \u201ePremium\u201c- oder \u201eErweitert\u201c-Stimme laden. (Gilt auch f\u00fcr Chrome auf iOS.)\n' +
    'Android: Einstellungen \u203a Sprachausgabe / Text-in-Sprache \u203a Bevorzugte Engine \u201eGoogle\u201c \u203a Sprachdaten installieren \u203a Deutsch.\n\n' +
    'Danach die Seite neu laden und einmal \u25B6 tippen.';
}

function buildVoicePicker() {
  var voices = rankedGermanVoices();
  var saved = _lvGet();
  var existing = document.querySelector('.voice-picker');

  if (existing) {
    var sel = existing.querySelector('.voice-select');
    if (sel && voices.length >= 2) {
      if (sel.options.length !== voices.length) {
        sel.innerHTML = '';
        voices.forEach(function (v) {
          var opt = document.createElement('option');
          opt.value = v.voiceURI;
          opt.textContent = v.name + ' (' + v.lang + ')';
          if (saved && v.voiceURI === saved) opt.selected = true;
          sel.appendChild(opt);
        });
        if (!saved) sel.selectedIndex = 0;
      }
    } else if (!sel && voices.length >= 2) {
      // we only had the fallback row before, but real choices exist now — rebuild
      existing.parentNode.removeChild(existing);
      return buildVoicePicker();
    }
    var cur = existing.querySelector('.voice-current');
    if (cur) cur.textContent = _currentVoiceLabel();
    return;
  }

  var wrap = document.createElement('div');
  wrap.className = 'voice-picker no-print';
  wrap.setAttribute('style',
    'text-align:center;margin:0 auto 1.4em;font-size:0.85em;color:#555;' +
    'display:flex;gap:0.5em;align-items:center;justify-content:center;flex-wrap:wrap;');

  if (voices.length >= 2) {
    var label = document.createElement('label');
    label.textContent = 'Stimme:';
    label.setAttribute('style', 'font-weight:600;');

    var select = document.createElement('select');
    select.className = 'voice-select';
    select.setAttribute('style',
      'padding:0.25em 0.4em;border:1px solid #bbb;border-radius:5px;font-size:1em;max-width:15em;');
    select.setAttribute('aria-label', 'Sprachausgabe-Stimme w\u00e4hlen');

    voices.forEach(function (v) {
      var opt = document.createElement('option');
      opt.value = v.voiceURI;
      opt.textContent = v.name + ' (' + v.lang + ')';
      if (saved && v.voiceURI === saved) opt.selected = true;
      select.appendChild(opt);
    });
    if (!saved) select.selectedIndex = 0;

    select.addEventListener('change', function () {
      _lvSet(select.value);
      window.speechSynthesis.cancel();
    });

    wrap.appendChild(label);
    wrap.appendChild(select);
  } else {
    // 0 or 1 German voice known right now — never leave the user with nothing
    var span = document.createElement('span');
    span.innerHTML = 'Stimme: <b class="voice-current">' + _currentVoiceLabel() + '</b>';
    wrap.appendChild(span);
  }

  var help = document.createElement('button');
  help.type = 'button';
  help.className = 'voice-help';
  help.textContent = voices.length >= 2 ? '\u24D8 Stimmen' : 'Nur eine Stimme? \u24D8';
  help.setAttribute('style',
    'background:none;border:1px solid #ccc;border-radius:5px;font-size:0.9em;' +
    'padding:0.15em 0.55em;cursor:pointer;color:#555;');
  help.addEventListener('click', function () {
    window.speechSynthesis.getVoices();
    alert(_installHelpText());
  });
  wrap.appendChild(help);

  var anchor = document.querySelector('.controls') ||
               document.querySelector('.tip-box') ||
               document.querySelector('.doc-header') ||
               document.querySelector('main') ||
               document.querySelector('.st-wrap');
  if (anchor && anchor.parentNode) {
    anchor.parentNode.insertBefore(wrap, anchor.nextSibling);
  } else {
    document.body.insertBefore(wrap, document.body.firstChild);
  }
}

/* --- prime the engine on first user gesture (mobile / PWA) ------------- */

var _voicesPrimed = false;
function primeVoices() {
  if (_voicesPrimed) return;
  _voicesPrimed = true;
  try {
    var u = new SpeechSynthesisUtterance('\u00A0');
    u.volume = 0;
    u.rate = 2;
    window.speechSynthesis.speak(u);
    window.speechSynthesis.cancel();
  } catch (e) {}
  [150, 600, 1500, 3000].forEach(function (ms) {
    setTimeout(function () { window.speechSynthesis.getVoices(); buildVoicePicker(); }, ms);
  });
}

/* --- speaking -------------------------------------------------------- */

var _speechQueue = [];
var _keepAlive = null;

function _stopKeepAlive() {
  if (_keepAlive) { clearInterval(_keepAlive); _keepAlive = null; }
}

/* Chrome pauses long speech after ~15s; a periodic resume() keeps it going. */
function _startKeepAlive() {
  _stopKeepAlive();
  _keepAlive = setInterval(function () {
    if (!window.speechSynthesis.speaking) { _stopKeepAlive(); return; }
    window.speechSynthesis.pause();
    window.speechSynthesis.resume();
  }, 10000);
}

function splitSentences(text) {
  var parts = text.match(/[^.!?…]+(?:[.!?…]+["»”)]*|\s*$)/g);
  if (!parts) return [text];
  return parts.map(function (s) { return s.trim(); }).filter(Boolean);
}

function speakText(id) {
  if (!('speechSynthesis' in window)) {
    alert('Dieser Browser unterst\u00fctzt keine Sprachausgabe (Web Speech API). Bitte in Safari oder Chrome \u00f6ffnen.');
    return;
  }
  _voicesPrimed = true; // a real speak() also primes the voice list
  var source = document.getElementById(id);
  if (!source) return;
  var text = source.textContent.trim();
  if (!text) return;

  window.speechSynthesis.cancel();
  _speechQueue = [];

  var rateSelect = document.getElementById(id + '-rate');
  var rate = rateSelect ? parseFloat(rateSelect.value) : 0.9;
  var voice = resolveVoice();

  var status = document.getElementById(id + '-status');
  if (status) status.textContent = 'Wird abgespielt…';

  var sentences = splitSentences(text);
  var remaining = sentences.length;

  sentences.forEach(function (sentence, i) {
    var utter = new SpeechSynthesisUtterance(sentence);
    utter.lang = (voice && voice.lang) || 'de-DE';
    utter.rate = rate;
    utter.pitch = 1.0;
    if (voice) utter.voice = voice;

    utter.onend = function () {
      remaining--;
      if (remaining <= 0) {
        _stopKeepAlive();
        if (status) status.textContent = 'Fertig.';
      }
    };
    utter.onerror = function (e) {
      _stopKeepAlive();
      if (e && e.error === 'interrupted') return;
      if (status) status.textContent = 'Fehler bei der Sprachausgabe — bitte erneut versuchen.';
    };

    _speechQueue.push(utter);
    window.speechSynthesis.speak(utter);
  });

  _startKeepAlive();
  // voices are almost always populated once a real speak() has run —
  // (re)build the picker so the dropdown appears without a reload.
  setTimeout(buildVoicePicker, 400);
  setTimeout(buildVoicePicker, 1500);
}

function stopSpeaking(id) {
  _stopKeepAlive();
  _speechQueue = [];
  window.speechSynthesis.cancel();
  var status = document.getElementById(id + '-status');
  if (status) status.textContent = 'Gestoppt.';
}

function toggleTranscript(id, btnEl) {
  var block = document.getElementById(id);
  if (!block) return;
  var willShow = block.hasAttribute('hidden');
  if (willShow) {
    block.removeAttribute('hidden');
  } else {
    block.setAttribute('hidden', '');
  }
  if (btnEl) btnEl.textContent = willShow ? 'Transkript verbergen' : 'Transkript anzeigen';
}

/* --- boot ----------------------------------------------------------- */

if ('speechSynthesis' in window) {
  var _voicePickerReady = function () {
    window.speechSynthesis.getVoices();
    buildVoicePicker();
  };
  window.speechSynthesis.onvoiceschanged = _voicePickerReady;

  var _voicePollAttempts = 0;
  var _voicePoll = setInterval(function () {
    _voicePollAttempts++;
    _voicePickerReady();
    var haveChoice = rankedGermanVoices().length >= 2 && document.querySelector('.voice-select');
    if (haveChoice || _voicePollAttempts >= 25) clearInterval(_voicePoll);
  }, 400);

  // first tap / keypress anywhere: prime the engine (crucial on iOS + PWAs)
  var _onFirstGesture = function () {
    primeVoices();
    window.removeEventListener('pointerdown', _onFirstGesture, true);
    window.removeEventListener('touchstart', _onFirstGesture, true);
    window.removeEventListener('keydown', _onFirstGesture, true);
  };
  window.addEventListener('pointerdown', _onFirstGesture, true);
  window.addEventListener('touchstart', _onFirstGesture, true);
  window.addEventListener('keydown', _onFirstGesture, true);

  // returning to a backgrounded PWA tab can repopulate the list
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) buildVoicePicker();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _voicePickerReady);
  } else {
    _voicePickerReady();
  }
}

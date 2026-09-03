/* Browser text-to-speech playback for Hörverstehen practice pages.
   No audio files are hosted — this reads the hidden German transcript
   aloud using the device's own speechSynthesis voices (works offline
   in Safari/Chrome once the page has loaded).

   Sound quality is entirely a function of which installed voice is used.
   The default `de-DE` voice on many devices (Apple "Anna (compact)",
   Linux eSpeak) is the robotic one. This file therefore:
     1. ranks the available German voices and auto-picks the best one,
     2. lets the user override that choice with a picker (remembered per
        device via localStorage),
     3. speaks sentence by sentence, which sounds more natural and also
        dodges Chrome's ~15-second cut-off bug.

   To get a genuinely natural voice you usually have to install one:
     • iOS / iPadOS: Settings › Accessibility › Spoken Content ›
       Voices › German › pick an "Enhanced"/"Premium" voice to download.
     • macOS: System Settings › Accessibility › Spoken Content ›
       System Voice › Manage Voices… › German › Enhanced/Premium.
     • Chrome (desktop, online): "Google Deutsch" appears automatically.
   Once installed it shows up in the picker on these pages. */

var LISTENING_VOICE_KEY = 'listening.voiceURI';

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
  if (/enhanced/.test(hay)) s += 60;
  if (uri.indexOf('siri') !== -1) s += 55;
  if (/\bonline\b/.test(hay)) s += 30;

  if (v.lang && v.lang.toLowerCase() === 'de-de') s += 10;

  if (/compact/.test(hay)) s -= 60;
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

  var saved = null;
  try { saved = localStorage.getItem(LISTENING_VOICE_KEY); } catch (e) {}
  if (saved) {
    var match = voices.find(function (v) { return v.voiceURI === saved; });
    if (match) return match;
  }
  return rankedGermanVoices()[0] || null;
}

/* --- voice picker UI (injected once per page) ------------------------- */

function buildVoicePicker() {
  if (document.querySelector('.voice-picker')) return;
  var voices = rankedGermanVoices();
  if (voices.length < 2) return; // nothing to choose between

  var saved = null;
  try { saved = localStorage.getItem(LISTENING_VOICE_KEY); } catch (e) {}

  var wrap = document.createElement('div');
  wrap.className = 'voice-picker no-print';
  wrap.setAttribute('style',
    'text-align:center;margin:0 auto 1.4em;font-size:0.85em;color:#555;' +
    'display:flex;gap:0.5em;align-items:center;justify-content:center;flex-wrap:wrap;');

  var label = document.createElement('label');
  label.textContent = 'Stimme:';
  label.setAttribute('style', 'font-weight:600;');

  var select = document.createElement('select');
  select.className = 'voice-select';
  select.setAttribute('style',
    'padding:0.25em 0.4em;border:1px solid #bbb;border-radius:5px;' +
    'font-size:1em;max-width:15em;');
  select.setAttribute('aria-label', 'Sprachausgabe-Stimme wählen');

  voices.forEach(function (v) {
    var opt = document.createElement('option');
    opt.value = v.voiceURI;
    opt.textContent = v.name + ' (' + v.lang + ')';
    if (saved && v.voiceURI === saved) opt.selected = true;
    select.appendChild(opt);
  });
  if (!saved) select.selectedIndex = 0; // the auto-picked best voice

  select.addEventListener('change', function () {
    try { localStorage.setItem(LISTENING_VOICE_KEY, select.value); } catch (e) {}
    window.speechSynthesis.cancel();
  });

  wrap.appendChild(label);
  wrap.appendChild(select);

  var anchor = document.querySelector('.controls') ||
               document.querySelector('.tip-box') ||
               document.querySelector('.doc-header');
  if (anchor && anchor.parentNode) {
    anchor.parentNode.insertBefore(wrap, anchor.nextSibling);
  } else {
    document.body.insertBefore(wrap, document.body.firstChild);
  }
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
    alert('Dieser Browser unterstützt keine Sprachausgabe (Web Speech API). Bitte in Safari oder Chrome öffnen.');
    return;
  }
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
    utter.lang = 'de-DE';
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

/* Some browsers (notably Chrome) load voice lists asynchronously. */
if ('speechSynthesis' in window) {
  window.speechSynthesis.getVoices();
  var _voicePickerReady = function () {
    window.speechSynthesis.getVoices();
    buildVoicePicker();
  };
  window.speechSynthesis.onvoiceschanged = _voicePickerReady;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _voicePickerReady);
  } else {
    _voicePickerReady();
  }
}

/* Browser text-to-speech playback for Hörverstehen practice pages.
   No audio files are hosted — this reads the hidden German transcript
   aloud using the device's own speechSynthesis voices (works offline
   in Safari/Chrome once the page has loaded). */

function speakText(id) {
  if (!('speechSynthesis' in window)) {
    alert('Dieser Browser unterstützt keine Sprachausgabe (Web Speech API). Bitte in Safari oder Chrome öffnen.');
    return;
  }
  var source = document.getElementById(id);
  if (!source) return;
  var text = source.textContent.trim();

  window.speechSynthesis.cancel();

  var utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'de-DE';

  var rateSelect = document.getElementById(id + '-rate');
  utter.rate = rateSelect ? parseFloat(rateSelect.value) : 0.95;

  var voices = window.speechSynthesis.getVoices();
  var deVoice = voices.find(function (v) { return v.lang && v.lang.toLowerCase().indexOf('de') === 0; });
  if (deVoice) utter.voice = deVoice;

  var status = document.getElementById(id + '-status');
  if (status) status.textContent = 'Wird abgespielt…';

  utter.onend = function () { if (status) status.textContent = 'Fertig.'; };
  utter.onerror = function () { if (status) status.textContent = 'Fehler bei der Sprachausgabe — bitte erneut versuchen.'; };

  window.speechSynthesis.speak(utter);
}

function stopSpeaking(id) {
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
  window.speechSynthesis.onvoiceschanged = function () { window.speechSynthesis.getVoices(); };
}

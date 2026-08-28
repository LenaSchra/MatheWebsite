/* =========================================================
   DIE SCHATZKAMMER DES PYTHAGORAS – LOGIK (Mehrseiten-Version)
   Jede Station ist eine eigene HTML-Seite. Der Fortschritt wird
   in localStorage gespeichert, damit die Karte und der
   Kopfbereich beim Wechsel zwischen echten Seiten aktuell bleiben.
   ========================================================= */

const STORAGE_PREFIX = 'pyth_kroton_';

// ---- Lösungen ----
const ANSWERS = { 1: 15, 2: 12, 4: 8, 5: 13 };
const SHIELD_SUM = 6;
const BONUS_ANSWER = 8.66;
const TREASURE_CODE = '5268';

// Maximal 2 Hinweisstufen an jeder Station – kein vollständiger Lösungsweg.
const HINT_LEVELS = { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, bonus: 2 };

const SHIELD_CORRECT = { A: true, B: false, C: true, D: false };
const shieldPicks = {};

let treasureAttempts = 0;

// ---- Hilfsfunktionen ----
function parseNum(value){
  if (value == null) return NaN;
  return parseFloat(String(value).trim().replace(',', '.'));
}
function isClose(a, b, tol = 0.01){
  return Math.abs(a - b) <= tol;
}
function setFeedback(el, message, ok){
  el.textContent = message;
  el.className = 'feedback ' + (ok ? 'is-correct' : 'is-wrong');
}

// ---- Fortschritt (localStorage, seitenübergreifend) ----
function isSolved(id){
  return localStorage.getItem(STORAGE_PREFIX + id) === '1';
}
function setSolved(id){
  localStorage.setItem(STORAGE_PREFIX + id, '1');
  updateHeaderSeals();
}
function updateHeaderSeals(){
  [1, 2, 3, 4, 5].forEach(id => {
    const seal = document.querySelector(`.seal-slot[data-seal="${id}"]`);
    if (!seal) return;
    seal.classList.toggle('is-filled', isSolved(id));
  });
}
function updateMapStatuses(){
  document.querySelectorAll('[data-status-for]').forEach(statusEl => {
    const id = statusEl.dataset.statusFor;
    const solved = isSolved(id);
    statusEl.textContent = solved ? '✓ gelöst' : '○ ungelöst';
    const card = statusEl.closest('.tablet-card');
    if (card) card.classList.toggle('is-solved', solved);
  });
}
function markStationSolvedUI(stationId){
  const panel = document.getElementById('solved-' + stationId);
  if (panel) panel.hidden = false;
  setSolved(stationId);
}
function resetProgress(){
  const ok = window.confirm('Fortschritt auf diesem Gerät wirklich zurücksetzen? Das ist sinnvoll, wenn eine neue Gruppe startet.');
  if (!ok) return;
  ['1', '2', '3', '4', '5', 'bonus'].forEach(id => localStorage.removeItem(STORAGE_PREFIX + id));
  updateHeaderSeals();
  updateMapStatuses();
}

// ---- Rechenstationen prüfen (1, 2, 3, 4, 5) ----
function handleCheck(stationId){
  const input = document.getElementById('input-' + stationId);
  const feedback = document.getElementById('feedback-' + stationId);
  const val = parseNum(input.value);
  const expected = stationId === '3' ? SHIELD_SUM : ANSWERS[stationId];

  if (isNaN(val)){
    setFeedback(feedback, 'Bitte gebt eine Zahl ein.', false);
    return;
  }
  if (isClose(val, expected)){
    setFeedback(feedback, '✓ Richtig!', true);
    markStationSolvedUI(stationId);
  } else {
    setFeedback(feedback, 'Noch nicht ganz richtig. Nutzt bei Bedarf das Orakel von Delphi.', false);
  }
}

// ---- Station 5, Schritt 1 (Bodendiagonale) ----
function handleCheck5a(){
  const input = document.getElementById('input-5a');
  const feedback = document.getElementById('feedback-5a');
  const val = parseNum(input.value);
  if (isNaN(val)){
    setFeedback(feedback, 'Bitte gebt eine Zahl ein.', false);
    return;
  }
  if (isClose(val, 5)){
    setFeedback(feedback, '✓ Richtig! Weiter zu Schritt 2.', true);
    document.getElementById('step-5b').hidden = false;
  } else {
    setFeedback(feedback, 'Noch nicht ganz richtig.', false);
  }
}

// ---- Bonusaufgabe ----
function handleCheckBonus(){
  const input = document.getElementById('input-bonus');
  const feedback = document.getElementById('feedback-bonus');
  const val = parseNum(input.value);
  if (isNaN(val)){
    setFeedback(feedback, 'Bitte gebt eine Zahl ein.', false);
    return;
  }
  if (isClose(val, BONUS_ANSWER, 0.0)){
    setFeedback(feedback, '✓ Richtig!', true);
    document.getElementById('solved-bonus').hidden = false;
    setSolved('bonus');
  } else {
    setFeedback(feedback, 'Noch nicht ganz richtig. Nutzt bei Bedarf einen Tipp.', false);
  }
}

// ---- Station 3: Schild-Zuordnung ----
function handleShieldPick(btn){
  const shield = btn.dataset.shield;
  const pick = btn.dataset.pick;
  shieldPicks[shield] = pick;

  const card = btn.closest('.shield-card');
  card.querySelectorAll('.shield-buttons button').forEach(b => b.classList.remove('is-picked'));
  btn.classList.add('is-picked');
  card.classList.remove('is-right', 'is-wrong');
}

function handleCheckShields(){
  const feedback = document.getElementById('feedback-shields');
  const ids = Object.keys(SHIELD_CORRECT);
  let correctCount = 0;
  let allAnswered = true;

  ids.forEach(id => {
    const pick = shieldPicks[id];
    if (!pick){ allAnswered = false; return; }
    const card = document.querySelector(`.shield-card[data-shield="${id}"]`);
    const isRight = (pick === 'rw') === SHIELD_CORRECT[id];
    card.classList.toggle('is-right', isRight);
    card.classList.toggle('is-wrong', !isRight);
    if (isRight) correctCount++;
  });

  if (!allAnswered){
    setFeedback(feedback, 'Bitte ordnet zuerst alle vier Schilde zu.', false);
    return;
  }
  if (correctCount === 4){
    setFeedback(feedback, '✓ Alle richtig zugeordnet! Weiter mit der Summe.', true);
    document.getElementById('sum-step').hidden = false;
  } else {
    setFeedback(feedback, `${correctCount} von 4 richtig zugeordnet. Prüft die rot markierten Schilde noch einmal.`, false);
  }
}

// ---- Orakel-Hinweise (max. 2 Stufen, kein vollständiger Lösungsweg) ----
function handleHint(stationId, level){
  level = parseInt(level, 10);
  const textEl = document.getElementById(`hint-${stationId}-${level}`);
  if (textEl) textEl.hidden = false;

  const currentBtn = document.querySelector(`[data-action="hint"][data-station="${stationId}"][data-level="${level}"]`);
  if (currentBtn) currentBtn.disabled = true;

  const nextLevel = level + 1;
  const maxLevel = HINT_LEVELS[stationId] || 2;
  if (nextLevel <= maxLevel){
    const nextBtn = document.querySelector(`[data-action="hint"][data-station="${stationId}"][data-level="${nextLevel}"]`);
    if (nextBtn) nextBtn.disabled = false;
  }
}

// ---- Schatztruhe ----
function handleOpenTreasure(){
  const inputs = Array.from(document.querySelectorAll('.code-digit'));
  const feedback = document.getElementById('feedback-treasure');
  const digits = inputs.map(i => i.value);

  if (digits.some(d => d === '')){
    setFeedback(feedback, 'Bitte tragt alle vier Ziffern ein.', false);
    return;
  }

  const code = digits.join('');
  if (code === TREASURE_CODE){
    feedback.textContent = '';
    feedback.className = 'feedback';
    document.getElementById('treasure-success').hidden = false;
  } else {
    treasureAttempts++;
    if (treasureAttempts >= 3){
      setFeedback(feedback, 'Die Truhe bleibt verschlossen. Tipp: Bildet die Quersumme eurer vier Ziffern – und davon erneut die Quersumme, bis eine einzige Ziffer bleibt. Sie muss der Zahl der Bibliothek entsprechen!', false);
    } else {
      setFeedback(feedback, 'Die Truhe bleibt verschlossen. Prüft eure vier Zahlen noch einmal.', false);
    }
  }
}

function setupCodeInputs(){
  const inputs = Array.from(document.querySelectorAll('.code-digit'));
  inputs.forEach((input, idx) => {
    input.addEventListener('input', () => {
      input.value = input.value.replace(/[^0-9]/g, '').slice(0, 1);
      if (input.value && idx < inputs.length - 1){
        inputs[idx + 1].focus();
      }
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !input.value && idx > 0){
        inputs[idx - 1].focus();
      }
    });
  });
}

// ---- Hilfe-Modal ----
function openModal(){ const m = document.getElementById('modal-help'); if (m) m.hidden = false; }
function closeModal(){ const m = document.getElementById('modal-help'); if (m) m.hidden = true; }

// ---- Enter-Taste in Antwortfeldern löst "Prüfen" aus; Escape schließt Modal ----
function setupKeyboardShortcuts(){
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter'){
      const input = e.target;
      if (input.matches && input.matches('.answer-row input')){
        const row = input.closest('.answer-row');
        const btn = row && row.querySelector('.btn-check');
        if (btn) btn.click();
      }
    }
    if (e.key === 'Escape') closeModal();
  });
}

// ---- Zentrale Klick-Delegation (nur noch In-Page-Aktionen, Navigation läuft über echte Links) ----
function setupClickDelegation(){
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-action]');
    if (t){
      switch (t.dataset.action){
        case 'open-help': openModal(); break;
        case 'close-help': closeModal(); break;
        case 'check': handleCheck(t.dataset.station); break;
        case 'check-5a': handleCheck5a(); break;
        case 'check-bonus': handleCheckBonus(); break;
        case 'check-shields': handleCheckShields(); break;
        case 'shield-pick': handleShieldPick(t); break;
        case 'hint': handleHint(t.dataset.station, t.dataset.level); break;
        case 'open-treasure': handleOpenTreasure(); break;
        case 'reset-progress': resetProgress(); break;
      }
      return;
    }
    if (e.target.id === 'modal-help') closeModal();
  });
}

// ---- Initialisierung (läuft auf jeder Seite; nicht vorhandene Elemente werden ignoriert) ----
setupCodeInputs();
setupClickDelegation();
setupKeyboardShortcuts();
updateHeaderSeals();
updateMapStatuses();

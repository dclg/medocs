/**
 * Médocs - Logique applicative principale
 * Gestion de la plaquette de 15 comprimés, calendrier, stockage local et rappels
 */

// Définition de la grille 7x3 selon le schéma exact :
// 1) 3  : [Pill] [Pill] [Pill]
// 2) 3  : [Pill] [Pill] [Pill]
// 3) 0  : [Vide] [Vide] [Vide]  (alvéoles d'usine sans cachet)
// 4) 2  : [Pill] [Foil] [Pill]  (cachet gauche, foil plat centre, cachet droit)
// 5) 1  : [Vide] [Pill] [Vide]  (vide gauche, cachet centre, vide droit)
// 6) 3  : [Pill] [Pill] [Pill]
// 7) 3  : [Pill] [Pill] [Pill]
const BLISTER_LAYOUT = [
  ['pill', 'pill', 'pill'],
  ['pill', 'pill', 'pill'],
  ['empty', 'empty', 'empty'],
  ['pill', 'foil', 'pill'],
  ['empty', 'pill', 'empty'],
  ['pill', 'pill', 'pill'],
  ['pill', 'pill', 'pill']
];

// Configuration et stockage par défaut
const STORAGE_KEY = 'medocs_data_v2';

// Création de l'état initial : plaquette débutée le 04/10/2026
// Les 14 premiers comprimés (du 04/10 au 17/10 inclus) ont été consommés.
// Seul le 15e et dernier comprimé (du 18/10, demain) reste à prendre.
function createInitialTestState() {
  const pills = [];
  for (let i = 0; i < 15; i++) {
    if (i < 14) {
      const d = new Date('2026-10-04T00:00:00');
      d.setDate(d.getDate() + i);
      const iso = toIsoDate(d);
      pills.push({ taken: true, takenAt: `${iso}T10:15:00.000Z` });
    } else {
      pills.push({ taken: false, takenAt: null });
    }
  }

  return {
    startDate: '2026-10-04',
    reminderTime: '10:00',
    hapticEnabled: true,
    notificationsEnabled: false,
    pills: pills
  };
}

let appState = createInitialTestState();

// Éléments du DOM
const blisterGrid = document.getElementById('blisterGrid');
const currentDateDisplay = document.getElementById('currentDateDisplay');
const statusBanner = document.getElementById('statusBanner');
const statusIcon = document.getElementById('statusIcon');
const statusTitle = document.getElementById('statusTitle');
const statusDesc = document.getElementById('statusDesc');
const btnQuickTake = document.getElementById('btnQuickTake');
const progressCount = document.getElementById('progressCount');
const progressPercent = document.getElementById('progressPercent');
const progressFill = document.getElementById('progressFill');

const btnNotify = document.getElementById('btnNotify');
const notifyDot = document.getElementById('notifyDot');
const btnSettings = document.getElementById('btnSettings');
const btnNewPack = document.getElementById('btnNewPack');

const settingsModal = document.getElementById('settingsModal');
const btnCloseSettings = document.getElementById('btnCloseSettings');
const btnSaveSettings = document.getElementById('btnSaveSettings');
const startDateInput = document.getElementById('startDateInput');
const reminderTimeInput = document.getElementById('reminderTimeInput');
const hapticCheck = document.getElementById('hapticCheck');

const modalPillsTaken = document.getElementById('modalPillsTaken');
const modalPillsLeft = document.getElementById('modalPillsLeft');
const modalDaysStreak = document.getElementById('modalDaysStreak');

const confirmNewModal = document.getElementById('confirmNewModal');
const btnCloseNewModal = document.getElementById('btnCloseNewModal');
const btnCancelNew = document.getElementById('btnCancelNew');
const btnConfirmNew = document.getElementById('btnConfirmNew');
const newPackDate = document.getElementById('newPackDate');

// Initialisation au chargement
document.addEventListener('DOMContentLoaded', () => {
  loadState();
  initServiceWorker();
  renderHeaderDate();
  renderBlister();
  updateStatusAndProgress();
  setupEventListeners();
  checkDailyReminder();

  // Vérifier le rappel toutes les minutes
  setInterval(checkDailyReminder, 60000);
});

// Enregistrement du Service Worker
function initServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
      .then(reg => {
        console.log('Service Worker Médocs enregistré avec succès :', reg.scope);
      })
      .catch(err => {
        console.warn('Erreur Service Worker :', err);
      });
  }
}

// Chargement depuis le LocalStorage
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      appState = { ...appState, ...parsed };
      // Sécurité si le tableau de cachets n'a pas 15 éléments
      if (!Array.isArray(appState.pills) || appState.pills.length !== 15) {
        appState = createInitialTestState();
        saveState();
      }
    } else {
      appState = createInitialTestState();
      saveState();
    }
  } catch (e) {
    console.error('Erreur de lecture du stockage local :', e);
    appState = createInitialTestState();
  }
  updateNotificationDot();
}

// Sauvegarde dans le LocalStorage
function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
  } catch (e) {
    console.error('Erreur de sauvegarde locale :', e);
  }
}

// Date du jour formatée pour l'en-tête
function renderHeaderDate() {
  const now = new Date();
  const options = { weekday: 'long', day: 'numeric', month: 'long' };
  currentDateDisplay.textContent = now.toLocaleDateString('fr-FR', options);
}

// Calcul des 15 dates à partir de startDate
function getPillDates() {
  const dates = [];
  const base = new Date(appState.startDate + 'T00:00:00');
  
  for (let i = 0; i < 15; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    dates.push(d);
  }
  return dates;
}

// Construction graphique de la plaquette
function renderBlister() {
  blisterGrid.innerHTML = '';
  const dates = getPillDates();
  const todayIso = getTodayIso();

  // Mise à jour du badge d'intervalle de la plaquette
  const packDateRangeText = document.getElementById('packDateRangeText');
  if (packDateRangeText && dates.length === 15) {
    const startStr = dates[0].toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    const endStr = dates[14].toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    packDateRangeText.textContent = `Plaquette du ${startStr} au ${endStr}`;
  }

  let pillIndex = 0;

  BLISTER_LAYOUT.forEach((row, rIdx) => {
    row.forEach((type, cIdx) => {
      const cell = document.createElement('div');
      cell.className = 'blister-cell';
      cell.dataset.row = rIdx;
      cell.dataset.col = cIdx;

      if (type === 'foil') {
        // Espace plat sans alvéole (ligne 4 au milieu)
        cell.classList.add('foil-gap');
      } else if (type === 'empty') {
        // Alvéole d'usine vide (ligne 3 entière, ligne 5 côtés)
        cell.classList.add('empty-factory');
        cell.innerHTML = `
          <div class="blister-cavity">
            <div class="empty-cavity-glare"></div>
          </div>
        `;
      } else if (type === 'pill') {
        // Alvéole contenant un comprimé
        const currentPillIdx = pillIndex;
        const pillData = appState.pills[currentPillIdx];
        const pillDate = dates[currentPillIdx];
        const pillDateIso = toIsoDate(pillDate);
        const isToday = pillDateIso === todayIso;

        cell.dataset.pillIndex = currentPillIdx;

        if (isToday) cell.classList.add('is-today');
        if (pillData.taken) cell.classList.add('taken');

        // Format JJ/MM
        const dayStr = String(pillDate.getDate()).padStart(2, '0');
        const monthStr = String(pillDate.getMonth() + 1).padStart(2, '0');
        const dateFormatted = `${dayStr}/${monthStr}`;

        cell.innerHTML = `
          <div class="blister-cavity" title="Comprimé ${currentPillIdx + 1} • ${dateFormatted}">
            <!-- Comprimé blanc sécable -->
            <div class="pill">
              <span class="pill-date">${dateFormatted}</span>
            </div>
            <!-- Badge quand le comprimé est pris (alvéole percée) -->
            <div class="taken-badge">
              <div class="taken-check">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
              <span class="taken-date-label">${dateFormatted}</span>
            </div>
          </div>
        `;

        // Événement clic sur le comprimé
        cell.addEventListener('click', () => {
          handlePillClick(currentPillIdx);
        });

        pillIndex++;
      }

      blisterGrid.appendChild(cell);
    });
  });
}

// Clic pour marquer ou annuler la prise d'un comprimé (STRICTEMENT RÉSERVÉ AU JOUR ACTUEL)
function handlePillClick(index) {
  const dates = getPillDates();
  const todayIso = getTodayIso();
  const pillDateIso = toIsoDate(dates[index]);

  // Restriction demandée : seul le comprimé de la date du jour peut être coché
  if (pillDateIso !== todayIso) {
    const cell = blisterGrid.querySelector(`[data-pill-index="${index}"]`);
    if (cell) {
      cell.classList.remove('shake-locked');
      void cell.offsetWidth; // Forcer le recalcul CSS pour relancer l'animation
      cell.classList.add('shake-locked');
      setTimeout(() => cell.classList.remove('shake-locked'), 400);
    }

    if (appState.hapticEnabled && 'vibrate' in navigator) {
      navigator.vibrate([40, 60, 40]);
    }
    playRejectSound();

    const pillDateFormatted = dates[index].toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
    const todayFormatted = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

    if (pillDateIso > todayIso) {
      showToast(`Action bloquée : ce comprimé est prévu pour le ${pillDateFormatted}`);
    } else {
      showToast(`Action bloquée : seul le comprimé d'aujourd'hui (${todayFormatted}) peut être validé`);
    }
    return;
  }

  // Le comprimé cliqué est bien celui du jour : on bascule son état
  const pill = appState.pills[index];
  const isNowTaken = !pill.taken;
  pill.taken = isNowTaken;
  pill.takenAt = isNowTaken ? new Date().toISOString() : null;

  saveState();

  // Retour haptique et sonore de succès
  if (appState.hapticEnabled && 'vibrate' in navigator) {
    navigator.vibrate([35, 25, 45]);
  }
  playPopSound(isNowTaken);

  // Mise à jour visuelle ciblée de la cellule
  const cell = blisterGrid.querySelector(`[data-pill-index="${index}"]`);
  if (cell) {
    if (isNowTaken) {
      cell.classList.add('taken');
    } else {
      cell.classList.remove('taken');
    }
  }

  updateStatusAndProgress();

  const dateStr = dates[index].toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  showToast(isNowTaken ? `Cachet du ${dateStr} validé ✓` : `Prise du ${dateStr} annulée`);
}

// Mise à jour de la bannière du jour et de la barre de progression
function updateStatusAndProgress() {
  const dates = getPillDates();
  const todayIso = getTodayIso();
  const todayIndex = dates.findIndex(d => toIsoDate(d) === todayIso);

  const takenCount = appState.pills.filter(p => p.taken).length;
  const percent = Math.round((takenCount / 15) * 100);

  progressCount.textContent = `${takenCount} / 15 comprimés`;
  progressPercent.textContent = `${percent}%`;
  progressFill.style.width = `${percent}%`;

  // Gestion de l'état du jour
  statusBanner.classList.remove('taken', 'pending');
  btnQuickTake.style.display = 'none';

  if (todayIndex !== -1) {
    const todayPill = appState.pills[todayIndex];
    if (todayPill.taken) {
      statusBanner.classList.add('taken');
      statusIcon.innerHTML = `
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
          <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
      `;
      statusTitle.textContent = "Comprimé du jour pris";
      if (todayPill.takenAt) {
        const timeStr = new Date(todayPill.takenAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        statusDesc.textContent = `Validé aujourd'hui à ${timeStr}`;
      } else {
        statusDesc.textContent = "Validé pour aujourd'hui";
      }
    } else {
      statusBanner.classList.add('pending');
      statusIcon.innerHTML = `
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      `;
      statusTitle.textContent = "À prendre aujourd'hui";
      statusDesc.textContent = `Rappel programmé à ${appState.reminderTime}`;
      btnQuickTake.style.display = 'block';
      btnQuickTake.onclick = () => handlePillClick(todayIndex);
    }
  } else {
    // Si la date du jour est hors de la plaquette
    const firstDate = dates[0];
    const lastDate = dates[14];
    const today = new Date(todayIso);

    if (today < firstDate) {
      statusTitle.textContent = "Plaquette à venir";
      statusDesc.textContent = `Débute le ${firstDate.toLocaleDateString('fr-FR')}`;
    } else {
      statusBanner.classList.add('taken');
      statusTitle.textContent = "Plaquette terminée";
      statusDesc.textContent = "15 comprimés sur 15 complétés";
    }
  }
}

// Vérification du rappel quotidien à 10h (ou heure configurée)
function checkDailyReminder() {
  const now = new Date();
  const currentHours = String(now.getHours()).padStart(2, '0');
  const currentMinutes = String(now.getMinutes()).padStart(2, '0');
  const currentTime = `${currentHours}:${currentMinutes}`;

  if (currentTime === appState.reminderTime) {
    const dates = getPillDates();
    const todayIso = getTodayIso();
    const todayIdx = dates.findIndex(d => toIsoDate(d) === todayIso);

    if (todayIdx !== -1 && !appState.pills[todayIdx].taken) {
      sendNotification("Médocs : Rappel de prise", "Il est l'heure de prendre votre comprimé du jour !");
    }
  }
}

// Envoi d'une notification locale
function sendNotification(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }

  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'SHOW_NOTIFICATION',
      title: title,
      body: body
    });
  } else {
    new Notification(title, {
      body: body,
      icon: 'icon.svg',
      badge: 'icon.svg',
      vibrate: [200, 100, 200]
    });
  }
}

// Gestion des écouteurs d'événements
function setupEventListeners() {
  // Bouton de notifications
  btnNotify.addEventListener('click', async () => {
    if (!('Notification' in window)) {
      showToast("Les notifications ne sont pas supportées par ce navigateur");
      return;
    }

    if (Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        appState.notificationsEnabled = true;
        saveState();
        updateNotificationDot();
        showToast("Rappels à 10h00 activés ✓");
        sendNotification("Médocs activé", "Vos rappels quotidiens de prise sont configurés.");
      } else {
        showToast("Notifications refusées");
      }
    } else if (Notification.permission === 'granted') {
      showToast(`Rappels actifs chaque jour à ${appState.reminderTime}`);
    } else {
      showToast("Veuillez autoriser les notifications dans les paramètres du téléphone");
    }
  });

  // Clic sur le badge de plaquette dans l'en-tête pour ouvrir directement la modal
  const packDateBadge = document.getElementById('packDateBadge');
  if (packDateBadge) {
    packDateBadge.addEventListener('click', () => {
      openNewPackModal();
    });
  }

  // Modal Paramètres
  btnSettings.addEventListener('click', () => {
    startDateInput.value = appState.startDate;
    reminderTimeInput.value = appState.reminderTime;
    hapticCheck.checked = appState.hapticEnabled;

    updateSettingsPreview(appState.startDate);

    const taken = appState.pills.filter(p => p.taken).length;
    modalPillsTaken.textContent = taken;
    modalPillsLeft.textContent = 15 - taken;
    modalDaysStreak.textContent = `${taken} j`;

    settingsModal.style.display = 'flex';
  });

  startDateInput.addEventListener('input', () => {
    updateSettingsPreview(startDateInput.value);
  });

  btnCloseSettings.addEventListener('click', () => {
    settingsModal.style.display = 'none';
  });

  btnSaveSettings.addEventListener('click', () => {
    if (startDateInput.value) {
      appState.startDate = startDateInput.value;
    }
    if (reminderTimeInput.value) {
      appState.reminderTime = reminderTimeInput.value;
    }
    appState.hapticEnabled = hapticCheck.checked;
    saveState();
    settingsModal.style.display = 'none';
    renderBlister();
    updateStatusAndProgress();
    showToast("Paramètres enregistrés ✓");
  });

  // Modal Nouvelle Plaquette
  function openNewPackModal() {
    newPackDate.value = getTodayIso();
    updateNewPackPreview(newPackDate.value);
    confirmNewModal.style.display = 'flex';
  }

  btnNewPack.addEventListener('click', () => {
    openNewPackModal();
  });

  // Raccourcis de sélection de date rapide
  const btnQuickToday = document.getElementById('btnQuickToday');
  const btnQuickYesterday = document.getElementById('btnQuickYesterday');
  const btnQuickTomorrow = document.getElementById('btnQuickTomorrow');

  if (btnQuickToday) {
    btnQuickToday.addEventListener('click', () => {
      newPackDate.value = getTodayIso();
      updateNewPackPreview(newPackDate.value);
    });
  }

  if (btnQuickYesterday) {
    btnQuickYesterday.addEventListener('click', () => {
      newPackDate.value = getOffsetDateIso(-1);
      updateNewPackPreview(newPackDate.value);
    });
  }

  if (btnQuickTomorrow) {
    btnQuickTomorrow.addEventListener('click', () => {
      newPackDate.value = getOffsetDateIso(1);
      updateNewPackPreview(newPackDate.value);
    });
  }

  newPackDate.addEventListener('input', () => {
    updateNewPackPreview(newPackDate.value);
  });

  btnCloseNewModal.addEventListener('click', () => {
    confirmNewModal.style.display = 'none';
  });

  btnCancelNew.addEventListener('click', () => {
    confirmNewModal.style.display = 'none';
  });

  btnConfirmNew.addEventListener('click', () => {
    const selectedDate = newPackDate.value || getTodayIso();
    appState.startDate = selectedDate;
    appState.pills = Array(15).fill(null).map(() => ({ taken: false, takenAt: null }));
    saveState();
    confirmNewModal.style.display = 'none';
    renderBlister();
    updateStatusAndProgress();
    
    const d = new Date(selectedDate + 'T00:00:00');
    const startStr = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
    showToast(`Nouvelle plaquette débutée le ${startStr} !`);
  });

  // Fermer les modales au clic sur l'arrière-plan
  window.addEventListener('click', (e) => {
    if (e.target === settingsModal) settingsModal.style.display = 'none';
    if (e.target === confirmNewModal) confirmNewModal.style.display = 'none';
  });
}

// Calcul de la plage de 15 jours pour la prévisualisation
function updateNewPackPreview(startDateStr) {
  const previewEl = document.getElementById('newPackPreviewText');
  if (!previewEl || !startDateStr) return;

  const start = new Date(startDateStr + 'T00:00:00');
  const end = new Date(start);
  end.setDate(start.getDate() + 14);

  const opt = { weekday: 'short', day: 'numeric', month: 'short' };
  const startFormatted = start.toLocaleDateString('fr-FR', opt);
  const endFormatted = end.toLocaleDateString('fr-FR', opt);

  previewEl.textContent = `Du ${startFormatted} au ${endFormatted} (15 jours)`;
}

function updateSettingsPreview(startDateStr) {
  const previewEl = document.getElementById('settingsDatePreview');
  if (!previewEl || !startDateStr) return;

  const start = new Date(startDateStr + 'T00:00:00');
  const end = new Date(start);
  end.setDate(start.getDate() + 14);

  const opt = { day: 'numeric', month: 'short' };
  previewEl.textContent = `Plaquette du ${start.toLocaleDateString('fr-FR', opt)} au ${end.toLocaleDateString('fr-FR', opt)} (15 jours)`;
}

function updateNotificationDot() {
  if ('Notification' in window && Notification.permission === 'granted') {
    notifyDot.classList.add('active');
  } else {
    notifyDot.classList.remove('active');
  }
}

// Bruit sonore de validation lors du perçage de l'alvéole
function playPopSound(isTaking) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = isTaking ? 'sine' : 'triangle';
    osc.frequency.setValueAtTime(isTaking ? 280 : 160, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(isTaking ? 80 : 220, ctx.currentTime + 0.08);

    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.08);
  } catch (e) {}
}

// Son discret de blocage / refus
function playRejectSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, ctx.currentTime);
    osc.frequency.setValueAtTime(100, ctx.currentTime + 0.09);

    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.14);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.14);
  } catch (e) {}
}

// Message toast éphémère
function showToast(message) {
  let toast = document.querySelector('.toast-msg');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast-msg';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');

  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.classList.remove('show');
  }, 2400);
}

// Utilitaires de dates
function getTodayIso() {
  return toIsoDate(new Date());
}

function getOffsetDateIso(daysOffset) {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return toIsoDate(d);
}

function toIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

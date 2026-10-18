/**
 * FahrplanAT - Frontend Controller
 * Handles stations autocomplete, timetable queries, carrier badges, and dynamic rendering.
 */

// Application State
const state = {
  origin: { id: '8100003', name: 'Wien Westbahnhof' },
  destination: { id: '8100002', name: 'Salzburg Hbf' },
  date: '',
  time: '',
  carrier: 'all',
  direct: false,
  journeys: [],
  pagination: { earlierRef: null, laterRef: null },
  isLoading: false
};

// Global AbortController for cancelling searches
let currentAbortController = null;

// DOM Elements
const elements = {
  form: document.getElementById('fahrplanForm'),
  originInput: document.getElementById('originInput'),
  originId: document.getElementById('originId'),
  originDropdown: document.getElementById('originDropdown'),
  clearOriginBtn: document.getElementById('clearOriginBtn'),
  destinationInput: document.getElementById('destinationInput'),
  destinationId: document.getElementById('destinationId'),
  destinationDropdown: document.getElementById('destinationDropdown'),
  clearDestinationBtn: document.getElementById('clearDestinationBtn'),
  swapStationsBtn: document.getElementById('swapStationsBtn'),
  dateInput: document.getElementById('dateInput'),
  timeInput: document.getElementById('timeInput'),
  setNowBtn: document.getElementById('setNowBtn'),
  carrierSelect: document.getElementById('carrierSelect'),
  directCheckbox: document.getElementById('directCheckbox'),
  submitBtn: document.getElementById('submitBtn'),
  routeBanner: document.getElementById('routeBanner'),
  bannerOrigin: document.getElementById('bannerOrigin'),
  bannerDestination: document.getElementById('bannerDestination'),
  bannerDate: document.getElementById('bannerDate'),
  resultsCountBadge: document.getElementById('resultsCountBadge'),
  resultsContainer: document.getElementById('resultsContainer'),
  loadingState: document.getElementById('loadingState'),
  errorState: document.getElementById('errorState'),
  errorMessage: document.getElementById('errorMessage'),
  errorDetails: document.getElementById('errorDetails'),
  retryBtn: document.getElementById('retryBtn'),
  emptyState: document.getElementById('emptyState'),
  earlierControls: document.getElementById('earlierControls'),
  loadEarlierBtn: document.getElementById('loadEarlierBtn'),
  laterControls: document.getElementById('laterControls'),
  loadLaterBtn: document.getElementById('loadLaterBtn'),
  quickStationChips: document.getElementById('quickStationChips')
};

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
  initDefaults();
  setupEventListeners();
  setupAutocomplete(elements.originInput, elements.originId, elements.originDropdown, elements.clearOriginBtn);
  setupAutocomplete(elements.destinationInput, elements.destinationId, elements.destinationDropdown, elements.clearDestinationBtn);
  
  // Render Lucide icons
  if (window.lucide) {
    lucide.createIcons();
  }

  // Trigger initial search for default route (Wien Westbahnhof -> Salzburg Hbf)
  performSearch();
});

/**
 * Initialize default date and time to current Austrian local time.
 */
function initDefaults() {
  const now = new Date();
  
  // Format Date: YYYY-MM-DD
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  state.date = `${year}-${month}-${day}`;
  elements.dateInput.value = state.date;

  // Format Time: HH:mm
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  state.time = `${hours}:${minutes}`;
  elements.timeInput.value = state.time;

  // Set default stations in inputs
  elements.originInput.value = state.origin.name;
  elements.originId.value = state.origin.id;
  elements.clearOriginBtn.classList.remove('hidden');

  elements.destinationInput.value = state.destination.name;
  elements.destinationId.value = state.destination.id;
  elements.clearDestinationBtn.classList.remove('hidden');

  // 1. Restore persisted preferences from localStorage
  try {
    const savedDirect = localStorage.getItem('fahrplan_direct');
    if (savedDirect !== null) {
      state.direct = (savedDirect === 'true');
      elements.directCheckbox.checked = state.direct;
    }

    const savedCarrier = localStorage.getItem('fahrplan_carrier');
    if (savedCarrier !== null && ['all', 'oebb', 'westbahn'].includes(savedCarrier)) {
      state.carrier = savedCarrier;
      elements.carrierSelect.value = state.carrier;
    }
  } catch (err) {
    console.warn('localStorage read error:', err);
  }
}

/**
 * Setup DOM event listeners.
 */
function setupEventListeners() {
  // Form submission
  elements.form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (state.isLoading) {
      cancelSearch();
      return;
    }

    state.origin.name = elements.originInput.value.trim();
    state.origin.id = elements.originId.value;
    state.destination.name = elements.destinationInput.value.trim();
    state.destination.id = elements.destinationId.value;
    state.date = elements.dateInput.value;
    state.time = elements.timeInput.value;
    state.carrier = elements.carrierSelect.value;
    state.direct = elements.directCheckbox.checked;

    // Persist preferences
    try {
      localStorage.setItem('fahrplan_direct', state.direct ? 'true' : 'false');
      localStorage.setItem('fahrplan_carrier', state.carrier);
    } catch (err) {
      console.warn('localStorage save error:', err);
    }

    performSearch();
  });

  // Submit button direct click to toggle / cancel search
  elements.submitBtn.addEventListener('click', (e) => {
    if (state.isLoading) {
      e.preventDefault();
      cancelSearch();
    }
  });

  // "Jetzt" (Now) button
  elements.setNowBtn.addEventListener('click', () => {
    initDefaults();
    performSearch();
  });

  // Station Swap button
  elements.swapStationsBtn.addEventListener('click', () => {
    const tempName = elements.originInput.value;
    const tempId = elements.originId.value;

    elements.originInput.value = elements.destinationInput.value;
    elements.originId.value = elements.destinationId.value;
    state.origin = { id: elements.originId.value, name: elements.originInput.value };

    elements.destinationInput.value = tempName;
    elements.destinationId.value = tempId;
    state.destination = { id: elements.destinationId.value, name: elements.destinationInput.value };

    performSearch();
  });

  // Quick Chips Buttons
  elements.quickStationChips.addEventListener('click', (e) => {
    const chip = e.target.closest('.quick-chip');
    if (!chip) return;

    const id = chip.dataset.id;
    const name = chip.dataset.name;

    // If destination is already the chip, set origin instead; otherwise set destination
    if (elements.destinationId.value === id) {
      elements.originInput.value = name;
      elements.originId.value = id;
      state.origin = { id, name };
      elements.clearOriginBtn.classList.remove('hidden');
    } else {
      elements.destinationInput.value = name;
      elements.destinationId.value = id;
      state.destination = { id, name };
      elements.clearDestinationBtn.classList.remove('hidden');
    }

    performSearch();
  });

  // Retry Button
  elements.retryBtn.addEventListener('click', () => {
    performSearch();
  });

  // Earlier / Later Pagination
  elements.loadEarlierBtn.addEventListener('click', () => {
    if (state.pagination.earlierRef) {
      performSearch({ earlierRef: state.pagination.earlierRef });
    }
  });

  elements.loadLaterBtn.addEventListener('click', () => {
    if (state.pagination.laterRef) {
      performSearch({ laterRef: state.pagination.laterRef });
    }
  });

  // Live filter changes
  elements.carrierSelect.addEventListener('change', () => {
    state.carrier = elements.carrierSelect.value;
    try { localStorage.setItem('fahrplan_carrier', state.carrier); } catch (e) {}
    performSearch();
  });

  elements.directCheckbox.addEventListener('change', () => {
    state.direct = elements.directCheckbox.checked;
    try { localStorage.setItem('fahrplan_direct', state.direct ? 'true' : 'false'); } catch (e) {}
    performSearch();
  });
}

/**
 * Autocomplete logic for station search inputs.
 */
function setupAutocomplete(inputEl, idEl, dropdownEl, clearBtn) {
  let debounceTimer = null;

  // Clear button logic
  clearBtn.addEventListener('click', () => {
    inputEl.value = '';
    idEl.value = '';
    clearBtn.classList.add('hidden');
    dropdownEl.classList.add('hidden');
    inputEl.focus();
  });

  inputEl.addEventListener('input', () => {
    const query = inputEl.value.trim();
    if (query) {
      clearBtn.classList.remove('hidden');
    } else {
      clearBtn.classList.add('hidden');
      idEl.value = '';
    }

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      fetchStations(query, dropdownEl, inputEl, idEl);
    }, 200);
  });

  inputEl.addEventListener('focus', () => {
    if (!inputEl.value.trim()) {
      fetchStations('', dropdownEl, inputEl, idEl);
    }
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!inputEl.contains(e.target) && !dropdownEl.contains(e.target)) {
      dropdownEl.classList.add('hidden');
    }
  });
}

/**
 * Fetch stations from serverless API and populate dropdown.
 */
async function fetchStations(query, dropdownEl, inputEl, idEl) {
  try {
    const url = `/api/stations?q=${encodeURIComponent(query)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const data = await res.json();

    if (data.success && data.stations && data.stations.length > 0) {
      renderDropdownItems(data.stations, dropdownEl, inputEl, idEl);
      dropdownEl.classList.remove('hidden');
    } else {
      dropdownEl.innerHTML = '<li class="text-xs text-slate-500 py-2 text-center">Kein Bahnhof gefunden</li>';
      dropdownEl.classList.remove('hidden');
    }
  } catch (err) {
    console.warn('Stations lookup failed:', err);
    dropdownEl.classList.add('hidden');
  }
}

/**
 * Render items in autocomplete dropdown.
 */
function renderDropdownItems(stations, dropdownEl, inputEl, idEl) {
  dropdownEl.innerHTML = '';
  stations.forEach((st) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <div class="flex items-center space-x-2">
        <i data-lucide="${st.isPopular ? 'star' : 'map-pin'}" class="w-3.5 h-3.5 ${st.isPopular ? 'text-amber-400' : 'text-slate-400'}"></i>
        <span class="font-medium">${escapeHtml(st.name)}</span>
      </div>
      <span class="text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded font-mono">${st.shortName || ''}</span>
    `;

    li.addEventListener('click', () => {
      inputEl.value = st.name;
      idEl.value = st.id;
      dropdownEl.classList.add('hidden');
      if (window.lucide) lucide.createIcons();
    });

    dropdownEl.appendChild(li);
  });

  if (window.lucide) lucide.createIcons();
}

/**
 * Execute timetable query against the Netlify serverless function.
 */
async function performSearch(paginationOptions = {}) {
  const origin = elements.originId.value || elements.originInput.value.trim();
  const destination = elements.destinationId.value || elements.destinationInput.value.trim();

  if (!origin || !destination) {
    showError('Bitte Start- und Zielbahnhof angeben.');
    return;
  }

  // Cancel prior active request if any
  if (currentAbortController) {
    currentAbortController.abort();
  }
  currentAbortController = new AbortController();

  setLoading(true);

  // Update Route Banner
  elements.bannerOrigin.textContent = elements.originInput.value.trim() || 'Start';
  elements.bannerDestination.textContent = elements.destinationInput.value.trim() || 'Ziel';
  elements.bannerDate.textContent = formatDateLabel(elements.dateInput.value);
  elements.routeBanner.classList.remove('hidden');

  const params = new URLSearchParams({
    origin,
    destination,
    date: elements.dateInput.value,
    time: elements.timeInput.value,
    carrier: elements.carrierSelect.value,
    direct: elements.directCheckbox.checked ? 'true' : 'false',
    hours: '12'
  });

  if (paginationOptions.earlierRef) params.append('earlierRef', paginationOptions.earlierRef);
  if (paginationOptions.laterRef) params.append('laterRef', paginationOptions.laterRef);

  try {
    const response = await fetch(`/api/fahrplan?${params.toString()}`, {
      signal: currentAbortController.signal
    });
    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Fehler beim Laden des Fahrplans.');
    }

    state.journeys = data.journeys || [];
    state.pagination = data.pagination || { earlierRef: null, laterRef: null };

    renderResults(state.journeys);
    updatePaginationControls();
  } catch (err) {
    if (err.name === 'AbortError') {
      console.log('Fahrplan query cancelled by user.');
      return;
    }
    console.error('Search error:', err);
    showError(err.message);
  } finally {
    currentAbortController = null;
    setLoading(false);
  }
}

/**
 * Cancel the currently running search query.
 */
function cancelSearch() {
  if (currentAbortController) {
    currentAbortController.abort();
    currentAbortController = null;
  }
  setLoading(false);
  if (state.journeys && state.journeys.length > 0) {
    renderResults(state.journeys);
  } else {
    elements.loadingState.classList.add('hidden');
  }
}

/**
 * Render list of journey cards.
 */
function renderResults(journeys) {
  elements.resultsContainer.innerHTML = '';

  if (!journeys || journeys.length === 0) {
    elements.emptyState.classList.remove('hidden');
    elements.resultsCountBadge.textContent = '0 Züge';
    return;
  }

  elements.emptyState.classList.add('hidden');
  elements.resultsCountBadge.textContent = `${journeys.length} ${journeys.length === 1 ? 'Zug' : 'Züge'} (nächste 12 Std.)`;

  journeys.forEach((journey, index) => {
    const card = createJourneyCard(journey, index);
    elements.resultsContainer.appendChild(card);
  });

  if (window.lucide) {
    lucide.createIcons();
  }
}

/**
 * Build HTML DOM element for a single journey card.
 */
function createJourneyCard(journey, index) {
  const card = document.createElement('div');
  const carrierKey = journey.carrierSummary?.primary || 'other';
  card.className = `journey-card stripe-${carrierKey} rounded-xl overflow-hidden animate-slide-in`;
  card.style.animationDelay = `${index * 30}ms`;

  const depTime = formatTimeOnly(journey.departureTime);
  const arrTime = formatTimeOnly(journey.arrivalTime);
  const originShort = shortenStation(journey.originName);
  const destShort = shortenStation(journey.destinationName);
  const depPlat = journey.departurePlatform ? `Gl. ${journey.departurePlatform}` : '';
  const arrPlat = journey.arrivalPlatform ? `Gl. ${journey.arrivalPlatform}` : '';
  const mobilePill = getMobileCarrierPill(journey);

  // Desktop Carrier Badge HTML
  let carrierBadgeHtml = '';
  if (journey.carrierSummary?.primary === 'westbahn') {
    carrierBadgeHtml = `
      <span class="inline-flex items-center px-3 py-1 rounded-full badge-westbahn text-xs font-bold tracking-wide">
        <i data-lucide="train" class="w-3.5 h-3.5 mr-1.5"></i> WESTbahn
      </span>`;
  } else if (journey.carrierSummary?.primary === 'oebb') {
    carrierBadgeHtml = `
      <span class="inline-flex items-center px-3 py-1 rounded-full badge-oebb text-xs font-bold tracking-wide">
        <i data-lucide="train" class="w-3.5 h-3.5 mr-1.5"></i> ÖBB
      </span>`;
  } else if (journey.carrierSummary?.primary === 'kombi') {
    carrierBadgeHtml = `
      <span class="inline-flex items-center px-3 py-1 rounded-full badge-kombi text-xs font-bold tracking-wide">
        <i data-lucide="git-merge" class="w-3.5 h-3.5 mr-1.5"></i> Kombi: ÖBB & WESTbahn
      </span>`;
  } else {
    carrierBadgeHtml = `
      <span class="inline-flex items-center px-3 py-1 rounded-full badge-local text-xs font-semibold">
        ${escapeHtml(journey.carrierSummary?.label || 'Verbindung')}
      </span>`;
  }

  // Delay Badges
  const depDelayHtml = journey.departureDelay?.isDelayed
    ? `<span class="ml-2 text-xs font-bold text-rose-400 bg-rose-950/80 px-2 py-0.5 rounded border border-rose-800">${journey.departureDelay.text}</span>`
    : `<span class="ml-2 text-xs font-semibold text-emerald-400">Pünktlich</span>`;

  // Train Products Label
  const trainNames = journey.legs
    .filter(l => l.line)
    .map(l => `<span class="inline-block bg-slate-800 text-slate-200 border border-slate-700/80 px-2 py-0.5 rounded text-xs font-mono font-bold mr-1.5">${escapeHtml(l.line.name)}</span>`)
    .join('');

  // Transfer count label
  const transferLabel = journey.isDirect
    ? `<span class="text-emerald-400 font-semibold flex items-center"><i data-lucide="check-circle-2" class="w-3.5 h-3.5 mr-1"></i> Direktverbindung</span>`
    : `<span class="text-amber-400 font-semibold flex items-center"><i data-lucide="git-branch" class="w-3.5 h-3.5 mr-1"></i> ${journey.transfers} ${journey.transfers === 1 ? 'Umstieg' : 'Umstiege'}</span>`;

  card.innerHTML = `
    <!-- 📱 MOBILE ULTRA-COMPACT VIEW (ca. 52px Höhe -> 10 Züge gleichzeitig am Smartphone sichtbar!) -->
    <div class="sm:hidden block px-3 py-2 cursor-pointer mobile-card-trigger hover:bg-slate-800/40 transition-colors select-none">
      <div class="grid grid-cols-[auto,1fr,auto] items-center gap-2">
        <!-- Left: Times & Delay -->
        <div class="flex items-baseline space-x-1.5">
          <span class="font-display font-extrabold text-[15px] text-white tracking-tight">${depTime}</span>
          <span class="text-slate-500 text-xs">→</span>
          <span class="font-display font-extrabold text-[15px] text-white tracking-tight">${arrTime}</span>
          ${journey.departureDelay?.isDelayed 
            ? `<span class="text-[10px] font-bold text-rose-400 bg-rose-950 px-1 py-0.2 rounded border border-rose-800">${journey.departureDelay.text}</span>` 
            : `<span class="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" title="Pünktlich"></span>`
          }
        </div>

        <!-- Center: Fahrtdauer (Zentriert) -->
        <div class="text-center">
          <span class="inline-block text-[11px] font-bold text-slate-300 bg-slate-800/80 px-2 py-0.5 rounded-md tracking-tight">${formatDurationShort(journey.durationMinutes)}</span>
        </div>

        <!-- Right: Carrier Badge Pill -->
        <div class="flex items-center justify-end">
          ${mobilePill}
        </div>
      </div>

      <!-- Line 2: Stations & Transfers -->
      <div class="flex items-center justify-between text-[11px] text-slate-400 mt-0.5 leading-tight">
        <div class="truncate max-w-[200px] text-slate-300">
          <span>${escapeHtml(originShort)}</span>${depPlat ? ` <span class="text-slate-500 text-[10px]">(${depPlat})</span>` : ''}
          <span class="text-slate-600">→</span>
          <span>${escapeHtml(destShort)}</span>${arrPlat ? ` <span class="text-slate-500 text-[10px]">(${arrPlat})</span>` : ''}
        </div>
        <div class="flex items-center space-x-1 flex-shrink-0 text-[10px]">
          <span class="${journey.isDirect ? 'text-emerald-400 font-semibold' : 'text-amber-400'}">
            ${journey.isDirect ? 'Direkt' : `${journey.transfers} Umst.`}
          </span>
          <i data-lucide="chevron-down" class="mobile-chevron w-3 h-3 text-slate-500 transition-transform duration-200"></i>
        </div>
      </div>
    </div>

    <!-- 💻 DESKTOP / TABLET SPACIOUS VIEW (sm:block) -->
    <div class="hidden sm:block p-5 sm:p-6">
      <!-- Top Row: Carrier Badge & Products -->
      <div class="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800/80">
        <div class="flex items-center space-x-2">
          ${carrierBadgeHtml}
          <div class="flex flex-wrap items-center mt-1 sm:mt-0">${trainNames}</div>
        </div>
        <div class="text-xs text-slate-400">
          ${transferLabel}
        </div>
      </div>

      <!-- Middle Row: Times, Stations, Duration -->
      <div class="grid grid-cols-1 sm:grid-cols-[1fr,auto,1fr] gap-4 items-center py-4">
        
        <!-- Departure -->
        <div class="space-y-1">
          <div class="flex items-baseline space-x-2">
            <span class="font-display text-2xl sm:text-3xl font-extrabold text-white tracking-tight">${depTime}</span>
            ${depDelayHtml}
          </div>
          <div class="text-sm font-semibold text-slate-200 truncate" title="${escapeHtml(journey.originName)}">
            ${escapeHtml(journey.originName)}
          </div>
          ${journey.departurePlatform ? `<div class="text-xs text-slate-400 font-medium"><i data-lucide="signpost" class="inline w-3 h-3 mr-1 text-slate-400"></i> Bahnsteig ${escapeHtml(journey.departurePlatform)}</div>` : ''}
        </div>

        <!-- Duration Visual Indicator & Interactive Details Toggle -->
        <div class="flex flex-col items-center justify-center">
          <button
            type="button"
            class="duration-toggle-btn group flex flex-col items-center justify-center px-3.5 py-1.5 rounded-xl hover:bg-slate-800/80 active:scale-95 border border-transparent hover:border-slate-700/80 transition-all cursor-pointer"
            title="Klicken für Fahrtverlauf &amp; Details"
          >
            <div class="text-xs font-bold text-slate-300 group-hover:text-rose-400 tracking-wider flex items-center transition-colors">
              <i data-lucide="clock" class="w-3.5 h-3.5 mr-1 text-slate-400 group-hover:text-rose-400 transition-colors"></i>
              <span>${journey.durationFormatted}</span>
              <i data-lucide="chevron-down" class="duration-chevron w-3.5 h-3.5 ml-1 text-slate-500 group-hover:text-rose-400 transition-transform duration-200"></i>
            </div>
            <div class="w-20 sm:w-28 h-0.5 bg-gradient-to-r from-rose-500 via-amber-400 to-sky-400 my-1.5 relative">
              <div class="w-2 h-2 rounded-full bg-slate-900 border-2 border-rose-500 absolute -top-0.5 left-0"></div>
              <div class="w-2 h-2 rounded-full bg-slate-900 border-2 border-sky-400 absolute -top-0.5 right-0"></div>
            </div>
            <div class="text-[11px] text-slate-400 group-hover:text-slate-300 transition-colors font-medium flex items-center space-x-1">
              <span>${journey.isDirect ? 'Direkt' : `${journey.transfers} Umst.`}</span>
              <span class="text-slate-600">•</span>
              <span class="text-rose-400/90 font-medium group-hover:underline">Details</span>
            </div>
          </button>
        </div>

        <!-- Arrival -->
        <div class="space-y-1 sm:text-right">
          <div class="flex items-baseline space-x-2 sm:justify-end">
            <span class="font-display text-2xl sm:text-3xl font-extrabold text-white tracking-tight">${arrTime}</span>
          </div>
          <div class="text-sm font-semibold text-slate-200 truncate" title="${escapeHtml(journey.destinationName)}">
            ${escapeHtml(journey.destinationName)}
          </div>
          ${journey.arrivalPlatform ? `<div class="text-xs text-slate-400 font-medium"><i data-lucide="signpost" class="inline w-3 h-3 mr-1 text-slate-400"></i> Bahnsteig ${escapeHtml(journey.arrivalPlatform)}</div>` : ''}
        </div>

      </div>
    </div>

    <!-- Collapsible Legs Details Timeline (opened via duration or mobile card click) -->
    <div class="legs-details-panel hidden px-3 pb-3 sm:px-6 sm:pb-5 pt-2 sm:pt-4 border-t border-slate-800/80 space-y-3">
      ${renderLegsTimeline(journey.legs)}
    </div>
  `;

  // Attach toggle listener on both mobile trigger and desktop duration button
  const mobileTrigger = card.querySelector('.mobile-card-trigger');
  const desktopDurationBtn = card.querySelector('.duration-toggle-btn');
  const detailsPanel = card.querySelector('.legs-details-panel');
  const desktopChevron = desktopDurationBtn?.querySelector('.duration-chevron');
  const mobileChevron = mobileTrigger?.querySelector('.mobile-chevron');

  function toggleDetails() {
    const isHidden = detailsPanel.classList.contains('hidden');
    if (isHidden) {
      detailsPanel.classList.remove('hidden');
      if (desktopChevron) desktopChevron.style.transform = 'rotate(180deg)';
      if (mobileChevron) mobileChevron.style.transform = 'rotate(180deg)';
    } else {
      detailsPanel.classList.add('hidden');
      if (desktopChevron) desktopChevron.style.transform = 'rotate(0deg)';
      if (mobileChevron) mobileChevron.style.transform = 'rotate(0deg)';
    }
  }

  if (mobileTrigger) mobileTrigger.addEventListener('click', toggleDetails);
  if (desktopDurationBtn) desktopDurationBtn.addEventListener('click', toggleDetails);

  return card;
}

/**
 * Render the step-by-step leg timeline for a journey.
 */
function renderLegsTimeline(legs) {
  if (!legs || legs.length === 0) return '';

  return legs.map((leg, i) => {
    if (leg.walking) {
      return `
        <div class="flex items-start space-x-3 text-xs text-slate-400 py-1 pl-2 border-l-2 border-dashed border-slate-700 ml-4">
          <i data-lucide="footprints" class="w-4 h-4 text-slate-500"></i>
          <span>Fußweg (${leg.durationFormatted || 'ca. 5 Min.'}) zu ${escapeHtml(leg.destination?.name || '')}</span>
        </div>
      `;
    }

    const legCarrier = leg.carrier || {};
    const lineName = leg.line?.name || 'Zug';
    const direction = leg.line?.direction ? `Richtung ${escapeHtml(leg.line.direction)}` : '';
    const depTime = formatTimeOnly(leg.departure);
    const arrTime = formatTimeOnly(leg.arrival);

    const hasStopovers = leg.stopovers && leg.stopovers.length > 0;
    const stopoverCount = hasStopovers ? leg.stopovers.length : 0;

    return `
      <div class="bg-slate-900/90 rounded-xl p-4 border border-slate-800 space-y-3">
        
        <!-- Leg Header -->
        <div class="flex items-center justify-between text-xs">
          <div class="flex items-center space-x-2">
            <span class="inline-flex items-center px-2 py-0.5 rounded font-bold ${legCarrier.badgeClass || 'badge-other'}">
              ${escapeHtml(legCarrier.name || 'Zug')}
            </span>
            <span class="font-mono font-bold text-slate-200">${escapeHtml(lineName)}</span>
            <span class="text-slate-400 text-[11px]">${direction}</span>
          </div>
          <span class="text-slate-400 font-mono">${leg.durationFormatted}</span>
        </div>

        <!-- Departure Stop -->
        <div class="flex items-start justify-between text-xs">
          <div class="space-y-0.5">
            <div class="flex items-center space-x-2">
              <span class="font-bold text-slate-200 text-sm">${depTime}</span>
              <span class="font-medium text-slate-300">${escapeHtml(leg.origin?.name || '')}</span>
            </div>
            ${leg.origin?.platform ? `<div class="text-[11px] text-slate-400">Bahnsteig ${escapeHtml(leg.origin.platform)}</div>` : ''}
          </div>
          ${leg.departureDelay?.isDelayed ? `<span class="text-rose-400 font-bold">${leg.departureDelay.text}</span>` : ''}
        </div>

        <!-- Intermediate Stops Toggle -->
        ${hasStopovers ? `
          <div class="pl-4 py-1 text-xs">
            <button type="button" class="stopovers-toggle-btn text-[11px] text-slate-400 hover:text-slate-200 transition-colors flex items-center space-x-1" onclick="this.nextElementSibling.classList.toggle('hidden')">
              <i data-lucide="list" class="w-3 h-3"></i>
              <span>${stopoverCount} Zwischenhalte anzeigen</span>
            </button>
            <div class="stopovers-list hidden mt-2 pl-3 border-l border-slate-800 space-y-1.5 text-[11px] text-slate-400">
              ${leg.stopovers.map(s => `
                <div class="flex items-center justify-between">
                  <span>${escapeHtml(s.name)}</span>
                  <span class="font-mono">${formatTimeOnly(s.arrival || s.departure)}</span>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Arrival Stop -->
        <div class="flex items-start justify-between text-xs pt-1 border-t border-slate-800/60">
          <div class="space-y-0.5">
            <div class="flex items-center space-x-2">
              <span class="font-bold text-slate-200 text-sm">${arrTime}</span>
              <span class="font-medium text-slate-300">${escapeHtml(leg.destination?.name || '')}</span>
            </div>
            ${leg.destination?.platform ? `<div class="text-[11px] text-slate-400">Bahnsteig ${escapeHtml(leg.destination.platform)}</div>` : ''}
          </div>
          ${leg.arrivalDelay?.isDelayed ? `<span class="text-rose-400 font-bold">${leg.arrivalDelay.text}</span>` : ''}
        </div>

      </div>
    `;
  }).join('');
}

/**
 * Returns booking or info URL depending on carrier.
 */
function getBookingUrl(journey) {
  if (journey.carrierSummary?.primary === 'westbahn') {
    return 'https://westbahn.at';
  }
  return 'https://fahrplan.oebb.at';
}

/**
 * Update visibility and state of earlier/later pagination buttons.
 */
function updatePaginationControls() {
  if (state.pagination.earlierRef) {
    elements.earlierControls.classList.remove('hidden');
  } else {
    elements.earlierControls.classList.add('hidden');
  }

  if (state.pagination.laterRef) {
    elements.laterControls.classList.remove('hidden');
  } else {
    elements.laterControls.classList.add('hidden');
  }
}

/**
 * UI Loading State helper.
 */
function setLoading(loading) {
  state.isLoading = loading;
  if (loading) {
    elements.loadingState.classList.remove('hidden');
    elements.errorState.classList.add('hidden');
    elements.emptyState.classList.add('hidden');
    elements.resultsContainer.innerHTML = '';

    // Switch button to "Suche abbrechen"
    elements.submitBtn.innerHTML = `
      <i data-lucide="x-circle" class="w-4 h-4 mr-1.5 animate-pulse"></i>
      <span>Suche abbrechen</span>
    `;
    elements.submitBtn.className = 'w-full py-2.5 px-5 bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 text-white font-semibold rounded-xl shadow-lg shadow-red-900/50 active:scale-[0.98] transition-all flex items-center justify-center space-x-1 cursor-pointer';
    elements.submitBtn.disabled = false;
  } else {
    elements.loadingState.classList.add('hidden');

    // Switch button back to "Verbindungen suchen"
    elements.submitBtn.innerHTML = `
      <i data-lucide="search" class="w-4 h-4 mr-1.5"></i>
      <span>Verbindungen suchen</span>
    `;
    elements.submitBtn.className = 'w-full py-2.5 px-5 bg-gradient-to-r from-rose-600 via-rose-500 to-amber-500 hover:from-rose-500 hover:to-amber-400 text-white font-semibold rounded-xl shadow-lg shadow-rose-900/40 hover:shadow-rose-900/60 active:scale-[0.98] transition-all flex items-center justify-center space-x-2 cursor-pointer';
    elements.submitBtn.disabled = false;
  }

  if (window.lucide) {
    lucide.createIcons();
  }
}

/**
 * Display error banner.
 */
function showError(message) {
  elements.errorMessage.textContent = 'Abfrage fehlgeschlagen';
  elements.errorDetails.textContent = message || 'Die Fahrplandaten konnten nicht geladen werden.';
  elements.errorState.classList.remove('hidden');
  elements.resultsContainer.innerHTML = '';
  elements.emptyState.classList.add('hidden');
}

/**
 * Format ISO datetime string to HH:mm.
 */
function formatTimeOnly(isoString) {
  if (!isoString) return '--:--';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '--:--';
  return d.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit', hour12: false });
}

/**
 * Format date string into human readable German date.
 */
function formatDateLabel(dateString) {
  if (!dateString) return 'Heute';
  const d = new Date(`${dateString}T12:00:00`);
  if (isNaN(d.getTime())) return dateString;

  const today = new Date();
  if (
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear()
  ) {
    return 'Heute, ' + d.toLocaleDateString('de-AT', { day: 'numeric', month: 'short' });
  }

  return d.toLocaleDateString('de-AT', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Escape string for safe HTML rendering.
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Shorten station name for compact mobile display.
 */
function shortenStation(name) {
  if (!name) return '';
  return name
    .replace(/\s*\(Bahnsteige[^)]*\)/gi, '')
    .replace(/\s*\(U\)/gi, '')
    .replace(/\s*Bahnhst/gi, '')
    .replace(/Linz\/Donau/gi, 'Linz')
    .replace(/Wien Westbahnhof/gi, 'Wien West')
    .replace(/Wien Hauptbahnhof/gi, 'Wien Hbf')
    .replace(/Flughafen Wien Bahnhof/gi, 'Flughafen Wien')
    .trim();
}

/**
 * Format minutes into concise format (e.g. "1h 15m") for mobile display.
 */
function formatDurationShort(minutes) {
  if (isNaN(minutes) || minutes < 0) return '--';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * Generate compact mobile badge pill for carrier and line.
 */
function getMobileCarrierPill(journey) {
  const primary = journey.carrierSummary?.primary || 'other';
  const trainLegs = (journey.legs || []).filter(l => l.line);
  const firstLineName = trainLegs[0]?.line?.name || '';
  
  if (primary === 'westbahn') {
    const cleanNum = firstLineName.replace(/^WB\s*/i, '');
    return `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold badge-westbahn">WB ${escapeHtml(cleanNum)}</span>`;
  }
  if (primary === 'oebb') {
    return `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold badge-oebb">${escapeHtml(firstLineName)}</span>`;
  }
  if (primary === 'kombi') {
    return `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold badge-kombi">Kombi</span>`;
  }
  return `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold badge-local">${escapeHtml(firstLineName || 'Zug')}</span>`;
}


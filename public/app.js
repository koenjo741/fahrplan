/**
 * Fahrpläne EU - Frontend Controller
 * Modular, accessible client controller for European timetable queries and dynamic rendering.
 */

// ==========================================
// 1. Safe Local Storage Manager
// ==========================================
const Storage = {
  PREF_DIRECT_KEY: 'fahrplan_direct',
  PREF_CARRIER_KEY: 'fahrplan_carrier',

  getPreferences() {
    try {
      const savedDirect = localStorage.getItem(this.PREF_DIRECT_KEY);
      const savedCarrier = localStorage.getItem(this.PREF_CARRIER_KEY);
      return {
        direct: savedDirect !== null ? savedDirect === 'true' : false,
        carrier: savedCarrier && ['all', 'westbahn', 'oebb'].includes(savedCarrier) ? savedCarrier : 'all'
      };
    } catch (err) {
      console.warn('Storage read warning:', err);
      return { direct: false, carrier: 'all' };
    }
  },

  savePreferences({ direct, carrier }) {
    try {
      if (typeof direct === 'boolean') {
        localStorage.setItem(this.PREF_DIRECT_KEY, direct ? 'true' : 'false');
      }
      if (carrier) {
        localStorage.setItem(this.PREF_CARRIER_KEY, carrier);
      }
    } catch (err) {
      console.warn('Storage save warning:', err);
    }
  }
};

// ==========================================
// 2. Pure Formatting Utilities
// ==========================================
const Formatters = {
  /**
   * Escape HTML special characters.
   */
  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  /**
   * Format ISO string to 24-hour time HH:mm.
   */
  formatTimeOnly(isoString) {
    if (!isoString) return '--:--';
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '--:--';
    return d.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit', hour12: false });
  },

  /**
   * Format date into localized human-readable label.
   */
  formatDateLabel(dateString) {
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
  },

  /**
   * Format duration in minutes to concise short format (e.g. "1h 15m").
   */
  formatDurationShort(minutes) {
    if (isNaN(minutes) || minutes < 0) return '--';
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  },

  /**
   * Clean station names from parenthetical platform noise like (Bahnsteige 3-12).
   */
  cleanStationName(name) {
    if (!name) return '';
    return name
      .replace(/\s*\(Bahnsteig[^)]*\)/gi, '')
      .replace(/\s*\(U\)/gi, '')
      .replace(/\s*Bahnhst/gi, '')
      .trim();
  },

  /**
   * Shorten Austrian station names for clean, responsive displays.
   */
  shortenStation(name) {
    if (!name) return '';
    return this.cleanStationName(name)
      .replace(/Linz\/Donau/gi, 'Linz')
      .replace(/Wien Westbahnhof/gi, 'Wien West')
      .replace(/Wien Hauptbahnhof/gi, 'Wien Hbf')
      .replace(/Flughafen Wien Bahnhof/gi, 'Flughafen Wien')
      .trim();
  },

  /**
   * Extract clean line/train name without internal noise.
   */
  extractCleanLine(name) {
    if (!name) return '';
    return name.replace(/\s*\(Zug-Nr\.[^)]*\)/i, '').trim();
  }
};

// ==========================================
// 3. Central Application State
// ==========================================
const AppState = {
  origin: { id: '', name: '' },
  destination: { id: '', name: '' },
  date: '',
  time: '',
  carrier: 'all',
  direct: false,
  journeys: [],
  pagination: { earlierRef: null, laterRef: null },
  isLoading: false,
  abortController: null
};

// ==========================================
// 4. Cached DOM References
// ==========================================
const DOM = {
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
  loadingText: document.getElementById('loadingText'),
  errorState: document.getElementById('errorState'),
  errorMessage: document.getElementById('errorMessage'),
  errorDetails: document.getElementById('errorDetails'),
  retryBtn: document.getElementById('retryBtn'),
  emptyState: document.getElementById('emptyState'),
  emptyStateAction: document.getElementById('emptyStateAction'),
  showTransfersBtn: document.getElementById('showTransfersBtn'),
  earlierControls: document.getElementById('earlierControls'),
  loadEarlierBtn: document.getElementById('loadEarlierBtn'),
  laterControls: document.getElementById('laterControls'),
  loadLaterBtn: document.getElementById('loadLaterBtn'),
  quickStationChips: document.getElementById('quickStationChips'),
  liveClock: document.getElementById('liveClock')
};

// ==========================================
// 5. Header Live Clock Component
// ==========================================
const LiveClock = {
  intervalId: null,

  update() {
    if (!DOM.liveClock) return;
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    DOM.liveClock.textContent = `${day}.${month}.${year}, ${hours}:${minutes}`;
  },

  start() {
    this.update();
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = setInterval(() => this.update(), 1000);
  }
};

// ==========================================
// 6. Station Autocomplete Component
// ==========================================
const Autocomplete = {
  setup(inputEl, idEl, dropdownEl, clearBtn) {
    let debounceTimer = null;

    // Clear input
    clearBtn.addEventListener('click', () => {
      inputEl.value = '';
      inputEl.dataset.selectedName = '';
      idEl.value = '';
      clearBtn.classList.add('hidden');
      dropdownEl.classList.add('hidden');
      inputEl.focus();
    });

    // Input changes
    inputEl.addEventListener('input', () => {
      const query = inputEl.value.trim();
      // Invalidate station ID if user modified the text
      if (inputEl.dataset.selectedName && inputEl.dataset.selectedName !== query) {
        idEl.value = '';
        inputEl.dataset.selectedName = '';
      }

      if (query) {
        clearBtn.classList.remove('hidden');
      } else {
        clearBtn.classList.add('hidden');
        idEl.value = '';
        inputEl.dataset.selectedName = '';
      }

      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        this.fetchAndRender(query, dropdownEl, inputEl, idEl, clearBtn);
      }, 200);
    });

    // Focus on empty input triggers preset stations
    inputEl.addEventListener('focus', () => {
      if (!inputEl.value.trim()) {
        this.fetchAndRender('', dropdownEl, inputEl, idEl, clearBtn);
      }
    });

    // Close on click outside
    document.addEventListener('click', (e) => {
      if (!inputEl.contains(e.target) && !dropdownEl.contains(e.target)) {
        dropdownEl.classList.add('hidden');
      }
    });
  },

  async fetchAndRender(query, dropdownEl, inputEl, idEl, clearBtn) {
    try {
      const url = `/api/stations?q=${encodeURIComponent(query)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();

      if (data.success && data.stations && data.stations.length > 0) {
        this.renderDropdown(data.stations, dropdownEl, inputEl, idEl, clearBtn);
        dropdownEl.classList.remove('hidden');
      } else {
        dropdownEl.innerHTML = '<li class="text-xs text-slate-500 py-2 text-center">Kein Bahnhof gefunden</li>';
        dropdownEl.classList.remove('hidden');
      }
    } catch (err) {
      console.warn('Stations lookup failed:', err);
      dropdownEl.classList.add('hidden');
    }
  },

  renderDropdown(stations, dropdownEl, inputEl, idEl, clearBtn) {
    dropdownEl.innerHTML = '';
    stations.forEach((st) => {
      const cleanName = Formatters.cleanStationName(st.name);
      const cleanShort = Formatters.cleanStationName(st.shortName || '');
      const li = document.createElement('li');
      li.innerHTML = `
        <div class="flex items-center space-x-2">
          <i data-lucide="${st.isPopular ? 'star' : 'map-pin'}" class="w-3.5 h-3.5 ${st.isPopular ? 'text-amber-400' : 'text-slate-400'}"></i>
          <span class="font-medium">${Formatters.escapeHtml(cleanName)}</span>
        </div>
        <span class="text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded font-mono">${cleanShort}</span>
      `;

      li.addEventListener('click', () => {
        inputEl.value = cleanName;
        inputEl.dataset.selectedName = cleanName;
        idEl.value = st.id;
        clearBtn.classList.remove('hidden');
        dropdownEl.classList.add('hidden');
        if (window.lucide) lucide.createIcons();
      });

      dropdownEl.appendChild(li);
    });

    if (window.lucide) lucide.createIcons();
  }
};

// ==========================================
// 7. Journey Card & Timeline Renderer
// ==========================================
const CardRenderer = {
  createCard(journey, index) {
    const card = document.createElement('div');
    const carrierKey = journey.carrierSummary?.primary || 'other';
    card.className = `journey-card stripe-${carrierKey} rounded-xl overflow-hidden animate-slide-in`;
    card.style.animationDelay = `${index * 30}ms`;

    const depTime = Formatters.formatTimeOnly(journey.departureTime);
    const arrTime = Formatters.formatTimeOnly(journey.arrivalTime);
    const originShort = Formatters.shortenStation(journey.originName);
    const destShort = Formatters.shortenStation(journey.destinationName);
    const depPlat = journey.departurePlatform ? `Gl. ${journey.departurePlatform}` : '';
    const arrPlat = journey.arrivalPlatform ? `Gl. ${journey.arrivalPlatform}` : '';
    const mobilePill = this.getMobileCarrierPill(journey);

    // Desktop Carrier Badge HTML
    const primaryKey = journey.carrierSummary?.primary || 'other';
    const carrierName = journey.carrierSummary?.label || 'Verbindung';
    const badgeClass = journey.carrierSummary?.badgeClass || 'badge-local';
    const iconName = primaryKey === 'kombi' ? 'git-merge' : 'train';

    const carrierBadgeHtml = `
      <span class="inline-flex items-center px-3 py-1 rounded-full ${badgeClass} text-xs font-bold tracking-wide">
        <i data-lucide="${iconName}" class="w-3.5 h-3.5 mr-1.5"></i> ${Formatters.escapeHtml(carrierName)}
      </span>`;

    // Delay indicator
    const depDelayHtml = journey.departureDelay?.isDelayed
      ? `<span class="ml-2 text-xs font-bold text-rose-400 bg-rose-950/80 px-2 py-0.5 rounded border border-rose-800">${journey.departureDelay.text}</span>`
      : `<span class="ml-2 text-xs font-semibold text-emerald-400">Pünktlich</span>`;

    // Train Products Labels
    const trainNames = journey.legs
      .filter(l => l.line)
      .map(l => `<span class="inline-flex items-center justify-center w-44 h-7 whitespace-nowrap bg-slate-800 text-slate-200 border border-slate-700/80 px-2.5 rounded-lg text-xs font-mono font-bold mr-2 text-center flex-shrink-0">${Formatters.escapeHtml(l.line.name)}</span>`)
      .join('');

    // Transfer summary
    let transferSummaryText = '';
    if (!journey.isDirect && journey.legs && journey.legs.length > 1) {
      const transferStops = [];
      for (let i = 0; i < journey.legs.length - 1; i++) {
        const leg = journey.legs[i];
        if (leg.destination?.name && !leg.walking) {
          transferStops.push(Formatters.shortenStation(leg.destination.name));
        }
      }
      const distinctStops = [...new Set(transferStops)];
      if (distinctStops.length > 0) {
        transferSummaryText = ` in ${distinctStops.join(', ')}`;
      }
    }

    const transferLabel = journey.isDirect
      ? `<span class="text-emerald-400 font-semibold flex items-center"><i data-lucide="check-circle-2" class="w-3.5 h-3.5 mr-1"></i> Direktverbindung</span>`
      : `<span class="text-amber-400 font-semibold flex items-center"><i data-lucide="git-branch" class="w-3.5 h-3.5 mr-1"></i> ${journey.transfers} ${journey.transfers === 1 ? 'Umstieg' : 'Umstiege'}${Formatters.escapeHtml(transferSummaryText)}</span>`;

    card.innerHTML = `
      <!-- 📱 MOBILE ULTRA-COMPACT VIEW -->
      <div class="sm:hidden block px-3 py-2 cursor-pointer mobile-card-trigger hover:bg-slate-800/40 transition-colors select-none">
        <div class="grid grid-cols-[auto,1fr,auto] items-center gap-2">
          <!-- Left: Times & Delay -->
          <div class="flex items-baseline space-x-1.5">
            <span class="font-display font-medium text-[15px] text-white tracking-tight">${depTime}</span>
            <span class="text-slate-500 text-xs">→</span>
            <span class="font-display font-medium text-[15px] text-white tracking-tight">${arrTime}</span>
            ${journey.departureDelay?.isDelayed 
              ? `<span class="text-[10px] font-bold text-rose-400 bg-rose-950 px-1 py-0.2 rounded border border-rose-800">${journey.departureDelay.text}</span>` 
              : `<span class="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" title="Pünktlich"></span>`
            }
          </div>

          <!-- Center: Fahrtdauer -->
          <div class="text-center">
            <span class="inline-block text-[11px] font-medium text-slate-300 bg-slate-800/80 px-2 py-0.5 rounded-md tracking-tight">${Formatters.formatDurationShort(journey.durationMinutes)}</span>
          </div>

          <!-- Right: Carrier Badge Pill -->
          <div class="flex items-center justify-end">
            ${mobilePill}
          </div>
        </div>

        <!-- Line 2: Stations & Transfers -->
        <div class="flex items-center justify-between text-[11px] text-slate-400 mt-0.5 leading-tight gap-2">
          <div class="truncate flex-1 min-w-0 pr-2 text-slate-300">
            <span>${Formatters.escapeHtml(originShort)}</span>${depPlat ? ` <span class="text-slate-500 text-[10px]">(${depPlat})</span>` : ''}
            <span class="text-slate-600">→</span>
            <span>${Formatters.escapeHtml(destShort)}</span>${arrPlat ? ` <span class="text-slate-500 text-[10px]">(${arrPlat})</span>` : ''}
          </div>
          <div class="flex items-center space-x-1 flex-shrink-0 text-[10px]">
            <span class="${journey.isDirect ? 'text-emerald-400 font-semibold' : 'text-amber-400 font-medium'}">
              ${journey.isDirect ? 'Direkt' : `${journey.transfers} Umst.${transferSummaryText ? ` (${Formatters.escapeHtml(transferSummaryText.trim().replace(/^in\s*/, ''))})` : ''}`}
            </span>
            <i data-lucide="chevron-down" class="mobile-chevron w-3 h-3 text-slate-500 transition-transform duration-200"></i>
          </div>
        </div>
      </div>

      <!-- 💻 DESKTOP / TABLET SPACIOUS VIEW -->
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
              <span class="font-display text-2xl sm:text-3xl font-medium text-white tracking-tight">${depTime}</span>
              ${depDelayHtml}
            </div>
            <div class="text-sm font-semibold text-slate-200 truncate" title="${Formatters.escapeHtml(Formatters.cleanStationName(journey.originName))}">
              ${Formatters.escapeHtml(Formatters.cleanStationName(journey.originName))}
            </div>
            ${journey.departurePlatform ? `<div class="text-xs text-slate-400 font-medium"><i data-lucide="signpost" class="inline w-3 h-3 mr-1 text-slate-400"></i> Bahnsteig ${Formatters.escapeHtml(journey.departurePlatform)}</div>` : ''}
          </div>

          <!-- Duration Indicator & Details Toggle -->
          <div class="flex flex-col items-center justify-center">
            <button
              type="button"
              class="duration-toggle-btn group flex flex-col items-center justify-center px-3.5 py-1.5 rounded-xl hover:bg-slate-800/80 active:scale-95 border border-transparent hover:border-slate-700/80 transition-all cursor-pointer"
              title="Klicken für Fahrtverlauf &amp; Details"
            >
              <div class="text-xs font-medium text-slate-300 group-hover:text-slate-200 tracking-wider flex items-center transition-colors">
                <i data-lucide="clock" class="w-3.5 h-3.5 mr-1 text-slate-400 group-hover:text-slate-300 transition-colors"></i>
                <span>${journey.durationFormatted}</span>
                <i data-lucide="chevron-down" class="duration-chevron w-3.5 h-3.5 ml-1 text-slate-500 group-hover:text-slate-300 transition-transform duration-200"></i>
              </div>
              <div class="w-20 sm:w-28 h-0.5 bg-gradient-to-r from-rose-500 via-amber-400 to-sky-400 my-1.5 relative">
                <div class="w-2 h-2 rounded-full bg-slate-900 border-2 border-rose-500 absolute -top-0.5 left-0"></div>
                <div class="w-2 h-2 rounded-full bg-slate-900 border-2 border-sky-400 absolute -top-0.5 right-0"></div>
              </div>
              <div class="text-[11px] text-slate-400 group-hover:text-slate-300 transition-colors font-medium flex items-center space-x-1">
                ${journey.isDirect ? '' : `<span>${journey.transfers} Umst.</span><span class="text-slate-600">•</span>`}
                <span class="group-hover:underline">Details</span>
              </div>
            </button>
          </div>

          <!-- Arrival -->
          <div class="space-y-1 sm:text-right">
            <div class="flex items-baseline space-x-2 sm:justify-end">
              <span class="font-display text-2xl sm:text-3xl font-medium text-white tracking-tight">${arrTime}</span>
            </div>
            <div class="text-sm font-semibold text-slate-200 truncate" title="${Formatters.escapeHtml(Formatters.cleanStationName(journey.destinationName))}">
              ${Formatters.escapeHtml(Formatters.cleanStationName(journey.destinationName))}
            </div>
            ${journey.arrivalPlatform ? `<div class="text-xs text-slate-400 font-medium"><i data-lucide="signpost" class="inline w-3 h-3 mr-1 text-slate-400"></i> Bahnsteig ${Formatters.escapeHtml(journey.arrivalPlatform)}</div>` : ''}
          </div>
        </div>
      </div>

      <!-- Collapsible Legs Details Timeline -->
      <div class="legs-details-panel hidden px-3 pb-3 sm:px-6 sm:pb-5 pt-2 sm:pt-4 border-t border-slate-800/80 space-y-3">
        ${this.renderLegsTimeline(journey.legs)}
      </div>
    `;

    // Interactive accordion toggling
    const mobileTrigger = card.querySelector('.mobile-card-trigger');
    const desktopDurationBtn = card.querySelector('.duration-toggle-btn');
    const detailsPanel = card.querySelector('.legs-details-panel');
    const desktopChevron = desktopDurationBtn?.querySelector('.duration-chevron');
    const mobileChevron = mobileTrigger?.querySelector('.mobile-chevron');

    const toggleDetails = () => {
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
    };

    if (mobileTrigger) mobileTrigger.addEventListener('click', toggleDetails);
    if (desktopDurationBtn) desktopDurationBtn.addEventListener('click', toggleDetails);

    // Intermediate stops toggling (clean delegation without inline onclick)
    card.querySelectorAll('.stopovers-toggle-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const list = btn.nextElementSibling;
        if (list) list.classList.toggle('hidden');
      });
    });

    return card;
  },

  getMobileCarrierPill(journey) {
    const primary = journey.carrierSummary?.primary || 'other';
    const badgeClass = journey.carrierSummary?.badgeClass || 'badge-local';
    const trainLegs = (journey.legs || []).filter(l => l.line);
    const badgeClasses = 'w-[128px] inline-flex items-center justify-center text-center font-mono font-bold text-[10px] py-0.5 rounded tracking-tight flex-shrink-0 truncate';
    
    if (trainLegs.length === 0) {
      return `<span class="${badgeClasses} badge-local">Verbindung</span>`;
    }

    if (trainLegs.length > 1) {
      const l1 = Formatters.extractCleanLine(trainLegs[0]?.line?.name) || 'Zug';
      const l2 = Formatters.extractCleanLine(trainLegs[1]?.line?.name) || 'Zug';
      const multiLabel = `${l1} ➔ ${l2}`;
      const pillClass = primary === 'kombi' ? 'badge-kombi' : badgeClass;
      return `<span class="${badgeClasses} ${pillClass}" title="${Formatters.escapeHtml(multiLabel)}">${Formatters.escapeHtml(multiLabel)}</span>`;
    }

    const firstLineName = trainLegs[0]?.line?.name || '';
    if (primary === 'westbahn') {
      const cleanNum = firstLineName.replace(/^WB\s*/i, '');
      return `<span class="${badgeClasses} badge-westbahn">WB ${Formatters.escapeHtml(cleanNum || 'Zug')}</span>`;
    }
    return `<span class="${badgeClasses} ${badgeClass}">${Formatters.escapeHtml(firstLineName || 'Zug')}</span>`;
  },

  renderLegsTimeline(legs) {
    if (!legs || legs.length === 0) return '';
    const htmlParts = [];

    for (let i = 0; i < legs.length; i++) {
      const leg = legs[i];

      const isStationInternalWalk = leg.walking && (
        !leg.origin?.name || 
        leg.origin?.name === leg.destination?.name ||
        (i > 0 && legs[i-1].destination?.name === leg.destination?.name)
      );

      if (isStationInternalWalk) continue;

      // Transfer transition banner
      if (i > 0) {
        const prevLeg = legs[i - 1];
        if (prevLeg && prevLeg.arrival && leg.departure) {
          const waitMin = Math.round((new Date(leg.departure).getTime() - new Date(prevLeg.arrival).getTime()) / 60000);
          const transferStationName = Formatters.shortenStation(leg.origin?.name || prevLeg.destination?.name || 'Bahnhof');
          const prevPlat = prevLeg.arrivalPlatform || prevLeg.destination?.platform;
          const nextPlat = leg.departurePlatform || leg.origin?.platform;
          const platInfo = prevPlat && nextPlat ? `Gl. ${prevPlat} → Gl. ${nextPlat}` : (nextPlat ? `Ab Gl. ${nextPlat}` : '');

          htmlParts.push(`
            <div class="flex items-center justify-between px-3.5 py-2 my-2 bg-amber-950/40 border border-amber-600/50 rounded-xl text-xs text-amber-200">
              <div class="flex items-center space-x-2">
                <i data-lucide="git-branch" class="w-4 h-4 text-amber-400 flex-shrink-0"></i>
                <div>
                  <span class="font-bold">Umstieg in ${Formatters.escapeHtml(transferStationName)}</span>
                  <span class="text-amber-300/80 font-normal ml-1.5">• ${waitMin >= 0 ? `${waitMin} Min. Übergangszeit` : 'Direkter Anschluss'}</span>
                </div>
              </div>
              ${platInfo ? `<span class="text-[11px] font-mono text-amber-300 font-semibold bg-amber-900/60 px-2 py-0.5 rounded border border-amber-700/60">${Formatters.escapeHtml(platInfo)}</span>` : ''}
            </div>
          `);
        }
      }

      if (leg.walking) {
        htmlParts.push(`
          <div class="flex items-start space-x-3 text-xs text-slate-400 py-1.5 pl-3 border-l-2 border-dashed border-slate-700 ml-4 my-1">
            <i data-lucide="footprints" class="w-4 h-4 text-slate-500"></i>
            <span>Fußweg (${leg.durationFormatted || 'ca. 5 Min.'}) zu ${Formatters.escapeHtml(leg.destination?.name || '')}</span>
          </div>
        `);
        continue;
      }

      const legCarrier = leg.carrier || {};
      const lineName = leg.line?.name || 'Zug';
      const direction = leg.line?.direction ? `Richtung ${Formatters.escapeHtml(leg.line.direction)}` : '';
      const depTime = Formatters.formatTimeOnly(leg.departure);
      const arrTime = Formatters.formatTimeOnly(leg.arrival);
      const hasStopovers = leg.stopovers && leg.stopovers.length > 0;
      const stopoverCount = hasStopovers ? leg.stopovers.length : 0;

      htmlParts.push(`
        <div class="bg-slate-900/90 rounded-xl p-4 border border-slate-800 space-y-3">
          <!-- Leg Header -->
          <div class="flex items-center justify-between text-xs">
            <div class="flex items-center space-x-2">
              <span class="inline-flex items-center px-2 py-0.5 rounded font-bold ${legCarrier.badgeClass || 'badge-other'}">
                ${Formatters.escapeHtml(legCarrier.name || 'Zug')}
              </span>
              <span class="font-mono font-bold text-slate-200 inline-block min-w-[6.5rem] text-center">${Formatters.escapeHtml(lineName)}</span>
              <span class="text-slate-400 text-[11px]">${direction}</span>
            </div>
            <span class="text-slate-400 font-mono">${leg.durationFormatted}</span>
          </div>

          <!-- Departure Stop -->
          <div class="flex items-start justify-between text-xs">
            <div class="space-y-0.5">
              <div class="flex items-center space-x-2">
                <span class="font-bold text-slate-200 text-sm">${depTime}</span>
                <span class="font-medium text-slate-300">${Formatters.escapeHtml(Formatters.cleanStationName(leg.origin?.name || ''))}</span>
              </div>
              ${leg.origin?.platform ? `<div class="text-[11px] text-slate-400">Bahnsteig ${Formatters.escapeHtml(leg.origin.platform)}</div>` : ''}
            </div>
            ${leg.departureDelay?.isDelayed ? `<span class="text-rose-400 font-bold">${leg.departureDelay.text}</span>` : ''}
          </div>

          <!-- Intermediate Stops Toggle -->
          ${hasStopovers ? `
            <div class="pl-4 py-1 text-xs">
              <button type="button" class="stopovers-toggle-btn text-[11px] text-slate-400 hover:text-slate-200 transition-colors flex items-center space-x-1">
                <i data-lucide="list" class="w-3 h-3"></i>
                <span>${stopoverCount} Zwischenhalte anzeigen</span>
              </button>
              <div class="stopovers-list hidden mt-2 pl-3 border-l border-slate-800 space-y-1.5 text-[11px] text-slate-400">
                ${leg.stopovers.map(s => `
                  <div class="flex items-center justify-between">
                    <span>${Formatters.escapeHtml(Formatters.cleanStationName(s.name))}</span>
                    <span class="font-mono">${Formatters.formatTimeOnly(s.arrival || s.departure)}</span>
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
                <span class="font-medium text-slate-300">${Formatters.escapeHtml(Formatters.cleanStationName(leg.destination?.name || ''))}</span>
              </div>
              ${leg.destination?.platform ? `<div class="text-[11px] text-slate-400">Bahnsteig ${Formatters.escapeHtml(leg.destination.platform)}</div>` : ''}
            </div>
            ${leg.arrivalDelay?.isDelayed ? `<span class="text-rose-400 font-bold">${leg.arrivalDelay.text}</span>` : ''}
          </div>
        </div>
      `);
    }

    return htmlParts.join('');
  }
};

// ==========================================
// 8. Search & View Controller
// ==========================================
const SearchController = {
  initDateTimeInputs() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');

    AppState.date = `${year}-${month}-${day}`;
    AppState.time = `${hours}:${minutes}`;

    DOM.dateInput.value = AppState.date;
    DOM.timeInput.value = AppState.time;
  },

  setLoading(isLoading) {
    AppState.isLoading = isLoading;

    if (isLoading) {
      const selectedCarrier = DOM.carrierSelect ? DOM.carrierSelect.value : AppState.carrier;
      DOM.loadingText.textContent = selectedCarrier === 'westbahn'
        ? 'Fahrpläne der Westbahn werden abgefragt.'
        : 'Fahrpläne werden abgefragt.';

      DOM.loadingState.classList.remove('hidden');
      DOM.errorState.classList.add('hidden');
      DOM.emptyState.classList.add('hidden');
      DOM.resultsContainer.innerHTML = '';

      // Switch button to "Suche abbrechen" with rose/amber gradient
      DOM.submitBtn.innerHTML = `
        <i data-lucide="x-circle" class="w-4 h-4 mr-1.5 animate-pulse"></i>
        <span>Suche abbrechen</span>
      `;
      DOM.submitBtn.className = 'w-full py-2.5 px-5 btn-search-cancel font-semibold rounded-xl active:scale-[0.98] transition-all flex items-center justify-center space-x-1 cursor-pointer';
      DOM.submitBtn.disabled = false;
    } else {
      DOM.loadingState.classList.add('hidden');

      // Switch button back to "Verbindungen suchen" with #5EFCE8 -> #736EFE and white normal font
      DOM.submitBtn.innerHTML = `
        <i data-lucide="search" class="w-4 h-4 mr-1.5"></i>
        <span>Verbindungen suchen</span>
      `;
      DOM.submitBtn.className = 'w-full py-2.5 px-5 btn-search-submit text-white font-normal rounded-xl active:scale-[0.98] transition-all flex items-center justify-center space-x-2 cursor-pointer';
      DOM.submitBtn.disabled = false;
    }

    if (window.lucide) lucide.createIcons();
  },

  showError(message) {
    DOM.errorMessage.textContent = 'Abfrage fehlgeschlagen';
    DOM.errorDetails.textContent = message || 'Bitte überprüfe deine Eingabe.';
    DOM.errorState.classList.remove('hidden');
    DOM.loadingState.classList.add('hidden');
    DOM.resultsContainer.innerHTML = '';
    DOM.emptyState.classList.add('hidden');
    if (window.lucide) lucide.createIcons();
  },

  cancelSearch() {
    if (AppState.abortController) {
      AppState.abortController.abort();
      AppState.abortController = null;
    }
    this.setLoading(false);
    if (AppState.journeys && AppState.journeys.length > 0) {
      this.renderResults(AppState.journeys);
    } else {
      DOM.loadingState.classList.add('hidden');
    }
  },

  renderResults(journeys) {
    DOM.resultsContainer.innerHTML = '';

    if (!journeys || journeys.length === 0) {
      DOM.emptyState.classList.remove('hidden');
      DOM.resultsCountBadge.textContent = '0 Züge';
      if (AppState.direct) {
        DOM.emptyStateAction?.classList.remove('hidden');
      } else {
        DOM.emptyStateAction?.classList.add('hidden');
      }
      if (window.lucide) lucide.createIcons();
      return;
    }

    DOM.emptyState.classList.add('hidden');
    DOM.resultsCountBadge.textContent = `${journeys.length} ${journeys.length === 1 ? 'Zug' : 'Züge'} (nächste 12 Std.)`;

    journeys.forEach((journey, index) => {
      const card = CardRenderer.createCard(journey, index);
      DOM.resultsContainer.appendChild(card);
    });

    if (window.lucide) lucide.createIcons();
  },

  updatePaginationControls() {
    if (AppState.pagination.earlierRef) {
      DOM.earlierControls.classList.remove('hidden');
    } else {
      DOM.earlierControls.classList.add('hidden');
    }

    if (AppState.pagination.laterRef) {
      DOM.laterControls.classList.remove('hidden');
    } else {
      DOM.laterControls.classList.add('hidden');
    }
  },

  async performSearch(paginationOptions = {}, isRetry = false) {
    // Invalidate ID if input text does not match the bound selectedName
    if (DOM.originInput.dataset.selectedName && DOM.originInput.dataset.selectedName !== DOM.originInput.value.trim()) {
      DOM.originId.value = '';
      DOM.originInput.dataset.selectedName = '';
    }
    if (DOM.destinationInput.dataset.selectedName && DOM.destinationInput.dataset.selectedName !== DOM.destinationInput.value.trim()) {
      DOM.destinationId.value = '';
      DOM.destinationInput.dataset.selectedName = '';
    }

    const origin = DOM.originId.value || DOM.originInput.value.trim();
    const destination = DOM.destinationId.value || DOM.destinationInput.value.trim();

    if (!origin || !destination) {
      this.showError('Bitte Start- und Zielbahnhof angeben.');
      return;
    }

    if (!isRetry) {
      if (AppState.abortController) {
        AppState.abortController.abort();
      }
      AppState.abortController = new AbortController();

      this.setLoading(true);

      // Update Route Overview Banner
      DOM.bannerOrigin.textContent = DOM.originInput.value.trim() || 'Start';
      DOM.bannerDestination.textContent = DOM.destinationInput.value.trim() || 'Ziel';
      DOM.bannerDate.textContent = Formatters.formatDateLabel(DOM.dateInput.value);
      DOM.routeBanner.classList.remove('hidden');
    }

    const params = new URLSearchParams({
      origin,
      destination,
      date: DOM.dateInput.value,
      time: DOM.timeInput.value,
      carrier: DOM.carrierSelect.value,
      direct: DOM.directCheckbox.checked ? 'true' : 'false',
      hours: '12'
    });

    if (paginationOptions.earlierRef) params.append('earlierRef', paginationOptions.earlierRef);
    if (paginationOptions.laterRef) params.append('laterRef', paginationOptions.laterRef);

    let willRetry = false;

    try {
      // Setup fetch with client timeout (28s, allowing 26s backend execution + network transit)
      const fetchController = new AbortController();
      const timeoutTimer = setTimeout(() => {
        fetchController.abort();
      }, 28000);

      // Propagate user cancellation to the fetchController
      const onUserAbort = () => fetchController.abort();
      AppState.abortController?.signal.addEventListener('abort', onUserAbort);

      let response;
      try {
        response = await fetch(`/api/fahrplan?${params.toString()}`, {
          signal: fetchController.signal
        });
      } finally {
        clearTimeout(timeoutTimer);
        AppState.abortController?.signal.removeEventListener('abort', onUserAbort);
      }

      if (!response.ok) {
        let errMsg = `Serverfehler (${response.status})`;
        try {
          const errData = await response.json();
          if (errData && errData.error) errMsg = errData.error;
        } catch (_) {}
        throw new Error(errMsg);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Fehler beim Laden des Fahrplans.');
      }

      AppState.journeys = data.journeys || [];
      AppState.pagination = data.pagination || { earlierRef: null, laterRef: null };

      this.renderResults(AppState.journeys);
      this.updatePaginationControls();
    } catch (err) {
      // If manually cancelled by user, stop immediately
      if (AppState.abortController?.signal.aborted) {
        console.log('Search cancelled by user.');
        return;
      }

      // Automatic single retry if query failed or timed out
      if (!isRetry) {
        willRetry = true;
        console.warn('Erste Fahrplanabfrage fehlgeschlagen/Timeout. Starte automatischen 2. Versuch...', err);
        if (DOM.loadingText) {
          DOM.loadingText.textContent = 'Verbindung verzögert – 2. Versuch wird gestartet...';
        }
        await new Promise(resolve => setTimeout(resolve, 800));
        if (AppState.abortController?.signal.aborted) return;
        return await this.performSearch(paginationOptions, true);
      }

      console.error('Search error after retry:', err);
      this.showError(err.message || 'Die Fahrplanabfrage konnte auch nach erneutem Versuch nicht abgeschlossen werden.');
    } finally {
      if (!willRetry) {
        AppState.abortController = null;
        this.setLoading(false);
      }
    }
  }
};

// ==========================================
// 9. Application Initialization & Events
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  // 1. Live Clock
  LiveClock.start();

  // 2. Date & Time Inputs
  SearchController.initDateTimeInputs();

  // 3. Restore persisted preferences from localStorage
  const prefs = Storage.getPreferences();
  AppState.direct = prefs.direct;
  AppState.carrier = prefs.carrier;
  DOM.directCheckbox.checked = AppState.direct;
  DOM.carrierSelect.value = AppState.carrier;

  // 4. Station inputs start completely empty
  DOM.originInput.value = '';
  DOM.originId.value = '';
  DOM.clearOriginBtn.classList.add('hidden');

  DOM.destinationInput.value = '';
  DOM.destinationId.value = '';
  DOM.clearDestinationBtn.classList.add('hidden');

  // 5. Setup Autocomplete
  Autocomplete.setup(DOM.originInput, DOM.originId, DOM.originDropdown, DOM.clearOriginBtn);
  Autocomplete.setup(DOM.destinationInput, DOM.destinationId, DOM.destinationDropdown, DOM.clearDestinationBtn);

  // 6. Setup Event Listeners
  setupEventListeners();

  // 7. Render Lucide icons
  if (window.lucide) {
    lucide.createIcons();
  }
});

function setupEventListeners() {
  // Form submission
  DOM.form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (AppState.isLoading) {
      SearchController.cancelSearch();
      return;
    }

    AppState.origin.name = DOM.originInput.value.trim();
    AppState.origin.id = DOM.originId.value;
    AppState.destination.name = DOM.destinationInput.value.trim();
    AppState.destination.id = DOM.destinationId.value;
    AppState.date = DOM.dateInput.value;
    AppState.time = DOM.timeInput.value;
    AppState.carrier = DOM.carrierSelect.value;
    AppState.direct = DOM.directCheckbox.checked;

    Storage.savePreferences({ direct: AppState.direct, carrier: AppState.carrier });
    SearchController.performSearch();
  });

  // Submit button click: handle cancel when loading
  DOM.submitBtn.addEventListener('click', (e) => {
    if (AppState.isLoading) {
      e.preventDefault();
      SearchController.cancelSearch();
    }
  });

  // "Jetzt" (Now) button: updates time/date to current, without clearing station inputs!
  DOM.setNowBtn.addEventListener('click', () => {
    SearchController.initDateTimeInputs();
    if (DOM.originInput.value.trim() && DOM.destinationInput.value.trim()) {
      SearchController.performSearch();
    }
  });

  // Station Swap button
  DOM.swapStationsBtn.addEventListener('click', () => {
    const tempName = DOM.originInput.value;
    const tempSelectedName = DOM.originInput.dataset.selectedName || '';
    const tempId = DOM.originId.value;

    DOM.originInput.value = DOM.destinationInput.value;
    DOM.originInput.dataset.selectedName = DOM.destinationInput.dataset.selectedName || '';
    DOM.originId.value = DOM.destinationId.value;
    AppState.origin = { id: DOM.originId.value, name: DOM.originInput.value };

    DOM.destinationInput.value = tempName;
    DOM.destinationInput.dataset.selectedName = tempSelectedName;
    DOM.destinationId.value = tempId;
    AppState.destination = { id: DOM.destinationId.value, name: DOM.destinationInput.value };

    // Synchronize clear button visibility
    DOM.clearOriginBtn.classList.toggle('hidden', !DOM.originInput.value.trim());
    DOM.clearDestinationBtn.classList.toggle('hidden', !DOM.destinationInput.value.trim());

    if (DOM.originInput.value.trim() && DOM.destinationInput.value.trim()) {
      SearchController.performSearch();
    }
  });

  // Schnellwahl Buttons
  DOM.quickStationChips.addEventListener('click', (e) => {
    const chip = e.target.closest('.quick-chip');
    if (!chip) return;

    const id = chip.dataset.id;
    const name = chip.dataset.name;

    if (!DOM.originInput.value.trim()) {
      DOM.originInput.value = name;
      DOM.originInput.dataset.selectedName = name;
      DOM.originId.value = id;
      AppState.origin = { id, name };
      DOM.clearOriginBtn.classList.remove('hidden');
      if (DOM.destinationInput.value.trim()) {
        SearchController.performSearch();
      }
    } else if (!DOM.destinationInput.value.trim()) {
      DOM.destinationInput.value = name;
      DOM.destinationInput.dataset.selectedName = name;
      DOM.destinationId.value = id;
      AppState.destination = { id, name };
      DOM.clearDestinationBtn.classList.remove('hidden');
      if (DOM.originInput.value.trim()) {
        SearchController.performSearch();
      }
    } else if (DOM.destinationId.value === id || DOM.destinationInput.value.trim() === name) {
      DOM.originInput.value = name;
      DOM.originInput.dataset.selectedName = name;
      DOM.originId.value = id;
      AppState.origin = { id, name };
      DOM.clearOriginBtn.classList.remove('hidden');
      SearchController.performSearch();
    } else {
      DOM.destinationInput.value = name;
      DOM.destinationInput.dataset.selectedName = name;
      DOM.destinationId.value = id;
      AppState.destination = { id, name };
      DOM.clearDestinationBtn.classList.remove('hidden');
      SearchController.performSearch();
    }
  });

  // Retry Button
  DOM.retryBtn.addEventListener('click', () => {
    SearchController.performSearch();
  });

  // Pagination buttons
  DOM.loadEarlierBtn.addEventListener('click', () => {
    if (AppState.pagination.earlierRef) {
      SearchController.performSearch({ earlierRef: AppState.pagination.earlierRef });
    }
  });

  DOM.loadLaterBtn.addEventListener('click', () => {
    if (AppState.pagination.laterRef) {
      SearchController.performSearch({ laterRef: AppState.pagination.laterRef });
    }
  });

  // Filters
  DOM.carrierSelect.addEventListener('change', () => {
    AppState.carrier = DOM.carrierSelect.value;
    Storage.savePreferences({ carrier: AppState.carrier });
    if (DOM.originInput.value.trim() && DOM.destinationInput.value.trim()) {
      SearchController.performSearch();
    }
  });

  DOM.directCheckbox.addEventListener('change', () => {
    AppState.direct = DOM.directCheckbox.checked;
    Storage.savePreferences({ direct: AppState.direct });
    if (DOM.originInput.value.trim() && DOM.destinationInput.value.trim()) {
      SearchController.performSearch();
    }
  });

  DOM.showTransfersBtn?.addEventListener('click', () => {
    DOM.directCheckbox.checked = false;
    AppState.direct = false;
    Storage.savePreferences({ direct: false });
    SearchController.performSearch();
  });
}

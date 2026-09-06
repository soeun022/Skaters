function startApp() {
    // ---- 安全性與資料輔助函式 ----
    function loadSchedules() {
        try {
            const raw = localStorage.getItem('schedules');
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            console.error('Failed to parse schedules from localStorage:', e);
            return [];
        }
    }

    function saveSchedules(data) {
        try {
            localStorage.setItem('schedules', JSON.stringify(data));
        } catch (e) {
            console.error('Failed to save schedules to localStorage:', e);
        }
    }

    function generateUniqueId() {
        return Date.now() + '-' + Math.random().toString(36).substring(2, 9);
    }

    function safeGetRadioValue(name) {
        const select = document.getElementById(`${name}-select`);
        if (select) return select.value;
        const checked = document.querySelector(`input[name="${name}"]:checked`);
        return checked ? checked.value : '';
    }

    function safeSetRadioValue(name, value) {
        if (!value) return;
        const select = document.getElementById(`${name}-select`);
        if (select) {
            select.value = value;
            const displaySpan = document.getElementById(`${name}-display`);
            if (displaySpan) displaySpan.textContent = value;
            const menuEl = document.getElementById(`${name}-menu`);
            if (menuEl) {
                menuEl.querySelectorAll('.custom-select-option').forEach(opt => {
                    if (opt.dataset.value === value) opt.classList.add('selected');
                    else opt.classList.remove('selected');
                });
            }
            return;
        }
        const radios = document.querySelectorAll(`input[name="${name}"]`);
        radios.forEach(radio => {
            if (radio.value === value) {
                radio.checked = true;
            }
        });
    }

    // ---- 日期運算輔助函式 ----
    function parseLocalDate(dateStr) {
        if (!dateStr || typeof dateStr !== 'string') return new Date();
        const clean = dateStr.trim().split('T')[0].split(' ')[0].replace(/-/g, '/');
        const parts = clean.split('/');
        if (parts.length < 3) return new Date();
        return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    }

    function formatLocalDate(dateObj) {
        const y = dateObj.getFullYear();
        const m = String(dateObj.getMonth() + 1).padStart(2, '0');
        const d = String(dateObj.getDate()).padStart(2, '0');
        return `${y}/${m}/${d}`;
    }

    function normalizeDateStr(dateStr) {
        if (!dateStr || typeof dateStr !== 'string') return '';
        let clean = dateStr.trim().split('T')[0].split(' ')[0].replace(/-/g, '/');
        const parts = clean.split('/');
        if (parts.length < 3) return clean;
        const y = parts[0];
        const m = String(parseInt(parts[1], 10)).padStart(2, '0');
        const d = String(parseInt(parts[2], 10)).padStart(2, '0');
        return `${y}/${m}/${d}`;
    }

    function getScheduleMatchOnDate(s, targetDateStr) {
        if (!s) return { matched: false };
        
        if (s.isOther && s.startDate && s.endDate) {
            const normStart = normalizeDateStr(s.startDate);
            const normEnd = normalizeDateStr(s.endDate);
            if (targetDateStr >= normStart && targetDateStr <= normEnd) {
                return { matched: true, isStart: targetDateStr === normStart, isEnd: targetDateStr === normEnd };
            }
            return { matched: false };
        }

        const normEnd = normalizeDateStr(s.date);
        if (normEnd === targetDateStr) {
            return { matched: true, isStart: true, isEnd: true };
        }
        return { matched: false };
    }

    function addMonthsSafely(startDateStr, monthsToAdd) {
        const startDate = parseLocalDate(startDateStr);
        const originalDay = startDate.getDate();
        
        const totalMonths = startDate.getFullYear() * 12 + startDate.getMonth() + monthsToAdd;
        const targetYear = Math.floor(totalMonths / 12);
        let targetMonth = totalMonths % 12;
        if (targetMonth < 0) targetMonth += 12;
        
        const targetDate = new Date(targetYear, targetMonth, 1);
        const maxDaysInTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
        
        targetDate.setDate(Math.min(originalDay, maxDaysInTargetMonth));
        return formatLocalDate(targetDate);
    }

    function isHolidayDate(dateInput) {
        let d;
        if (dateInput instanceof Date) {
            d = dateInput;
        } else if (typeof dateInput === 'string' && dateInput.trim()) {
            d = parseLocalDate(dateInput);
        } else {
            d = new Date();
        }

        const month = d.getMonth() + 1; // 1-12
        const dayOfWeek = d.getDay(); // 0 (Sun) - 6 (Sat)

        // 每年 7/1 ~ 8/31 為假日
        if (month === 7 || month === 8) {
            return true;
        }

        // 週六(6)與週日(0)為假日
        if (dayOfWeek === 0 || dayOfWeek === 6) {
            return true;
        }

        return false;
    }

    // ---- 自製 DatePicker 控制器 ----
    const CustomDatePicker = (() => {
        const overlay = document.getElementById('custom-datepicker-overlay');
        const titleEl = document.getElementById('dp-month-year-title');
        const gridEl = document.getElementById('dp-days-grid');
        const prevBtn = document.getElementById('dp-prev-month');
        const nextBtn = document.getElementById('dp-next-month');
        const timeContainer = document.getElementById('dp-time-container');
        
        const startTimeInput = document.getElementById('dp-start-time-input');
        const startTimeDropdownBtn = document.getElementById('dp-start-time-dropdown-btn');
        const startTimeDropdown = document.getElementById('dp-start-time-dropdown');
        
        const endTimeInput = document.getElementById('dp-end-time-input');
        const endTimeDurBadge = document.getElementById('dp-end-time-dur-badge');
        const endTimeDropdownBtn = document.getElementById('dp-end-time-dropdown-btn');
        const endTimeDropdown = document.getElementById('dp-end-time-dropdown');
        
        const confirmBtn = document.getElementById('dp-confirm-btn');
        const cancelBtn = document.getElementById('dp-cancel-btn');
        const todayBtn = document.getElementById('dp-today-btn');

        let currentViewDate = new Date();
        let selectedDate = new Date();
        let selectedStartTime = '17:00';
        let selectedEndTime = '18:30';
        let hasTimePicker = false;
        let activeTriggerId = null;
        let onSelectCallback = null;

        function generate15MinTimes() {
            const times = [];
            for (let h = 0; h < 24; h++) {
                for (let m = 0; m < 60; m += 15) {
                    const hh = String(h).padStart(2, '0');
                    const mm = String(m).padStart(2, '0');
                    times.push(`${hh}:${mm}`);
                }
            }
            return times;
        }

        function roundTo15Min(timeStr) {
            if (!timeStr) return '00:00';
            const [h, m] = timeStr.split(':').map(Number);
            const hVal = isNaN(h) ? 0 : h;
            const mVal = isNaN(m) ? 0 : m;
            
            let roundedM = Math.round(mVal / 15) * 15;
            let finalH = hVal;
            if (roundedM >= 60) {
                roundedM = 0;
                finalH = (finalH + 1) % 24;
            }
            return `${String(finalH).padStart(2, '0')}:${String(roundedM).padStart(2, '0')}`;
        }

        function getDurationLabel(startTimeStr, endTimeStr) {
            if (!startTimeStr || !endTimeStr) return '';
            const [sh, sm] = startTimeStr.split(':').map(Number);
            const [eh, em] = endTimeStr.split(':').map(Number);
            if (isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) return '';
            
            const startMin = sh * 60 + sm;
            let endMin = eh * 60 + em;
            
            if (endMin <= startMin) return '';
            
            const diff = endMin - startMin;
            const hours = Math.floor(diff / 60);
            const mins = diff % 60;
            
            if (hours === 0) {
                return `${mins}分鐘`;
            } else if (mins === 0) {
                return `${hours}小時`;
            } else if (mins === 30) {
                return `${hours}.5小時`;
            } else {
                return `${hours}小時${mins}分`;
            }
        }

        function closeAllDropdowns() {
            if (startTimeDropdown) startTimeDropdown.classList.remove('show');
            if (endTimeDropdown) endTimeDropdown.classList.remove('show');
        }

        function syncUIFromInputs() {
            if (startTimeInput) selectedStartTime = startTimeInput.value.trim() || '17:00';
            if (endTimeInput) selectedEndTime = endTimeInput.value.trim() || '18:30';
            
            const durLabel = getDurationLabel(selectedStartTime, selectedEndTime);
            if (endTimeDurBadge) {
                endTimeDurBadge.textContent = durLabel;
            }
        }

        function renderStartTimeDropdown() {
            if (!startTimeDropdown) return;
            startTimeDropdown.innerHTML = '';
            const times = generate15MinTimes();
            const roundedSelected = roundTo15Min(selectedStartTime);

            times.forEach(t => {
                const opt = document.createElement('div');
                const isSelected = t === roundedSelected || t === selectedStartTime;
                opt.className = `custom-time-option ${isSelected ? 'selected' : ''}`;
                opt.innerHTML = `<span class="time-text">${t}</span>`;
                opt.addEventListener('click', (e) => {
                    e.stopPropagation();
                    selectedStartTime = t;
                    if (startTimeInput) startTimeInput.value = t;
                    closeAllDropdowns();

                    const [sh, sm] = selectedStartTime.split(':').map(Number);
                    const [eh, em] = selectedEndTime.split(':').map(Number);
                    if (isNaN(eh) || (eh * 60 + em) <= (sh * 60 + sm)) {
                        const defaultEndMin = (sh * 60 + sm + 90) % (24 * 60);
                        const defH = String(Math.floor(defaultEndMin / 60)).padStart(2, '0');
                        const defM = String(defaultEndMin % 60).padStart(2, '0');
                        selectedEndTime = `${defH}:${defM}`;
                        if (endTimeInput) endTimeInput.value = selectedEndTime;
                    }
                    syncUIFromInputs();
                });
                startTimeDropdown.appendChild(opt);
            });
        }

        function renderEndTimeDropdown() {
            if (!endTimeDropdown) return;
            endTimeDropdown.innerHTML = '';
            const times = generate15MinTimes();
            const roundedSelected = roundTo15Min(selectedEndTime);

            const [sh, sm] = (selectedStartTime || '17:00').split(':').map(Number);
            const startTotalMins = (isNaN(sh) ? 0 : sh) * 60 + (isNaN(sm) ? 0 : sm);

            // 只保留晚於開始時間的時間選項
            const validEndTimes = times.filter(t => {
                const [h, m] = t.split(':').map(Number);
                const totalMins = h * 60 + m;
                return totalMins > startTotalMins;
            });

            validEndTimes.forEach(t => {
                const opt = document.createElement('div');
                const isSelected = t === roundedSelected || t === selectedEndTime;
                opt.className = `custom-time-option ${isSelected ? 'selected' : ''}`;
                const durLabel = getDurationLabel(selectedStartTime, t);
                const durSpan = durLabel ? `<span class="duration-text">${durLabel}</span>` : '';
                opt.innerHTML = `<span class="time-text">${t}</span>${durSpan}`;
                opt.addEventListener('click', (e) => {
                    e.stopPropagation();
                    selectedEndTime = t;
                    if (endTimeInput) endTimeInput.value = t;
                    syncUIFromInputs();
                    closeAllDropdowns();
                });
                endTimeDropdown.appendChild(opt);
            });
        }

        // 自動將選取的選項置中滾動
        function scrollToSelectedOption(dropdownEl) {
            if (!dropdownEl) return;
            setTimeout(() => {
                const selectedOpt = dropdownEl.querySelector('.custom-time-option.selected');
                if (selectedOpt) {
                    const topPos = selectedOpt.offsetTop - (dropdownEl.clientHeight / 2) + (selectedOpt.clientHeight / 2);
                    dropdownEl.scrollTop = Math.max(0, topPos);
                }
            }, 20);
        }

        // 綁定輸入框打字與選單按鈕事件
        if (startTimeInput) {
            startTimeInput.addEventListener('input', () => {
                syncUIFromInputs();
            });
        }

        if (endTimeInput) {
            endTimeInput.addEventListener('input', () => {
                syncUIFromInputs();
            });
        }

        if (startTimeDropdownBtn) {
            startTimeDropdownBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const isShown = startTimeDropdown.classList.contains('show');
                closeAllDropdowns();
                if (!isShown) {
                    renderStartTimeDropdown();
                    startTimeDropdown.classList.add('show');
                    scrollToSelectedOption(startTimeDropdown);
                }
            });
        }

        if (endTimeDropdownBtn) {
            endTimeDropdownBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const isShown = endTimeDropdown.classList.contains('show');
                closeAllDropdowns();
                if (!isShown) {
                    renderEndTimeDropdown();
                    endTimeDropdown.classList.add('show');
                    scrollToSelectedOption(endTimeDropdown);
                }
            });
        }

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.custom-time-select-wrapper')) {
                closeAllDropdowns();
            }
        });

        function renderGrid() {
            if (!gridEl || !titleEl) return;
            gridEl.innerHTML = '';
            const year = currentViewDate.getFullYear();
            const month = currentViewDate.getMonth();

            const monthNamesFull = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
            titleEl.textContent = `${monthNamesFull[month]} ${year}`;

            const firstDayOfMonth = new Date(year, month, 1);
            const lastDayOfMonth = new Date(year, month + 1, 0);

            let firstDayIndex = firstDayOfMonth.getDay() - 1;
            if (firstDayIndex === -1) firstDayIndex = 6;

            const totalDays = lastDayOfMonth.getDate();
            const prevMonthLastDay = new Date(year, month, 0).getDate();

            for (let i = firstDayIndex; i > 0; i--) {
                const dayNum = prevMonthLastDay - i + 1;
                const btn = createDayBtn(dayNum, true, year, month - 1);
                gridEl.appendChild(btn);
            }

            for (let i = 1; i <= totalDays; i++) {
                const btn = createDayBtn(i, false, year, month);
                gridEl.appendChild(btn);
            }

            const totalCells = gridEl.children.length;
            const remainingCells = 42 - totalCells;
            for (let i = 1; i <= remainingCells; i++) {
                const btn = createDayBtn(i, true, year, month + 1);
                gridEl.appendChild(btn);
            }
        }

        function createDayBtn(dayNum, isOtherMonth, year, month) {
            const btn = document.createElement('div');
            btn.className = `dp-day ${isOtherMonth ? 'other-month' : ''}`;
            btn.textContent = dayNum;

            const d = new Date(year, month, dayNum);
            const realToday = new Date();

            if (d.getDate() === realToday.getDate() &&
                d.getMonth() === realToday.getMonth() &&
                d.getFullYear() === realToday.getFullYear()) {
                btn.classList.add('today');
            }

            if (d.getDate() === selectedDate.getDate() &&
                d.getMonth() === selectedDate.getMonth() &&
                d.getFullYear() === selectedDate.getFullYear()) {
                btn.classList.add('selected');
            }

            btn.addEventListener('click', () => {
                selectedDate = d;
                currentViewDate = new Date(year, month, 1);
                renderGrid();
            });

            return btn;
        }

        if (prevBtn) prevBtn.addEventListener('click', () => {
            currentViewDate.setMonth(currentViewDate.getMonth() - 1);
            renderGrid();
        });

        if (nextBtn) nextBtn.addEventListener('click', () => {
            currentViewDate.setMonth(currentViewDate.getMonth() + 1);
            renderGrid();
        });

        if (todayBtn) todayBtn.addEventListener('click', () => {
            selectedDate = new Date();
            currentViewDate = new Date();
            renderGrid();
        });

        if (cancelBtn) cancelBtn.addEventListener('click', close);
        if (overlay) overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close();
        });

        if (confirmBtn) confirmBtn.addEventListener('click', () => {
            const dateStr = formatLocalDate(selectedDate);
            let finalVal = dateStr;
            let endTimeStr = '';

            if (hasTimePicker) {
                const [sh, sm] = selectedStartTime.split(':').map(Number);
                const [eh, em] = selectedEndTime.split(':').map(Number);
                const startMins = (isNaN(sh) ? 0 : sh) * 60 + (isNaN(sm) ? 0 : sm);
                const endMins = (isNaN(eh) ? 0 : eh) * 60 + (isNaN(em) ? 0 : em);
                
                if (endMins < startMins) {
                    alert('結束時間不能早於開始時間');
                    return;
                }

                finalVal = `${dateStr}T${selectedStartTime}`;
                endTimeStr = selectedEndTime;
            }

            if (activeTriggerId) {
                setValue(activeTriggerId, finalVal, hasTimePicker, endTimeStr);
            }

            if (onSelectCallback) {
                onSelectCallback(finalVal, dateStr, endTimeStr);
            }

            close();
        });

        function open({ triggerId, initialValue, initialEndTime = '', includeTime = false, onChange = null }) {
            activeTriggerId = triggerId;
            hasTimePicker = includeTime;
            onSelectCallback = onChange;

            if (includeTime) {
                timeContainer.style.display = 'flex';
            } else {
                timeContainer.style.display = 'none';
            }

            if (initialValue) {
                if (includeTime && initialValue.includes('T')) {
                    const [dPart, tPart] = initialValue.split('T');
                    selectedDate = parseLocalDate(dPart);
                    if (tPart) {
                        selectedStartTime = roundTo15Min(tPart);
                    } else {
                        selectedStartTime = '17:00';
                    }
                } else {
                    selectedDate = parseLocalDate(initialValue);
                    selectedStartTime = '17:00';
                }
            } else {
                selectedDate = new Date();
                selectedStartTime = '17:00';
            }

            if (initialEndTime) {
                selectedEndTime = roundTo15Min(initialEndTime);
            } else {
                const [sh, sm] = selectedStartTime.split(':').map(Number);
                const defaultEndMin = (sh * 60 + sm + 90) % (24 * 60);
                const defH = String(Math.floor(defaultEndMin / 60)).padStart(2, '0');
                const defM = String(defaultEndMin % 60).padStart(2, '0');
                selectedEndTime = `${defH}:${defM}`;
            }

            currentViewDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);

            if (includeTime) {
                if (startTimeInput) startTimeInput.value = selectedStartTime;
                if (endTimeInput) endTimeInput.value = selectedEndTime;
                syncUIFromInputs();
            }

            renderGrid();
            if (overlay) overlay.classList.add('show');
        }

        function close() {
            if (overlay) overlay.classList.remove('show');
        }

        function setValue(triggerId, valueStr, includeTime = false, endTimeStr = '') {
            const trigger = document.getElementById(triggerId);
            if (!trigger) return;
            const hiddenInput = trigger.querySelector('input[type="hidden"]');
            const displaySpan = trigger.querySelector('span');

            if (!valueStr) {
                if (hiddenInput) {
                    hiddenInput.value = '';
                    hiddenInput.dataset.endtime = '';
                }
                if (displaySpan) displaySpan.textContent = includeTime ? '選擇日期與時間' : '選擇日期';
                return;
            }

            if (hiddenInput) {
                hiddenInput.value = valueStr;
                if (endTimeStr) {
                    hiddenInput.dataset.endtime = endTimeStr;
                }
            }

            if (displaySpan) {
                if (includeTime && valueStr.includes('T')) {
                    const [d, t] = valueStr.split('T');
                    const normD = normalizeDateStr(d);
                    const end = endTimeStr || (hiddenInput ? hiddenInput.dataset.endtime : '');
                    displaySpan.textContent = end ? `${normD} ${t}~${end}` : `${normD} ${t}`;
                } else {
                    displaySpan.textContent = normalizeDateStr(valueStr);
                }
            }
        }

        return { open, close, setValue };
    })();

    // ---- 全域狀態與視圖模式 ----
    let currentDate = new Date();
    let currentViewMode = 'month'; // 'month' | 'year'
    let currentTab = 'calendar'; // 'calendar' | 'database' | 'stats' | 'settings'
    let schedules = loadSchedules();
    let editingScheduleId = null;
    let activeFocusedScheduleId = null;
    let selectedDayDate = new Date();

    function clearFocus() {
        document.querySelectorAll('.schedule-item.focused').forEach(el => el.classList.remove('focused'));
        activeFocusedScheduleId = null;
    }

    function focusSchedule(id) {
        clearFocus();
        activeFocusedScheduleId = id;
        document.querySelectorAll(`.schedule-item[data-id="${id}"]`).forEach(el => el.classList.add('focused'));
    }

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.schedule-item')) {
            clearFocus();
        }
        if (!e.target.closest('#linked-card-wrapper')) {
            const menuEl = document.getElementById('linked-card-menu');
            const wrapper = document.getElementById('linked-card-wrapper');
            if (menuEl) menuEl.classList.remove('show');
            if (wrapper) wrapper.classList.remove('open');
        }
    });

    // 鍵盤快捷鍵 (Control+D 複製, Delete/Backspace 刪除當前聚焦排程)
    document.addEventListener('keydown', (e) => {
        // 檢查焦點是否在輸入框/文字區域中，如果在輸入框打字則不觸發排程快捷鍵
        const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
        if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') {
            return;
        }

        // Control + D (或 Cmd + D) 複製當前聚焦的排程
        if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
            if (activeFocusedScheduleId) {
                e.preventDefault(); // 阻止瀏覽器預設加入書籤對話框
                const scheduleId = activeFocusedScheduleId;
                const originalSchedule = schedules.find(s => String(s.id) === String(scheduleId));
                if (originalSchedule) {
                    const duplicatedSchedule = JSON.parse(JSON.stringify(originalSchedule));
                    duplicatedSchedule.id = generateUniqueId();
                    schedules.push(duplicatedSchedule);
                    saveSchedules(schedules);
                    renderView();

                    setTimeout(() => {
                        const newEl = document.querySelector(`.schedule-item[data-id="${duplicatedSchedule.id}"]`);
                        if (newEl) {
                            focusSchedule(duplicatedSchedule.id);
                        }
                    }, 50);
                }
            }
        }

        // Delete 或 Backspace 鍵刪除當前聚焦的排程
        if (e.key === 'Delete' || e.key === 'Backspace') {
            if (activeFocusedScheduleId) {
                e.preventDefault();
                const scheduleId = activeFocusedScheduleId;
                schedules = schedules.filter(s => String(s.id) !== String(scheduleId));
                saveSchedules(schedules);
                activeFocusedScheduleId = null;
                renderView();
            }
        }
    });

    // ---- 排程類型自訂管理邏輯 (Custom Schedule Types) ----
    const DEFAULT_SCHEDULE_TYPES = [
        { id: 'type_1', name: '花滑團課', bg: '#b69898', text: '#efead6' },
        { id: 'type_2', name: '花滑私課', bg: '#836a77', text: '#efdede' },
        { id: 'type_3', name: '花滑練習', bg: '#eacaca', text: '#836a77' },
        { id: 'type_4', name: '芭蕾', bg: '#ead1dc', text: '#836a77' }
    ];

    function getScheduleTypes() {
        try {
            const saved = localStorage.getItem('skaters_custom_schedule_types');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed) && parsed.length > 0) return parsed;
            }
        } catch(e){}
        return DEFAULT_SCHEDULE_TYPES;
    }

    function saveScheduleTypes(types) {
        localStorage.setItem('skaters_custom_schedule_types', JSON.stringify(types));
        updateTypeColorsMap();
    }

    const typeColors = {
        '月卡': { bg: '#d7c9c9', text: '#666666', cardBg: '#e4dfdf' },
        '單次入場': { bg: '#d3c5c3', text: '#836a77', cardBg: '#f3ebea' },
        '團體課卡(平)': { bg: '#e4d9d9', text: '#715a57', cardBg: '#eee6e6' },
        '團體課卡(假)': { bg: '#e4d9d9', text: '#715a57', cardBg: '#eee6e6' },
        '私人課卡(平)': { bg: '#614b48', text: '#e9cfcb', cardBg: '#ebe2e2' },
        '私人課卡(假)': { bg: '#614b48', text: '#e9cfcb', cardBg: '#ebe2e2' },
        '冰刀鞋': { bg: '#c5a6a0', text: '#5e4844', cardBg: '#decbc9' },
        '護具': { bg: '#d4b7b1', text: '#69524e', cardBg: '#e3d2d0' },
        '配件': { bg: '#e2c8c3', text: '#78605b', cardBg: '#e8d9d7' },
        '訓練用具': { bg: '#f0d8d5', text: '#856a65', cardBg: '#eee0de' }
    };

    function getSoftCardBg(hexColor) {
        if (!hexColor || typeof hexColor !== 'string' || !hexColor.startsWith('#')) return '#fdfaf9';
        let hex = hexColor.replace('#', '');
        if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
        if (hex.length !== 6) return '#fdfaf9';
        
        const r = parseInt(hex.substr(0, 2), 16);
        const g = parseInt(hex.substr(2, 2), 16);
        const b = parseInt(hex.substr(4, 2), 16);
        
        const mixR = Math.round(250 * 0.68 + r * 0.32);
        const mixG = Math.round(246 * 0.68 + g * 0.32);
        const mixB = Math.round(245 * 0.68 + b * 0.32);
        
        return `#${mixR.toString(16).padStart(2, '0')}${mixG.toString(16).padStart(2, '0')}${mixB.toString(16).padStart(2, '0')}`;
    }

    function getTranslucentColor(hexColor, alpha = 0.78) {
        if (!hexColor || typeof hexColor !== 'string' || !hexColor.startsWith('#')) return hexColor;
        let hex = hexColor.replace('#', '');
        if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
        if (hex.length !== 6) return hexColor;
        
        const r = parseInt(hex.substr(0, 2), 16);
        const g = parseInt(hex.substr(2, 2), 16);
        const b = parseInt(hex.substr(4, 2), 16);
        
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    function updateTypeColorsMap() {
        const types = getScheduleTypes();
        types.forEach(t => {
            typeColors[t.name] = { 
                bg: t.bg, 
                text: t.text, 
                cardBg: t.cardBg || getSoftCardBg(t.bg) 
            };
        });
    }

    updateTypeColorsMap();

    const CARD_RULES = {
        '月卡': { durationMonths: 3, maxPractices: Infinity, maxClasses: Infinity, infiniteGroupClass: true, isMonthly: true, isGroupClass: true, isPrivateClass: false },
        '2500月卡': { durationMonths: 3, maxPractices: 20, maxClasses: 0, infiniteGroupClass: false, isMonthly: true, isGroupClass: false, isPrivateClass: false },
        '3000月卡': { durationMonths: 3, maxPractices: 30, maxClasses: 0, infiniteGroupClass: false, isMonthly: true, isGroupClass: false, isPrivateClass: false },
        '7000月卡': { durationMonths: 3, maxPractices: Infinity, maxClasses: Infinity, infiniteGroupClass: true, isMonthly: true, isGroupClass: true, isPrivateClass: false },
        '團體課卡(平)': { durationDays: 45, maxPractices: 2, maxClasses: 4, isMonthly: false, isGroupClass: true, isPrivateClass: false },
        '團體課卡(假)': { durationDays: 45, maxPractices: 2, maxClasses: 4, isMonthly: false, isGroupClass: true, isPrivateClass: false },
        '私人課卡(平)': { durationDays: 45, maxPractices: 2, maxClasses: 4, isMonthly: false, isGroupClass: false, isPrivateClass: true },
        '私人課卡(假)': { durationDays: 45, maxPractices: 2, maxClasses: 4, isMonthly: false, isGroupClass: false, isPrivateClass: true }
    };

    function getCardRule(cardOrType) {
        if (!cardOrType) return null;
        let type = '';
        let price = '';
        if (typeof cardOrType === 'string') {
            type = cardOrType;
        } else {
            type = cardOrType.type || '';
            price = String(cardOrType.price || '').replace(/,/g, '');
        }

        if (type === '月卡') {
            if (price.includes('2500')) {
                return { durationMonths: 3, maxPractices: 20, maxClasses: 0, infiniteGroupClass: false, isMonthly: true, isGroupClass: false, isPrivateClass: false };
            } else if (price.includes('3000')) {
                return { durationMonths: 3, maxPractices: 30, maxClasses: 0, infiniteGroupClass: false, isMonthly: true, isGroupClass: false, isPrivateClass: false };
            } else {
                return { durationMonths: 3, maxPractices: Infinity, maxClasses: Infinity, infiniteGroupClass: true, isMonthly: true, isGroupClass: true, isPrivateClass: false };
            }
        }
        if (type === '單次入場') {
            return { durationDays: 1, maxPractices: 1, maxClasses: 0, isMonthly: false, isGroupClass: false, isPrivateClass: false };
        }
        if (type.startsWith('團體課卡')) {
            if (price.includes('單次')) {
                return { durationDays: 1, maxPractices: 0, maxClasses: 1, isMonthly: false, isGroupClass: true, isPrivateClass: false };
            }
            return { durationDays: 45, maxPractices: 2, maxClasses: 4, isMonthly: false, isGroupClass: true, isPrivateClass: false };
        }
        if (type.startsWith('私人課卡')) {
            if (price.includes('單次')) {
                return { durationDays: 1, maxPractices: 0, maxClasses: 1, isMonthly: false, isGroupClass: false, isPrivateClass: true };
            }
            return { durationDays: 45, maxPractices: 2, maxClasses: 4, isMonthly: false, isGroupClass: false, isPrivateClass: true };
        }
        return CARD_RULES[type] || null;
    }
    const defaultTypeColor = { bg: '#c1b3b3', text: '#514646', cardBg: '#d7c9c9' };

    // DOM 元素
    const monthTitleWrapper = document.getElementById('month-title-wrapper');
    const monthTitle = document.getElementById('month-title');
    const prevMonthBtn = document.getElementById('prev-month-btn');
    const nextMonthBtn = document.getElementById('next-month-btn');
    const weekdaysBar = document.getElementById('weekdays-bar');
    const calendarGrid = document.getElementById('calendar-grid');
    const yearCalendarView = document.getElementById('year-calendar-view');

    const calendarViewContainer = document.getElementById('calendar-view-container');
    const databaseView = document.getElementById('database-view');
    const statsView = document.getElementById('stats-view');
    const settingsView = document.getElementById('settings-view');
    const dayViewContainer = document.getElementById('day-view-container');

    const aiBtn = document.getElementById('ai-btn');
    const modalOverlay = document.getElementById('modal-overlay');
    const cancelBtn = document.getElementById('cancel-btn');
    const scheduleForm = document.getElementById('schedule-form');
    const modalTitle = document.getElementById('modal-title');
    const deleteBtn = document.getElementById('delete-btn');
    
    const searchBtn = document.getElementById('search-btn');
    const topAddBtn = document.getElementById('top-add-btn');
    const searchOverlay = document.getElementById('search-overlay');
    const closeSearchBtn = document.getElementById('close-search-btn');
    const searchInput = document.getElementById('search-input');
    const searchResults = document.getElementById('search-results');
    
    const addMenuOverlay = document.getElementById('add-menu-overlay');
    const addMenu = document.getElementById('add-menu');
    const addCardOpt = document.getElementById('add-card-opt');
    const addScheduleOpt = document.getElementById('add-schedule-opt');
    const addShoppingOpt = document.getElementById('add-shopping-opt');
    const addOtherOpt = document.getElementById('add-other-opt');
    const shoppingModalOverlay = document.getElementById('shopping-modal-overlay');
    const otherModalOverlay = document.getElementById('other-modal-overlay');
    const shoppingForm = document.getElementById('shopping-form');
    const otherForm = document.getElementById('other-form');
    const shoppingModalTitle = document.getElementById('shopping-modal-title');
    const otherModalTitle = document.getElementById('other-modal-title');
    const shoppingDeleteBtn = document.getElementById('shopping-delete-btn');
    const otherDeleteBtn = document.getElementById('other-delete-btn');
    const shoppingCancelBtn = document.getElementById('shopping-cancel-btn');
    const otherCancelBtn = document.getElementById('other-cancel-btn');
    const shoppingDateTrigger = document.getElementById('shopping-date-trigger');
    const otherStartDateTrigger = document.getElementById('other-start-date-trigger');
    const otherEndDateTrigger = document.getElementById('other-end-date-trigger');

    const cardModalOverlay = document.getElementById('card-modal-overlay');
    const cardForm = document.getElementById('card-form');
    const cardModalTitle = document.getElementById('card-modal-title');
    const cardNote = document.getElementById('card-note');
    const cardDeleteBtn = document.getElementById('card-delete-btn');
    const cardCancelBtn = document.getElementById('card-cancel-btn');
    const coachLevelGroup = document.getElementById('coach-level-group');

    const scheduleDateTrigger = document.getElementById('schedule-date-trigger');
    const cardStartDateTrigger = document.getElementById('card-start-date-trigger');
    const cardEndDateTrigger = document.getElementById('card-end-date-trigger');

    if (scheduleDateTrigger) {
        scheduleDateTrigger.addEventListener('click', () => {
            const hiddenInput = document.getElementById('schedule-date');
            const currentVal = hiddenInput ? hiddenInput.value : '';
            const currentEndTime = hiddenInput ? hiddenInput.dataset.endtime || '' : '';
            CustomDatePicker.open({
                triggerId: 'schedule-date-trigger',
                initialValue: currentVal,
                initialEndTime: currentEndTime,
                includeTime: true,
                onChange: () => {
                    const currentCardId = document.getElementById('linked-card-select')?.value || '';
                    populateLinkedCardSelect(currentCardId);
                }
            });
        });
    }

    document.querySelectorAll('input[name="schedule-type"]').forEach(radio => {
        radio.addEventListener('change', () => {
            const currentSelectedCardId = document.getElementById('linked-card-select')?.value || '';
            populateLinkedCardSelect(currentSelectedCardId);
        });
    });

    if (cardStartDateTrigger) {
        cardStartDateTrigger.addEventListener('click', () => {
            const currentVal = document.getElementById('card-start-date').value;
            CustomDatePicker.open({
                triggerId: 'card-start-date-trigger',
                initialValue: currentVal,
                includeTime: false,
                onChange: (val, dateStr) => {
                    updateCardOptions();
                }
            });
        });
    }

    if (cardEndDateTrigger) {
        cardEndDateTrigger.addEventListener('click', () => {
            const currentVal = document.getElementById('card-end-date').value;
            CustomDatePicker.open({
                triggerId: 'card-end-date-trigger',
                initialValue: currentVal,
                includeTime: false
            });
        });
    }

    if (shoppingDateTrigger) {
        shoppingDateTrigger.addEventListener('click', () => {
            const currentVal = document.getElementById('shopping-date').value;
            CustomDatePicker.open({
                triggerId: 'shopping-date-trigger',
                initialValue: currentVal,
                includeTime: false
            });
        });
    }

    if (otherStartDateTrigger) {
        otherStartDateTrigger.addEventListener('click', () => {
            const currentVal = document.getElementById('other-start-date').value;
            CustomDatePicker.open({
                triggerId: 'other-start-date-trigger',
                initialValue: currentVal,
                includeTime: false
            });
        });
    }

    if (otherEndDateTrigger) {
        otherEndDateTrigger.addEventListener('click', () => {
            const currentVal = document.getElementById('other-end-date').value;
            CustomDatePicker.open({
                triggerId: 'other-end-date-trigger',
                initialValue: currentVal,
                includeTime: false
            });
        });
    }

    initCustomSelect('shopping-type-trigger', 'shopping-type-menu', 'shopping-type-wrapper', 'shopping-type-select', 'shopping-type-display');
    initCustomSelect('other-type-trigger', 'other-type-menu', 'other-type-wrapper', 'other-type-select', 'other-type-display');

    const cardPrices = {
        '月卡': ['2500', '3000', '7000'],
        '單次入場': ['200(平日)', '220(假日)'],
        '團體課卡(平)': ['1800', '540(單次)'],
        '團體課卡(假)': ['2200', '660(單次)'],
        '私人課卡(平)': {
            '一般': ['3,400(1人)', '2,600(2人)'],
            '高級': ['4,200(1人)', '3,200(2人)'],
            '國家級': ['5,200(1人)', '4,000(2人)']
        },
        '私人課卡(假)': {
            '一般': ['3,800(1人)', '3,000(2人)'],
            '高級': ['4,600(1人)', '3,600(2人)'],
            '國家級': ['5,600(1人)', '4,400(2人)']
        }
    };

    // ---- 點擊標題切換月曆/年曆 (僅在月曆分頁生效) ----
    if (monthTitleWrapper) {
        monthTitleWrapper.addEventListener('click', () => {
            if (document.activeElement) document.activeElement.blur();
            if (currentTab === 'calendar') {
                if (currentViewMode === 'month') {
                    const visibleBlock = getCurrentlyVisibleMonthBlock();
                    if (visibleBlock && visibleBlock.dataset.year && visibleBlock.dataset.month) {
                        currentDate = new Date(parseInt(visibleBlock.dataset.year), parseInt(visibleBlock.dataset.month), 1);
                    }
                    currentViewMode = 'year';
                } else {
                    currentViewMode = 'month';
                }
                renderView();
            } else if (currentTab === 'day-view') {
                currentTab = 'calendar';
                currentDate = new Date(selectedDayDate); // 將月曆視圖設定為剛剛查看的該天所在月份
                const bottomNavItems = document.querySelectorAll('.bottom-nav-item');
                bottomNavItems.forEach(i => {
                    if (i.dataset.tab === 'calendar') i.classList.add('active');
                    else i.classList.remove('active');
                });
                renderView();
            }
        });
    }

    // ---- 月曆與年曆切換按鈕事件 ----
    function getCurrentlyVisibleMonthBlock() {
        const blocks = Array.from(document.querySelectorAll('.month-block'));
        if (blocks.length === 0) return null;

        const targetY = 80;
        let closestBlock = blocks[0];
        let minDistance = Math.abs(blocks[0].getBoundingClientRect().top - targetY);

        for (let i = 1; i < blocks.length; i++) {
            const dist = Math.abs(blocks[i].getBoundingClientRect().top - targetY);
            if (dist < minDistance) {
                minDistance = dist;
                closestBlock = blocks[i];
            }
        }
        return closestBlock;
    }

    function scrollToAdjacentMonth(direction) {
        const blocks = Array.from(document.querySelectorAll('.month-block'));
        if (blocks.length === 0) return;

        const currentBlock = getCurrentlyVisibleMonthBlock();
        if (!currentBlock) return;

        const currentIndex = blocks.indexOf(currentBlock);
        const targetIndex = Math.max(0, Math.min(blocks.length - 1, currentIndex + direction));

        blocks[targetIndex].scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    if (prevMonthBtn) {
        prevMonthBtn.addEventListener('click', () => {
            if (currentTab === 'day-view') {
                selectedDayDate.setDate(selectedDayDate.getDate() - 1);
                renderView();
            } else if (currentViewMode === 'month') {
                scrollToAdjacentMonth(-1);
            } else {
                currentDate.setFullYear(currentDate.getFullYear() - 1);
                renderView();
            }
        });
    }

    if (nextMonthBtn) {
        nextMonthBtn.addEventListener('click', () => {
            if (currentTab === 'day-view') {
                selectedDayDate.setDate(selectedDayDate.getDate() + 1);
                renderView();
            } else if (currentViewMode === 'month') {
                scrollToAdjacentMonth(1);
            } else {
                currentDate.setFullYear(currentDate.getFullYear() + 1);
                renderView();
            }
        });
    }

    // ---- 手機版當日模式 (Day View) 僅允許左右滑動切換日期 ----
    function setupDayViewSwipeGesture(containerEl) {
        if (!containerEl) return;
        let startX = 0, startY = 0;
        containerEl.addEventListener('touchstart', (e) => {
            if (e.touches && e.touches.length === 1) {
                startX = e.touches[0].clientX;
                startY = e.touches[0].clientY;
            }
        }, { passive: true });

        containerEl.addEventListener('touchend', (e) => {
            if (e.changedTouches && e.changedTouches.length === 1) {
                const endX = e.changedTouches[0].clientX;
                const endY = e.changedTouches[0].clientY;
                const diffX = endX - startX;
                const diffY = endY - startY;

                // 僅當水平移動 (diffX) 顯著大於垂直移動時觸發切換日期
                if (Math.abs(diffX) >= 45 && Math.abs(diffX) > Math.abs(diffY) * 1.3) {
                    if (diffX < 0) {
                        // 向左滑動 -> 下一天
                        if (nextMonthBtn) nextMonthBtn.click();
                    } else {
                        // 向右滑動 -> 前一天
                        if (prevMonthBtn) prevMonthBtn.click();
                    }
                }
            }
        }, { passive: true });
    }

    setupDayViewSwipeGesture(dayViewContainer);

    // 點擊 DOCK 與按鈕後自動取消焦點高亮 (避免殘留點亮色塊)
    document.querySelectorAll('.bottom-nav-item, .icon-btn, .month-title-wrapper').forEach(btn => {
        btn.addEventListener('click', () => {
            if (document.activeElement && typeof document.activeElement.blur === 'function') {
                document.activeElement.blur();
            }
        });
    });

    // 統一渲染控制
    function updateSystemAlert() {
        const alertContainer = document.getElementById('system-alert-container');
        if (!alertContainer) return;
        
        const today = new Date();
        const nextWeek = new Date();
        nextWeek.setDate(today.getDate() + 7);
        const todayStr = formatLocalDate(today);
        const nextWeekStr = formatLocalDate(nextWeek);
        
        const expiringCards = schedules.filter(s => {
            if (!s.isCard) return false;
            if (!CARD_RULES[s.type]) return false;
            const endDate = normalizeDateStr(s.date);
            return endDate >= todayStr && endDate <= nextWeekStr;
        });

        if (expiringCards.length === 0) {
            alertContainer.style.display = 'none';
            return;
        }

        let alertHTML = '<strong>系統提醒：</strong><br/>';
        expiringCards.forEach(card => {
            const rule = CARD_RULES[card.type];
            const usage = getCardUsage(card.id);
            const remainingClasses = rule.maxClasses - usage.classes;
            const remainingPractices = rule.maxPractices - usage.practices;
            
            const isInfinite = rule.maxClasses === Infinity || rule.maxPractices === Infinity;
            
            let statusText = '';
            if (!isInfinite) {
                if (remainingClasses <= 0 && remainingPractices <= 0) return; // All used up, no need to alert
                statusText = ` (剩餘: ${remainingClasses}課程, ${remainingPractices}練習)`;
            } else {
                statusText = ' (無限次數)';
            }

            alertHTML += `• 您的「${card.displayTitle || card.type}」將於 ${normalizeDateStr(card.date)} 到期${statusText}<br/>`;
        });
        
        // If all expiring cards were already used up, hide the alert
        if (alertHTML === '<strong>系統提醒：</strong><br/>') {
            alertContainer.style.display = 'none';
        } else {
            alertContainer.innerHTML = alertHTML;
            alertContainer.style.display = 'block';
        }
    }

    function renderView() {
        const topNavbar = document.querySelector('header.navbar');
        try {
            updateSystemAlert();
        } catch (e) {
            console.error('Error updating system alert:', e);
        }
        try {
            const prevMonthBtn = document.getElementById('prev-month-btn');
            const nextMonthBtn = document.getElementById('next-month-btn');
            const topActionDock = document.getElementById('top-action-dock');
            
            if (currentTab === 'calendar') {
                if (topNavbar) topNavbar.style.display = 'flex';
                if (prevMonthBtn) prevMonthBtn.style.display = 'flex';
                if (nextMonthBtn) nextMonthBtn.style.display = 'flex';
                if (topActionDock) topActionDock.style.display = 'flex';
                
                if (calendarViewContainer) calendarViewContainer.style.display = 'block';
                if (databaseView) databaseView.style.display = 'none';
                if (statsView) statsView.style.display = 'none';
                if (settingsView) settingsView.style.display = 'none';
                if (dayViewContainer) dayViewContainer.style.display = 'none';

                if (currentViewMode === 'month') {
                    if (monthTitleWrapper) monthTitleWrapper.classList.remove('year-mode');
                    if (weekdaysBar) weekdaysBar.style.display = 'grid';
                    if (calendarGrid) calendarGrid.style.display = 'grid';
                    if (yearCalendarView) yearCalendarView.style.display = 'none';
                    renderCalendar();
                } else {
                    if (monthTitleWrapper) monthTitleWrapper.classList.add('year-mode');
                    if (weekdaysBar) weekdaysBar.style.display = 'none';
                    if (calendarGrid) calendarGrid.style.display = 'none';
                    if (yearCalendarView) yearCalendarView.style.display = 'grid';
                    renderYearCalendar();
                }
            } else if (currentTab === 'database') {
                if (topNavbar) topNavbar.style.display = 'flex';
                if (prevMonthBtn) prevMonthBtn.style.display = 'none';
                if (nextMonthBtn) nextMonthBtn.style.display = 'none';
                if (topActionDock) topActionDock.style.display = 'flex';
                if (monthTitle) monthTitle.textContent = 'Database';
                
                if (calendarViewContainer) calendarViewContainer.style.display = 'none';
                if (databaseView) databaseView.style.display = 'block';
                if (statsView) statsView.style.display = 'none';
                if (settingsView) settingsView.style.display = 'none';
                if (dayViewContainer) dayViewContainer.style.display = 'none';
                if (activeDbTab === 'bookmark') {
                    renderBookmarkView();
                } else {
                    renderDatabaseView();
                }
            } else if (currentTab === 'stats') {
                if (topNavbar) topNavbar.style.display = 'flex';
                if (prevMonthBtn) prevMonthBtn.style.display = 'none';
                if (nextMonthBtn) nextMonthBtn.style.display = 'none';
                if (topActionDock) topActionDock.style.display = 'flex';
                if (monthTitle) monthTitle.textContent = 'Statistics';

                if (calendarViewContainer) calendarViewContainer.style.display = 'none';
                if (databaseView) databaseView.style.display = 'none';
                if (statsView) statsView.style.display = 'flex';
                if (settingsView) settingsView.style.display = 'none';
                if (dayViewContainer) dayViewContainer.style.display = 'none';
                const modeSelect = document.getElementById('stats-mode-select');
                const currentMode = modeSelect ? modeSelect.value : '每月總覽';
                if (currentMode === '開銷總覽') {
                    renderExpenseDashboard();
                } else if (currentMode === '年度總覽') {
                    renderYearlyDashboard();
                } else if (currentMode === '全期間總覽') {
                    renderAllTimeDashboard();
                } else if (currentMode === '每月總覽') {
                    renderStatsDashboard();
                }
            } else if (currentTab === 'settings') {
                if (topNavbar) topNavbar.style.display = 'flex';
                if (prevMonthBtn) prevMonthBtn.style.display = 'none';
                if (nextMonthBtn) nextMonthBtn.style.display = 'none';
                if (topActionDock) topActionDock.style.display = 'flex';
                if (monthTitle) monthTitle.textContent = 'Settings';

                if (calendarViewContainer) calendarViewContainer.style.display = 'none';
                if (databaseView) databaseView.style.display = 'none';
                if (statsView) statsView.style.display = 'none';
                if (settingsView) settingsView.style.display = 'block';
                if (dayViewContainer) dayViewContainer.style.display = 'none';

                renderSettingsScheduleTypes();
            } else if (currentTab === 'day-view') {
                if (topNavbar) topNavbar.style.display = 'flex';
                if (prevMonthBtn) prevMonthBtn.style.display = 'flex';
                if (nextMonthBtn) nextMonthBtn.style.display = 'flex';
                if (topActionDock) topActionDock.style.display = 'flex';
                
                const year = selectedDayDate.getFullYear();
                const month = String(selectedDayDate.getMonth() + 1).padStart(2, '0');
                const day = String(selectedDayDate.getDate()).padStart(2, '0');
                if (monthTitle) monthTitle.textContent = `${year}/${month}/${day}`;

                if (calendarViewContainer) calendarViewContainer.style.display = 'none';
                if (databaseView) databaseView.style.display = 'none';
                if (statsView) statsView.style.display = 'none';
                if (settingsView) settingsView.style.display = 'none';
                if (dayViewContainer) dayViewContainer.style.display = 'flex';
                
                renderDayView();
            }
        } catch (e) {
            console.error('Error rendering view:', e);
        }
    }

    // 初始化渲染視圖
    renderView();

    // ---- 順暢無縫垂直連續捲動月曆 (Continuous Scroll Month View) ----
    let monthObserver = null;

    function renderCalendar() {
        if (!calendarGrid) return;
        calendarGrid.innerHTML = '';
        calendarGrid.className = 'calendar-grid-continuous';

        const baseYear = currentDate.getFullYear();
        const baseMonth = currentDate.getMonth();

        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

        let currentActiveBlock = null;

        for (let offset = -6; offset <= 12; offset++) {
            const targetDate = new Date(baseYear, baseMonth + offset, 1);
            const year = targetDate.getFullYear();
            const month = targetDate.getMonth();

            const monthBlock = document.createElement('div');
            monthBlock.className = 'month-block';
            monthBlock.dataset.year = year;
            monthBlock.dataset.month = month;
            monthBlock.dataset.title = `${monthNames[month]} ${year}`;

            const grid = document.createElement('div');
            grid.className = 'month-grid';

            const firstDayOfMonth = new Date(year, month, 1);
            const lastDayOfMonth = new Date(year, month + 1, 0);

            let firstDayIndex = firstDayOfMonth.getDay() - 1;
            if (firstDayIndex === -1) firstDayIndex = 6;

            const totalDays = lastDayOfMonth.getDate();
            const totalCellsNeeded = Math.ceil((firstDayIndex + totalDays) / 7) * 7;

            // 1. 上個月空白對齊格 (無數字，完全覆蓋莫蘭迪背景色)
            for (let i = 0; i < firstDayIndex; i++) {
                const emptyCell = document.createElement('div');
                emptyCell.className = 'day-cell empty-day-cell';
                grid.appendChild(emptyCell);
            }

            // 2. 當月所有日期 (1 ~ totalDays)
            for (let i = 1; i <= totalDays; i++) {
                grid.appendChild(createDayCell(i, false, year, month));
            }

            // 3. 結尾空白填充格 (補齊該行剩餘格子，確保填滿背景色，絕不曝露底層灰色)
            const trailingCells = totalCellsNeeded - (firstDayIndex + totalDays);
            for (let i = 0; i < trailingCells; i++) {
                const emptyCell = document.createElement('div');
                emptyCell.className = 'day-cell empty-day-cell';
                grid.appendChild(emptyCell);
            }

            monthBlock.appendChild(grid);
            calendarGrid.appendChild(monthBlock);

            if (offset === 0) {
                currentActiveBlock = monthBlock;
            }
        }

        setupMonthObserver();

        if (currentActiveBlock) {
            setTimeout(() => {
                currentActiveBlock.scrollIntoView({ behavior: 'auto', block: 'start' });
            }, 50);
        }
    }

    function setupMonthObserver() {
        if (monthObserver) {
            monthObserver.disconnect();
        }

        const options = {
            root: null,
            rootMargin: '-76px 0px -70% 0px',
            threshold: 0
        };

        let titleTimer = null;
        monthObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const title = entry.target.dataset.title;
                    const yearStr = entry.target.dataset.year;
                    const monthStr = entry.target.dataset.month;

                    if (yearStr !== undefined && monthStr !== undefined) {
                        currentDate = new Date(parseInt(yearStr), parseInt(monthStr), 1);
                    }

                    if (title && monthTitle) {
                        if (titleTimer) clearTimeout(titleTimer);
                        titleTimer = setTimeout(() => {
                            monthTitle.textContent = title;
                        }, 40);
                    }
                }
            });
        }, options);

        document.querySelectorAll('.month-block').forEach(block => {
            monthObserver.observe(block);
        });
    }

    function createDayCell(dayNumber, isOtherMonth, year, month) {
        const cell = document.createElement('div');
        cell.className = `day-cell ${isOtherMonth ? 'other-month' : ''}`;
        
        const dayLabel = document.createElement('div');
        dayLabel.className = 'day-number';
        dayLabel.textContent = dayNumber;
        cell.appendChild(dayLabel);

        const actualDate = new Date(year, month, dayNumber);
        const dateString = formatLocalDate(actualDate);
        
        const realToday = new Date();
        if (actualDate.getDate() === realToday.getDate() && 
            actualDate.getMonth() === realToday.getMonth() && 
            actualDate.getFullYear() === realToday.getFullYear()) {
            dayLabel.classList.add('today');
        }
        
        const daySchedules = [];
        schedules.forEach(schedule => {
            const match = getScheduleMatchOnDate(schedule, dateString);
            if (match.matched) {
                daySchedules.push({ schedule, match });
            }
        });
        daySchedules.sort((a, b) => {
            const isMultiA = a.schedule.isOther && a.schedule.startDate && a.schedule.endDate && a.schedule.startDate !== a.schedule.endDate;
            const isMultiB = b.schedule.isOther && b.schedule.startDate && b.schedule.endDate && b.schedule.startDate !== b.schedule.endDate;
            
            if (isMultiA && !isMultiB) return -1;
            if (!isMultiA && isMultiB) return 1;
            if (isMultiA && isMultiB) {
                const startDiff = (a.schedule.startDate || '').localeCompare(b.schedule.startDate || '');
                if (startDiff !== 0) return startDiff;
                const endDiff = (b.schedule.endDate || '').localeCompare(a.schedule.endDate || '');
                if (endDiff !== 0) return endDiff;
                return String(a.schedule.id).localeCompare(String(b.schedule.id));
            }
            return (a.schedule.time || '').localeCompare(b.schedule.time || '');
        });
        
        const todayStr = formatLocalDate(realToday);
        const dayIndexInWeek = (actualDate.getDay() + 6) % 7; // Mon = 0, Sun = 6

        const MAX_VISIBLE_SCHEDULES = 2;
        const visibleSchedules = daySchedules.slice(0, MAX_VISIBLE_SCHEDULES);
        const overflowCount = daySchedules.length - MAX_VISIBLE_SCHEDULES;

        visibleSchedules.forEach(({ schedule, match }) => {
            const item = document.createElement('div');
            let classNames = ['schedule-item'];
            
            const isMultiDay = schedule.isOther && schedule.startDate && schedule.endDate && schedule.startDate !== schedule.endDate;

            if (isMultiDay) {
                if (match.isStart && !match.isEnd) classNames.push('span-start');
                else if (!match.isStart && match.isEnd) classNames.push('span-end');
                else if (!match.isStart && !match.isEnd) classNames.push('span-middle');
            }

            item.className = classNames.join(' ');
            item.dataset.id = schedule.id;

            // 若該日為已經過的日期，加入 .past 類別使色彩顯示得更淺
            if (dateString < todayStr) {
                item.classList.add('past');
            }
            
            if (schedule.isCard) {
                item.textContent = `${schedule.displayTitle || schedule.type} 到期`;
            } else if (schedule.isOther) {
                item.innerHTML = '';
                if (isMultiDay) {
                    const isTextAnchor = match.isStart || dayIndexInWeek === 0;
                    if (isTextAnchor) {
                        item.style.overflow = 'visible';
                        item.style.zIndex = '5';
                        
                        const titleAnchor = document.createElement('span');
                        titleAnchor.className = 'schedule-title-anchor';
                        
                        if (schedule.time) {
                            const timeSpan = document.createElement('span');
                            timeSpan.className = 'schedule-time';
                            timeSpan.textContent = `${schedule.time} `;
                            titleAnchor.appendChild(timeSpan);
                        }
                        
                        const titleSpan = document.createElement('span');
                        titleSpan.className = 'schedule-type';
                        titleSpan.textContent = schedule.title;
                        titleAnchor.appendChild(titleSpan);
                        
                        const currDateObj = parseLocalDate(dateString);
                        const endDateObj = parseLocalDate(normalizeDateStr(schedule.endDate));
                        const daysLeftInEvent = Math.max(1, Math.round((endDateObj - currDateObj) / (1000 * 3600 * 24)) + 1);
                        const daysLeftInWeek = 7 - dayIndexInWeek;
                        const K = Math.min(daysLeftInEvent, daysLeftInWeek);
                        
                        titleAnchor.style.width = `calc(${K} * 100% + ${(K - 1) * 1}px - 16px)`;
                        item.appendChild(titleAnchor);
                    } else {
                        item.style.overflow = 'hidden';
                        item.style.zIndex = '1';
                    }
                } else {
                    if (schedule.time) {
                        const timeSpan = document.createElement('span');
                        timeSpan.className = 'schedule-time';
                        timeSpan.textContent = `${schedule.time} `;
                        item.appendChild(timeSpan);
                    }
                    const titleSpan = document.createElement('span');
                    titleSpan.className = 'schedule-type';
                    titleSpan.textContent = schedule.title;
                    item.appendChild(titleSpan);
                }
            } else {
                item.innerHTML = '';
                if (schedule.time) {
                    const timeSpan = document.createElement('span');
                    timeSpan.className = 'schedule-time';
                    timeSpan.textContent = schedule.endTime ? `${schedule.time}~${schedule.endTime} ` : `${schedule.time} `;
                    item.appendChild(timeSpan);
                }
                const typeSpan = document.createElement('span');
                typeSpan.className = 'schedule-type';
                typeSpan.textContent = schedule.isShopping ? (schedule.name || schedule.type) : schedule.type;
                item.appendChild(typeSpan);
            }

            const colors = typeColors[schedule.type] || defaultTypeColor;
            const translucentBg = getTranslucentColor(colors.bg, 0.78);
            item.style.backgroundColor = translucentBg;
            item.style.setProperty('--item-bg', translucentBg);
            item.style.color = colors.text;
            
            let displayedText = schedule.isShopping ? (schedule.name || schedule.type) : (schedule.isOther ? schedule.title : schedule.type);
            let hoverText = schedule.note || '';
            if (hoverText === displayedText) {
                hoverText = '';
            }
            if (schedule.isCard && CARD_RULES[schedule.type]) {
                const rule = CARD_RULES[schedule.type];
                const usage = getCardUsage(schedule.id);
                const isInfinite = rule.maxClasses === Infinity || rule.maxPractices === Infinity;
                if (!isInfinite) {
                    hoverText += `\n[使用狀況: ${usage.classes}/${rule.maxClasses}課, ${usage.practices}/${rule.maxPractices}練]`;
                } else {
                    hoverText += `\n[使用狀況: 無限次數]`;
                }
            } else if (!schedule.isCard && schedule.linkedCardId) {
                const linkedCard = schedules.find(s => String(s.id) === String(schedule.linkedCardId));
                if (linkedCard) {
                    hoverText += `\n(扣抵: ${linkedCard.displayTitle || linkedCard.type})`;
                }
            }
            
            if (hoverText) {
                item.title = hoverText.trim();
            }

            // 啟用拖拽 (Drag & Drop)
            item.setAttribute('draggable', 'true');
            item.addEventListener('dragstart', (e) => {
                document.querySelectorAll(`.schedule-item[data-id="${schedule.id}"]`).forEach(el => el.classList.add('dragging'));
                e.dataTransfer.setData('text/plain', schedule.id);
                e.dataTransfer.effectAllowed = 'move';
                
                if (schedule.isOther && schedule.startDate && schedule.endDate && schedule.startDate !== schedule.endDate) {
                    const startObj = parseLocalDate(normalizeDateStr(schedule.startDate));
                    const endObj = parseLocalDate(normalizeDateStr(schedule.endDate));
                    let days = Math.round((endObj - startObj) / (1000 * 3600 * 24)) + 1;
                    if (days < 1) days = 1;
                    
                    const ghost = document.createElement('div');
                    ghost.textContent = schedule.title || '其他排程';
                    const colors = typeColors[schedule.type] || { bg: '#c1b3b3', text: '#514646' };
                    ghost.style.backgroundColor = colors.bg;
                    ghost.style.color = colors.text;
                    ghost.style.padding = '3px 12px';
                    ghost.style.borderRadius = '9999px';
                    ghost.style.fontSize = '11px';
                    ghost.style.position = 'absolute';
                    ghost.style.top = '-1000px';
                    ghost.style.width = `${days * 120}px`;
                    ghost.style.boxSizing = 'border-box';
                    
                    document.body.appendChild(ghost);
                    e.dataTransfer.setDragImage(ghost, 20, 10);
                    setTimeout(() => { if (ghost.parentNode) ghost.parentNode.removeChild(ghost); }, 0);
                }
            });

            item.addEventListener('dragend', () => {
                document.querySelectorAll(`.schedule-item[data-id="${schedule.id}"]`).forEach(el => el.classList.remove('dragging'));
            });
            
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                
                try {
                    const currentId = String(schedule.id);
                    const isAlreadyFocused = (activeFocusedScheduleId === currentId);
                    
                    focusSchedule(currentId);

                    if (isAlreadyFocused) {
                        editingScheduleId = schedule.id;
                        if (schedule.isCard) {
                            openCardModalForEdit(schedule);
                        } else if (schedule.isShopping) {
                            openShoppingModalForEdit(schedule);
                        } else if (schedule.isOther) {
                            openOtherModalForEdit(schedule);
                        } else {
                            openScheduleModalForEdit(schedule);
                        }
                    }
                } catch (err) {
                    alert("編輯排程時發生錯誤:\n" + err.message + "\n\n" + err.stack);
                    console.error("Error in click listener:", err);
                }
            });
            
            cell.appendChild(item);
        });

        if (overflowCount > 0) {
            const moreLabel = document.createElement('div');
            moreLabel.className = 'schedule-more';
            moreLabel.textContent = `+ ${overflowCount}`;
            cell.appendChild(moreLabel);
        }

        // 監聽日期格子拖放目標 (Drop Target)
        cell.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            cell.classList.add('drag-over');
        });

        cell.addEventListener('dragleave', () => {
            cell.classList.remove('drag-over');
        });

        cell.addEventListener('drop', (e) => {
            e.preventDefault();
            cell.classList.remove('drag-over');
            const scheduleId = e.dataTransfer.getData('text/plain');
            if (!scheduleId) return;

            const scheduleIndex = schedules.findIndex(s => String(s.id) === String(scheduleId));
            if (scheduleIndex > -1) {
                const targetSchedule = schedules[scheduleIndex];
                if (targetSchedule.isCard) {
                    const oldEnd = parseLocalDate(normalizeDateStr(targetSchedule.date));
                    const oldStart = parseLocalDate(normalizeDateStr(targetSchedule.startDate || targetSchedule.date));
                    const diffDays = Math.round((oldEnd.getTime() - oldStart.getTime()) / (1000 * 3600 * 24));

                    const newStart = parseLocalDate(dateString);
                    const newEnd = new Date(newStart.getTime() + diffDays * 24 * 3600 * 1000);

                    targetSchedule.startDate = dateString;
                    targetSchedule.date = formatLocalDate(newEnd);
                } else if (targetSchedule.isOther && targetSchedule.startDate && targetSchedule.endDate) {
                    const oldStart = parseLocalDate(normalizeDateStr(targetSchedule.startDate));
                    const oldEnd = parseLocalDate(normalizeDateStr(targetSchedule.endDate));
                    const diffDays = Math.round((oldEnd.getTime() - oldStart.getTime()) / (1000 * 3600 * 24));

                    const newStart = parseLocalDate(dateString);
                    const newEnd = new Date(newStart.getTime() + diffDays * 24 * 3600 * 1000);

                    targetSchedule.startDate = dateString;
                    targetSchedule.endDate = formatLocalDate(newEnd);
                    targetSchedule.date = formatLocalDate(newEnd);
                } else {
                    targetSchedule.date = dateString;
                }

                saveSchedules(schedules);
                renderView();
            }
        });

        cell.addEventListener('click', (e) => {
            if (!e.target.closest('.schedule-item')) {
                clearFocus();
                selectedDayDate = parseLocalDate(dateString);
                currentTab = 'day-view';
                renderView();
            }
        });

        return cell;
    }

    // ---- 年曆視圖渲染邏輯 (Year View) ----
    function renderYearCalendar() {
        if (!yearCalendarView) return;
        yearCalendarView.innerHTML = '';

        const year = currentDate.getFullYear();
        if (monthTitle) {
            monthTitle.textContent = `${year}`;
        }

        // 12 個月 3 欄 Grid 迷你月曆
        const monthContainer = document.createElement('div');
        monthContainer.className = 'year-months-grid';

        const monthNamesCN = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];
        const realToday = new Date();

        for (let m = 0; m < 12; m++) {
            const card = document.createElement('div');
            card.className = 'mini-month-card';
            const isCurrentMonth = (realToday.getFullYear() === year && realToday.getMonth() === m);
            if (isCurrentMonth) {
                card.classList.add('current-month');
            }

            const title = document.createElement('div');
            title.className = `mini-month-title ${isCurrentMonth ? 'current-month-title' : ''}`;
            title.textContent = monthNamesCN[m];
            card.appendChild(title);

            const daysGrid = document.createElement('div');
            daysGrid.className = 'mini-days-grid';

            const firstDayOfMonth = new Date(year, m, 1);
            const lastDayOfMonth = new Date(year, m + 1, 0);

            let firstDayIndex = firstDayOfMonth.getDay() - 1;
            if (firstDayIndex === -1) firstDayIndex = 6;

            const totalDays = lastDayOfMonth.getDate();

            // 1. 空白 filler (iOS 行事曆：不顯示上月日期數字，僅留白補位)
            for (let i = 0; i < firstDayIndex; i++) {
                const emptyDay = document.createElement('div');
                emptyDay.className = 'mini-day empty-mini-day';
                daysGrid.appendChild(emptyDay);
            }

            // 2. 當月所有日期 (1 ~ totalDays)
            for (let d = 1; d <= totalDays; d++) {
                const miniDay = document.createElement('div');
                miniDay.className = 'mini-day';
                miniDay.textContent = d;

                const actualDate = new Date(year, m, d);
                const dateStr = formatLocalDate(actualDate);

                const isToday = (actualDate.getDate() === realToday.getDate() &&
                                 actualDate.getMonth() === realToday.getMonth() &&
                                 actualDate.getFullYear() === realToday.getFullYear());

                if (isToday) {
                    miniDay.classList.add('today');
                }

                // 檢查該日期是否有排程
                const matchingSchedules = schedules.filter(s => !s.isCard && !s.isShopping && !s.isOther && getScheduleMatchOnDate(s, dateStr).matched);
                if (matchingSchedules.length > 0) {
                    if (!isToday) {
                        const primarySchedule = matchingSchedules[0];
                        const colors = typeColors[primarySchedule.type] || defaultTypeColor;
                        miniDay.style.backgroundColor = colors.bg;
                        miniDay.style.color = colors.text;
                        miniDay.style.fontWeight = '700';
                    }
                    miniDay.title = matchingSchedules.map(s => (s.displayTitle || s.type)).join('\n');
                }

                daysGrid.appendChild(miniDay);
            }

            card.appendChild(daysGrid);

            // 點擊迷你月曆卡片切換回該月份的詳細月視圖
            card.addEventListener('click', () => {
                currentDate = new Date(year, m, 1);
                currentViewMode = 'month';
                renderView();
            });

            monthContainer.appendChild(card);
        }

        yearCalendarView.appendChild(monthContainer);

        if (currentTab === 'stats') {
            const modeSelect = document.getElementById('stats-mode-select');
            const currentMode = modeSelect ? modeSelect.value : '每月總覽';
            if (currentMode === '開銷總覽') {
                renderExpenseDashboard();
            } else if (currentMode === '年度總覽') {
                renderYearlyDashboard();
            } else if (currentMode === '全期間總覽') {
                renderAllTimeDashboard();
            } else if (currentMode === '每月總覽') {
                renderStatsDashboard();
            }
        }
    }

    function getCardUsage(cardId) {
        const usage = { classes: 0, practices: 0 };
        schedules.forEach(s => {
            if (!s.isCard && String(s.linkedCardId) === String(cardId)) {
                if (s.type === '花滑練習') usage.practices++;
                else usage.classes++;
            }
        });
        return usage;
    }

    function populateLinkedCardSelect(selectedCardId = '') {
        const hiddenInput = document.getElementById('linked-card-select');
        const displaySpan = document.getElementById('linked-card-display');
        const menuEl = document.getElementById('linked-card-menu');
        const wrapper = document.getElementById('linked-card-wrapper');
        const trigger = document.getElementById('linked-card-trigger');

        if (!hiddenInput || !menuEl) return;

        menuEl.innerHTML = '';
        hiddenInput.value = selectedCardId || '';
        
        const currentScheduleType = safeGetRadioValue('schedule-type');
        const scheduleDateInput = document.getElementById('schedule-date');
        const currentScheduleDate = scheduleDateInput ? (scheduleDateInput.value.split('T')[0] || '').replace(/-/g, '/') : '';

        const buildCardOptionHtml = (mainText, subText) => {
            if (!subText) {
                return `<div class="select-opt-main">${mainText}</div>`;
            }
            return `<div class="select-opt-main">${mainText}</div><div class="select-opt-sub">${subText}</div>`;
        };

        let selectedDisplayHtml = buildCardOptionHtml('(無/單次付費)', '');

        // 建立預設選項
        const defaultOpt = document.createElement('div');
        defaultOpt.className = `custom-select-option ${!selectedCardId ? 'selected' : ''}`;
        defaultOpt.innerHTML = buildCardOptionHtml('(無/單次付費)', '');
        defaultOpt.addEventListener('click', (e) => {
            e.stopPropagation();
            hiddenInput.value = '';
            if (displaySpan) displaySpan.innerHTML = buildCardOptionHtml('(無/單次付費)', '');
            if (menuEl) menuEl.classList.remove('show');
            if (wrapper) wrapper.classList.remove('open');
            menuEl.querySelectorAll('.custom-select-option').forEach(el => el.classList.remove('selected'));
            defaultOpt.classList.add('selected');
        });
        menuEl.appendChild(defaultOpt);

        const activeCards = schedules.filter(s => s.isCard);
        
        activeCards.sort((a, b) => {
            const dateA = normalizeDateStr(a.startDate || a.date);
            const dateB = normalizeDateStr(b.startDate || b.date);
            return dateA.localeCompare(dateB);
        });

        activeCards.forEach(card => {
            const rule = getCardRule(card);
            const usage = getCardUsage(card.id);
            const isSelected = String(card.id) === String(selectedCardId);
            
            // 檢查是否已超過課卡到期日或早於購買日
            const cardStartDate = normalizeDateStr(card.startDate || card.date);
            const cardEndDate = normalizeDateStr(card.date);
            const isExpired = currentScheduleDate && cardEndDate && (currentScheduleDate > cardEndDate);
            const isBeforeStart = currentScheduleDate && cardStartDate && (currentScheduleDate < cardStartDate);

            // 1. 依據排程類型與效期過濾非相對應的課卡
            if (!isSelected) {
                if (isExpired || isBeforeStart) return; // 已經超過到期日或早於購買日，不顯示

                if (currentScheduleType === '花滑團課') {
                    // 團體課：僅允許團體課卡或支援團體課的月卡，不顯示私人課卡、單次入場(練習券)、無團體課額度月卡
                    if (card.type.startsWith('私人課卡') || card.type === '單次入場') return;
                    if (rule && rule.maxClasses === 0) return;
                } else if (currentScheduleType === '花滑私課') {
                    // 私人課：僅允許私人課卡，不顯示團體課卡、月卡、單次入場
                    if (!card.type.startsWith('私人課卡')) return;
                } else if (currentScheduleType === '花滑練習') {
                    // 練習課：僅顯示具有練習額度的課卡 (maxPractices > 0)
                    if (rule && rule.maxPractices === 0) return;
                }
            }

            // 2. 計算剩餘額度與是否耗盡 (isDepleted)
            const isInfinite = rule && (rule.maxClasses === Infinity || rule.maxPractices === Infinity);
            let remainingClasses = 0;
            let remainingPractices = 0;
            let isDepleted = false;

            if (rule && !isInfinite) {
                remainingClasses = Math.max(0, rule.maxClasses - usage.classes);
                remainingPractices = Math.max(0, rule.maxPractices - usage.practices);

                if (currentScheduleType === '花滑團課' || currentScheduleType === '花滑私課') {
                    if (remainingClasses <= 0) isDepleted = true;
                } else if (currentScheduleType === '花滑練習') {
                    if (remainingPractices <= 0) isDepleted = true;
                } else {
                    if (remainingClasses <= 0 && remainingPractices <= 0) isDepleted = true;
                }
            } else if (!rule || card.type === '單次入場') {
                // 單次入場或未定義規則課卡：抵扣 1 次即完結
                const totalUsed = usage.classes + usage.practices;
                if (totalUsed >= 1) {
                    isDepleted = true;
                }
            }

            // 3. 構造標題與簡介
            let mainText = `${card.displayTitle || card.type} `;
            if (card.price && !mainText.includes(String(card.price))) {
                mainText += `${card.price} `;
            }
            if (card.startDate && card.startDate !== card.date) {
                mainText += `(${normalizeDateStr(card.startDate)} ~ ${normalizeDateStr(card.date)})`;
            } else {
                mainText += `(${normalizeDateStr(card.date)})`;
            }

            let subText = '';
            if (!rule || card.type === '單次入場') {
                const totalUsed = usage.classes + usage.practices;
                subText = totalUsed > 0 ? `已抵扣: ${totalUsed}次 (使用完畢)` : `可抵扣: 1次`;
            } else if (!isInfinite) {
                subText = `剩餘：${remainingClasses}堂課 / ${remainingPractices}堂練習`;
            } else if (card.type === '7000月卡' || (card.type === '月卡' && String(card.price).replace(/,/g, '').includes('7000'))) {
                subText = `團體課免費, 無限練習`;
            } else if (card.type === '月卡') {
                subText = `無限練習/課程`;
            }

            const optHtml = buildCardOptionHtml(mainText, subText);
            if (isSelected) {
                selectedDisplayHtml = optHtml;
            }

            // 若該課卡已經抵扣完畢 (剩餘課堂與練習皆 <= 0)，直接從選單選項中隱藏
            if (isDepleted) {
                return;
            }

            const opt = document.createElement('div');
            opt.className = `custom-select-option ${isSelected ? 'selected' : ''}`;
            opt.innerHTML = optHtml;
            opt.addEventListener('click', (e) => {
                e.stopPropagation();
                hiddenInput.value = card.id;
                if (displaySpan) displaySpan.innerHTML = optHtml;
                if (menuEl) menuEl.classList.remove('show');
                if (wrapper) wrapper.classList.remove('open');
                menuEl.querySelectorAll('.custom-select-option').forEach(el => el.classList.remove('selected'));
                opt.classList.add('selected');
            });
            menuEl.appendChild(opt);
        });

        if (displaySpan) displaySpan.innerHTML = selectedDisplayHtml;

        if (trigger && !trigger.dataset.bound) {
            trigger.dataset.bound = 'true';
            trigger.addEventListener('click', (e) => {
                e.stopPropagation();
                const isOpen = menuEl.classList.contains('show');
                if (isOpen) {
                    menuEl.classList.remove('show');
                    if (wrapper) wrapper.classList.remove('open');
                } else {
                    menuEl.classList.add('show');
                    if (wrapper) wrapper.classList.add('open');
                }
            });
        }
    }

    function openScheduleModalForEdit(schedule) {
        if (!schedule) return;
        editingScheduleId = schedule.id;
        if (modalTitle) modalTitle.textContent = '編輯排程';
        const timePart = schedule.time || '';
        const datePart = normalizeDateStr(schedule.date);
        const dateTimeValue = timePart ? `${datePart}T${timePart}` : datePart;
        CustomDatePicker.setValue('schedule-date-trigger', dateTimeValue, Boolean(timePart), schedule.endTime || '');
        
        renderScheduleTypePills(schedule.type);
        populateLinkedCardSelect(schedule.linkedCardId);
        const noteEl = document.getElementById('schedule-note');
        if (noteEl) noteEl.value = schedule.note || '';
        if (deleteBtn) deleteBtn.style.display = 'block';
        openModal();
    }

    function renderCardUsageHistory(cardId) {
        const historyGroup = document.getElementById('card-usage-history-group');
        const historyList = document.getElementById('card-usage-history-list');
        if (!historyGroup || !historyList) return;

        if (!cardId) {
            historyGroup.style.display = 'none';
            historyList.innerHTML = '';
            return;
        }

        historyGroup.style.display = 'block';
        historyList.innerHTML = '';

        // 尋找引用此課卡的排程
        const usedSchedules = schedules.filter(s => !s.isCard && String(s.linkedCardId) === String(cardId));

        if (usedSchedules.length === 0) {
            historyList.innerHTML = `<div style="font-size: 13px; color: var(--text-secondary); text-align: center; padding: 6px 0;">尚無抵扣排程紀錄</div>`;
            return;
        }

        // 依日期由新到舊排序
        usedSchedules.sort((a, b) => {
            const dateA = normalizeDateStr(a.date) + (a.time || '00:00');
            const dateB = normalizeDateStr(b.date) + (b.time || '00:00');
            return dateB.localeCompare(dateA);
        });

        usedSchedules.forEach(s => {
            const item = document.createElement('div');
            item.className = 'usage-history-item';
            
            const dateDisplay = normalizeDateStr(s.date);
            const timeDisplay = s.time ? ` ${s.time}` : '';
            const titleDisplay = s.displayTitle || s.type;
            const colorConfig = typeColors[s.type] || defaultTypeColor;

            if (colorConfig.cardBg) {
                item.style.backgroundColor = colorConfig.cardBg;
            } else {
                item.style.backgroundColor = '#ffffff';
            }

            item.innerHTML = `
                <span class="usage-date-info">${dateDisplay}${timeDisplay}</span>
                <span class="usage-tag" style="background-color: ${colorConfig.bg}; color: ${colorConfig.text};">
                    ${titleDisplay}
                </span>
            `;
            historyList.appendChild(item);
        });
    }

    function showModalOverlay(overlayEl) {
        if (!overlayEl) return;
        document.body.classList.add('modal-open');
        overlayEl.classList.add('show');
        overlayEl.style.cssText = 'display: flex !important; opacity: 1 !important; visibility: visible !important; z-index: 1000 !important;';
        const modalEl = overlayEl.querySelector('.modal');
        if (modalEl) {
            modalEl.style.cssText = 'display: block !important; opacity: 1 !important; visibility: visible !important; transform: translateY(0) !important;';
        }
    }

    function hideModalOverlay(overlayEl) {
        if (!overlayEl) return;
        document.body.classList.remove('modal-open');
        overlayEl.classList.remove('show');
        overlayEl.style.cssText = '';
        const modalEl = overlayEl.querySelector('.modal');
        if (modalEl) {
            modalEl.style.cssText = '';
        }
    }

    function openCardModalForEdit(schedule) {
        editingScheduleId = schedule.id;
        if (cardModalTitle) cardModalTitle.textContent = '編輯課卡';
        const startDate = normalizeDateStr(schedule.startDate || schedule.date);
        const endDate = normalizeDateStr(schedule.date);

        CustomDatePicker.setValue('card-start-date-trigger', startDate, false);
        CustomDatePicker.setValue('card-end-date-trigger', endDate, false);
        
        safeSetRadioValue('card-type', schedule.type);
        if (schedule.coachLevel) {
            safeSetRadioValue('coach-level', schedule.coachLevel);
        }
        
        updateCardOptions(schedule.price);
        
        if (cardNote) cardNote.value = schedule.note || '';
        renderCardUsageHistory(schedule.id);
        if (cardDeleteBtn) cardDeleteBtn.style.display = 'block';
        showModalOverlay(cardModalOverlay);
    }

    function openModal() {
        showModalOverlay(modalOverlay);
    }

    function closeModal() {
        hideModalOverlay(modalOverlay);
        if (scheduleForm) scheduleForm.reset();
        editingScheduleId = null;
    }

    function openAddModal(prefillDateStr) {
        editingScheduleId = null;
        if (modalTitle) modalTitle.textContent = '新增排程';
        if (deleteBtn) deleteBtn.style.display = 'none';
        if (scheduleForm) scheduleForm.reset();
        
        const now = new Date();
        const dateStr = prefillDateStr || formatLocalDate(now);
        const timeStr = '17:00';
        const defaultEndTime = '18:30';
        
        CustomDatePicker.setValue('schedule-date-trigger', `${dateStr}T${timeStr}`, true, defaultEndTime);
        renderScheduleTypePills();
        populateLinkedCardSelect();
        openModal();
    }

    // ---- 排程類型渲染與控制函數 ----
    function renderScheduleTypePills(selectedTypeName) {
        const typeContainer = document.querySelector('#schedule-form .type-tags');
        if (!typeContainer) return;

        const types = getScheduleTypes();
        let html = '';
        types.forEach((t, idx) => {
            const isChecked = selectedTypeName ? (t.name === selectedTypeName) : (idx === 0);
            html += `
                <label class="type-tag">
                    <input type="radio" name="schedule-type" value="${t.name}" ${isChecked ? 'checked' : ''}>
                    <span style="background-color: ${t.bg}; color: ${t.text};">${t.name}</span>
                </label>
            `;
        });
        html += `
            <button type="button" id="inline-add-type-btn" class="type-tag-add-btn" title="新增排程類型">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            </button>
        `;
        typeContainer.innerHTML = html;

        const inlineAddBtn = document.getElementById('inline-add-type-btn');
        if (inlineAddBtn) {
            inlineAddBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                handleAddNewScheduleType();
            });
        }
    }

    function handleAddNewScheduleType() {
        const newName = prompt('請輸入新增排程類型的名稱 (例如：滑行訓練、重訓)：');
        if (!newName || !newName.trim()) return;
        const cleanName = newName.trim();

        const types = getScheduleTypes();
        if (types.some(t => t.name === cleanName)) {
            alert('該排程類型已經存在！');
            renderScheduleTypePills(cleanName);
            return;
        }

        const morandiColors = [
            { bg: '#b69898', text: '#efead6' },
            { bg: '#836a77', text: '#efdede' },
            { bg: '#eacaca', text: '#836a77' },
            { bg: '#ead1dc', text: '#836a77' },
            { bg: '#c5a6a0', text: '#5e4844' },
            { bg: '#d4b7b1', text: '#69524e' },
            { bg: '#e2c8c3', text: '#78605b' },
            { bg: '#d7c9c9', text: '#715a57' }
        ];
        const color = morandiColors[types.length % morandiColors.length];

        types.push({
            id: 'type_' + Date.now(),
            name: cleanName,
            bg: color.bg,
            text: color.text
        });

        saveScheduleTypes(types);
        renderScheduleTypePills(cleanName);
        if (currentTab === 'settings') {
            renderSettingsScheduleTypes();
        }
        renderView();
    }

    function renderSettingsScheduleTypes() {
        const listContainer = document.getElementById('settings-type-list');
        if (!listContainer) return;

        const types = getScheduleTypes();
        if (types.length === 0) {
            listContainer.innerHTML = '<p style="font-size: 13px; color: var(--text-secondary);">尚無自訂排程類型</p>';
            return;
        }

        let html = '';
        types.forEach(t => {
            const cardBg = getSoftCardBg(t.bg);
            html += `
                <div class="settings-type-item" style="background-color: ${cardBg};">
                    <div class="settings-type-info">
                        <span class="settings-type-badge" style="background-color: ${t.bg}; color: ${t.text};">${t.name}</span>
                    </div>
                    <div class="settings-type-actions">
                        <button type="button" class="settings-type-btn edit-type-btn" data-id="${t.id}" data-name="${t.name}">編輯</button>
                        <button type="button" class="settings-type-btn delete delete-type-btn" data-id="${t.id}" data-name="${t.name}">刪除</button>
                    </div>
                </div>
            `;
        });
        listContainer.innerHTML = html;

        listContainer.querySelectorAll('.edit-type-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const typeId = btn.getAttribute('data-id');
                const oldName = btn.getAttribute('data-name');
                handleEditScheduleType(typeId, oldName);
            });
        });

        listContainer.querySelectorAll('.delete-type-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const typeId = btn.getAttribute('data-id');
                const name = btn.getAttribute('data-name');
                handleDeleteScheduleType(typeId, name);
            });
        });

        const settingsAddTypeBtn = document.getElementById('settings-add-type-btn');
        if (settingsAddTypeBtn && !settingsAddTypeBtn.hasAttribute('data-bound')) {
            settingsAddTypeBtn.setAttribute('data-bound', 'true');
            settingsAddTypeBtn.addEventListener('click', () => {
                handleAddNewScheduleType();
            });
        }
    }

    function handleEditScheduleType(typeId, oldName) {
        const newName = prompt('請輸入修改後的排程類型名稱：', oldName);
        if (!newName || !newName.trim() || newName.trim() === oldName) return;
        const cleanName = newName.trim();

        let types = getScheduleTypes();
        const target = types.find(t => t.id === typeId || t.name === oldName);
        if (target) {
            target.name = cleanName;
            saveScheduleTypes(types);

            schedules.forEach(s => {
                if (s.type === oldName) {
                    s.type = cleanName;
                }
            });
            saveSchedules();

            renderSettingsScheduleTypes();
            renderScheduleTypePills(cleanName);
            renderView();
        }
    }

    function handleDeleteScheduleType(typeId, name) {
        if (!confirm(`確定要刪除「${name}」排程類型嗎？`)) return;

        let types = getScheduleTypes();
        types = types.filter(t => t.id !== typeId && t.name !== name);
        saveScheduleTypes(types);

        renderSettingsScheduleTypes();
        renderScheduleTypePills();
        renderView();
    }

    function openCardModal(prefillDateStr) {
        editingScheduleId = null;
        if (cardModalTitle) cardModalTitle.textContent = '新增課卡';
        if (cardDeleteBtn) cardDeleteBtn.style.display = 'none';
        if (cardForm) cardForm.reset();
        
        const todayStr = prefillDateStr || formatLocalDate(new Date());

        CustomDatePicker.setValue('card-start-date-trigger', todayStr, false);
        CustomDatePicker.setValue('card-end-date-trigger', todayStr, false);
        
        safeSetRadioValue('card-type', '月卡');
        updateCardOptions();
        renderCardUsageHistory(null);
        
        showModalOverlay(cardModalOverlay);
    }

    function toggleAddMenu(e) {
        e.stopPropagation();
        if (!addMenu) return;
        addMenu.classList.toggle('show');
        if (addMenu.classList.contains('show')) {
            if (addMenuOverlay) addMenuOverlay.classList.add('show');
            const targetBtn = e.target.closest('.icon-btn, .fab');
            if (targetBtn) {
                const btnRect = targetBtn.getBoundingClientRect();
                addMenu.style.bottom = 'auto';
                addMenu.style.top = (btnRect.bottom + 8) + 'px';
                addMenu.style.right = '16px';
            }
        } else {
            if (addMenuOverlay) addMenuOverlay.classList.remove('show');
        }
    }

    function closeAddMenu() {
        if (addMenu) addMenu.classList.remove('show');
        if (addMenuOverlay) addMenuOverlay.classList.remove('show');
    }

    if (topAddBtn) topAddBtn.addEventListener('click', toggleAddMenu);
    if (addMenuOverlay) addMenuOverlay.addEventListener('click', closeAddMenu);
    
    if (addCardOpt) {
        addCardOpt.addEventListener('click', (e) => {
            if (e) e.stopPropagation();
            closeAddMenu();
            const dateStr = currentTab === 'day-view' ? formatLocalDate(selectedDayDate) : null;
            openCardModal(dateStr);
        });
    }

    if (addScheduleOpt) {
        addScheduleOpt.addEventListener('click', (e) => {
            if (e) e.stopPropagation();
            closeAddMenu();
            const dateStr = currentTab === 'day-view' ? formatLocalDate(selectedDayDate) : null;
            openAddModal(dateStr);
        });
    }

    function closeShoppingModal() {
        hideModalOverlay(shoppingModalOverlay);
        if (shoppingForm) shoppingForm.reset();
        editingScheduleId = null;
    }

    function openShoppingModal(prefillDateStr) {
        editingScheduleId = null;
        if (shoppingModalTitle) shoppingModalTitle.textContent = '新增購物';
        if (shoppingDeleteBtn) shoppingDeleteBtn.style.display = 'none';
        if (shoppingForm) shoppingForm.reset();
        
        const todayStr = prefillDateStr || formatLocalDate(new Date());
        CustomDatePicker.setValue('shopping-date-trigger', todayStr, false);
        safeSetRadioValue('shopping-type', '冰刀鞋');
        
        showModalOverlay(shoppingModalOverlay);
    }

    function openShoppingModalForEdit(schedule) {
        editingScheduleId = schedule.id;
        if (shoppingModalTitle) shoppingModalTitle.textContent = '編輯購物';
        if (shoppingDeleteBtn) shoppingDeleteBtn.style.display = 'block';
        
        const nameInput = document.getElementById('shopping-name');
        if (nameInput) nameInput.value = schedule.name || schedule.note || '';

        const urlInput = document.getElementById('shopping-url');
        if (urlInput) urlInput.value = schedule.url || '';
        
        const dateStr = normalizeDateStr(schedule.date);
        CustomDatePicker.setValue('shopping-date-trigger', dateStr, false);
        safeSetRadioValue('shopping-type', schedule.type || '冰刀鞋');
        
        const priceInput = document.getElementById('shopping-price');
        if (priceInput) priceInput.value = schedule.price || '';
        
        showModalOverlay(shoppingModalOverlay);
    }

    if (addShoppingOpt) {
        addShoppingOpt.addEventListener('click', (e) => {
            if (e) e.stopPropagation();
            closeAddMenu();
            const dateStr = currentTab === 'day-view' ? formatLocalDate(selectedDayDate) : null;
            openShoppingModal(dateStr);
        });
    }

    function closeOtherModal() {
        hideModalOverlay(otherModalOverlay);
        if (otherForm) otherForm.reset();
        editingScheduleId = null;
    }

    function openOtherModal(prefillDateStr) {
        editingScheduleId = null;
        if (otherModalTitle) otherModalTitle.textContent = '新增其他行程';
        if (otherDeleteBtn) otherDeleteBtn.style.display = 'none';
        if (otherForm) otherForm.reset();
        
        const todayStr = prefillDateStr || formatLocalDate(new Date());
        CustomDatePicker.setValue('other-start-date-trigger', todayStr, false);
        CustomDatePicker.setValue('other-end-date-trigger', todayStr, false);
        safeSetRadioValue('other-type', '比賽');
        
        showModalOverlay(otherModalOverlay);
    }

    function openOtherModalForEdit(schedule) {
        editingScheduleId = schedule.id;
        if (otherModalTitle) otherModalTitle.textContent = '編輯其他行程';
        if (otherDeleteBtn) otherDeleteBtn.style.display = 'block';
        
        const nameInput = document.getElementById('other-name');
        if (nameInput) nameInput.value = schedule.name || schedule.title || '';
        
        const startStr = normalizeDateStr(schedule.startDate || schedule.date);
        const endStr = normalizeDateStr(schedule.endDate || schedule.date);
        
        CustomDatePicker.setValue('other-start-date-trigger', startStr, false);
        CustomDatePicker.setValue('other-end-date-trigger', endStr, false);
        
        safeSetRadioValue('other-type', schedule.type || '比賽');
        
        const noteInput = document.getElementById('other-note');
        if (noteInput) noteInput.value = schedule.note || '';
        
        showModalOverlay(otherModalOverlay);
    }

    if (addOtherOpt) {
        addOtherOpt.addEventListener('click', (e) => {
            if (e) e.stopPropagation();
            closeAddMenu();
            const dateStr = currentTab === 'day-view' ? formatLocalDate(selectedDayDate) : null;
            openOtherModal(dateStr);
        });
    }
    
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
    if (modalOverlay) {
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) closeModal();
        });
    }

    // 搜尋邏輯
    function openSearchModal() {
        document.body.classList.add('modal-open');
        if (searchInput) searchInput.value = '';
        if (searchResults) searchResults.innerHTML = '';
        if (searchOverlay) searchOverlay.classList.add('show');
        if (searchInput) searchInput.focus();
    }

    function closeSearchModal() {
        document.body.classList.remove('modal-open');
        if (searchOverlay) searchOverlay.classList.remove('show');
    }

    if (searchBtn) searchBtn.addEventListener('click', openSearchModal);
    if (closeSearchBtn) closeSearchBtn.addEventListener('click', closeSearchModal);
    if (searchOverlay) {
        searchOverlay.addEventListener('click', (e) => {
            if (e.target === searchOverlay) closeSearchModal();
        });
    }

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const keyword = e.target.value.toLowerCase().trim();
            searchResults.innerHTML = '';
            
            if (!keyword) return;

            const filtered = schedules.filter(s => {
                const searchTarget = [
                    s.type,
                    s.displayTitle,
                    s.note,
                    s.date,
                    s.coachLevel,
                    s.price
                ].filter(Boolean).join(' ').toLowerCase();
                return searchTarget.includes(keyword);
            });

            if (filtered.length === 0) {
                searchResults.innerHTML = '<div style="color: var(--text-secondary); text-align: center; padding: 10px;">找不到相符的排程</div>';
                return;
            }

            filtered.forEach(schedule => {
                const item = document.createElement('div');
                item.style.padding = '8px';
                item.style.borderBottom = '1px solid var(--border-color)';
                item.style.cursor = 'pointer';
                
                const typeSpan = document.createElement('span');
                typeSpan.textContent = schedule.displayTitle || schedule.type;
                typeSpan.style.display = 'inline-block';
                typeSpan.style.padding = '2px 6px';
                typeSpan.style.borderRadius = '4px';
                typeSpan.style.fontSize = '12px';
                typeSpan.style.marginRight = '8px';
                
                const colors = typeColors[schedule.type] || defaultTypeColor;
                typeSpan.style.backgroundColor = colors.bg;
                typeSpan.style.color = colors.text;
                
                const infoSpan = document.createElement('span');
                infoSpan.style.fontSize = '14px';
                infoSpan.style.color = 'var(--text-primary)';
                const timeStr = schedule.time ? ` ${schedule.time}` : '';
                const displayDate = schedule.date ? normalizeDateStr(schedule.date) : '';
                let extraInfo = '';
                
                if (schedule.isCard && CARD_RULES[schedule.type]) {
                    const rule = CARD_RULES[schedule.type];
                    const usage = getCardUsage(schedule.id);
                    const isInfinite = rule.maxClasses === Infinity || rule.maxPractices === Infinity;
                    if (!isInfinite) {
                        extraInfo = ` [使用: ${usage.classes}/${rule.maxClasses}課, ${usage.practices}/${rule.maxPractices}練]`;
                    } else {
                        extraInfo = ` [無限使用]`;
                    }
                } else if (!schedule.isCard && schedule.linkedCardId) {
                    const linkedCard = schedules.find(s => String(s.id) === String(schedule.linkedCardId));
                    if (linkedCard) {
                        extraInfo = ` (扣抵: ${linkedCard.displayTitle || linkedCard.type})`;
                    }
                }
                
                infoSpan.textContent = `${displayDate}${timeStr} - ${schedule.note || '無備註'}${extraInfo}`;

                item.appendChild(typeSpan);
                item.appendChild(infoSpan);
                
                item.addEventListener('click', () => {
                    closeSearchModal();
                    editingScheduleId = schedule.id;
                    if (schedule.isCard) {
                        openCardModalForEdit(schedule);
                    } else if (schedule.isShopping) {
                        openShoppingModalForEdit(schedule);
                    } else {
                        openScheduleModalForEdit(schedule);
                    }
                });
                
                searchResults.appendChild(item);
            });
        });
    }

    // AI 聊天
    const aiChatWindow = document.getElementById('ai-chat-window');
    const closeAiChatBtn = document.getElementById('close-ai-chat');
    const aiChatMessages = document.getElementById('ai-chat-messages');
    const aiChatInput = document.getElementById('ai-chat-input');
    const aiSendBtn = document.getElementById('ai-send-btn');

    function toggleAiChat() {
        aiChatWindow.classList.toggle('show');
        if (aiChatWindow.classList.contains('show')) {
            aiChatInput.focus();
        }
    }

    if (aiBtn) aiBtn.addEventListener('click', toggleAiChat);
    if (closeAiChatBtn) closeAiChatBtn.addEventListener('click', toggleAiChat);

    function getAiResponse(userText) {
        const text = userText.toLowerCase();
        const currentYear = currentDate.getFullYear();
        const currentMonth = currentDate.getMonth() + 1;
        
        const thisMonthSchedules = schedules.filter(s => {
            if (!s.date) return false;
            const normDate = normalizeDateStr(s.date);
            const parts = normDate.split('/');
            return parseInt(parts[0], 10) === currentYear && parseInt(parts[1], 10) === currentMonth;
        });

        const activeCards = schedules.filter(s => s.isCard);

        if (text.includes('統計') || text.includes('幾堂') || text.includes('運動量') || text.includes('紀錄')) {
            const normalCount = thisMonthSchedules.filter(s => !s.isCard).length;
            return `本月 (${currentYear}年${currentMonth}月) 您共有 ${normalCount} 堂運動課程與 ${thisMonthSchedules.length - normalCount} 張課卡到期提醒。繼續加油！`;
        } else if (text.includes('課卡') || text.includes('到期') || text.includes('卡片')) {
            if (activeCards.length === 0) {
                return '目前沒有登記任何課卡到期資訊。您可以點選右上角「+」新增課卡喔！';
            }
            const cardDetails = activeCards.map(c => `• ${c.displayTitle || c.type}: ${normalizeDateStr(c.date)} 到期`).join('\n');
            return `目前記錄中的課卡到期日：\n${cardDetails}`;
        } else if (text.includes('建議') || text.includes('訓練') || text.includes('熱身')) {
            return '運動前建議進行 10 分鐘動態熱身，訓練後記得加強大腿與後背伸展以促進恢復喔！';
        } else if (text.includes('你好') || text.includes('哈囉') || text.includes('hi') || text.includes('hello')) {
            return '您好！我是 Gemini AI 運動助理。您可以向我詢問「本月運動統計」、「課卡到期日」或「訓練建議」！';
        } else {
            return `收到您的詢問：「${userText}」。您目前共存有 ${schedules.length} 筆資料。若需要查詢課卡或統計數據，隨時告訴我！`;
        }
    }

    function sendAiMessage() {
        const text = aiChatInput.value.trim();
        if (!text) return;

        const userMsg = document.createElement('div');
        userMsg.className = 'chat-bubble user';
        userMsg.textContent = text;
        aiChatMessages.appendChild(userMsg);
        
        aiChatInput.value = '';
        aiChatMessages.scrollTop = aiChatMessages.scrollHeight;

        setTimeout(() => {
            const aiMsg = document.createElement('div');
            aiMsg.className = 'chat-bubble ai';
            aiMsg.style.whiteSpace = 'pre-line';
            aiMsg.textContent = getAiResponse(text);
            aiChatMessages.appendChild(aiMsg);
            aiChatMessages.scrollTop = aiChatMessages.scrollHeight;
        }, 400);
    }

    if (aiSendBtn) aiSendBtn.addEventListener('click', sendAiMessage);
    if (aiChatInput) {
        aiChatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendAiMessage();
        });
    }

    function initCustomSelect(triggerId, menuId, wrapperId, hiddenInputId, displaySpanId, onChangeCallback) {
        const trigger = document.getElementById(triggerId);
        const menuEl = document.getElementById(menuId);
        const wrapper = document.getElementById(wrapperId);
        const hiddenInput = document.getElementById(hiddenInputId);
        const displaySpan = document.getElementById(displaySpanId);

        if (!trigger || !menuEl) return;

        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            document.querySelectorAll('.custom-select-menu.show').forEach(m => {
                if (m !== menuEl) m.classList.remove('show');
            });
            document.querySelectorAll('.custom-select-wrapper.open').forEach(w => {
                if (w !== wrapper) w.classList.remove('open');
            });

            const isOpen = menuEl.classList.contains('show');
            if (isOpen) {
                menuEl.classList.remove('show');
                if (wrapper) wrapper.classList.remove('open');
            } else {
                menuEl.classList.add('show');
                if (wrapper) wrapper.classList.add('open');
            }
        });

        const options = menuEl.querySelectorAll('.custom-select-option');
        options.forEach(opt => {
            opt.addEventListener('click', (e) => {
                e.stopPropagation();
                const val = opt.dataset.value;
                if (hiddenInput) hiddenInput.value = val;
                if (displaySpan) displaySpan.textContent = val;
                
                options.forEach(o => o.classList.remove('selected'));
                opt.classList.add('selected');

                if (menuEl) menuEl.classList.remove('show');
                if (wrapper) wrapper.classList.remove('open');

                if (typeof onChangeCallback === 'function') {
                    onChangeCallback(val);
                }
            });
        });

        document.addEventListener('click', (e) => {
            if (wrapper && !e.target.closest(`#${wrapperId}`)) {
                if (menuEl) menuEl.classList.remove('show');
                if (wrapper) wrapper.classList.remove('open');
            }
        });
    }

    initCustomSelect('card-type-trigger', 'card-type-menu', 'card-type-wrapper', 'card-type-select', 'card-type-display', () => {
        updateCardOptions();
    });

    initCustomSelect('coach-level-trigger', 'coach-level-menu', 'coach-level-wrapper', 'coach-level-select', 'coach-level-display', () => {
        updateCardOptions();
    });

    const cardPriceTrigger = document.getElementById('card-price-trigger');
    const cardPriceMenu = document.getElementById('card-price-menu');
    const cardPriceWrapper = document.getElementById('card-price-wrapper');

    if (cardPriceTrigger && cardPriceMenu) {
        cardPriceTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = cardPriceMenu.classList.contains('show');
            if (isOpen) {
                cardPriceMenu.classList.remove('show');
                if (cardPriceWrapper) cardPriceWrapper.classList.remove('open');
            } else {
                cardPriceMenu.classList.add('show');
                if (cardPriceWrapper) cardPriceWrapper.classList.add('open');
            }
        });
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#card-price-wrapper')) {
                if (cardPriceMenu) cardPriceMenu.classList.remove('show');
                if (cardPriceWrapper) cardPriceWrapper.classList.remove('open');
            }
        });
    }

    function addDaysSafely(startDateStr, daysToAdd) {
        const d = parseLocalDate(startDateStr);
        d.setDate(d.getDate() + daysToAdd);
        return formatLocalDate(d);
    }

    function hasActiveMonthlyCard(dateStr) {
        if (!dateStr) return false;
        const targetDate = normalizeDateStr(dateStr);
        return schedules.some(s => {
            if (!s.isCard) return false;
            const rule = getCardRule(s);
            if (!rule || !rule.isMonthly) return false;
            const start = normalizeDateStr(s.startDate || s.date);
            const end = normalizeDateStr(s.date);
            return targetDate >= start && targetDate <= end;
        });
    }

    function updateCardOptions(preferredPrice = null) {
        const type = safeGetRadioValue('card-type');
        if (!type) return;

        let prices = [];
        if (type.startsWith('私人課卡')) {
            if (coachLevelGroup) coachLevelGroup.style.display = 'block';
            let coach = safeGetRadioValue('coach-level');
            if (!coach) {
                safeSetRadioValue('coach-level', '一般');
                coach = safeGetRadioValue('coach-level');
            }
            prices = (cardPrices[type] && cardPrices[type][coach]) ? cardPrices[type][coach] : [];
        } else {
            if (coachLevelGroup) coachLevelGroup.style.display = 'none';
            prices = cardPrices[type] || [];
        }

        const startDateVal = document.getElementById('card-start-date')?.value || '';

        let shouldDiscount = false;
        if (type.startsWith('私人課卡') && startDateVal) {
            shouldDiscount = hasActiveMonthlyCard(startDateVal);
        }

        if (shouldDiscount) {
            prices = prices.map(pStr => {
                return pStr.replace(/[\d,]+/, match => {
                    const num = parseInt(match.replace(/,/g, ''), 10);
                    const discounted = Math.round(num * 0.8);
                    return discounted.toLocaleString('en-US');
                });
            });
        }
        
        if (type === '單次入場') {
            const isHoliday = isHolidayDate(startDateVal);
            const defaultPrice = isHoliday ? '220(假日)' : '200(平日)';
            if (!preferredPrice) {
                preferredPrice = defaultPrice;
            }
            const endDateInput = document.getElementById('card-end-date');
            if (startDateVal && endDateInput && (!endDateInput.value || endDateInput.value !== startDateVal)) {
                CustomDatePicker.setValue('card-end-date-trigger', startDateVal, false);
            }
        } else if (startDateVal && CARD_RULES[type]) {
            const rule = CARD_RULES[type];
            const endStr = rule.durationMonths 
                ? addDaysSafely(addMonthsSafely(startDateVal, rule.durationMonths), -1)
                : addDaysSafely(startDateVal, rule.durationDays - 1);
            
            const currentEnd = document.getElementById('card-end-date')?.value || '';
            if (currentEnd !== endStr) {
                CustomDatePicker.setValue('card-end-date-trigger', endStr, false);
            }
        }

        const priceMenu = document.getElementById('card-price-menu');
        const priceInput = document.getElementById('card-price-select');
        const priceDisplay = document.getElementById('card-price-display');

        if (priceMenu) {
            priceMenu.innerHTML = '';
            let selectedPrice = '';

            prices.forEach((p, index) => {
                const opt = document.createElement('div');
                opt.className = 'custom-select-option';
                opt.dataset.value = p;
                opt.textContent = p;

                const isSelected = preferredPrice 
                    ? (p === preferredPrice || parseCleanPrice(p) === parseCleanPrice(preferredPrice)) 
                    : (index === 0);

                if (isSelected) {
                    opt.classList.add('selected');
                    selectedPrice = p;
                }

                opt.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (priceInput) priceInput.value = p;
                    if (priceDisplay) priceDisplay.textContent = p;
                    
                    priceMenu.querySelectorAll('.custom-select-option').forEach(o => o.classList.remove('selected'));
                    opt.classList.add('selected');

                    if (priceMenu) priceMenu.classList.remove('show');
                    if (cardPriceWrapper) cardPriceWrapper.classList.remove('open');
                });

                priceMenu.appendChild(opt);
            });

            if (selectedPrice) {
                if (priceInput) priceInput.value = selectedPrice;
                if (priceDisplay) priceDisplay.textContent = selectedPrice;
            } else if (prices.length > 0) {
                if (priceInput) priceInput.value = prices[0];
                if (priceDisplay) priceDisplay.textContent = prices[0];
            } else {
                if (priceInput) priceInput.value = '';
                if (priceDisplay) priceDisplay.textContent = '請選擇價格';
            }
        }
    }

    function closeCardModal() {
        if (cardModalOverlay) {
            cardModalOverlay.classList.remove('show');
            cardModalOverlay.style.cssText = '';
        }
        const modalEl = cardModalOverlay ? cardModalOverlay.querySelector('.modal') : null;
        if (modalEl) {
            modalEl.style.cssText = '';
        }
        if (cardForm) cardForm.reset();
        updateCardOptions();
        editingScheduleId = null;
    }

    if (cardCancelBtn) cardCancelBtn.addEventListener('click', closeCardModal);
    if (cardModalOverlay) {
        cardModalOverlay.addEventListener('click', (e) => {
            if (e.target === cardModalOverlay) closeCardModal();
        });
    }

    if (cardForm) {
        cardForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const cardType = safeGetRadioValue('card-type');
            const startDate = document.getElementById('card-start-date').value;
            const endDate = document.getElementById('card-end-date').value;
            const note = cardNote.value;

            const normalizedStartDate = normalizeDateStr(startDate);
            const normalizedEndDate = normalizeDateStr(endDate);
            
            if (!normalizedEndDate) {
                alert('請選擇有效的課卡到期日期');
                return;
            }

            let coachLevel = '';
            if (cardType.startsWith('私人課卡')) {
                coachLevel = safeGetRadioValue('coach-level');
            }
            const price = safeGetRadioValue('card-price');

            let displayTitle = cardType;
            if (cardType === '月卡' && price) {
                displayTitle = `月卡 ${price}`;
            }

            if (editingScheduleId) {
                const scheduleIndex = schedules.findIndex(s => String(s.id) === String(editingScheduleId));
                if (scheduleIndex > -1) {
                    schedules[scheduleIndex].date = normalizedEndDate;
                    schedules[scheduleIndex].startDate = normalizedStartDate || normalizedEndDate;
                    schedules[scheduleIndex].type = cardType;
                    schedules[scheduleIndex].displayTitle = displayTitle;
                    schedules[scheduleIndex].coachLevel = coachLevel;
                    schedules[scheduleIndex].price = price;
                    schedules[scheduleIndex].note = note;
                    schedules[scheduleIndex].isCard = true;
                    schedules[scheduleIndex].time = '';
                } else {
                    schedules.push({
                        id: generateUniqueId(),
                        date: normalizedEndDate,
                        startDate: normalizedStartDate || normalizedEndDate,
                        type: cardType,
                        displayTitle: displayTitle,
                        coachLevel: coachLevel,
                        price: price,
                        note: note,
                        isCard: true,
                        time: ''
                    });
                }
            } else {
                const newCard = {
                    id: generateUniqueId(),
                    date: normalizedEndDate,
                    startDate: normalizedStartDate || normalizedEndDate,
                    type: cardType,
                    displayTitle: displayTitle,
                    coachLevel: coachLevel,
                    price: price,
                    note: note,
                    isCard: true,
                    time: ''
                };
                schedules.push(newCard);
            }

            saveSchedules(schedules);
            if (normalizedEndDate) {
                currentDate = parseLocalDate(normalizedEndDate);
            }
            renderView();
            closeCardModal();
        });
    }

    if (cardDeleteBtn) {
        cardDeleteBtn.addEventListener('click', () => {
            if (editingScheduleId) {
                const deletedCardId = String(editingScheduleId);
                schedules = schedules.filter(s => String(s.id) !== deletedCardId);
                // 同步清除所有引用此課卡的排程中的 linkedCardId
                schedules.forEach(s => {
                    if (String(s.linkedCardId) === deletedCardId) {
                        s.linkedCardId = '';
                    }
                });
                saveSchedules(schedules);
                renderView();
                closeCardModal();
            }
        });
    }

    if (shoppingForm) {
        shoppingForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const name = document.getElementById('shopping-name').value;
            const url = document.getElementById('shopping-url') ? document.getElementById('shopping-url').value : '';
            const dateVal = document.getElementById('shopping-date').value;
            const type = safeGetRadioValue('shopping-type');
            const price = document.getElementById('shopping-price').value;
            const normalizedDate = normalizeDateStr(dateVal);

            if (!normalizedDate) {
                alert('請選擇有效的日期');
                return;
            }

            if (editingScheduleId) {
                const index = schedules.findIndex(s => String(s.id) === String(editingScheduleId));
                if (index > -1) {
                    schedules[index].date = normalizedDate;
                    schedules[index].name = name;
                    schedules[index].url = url;
                    schedules[index].type = type;
                    schedules[index].price = price;
                    schedules[index].note = name;
                    schedules[index].isShopping = true;
                    schedules[index].displayTitle = `購物 · ${name}`;
                }
            } else {
                const newShopping = {
                    id: generateUniqueId(),
                    date: normalizedDate,
                    name: name,
                    url: url,
                    type: type,
                    price: price,
                    note: name,
                    isShopping: true,
                    displayTitle: `購物 · ${name}`
                };
                schedules.push(newShopping);
            }

            saveSchedules(schedules);
            if (normalizedDate) currentDate = parseLocalDate(normalizedDate);
            renderView();
            closeShoppingModal();
        });
    }

    if (shoppingCancelBtn) shoppingCancelBtn.addEventListener('click', closeShoppingModal);
    if (shoppingDeleteBtn) {
        shoppingDeleteBtn.addEventListener('click', () => {
            if (editingScheduleId) {
                schedules = schedules.filter(s => String(s.id) !== String(editingScheduleId));
                saveSchedules(schedules);
                renderView();
                closeShoppingModal();
            }
        });
    }
    if (shoppingModalOverlay) {
        shoppingModalOverlay.addEventListener('click', (e) => {
            if (e.target === shoppingModalOverlay) closeShoppingModal();
        });
    }

    if (otherForm) {
        otherForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const name = document.getElementById('other-name').value;
            const startVal = document.getElementById('other-start-date').value;
            const endVal = document.getElementById('other-end-date').value;
            const type = safeGetRadioValue('other-type');
            const note = document.getElementById('other-note').value;
            
            const normalizedStart = normalizeDateStr(startVal);
            const normalizedEnd = normalizeDateStr(endVal);

            if (!normalizedStart || !normalizedEnd) {
                alert('請選擇有效的日期');
                return;
            }

            if (normalizedEnd < normalizedStart) {
                alert('結束日期不能早於開始日期');
                return;
            }

            if (editingScheduleId) {
                const index = schedules.findIndex(s => String(s.id) === String(editingScheduleId));
                if (index > -1) {
                    schedules[index].startDate = normalizedStart;
                    schedules[index].endDate = normalizedEnd;
                    schedules[index].date = normalizedEnd; // Keep date for compatibility if needed, or simply let getScheduleMatchOnDate handle it
                    delete schedules[index].time; // Remove time
                    schedules[index].title = name;
                    schedules[index].type = type;
                    schedules[index].note = note;
                    schedules[index].isOther = true;
                }
            } else {
                const newOther = {
                    id: generateUniqueId(),
                    startDate: normalizedStart,
                    endDate: normalizedEnd,
                    date: normalizedEnd,
                    title: name,
                    type: type,
                    note: note,
                    isOther: true
                };
                schedules.push(newOther);
            }

            saveSchedules(schedules);
            if (normalizedStart) currentDate = parseLocalDate(normalizedStart);
            renderView();
            closeOtherModal();
        });
    }

    if (otherCancelBtn) otherCancelBtn.addEventListener('click', closeOtherModal);
    if (otherDeleteBtn) {
        otherDeleteBtn.addEventListener('click', () => {
            if (editingScheduleId) {
                schedules = schedules.filter(s => String(s.id) !== String(editingScheduleId));
                saveSchedules(schedules);
                renderView();
                closeOtherModal();
            }
        });
    }
    if (otherModalOverlay) {
        otherModalOverlay.addEventListener('click', (e) => {
            if (e.target === otherModalOverlay) closeOtherModal();
        });
    }

    if (scheduleForm) {
        scheduleForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const hiddenInput = document.getElementById('schedule-date');
            const datetimeVal = hiddenInput ? hiddenInput.value : '';
            const endTimeVal = hiddenInput ? hiddenInput.dataset.endtime || '' : '';
            let datePart = datetimeVal;
            let timePart = '';
            if (datetimeVal.includes('T')) {
                [datePart, timePart] = datetimeVal.split('T');
            }
            const scheduleType = safeGetRadioValue('schedule-type');
            const noteVal = document.getElementById('schedule-note').value;
            const linkedCardId = document.getElementById('linked-card-select').value;
            const normalizedDate = normalizeDateStr(datePart);

            if (!normalizedDate) {
                alert('請選擇有效的排程日期');
                return;
            }
            
            if (editingScheduleId) {
                const scheduleIndex = schedules.findIndex(s => String(s.id) === String(editingScheduleId));
                if (scheduleIndex > -1) {
                    schedules[scheduleIndex].date = normalizedDate;
                    schedules[scheduleIndex].time = timePart || '';
                    schedules[scheduleIndex].endTime = endTimeVal;
                    schedules[scheduleIndex].type = scheduleType;
                    schedules[scheduleIndex].note = noteVal;
                    schedules[scheduleIndex].linkedCardId = linkedCardId;
                } else {
                    schedules.push({
                        id: generateUniqueId(),
                        date: normalizedDate,
                        time: timePart || '',
                        endTime: endTimeVal,
                        type: scheduleType,
                        note: noteVal,
                        linkedCardId: linkedCardId,
                        isCard: false
                    });
                }
            } else {
                const newSchedule = {
                    id: generateUniqueId(),
                    date: normalizedDate,
                    time: timePart || '',
                    endTime: endTimeVal,
                    type: scheduleType,
                    note: noteVal,
                    linkedCardId: linkedCardId,
                    isCard: false
                };
                schedules.push(newSchedule);
            }

            saveSchedules(schedules);
            if (normalizedDate) {
                currentDate = parseLocalDate(normalizedDate);
            }
            renderView();
            closeModal();
        });
    }
    
    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
            if (editingScheduleId) {
                schedules = schedules.filter(s => String(s.id) !== String(editingScheduleId));
                saveSchedules(schedules);
                renderView();
                closeModal();
            }
        });
    }
    // ---- 統計儀表板 Dashboard 計算與動態圖表渲染邏輯 ----
    let statsCurrentMonthDate = new Date(currentDate);

    function calculateScheduleHours(schedule) {
        if (!schedule.time) return 1.5;
        const [sh, sm] = schedule.time.split(':').map(Number);
        const startMin = sh * 60 + sm;

        if (schedule.endTime) {
            const [eh, em] = schedule.endTime.split(':').map(Number);
            const endMin = eh * 60 + em;
            if (endMin > startMin) {
                return parseFloat(((endMin - startMin) / 60).toFixed(1));
            }
        }
        return 1.5;
    }

    function parseCleanPrice(val) {
        if (typeof val === 'number') return val;
        if (!val || typeof val !== 'string') return 0;
        const pricePart = val.split('(')[0];
        const clean = pricePart.replace(/,/g, '').replace(/[^0-9.]/g, '');
        return parseFloat(clean) || 0;
    }

    function getDefaultCost(schedule) {
        if (!schedule) return 0;
        if (schedule.linkedCardId) {
            const linkedCard = schedules.find(c => String(c.id) === String(schedule.linkedCardId));
            if (linkedCard) {
                const price = parseCleanPrice(linkedCard.price);
                if (price > 0) {
                    const rule = getCardRule(linkedCard);
                    if (rule) {
                        const maxQuota = rule.maxClasses + rule.maxPractices;
                        if (maxQuota > 0 && maxQuota !== Infinity) {
                            return Math.round(price / maxQuota);
                        }
                    }
                    const usage = getCardUsage(linkedCard.id);
                    const totalUsed = usage.classes + usage.practices;
                    if (totalUsed > 0) {
                        return Math.round(price / totalUsed);
                    }
                }
            }
        } else if (schedule.type === '單次入場') {
            const isHoliday = isHolidayDate(schedule.date);
            return isHoliday ? 220 : 200;
        }
        return 0;
    }

    function getPassCoveredMonths(pass) {
        const startStr = normalizeDateStr(pass.startDate || pass.date);
        const endStr = normalizeDateStr(pass.date);
        if (!startStr) return [];
        
        const startD = parseLocalDate(startStr);
        const endD = endStr ? parseLocalDate(endStr) : parseLocalDate(startStr);
        
        const startY = startD.getFullYear();
        const startM = startD.getMonth();
        
        const endY = endD.getFullYear();
        const endM = endD.getMonth();
        
        const totalMonths = (endY - startY) * 12 + (endM - startM);
        const count = totalMonths > 0 ? totalMonths : 1;
        
        const months = [];
        for (let i = 0; i < count; i++) {
            const d = new Date(startY, startM + i, 1);
            months.push(`${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`);
        }
        return months;
    }



    function renderDayView() {
        const dayViewList = document.getElementById('day-view-list');
        if (!dayViewList) return;
        
        dayViewList.innerHTML = '';
        const dayStr = formatLocalDate(selectedDayDate);
        
        let dayItems = [];
        schedules.forEach(schedule => {
            const match = getScheduleMatchOnDate(schedule, dayStr);
            if (match.matched) {
                dayItems.push(schedule);
            }
        });

        if (dayItems.length === 0) {
            dayViewList.innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 20px; font-size: 13px;">當日尚無排程或活動</div>';
            return;
        }

        let regularSchedules = [];
        let cardSchedules = [];
        let shoppingSchedules = [];
        let otherSchedules = [];

        dayItems.forEach(item => {
            if (item.isCard) cardSchedules.push(item);
            else if (item.isShopping) shoppingSchedules.push(item);
            else if (item.isOther) otherSchedules.push(item);
            else regularSchedules.push(item);
        });

        const typesCount = (regularSchedules.length > 0 ? 1 : 0) +
                           (cardSchedules.length > 0 ? 1 : 0) +
                           (shoppingSchedules.length > 0 ? 1 : 0) +
                           (otherSchedules.length > 0 ? 1 : 0);
        const showHeaders = typesCount > 1;

        const renderGroup = (title, items) => {
            if (items.length === 0) return;
            
            // 排序：無時間的排最前面，有時間的依時間排序
            items.sort((a, b) => {
                const timeA = a.time || '';
                const timeB = b.time || '';
                if (!timeA && timeB) return -1;
                if (timeA && !timeB) return 1;
                return timeA.localeCompare(timeB);
            });

            if (showHeaders) {
                const header = document.createElement('h4');
                header.textContent = title;
                header.style.margin = '15px 0 10px 0';
                header.style.color = 'var(--text-secondary)';
                header.style.fontSize = '14px';
                header.style.borderBottom = '1px solid var(--border-color)';
                header.style.paddingBottom = '5px';
                dayViewList.appendChild(header);
            }

            items.forEach(item => {
                const colors = typeColors[item.type] || defaultTypeColor;
                const row = document.createElement('div');
                row.className = 'stats-log-item';
                row.style.cursor = 'pointer';
                if (colors.cardBg) row.style.backgroundColor = colors.cardBg;

                let titleHtml = '';
                let subtitleHtml = '';
                let rightSideHtml = '';

                if (item.isCard) {
                    const price = parseCleanPrice(item.price);
                    titleHtml = `購課：${item.type}`;
                    subtitleHtml = item.note || '購課紀錄';
                    rightSideHtml = `<div style="font-weight: 700; font-size: 16px; color: #715a57;">NT$ ${price.toLocaleString()}</div>`;
                } else if (item.isShopping) {
                    const price = parseCleanPrice(item.price);
                    titleHtml = `購物：${item.type}`;
                    subtitleHtml = item.name || item.note || '購物紀錄';
                    rightSideHtml = `<div style="font-weight: 700; font-size: 16px; color: #715a57;">NT$ ${price.toLocaleString()}</div>`;
                    if (item.url) {
                        const linkIcon = `<a href="${item.url}" target="_blank" onclick="event.stopPropagation();" style="display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; background: rgba(113, 90, 87, 0.1); border-radius: 50%; color: #715a57; text-decoration: none; margin-left: 8px;" title="開啟連結"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg></a>`;
                        rightSideHtml = `<div style="display: flex; align-items: center;">${rightSideHtml}${linkIcon}</div>`;
                    }
                } else {
                    const hrs = calculateScheduleHours(item);
                    const cost = getDefaultCost(item);
                    const timeRange = item.time ? (item.endTime ? `${item.time}~${item.endTime}` : item.time) : '全天';
                    
                    titleHtml = `${item.title || item.type} ${timeRange}`;
                    subtitleHtml = `${item.note || '無備註'} (${hrs.toFixed(1)}h)`;
                    rightSideHtml = `<div style="font-weight: 700; font-size: 15px; color: #715a57;">NT$ ${cost.toLocaleString()}</div>`;
                }

                row.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 10px; flex: 1;">
                        <span style="background-color: ${colors.bg}; color: ${colors.text}; padding: 5px 14px; border-radius: 9999px; font-size: 13px; font-weight: 600; flex-shrink: 0;">${item.type}</span>
                        <div>
                            <div style="font-weight: 700; font-size: 15px;">${titleHtml}</div>
                            <div style="font-size: 13px; color: var(--text-secondary); margin-top: 2px;">${subtitleHtml}</div>
                        </div>
                    </div>
                    ${rightSideHtml}
                `;

                row.addEventListener('click', () => {
                    editingScheduleId = item.id;
                    if (item.isCard) {
                        openCardModalForEdit(item);
                    } else if (item.isShopping) {
                        openShoppingModalForEdit(item);
                    } else if (item.isOther) {
                        openOtherModalForEdit(item);
                    } else {
                        openScheduleModalForEdit(item);
                    }
                });

                dayViewList.appendChild(row);
            });
        };

        renderGroup('排程', regularSchedules);
        renderGroup('課卡', cardSchedules);
        renderGroup('購物', shoppingSchedules);
        renderGroup('其他', otherSchedules);
    }

    function setupBreakdownModal(elementId, titleText, dataArray, totalText) {
        const el = document.getElementById(elementId);
        if (!el) return;
        
        el.onclick = () => {
            const modal = document.getElementById('breakdown-modal-overlay');
            const titleEl = document.getElementById('breakdown-modal-title');
            const listContainer = document.getElementById('breakdown-list');
            const totalDisplay = document.getElementById('breakdown-total');
            if (!modal || !listContainer) return;

            if (titleEl) titleEl.textContent = titleText;
            listContainer.innerHTML = '';
            
            if (dataArray.length === 0) {
                listContainer.innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 20px;">無明細資料</div>';
            } else {
                const sortedData = [...dataArray].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
                
                sortedData.forEach(item => {
                    const usageText = item.usedClasses ? `扣除 ${item.usedClasses} 堂` : item.date;
                    listContainer.innerHTML += `
                        <div style="background-color: var(--card-bg); padding: 12px; border-radius: 12px; margin-bottom: 10px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                                <div style="font-weight: 600; font-size: 14px; color: var(--text-main);">${item.title}</div>
                                <div style="font-weight: 700; font-size: 16px; color: #715a57;">${item.valText}</div>
                            </div>
                            <div style="display: flex; justify-content: space-between; font-size: 13px; color: var(--text-secondary);">
                                <span>${item.ruleText}</span>
                                <span>${usageText}</span>
                            </div>
                        </div>
                    `;
                });
            }
            
            if (totalDisplay) {
                totalDisplay.textContent = totalText;
            }
            
            modal.classList.add('show');
        };
    }

    function renderStatsDashboard() {
        const statsMonthLabel = document.getElementById('stats-month-label');
        const metricSessions = document.getElementById('metric-sessions');
        const metricSessionsSub = document.getElementById('metric-sessions-sub');
        const metricHours = document.getElementById('metric-hours');
        const metricHoursSub = document.getElementById('metric-hours-sub');
        const metricCost = document.getElementById('metric-cost');
        const metricCostSub = document.getElementById('metric-cost-sub');
        const metricShoppingCost = document.getElementById('metric-shopping-cost');
        const metricShoppingCostSub = document.getElementById('metric-shopping-cost-sub');
        const monthlyBarChart = document.getElementById('monthly-bar-chart');
        const typeDonutChart = document.getElementById('type-donut-chart');
        const statsLogList = document.getElementById('stats-log-list');
        const statsCardList = document.getElementById('stats-card-list');
        const statsShoppingList = document.getElementById('stats-shopping-list');

        const monthNamesFull = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        const year = statsCurrentMonthDate.getFullYear();
        const month = statsCurrentMonthDate.getMonth();
        const currentMonthStr = `${year}/${String(month + 1).padStart(2, '0')}`;

        if (statsMonthLabel) {
            statsMonthLabel.textContent = `${monthNamesFull[month]} ${year}`;
        }

        const monthSchedules = schedules.filter(s => {
            if (s.isCard || s.isOther || s.isShopping) return false;
            const normDate = normalizeDateStr(s.date);
            return normDate && normDate.startsWith(currentMonthStr);
        });

        // 計算當月堂數 / 練習
        const sessionsBreakdown = [];
        const groupClass = monthSchedules.filter(s => s.type === '花滑團課').length;
        const privateClass = monthSchedules.filter(s => s.type === '花滑私課').length;
        const practice = monthSchedules.filter(s => s.type === '花滑練習').length;
        const ballet = monthSchedules.filter(s => s.type === '芭蕾').length;
        const totalSessions = monthSchedules.length;

        if (metricSessions) metricSessions.textContent = `${totalSessions} 堂`;
        if (metricSessionsSub) metricSessionsSub.innerHTML = `團課 ${groupClass} | 私課 ${privateClass}<br>練習 ${practice} | 芭蕾 ${ballet}`;

        // 計算總運動時數
        let totalHours = 0;
        const hoursBreakdown = [];
        monthSchedules.forEach(s => {
            const hrs = calculateScheduleHours(s);
            totalHours += hrs;
            
            // 順便記錄堂數與時數明細
            const dateStr = s.date ? normalizeDateStr(s.date) : '未知日期';
            const title = s.title || s.type;
            const timeStr = s.time ? (s.endTime ? `${s.time}~${s.endTime}` : s.time) : '全天';
            
            sessionsBreakdown.push({
                title: `${title} (${timeStr})`,
                ruleText: s.type,
                date: dateStr,
                addedVal: 1,
                valText: '1 堂'
            });
            
            hoursBreakdown.push({
                title: `${title} (${timeStr})`,
                ruleText: s.type,
                date: dateStr,
                addedVal: hrs,
                valText: `${hrs.toFixed(1)} 小時`
            });
        });
        const avgHours = totalSessions > 0 ? (totalHours / totalSessions).toFixed(1) : '0';

        if (metricHours) metricHours.textContent = `${totalHours.toFixed(1)} 小時`;
        if (metricHoursSub) metricHoursSub.textContent = `平均每堂 ${avgHours} 小時`;

        // 計算當月花費 (動態成本計算)
        let totalCost = 0;
        let monthCardDetailsCount = 0;
        const costBreakdown = []; // 儲存明細資料

        const allCards = schedules.filter(s => s.isCard);
        
        allCards.forEach(card => {
            const price = parseCleanPrice(card.price);
            if (price === 0) return;
            
            const startDate = normalizeDateStr(card.startDate || card.date);
            const endDate = normalizeDateStr(card.date);
            const coveredMonths = getPassCoveredMonths(card);
            
            const rule = getCardRule(card);
            if (!rule) {
                // 沒有定義規則的課卡 (例如：單次入場)，直接算在購買月份
                if (startDate && startDate.startsWith(currentMonthStr)) {
                    totalCost += price;
                    monthCardDetailsCount++;
                    costBreakdown.push({
                        title: card.displayTitle || card.type,
                        ruleText: '單次入場/無規則',
                        usedClasses: 1,
                        addedVal: price,
                        valText: `NT$ ${price.toLocaleString()}`,
                        date: startDate
                    });
                }
                return;
            }

            const usage = getCardUsage(card.id);
            const totalUsed = usage.classes + usage.practices;
            const isInfinite = rule.maxClasses === Infinity || rule.maxPractices === Infinity;
            
            if (isInfinite || totalUsed === 0) {
                // 若無限次數或完全未使用，平均分攤至涵蓋月份
                if (coveredMonths.includes(currentMonthStr)) {
                    const avgCost = Math.round(price / (coveredMonths.length || 1));
                    totalCost += avgCost;
                    monthCardDetailsCount++;
                    costBreakdown.push({
                        title: card.displayTitle || card.type,
                        ruleText: isInfinite ? '無限次數平攤' : '未使用平攤',
                        usedClasses: 0,
                        addedVal: avgCost,
                        valText: `NT$ ${avgCost.toLocaleString()}`,
                        date: endDate
                    });
                }
            } else {
                // 計次卡 (Quota card)
                const todayStr = formatLocalDate(new Date());
                const isExpired = endDate < todayStr;
                
                let singleCost = 0;
                let ruleText = '';
                
                if (isExpired) {
                    singleCost = price / totalUsed;
                    ruleText = '已過期 (依實際使用計單價)';
                } else {
                    const maxQuota = rule.maxClasses + rule.maxPractices;
                    singleCost = price / maxQuota;
                    ruleText = '使用中 (依總額度計單價)';
                }
                
                // 計算本月用了多少次
                let usedInThisMonth = 0;
                schedules.forEach(s => {
                    if (!s.isCard && String(s.linkedCardId) === String(card.id)) {
                        if (normalizeDateStr(s.date).startsWith(currentMonthStr)) {
                            usedInThisMonth++;
                        }
                    }
                });
                
                if (usedInThisMonth > 0) {
                    const added = Math.round(usedInThisMonth * singleCost);
                    totalCost += added;
                    costBreakdown.push({
                        title: card.displayTitle || card.type,
                        ruleText: ruleText,
                        usedClasses: usedInThisMonth,
                        addedVal: added,
                        valText: `NT$ ${added.toLocaleString()}`,
                        date: endDate
                    });
                    if (!coveredMonths.includes(currentMonthStr)) {
                        monthCardDetailsCount++; 
                    }
                }
                
                if (coveredMonths.includes(currentMonthStr)) {
                     monthCardDetailsCount++;
                }
            }
        });

        totalCost = Math.round(totalCost);

        if (metricCost) metricCost.textContent = `NT$ ${totalCost.toLocaleString()}`;
        if (metricCostSub) metricCostSub.innerHTML = `${monthSchedules.length} 堂課程<br>${monthCardDetailsCount} 張當月有效/購買課卡`;

        // 計算當月總購物花費
        let totalShoppingCost = 0;
        const shoppingCostBreakdown = [];
        const monthShoppingRecords = schedules.filter(s => {
            if (!s.isShopping) return false;
            const normDate = normalizeDateStr(s.date);
            return normDate && normDate.startsWith(currentMonthStr);
        });

        monthShoppingRecords.forEach(s => {
            const price = parseCleanPrice(s.price);
            totalShoppingCost += price;
            const dateStr = s.date ? normalizeDateStr(s.date) : '未知日期';
            const itemName = s.name || s.type || '購物項目';
            
            shoppingCostBreakdown.push({
                title: itemName,
                ruleText: s.type || '購物',
                date: dateStr,
                addedVal: price,
                valText: `NT$ ${price.toLocaleString()}`
            });
        });

        totalShoppingCost = Math.round(totalShoppingCost);

        if (metricShoppingCost) metricShoppingCost.textContent = `NT$ ${totalShoppingCost.toLocaleString()}`;
        if (metricShoppingCostSub) metricShoppingCostSub.textContent = `共 ${monthShoppingRecords.length} 筆購物紀錄`;

        setupBreakdownModal('cost-metric-card', '總運動花費明細', costBreakdown, `NT$ ${totalCost.toLocaleString()}`);
        setupBreakdownModal('shopping-cost-metric-card', '當月總購物花費明細', shoppingCostBreakdown, `NT$ ${totalShoppingCost.toLocaleString()}`);
        setupBreakdownModal('sessions-metric-card', '當月堂數 / 練習明細', sessionsBreakdown, `${totalSessions} 堂`);
        setupBreakdownModal('hours-metric-card', '總運動時數明細', hoursBreakdown, `${totalHours.toFixed(1)} 小時`);

        if (monthlyBarChart) {
            monthlyBarChart.innerHTML = '';
            const monthsList = [];
            for (let i = 5; i >= 0; i--) {
                const d = new Date(year, month - i, 1);
                const mStr = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`;
                const mName = `${d.getMonth() + 1}月`;
                const count = schedules.filter(s => !s.isCard && !s.isOther && !s.isShopping && s.date && normalizeDateStr(s.date).startsWith(mStr)).length;
                monthsList.push({ name: mName, count, isCurrent: i === 0 });
            }

            const rawMax = Math.max(...monthsList.map(m => m.count), 1);
            const maxCount = Math.max(10, Math.ceil(rawMax / 5) * 5);
            monthsList.forEach(m => {
                const group = document.createElement('div');
                group.className = `bar-group ${m.isCurrent ? 'active' : ''}`;

                const heightPct = Math.round((m.count / maxCount) * 100);

                group.innerHTML = `
                    <div class="bar-wrapper">
                        <span class="bar-val-tooltip">${m.count}</span>
                        <div class="bar-fill" style="height: ${heightPct}%;"></div>
                    </div>
                    <span class="bar-label">${m.name}</span>
                `;
                monthlyBarChart.appendChild(group);
            });
        }

        if (typeDonutChart) {
            typeDonutChart.innerHTML = '';
            // 恢復原本的排版（不要用 flex row）
            typeDonutChart.style.display = 'block';
            typeDonutChart.style.textAlign = 'center';

            const typeCounts = [
                { type: '花滑團課', count: groupClass },
                { type: '花滑私課', count: privateClass },
                { type: '花滑練習', count: practice },
                { type: '芭蕾', count: ballet }
            ];

            const activeTypes = typeCounts.filter(tc => tc.count > 0);

            if (totalSessions === 0 || activeTypes.length === 0) {
                typeDonutChart.innerHTML = '<div style="color: var(--text-secondary); padding: 20px;">尚無紀錄</div>';
            } else {
                // SVG 設定
                // SVG 設定 - 加寬畫布 (420px) 確保左側與右側文字皆有 20px+ 安全邊距，絕不裁切
                const sizeW = 420;
                const sizeH = 300;
                const centerX = sizeW / 2;
                const centerY = 145;
                const radius = 70;
                const strokeWidth = 42; // 加粗圓環
                const circumference = 2 * Math.PI * radius;
                const labelRadius = 126;

                let svgContent = '';
                let currentOffset = 0;
                let currentAnglePct = 0; // 0 to 1 (從頂部開始，順時針)

                activeTypes.forEach(tc => {
                    const pct = tc.count / totalSessions;
                    const dashArray = pct * circumference;
                    const colors = typeColors[tc.type] || defaultTypeColor;
                    
                    // 圓環片段
                    svgContent += `
                        <circle cx="${centerX}" cy="${centerY}" r="${radius}" 
                            fill="transparent" 
                            stroke="${colors.bg}" 
                            stroke-width="${strokeWidth}" 
                            stroke-dasharray="${dashArray} ${circumference}" 
                            stroke-dashoffset="${-currentOffset}" 
                            style="transition: stroke-dasharray 0.5s ease;"></circle>
                    `;
                    currentOffset += dashArray;

                    // 標籤位置計算
                    const midPct = currentAnglePct + (pct / 2);
                    const angleRad = (midPct * 2 * Math.PI) - (Math.PI / 2);
                    const labelX = centerX + labelRadius * Math.cos(angleRad);
                    const labelY = centerY + labelRadius * Math.sin(angleRad);
                    
                    let textAnchor = 'middle';
                    if (Math.cos(angleRad) > 0.25) textAnchor = 'start';
                    else if (Math.cos(angleRad) < -0.25) textAnchor = 'end';

                    const pctDisplay = Math.round(pct * 100);
                    
                    // 標籤文字放大：類型名稱 15px (bold), 百分比 14px (bold)
                    svgContent += `
                        <g class="donut-label-group">
                            <text x="${labelX}" y="${labelY - 10}" fill="#836a77" font-size="19" font-weight="800" text-anchor="${textAnchor}" dominant-baseline="middle">${tc.type}</text>
                            <text x="${labelX}" y="${labelY + 12}" fill="#836a77" font-size="18" font-weight="800" text-anchor="${textAnchor}" dominant-baseline="middle">${pctDisplay}%</text>
                        </g>
                    `;

                    currentAnglePct += pct;
                });

                const finalSvg = `
                    <svg viewBox="0 0 ${sizeW} ${sizeH}" style="width: 100%; max-width: 350px; height: auto; margin: -6px auto 0 auto; display: block;">
                        <g transform="rotate(-90 ${centerX} ${centerY})">
                            ${svgContent.replace(/<g class="donut-label-group">[\s\S]*?<\/g>/g, '')}
                        </g>
                        ${(svgContent.match(/<g class="donut-label-group">[\s\S]*?<\/g>/g) || []).join('\n')}
                        
                        <!-- 中間總數 -->
                        <text x="${centerX}" y="${centerY - 6}" fill="#715a57" font-size="38" font-weight="800" text-anchor="middle" dominant-baseline="middle">${totalSessions}</text>
                        <text x="${centerX}" y="${centerY + 18}" fill="var(--text-secondary)" font-size="15" font-weight="700" text-anchor="middle" dominant-baseline="middle">總堂數</text>
                    </svg>
                `;

                typeDonutChart.innerHTML = finalSvg;
            }
        }

        if (statsLogList) {
            statsLogList.innerHTML = '';
            if (monthSchedules.length === 0) {
                statsLogList.innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 20px; font-size: 13px;">本月尚無課程或練習紀錄</div>';
            } else {
                monthSchedules.sort((a, b) => b.date.localeCompare(a.date)).forEach(s => {
                    const hrs = calculateScheduleHours(s);
                    const cost = getDefaultCost(s);
                    const timeRange = s.time ? (s.endTime ? `${s.time}~${s.endTime}` : s.time) : '全天';
                    const colors = typeColors[s.type] || defaultTypeColor;

                    const row = document.createElement('div');
                    row.className = 'stats-log-item';
                    if (colors.cardBg) row.style.backgroundColor = colors.cardBg;
                    row.innerHTML = `
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <span style="background-color: ${colors.bg}; color: ${colors.text}; padding: 5px 14px; border-radius: 9999px; font-size: 13px; font-weight: 600;">${s.type}</span>
                            <div>
                                <div style="font-weight: 700; font-size: 15px;">${normalizeDateStr(s.date)} ${timeRange}</div>
                                <div style="font-size: 13px; color: var(--text-secondary);">${s.note || '無備註'} (${hrs.toFixed(1)}h)</div>
                            </div>
                        </div>
                        <div style="font-weight: 700; font-size: 15px; color: #715a57;">NT$ ${cost.toLocaleString()}</div>
                    `;
                    statsLogList.appendChild(row);
                });
            }
        }

        if (statsCardList) {
            statsCardList.innerHTML = '';
            const monthCardRecords = schedules.filter(s => {
                if (!s.isCard) return false;
                const d = s.startDate || s.date;
                const normDate = normalizeDateStr(d);
                return normDate && normDate.startsWith(currentMonthStr);
            });

            if (monthCardRecords.length === 0) {
                statsCardList.innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 20px; font-size: 13px;">本月尚無購課紀錄</div>';
            } else {
                const todayStr = formatLocalDate(new Date());
                monthCardRecords.sort((a, b) => {
                    const dateA = normalizeDateStr(a.startDate || a.date || '');
                    const dateB = normalizeDateStr(b.startDate || b.date || '');
                    return dateB.localeCompare(dateA);
                }).forEach(item => {
                    const price = parseCleanPrice(item.price);
                    const colors = typeColors[item.type] || defaultTypeColor;
                    
                    let usageText = '';
                    let statusBadgeHtml = '';

                    const startDate = item.startDate ? normalizeDateStr(item.startDate) : '';
                    const endDate = item.date ? normalizeDateStr(item.date) : '';
                    const dateStr = startDate ? (endDate && endDate !== startDate ? `${startDate} ~ ${endDate}` : startDate) : (endDate || '無日期');
                    const endDateStr = normalizeDateStr(item.date);
                    const isExpired = endDateStr ? (endDateStr < todayStr) : false;

                    const rule = getCardRule(item);
                    if (item.type === '單次入場') {
                        const usedSchedule = schedules.find(s => !s.isCard && String(s.linkedCardId) === String(item.id));
                        if (usedSchedule) {
                            usageText = `已於 ${normalizeDateStr(usedSchedule.date)} 抵扣`;
                            statusBadgeHtml = `<span style="font-size: 11px; padding: 2px 8px; border-radius: 9999px; background-color: #c1b3b3; color: #514646; font-weight: 600;">使用完畢</span>`;
                        } else if (isExpired) {
                            usageText = `未使用`;
                            statusBadgeHtml = `<span style="font-size: 11px; padding: 2px 8px; border-radius: 9999px; background-color: #e9cfcb; color: #984f4f; font-weight: 600;">已過期</span>`;
                        } else {
                            usageText = `可抵扣入場 1 次`;
                            statusBadgeHtml = `<span style="font-size: 11px; padding: 2px 8px; border-radius: 9999px; background-color: #cad0c8; color: #5e6859; font-weight: 600;">有效使用中</span>`;
                        }
                    } else if (rule) {
                        const usage = getCardUsage(item.id);
                        const isInfinite = rule.maxClasses === Infinity || rule.maxPractices === Infinity;
                        if (isInfinite) {
                            usageText = `期限內不限次數`;
                            if (isExpired) {
                                statusBadgeHtml = `<span style="font-size: 11px; padding: 2px 8px; border-radius: 9999px; background-color: #e9cfcb; color: #984f4f; font-weight: 600;">已過期</span>`;
                            } else {
                                statusBadgeHtml = `<span style="font-size: 11px; padding: 2px 8px; border-radius: 9999px; background-color: #cad0c8; color: #5e6859; font-weight: 600;">有效使用中</span>`;
                            }
                        } else {
                            const totalQuota = rule.maxClasses + rule.maxPractices;
                            const usedTotal = usage.classes + usage.practices;
                            
                            let parts = [];
                            if (rule.maxClasses > 0) parts.push(`課堂 ${usage.classes}/${rule.maxClasses}`);
                            if (rule.maxPractices > 0) parts.push(`練習 ${usage.practices}/${rule.maxPractices}`);
                            usageText = parts.join(' | ');

                            if (usedTotal >= totalQuota) {
                                statusBadgeHtml = `<span style="font-size: 11px; padding: 2px 8px; border-radius: 9999px; background-color: #c1b3b3; color: #514646; font-weight: 600;">使用完畢</span>`;
                            } else if (isExpired) {
                                statusBadgeHtml = `<span style="font-size: 11px; padding: 2px 8px; border-radius: 9999px; background-color: #e9cfcb; color: #984f4f; font-weight: 600;">已過期</span>`;
                            } else {
                                statusBadgeHtml = `<span style="font-size: 11px; padding: 2px 8px; border-radius: 9999px; background-color: #cad0c8; color: #5e6859; font-weight: 600;">有效使用中</span>`;
                            }
                        }
                    } else {
                        usageText = item.note || '購課紀錄';
                    }

                    const row = document.createElement('div');
                    row.className = 'stats-log-item';
                    row.style.cursor = 'pointer';
                    if (colors.cardBg) row.style.backgroundColor = colors.cardBg;

                    row.innerHTML = `
                        <div style="display: flex; align-items: center; gap: 12px; flex: 1;">
                            <span style="background-color: ${colors.bg}; color: ${colors.text}; padding: 5px 14px; border-radius: 9999px; font-size: 13px; font-weight: 600; flex-shrink: 0;">${item.type}</span>
                            <div>
                                <div style="font-weight: 700; font-size: 15px; display: flex; align-items: center; gap: 8px;">
                                    <span>${dateStr}</span>
                                    ${statusBadgeHtml}
                                </div>
                                <div style="font-size: 13px; color: var(--text-secondary); margin-top: 2px;">
                                    ${usageText}
                                </div>
                            </div>
                        </div>
                        <div style="font-weight: 700; font-size: 16px; color: #715a57; white-space: nowrap;">NT$ ${price.toLocaleString()}</div>
                    `;

                    row.addEventListener('click', () => {
                        editingScheduleId = item.id;
                        openCardModalForEdit(item);
                    });

                    statsCardList.appendChild(row);
                });
            }
        }

        if (statsShoppingList) {
            statsShoppingList.innerHTML = '';
            const monthShoppingRecords = schedules.filter(s => {
                if (!s.isShopping) return false;
                const normDate = normalizeDateStr(s.date);
                return normDate && normDate.startsWith(currentMonthStr);
            });
            
            if (monthShoppingRecords.length === 0) {
                statsShoppingList.innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 20px; font-size: 13px;">本月尚無購物紀錄</div>';
            } else {
                monthShoppingRecords.sort((a, b) => b.date.localeCompare(a.date)).forEach(item => {
                    const price = parseCleanPrice(item.price);
                    const colors = typeColors[item.type] || defaultTypeColor;
                    const dateStr = item.date ? normalizeDateStr(item.date) : '無日期';
                    
                    const row = document.createElement('div');
                    row.className = 'stats-log-item';
                    row.style.cursor = 'pointer';
                    if (colors.cardBg) row.style.backgroundColor = colors.cardBg;

                    row.innerHTML = `
                        <div style="display: flex; align-items: center; gap: 12px; flex: 1;">
                            <span style="background-color: ${colors.bg}; color: ${colors.text}; padding: 5px 14px; border-radius: 9999px; font-size: 13px; font-weight: 600; shrink: 0;">${item.type || '購物'}</span>
                            <div>
                                <div style="font-weight: 700; font-size: 15px; display: flex; align-items: center; gap: 8px;">
                                    <span>${dateStr}</span>
                                </div>
                                <div style="font-size: 13px; color: var(--text-secondary); margin-top: 2px;">
                                    ${item.name || item.note || '購物紀錄'}
                                </div>
                            </div>
                        </div>
                        <div style="font-weight: 700; font-size: 16px; color: #715a57; white-space: nowrap;">NT$ ${price.toLocaleString()}</div>
                    `;

                    row.addEventListener('click', () => {
                        editingScheduleId = item.id;
                        openShoppingModalForEdit(item);
                    });

                    statsShoppingList.appendChild(row);
                });
            }
        }
    }

    const statsPrevBtn = document.getElementById('stats-prev-month');
    const statsNextBtn = document.getElementById('stats-next-month');
    const statsAllTimeBtn = document.getElementById('stats-all-time-btn');

    if (statsPrevBtn) {
        statsPrevBtn.addEventListener('click', () => {
            const mode = document.getElementById('stats-mode-select')?.value;
            if (mode === '年度總覽') {
                statsCurrentMonthDate.setFullYear(statsCurrentMonthDate.getFullYear() - 1);
                renderYearlyDashboard();
            } else {
                statsCurrentMonthDate.setDate(1);
                statsCurrentMonthDate.setMonth(statsCurrentMonthDate.getMonth() - 1);
                renderStatsDashboard();
            }
        });
    }

    if (statsNextBtn) {
        statsNextBtn.addEventListener('click', () => {
            const mode = document.getElementById('stats-mode-select')?.value;
            if (mode === '年度總覽') {
                statsCurrentMonthDate.setFullYear(statsCurrentMonthDate.getFullYear() + 1);
                renderYearlyDashboard();
            } else {
                statsCurrentMonthDate.setDate(1);
                statsCurrentMonthDate.setMonth(statsCurrentMonthDate.getMonth() + 1);
                renderStatsDashboard();
            }
        });
    }

    function renderYearlyDashboard() {
        const statsMonthLabel = document.getElementById('stats-month-label');
        const yearlyMetricSessions = document.getElementById('yearly-metric-sessions');
        const yearlyMetricSessionsSub = document.getElementById('yearly-metric-sessions-sub');
        const yearlyMetricHours = document.getElementById('yearly-metric-hours');
        const yearlyMetricHoursSub = document.getElementById('yearly-metric-hours-sub');
        const yearlyMetricCost = document.getElementById('yearly-metric-cost');
        const yearlyMetricCostSub = document.getElementById('yearly-metric-cost-sub');
        const yearlyMetricShoppingCost = document.getElementById('yearly-metric-shopping-cost');
        const yearlyMetricShoppingCostSub = document.getElementById('yearly-metric-shopping-cost-sub');
        const yearlyBarChart = document.getElementById('yearly-bar-chart');
        const yearlyTypeDonutChart = document.getElementById('yearly-type-donut-chart');
        const yearlyStatsLogList = document.getElementById('yearly-stats-log-list');
        const yearlyStatsCardList = document.getElementById('yearly-stats-card-list');
        const yearlyStatsShoppingList = document.getElementById('yearly-stats-shopping-list');

        const year = statsCurrentMonthDate.getFullYear();
        const currentYearStr = `${year}`;

        if (statsMonthLabel) {
            statsMonthLabel.textContent = `${year}`;
        }

        // 1. 篩選當年度運動紀錄
        const yearSchedules = schedules.filter(s => {
            if (s.isCard || s.isOther || s.isShopping) return false;
            const normDate = normalizeDateStr(s.date);
            return normDate && normDate.startsWith(currentYearStr);
        });

        const groupClass = yearSchedules.filter(s => s.type === '花滑團課').length;
        const privateClass = yearSchedules.filter(s => s.type === '花滑私課').length;
        const practice = yearSchedules.filter(s => s.type === '花滑練習').length;
        const ballet = yearSchedules.filter(s => s.type === '芭蕾').length;
        const totalSessions = yearSchedules.length;

        const sessionsBreakdown = [];
        const hoursBreakdown = [];
        let totalHours = 0;

        yearSchedules.forEach(s => {
            const hrs = calculateScheduleHours(s);
            totalHours += hrs;
            const dateStr = s.date ? normalizeDateStr(s.date) : '未知日期';
            const title = s.title || s.type;
            const timeStr = s.time ? (s.endTime ? `${s.time}~${s.endTime}` : s.time) : '全天';

            sessionsBreakdown.push({
                title: `${title} (${timeStr})`,
                ruleText: s.type,
                date: dateStr,
                addedVal: 1,
                valText: '1 堂'
            });

            hoursBreakdown.push({
                title: `${title} (${timeStr})`,
                ruleText: s.type,
                date: dateStr,
                addedVal: hrs,
                valText: `${hrs.toFixed(1)} 小時`
            });
        });

        const avgMonthlyHours = (totalHours / 12).toFixed(1);
        const avgSessionHours = totalSessions > 0 ? (totalHours / totalSessions).toFixed(1) : '0';

        if (yearlyMetricSessions) yearlyMetricSessions.textContent = `${totalSessions} 堂`;
        if (yearlyMetricSessionsSub) yearlyMetricSessionsSub.innerHTML = `團課 ${groupClass} | 私課 ${privateClass}<br>練習 ${practice} | 芭蕾 ${ballet}`;

        if (yearlyMetricHours) yearlyMetricHours.textContent = `${totalHours.toFixed(1)} 小時`;
        if (yearlyMetricHoursSub) yearlyMetricHoursSub.textContent = `平均每月 ${avgMonthlyHours} 小時 | 每堂 ${avgSessionHours} 小時`;

        // 2. 篩選與計算當年度總運動花費
        let totalCost = 0;
        let yearCardDetailsCount = 0;
        const costBreakdown = [];

        const allCards = schedules.filter(s => s.isCard);
        allCards.forEach(card => {
            const price = parseCleanPrice(card.price);
            if (price === 0) return;
            
            const startDate = normalizeDateStr(card.startDate || card.date);
            const coveredMonths = getPassCoveredMonths(card);
            
            const rule = getCardRule(card);
            if (!rule) {
                if (startDate && startDate.startsWith(currentYearStr)) {
                    totalCost += price;
                    yearCardDetailsCount++;
                    costBreakdown.push({
                        title: card.displayTitle || card.type,
                        ruleText: '課卡購買',
                        date: startDate,
                        addedVal: price,
                        valText: `NT$ ${price.toLocaleString()}`
                    });
                }
            } else {
                let currentYearUsedCount = 0;
                let activeMonthsInYear = [];

                coveredMonths.forEach(mStr => {
                    if (mStr.startsWith(currentYearStr)) {
                        activeMonthsInYear.push(mStr);
                        const monthLogs = schedules.filter(s => {
                            if (s.isCard || s.isOther || s.isShopping) return false;
                            const normDate = normalizeDateStr(s.date);
                            if (!normDate || !normDate.startsWith(mStr)) return false;
                            if (rule.allowedTypes && !rule.allowedTypes.includes(s.type)) return false;
                            return String(s.linkedCardId) === String(card.id);
                        });
                        currentYearUsedCount += monthLogs.length;
                    }
                });

                if (activeMonthsInYear.length > 0) {
                    yearCardDetailsCount++;
                    const monthlyCostShare = price / coveredMonths.length;
                    const yearCostShare = monthlyCostShare * activeMonthsInYear.length;
                    totalCost += yearCostShare;

                    costBreakdown.push({
                        title: card.displayTitle || card.type,
                        ruleText: `當年度涵蓋 ${activeMonthsInYear.length} 個月`,
                        date: startDate,
                        addedVal: Math.round(yearCostShare),
                        usedClasses: currentYearUsedCount,
                        valText: `NT$ ${Math.round(yearCostShare).toLocaleString()}`
                    });
                }
            }
        });

        yearSchedules.forEach(s => {
            if (!s.linkedCardId) {
                const singleCost = getDefaultCost(s);
                totalCost += singleCost;
                const dateStr = s.date ? normalizeDateStr(s.date) : '未知日期';
                const title = s.title || s.type;

                costBreakdown.push({
                    title: title,
                    ruleText: s.type,
                    date: dateStr,
                    addedVal: singleCost,
                    valText: `NT$ ${singleCost.toLocaleString()}`
                });
            }
        });

        totalCost = Math.round(totalCost);
        if (yearlyMetricCost) yearlyMetricCost.textContent = `NT$ ${totalCost.toLocaleString()}`;
        if (yearlyMetricCostSub) yearlyMetricCostSub.innerHTML = `${yearSchedules.length} 堂課程<br>${yearCardDetailsCount} 張當年度有效/購買課卡`;

        // 3. 篩選與計算當年度購物花費
        let totalShoppingCost = 0;
        const shoppingCostBreakdown = [];
        const yearShoppingRecords = schedules.filter(s => {
            if (!s.isShopping) return false;
            const normDate = normalizeDateStr(s.date);
            return normDate && normDate.startsWith(currentYearStr);
        });

        yearShoppingRecords.forEach(s => {
            const price = parseCleanPrice(s.price);
            totalShoppingCost += price;
            const dateStr = s.date ? normalizeDateStr(s.date) : '未知日期';
            const itemName = s.name || s.type || '購物項目';

            shoppingCostBreakdown.push({
                title: itemName,
                ruleText: s.type || '購物',
                date: dateStr,
                addedVal: price,
                valText: `NT$ ${price.toLocaleString()}`
            });
        });

        totalShoppingCost = Math.round(totalShoppingCost);
        if (yearlyMetricShoppingCost) yearlyMetricShoppingCost.textContent = `NT$ ${totalShoppingCost.toLocaleString()}`;
        if (yearlyMetricShoppingCostSub) yearlyMetricShoppingCostSub.textContent = `共 ${yearShoppingRecords.length} 筆購物紀錄`;

        // 綁定明細彈窗
        setupBreakdownModal('yearly-cost-metric-card', '全年度總運動花費明細', costBreakdown, `NT$ ${totalCost.toLocaleString()}`);
        setupBreakdownModal('yearly-shopping-cost-metric-card', '全年度總購物花費明細', shoppingCostBreakdown, `NT$ ${totalShoppingCost.toLocaleString()}`);
        setupBreakdownModal('yearly-sessions-metric-card', '全年度堂數 / 練習明細', sessionsBreakdown, `${totalSessions} 堂`);
        setupBreakdownModal('yearly-hours-metric-card', '全年度總運動時數明細', hoursBreakdown, `${totalHours.toFixed(1)} 小時`);

        // 4. 12 個月趨勢圖表 (yearly-bar-chart)
        if (yearlyBarChart) {
            yearlyBarChart.innerHTML = '';
            const monthsList = [];
            for (let i = 1; i <= 12; i++) {
                const mStr = `${year}/${String(i).padStart(2, '0')}`;
                const mName = `${i}月`;
                const count = schedules.filter(s => !s.isCard && !s.isOther && !s.isShopping && s.date && normalizeDateStr(s.date).startsWith(mStr)).length;
                monthsList.push({ name: mName, count, isCurrent: i === (new Date().getMonth() + 1) && year === new Date().getFullYear() });
            }

            const rawMax = Math.max(...monthsList.map(m => m.count), 1);
            const maxCount = Math.max(10, Math.ceil(rawMax / 5) * 5);
            monthsList.forEach(m => {
                const group = document.createElement('div');
                group.className = `bar-group ${m.isCurrent ? 'active' : ''}`;
                const heightPct = Math.round((m.count / maxCount) * 100);

                group.innerHTML = `
                    <div class="bar-wrapper">
                        <span class="bar-val-tooltip">${m.count}</span>
                        <div class="bar-fill" style="height: ${heightPct}%;"></div>
                    </div>
                    <span class="bar-label">${m.name}</span>
                `;
                yearlyBarChart.appendChild(group);
            });
        }

        // 5. 運動類型分布佔比 (yearly-type-donut-chart)
        if (yearlyTypeDonutChart) {
            yearlyTypeDonutChart.innerHTML = '';
            yearlyTypeDonutChart.style.display = 'block';
            yearlyTypeDonutChart.style.textAlign = 'center';

            const typeCounts = [
                { type: '花滑團課', count: groupClass },
                { type: '花滑私課', count: privateClass },
                { type: '花滑練習', count: practice },
                { type: '芭蕾', count: ballet }
            ];

            const activeTypes = typeCounts.filter(tc => tc.count > 0);

            if (totalSessions === 0 || activeTypes.length === 0) {
                yearlyTypeDonutChart.innerHTML = '<div style="color: var(--text-secondary); padding: 20px;">當年度尚無紀錄</div>';
            } else {
                const sizeW = 420;
                const sizeH = 300;
                const centerX = sizeW / 2;
                const centerY = 145;
                const radius = 70;
                const strokeWidth = 42;
                const circumference = 2 * Math.PI * radius;
                const labelRadius = 126;

                let svgContent = '';
                let currentOffset = 0;
                let currentAnglePct = 0;

                activeTypes.forEach(tc => {
                    const pct = tc.count / totalSessions;
                    const dashArray = pct * circumference;
                    const colors = typeColors[tc.type] || defaultTypeColor;
                    
                    svgContent += `
                        <circle cx="${centerX}" cy="${centerY}" r="${radius}" 
                            fill="transparent" 
                            stroke="${colors.bg}" 
                            stroke-width="${strokeWidth}" 
                            stroke-dasharray="${dashArray} ${circumference}" 
                            stroke-dashoffset="${-currentOffset}" 
                            style="transition: stroke-dasharray 0.5s ease;"></circle>
                    `;
                    currentOffset += dashArray;

                    const midPct = currentAnglePct + (pct / 2);
                    const angleRad = (midPct * 2 * Math.PI) - (Math.PI / 2);
                    const labelX = centerX + labelRadius * Math.cos(angleRad);
                    const labelY = centerY + labelRadius * Math.sin(angleRad);
                    
                    let textAnchor = 'middle';
                    if (Math.cos(angleRad) > 0.25) textAnchor = 'start';
                    else if (Math.cos(angleRad) < -0.25) textAnchor = 'end';

                    const pctDisplay = Math.round(pct * 100);
                    
                    svgContent += `
                        <g class="donut-label-group">
                            <text x="${labelX}" y="${labelY - 10}" fill="#836a77" font-size="19" font-weight="800" text-anchor="${textAnchor}" dominant-baseline="middle">${tc.type}</text>
                            <text x="${labelX}" y="${labelY + 12}" fill="#836a77" font-size="18" font-weight="800" text-anchor="${textAnchor}" dominant-baseline="middle">${pctDisplay}%</text>
                        </g>
                    `;

                    currentAnglePct += pct;
                });

                const finalSvg = `
                    <svg viewBox="0 0 ${sizeW} ${sizeH}" style="width: 100%; max-width: 350px; height: auto; margin: -6px auto 0 auto; display: block;">
                        <g transform="rotate(-90 ${centerX} ${centerY})">
                            ${svgContent.replace(/<g class="donut-label-group">[\s\S]*?<\/g>/g, '')}
                        </g>
                        ${(svgContent.match(/<g class="donut-label-group">[\s\S]*?<\/g>/g) || []).join('\n')}
                        
                        <!-- 中間總數 -->
                        <text x="${centerX}" y="${centerY - 6}" fill="#715a57" font-size="38" font-weight="800" text-anchor="middle" dominant-baseline="middle">${totalSessions}</text>
                        <text x="${centerX}" y="${centerY + 18}" fill="var(--text-secondary)" font-size="15" font-weight="700" text-anchor="middle" dominant-baseline="middle">總堂數</text>
                    </svg>
                `;

                yearlyTypeDonutChart.innerHTML = finalSvg;
            }
        }

        // 6. 渲染年度列表紀錄
        if (yearlyStatsLogList) {
            yearlyStatsLogList.innerHTML = '';
            if (yearSchedules.length === 0) {
                yearlyStatsLogList.innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 20px; font-size: 13px;">當年度尚無課程或練習紀錄</div>';
            } else {
                yearSchedules.sort((a, b) => (b.date || '').localeCompare(a.date || '')).forEach(s => {
                    const hrs = calculateScheduleHours(s);
                    const cost = getDefaultCost(s);
                    const colors = typeColors[s.type] || defaultTypeColor;
                    const dateStr = s.date ? normalizeDateStr(s.date) : '無日期';
                    const title = s.title || s.type;
                    const timeStr = s.time ? (s.endTime ? `${s.time}~${s.endTime}` : s.time) : '';

                    const row = document.createElement('div');
                    row.className = 'stats-log-item';
                    row.style.cursor = 'pointer';
                    if (colors.cardBg) row.style.backgroundColor = colors.cardBg;

                    row.innerHTML = `
                        <div style="display: flex; align-items: center; gap: 12px; flex: 1;">
                            <span style="background-color: ${colors.bg}; color: ${colors.text}; padding: 5px 14px; border-radius: 9999px; font-size: 13px; font-weight: 600; shrink: 0;">${s.type}</span>
                            <div>
                                <div style="font-weight: 700; font-size: 15px; display: flex; align-items: center; gap: 8px;">
                                    <span>${title}</span>
                                    ${timeStr ? `<span style="font-size: 13px; color: var(--text-secondary); font-weight: 400;">(${timeStr})</span>` : ''}
                                </div>
                                <div style="font-size: 13px; color: var(--text-secondary); margin-top: 2px;">${dateStr} · ${hrs.toFixed(1)} 小時</div>
                            </div>
                        </div>
                        <div style="font-weight: 700; font-size: 16px; color: #715a57; text-align: right;">NT$ ${cost.toLocaleString()}</div>
                    `;

                    row.addEventListener('click', () => {
                        editingScheduleId = s.id;
                        openScheduleModalForEdit(s);
                    });

                    yearlyStatsLogList.appendChild(row);
                });
            }
        }

        if (yearlyStatsCardList) {
            yearlyStatsCardList.innerHTML = '';
            const yearCardRecords = schedules.filter(s => {
                if (!s.isCard) return false;
                const startDate = normalizeDateStr(s.startDate || s.date);
                const coveredMonths = getPassCoveredMonths(s);
                return coveredMonths.some(m => m.startsWith(currentYearStr)) || (startDate && startDate.startsWith(currentYearStr));
            });

            if (yearCardRecords.length === 0) {
                yearlyStatsCardList.innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 20px; font-size: 13px;">當年度尚無購課或有效課卡紀錄</div>';
            } else {
                yearCardRecords.sort((a, b) => (b.date || '').localeCompare(a.date || '')).forEach(card => {
                    const price = parseCleanPrice(card.price);
                    const colors = typeColors[card.type] || defaultTypeColor;
                    const dateStr = card.date ? normalizeDateStr(card.date) : '無日期';
                    const displayTitle = card.displayTitle || card.type;

                    const row = document.createElement('div');
                    row.className = 'stats-log-item';
                    row.style.cursor = 'pointer';
                    if (colors.cardBg) row.style.backgroundColor = colors.cardBg;

                    row.innerHTML = `
                        <div style="display: flex; align-items: center; gap: 12px; flex: 1;">
                            <span style="background-color: ${colors.bg}; color: ${colors.text}; padding: 5px 14px; border-radius: 9999px; font-size: 13px; font-weight: 600; shrink: 0;">${card.type}</span>
                            <div>
                                <div style="font-weight: 700; font-size: 15px;">${displayTitle}</div>
                                <div style="font-size: 13px; color: var(--text-secondary); margin-top: 2px;">到期日: ${dateStr}</div>
                            </div>
                        </div>
                        <div style="font-weight: 700; font-size: 16px; color: #715a57; text-align: right;">NT$ ${price.toLocaleString()}</div>
                    `;

                    row.addEventListener('click', () => {
                        editingScheduleId = card.id;
                        openCardModalForEdit(card);
                    });

                    yearlyStatsCardList.appendChild(row);
                });
            }
        }

        if (yearlyStatsShoppingList) {
            yearlyStatsShoppingList.innerHTML = '';
            if (yearShoppingRecords.length === 0) {
                yearlyStatsShoppingList.innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 20px; font-size: 13px;">當年度尚無購物紀錄</div>';
            } else {
                yearShoppingRecords.sort((a, b) => (b.date || '').localeCompare(a.date || '')).forEach(item => {
                    const price = parseCleanPrice(item.price);
                    const colors = typeColors[item.type] || defaultTypeColor;
                    const dateStr = item.date ? normalizeDateStr(item.date) : '無日期';

                    const row = document.createElement('div');
                    row.className = 'stats-log-item';
                    row.style.cursor = 'pointer';
                    if (colors.cardBg) row.style.backgroundColor = colors.cardBg;

                    row.innerHTML = `
                        <div style="display: flex; align-items: center; gap: 12px; flex: 1;">
                            <span style="background-color: ${colors.bg}; color: ${colors.text}; padding: 5px 14px; border-radius: 9999px; font-size: 13px; font-weight: 600; shrink: 0;">${item.type || '購物'}</span>
                            <div>
                                <div style="font-weight: 700; font-size: 15px; display: flex; align-items: center; gap: 8px;">
                                    <span>${item.name || item.type || '購物'}</span>
                                </div>
                                <div style="font-size: 13px; color: var(--text-secondary); margin-top: 2px;">${dateStr}</div>
                            </div>
                        </div>
                        <div style="font-weight: 700; font-size: 16px; color: #715a57; text-align: right;">NT$ ${price.toLocaleString()}</div>
                    `;

                    row.addEventListener('click', () => {
                        editingScheduleId = item.id;
                        openShoppingModalForEdit(item);
                    });

                    yearlyStatsShoppingList.appendChild(row);
                });
            }
        }
    }

    function renderAllTimeDashboard() {
        const statsMonthLabel = document.getElementById('stats-month-label');
        const statsPrevBtn = document.getElementById('stats-prev-month');
        const statsNextBtn = document.getElementById('stats-next-month');

        const alltimeMetricSessions = document.getElementById('alltime-metric-sessions');
        const alltimeMetricSessionsSub = document.getElementById('alltime-metric-sessions-sub');
        const alltimeMetricHours = document.getElementById('alltime-metric-hours');
        const alltimeMetricHoursSub = document.getElementById('alltime-metric-hours-sub');
        const alltimeMetricCost = document.getElementById('alltime-metric-cost');
        const alltimeMetricCostSub = document.getElementById('alltime-metric-cost-sub');
        const alltimeMetricShoppingCost = document.getElementById('alltime-metric-shopping-cost');
        const alltimeMetricShoppingCostSub = document.getElementById('alltime-metric-shopping-cost-sub');
        const alltimeBarChart = document.getElementById('alltime-bar-chart');
        const alltimeTypeDonutChart = document.getElementById('alltime-type-donut-chart');
        const alltimeStatsLogList = document.getElementById('alltime-stats-log-list');
        const alltimeStatsCardList = document.getElementById('alltime-stats-card-list');
        const alltimeStatsShoppingList = document.getElementById('alltime-stats-shopping-list');

        if (statsMonthLabel) statsMonthLabel.textContent = '全期間';
        if (statsPrevBtn) statsPrevBtn.style.visibility = 'hidden';
        if (statsNextBtn) statsNextBtn.style.visibility = 'hidden';

        // 1. 篩選全期間運動紀錄
        const allSchedules = schedules.filter(s => !s.isCard && !s.isOther && !s.isShopping);
        const groupClass = allSchedules.filter(s => s.type === '花滑團課').length;
        const privateClass = allSchedules.filter(s => s.type === '花滑私課').length;
        const practice = allSchedules.filter(s => s.type === '花滑練習').length;
        const ballet = allSchedules.filter(s => s.type === '芭蕾').length;
        const totalSessions = allSchedules.length;

        const sessionsBreakdown = [];
        const hoursBreakdown = [];
        let totalHours = 0;

        allSchedules.forEach(s => {
            const hrs = calculateScheduleHours(s);
            totalHours += hrs;
            const dateStr = s.date ? normalizeDateStr(s.date) : '未知日期';
            const title = s.title || s.type;
            const timeStr = s.time ? (s.endTime ? `${s.time}~${s.endTime}` : s.time) : '全天';

            sessionsBreakdown.push({
                title: `${title} (${timeStr})`,
                ruleText: s.type,
                date: dateStr,
                addedVal: 1,
                valText: '1 堂'
            });

            hoursBreakdown.push({
                title: `${title} (${timeStr})`,
                ruleText: s.type,
                date: dateStr,
                addedVal: hrs,
                valText: `${hrs.toFixed(1)} 小時`
            });
        });

        const dates = allSchedules.map(s => normalizeDateStr(s.date)).filter(Boolean).sort();
        let monthSpan = 1;
        if (dates.length > 0) {
            const firstDate = parseLocalDate(dates[0]);
            const lastDate = parseLocalDate(dates[dates.length - 1]);
            const yDiff = lastDate.getFullYear() - firstDate.getFullYear();
            const mDiff = lastDate.getMonth() - firstDate.getMonth();
            monthSpan = Math.max(1, yDiff * 12 + mDiff + 1);
        }

        const avgMonthlyHours = (totalHours / monthSpan).toFixed(1);
        const avgSessionHours = totalSessions > 0 ? (totalHours / totalSessions).toFixed(1) : '0';

        if (alltimeMetricSessions) alltimeMetricSessions.textContent = `${totalSessions} 堂`;
        if (alltimeMetricSessionsSub) alltimeMetricSessionsSub.innerHTML = `團課 ${groupClass} | 私課 ${privateClass}<br>練習 ${practice} | 芭蕾 ${ballet}`;

        if (alltimeMetricHours) alltimeMetricHours.textContent = `${totalHours.toFixed(1)} 小時`;
        if (alltimeMetricHoursSub) alltimeMetricHoursSub.textContent = `平均每月 ${avgMonthlyHours} 小時 | 每堂 ${avgSessionHours} 小時`;

        // 2. 篩選與計算全期間總運動花費
        let totalCost = 0;
        let cardDetailsCount = 0;
        const costBreakdown = [];

        const allCards = schedules.filter(s => s.isCard);
        allCards.forEach(card => {
            const price = parseCleanPrice(card.price);
            if (price === 0) return;
            cardDetailsCount++;
            totalCost += price;
            const dateStr = card.date ? normalizeDateStr(card.date) : '未知日期';
            costBreakdown.push({
                title: card.displayTitle || card.type,
                ruleText: '課卡購買',
                date: dateStr,
                addedVal: price,
                valText: `NT$ ${price.toLocaleString()}`
            });
        });

        allSchedules.forEach(s => {
            if (!s.linkedCardId) {
                const singleCost = getDefaultCost(s);
                totalCost += singleCost;
                const dateStr = s.date ? normalizeDateStr(s.date) : '未知日期';
                const title = s.title || s.type;

                costBreakdown.push({
                    title: title,
                    ruleText: s.type,
                    date: dateStr,
                    addedVal: singleCost,
                    valText: `NT$ ${singleCost.toLocaleString()}`
                });
            }
        });

        totalCost = Math.round(totalCost);
        if (alltimeMetricCost) alltimeMetricCost.textContent = `NT$ ${totalCost.toLocaleString()}`;
        if (alltimeMetricCostSub) alltimeMetricCostSub.innerHTML = `${allSchedules.length} 堂課程<br>${cardDetailsCount} 張全期間課卡`;

        // 3. 篩選與計算全期間購物花費
        let totalShoppingCost = 0;
        const shoppingCostBreakdown = [];
        const allShoppingRecords = schedules.filter(s => s.isShopping);

        allShoppingRecords.forEach(s => {
            const price = parseCleanPrice(s.price);
            totalShoppingCost += price;
            const dateStr = s.date ? normalizeDateStr(s.date) : '未知日期';
            const itemName = s.name || s.type || '購物項目';

            shoppingCostBreakdown.push({
                title: itemName,
                ruleText: s.type || '購物',
                date: dateStr,
                addedVal: price,
                valText: `NT$ ${price.toLocaleString()}`
            });
        });

        totalShoppingCost = Math.round(totalShoppingCost);
        if (alltimeMetricShoppingCost) alltimeMetricShoppingCost.textContent = `NT$ ${totalShoppingCost.toLocaleString()}`;
        if (alltimeMetricShoppingCostSub) alltimeMetricShoppingCostSub.textContent = `共 ${allShoppingRecords.length} 筆購物紀錄`;

        // 綁定明細彈窗
        setupBreakdownModal('alltime-cost-metric-card', '全期間總運動花費明細', costBreakdown, `NT$ ${totalCost.toLocaleString()}`);
        setupBreakdownModal('alltime-shopping-cost-metric-card', '全期間總購物花費明細', shoppingCostBreakdown, `NT$ ${totalShoppingCost.toLocaleString()}`);
        setupBreakdownModal('alltime-sessions-metric-card', '全期間堂數 / 練習明細', sessionsBreakdown, `${totalSessions} 堂`);
        setupBreakdownModal('alltime-hours-metric-card', '全期間總運動時數明細', hoursBreakdown, `${totalHours.toFixed(1)} 小時`);

        // 4. 趨勢圖表 (alltime-bar-chart)
        if (alltimeBarChart) {
            alltimeBarChart.innerHTML = '';
            const monthsList = [];
            const now = new Date();
            for (let i = 11; i >= 0; i--) {
                const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                const mStr = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`;
                const mName = `${d.getMonth() + 1}月`;
                const count = schedules.filter(s => !s.isCard && !s.isOther && !s.isShopping && s.date && normalizeDateStr(s.date).startsWith(mStr)).length;
                monthsList.push({ name: mName, count, isCurrent: i === 0 });
            }

            const rawMax = Math.max(...monthsList.map(m => m.count), 1);
            const maxCount = Math.max(10, Math.ceil(rawMax / 5) * 5);
            monthsList.forEach(m => {
                const group = document.createElement('div');
                group.className = `bar-group ${m.isCurrent ? 'active' : ''}`;
                const heightPct = Math.round((m.count / maxCount) * 100);

                group.innerHTML = `
                    <div class="bar-wrapper">
                        <span class="bar-val-tooltip">${m.count}</span>
                        <div class="bar-fill" style="height: ${heightPct}%;"></div>
                    </div>
                    <span class="bar-label">${m.name}</span>
                `;
                alltimeBarChart.appendChild(group);
            });
        }

        // 5. 運動類型分布佔比 (alltime-type-donut-chart)
        if (alltimeTypeDonutChart) {
            alltimeTypeDonutChart.innerHTML = '';
            alltimeTypeDonutChart.style.display = 'block';
            alltimeTypeDonutChart.style.textAlign = 'center';

            const typeCounts = [
                { type: '花滑團課', count: groupClass },
                { type: '花滑私課', count: privateClass },
                { type: '花滑練習', count: practice },
                { type: '芭蕾', count: ballet }
            ];

            const activeTypes = typeCounts.filter(tc => tc.count > 0);

            if (totalSessions === 0 || activeTypes.length === 0) {
                alltimeTypeDonutChart.innerHTML = '<div style="color: var(--text-secondary); padding: 20px;">全期間尚無紀錄</div>';
            } else {
                const sizeW = 420;
                const sizeH = 300;
                const centerX = sizeW / 2;
                const centerY = 145;
                const radius = 70;
                const strokeWidth = 42;
                const circumference = 2 * Math.PI * radius;
                const labelRadius = 126;

                let svgContent = '';
                let currentOffset = 0;
                let currentAnglePct = 0;

                activeTypes.forEach(tc => {
                    const pct = tc.count / totalSessions;
                    const dashArray = pct * circumference;
                    const colors = typeColors[tc.type] || defaultTypeColor;
                    
                    svgContent += `
                        <circle cx="${centerX}" cy="${centerY}" r="${radius}" 
                            fill="transparent" 
                            stroke="${colors.bg}" 
                            stroke-width="${strokeWidth}" 
                            stroke-dasharray="${dashArray} ${circumference}" 
                            stroke-dashoffset="${-currentOffset}" 
                            style="transition: stroke-dasharray 0.5s ease;"></circle>
                    `;
                    currentOffset += dashArray;

                    const midPct = currentAnglePct + (pct / 2);
                    const angleRad = (midPct * 2 * Math.PI) - (Math.PI / 2);
                    const labelX = centerX + labelRadius * Math.cos(angleRad);
                    const labelY = centerY + labelRadius * Math.sin(angleRad);
                    
                    let textAnchor = 'middle';
                    if (Math.cos(angleRad) > 0.25) textAnchor = 'start';
                    else if (Math.cos(angleRad) < -0.25) textAnchor = 'end';

                    const pctDisplay = Math.round(pct * 100);
                    
                    svgContent += `
                        <g class="donut-label-group">
                            <text x="${labelX}" y="${labelY - 10}" fill="#836a77" font-size="19" font-weight="800" text-anchor="${textAnchor}" dominant-baseline="middle">${tc.type}</text>
                            <text x="${labelX}" y="${labelY + 12}" fill="#836a77" font-size="18" font-weight="800" text-anchor="${textAnchor}" dominant-baseline="middle">${pctDisplay}%</text>
                        </g>
                    `;

                    currentAnglePct += pct;
                });

                const finalSvg = `
                    <svg viewBox="0 0 ${sizeW} ${sizeH}" style="width: 100%; max-width: 350px; height: auto; margin: -6px auto 0 auto; display: block;">
                        <g transform="rotate(-90 ${centerX} ${centerY})">
                            ${svgContent.replace(/<g class="donut-label-group">[\s\S]*?<\/g>/g, '')}
                        </g>
                        ${(svgContent.match(/<g class="donut-label-group">[\s\S]*?<\/g>/g) || []).join('\n')}
                        
                        <!-- 中間總數 -->
                        <text x="${centerX}" y="${centerY - 6}" fill="#715a57" font-size="38" font-weight="800" text-anchor="middle" dominant-baseline="middle">${totalSessions}</text>
                        <text x="${centerX}" y="${centerY + 18}" fill="var(--text-secondary)" font-size="15" font-weight="700" text-anchor="middle" dominant-baseline="middle">總堂數</text>
                    </svg>
                `;

                alltimeTypeDonutChart.innerHTML = finalSvg;
            }
        }

        // 6. 渲染全期間列表紀錄
        if (alltimeStatsLogList) {
            alltimeStatsLogList.innerHTML = '';
            if (allSchedules.length === 0) {
                alltimeStatsLogList.innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 20px; font-size: 13px;">全期間尚無課程或練習紀錄</div>';
            } else {
                [...allSchedules].sort((a, b) => (b.date || '').localeCompare(a.date || '')).forEach(s => {
                    const hrs = calculateScheduleHours(s);
                    const cost = getDefaultCost(s);
                    const colors = typeColors[s.type] || defaultTypeColor;
                    const dateStr = s.date ? normalizeDateStr(s.date) : '無日期';
                    const title = s.title || s.type;
                    const timeStr = s.time ? (s.endTime ? `${s.time}~${s.endTime}` : s.time) : '';

                    const row = document.createElement('div');
                    row.className = 'stats-log-item';
                    row.style.cursor = 'pointer';
                    if (colors.cardBg) row.style.backgroundColor = colors.cardBg;

                    row.innerHTML = `
                        <div style="display: flex; align-items: center; gap: 12px; flex: 1;">
                            <span style="background-color: ${colors.bg}; color: ${colors.text}; padding: 5px 14px; border-radius: 9999px; font-size: 13px; font-weight: 600; shrink: 0;">${s.type}</span>
                            <div>
                                <div style="font-weight: 700; font-size: 15px; display: flex; align-items: center; gap: 8px;">
                                    <span>${title}</span>
                                    ${timeStr ? `<span style="font-size: 13px; color: var(--text-secondary); font-weight: 400;">(${timeStr})</span>` : ''}
                                </div>
                                <div style="font-size: 13px; color: var(--text-secondary); margin-top: 2px;">${dateStr} · ${hrs.toFixed(1)} 小時</div>
                            </div>
                        </div>
                        <div style="font-weight: 700; font-size: 16px; color: #715a57; text-align: right;">NT$ ${cost.toLocaleString()}</div>
                    `;

                    row.addEventListener('click', () => {
                        editingScheduleId = s.id;
                        openScheduleModalForEdit(s);
                    });

                    alltimeStatsLogList.appendChild(row);
                });
            }
        }

        if (alltimeStatsCardList) {
            alltimeStatsCardList.innerHTML = '';
            if (allCards.length === 0) {
                alltimeStatsCardList.innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 20px; font-size: 13px;">全期間尚無購課紀錄</div>';
            } else {
                [...allCards].sort((a, b) => (b.date || '').localeCompare(a.date || '')).forEach(card => {
                    const price = parseCleanPrice(card.price);
                    const colors = typeColors[card.type] || defaultTypeColor;
                    const dateStr = card.date ? normalizeDateStr(card.date) : '無日期';
                    const displayTitle = card.displayTitle || card.type;

                    const row = document.createElement('div');
                    row.className = 'stats-log-item';
                    row.style.cursor = 'pointer';
                    if (colors.cardBg) row.style.backgroundColor = colors.cardBg;

                    row.innerHTML = `
                        <div style="display: flex; align-items: center; gap: 12px; flex: 1;">
                            <span style="background-color: ${colors.bg}; color: ${colors.text}; padding: 5px 14px; border-radius: 9999px; font-size: 13px; font-weight: 600; shrink: 0;">${card.type}</span>
                            <div>
                                <div style="font-weight: 700; font-size: 15px;">${displayTitle}</div>
                                <div style="font-size: 13px; color: var(--text-secondary); margin-top: 2px;">到期日: ${dateStr}</div>
                            </div>
                        </div>
                        <div style="font-weight: 700; font-size: 16px; color: #715a57; text-align: right;">NT$ ${price.toLocaleString()}</div>
                    `;

                    row.addEventListener('click', () => {
                        editingScheduleId = card.id;
                        openCardModalForEdit(card);
                    });

                    alltimeStatsCardList.appendChild(row);
                });
            }
        }

        if (alltimeStatsShoppingList) {
            alltimeStatsShoppingList.innerHTML = '';
            if (allShoppingRecords.length === 0) {
                alltimeStatsShoppingList.innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 20px; font-size: 13px;">全期間尚無購物紀錄</div>';
            } else {
                [...allShoppingRecords].sort((a, b) => (b.date || '').localeCompare(a.date || '')).forEach(item => {
                    const price = parseCleanPrice(item.price);
                    const colors = typeColors[item.type] || defaultTypeColor;
                    const dateStr = item.date ? normalizeDateStr(item.date) : '無日期';

                    const row = document.createElement('div');
                    row.className = 'stats-log-item';
                    row.style.cursor = 'pointer';
                    if (colors.cardBg) row.style.backgroundColor = colors.cardBg;

                    row.innerHTML = `
                        <div style="display: flex; align-items: center; gap: 12px; flex: 1;">
                            <span style="background-color: ${colors.bg}; color: ${colors.text}; padding: 5px 14px; border-radius: 9999px; font-size: 13px; font-weight: 600; shrink: 0;">${item.type || '購物'}</span>
                            <div>
                                <div style="font-weight: 700; font-size: 15px; display: flex; align-items: center; gap: 8px;">
                                    <span>${item.name || item.type || '購物'}</span>
                                </div>
                                <div style="font-size: 13px; color: var(--text-secondary); margin-top: 2px;">${dateStr}</div>
                            </div>
                        </div>
                        <div style="font-weight: 700; font-size: 16px; color: #715a57; text-align: right;">NT$ ${price.toLocaleString()}</div>
                    `;

                    row.addEventListener('click', () => {
                        editingScheduleId = item.id;
                        openShoppingModalForEdit(item);
                    });

                    alltimeStatsShoppingList.appendChild(row);
                });
            }
        }
    }

    function renderExpenseDashboard() {
        const expenseTotalCost = document.getElementById('expense-total-cost');
        const expenseTotalCostSub = document.getElementById('expense-total-cost-sub');
        const expenseTotalCount = document.getElementById('expense-total-count');
        const expenseTotalCountSub = document.getElementById('expense-total-count-sub');
        const expenseActiveCards = document.getElementById('expense-active-cards');
        const expenseActiveCardsSub = document.getElementById('expense-active-cards-sub');
        const expenseShoppingTotalCost = document.getElementById('expense-shopping-total-cost');
        const expenseShoppingTotalSub = document.getElementById('expense-shopping-total-sub');
        const expensePurchaseList = document.getElementById('expense-purchase-list');
        const expenseShoppingList = document.getElementById('expense-shopping-list');

        if (!expensePurchaseList || !expenseShoppingList) return;

        const cardRecords = schedules.filter(s => s.isCard);
        const shoppingRecords = schedules.filter(s => s.isShopping);

        cardRecords.sort((a, b) => {
            const dateA = normalizeDateStr(a.startDate || a.date || '');
            const dateB = normalizeDateStr(b.startDate || b.date || '');
            return dateB.localeCompare(dateA);
        });

        shoppingRecords.sort((a, b) => {
            const dateA = normalizeDateStr(a.date || '');
            const dateB = normalizeDateStr(b.date || '');
            return dateB.localeCompare(dateA);
        });

        const todayStr = formatLocalDate(new Date());
        let totalCourseCost = 0;
        let activeCount = 0;

        cardRecords.forEach(item => {
            const price = parseCleanPrice(item.price);
            totalCourseCost += price;

            const endDateStr = normalizeDateStr(item.date);
            const isExpired = endDateStr ? (endDateStr < todayStr) : false;
            
            const rule = getCardRule(item);
            if (item.type === '單次入場') {
                const isUsed = schedules.some(s => !s.isCard && String(s.linkedCardId) === String(item.id));
                if (!isUsed && !isExpired) {
                    activeCount++;
                }
            } else if (rule) {
                const usage = getCardUsage(item.id);
                const isInfinite = rule.maxClasses === Infinity || rule.maxPractices === Infinity;
                if (isInfinite) {
                    if (!isExpired) activeCount++;
                } else {
                    const totalQuota = rule.maxClasses + rule.maxPractices;
                    const usedTotal = usage.classes + usage.practices;
                    if (!isExpired && usedTotal < totalQuota) {
                        activeCount++;
                    }
                }
            } else {
                if (!isExpired) activeCount++;
            }
        });

        let totalShoppingCost = 0;
        shoppingRecords.forEach(item => {
            totalShoppingCost += parseCleanPrice(item.price);
        });

        if (expenseTotalCost) expenseTotalCost.textContent = `NT$ ${totalCourseCost.toLocaleString()}`;
        if (expenseTotalCostSub) expenseTotalCostSub.textContent = `所有課卡與單次入場費用`;

        if (expenseTotalCount) expenseTotalCount.textContent = `${cardRecords.length} 筆`;
        if (expenseTotalCountSub) expenseTotalCountSub.textContent = `包含月卡、包卡與單次券`;

        if (expenseActiveCards) expenseActiveCards.textContent = `${activeCount} 張`;
        if (expenseActiveCardsSub) expenseActiveCardsSub.textContent = `尚未到期且尚有額度`;

        if (expenseShoppingTotalCost) expenseShoppingTotalCost.textContent = `NT$ ${totalShoppingCost.toLocaleString()}`;
        if (expenseShoppingTotalSub) expenseShoppingTotalSub.textContent = `累積 ${shoppingRecords.length} 筆裝備與用品花費`;

        // 渲染購課紀錄列表
        expensePurchaseList.innerHTML = '';
        if (cardRecords.length === 0) {
            expensePurchaseList.innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 24px; font-size: 13px;">目前尚無購課紀錄</div>';
        } else {
            cardRecords.forEach(item => {
                const price = parseCleanPrice(item.price);
                const colors = typeColors[item.type] || defaultTypeColor;
                
                let usageText = '';
                let statusBadgeHtml = '';

                const startDate = item.startDate ? normalizeDateStr(item.startDate) : '';
                const endDate = item.date ? normalizeDateStr(item.date) : '';
                const dateStr = startDate ? (endDate && endDate !== startDate ? `${startDate} ~ ${endDate}` : startDate) : (endDate || '無日期');
                const endDateStr = normalizeDateStr(item.date);
                const isExpired = endDateStr ? (endDateStr < todayStr) : false;

                const rule = getCardRule(item);
                if (item.type === '單次入場') {
                    const usedSchedule = schedules.find(s => !s.isCard && String(s.linkedCardId) === String(item.id));
                    if (usedSchedule) {
                        usageText = `已於 ${normalizeDateStr(usedSchedule.date)} 抵扣`;
                        statusBadgeHtml = `<span style="font-size: 11px; padding: 2px 8px; border-radius: 9999px; background-color: #c1b3b3; color: #514646; font-weight: 600;">使用完畢</span>`;
                    } else if (isExpired) {
                        usageText = `未使用`;
                        statusBadgeHtml = `<span style="font-size: 11px; padding: 2px 8px; border-radius: 9999px; background-color: #e9cfcb; color: #984f4f; font-weight: 600;">已過期</span>`;
                    } else {
                        usageText = `可抵扣入場 1 次`;
                        statusBadgeHtml = `<span style="font-size: 11px; padding: 2px 8px; border-radius: 9999px; background-color: #cad0c8; color: #5e6859; font-weight: 600;">有效使用中</span>`;
                    }
                } else if (rule) {
                    const usage = getCardUsage(item.id);
                    const isInfinite = rule.maxClasses === Infinity || rule.maxPractices === Infinity;
                    if (isInfinite) {
                        usageText = `期限內不限次數`;
                        if (isExpired) {
                            statusBadgeHtml = `<span style="font-size: 11px; padding: 2px 8px; border-radius: 9999px; background-color: #e9cfcb; color: #984f4f; font-weight: 600;">已過期</span>`;
                        } else {
                            statusBadgeHtml = `<span style="font-size: 11px; padding: 2px 8px; border-radius: 9999px; background-color: #cad0c8; color: #5e6859; font-weight: 600;">有效使用中</span>`;
                        }
                    } else {
                        const totalQuota = rule.maxClasses + rule.maxPractices;
                        const usedTotal = usage.classes + usage.practices;
                        
                        let parts = [];
                        if (rule.maxClasses > 0) parts.push(`課堂 ${usage.classes}/${rule.maxClasses}`);
                        if (rule.maxPractices > 0) parts.push(`練習 ${usage.practices}/${rule.maxPractices}`);
                        usageText = parts.join(' | ');

                        if (usedTotal >= totalQuota) {
                            statusBadgeHtml = `<span style="font-size: 11px; padding: 2px 8px; border-radius: 9999px; background-color: #c1b3b3; color: #514646; font-weight: 600;">使用完畢</span>`;
                        } else if (isExpired) {
                            statusBadgeHtml = `<span style="font-size: 11px; padding: 2px 8px; border-radius: 9999px; background-color: #e9cfcb; color: #984f4f; font-weight: 600;">已過期</span>`;
                        } else {
                            statusBadgeHtml = `<span style="font-size: 11px; padding: 2px 8px; border-radius: 9999px; background-color: #cad0c8; color: #5e6859; font-weight: 600;">有效使用中</span>`;
                        }
                    }
                } else {
                    usageText = item.note || '購課紀錄';
                    statusBadgeHtml = isExpired 
                        ? `<span style="font-size: 11px; padding: 2px 8px; border-radius: 9999px; background-color: #e9cfcb; color: #984f4f; font-weight: 600;">已過期</span>`
                        : `<span style="font-size: 11px; padding: 2px 8px; border-radius: 9999px; background-color: #cad0c8; color: #5e6859; font-weight: 600;">有效使用中</span>`;
                }

                const row = document.createElement('div');
                row.className = 'stats-log-item';
                row.style.cursor = 'pointer';
                if (colors.cardBg) row.style.backgroundColor = colors.cardBg;
                
                row.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 12px; flex: 1;">
                        <span style="background-color: ${colors.bg}; color: ${colors.text}; padding: 5px 14px; border-radius: 9999px; font-size: 13px; font-weight: 600; shrink: 0;">${item.displayTitle || item.type}</span>
                        <div>
                            <div style="font-weight: 700; font-size: 15px; display: flex; align-items: center; gap: 8px;">
                                <span>${dateStr}</span>
                                ${statusBadgeHtml}
                            </div>
                            <div style="font-size: 13px; color: var(--text-secondary); margin-top: 2px;">
                                ${usageText}${item.note ? ' · ' + item.note : ''}
                            </div>
                        </div>
                    </div>
                    <div style="font-weight: 700; font-size: 16px; color: #715a57; white-space: nowrap;">NT$ ${price.toLocaleString()}</div>
                `;

                row.addEventListener('click', () => {
                    editingScheduleId = item.id;
                    openCardModalForEdit(item);
                });

                expensePurchaseList.appendChild(row);
            });
        }

        // 渲染購物紀錄列表
        expenseShoppingList.innerHTML = '';
        if (shoppingRecords.length === 0) {
            expenseShoppingList.innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 24px; font-size: 13px;">目前尚無購物紀錄</div>';
        } else {
            shoppingRecords.forEach(item => {
                const price = parseCleanPrice(item.price);
                const colors = typeColors[item.type] || defaultTypeColor;
                const dateStr = item.date ? normalizeDateStr(item.date) : '無日期';
                
                const row = document.createElement('div');
                row.className = 'stats-log-item';
                row.style.cursor = 'pointer';
                if (colors.cardBg) row.style.backgroundColor = colors.cardBg;

                let rightSideHtml = `<div style="font-weight: 700; font-size: 16px; color: #715a57; white-space: nowrap;">NT$ ${price.toLocaleString()}</div>`;
                if (item.url) {
                    const linkIcon = `<a href="${item.url}" target="_blank" onclick="event.stopPropagation();" style="display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; background: rgba(113, 90, 87, 0.1); border-radius: 50%; color: #715a57; text-decoration: none; margin-left: 8px;" title="開啟連結"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg></a>`;
                    rightSideHtml = `<div style="display: flex; align-items: center;">${rightSideHtml}${linkIcon}</div>`;
                }

                row.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 12px; flex: 1;">
                        <span style="background-color: ${colors.bg}; color: ${colors.text}; padding: 5px 14px; border-radius: 9999px; font-size: 13px; font-weight: 600; shrink: 0;">${item.type || '購物'}</span>
                        <div>
                            <div style="font-weight: 700; font-size: 15px; display: flex; align-items: center; gap: 8px;">
                                <span>${dateStr}</span>
                            </div>
                            <div style="font-size: 13px; color: var(--text-secondary); margin-top: 2px;">
                                ${item.name || item.note || '購物紀錄'}
                            </div>
                        </div>
                    </div>
                    ${rightSideHtml}
                `;

                row.addEventListener('click', () => {
                    editingScheduleId = item.id;
                    openShoppingModalForEdit(item);
                });

                expenseShoppingList.appendChild(row);
            });
        }
    }

    function initStatsModeSelector() {
        const wrapper = document.getElementById('stats-mode-wrapper');
        const trigger = document.getElementById('stats-mode-trigger');
        const menuEl = document.getElementById('stats-mode-menu');
        const displaySpan = document.getElementById('stats-mode-display');
        const hiddenInput = document.getElementById('stats-mode-select');
        const monthlyContent = document.getElementById('stats-monthly-content');
        const yearlyContent = document.getElementById('stats-yearly-content');
        const alltimeContent = document.getElementById('stats-alltime-content');
        const placeholderContent = document.getElementById('stats-placeholder-content');
        const expenseContent = document.getElementById('stats-expense-content');
        const monthSelectorGroup = document.querySelector('.dashboard-month-selector');

        if (!trigger || !menuEl) return;

        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = menuEl.classList.contains('show');
            if (isOpen) {
                menuEl.classList.remove('show');
                if (wrapper) wrapper.classList.remove('open');
            } else {
                menuEl.classList.add('show');
                if (wrapper) wrapper.classList.add('open');
            }
        });

        const options = menuEl.querySelectorAll('.custom-select-option');
        options.forEach(opt => {
            opt.addEventListener('click', (e) => {
                e.stopPropagation();
                const mode = opt.dataset.value;
                if (hiddenInput) hiddenInput.value = mode;
                if (displaySpan) displaySpan.textContent = mode;
                
                options.forEach(o => o.classList.remove('selected'));
                opt.classList.add('selected');

                if (menuEl) menuEl.classList.remove('show');
                if (wrapper) wrapper.classList.remove('open');

                const statsPrevBtn = document.getElementById('stats-prev-month');
                const statsNextBtn = document.getElementById('stats-next-month');

                if (mode === '每月總覽') {
                    if (monthlyContent) monthlyContent.style.display = 'block';
                    if (yearlyContent) yearlyContent.style.display = 'none';
                    if (alltimeContent) alltimeContent.style.display = 'none';
                    if (placeholderContent) placeholderContent.style.display = 'none';
                    if (expenseContent) expenseContent.style.display = 'none';
                    if (monthSelectorGroup) monthSelectorGroup.style.display = 'flex';
                    if (statsPrevBtn) statsPrevBtn.style.visibility = 'visible';
                    if (statsNextBtn) statsNextBtn.style.visibility = 'visible';
                    renderStatsDashboard();
                } else if (mode === '年度總覽') {
                    if (monthlyContent) monthlyContent.style.display = 'none';
                    if (yearlyContent) yearlyContent.style.display = 'block';
                    if (alltimeContent) alltimeContent.style.display = 'none';
                    if (placeholderContent) placeholderContent.style.display = 'none';
                    if (expenseContent) expenseContent.style.display = 'none';
                    if (monthSelectorGroup) monthSelectorGroup.style.display = 'flex';
                    if (statsPrevBtn) statsPrevBtn.style.visibility = 'visible';
                    if (statsNextBtn) statsNextBtn.style.visibility = 'visible';
                    renderYearlyDashboard();
                } else if (mode === '全期間總覽') {
                    if (monthlyContent) monthlyContent.style.display = 'none';
                    if (yearlyContent) yearlyContent.style.display = 'none';
                    if (alltimeContent) alltimeContent.style.display = 'block';
                    if (placeholderContent) placeholderContent.style.display = 'none';
                    if (expenseContent) expenseContent.style.display = 'none';
                    if (monthSelectorGroup) monthSelectorGroup.style.display = 'flex';
                    renderAllTimeDashboard();
                } else if (mode === '開銷總覽') {
                    if (monthlyContent) monthlyContent.style.display = 'none';
                    if (yearlyContent) yearlyContent.style.display = 'none';
                    if (alltimeContent) alltimeContent.style.display = 'none';
                    if (placeholderContent) placeholderContent.style.display = 'none';
                    if (expenseContent) expenseContent.style.display = 'flex';
                    if (monthSelectorGroup) monthSelectorGroup.style.display = 'none';
                    renderExpenseDashboard();
                } else {
                    if (monthlyContent) monthlyContent.style.display = 'none';
                    if (yearlyContent) yearlyContent.style.display = 'none';
                    if (alltimeContent) alltimeContent.style.display = 'none';
                    if (expenseContent) expenseContent.style.display = 'none';
                    if (placeholderContent) {
                        placeholderContent.style.display = 'flex';
                        placeholderContent.textContent = '';
                    }
                    if (monthSelectorGroup) monthSelectorGroup.style.display = 'none';
                }
            });
        });

        document.addEventListener('click', (e) => {
            if (!e.target.closest('#stats-mode-wrapper')) {
                if (menuEl) menuEl.classList.remove('show');
                if (wrapper) wrapper.classList.remove('open');
            }
        });
    }

    initStatsModeSelector();

    let scrollTimeout = null;
    let touchStartY = 0;
    
    function changeMonthByScroll(delta) {
        if (scrollTimeout || currentTab !== 'calendar') return;
        if (currentViewMode === 'month') {
            // 月視圖採用順暢原生垂直連續捲動，不觸發 renderView 重繪
            return;
        } else {
            currentDate.setFullYear(currentDate.getFullYear() + delta);
        }
        renderView();
        scrollTimeout = setTimeout(() => {
            scrollTimeout = null;
        }, 500);
    }

    const scrollTarget = calendarGrid || yearCalendarView;
    if (scrollTarget) {
        document.body.addEventListener('wheel', (e) => {
            if (e.target.closest('#calendar-grid, #year-calendar-view')) {
                if (Math.abs(e.deltaY) > 20) {
                    if (e.deltaY > 0) {
                        changeMonthByScroll(1);
                    } else {
                        changeMonthByScroll(-1);
                    }
                }
            }
        }, { passive: true });
    }

    // ---- 動作練習影片 / 參考資料庫 邏輯 (Database & Bookmark Logic) ----
    let activeDbTab = 'video'; // 'video' | 'bookmark'
    let videos = loadVideos();
    let currentSelectedCategory = 'ALL';
    let videoSearchKeyword = '';
    let editingVideoId = null;

    let bookmarks = loadBookmarks();
    let currentBookmarkCategory = 'ALL';
    let bookmarkSearchKeyword = '';
    let editingBookmarkId = null;

    function loadVideos() {
        try {
            const raw = localStorage.getItem('skating_videos_db');
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) return parsed;
            }
        } catch (e) {
            console.error('Failed to load videos:', e);
        }
        return [
            {
                id: 'v1',
                title: 'Axel (1A) 一圈半跳躍起跳與空中軸心技術示範',
                url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
                category: '跳躍',
                cover: '',
                note: '注意前外刃進入弧線與左腿擺動帶動起跳高度。'
            },
            {
                id: 'v2',
                title: 'Camel Spin 燕式旋轉伸展與抓腳進階訓練',
                url: 'https://youtube.com/shorts/3JX25bV4Nkc',
                category: '旋轉',
                cover: '',
                note: '水平支撐軸心維持，核心收緊避免掉轉。'
            },
            {
                id: 'v3',
                title: 'Twizzle 雙向旋轉步法練習與平衡控刃',
                url: 'https://www.instagram.com/reels/C1234567890/',
                category: '步法',
                cover: '',
                note: '轉體時膝蓋保持微彈性，兩次轉體間不換刃。'
            }
        ];
    }

    function saveVideos(data) {
        try {
            localStorage.setItem('skating_videos_db', JSON.stringify(data));
        } catch (e) {
            console.error('Failed to save videos:', e);
        }
    }

    function loadBookmarks() {
        try {
            const raw = localStorage.getItem('skating_bookmarks_db');
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) return parsed;
            }
        } catch (e) {
            console.error('Failed to load bookmarks:', e);
        }
        return [
            {
                id: 'bm1',
                title: 'ISU 花式滑冰單人滑與雙人滑技術規則指南',
                url: 'https://www.isu.org/figure-skating/rules/sandp-handbooks-faq',
                category: '跳躍',
                note: '包含跳躍週數（Under-rotated / Downgraded）判定標準與 GOE 加減分細節。'
            },
            {
                id: 'bm2',
                title: 'U.S. Figure Skating 官方練習與訓練技巧教學資料庫',
                url: 'https://www.usfigureskating.org/skate/skills-and-levels',
                category: '步法',
                note: '提供 Moves in the Field 各等級步法刃邊（Edges）與壓步訓練建議。'
            },
            {
                id: 'bm3',
                title: '陸上轉體與花滑核心爆發力訓練專題',
                url: 'https://www.skatingfirst.com/off-ice-training-guide',
                category: '陸上訓練',
                note: '適合居家練習的垂直跳躍、旋轉軸心與伸展拉筋技巧教學。'
            }
        ];
    }

    function saveBookmarks(data) {
        try {
            localStorage.setItem('skating_bookmarks_db', JSON.stringify(data));
        } catch (e) {
            console.error('Failed to save bookmarks:', e);
        }
    }

    // 漢堡選單與分頁切換邏輯
    const dbHamburgerBtn = document.getElementById('db-hamburger-btn');
    const dbMenuDropdown = document.getElementById('db-menu-dropdown');
    const dbCurrentTitle = document.getElementById('db-current-title');
    const videoSubview = document.getElementById('video-subview');
    const bookmarkSubview = document.getElementById('bookmark-subview');
    const addVideoBtn = document.getElementById('add-video-btn');
    const addBookmarkBtn = document.getElementById('add-bookmark-btn');

    if (dbHamburgerBtn && dbMenuDropdown) {
        dbHamburgerBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isShown = dbMenuDropdown.style.display === 'flex';
            dbMenuDropdown.style.display = isShown ? 'none' : 'flex';
        });

        document.addEventListener('click', (e) => {
            if (!dbMenuDropdown.contains(e.target) && e.target !== dbHamburgerBtn) {
                dbMenuDropdown.style.display = 'none';
            }
        });

        const menuItems = dbMenuDropdown.querySelectorAll('.db-menu-item');
        menuItems.forEach(item => {
            item.addEventListener('click', () => {
                const tab = item.dataset.tab;
                switchDbSubtab(tab);
                dbMenuDropdown.style.display = 'none';
            });
        });
    }

    function switchDbSubtab(tab) {
        activeDbTab = tab;
        const menuItems = document.querySelectorAll('#db-menu-dropdown .db-menu-item');
        menuItems.forEach(item => {
            if (item.dataset.tab === tab) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        if (tab === 'video') {
            if (dbCurrentTitle) dbCurrentTitle.textContent = '動作練習影片庫';
            if (videoSubview) videoSubview.style.display = 'block';
            if (bookmarkSubview) bookmarkSubview.style.display = 'none';
            if (addVideoBtn) addVideoBtn.style.display = 'flex';
            if (addBookmarkBtn) addBookmarkBtn.style.display = 'none';
            renderDatabaseView();
        } else if (tab === 'bookmark') {
            if (dbCurrentTitle) dbCurrentTitle.textContent = '參考資料庫';
            if (videoSubview) videoSubview.style.display = 'none';
            if (bookmarkSubview) bookmarkSubview.style.display = 'block';
            if (addVideoBtn) addVideoBtn.style.display = 'none';
            if (addBookmarkBtn) addBookmarkBtn.style.display = 'flex';
            renderBookmarkView();
        }
    }

    function detectVideoPlatform(url) {
        if (!url || typeof url !== 'string') return { platform: 'other', label: 'Video', videoId: '' };
        const cleanUrl = url.trim();

        if (cleanUrl.includes('youtube.com/shorts/') || cleanUrl.includes('youtu.be/shorts/')) {
            const parts = cleanUrl.split('/shorts/');
            const videoId = parts[1] ? parts[1].split('?')[0].split('/')[0] : '';
            return { platform: 'shorts', label: 'Shorts', videoId };
        }

        if (cleanUrl.includes('youtube.com') || cleanUrl.includes('youtu.be')) {
            let videoId = '';
            if (cleanUrl.includes('youtu.be/')) {
                videoId = cleanUrl.split('youtu.be/')[1].split('?')[0];
            } else if (cleanUrl.includes('v=')) {
                videoId = cleanUrl.split('v=')[1].split('&')[0];
            }
            return { platform: 'youtube', label: 'YouTube', videoId };
        }

        if (cleanUrl.includes('instagram.com/reels/') || cleanUrl.includes('instagram.com/reel/')) {
            return { platform: 'reels', label: 'Reels', videoId: '' };
        }

        if (cleanUrl.includes('xiaohongshu.com') || cleanUrl.includes('xhslink.com') || cleanUrl.includes('rednote')) {
            return { platform: 'rednote', label: '小紅書', videoId: '' };
        }

        return { platform: 'other', label: '影片', videoId: '' };
    }

    function getVideoThumbnailUrl(video) {
        if (video.cover && video.cover.trim() !== '') {
            return video.cover.trim();
        }
        const info = detectVideoPlatform(video.url);
        if ((info.platform === 'youtube' || info.platform === 'shorts') && info.videoId) {
            return `https://img.youtube.com/vi/${info.videoId}/hqdefault.jpg`;
        }
        return '';
    }

    function renderDatabaseView() {
        const grid = document.getElementById('video-grid');
        if (!grid) return;

        grid.innerHTML = '';

        let filtered = videos.filter(v => {
            if (currentSelectedCategory !== 'ALL' && v.category !== currentSelectedCategory) {
                return false;
            }
            if (videoSearchKeyword) {
                const target = `${v.title || ''} ${v.note || ''} ${v.category || ''}`.toLowerCase();
                if (!target.includes(videoSearchKeyword.toLowerCase())) {
                    return false;
                }
            }
            return true;
        });

        if (filtered.length === 0) {
            grid.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; color: var(--text-secondary); padding: 40px 20px; font-size: 14px;">
                    尚無符合條件的動作練習影片，點選右上角「新增影片」開始收藏！
                </div>
            `;
            return;
        }

        filtered.forEach(video => {
            const card = document.createElement('div');
            card.className = 'video-card';

            const thumbUrl = getVideoThumbnailUrl(video);
            const platformInfo = detectVideoPlatform(video.url);

            let thumbHtml = '';
            if (thumbUrl) {
                thumbHtml = `<img src="${thumbUrl}" class="video-thumb-img" alt="${video.title}" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                <div class="video-thumb-generated" style="display: none;">
                    <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2"><polygon points="8 5 19 12 8 19"></polygon></svg>
                    <div class="gen-title">${video.title}</div>
                </div>`;
            } else {
                thumbHtml = `
                <div class="video-thumb-generated">
                    <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2"><polygon points="8 5 19 12 8 19"></polygon></svg>
                    <div class="gen-title">${video.title}</div>
                </div>`;
            }

            card.innerHTML = `
                <div class="video-thumb-wrapper">
                    <span class="video-platform-badge ${platformInfo.platform}">${platformInfo.label}</span>
                    ${thumbHtml}
                    <div class="video-play-btn">
                        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><polygon points="8 5 19 12 8 19"></polygon></svg>
                    </div>
                </div>
                <div class="video-card-body">
                    <div class="video-card-header-row">
                        <h3 class="video-card-title">${video.title}</h3>
                        <span class="video-card-category">${video.category || '未分類'}</span>
                    </div>
                    <div class="video-card-note">${video.note || '無練習備註'}</div>
                    <div class="video-card-footer">
                        <a href="${video.url}" target="_blank" rel="noopener noreferrer" class="video-open-link-btn">
                            在 ${platformInfo.label} 觀看
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                        </a>
                        <div class="video-actions-btns">
                            <button class="video-action-icon edit-video-btn" title="編輯影片">
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                            </button>
                        </div>
                    </div>
                </div>
            `;

            const thumbWrapper = card.querySelector('.video-thumb-wrapper');
            if (thumbWrapper) {
                thumbWrapper.addEventListener('click', () => {
                    window.open(video.url, '_blank');
                });
            }

            const editBtn = card.querySelector('.edit-video-btn');
            if (editBtn) {
                editBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    openVideoModalForEdit(video);
                });
            }

            grid.appendChild(card);
        });
    }

    // 分類 Pills 與搜尋事件綁定
    const videoCategoryPills = document.getElementById('video-category-pills');
    if (videoCategoryPills) {
        const pills = videoCategoryPills.querySelectorAll('.video-cat-pill');
        pills.forEach(pill => {
            pill.addEventListener('click', () => {
                pills.forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                currentSelectedCategory = pill.dataset.category || 'ALL';
                renderDatabaseView();
            });
        });
    }

    const videoSearchInput = document.getElementById('video-search-input');
    if (videoSearchInput) {
        videoSearchInput.addEventListener('input', (e) => {
            videoSearchKeyword = e.target.value.trim();
            renderDatabaseView();
        });
    }

    // 影片 Modal 控制 logic
    const videoModalOverlay = document.getElementById('video-modal-overlay');
    const videoForm = document.getElementById('video-form');
    const videoModalTitle = document.getElementById('video-modal-title');
    const videoDeleteBtn = document.getElementById('video-delete-btn');
    const videoCancelBtn = document.getElementById('video-cancel-btn');

    initCustomSelect('video-category-trigger', 'video-category-menu', 'video-category-wrapper', 'video-category-select', 'video-category-display');

    function closeVideoModal() {
        if (videoModalOverlay) videoModalOverlay.classList.remove('show');
        if (videoForm) videoForm.reset();
        editingVideoId = null;
    }

    function openVideoModal() {
        editingVideoId = null;
        if (videoModalTitle) videoModalTitle.textContent = '新增影片';
        if (videoDeleteBtn) videoDeleteBtn.style.display = 'none';
        if (videoForm) videoForm.reset();
        safeSetRadioValue('video-category', '跳躍');
        if (videoModalOverlay) videoModalOverlay.classList.add('show');
    }

    function openVideoModalForEdit(video) {
        editingVideoId = video.id;
        if (videoModalTitle) videoModalTitle.textContent = '編輯影片';
        if (videoDeleteBtn) videoDeleteBtn.style.display = 'block';

        const titleInput = document.getElementById('video-title');
        const urlInput = document.getElementById('video-url');
        const coverInput = document.getElementById('video-cover');
        const noteInput = document.getElementById('video-note');

        if (titleInput) titleInput.value = video.title || '';
        if (urlInput) urlInput.value = video.url || '';
        if (coverInput) coverInput.value = video.cover || '';
        if (noteInput) noteInput.value = video.note || '';

        safeSetRadioValue('video-category', video.category || '跳躍');
        if (videoModalOverlay) videoModalOverlay.classList.add('show');
    }

    if (addVideoBtn) addVideoBtn.addEventListener('click', openVideoModal);
    if (videoCancelBtn) videoCancelBtn.addEventListener('click', closeVideoModal);
    if (videoModalOverlay) {
        videoModalOverlay.addEventListener('click', (e) => {
            if (e.target === videoModalOverlay) closeVideoModal();
        });
    }

    if (videoForm) {
        videoForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const title = document.getElementById('video-title').value;
            const url = document.getElementById('video-url').value;
            const category = safeGetRadioValue('video-category');
            const cover = document.getElementById('video-cover').value;
            const note = document.getElementById('video-note').value;

            if (editingVideoId) {
                const idx = videos.findIndex(v => String(v.id) === String(editingVideoId));
                if (idx > -1) {
                    videos[idx].title = title;
                    videos[idx].url = url;
                    videos[idx].category = category;
                    videos[idx].cover = cover;
                    videos[idx].note = note;
                }
            } else {
                videos.unshift({
                    id: 'v-' + Date.now(),
                    title: title,
                    url: url,
                    category: category,
                    cover: cover,
                    note: note
                });
            }

            saveVideos(videos);
            renderDatabaseView();
            closeVideoModal();
        });
    }

    if (videoDeleteBtn) {
        videoDeleteBtn.addEventListener('click', () => {
            if (editingVideoId) {
                videos = videos.filter(v => String(v.id) !== String(editingVideoId));
                saveVideos(videos);
                renderDatabaseView();
                closeVideoModal();
            }
        });
    }

    // ---- 參考資料庫 (Bookmark Database Logic) ----
    function extractDomain(urlStr) {
        if (!urlStr) return 'LINK';
        try {
            const u = new URL(urlStr.startsWith('http') ? urlStr : 'https://' + urlStr);
            return u.hostname.replace('www.', '');
        } catch(e) {
            return 'BOOKMARK';
        }
    }

    function renderBookmarkView() {
        const grid = document.getElementById('bookmark-grid');
        if (!grid) return;

        grid.innerHTML = '';

        let filtered = bookmarks.filter(b => {
            if (currentBookmarkCategory !== 'ALL' && b.category !== currentBookmarkCategory) {
                return false;
            }
            if (bookmarkSearchKeyword) {
                const target = `${b.title || ''} ${b.url || ''} ${b.note || ''} ${b.category || ''}`.toLowerCase();
                if (!target.includes(bookmarkSearchKeyword.toLowerCase())) {
                    return false;
                }
            }
            return true;
        });

        if (filtered.length === 0) {
            grid.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; color: var(--text-secondary); padding: 40px 20px; font-size: 14px;">
                    尚無符合條件的學習網址，點選右上角「新增網址」開始收藏！
                </div>
            `;
            return;
        }

        filtered.forEach(bm => {
            const card = document.createElement('div');
            card.className = 'bookmark-card';

            const domain = extractDomain(bm.url);

            card.innerHTML = `
                <div class="bookmark-card-top">
                    <div class="bookmark-icon-badge">
                        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                        </svg>
                    </div>
                    <span class="bookmark-domain-badge">${domain}</span>
                </div>
                <div class="bookmark-card-body">
                    <div class="bookmark-card-header-row">
                        <h3 class="bookmark-card-title">${bm.title}</h3>
                        <span class="video-card-category">${bm.category || '未分類'}</span>
                    </div>
                    <div class="bookmark-card-url">
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                        ${bm.url}
                    </div>
                    <div class="bookmark-card-note">${bm.note || '無備註'}</div>
                    <div class="video-card-footer">
                        <a href="${bm.url}" target="_blank" rel="noopener noreferrer" class="video-open-link-btn">
                            前往網站
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                        </a>
                        <div class="video-actions-btns">
                            <button class="video-action-icon edit-bookmark-btn" title="編輯網址">
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                            </button>
                        </div>
                    </div>
                </div>
            `;

            card.addEventListener('click', (e) => {
                if (!e.target.closest('.edit-bookmark-btn') && !e.target.closest('.video-open-link-btn')) {
                    window.open(bm.url, '_blank');
                }
            });

            const editBtn = card.querySelector('.edit-bookmark-btn');
            if (editBtn) {
                editBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    openBookmarkModalForEdit(bm);
                });
            }

            grid.appendChild(card);
        });
    }

    // 書籤分類 Pills 與搜尋綁定
    const bookmarkCategoryPills = document.getElementById('bookmark-category-pills');
    if (bookmarkCategoryPills) {
        const pills = bookmarkCategoryPills.querySelectorAll('.video-cat-pill');
        pills.forEach(pill => {
            pill.addEventListener('click', () => {
                pills.forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                currentBookmarkCategory = pill.dataset.category || 'ALL';
                renderBookmarkView();
            });
        });
    }

    const bookmarkSearchInput = document.getElementById('bookmark-search-input');
    if (bookmarkSearchInput) {
        bookmarkSearchInput.addEventListener('input', (e) => {
            bookmarkSearchKeyword = e.target.value.trim();
            renderBookmarkView();
        });
    }

    // 書籤 Modal 控制 logic
    const bookmarkModalOverlay = document.getElementById('bookmark-modal-overlay');
    const bookmarkForm = document.getElementById('bookmark-form');
    const bookmarkModalTitle = document.getElementById('bookmark-modal-title');
    const bookmarkDeleteBtn = document.getElementById('bookmark-delete-btn');
    const bookmarkCancelBtn = document.getElementById('bookmark-cancel-btn');

    initCustomSelect('bookmark-category-trigger', 'bookmark-category-menu', 'bookmark-category-wrapper', 'bookmark-category-select', 'bookmark-category-display');

    function closeBookmarkModal() {
        if (bookmarkModalOverlay) bookmarkModalOverlay.classList.remove('show');
        if (bookmarkForm) bookmarkForm.reset();
        editingBookmarkId = null;
    }

    function openBookmarkModal() {
        editingBookmarkId = null;
        if (bookmarkModalTitle) bookmarkModalTitle.textContent = '新增網址書籤';
        if (bookmarkDeleteBtn) bookmarkDeleteBtn.style.display = 'none';
        if (bookmarkForm) bookmarkForm.reset();
        safeSetRadioValue('bookmark-category', '跳躍');
        if (bookmarkModalOverlay) bookmarkModalOverlay.classList.add('show');
    }

    function openBookmarkModalForEdit(bm) {
        editingBookmarkId = bm.id;
        if (bookmarkModalTitle) bookmarkModalTitle.textContent = '編輯網址書籤';
        if (bookmarkDeleteBtn) bookmarkDeleteBtn.style.display = 'block';

        const titleInput = document.getElementById('bookmark-title');
        const urlInput = document.getElementById('bookmark-url');
        const noteInput = document.getElementById('bookmark-note');

        if (titleInput) titleInput.value = bm.title || '';
        if (urlInput) urlInput.value = bm.url || '';
        if (noteInput) noteInput.value = bm.note || '';

        safeSetRadioValue('bookmark-category', bm.category || '跳躍');
        if (bookmarkModalOverlay) bookmarkModalOverlay.classList.add('show');
    }

    if (addBookmarkBtn) addBookmarkBtn.addEventListener('click', openBookmarkModal);
    if (bookmarkCancelBtn) bookmarkCancelBtn.addEventListener('click', closeBookmarkModal);
    if (bookmarkModalOverlay) {
        bookmarkModalOverlay.addEventListener('click', (e) => {
            if (e.target === bookmarkModalOverlay) closeBookmarkModal();
        });
    }

    if (bookmarkForm) {
        bookmarkForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const title = document.getElementById('bookmark-title').value;
            const url = document.getElementById('bookmark-url').value;
            const category = safeGetRadioValue('bookmark-category');
            const note = document.getElementById('bookmark-note').value;

            if (editingBookmarkId) {
                const idx = bookmarks.findIndex(b => String(b.id) === String(editingBookmarkId));
                if (idx > -1) {
                    bookmarks[idx].title = title;
                    bookmarks[idx].url = url;
                    bookmarks[idx].category = category;
                    bookmarks[idx].note = note;
                }
            } else {
                bookmarks.unshift({
                    id: 'bm-' + Date.now(),
                    title: title,
                    url: url,
                    category: category,
                    note: note
                });
            }

            saveBookmarks(bookmarks);
            renderBookmarkView();
            closeBookmarkModal();
        });
    }

    if (bookmarkDeleteBtn) {
        bookmarkDeleteBtn.addEventListener('click', () => {
            if (editingBookmarkId) {
                bookmarks = bookmarks.filter(b => String(b.id) !== String(editingBookmarkId));
                saveBookmarks(bookmarks);
                renderBookmarkView();
                closeBookmarkModal();
            }
        });
    }

    // 資料備份與還原邏輯
    const exportBtn = document.getElementById('export-btn');
    const importBtn = document.getElementById('import-btn');
    const importFileInput = document.getElementById('import-file-input');

    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            let currentVideos = [];
            try {
                const storedVids = localStorage.getItem('skating_videos_db');
                currentVideos = storedVids ? JSON.parse(storedVids) : (window.skatingVideos || []);
            } catch (e) {
                currentVideos = window.skatingVideos || [];
            }
            const dataToExport = {
                schedules: schedules,
                videos: currentVideos
            };
            const jsonStr = JSON.stringify(dataToExport, null, 2);
            const blob = new Blob([jsonStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const today = formatLocalDate(new Date());
            const a = document.createElement('a');
            a.href = url;
            a.download = `運動紀錄備份_${today}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });
    }

    if (importBtn && importFileInput) {
        importBtn.addEventListener('click', () => {
            importFileInput.click();
        });

        importFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const importedData = JSON.parse(event.target.result);
                    
                    if (importedData.schedules && Array.isArray(importedData.schedules)) {
                        schedules = importedData.schedules;
                        saveSchedules(schedules);
                    }
                    
                    if (importedData.videos && Array.isArray(importedData.videos)) {
                        window.skatingVideos = importedData.videos;
                        if (typeof saveVideosToStorage === 'function') {
                            saveVideosToStorage(window.skatingVideos);
                        } else {
                            localStorage.setItem('skating_videos_db', JSON.stringify(window.skatingVideos));
                        }
                    }
                    
                    alert('資料匯入成功！系統將為您重新載入畫面。');
                    importFileInput.value = ''; // Reset input
                    
                    renderView();
                } catch (err) {
                    alert('匯入失敗：檔案格式錯誤或損毀。');
                    console.error('Import error:', err);
                }
            };
            reader.readAsText(file);
        });
    }

    // 綁定明細彈窗關閉事件
    const closeBreakdownModalBtn = document.getElementById('close-breakdown-modal');
    const breakdownModalOverlay = document.getElementById('breakdown-modal-overlay');
    
    if (closeBreakdownModalBtn) {
        closeBreakdownModalBtn.addEventListener('click', () => {
            if (breakdownModalOverlay) {
                breakdownModalOverlay.classList.remove('show');
            }
        });
    }
    if (breakdownModalOverlay) {
        breakdownModalOverlay.addEventListener('click', (e) => {
            if (e.target === breakdownModalOverlay) {
                breakdownModalOverlay.classList.remove('show');
            }
        });
    }

    // 綁定全域底部選單分頁切換 (Calendar, Database, Stats, Settings)
    const bottomNavItems = document.querySelectorAll('.bottom-nav-item');
    bottomNavItems.forEach(item => {
        item.addEventListener('click', () => {
            const tab = item.dataset.tab;
            if (!tab) return;
            currentTab = tab;
            bottomNavItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            renderView();
        });
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startApp);
} else {
    startApp();
}

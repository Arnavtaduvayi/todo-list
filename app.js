(() => {
  const DAYS = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const STORAGE_KEY = 'weekly-todo-data';

  // --- Firebase ---
  const firebaseConfig = {
    apiKey: "AIzaSyAJNMNWSNTwxpuo-3CGcaK3VOp-R7QQcLA",
    authDomain: "todo-list-c4e6c.firebaseapp.com",
    databaseURL: "https://todo-list-c4e6c-default-rtdb.firebaseio.com",
    projectId: "todo-list-c4e6c",
    storageBucket: "todo-list-c4e6c.firebasestorage.app",
    messagingSenderId: "463191552505",
    appId: "1:463191552505:web:820f0b9b8a733efba80d28",
    measurementId: "G-NVE23FKTLS"
  };

  firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth();
  const db = firebase.database();

  let currentUser = null;
  let dbRef = null;
  let weekOffset = 0;
  let dragData = null;
  let allData = {};
  let initialScrollDone = false;
  let selectedTasks = []; // Array of { wk, dayIndex, todoIndex }

  // --- Theme ---
  const THEME_KEY = 'weekly-todo-theme';
  const themeSelect = document.getElementById('theme-select');
  const THEME_COLORS = {
    dark: '#0a0a0a', cute: '#fff0f5', ocean: '#0b1520',
    forest: '#0a1510', lavender: '#f5f0ff', sunset: '#1a0e0a'
  };

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    themeSelect.value = theme;
    localStorage.setItem(THEME_KEY, theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = THEME_COLORS[theme] || '#0a0a0a';
  }

  // Load saved theme immediately (before Firebase)
  applyTheme(localStorage.getItem(THEME_KEY) || 'dark');
  themeSelect.addEventListener('change', () => {
    applyTheme(themeSelect.value);
    if (dbRef) dbRef.child('_settings/theme').set(themeSelect.value);
  });

  // --- Auth UI ---
  const authBar = document.getElementById('auth-bar');
  const signInBtn = document.getElementById('sign-in-btn');

  signInBtn.addEventListener('click', () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(err => {
      // Popup blocked on mobile — fall back to redirect
      if (err.code === 'auth/popup-blocked' || err.code === 'auth/cancelled-popup-request') {
        auth.signInWithRedirect(provider);
      }
    });
  });

  auth.onAuthStateChanged(user => {
    currentUser = user;
    if (user) {
      authBar.innerHTML = `<span class="auth-user">${user.displayName || user.email}</span><button id="sign-out-btn" class="nav-btn">Sign out</button>`;
      document.getElementById('sign-out-btn').addEventListener('click', () => auth.signOut());

      // Listen to this user's data in Firebase
      dbRef = db.ref('users/' + user.uid);
      dbRef.on('value', snapshot => {
        const fbData = snapshot.val();
        if (fbData) {
          // Apply synced theme from other devices
          if (fbData._settings && fbData._settings.theme) {
            applyTheme(fbData._settings.theme);
          }
          allData = fbData;
          saveLocal(allData);
        } else {
          // First sign-in: push localStorage data up to Firebase
          allData = loadLocal();
          if (Object.keys(allData).length > 0) {
            dbRef.set(allData);
          }
          // Push current theme to Firebase
          const currentTheme = localStorage.getItem(THEME_KEY) || 'dark';
          dbRef.child('_settings/theme').set(currentTheme);
        }
        render();
      });
    } else {
      authBar.innerHTML = '<button id="sign-in-btn" class="nav-btn">Sign in with Google</button>';
      document.getElementById('sign-in-btn').addEventListener('click', () => {
        const provider = new firebase.auth.GoogleAuthProvider();
        auth.signInWithPopup(provider).catch(err => {
          if (err.code === 'auth/popup-blocked' || err.code === 'auth/cancelled-popup-request') {
            auth.signInWithRedirect(provider);
          }
        });
      });

      if (dbRef) {
        dbRef.off();
        dbRef = null;
      }
      allData = loadLocal();
      render();
    }
  });

  // --- Storage ---
  function loadLocal() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch {
      return {};
    }
  }

  function saveLocal(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function getTodos(wk, dayIndex) {
    return (allData[wk] && allData[wk][dayIndex]) || [];
  }

  function setTodos(wk, dayIndex, todos) {
    if (!allData[wk]) allData[wk] = {};
    allData[wk][dayIndex] = todos;
    saveLocal(allData);
    if (dbRef) dbRef.set(allData);
  }

  // --- Week helpers ---
  function getWeekStart(offset = 0) {
    const now = new Date();
    const day = now.getDay();
    const diffToSat = day >= 6 ? day - 6 : day + 1;
    const saturday = new Date(now);
    saturday.setDate(now.getDate() - diffToSat + offset * 7);
    saturday.setHours(0, 0, 0, 0);
    return saturday;
  }

  function formatDate(date) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function weekKey(weekStart) {
    return weekStart.toISOString().split('T')[0];
  }

  function isToday(date) {
    const now = new Date();
    return date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate();
  }

  // --- Multi-select ---
  function isSelected(wk, dayIndex, todoIndex) {
    return selectedTasks.some(s => s.wk === wk && s.dayIndex === dayIndex && s.todoIndex === todoIndex);
  }

  function toggleSelect(wk, dayIndex, todoIndex) {
    const idx = selectedTasks.findIndex(s => s.wk === wk && s.dayIndex === dayIndex && s.todoIndex === todoIndex);
    if (idx >= 0) {
      selectedTasks.splice(idx, 1);
    } else {
      selectedTasks.push({ wk, dayIndex, todoIndex });
    }
    updateSelectionUI();
  }

  function clearSelection() {
    selectedTasks = [];
    updateSelectionUI();
  }

  function updateSelectionUI() {
    // Update item highlights
    document.querySelectorAll('.todo-item').forEach(el => {
      const wk = el.dataset.wk;
      const dayIndex = el.dataset.dayIndex === 'misc' ? 'misc' : parseInt(el.dataset.dayIndex);
      const todoIndex = parseInt(el.dataset.originalIdx);
      el.classList.toggle('selected', isSelected(wk, dayIndex, todoIndex));
    });

    // Update selection bar
    let bar = document.getElementById('selection-bar');
    if (selectedTasks.length > 0) {
      if (!bar) {
        bar = document.createElement('div');
        bar.id = 'selection-bar';
        bar.className = 'selection-bar';
        document.body.appendChild(bar);
      }
      bar.innerHTML = `<span>${selectedTasks.length} task${selectedTasks.length > 1 ? 's' : ''} selected</span><button id="clear-selection">Clear</button>`;
      document.getElementById('clear-selection').addEventListener('click', clearSelection);
    } else if (bar) {
      bar.remove();
    }
  }

  // Clear selection on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && selectedTasks.length > 0) {
      clearSelection();
    }
  });

  // --- Drag & Drop ---
  function handleDragStart(e, wk, dayIndex, originalIdx) {
    // If dragging a selected task, drag all selected; otherwise just drag this one
    if (isSelected(wk, dayIndex, originalIdx) && selectedTasks.length > 1) {
      dragData = { multi: true, items: [...selectedTasks] };
      // Mark all selected items as dragging
      document.querySelectorAll('.todo-item.selected').forEach(el => el.classList.add('dragging'));
    } else {
      dragData = { multi: false, wk, dayIndex, todoIndex: originalIdx };
      e.target.classList.add('dragging');
    }
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragEnd(e) {
    document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
    document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    dragData = null;
  }

  function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  function handleDragEnterList(e, listEl) {
    e.preventDefault();
    listEl.classList.add('drag-over');
  }

  function handleDragLeaveList(e, listEl) {
    if (!listEl.contains(e.relatedTarget)) {
      listEl.classList.remove('drag-over');
    }
  }

  function handleDrop(e, wk, targetDayIndex, listEl) {
    e.preventDefault();
    listEl.classList.remove('drag-over');
    if (!dragData) return;

    if (dragData.multi) {
      // --- Multi-task drop ---
      const items = dragData.items;

      // Collect the actual todo objects grouped by source day, sorted by index descending for safe splicing
      const bySource = {};
      items.forEach(s => {
        const key = s.wk + '|' + s.dayIndex;
        if (!bySource[key]) bySource[key] = { wk: s.wk, dayIndex: s.dayIndex, indices: [] };
        bySource[key].indices.push(s.todoIndex);
      });

      const movedItems = [];
      // Remove from sources (highest index first to preserve indices)
      Object.values(bySource).forEach(src => {
        src.indices.sort((a, b) => b - a);
        const srcTodos = getTodos(src.wk, src.dayIndex);
        src.indices.forEach(idx => {
          const item = srcTodos[idx];
          if (item) {
            movedItems.unshift(item); // unshift to preserve original order
            srcTodos.splice(idx, 1);
          }
        });
        setTodos(src.wk, src.dayIndex, srcTodos);
      });

      // Insert into target at the end
      const targetTodos = getTodos(wk, targetDayIndex);
      movedItems.forEach(item => targetTodos.push(item));
      setTodos(wk, targetDayIndex, targetTodos);

      selectedTasks = [];
      dragData = null;
      render();
      return;
    }

    // --- Single-task drop (original behavior) ---
    const sameDayDrag = dragData.wk === wk && dragData.dayIndex === targetDayIndex;

    // Build the display-order index map from the DOM before any mutations
    const domItems = listEl.querySelectorAll('.todo-item');
    let dropDisplayIdx = domItems.length; // default: end of list
    for (let j = 0; j < domItems.length; j++) {
      const rect = domItems[j].getBoundingClientRect();
      if (e.clientY < rect.top + rect.height / 2) {
        dropDisplayIdx = j;
        break;
      }
    }

    if (sameDayDrag) {
      // Same-day reorder: work in display-order space
      const todos = getTodos(wk, targetDayIndex);
      const indexed = todos.map((todo, idx) => ({ todo, idx }));
      const unchecked = indexed.filter(e => !e.todo.done);
      const checked = indexed.filter(e => e.todo.done);
      const displayOrder = [...unchecked, ...checked];

      // Find where the dragged item is in display order
      const dragDisplayIdx = displayOrder.findIndex(e => e.idx === dragData.todoIndex);
      if (dragDisplayIdx === -1) return;

      // Remove from display order
      const [moved] = displayOrder.splice(dragDisplayIdx, 1);

      // Adjust drop index if dragging downward
      const adjustedDrop = dropDisplayIdx > dragDisplayIdx ? dropDisplayIdx - 1 : dropDisplayIdx;

      // Insert at new display position
      displayOrder.splice(adjustedDrop, 0, moved);

      // Rebuild the data array in new display order
      const reordered = displayOrder.map(e => e.todo);
      setTodos(wk, targetDayIndex, reordered);
    } else {
      // Cross-day move
      const srcTodos = getTodos(dragData.wk, dragData.dayIndex);
      const item = srcTodos[dragData.todoIndex];
      if (!item) return;

      srcTodos.splice(dragData.todoIndex, 1);
      setTodos(dragData.wk, dragData.dayIndex, srcTodos);

      const targetTodos = getTodos(wk, targetDayIndex);
      // Map display drop position to data position
      const targetIndexed = targetTodos.map((todo, idx) => ({ todo, idx }));
      const targetUnchecked = targetIndexed.filter(e => !e.todo.done);
      const targetChecked = targetIndexed.filter(e => e.todo.done);
      const targetDisplay = [...targetUnchecked, ...targetChecked];

      let insertIdx = targetTodos.length;
      if (dropDisplayIdx < targetDisplay.length) {
        insertIdx = targetDisplay[dropDisplayIdx].idx;
      }

      targetTodos.splice(insertIdx, 0, item);
      setTodos(wk, targetDayIndex, targetTodos);
    }

    dragData = null;
    render();
  }

  // --- Carry-over ---
  function getIncompleteFromPrevWeek(currentWeekStart) {
    const prevStart = new Date(currentWeekStart);
    prevStart.setDate(prevStart.getDate() - 7);
    const prevWk = weekKey(prevStart);
    const prevWeekData = allData[prevWk];
    if (!prevWeekData) return [];

    const incomplete = [];
    DAYS.forEach((dayName, i) => {
      const todos = prevWeekData[i] || [];
      todos.forEach(todo => {
        if (!todo.done) {
          incomplete.push({ ...todo, fromDay: dayName });
        }
      });
    });
    return incomplete;
  }

  function carryOver(wk, currentWeekStart) {
    const incomplete = getIncompleteFromPrevWeek(currentWeekStart);
    if (incomplete.length === 0) return;

    const current = getTodos(wk, 0);
    incomplete.forEach(item => {
      if (!current.some(t => t.text === item.text)) {
        current.push({ text: item.text, done: false, id: Date.now() + Math.random(), carriedOver: true });
      }
    });
    setTodos(wk, 0, current);
  }

  // --- Render ---
  function render() {
    const weekStart = getWeekStart(weekOffset);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    const wk = weekKey(weekStart);

    document.getElementById('week-title').textContent =
      `${formatDate(weekStart)} — ${formatDate(weekEnd)}`;

    const container = document.getElementById('days-container');
    container.innerHTML = '';

    // Weekly progress (including misc)
    let weekTotal = 0, weekDone = 0;
    [...DAYS.map((_, idx) => idx), 'misc'].forEach(idx => {
      const t = getTodos(wk, idx);
      weekTotal += t.length;
      weekDone += t.filter(x => x.done).length;
    });
    const weekPct = weekTotal > 0 ? Math.round((weekDone / weekTotal) * 100) : 0;
    let weekProgressEl = document.getElementById('week-progress');
    if (!weekProgressEl) {
      weekProgressEl = document.createElement('div');
      weekProgressEl.id = 'week-progress';
      weekProgressEl.className = 'week-progress';
      document.querySelector('header').after(weekProgressEl);
    }
    weekProgressEl.innerHTML = weekTotal > 0
      ? `<div class="progress-bar week"><div class="progress-fill" style="width:${weekPct}%"></div><span class="progress-label">${weekDone}/${weekTotal} done (${weekPct}%)</span></div>`
      : '';

    // Carry-over banner
    const incomplete = getIncompleteFromPrevWeek(weekStart);
    let banner = document.getElementById('carryover-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'carryover-banner';
      banner.className = 'carryover-banner';
    }
    if (incomplete.length > 0) {
      const satTodos = getTodos(wk, 0);
      const alreadyCarried = incomplete.every(item => satTodos.some(t => t.text === item.text));
      if (!alreadyCarried) {
        banner.innerHTML = `<span>${incomplete.length} incomplete task${incomplete.length > 1 ? 's' : ''} from last week</span><button id="carryover-btn">Carry over</button><button id="carryover-dismiss">Dismiss</button>`;
        weekProgressEl.after(banner);
        document.getElementById('carryover-btn').onclick = () => {
          carryOver(wk, weekStart);
          render();
        };
        document.getElementById('carryover-dismiss').onclick = () => {
          banner.remove();
        };
      } else {
        banner.remove();
      }
    } else {
      banner.remove();
    }

    DAYS.forEach((dayName, i) => {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + i);
      const today = isToday(date);
      container.appendChild(buildDaySection(wk, i, dayName, formatDate(date), today));
    });

    // Misc section
    container.appendChild(buildDaySection(wk, 'misc', 'Misc', '', false));

    // Scroll today's section into view only on initial load
    if (weekOffset === 0 && !initialScrollDone) {
      const todaySection = container.querySelector('.day-header.today');
      if (todaySection) {
        todaySection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        initialScrollDone = true;
      }
    }

    // Re-apply selection bar (selection persists across renders)
    updateSelectionUI();
  }

  function buildDaySection(wk, dayIndex, label, dateStr, today) {
    const section = document.createElement('div');
    section.className = 'day-section' + (dayIndex === 'misc' ? ' misc-section' : '');

    const header = document.createElement('div');
    header.className = 'day-header' + (today ? ' today' : '');
    header.innerHTML = `
      <span class="day-label${today ? ' today' : ''}${dayIndex === 'misc' ? ' misc' : ''}">${label}</span>
      ${dateStr ? `<span class="day-date${today ? ' today' : ''}">${dateStr}</span>` : ''}
    `;
    section.appendChild(header);

    const todos = getTodos(wk, dayIndex);

    if (todos.length > 0) {
      const doneCount = todos.filter(t => t.done).length;
      const pct = Math.round((doneCount / todos.length) * 100);
      const progressWrap = document.createElement('div');
      progressWrap.className = 'progress-bar';
      progressWrap.innerHTML = `<div class="progress-fill" style="width:${pct}%"></div><span class="progress-label">${doneCount}/${todos.length}</span>`;
      section.appendChild(progressWrap);
    }

    const list = document.createElement('ul');
    list.className = 'todo-list';
    list.dataset.dayIndex = dayIndex;

    list.addEventListener('dragover', handleDragOver);
    list.addEventListener('dragenter', (e) => handleDragEnterList(e, list));
    list.addEventListener('dragleave', (e) => handleDragLeaveList(e, list));
    list.addEventListener('drop', (e) => handleDrop(e, wk, dayIndex, list));

    // Allow dropping on the entire day section (helps with empty days)
    section.addEventListener('dragover', handleDragOver);
    section.addEventListener('dragenter', (e) => {
      e.preventDefault();
      if (!section.contains(e.relatedTarget) || e.relatedTarget === null) {
        list.classList.add('drag-over');
      }
    });
    section.addEventListener('dragleave', (e) => {
      if (!section.contains(e.relatedTarget)) {
        list.classList.remove('drag-over');
      }
    });
    section.addEventListener('drop', (e) => {
      // Only handle if not already caught by the list itself
      if (!e.defaultPrevented) {
        handleDrop(e, wk, dayIndex, list);
      }
    });

    const indexed = todos.map((todo, idx) => ({ todo, idx }));
    const unchecked = indexed.filter(e => !e.todo.done);
    const checked = indexed.filter(e => e.todo.done);
    const displayOrder = [...unchecked, ...checked];

    displayOrder.forEach(({ todo, idx: originalIdx }) => {
      const li = document.createElement('li');
      li.className = 'todo-item' + (todo.done ? ' completed' : '') + (isSelected(wk, dayIndex, originalIdx) ? ' selected' : '');
      li.draggable = true;
      li.dataset.originalIdx = originalIdx;
      li.dataset.wk = wk;
      li.dataset.dayIndex = dayIndex;

      li.addEventListener('dragstart', (e) => handleDragStart(e, wk, dayIndex, originalIdx));
      li.addEventListener('dragend', handleDragEnd);

      // Multi-select: click the drag handle area (left side) to select
      li.addEventListener('click', (e) => {
        // Don't select when clicking checkbox, text, or delete button
        if (e.target.matches('input, .todo-text, .delete-btn, [contenteditable="true"]')) return;
        e.preventDefault();
        toggleSelect(wk, dayIndex, originalIdx);
      });

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = todo.done;
      checkbox.addEventListener('change', () => {
        todos[originalIdx].done = checkbox.checked;
        setTodos(wk, dayIndex, todos);
        li.classList.add('completing');
        setTimeout(render, 250);
      });

      const span = document.createElement('span');
      span.className = 'todo-text';
      span.textContent = todo.text;
      span.addEventListener('click', () => {
        if (span.contentEditable === 'true') return;
        span.contentEditable = 'true';
        span.focus();
        const range = document.createRange();
        range.selectNodeContents(span);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);

        const save = () => {
          span.contentEditable = 'false';
          const newText = span.textContent.trim();
          if (newText && newText !== todo.text) {
            todos[originalIdx].text = newText;
            setTodos(wk, dayIndex, todos);
          } else if (!newText) {
            span.textContent = todo.text;
          }
        };

        span.addEventListener('blur', save, { once: true });
        span.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            span.blur();
          } else if (e.key === 'Escape') {
            span.textContent = todo.text;
            span.blur();
          }
        });
      });

      const delBtn = document.createElement('button');
      delBtn.className = 'delete-btn';
      delBtn.textContent = '×';
      delBtn.addEventListener('click', () => {
        li.classList.add('deleting');
        setTimeout(() => {
          todos.splice(originalIdx, 1);
          setTodos(wk, dayIndex, todos);
          render();
        }, 250);
      });

      li.appendChild(checkbox);
      li.appendChild(span);
      li.appendChild(delBtn);
      list.appendChild(li);
    });

    section.appendChild(list);

    const form = document.createElement('form');
    form.className = 'add-form';
    form.innerHTML = `<input type="text" placeholder="Add a task…" aria-label="New task for ${label}"><button type="submit">+</button>`;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = form.querySelector('input');
      const text = input.value.trim();
      if (!text) return;
      const current = getTodos(wk, dayIndex);
      current.push({ text, done: false, id: Date.now() });
      setTodos(wk, dayIndex, current);
      render();
      // Re-focus the input for rapid task entry
      const newInput = document.querySelector(`[data-day-index="${dayIndex}"]`)
        ?.closest('.day-section')?.querySelector('.add-form input');
      if (newInput) newInput.focus();
    });
    section.appendChild(form);

    return section;
  }

  // --- Navigation ---
  function navigateWeek(newOffset) {
    const container = document.getElementById('days-container');
    container.classList.add('fading');
    setTimeout(() => {
      weekOffset = newOffset;
      initialScrollDone = false;
      render();
      container.classList.remove('fading');
    }, 200);
  }

  document.getElementById('prev-week').addEventListener('click', () => navigateWeek(weekOffset - 1));
  document.getElementById('next-week').addEventListener('click', () => navigateWeek(weekOffset + 1));
  document.getElementById('today-btn').addEventListener('click', () => navigateWeek(0));
})();

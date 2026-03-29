(() => {
  const DAYS = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const STORAGE_KEY = 'weekly-todo-data';

  let weekOffset = 0;
  let dragData = null; // { wk, dayIndex, todoIndex }

  // Get the Saturday that starts the current week (Sat-Fri)
  function getWeekStart(offset = 0) {
    const now = new Date();
    const day = now.getDay(); // 0=Sun, 6=Sat
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

  // --- Storage ---
  function loadAll() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch {
      return {};
    }
  }

  function saveAll(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function getTodos(wk, dayIndex) {
    const data = loadAll();
    return (data[wk] && data[wk][dayIndex]) || [];
  }

  function setTodos(wk, dayIndex, todos) {
    const data = loadAll();
    if (!data[wk]) data[wk] = {};
    data[wk][dayIndex] = todos;
    saveAll(data);
  }

  // --- Drag & Drop ---
  function handleDragStart(e, wk, dayIndex, originalIdx) {
    dragData = { wk, dayIndex, todoIndex: originalIdx };
    e.dataTransfer.effectAllowed = 'move';
    e.target.classList.add('dragging');
  }

  function handleDragEnd(e) {
    e.target.classList.remove('dragging');
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
    // Only remove if leaving the list entirely
    if (!listEl.contains(e.relatedTarget)) {
      listEl.classList.remove('drag-over');
    }
  }

  function handleDrop(e, wk, targetDayIndex, listEl) {
    e.preventDefault();
    listEl.classList.remove('drag-over');
    if (!dragData) return;

    const srcTodos = getTodos(dragData.wk, dragData.dayIndex);
    const item = srcTodos[dragData.todoIndex];
    if (!item) return;

    // Remove from source
    srcTodos.splice(dragData.todoIndex, 1);
    setTodos(dragData.wk, dragData.dayIndex, srcTodos);

    // Find drop position based on mouse Y
    const targetTodos = getTodos(wk, targetDayIndex);
    const items = listEl.querySelectorAll('.todo-item');
    let insertIdx = targetTodos.length;
    for (let j = 0; j < items.length; j++) {
      const rect = items[j].getBoundingClientRect();
      if (e.clientY < rect.top + rect.height / 2) {
        // Map display index back to data index
        const dataIdx = parseInt(items[j].dataset.originalIdx, 10);
        insertIdx = dataIdx;
        break;
      }
    }

    targetTodos.splice(insertIdx, 0, item);
    setTodos(wk, targetDayIndex, targetTodos);

    dragData = null;
    render();
  }

  // --- Carry-over ---
  function getIncompleteFromPrevWeek(currentWeekStart) {
    const prevStart = new Date(currentWeekStart);
    prevStart.setDate(prevStart.getDate() - 7);
    const prevWk = weekKey(prevStart);
    const data = loadAll();
    const prevWeekData = data[prevWk];
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

    // Add all incomplete to Saturday (day 0) of new week
    const current = getTodos(wk, 0);
    incomplete.forEach(item => {
      // Avoid duplicates by checking text
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

    // Show carry-over banner if there are incomplete tasks from last week
    const incomplete = getIncompleteFromPrevWeek(weekStart);
    let banner = document.getElementById('carryover-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'carryover-banner';
      banner.className = 'carryover-banner';
    }
    const weekProgress = document.getElementById('week-progress');
    if (incomplete.length > 0) {
      // Check if already carried over
      const satTodos = getTodos(wk, 0);
      const alreadyCarried = incomplete.every(item => satTodos.some(t => t.text === item.text));
      if (!alreadyCarried) {
        banner.innerHTML = `<span>${incomplete.length} incomplete task${incomplete.length > 1 ? 's' : ''} from last week</span><button id="carryover-btn">Carry over</button><button id="carryover-dismiss">Dismiss</button>`;
        if (weekProgress) {
          weekProgress.after(banner);
        } else {
          document.querySelector('header').after(banner);
        }
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

    // Weekly progress (including misc)
    let weekTotal = 0, weekDone = 0;
    [...DAYS.map((_, idx) => idx), 'misc'].forEach(idx => {
      const t = getTodos(wk, idx);
      weekTotal += t.length;
      weekDone += t.filter(x => x.done).length;
    });
    const weekPct = weekTotal > 0 ? Math.round((weekDone / weekTotal) * 100) : 0;
    let weekProgress = document.getElementById('week-progress');
    if (!weekProgress) {
      weekProgress = document.createElement('div');
      weekProgress.id = 'week-progress';
      weekProgress.className = 'week-progress';
      document.querySelector('header').after(weekProgress);
    }
    weekProgress.innerHTML = weekTotal > 0
      ? `<div class="progress-bar week"><div class="progress-fill" style="width:${weekPct}%"></div><span class="progress-label">${weekDone}/${weekTotal} done (${weekPct}%)</span></div>`
      : '';

    DAYS.forEach((dayName, i) => {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + i);
      const today = isToday(date);

      container.appendChild(buildDaySection(wk, i, dayName, formatDate(date), today));
    });

    // Misc section
    container.appendChild(buildDaySection(wk, 'misc', 'Misc', '', false));

    // Scroll today's section into view on current week
    if (weekOffset === 0) {
      const todaySection = container.querySelector('.day-header.today');
      if (todaySection) {
        todaySection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
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

    // Progress bar
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

    // Drop zone events
    list.addEventListener('dragover', handleDragOver);
    list.addEventListener('dragenter', (e) => handleDragEnterList(e, list));
    list.addEventListener('dragleave', (e) => handleDragLeaveList(e, list));
    list.addEventListener('drop', (e) => handleDrop(e, wk, dayIndex, list));

    // Build display order: unchecked first, then checked
    const indexed = todos.map((todo, idx) => ({ todo, idx }));
    const unchecked = indexed.filter(e => !e.todo.done);
    const checked = indexed.filter(e => e.todo.done);
    const displayOrder = [...unchecked, ...checked];

    displayOrder.forEach(({ todo, idx: originalIdx }) => {
      const li = document.createElement('li');
      li.className = 'todo-item' + (todo.done ? ' completed' : '');
      li.draggable = true;
      li.dataset.originalIdx = originalIdx;

      li.addEventListener('dragstart', (e) => handleDragStart(e, wk, dayIndex, originalIdx));
      li.addEventListener('dragend', handleDragEnd);

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = todo.done;
      checkbox.addEventListener('change', () => {
        todos[originalIdx].done = checkbox.checked;
        setTodos(wk, dayIndex, todos);
        render();
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
        todos.splice(originalIdx, 1);
        setTodos(wk, dayIndex, todos);
        render();
      });

      li.appendChild(checkbox);
      li.appendChild(span);
      li.appendChild(delBtn);
      list.appendChild(li);
    });

    section.appendChild(list);

    // Add form
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
    });
    section.appendChild(form);

    return section;
  }

  // --- Navigation ---
  document.getElementById('prev-week').addEventListener('click', () => {
    weekOffset--;
    render();
  });

  document.getElementById('next-week').addEventListener('click', () => {
    weekOffset++;
    render();
  });

  document.getElementById('today-btn').addEventListener('click', () => {
    weekOffset = 0;
    render();
  });

  render();
})();

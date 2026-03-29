(() => {
  const DAYS = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const STORAGE_KEY = 'weekly-todo-data';

  let weekOffset = 0;

  // Get the Saturday that starts the current week (Sat-Fri)
  function getWeekStart(offset = 0) {
    const now = new Date();
    const day = now.getDay(); // 0=Sun, 6=Sat
    const diffToSat = day >= 6 ? day - 6 : day + 1; // days since last Saturday
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

    DAYS.forEach((dayName, i) => {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + i);
      const today = isToday(date);

      const section = document.createElement('div');
      section.className = 'day-section';

      const header = document.createElement('div');
      header.className = 'day-header' + (today ? ' today' : '');
      header.innerHTML = `
        <span class="day-label${today ? ' today' : ''}">${dayName}</span>
        <span class="day-date${today ? ' today' : ''}">${formatDate(date)}</span>
      `;
      section.appendChild(header);

      const list = document.createElement('ul');
      list.className = 'todo-list';

      const todos = getTodos(wk, i);
      // Build display order: unchecked first, then checked, stable within each group
      const indexed = todos.map((todo, idx) => ({ todo, idx }));
      const unchecked = indexed.filter(e => !e.todo.done);
      const checked = indexed.filter(e => e.todo.done);
      const displayOrder = [...unchecked, ...checked];

      displayOrder.forEach(({ todo, idx: originalIdx }) => {
        const li = document.createElement('li');
        li.className = 'todo-item' + (todo.done ? ' completed' : '');

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = todo.done;
        checkbox.addEventListener('change', () => {
          todos[originalIdx].done = checkbox.checked;
          setTodos(wk, i, todos);
          render();
        });

        const span = document.createElement('span');
        span.className = 'todo-text';
        span.textContent = todo.text;

        const delBtn = document.createElement('button');
        delBtn.className = 'delete-btn';
        delBtn.textContent = '×';
        delBtn.addEventListener('click', () => {
          todos.splice(originalIdx, 1);
          setTodos(wk, i, todos);
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
      form.innerHTML = `<input type="text" placeholder="Add a task…" aria-label="New task for ${dayName}"><button type="submit">+</button>`;
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = form.querySelector('input');
        const text = input.value.trim();
        if (!text) return;
        const current = getTodos(wk, i);
        current.push({ text, done: false, id: Date.now() });
        setTodos(wk, i, current);
        render();
      });
      section.appendChild(form);

      container.appendChild(section);
    });

    // Scroll today's section into view on current week
    if (weekOffset === 0) {
      const todaySection = container.querySelector('.day-header.today');
      if (todaySection) {
        todaySection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
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

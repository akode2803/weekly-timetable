const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const BOARD_START = 8 * 60;
const BOARD_END = 20 * 60;
const STORAGE_KEY = 'iitk-weekly-timetable-v2';
const OLD_STORAGE_KEY = 'iitk-weekly-timetable-v1';
const THEME_KEY = 'iitk-weekly-timetable-theme';
const $ = (id) => document.getElementById(id);
const typeLabel = { formal: 'Formal course', ta: 'TA duty', audit: 'Optional / audit' };
let events = [];
let defaultEvents = [];
let sourceName = 'schedule.csv';
let selectedEventId = null;
let deferredInstallPrompt = null;

function cloneEvents(list) { return list.map((event) => ({ ...event })); }

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') { value += '"'; index += 1; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (char === ',' && !quoted) { row.push(value); value = ''; continue; }
    if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(value); value = '';
      if (row.some((cell) => cell.trim() !== '')) rows.push(row);
      row = [];
      continue;
    }
    value += char;
  }
  if (value.length || row.length) { row.push(value); if (row.some((cell) => cell.trim() !== '')) rows.push(row); }
  if (rows.length < 2) return [];
  const headers = rows.shift().map((header) => header.trim().toLowerCase());
  return rows.map((values, index) => {
    const raw = Object.fromEntries(headers.map((header, i) => [header, (values[i] || '').trim()]));
    return normalizeEvent(raw, index);
  }).filter((event) => event.title && event.day && event.start && event.end);
}

function normalizeEvent(raw, index = 0) {
  const course = raw.course || raw.code || '';
  const title = raw.title || raw.name || course || 'Untitled event';
  const slug = `${course || title}-${raw.day || 'day'}-${raw.start || index}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return {
    id: raw.id || `${slug}-${index}`,
    term: raw.term || '',
    course,
    title,
    instructor: raw.instructor || raw.instructors || '',
    day: DAYS.includes(raw.day) ? raw.day : 'Monday',
    start: raw.start,
    end: raw.end,
    type: ['formal', 'ta', 'audit'].includes(raw.type) ? raw.type : 'formal',
    location: raw.location || '',
    details: raw.details || '',
    editable: String(raw.editable).toLowerCase() === 'true'
  };
}

async function fetchDefaultEvents() {
  try {
    const response = await fetch('./schedule.csv', { cache: 'no-cache' });
    if (!response.ok) throw new Error('Could not load schedule.csv');
    return parseCsv(await response.text());
  } catch (error) {
    console.warn(error);
    return [];
  }
}

function readSavedEvents() {
  try {
    const current = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (Array.isArray(current)) return { events: current.map(normalizeEvent), sourceName: 'Saved timetable' };
    if (current?.events && Array.isArray(current.events)) return { events: current.events.map(normalizeEvent), sourceName: current.sourceName || 'Saved timetable' };
  } catch (error) { console.warn('Saved timetable could not be read.', error); }
  return null;
}

function migrateOldEvents() {
  try {
    const old = JSON.parse(localStorage.getItem(OLD_STORAGE_KEY) || 'null');
    return Array.isArray(old) ? old.map(normalizeEvent) : null;
  } catch { return null; }
}

function save(message = 'Saved in this browser') {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ events, sourceName })); } catch (error) { console.warn('Could not save timetable.', error); }
  $('savedNote').textContent = message;
  window.clearTimeout(save.noteTimer);
  save.noteTimer = window.setTimeout(() => { $('savedNote').textContent = `Source: ${sourceName}`; }, 1600);
}

function mins(time) { const [hours, minutes] = time.split(':').map(Number); return (hours * 60) + minutes; }
function formatTime(time) { const [hours, minutes] = time.split(':').map(Number); const hour = hours % 12 || 12; return `${hour}:${String(minutes).padStart(2, '0')} ${hours < 12 ? 'AM' : 'PM'}`; }
function formatName(event) { return event.course ? `${event.course} — ${event.title}` : event.title; }
function overlaps(a, b) { return a.day === b.day && mins(a.start) < mins(b.end) && mins(b.start) < mins(a.end); }
function clashPeers(event) { return events.filter((other) => other.id !== event.id && overlaps(event, other)); }
function clashes() { return new Set(events.filter((event) => clashPeers(event).length).map((event) => event.id)); }
function escapeHtml(value = '') { return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }
function formatMultiline(value = '') { return escapeHtml(value).replace(/\n/g, '<br>'); }
function instructorMarkup(value = '') { return value ? value.split(';').map((name) => `<li>${escapeHtml(name.trim())}</li>`).join('') : '<li>Instructor not set</li>'; }
function updateTermLabel() {
  const term = events.find((event) => event.term)?.term;
  $('termLabel').textContent = term ? `IIT KANPUR · ${term.toUpperCase()}` : 'IIT KANPUR · WEEKLY SCHEDULE';
}

function render() {
  const bad = clashes();
  const board = $('board');
  board.style.gridTemplateRows = '56px 780px';
  board.innerHTML = '<div class="corner"></div>' + DAYS.map((day) => `<div class="day-head">${day.slice(0, 3).toUpperCase()}<small>${day}</small></div>`).join('');
  const rail = document.createElement('div');
  rail.className = 'time-rail';
  for (let hour = 8; hour <= 20; hour += 1) rail.insertAdjacentHTML('beforeend', `<div class="time-cell">${String(hour).padStart(2, '0')}:00</div>`);
  board.appendChild(rail);

  DAYS.forEach((day) => {
    const column = document.createElement('div');
    column.className = 'day-column';
    events.filter((event) => event.day === day).sort((a, b) => mins(a.start) - mins(b.start)).forEach((event) => {
      const top = Math.max(0, mins(event.start) - BOARD_START);
      const height = Math.max(42, Math.min(BOARD_END - BOARD_START, mins(event.end) - mins(event.start)));
      const card = document.createElement('article');
      card.className = `event-card ${event.type}${bad.has(event.id) ? ' clash' : ''}`;
      card.dataset.eventId = event.id;
      card.tabIndex = 0;
      card.setAttribute('aria-label', `${formatName(event)}, ${event.day}, ${formatTime(event.start)} to ${formatTime(event.end)}`);
      card.style.top = `${top}px`;
      card.style.height = `${height}px`;
      card.innerHTML = `
        <span class="event-course">${escapeHtml(event.course || typeLabel[event.type])}</span>
        <span class="event-title">${escapeHtml(event.title)}</span>
        <span class="event-time">${formatTime(event.start)} – ${formatTime(event.end)}</span>
        <span class="event-instructor">${event.instructor ? `Instructor · ${escapeHtml(event.instructor)}` : 'Instructor not set'}</span>
        ${event.location ? `<span class="event-location">${escapeHtml(event.location)}</span>` : ''}
        ${bad.has(event.id) ? '<span class="clash-badge">CLASH</span>' : ''}
        <span class="event-tools"><button class="icon-btn" data-edit="${event.id}" aria-label="Edit">✎</button><button class="icon-btn" data-delete="${event.id}" aria-label="Delete">×</button></span>`;
      column.appendChild(card);
    });
    board.appendChild(column);
  });

  const formalCourses = new Set(events.filter((event) => event.type === 'formal').map((event) => event.course || event.title));
  $('eventCount').textContent = events.length;
  $('formalCount').textContent = formalCourses.size;
  $('clashCount').textContent = bad.size;
  $('sourceNote').textContent = `Source: ${sourceName} · ${events.length} events`;
  updateTermLabel();
  if (!$('savedNote').textContent.startsWith('Saved')) $('savedNote').textContent = `Source: ${sourceName}`;
  renderAudits();
}

function renderAudits() {
  const grouped = new Map();
  events.filter((event) => event.type === 'audit').forEach((event) => {
    const key = event.course || event.title;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(event);
  });
  const list = $('auditList');
  if (!grouped.size) { list.innerHTML = '<p class="empty-state">No optional courses in this CSV.</p>'; return; }
  list.innerHTML = [...grouped.entries()].map(([course, items]) => {
    const hasClash = items.some((item) => clashPeers(item).some((peer) => peer.type === 'audit'));
    const schedules = items.sort((a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day) || mins(a.start) - mins(b.start)).map((item) => `${item.day.slice(0, 3)} ${formatTime(item.start)}–${formatTime(item.end)}`).join(' · ');
    const instructors = [...new Set(items.flatMap((item) => item.instructor.split(';').map((name) => name.trim()).filter(Boolean)))].join('; ');
    return `<div class="audit-item${hasClash ? ' clash-item' : ''}"><h3>${escapeHtml(course)}</h3><p>${escapeHtml(schedules)}</p><p class="audit-instructor">${escapeHtml(instructors || 'Instructor not set')}</p>${hasClash ? `<div class="warning">⚠ overlaps with ${escapeHtml([...new Set(items.flatMap((item) => clashPeers(item).filter((peer) => peer.type === 'audit').map((peer) => peer.course || peer.title)))].join(', '))}</div>` : ''}</div>`;
  }).join('');
}

function openDetails(eventId) {
  const event = events.find((item) => item.id === eventId);
  if (!event) return;
  selectedEventId = eventId;
  const peers = clashPeers(event);
  $('detailTitle').textContent = event.course || 'Event details';
  $('detailContent').innerHTML = `
    <div class="detail-type ${event.type}">${typeLabel[event.type]}</div>
    <h3 class="detail-name">${escapeHtml(event.title)}</h3>
    <dl class="detail-facts">
      <div><dt>When</dt><dd>${escapeHtml(event.day)} · ${formatTime(event.start)} – ${formatTime(event.end)}</dd></div>
      <div><dt>Instructor(s)</dt><dd><ul class="detail-list">${instructorMarkup(event.instructor)}</ul></dd></div>
      <div><dt>Where</dt><dd>${escapeHtml(event.location || 'Location not set')}</dd></div>
    </dl>
    ${event.details ? `<div class="detail-notes"><p class="eyebrow">NOTES</p><p>${formatMultiline(event.details)}</p></div>` : ''}
    ${peers.length ? `<div class="detail-clash"><p class="eyebrow">CLASH CHECK</p><p>Overlaps with <strong>${escapeHtml(peers.map((peer) => formatName(peer)).join(', '))}</strong>.</p></div>` : ''}`;
  $('detailSidebar').classList.add('is-open');
  $('sidebarBackdrop').classList.add('is-open');
  $('detailSidebar').setAttribute('aria-hidden', 'false');
  document.body.classList.add('sidebar-open');
}

function closeSidebar() {
  $('detailSidebar').classList.remove('is-open');
  $('sidebarBackdrop').classList.remove('is-open');
  $('detailSidebar').setAttribute('aria-hidden', 'true');
  document.body.classList.remove('sidebar-open');
  selectedEventId = null;
}

function openEditor(event) {
  closeSidebar();
  $('dialogTitle').textContent = event ? 'Edit event' : 'Add event';
  $('eventId').value = event?.id || '';
  $('course').value = event?.course || '';
  $('title').value = event?.title || '';
  $('instructor').value = event?.instructor || '';
  $('day').value = event?.day || 'Monday';
  $('type').value = event?.type || 'formal';
  $('start').value = event?.start || '09:00';
  $('end').value = event?.end || '10:00';
  $('location').value = event?.location || '';
  $('details').value = event?.details || '';
  $('editableDefault').checked = Boolean(event?.editable);
  $('eventDialog').showModal();
}

function deleteEvent(eventId) {
  const event = events.find((item) => item.id === eventId);
  if (!event || !window.confirm(`Delete ${formatName(event)}?`)) return;
  events = events.filter((item) => item.id !== eventId);
  closeSidebar();
  save('Saved just now');
  render();
}

function applyTheme(theme) {
  const dark = theme !== 'light';
  document.body.classList.toggle('light', !dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  $('themeToggle').textContent = dark ? '☼ Light' : '☾ Dark';
  $('themeToggle').setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
  document.querySelector('meta[name="theme-color"]').setAttribute('content', dark ? '#0d1726' : '#f6f8fb');
}

function handleCsvLoad(file) {
  if (!file) return;
  file.text().then((text) => {
    const loaded = parseCsv(text);
    if (!loaded.length) { window.alert('No valid events were found. Check the CSV columns and try again.'); return; }
    events = loaded;
    sourceName = file.name;
    closeSidebar();
    save('CSV loaded and saved');
    render();
  }).catch(() => window.alert('The CSV could not be read.'));
}

async function boot() {
  applyTheme(localStorage.getItem(THEME_KEY) || 'dark');
  defaultEvents = await fetchDefaultEvents();
  const saved = readSavedEvents();
  const old = saved?.events || migrateOldEvents();
  if (old) {
    const defaultsById = new Map(defaultEvents.map((event) => [event.id, event]));
    events = old.map((event) => ({ ...(defaultsById.get(event.id) || {}), ...event }));
    sourceName = saved?.sourceName || 'Saved timetable';
  } else {
    events = cloneEvents(defaultEvents);
  }
  if (!events.length) $('savedNote').textContent = 'No schedule loaded';
  render();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js').catch((error) => console.warn('Offline support unavailable.', error));
}

$('addBtn').addEventListener('click', () => openEditor());
$('resetBtn').addEventListener('click', () => { if (window.confirm('Reset all events to schedule.csv defaults?')) { events = cloneEvents(defaultEvents); sourceName = 'schedule.csv'; closeSidebar(); save('Defaults restored'); render(); } });
$('loadBtn').addEventListener('click', () => $('csvInput').click());
$('csvInput').addEventListener('change', (event) => { handleCsvLoad(event.target.files[0]); event.target.value = ''; });
$('themeToggle').addEventListener('click', () => { const next = document.body.classList.contains('light') ? 'dark' : 'light'; localStorage.setItem(THEME_KEY, next); applyTheme(next); });
$('board').addEventListener('click', (event) => {
  const edit = event.target.closest('[data-edit]');
  const del = event.target.closest('[data-delete]');
  if (edit) { event.stopPropagation(); openEditor(events.find((item) => item.id === edit.dataset.edit)); return; }
  if (del) { event.stopPropagation(); deleteEvent(del.dataset.delete); return; }
  const card = event.target.closest('.event-card');
  if (card) openDetails(card.dataset.eventId);
});
$('board').addEventListener('keydown', (event) => { const card = event.target.closest('.event-card'); if (card && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); openDetails(card.dataset.eventId); } });
$('sidebarBackdrop').addEventListener('click', closeSidebar);
$('sidebarClose').addEventListener('click', closeSidebar);
$('sidebarEdit').addEventListener('click', () => { const event = events.find((item) => item.id === selectedEventId); if (event) openEditor(event); });
$('sidebarDelete').addEventListener('click', () => { if (selectedEventId) deleteEvent(selectedEventId); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeSidebar(); });
$('eventForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const existing = events.find((item) => item.id === $('eventId').value);
  const data = normalizeEvent({ id: $('eventId').value || `event-${Date.now()}`, term: existing?.term || '', course: $('course').value.trim(), title: $('title').value.trim(), instructor: $('instructor').value.trim(), day: $('day').value, type: $('type').value, start: $('start').value, end: $('end').value, location: $('location').value.trim(), details: $('details').value.trim(), editable: $('editableDefault').checked });
  if (mins(data.end) <= mins(data.start)) { window.alert('End time must be after start time.'); return; }
  const index = events.findIndex((item) => item.id === data.id);
  if (index > -1) events[index] = data; else events.push(data);
  save('Saved just now');
  $('eventDialog').close();
  render();
  if (selectedEventId === data.id) openDetails(data.id);
});

window.addEventListener('beforeinstallprompt', (event) => { event.preventDefault(); deferredInstallPrompt = event; $('installBtn').hidden = false; });
$('installBtn').addEventListener('click', async () => { if (!deferredInstallPrompt) return; deferredInstallPrompt.prompt(); await deferredInstallPrompt.userChoice; deferredInstallPrompt = null; $('installBtn').hidden = true; });
window.addEventListener('appinstalled', () => { $('installBtn').hidden = true; deferredInstallPrompt = null; });

boot();

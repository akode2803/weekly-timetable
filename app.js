const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const BOARD_START = 8 * 60;
const BOARD_END = 20 * 60;
const STORAGE_KEY = 'iitk-weekly-timetable-v2';
const OLD_STORAGE_KEY = 'iitk-weekly-timetable-v1';
const EXAM_STORAGE_KEY = 'iitk-weekly-timetable-exams-v1';
const THEME_KEY = 'iitk-weekly-timetable-theme';
const TIME_ZONE = 'Asia/Kolkata';
const ROOM_OVERRIDES = { 'cs787-wed': 'L20', 'cs787-fri': 'L19', 'cs781-mon': 'DJ205H', 'cs781-thu': 'RM101' };
const $ = (id) => document.getElementById(id);
const typeLabel = { formal: 'Formal course', ta: 'TA duty', audit: 'Optional / audit' };
let events = [];
let defaultEvents = [];
let sourceName = 'schedule.csv';
let exams = [];
let defaultExams = [];
let examSourceName = 'exams.csv';
let selectedEventId = null;
let deferredInstallPrompt = null;
let showAllExams = false;
const activeTypes = new Set();
const activeCourses = new Set();
let hasAutoScrolled = false;

function cloneEvents(list) { return list.map((event) => ({ ...event })); }

function parseCsvRows(text) {
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
  return rows.map((values) => {
    const raw = Object.fromEntries(headers.map((header, i) => [header, (values[i] || '').trim()]));
    return raw;
  });
}

function parseCsv(text) {
  return parseCsvRows(text).map((raw, index) => normalizeEvent(raw, index)).filter((event) => event.title && event.day && event.start && event.end);
}

function parseExamCsv(text) {
  return parseCsvRows(text).map((raw, index) => normalizeExam(raw, index)).filter((exam) => exam.course && exam.title && /^\d{4}-\d{2}-\d{2}$/.test(exam.date) && exam.start && exam.end);
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

function normalizeExam(raw, index = 0) {
  const course = (raw.course || raw.code || '').toUpperCase();
  const title = raw.title || raw.name || 'Exam';
  const slug = `${course || title}-${raw.date || index}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return {
    id: raw.id || `${slug}-${index}`,
    term: raw.term || '',
    course,
    title,
    date: raw.date || '',
    start: raw.start || '',
    end: raw.end || '',
    kind: raw.kind || raw.type || 'Exam',
    location: raw.location || '',
    details: raw.details || ''
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

async function fetchDefaultExams() {
  try {
    const response = await fetch('./exams.csv', { cache: 'no-cache' });
    if (!response.ok) throw new Error('Could not load exams.csv');
    return parseExamCsv(await response.text());
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

function readSavedExams() {
  try {
    const saved = JSON.parse(localStorage.getItem(EXAM_STORAGE_KEY) || 'null');
    if (Array.isArray(saved)) return { exams: saved.map(normalizeExam), sourceName: 'Saved exam schedule' };
    if (saved?.exams && Array.isArray(saved.exams)) return { exams: saved.exams.map(normalizeExam), sourceName: saved.sourceName || 'Saved exam schedule' };
  } catch (error) { console.warn('Saved exams could not be read.', error); }
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

function saveExams(message = 'Exam schedule saved') {
  try { localStorage.setItem(EXAM_STORAGE_KEY, JSON.stringify({ exams, sourceName: examSourceName })); } catch (error) { console.warn('Could not save exams.', error); }
  $('examSummary').textContent = message;
  window.clearTimeout(saveExams.noteTimer);
  saveExams.noteTimer = window.setTimeout(() => renderExams(), 1600);
}

function mins(time) { const [hours, minutes] = time.split(':').map(Number); return (hours * 60) + minutes; }
function formatTime(time) { const [hours, minutes] = time.split(':').map(Number); const hour = hours % 12 || 12; return `${hour}:${String(minutes).padStart(2, '0')} ${hours < 12 ? 'AM' : 'PM'}`; }
function formatName(event) { return event.course ? `${event.course} — ${event.title}` : event.title; }
function overlaps(a, b) { return a.day === b.day && mins(a.start) < mins(b.end) && mins(b.start) < mins(a.end); }
function clashPeers(event) { return events.filter((other) => other.id !== event.id && overlaps(event, other)); }
function clashes() { return new Set(events.filter((event) => clashPeers(event).length).map((event) => event.id)); }
function filteredEvents() {
  return events.filter((event) => (activeTypes.size === 0 || activeTypes.has(event.type)) && (activeCourses.size === 0 || activeCourses.has(event.course || event.title)));
}
function filtersActive() { return activeTypes.size > 0 || activeCourses.size > 0; }
function escapeHtml(value = '') { return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }
function formatMultiline(value = '') { return escapeHtml(value).replace(/\n/g, '<br>'); }
function instructorMarkup(value = '') { return value ? value.split(';').map((name) => `<li>${escapeHtml(name.trim())}</li>`).join('') : '<li>Instructor not set</li>'; }
function updateTermLabel() {
  const term = events.find((event) => event.term)?.term;
  $('termLabel').textContent = term ? `IIT KANPUR · ${term.toUpperCase()}` : 'IIT KANPUR · WEEKLY SCHEDULE';
}

function getClashClusters(dayEvents) {
  const clusters = [];
  dayEvents.forEach((event) => {
    const start = mins(event.start);
    const end = mins(event.end);
    const overlappingIndices = [];
    for (let i = 0; i < clusters.length; i += 1) {
      if (start < clusters[i].end && end > clusters[i].start) {
        overlappingIndices.push(i);
      }
    }
    if (overlappingIndices.length === 0) {
      clusters.push({ start, end, events: [event] });
    } else {
      const firstIdx = overlappingIndices[0];
      const merged = clusters[firstIdx];
      merged.events.push(event);
      merged.start = Math.min(merged.start, start);
      merged.end = Math.max(merged.end, end);
      for (let k = overlappingIndices.length - 1; k > 0; k -= 1) {
        const idx = overlappingIndices[k];
        merged.events.push(...clusters[idx].events);
        merged.start = Math.min(merged.start, clusters[idx].start);
        merged.end = Math.max(merged.end, clusters[idx].end);
        clusters.splice(idx, 1);
      }
    }
  });
  return clusters;
}

function renderCardHTML(event, isClash) {
  return `
    <span class="event-course">${escapeHtml(event.course || typeLabel[event.type])}</span>
    <span class="event-title">${escapeHtml(event.title)}</span>
    <span class="event-time">${formatTime(event.start)} – ${formatTime(event.end)}</span>
    <span class="event-instructor">${event.instructor ? `Instructor · ${escapeHtml(event.instructor)}` : 'Instructor not set'}</span>
    ${event.location ? `<span class="event-location">${escapeHtml(event.location)}</span>` : ''}
    ${isClash ? '<span class="clash-badge">CLASH</span>' : ''}`;
}

function createCardElement(event, top, height, isClash) {
  const card = document.createElement('article');
  card.className = `event-card ${event.type}${isClash ? ' clash' : ''}`;
  card.dataset.eventId = event.id;
  card.tabIndex = 0;
  card.setAttribute('aria-label', `${formatName(event)}, ${event.day}, ${formatTime(event.start)} to ${formatTime(event.end)}`);
  card.style.top = `${top}px`;
  card.style.height = `${height}px`;
  card.innerHTML = renderCardHTML(event, isClash);
  return card;
}

function render() {
  const bad = clashes();
  const visibleEvents = filteredEvents();
  const todayIndex = (new Date().getDay() + 6) % 7;
  const board = $('board');
  board.style.gridTemplateRows = '56px 780px';
  board.innerHTML = '<div class="corner"></div>' + DAYS.map((day, index) => `<div class="day-head${index === todayIndex ? ' current-day' : ''}">${day.slice(0, 3).toUpperCase()}<small>${day}</small></div>`).join('');
  const rail = document.createElement('div');
  rail.className = 'time-rail';
  for (let hour = 8; hour <= 20; hour += 1) rail.insertAdjacentHTML('beforeend', `<div class="time-cell">${String(hour).padStart(2, '0')}:00</div>`);
  board.appendChild(rail);

  DAYS.forEach((day) => {
    const column = document.createElement('div');
    column.className = `day-column${DAYS.indexOf(day) === todayIndex ? ' current-day' : ''}`;
    const dayEvents = visibleEvents.filter((event) => event.day === day).sort((a, b) => mins(a.start) - mins(b.start));
    const clusters = getClashClusters(dayEvents);

    clusters.forEach((cluster) => {
      if (cluster.events.length === 1) {
        const event = cluster.events[0];
        const top = Math.max(0, mins(event.start) - BOARD_START);
        const height = Math.max(42, Math.min(BOARD_END - BOARD_START, mins(event.end) - mins(event.start)));
        column.appendChild(createCardElement(event, top, height, bad.has(event.id)));
      } else {
        const cTop = Math.max(0, cluster.start - BOARD_START);
        const cHeight = Math.max(42, Math.min(BOARD_END - BOARD_START, cluster.end - cluster.start));

        const sliderContainer = document.createElement('div');
        sliderContainer.className = 'clash-slider-container';
        sliderContainer.style.top = `${cTop}px`;
        sliderContainer.style.height = `${cHeight}px`;

        const indicator = document.createElement('span');
        indicator.className = 'clash-count-indicator';
        indicator.textContent = `1/${cluster.events.length}`;

        const prevBtn = document.createElement('button');
        prevBtn.className = 'clash-nav clash-prev';
        prevBtn.type = 'button';
        prevBtn.setAttribute('aria-label', 'Previous overlapping event');
        prevBtn.disabled = true;
        prevBtn.textContent = '‹';

        const nextBtn = document.createElement('button');
        nextBtn.className = 'clash-nav clash-next';
        nextBtn.type = 'button';
        nextBtn.setAttribute('aria-label', 'Next overlapping event');
        nextBtn.textContent = '›';

        const slider = document.createElement('div');
        slider.className = 'clash-slider';

        cluster.events.forEach((event) => {
          const slide = document.createElement('div');
          slide.className = 'clash-slide';
          const relTop = Math.max(0, mins(event.start) - cluster.start);
          const relHeight = Math.max(42, Math.min(cHeight - relTop, mins(event.end) - mins(event.start)));
          const card = createCardElement(event, relTop, relHeight, bad.has(event.id));
          slide.appendChild(card);
          slider.appendChild(slide);
        });

        const updateNav = () => {
          const slideWidth = slider.clientWidth || 1;
          const index = Math.round(slider.scrollLeft / slideWidth);
          indicator.textContent = `${index + 1}/${cluster.events.length}`;
          prevBtn.disabled = index <= 0;
          nextBtn.disabled = index >= cluster.events.length - 1;
        };

        slider.addEventListener('scroll', updateNav, { passive: true });
        prevBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          slider.scrollBy({ left: -slider.clientWidth, behavior: 'smooth' });
        });
        nextBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          slider.scrollBy({ left: slider.clientWidth, behavior: 'smooth' });
        });

        sliderContainer.appendChild(indicator);
        sliderContainer.appendChild(prevBtn);
        sliderContainer.appendChild(slider);
        sliderContainer.appendChild(nextBtn);
        column.appendChild(sliderContainer);
      }
    });
    board.appendChild(column);
  });

  const formalCourses = new Set(visibleEvents.filter((event) => event.type === 'formal').map((event) => event.course || event.title));
  $('eventCount').textContent = visibleEvents.length;
  $('formalCount').textContent = formalCourses.size;
  $('clashCount').textContent = new Set(visibleEvents.filter((event) => bad.has(event.id)).map((event) => event.id)).size;
  $('sourceNote').textContent = `Source: ${sourceName} · ${visibleEvents.length}${filtersActive() ? ` of ${events.length}` : ''} events`;
  updateTermLabel();
  if (!$('savedNote').textContent.startsWith('Saved')) $('savedNote').textContent = `Source: ${sourceName}`;
  renderFilters();
  renderAudits(visibleEvents);
  renderExams();
  updateFilterSummary(visibleEvents);
}

function renderAudits(visibleEvents = filteredEvents()) {
  const grouped = new Map();
  visibleEvents.filter((event) => event.type === 'audit').forEach((event) => {
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

function dateFromIso(value) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function dayNameFromIso(value) {
  return DAYS[(dateFromIso(value).getDay() + 6) % 7];
}

function formatExamDate(value) {
  return new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: '2-digit', month: 'short' }).format(dateFromIso(value));
}

function examStatus(exam) {
  const today = localDateString(new Date());
  if (exam.date < today) return 'past';
  if (exam.date === today) return 'today';
  return 'upcoming';
}

function relevantExams() {
  const courses = new Set(events.map((event) => (event.course || '').trim().toUpperCase()).filter(Boolean));
  return exams.filter((exam) => courses.has(exam.course));
}

function examClassPeers(exam) {
  const day = dayNameFromIso(exam.date);
  return events.filter((event) => event.day === day && event.course !== exam.course && mins(exam.start) < mins(event.end) && mins(event.start) < mins(exam.end));
}

function renderExams() {
  const matching = relevantExams();
  const visible = showAllExams ? exams : matching;
  const list = $('examList');
  $('examSourceNote').textContent = `Source: ${examSourceName}`;
  $('examSummary').textContent = showAllExams
    ? `Showing all ${exams.length} exam${exams.length === 1 ? '' : 's'} from the CSV · ${matching.length} match the current timetable.`
    : `${matching.length} relevant exam${matching.length === 1 ? '' : 's'} found · ${exams.length} total entries in the CSV.`;

  if (!visible.length) {
    list.innerHTML = exams.length
      ? '<p class="empty-state">No exam courses match the current timetable. Turn on “Show all CSV entries” to inspect the complete file.</p>'
      : '<p class="empty-state">No valid exams were found in exams.csv.</p>';
    return;
  }

  const grouped = new Map();
  [...visible].sort((a, b) => a.date.localeCompare(b.date) || mins(a.start) - mins(b.start) || a.course.localeCompare(b.course)).forEach((exam) => {
    if (!grouped.has(exam.date)) grouped.set(exam.date, []);
    grouped.get(exam.date).push(exam);
  });

  list.innerHTML = [...grouped.entries()].map(([date, items]) => `
    <section class="exam-day" aria-labelledby="exam-day-${date}">
      <div class="exam-day-heading">
        <div><p class="eyebrow">${examStatus(items[0]).toUpperCase()}</p><h3 id="exam-day-${date}">${escapeHtml(formatExamDate(date))}</h3></div>
        <span class="exam-day-count">${items.length} exam${items.length === 1 ? '' : 's'}</span>
      </div>
      <div class="exam-grid">
        ${items.map((exam) => {
          const peers = examClassPeers(exam);
          const relevant = matching.includes(exam);
          return `<article class="exam-card${relevant ? '' : ' exam-unmatched'}" data-exam-id="${escapeHtml(exam.id)}">
            <div class="exam-card-top"><span class="exam-course">${escapeHtml(exam.course)}</span><span class="exam-kind">${escapeHtml(exam.kind)}</span></div>
            <h4>${escapeHtml(exam.title)}</h4>
            <p class="exam-time">${formatTime(exam.start)} – ${formatTime(exam.end)}</p>
            ${exam.location ? `<p class="exam-location">${escapeHtml(exam.location)}</p>` : ''}
            ${exam.details ? `<p class="exam-details">${formatMultiline(exam.details)}</p>` : ''}
            ${peers.length ? `<p class="exam-warning">⚠ Regular timetable overlap: ${escapeHtml([...new Set(peers.map((peer) => peer.course || peer.title))].join(', '))}</p>` : ''}
          </article>`;
        }).join('')}
      </div>
    </section>`).join('');
}

function handleExamCsvLoad(file) {
  if (!file) return;
  file.text().then((text) => {
    const loaded = parseExamCsv(text);
    if (!loaded.length) { window.alert('No valid exams were found. Check the exam CSV columns and try again.'); return; }
    exams = loaded;
    examSourceName = file.name;
    saveExams('Exam CSV loaded and saved');
    renderExams();
  }).catch(() => window.alert('The exam CSV could not be read.'));
}

function renderFilters() {
  document.querySelectorAll('[data-filter-type]').forEach((button) => {
    const active = activeTypes.has(button.dataset.filterType);
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  const courses = [...new Set(events.map((event) => event.course || event.title).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  $('courseFilters').innerHTML = courses.map((course) => `<button class="filter-chip course-chip${activeCourses.has(course) ? ' active' : ''}" type="button" data-filter-course="${escapeHtml(course)}" aria-pressed="${activeCourses.has(course)}">${escapeHtml(course)}</button>`).join('');
  $('clearFilters').hidden = !filtersActive();
}

function updateFilterSummary(visibleEvents = filteredEvents()) {
  $('eventCountLabel').textContent = filtersActive() ? 'visible events' : 'events this week';
  $('filterSummary').textContent = filtersActive() ? `${visibleEvents.length} matching event${visibleEvents.length === 1 ? '' : 's'}` : 'No filters active';
}

function scrollCurrentDayIntoView() {
  if (hasAutoScrolled || window.innerWidth > 700) return;
  const dayIndex = (new Date().getDay() + 6) % 7;
  const board = $('board');
  const dayWidth = (board.scrollWidth - 76) / DAYS.length;
  $('boardWrap').scrollTo({ left: Math.max(0, (dayIndex * dayWidth) + 76 - 10), behavior: 'auto' });
  hasAutoScrolled = true;
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

function localDateString(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function defaultWeekStart() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return localDateString(date);
}

function dateForEvent(weekStart, event) {
  const [year, month, day] = weekStart.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const dayIndex = DAYS.indexOf(event.day);
  if (dayIndex > -1) {
    date.setDate(date.getDate() + dayIndex);
  }
  return date;
}

function icsDate(date, time) {
  const [hours, minutes] = time.split(':').map(Number);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  return `${y}${m}${d}T${hh}${mm}00`;
}

function icsEscape(value = '') {
  return String(value).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1');
}

function foldIcsLines(lines) {
  return lines.flatMap((line) => {
    if (line.length <= 75) return [line];
    const chunks = [];
    chunks.push(line.slice(0, 75));
    let rest = line.slice(75);
    while (rest.length > 0) {
      chunks.push(' ' + rest.slice(0, 74));
      rest = rest.slice(74);
    }
    return chunks;
  }).join('\r\n') + '\r\n';
}

function buildIcs(weekStart, weeks, exportEvents) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'PRODID:-//IITK Weekly Timetable//EN',
    'X-WR-CALNAME:IITK Weekly Timetable',
    `X-WR-TIMEZONE:${TIME_ZONE}`,
    'BEGIN:VTIMEZONE',
    `TZID:${TIME_ZONE}`,
    'X-LIC-LOCATION:Asia/Kolkata',
    'BEGIN:STANDARD',
    'TZNAME:IST',
    'TZOFFSETFROM:+0530',
    'TZOFFSETTO:+0530',
    'DTSTART:19700101T000000',
    'END:STANDARD',
    'END:VTIMEZONE'
  ];
  exportEvents.forEach((event) => {
    const date = dateForEvent(weekStart, event);
    const safeId = event.id.replace(/[^a-z0-9-]/gi, '-');
    const descriptionParts = [];
    if (event.instructor) descriptionParts.push(`Instructor(s): ${event.instructor.trim()}`);
    if (event.details) descriptionParts.push(event.details.trim());
    const description = descriptionParts.join('\n');

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${safeId}-${weekStart}@weekly-timetable`);
    lines.push(`DTSTAMP:${stamp}`);
    lines.push(`SUMMARY:${icsEscape(formatName(event))}`);
    lines.push(`DTSTART;TZID=${TIME_ZONE}:${icsDate(date, event.start)}`);
    lines.push(`DTEND;TZID=${TIME_ZONE}:${icsDate(date, event.end)}`);
    lines.push(`RRULE:FREQ=WEEKLY;COUNT=${weeks}`);
    if (description) {
      lines.push(`DESCRIPTION:${icsEscape(description)}`);
    }
    if (event.location && event.location.trim()) {
      lines.push(`LOCATION:${icsEscape(event.location.trim())}`);
    }
    lines.push('SEQUENCE:0');
    lines.push('STATUS:CONFIRMED');
    lines.push('TRANSP:OPAQUE');
    lines.push('END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  return foldIcsLines(lines);
}

async function shareOrDownloadIcs(content, filename) {
  const file = new File([content], filename, { type: 'text/calendar;charset=utf-8' });
  try {
    if (navigator.share && navigator.canShare?.({ files: [file] })) { await navigator.share({ title: 'Weekly timetable', files: [file] }); return; }
  } catch (error) { if (error.name === 'AbortError') return; }
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url; link.download = filename; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function openIcsDialog() {
  $('icsStartDate').value = defaultWeekStart();
  $('icsWeeks').value = 16;
  const count = filteredEvents().length;
  $('exportScope').textContent = filtersActive() ? `This will export ${count} event${count === 1 ? '' : 's'} matching the active filters.` : 'All timetable events will be exported.';
  $('icsDialog').showModal();
}

function closeIcsDialog() { if ($('icsDialog').open) $('icsDialog').close('cancel'); }

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
    activeTypes.clear();
    activeCourses.clear();
    events = loaded;
    sourceName = file.name;
    closeSidebar();
    save('CSV loaded and saved');
    render();
  }).catch(() => window.alert('The CSV could not be read.'));
}

async function boot() {
  applyTheme(localStorage.getItem(THEME_KEY) || 'dark');
  [defaultEvents, defaultExams] = await Promise.all([fetchDefaultEvents(), fetchDefaultExams()]);
  const saved = readSavedEvents();
  const old = saved?.events || migrateOldEvents();
  if (old) {
    const defaultsById = new Map(defaultEvents.map((event) => [event.id, event]));
    events = old.map((event) => ({ ...(defaultsById.get(event.id) || {}), ...event, ...(ROOM_OVERRIDES[event.id] ? { location: ROOM_OVERRIDES[event.id] } : {}) }));
    sourceName = saved?.sourceName || 'Saved timetable';
  } else {
    events = cloneEvents(defaultEvents);
  }
  const savedExams = readSavedExams();
  if (savedExams?.exams?.length) {
    exams = savedExams.exams;
    examSourceName = savedExams.sourceName || 'Saved exam schedule';
  } else {
    exams = cloneEvents(defaultExams);
  }
  if (!events.length) $('savedNote').textContent = 'No schedule loaded';
  render();
  window.requestAnimationFrame(scrollCurrentDayIntoView);
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js')
      .then((registration) => registration.update())
      .catch((error) => console.warn('Offline support unavailable.', error));
  }
}

$('addBtn').addEventListener('click', () => openEditor());
$('resetBtn').addEventListener('click', () => { if (window.confirm('Reset all events to schedule.csv defaults?')) { activeTypes.clear(); activeCourses.clear(); events = cloneEvents(defaultEvents); sourceName = 'schedule.csv'; closeSidebar(); save('Defaults restored'); render(); } });
$('loadBtn').addEventListener('click', () => $('csvInput').click());
$('csvInput').addEventListener('change', (event) => { handleCsvLoad(event.target.files[0]); event.target.value = ''; });
$('showAllExams').addEventListener('change', (event) => { showAllExams = event.target.checked; renderExams(); });
$('loadExamBtn').addEventListener('click', () => $('examCsvInput').click());
$('examCsvInput').addEventListener('change', (event) => { handleExamCsvLoad(event.target.files[0]); event.target.value = ''; });
$('resetExamBtn').addEventListener('click', () => { if (window.confirm('Reset exams to exams.csv defaults?')) { exams = cloneEvents(defaultExams); examSourceName = 'exams.csv'; saveExams('Exam defaults restored'); renderExams(); } });
$('themeToggle').addEventListener('click', () => { const next = document.body.classList.contains('light') ? 'dark' : 'light'; localStorage.setItem(THEME_KEY, next); applyTheme(next); });
$('icsBtn').addEventListener('click', openIcsDialog);
$('dialogClose').addEventListener('click', () => $('eventDialog').close('cancel'));
$('cancelEventBtn').addEventListener('click', () => $('eventDialog').close('cancel'));
$('icsClose').addEventListener('click', closeIcsDialog);
$('icsCancelBtn').addEventListener('click', closeIcsDialog);
$('board').addEventListener('click', (event) => {
  if (event.target.closest('.clash-nav')) return;
  const card = event.target.closest('.event-card');
  if (card) openDetails(card.dataset.eventId);
});
$('board').addEventListener('keydown', (event) => { const card = event.target.closest('.event-card'); if (card && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); openDetails(card.dataset.eventId); } });
$('typeFilters').addEventListener('click', (event) => {
  const button = event.target.closest('[data-filter-type]');
  if (!button) return;
  const type = button.dataset.filterType;
  if (activeTypes.has(type)) activeTypes.delete(type); else activeTypes.add(type);
  render();
});
$('courseFilters').addEventListener('click', (event) => {
  const button = event.target.closest('[data-filter-course]');
  if (!button) return;
  const course = button.dataset.filterCourse;
  if (activeCourses.has(course)) activeCourses.delete(course); else activeCourses.add(course);
  render();
});
$('clearFilters').addEventListener('click', () => { activeTypes.clear(); activeCourses.clear(); render(); });
$('sidebarBackdrop').addEventListener('click', closeSidebar);
$('sidebarClose').addEventListener('click', closeSidebar);
$('sidebarEdit').addEventListener('click', () => { const event = events.find((item) => item.id === selectedEventId); if (event) openEditor(event); });
$('sidebarDelete').addEventListener('click', () => { if (selectedEventId) deleteEvent(selectedEventId); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') { closeSidebar(); closeIcsDialog(); } });
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
$('icsForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const weekStart = $('icsStartDate').value;
  const weeks = Number($('icsWeeks').value);
  if (!weekStart || new Date(`${weekStart}T00:00:00`).getDay() !== 1) { window.alert('Please choose a Monday as the first week.'); return; }
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > 52) { window.alert('Choose between 1 and 52 weeks.'); return; }
  const exportEvents = filteredEvents();
  if (!exportEvents.length) { window.alert('There are no visible events to export.'); return; }
  const filename = `${sourceName.replace(/\.csv$/i, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'weekly-timetable'}.ics`;
  await shareOrDownloadIcs(buildIcs(weekStart, weeks, exportEvents), filename);
  closeIcsDialog();
});

window.addEventListener('beforeinstallprompt', (event) => { event.preventDefault(); deferredInstallPrompt = event; $('installBtn').hidden = false; });
$('installBtn').addEventListener('click', async () => { if (!deferredInstallPrompt) return; deferredInstallPrompt.prompt(); await deferredInstallPrompt.userChoice; deferredInstallPrompt = null; $('installBtn').hidden = true; });
window.addEventListener('appinstalled', () => { $('installBtn').hidden = true; deferredInstallPrompt = null; });

boot();

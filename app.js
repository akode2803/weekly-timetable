const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const DEFAULT_EVENTS = [
  {id:'cs781-mon',title:'CS781 — Large Language Models',day:'Monday',start:'12:00',end:'13:15',type:'formal',location:'DJ205H / RM101'},
  {id:'cs611-mon',title:'CS611 — System Level Data Formats and Representations for AI',day:'Monday',start:'17:00',end:'18:00',type:'formal',location:'KD102'},
  {id:'cs610-mon',title:'CS610 — Programming for Performance',day:'Monday',start:'08:00',end:'09:00',type:'audit',location:'Audit'},
  {id:'cs778-mon',title:'CS778 — Foundations of Modern AI',day:'Monday',start:'15:30',end:'17:00',type:'audit',location:'Audit'},
  {id:'cs777-mon',title:'CS777 — Topics in Learning Theory',day:'Monday',start:'15:30',end:'17:00',type:'audit',location:'Audit'},
  {id:'cs610-tue',title:'CS610 — Programming for Performance',day:'Tuesday',start:'09:00',end:'10:00',type:'audit',location:'Audit'},
  {id:'cs698b-tue',title:'CS698B — Data Engineering lab',day:'Tuesday',start:'10:00',end:'13:00',type:'audit',location:'Audit'},
  {id:'cs778-tue',title:'CS778 — Foundations of Modern AI',day:'Tuesday',start:'14:00',end:'15:15',type:'audit',location:'Audit'},
  {id:'cs777-tue',title:'CS777 — Topics in Learning Theory',day:'Tuesday',start:'14:00',end:'15:15',type:'audit',location:'Audit'},
  {id:'cs623-wed',title:'CS623 — GPU Architecture and Programming',day:'Wednesday',start:'09:00',end:'10:15',type:'audit',location:'Audit'},
  {id:'cs698b-wed',title:'CS698B — Fundamentals of Data Engineering I',day:'Wednesday',start:'10:30',end:'12:00',type:'audit',location:'Audit'},
  {id:'cs787-wed',title:'CS787 — Generative Artificial Intelligence',day:'Wednesday',start:'12:00',end:'13:15',type:'formal',location:'L20 / L19'},
  {id:'cs611-wed',title:'CS611 — System Level Data Formats and Representations for AI',day:'Wednesday',start:'17:00',end:'18:00',type:'formal',location:'KD102'},
  {id:'cs771-wed',title:'CS771 — Introduction to Machine Learning',day:'Wednesday',start:'18:10',end:'19:25',type:'formal',location:'L20'},
  {id:'cs781-thu',title:'CS781 — Large Language Models',day:'Thursday',start:'12:00',end:'13:15',type:'formal',location:'DJ205H / RM101'},
  {id:'ta-thu',title:'ESC111/112 — TA lab duty',day:'Thursday',start:'14:00',end:'15:00',type:'ta',location:'Assigned lab',editable:true},
  {id:'cs610-fri',title:'CS610 — Programming for Performance',day:'Friday',start:'08:00',end:'09:00',type:'audit',location:'Audit'},
  {id:'cs623-fri',title:'CS623 — GPU Architecture and Programming',day:'Friday',start:'09:00',end:'10:15',type:'audit',location:'Audit'},
  {id:'cs698b-fri',title:'CS698B — Fundamentals of Data Engineering I',day:'Friday',start:'10:30',end:'12:00',type:'audit',location:'Audit'},
  {id:'cs787-fri',title:'CS787 — Generative Artificial Intelligence',day:'Friday',start:'12:00',end:'13:15',type:'formal',location:'L20 / L19'},
  {id:'cs611-fri',title:'CS611 — System Level Data Formats and Representations for AI',day:'Friday',start:'17:00',end:'18:00',type:'formal',location:'KD102'},
  {id:'cs771-fri',title:'CS771 — Introduction to Machine Learning',day:'Friday',start:'18:10',end:'19:25',type:'formal',location:'L20'}
];
const STORAGE_KEY='iitk-weekly-timetable-v1';
let events = loadEvents();
const $ = (id) => document.getElementById(id);
const typeLabel = {formal:'Formal course',ta:'TA duty',audit:'Optional / audit'};
function loadEvents(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY))||structuredClone(DEFAULT_EVENTS)}catch{return structuredClone(DEFAULT_EVENTS)}}
function save(){localStorage.setItem(STORAGE_KEY,JSON.stringify(events));$('savedNote').textContent='Saved just now';setTimeout(()=>$('savedNote').textContent='Saved in this browser',1400)}
function mins(t){const [h,m]=t.split(':').map(Number);return h*60+m}
function formatTime(t){const [h,m]=t.split(':').map(Number);const hour=h%12||12;return `${hour}:${String(m).padStart(2,'0')} ${h<12?'AM':'PM'}`}
function overlaps(a,b){return a.day===b.day && mins(a.start)<mins(b.end) && mins(b.start)<mins(a.end)}
function clashes(){return new Set(events.filter((e,i)=>events.some((x,j)=>i!==j&&overlaps(e,x))).map(e=>e.id))}
function render(){const bad=clashes(), board=$('board');board.style.gridTemplateRows='56px 780px';board.innerHTML='<div class="corner"></div>'+DAYS.map(d=>`<div class="day-head">${d.slice(0,3).toUpperCase()}<small>${d}</small></div>`).join('');
  const rail=document.createElement('div');rail.className='time-rail';for(let h=8;h<=20;h++)rail.insertAdjacentHTML('beforeend',`<div class="time-cell">${String(h).padStart(2,'0')}:00</div>`);board.appendChild(rail);
  DAYS.forEach(day=>{const col=document.createElement('div');col.className='day-column';events.filter(e=>e.day===day).sort((a,b)=>mins(a.start)-mins(b.start)).forEach(e=>{const top=(mins(e.start)-480);const height=Math.max(42,(mins(e.end)-mins(e.start)));const card=document.createElement('article');card.className=`event-card ${e.type}${bad.has(e.id)?' clash':''}`;card.style.top=`${top}px`;card.style.height=`${height}px`;card.tabIndex=0;card.innerHTML=`<span class="event-title">${escapeHtml(e.title)}</span><span class="event-time">${formatTime(e.start)} – ${formatTime(e.end)}</span>${e.location?`<span class="event-location">${escapeHtml(e.location)}</span>`:''}${bad.has(e.id)?'<span class="clash-badge">CLASH</span>':''}<span class="event-tools"><button class="icon-btn" data-edit="${e.id}" aria-label="Edit">✎</button><button class="icon-btn" data-delete="${e.id}" aria-label="Delete">×</button></span>`;col.appendChild(card)});board.appendChild(col)});
  $('eventCount').textContent=events.length;$('formalCount').textContent=events.filter(e=>e.type==='formal').length;$('clashCount').textContent=bad.size;renderAudits();
}
function renderAudits(){const list=$('auditList');const auditGroups=[['CS778','Mon 15:30–17:00 · Tue 14:00–15:15'],['CS777','Mon 15:30–17:00 · Tue 14:00–15:15'],['CS610','Mon/Fri 08:00–09:00 · Tue 09:00–10:00'],['CS623','Wed/Fri 09:00–10:15'],['CS698B','Wed/Fri 10:30–12:00 · Tue lab 10:00–13:00']];list.innerHTML=auditGroups.map(([code,time])=>`<div class="audit-item${code==='CS778'||code==='CS777'?' clash-item':''}"><h3>${code}</h3><p>${time}</p>${code==='CS778'||code==='CS777'?'<div class="warning">⚠ overlaps with '+(code==='CS778'?'CS777':'CS778')+'</div>':''}</div>`).join('')}
function escapeHtml(s){return s.replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function openEditor(event){$('eventDialog').showModal();$('dialogTitle').textContent=event?'Edit event':'Add event';$('eventId').value=event?.id||'';$('title').value=event?.title||'';$('day').value=event?.day||'Monday';$('type').value=event?.type||'formal';$('start').value=event?.start||'09:00';$('end').value=event?.end||'10:00';$('location').value=event?.location||'';$('editableDefault').checked=!!event?.editable}
$('addBtn').onclick=()=>openEditor();$('resetBtn').onclick=()=>{if(confirm('Reset all events to the IITK defaults?')){events=structuredClone(DEFAULT_EVENTS);save();render()}};
$('board').addEventListener('click',e=>{const edit=e.target.closest('[data-edit]'),del=e.target.closest('[data-delete]');if(edit)openEditor(events.find(x=>x.id===edit.dataset.edit));if(del){events=events.filter(x=>x.id!==del.dataset.delete);save();render()}});
$('eventForm').addEventListener('submit',e=>{e.preventDefault();const data={id:$('eventId').value||`event-${Date.now()}`,title:$('title').value.trim(),day:$('day').value,type:$('type').value,start:$('start').value,end:$('end').value,location:$('location').value.trim(),editable:$('editableDefault').checked};if(mins(data.end)<=mins(data.start)){alert('End time must be after start time.');return}const index=events.findIndex(x=>x.id===data.id);if(index>-1)events[index]=data;else events.push(data);save();$('eventDialog').close();render()});
render();

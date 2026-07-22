const SVG_NS = 'http://www.w3.org/2000/svg';
const DEFAULT_SNAP = 5;
const GRID_SIZE_KEY = 'exhibitionVectorGridSize';
const AXIS_ALIGN_KEY = 'exhibitionVectorAxisAlign';
const MERGE_DISTANCE = 5;
const HIT_DISTANCE = 7;
const EPS = 0.001;

let active = false;
let mode = 'select';
let selected = null; // {type:'vertex'|'segment', id}
let drawStart = null;
let graph = { version: 1, vertices: [], segments: [] };
let history = [];
let historyIndex = -1;
let idCounter = 1;
let drag = null;
let group = null;
let statusEl = null;
let countsEl = null;
let toolbar = null;
let gridToggle = null;
let gridSizeInput = null;
let axisAlignToggle = null;
let alignmentGuides = { x: null, y: null };

function bridge(){ return window.ExhibitionJointRouteBridge; }
function floorMap(){ return document.querySelector('#floorMap'); }
function routeDetails(){ return document.querySelector('#routeEditorDetails'); }
function makeId(prefix){ return `${prefix}${Date.now().toString(36)}${(idCounter++).toString(36)}`; }
function clone(value){ return JSON.parse(JSON.stringify(value)); }
function vertexById(id){ return graph.vertices.find(v => v.id === id) || null; }
function segmentById(id){ return graph.segments.find(s => s.id === id) || null; }
function degree(id){ return graph.segments.reduce((n,s)=>n+(s.source===id||s.target===id?1:0),0); }
function setStatus(text){ if(statusEl) statusEl.textContent = text; }
function updateCounts(){ if(countsEl) countsEl.textContent = `꼭지점 ${graph.vertices.length}개 · 선분 ${graph.segments.length}개`; }
function currentGridSize(){
  const value=Number(gridSizeInput?.value ?? localStorage.getItem(GRID_SIZE_KEY) ?? DEFAULT_SNAP);
  return Math.max(1,Math.min(50,Number.isFinite(value)?Math.round(value):DEFAULT_SNAP));
}
function saveGridSize(){
  const value=currentGridSize();
  if(gridSizeInput) gridSizeInput.value=String(value);
  try{ localStorage.setItem(GRID_SIZE_KEY,String(value)); }catch{}
  return value;
}
function snapPoint(p){ const step=currentGridSize(); return gridToggle?.checked ? {x:Math.round(p.x/step)*step,y:Math.round(p.y/step)*step} : p; }
function axisAlignEnabled(){ return axisAlignToggle?.checked !== false; }
function alignmentThreshold(){ return Math.max(5, Math.min(14, currentGridSize() * 1.5)); }
function clearAlignmentGuides(){ alignmentGuides={x:null,y:null}; }
function alignedDragPoint(vertex, point, event){
  clearAlignmentGuides();
  if(!axisAlignEnabled() || event.altKey || event.shiftKey) return point;
  const threshold=alignmentThreshold();
  const neighbors=graph.segments
    .filter(s=>s.source===vertex.id||s.target===vertex.id)
    .map(s=>vertexById(s.source===vertex.id?s.target:s.source))
    .filter(Boolean);
  const others=graph.vertices.filter(v=>v.id!==vertex.id);
  let bestX=null,bestY=null;
  const considerX=(candidate,priority=1)=>{ const d=Math.abs(point.x-candidate); if(d<=threshold && (!bestX || d/priority<bestX.score)) bestX={value:candidate,score:d/priority,d}; };
  const considerY=(candidate,priority=1)=>{ const d=Math.abs(point.y-candidate); if(d<=threshold && (!bestY || d/priority<bestY.score)) bestY={value:candidate,score:d/priority,d}; };
  for(const n of neighbors){ considerX(n.x,2.4); considerY(n.y,2.4); }
  for(const v of others){ considerX(v.x,1); considerY(v.y,1); }
  const next={...point};
  if(bestX){ next.x=bestX.value; alignmentGuides.x=bestX.value; }
  if(bestY){ next.y=bestY.value; alignmentGuides.y=bestY.value; }
  return next;
}
function dist(a,b){ return Math.hypot(a.x-b.x,a.y-b.y); }
function cross(a,b,c,d){ return (b.x-a.x)*(d.y-c.y)-(b.y-a.y)*(d.x-c.x); }

function injectStyles(){
  if(document.querySelector('#nativeVectorRouteStyles')) return;
  const style=document.createElement('style');
  style.id='nativeVectorRouteStyles';
  style.textContent=`
    #routeEditorDetails{display:flex!important;flex-wrap:nowrap!important;align-items:center!important;gap:5px!important;overflow-x:auto;overflow-y:hidden;scrollbar-width:thin}
    #routeEditorDetails[hidden]{display:none!important}
    #routeEditorDetails>*{flex:0 0 auto}
    #routeEditorDetails button{min-width:0!important;padding-left:9px!important;padding-right:9px!important;white-space:nowrap}
    #routeEditorDetails .vre-spacer{margin-left:auto;flex:1 0 8px;min-width:8px}
    #routeEditorDetails button.vre-toggle.active{color:#fff;border-color:#1d4ed8;background:#1d4ed8}
    #routeEditorDetails .vre-grid-control{display:inline-flex;align-items:center;gap:5px;flex:0 0 auto}
    #routeEditorDetails .vre-grid-size{width:48px!important;min-width:48px;height:32px;padding:4px 5px!important;margin:0!important;border:1px solid #c7d0da;border-radius:8px;background:#fff;text-align:center;font-size:13px;font-weight:700}
    #routeEditorDetails .vre-grid-unit{font-size:12px;color:#536174;font-weight:700;white-space:nowrap}
    #floorMap.vre-active{cursor:default!important;outline:none!important;outline-offset:0!important}
    #floorMap.vre-active #centerlineDebugLayer{display:none!important}
    #vectorRouteSvgLayer .vre-segment{stroke:#2563eb;stroke-width:2.25;stroke-linecap:round;fill:none;cursor:pointer;vector-effect:non-scaling-stroke}
    #vectorRouteSvgLayer .vre-segment.selected{stroke:#f97316;stroke-width:4.25}
    #vectorRouteSvgLayer .vre-segment.closed{stroke:#dc2626;stroke-dasharray:7 5;opacity:.95}
    #vectorRouteSvgLayer .vre-segment.closed.selected{stroke:#f97316;stroke-dasharray:7 5;stroke-width:4.25}
    #vectorRouteSvgLayer .vre-vertex{fill:#fff;stroke:#1d4ed8;stroke-width:2;cursor:move;vector-effect:non-scaling-stroke}
    #vectorRouteSvgLayer .vre-vertex.selected{fill:#fed7aa;stroke:#f97316;stroke-width:3}
    #vectorRouteSvgLayer .vre-hit{stroke:transparent;stroke-width:12;fill:none;cursor:pointer;vector-effect:non-scaling-stroke}
    #vectorRouteGrid,#vectorRouteAlignmentGuides{pointer-events:none}
    #vectorRouteAlignmentGuides line{stroke:#ef4444;stroke-width:1.5;stroke-dasharray:5 4;vector-effect:non-scaling-stroke}
    .map-status.vre-editing-status #routeInfo{color:#1d4ed8;font-weight:700}
  `;
  document.head.append(style);
}

function setToggleButton(button, enabled){
  if(!button) return;
  button.checked=!!enabled;
  button.classList.toggle('active', !!enabled);
  button.setAttribute('aria-pressed', enabled ? 'true' : 'false');
}

function ensureToolbar(){
  injectStyles();
  const details=routeDetails();
  if(!details) return null;
  if(toolbar===details && details.dataset.vreReady==='1' && details.querySelector('[data-tool="draw"]')) return details;

  details.replaceChildren();
  details.className='admin-editor-detail-row';
  details.dataset.vreReady='1';

  const drawButton=document.createElement('button');
  drawButton.type='button';
  drawButton.dataset.tool='draw';
  drawButton.textContent='경로 추가';
  drawButton.title='새 경로를 연속으로 그립니다. 다시 누르면 선택 모드로 돌아갑니다.';

  const deleteButton=document.createElement('button');
  deleteButton.type='button';
  deleteButton.id='vreDelete';
  deleteButton.textContent='경로 삭제';
  deleteButton.title='선택한 선 또는 꼭지점을 삭제합니다.';

  const closeButton=document.createElement('button');
  closeButton.type='button';
  closeButton.id='vreCloseRoute';
  closeButton.textContent='폐쇄·재개';
  closeButton.title='선택한 경로를 길찾기에서 제외하거나 다시 사용할 수 있게 합니다.';

  const gridButton=document.createElement('button');
  gridButton.type='button';
  gridButton.id='vreGrid';
  gridButton.className='vre-toggle';
  gridButton.textContent='격자';
  gridButton.title='새 점과 이동한 점을 입력한 픽셀 간격에 맞춥니다.';

  const gridControl=document.createElement('span');
  gridControl.className='vre-grid-control';
  const gridInput=document.createElement('input');
  gridInput.id='vreGridSize';
  gridInput.className='vre-grid-size';
  gridInput.type='number';
  gridInput.min='1';
  gridInput.max='50';
  gridInput.step='1';
  gridInput.inputMode='numeric';
  gridInput.value=String(Math.max(1,Math.min(50,Number(localStorage.getItem(GRID_SIZE_KEY))||DEFAULT_SNAP)));
  gridInput.title='격자 간격을 1~50px로 입력합니다.';
  gridInput.setAttribute('aria-label','격자 간격');
  const gridUnit=document.createElement('span');
  gridUnit.className='vre-grid-unit';
  gridUnit.textContent='px';
  gridControl.append(gridButton,gridInput,gridUnit);

  const axisButton=document.createElement('button');
  axisButton.type='button';
  axisButton.id='vreAxisAlign';
  axisButton.className='vre-toggle';
  axisButton.textContent='직선·직각';
  axisButton.title='꼭지점을 이동할 때 주변 경로의 가로축·세로축에 자석처럼 맞춥니다. Shift 또는 Alt를 누르면 잠시 해제됩니다.';

  const resetButton=document.createElement('button');
  resetButton.type='button';
  resetButton.id='vreReset';
  resetButton.textContent='경로 복원';
  resetButton.title='엑셀에서 생성한 자동 경로로 되돌립니다.';

  const spacer=document.createElement('span');
  spacer.className='vre-spacer';
  spacer.setAttribute('aria-hidden','true');

  const undoButton=document.createElement('button');
  undoButton.type='button';
  undoButton.id='vreUndo';
  undoButton.textContent='취소';
  undoButton.title='실행 취소 (Ctrl+Z)';

  const redoButton=document.createElement('button');
  redoButton.type='button';
  redoButton.id='vreRedo';
  redoButton.textContent='다시';
  redoButton.title='다시 실행 (Ctrl+Y)';

  details.append(drawButton,deleteButton,closeButton,axisButton,gridControl,resetButton,spacer,undoButton,redoButton);
  toolbar=details;
  gridToggle=gridButton;
  gridSizeInput=gridInput;
  axisAlignToggle=axisButton;
  setToggleButton(gridToggle,false);
  setToggleButton(axisAlignToggle, localStorage.getItem(AXIS_ALIGN_KEY) !== '0');

  drawButton.addEventListener('click',()=>setMode(mode==='draw'?'select':'draw'));
  deleteButton.addEventListener('click',deleteSelected);
  closeButton.addEventListener('click',toggleSelectedRouteClosed);
  undoButton.addEventListener('click',undo);
  redoButton.addEventListener('click',redo);
  resetButton.addEventListener('click',resetAutomaticRoute);
  axisButton.addEventListener('click',()=>{
    setToggleButton(axisAlignToggle,!axisAlignToggle.checked);
    try{ localStorage.setItem(AXIS_ALIGN_KEY,axisAlignToggle.checked?'1':'0'); }catch{}
    clearAlignmentGuides();
    render();
    setStatus(axisAlignToggle.checked?'직선·직각 자석 정렬을 켰습니다.':'직선·직각 자석 정렬을 껐습니다.');
  });
  gridButton.addEventListener('click',()=>{
    setToggleButton(gridToggle,!gridToggle.checked);
    const step=saveGridSize();
    render();
    setStatus(gridToggle.checked?`${step}px 격자 맞춤이 켜졌습니다.`:'격자 맞춤을 껐습니다.');
  });
  const applyGridSize=()=>{
    const step=saveGridSize();
    if(gridToggle.checked) render();
    setStatus(`격자 간격을 ${step}px로 설정했습니다.`);
  };
  gridInput.addEventListener('change',applyGridSize);
  gridInput.addEventListener('blur',applyGridSize);
  gridInput.addEventListener('keydown',(event)=>{
    if(event.key==='Enter'){ event.preventDefault(); applyGridSize(); gridInput.blur(); }
  });
  gridInput.addEventListener('pointerdown',(event)=>event.stopPropagation());
  return details;
}

function ensureLayer(){
  const svg=floorMap();
  if(!svg) return null;
  group=svg.querySelector('#vectorRouteSvgLayer');
  if(group) return group;
  group=document.createElementNS(SVG_NS,'g');
  group.id='vectorRouteSvgLayer';
  const routeLine=svg.querySelector('#routeLine');
  if(routeLine) svg.insertBefore(group,routeLine); else svg.append(group);
  return group;
}

function svgPoint(event){
  const svg=floorMap();
  const pt=svg.createSVGPoint(); pt.x=event.clientX; pt.y=event.clientY;
  const matrix=svg.getScreenCTM();
  if(!matrix) return {x:0,y:0};
  const p=pt.matrixTransform(matrix.inverse());
  return {x:p.x,y:p.y};
}

function normalizeInput(data){
  const vertices=(data?.vertices||[]).map(v=>({id:String(v.id),x:Number(v.x)||0,y:Number(v.y)||0}));
  const ids=new Set(vertices.map(v=>v.id));
  const segments=(data?.segments||[]).map(s=>({id:String(s.id||makeId('s')),source:String(s.source),target:String(s.target),closed:s?.closed===true})).filter(s=>ids.has(s.source)&&ids.has(s.target)&&s.source!==s.target);
  return {version:1,vertices,segments,updatedAt:new Date().toISOString()};
}
function graphData(){ return normalizeInput(graph); }
function loadData(data){ graph=normalizeInput(data); selected=null; drawStart=null; normalizeTopology(); render(); }
function saveHistory(){ const raw=JSON.stringify(graphData()); if(history[historyIndex]===raw)return; history=history.slice(0,historyIndex+1); history.push(raw); if(history.length>100)history.shift(); historyIndex=history.length-1; }
function undo(){ if(historyIndex<=0)return; historyIndex--; loadData(JSON.parse(history[historyIndex])); bridge()?.applyVectorGraph?.(graphData()); setStatus('실행 취소했습니다.'); }
function redo(){ if(historyIndex>=history.length-1)return; historyIndex++; loadData(JSON.parse(history[historyIndex])); bridge()?.applyVectorGraph?.(graphData()); setStatus('다시 실행했습니다.'); }
function commit(message){ normalizeTopology(); render(); saveHistory(); bridge()?.applyVectorGraph?.(graphData()); if(message)setStatus(message); }

function findVertexNear(p,excludeId=null,threshold=MERGE_DISTANCE){
  let best=null; for(const v of graph.vertices){ if(v.id===excludeId)continue; const d=dist(v,p); if(d<=threshold&&(!best||d<best.d))best={v,d}; } return best?.v||null;
}
function hasSegment(a,b){ return graph.segments.some(s=>(s.source===a&&s.target===b)||(s.source===b&&s.target===a)); }
function addVertex(p,id=makeId('v')){ const v={id,x:p.x,y:p.y}; graph.vertices.push(v); return v; }
function addSegment(a,b,id=makeId('s'),closed=false){ if(!a||!b||a.id===b.id||hasSegment(a.id,b.id))return null; const s={id,source:a.id,target:b.id,closed:closed===true}; graph.segments.push(s); return s; }
function removeSegment(id){ graph.segments=graph.segments.filter(s=>s.id!==id); }
function removeVertex(id){ graph.vertices=graph.vertices.filter(v=>v.id!==id); graph.segments=graph.segments.filter(s=>s.source!==id&&s.target!==id); if(drawStart===id)drawStart=null; }
function removeDuplicates(){
  const seen=new Set(); graph.segments=graph.segments.filter(s=>{ if(s.source===s.target||!vertexById(s.source)||!vertexById(s.target))return false; const k=[s.source,s.target].sort().join('|'); if(seen.has(k))return false; seen.add(k); return true; });
}
function pointOnSegment(p,a,b,tolerance=1.5){ const abx=b.x-a.x,aby=b.y-a.y,len2=abx*abx+aby*aby;if(len2<EPS)return false;const t=((p.x-a.x)*abx+(p.y-a.y)*aby)/len2;if(t<-EPS||t>1+EPS)return false;const q={x:a.x+t*abx,y:a.y+t*aby};return dist(p,q)<=tolerance; }
function areCollinear(a,b,c,tolerance=1.5){ const len=dist(a,b); return len>=EPS&&Math.abs(cross(a,b,a,c))/len<=tolerance; }
function splitLinksAtExistingVertices(){
  let changed=false;
  for(const s of [...graph.segments]){
    if(!segmentById(s.id))continue; const a=vertexById(s.source),b=vertexById(s.target); if(!a||!b)continue;
    const candidates=graph.vertices.filter(v=>v.id!==a.id&&v.id!==b.id&&pointOnSegment(v,a,b)).sort((u,w)=>dist(u,a)-dist(w,a));
    if(!candidates.length)continue; const closed=s.closed===true; removeSegment(s.id); let prev=a; for(const v of candidates){addSegment(prev,v,makeId('s'),closed);prev=v;} addSegment(prev,b,makeId('s'),closed); changed=true;
  }
  return changed;
}
function simplifyCollinearDegreeTwo(){
  let total=0,changed=true,guard=0;
  while(changed&&guard++<500){ changed=false; for(const v of [...graph.vertices]){ if(v.id===drawStart||degree(v.id)!==2)continue; const links=graph.segments.filter(s=>s.source===v.id||s.target===v.id); const a=vertexById(links[0].source===v.id?links[0].target:links[0].source); const b=vertexById(links[1].source===v.id?links[1].target:links[1].source); if(!a||!b||a.id===b.id)continue; if(!areCollinear(a,b,v)||!pointOnSegment(v,a,b,2))continue; const closed=links[0].closed===true&&links[1].closed===true;removeSegment(links[0].id);removeSegment(links[1].id);removeVertex(v.id);addSegment(a,b,makeId('s'),closed);total++;changed=true;break; }}
  return total;
}
function removeIsolatedVertices(){ const before=graph.vertices.length; graph.vertices=graph.vertices.filter(v=>v.id===drawStart||degree(v.id)>0); return before-graph.vertices.length; }
function normalizeTopology(){ removeDuplicates(); let guard=0; while(splitLinksAtExistingVertices()&&guard++<50)removeDuplicates(); const simplified=simplifyCollinearDegreeTwo(); removeDuplicates(); const isolated=removeIsolatedVertices(); return {simplified,isolated}; }
function mergeVertices(source,target){
  for(const s of graph.segments){ if(s.source===source.id)s.source=target.id; if(s.target===source.id)s.target=target.id; }
  removeVertex(source.id); selected={type:'vertex',id:target.id}; normalizeTopology(); setStatus('꼭지점을 병합하고 중복 선과 불필요한 직선 중간점을 정리했습니다.');
}
function segmentIntersection(a,b,c,d){ const r={x:b.x-a.x,y:b.y-a.y},s={x:d.x-c.x,y:d.y-c.y};const den=r.x*s.y-r.y*s.x;if(Math.abs(den)<EPS)return null;const ca={x:c.x-a.x,y:c.y-a.y};const t=(ca.x*s.y-ca.y*s.x)/den,u=(ca.x*r.y-ca.y*r.x)/den;if(t<=EPS||t>=1-EPS||u<=EPS||u>=1-EPS)return null;return{x:a.x+t*r.x,y:a.y+t*r.y}; }
function splitSegmentAt(segment,vertex){ const a=vertexById(segment.source),b=vertexById(segment.target); if(!a||!b||a.id===vertex.id||b.id===vertex.id)return; const closed=segment.closed===true; removeSegment(segment.id); addSegment(a,vertex,makeId('s'),closed); addSegment(vertex,b,makeId('s'),closed); }
function processIntersections(){
  let made=0,changed=true,guard=0;
  while(changed&&guard++<300){changed=false;const links=[...graph.segments];outer:for(let i=0;i<links.length;i++)for(let j=i+1;j<links.length;j++){
    const l1=segmentById(links[i].id),l2=segmentById(links[j].id);if(!l1||!l2)continue;if([l1.source,l1.target].some(id=>id===l2.source||id===l2.target))continue;
    const a=vertexById(l1.source),b=vertexById(l1.target),c=vertexById(l2.source),d=vertexById(l2.target);if(!a||!b||!c||!d)continue;const p=segmentIntersection(a,b,c,d);if(!p)continue;
    let v=findVertexNear(p,null,4);if(!v){v=addVertex(p);made++;}splitSegmentAt(l1,v);splitSegmentAt(l2,v);removeDuplicates();changed=true;break outer;
  }} return made;
}
function projectedPoint(click,a,b){ const abx=b.x-a.x,aby=b.y-a.y,len2=abx*abx+aby*aby;if(len2<EPS)return{x:a.x,y:a.y};let t=((click.x-a.x)*abx+(click.y-a.y)*aby)/len2;t=Math.max(0,Math.min(1,t));return{x:a.x+t*abx,y:a.y+t*aby}; }
function vertexOnSegment(segment,click){ const a=vertexById(segment.source),b=vertexById(segment.target);if(!a||!b)return null;const p=projectedPoint(click,a,b);if(dist(p,a)<=MERGE_DISTANCE)return a;if(dist(p,b)<=MERGE_DISTANCE)return b;let v=findVertexNear(p,null,6);if(!v)v=addVertex(p);if(segmentById(segment.id))splitSegmentAt(segment,v);return v; }

function renderGrid(){
  if(!group)return; const old=group.querySelector('#vectorRouteGrid'); old?.remove(); if(!gridToggle?.checked)return;
  const svg=floorMap(),vb=svg.viewBox.baseVal,step=currentGridSize();const g=document.createElementNS(SVG_NS,'g');g.id='vectorRouteGrid';
  for(let x=Math.ceil(vb.x/step)*step;x<=vb.x+vb.width;x+=step){const l=document.createElementNS(SVG_NS,'line');l.setAttribute('x1',x);l.setAttribute('y1',vb.y);l.setAttribute('x2',x);l.setAttribute('y2',vb.y+vb.height);l.setAttribute('stroke','rgba(37,99,235,.12)');l.setAttribute('stroke-width','1');g.append(l);}
  for(let y=Math.ceil(vb.y/step)*step;y<=vb.y+vb.height;y+=step){const l=document.createElementNS(SVG_NS,'line');l.setAttribute('x1',vb.x);l.setAttribute('y1',y);l.setAttribute('x2',vb.x+vb.width);l.setAttribute('y2',y);l.setAttribute('stroke','rgba(37,99,235,.12)');l.setAttribute('stroke-width','1');g.append(l);}
  group.prepend(g);
}
function renderAlignmentGuides(){
  if(!group || (!alignmentGuides.x && !alignmentGuides.y)) return;
  const svg=floorMap(),vb=svg.viewBox.baseVal;
  const g=document.createElementNS(SVG_NS,'g');g.id='vectorRouteAlignmentGuides';
  if(alignmentGuides.x!==null){const l=document.createElementNS(SVG_NS,'line');l.setAttribute('x1',alignmentGuides.x);l.setAttribute('y1',vb.y);l.setAttribute('x2',alignmentGuides.x);l.setAttribute('y2',vb.y+vb.height);g.append(l);}
  if(alignmentGuides.y!==null){const l=document.createElementNS(SVG_NS,'line');l.setAttribute('x1',vb.x);l.setAttribute('y1',alignmentGuides.y);l.setAttribute('x2',vb.x+vb.width);l.setAttribute('y2',alignmentGuides.y);g.append(l);}
  group.append(g);
}
function render(){
  ensureLayer(); if(!group)return; group.replaceChildren(); renderGrid();
  for(const s of graph.segments){const a=vertexById(s.source),b=vertexById(s.target);if(!a||!b)continue;
    const hit=document.createElementNS(SVG_NS,'line');hit.classList.add('vre-hit');hit.dataset.segmentId=s.id;hit.setAttribute('x1',a.x);hit.setAttribute('y1',a.y);hit.setAttribute('x2',b.x);hit.setAttribute('y2',b.y);group.append(hit);
    const line=document.createElementNS(SVG_NS,'line');line.classList.add('vre-segment');if(s.closed===true)line.classList.add('closed');if(selected?.type==='segment'&&selected.id===s.id)line.classList.add('selected');line.dataset.segmentId=s.id;line.setAttribute('x1',a.x);line.setAttribute('y1',a.y);line.setAttribute('x2',b.x);line.setAttribute('y2',b.y);group.append(line);
  }
  renderAlignmentGuides();
  for(const v of graph.vertices){const c=document.createElementNS(SVG_NS,'circle');c.classList.add('vre-vertex');if(selected?.type==='vertex'&&selected.id===v.id)c.classList.add('selected');c.dataset.vertexId=v.id;c.setAttribute('cx',v.x);c.setAttribute('cy',v.y);c.setAttribute('r','4.25');group.append(c);}
  updateCounts();
}
function setMode(next){ mode=next;drawStart=null;selected=null;clearAlignmentGuides();toolbar?.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===next));render();setStatus(next==='draw'?'새 경로 그리기: 점·빈 공간·기존 선의 중간을 차례로 클릭하세요.':'선택·이동: 꼭지점을 끌거나 다른 꼭지점 위에 놓아 병합할 수 있습니다.'); }
function deleteSelected(){ if(!selected)return;const item=selected;selected=null;drawStart=null;if(item.type==='segment')removeSegment(item.id);else removeVertex(item.id);const result=normalizeTopology();commit(`선택 항목을 삭제했습니다. 고립 꼭지점 ${result.isolated}개와 직선 중간점 ${result.simplified}개를 정리했습니다.`); }
function toggleSelectedRouteClosed(){
  if(selected?.type!=='segment'){ setStatus('폐쇄하거나 재개할 경로 선분을 먼저 선택하세요.'); return; }
  const segment=segmentById(selected.id);
  if(!segment){ setStatus('선택한 경로를 찾지 못했습니다.'); return; }
  segment.closed=segment.closed!==true;
  commit(segment.closed?'선택한 경로를 폐쇄했습니다. 길찾기에서 제외됩니다.':'선택한 경로를 다시 사용하도록 복구했습니다.');
}

function onPointerDown(event){
  if(!active)return; const vertexEl=event.target.closest?.('.vre-vertex'); const segmentEl=event.target.closest?.('[data-segment-id]'); const p=svgPoint(event);
  if(vertexEl){event.preventDefault();event.stopPropagation();const id=vertexEl.dataset.vertexId;if(mode==='draw'){const v=vertexById(id);if(drawStart&&drawStart!==id)addSegment(vertexById(drawStart),v);drawStart=id;selected={type:'vertex',id};processIntersections();commit();}else{selected={type:'vertex',id};drag={id,start:clone(vertexById(id)),moved:false};render();}return;}
  if(segmentEl){event.preventDefault();event.stopPropagation();const id=segmentEl.dataset.segmentId;if(mode==='select'){selected={type:'segment',id};render();setStatus(segmentById(id)?.closed===true?'폐쇄된 경로를 선택했습니다. 경로 폐쇄·재개 버튼으로 복구할 수 있습니다.':'경로를 선택했습니다. 삭제하거나 폐쇄할 수 있습니다.');}else{const v=vertexOnSegment(segmentById(id),p);if(v){if(drawStart&&drawStart!==v.id)addSegment(vertexById(drawStart),v);drawStart=v.id;selected={type:'vertex',id:v.id};processIntersections();commit('기존 선 중간에 꼭지점을 만들고 경로를 연결했습니다.');}}return;}
  if(mode==='draw'){event.preventDefault();event.stopPropagation();const q=snapPoint(p);let v=findVertexNear(q,null,HIT_DISTANCE);if(!v)v=addVertex(q);if(drawStart&&drawStart!==v.id)addSegment(vertexById(drawStart),v);drawStart=v.id;selected={type:'vertex',id:v.id};processIntersections();commit();}else{selected=null;render();}
}
function onPointerMove(event){ if(!active||!drag)return;const v=vertexById(drag.id);if(!v)return;const raw=snapPoint(svgPoint(event));const p=alignedDragPoint(v,raw,event);v.x=p.x;v.y=p.y;drag.moved=true;render();event.preventDefault();event.stopPropagation(); }
function onPointerUp(event){ if(!active||!drag)return;const v=vertexById(drag.id);if(v&&drag.moved){const target=findVertexNear(v,v.id);if(target)mergeVertices(v,target);processIntersections();commit();}drag=null;clearAlignmentGuides();render();event.preventDefault();event.stopPropagation(); }
function onKeyDown(event){ if(!active)return;const target=event.target;const typing=target instanceof HTMLInputElement||target instanceof HTMLTextAreaElement||target instanceof HTMLSelectElement||target?.isContentEditable;const key=event.key.toLowerCase(),command=event.ctrlKey||event.metaKey;if(command&&key==='z'){event.preventDefault();event.stopPropagation();event.shiftKey?redo():undo();return;}if(command&&key==='y'){event.preventDefault();event.stopPropagation();redo();return;}if(typing)return;if((event.key==='Delete'||event.key==='Backspace')&&selected){event.preventDefault();deleteSelected();}else if(event.key==='Escape'){drawStart=null;selected=null;normalizeTopology();commit('현재 선택과 그리기 시작점을 취소했습니다.');}}

function bindEvents(){ const svg=floorMap();if(!svg||svg.dataset.vreBound==='1')return;svg.dataset.vreBound='1';svg.addEventListener('pointerdown',onPointerDown,true);window.addEventListener('pointermove',onPointerMove,true);window.addEventListener('pointerup',onPointerUp,true);window.addEventListener('keydown',onKeyDown,true); }


function applyGraph(){ normalizeTopology();bridge()?.applyVectorGraph?.(graphData());saveHistory();setStatus('벡터 경로를 적용했습니다. 현재 지도와 길찾기에 반영되었습니다.'); }
function resetAutomaticRoute(){ if(!confirm('현재 벡터 편집 내용을 버리고 이 엑셀에서 자동 생성한 경로로 초기화할까요?'))return;bridge()?.clearVectorGraph?.();loadData(bridge()?.exportCurrentGraph?.()||{vertices:[],segments:[]});processIntersections();normalizeTopology();history=[];historyIndex=-1;saveHistory();render();setStatus('현재 엑셀의 자동 생성 경로로 초기화했습니다.'); }
function openEditor(options={}){
  toolbar=null;
  const details=ensureToolbar();
  const detailRow=document.querySelector('#adminEditorDetailRow');
  if(detailRow) detailRow.hidden=false;
  if(details){ details.hidden=false; details.style.removeProperty('display'); }
  ensureLayer();
  bindEvents();
  statusEl=document.querySelector('#routeInfo');
  countsEl=document.querySelector('#vreCounts');
  if(!countsEl){
    countsEl=document.createElement('span');
    countsEl.id='vreCounts';
    document.querySelector('.map-status')?.append(countsEl);
  }
  active=true;
  floorMap()?.classList.add('vre-active');
  document.querySelector('.map-status')?.classList.add('vre-editing-status');
  loadData(bridge()?.exportCurrentGraph?.()||{vertices:[],segments:[]});
  processIntersections();
  normalizeTopology();
  history=[];
  historyIndex=-1;
  saveHistory();
  setMode('select');
  render();
  setStatus('현재 관리자 지도에서 직접 경로를 편집 중입니다. 변경 내용은 즉시 반영됩니다.');
}
function closeEditor(options={}){
  active=false;
  drag=null;
  drawStart=null;
  selected=null;
  group?.remove();
  group=null;
  floorMap()?.classList.remove('vre-active');
  document.querySelector('.map-status')?.classList.remove('vre-editing-status');
  if(countsEl) countsEl.textContent='';
  setStatus('목적지를 선택해 주세요.');
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{injectStyles();bindEvents();},{once:true});else{injectStyles();bindEvents();}
window.JointRouteEditor=Object.freeze({open:openEditor,close:closeEditor,isOpen:()=>active});

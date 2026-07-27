(() => {
const store=window.FINDER_PROJECT_STORE,mapData=window.FINDER_MAP_DATA,baseGraph=window.FINDER_ROUTE_GRAPH;
let project=store.load(),dirty=false,history=[],future=[],autoSaveTimer=0;
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)],clone=v=>store.clone(v);
function snapshot(label){history.push({label,project:clone(project)});if(history.length>40)history.shift();future=[];historyButtons()}
function historyButtons(){$('#undoBtn').disabled=!history.length;$('#redoBtn').disabled=!future.length}
function scheduleAutoSave(){clearTimeout(autoSaveTimer);autoSaveTimer=setTimeout(()=>{if(dirty)saveAll('자동 저장됨')},220)}
function markDirty(text='변경사항 있음'){dirty=true;$('#saveState').textContent=text+' · 자동 저장 대기';$('#saveState').style.color='#c16a00';renderStats();scheduleAutoSave()}
function saveAll(statusText='저장됨'){project=store.save(project);dirty=false;$('#saveState').textContent=statusText+' · '+new Date().toLocaleTimeString();$('#saveState').style.color='#16834b'}
function restore(p){project=clone(p);store.save(project);location.reload()}
$('#saveBtn').onclick=saveAll;$('#undoBtn').onclick=()=>{if(!history.length)return;future.push({project:clone(project)});restore(history.pop().project)};$('#redoBtn').onclick=()=>{if(!future.length)return;history.push({project:clone(project)});restore(future.pop().project)};
function showView(id){
  $$('[data-view]').forEach(x=>x.classList.toggle('active',x.dataset.view===id));
  $$('.panelview').forEach(x=>x.classList.toggle('active',x.id===id));
  if(id!=='route')window.JointRouteEditor?.close?.({preserveGraph:true});
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    if(id==='route'){
      initRouteMap();
      setTimeout(()=>{routeMap?.resize();repairRouteEditorVisibility()},80);
    }
    if(id==='booth'){
      initBoothMap();
      setTimeout(()=>{boothMap?.resize();if(boothMap&&boundsFromBooths())boothMap.fitBounds(boundsFromBooths(),{padding:45,duration:0})},80);
    }
    if(id==='location'){
      initLocationMap();
      setTimeout(()=>{locationMap?.resize();if(locationMap&&boundsFromBooths())locationMap.fitBounds(boundsFromBooths(),{padding:45,duration:0})},80);
    }
  }));
}
$$('[data-view]').forEach(b=>b.onclick=()=>showView(b.dataset.view));$('#adminTitle').textContent=(project.exhibitionName||'전시장')+' 관리자';
function graphData(){if(!project.routeGraph)project.routeGraph={vertices:clone(baseGraph.vertices||[]),segments:clone(baseGraph.segments||[])};return project.routeGraph}


/* Existing lightweight vector editor + MapLibre projection bridge */
let routeMap=null;
let routeOverlaySyncQueued=false;

function ensureRouteOverlay(){
  const stack=document.querySelector('.route-map-stack');
  const svg=$('#floorMap');
  if(!stack||!svg)return null;
  const rect=stack.getBoundingClientRect();
  const width=Math.max(1,Math.round(rect.width));
  const height=Math.max(1,Math.round(rect.height));
  svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
  svg.setAttribute('width',String(width));
  svg.setAttribute('height',String(height));
  Object.assign(svg.style,{
    position:'absolute',inset:'0',display:'block',visibility:'visible',
    width:'100%',height:'100%',zIndex:'20',background:'transparent',overflow:'visible'
  });
  stack.style.position='relative';
  stack.style.overflow='hidden';
  return svg;
}
function exportProjectedRouteGraph(){
  const g=graphData();
  if(!routeMap)return{version:1,vertices:[],segments:[]};
  ensureRouteOverlay();
  return{
    version:1,
    vertices:g.vertices.map(v=>{const q=routeMap.project(v.coord);return{id:String(v.id),x:q.x,y:q.y}}),
    segments:g.segments.map(s=>({id:String(s.id),source:String(s.source),target:String(s.target),closed:project.routeClosures?.[s.id]===true})),
    updatedAt:new Date().toISOString()
  };
}
function applyProjectedRouteGraph(data){
  if(!routeMap)return false;
  const vertices=(data?.vertices||[]).map(v=>({
    id:String(v.id),
    coord:routeMap.unproject([Number(v.x),Number(v.y)]).toArray()
  })).filter(v=>v.coord.every(Number.isFinite));
  const ids=new Set(vertices.map(v=>v.id));
  const segments=[];
  const closures={};
  for(const s of data?.segments||[]){
    const source=String(s.source),target=String(s.target);
    if(!ids.has(source)||!ids.has(target)||source===target)continue;
    const id=String(s.id||nextId('s'));
    segments.push({id,source,target});
    if(s.closed===true)closures[id]=true;
  }
  project.routeGraph={vertices,segments};
  project.routeClosures=closures;
  project=store.save(project);
  dirty=false;
  updateRouteStats();
  $('#saveState').textContent='경로 자동 저장됨 · '+new Date().toLocaleTimeString();
  $('#saveState').style.color='#16834b';
  return true;
}
function resetProjectedRouteGraph(){
  project.routeGraph={vertices:clone(baseGraph.vertices||[]),segments:clone(baseGraph.segments||[])};
  project.routeClosures={};
  project=store.save(project);
  dirty=false;
  updateRouteStats();
  queueRouteOverlaySync();
}
window.ExhibitionJointRouteBridge=Object.freeze({
  exportCurrentGraph:exportProjectedRouteGraph,
  applyVectorGraph:applyProjectedRouteGraph,
  clearVectorGraph:resetProjectedRouteGraph,
  hasVectorGraph:()=>!!graphData().vertices.length,
  getCanvasInfo:()=>{const svg=ensureRouteOverlay();const vb=svg?.viewBox?.baseVal;return{width:Math.max(1,vb?.width||1),height:Math.max(1,vb?.height||1),backgroundDataUrl:null}}
});
function queueRouteOverlaySync(){
  if(routeOverlaySyncQueued)return;
  routeOverlaySyncQueued=true;
  requestAnimationFrame(()=>{
    routeOverlaySyncQueued=false;
    ensureRouteOverlay();
    window.JointRouteEditor?.refreshProjection?.();
  });
}

function repairRouteEditorVisibility(){
  const svg=ensureRouteOverlay();
  if(!svg||!routeMap)return;
  window.JointRouteEditor?.open?.();
  queueRouteOverlaySync();
  requestAnimationFrame(()=>{
    const layer=svg.querySelector('#vectorRouteSvgLayer');
    if(layer){
      layer.style.display='block';
      layer.style.visibility='visible';
      layer.style.opacity='1';
    }
    window.JointRouteEditor?.refreshProjection?.();
  });
}

let boothEditIdSeq=1;
function ensureStableBoothFeatureIds(fc){
  if(!fc?.features)return fc;
  const used=new Set();
  for(const f of fc.features){
    if(!f.properties)f.properties={};
    let id=String(f.properties.__boothEditId||'').trim();
    if(!id||used.has(id)){
      do{id=`booth-${boothEditIdSeq++}`}while(used.has(id));
      f.properties.__boothEditId=id;
    }
    used.add(id);
    f.id=id;
  }
  return fc;
}
function nextStableBoothFeatureId(){
  const used=new Set((project.boothFeatures?.features||[]).map(f=>String(f.properties?.__boothEditId||f.id||'')));
  let id;do{id=`booth-${boothEditIdSeq++}`}while(used.has(id));return id;
}
function boothData(){if(!project.boothFeatures)project.boothFeatures=clone(mapData.booths);return ensureStableBoothFeatureIds(project.boothFeatures)}
function renderStats(){const g=graphData(),b=boothData();$('#stats').innerHTML=`<div class="stat"><span>부스 도형</span><b>${b.features.length}</b></div><div class="stat"><span>경로 꼭지점</span><b>${g.vertices.length}</b></div><div class="stat"><span>폐쇄 경로</span><b>${Object.values(project.routeClosures||{}).filter(Boolean).length}</b></div><div class="stat"><span>관리 지점</span><b>${project.locations.features.length}</b></div>`}
function boundsFromBooths(){const b=new maplibregl.LngLatBounds();boothData().features.forEach(f=>(f.geometry.coordinates[0]||[]).forEach(c=>b.extend(c)));return b}

function validLngLatCoord(coord){return Array.isArray(coord)&&coord.length>=2&&Number.isFinite(Number(coord[0]))&&Number.isFinite(Number(coord[1]))}
function eachGeometryCoord(geometry,callback){
  if(!geometry)return;
  if(geometry.type==='Polygon')geometry.coordinates.forEach(ring=>ring.forEach(callback));
  else if(geometry.type==='MultiPolygon')geometry.coordinates.forEach(poly=>poly.forEach(ring=>ring.forEach(callback)));
}
function boothLabelPoints(){
  const groups=new Map();
  for(const feature of currentBooths().features||[]){
    const booth=String(feature?.properties?.booth||'').trim();
    if(!booth)continue;
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    eachGeometryCoord(feature?.geometry,c=>{
      if(!Array.isArray(c)||c.length<2)return;
      const x=Number(c[0]),y=Number(c[1]);
      if(!Number.isFinite(x)||!Number.isFinite(y))return;
      minX=Math.min(minX,x);maxX=Math.max(maxX,x);
      minY=Math.min(minY,y);maxY=Math.max(maxY,y);
    });
    if(!Number.isFinite(minX))continue;
    const item=groups.get(booth)||{booth,minX,maxX,minY,maxY,properties:{...(feature.properties||{}),booth}};
    item.minX=Math.min(item.minX,minX);item.maxX=Math.max(item.maxX,maxX);
    item.minY=Math.min(item.minY,minY);item.maxY=Math.max(item.maxY,maxY);
    groups.set(booth,item);
  }
  const positions=project.labelPositions||{};
  return{type:'FeatureCollection',features:[...groups.values()].map(item=>{
    const manual=positions[item.booth];
    const coord=validLngLatCoord(manual)?[Number(manual[0]),Number(manual[1])]:[(item.minX+item.maxX)/2,(item.minY+item.maxY)/2];
    return{type:'Feature',properties:item.properties,geometry:{type:'Point',coordinates:coord}};
  })};
}
function currentLabelCoordForBooth(booth){
  const feature=boothLabelPoints().features.find(item=>String(item?.properties?.booth||'')===String(booth||''));
  return feature?.geometry?.coordinates?.slice?.()||null;
}
function addUnifiedMapControls(map,fit){
  if(!map||map.__finderUnifiedControls)return;
  class Control{
    onAdd(){
      const wrap=document.createElement('div');
      wrap.className='maplibregl-ctrl maplibregl-ctrl-group finder-map-controls';
      const make=(label,title,handler)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.title=title;b.setAttribute('aria-label',title);b.onclick=handler;return b};
      wrap.append(
        make('+','확대',()=>map.zoomIn({duration:180})),
        make('−','축소',()=>map.zoomOut({duration:180})),
        make('⌂','제자리로 돌아가기',()=>{map.easeTo({bearing:0,pitch:0,duration:180});setTimeout(()=>fit?.(),190)})
      );
      return wrap;
    }
    onRemove(){this._container?.remove?.()}
  }
  map.addControl(new Control(),'top-right');
  map.__finderUnifiedControls=true;
}
function addUnifiedBoothLayers(map,prefix,sourceId='booths'){
  const labelSource=`${prefix}-booth-label-points`;
  if(!map.getSource(labelSource))map.addSource(labelSource,{type:'geojson',data:boothLabelPoints()});
  map.addLayer({id:`${prefix}-booth-fill`,type:'fill',source:sourceId,paint:{'fill-color':['coalesce',['get','color'],'#d9e2ef'],'fill-opacity':.72,'fill-outline-color':'#65758b'}});
  map.addLayer({id:`${prefix}-booth-outline`,type:'line',source:sourceId,paint:{'line-color':'#52637a','line-width':1}});
  map.addLayer({id:`${prefix}-booth-labels`,type:'symbol',source:labelSource,layout:{'text-field':['coalesce',['get','booth'],''],'text-size':11,'text-anchor':'center','text-allow-overlap':false,'text-ignore-placement':false},paint:{'text-color':'#15243b','text-halo-color':'#ffffff','text-halo-width':1.5}});
}
function refreshUnifiedBoothLabels(map,prefix){
  map?.getSource(`${prefix}-booth-label-points`)?.setData(boothLabelPoints());
}

function baseMap(container,pitch=20){
  const el=typeof container==='string'?document.getElementById(container):container;
  if(!el)throw new Error('Map container not found: '+container);
  el.style.display='block';el.style.visibility='visible';
  if(!el.style.minHeight)el.style.minHeight='560px';
  const map=new maplibregl.Map({container:el,style:{version:8,sources:{},layers:[{id:'bg',type:'background',paint:{'background-color':'#f5f7fb'}}]},center:[.055,-.075],zoom:12,pitch,bearing:pitch? -15:0,antialias:true,cooperativeGestures:false});
  const resize=()=>{try{map.resize()}catch{}};
  requestAnimationFrame(()=>requestAnimationFrame(resize));
  if(typeof ResizeObserver!=='undefined'){
    const observer=new ResizeObserver(resize);observer.observe(el);map.__finderResizeObserver=observer;
  }
  return map;
}
function nextId(prefix){return prefix+Date.now().toString(36)+Math.random().toString(36).slice(2,5)}
function nearestPointOnSegment(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],d=dx*dx+dy*dy;if(!d)return a.slice();let t=((p[0]-a[0])*dx+(p[1]-a[1])*dy)/d;t=Math.max(0,Math.min(1,t));return[a[0]+t*dx,a[1]+t*dy]}
function nearestRouteSnap(coord,map,maxPx=35){
  if(!map)return null;
  const limit=Math.max(1,Number(maxPx)||35),g=graphData();
  const p=map.project(coord),by=new Map(g.vertices.map(v=>[String(v.id),v.coord]));
  let bestVertex=null,bestVertexD=Infinity;
  for(const v of g.vertices){
    if(!Array.isArray(v.coord))continue;
    const q=map.project(v.coord),d=Math.hypot(p.x-q.x,p.y-q.y);
    if(d<bestVertexD){bestVertexD=d;bestVertex=v.coord.slice();}
  }
  const vertexLimit=Math.min(limit,18);
  if(bestVertex&&bestVertexD<=vertexLimit)return{coord:bestVertex,type:'vertex',distancePx:bestVertexD};
  let bestSegment=null,bestSegmentD=Infinity;
  for(const s of g.segments){
    const a=by.get(String(s.source)),b=by.get(String(s.target));
    if(!a||!b)continue;
    const q=nearestPointOnSegment(coord,a,b),qp=map.project(q),d=Math.hypot(p.x-qp.x,p.y-qp.y);
    if(d<bestSegmentD){bestSegmentD=d;bestSegment=q;}
  }
  return bestSegment&&bestSegmentD<=limit?{coord:bestSegment,type:'segment',distancePx:bestSegmentD}:null;
}
function nearestRoutePoint(coord,map,maxPx=35){return nearestRouteSnap(coord,map,maxPx)?.coord||null}

/* route editor: original lightweight SVG editor projected over MapLibre */
function routeGeo(){
  const g=graphData(),by=new Map(g.vertices.map(v=>[String(v.id),v.coord]));
  return{type:'FeatureCollection',features:g.segments.map(s=>({
    type:'Feature',id:String(s.id),properties:{id:String(s.id),closed:project.routeClosures?.[s.id]===true},
    geometry:{type:'LineString',coordinates:[by.get(String(s.source)),by.get(String(s.target))]}
  })).filter(f=>f.geometry.coordinates.every(Boolean))};
}
function boothBackdrop(){return clone(boothData())}
function updateRouteStats(){
  $('#routeTotal').textContent=graphData().segments.length;
  $('#routeClosed').textContent=Object.values(project.routeClosures||{}).filter(Boolean).length;
}
function initRouteMap(){
  if(routeMap){
    routeMap.resize();
    repairRouteEditorVisibility();
    return;
  }
  routeMap=baseMap('routeMap',0);
  routeMap.setMinPitch(0);
  routeMap.setMaxPitch(0);
  routeMap.dragRotate.disable();
  routeMap.touchZoomRotate.disableRotation();
  routeMap.keyboard.disableRotation?.();
  addUnifiedMapControls(routeMap,()=>{if(boundsFromBooths())routeMap.fitBounds(boundsFromBooths(),{padding:42,duration:250})});
  routeMap.on('load',()=>{
    routeMap.jumpTo({pitch:0,bearing:0});
    routeMap.addSource('booths',{type:'geojson',data:boothBackdrop()});
    addUnifiedBoothLayers(routeMap,'route','booths');
    routeMap.fitBounds(boundsFromBooths(),{padding:42,duration:0});
    repairRouteEditorVisibility();
    updateRouteStats();
  });
  routeMap.on('movestart',()=>window.JointRouteEditor?.suspendProjection?.());
  routeMap.on('move',queueRouteOverlaySync);
  routeMap.on('zoom',queueRouteOverlaySync);
  routeMap.on('moveend',()=>{queueRouteOverlaySync();window.JointRouteEditor?.resumeProjection?.()});
  routeMap.on('zoomend',()=>{queueRouteOverlaySync();window.JointRouteEditor?.resumeProjection?.()});
  routeMap.on('resize',queueRouteOverlaySync);
}
$('#routeFit').onclick=()=>{if(routeMap&&boundsFromBooths())routeMap.fitBounds(boundsFromBooths(),{padding:42,duration:250})};

/* booth editor */
let boothMap,selectedBooth='',selectedFeatureId=null,boothLabelDrag=null,labelAdjustMode=false;
const selectedBoothFeatureIds=new Set();
function displayOptions(){return store.merge(store.DEFAULT_DISPLAY_OPTIONS||{showBoothNumber:true,showCompanyName:false,showSpecialBooths:true},project.displayOptions||{})}
function ensureProjectLabelOverride(booth){project.labelOverrides=project.labelOverrides||{};project.labelOverrides[booth]=project.labelOverrides[booth]||{};return project.labelOverrides[booth]}
function globalBoothHeight(){const n=Number(project.globalBoothHeight);return Number.isFinite(n)?Math.max(0,Math.min(300,n)):80}
function currentBooths(){const copy=clone(boothData());const h=globalBoothHeight();copy.features.forEach(f=>{const o=project.boothOverrides[f.properties.booth];if(o)Object.assign(f.properties,o);f.properties.height=h});return copy}
function ensureBoothEditorUiStyles(){
  if(document.getElementById('finder-booth-editor-ui-style'))return;
  const style=document.createElement('style');style.id='finder-booth-editor-ui-style';
  style.textContent=`.check-row{display:flex;align-items:center;gap:8px;margin:6px 0;color:#223a57;font-size:13px}.check-row input{margin:0}`;
  document.head.appendChild(style);
}
function specialBoothMeta(kind){return kind==='premium'?{icon:'◆',label:'프리미엄',color:'#6d3ee8'}:kind==='awards'?{icon:'♛',label:'어워즈',color:'#f2a000'}:kind==='event'?{icon:'✦',label:'이벤트',color:'#ef476f'}:{icon:'',label:'',color:'#64748b'}}
function adminSpecialPointData(){
  const features=[];
  for(const feature of boothLabelPoints().features||[]){
    const booth=String(feature.properties?.booth||'').trim();
    const kind=project.specialBooths?.[booth]||'';
    if(!booth||!kind)continue;
    const meta=specialBoothMeta(kind);
    features.push({type:'Feature',properties:{booth,kind,icon:meta.icon,label:meta.label,color:meta.color},geometry:{type:'Point',coordinates:feature.geometry.coordinates.slice()}});
  }
  return {type:'FeatureCollection',features};
}
function boothLabelHandleData(coord=currentLabelCoordForBooth(selectedBooth)){
  if(!labelAdjustMode||selectedBoothFeatureIds.size!==1||!selectedBooth||!validLngLatCoord(coord))return {type:'FeatureCollection',features:[]};
  return {type:'FeatureCollection',features:[{type:'Feature',properties:{booth:selectedBooth},geometry:{type:'Point',coordinates:[Number(coord[0]),Number(coord[1])]}}]};
}
function addAdminBoothOverlayLayers(){
  if(!boothMap.getSource('booth-admin-special-points'))boothMap.addSource('booth-admin-special-points',{type:'geojson',data:adminSpecialPointData()});
  boothMap.addLayer({id:'booth-admin-special-ring',type:'circle',source:'booth-admin-special-points',paint:{
    'circle-radius':13,'circle-color':'#ffffff','circle-opacity':.98,'circle-stroke-width':3,
    'circle-stroke-color':['match',['get','kind'],'premium','#6d3ee8','awards','#f2a000','event','#ef476f','#64748b'],
    'circle-translate':[0,-18],'circle-translate-anchor':'viewport'
  }});
  boothMap.addLayer({id:'booth-admin-special-icon',type:'symbol',source:'booth-admin-special-points',layout:{
    'text-field':['get','icon'],'text-size':19,'text-font':['Open Sans Bold'],'text-allow-overlap':true,'text-ignore-placement':true
  },paint:{
    'text-color':['match',['get','kind'],'premium','#6d3ee8','awards','#f2a000','event','#ef476f','#64748b'],
    'text-halo-color':'#ffffff','text-halo-width':1.3,'text-translate':[0,-18],'text-translate-anchor':'viewport'
  }});
  if(!boothMap.getSource('booth-label-handle-source'))boothMap.addSource('booth-label-handle-source',{type:'geojson',data:boothLabelHandleData()});
  boothMap.addLayer({id:'booth-label-handle-ring',type:'circle',source:'booth-label-handle-source',paint:{
    'circle-radius':12,'circle-color':'#ffffff','circle-opacity':.96,'circle-stroke-color':'#ff6b00','circle-stroke-width':3
  }});
  boothMap.addLayer({id:'booth-label-handle-cross',type:'symbol',source:'booth-label-handle-source',layout:{
    'text-field':'+','text-size':22,'text-font':['Open Sans Bold'],'text-allow-overlap':true,'text-ignore-placement':true
  },paint:{'text-color':'#ff6b00','text-halo-color':'#ffffff','text-halo-width':1}});
  boothMap.addLayer({id:'booth-label-handle-hit',type:'circle',source:'booth-label-handle-source',paint:{'circle-radius':20,'circle-color':'#ffffff','circle-opacity':0}});
}
function refreshAdminSpecialBadges(){boothMap?.getSource('booth-admin-special-points')?.setData(adminSpecialPointData())}
function refreshBoothLabelHandle(coord){boothMap?.getSource('booth-label-handle-source')?.setData(boothLabelHandleData(coord))}
function setLabelAdjustMode(active){
  labelAdjustMode=!!active&&selectedBoothFeatureIds.size===1&&!!selectedBooth;
  const button=$('#boothLabelAdjust');
  if(button){button.classList.toggle('active-tool',labelAdjustMode);button.textContent=labelAdjustMode?'라벨 위치 조정 완료':'라벨 위치 조정'}
  if(!labelAdjustMode&&boothLabelDrag){boothLabelDrag=null;boothMap?.dragPan?.enable();}
  refreshBoothLabelHandle();updateBoothLabelInfo();
}
function updateBoothLabelInfo(){
  const el=$('#boothLabelInfo');if(!el)return;
  if(selectedBoothFeatureIds.size!==1||!selectedBooth){el.textContent='라벨 위치를 조정할 부스를 선택하세요.';return}
  const coord=currentLabelCoordForBooth(selectedBooth);
  if(!validLngLatCoord(coord)){el.textContent='현재 라벨 기준점을 계산할 수 없습니다.';return}
  const manual=validLngLatCoord(project.labelPositions?.[selectedBooth]);
  el.textContent=labelAdjustMode?`주황색 십자 핸들을 드래그하세요. 현재 기준점: ${coord[0].toFixed(6)}, ${coord[1].toFixed(6)}`:`현재 위치: ${manual?'수동 조정':'기본 좌표'} · ${coord[0].toFixed(6)}, ${coord[1].toFixed(6)}`;
}
function startBoothLabelDrag(e){
  if(!labelAdjustMode||selectedBoothFeatureIds.size!==1||!selectedBooth)return;
  e.preventDefault?.();
  boothLabelDrag={booth:selectedBooth,coord:[e.lngLat.lng,e.lngLat.lat]};
  boothMap.dragPan.disable();
  boothMap.getCanvas().style.cursor='grabbing';
  refreshBoothLabelHandle(boothLabelDrag.coord);
}
function moveBoothLabelDrag(e){
  if(!boothLabelDrag||!e.lngLat)return;
  boothLabelDrag.coord=[e.lngLat.lng,e.lngLat.lat];
  refreshBoothLabelHandle(boothLabelDrag.coord);
}
function finishBoothLabelDrag(){
  if(!boothLabelDrag)return;
  const drag=boothLabelDrag;boothLabelDrag=null;
  boothMap.dragPan.enable();boothMap.getCanvas().style.cursor='';
  if(drag.booth!==selectedBooth||!validLngLatCoord(drag.coord)){refreshBoothLabelHandle();return}
  project.labelPositions=project.labelPositions||{};
  project.labelPositions[selectedBooth]=[Number(drag.coord[0].toFixed(6)),Number(drag.coord[1].toFixed(6))];
  refreshUnifiedBoothLabels(boothMap,'booths');refreshUnifiedBoothLabels(locationMap,'loc');refreshUnifiedBoothLabels(routeMap,'route');
  refreshAdminSpecialBadges();refreshBoothLabelHandle();updateBoothLabelInfo();updateBoothToolState();markDirty('라벨 위치 변경');
}
function boothRefresh(){
  if(boothMap?.getSource('booths'))boothMap.getSource('booths').setData(currentBooths());
  refreshUnifiedBoothLabels(boothMap,'booths');refreshUnifiedBoothLabels(locationMap,'loc');refreshUnifiedBoothLabels(routeMap,'route');
  refreshAdminSpecialBadges();refreshBoothLabelHandle();updateBoothLabelInfo();requestAnimationFrame(refreshBoothSelectionStates)
}
function refreshBoothSelectionStates(){if(!boothMap?.getSource('booths'))return;for(const f of boothData().features){if(f.id==null)continue;boothMap.setFeatureState({source:'booths',id:f.id},{selected:selectedBoothFeatureIds.has(String(f.id))})}}
function syncBoothDisplayControls(){const opts=displayOptions();if($('#showBoothNumber'))$('#showBoothNumber').checked=opts.showBoothNumber!==false;if($('#showCompanyName'))$('#showCompanyName').checked=!!opts.showCompanyName;if($('#showSpecialBooths'))$('#showSpecialBooths').checked=opts.showSpecialBooths!==false}
function updateDisplayOptionsFromForm(){project.displayOptions={showBoothNumber:!!$('#showBoothNumber')?.checked,showCompanyName:!!$('#showCompanyName')?.checked,showSpecialBooths:!!$('#showSpecialBooths')?.checked};markDirty('사용자 지도 표기 설정 변경')}
function selectedBoothFeatures(){
  const ids=selectedBoothFeatureIds;
  return boothData().features.filter(f=>ids.has(String(f.id)));
}
function boothFeatureCount(no){return boothData().features.filter(f=>f.properties.booth===no).length}
function updateMergeNumberOptions(){
  const wrap=$('#boothMergeNoWrap'),sel=$('#boothMergeNo');if(!wrap||!sel)return;
  const fs=selectedBoothFeatures(),numbers=[...new Set(fs.map(f=>(f.properties.booth||'').trim()).filter(Boolean))];
  sel.innerHTML='';
  numbers.forEach(no=>{const o=document.createElement('option');o.value=no;o.textContent=no;sel.appendChild(o)});
  wrap.style.display=numbers.length>1?'block':'none';
  if(numbers.length===1)sel.value=numbers[0];
}
function updateBoothToolState(){
  const count=selectedBoothFeatureIds.size,one=count===1?selectedBoothFeatures()[0]:null;
  $('#boothApply').disabled=count!==1;
  $('#boothSplitDetached').disabled=!(one&&one.properties?.booth&&boothFeatureCount(one.properties.booth)>1);
  $('#boothMerge').disabled=count<2;
  $('#boothDeleteShape').disabled=count<1;
  if($('#boothLabelAdjust'))$('#boothLabelAdjust').disabled=count!==1;
  if($('#boothLabelReset'))$('#boothLabelReset').disabled=count!==1||!validLngLatCoord(project.labelPositions?.[selectedBooth]);
  if(count!==1&&labelAdjustMode)setLabelAdjustMode(false);
  updateMergeNumberOptions();
}
function initBoothMap(){
  if(boothMap){boothMap.resize();boothMap.jumpTo({pitch:0,bearing:0});boothRefresh();return}
  boothMap=baseMap('boothMap',0);boothMap.setMinPitch(0);boothMap.setMaxPitch(0);boothMap.dragRotate.disable();boothMap.touchZoomRotate.disableRotation();boothMap.keyboard.disableRotation?.();
  addUnifiedMapControls(boothMap,()=>{if(boundsFromBooths())boothMap.fitBounds(boundsFromBooths(),{padding:42,duration:250})});
  boothMap.on('load',()=>{
    boothMap.jumpTo({pitch:0,bearing:0});boothMap.addSource('booths',{type:'geojson',data:currentBooths(),promoteId:'__boothEditId'});addUnifiedBoothLayers(boothMap,'booths','booths');
    boothMap.setPaintProperty('booths-booth-outline','line-color',['case',['boolean',['feature-state','selected'],false],'#ff6b00','#52637a']);
    boothMap.setPaintProperty('booths-booth-outline','line-width',['case',['boolean',['feature-state','selected'],false],4,1]);
    addAdminBoothOverlayLayers();
    boothMap.on('click','booths-booth-fill',e=>selectBooth(e.features[0],e.originalEvent));
    boothMap.on('mousedown','booth-label-handle-hit',startBoothLabelDrag);
    boothMap.on('touchstart','booth-label-handle-hit',startBoothLabelDrag);
    boothMap.on('mousemove',moveBoothLabelDrag);boothMap.on('touchmove',moveBoothLabelDrag);
    boothMap.on('mouseup',finishBoothLabelDrag);boothMap.on('touchend',finishBoothLabelDrag);
    boothMap.on('mouseenter','booth-label-handle-hit',()=>{if(!boothLabelDrag)boothMap.getCanvas().style.cursor='grab'});
    boothMap.on('mouseleave','booth-label-handle-hit',()=>{if(!boothLabelDrag)boothMap.getCanvas().style.cursor=''});
    boothMap.fitBounds(boundsFromBooths(),{padding:42,duration:0});
    refreshAdminSpecialBadges();refreshBoothLabelHandle();
  });
}
function fillBoothFields(f){
  selectedFeatureId=f.id;selectedBooth=f.properties.booth;
  const label=(mapData.labels||[]).find(x=>x.booth===selectedBooth)||{},bo=project.boothOverrides[selectedBooth]||{};
  $('#boothNo').value=selectedBooth;$('#boothCompany').value=project.labelOverrides[selectedBooth]?.name??label.name??'';$('#boothCategory').value=project.labelOverrides[selectedBooth]?.category??label.category??'';$('#boothColor').value=bo.color??f.properties.color??'#9fb8df';$('#boothSpecial').value=project.specialBooths[selectedBooth]||'';
  updateBoothLabelInfo();
}
function selectBooth(f,event){
  const previousBooth=selectedBooth;
  const id=String(f.id),multi=!!(event?.ctrlKey||event?.metaKey);
  if(multi){
    if(selectedBoothFeatureIds.has(id))selectedBoothFeatureIds.delete(id);else selectedBoothFeatureIds.add(id);
    if(selectedBoothFeatureIds.has(id))fillBoothFields(f);
  }else{selectedBoothFeatureIds.clear();selectedBoothFeatureIds.add(id);fillBoothFields(f)}
  if(!selectedBoothFeatureIds.size){selectedFeatureId=null;selectedBooth='';$('#boothSelectedInfo').textContent='부스 도형을 선택하세요.'}
  else $('#boothSelectedInfo').textContent=selectedBoothFeatureIds.size===1?`도형 ID: ${selectedFeatureId}\n부스: ${selectedBooth}`:`선택된 부스: ${selectedBoothFeatureIds.size}개\nCtrl+클릭으로 선택을 추가하거나 해제하세요.`;
  if(previousBooth!==selectedBooth||selectedBoothFeatureIds.size!==1)setLabelAdjustMode(false);
  refreshBoothSelectionStates();updateBoothToolState();refreshBoothLabelHandle();updateBoothLabelInfo();
}
function applyBoothRename(oldNo,newNo){if(oldNo===newNo)return;boothData().features.filter(f=>f.properties.booth===oldNo).forEach(f=>f.properties.booth=newNo);if(project.labelOverrides[oldNo]){project.labelOverrides[newNo]=project.labelOverrides[oldNo];delete project.labelOverrides[oldNo]}if(project.labelPositions?.[oldNo]){project.labelPositions[newNo]=project.labelPositions[oldNo];delete project.labelPositions[oldNo]}if(project.boothOverrides[oldNo]){project.boothOverrides[newNo]=project.boothOverrides[oldNo];delete project.boothOverrides[oldNo]}if(project.companyDetails[oldNo]){project.companyDetails[newNo]=project.companyDetails[oldNo];delete project.companyDetails[oldNo]}if(Array.isArray(project.companyBooths))project.companyBooths=project.companyBooths.map(value=>String(value)===oldNo?newNo:value);if(project.specialBooths[oldNo]){project.specialBooths[newNo]=project.specialBooths[oldNo];delete project.specialBooths[oldNo]}}
function boothNumberUsedByOtherFeature(newNo,currentId,currentNo){return boothData().features.some(f=>String(f.id)!==String(currentId)&&f.properties.booth===newNo&&f.properties.booth!==currentNo)}
function syncGlobalBoothHeightControl(){const el=$('#globalBoothHeight');const out=$('#globalBoothHeightValue');const value=Math.min(200,globalBoothHeight());if(el)el.value=String(value);if(out)out.textContent=String(value)}
ensureBoothEditorUiStyles();
syncGlobalBoothHeightControl();
syncBoothDisplayControls();
updateBoothLabelInfo();
const boothHeightSlider=$('#globalBoothHeight');if(boothHeightSlider){boothHeightSlider.addEventListener('input',()=>{const out=$('#globalBoothHeightValue');if(out)out.textContent=boothHeightSlider.value})}
$('#boothSpecial')?.addEventListener('change',()=>{if(!selectedBooth)return;snapshot('특별부스 변경');const kind=$('#boothSpecial').value;if(kind)project.specialBooths[selectedBooth]=kind;else delete project.specialBooths[selectedBooth];refreshAdminSpecialBadges();markDirty('특별부스 변경')});
['showBoothNumber','showCompanyName','showSpecialBooths'].forEach(id=>document.getElementById(id)?.addEventListener('change',updateDisplayOptionsFromForm));
$('#boothLabelAdjust')?.addEventListener('click',()=>{if(selectedBoothFeatureIds.size!==1||!selectedBooth){alert('먼저 부스를 하나 선택해 주세요.');return}setLabelAdjustMode(!labelAdjustMode)});
$('#boothLabelReset')?.addEventListener('click',()=>{if(!selectedBooth){alert('먼저 부스를 선택해 주세요.');return}snapshot('라벨 위치 초기화');if(project.labelPositions)delete project.labelPositions[selectedBooth];setLabelAdjustMode(false);boothRefresh();updateBoothToolState();markDirty('라벨 위치 초기화')});
$('#globalBoothHeightApply').onclick=()=>{
  const input=$('#globalBoothHeight');
  const value=Number(input.value);
  if(!Number.isFinite(value)||value<0||value>200){alert('전체 부스 높이는 0~200 범위에서 선택해 주세요.');input.focus();return}
  snapshot('전체 부스 높이 변경');
  project.globalBoothHeight=value;
  Object.values(project.boothOverrides||{}).forEach(o=>{if(o&&typeof o==='object')delete o.height});
  (boothData().features||[]).forEach(f=>{f.properties=f.properties||{};f.properties.height=value});
  boothRefresh();
  markDirty('전체 부스 높이 변경사항 있음');
  $('#boothSelectedInfo').textContent=`전체 부스 높이: ${value}`;
};
$('#boothApply').onclick=()=>{
  if(selectedBoothFeatureIds.size!==1||selectedFeatureId==null)return;
  const newNo=$('#boothNo').value.trim();if(!newNo){alert('부스번호를 입력해 주세요.');$('#boothNo').focus();return}
  if(boothNumberUsedByOtherFeature(newNo,selectedFeatureId,selectedBooth)){alert(`부스번호 "${newNo}"는 이미 사용 중입니다. 다른 부스번호를 입력해 주세요.`);$('#boothNo').focus();$('#boothNo').select();return}
  snapshot('부스 편집');applyBoothRename(selectedBooth,newNo);selectedBooth=newNo;
  project.boothOverrides[newNo]={...(project.boothOverrides[newNo]||{}),color:$('#boothColor').value};delete project.boothOverrides[newNo].height;
  project.labelOverrides[newNo]={...(project.labelOverrides[newNo]||{}),name:$('#boothCompany').value.trim(),category:$('#boothCategory').value.trim()};
  const sp=$('#boothSpecial').value;if(sp)project.specialBooths[newNo]=sp;else delete project.specialBooths[newNo];boothRefresh();markDirty('부스 변경사항 있음');
};
$('#boothSplitDetached').onclick=()=>{
  if(selectedBoothFeatureIds.size!==1||selectedFeatureId==null)return;
  const f=selectedBoothFeatures()[0],oldNo=(f.properties.booth||'').trim(),newNo=$('#boothSplitNewNo').value.trim();
  if(!oldNo||boothFeatureCount(oldNo)<2){alert('이 기능은 같은 부스번호로 떨어져 있는 도형을 분리할 때만 사용할 수 있습니다.');return}
  if(!newNo){alert('분리할 새 부스번호를 입력해 주세요.');$('#boothSplitNewNo').focus();return}
  if(boothData().features.some(x=>x.properties.booth===newNo)){alert(`부스번호 "${newNo}"는 이미 사용 중입니다. 다른 부스번호를 입력해 주세요.`);$('#boothSplitNewNo').focus();$('#boothSplitNewNo').select();return}
  snapshot('떨어진 부스 분리');f.properties.booth=newNo;selectedBooth=newNo;
  $('#boothNo').value=newNo;$('#boothSplitNewNo').value='';boothRefresh();fillBoothFields(f);updateBoothToolState();
  $('#boothSelectedInfo').textContent=`선택한 도형을 ${oldNo}에서 분리하여 ${newNo}로 변경했습니다.`;markDirty('부스 분리 완료');
};
function rectangleOfFeature(f){const ring=f?.geometry?.type==='Polygon'?f.geometry.coordinates?.[0]:null;if(!ring||ring.length!==5)return null;const xs=[...new Set(ring.slice(0,-1).map(p=>p[0]))],ys=[...new Set(ring.slice(0,-1).map(p=>p[1]))];if(xs.length!==2||ys.length!==2)return null;return{minx:Math.min(...xs),maxx:Math.max(...xs),miny:Math.min(...ys),maxy:Math.max(...ys)}}
function clusterAxis(values,tol){const sorted=[...new Set(values)].sort((a,b)=>a-b),groups=[];for(const v of sorted){const g=groups.at(-1);if(g&&Math.abs(v-g[g.length-1])<=tol)g.push(v);else groups.push([v])}const map=new Map();groups.forEach(g=>{const avg=g.reduce((a,b)=>a+b,0)/g.length;g.forEach(v=>map.set(v,avg))});return map}
function unionSelectedRectangles(features){
  const rects=features.map(rectangleOfFeature);if(rects.some(x=>!x))return null;
  const all=rects.flatMap(r=>[r.minx,r.maxx,r.miny,r.maxy]),span=Math.max(...all)-Math.min(...all),tol=Math.max(span*1e-6,1e-10);
  const xmap=clusterAxis(rects.flatMap(r=>[r.minx,r.maxx]),tol),ymap=clusterAxis(rects.flatMap(r=>[r.miny,r.maxy]),tol);
  rects.forEach(r=>{r.minx=xmap.get(r.minx);r.maxx=xmap.get(r.maxx);r.miny=ymap.get(r.miny);r.maxy=ymap.get(r.maxy)});
  const xs=[...new Set(rects.flatMap(r=>[r.minx,r.maxx]))].sort((a,b)=>a-b),ys=[...new Set(rects.flatMap(r=>[r.miny,r.maxy]))].sort((a,b)=>a-b),cells=new Set();
  for(let yi=0;yi<ys.length-1;yi++)for(let xi=0;xi<xs.length-1;xi++){const cx=(xs[xi]+xs[xi+1])/2,cy=(ys[yi]+ys[yi+1])/2;if(rects.some(r=>cx>=r.minx-tol&&cx<=r.maxx+tol&&cy>=r.miny-tol&&cy<=r.maxy+tol))cells.add(`${xi},${yi}`)}
  const edges=[];for(const key of cells){const [xi,yi]=key.split(',').map(Number),x1=xs[xi],x2=xs[xi+1],y1=ys[yi],y2=ys[yi+1];if(!cells.has(`${xi},${yi-1}`))edges.push([[x1,y1],[x2,y1]]);if(!cells.has(`${xi+1},${yi}`))edges.push([[x2,y1],[x2,y2]]);if(!cells.has(`${xi},${yi+1}`))edges.push([[x2,y2],[x1,y2]]);if(!cells.has(`${xi-1},${yi}`))edges.push([[x1,y2],[x1,y1]])}
  const key=p=>`${p[0]},${p[1]}`,byStart=new Map();edges.forEach((e,i)=>{const k=key(e[0]);if(!byStart.has(k))byStart.set(k,[]);byStart.get(k).push(i)});const used=new Set(),loops=[];
  for(let i=0;i<edges.length;i++){if(used.has(i))continue;const loop=[edges[i][0]];let cur=i,guard=0;while(!used.has(cur)&&guard++<edges.length+2){used.add(cur);const end=edges[cur][1];loop.push(end);if(key(end)===key(loop[0]))break;const next=(byStart.get(key(end))||[]).find(j=>!used.has(j));if(next==null)return null;cur=next}if(loop.length>3&&key(loop[0])===key(loop.at(-1)))loops.push(loop)}
  if(loops.length!==1)return null;return loops[0];
}
$('#boothMerge').onclick=()=>{
  if(selectedBoothFeatureIds.size<2)return;const fc=boothData(),selected=selectedBoothFeatures(),ring=unionSelectedRectangles(selected);
  if(!ring){alert('선택한 부스들이 한 덩어리로 맞닿아 있지 않습니다. 아주 작은 좌표 오차는 자동 보정하지만 실제로 떨어진 부스는 합칠 수 없습니다.');return}
  const numbers=[...new Set(selected.map(f=>(f.properties.booth||'').trim()).filter(Boolean))];
  let keepNo='';if(numbers.length===1)keepNo=numbers[0];else if(numbers.length>1)keepNo=$('#boothMergeNo').value||numbers[0];
  snapshot('부스 합치기');const primary=selected.find(f=>f.properties.booth===keepNo)||selected.find(f=>String(f.id)===String(selectedFeatureId))||selected[0],keepId=primary.id,merged=clone(primary);merged.id=keepId;merged.properties.booth=keepNo;merged.geometry={type:'Polygon',coordinates:[ring]};
  const ids=new Set(selected.map(f=>String(f.id)));
  fc.features=fc.features.filter(f=>!ids.has(String(f.id)));
  merged.properties={...(merged.properties||{}),__boothEditId:String(keepId||nextStableBoothFeatureId())};
  merged.id=merged.properties.__boothEditId;
  fc.features.push(merged);
  selectedBoothFeatureIds.clear();selectedBoothFeatureIds.add(String(keepId));selectedFeatureId=keepId;selectedBooth=keepNo;boothRefresh();fillBoothFields(merged);updateBoothToolState();
  $('#boothSelectedInfo').textContent=`${selected.length}개 부스를 ${keepNo||'번호 없음'} 부스로 합쳤습니다.`;markDirty('부스 합치기 완료');
};
$('#boothDeleteShape').onclick=()=>{if(!selectedBoothFeatureIds.size)return;snapshot('부스 도형 삭제');const ids=new Set(selectedBoothFeatureIds);boothData().features=boothData().features.filter(f=>!ids.has(String(f.id)));selectedBoothFeatureIds.clear();selectedFeatureId=null;selectedBooth='';boothRefresh();updateBoothToolState();$('#boothSelectedInfo').textContent='부스 도형을 선택하세요.';markDirty('부스 도형 삭제')};
$('#boothFit').onclick=()=>{if(!boothMap)return;boothMap.jumpTo({bearing:0,pitch:0});if(boundsFromBooths())boothMap.fitBounds(boundsFromBooths(),{padding:42,duration:250})};

/* location editor: GeoJSON layers keep points exactly tied to map coordinates */
let locationMap,selectedLocation=-1,addMode=false,locationDrag=null;
function ensureProjectLocations(){
  if(!project.locations||project.locations.type!=='FeatureCollection'||!Array.isArray(project.locations.features))project.locations={type:'FeatureCollection',features:[]};
  return project.locations;
}
function persistLocationChange(text='지점 변경 저장됨'){
  clearTimeout(autoSaveTimer);
  ensureProjectLocations();
  project=store.save(project);
  dirty=false;
  $('#saveState').textContent=text+' · '+new Date().toLocaleTimeString();
  $('#saveState').style.color='#16834b';
  renderStats();
}
function locationRouteGeo(){return routeGeo()}
function snapLocationResult(c){
  if(!$('#locationMagnet').checked)return null;
  return nearestRouteSnap(c,locationMap,Number($('#locationSnapPx').value||35));
}
function snapLocation(c){return snapLocationResult(c)?.coord||c}
function locationPointGeo(){
  return{type:'FeatureCollection',features:(project.locations.features||[]).map((f,i)=>({
    type:'Feature',id:i,properties:{index:i,name:f.properties?.name||f.properties?.code||'지점',selected:i===selectedLocation?1:0},
    geometry:{type:'Point',coordinates:f.geometry.coordinates.slice()}
  }))};
}
function refreshLocationPoints(){
  const source=locationMap?.getSource('locations-edit');
  if(source)source.setData(locationPointGeo());
}
function initLocationMap(){
  if(locationMap){
    locationMap.resize();
    locationMap.jumpTo({pitch:0,bearing:0});
    if(locationMap.getSource('booths'))locationMap.getSource('booths').setData(currentBooths());
    refreshUnifiedBoothLabels(locationMap,'loc');
    if(locationMap.getSource('loc-routes'))locationMap.getSource('loc-routes').setData(locationRouteGeo());
    refreshLocationPoints();
    return;
  }
  locationMap=baseMap('locationMap',0);
  locationMap.setMinPitch(0);
  locationMap.setMaxPitch(0);
  locationMap.dragRotate.disable();
  locationMap.touchZoomRotate.disableRotation();
  locationMap.keyboard.disableRotation?.();
  addUnifiedMapControls(locationMap,()=>{if(boundsFromBooths())locationMap.fitBounds(boundsFromBooths(),{padding:42,duration:250})});
  locationMap.on('load',()=>{
    locationMap.jumpTo({pitch:0,bearing:0});
    locationMap.addSource('booths',{type:'geojson',data:currentBooths()});
    addUnifiedBoothLayers(locationMap,'loc','booths');
    locationMap.addSource('loc-routes',{type:'geojson',data:locationRouteGeo()});
    locationMap.addLayer({id:'loc-routes',type:'line',source:'loc-routes',paint:{'line-color':'#2563eb','line-width':2.25,'line-opacity':.9}});
    locationMap.addSource('locations-edit',{type:'geojson',data:locationPointGeo()});
    locationMap.addLayer({id:'locations-edit-hit',type:'circle',source:'locations-edit',paint:{'circle-radius':14,'circle-color':'rgba(0,0,0,0)','circle-stroke-width':0}});
    locationMap.addLayer({id:'locations-edit-point',type:'circle',source:'locations-edit',paint:{
      'circle-radius':6,
      'circle-color':['case',['==',['get','selected'],1],'#2563eb','#ef1010'],
      'circle-stroke-color':'#ffffff','circle-stroke-width':3,
      'circle-opacity':1
    }});
    locationMap.addLayer({id:'locations-edit-label',type:'symbol',source:'locations-edit',layout:{
      'text-field':['get','name'],'text-size':11,'text-font':['Open Sans Bold'],
      'text-offset':[0,-1.55],'text-anchor':'bottom','text-allow-overlap':true,'text-ignore-placement':true
    },paint:{'text-color':'#ffffff','text-halo-color':'#1f2937','text-halo-width':4,'text-halo-blur':1}});
    locationMap.fitBounds(boundsFromBooths(),{padding:42,duration:0});

    locationMap.on('mouseenter','locations-edit-hit',()=>locationMap.getCanvas().style.cursor='grab');
    locationMap.on('mouseleave','locations-edit-hit',()=>{if(!locationDrag)locationMap.getCanvas().style.cursor=''});
    locationMap.on('click','locations-edit-hit',e=>{
      e.preventDefault();
      const i=Number(e.features?.[0]?.properties?.index);
      if(Number.isInteger(i))selectLocation(i);
    });
    locationMap.on('mousedown','locations-edit-hit',e=>{
      e.preventDefault();
      const i=Number(e.features?.[0]?.properties?.index);
      if(!Number.isInteger(i))return;
      selectLocation(i);
      snapshot('지점 이동');
      locationDrag={index:i,moved:false};
      locationMap.dragPan.disable();
      locationMap.getCanvas().style.cursor='grabbing';
    });
    locationMap.on('mousemove',e=>{
      if(!locationDrag)return;
      locationDrag.moved=true;
      const raw=[e.lngLat.lng,e.lngLat.lat],snap=snapLocationResult(raw);
      project.locations.features[locationDrag.index].geometry.coordinates=(snap?.coord||raw).slice();
      locationDrag.snapType=snap?.type||null;
      refreshLocationPoints();
    });
    const finishDrag=e=>{
      if(!locationDrag)return;
      const i=locationDrag.index;
      const snapType=locationDrag.snapType;
      let c=project.locations.features[i].geometry.coordinates.slice();
      if(locationDrag.moved)c=snapLocation(c);
      project.locations.features[i].geometry.coordinates=c;
      locationDrag=null;
      locationMap.dragPan.enable();
      locationMap.getCanvas().style.cursor='';
      refreshLocationPoints();
      selectLocation(i);
      persistLocationChange(snapType==='vertex'?'지점을 경로 꼭지점에 붙여 저장했습니다.':snapType==='segment'?'지점을 경로 선분에 붙여 저장했습니다.':'지점 이동 저장됨');
    };
    locationMap.on('mouseup',finishDrag);
    locationMap.on('mouseout',e=>{if(locationDrag&&e.originalEvent?.buttons===0)finishDrag(e)});

    locationMap.on('click',e=>{
      if(!addMode)return;
      const hits=locationMap.queryRenderedFeatures(e.point,{layers:['locations-edit-hit']});
      if(hits.length)return;
      snapshot('지점 추가');
      const name=nextLocationName(),raw=[e.lngLat.lng,e.lngLat.lat],snap=snapLocationResult(raw),coord=(snap?.coord||raw).slice();
      project.locations.features.push({type:'Feature',properties:{name,code:name,type:'custom'},geometry:{type:'Point',coordinates:coord}});
      selectedLocation=project.locations.features.length-1;
      refreshLocationPoints();
      selectLocation(selectedLocation);
      persistLocationChange(snap?.type==='vertex'?'새 지점을 경로 꼭지점에 붙여 저장했습니다.':snap?.type==='segment'?'새 지점을 경로 선분에 붙여 저장했습니다.':'새 지점 추가 저장됨');
    });
  });
}
function nextLocationName(){
  const used=new Set((project.locations.features||[]).map(f=>String(f.properties?.name||'').trim()));
  let n=1;while(used.has(`새 지점 ${n}`))n++;return `새 지점 ${n}`;
}
function selectLocation(i){
  selectedLocation=i;
  const f=project.locations.features[i];
  if(!f)return;
  $('#locationName').value=f.properties.name||'';
  $('#locationDelete').disabled=false;
  $('#locationResnap').disabled=false;
  $('#locationSelected').textContent=`${f.properties.name||'-'}\n${f.geometry.coordinates.map(x=>x.toFixed(6)).join(', ')}`;
  refreshLocationPoints();
}
function renderLocationMarkers(){refreshLocationPoints()}
function setLocationAddMode(enabled){
  addMode=!!enabled;
  const button=$('#locationAdd');
  button.classList.toggle('active-tool',addMode);
  button.textContent=addMode?'지점 추가 중 · 종료':'새 지점 추가';
  if(addMode)$('#locationSelected').textContent='지도에서 원하는 위치를 클릭하세요. 클릭한 좌표에 정확히 지점이 생성됩니다.';
}
$('#locationAdd').onclick=()=>setLocationAddMode(!addMode);
$('#locationResnap').onclick=()=>{if(selectedLocation<0)return;snapshot('지점 경로 스냅');const f=project.locations.features[selectedLocation],c=nearestRoutePoint(f.geometry.coordinates,locationMap,9999);if(c){f.geometry.coordinates=c;refreshLocationPoints();selectLocation(selectedLocation);persistLocationChange('지점 경로 스냅 저장됨')}};
$('#locationDelete').onclick=()=>{if(selectedLocation<0)return;snapshot('지점 삭제');project.locations.features.splice(selectedLocation,1);selectedLocation=-1;refreshLocationPoints();$('#locationName').value='';$('#locationDelete').disabled=true;$('#locationResnap').disabled=true;persistLocationChange('지점 삭제 저장됨')};
$('#locationName').onchange=()=>{if(selectedLocation<0)return;snapshot('지점 이름 변경');const f=project.locations.features[selectedLocation];const name=$('#locationName').value.trim()||nextLocationName();f.properties.name=name;f.properties.code=name;refreshLocationPoints();selectLocation(selectedLocation);persistLocationChange('지점 이름 저장됨')};
$('#locationFit').onclick=()=>{if(!locationMap)return;locationMap.jumpTo({bearing:0,pitch:0});if(boundsFromBooths())locationMap.fitBounds(boundsFromBooths(),{padding:42,duration:250})};
window.addEventListener('keydown',event=>{if(event.key==='Escape'&&addMode)setLocationAddMode(false)});


/* booth layout XLSX: restore the existing cell-color/border/merge parser */
let pendingBoothLayout=null;
function boothExtent(){
  const bounds=boundsFromBooths();
  if(bounds&&!bounds.isEmpty()){
    const sw=bounds.getSouthWest(),ne=bounds.getNorthEast();
    return{minX:sw.lng,maxX:ne.lng,minY:sw.lat,maxY:ne.lat};
  }
  return{minX:0.02,maxX:0.16,minY:-0.14,maxY:-0.01};
}
function gridCoord(parsed,colEdge,rowEdge){
  const ext=boothExtent(),w=ext.maxX-ext.minX,h=ext.maxY-ext.minY;
  return[ext.minX+(Number(colEdge)/parsed.cols)*w,ext.maxY-(Number(rowEdge)/parsed.rows)*h];
}
/*
 * 기존 XLSX 분석기는 하나의 부스를 행 단위 shape 여러 개로 압축해 저장한다.
 * shape 하나가 부스 하나라는 뜻이 아니다. 기존 화면도 모든 shape의 셀을 다시
 * 합친 뒤 외곽선만 그렸다. MapLibre 변환도 같은 방식으로 셀 집합을 합쳐야 한다.
 */
function boothCellsFromLayoutShapes(shapes){
  const cells=new Set();
  for(const shape of shapes||[]){
    for(let r=shape.r1;r<=shape.r2;r++)for(let c=shape.c1;c<=shape.c2;c++)cells.add(`${r},${c}`);
  }
  return cells;
}
function connectedLayoutCellComponents(cells){
  const remaining=new Set(cells),components=[],dirs=[[-1,0],[1,0],[0,-1],[0,1]];
  while(remaining.size){
    const first=remaining.values().next().value,queue=[first],component=new Set([first]);remaining.delete(first);
    while(queue.length){
      const key=queue.pop(),[r,c]=key.split(',').map(Number);
      for(const[dr,dc]of dirs){const next=`${r+dr},${c+dc}`;if(!remaining.has(next))continue;remaining.delete(next);component.add(next);queue.push(next)}
    }
    components.push(component);
  }
  return components;
}
function simplifyGridLoop(loop){
  if(loop.length<4)return loop;
  const open=loop[0][0]===loop[loop.length-1][0]&&loop[0][1]===loop[loop.length-1][1]?loop.slice(0,-1):loop.slice();
  const out=[];
  for(let i=0;i<open.length;i++){
    const prev=open[(i-1+open.length)%open.length],cur=open[i],next=open[(i+1)%open.length];
    const collinear=(prev[0]===cur[0]&&cur[0]===next[0])||(prev[1]===cur[1]&&cur[1]===next[1]);
    if(!collinear)out.push(cur);
  }
  if(out.length)out.push([...out[0]]);
  return out;
}
function boundaryLoopsFromLayoutCells(component){
  const edges=[],pointKey=(x,y)=>`${x},${y}`;
  for(const key of component){
    const[r,c]=key.split(',').map(Number),x1=c-1,x2=c,y1=r-1,y2=r;
    if(!component.has(`${r-1},${c}`))edges.push({a:[x1,y1],b:[x2,y1]});
    if(!component.has(`${r},${c+1}`))edges.push({a:[x2,y1],b:[x2,y2]});
    if(!component.has(`${r+1},${c}`))edges.push({a:[x2,y2],b:[x1,y2]});
    if(!component.has(`${r},${c-1}`))edges.push({a:[x1,y2],b:[x1,y1]});
  }
  const byStart=new Map();
  edges.forEach((edge,index)=>{const key=pointKey(...edge.a);if(!byStart.has(key))byStart.set(key,[]);byStart.get(key).push(index)});
  const used=new Set(),loops=[];
  for(let startIndex=0;startIndex<edges.length;startIndex++){
    if(used.has(startIndex))continue;
    const loop=[edges[startIndex].a];let currentIndex=startIndex,guard=0;
    while(!used.has(currentIndex)&&guard++<edges.length+5){
      used.add(currentIndex);const edge=edges[currentIndex];loop.push(edge.b);
      const candidates=(byStart.get(pointKey(...edge.b))||[]).filter(index=>!used.has(index));
      if(!candidates.length)break;currentIndex=candidates[0];
    }
    const simplified=simplifyGridLoop(loop);if(simplified.length>=4)loops.push(simplified);
  }
  return loops;
}
function layoutLoopArea(loop){
  let area=0;for(let i=0;i<loop.length-1;i++)area+=loop[i][0]*loop[i+1][1]-loop[i+1][0]*loop[i][1];return area/2;
}
function layoutToBoothFeatures(parsed){
  const features=[];let id=1;
  for(const item of parsed.destinations||[]){
    const cells=boothCellsFromLayoutShapes(item.shapes);
    const color='#'+String(item.shapes?.find(shape=>shape.color)?.color||'9FB8DF').replace(/^#/,'').slice(-6);
    for(const component of connectedLayoutCellComponents(cells)){
      const loops=boundaryLoopsFromLayoutCells(component).sort((a,b)=>Math.abs(layoutLoopArea(b))-Math.abs(layoutLoopArea(a)));
      if(!loops.length)continue;
      const coordinates=loops.map(loop=>loop.map(([x,y])=>gridCoord(parsed,x,y)));
      features.push({type:'Feature',id:id++,properties:{booth:item.id,color,height:5},geometry:{type:'Polygon',coordinates}});
    }
  }
  return{type:'FeatureCollection',features};
}
function thinWalkable(parsed){
  const rows=parsed.rows,cols=parsed.cols;
  const image=Array.from({length:rows+2},()=>new Uint8Array(cols+2));
  for(let r=1;r<=rows;r++)for(let c=1;c<=cols;c++)image[r][c]=parsed.walkableRows?.[r-1]?.[c-1]==='1'?1:0;
  const neighbors=(r,c)=>[image[r-1][c],image[r-1][c+1],image[r][c+1],image[r+1][c+1],image[r+1][c],image[r+1][c-1],image[r][c-1],image[r-1][c-1]];
  const transitions=a=>a.reduce((n,v,i)=>n+(v===0&&a[(i+1)%8]===1?1:0),0);
  let changed=true,guard=0,limit=Math.max(rows,cols)*4;
  while(changed&&guard++<limit){changed=false;for(let phase=0;phase<2;phase++){const remove=[];for(let r=1;r<=rows;r++)for(let c=1;c<=cols;c++){
    if(image[r][c]!==1)continue;const q=neighbors(r,c),count=q.reduce((a,b)=>a+b,0);if(count<2||count>6||transitions(q)!==1)continue;
    if(phase===0){if(q[0]*q[2]*q[4]!==0||q[2]*q[4]*q[6]!==0)continue}else if(q[0]*q[2]*q[6]!==0||q[0]*q[4]*q[6]!==0)continue;
    remove.push([r,c]);
  }if(remove.length){changed=true;remove.forEach(([r,c])=>image[r][c]=0)}}}
  return image;
}
function layoutToRouteGraph(parsed){
  const image=thinWalkable(parsed),rows=parsed.rows,cols=parsed.cols,key=(r,c)=>`${r},${c}`;
  const cells=new Map();for(let r=1;r<=rows;r++)for(let c=1;c<=cols;c++)if(image[r][c])cells.set(key(r,c),{r,c,links:new Set()});
  const dirs=[[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];
  for(const cell of cells.values())for(const[dr,dc]of dirs){const other=cells.get(key(cell.r+dr,cell.c+dc));if(!other)continue;if(dr&&dc){if(cells.has(key(cell.r,cell.c+dc))||cells.has(key(cell.r+dr,cell.c)))continue}cell.links.add(key(other.r,other.c));}
  const important=new Set([...cells].filter(([,v])=>v.links.size!==2).map(([k])=>k));
  for(const[k,v]of cells)if(v.links.size===2){const[a,b]=[...v.links].map(x=>cells.get(x));const d1=[Math.sign(a.r-v.r),Math.sign(a.c-v.c)],d2=[Math.sign(b.r-v.r),Math.sign(b.c-v.c)];if(d1[0]!==-d2[0]||d1[1]!==-d2[1])important.add(k)}
  if(!important.size&&cells.size)important.add(cells.keys().next().value);
  const vertices=[],segments=[],visited=new Set(),vertexIds=new Map();
  const ensureVertex=k=>{if(vertexIds.has(k))return vertexIds.get(k);const v=cells.get(k),id=k,coord=gridCoord(parsed,v.c-.5,v.r-.5);vertexIds.set(k,id);vertices.push({id,coord});return id};
  for(const start of important){const sv=cells.get(start);for(const next of sv.links){const edge=[start,next].sort().join('|');if(visited.has(edge))continue;let prev=start,cur=next;visited.add(edge);while(!important.has(cur)){const cv=cells.get(cur);const candidates=[...cv.links].filter(x=>x!==prev);if(!candidates.length)break;const n=candidates[0];visited.add([cur,n].sort().join('|'));prev=cur;cur=n}if(start!==cur){const a=ensureVertex(start),b=ensureVertex(cur);segments.push({id:`${a}~${b}#${segments.length}`,source:a,target:b})}}
  }
  return{vertices,segments};
}
function layoutAnalysisText(parsed,graph){
  const s=parsed.stats||{};return[
    `시트: ${parsed.sheetName||'-'} · ${parsed.rows}행 × ${parsed.cols}열`,
    `부스 ${s.boothCount||0}개 · 부스 도형 ${(parsed.destinations||[]).reduce((n,d)=>n+(d.shapes?.length||0),0)}개`,
    `통로 셀 ${s.walkableCount||0}개 · 자동 경로 꼭지점 ${graph.vertices.length}개 · 선분 ${graph.segments.length}개`,
    `출입 후보가 없는 부스 ${(s.noEntrance||[]).length}개 · 여러 영역 부스 ${s.duplicateShapeCount||0}개`,
    (s.ambiguousRegions||[]).length?`확인 필요 영역: ${s.ambiguousRegions.slice(0,6).join(' / ')}`:'분석 오류 영역 없음'
  ].join('\n');
}
$('#boothLayoutFile').onchange=async e=>{
  const file=e.target.files?.[0];if(!file)return;const box=$('#boothLayoutResult'),apply=$('#boothLayoutApply');apply.disabled=true;pendingBoothLayout=null;
  try{box.textContent='병합 셀, 색상, 테두리, 통로와 중앙 경로를 분석하고 있습니다…';const parsed=await XlsxGridParser.parseWorkbook(file);const booths=layoutToBoothFeatures(parsed),routeGraph=layoutToRouteGraph(parsed);pendingBoothLayout={parsed,booths,routeGraph};box.textContent=layoutAnalysisText(parsed,routeGraph);apply.disabled=!booths.features.length||!routeGraph.segments.length;}
  catch(err){box.textContent='분석 실패: '+err.message;console.error(err)}
};
$('#boothLayoutApply').onclick=()=>{
  if(!pendingBoothLayout)return;if(!confirm('현재 부스·경로·지점 배치를 새 엑셀 배치도로 교체할까요? 기업 설명은 같은 부스번호 기준으로 유지됩니다.'))return;
  snapshot('부스 배치도 적용');project.boothFeatures=clone(pendingBoothLayout.booths);project.routeGraph=clone(pendingBoothLayout.routeGraph);project.routeClosures={};project.boothOverrides={};project.specialBooths={};project.locations={type:'FeatureCollection',features:[]};
  project.layoutSource={name:pendingBoothLayout.parsed.sourceName,sheet:pendingBoothLayout.parsed.sheetName,rows:pendingBoothLayout.parsed.rows,cols:pendingBoothLayout.parsed.cols,appliedAt:new Date().toISOString()};
  project=store.save(project);dirty=false;$('#saveState').textContent='배치도 적용·저장됨';$('#saveState').style.color='#16834b';$('#boothLayoutResult').textContent+='\n적용 완료: 부스 편집·경로 편집·지점 편집·사용자 화면에 반영되었습니다.';setTimeout(()=>location.reload(),350);
};
/* imports and templates */
function downloadWorkbook(name,rows){const ws=XLSX.utils.json_to_sheet(rows),wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'양식');XLSX.writeFile(wb,name)}
$('#companyTemplate').onclick=()=>downloadWorkbook('기업데이터_양식.xlsx',[{'부스번호':'A-01','기업명':'예시기업','품목':'제품 분류','제품설명':'제품 및 서비스 설명','홈페이지':'https://example.com'}]);$('#programTemplate').onclick=()=>downloadWorkbook('프로그램일정_양식.xlsx',[{'부스번호':'Z-01','장소':'글로벌 프로그램존','날짜':'2026-10-29','시작':'10:00','종료':'11:00','프로그램명':'해외시장 진출 세미나','설명':'프로그램 설명'}]);
function readRows(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onerror=reject;r.onload=()=>{try{const wb=XLSX.read(r.result,{type:'array'}),ws=wb.Sheets[wb.SheetNames[0]];resolve(XLSX.utils.sheet_to_json(ws,{defval:''}))}catch(e){reject(e)}};r.readAsArrayBuffer(file)})}
function pick(row,names){const k=Object.keys(row).find(k=>names.some(n=>k.replace(/\s/g,'').toLowerCase().includes(n)));return k?row[k]:''}
$('#companyFile').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const rows=await readRows(f);snapshot('기업 데이터 불러오기');let applied=0,missing=0;const imported=[];rows.forEach(r=>{const booth=String(pick(r,['부스번호','부스','booth'])).trim();if(!booth){missing++;return}const name=String(pick(r,['기업명','회사명','company'])).trim(),category=String(pick(r,['품목','제품','category'])).trim();project.labelOverrides[booth]={...(project.labelOverrides[booth]||{}),name,category};project.companyDetails[booth]={description:String(pick(r,['제품설명','description'])).trim(),website:String(pick(r,['홈페이지','website','url'])).trim()};if(!imported.includes(booth))imported.push(booth);applied++});project.companyBooths=imported;markDirty();$('#companyImportResult').textContent=`${rows.length}행 중 ${applied}건 반영 예정 · 기업 ${imported.length}개 · 부스번호 누락 ${missing}건`;renderContentBooths()}catch(err){$('#companyImportResult').textContent='오류: '+err.message}};
$('#programFile').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const rows=await readRows(f);snapshot('프로그램 불러오기');const byPlace=new Map(),knownBooths=new Set((boothData().features||[]).map(feature=>String(feature.properties?.booth||'').trim()).filter(Boolean));let skipped=0;rows.forEach(r=>{const booth=String(pick(r,['부스번호','부스','booth'])).trim(),name=String(pick(r,['장소','무대','place','stage'])).trim();if(!booth||!name){skipped++;return}const key=`${booth}::${name}`;if(!byPlace.has(key))byPlace.set(key,{id:'PLACE-'+String(byPlace.size+1).padStart(2,'0'),booth,name,programs:[]});byPlace.get(key).programs.push({date:String(pick(r,['날짜','date'])).trim(),start:String(pick(r,['시작','start'])).trim(),end:String(pick(r,['종료','end'])).trim(),title:String(pick(r,['프로그램명','프로그램','title'])).trim(),description:String(pick(r,['설명','description'])).trim()})});project.stages=[...byPlace.values()].map(place=>({...place,programs:place.programs.sort((a,b)=>`${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`))}));const unmatched=project.stages.filter(place=>!knownBooths.has(place.booth)).map(place=>place.booth);markDirty();$('#programImportResult').textContent=`${rows.length}행 중 ${rows.length-skipped}개 프로그램 반영 예정 · 장소 ${project.stages.length}곳${skipped?` · 부스번호/장소 누락 ${skipped}행`:''}${unmatched.length?` · 지도에서 찾지 못한 부스 ${[...new Set(unmatched)].join(', ')}`:''}`;renderPrograms()}catch(err){$('#programImportResult').textContent='오류: '+err.message}};

/* content and project */
function naturalBoothSort(a,b){return String(a||'').localeCompare(String(b||''),undefined,{numeric:true,sensitivity:'base'})}
function companyContentRows(){
  const imported=Array.isArray(project.companyBooths)?project.companyBooths.map(value=>String(value||'').trim()).filter(Boolean):[];
  const keys=new Set(imported.length?imported:[...Object.keys(project.labelOverrides||{}),...Object.keys(project.companyDetails||{})]);
  if(!keys.size){
    for(const feature of boothData().features||[]){
      const booth=String(feature?.properties?.booth||'').trim(),name=String(feature?.properties?.name||'').trim();
      if(booth&&name&&name!==booth)keys.add(booth);
    }
  }
  const featureByBooth=new Map();
  for(const feature of boothData().features||[]){const booth=String(feature?.properties?.booth||'').trim();if(booth&&!featureByBooth.has(booth))featureByBooth.set(booth,feature)}
  return [...keys].filter(Boolean).map(booth=>{
    const feature=featureByBooth.get(booth),override=project.labelOverrides?.[booth]||{},detail=project.companyDetails?.[booth]||{};
    return{booth,name:override.name??feature?.properties?.name??'',category:override.category??feature?.properties?.category??'',description:detail.description||'',website:detail.website||''};
  }).sort((a,b)=>naturalBoothSort(a.booth,b.booth));
}
let selectedContentBooth='';
function renderContentBooths(preferredBooth=''){
  const list=$('#contentCompanyList'),editor=$('#contentCompanyEditor'),empty=$('#contentCompanyEmpty');if(!list)return;
  const rows=companyContentRows(),previous=preferredBooth||selectedContentBooth;
  selectedContentBooth=rows.some(row=>row.booth===previous)?previous:(rows[0]?.booth||'');
  list.innerHTML='';
  for(const row of rows){
    const button=document.createElement('button');button.type='button';button.className='content-list-item'+(row.booth===selectedContentBooth?' active':'');button.dataset.booth=row.booth;
    const title=document.createElement('b');title.textContent=`${row.booth} · ${row.name||'기업명 미등록'}`;
    const meta=document.createElement('span');meta.textContent=row.category||'품목 미등록';button.append(title,meta);
    button.onclick=()=>{selectedContentBooth=row.booth;renderContentBooths(row.booth);requestAnimationFrame(()=>button.scrollIntoView({block:'nearest'}))};
    list.appendChild(button);
  }
  const hasRows=!!rows.length;if(editor)editor.hidden=!hasRows;if(empty)empty.hidden=hasRows;list.hidden=!hasRows;
  loadCompanyContent();
}
function loadCompanyContent(){
  const row=companyContentRows().find(item=>item.booth===selectedContentBooth);
  if(!row)return;
  $('#contentBoothNo').value=row.booth;$('#contentCompanyName').value=row.name||'';$('#contentCategory').value=row.category||'';$('#contentDescription').value=row.description||'';$('#contentWebsite').value=row.website||'';
  const summary=$('#contentCompanySummary');if(summary){summary.innerHTML='';const title=document.createElement('b');title.textContent=`${row.booth} · ${row.name||'기업명 미등록'}`;const meta=document.createElement('span');meta.textContent=row.category||'품목 미등록';summary.append(title,meta)}
}
$('#contentCompanySave').onclick=()=>{
  const booth=selectedContentBooth;if(!booth)return;
  snapshot('기업 정보 변경');
  const name=$('#contentCompanyName').value.trim(),category=$('#contentCategory').value.trim();
  project.labelOverrides[booth]={...(project.labelOverrides[booth]||{}),name,category};
  project.companyDetails[booth]={description:$('#contentDescription').value.trim(),website:$('#contentWebsite').value.trim()};
  for(const feature of boothData().features||[]){if(String(feature?.properties?.booth||'').trim()===booth){feature.properties=feature.properties||{};feature.properties.name=name;feature.properties.category=category}}
  renderContentBooths(booth);boothRefresh();markDirty('기업 정보 변경');
};
let programEditorIdSeq=1;
function nextProgramEditorId(){return `program-${Date.now().toString(36)}-${programEditorIdSeq++}`}
function ensureProgramEditorIds(){for(const stage of project.stages||[])for(const program of stage.programs||[])if(!program.__editorId)program.__editorId=nextProgramEditorId()}
function programEditorRows(){
  ensureProgramEditorIds();const rows=[];
  (project.stages||[]).forEach((stage,si)=>(stage.programs||[]).forEach((program,pi)=>rows.push({id:program.__editorId,stage,program,si,pi,booth:String(stage.booth||'').trim(),place:String(stage.name||'').trim(),date:String(program.date||'').trim(),start:String(program.start||'').trim(),end:String(program.end||'').trim(),title:String(program.title||'').trim(),description:String(program.description||'').trim()})));
  return rows.sort((a,b)=>`${a.date||'9999-99-99'} ${a.start||'99:99'} ${a.booth} ${a.title}`.localeCompare(`${b.date||'9999-99-99'} ${b.start||'99:99'} ${b.booth} ${b.title}`,undefined,{numeric:true}));
}
function programDayMap(rows=programEditorRows()){
  const dates=[...new Set(rows.map(row=>row.date).filter(Boolean))].sort();return new Map(dates.map((date,index)=>[date,index+1]));
}
function findProgramEditorRow(id){return programEditorRows().find(row=>row.id===id)||null}
let selectedProgramEditorId='';
function renderPrograms(preferredId=''){
  const list=$('#programScheduleList'),editor=$('#programEditor'),empty=$('#programEmpty');if(!list)return;
  const rows=programEditorRows(),days=programDayMap(rows),previous=preferredId||selectedProgramEditorId;
  selectedProgramEditorId=rows.some(row=>row.id===previous)?previous:(rows[0]?.id||'');
  list.innerHTML='';
  let lastDayLabel='';
  for(const row of rows){
    const dayLabel=row.date?`${days.get(row.date)}일차 · ${row.date}`:'날짜 미지정';
    if(dayLabel!==lastDayLabel){const heading=document.createElement('div');heading.className='content-list-day';heading.textContent=dayLabel;list.appendChild(heading);lastDayLabel=dayLabel}
    const button=document.createElement('button');button.type='button';button.className='content-list-item'+(row.id===selectedProgramEditorId?' active':'');button.dataset.programId=row.id;
    const title=document.createElement('b');title.textContent=`${row.start||'--:--'}~${row.end||'--:--'} · ${row.title||'프로그램명 미등록'}`;
    const meta=document.createElement('span');meta.textContent=`${row.booth||'부스 미지정'} · ${row.place||'장소 미지정'}`;button.append(title,meta);
    button.onclick=()=>{selectedProgramEditorId=row.id;renderPrograms(row.id);requestAnimationFrame(()=>button.scrollIntoView({block:'nearest'}))};
    list.appendChild(button);
  }
  const hasRows=!!rows.length;if(editor)editor.hidden=!hasRows;if(empty)empty.hidden=hasRows;list.hidden=!hasRows;$('#programDelete').disabled=!hasRows;
  loadProgramEditor();
}
function loadProgramEditor(){
  const row=findProgramEditorRow(selectedProgramEditorId);if(!row)return;
  $('#programBooth').value=row.booth;$('#programPlace').value=row.place;$('#programDate').value=row.date;$('#programStart').value=row.start;$('#programEnd').value=row.end;$('#programTitle').value=row.title;$('#programDescription').value=row.description;
  const days=programDayMap(),day=row.date?`${days.get(row.date)||'-'}일차 · ${row.date}`:'날짜 미지정',summary=$('#programSummary');if(summary){summary.innerHTML='';const title=document.createElement('b');title.textContent=`${day} · ${row.start||'--:--'}~${row.end||'--:--'}`;const meta=document.createElement('span');meta.textContent=`${row.booth||'부스 미지정'} · ${row.place||'장소 미지정'} · ${row.title||'프로그램명 미등록'}`;summary.append(title,meta)}
}
function removeProgramEditorRow(row){
  const stage=project.stages[row.si];if(!stage)return;stage.programs.splice(row.pi,1);if(!stage.programs.length)project.stages.splice(row.si,1)
}
function addProgramToPlace(program,booth,place){
  let stage=(project.stages||[]).find(item=>String(item.booth||'').trim()===booth&&String(item.name||'').trim()===place);
  if(!stage){stage={id:`PLACE-${String((project.stages?.length||0)+1).padStart(2,'0')}`,booth,name:place,programs:[]};project.stages.push(stage)}
  stage.programs.push(program);stage.programs.sort((a,b)=>`${a.date||''} ${a.start||''}`.localeCompare(`${b.date||''} ${b.start||''}`));
}
$('#programSave').onclick=()=>{
  const row=findProgramEditorRow(selectedProgramEditorId);if(!row)return;
  const booth=$('#programBooth').value.trim(),place=$('#programPlace').value.trim(),date=$('#programDate').value.trim(),start=$('#programStart').value.trim(),end=$('#programEnd').value.trim(),title=$('#programTitle').value.trim();
  if(!booth||!place||!date||!start||!end||!title){alert('부스번호, 장소, 날짜, 시작, 종료, 프로그램명을 모두 입력해 주세요.');return}
  snapshot('프로그램 일정 수정');const program={...row.program,__editorId:row.id,date,start,end,title,description:$('#programDescription').value.trim()};removeProgramEditorRow(row);addProgramToPlace(program,booth,place);renderPrograms(row.id);markDirty('프로그램 일정 변경');
};
$('#programDelete').onclick=()=>{const row=findProgramEditorRow(selectedProgramEditorId);if(!row||!confirm(`"${row.title||'선택 프로그램'}" 일정을 삭제할까요?`))return;snapshot('프로그램 일정 삭제');removeProgramEditorRow(row);renderPrograms();markDirty('프로그램 일정 삭제')};
$('#programAdd').onclick=()=>{
  snapshot('프로그램 일정 추가');const rows=programEditorRows(),last=rows[rows.length-1],program={__editorId:nextProgramEditorId(),date:last?.date||'',start:'',end:'',title:'새 프로그램',description:''};addProgramToPlace(program,last?.booth||'',last?.place||'새 장소');renderPrograms(program.__editorId);markDirty('프로그램 일정 추가');
};
function renderDocuments(){const box=$('#documentEditor');box.innerHTML='';project.documents.forEach((d,i)=>{const el=document.createElement('div');el.className='document-item';el.innerHTML=`<input data-k="title" value="${d.title||''}" placeholder="표시 제목"><input data-k="file" value="${d.file||''}" placeholder="assets/documents/file.pdf"><label><input data-k="enabled" type="checkbox" ${d.enabled?'checked':''}> 사용자 화면에 표시</label>`;el.querySelectorAll('[data-k]').forEach(inp=>inp.onchange=()=>{snapshot('PDF 설정 변경');project.documents[i][inp.dataset.k]=inp.type==='checkbox'?inp.checked:inp.value;markDirty()});box.appendChild(el)})}
$('#projectDownload').onclick=()=>store.download(project,`finder-project-${new Date().toISOString().slice(0,10)}.json`);$('#projectFile').onchange=async e=>{if(!e.target.files[0])return;try{await store.importFile(e.target.files[0]);location.reload()}catch(err){alert(err.message)}};$('#projectReset').onclick=()=>{if(confirm('관리자 수정사항을 모두 초기화할까요?'))store.clear()};$('#deployZip').onclick=async()=>{saveAll();const zip=new JSZip();zip.file('project.json',JSON.stringify(project,null,2));zip.file('data/project-overrides.js',`window.FINDER_PROJECT_OVERRIDE=${JSON.stringify(project)};\nif(window.FINDER_PROJECT_STORE)window.FINDER_PROJECT_STORE.save(window.FINDER_PROJECT_OVERRIDE);`);const blob=await zip.generateAsync({type:'blob'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='FINDER-deployment-data.zip';a.click()};
/* basic settings: exhibition name and user-header logo */
const exhibitionNameInput=document.getElementById('exhibitionName');
const exhibitionSettingsApply=document.getElementById('exhibitionNameApply');
const exhibitionSettingsResult=document.getElementById('exhibitionNameResult');
const exhibitionLogoFile=document.getElementById('exhibitionLogoFile');
const exhibitionLogoRemove=document.getElementById('exhibitionLogoRemove');
const exhibitionLogoPreview=document.getElementById('exhibitionLogoPreview');
const exhibitionLogoEmpty=document.getElementById('exhibitionLogoEmpty');
let pendingExhibitionLogo=String(project.exhibitionLogo||'');
function renderExhibitionLogoPreview(){
  const hasLogo=!!pendingExhibitionLogo;
  if(exhibitionLogoPreview){
    exhibitionLogoPreview.hidden=!hasLogo;
    if(hasLogo)exhibitionLogoPreview.src=pendingExhibitionLogo;
    else exhibitionLogoPreview.removeAttribute('src');
  }
  if(exhibitionLogoEmpty)exhibitionLogoEmpty.hidden=hasLogo;
}
function fileAsDataUrl(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(new Error('로고 이미지를 읽지 못했습니다.'));reader.onload=()=>resolve(String(reader.result||''));reader.readAsDataURL(file)})}
async function optimizedLogoDataUrl(file){
  if(!file||!String(file.type||'').startsWith('image/'))throw new Error('이미지 파일을 선택해 주세요.');
  if(file.type==='image/svg+xml'){
    if(file.size>700000)throw new Error('SVG 로고는 700KB 이하 파일을 사용해 주세요.');
    return fileAsDataUrl(file);
  }
  const source=await fileAsDataUrl(file);
  const image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('로고 이미지 형식을 확인해 주세요.'));img.src=source});
  const maxSize=360,scale=Math.min(1,maxSize/Math.max(image.naturalWidth||1,image.naturalHeight||1));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round((image.naturalWidth||1)*scale));canvas.height=Math.max(1,Math.round((image.naturalHeight||1)*scale));
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('로고 이미지를 처리하지 못했습니다.');ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
  return canvas.toDataURL(file.type==='image/jpeg'?'image/jpeg':'image/png',.9);
}
if(exhibitionNameInput)exhibitionNameInput.value=project.exhibitionName||'';
renderExhibitionLogoPreview();
exhibitionLogoFile?.addEventListener('change',async event=>{
  const file=event.target.files?.[0];if(!file)return;
  try{pendingExhibitionLogo=await optimizedLogoDataUrl(file);renderExhibitionLogoPreview();if(exhibitionSettingsResult)exhibitionSettingsResult.textContent='로고를 불러왔습니다. 기본설정 적용 버튼을 눌러 반영하세요.';}
  catch(error){alert(error.message);event.target.value='';}
});
exhibitionLogoRemove?.addEventListener('click',()=>{pendingExhibitionLogo='';if(exhibitionLogoFile)exhibitionLogoFile.value='';renderExhibitionLogoPreview();if(exhibitionSettingsResult)exhibitionSettingsResult.textContent='로고를 삭제할 예정입니다. 기본설정 적용 버튼을 눌러 반영하세요.';});
exhibitionSettingsApply?.addEventListener('click',()=>{
  const name=exhibitionNameInput?.value.trim()||'';
  if(!name){alert('전시회명을 입력해 주세요.');exhibitionNameInput?.focus();return;}
  snapshot('전시회 기본설정 변경');
  project.exhibitionName=name;
  project.exhibitionLogo=pendingExhibitionLogo;
  document.getElementById('adminTitle').textContent=name+' 관리자';
  document.title=name+' 관리자';
  if(exhibitionSettingsResult)exhibitionSettingsResult.textContent='전시회명과 로고를 적용했습니다. 사용자 화면에도 자동 반영됩니다.';
  markDirty('기본설정 변경사항 있음');
});

renderStats();historyButtons();renderContentBooths();renderPrograms();renderDocuments();window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue=''}});
})();

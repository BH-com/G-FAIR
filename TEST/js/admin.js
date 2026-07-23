(() => {
const store=window.FINDER_PROJECT_STORE,mapData=window.FINDER_MAP_DATA,baseGraph=window.FINDER_ROUTE_GRAPH;
let project=store.load(),dirty=false,history=[],future=[];
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)],clone=v=>store.clone(v);
function snapshot(label){history.push({label,project:clone(project)});if(history.length>40)history.shift();future=[];historyButtons()}
function historyButtons(){$('#undoBtn').disabled=!history.length;$('#redoBtn').disabled=!future.length}
function markDirty(text='변경사항 있음'){dirty=true;$('#saveState').textContent=text;$('#saveState').style.color='#c16a00';renderStats()}
function saveAll(){project=store.save(project);dirty=false;$('#saveState').textContent='저장됨 · '+new Date().toLocaleTimeString();$('#saveState').style.color='#16834b'}
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

function boothLabelPoints(){
  const groups=new Map();
  for(const feature of currentBooths().features||[]){
    const booth=String(feature?.properties?.booth||'').trim();
    if(!booth)continue;
    const ring=feature?.geometry?.coordinates?.[0]||[];
    if(!ring.length)continue;
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    for(const c of ring){
      if(!Array.isArray(c)||c.length<2)continue;
      minX=Math.min(minX,Number(c[0]));maxX=Math.max(maxX,Number(c[0]));
      minY=Math.min(minY,Number(c[1]));maxY=Math.max(maxY,Number(c[1]));
    }
    if(!Number.isFinite(minX))continue;
    const item=groups.get(booth)||{minX,maxX,minY,maxY,properties:{...feature.properties,booth}};
    item.minX=Math.min(item.minX,minX);item.maxX=Math.max(item.maxX,maxX);
    item.minY=Math.min(item.minY,minY);item.maxY=Math.max(item.maxY,maxY);
    groups.set(booth,item);
  }
  return{type:'FeatureCollection',features:[...groups.values()].map(item=>({
    type:'Feature',properties:item.properties,
    geometry:{type:'Point',coordinates:[(item.minX+item.maxX)/2,(item.minY+item.maxY)/2]}
  }))};
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
let boothMap,selectedBooth='',selectedFeatureId=null;
const boothSpecialMarkers=[];
const selectedBoothFeatureIds=new Set();
function globalBoothHeight(){const n=Number(project.globalBoothHeight);return Number.isFinite(n)?Math.max(0,Math.min(300,n)):80}
function currentBooths(){const copy=clone(boothData());const h=globalBoothHeight();copy.features.forEach(f=>{const o=project.boothOverrides[f.properties.booth];if(o)Object.assign(f.properties,o);f.properties.height=h});return copy}
function clearBoothSpecialMarkers(){while(boothSpecialMarkers.length){try{boothSpecialMarkers.pop().remove()}catch{}}}
function ensureBoothSpecialMarkerStyles(){
  if(document.getElementById('finder-admin-special-marker-style'))return;
  const style=document.createElement('style');style.id='finder-admin-special-marker-style';
  style.textContent=`.finder-admin-special-marker{width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#fff;border:3px solid #ffb000;box-shadow:0 2px 7px rgba(15,35,65,.28);font-size:21px;line-height:1;pointer-events:none;transform:translateY(-5px)}.finder-admin-special-marker.premium{border-color:#7957ff}.finder-admin-special-marker.awards{border-color:#ffb000}.finder-admin-special-marker.event{border-color:#00a6a6}`;
  document.head.appendChild(style);
}
function refreshBoothSpecialMarkers(){
  if(!boothMap||!boothMap.loaded?.())return;
  clearBoothSpecialMarkers();ensureBoothSpecialMarkerStyles();
  const icons={premium:'💎',awards:'👑',event:'✨'};
  const labels=boothLabelPoints().features||[];
  for(const feature of labels){
    const booth=String(feature.properties?.booth||'');const kind=project.specialBooths?.[booth];if(!kind)continue;
    const el=document.createElement('div');el.className=`finder-admin-special-marker ${kind}`;el.textContent=icons[kind]||'✨';el.title=`${booth} 특별부스`;
    const marker=new maplibregl.Marker({element:el,anchor:'bottom',pitchAlignment:'viewport',rotationAlignment:'viewport'}).setLngLat(feature.geometry.coordinates).addTo(boothMap);
    boothSpecialMarkers.push(marker);
  }
}
function boothRefresh(){if(boothMap?.getSource('booths'))boothMap.getSource('booths').setData(currentBooths());refreshUnifiedBoothLabels(boothMap,'booths');refreshUnifiedBoothLabels(locationMap,'loc');refreshUnifiedBoothLabels(routeMap,'route');refreshBoothSpecialMarkers();requestAnimationFrame(refreshBoothSelectionStates)}
function refreshBoothSelectionStates(){if(!boothMap?.getSource('booths'))return;for(const f of boothData().features){if(f.id==null)continue;boothMap.setFeatureState({source:'booths',id:f.id},{selected:selectedBoothFeatureIds.has(String(f.id))})}}
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
    boothMap.on('click','booths-booth-fill',e=>selectBooth(e.features[0],e.originalEvent));
    boothMap.fitBounds(boundsFromBooths(),{padding:42,duration:0});
    refreshBoothSpecialMarkers();
  });
}
function fillBoothFields(f){
  selectedFeatureId=f.id;selectedBooth=f.properties.booth;
  const label=(mapData.labels||[]).find(x=>x.booth===selectedBooth)||{},bo=project.boothOverrides[selectedBooth]||{};
  $('#boothNo').value=selectedBooth;$('#boothCompany').value=project.labelOverrides[selectedBooth]?.name??label.name??'';$('#boothCategory').value=project.labelOverrides[selectedBooth]?.category??label.category??'';$('#boothColor').value=bo.color??f.properties.color??'#9fb8df';$('#boothSpecial').value=project.specialBooths[selectedBooth]||'';
}
function selectBooth(f,event){
  const id=String(f.id),multi=!!(event?.ctrlKey||event?.metaKey);
  if(multi){
    if(selectedBoothFeatureIds.has(id))selectedBoothFeatureIds.delete(id);else selectedBoothFeatureIds.add(id);
    if(selectedBoothFeatureIds.has(id))fillBoothFields(f);
  }else{selectedBoothFeatureIds.clear();selectedBoothFeatureIds.add(id);fillBoothFields(f)}
  if(!selectedBoothFeatureIds.size){selectedFeatureId=null;selectedBooth='';$('#boothSelectedInfo').textContent='부스 도형을 선택하세요.'}
  else $('#boothSelectedInfo').textContent=selectedBoothFeatureIds.size===1?`도형 ID: ${selectedFeatureId}\n부스: ${selectedBooth}`:`선택된 부스: ${selectedBoothFeatureIds.size}개\nCtrl+클릭으로 선택을 추가하거나 해제하세요.`;
  refreshBoothSelectionStates();updateBoothToolState();
}
function applyBoothRename(oldNo,newNo){if(oldNo===newNo)return;boothData().features.filter(f=>f.properties.booth===oldNo).forEach(f=>f.properties.booth=newNo);if(project.labelOverrides[oldNo]){project.labelOverrides[newNo]=project.labelOverrides[oldNo];delete project.labelOverrides[oldNo]}if(project.boothOverrides[oldNo]){project.boothOverrides[newNo]=project.boothOverrides[oldNo];delete project.boothOverrides[oldNo]}if(project.companyDetails[oldNo]){project.companyDetails[newNo]=project.companyDetails[oldNo];delete project.companyDetails[oldNo]}if(project.specialBooths[oldNo]){project.specialBooths[newNo]=project.specialBooths[oldNo];delete project.specialBooths[oldNo]}}
function boothNumberUsedByOtherFeature(newNo,currentId,currentNo){return boothData().features.some(f=>String(f.id)!==String(currentId)&&f.properties.booth===newNo&&f.properties.booth!==currentNo)}
function syncGlobalBoothHeightControl(){const el=$('#globalBoothHeight');const out=$('#globalBoothHeightValue');const value=Math.min(200,globalBoothHeight());if(el)el.value=String(value);if(out)out.textContent=String(value)}
syncGlobalBoothHeightControl();
const boothHeightSlider=$('#globalBoothHeight');if(boothHeightSlider){boothHeightSlider.addEventListener('input',()=>{const out=$('#globalBoothHeightValue');if(out)out.textContent=boothHeightSlider.value})}
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
      markDirty(snapType==='vertex'?'지점을 경로 꼭지점에 붙였습니다.':snapType==='segment'?'지점을 경로 선분에 붙였습니다.':'지점 이동');
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
      markDirty(snap?.type==='vertex'?'새 지점을 경로 꼭지점에 붙였습니다.':snap?.type==='segment'?'새 지점을 경로 선분에 붙였습니다.':'새 지점 추가');
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
$('#locationResnap').onclick=()=>{if(selectedLocation<0)return;snapshot('지점 경로 스냅');const f=project.locations.features[selectedLocation],c=nearestRoutePoint(f.geometry.coordinates,locationMap,9999);if(c){f.geometry.coordinates=c;refreshLocationPoints();selectLocation(selectedLocation);markDirty('지점 경로 스냅')}};
$('#locationDelete').onclick=()=>{if(selectedLocation<0)return;snapshot('지점 삭제');project.locations.features.splice(selectedLocation,1);selectedLocation=-1;refreshLocationPoints();$('#locationName').value='';$('#locationDelete').disabled=true;$('#locationResnap').disabled=true;markDirty()};
$('#locationName').onchange=()=>{if(selectedLocation<0)return;snapshot('지점 이름 변경');const f=project.locations.features[selectedLocation];const name=$('#locationName').value.trim()||nextLocationName();f.properties.name=name;f.properties.code=name;refreshLocationPoints();selectLocation(selectedLocation);markDirty()};
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
$('#companyTemplate').onclick=()=>downloadWorkbook('기업데이터_양식.xlsx',[{'부스번호':'A-01','기업명':'예시기업','품목':'제품 분류','제품설명':'제품 및 서비스 설명','홈페이지':'https://example.com'}]);$('#programTemplate').onclick=()=>downloadWorkbook('프로그램일정_양식.xlsx',[{'무대':'메인무대','날짜':'2026-10-22','시작':'10:00','종료':'11:00','프로그램명':'개막식','설명':'프로그램 설명'}]);
function readRows(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onerror=reject;r.onload=()=>{try{const wb=XLSX.read(r.result,{type:'array'}),ws=wb.Sheets[wb.SheetNames[0]];resolve(XLSX.utils.sheet_to_json(ws,{defval:''}))}catch(e){reject(e)}};r.readAsArrayBuffer(file)})}
function pick(row,names){const k=Object.keys(row).find(k=>names.some(n=>k.replace(/\s/g,'').toLowerCase().includes(n)));return k?row[k]:''}
$('#companyFile').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const rows=await readRows(f);snapshot('기업 데이터 불러오기');let applied=0,missing=0;rows.forEach(r=>{const booth=String(pick(r,['부스번호','부스','booth'])).trim();if(!booth){missing++;return}project.labelOverrides[booth]={...(project.labelOverrides[booth]||{}),name:String(pick(r,['기업명','회사명','company'])).trim(),category:String(pick(r,['품목','제품','category'])).trim()};project.companyDetails[booth]={description:String(pick(r,['제품설명','description'])).trim(),website:String(pick(r,['홈페이지','website','url'])).trim()};applied++});markDirty();$('#companyImportResult').textContent=`${rows.length}행 중 ${applied}건 반영 예정 · 부스번호 누락 ${missing}건`;renderContentBooths()}catch(err){$('#companyImportResult').textContent='오류: '+err.message}};
$('#programFile').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const rows=await readRows(f);snapshot('프로그램 불러오기');const byStage={};rows.forEach(r=>{const stage=String(pick(r,['무대','장소','stage'])).trim()||'메인무대';(byStage[stage]??=[]).push({date:String(pick(r,['날짜','date'])).trim(),start:String(pick(r,['시작','start'])).trim(),end:String(pick(r,['종료','end'])).trim(),title:String(pick(r,['프로그램명','프로그램','title'])).trim(),description:String(pick(r,['설명','description'])).trim()})});Object.entries(byStage).forEach(([name,programs],idx)=>{let s=project.stages.find(x=>x.name===name);if(!s){s={id:'STAGE-'+String(project.stages.length+1).padStart(2,'0'),name,coord:[.058+idx*.003,-.074],programs:[]};project.stages.push(s)}s.programs=programs});markDirty();$('#programImportResult').textContent=`${rows.length}개 프로그램 반영 예정`;renderPrograms()}catch(err){$('#programImportResult').textContent='오류: '+err.message}};

/* content and project */
function renderContentBooths(){const booths=[...new Set(boothData().features.map(f=>f.properties.booth))].sort();$('#contentBooth').innerHTML=booths.map(b=>`<option>${b}</option>`).join('');loadCompanyContent()}
function loadCompanyContent(){const b=$('#contentBooth').value,d=project.companyDetails[b]||{};$('#contentDescription').value=d.description||'';$('#contentWebsite').value=d.website||''}
$('#contentBooth').onchange=loadCompanyContent;$('#contentCompanySave').onclick=()=>{const b=$('#contentBooth').value;snapshot('기업 설명 변경');project.companyDetails[b]={description:$('#contentDescription').value.trim(),website:$('#contentWebsite').value.trim()};markDirty()};
function renderPrograms(){const box=$('#programEditor');box.innerHTML='';project.stages.forEach((stage,si)=>stage.programs.forEach((p,pi)=>{const el=document.createElement('div');el.className='program-item';el.innerHTML=`<b>${stage.name}</b><div class="row"><input data-k="start" value="${p.start||''}" placeholder="시작"><input data-k="end" value="${p.end||''}" placeholder="종료"></div><input data-k="title" value="${p.title||''}" placeholder="프로그램명"><textarea data-k="description" rows="2">${p.description||''}</textarea><div class="mini-actions"><button data-delete>삭제</button></div>`;el.querySelectorAll('[data-k]').forEach(i=>i.onchange=()=>{snapshot('프로그램 수정');project.stages[si].programs[pi][i.dataset.k]=i.value;markDirty()});el.querySelector('[data-delete]').onclick=()=>{snapshot('프로그램 삭제');project.stages[si].programs.splice(pi,1);renderPrograms();markDirty()};box.appendChild(el)}))}
$('#programAdd').onclick=()=>{snapshot('프로그램 추가');if(!project.stages.length)project.stages.push({id:'STAGE-01',name:'메인무대',coord:[.058,-.074],programs:[]});project.stages[0].programs.push({date:'',start:'',end:'',title:'새 프로그램',description:''});renderPrograms();markDirty()};
function renderDocuments(){const box=$('#documentEditor');box.innerHTML='';project.documents.forEach((d,i)=>{const el=document.createElement('div');el.className='document-item';el.innerHTML=`<input data-k="title" value="${d.title||''}" placeholder="표시 제목"><input data-k="file" value="${d.file||''}" placeholder="assets/documents/file.pdf"><label><input data-k="enabled" type="checkbox" ${d.enabled?'checked':''}> 사용자 화면에 표시</label>`;el.querySelectorAll('[data-k]').forEach(inp=>inp.onchange=()=>{snapshot('PDF 설정 변경');project.documents[i][inp.dataset.k]=inp.type==='checkbox'?inp.checked:inp.value;markDirty()});box.appendChild(el)})}
$('#projectDownload').onclick=()=>store.download(project,`finder-project-${new Date().toISOString().slice(0,10)}.json`);$('#projectFile').onchange=async e=>{if(!e.target.files[0])return;try{await store.importFile(e.target.files[0]);location.reload()}catch(err){alert(err.message)}};$('#projectReset').onclick=()=>{if(confirm('관리자 수정사항을 모두 초기화할까요?'))store.clear()};$('#deployZip').onclick=async()=>{saveAll();const zip=new JSZip();zip.file('project.json',JSON.stringify(project,null,2));zip.file('data/project-overrides.js',`window.FINDER_PROJECT_OVERRIDE=${JSON.stringify(project)};\nif(window.FINDER_PROJECT_STORE)window.FINDER_PROJECT_STORE.save(window.FINDER_PROJECT_OVERRIDE);`);const blob=await zip.generateAsync({type:'blob'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='FINDER-deployment-data.zip';a.click()};
renderStats();historyButtons();renderContentBooths();renderPrograms();renderDocuments();window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue=''}});
})();
/* safe settings/data extension: exhibition name only */
(()=>{
  const input=document.getElementById('exhibitionName');
  const apply=document.getElementById('exhibitionNameApply');
  const result=document.getElementById('exhibitionNameResult');
  if(!input||!apply)return;
  input.value=project.exhibitionName||'';
  apply.addEventListener('click',()=>{
    const name=input.value.trim();
    if(!name){alert('전시회명을 입력해 주세요.');input.focus();return;}
    snapshot('전시회명 변경');
    project.exhibitionName=name;
    document.getElementById('adminTitle').textContent=name+' 관리자';
    document.title=name+' 관리자';
    if(result)result.textContent='전시회명을 적용했습니다. 상단 저장 버튼을 눌러 저장하세요.';
    markDirty('전시회명 변경사항 있음');
  });
})();

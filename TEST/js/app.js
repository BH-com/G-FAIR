(() => {
 const data=window.FINDER_MAP_DATA; const routeGraph=window.FINDER_ROUTE_GRAPH; const specialBooths=window.FINDER_SPECIAL_BOOTHS||{}; const status=document.getElementById('status'); const panel=document.getElementById('panel'); const results=document.getElementById('results'); const input=document.getElementById('search');
 document.getElementById('title').textContent=(data.exhibitionName||'전시장')+' 전시장 안내 시스템 · MapLibre';
 if(!window.maplibregl){document.getElementById('error').style.display='flex';return;}
 const style={version:8,sources:{},layers:[{id:'background',type:'background',paint:{'background-color':'#f5f7fb'}}]};
 const map=new maplibregl.Map({container:'map',style,center:[0.055,-0.075],zoom:12,pitch:42,bearing:-22,antialias:true,maxPitch:70,dragRotate:true,pitchWithRotate:true,touchPitch:true,cooperativeGestures:false});
 map.addControl(new maplibregl.NavigationControl({visualizePitch:true}),'top-right');
 let bounds=null, selectedId=null, selectedLabel=null, routesVisible=true, activeRoute=null, activeRouteCoords=[], startMarker=null, endMarker=null, routeAnimationFrame=0, routeAnimationStarted=0; const specialMarkers=[]; let boothCatalog=[];
 function routeGeoFromGraph(){const by=new Map(routeGraph.vertices.map(v=>[String(v.id),v.coord]));return{type:'FeatureCollection',features:routeGraph.segments.filter(s=>!s.closed).map(s=>({type:'Feature',id:String(s.id),properties:{id:String(s.id)},geometry:{type:'LineString',coordinates:[by.get(String(s.source)),by.get(String(s.target))]}})).filter(f=>f.geometry.coordinates.every(Boolean))};}
 function projectPointToSegment(point,a,b){const abx=b[0]-a[0],aby=b[1]-a[1],len2=abx*abx+aby*aby;if(!len2)return a.slice();let t=((point[0]-a[0])*abx+(point[1]-a[1])*aby)/len2;t=Math.max(0,Math.min(1,t));return[a[0]+abx*t,a[1]+aby*t];}
 function canonicalRouteCoord(coord){let best=coord.slice(),bestDist=Infinity;const by=new Map(routeGraph.vertices.map(v=>[String(v.id),v.coord]));for(const segment of routeGraph.segments){if(segment.closed)continue;const a=by.get(String(segment.source)),b=by.get(String(segment.target));if(!a||!b)continue;const q=projectPointToSegment(coord,a,b);const dx=q[0]-coord[0],dy=q[1]-coord[1],d=dx*dx+dy*dy;if(d<bestDist){bestDist=d;best=q;}}return best;}
 function locationGeoJSON(){return{type:'FeatureCollection',features:(data.locations?.features||[]).map((feature,index)=>({type:'Feature',id:feature.id??index,properties:{...(feature.properties||{}),sourceIndex:index},geometry:{type:'Point',coordinates:[Number(feature.geometry.coordinates[0]),Number(feature.geometry.coordinates[1])]}}))};}
 function locationCoord(index){const feature=data.locations?.features?.[index];return feature?[Number(feature.geometry.coordinates[0]),Number(feature.geometry.coordinates[1])]:null;}
 function eachGeometryCoord(geometry,callback){
   if(!geometry)return;
   if(geometry.type==='Polygon')geometry.coordinates.forEach(ring=>ring.forEach(callback));
   else if(geometry.type==='MultiPolygon')geometry.coordinates.forEach(poly=>poly.forEach(ring=>ring.forEach(callback)));
 }
 function polygonRingAreaCenter(ring){
   let twiceArea=0,cx=0,cy=0;
   for(let i=0,j=ring.length-1;i<ring.length;j=i++){
     const a=ring[j],b=ring[i],cross=a[0]*b[1]-b[0]*a[1];
     twiceArea+=cross;cx+=(a[0]+b[0])*cross;cy+=(a[1]+b[1])*cross;
   }
   if(Math.abs(twiceArea)<1e-15){
     const pts=ring.slice(0,-1),n=pts.length||1;
     return {area:0,coord:[pts.reduce((v,c)=>v+c[0],0)/n,pts.reduce((v,c)=>v+c[1],0)/n]};
   }
   return {area:Math.abs(twiceArea/2),coord:[cx/(3*twiceArea),cy/(3*twiceArea)]};
 }
 function featureLabelCoord(feature){
   const polygons=feature.geometry?.type==='MultiPolygon'?feature.geometry.coordinates:(feature.geometry?.type==='Polygon'?[feature.geometry.coordinates]:[]);
   let best=null;
   polygons.forEach(poly=>{
     const outer=poly?.[0];if(!outer?.length)return;
     const result=polygonRingAreaCenter(outer);
     if(!best||result.area>best.area)best=result;
   });
   if(best)return best.coord;
   const coords=[];eachGeometryCoord(feature.geometry,c=>coords.push(c));
   return coords.length?[coords.reduce((v,c)=>v+c[0],0)/coords.length,coords.reduce((v,c)=>v+c[1],0)/coords.length]:[0,0];
 }
 function rebuildBoothCatalog(){
   const oldByBooth=new Map((data.labels||[]).map(item=>[String(item.booth),item]));
   const grouped=new Map();
   (data.booths?.features||[]).forEach(feature=>{
     const booth=String(feature.properties?.booth||'').trim();if(!booth)return;
     const candidate={feature,coord:featureLabelCoord(feature)};
     const current=grouped.get(booth);
     const coords=[];eachGeometryCoord(feature.geometry,c=>coords.push(c));
     candidate.span=coords.length?(Math.max(...coords.map(c=>c[0]))-Math.min(...coords.map(c=>c[0])))*(Math.max(...coords.map(c=>c[1]))-Math.min(...coords.map(c=>c[1]))):0;
     if(!current||candidate.span>current.span)grouped.set(booth,candidate);
   });
   boothCatalog=[...grouped.entries()].map(([booth,entry])=>{
     const old=oldByBooth.get(booth)||{},props=entry.feature.properties||{};
     return {...old,...props,booth,name:props.name??old.name??'',category:props.category??old.category??'',coord:entry.coord};
   }).sort((a,b)=>a.booth.localeCompare(b.booth,undefined,{numeric:true}));
 }
 function boothLabelGeoJSON(){return {type:'FeatureCollection',features:boothCatalog.map((item,index)=>({type:'Feature',id:index,properties:{booth:item.booth,name:item.name||''},geometry:{type:'Point',coordinates:item.coord}}))};}
 function allBounds(){const b=new maplibregl.LngLatBounds();(data.booths?.features||[]).forEach(f=>eachGeometryCoord(f.geometry,c=>b.extend(c)));return b;}
 function fit(){if(!bounds)bounds=allBounds();map.fitBounds(bounds,{padding:{top:70,bottom:70,left:70,right:70},pitch:35,bearing:-15,duration:650});}
 function escapeHtml(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
 function nearestVertex(coord){let best=null,bd=Infinity;for(const v of routeGraph.vertices){const dx=v.coord[0]-coord[0],dy=v.coord[1]-coord[1],d=dx*dx+dy*dy;if(d<bd){bd=d;best=v;}}return best;}
 function shortestPath(startId,endId){const adj=new Map();for(const v of routeGraph.vertices)adj.set(v.id,[]);for(const s of routeGraph.segments){if(s.closed)continue;const a=routeGraph.vertices.find(v=>v.id===s.source),b=routeGraph.vertices.find(v=>v.id===s.target);if(!a||!b)continue;const w=Math.hypot(a.coord[0]-b.coord[0],a.coord[1]-b.coord[1]);adj.get(a.id).push([b.id,w]);adj.get(b.id).push([a.id,w]);}const dist=new Map([[startId,0]]),prev=new Map(),open=new Set([startId]);while(open.size){let u=null,du=Infinity;for(const id of open){const d=dist.get(id)??Infinity;if(d<du){du=d;u=id;}}open.delete(u);if(u===endId)break;for(const [v,w] of adj.get(u)||[]){const nd=du+w;if(nd<(dist.get(v)??Infinity)){dist.set(v,nd);prev.set(v,u);open.add(v);}}}if(!dist.has(endId))return null;const ids=[];for(let cur=endId;cur;cur=prev.get(cur)){ids.push(cur);if(cur===startId)break;}ids.reverse();const byId=new Map(routeGraph.vertices.map(v=>[v.id,v]));return {coords:ids.map(id=>byId.get(id).coord),distance:dist.get(endId)};}
 function clearRoute(){activeRoute=null;activeRouteCoords=[];if(routeAnimationFrame){cancelAnimationFrame(routeAnimationFrame);routeAnimationFrame=0;}if(map.getSource('active-route'))map.getSource('active-route').setData({type:'FeatureCollection',features:[]});if(map.getSource('route-particles'))map.getSource('route-particles').setData({type:'FeatureCollection',features:[]});if(startMarker){startMarker.remove();startMarker=null;}if(endMarker){endMarker.remove();endMarker=null;}document.getElementById('routeInfo').textContent='시작 위치와 목적지 부스를 선택하세요.';}
 function routeTo(startCoord,dest){startCoord=[Number(startCoord[0]),Number(startCoord[1])];const sv=nearestVertex(startCoord),ev=nearestVertex(dest.coord);const found=sv&&ev?shortestPath(sv.id,ev.id):null;if(!found){setStatus('연결 가능한 경로를 찾지 못했습니다.');return;}const coords=[startCoord,...found.coords,dest.coord];activeRouteCoords=coords;activeRoute={type:'FeatureCollection',features:[{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:coords}}]};map.getSource('active-route').setData(activeRoute);startRouteAnimation();clearRouteMarkersOnly();const se=document.createElement('div');se.className='route-dot start';startMarker=new maplibregl.Marker({element:se,anchor:'center'}).setLngLat(startCoord).addTo(map);const ee=document.createElement('div');ee.className='route-dot end';endMarker=new maplibregl.Marker({element:ee,anchor:'center'}).setLngLat(dest.coord).addTo(map);const rb=new maplibregl.LngLatBounds();coords.forEach(c=>rb.extend(c));map.fitBounds(rb,{padding:{top:140,bottom:100,left:70,right:70},pitch:48,bearing:map.getBearing(),duration:700});document.getElementById('routeInfo').textContent=`${dest.booth}까지 경로 표시 · 노드 ${found.coords.length}개`;setStatus(`길찾기: ${dest.booth} ${dest.name||''}`);}
 function clearRouteMarkersOnly(){if(startMarker){startMarker.remove();startMarker=null;}if(endMarker){endMarker.remove();endMarker=null;}}
 function pointAlongRoute(coords,t){if(!coords||coords.length<2)return coords?.[0]||[0,0];const lengths=[];let total=0;for(let i=1;i<coords.length;i++){const dx=coords[i][0]-coords[i-1][0],dy=coords[i][1]-coords[i-1][1];const len=Math.hypot(dx,dy);lengths.push(len);total+=len;}if(total<=0)return coords[0];let target=((t%1)+1)%1*total;for(let i=0;i<lengths.length;i++){const len=lengths[i];if(target<=len||i===lengths.length-1){const r=len?target/len:0;return [coords[i][0]+(coords[i+1][0]-coords[i][0])*r,coords[i][1]+(coords[i+1][1]-coords[i][1])*r];}target-=len;}return coords[coords.length-1];}
 function startRouteAnimation(){if(routeAnimationFrame)cancelAnimationFrame(routeAnimationFrame);routeAnimationStarted=performance.now();const animate=now=>{if(!activeRoute||!activeRouteCoords.length||!map.getSource('route-particles')){routeAnimationFrame=0;return;}const phase=((now-routeAnimationStarted)/4200)%1;const features=[];const particleCount=5;for(let i=0;i<particleCount;i++){const progress=(phase+i/particleCount)%1;features.push({type:'Feature',properties:{index:i,opacity:1-i*0.1},geometry:{type:'Point',coordinates:pointAlongRoute(activeRouteCoords,progress)}});}map.getSource('route-particles').setData({type:'FeatureCollection',features});routeAnimationFrame=requestAnimationFrame(animate);};routeAnimationFrame=requestAnimationFrame(animate);}

 function setStatus(text){status.textContent=text;}
 function clearSelected(){if(selectedId!==null&&map.getSource('booths'))map.setFeatureState({source:'booths',id:selectedId},{selected:false});selectedId=null;selectedLabel=null;panel.classList.remove('open');}
 function openSelection(item,id,coord){clearSelected();selectedId=id;selectedLabel=item;if(id!==null)map.setFeatureState({source:'booths',id},{selected:true});document.getElementById('panelBooth').textContent=item.booth||'-';document.getElementById('panelCompany').textContent=item.name||'기업명 없음';document.getElementById('panelCategory').textContent=item.category||'품목 미등록'; updateBoothDetail(item); panel.classList.add('open');setStatus(`선택: ${item.booth||''} ${item.name||''}`);if(coord)selectedLabel={...item,coord};}
 function findFeatureId(booth){const f=data.booths.features.find(x=>x.properties.booth===booth);return f?(f.id??f.properties?._editId??null):null;}
 function selectLabel(item,fly=true){const id=findFeatureId(item.booth);openSelection(item,id,item.coord);if(fly)map.easeTo({center:item.coord,zoom:17.2,pitch:48,bearing:map.getBearing(),duration:650});}
 function updateLabelDetail(){if(map.getLayer('booth-labels'))map.setLayoutProperty('booth-labels','text-size',map.getZoom()>=15.4?12:10);}
 map.on('load',()=>{
   rebuildBoothCatalog();
   map.addSource('booths',{type:'geojson',data:data.booths});
   const boothSelected=['boolean',['feature-state','selected'],false];
   const boothHeight=['coalesce',['get','height'],80];
   const boothLift=['case',boothSelected,10,0];
   map.addLayer({id:'booth-extrusion',type:'fill-extrusion',source:'booths',paint:{
     'fill-extrusion-color':['case',boothSelected,'#ff8a22',['get','color']],
     'fill-extrusion-height':['+',boothHeight,boothLift],
     'fill-extrusion-base':boothLift,
     'fill-extrusion-opacity':.96,
     'fill-extrusion-vertical-gradient':true
   }});
   map.addLayer({id:'booth-outline',type:'line',source:'booths',paint:{
     'line-color':['case',boothSelected,'#bd3800','#59636f'],
     'line-width':['case',boothSelected,3,1.1],
     'line-opacity':.9
   }});
   map.addSource('booth-label-points',{type:'geojson',data:boothLabelGeoJSON()});
   map.addLayer({id:'booth-labels',type:'symbol',source:'booth-label-points',layout:{'text-field':['get','booth'],'text-size':10,'text-font':['Open Sans Bold'],'text-anchor':'center','text-allow-overlap':false,'text-ignore-placement':false,'symbol-sort-key':0},paint:{'text-color':'#15243b','text-halo-color':'#ffffff','text-halo-width':1.25}});
   map.addSource('routes',{type:'geojson',data:routeGeoFromGraph()});
   map.addLayer({id:'routes-glow',type:'line',source:'routes',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#fff','line-width':6,'line-opacity':.9}});
   map.addLayer({id:'routes',type:'line',source:'routes',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#2684ff','line-width':2.7,'line-opacity':.92}});
   map.addSource('active-route',{type:'geojson',lineMetrics:true,data:{type:'FeatureCollection',features:[]}});
   map.addSource('route-particles',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
   map.addLayer({id:'active-route-glow',type:'line',source:'active-route',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#ffffff','line-width':10,'line-opacity':.96}});
   map.addLayer({id:'active-route',type:'line',source:'active-route',layout:{'line-cap':'round','line-join':'round'},paint:{'line-gradient':['interpolate',['linear'],['line-progress'],0,'#20c7ff',0.5,'#1769ff',1,'#6b4cff'],'line-width':5,'line-opacity':1}});
   map.addLayer({id:'route-particle-glow',type:'circle',source:'route-particles',paint:{'circle-radius':9,'circle-color':'#45d6ff','circle-blur':0.75,'circle-opacity':0.55}});
   map.addLayer({id:'route-particles',type:'circle',source:'route-particles',paint:{'circle-radius':4.2,'circle-color':'#ffffff','circle-stroke-width':2.2,'circle-stroke-color':'#1769ff','circle-opacity':['coalesce',['get','opacity'],1]}});
   const iconMap={premium:'💎',awards:'👑',event:'✨'};boothCatalog.forEach(l=>{const kind=specialBooths[l.booth];if(!kind)return;const el=document.createElement('div');el.className=`special-marker ${kind}`;el.innerHTML=`<span class="icon">${iconMap[kind]}</span>`;el.title=`${l.booth} ${kind}`;new maplibregl.Marker({element:el,anchor:'bottom',pitchAlignment:'viewport',rotationAlignment:'viewport'}).setLngLat(l.coord).addTo(map);specialMarkers.push({el,item:l,kind});});
   map.addSource('locations',{type:'geojson',data:locationGeoJSON()});
   map.addLayer({id:'locations-ring',type:'circle',source:'locations',paint:{
     'circle-radius':8,
     'circle-color':'#ffffff',
     'circle-stroke-width':3,
     'circle-stroke-color':'#ef2d2d',
     'circle-pitch-alignment':'viewport',
     'circle-pitch-scale':'viewport'
   }});
   map.addLayer({id:'locations-core',type:'circle',source:'locations',paint:{
     'circle-radius':3.5,
     'circle-color':'#ef2d2d',
     'circle-pitch-alignment':'viewport',
     'circle-pitch-scale':'viewport'
   }});
   map.addLayer({id:'locations-label',type:'symbol',source:'locations',layout:{
     'text-field':['coalesce',['get','name'],['get','code'],'위치'],
     'text-size':11,
     'text-font':['Open Sans Bold'],
     'text-anchor':'bottom',
     'text-offset':[0,-1.05],
     'text-allow-overlap':true,
     'text-ignore-placement':true
   },paint:{
     'text-color':'#ffffff',
     'text-halo-color':'#202938',
     'text-halo-width':4,
     'text-halo-blur':0.5
   }});
   const startSelect=document.getElementById('startSelect');startSelect.innerHTML=data.locations.features.map((f,i)=>`<option value="${i}">${escapeHtml(f.properties.name||f.properties.code||('위치 '+(i+1)))}</option>`).join('');const destSelect=document.getElementById('destSelect');destSelect.innerHTML='<option value="">목적지 부스</option>'+boothCatalog.map((l,i)=>`<option value="${i}">${escapeHtml(l.booth)} · ${escapeHtml(l.name||'')}</option>`).join('');fit();updateLabelDetail();setStatus(`부스 ${boothCatalog.length}개 · 경로 ${routeGraph.segments.filter(s=>!s.closed).length}개 · 위치 ${data.locations.features.length}개`);
 });
 map.on('zoom',updateLabelDetail);
 map.on('click','booth-extrusion',e=>{const f=e.features&&e.features[0];if(!f)return;const item=boothCatalog.find(x=>x.booth===f.properties.booth)||{booth:f.properties.booth,name:f.properties.name,category:f.properties.category,coord:[e.lngLat.lng,e.lngLat.lat]};openSelection(item,f.id,[e.lngLat.lng,e.lngLat.lat]);});
 map.on('click',e=>{if(!map.queryRenderedFeatures(e.point,{layers:['booth-extrusion']}).length)results.classList.remove('open');});
 map.on('mouseenter','booth-extrusion',()=>map.getCanvas().style.cursor='pointer'); map.on('mouseleave','booth-extrusion',()=>map.getCanvas().style.cursor='');
 function matching(q){q=q.trim().toLowerCase();if(!q)return[];return boothCatalog.filter(x=>(`${x.booth} ${x.name} ${x.category}`).toLowerCase().includes(q)).slice(0,30);}
 function renderResults(){const items=matching(input.value);if(!input.value.trim()||!items.length){results.classList.remove('open');results.innerHTML='';return;}results.innerHTML=items.map((x,i)=>`<div class="result" data-i="${i}"><b>${escapeHtml(x.booth)} · ${escapeHtml(x.name||'')}</b><span>${escapeHtml(x.category||'품목 미등록')}</span></div>`).join('');results.classList.add('open');results.querySelectorAll('.result').forEach((el,i)=>el.onclick=()=>{selectLabel(items[i]);results.classList.remove('open');input.value=`${items[i].booth} ${items[i].name||''}`.trim();});}
 function search(){const found=matching(input.value)[0];if(!found){setStatus('검색 결과가 없습니다.');results.classList.remove('open');return;}selectLabel(found);results.classList.remove('open');}
 input.addEventListener('input',renderResults);input.addEventListener('focus',renderResults);input.addEventListener('keydown',e=>{if(e.key==='Enter')search();if(e.key==='Escape')results.classList.remove('open');});document.getElementById('searchBtn').onclick=search;
 document.addEventListener('pointerdown',e=>{if(!e.target.closest('.search-box'))results.classList.remove('open');});
 document.getElementById('flatBtn').onclick=()=>map.easeTo({pitch:0,bearing:0,duration:550});document.getElementById('threeBtn').onclick=()=>map.easeTo({pitch:52,bearing:-28,duration:550});document.getElementById('resetBtn').onclick=()=>{clearSelected();fit();};
 document.getElementById('routeBtn').onclick=e=>{routesVisible=!routesVisible;['routes','routes-glow'].forEach(id=>map.setLayoutProperty(id,'visibility',routesVisible?'visible':'none'));e.currentTarget.textContent=routesVisible?'경로 숨김':'경로 표시';};
 document.getElementById('panelClose').onclick=clearSelected;document.getElementById('panelClear').onclick=clearSelected;document.getElementById('panelFocus').onclick=()=>{if(selectedLabel?.coord)map.easeTo({center:selectedLabel.coord,zoom:18,pitch:52,bearing:map.getBearing(),duration:550});};
 document.getElementById('routeGo').onclick=()=>{const si=Number(document.getElementById('startSelect').value||0),di=document.getElementById('destSelect').value;if(di===''){setStatus('목적지 부스를 선택하세요.');return;}routeTo(locationCoord(si),boothCatalog[Number(di)]);};
 document.getElementById('routeClear').onclick=clearRoute;
 document.getElementById('panelRoute').onclick=()=>{if(!selectedLabel?.coord)return;const idx=boothCatalog.findIndex(x=>x.booth===selectedLabel.booth);if(idx>=0)document.getElementById('destSelect').value=String(idx);const si=Number(document.getElementById('startSelect').value||0);routeTo(locationCoord(si),selectedLabel);};
 window.addEventListener('storage',event=>{if(!event.key||!event.key.startsWith('finder.maplibre.project.'))return;window.FINDER_PROJECT_STORE.apply(window.FINDER_PROJECT_STORE.load());bounds=null;rebuildBoothCatalog();const boothSource=map.getSource('booths');if(boothSource)boothSource.setData(data.booths);const boothLabelSource=map.getSource('booth-label-points');if(boothLabelSource)boothLabelSource.setData(boothLabelGeoJSON());const source=map.getSource('routes');if(source)source.setData(routeGeoFromGraph());const locationSource=map.getSource('locations');if(locationSource)locationSource.setData(locationGeoJSON());const startSelect=document.getElementById('startSelect');if(startSelect)startSelect.innerHTML=data.locations.features.map((f,i)=>`<option value="${i}">${escapeHtml(f.properties.name||f.properties.code||('위치 '+(i+1)))}</option>`).join('');const destSelect=document.getElementById('destSelect');if(destSelect)destSelect.innerHTML='<option value="">목적지 부스</option>'+boothCatalog.map((l,i)=>`<option value="${i}">${escapeHtml(l.booth)} · ${escapeHtml(l.name||'')}</option>`).join('');clearRoute();setStatus(`관리자 변경 반영 · 경로 ${routeGraph.segments.filter(s=>!s.closed).length}개 · 위치 ${data.locations.features.length}개`);});
 window.addEventListener('resize',()=>map.resize());
 const content=window.FINDER_CONTENT||{companyDetails:{},stages:[],documents:[]};
 function updateBoothDetail(item){
   const detail=content.companyDetails?.[item.booth]||{};
   const desc=document.getElementById('panelDescription');
   const link=document.getElementById('panelWebsite');
   const badge=document.getElementById('panelBadge');
   if(desc)desc.textContent=detail.description||item.description||'제품 설명이 등록되지 않았습니다.';
   if(link){if(detail.website){link.href=detail.website;link.style.display='inline-block'}else link.style.display='none'}
   const type=specialBooths[item.booth];
   if(badge){badge.className='special-badge';badge.textContent='';if(type){badge.classList.add('show',type);badge.textContent=type==='premium'?'◇ PREMIUM':type==='awards'?'♛ AWARDS':'✦ SPECIAL';}}
 }
 function openExhibition(){document.getElementById('expoModal').classList.add('open');renderPrograms();renderDocuments();}
 function closeExhibition(){document.getElementById('expoModal').classList.remove('open');}
 function renderPrograms(){const box=document.getElementById('programList');const all=content.stages.flatMap(s=>s.programs.map(p=>({...p,stage:s.name})));box.innerHTML=all.map(p=>`<div class="program-row"><div class="program-time">${escapeHtml(p.start)}~${escapeHtml(p.end)}</div><div><div class="program-title">${escapeHtml(p.title)}</div><div class="program-meta">${escapeHtml(p.stage)} · ${escapeHtml(p.description||'')}</div></div></div>`).join('')||'<div class="empty-note">등록된 프로그램이 없습니다.</div>'; }
 function renderDocuments(){const box=document.getElementById('documentList');box.innerHTML=content.documents.map(d=>`<div class="download-card"><div class="download-icon">PDF</div><div class="download-info"><b>${escapeHtml(d.title)}</b><span>${escapeHtml(d.size||'')}</span></div>${d.enabled?`<a href="${escapeHtml(d.file)}" download>다운로드</a>`:'<button disabled style="opacity:.45">미등록</button>'}</div>`).join('');}
 document.querySelectorAll('[data-expo-open]').forEach(b=>b.addEventListener('click',openExhibition));
 document.getElementById('expoClose').addEventListener('click',closeExhibition);
 document.getElementById('expoModal').addEventListener('click',e=>{if(e.target.id==='expoModal')closeExhibition();});
 // QR URL entry: ?loc=QR-1
 const qrLoc=new URLSearchParams(location.search).get('loc');
 if(qrLoc){const locations=data.locations?.features||[];const locIndex=locations.findIndex(f=>String(f.properties?.name||f.properties?.code||'').toLowerCase()===qrLoc.toLowerCase());const loc=locations[locIndex];if(loc){map.once('load',()=>{map.easeTo({center:[Number(loc.geometry.coordinates[0]),Number(loc.geometry.coordinates[1])],zoom:17,pitch:48,duration:800});const chip=document.getElementById('qrChip');const locName=loc.properties?.name||loc.properties?.code||qrLoc;chip.textContent=`현재 위치: ${locName}`;chip.classList.add('show');setTimeout(()=>chip.classList.remove('show'),4500);const sel=document.getElementById('startSelect');sel.value=String(locIndex);});}}
 // Stage marker and program card
 content.stages.forEach(stage=>{const el=document.createElement('button');el.className='stage-marker';el.type='button';el.innerHTML='▰';el.title=stage.name;Object.assign(el.style,{width:'38px',height:'38px',border:'2px solid white',borderRadius:'12px',background:'#6d3ee8',color:'#fff',fontSize:'22px',boxShadow:'0 4px 14px #0004',cursor:'pointer'});el.addEventListener('click',()=>{const now='14:20';const current=stage.programs.find(p=>p.start<=now&&now<p.end)||stage.programs[0];const next=stage.programs[stage.programs.indexOf(current)+1];document.getElementById('stageName').textContent=stage.name;document.getElementById('stageCurrent').textContent=current?`${current.start}~${current.end} ${current.title}`:'현재 프로그램 없음';document.getElementById('stageDescription').textContent=current?.description||'';document.getElementById('stageNext').textContent=next?`${next.start}~${next.end} ${next.title}`:'다음 프로그램 없음';document.getElementById('stagePanel').classList.add('open');});new maplibregl.Marker({element:el,anchor:'bottom'}).setLngLat(stage.coord).addTo(map);});
 document.getElementById('stageClose').addEventListener('click',()=>document.getElementById('stagePanel').classList.remove('open'));
 document.getElementById('stageRoute').addEventListener('click',()=>{const s=content.stages[0];if(!s)return;const nearest=nearestVertex(s.coord);const opt=[...document.getElementById('destSelect').options].find(o=>o.textContent.includes('메인무대'));if(opt)document.getElementById('destSelect').value=opt.value;map.easeTo({center:s.coord,zoom:17,duration:500});});

})();
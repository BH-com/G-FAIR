(() => {
  const STORAGE_KEY = 'finder.maplibre.project.v3';
  const LEGACY_STORAGE_KEY = 'finder.maplibre.project.v2';
  const CHANNEL_NAME = 'finder.maplibre.project.channel.v1';
  const clone = value => JSON.parse(JSON.stringify(value));
  const DEFAULT_DISPLAY_OPTIONS = Object.freeze({
    showBoothNumber: true,
    showCompanyName: false,
    showSpecialBooths: true
  });
  const merge = (base, extra) => {
    if (!extra || typeof extra !== 'object') return clone(base);
    if (Array.isArray(base)) return Array.isArray(extra) ? clone(extra) : clone(base);
    const result = { ...clone(base) };
    Object.keys(extra).forEach(key => {
      const bv = result[key], ev = extra[key];
      result[key] = bv && ev && typeof bv === 'object' && typeof ev === 'object' && !Array.isArray(bv) && !Array.isArray(ev) ? merge(bv, ev) : clone(ev);
    });
    return result;
  };
  const broadcast = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL_NAME) : null;
  function normalizeLocations(value,fallback={type:'FeatureCollection',features:[]}){
    const source=value&&value.type==='FeatureCollection'&&Array.isArray(value.features)?value:fallback;
    const features=(source?.features||[]).filter(feature=>{
      const coord=feature?.geometry?.coordinates;
      return feature?.geometry?.type==='Point'&&Array.isArray(coord)&&coord.length>=2&&Number.isFinite(Number(coord[0]))&&Number.isFinite(Number(coord[1]));
    }).map(feature=>({
      type:'Feature',
      properties:clone(feature.properties||{}),
      geometry:{type:'Point',coordinates:[Number(feature.geometry.coordinates[0]),Number(feature.geometry.coordinates[1])]}
    }));
    return {type:'FeatureCollection',features};
  }
  function defaults() {
    const mapData = window.FINDER_MAP_DATA || { labels: [], locations: { type:'FeatureCollection', features:[] } };
    const content = window.FINDER_CONTENT || { companyDetails:{}, stages:[], documents:[] };
    return {
      schemaVersion:'3.4',
      labelPositionBasis:'geometry-v1',
      updatedAt:new Date().toISOString(),
      exhibitionName:mapData.exhibitionName||'전시장 안내 시스템',
      exhibitionLogo:mapData.exhibitionLogo||'',
      companyDetails:clone(content.companyDetails||{}),
      companyBooths:[],
      specialBooths:clone(window.FINDER_SPECIAL_BOOTHS||{}),
      stages:clone(content.stages||[]),
      documents:clone(content.documents||[]),
      boothOverrides:{},
      globalBoothHeight:80,
      labelOverrides:{},
      labelPositions:{},
      displayOptions:clone(DEFAULT_DISPLAY_OPTIONS),
      routeClosures:{},
      locations:clone(mapData.locations||{type:'FeatureCollection',features:[]}),
      routeGraph:null,
      boothFeatures:null
    };
  }
  function readRaw(){
    try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||localStorage.getItem(LEGACY_STORAGE_KEY)||'null')}catch{return null}
  }
  function load(){
    const raw=readRaw()||{};
    const data=merge(defaults(),raw);
    if(raw.labelPositionBasis!=='geometry-v1'){
      data.labelPositions={};
      data.labelPositionBasis='geometry-v1';
    }
    data.locations=normalizeLocations(data.locations,defaults().locations);
    return data;
  }
  function syncRuntime(project){
    window.FINDER_PROJECT_CURRENT = clone(project);
    window.FINDER_DISPLAY_OPTIONS = merge(DEFAULT_DISPLAY_OPTIONS, project.displayOptions || {});
    window.FINDER_LABEL_POSITIONS = clone(project.labelPositions || {});
  }
  function ensureLabelEntries(mapData){
    if(!mapData) return;
    const existing = Array.isArray(mapData.labels) ? mapData.labels : [];
    const byBooth = new Map(existing.map(item => [String(item?.booth||'').trim(), clone(item)]));
    const labels = [];
    const seen = new Set();
    (mapData.booths?.features || []).forEach(feature => {
      const booth = String(feature?.properties?.booth || '').trim();
      if(!booth || seen.has(booth)) return;
      seen.add(booth);
      const props = feature.properties || {};
      const item = byBooth.get(booth) || { booth };
      if(item.name == null) item.name = props.name || '';
      if(item.category == null) item.category = props.category || '';
      labels.push(item);
    });
    existing.forEach(item => {
      const booth = String(item?.booth || '').trim();
      if(!booth || seen.has(booth)) return;
      seen.add(booth);
      labels.push(clone(item));
    });
    mapData.labels = labels;
  }
  function notify(project, origin='local'){
    window.dispatchEvent(new CustomEvent('finder-project-changed',{detail:project}));
    window.dispatchEvent(new CustomEvent('finder-project-live-update',{detail:{project,origin}}));
  }
  function save(project, options={}){
    const data = clone(project);
    data.schemaVersion = '3.4';
    data.labelPositionBasis = 'geometry-v1';
    data.labelPositions = clone(data.labelPositions || {});
    data.locations = normalizeLocations(data.locations,defaults().locations);
    Object.values(data.labelOverrides || {}).forEach(value => { if(value && typeof value === 'object') delete value.coord; });
    data.updatedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    apply(data);
    if(options.broadcast !== false && broadcast){
      try{broadcast.postMessage({type:'project-update',project:data,updatedAt:data.updatedAt});}catch{}
    }
    notify(data,'save');
    if(options.remote !== false){
      try{window.FINDER_FIREBASE?.scheduleProjectSave?.(data,options.remoteDelay);}catch(error){console.warn('Firebase save scheduling failed',error)}
    }
    return data;
  }
  function clear(){localStorage.removeItem(STORAGE_KEY);localStorage.removeItem(LEGACY_STORAGE_KEY);location.reload()}
  function applyRemote(project,options={}){
    const data=merge(defaults(),project||{});
    data.schemaVersion='3.4';
    data.labelPositionBasis='geometry-v1';
    data.labelPositions=clone(data.labelPositions||{});
    data.locations=normalizeLocations(data.locations,defaults().locations);
    Object.values(data.labelOverrides||{}).forEach(value=>{if(value&&typeof value==='object')delete value.coord;});
    if(options.persist===true){
      try{localStorage.setItem(STORAGE_KEY,JSON.stringify(data));}catch(error){console.warn('Firebase project local backup failed',error)}
    }
    apply(data);
    notify(data,options.origin||'firebase');
    return data;
  }
  function apply(project=load()){
    const mapData=window.FINDER_MAP_DATA,graph=window.FINDER_ROUTE_GRAPH;
    project.locations=normalizeLocations(project.locations,mapData?.locations||defaults().locations);
    syncRuntime(project);
    window.FINDER_SPECIAL_BOOTHS=clone(project.specialBooths||{});
    window.FINDER_CONTENT=window.FINDER_CONTENT||{};
    window.FINDER_CONTENT.companyDetails=clone(project.companyDetails||{});
    window.FINDER_CONTENT.stages=clone(project.stages||[]);
    window.FINDER_CONTENT.documents=clone(project.documents||[]);
    if(mapData){
      mapData.exhibitionName=project.exhibitionName||mapData.exhibitionName;
      mapData.exhibitionLogo=project.exhibitionLogo||'';
      mapData.locations=clone(project.locations);
      if(project.boothFeatures)mapData.booths=clone(project.boothFeatures);
      ensureLabelEntries(mapData);
      const boothOverrides=project.boothOverrides||{};
      const globalHeight=Number.isFinite(Number(project.globalBoothHeight))?Math.max(0,Math.min(300,Number(project.globalBoothHeight))):80;
      (mapData.booths?.features||[]).forEach(f=>{
        const booth = String(f?.properties?.booth||'').trim();
        const o=boothOverrides[booth];
        if(o)Object.assign(f.properties,o);
        f.properties=f.properties||{};
        f.properties.height=globalHeight;
      });
      ensureLabelEntries(mapData);
      const labelOverrides=project.labelOverrides||{};
      (mapData.booths?.features||[]).forEach(feature=>{
        const booth=String(feature?.properties?.booth||'').trim(),override=labelOverrides[booth];
        if(!override)return;feature.properties=feature.properties||{};
        if(Object.prototype.hasOwnProperty.call(override,'name'))feature.properties.name=override.name||'';
        if(Object.prototype.hasOwnProperty.call(override,'category'))feature.properties.category=override.category||'';
      });
      const byBooth = new Map((mapData.labels||[]).map(item=>[String(item?.booth||'').trim(),item]));
      Object.keys(labelOverrides).forEach(booth=>{
        const key = String(booth||'').trim();
        if(!key) return;
        if(!byBooth.has(key)){
          const entry = { booth:key };
          mapData.labels.push(entry);
          byBooth.set(key,entry);
        }
        const cleanOverride=clone(labelOverrides[key]);
        if(cleanOverride&&typeof cleanOverride==='object')delete cleanOverride.coord;
        Object.assign(byBooth.get(key), cleanOverride);
      });
    }
    if(graph){
      if(project.routeGraph){
        graph.vertices=clone(project.routeGraph.vertices||[]);
        graph.segments=clone(project.routeGraph.segments||[])
      }
      const closed=project.routeClosures||{};
      (graph.segments||[]).forEach(s=>{if(Object.prototype.hasOwnProperty.call(closed,s.id))s.closed=!!closed[s.id]})
    }
    return project;
  }
  function download(project,filename='finder-project.json'){
    const blob=new Blob([JSON.stringify(project,null,2)],{type:'application/json'}),a=document.createElement('a');
    a.href=URL.createObjectURL(blob);a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)
  }
  async function importFile(file){
    const parsed=JSON.parse(await file.text());
    if(!parsed||typeof parsed!=='object')throw new Error('올바른 프로젝트 JSON이 아닙니다.');
    return save(merge(defaults(),parsed))
  }
  if(broadcast){
    broadcast.addEventListener('message',event=>{
      const payload = event.data || {};
      if(payload.type !== 'project-update' || !payload.project) return;
      const project = merge(defaults(), payload.project || {});
      apply(project);
      notify(project,'broadcast');
    });
  }
  window.addEventListener('storage', event => {
    if(event.key !== STORAGE_KEY && event.key !== LEGACY_STORAGE_KEY) return;
    const project = load();
    apply(project);
    notify(project,'storage');
  });
  window.FINDER_PROJECT_STORE={STORAGE_KEY,LEGACY_STORAGE_KEY,CHANNEL_NAME,DEFAULT_DISPLAY_OPTIONS,defaults,load,save,clear,apply,applyRemote,download,importFile,clone,merge,normalizeLocations};
  apply(load());
})();

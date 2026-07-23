(() => {
  const STORAGE_KEY = 'finder.maplibre.project.v3';
  const clone = value => JSON.parse(JSON.stringify(value));
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
  function defaults() {
    const mapData = window.FINDER_MAP_DATA || { labels: [], locations: { type:'FeatureCollection', features:[] } };
    const content = window.FINDER_CONTENT || { companyDetails:{}, stages:[], documents:[] };
    return {schemaVersion:'3.0',updatedAt:new Date().toISOString(),exhibitionName:mapData.exhibitionName||'전시장 안내 시스템',companyDetails:clone(content.companyDetails||{}),specialBooths:clone(window.FINDER_SPECIAL_BOOTHS||{}),stages:clone(content.stages||[]),documents:clone(content.documents||[]),boothOverrides:{},globalBoothHeight:80,labelOverrides:{},routeClosures:{},locations:clone(mapData.locations||{type:'FeatureCollection',features:[]}),routeGraph:null,boothFeatures:null};
  }
  function readRaw(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||localStorage.getItem('finder.maplibre.project.v2')||'null')}catch{return null}}
  function load(){return merge(defaults(),readRaw()||{})}
  function save(project){const data=clone(project);data.schemaVersion='3.0';data.updatedAt=new Date().toISOString();localStorage.setItem(STORAGE_KEY,JSON.stringify(data));apply(data);window.dispatchEvent(new CustomEvent('finder-project-changed',{detail:data}));return data}
  function clear(){localStorage.removeItem(STORAGE_KEY);localStorage.removeItem('finder.maplibre.project.v2');location.reload()}
  function apply(project=load()){
    const mapData=window.FINDER_MAP_DATA,graph=window.FINDER_ROUTE_GRAPH;
    window.FINDER_SPECIAL_BOOTHS=clone(project.specialBooths||{});window.FINDER_CONTENT=window.FINDER_CONTENT||{};window.FINDER_CONTENT.companyDetails=clone(project.companyDetails||{});window.FINDER_CONTENT.stages=clone(project.stages||[]);window.FINDER_CONTENT.documents=clone(project.documents||[]);
    if(mapData){mapData.exhibitionName=project.exhibitionName||mapData.exhibitionName;if(project.locations)mapData.locations=clone(project.locations);if(project.boothFeatures)mapData.booths=clone(project.boothFeatures);const boothOverrides=project.boothOverrides||{};const globalHeight=Number.isFinite(Number(project.globalBoothHeight))?Math.max(0,Math.min(300,Number(project.globalBoothHeight))):80;(mapData.booths?.features||[]).forEach(f=>{const o=boothOverrides[f.properties?.booth];if(o)Object.assign(f.properties,o);f.properties=f.properties||{};f.properties.height=globalHeight});const labelOverrides=project.labelOverrides||{};(mapData.labels||[]).forEach(l=>{const o=labelOverrides[l.booth];if(o)Object.assign(l,o)})}
    if(graph){if(project.routeGraph){graph.vertices=clone(project.routeGraph.vertices||[]);graph.segments=clone(project.routeGraph.segments||[])}const closed=project.routeClosures||{};(graph.segments||[]).forEach(s=>{if(Object.prototype.hasOwnProperty.call(closed,s.id))s.closed=!!closed[s.id]})}
    return project;
  }
  function download(project,filename='finder-project.json'){const blob=new Blob([JSON.stringify(project,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
  async function importFile(file){const parsed=JSON.parse(await file.text());if(!parsed||typeof parsed!=='object')throw new Error('올바른 프로젝트 JSON이 아닙니다.');return save(merge(defaults(),parsed))}
  window.FINDER_PROJECT_STORE={STORAGE_KEY,defaults,load,save,clear,apply,download,importFile,clone};apply(load());
})();
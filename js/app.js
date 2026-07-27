(() => {
 const FINDER_APP_SCRIPT_URL=document.currentScript?.src||new URL('js/app.js',document.baseURI).href;
 const data=window.FINDER_MAP_DATA; const routeGraph=window.FINDER_ROUTE_GRAPH; const status=document.getElementById('status'); const panel=document.getElementById('panel'); const results=document.getElementById('results'); const input=document.getElementById('search');
 const defaultDisplayOptions={showBoothNumber:true,showCompanyName:false,showSpecialBooths:true};
 const getSpecialBooths=()=>window.FINDER_SPECIAL_BOOTHS||{};
 const getDisplayOptions=()=>Object.assign({},defaultDisplayOptions,window.FINDER_DISPLAY_OPTIONS||{});
 const getLabelPositions=()=>window.FINDER_LABEL_POSITIONS||{};
 const validLngLatCoord=coord=>Array.isArray(coord)&&coord.length>=2&&Number.isFinite(Number(coord[0]))&&Number.isFinite(Number(coord[1]));
 function applyBranding(){
   const project=window.FINDER_PROJECT_CURRENT||{};
   const name=String(project.exhibitionName||data.exhibitionName||'전시장 안내').trim()||'전시장 안내';
   const logo=String(project.exhibitionLogo||data.exhibitionLogo||'').trim();
   const title=document.getElementById('title'),brandMark=document.getElementById('brandMark'),brandLogo=document.getElementById('brandLogo');
   if(title)title.textContent=name;
   document.title=name;
   if(brandMark&&brandLogo){
     if(logo){brandLogo.src=logo;brandLogo.alt=name+' 로고';brandLogo.hidden=false;brandMark.classList.add('has-logo');}
     else{brandLogo.removeAttribute('src');brandLogo.alt='';brandLogo.hidden=true;brandMark.classList.remove('has-logo');}
   }
 }
 applyBranding();
 if(!window.maplibregl){document.getElementById('error').style.display='flex';return;}
 const style={version:8,sources:{},layers:[{id:'background',type:'background',paint:{'background-color':'#f5f7fb'}}]};
 const map=new maplibregl.Map({container:'map',style,center:[0.055,-0.075],zoom:12,pitch:42,bearing:-22,antialias:true,maxPitch:70,dragRotate:true,pitchWithRotate:true,touchPitch:true,cooperativeGestures:false});
 class ViewModeControl{
   onAdd(mapInstance){
     this.map=mapInstance;
     this.container=document.createElement('div');
     this.container.className='maplibregl-ctrl maplibregl-ctrl-group view-mode-control';
     this.flatButton=this.makeButton('2D','2D 평면 보기',()=>this.map.easeTo({pitch:0,bearing:0,duration:500}));
     this.threeButton=this.makeButton('3D','3D 입체 보기',()=>this.map.easeTo({pitch:52,bearing:-28,duration:500}));
     this.container.append(this.flatButton,this.threeButton);
     this.update=()=>{
       const isFlat=this.map.getPitch()<5;
       this.flatButton.classList.toggle('active',isFlat);
       this.threeButton.classList.toggle('active',!isFlat);
       this.flatButton.setAttribute('aria-pressed',isFlat?'true':'false');
       this.threeButton.setAttribute('aria-pressed',isFlat?'false':'true');
     };
     this.map.on('pitch',this.update);
     this.update();
     return this.container;
   }
   makeButton(label,title,handler){
     const button=document.createElement('button');
     button.type='button';
     button.className='view-mode-btn';
     button.textContent=label;
     button.title=title;
     button.setAttribute('aria-label',title);
     button.addEventListener('click',handler);
     return button;
   }
   onRemove(){
     if(this.map&&this.update)this.map.off('pitch',this.update);
     this.container?.remove();
     this.map=null;
   }
 }
 map.addControl(new maplibregl.NavigationControl({showZoom:true,showCompass:true,visualizePitch:true}),'top-right');
 map.addControl(new ViewModeControl(),'top-right');
 let bounds=null, selectedId=null, selectedBoothKey='', selectedLabel=null, activeProgramPlace=null, activeRoute=null, activeRouteCoords=[], startMarker=null, endMarker=null, routeAnimationFrame=0, routeAnimationStarted=0; const specialMarkers=[]; let boothCatalog=[];
 let boothWebGLLabelLayer=null; let boothTopFeatureByBooth=new Map();
 let boothThreeLayer=null, threeLoadPromise=null;
 const programUrlParams=new URLSearchParams(location.search);
 const programTimeParam=programUrlParams.get('programTime')||'';
 let programTestNow=programTimeParam?new Date(programTimeParam):null;
 if(programTestNow&&Number.isNaN(programTestNow.getTime()))programTestNow=null;
 let programBadgeSignature='',activeProgramDate='';
 function routeGeoFromGraph(){const by=new Map(routeGraph.vertices.map(v=>[String(v.id),v.coord]));return{type:'FeatureCollection',features:routeGraph.segments.filter(s=>!s.closed).map(s=>({type:'Feature',id:String(s.id),properties:{id:String(s.id)},geometry:{type:'LineString',coordinates:[by.get(String(s.source)),by.get(String(s.target))]}})).filter(f=>f.geometry.coordinates.every(Boolean))};}
 function projectPointToSegment(point,a,b){const abx=b[0]-a[0],aby=b[1]-a[1],len2=abx*abx+aby*aby;if(!len2)return a.slice();let t=((point[0]-a[0])*abx+(point[1]-a[1])*aby)/len2;t=Math.max(0,Math.min(1,t));return[a[0]+abx*t,a[1]+aby*t];}
 function canonicalRouteCoord(coord){let best=coord.slice(),bestDist=Infinity;const by=new Map(routeGraph.vertices.map(v=>[String(v.id),v.coord]));for(const segment of routeGraph.segments){if(segment.closed)continue;const a=by.get(String(segment.source)),b=by.get(String(segment.target));if(!a||!b)continue;const q=projectPointToSegment(coord,a,b);const dx=q[0]-coord[0],dy=q[1]-coord[1],d=dx*dx+dy*dy;if(d<bestDist){bestDist=d;best=q;}}return best;}
 function boothFeatureId(feature){return feature?.id??feature?.properties?._editId??null;}
 function boothFeatureHeight(feature){
   return Math.max(0,Number(feature?.properties?.height)||0);
 }
 function darkenBoothColor(value,amount=.18){
   const text=String(value||'').trim();
   let r,g,b;
   const short=text.match(/^#([0-9a-f]{3})$/i);
   const full=text.match(/^#([0-9a-f]{6})$/i);
   const rgb=text.match(/^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)/i);
   if(short){r=parseInt(short[1][0]+short[1][0],16);g=parseInt(short[1][1]+short[1][1],16);b=parseInt(short[1][2]+short[1][2],16);}
   else if(full){r=parseInt(full[1].slice(0,2),16);g=parseInt(full[1].slice(2,4),16);b=parseInt(full[1].slice(4,6),16);}
   else if(rgb){r=Number(rgb[1]);g=Number(rgb[2]);b=Number(rgb[3]);}
   else return text||'#d5dbe3';
   const factor=Math.max(0,Math.min(1,1-amount));
   const hex=n=>Math.max(0,Math.min(255,Math.round(n*factor))).toString(16).padStart(2,'0');
   return `#${hex(r)}${hex(g)}${hex(b)}`;
 }
 function compileShader(gl,type,source){
   const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);
   if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){const message=gl.getShaderInfoLog(shader)||'shader compile failed';gl.deleteShader(shader);throw new Error(message);}return shader;
 }
 function createBoothLabelAtlas(){
   const canvas=document.createElement('canvas');canvas.width=4096;canvas.height=2048;
   const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);ctx.font='700 12px Arial, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
   let x=2,y=2,rowH=0;const entries=new Map();
   for(const item of boothCatalog){const text=String(item.booth||'');if(!text||entries.has(text))continue;const w=Math.max(28,Math.ceil(ctx.measureText(text).width)+12),h=22;if(x+w+2>canvas.width){x=2;y+=rowH+2;rowH=0;}if(y+h+2>canvas.height)break;
     const cx=x+w/2,cy=y+h/2;ctx.lineJoin='round';ctx.lineWidth=4;ctx.strokeStyle='rgba(255,255,255,.98)';ctx.strokeText(text,cx,cy);ctx.fillStyle='#15243b';ctx.fillText(text,cx,cy);
     entries.set(text,{u0:x/canvas.width,v0:y/canvas.height,u1:(x+w)/canvas.width,v1:(y+h)/canvas.height,w,h});x+=w+2;rowH=Math.max(rowH,h);
   }
   return {canvas,entries};
 }
 function refreshBoothTopFeatureIndex(){boothTopFeatureByBooth=new Map();for(const f of data.booths?.features||[]){const b=String(f.properties?.booth||'');if(b&&!boothTopFeatureByBooth.has(b))boothTopFeatureByBooth.set(b,f);}}
 function createBoothWebGLLabelLayer(){
   return {
     id:'booth-top-labels-webgl',type:'custom',renderingMode:'3d',map:null,gl:null,program:null,buffer:null,texture:null,vertexCount:0,atlas:null,
     onAdd(mapInstance,gl){this.map=mapInstance;this.gl=gl;
       const vs=`#version 300 es\nprecision highp float;\nuniform mat4 u_matrix;\nuniform vec2 u_viewport;\nuniform float u_scale;\nin vec3 a_center;\nin vec2 a_offset;\nin vec2 a_uv;\nout vec2 v_uv;\nvoid main(){vec4 clip=u_matrix*vec4(a_center,1.0);vec2 ndc=(a_offset*u_scale/u_viewport)*2.0;clip.xy+=ndc*clip.w;gl_Position=clip;v_uv=a_uv;}`;
       const fs=`#version 300 es\nprecision highp float;\nuniform sampler2D u_texture;\nin vec2 v_uv;\nout vec4 fragColor;\nvoid main(){vec4 c=texture(u_texture,v_uv);if(c.a<0.02)discard;fragColor=c;}`;
       const vsh=compileShader(gl,gl.VERTEX_SHADER,vs),fsh=compileShader(gl,gl.FRAGMENT_SHADER,fs);this.program=gl.createProgram();gl.attachShader(this.program,vsh);gl.attachShader(this.program,fsh);gl.linkProgram(this.program);gl.deleteShader(vsh);gl.deleteShader(fsh);
       if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(this.program)||'label program link failed');
       this.aCenter=gl.getAttribLocation(this.program,'a_center');this.aOffset=gl.getAttribLocation(this.program,'a_offset');this.aUv=gl.getAttribLocation(this.program,'a_uv');this.uMatrix=gl.getUniformLocation(this.program,'u_matrix');this.uViewport=gl.getUniformLocation(this.program,'u_viewport');this.uScale=gl.getUniformLocation(this.program,'u_scale');this.uTexture=gl.getUniformLocation(this.program,'u_texture');
       this.buffer=gl.createBuffer();this.rebuildAtlas();this.rebuildGeometry();
     },
     rebuildAtlas(){if(!this.gl)return;this.atlas=createBoothLabelAtlas();const gl=this.gl;if(this.texture)gl.deleteTexture(this.texture);this.texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.texture);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,this.atlas.canvas);},
     rebuildGeometry(){if(!this.gl||!this.atlas)return;refreshBoothTopFeatureIndex();const verts=[];
       for(const item of boothCatalog){const booth=String(item.booth||''),entry=this.atlas.entries.get(booth),feature=boothTopFeatureByBooth.get(booth);if(!entry||!feature||!item.coord)continue;const mc=maplibregl.MercatorCoordinate.fromLngLat({lng:Number(item.coord[0]),lat:Number(item.coord[1])},boothFeatureHeight(feature)+0.8);const hw=entry.w/2,hh=entry.h/2;
         const q=[[-hw,-hh,entry.u0,entry.v0],[hw,-hh,entry.u1,entry.v0],[hw,hh,entry.u1,entry.v1],[-hw,-hh,entry.u0,entry.v0],[hw,hh,entry.u1,entry.v1],[-hw,hh,entry.u0,entry.v1]];
         for(const v of q)verts.push(mc.x,mc.y,mc.z,v[0],v[1],v[2],v[3]);
       }
       const gl=this.gl;gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(verts),gl.DYNAMIC_DRAW);this.vertexCount=verts.length/7;this.map?.triggerRepaint();
     },
     render(gl,args){if(!this.vertexCount||!this.program||!this.texture)return;const matrix=args?.defaultProjectionData?.mainMatrix||args?.defaultProjectionData?.projectionMatrix||args;if(!matrix||matrix.length!==16)return;
       gl.useProgram(this.program);gl.uniformMatrix4fv(this.uMatrix,false,matrix);gl.uniform2f(this.uViewport,gl.canvas.width,gl.canvas.height);gl.uniform1f(this.uScale,map.getZoom()>=15.4?1.08:.92);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.texture);gl.uniform1i(this.uTexture,0);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
       const stride=7*4;gl.enableVertexAttribArray(this.aCenter);gl.vertexAttribPointer(this.aCenter,3,gl.FLOAT,false,stride,0);gl.enableVertexAttribArray(this.aOffset);gl.vertexAttribPointer(this.aOffset,2,gl.FLOAT,false,stride,3*4);gl.enableVertexAttribArray(this.aUv);gl.vertexAttribPointer(this.aUv,2,gl.FLOAT,false,stride,5*4);
       gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.disable(gl.CULL_FACE);gl.disable(gl.DEPTH_TEST);gl.drawArrays(gl.TRIANGLES,0,this.vertexCount);gl.enable(gl.DEPTH_TEST);
     },
     onRemove(mapInstance,gl){if(this.buffer)gl.deleteBuffer(this.buffer);if(this.texture)gl.deleteTexture(this.texture);if(this.program)gl.deleteProgram(this.program);this.buffer=this.texture=this.program=null;}
   };
 }
 function rebuildBoothWebGLLabels(){if(!boothWebGLLabelLayer)return;boothWebGLLabelLayer.rebuildAtlas();boothWebGLLabelLayer.rebuildGeometry();}


 function loadThreeModule(){
   if(threeLoadPromise)return threeLoadPromise;
   const url='https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.min.js';
   threeLoadPromise=import(url);
   return threeLoadPromise;
 }
 const SPECIAL_BADGE_ASSET_URLS={
   premium:'../assets/images/premium-booth-badge.png',
   awards:'../assets/images/awards-booth-badge.png',
   event:'../assets/images/event-booth-badge.png'
 };
 let specialBadgeAssetsPromise=null,specialBadgeAssets=null;
 function loadBadgeImage(src){
   return new Promise((resolve,reject)=>{
     const img=new Image();
     img.decoding='async';
     img.onload=()=>resolve(img);
     img.onerror=()=>reject(new Error('special badge image load failed: '+src));
     img.src=new URL(src,FINDER_APP_SCRIPT_URL).href;
   });
 }
 function loadSpecialBadgeAssets(){
   if(specialBadgeAssets)return Promise.resolve(specialBadgeAssets);
   if(specialBadgeAssetsPromise)return specialBadgeAssetsPromise;
   specialBadgeAssetsPromise=Promise.all(Object.entries(SPECIAL_BADGE_ASSET_URLS).map(([kind,src])=>loadBadgeImage(src).then(image=>[kind,image]))).then(items=>{
     specialBadgeAssets=Object.fromEntries(items);
     return specialBadgeAssets;
   }).catch(error=>{
     console.warn(error);
     specialBadgeAssets={};
     return specialBadgeAssets;
   });
   return specialBadgeAssetsPromise;
 }
 function threeLabelScaleForZoom(zoom){
   const z=Number(zoom)||0;
   if(z<=12.2)return 0.22;
   if(z<15.4){
     const t=Math.max(0,Math.min(1,(z-12.2)/(15.4-12.2)));
     const eased=t*t*(3-2*t);
     return 0.22+(0.90-0.22)*eased;
   }
   return 1.04;
 }
 function makeThreeLabelAtlas(){
   const canvas=document.createElement('canvas');canvas.width=4096;canvas.height=2048;
   const ctx=canvas.getContext('2d',{alpha:true});ctx.clearRect(0,0,canvas.width,canvas.height);ctx.imageSmoothingEnabled=true;
   const badgeImages=specialBadgeAssets||{};
   let x=4,y=4,rowH=0;const entries=new Map();
   function reserve(w,h){
     if(x+w+4>canvas.width){x=4;y+=rowH+4;rowH=0;}
     if(y+h+4>canvas.height)return null;
     const slot={x,y,w,h};
     x+=w+4;rowH=Math.max(rowH,h);
     return slot;
   }
   function addLinesEntry(key,lines,minWidth=62,paddingX=26,paddingY=12){
     if(entries.has(key)||!lines?.length)return;
     ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineJoin='round';
     const prepared=lines.map(line=>{ctx.font=line.font;return{...line,width:ctx.measureText(line.text).width}});
     const w=Math.max(minWidth,Math.ceil(Math.max(...prepared.map(line=>line.width)))+paddingX);
     const h=Math.max(40,prepared.reduce((sum,line)=>sum+(line.lineHeight||28),0)+paddingY);
     const slot=reserve(w,h);if(!slot)return;
     const cx=slot.x+slot.w/2;let cy=slot.y+paddingY/2;
     prepared.forEach(line=>{
       const lineHeight=line.lineHeight||28;
       cy+=lineHeight/2;
       ctx.font=line.font;ctx.lineWidth=line.strokeWidth||8;ctx.strokeStyle='rgba(255,255,255,.98)';ctx.strokeText(line.text,cx,cy);ctx.fillStyle=line.fill;ctx.fillText(line.text,cx,cy);cy+=lineHeight/2;
     });
     entries.set(key,{u0:slot.x/canvas.width,v0:1-(slot.y+slot.h)/canvas.height,u1:(slot.x+slot.w)/canvas.width,v1:1-slot.y/canvas.height,w:slot.w/2,h:slot.h/2});
   }
   function drawSparkles(boxX,boxY,boxW,boxH,color,variant='default'){
     const patterns={
       default:[{x:.16,y:.22,r:8},{x:.82,y:.2,r:7},{x:.73,y:.76,r:9},{x:.24,y:.84,r:6}],
       awards:[{x:.18,y:.19,r:8},{x:.84,y:.24,r:7},{x:.72,y:.78,r:8}],
       event:[{x:.14,y:.23,r:7},{x:.5,y:.09,r:9},{x:.82,y:.22,r:7},{x:.78,y:.8,r:8}]
     };
     const stars=patterns[variant]||patterns.default;
     ctx.save();
     ctx.fillStyle=color;
     ctx.globalAlpha=.95;
     for(const star of stars){
       const cx=boxX+boxW*star.x,cy=boxY+boxH*star.y,r=star.r;
       ctx.beginPath();
       ctx.moveTo(cx,cy-r);
       ctx.lineTo(cx+r*.34,cy-r*.34);
       ctx.lineTo(cx+r,cy);
       ctx.lineTo(cx+r*.34,cy+r*.34);
       ctx.lineTo(cx,cy+r);
       ctx.lineTo(cx-r*.34,cy+r*.34);
       ctx.lineTo(cx-r,cy);
       ctx.lineTo(cx-r*.34,cy-r*.34);
       ctx.closePath();
       ctx.fill();
     }
     ctx.restore();
   }
   function drawBadgeFallbackIcon(kind,cx,cy,size){
     ctx.save();
     ctx.translate(cx,cy);
     ctx.lineJoin='round';
     ctx.lineCap='round';
     if(kind==='premium'){
       const w=size*.78,h=size*.74;
       ctx.beginPath();
       ctx.moveTo(0,-h*.52);
       ctx.lineTo(w*.44,-h*.18);
       ctx.lineTo(w*.28,h*.02);
       ctx.lineTo(0,h*.52);
       ctx.lineTo(-w*.28,h*.02);
       ctx.lineTo(-w*.44,-h*.18);
       ctx.closePath();
       const grad=ctx.createLinearGradient(0,-h*.52,0,h*.52);
       grad.addColorStop(0,'#dff8ff');
       grad.addColorStop(.28,'#b9b7ff');
       grad.addColorStop(.7,'#8d7cff');
       grad.addColorStop(1,'#6a4ffb');
       ctx.fillStyle=grad;
       ctx.fill();
       ctx.strokeStyle='#6f5cf7';
       ctx.lineWidth=Math.max(3,size*.045);
       ctx.stroke();
     }else if(kind==='awards'){
       const w=size*.74,h=size*.62;
       ctx.fillStyle='#f4b325';
       ctx.strokeStyle='#cc8516';
       ctx.lineWidth=Math.max(3,size*.04);
       ctx.beginPath();
       ctx.moveTo(-w*.44,h*.36);
       ctx.lineTo(-w*.32,-h*.08);
       ctx.quadraticCurveTo(-w*.22,-h*.45,-w*.08,-h*.08);
       ctx.lineTo(0,-h*.48);
       ctx.lineTo(w*.08,-h*.08);
       ctx.quadraticCurveTo(w*.22,-h*.45,w*.32,-h*.08);
       ctx.lineTo(w*.44,h*.36);
       ctx.closePath();
       ctx.fill();
       ctx.stroke();
       ctx.fillRect(-w*.48,h*.24,w*.96,h*.10);
       ctx.fillRect(-w*.40,h*.38,w*.80,h*.10);
       ctx.fillStyle='#f4b325';
       for(const x of [-w*.32,-w*.12,w*.12,w*.32]){ctx.beginPath();ctx.arc(x,-h*.12,size*.06,0,Math.PI*2);ctx.fill();}
     }else if(kind==='event'){
       const balloons=[
         {x:-size*.18,y:-size*.02,r:size*.16,c:'#82d83a'},
         {x:size*.18,y:-size*.01,r:size*.16,c:'#ffd126'},
         {x:0,y:size*.02,r:size*.17,c:'#33b7ef'},
         {x:-size*.02,y:-size*.18,r:size*.17,c:'#ff8e1a'}
       ];
       for(const b of balloons){
         ctx.beginPath();ctx.fillStyle=b.c;ctx.arc(b.x,b.y,b.r,0,Math.PI*2);ctx.fill();
         ctx.beginPath();ctx.moveTo(b.x,b.y+b.r*.95);ctx.lineTo(0,size*.36);ctx.strokeStyle='rgba(50,97,133,.8)';ctx.lineWidth=Math.max(2,size*.024);ctx.stroke();
         ctx.beginPath();ctx.fillStyle='rgba(255,255,255,.55)';ctx.arc(b.x-b.r*.22,b.y-b.r*.22,b.r*.18,0,Math.PI*2);ctx.fill();
       }
     }
     ctx.restore();
   }
   function addCircleBadgeEntry(key,image,kind){
     if(entries.has(key))return;
     const circle=120,pad=18,total=circle+pad*2;
     const slot=reserve(total,total);if(!slot)return;
     const boxX=slot.x,boxY=slot.y,boxW=slot.w,boxH=slot.h;
     const cx=boxX+boxW/2,cy=boxY+boxH/2,r=circle/2;
     const theme=kind==='awards'
       ?{ring:'#f1ac1a',fill:'#fffaf0',sparkle:'rgba(255,214,102,.98)',glow:'rgba(255,190,70,.35)'}
       :(kind==='event'
         ?{ring:'#ff8f1f',fill:'#fffaf2',sparkle:'rgba(255,207,97,.98)',glow:'rgba(255,166,74,.34)'}
         :{ring:'#6e51ff',fill:'#fbf9ff',sparkle:'rgba(163,229,255,.98)',glow:'rgba(122,103,255,.34)'});
     drawSparkles(boxX+6,boxY+6,boxW-12,boxH-12,theme.sparkle,kind==='awards'?'awards':(kind==='event'?'event':'default'));
     ctx.save();
     ctx.shadowColor=theme.glow;
     ctx.shadowBlur=22;
     ctx.fillStyle='rgba(255,255,255,.98)';
     ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.fill();
     ctx.restore();
     const ringGrad=ctx.createLinearGradient(cx,cy-r,cx,cy+r);
     ringGrad.addColorStop(0,'#ffffff');
     ringGrad.addColorStop(1,theme.fill);
     ctx.fillStyle=ringGrad;
     ctx.beginPath();ctx.arc(cx,cy,r-5,0,Math.PI*2);ctx.fill();
     ctx.lineWidth=7;
     ctx.strokeStyle=theme.ring;
     ctx.beginPath();ctx.arc(cx,cy,r-5,0,Math.PI*2);ctx.stroke();
     ctx.lineWidth=2;
     ctx.strokeStyle='rgba(255,255,255,.9)';
     ctx.beginPath();ctx.arc(cx,cy,r-12,Math.PI*.82,Math.PI*1.82);ctx.stroke();
     const iconSize=circle*.62;
     if(image){
       const ratio=(image.width||1)/(image.height||1);
       let drawW=iconSize,drawH=iconSize/ratio;
       if(drawH>iconSize){drawH=iconSize;drawW=drawH*ratio;}
       const drawX=cx-drawW/2,drawY=cy-drawH/2;
       ctx.save();
       ctx.beginPath();ctx.arc(cx,cy,r-16,0,Math.PI*2);ctx.clip();
       ctx.drawImage(image,drawX,drawY,drawW,drawH);
       ctx.restore();
     }else{
       drawBadgeFallbackIcon(kind,cx,cy,iconSize);
     }
     entries.set(key,{u0:slot.x/canvas.width,v0:1-(slot.y+slot.h)/canvas.height,u1:(slot.x+slot.w)/canvas.width,v1:1-slot.y/canvas.height,w:slot.w/2,h:slot.h/2});
   }
   for(const item of boothCatalog){const lines=boothLabelLines(item);if(lines.length)addLinesEntry('__label_'+item.booth,lines,lines.length>1?110:62,lines.length>1?34:26,14);}
   addCircleBadgeEntry('__badge_premium',badgeImages.premium,'premium');
   addCircleBadgeEntry('__badge_awards',badgeImages.awards,'awards');
   addCircleBadgeEntry('__badge_event',badgeImages.event,'event');
   addLinesEntry('__program_soon',[{text:'◷ 곧 행사',font:'700 24px Arial, sans-serif',fill:'#f59e0b',lineHeight:32,strokeWidth:8}],104,24,12);
   addLinesEntry('__program_live',[{text:'● 행사중',font:'700 24px Arial, sans-serif',fill:'#ef3340',lineHeight:32,strokeWidth:8}],100,24,12);
   return {canvas,entries};
 }
 function createThreeLabelLayer(THREE){
   return {
     id:'booth-top-labels-three',type:'custom',renderingMode:'3d',
     onAdd(mapInstance,gl){
       this.map=mapInstance;this.THREE=THREE;this.camera=new THREE.Camera();this.scene=new THREE.Scene();
       this.renderer=new THREE.WebGLRenderer({canvas:mapInstance.getCanvas(),context:gl,antialias:true,alpha:true});
       this.renderer.autoClear=false;
       this.texture=new THREE.CanvasTexture(document.createElement('canvas'));
       this.material=new THREE.RawShaderMaterial({
         transparent:true,depthTest:false,depthWrite:false,side:THREE.DoubleSide,
         uniforms:{u_matrix:{value:new THREE.Matrix4()},u_viewport:{value:new THREE.Vector2(1,1)},u_texture:{value:this.texture},u_pixelScale:{value:1},u_time:{value:0}},
         vertexShader:
           'precision highp float;uniform mat4 u_matrix;uniform vec2 u_viewport;uniform float u_pixelScale;uniform float u_time;attribute vec3 position;attribute vec2 a_offset;attribute vec2 uv;attribute vec4 a_effect;varying vec2 v_uv;varying float v_glow;void main(){vec4 clip=u_matrix*vec4(position,1.0);float animated=a_effect.y!=0.0?1.0:0.0;float pulse=animated>0.0?sin(u_time*3.2+a_effect.z)*a_effect.y:0.0;float scale=max(0.05,a_effect.x+pulse);float bob=animated>0.0?sin(u_time*2.0+a_effect.z)*6.0:0.0;vec2 localOffset=vec2(a_offset.x*scale,(a_offset.y+bob)*scale);vec2 ndc=(localOffset*u_pixelScale/u_viewport)*2.0;clip.xy+=ndc*clip.w;gl_Position=clip;v_uv=uv;v_glow=a_effect.w>0.0?max(0.0,sin(u_time*4.8+a_effect.z))*a_effect.w:0.0;}',
         fragmentShader:
           'precision highp float;uniform sampler2D u_texture;varying vec2 v_uv;varying float v_glow;void main(){vec4 c=texture2D(u_texture,v_uv);if(c.a<0.02)discard;c.rgb=mix(c.rgb,vec3(1.0),min(0.34,v_glow));c.rgb*=1.0+v_glow*0.22;gl_FragColor=c;}'
       });
       this.geometry=new THREE.BufferGeometry();this.mesh=new THREE.Mesh(this.geometry,this.material);this.mesh.frustumCulled=false;this.mesh.renderOrder=2;this.scene.add(this.mesh);
       this.outlineMaterial=new THREE.RawShaderMaterial({
         transparent:true,depthTest:false,depthWrite:false,
         uniforms:{u_matrix:{value:new THREE.Matrix4()},u_color:{value:new THREE.Vector4(.18,.22,.27,.72)}},
         vertexShader:'precision highp float;uniform mat4 u_matrix;attribute vec3 position;void main(){gl_Position=u_matrix*vec4(position,1.0);}',
         fragmentShader:'precision highp float;uniform vec4 u_color;void main(){gl_FragColor=u_color;}'
       });
       this.outlineGeometry=new THREE.BufferGeometry();this.outlineLines=new THREE.LineSegments(this.outlineGeometry,this.outlineMaterial);this.outlineLines.frustumCulled=false;this.outlineLines.renderOrder=1;this.scene.add(this.outlineLines);
       this.verticalMaterial=new THREE.RawShaderMaterial({
         transparent:true,depthTest:true,depthWrite:false,
         uniforms:{u_matrix:{value:new THREE.Matrix4()},u_color:{value:new THREE.Vector4(.18,.22,.27,.58)}},
         vertexShader:'precision highp float;uniform mat4 u_matrix;attribute vec3 position;void main(){gl_Position=u_matrix*vec4(position,1.0);}',
         fragmentShader:'precision highp float;uniform vec4 u_color;void main(){gl_FragColor=u_color;}'
       });
       this.verticalGeometry=new THREE.BufferGeometry();this.verticalLines=new THREE.LineSegments(this.verticalGeometry,this.verticalMaterial);this.verticalLines.frustumCulled=false;this.verticalLines.renderOrder=1;this.scene.add(this.verticalLines);
       loadSpecialBadgeAssets().then(()=>this.rebuild());
       this.rebuild();
     },
     rebuild(){
       if(!this.THREE||!this.geometry)return;
       const THREE=this.THREE,atlas=makeThreeLabelAtlas();
       if(this.texture)this.texture.dispose();
       this.texture=new THREE.CanvasTexture(atlas.canvas);this.texture.flipY=true;this.texture.colorSpace=THREE.SRGBColorSpace;this.texture.minFilter=THREE.LinearFilter;this.texture.magFilter=THREE.LinearFilter;this.texture.needsUpdate=true;
       this.material.uniforms.u_texture.value=this.texture;
       refreshBoothTopFeatureIndex();
       const positions=[],offsets=[],uvs=[],effects=[],outlinePositions=[],verticalPositions=[];
       this.hasAnimatedBadges=false;
       const addQuad=(coord,height,entry,screenY=0,effect=null)=>{
         const mc=maplibregl.MercatorCoordinate.fromLngLat({lng:Number(coord[0]),lat:Number(coord[1])},height);
         const hw=entry.w/2,hh=entry.h/2;
         const fx=effect||{scale:1,pulse:0,phase:0,glow:0};
         const q=[[-hw,-hh+screenY,entry.u0,entry.v0],[hw,-hh+screenY,entry.u1,entry.v0],[hw,hh+screenY,entry.u1,entry.v1],[-hw,-hh+screenY,entry.u0,entry.v0],[hw,hh+screenY,entry.u1,entry.v1],[-hw,hh+screenY,entry.u0,entry.v1]];
         for(const v of q){positions.push(mc.x,mc.y,mc.z);offsets.push(v[0],v[1]);uvs.push(v[2],v[3]);effects.push(fx.scale||1,fx.pulse||0,fx.phase||0,fx.glow||0);}
       };
       const badgeEffectFor=(kind,seed=0)=>({scale:1,pulse:kind==='event'?0.14:(kind==='premium'?0.11:0.12),phase:seed,glow:kind==='awards'?1.6:(kind==='event'?1.48:1.55)});
       const displayOptions=getDisplayOptions();
       const runtimeSpecialBooths=getSpecialBooths();
       const programBadges=activeProgramBadgeMap();
       for(const item of boothCatalog){
         const booth=String(item.booth||''),entry=atlas.entries.get('__label_'+booth),feature=boothTopFeatureByBooth.get(booth);if(!feature||!item.coord)continue;
         const top=boothFeatureHeight(feature);
         if(entry)addQuad(item.coord,top+2.4,entry,0);
         const kind=displayOptions.showSpecialBooths!==false?runtimeSpecialBooths[booth]:'';
         // 특별부스 배지는 PC·모바일 공통 DOM 마커에서 렌더링합니다.
         const hasSpecialBadge=!!kind;
         const programState=programBadges.get(booth);
         const programBadge=programState?atlas.entries.get(programState.status==='live'?'__program_live':'__program_soon'):null;
         const programOffset=hasSpecialBadge?(entry?150:122):(entry?28:0);
         if(programBadge)addQuad(item.coord,top+4.5,programBadge,programOffset);
       }
       for(const feature of data.booths?.features||[]){
         const top=boothFeatureHeight(feature)+0.55,geometry=feature.geometry;if(!geometry)continue;
         const polygons=geometry.type==='Polygon'?[geometry.coordinates]:(geometry.type==='MultiPolygon'?geometry.coordinates:[]);
         for(const polygon of polygons){
           const ring=polygon?.[0];if(!ring||ring.length<2)continue;
           for(let i=1;i<ring.length;i++){
             const prev=ring[i-1],curr=ring[i];
             const a=maplibregl.MercatorCoordinate.fromLngLat({lng:Number(prev[0]),lat:Number(prev[1])},top),b=maplibregl.MercatorCoordinate.fromLngLat({lng:Number(curr[0]),lat:Number(curr[1])},top);
             outlinePositions.push(a.x,a.y,a.z,b.x,b.y,b.z);
             const bottom=maplibregl.MercatorCoordinate.fromLngLat({lng:Number(prev[0]),lat:Number(prev[1])},0);
             verticalPositions.push(bottom.x,bottom.y,bottom.z,a.x,a.y,a.z);
           }
         }
       }
       this.geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
       this.geometry.setAttribute('a_offset',new THREE.Float32BufferAttribute(offsets,2));
       this.geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
       this.geometry.setAttribute('a_effect',new THREE.Float32BufferAttribute(effects,4));
       this.geometry.setDrawRange(0,positions.length/3);this.geometry.computeBoundingSphere();
       this.outlineGeometry.setAttribute('position',new THREE.Float32BufferAttribute(outlinePositions,3));this.outlineGeometry.setDrawRange(0,outlinePositions.length/3);this.outlineGeometry.computeBoundingSphere();
       this.verticalGeometry.setAttribute('position',new THREE.Float32BufferAttribute(verticalPositions,3));this.verticalGeometry.setDrawRange(0,verticalPositions.length/3);this.verticalGeometry.computeBoundingSphere();
       this.map?.triggerRepaint();
     },
     render(gl,args){
       const matrix=args?.defaultProjectionData?.mainMatrix||args;if(!matrix||matrix.length!==16)return;
       this.camera.projectionMatrix.fromArray(matrix);this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
       this.camera.matrixWorld.identity();this.camera.matrixWorldInverse.identity();
       this.material.uniforms.u_matrix.value.fromArray(matrix);this.outlineMaterial.uniforms.u_matrix.value.fromArray(matrix);this.verticalMaterial.uniforms.u_matrix.value.fromArray(matrix);
       const canvas=this.map.getCanvas();this.material.uniforms.u_viewport.value.set(canvas.width,canvas.height);
       const zoomScale=threeLabelScaleForZoom(this.map.getZoom());
       this.material.uniforms.u_pixelScale.value=(window.devicePixelRatio||1)*zoomScale;
       this.material.uniforms.u_time.value=performance.now()*.001;
       this.renderer.resetState();this.renderer.render(this.scene,this.camera);
       if(this.hasAnimatedBadges)this.map?.triggerRepaint();
       if(!this.firstRendered){this.firstRendered=true;if(this.map.getLayer('booth-labels'))this.map.setLayoutProperty('booth-labels','visibility','none');setStatus('');}
     },
     onRemove(){
       this.geometry?.dispose();this.material?.dispose();this.texture?.dispose();this.outlineGeometry?.dispose();this.outlineMaterial?.dispose();this.verticalGeometry?.dispose();this.verticalMaterial?.dispose();this.renderer?.dispose();
     }
   };
 }
 function rebuildThreeLabels(){if(boothThreeLayer?.rebuild)boothThreeLayer.rebuild();}
 function initThreeLabels(){
   loadThreeModule().then(THREE=>{
     if(boothThreeLayer||map.getLayer('booth-top-labels-three'))return;
     boothThreeLayer=createThreeLabelLayer(THREE);map.addLayer(boothThreeLayer);
   }).catch(error=>{console.error(error);setStatus('Three.js 모듈을 불러오지 못해 기본 부스번호를 유지합니다.');});
 }
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
 function boothLabelLines(item){
   const opts=getDisplayOptions();
   const lines=[];
   if(opts.showBoothNumber!==false&&item.booth)lines.push({text:String(item.booth),font:'700 32px Arial, sans-serif',fill:'#15243b',lineHeight:39,strokeWidth:9});
   if(opts.showCompanyName&&item.name)lines.push({text:String(item.name),font:opts.showBoothNumber!==false?'600 23px Arial, sans-serif':'700 27px Arial, sans-serif',fill:'#1f3a5b',lineHeight:opts.showBoothNumber!==false?28:34,strokeWidth:7});
   return lines;
 }
 function boothLabelText(item){return boothLabelLines(item).map(line=>line.text).join('\n')}
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
   const labelPositions=getLabelPositions();
   boothCatalog=[...grouped.entries()].map(([booth,entry])=>{
     const old=oldByBooth.get(booth)||{},props=entry.feature.properties||{};
     const manual=labelPositions[booth];
     const coord=validLngLatCoord(manual)?[Number(manual[0]),Number(manual[1])]:entry.coord;
     return {...old,...props,booth,name:props.name??old.name??'',category:props.category??old.category??'',coord};
   }).sort((a,b)=>a.booth.localeCompare(b.booth,undefined,{numeric:true}));
 }
 function ensureSpecialMarkerStyles(){
   if(document.getElementById('finder-special-marker-styles'))return;
   const style=document.createElement('style');
   style.id='finder-special-marker-styles';
   style.textContent=`
     .finder-special-marker{width:68px;height:68px;pointer-events:none;perspective:520px;overflow:visible;z-index:8}
     .finder-special-marker .badge-motion{width:68px;height:68px;display:flex;align-items:center;justify-content:center;transform-origin:50% 50%;will-change:transform;transform-style:preserve-3d}
     .finder-special-marker .badge-circle{--ring:#6e51ff;width:58px;height:58px;border-radius:50%;background:linear-gradient(180deg,#fff 0%,#faf8ff 100%);border:4px solid var(--ring);box-shadow:0 0 0 2px #fff,0 4px 12px #0004,0 0 14px color-mix(in srgb,var(--ring) 48%,transparent);display:flex;align-items:center;justify-content:center;overflow:hidden;backface-visibility:visible;transform-style:preserve-3d}
     .finder-special-marker .badge-circle img{display:block;width:72%;height:72%;object-fit:contain;user-select:none;-webkit-user-drag:none}
     .finder-special-marker .badge-fallback{font-size:31px;line-height:1;font-weight:900;color:var(--ring)}
     .finder-special-marker.premium .badge-circle{--ring:#6e51ff}
     .finder-special-marker.awards .badge-circle{--ring:#f1a719;background:linear-gradient(180deg,#fff 0%,#fff8e8 100%)}
     .finder-special-marker.event .badge-circle{--ring:#ff8d20;background:linear-gradient(180deg,#fff 0%,#fff7ec 100%)}
     .finder-special-marker.premium .badge-motion{animation:finderPremiumTurn 2.25s linear infinite}
     .finder-special-marker.awards .badge-motion{animation:finderAwardsFloat 1.7s ease-in-out infinite}
     .finder-special-marker.event .badge-motion{animation:finderEventPulse 1.1s ease-in-out infinite alternate}
     @keyframes finderPremiumTurn{0%{transform:rotateY(0deg)}100%{transform:rotateY(360deg)}}
     @keyframes finderAwardsFloat{0%,100%{transform:translateY(0) rotate(0deg)}50%{transform:translateY(-8px) rotate(-4deg)}}
     @keyframes finderEventPulse{0%{transform:scale(.94)}100%{transform:scale(1.11)}}
     @media (prefers-reduced-motion:reduce){.finder-special-marker .badge-motion{animation-duration:4s!important}}
   `;
   document.head.appendChild(style);
 }
 function specialBadgeAssetUrl(kind){
   const file=kind==='premium'?'premium-booth-badge.png':kind==='awards'?'awards-booth-badge.png':'event-booth-badge.png';
   return new URL('../assets/images/'+file+'?v=20260727-dom-marker2',FINDER_APP_SCRIPT_URL).href;
 }
 function rebuildSpecialMarkers(){
   ensureSpecialMarkerStyles();
   while(specialMarkers.length){const marker=specialMarkers.pop();marker?.remove?.();}
   if(getDisplayOptions().showSpecialBooths===false)return;
   const runtimeSpecialBooths=getSpecialBooths();
   for(const item of boothCatalog){
     const kind=String(runtimeSpecialBooths[item.booth]||'').trim();
     if(!['premium','awards','event'].includes(kind)||!validLngLatCoord(item.coord))continue;
     const root=document.createElement('div');
     root.className='finder-special-marker '+kind;
     root.setAttribute('aria-hidden','true');
     const motion=document.createElement('div');motion.className='badge-motion';
     const circle=document.createElement('div');circle.className='badge-circle';
     const image=document.createElement('img');
     image.alt='';image.decoding='async';image.draggable=false;image.src=specialBadgeAssetUrl(kind);
     image.onerror=()=>{
       image.remove();
       const fallback=document.createElement('span');fallback.className='badge-fallback';
       fallback.textContent=kind==='premium'?'◇':kind==='awards'?'♛':'●';
       circle.appendChild(fallback);
     };
     circle.appendChild(image);motion.appendChild(circle);root.appendChild(motion);
     const marker=new maplibregl.Marker({element:root,anchor:'bottom',offset:[0,-34],pitchAlignment:'viewport',rotationAlignment:'viewport'})
       .setLngLat(item.coord)
       .addTo(map);
     specialMarkers.push(marker);
   }
 }
 function boothLabelGeoJSON(){return {type:'FeatureCollection',features:boothCatalog.filter(item=>validLngLatCoord(item.coord)).map((item,index)=>({type:'Feature',id:index,properties:{booth:item.booth,name:item.name||'',text:boothLabelText(item)},geometry:{type:'Point',coordinates:item.coord}}))};}
 function updateBoothLabelLayer(){
   const source=map.getSource('booth-label-points');
   if(source)source.setData(boothLabelGeoJSON());
   const hasText=boothCatalog.some(item=>boothLabelText(item));
   const threeActive=!!boothThreeLayer?.firstRendered;
   if(map.getLayer('booth-labels'))map.setLayoutProperty('booth-labels','visibility',hasText&&!threeActive?'visible':'none');
 }

 const BOOTH_DISPLAY_SCALE=1;
 function scaleRingTowardCenter(ring,scale=BOOTH_DISPLAY_SCALE){
   if(!Array.isArray(ring)||ring.length<4)return ring;
   const points=ring.slice(0,-1);
   if(!points.length)return ring;
   const center=points.reduce((acc,c)=>[acc[0]+Number(c[0]),acc[1]+Number(c[1])],[0,0]).map(v=>v/points.length);
   const scaled=points.map(c=>[
     center[0]+(Number(c[0])-center[0])*scale,
     center[1]+(Number(c[1])-center[1])*scale
   ]);
   scaled.push([...scaled[0]]);
   return scaled;
 }
 function scalePolygonCoordinates(coords){
   if(!Array.isArray(coords)||!coords.length)return coords;
   return coords.map((ring,index)=>index===0?scaleRingTowardCenter(ring):ring);
 }
 function boothDisplayGeoJSON(){
   return {
     type:'FeatureCollection',
     features:(data.booths?.features||[]).map((feature,index)=>{
       const geometry=feature.geometry||{};
       let coordinates=geometry.coordinates;
       if(geometry.type==='Polygon')coordinates=scalePolygonCoordinates(coordinates);
       else if(geometry.type==='MultiPolygon')coordinates=(coordinates||[]).map(scalePolygonCoordinates);
       return {
         ...feature,
         id:feature.id??feature.properties?._editId??index,
         properties:{
           ...(feature.properties||{}),
           selected:String(feature.properties?.booth||'')===selectedBoothKey,
           selectedColor:darkenBoothColor(feature.properties?.color,.30)
         },
         geometry:{...geometry,coordinates}
       };
     })
   };
 }
 function allBounds(){const b=new maplibregl.LngLatBounds();(data.booths?.features||[]).forEach(f=>eachGeometryCoord(f.geometry,c=>b.extend(c)));return b;}
 function fit(){if(!bounds)bounds=allBounds();map.fitBounds(bounds,{padding:{top:70,bottom:70,left:70,right:70},pitch:35,bearing:-15,duration:650});}
 function escapeHtml(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
 function currentLocationFeatures(){
   const runtime=window.FINDER_PROJECT_CURRENT?.locations;
   const collection=runtime&&runtime.type==='FeatureCollection'&&Array.isArray(runtime.features)?runtime:data.locations;
   return (collection?.features||[]).filter(feature=>feature?.geometry?.type==='Point'&&routeCoordValid(feature.geometry.coordinates));
 }
 function locationGeoJSON(){
   return {type:'FeatureCollection',features:currentLocationFeatures().map((feature,index)=>({
     type:'Feature',id:index,
     properties:{...(feature.properties||{}),index},
     geometry:{type:'Point',coordinates:[Number(feature.geometry.coordinates[0]),Number(feature.geometry.coordinates[1])]}
   }))};
 }
 function locationCoord(index){
   const feature=currentLocationFeatures()[Number(index)];
   return feature&&routeCoordValid(feature.geometry?.coordinates)?[Number(feature.geometry.coordinates[0]),Number(feature.geometry.coordinates[1])]:null;
 }
 function rebuildLocationControls(){
   const locations=currentLocationFeatures();
   const startSelect=document.getElementById('startSelect');
   if(startSelect){
     const previous=startSelect.value;
     startSelect.innerHTML=locations.map((feature,index)=>`<option value="${index}">${escapeHtml(feature.properties?.name||feature.properties?.code||('위치 '+(index+1)))}</option>`).join('');
     startSelect.disabled=!locations.length;
     if(locations.length)startSelect.value=locations[Number(previous)]?previous:'0';
   }
   const routeGo=document.getElementById('routeGo');
   if(routeGo)routeGo.disabled=!locations.length;
   return locations;
 }
 function routeCoordValid(coord){return Array.isArray(coord)&&coord.length>=2&&Number.isFinite(Number(coord[0]))&&Number.isFinite(Number(coord[1]))}
 function routeGraphSnapshot(){
   const vertices=(routeGraph?.vertices||[]).filter(v=>routeCoordValid(v?.coord)).map(v=>({id:String(v.id),coord:[Number(v.coord[0]),Number(v.coord[1])]}));
   const byId=new Map(vertices.map(v=>[v.id,v]));
   const segments=(routeGraph?.segments||[]).filter(s=>!s?.closed&&byId.has(String(s.source))&&byId.has(String(s.target))&&String(s.source)!==String(s.target)).map((s,index)=>({id:String(s.id??index),source:String(s.source),target:String(s.target),index}));
   return {vertices,byId,segments};
 }
 function nearestOpenRoutePoint(coord,snapshot){
   if(!routeCoordValid(coord))return null;
   const point=[Number(coord[0]),Number(coord[1])];let best=null,bestDist=Infinity;
   for(const segment of snapshot.segments){
     const a=snapshot.byId.get(segment.source)?.coord,b=snapshot.byId.get(segment.target)?.coord;if(!a||!b)continue;
     const abx=b[0]-a[0],aby=b[1]-a[1],len2=abx*abx+aby*aby;if(len2<=0)continue;
     let t=((point[0]-a[0])*abx+(point[1]-a[1])*aby)/len2;t=Math.max(0,Math.min(1,t));
     const snapped=[a[0]+abx*t,a[1]+aby*t],dx=snapped[0]-point[0],dy=snapped[1]-point[1],dist=dx*dx+dy*dy;
     if(dist<bestDist){bestDist=dist;best={coord:snapped,t,segment,a,b};}
   }
   return best;
 }
 function shortestRouteBetweenCoords(startCoord,endCoord){
   const snapshot=routeGraphSnapshot();if(!snapshot.vertices.length||!snapshot.segments.length)return null;
   const startSnap=nearestOpenRoutePoint(startCoord,snapshot),endSnap=nearestOpenRoutePoint(endCoord,snapshot);if(!startSnap||!endSnap)return null;
   const START='__route_start__',END='__route_end__';
   const adj=new Map(snapshot.vertices.map(v=>[v.id,[]]));adj.set(START,[]);adj.set(END,[]);
   const coordsById=new Map(snapshot.vertices.map(v=>[v.id,v.coord]));coordsById.set(START,startSnap.coord);coordsById.set(END,endSnap.coord);
   const addEdge=(a,b,w)=>{if(!adj.has(a)||!adj.has(b)||!Number.isFinite(w))return;adj.get(a).push([b,w]);adj.get(b).push([a,w]);};
   for(const segment of snapshot.segments){const a=snapshot.byId.get(segment.source).coord,b=snapshot.byId.get(segment.target).coord;addEdge(segment.source,segment.target,Math.hypot(a[0]-b[0],a[1]-b[1]));}
   addEdge(START,startSnap.segment.source,Math.hypot(startSnap.coord[0]-startSnap.a[0],startSnap.coord[1]-startSnap.a[1]));
   addEdge(START,startSnap.segment.target,Math.hypot(startSnap.coord[0]-startSnap.b[0],startSnap.coord[1]-startSnap.b[1]));
   addEdge(END,endSnap.segment.source,Math.hypot(endSnap.coord[0]-endSnap.a[0],endSnap.coord[1]-endSnap.a[1]));
   addEdge(END,endSnap.segment.target,Math.hypot(endSnap.coord[0]-endSnap.b[0],endSnap.coord[1]-endSnap.b[1]));
   if(startSnap.segment.index===endSnap.segment.index)addEdge(START,END,Math.hypot(startSnap.coord[0]-endSnap.coord[0],startSnap.coord[1]-endSnap.coord[1]));
   const dist=new Map([[START,0]]),prev=new Map(),open=new Set([START]);
   while(open.size){let current=null,currentDist=Infinity;for(const id of open){const value=dist.get(id)??Infinity;if(value<currentDist){current=id;currentDist=value;}}if(current===null)break;open.delete(current);if(current===END)break;
     for(const [next,weight] of adj.get(current)||[]){const candidate=currentDist+weight;if(candidate<(dist.get(next)??Infinity)){dist.set(next,candidate);prev.set(next,current);open.add(next);}}
   }
   if(!dist.has(END))return null;
   const ids=[];let current=END;while(current!=null){ids.push(current);if(current===START)break;current=prev.get(current);}if(ids[ids.length-1]!==START)return null;ids.reverse();
   const coords=ids.map(id=>coordsById.get(id)).filter(routeCoordValid).filter((coord,index,array)=>index===0||Math.hypot(coord[0]-array[index-1][0],coord[1]-array[index-1][1])>1e-12);
   return {coords,distance:dist.get(END),startSnap:startSnap.coord,endSnap:endSnap.coord};
 }
 function clearRoute(){activeRoute=null;activeRouteCoords=[];if(routeAnimationFrame){cancelAnimationFrame(routeAnimationFrame);routeAnimationFrame=0;}if(map.getSource('active-route'))map.getSource('active-route').setData({type:'FeatureCollection',features:[]});if(map.getSource('route-particles'))map.getSource('route-particles').setData({type:'FeatureCollection',features:[]});if(startMarker){startMarker.remove();startMarker=null;}if(endMarker){endMarker.remove();endMarker=null;}document.getElementById('routeInfo').textContent='시작 위치와 목적지 부스를 선택하세요.';}
 function routeTo(startCoord,dest){
   const destination=dest&&routeCoordValid(dest.coord)?[Number(dest.coord[0]),Number(dest.coord[1])]:null;
   const start=routeCoordValid(startCoord)?[Number(startCoord[0]),Number(startCoord[1])]:null;
   if(!start||!destination){setStatus('길찾기 위치 좌표를 확인할 수 없습니다.');return;}
   const found=shortestRouteBetweenCoords(start,destination);if(!found){setStatus('연결 가능한 경로를 찾지 못했습니다.');document.getElementById('routeInfo').textContent='경로 데이터 또는 폐쇄 경로를 확인해 주세요.';return;}
   const coords=[start,...found.coords,destination].filter(routeCoordValid).filter((coord,index,array)=>index===0||Math.hypot(coord[0]-array[index-1][0],coord[1]-array[index-1][1])>1e-12);
   const activeSource=map.getSource('active-route');if(!activeSource){setStatus('길찾기 표시 레이어가 아직 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.');return;}
   activeRouteCoords=coords;activeRoute={type:'FeatureCollection',features:[{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:coords}}]};activeSource.setData(activeRoute);startRouteAnimation();clearRouteMarkersOnly();
   const se=document.createElement('div');se.className='route-dot start';startMarker=new maplibregl.Marker({element:se,anchor:'center'}).setLngLat(start).addTo(map);
   const ee=document.createElement('div');ee.className='route-dot end';endMarker=new maplibregl.Marker({element:ee,anchor:'center'}).setLngLat(destination).addTo(map);
   const rb=new maplibregl.LngLatBounds();coords.forEach(c=>rb.extend(c));map.fitBounds(rb,{padding:{top:140,bottom:100,left:70,right:70},pitch:48,bearing:map.getBearing(),duration:700});
   document.getElementById('routeInfo').textContent=`${dest.booth||'목적지'}까지 경로 표시 · 경로점 ${found.coords.length}개`;setStatus('');
 }
 function clearRouteMarkersOnly(){if(startMarker){startMarker.remove();startMarker=null;}if(endMarker){endMarker.remove();endMarker=null;}}
 function pointAlongRoute(coords,t){if(!coords||coords.length<2)return coords?.[0]||[0,0];const lengths=[];let total=0;for(let i=1;i<coords.length;i++){const dx=coords[i][0]-coords[i-1][0],dy=coords[i][1]-coords[i-1][1];const len=Math.hypot(dx,dy);lengths.push(len);total+=len;}if(total<=0)return coords[0];let target=((t%1)+1)%1*total;for(let i=0;i<lengths.length;i++){const len=lengths[i];if(target<=len||i===lengths.length-1){const r=len?target/len:0;return [coords[i][0]+(coords[i+1][0]-coords[i][0])*r,coords[i][1]+(coords[i+1][1]-coords[i][1])*r];}target-=len;}return coords[coords.length-1];}
 function startRouteAnimation(){if(routeAnimationFrame)cancelAnimationFrame(routeAnimationFrame);routeAnimationStarted=performance.now();const animate=now=>{if(!activeRoute||!activeRouteCoords.length||!map.getSource('route-particles')){routeAnimationFrame=0;return;}const phase=((now-routeAnimationStarted)/4200)%1;const features=[];const particleCount=5;for(let i=0;i<particleCount;i++){const progress=(phase+i/particleCount)%1;features.push({type:'Feature',properties:{index:i,opacity:1-i*0.1},geometry:{type:'Point',coordinates:pointAlongRoute(activeRouteCoords,progress)}});}map.getSource('route-particles').setData({type:'FeatureCollection',features});routeAnimationFrame=requestAnimationFrame(animate);};routeAnimationFrame=requestAnimationFrame(animate);}

 function setStatus(text){status.textContent=text;}
 function refreshSelectedBoothColor(){const source=map.getSource('booths');if(source)source.setData(boothDisplayGeoJSON());}
 function clearSelected(){selectedId=null;selectedBoothKey='';selectedLabel=null;activeProgramPlace=null;panel.classList.remove('open');document.getElementById('stagePanel')?.classList.remove('open');refreshSelectedBoothColor();rebuildThreeLabels();}
 function openSelection(item,id,coord){const place=programPlaceForBooth(item.booth);if(place){openProgramPlace(place,item,id,item.coord||coord);return}clearSelected();selectedId=id;selectedBoothKey=String(item.booth||'');selectedLabel=coord?{...item,coord}:item;refreshSelectedBoothColor();document.getElementById('panelBooth').textContent=item.booth||'-';document.getElementById('panelCompany').textContent=item.name||'기업명 없음';document.getElementById('panelCategory').textContent=item.category||'품목 미등록';updateBoothDetail(item);document.getElementById('stagePanel')?.classList.remove('open');panel.classList.add('open');setStatus(`선택: ${item.booth||''} ${item.name||''}`);rebuildThreeLabels();}
 function findFeatureId(booth){const index=(data.booths?.features||[]).findIndex(feature=>String(feature.properties?.booth||'')===String(booth||''));if(index<0)return null;const feature=data.booths.features[index];return feature.id??feature.properties?._editId??index;}
 function selectLabel(item,fly=true){const id=findFeatureId(item.booth);openSelection(item,id,item.coord);if(fly)map.easeTo({center:item.coord,zoom:15.55,pitch:48,bearing:map.getBearing(),duration:650});}
 function updateLabelDetail(){if(map.getLayer('booth-labels'))map.setLayoutProperty('booth-labels','text-size',map.getZoom()>=15.4?12:10);}
 map.on('load',()=>{
   rebuildBoothCatalog();
   rebuildSpecialMarkers();
   map.addSource('booths',{type:'geojson',data:boothDisplayGeoJSON()});
   const boothSelected=['boolean',['get','selected'],false];
   const boothHeight=['coalesce',['get','height'],80];
   map.addLayer({id:'booth-extrusion',type:'fill-extrusion',source:'booths',paint:{
     'fill-extrusion-color':['case',boothSelected,['coalesce',['get','selectedColor'],['get','color']],['get','color']],
     'fill-extrusion-color-transition':{duration:180,delay:0},
     'fill-extrusion-height':boothHeight,
     'fill-extrusion-base':0,
     'fill-extrusion-opacity':.96,
     'fill-extrusion-vertical-gradient':true
   }});
   map.addLayer({id:'booth-outline',type:'line',source:'booths',layout:{visibility:'none'},paint:{
     'line-color':['case',boothSelected,'#bd3800','#59636f'],
     'line-width':['case',boothSelected,3,1.1],
     'line-opacity':.9
   }});
   map.addSource('booth-label-points',{type:'geojson',data:boothLabelGeoJSON()});
   map.addLayer({id:'booth-labels',type:'symbol',source:'booth-label-points',layout:{'text-field':['coalesce',['get','text'],''],'text-size':10,'text-font':['Open Sans Bold'],'text-anchor':'center','text-allow-overlap':false,'text-ignore-placement':false,'symbol-sort-key':0},paint:{'text-color':'#15243b','text-halo-color':'#ffffff','text-halo-width':1.25}});
   updateBoothLabelLayer();
   initThreeLabels();
   map.addSource('routes',{type:'geojson',data:routeGeoFromGraph()});
   map.addLayer({id:'routes-glow',type:'line',source:'routes',layout:{'line-cap':'round','line-join':'round','visibility':'none'},paint:{'line-color':'#fff','line-width':6,'line-opacity':.9}});
   map.addLayer({id:'routes',type:'line',source:'routes',layout:{'line-cap':'round','line-join':'round','visibility':'none'},paint:{'line-color':'#2684ff','line-width':2.7,'line-opacity':.92}});
   map.addSource('active-route',{type:'geojson',lineMetrics:true,data:{type:'FeatureCollection',features:[]}});
   map.addSource('route-particles',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
   map.addLayer({id:'active-route-glow',type:'line',source:'active-route',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#ffffff','line-width':10,'line-opacity':.96}});
   map.addLayer({id:'active-route',type:'line',source:'active-route',layout:{'line-cap':'round','line-join':'round'},paint:{'line-gradient':['interpolate',['linear'],['line-progress'],0,'#20c7ff',0.5,'#1769ff',1,'#6b4cff'],'line-width':5,'line-opacity':1}});
   map.addLayer({id:'route-particle-glow',type:'circle',source:'route-particles',paint:{'circle-radius':9,'circle-color':'#45d6ff','circle-blur':0.75,'circle-opacity':0.55}});
   map.addLayer({id:'route-particles',type:'circle',source:'route-particles',paint:{'circle-radius':4.2,'circle-color':'#ffffff','circle-stroke-width':2.2,'circle-stroke-color':'#1769ff','circle-opacity':['coalesce',['get','opacity'],1]}});
   // 이번 시험에서는 부스번호만 Three.js CustomLayer로 렌더링
   map.addSource('locations',{type:'geojson',data:locationGeoJSON()});
   map.addLayer({id:'locations-ring',type:'circle',source:'locations',layout:{visibility:'none'},paint:{
     'circle-radius':8,
     'circle-color':'#ffffff',
     'circle-stroke-width':3,
     'circle-stroke-color':'#ef2d2d',
     'circle-pitch-alignment':'viewport',
     'circle-pitch-scale':'viewport'
   }});
   map.addLayer({id:'locations-core',type:'circle',source:'locations',layout:{visibility:'none'},paint:{
     'circle-radius':3.5,
     'circle-color':'#ef2d2d',
     'circle-pitch-alignment':'viewport',
     'circle-pitch-scale':'viewport'
   }});
   map.addLayer({id:'locations-label',type:'symbol',source:'locations',layout:{
     'visibility':'none',
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
   const locations=rebuildLocationControls();const destSelect=document.getElementById('destSelect');destSelect.innerHTML='<option value="">목적지 부스</option>'+boothCatalog.map((l,i)=>`<option value="${i}">${escapeHtml(l.booth)} · ${escapeHtml(l.name||'')}</option>`).join('');fit();updateLabelDetail();setStatus('');
 });
 map.on('zoom',updateLabelDetail);
 map.on('click','booth-extrusion',e=>{const f=e.features&&e.features[0];if(!f)return;const item=boothCatalog.find(x=>x.booth===f.properties.booth)||{booth:f.properties.booth,name:f.properties.name,category:f.properties.category,coord:[e.lngLat.lng,e.lngLat.lat]};openSelection(item,f.id,[e.lngLat.lng,e.lngLat.lat]);});
 map.on('click',e=>{if(!map.queryRenderedFeatures(e.point,{layers:['booth-extrusion']}).length)results.classList.remove('open');});
 map.on('mouseenter','booth-extrusion',()=>map.getCanvas().style.cursor='pointer'); map.on('mouseleave','booth-extrusion',()=>map.getCanvas().style.cursor='');
 function matching(q){q=q.trim().toLowerCase();if(!q)return[];return boothCatalog.filter(x=>(`${x.booth} ${x.name} ${x.category}`).toLowerCase().includes(q)).slice(0,30);}
 function renderResults(){const items=matching(input.value);if(!input.value.trim()||!items.length){results.classList.remove('open');results.innerHTML='';return;}results.innerHTML=items.map((x,i)=>`<div class="result" data-i="${i}"><b>${escapeHtml(x.booth)} · ${escapeHtml(x.name||'')}</b><span>${escapeHtml(x.category||'품목 미등록')}</span></div>`).join('');results.classList.add('open');results.querySelectorAll('.result').forEach((el,i)=>el.onclick=()=>{selectLabel(items[i]);results.classList.remove('open');input.value=`${items[i].booth} ${items[i].name||''}`.trim();if(isMobileLayout())setMobileMode('map');});}
 function search(){const found=matching(input.value)[0];if(!found){setStatus('검색 결과가 없습니다.');results.classList.remove('open');return;}selectLabel(found);results.classList.remove('open');if(isMobileLayout())setMobileMode('map');}
 input.addEventListener('input',renderResults);input.addEventListener('focus',renderResults);input.addEventListener('keydown',e=>{if(e.key==='Enter')search();if(e.key==='Escape')results.classList.remove('open');});document.getElementById('searchBtn').onclick=search;
 document.addEventListener('pointerdown',e=>{if(!e.target.closest('.search-box'))results.classList.remove('open');});
 const mobileMedia=window.matchMedia('(max-width:760px)');
 let mobileMode='map';
 function isMobileLayout(){return mobileMedia.matches;}
 function setMobileMode(mode,{focusSearch=false,closeModal=true}={}){
   const allowed=new Set(['map','search','route','expo']);
   mobileMode=allowed.has(mode)?mode:'map';
   if(!isMobileLayout())return;
   document.body.dataset.mobileMode=mobileMode;
   const navMode=mobileMode==='route'?'map':mobileMode;
   document.querySelectorAll('.bottom-nav [data-mobile-action]').forEach(button=>{
     const active=button.dataset.mobileAction===navMode;
     button.classList.toggle('active',active);
     button.setAttribute('aria-pressed',active?'true':'false');
   });
   if(mobileMode!=='search'){
     results.classList.remove('open');
     input.blur();
   }
   if(closeModal&&mobileMode!=='expo')document.getElementById('expoModal')?.classList.remove('open');
   if(mobileMode==='search'&&focusSearch)setTimeout(()=>input.focus({preventScroll:true}),60);
   requestAnimationFrame(()=>map.resize());
 }
 document.querySelectorAll('.bottom-nav [data-mobile-action]').forEach(button=>button.addEventListener('click',()=>{
   const mode=button.dataset.mobileAction;
   if(mobileMode==='route'&&mode!=='route')clearRoute();
   if(mode==='expo')setMobileMode('expo',{closeModal:false});
   else setMobileMode(mode,{focusSearch:mode==='search'});
 }));
 mobileMedia.addEventListener?.('change',()=>{
   if(isMobileLayout())setMobileMode(mobileMode,{closeModal:false});
   else{delete document.body.dataset.mobileMode;requestAnimationFrame(()=>map.resize());}
 });
 if(isMobileLayout())setMobileMode('map',{closeModal:false});
 document.getElementById('flatBtn').onclick=()=>map.easeTo({pitch:0,bearing:0,duration:550});document.getElementById('threeBtn').onclick=()=>map.easeTo({pitch:52,bearing:-28,duration:550});document.getElementById('resetBtn').onclick=()=>{clearSelected();fit();};
 document.getElementById('panelClose').onclick=clearSelected;const panelClearBtn=document.getElementById('panelClear');if(panelClearBtn)panelClearBtn.onclick=clearSelected;const panelFocusBtn=document.getElementById('panelFocus');if(panelFocusBtn)panelFocusBtn.onclick=()=>{if(selectedLabel?.coord)map.easeTo({center:selectedLabel.coord,zoom:18,pitch:52,bearing:map.getBearing(),duration:550});};
 document.getElementById('routeGo').onclick=()=>{const startSelect=document.getElementById('startSelect'),di=document.getElementById('destSelect').value;if(!currentLocationFeatures().length){setStatus('저장된 시작 지점이 없습니다. 관리자 지점 편집에서 지점을 추가해 주세요.');document.getElementById('routeInfo').textContent='시작 지점 데이터가 없습니다.';return;}if(di===''){setStatus('목적지 부스를 선택하세요.');return;}const si=Number(startSelect.value||0);routeTo(locationCoord(si),boothCatalog[Number(di)]);};
 document.getElementById('routeClear').onclick=clearRoute;
 const routeCardClose=document.getElementById('routeCardClose');
 if(routeCardClose)routeCardClose.onclick=()=>{clearRoute();if(isMobileLayout())setMobileMode('map');};
 document.getElementById('panelRoute').onclick=()=>{if(!selectedLabel?.coord)return;if(isMobileLayout())setMobileMode('route');const idx=boothCatalog.findIndex(x=>x.booth===selectedLabel.booth);if(idx>=0)document.getElementById('destSelect').value=String(idx);const si=Number(document.getElementById('startSelect').value||0);routeTo(locationCoord(si),selectedLabel);};
 function refreshFromProjectStore(){
   applyBranding();
   const openProgramBooth=activeProgramPlace?.booth||'';
   bounds=null;rebuildBoothCatalog();
   rebuildSpecialMarkers();
   const boothSource=map.getSource('booths');if(boothSource)boothSource.setData(boothDisplayGeoJSON());
   updateBoothLabelLayer();
   rebuildThreeLabels();
   const source=map.getSource('routes');if(source)source.setData(routeGeoFromGraph());
   const locationSource=map.getSource('locations');if(locationSource)locationSource.setData(locationGeoJSON());
   const locations=rebuildLocationControls();
   const destSelect=document.getElementById('destSelect');if(destSelect)destSelect.innerHTML='<option value="">목적지 부스</option>'+boothCatalog.map((l,i)=>`<option value="${i}">${escapeHtml(l.booth)} · ${escapeHtml(l.name||'')}</option>`).join('');
   if(openProgramBooth){const updated=programPlaceForBooth(openProgramBooth);if(updated){activeProgramPlace={...activeProgramPlace,...updated};renderProgramPlacePanel(activeProgramPlace)}else clearSelected()}
   programBadgeSignature='';refreshTimedProgramState(true);
   clearRoute();setStatus('');
 }
 window.addEventListener('storage',event=>{if(!event.key||!event.key.startsWith('finder.maplibre.project.'))return;window.FINDER_PROJECT_STORE.apply(window.FINDER_PROJECT_STORE.load());refreshFromProjectStore();});
 window.addEventListener('finder-project-live-update',()=>refreshFromProjectStore());
 window.addEventListener('resize',()=>map.resize());
 const content=window.FINDER_CONTENT||{companyDetails:{},stages:[],documents:[]};
 function getProgramNow(){return programTestNow?new Date(programTestNow.getTime()):new Date()}
 function localDateText(date=getProgramNow()){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`}
 function localTimeText(date=getProgramNow()){return `${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`}
 function normalizedProgram(program){return{date:String(program?.date||'').trim(),start:String(program?.start||'').trim(),end:String(program?.end||'').trim(),title:String(program?.title||'').trim(),description:String(program?.description||'').trim()}}
 function parseProgramMoment(dateText,timeText){
   const date=String(dateText||'').trim(),time=String(timeText||'').trim();
   if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d{1,2}:\d{2}$/.test(time))return null;
   const value=new Date(`${date}T${time.padStart(5,'0')}:00`);
   return Number.isNaN(value.getTime())?null:value;
 }
 function allProgramEntries(){
   return (content.stages||[]).flatMap(place=>(place.programs||[]).map(program=>({
     ...normalizedProgram(program),booth:String(place?.booth||'').trim(),place:String(place?.name||'').trim()
   }))).sort((a,b)=>`${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`));
 }
 function activeProgramBadgeMap(now=getProgramNow()){
   const result=new Map();
   for(const program of allProgramEntries()){
     if(!program.booth)continue;
     const start=parseProgramMoment(program.date,program.start),end=parseProgramMoment(program.date,program.end);
     if(!start||!end||end<=start)continue;
     const badgeStart=new Date(start.getTime()-30*60*1000);
     if(now<badgeStart||now>=end)continue;
     const status=now>=start?'live':'soon';
     const current=result.get(program.booth);
     if(!current||(status==='live'&&current.status!=='live')||(status===current.status&&start<current.start))result.set(program.booth,{status,start,end,program});
   }
   return result;
 }
 function programBadgeMapSignature(mapValue=activeProgramBadgeMap()){
   return [...mapValue.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([booth,state])=>`${booth}:${state.status}:${state.program.date}:${state.program.start}:${state.program.end}`).join('|');
 }
 function refreshTimedProgramState(force=false){
   const nextSignature=programBadgeMapSignature();
   if(force||nextSignature!==programBadgeSignature){programBadgeSignature=nextSignature;rebuildThreeLabels()}
   if(activeProgramPlace)renderProgramPlacePanel(activeProgramPlace);
   const modal=document.getElementById('expoModal');if(modal?.classList.contains('open'))renderPrograms();
   updateProgramTestClockText();
 }
 function formatDateTimeLocal(date){
   if(!(date instanceof Date)||Number.isNaN(date.getTime()))return'';
   return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}T${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
 }
 function updateProgramTestClockText(){
   const output=document.getElementById('programTestClockText');if(!output)return;
   output.textContent=programTestNow?`테스트 시간: ${formatDateTimeLocal(programTestNow).replace('T',' ')}`:`실제 시간: ${formatDateTimeLocal(new Date()).replace('T',' ')}`;
 }
 function setProgramTestTime(date){
   programTestNow=date instanceof Date&&!Number.isNaN(date.getTime())?new Date(date.getTime()):null;
   const input=document.getElementById('programTestClockInput');if(input)input.value=programTestNow?formatDateTimeLocal(programTestNow):formatDateTimeLocal(new Date());
   const url=new URL(location.href);if(programTestNow)url.searchParams.set('programTime',formatDateTimeLocal(programTestNow));else url.searchParams.delete('programTime');history.replaceState(null,'',url);
   refreshTimedProgramState(true);
 }
 function setupProgramTestClock(){
   const enabled=programUrlParams.get('programTest')==='1'||!!programTimeParam;if(!enabled)return;
   let initial=programTestNow;
   if(!initial){const first=allProgramEntries().map(item=>parseProgramMoment(item.date,item.start)).find(Boolean);initial=first?new Date(first.getTime()-20*60*1000):new Date();programTestNow=initial}
   const wrap=document.querySelector('.wrap');if(!wrap||document.getElementById('programTestClock'))return;
   const box=document.createElement('div');box.id='programTestClock';box.className='program-test-clock';box.innerHTML=`<b>프로그램 시간 테스트</b><span id="programTestClockText"></span><input id="programTestClockInput" type="datetime-local"><div><button type="button" data-minutes="-30">-30분</button><button type="button" data-minutes="10">+10분</button><button type="button" data-minutes="30">+30분</button><button type="button" data-real>실제시간</button></div>`;wrap.appendChild(box);
   const input=box.querySelector('#programTestClockInput');input.value=formatDateTimeLocal(programTestNow);input.addEventListener('change',()=>setProgramTestTime(new Date(input.value)));
   box.querySelectorAll('[data-minutes]').forEach(button=>button.addEventListener('click',()=>{const base=getProgramNow();base.setMinutes(base.getMinutes()+Number(button.dataset.minutes||0));setProgramTestTime(base)}));
   box.querySelector('[data-real]').addEventListener('click',()=>setProgramTestTime(null));updateProgramTestClockText();
 }
 function programPlaceForBooth(booth){
   const key=String(booth||'').trim();if(!key)return null;
   const matches=(content.stages||[]).filter(place=>String(place?.booth||'').trim()===key);
   if(!matches.length)return null;
   const programs=matches.flatMap(place=>(place.programs||[]).map(normalizedProgram)).sort((a,b)=>`${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`));
   return {booth:key,name:matches.map(place=>String(place?.name||'').trim()).find(Boolean)||key,programs};
 }
 function resolveProgramState(place){
   const programs=(place?.programs||[]).map(normalizedProgram).sort((a,b)=>`${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`));
   if(!programs.length)return{label:'현재 프로그램',current:null,next:null};
   const nowDate=getProgramNow(),today=localDateText(nowDate);
   const todayPrograms=programs.filter(program=>program.date===today);
   if(todayPrograms.length){
     const running=todayPrograms.find(program=>{const start=parseProgramMoment(program.date,program.start),end=parseProgramMoment(program.date,program.end);return start&&end&&start<=nowDate&&nowDate<end});
     if(running){const index=programs.indexOf(running);return{label:'현재 프로그램',current:running,next:programs[index+1]||null}}
     const upcoming=todayPrograms.find(program=>{const start=parseProgramMoment(program.date,program.start);return start&&start>nowDate});
     if(upcoming){const index=programs.indexOf(upcoming),start=parseProgramMoment(upcoming.date,upcoming.start),minutes=start?Math.round((start-nowDate)/60000):Infinity;return{label:minutes<=30?'곧 시작':'다음 예정 프로그램',current:upcoming,next:programs[index+1]||null}}
     const last=todayPrograms[todayPrograms.length-1],index=programs.indexOf(last);return{label:'금일 종료 프로그램',current:last,next:programs[index+1]||null};
   }
   const future=programs.find(program=>{const start=parseProgramMoment(program.date,program.start);return start&&start>nowDate})||programs[0];
   const index=programs.indexOf(future);return{label:'예정 프로그램',current:future,next:programs[index+1]||null};
 }
 function programLine(program){return program?`${program.date?program.date+' ':''}${program.start||''}${program.end?'~'+program.end:''} ${program.title||''}`.trim():'없음'}
 function renderProgramPlacePanel(place){
   const state=resolveProgramState(place);
   document.getElementById('stageName').textContent=place.name||place.booth||'프로그램 장소';
   const label=document.getElementById('stageStatusLabel');if(label)label.textContent=state.label;
   document.getElementById('stageCurrent').textContent=state.current?programLine(state.current):'등록된 프로그램이 없습니다.';
   document.getElementById('stageDescription').textContent=state.current?.description||'';
   document.getElementById('stageNext').textContent=state.next?programLine(state.next):'다음 프로그램 없음';
 }
 function openProgramPlace(place,item,id,coord){
   clearSelected();selectedId=id;selectedBoothKey=String(item.booth||place.booth||'');selectedLabel=coord?{...item,coord}:item;activeProgramPlace={...place,coord:selectedLabel?.coord,item:selectedLabel};
   refreshSelectedBoothColor();
   panel.classList.remove('open');renderProgramPlacePanel(activeProgramPlace);document.getElementById('stagePanel').classList.add('open');
   setStatus(`프로그램 장소: ${place.booth} ${place.name}`);rebuildThreeLabels();
 }
 function updateBoothDetail(item){
   const detail=content.companyDetails?.[item.booth]||{};
   const desc=document.getElementById('panelDescription');
   const link=document.getElementById('panelWebsite');
   const badge=document.getElementById('panelBadge');
   if(desc)desc.textContent=detail.description||item.description||'제품 설명이 등록되지 않았습니다.';
   if(link){if(detail.website){link.href=detail.website;link.style.display='inline-block'}else link.style.display='none'}
   const type=getSpecialBooths()[item.booth];
   if(badge){badge.className='special-badge';badge.textContent='';if(type){badge.classList.add('show',type);badge.textContent=type==='premium'?'◇ PREMIUM':type==='awards'?'♛ AWARDS':'✦ SPECIAL';}}
 }
 function openExhibition(){if(typeof setMobileMode==='function'&&isMobileLayout())setMobileMode('expo',{closeModal:false});document.getElementById('expoModal').classList.add('open');renderPrograms();renderDocuments();}
 function closeExhibition(){document.getElementById('expoModal').classList.remove('open');if(typeof setMobileMode==='function'&&isMobileLayout())setMobileMode('map',{closeModal:false});}
 function renderPrograms(){
   const box=document.getElementById('programList'),tabs=document.getElementById('programTabs');if(!box)return;
   const all=allProgramEntries(),dates=[...new Set(all.map(item=>item.date).filter(Boolean))].sort();
   if(!dates.length){if(tabs)tabs.innerHTML='';box.innerHTML='<div class="empty-note">등록된 프로그램이 없습니다.</div>';return}
   const today=localDateText(getProgramNow());if(!activeProgramDate||!dates.includes(activeProgramDate))activeProgramDate=dates.includes(today)?today:dates[0];
   if(tabs){tabs.innerHTML=dates.map((date,index)=>`<button type="button" class="${date===activeProgramDate?'active':''}" data-date="${escapeHtml(date)}"><b>${index+1}일차</b><span>${escapeHtml(date)}</span></button>`).join('');tabs.querySelectorAll('button').forEach(button=>button.addEventListener('click',()=>{activeProgramDate=button.dataset.date||dates[0];renderPrograms()}));}
   const daily=all.filter(item=>item.date===activeProgramDate);
   box.innerHTML=daily.map(p=>`<div class="program-row"><div class="program-time">${escapeHtml(p.start)}~${escapeHtml(p.end)}</div><div><div class="program-title">${escapeHtml(p.title)}</div><div class="program-meta">${escapeHtml(p.booth)} · ${escapeHtml(p.place)} · ${escapeHtml(p.description||'')}</div></div></div>`).join('')||'<div class="empty-note">해당 일자에 등록된 프로그램이 없습니다.</div>';
 }
 function renderDocuments(){const box=document.getElementById('documentList');box.innerHTML=content.documents.map(d=>`<div class="download-card"><div class="download-icon">PDF</div><div class="download-info"><b>${escapeHtml(d.title)}</b><span>${escapeHtml(d.size||'')}</span></div>${d.enabled?`<a href="${escapeHtml(d.file)}" download>다운로드</a>`:'<button disabled style="opacity:.45">미등록</button>'}</div>`).join('');}
 document.querySelectorAll('[data-expo-open]').forEach(b=>b.addEventListener('click',openExhibition));
 document.getElementById('expoClose').addEventListener('click',closeExhibition);
 document.getElementById('expoModal').addEventListener('click',e=>{if(e.target.id==='expoModal')closeExhibition();});
 // QR URL entry: ?loc=QR-1
 const qrLoc=new URLSearchParams(location.search).get('loc');
 if(qrLoc){const locations=currentLocationFeatures();const locIndex=locations.findIndex(f=>String(f.properties?.name||f.properties?.code||'').toLowerCase()===qrLoc.toLowerCase());const loc=locations[locIndex];if(loc){map.once('load',()=>{map.easeTo({center:[Number(loc.geometry.coordinates[0]),Number(loc.geometry.coordinates[1])],zoom:17,pitch:48,duration:800});const chip=document.getElementById('qrChip');const locName=loc.properties?.name||loc.properties?.code||qrLoc;chip.textContent=`현재 위치: ${locName}`;chip.classList.add('show');setTimeout(()=>chip.classList.remove('show'),4500);const sel=document.getElementById('startSelect');sel.value=String(locIndex);});}}
 // 프로그램은 별도 중앙 마커를 만들지 않고, 일정에 등록된 부스 클릭으로 표시합니다.
 document.getElementById('stageClose').addEventListener('click',clearSelected);
 document.getElementById('stageRoute').addEventListener('click',()=>{if(!activeProgramPlace?.item?.coord)return;if(isMobileLayout())setMobileMode('route');const idx=boothCatalog.findIndex(item=>item.booth===activeProgramPlace.booth);if(idx>=0)document.getElementById('destSelect').value=String(idx);const startIndex=Number(document.getElementById('startSelect').value||0);routeTo(locationCoord(startIndex),activeProgramPlace.item);});
 setupProgramTestClock();
 if(map.loaded())refreshTimedProgramState(true);else map.once('load',()=>refreshTimedProgramState(true));
 setInterval(()=>refreshTimedProgramState(false),30000);

})();
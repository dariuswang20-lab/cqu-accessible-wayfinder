const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const svgNS = 'http://www.w3.org/2000/svg';

const buildings = {
  A: { name: 'A 校园 · 主教学楼', note: '模板演示' },
  B: { name: 'B 校园 · 第二综合楼', note: '重点案例' },
  C: { name: 'C 校园 · 第一教学楼', note: '模板演示' }
};

// 教学研究用示意图。节点、边和距离均非重庆大学的实测数据。
const nodes = {
  entrance: { label: '一层南入口', floor: 1, x: 110, y: 320 },
  lobby: { label: '一层大厅', floor: 1, x: 290, y: 230 },
  lift1: { label: '一层电梯口', floor: 1, x: 470, y: 125 },
  stairs1: { label: '一层楼梯口', floor: 1, x: 470, y: 325 },
  junction1: { label: '一层东廊', floor: 1, x: 620, y: 230 },
  lift2: { label: '二层电梯口', floor: 2, x: 110, y: 100 },
  stairs2: { label: '二层楼梯口', floor: 2, x: 110, y: 320 },
  north2: { label: '二层北廊', floor: 2, x: 300, y: 100 },
  northEast2: { label: '二层北侧支廊', floor: 2, x: 445, y: 100 },
  center2: { label: '二层中央廊', floor: 2, x: 300, y: 210 },
  south2: { label: '二层南廊', floor: 2, x: 300, y: 320 },
  east2: { label: '二层东廊', floor: 2, x: 535, y: 210 },
  room201: { label: '二层 201 教室', floor: 2, x: 535, y: 85 },
  room205: { label: '二层 205 教室', floor: 2, x: 680, y: 210 },
  wc2: { label: '二层无障碍卫生间', floor: 2, x: 535, y: 320 },
  study2: { label: '二层自习区', floor: 2, x: 680, y: 85 }
};
const edges = [
  ['entrance','lobby',24],['lobby','lift1',29],['lobby','stairs1',25],
  ['lobby','junction1',45],['junction1','lift1',23],['junction1','stairs1',23],
  ['lift1','lift2',15,'lift'],['stairs1','stairs2',16,'stairs'],
  ['lift2','north2',23],['lift2','center2',35],['stairs2','south2',23],
  ['north2','center2',17],['center2','south2',17],['center2','east2',28,'east'],
  ['north2','northEast2',30],['northEast2','room201',12],['northEast2','study2',20],['northEast2','room205',38],
  ['east2','room205',18],['east2','wc2',17],['south2','wc2',29],
  ['wc2','room205',36],['south2','east2',48]
].map(([a,b,meters,type='hall'],index) => ({a,b,meters,type,index}));

const state = { campus:'B', floor:1, route:null, alternate:null, showAlternate:false, startedAt:null };

function settings() {
  return {
    origin: $('#origin').value,
    destination: $('#destination').value,
    mobility: $('input[name="mobility"]:checked').value,
    priority: $('#priority').value,
    liftClosed: $('#lift-closed').checked,
    eastClosed: $('#east-closed').checked,
    crowded: $('#crowded').checked
  };
}

function available(edge, config) {
  if (edge.type === 'lift' && config.liftClosed) return false;
  if (edge.type === 'stairs' && config.mobility === 'wheelchair') return false;
  if (edge.type === 'east' && config.eastClosed) return false;
  return true;
}

function edgeCost(edge, config, excluded = -1) {
  if (edge.index === excluded || !available(edge, config)) return Infinity;
  let cost = edge.meters;
  if (edge.type === 'stairs' && config.mobility === 'walking') cost += 5;
  if (edge.type === 'lift') cost += 16;
  if (config.crowded && ['center2','east2'].some(n => edge.a === n || edge.b === n)) {
    cost += config.priority === 'quiet' ? 75 : config.priority === 'balanced' ? 24 : 0;
  }
  if (config.priority === 'quiet' && edge.type === 'east') cost += 12;
  return cost;
}

function shortestPath(config, excluded = -1) {
  const distances = Object.fromEntries(Object.keys(nodes).map(id => [id, Infinity]));
  const previous = {};
  const visited = new Set();
  distances[config.origin] = 0;
  while (visited.size < Object.keys(nodes).length) {
    const current = Object.keys(nodes).filter(id => !visited.has(id)).sort((a,b) => distances[a]-distances[b])[0];
    if (!current || !Number.isFinite(distances[current])) break;
    if (current === config.destination) break;
    visited.add(current);
    for (const edge of edges) {
      const next = edge.a === current ? edge.b : edge.b === current ? edge.a : null;
      if (!next || visited.has(next)) continue;
      const cost = edgeCost(edge, config, excluded);
      if (distances[current] + cost < distances[next]) {
        distances[next] = distances[current] + cost;
        previous[next] = { node:current, edge };
      }
    }
  }
  if (!Number.isFinite(distances[config.destination])) return null;
  const path = [config.destination];
  const usedEdges = [];
  let cursor = config.destination;
  while (cursor !== config.origin) {
    const step = previous[cursor];
    if (!step) return null;
    usedEdges.unshift(step.edge);
    cursor = step.node;
    path.unshift(cursor);
  }
  return { path, edges:usedEdges, cost:distances[config.destination], meters:usedEdges.reduce((sum,e) => sum+e.meters,0) };
}

function findAlternate(config, primary) {
  if (!primary) return null;
  const candidates = primary.edges.map(edge => shortestPath(config, edge.index)).filter(Boolean);
  const unique = candidates.filter(candidate => candidate.path.join('|') !== primary.path.join('|'));
  unique.sort((a,b) => a.cost-b.cost);
  return unique[0] || null;
}

function svgElement(tag, attrs = {}, text) {
  const el = document.createElementNS(svgNS, tag);
  for (const [key,value] of Object.entries(attrs)) el.setAttribute(key, String(value));
  if (text != null) el.textContent = text;
  return el;
}

function addShape(svg, tag, attrs, text) { const el=svgElement(tag,attrs,text); svg.append(el); return el; }
function addText(svg,x,y,label,sub) {
  addShape(svg,'text',{x,y,class:'map-label'},label);
  if (sub) addShape(svg,'text',{x,y:y+17,class:'map-sub'},sub);
}

function drawBase(svg, floor) {
  addShape(svg,'rect',{x:44,y:43,width:692,height:334,rx:12,class:'map-outline'});
  if (floor === 1) {
    addShape(svg,'rect',{x:75,y:172,width:610,height:116,rx:13,class:'map-corridor'});
    addShape(svg,'rect',{x:205,y:190,width:170,height:86,rx:11,class:'map-hall'});
    addShape(svg,'rect',{x:396,y:65,width:148,height:105,rx:8,class:'map-room'});
    addShape(svg,'rect',{x:396,y:285,width:148,height:70,rx:8,class:'map-room pale'});
    addShape(svg,'rect',{x:75,y:290,width:130,height:66,rx:8,class:'map-room pale'});
    addShape(svg,'rect',{x:565,y:65,width:118,height:90,rx:8,class:'map-room pale'});
    addShape(svg,'rect',{x:565,y:302,width:118,height:54,rx:8,class:'map-room pale'});
    addText(svg,287,233,'大厅','演示入口');
    addText(svg,470,109,'电梯','LIFT');
    addText(svg,470,313,'楼梯','STAIRS');
    addText(svg,120,330,'南入口');
    addText(svg,621,104,'功能空间');
    addText(svg,622,332,'功能空间');
    addShape(svg,'text',{x:61,y:66,class:'map-muted'},'1F · 出发层 / 示意');
  } else {
    addShape(svg,'rect',{x:72,y:157,width:633,height:106,rx:13,class:'map-corridor'});
    addShape(svg,'rect',{x:225,y:65,width:150,height:265,rx:13,class:'map-hall'});
    addShape(svg,'rect',{x:75,y:68,width:114,height:75,rx:8,class:'map-room'});
    addShape(svg,'rect',{x:75,y:280,width:114,height:74,rx:8,class:'map-room pale'});
    addShape(svg,'rect',{x:455,y:65,width:160,height:82,rx:8,class:'map-room pale'});
    addShape(svg,'rect',{x:615,y:65,width:95,height:82,rx:8,class:'map-room pale'});
    addShape(svg,'rect',{x:615,y:170,width:95,height:82,rx:8,class:'map-room pale'});
    addShape(svg,'rect',{x:455,y:280,width:160,height:74,rx:8,class:'map-room pale'});
    addText(svg,113,105,'电梯','LIFT');
    addText(svg,113,315,'楼梯','STAIRS');
    addText(svg,535,102,'201 教室');
    addShape(svg,'text',{x:424,y:84,class:'map-sub'},'北侧支廊');
    addText(svg,661,103,'自习区');
    addText(svg,661,211,'205 教室');
    addText(svg,535,318,'无障碍卫生间');
    addShape(svg,'text',{x:61,y:66,class:'map-muted'},'2F · 目的层 / 示意');
    if ($('#east-closed').checked) {
      addShape(svg,'circle',{cx:417,cy:210,r:12,class:'map-closure'});
      addShape(svg,'text',{x:438,y:185,class:'map-closure-text'},'模拟封闭');
      addShape(svg,'text',{x:417,y:214,'text-anchor':'middle',fill:'#fff','font-size':13,'font-weight':800},'×');
    }
    if ($('#crowded').checked) {
      addShape(svg,'rect',{x:253,y:179,width:95,height:29,rx:4,class:'map-banner'});
      addShape(svg,'text',{x:300,y:198,'text-anchor':'middle',class:'map-banner-text'},'模拟拥挤');
    }
  }
  if (floor === 1 && $('#lift-closed').checked) {
    addShape(svg,'circle',{cx:470,cy:125,r:13,class:'map-closure'});
    addShape(svg,'text',{x:490,y:81,class:'map-closure-text'},'模拟停用');
    addShape(svg,'text',{x:470,y:130,'text-anchor':'middle',fill:'#fff','font-size':14,'font-weight':800},'×');
  }
}

function drawRoute(svg, route, floor) {
  if (!route) return;
  const floorNodes = route.path.filter(id => nodes[id].floor === floor);
  if (floorNodes.length > 1) {
    const points = floorNodes.map(id => `${nodes[id].x},${nodes[id].y}`).join(' ');
    addShape(svg,'polyline',{points,class:'map-route-shadow'});
    addShape(svg,'polyline',{points,class:'map-route'});
  }
  floorNodes.forEach((id,index) => {
    const node = nodes[id];
    const end = index === 0 || index === floorNodes.length-1;
    addShape(svg,'circle',{cx:node.x,cy:node.y,r:end?10:6,fill:end?'#9f3036':'#cc8787',class:'map-node'});
  });
}

function drawMap() {
  const svg = $('#floor-map');
  svg.querySelectorAll(':scope > :not(title):not(desc)').forEach(el => el.remove());
  drawBase(svg,state.floor);
  drawRoute(svg,state.showAlternate ? state.alternate : state.route,state.floor);
}

function routeSteps(route) {
  const path = route.path;
  const vertical = route.edges.find(edge => edge.type === 'lift' || edge.type === 'stairs');
  const verticalType = vertical?.type === 'lift' ? '电梯' : '楼梯';
  const index = path.findIndex(id => id === 'lift1' || id === 'stairs1');
  const first = index > 0 ? path.slice(0,index+1) : path.slice(0,1);
  const rest = index >= 0 ? path.slice(index+2) : [];
  return [
    `从${nodes[path[0]].label}出发，经${first.slice(1).map(id => nodes[id].label.replace(/^[一二]层/,'')).join('、') || '当前点'}前往${verticalType}。`,
    `乘${verticalType}到二层。${verticalType === '楼梯' ? '此段不适合需要无台阶通行的用户。' : ''}`,
    `经过${rest.slice(0,-1).map(id => nodes[id].label.replace(/^二层/,'')).join('、') || '二层走廊'}，抵达${nodes[path.at(-1)].label}。`
  ];
}

function explanationHtml(route, config) {
  const useLift = route.edges.some(e => e.type === 'lift');
  const reasons = [
    config.mobility === 'wheelchair' ? '已排除所有需要走楼梯的楼层连接。' : `根据距离与通行成本选择${useLift?'电梯':'楼梯'}。`,
    config.liftClosed ? '已排除模拟停用的电梯。' : '当前电梯按可使用的模拟状态计算。',
    config.eastClosed ? '已避开模拟封闭的二层中央至东廊连接通道。' : '二层中央至东廊连接通道按可通行的模拟状态计算。',
    config.crowded ? '中央区域设为模拟拥挤；路线偏好会改变拥挤路段的权重。' : '当前未设置拥挤区域。'
  ];
  return `<p>路线由示意空间节点与通道的最小成本搜索得到。演示距离约 ${route.meters} 米，不等于实地测量距离。</p><ul>${reasons.map(reason=>`<li>${reason}</li>`).join('')}</ul>`;
}

function renderResult() {
  const config = settings();
  const route = state.showAlternate ? state.alternate : state.route;
  const status = $('#route-status');
  const summary = $('#route-summary');
  const steps = $('#route-steps');
  const explanation = $('#route-explanation');
  const alternateButton = $('#alternate-button');
  if (!route) {
    status.textContent = '当前不可达'; status.classList.add('warning');
    summary.innerHTML = '<strong>暂无可行路线</strong>';
    steps.innerHTML = `<li>${config.mobility === 'wheelchair' && config.liftClosed ? '无台阶需求下，模拟电梯停用使楼层间无法通行。请勿改用楼梯；需要实地向楼宇管理人员确认无障碍方案。' : '当前设置下没有可行路线。请调整模拟障碍或通行方式后重试。'}</li>`;
    explanation.innerHTML = '<p>系统不会在不可达时虚构路线。请检查电梯与走廊状态，并以现场信息为准。</p>';
    alternateButton.disabled = true;
  } else {
    status.textContent = state.showAlternate ? '备选路线' : '路线已就绪'; status.classList.remove('warning');
    summary.innerHTML = `<strong>约 ${route.meters} 米</strong><span>演示距离</span><span>约 ${Math.max(2,Math.ceil(route.meters/70))} 分钟</span>`;
    steps.replaceChildren(...routeSteps(route).map(step => { const li=document.createElement('li');li.textContent=step;return li; }));
    explanation.innerHTML = explanationHtml(route,config);
    alternateButton.disabled = !state.alternate;
    alternateButton.innerHTML = state.showAlternate ? '返回推荐路线 <span aria-hidden="true">→</span>' : '查看另一条可行路线 <span aria-hidden="true">→</span>';
  }
  drawMap();
}

function recalculate(startClock = false) {
  if (startClock) state.startedAt = performance.now();
  const config = settings();
  state.route = shortestPath(config);
  state.alternate = findAlternate(config,state.route);
  state.showAlternate = false;
  renderResult();
}

function setCampus(campus) {
  state.campus = campus;
  $$('.campus-card').forEach(card => {
    const active = card.dataset.campus === campus;
    card.classList.toggle('active',active);
    card.setAttribute('aria-pressed',String(active));
  });
  $('#current-building').textContent = buildings[campus].name + ' · ' + buildings[campus].note;
  $('#workspace').scrollIntoView({behavior:'smooth',block:'start'});
  recalculate();
}

function setFloor(floor) {
  state.floor = floor;
  $$('.floor-tabs button').forEach(button => button.setAttribute('aria-selected',String(Number(button.dataset.floor)===floor)));
  drawMap();
}

function resetScene() {
  $('#origin').value='entrance';$('#destination').value='room205';
  $('input[name="mobility"][value="wheelchair"]').checked=true;
  $('#priority').value='balanced';
  ['lift-closed','east-closed','crowded'].forEach(id => $('#'+id).checked=false);
  setFloor(1);recalculate(true);
}

const storageKey = 'cqu-wayfinder-study-v1';
function getRecords() { try { const data=JSON.parse(localStorage.getItem(storageKey)||'[]'); return Array.isArray(data)?data:[]; } catch { return []; } }
function saveRecords(records) { try { localStorage.setItem(storageKey,JSON.stringify(records)); return true; } catch { return false; } }
function updateCount() { $('#record-count').textContent=String(getRecords().length); }
function message(text) { $('#study-message').firstChild.textContent=text+' '; }

function initRatings() {
  $$('.rating').forEach(group => {
    const name=group.dataset.name;
    for(let n=1;n<=5;n++) {
      const label=document.createElement('label');
      const input=document.createElement('input');input.type='radio';input.name=name;input.value=String(n);input.required=true;
      const span=document.createElement('span');span.textContent=String(n);
      label.append(input,span);group.append(label);
    }
  });
}

function setCondition() {
  const explain = $('#condition').value === 'B';
  $('#explanation').hidden=!explain;
  if(!explain) $('#explanation').open=false;
}

function csvCell(value) {
  let string=String(value??'');
  if (/^[=+@\-]/.test(string)) string="'"+string;
  return '"'+string.replaceAll('"','""')+'"';
}
function exportCsv() {
  const records=getRecords();
  if (!records.length) { message('暂无可导出的测试记录。'); return; }
  const columns=['timestamp','participant','role','condition','taskComplete','durationSeconds','campus','building','origin','destination','mobility','priority','liftClosed','eastClosed','crowded','routeFound','routeMeters','clarity','trust','control','feedback'];
  const csv='\ufeff'+[columns.join(','),...records.map(record=>columns.map(key=>csvCell(record[key])).join(','))].join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download='知路_真实用户测试_'+new Date().toISOString().slice(0,10)+'.csv';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  message('CSV 已下载。当前浏览器已保存');
}

function submitStudy(event) {
  event.preventDefault();
  const form=$('#study-form');
  if (!form.reportValidity()) return;
  const participant=$('#participant').value.trim();
  if (!participant) { message('请填写匿名编号。'); return; }
  const records=getRecords();
  if (records.some(r=>r.participant.toLowerCase()===participant.toLowerCase())) { message('此匿名编号已存在，请使用新编号。'); return; }
  const config=settings();
  const route=state.showAlternate?state.alternate:state.route;
  const record={
    timestamp:new Date().toISOString(),participant,role:$('#role').value,condition:$('#condition').value,
    taskComplete:$('#task-complete').value,durationSeconds:state.startedAt?Math.round((performance.now()-state.startedAt)/1000):'',
    campus:state.campus,building:buildings[state.campus].name,origin:config.origin,destination:config.destination,
    mobility:config.mobility,priority:config.priority,liftClosed:config.liftClosed,eastClosed:config.eastClosed,crowded:config.crowded,
    routeFound:!!route,routeMeters:route?.meters??'',clarity:form.elements.clarity.value,trust:form.elements.trust.value,
    control:form.elements.control.value,feedback:$('#feedback').value.trim()
  };
  records.push(record);
  if (!saveRecords(records)) { message('此浏览器无法保存数据，请检查本地存储设置。'); return; }
  form.reset();setCondition();updateCount();message('本次真实测试记录已保存。当前浏览器已保存');
  state.startedAt=null;
}

function init() {
  initRatings();updateCount();setCondition();recalculate();
  $$('.campus-card').forEach(card=>card.addEventListener('click',()=>setCampus(card.dataset.campus)));
  $$('.floor-tabs button').forEach(button=>button.addEventListener('click',()=>setFloor(Number(button.dataset.floor))));
  $('#plan-button').addEventListener('click',()=>{recalculate(state.startedAt===null);$('.map-panel').scrollIntoView({behavior:'smooth',block:'center'});});
  ['origin','destination','priority','lift-closed','east-closed','crowded'].forEach(id=>$('#'+id).addEventListener('change',()=>recalculate()));
  $$('input[name="mobility"]').forEach(input=>input.addEventListener('change',()=>recalculate()));
  $('#alternate-button').addEventListener('click',()=>{ if(state.alternate){state.showAlternate=!state.showAlternate;renderResult();} });
  $('#map-reset').addEventListener('click',resetScene);
  $('#condition').addEventListener('change',setCondition);
  $('#start-study').addEventListener('click',()=>{resetScene();setCondition();$('#workspace').scrollIntoView({behavior:'smooth',block:'start'});});
  $('#study-form').addEventListener('submit',submitStudy);
  $('#export-csv').addEventListener('click',exportCsv);
}
document.addEventListener('DOMContentLoaded',init);

const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if(!m){ console.error('NO SCRIPT FOUND'); process.exit(1); }
let js = m[1];

// --- stubs ---
function fakeEl(){ return { innerHTML:'', value:'', dataset:{}, style:{}, addEventListener(){}, focus(){} }; }
const documentStub = {
  addEventListener(){},
  querySelector(sel){ return fakeEl(); },
};
const windowStub = {};
const localStorageStub = {
  _d:{},
  getItem(k){ return Object.prototype.hasOwnProperty.call(this._d,k)?this._d[k]:null; },
  setItem(k,v){ this._d[k]=String(v); },
  removeItem(k){ delete this._d[k]; },
};
const alertStub = ()=>{};

// expose a test handle from inside the eval
js += `\n;return {
  getState:()=>state, setState:(s)=>{state=s;},
  freshState, HANDLERS, CHARACTERS, FEMALES, MALES, ATTRS,
  portraitSVG, pick, rand, rnd, doAction, advanceWeek, computeEnding, confess, showEvent,
};`;

let T;
try {
  T = new Function('document','window','localStorage','alert', js)(
    documentStub, windowStub, localStorageStub, alertStub
  );
} catch(e){
  console.error('EVAL ERROR:', e);
  process.exit(1);
}

let pass=0, fail=0;
function ok(cond, msg){ if(cond){pass++; console.log('  ✓ '+msg);} else {fail++; console.log('  ✗ '+msg);} }

console.log('=== 青空之下 galgame 冒烟测试 ===');

// 1. 数据完整性
ok(T.CHARACTERS.length===20, '角色总数=20 (实际 '+T.CHARACTERS.length+')');
ok(T.FEMALES.length===4, '女性角色=4 ('+T.FEMALES.map(c=>c.name).join('、')+')');
ok(T.MALES.length===16, '男性角色=16');
ok(T.ATTRS.length===14, '属性=14');
ok(T.CHARACTERS.every(c=>T.ATTRS.every(a=>typeof c.attrs[a.k]==='number')), '每个角色14项属性齐全');

// 2. 立绘生成
let portraitOk = true;
for(const c of T.CHARACTERS){ const s=T.portraitSVG(c,100); if(typeof s!=='string'||!s.includes('<svg')){portraitOk=false; console.log('    立绘失败:',c.name);} }
ok(portraitOk, '20角色立绘均生成<svg>');
const s1=T.portraitSVG(T.CHARACTERS[0],80), s2=T.portraitSVG(T.CHARACTERS[1],80);
ok(s1!==s2, '不同角色立绘不同');

// 3. 创建流程：姓名/性别/抽卡
T.setState(T.freshState());
T.getState().name='测试君'; T.getState().gender='m'; T.getState().screen='draft';
let guard=0;
while(T.getState().draft.remaining.length>0 && guard++<200){
  const d=T.getState().draft;
  if(d.round.length===0){ d.round=T.pick(T.CHARACTERS, Math.min(3,d.remaining.length)).map(c=>({id:c.id,picked:null})); }
  d.round.forEach(r=>{
    const avail=d.remaining.filter(k=>!d.round.some(o=>o.id!==r.id&&o.picked===k));
    if(avail.length) T.HANDLERS['draft-pick']({dataset:{cid:r.id, attr:avail[0]}});
  });
  T.HANDLERS['draft-confirm']({});
}
ok(T.getState().draft.remaining.length===0, '抽卡流程结束(14属性已填)');
ok(Object.keys(T.getState().player.attrs).length===14, 'player.attrs 有14项');
ok(T.getState().screen==='game', '创建后进入主循环 screen=game (实际 '+T.getState().screen+')');
ok(T.getState().player.attrs.si>=40 && T.getState().player.attrs.si<=100, '属性值在合理区间');

// 4. 完整时间轴推进到结局
let steps=0;
const st=()=>T.getState();
while(st().screen!=='ending' && steps++<800){
  const sc=st().screen;
  if(sc==='event'){
    T.HANDLERS['event-choice']({dataset:{i:0}});
  } else if(sc==='weekend'){
    T.HANDLERS['next-week']({});
  } else if(sc==='game'){
    if(st().energy>0){
      // 体力低则休息，否则社交/学习交替
      const act = st().stamina<30 ? 'rest' : (steps%2? 'social':'study');
      T.HANDLERS['do-action']({dataset:{act}});
    } else {
      T.HANDLERS['event-choice']({dataset:{i:0}});
    }
  } else {
    // 其它屏幕(关系/属性/菜单)不应出现在自动流程，跳回
    T.HANDLERS['nav-game']&&T.HANDLERS['nav-game']({});
  }
}
ok(st().screen==='ending', '时间轴推进到结局 screen=ending (steps='+steps+')');
ok(!!st().ending && !!st().ending.title, '生成了结局: '+ (st().ending?st().ending.title:'无'));

console.log('\n结果: '+pass+' 通过, '+fail+' 失败');
process.exit(fail?1:0);

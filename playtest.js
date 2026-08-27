const fs = require('fs');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];

// 智能 DOM stub：记录每个选择器最后渲染的 innerHTML
const els = {};
function makeEl(sel){
  return {
    _sel:sel, _html:'', value:'', dataset:{}, style:{},
    set innerHTML(v){ this._html = v; },
    get innerHTML(){ return this._html; },
    addEventListener(){}, focus(){},
  };
}
const document = {
  addEventListener(){},
  querySelector(sel){ if(!els[sel]) els[sel]=makeEl(sel); return els[sel]; },
};
const window = {};
const localStorage = { _d:{}, getItem(k){return this._d[k]||null}, setItem(k,v){this._d[k]=String(v)}, removeItem(k){delete this._d[k]} };
const alert = ()=>{};

const T = new Function('document','window','localStorage','alert', js + `
;return {
  getState:()=>state, setState:(s)=>{state=s},
  freshState, HANDLERS, CHARACTERS, FEMALES, MALES, ATTRS, BY_ID,
  portraitSVG, pick, doAction, advanceWeek, computeEnding, confess, showEvent, render,
};`)(document, window, localStorage, alert);

let pass=0, fail=0;
function ok(c,m){ if(c){pass++;console.log('  ✓ '+m);} else {fail++;console.log('  ✗ '+m);} }
function screenHtml(){ return els['#screen'] ? els['#screen']._html : ''; }
function noLeak(){ const h=screenHtml(); return !(/undefined|NaN|\[object Object\]/i.test(h)); }

console.log('=== 深度试玩模拟 ===');

// ---------- 1. 创建流程：逐屏检查泄漏 ----------
T.setState(T.freshState());
T.HANDLERS['newgame']({});                    // -> name
T.getState().name='小明';
T.HANDLERS['name-ok']({});                    // -> gender
T.HANDLERS['gender-m']({});                   // -> draft
let leakFree = true;
for(let r=0; r<20; r++){
  const d = T.getState().draft;
  if(d.remaining.length===0) break;
  if(d.round.length===0) d.round = T.pick(T.CHARACTERS, Math.min(3,d.remaining.length)).map(c=>({id:c.id,picked:null}));
  d.round.forEach(slot=>{
    const avail = d.remaining.filter(k=>!d.round.some(o=>o.id!==slot.id && o.picked===k));
    if(avail.length){ T.HANDLERS['draft-pick']({dataset:{cid:slot.id, attr:avail[0]}}); if(!noLeak()) leakFree=false; }
  });
  T.HANDLERS['draft-confirm']({});
  if(!noLeak()) leakFree=false;
}
ok(leakFree, '创建流程渲染无 undefined/NaN 泄漏');
ok(Object.keys(T.getState().player.attrs).length===14, '创建后 14 属性齐全');
ok(T.getState().screen==='game', '进入主界面');

// ---------- 2. 男性玩家：女主可攻略 / 田嘉为挚友 ----------
const romM = T.CHARACTERS.filter(c=>c.gender!=='m' && c.romance!==false);
ok(romM.length===4 && romM.every(c=>T.FEMALES.includes(c)), '男玩家：4位女主均可攻略');
ok(T.BY_ID.tianjia.gender==='m', '田嘉为男性（男玩家不可攻略，为挚友）');

// ---------- 3. 女性玩家：男主可攻略 / 李静为闺蜜 ----------
T.setState(T.freshState());
T.getState().name='小红'; T.getState().gender='f'; T.getState().screen='game';
T.getState().player.attrs=Object.fromEntries(T.ATTRS.map(a=>[a.k,60]));
T.getState().affection={};
T.render(); // 触发 relations 以外的主界面渲染
const romF = T.CHARACTERS.filter(c=>c.gender!=='f' && c.romance!==false);
ok(romF.length===4 && romF.some(c=>c.id==='tianjia'), '女玩家：4位男主可攻略（含田嘉）');
ok(T.BY_ID.lijing.gender==='f', '李静为女性（女玩家不可攻略，为闺蜜）');

// ---------- 4. 约会 + 告白 → 恋爱结局（男玩家追李静） ----------
T.setState(T.freshState());
const s=T.getState();
s.name='小明'; s.gender='m'; s.screen='game';
s.player.attrs=Object.fromEntries(T.ATTRS.map(a=>[a.k,60]));
s.player.attrs.la=80;                      // 恋爱属性高，告白成功率↑
s.affection={}; s.affection.lijing=88;      // 李静好感高
s.flags={}; s.energy=3; s.stamina=80; s.mood=70;
T.HANDLERS['confess'] ? null : null;
T.confess('lijing');                         // 直接告白
ok(s.flags.lover==='lijing', '告白成功，flags.lover=李静');
T.computeEnding();
ok(s.ending && s.ending.badge==='love', '生成恋爱结局 badge=love');

// ---------- 5. 全屏渲染检查（关系/属性/周总结/结局） ----------
T.setState(T.freshState());
const s2=T.getState();
s2.name='测试'; s2.gender='m'; s2.screen='game'; s2.week=30;
s2.player.attrs=Object.fromEntries(T.ATTRS.map(a=>[a.k,70]));
s2.affection=Object.fromEntries(T.CHARACTERS.map(c=>[c.id, randInt(0,90)]));
s2.energy=2; s2.stamina=70; s2.mood=60; s2.log=['测试日志1','测试日志2']; s2.flags={};
const screens=['game','stats','relations'];
let allClean=true;
for(const sc of screens){ s2.screen=sc; try{ T.render(); }catch(e){ allClean=false; console.log('    render '+sc+' 抛错:', e.message); } if(!noLeak()) allClean=false; }
ok(allClean, '主界面/属性/关系 渲染无异常、无泄漏');

function randInt(a,b){ return Math.floor(Math.random()*(b-a+1))+a; }

console.log('\n结果: '+pass+' 通过, '+fail+' 失败');
process.exit(fail?1:0);

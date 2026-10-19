<template>
  <section class="classic-game" :class="{ 'classic-game--fitted': fittedBoard }" :aria-label="title" @keydown.esc="cancelSelection">
    <header class="game-toolbar">
      <label v-if="toolId==='puzzle'">难度 <AppSelect v-model.number="option" class="sr-glass-control" aria-label="难度"><option :value="3">3 × 3</option><option :value="4">4 × 4</option></AppSelect></label>
      <label v-if="toolId==='minesweeper'">难度 <AppSelect v-model.number="option" class="sr-glass-control" aria-label="难度"><option :value="0">初级 9×9 · 10 雷</option><option :value="1">中级 16×16 · 40 雷</option><option :value="2">高级 30×16 · 99 雷</option></AppSelect></label>
      <label v-if="toolId==='spider'">花色 <AppSelect v-model.number="option" class="sr-glass-control" aria-label="花色"><option :value="1">单花色</option><option :value="2">双花色</option><option :value="4">四花色</option></AppSelect></label>
      <button class="sr-glass-control" type="button" :disabled="loading" @click="confirmNew=true">开始新局</button>
      <button v-if="confirmNew" class="sr-glass-control" type="button" :disabled="blocked" @click="startNew">确认替换本局</button>
      <button v-if="confirmNew" class="sr-glass-control" type="button" @click="confirmNew=false">保留本局</button>
      <button class="sr-glass-control" type="button" :aria-pressed="manualPause" @click="manualPause=!manualPause">{{ manualPause?'继续':'暂停' }}</button>
      <span role="status">{{ status }}</span>
    </header>
    <p v-if="notice" role="status" class="game-notice">{{ notice }}</p>
    <p v-if="loading">正在读取本机存档…</p>
    <div v-else-if="game" class="classic-scroll" :inert="blocked || undefined">
      <template v-if="game.toolId==='puzzle'">
        <p>选择两个方块交换位置，恢复完整风景。已交换 {{ game.moves }} 次。</p>
        <div class="puzzle-grid" :style="{gridTemplateColumns:`repeat(${game.size},1fr)`}">
          <button v-for="(tile,index) in game.tiles" :key="index" type="button" :aria-label="`位置 ${index+1}，图片块 ${tile+1}`" :aria-pressed="selectedTile===index" :style="{backgroundImage:`url(${puzzleImage})`,backgroundSize:`${game.size*100}% ${game.size*100}%`,backgroundPosition:`${tile%game.size/(game.size-1)*100}% ${Math.floor(tile/game.size)/(game.size-1)*100}%`}" @click="puzzleClick(index)"><span>{{ tile+1 }}</span></button>
        </div>
      </template>
      <template v-else-if="game.toolId==='game2048'">
        <p>分数 {{ game.score }} · 方向键、滑动或方向按钮操作。合成 2048 后可继续。</p>
        <div class="board-2048" tabindex="0" aria-label="2048 棋盘" @keydown="key2048" @pointerdown="swipeStart" @pointerup="swipeEnd" @pointercancel="pointer=null" @lostpointercapture="pointer=null">
          <div v-for="(value,index) in game.board" :key="index" :class="{'numbered':value>0}" :data-value="value">{{ value||'' }}</div>
        </div>
        <div class="direction-controls"><button v-for="item in directions" :key="item.key" class="sr-glass-control" type="button" :aria-label="`向${item.label}移动`" @click="shift(item.key)">{{ item.symbol }}</button></div>
      </template>
      <template v-else-if="game.toolId==='minesweeper'">
        <div ref="fitViewport" class="board-viewport">
          <div class="fitted-size" :style="fitSizeStyle">
            <div class="mines-grid" :style="{...fitTransformStyle,gridTemplateColumns:`repeat(${MINES_LEVELS[game.difficulty].width},34px)`}" aria-label="扫雷棋盘">
              <button v-for="cell in MINES_LEVELS[game.difficulty].width*MINES_LEVELS[game.difficulty].height" :key="cell" type="button" :tabindex="mineFocus===cell-1?0:-1" :aria-label="mineLabel(cell-1)" :class="{revealed:game.revealed.includes(cell-1)}" @focus="mineFocus=cell-1" @keydown="mineKey($event,cell-1)" @click="mineClick(cell-1)" @contextmenu.prevent="mineFlag(cell-1)">{{ mineText(cell-1) }}</button>
            </div>
          </div>
        </div>
        <div class="board-footer"><div class="mine-mode" role="group" aria-label="点按格子的操作"><button type="button" :class="{ 'sr-glass-control': !flagMode }" :aria-pressed="!flagMode" @click="flagMode=false">揭开</button><button type="button" :class="{ 'sr-glass-control': flagMode }" :aria-pressed="flagMode" @click="flagMode=true">插旗</button></div><span>{{ MINES_LEVELS[game.difficulty].count }} 颗雷 · 已标记 {{ game.flags.length }}</span></div>
        <p class="board-help">首次揭开周围安全。右键插旗；方向键移动，Enter 揭开，F 插旗。<span>棋盘 {{ Math.round(boardScale*100) }}% · 小窗口可用键盘精确操作。</span></p>
      </template>
      <template v-else-if="game.toolId==='spider'">
        <div ref="fitViewport" class="board-viewport spider-viewport">
          <div class="fitted-size" :style="fitSizeStyle">
            <div class="spider-table" :style="fitTransformStyle" aria-label="蜘蛛纸牌牌桌">
              <div v-for="(pile,column) in game.columns" :key="column" class="spider-column" :class="{ 'legal-target': legalTarget(column), 'drop-target': drag?.target===column }" :data-column="column" :style="{height:`${naturalHeight}px`}">
                <button class="column-target" type="button" :aria-label="`移至第 ${column+1} 列`" @click="placeCard(column)" @keydown="cardKey($event,column,-1)">{{ column+1 }}</button>
                <button v-for="(card,index) in pile" :key="Math.abs(card)" type="button" class="playing-card" :data-card-index="index" :class="{hidden:card<0,selected:selectedCard?.[0]===column && index>=selectedCard[1],dragging:drag?.active && drag.column===column && index>=drag.index,red:card>0 && spiderSuit(card,game.suits)%2===1}" :style="{top:`${44+index*28}px`}" :disabled="card<0" :aria-label="card<0?`第 ${column+1} 列暗牌`:`第 ${column+1} 列 ${cardText(card,game.suits)}`" :aria-pressed="selectedCard?.[0]===column && selectedCard?.[1]===index" @click="cardClick(column,index)" @keydown="cardKey($event,column,index)" @pointerdown="beginDrag($event,column,index)" @pointermove="moveDrag" @pointerup="endDrag" @pointercancel="cancelDrag" @lostpointercapture="cancelDrag">{{ card<0?'◆':cardText(card,game.suits) }}</button>
              </div>
            </div>
          </div>
        </div>
        <div class="spider-actions"><button class="sr-glass-control" type="button" :disabled="game.stock.length===0 || game.columns.some(pile=>!pile.length)" @click="update(dealSpider(game))">发一排牌（剩 {{ game.stock.length/10 }} 排）</button><button class="sr-glass-control" type="button" :disabled="!game.history.length" @click="update(undoSpider(game));selectedCard=null">撤销（{{ game.history.length }}）</button><span>已收齐 {{ game.completed.length }} / 8 组 · {{ game.moves }} 步</span></div>
        <p class="board-help">拖动同花降序牌段，或点选后点击目标列。Esc 取消。<span>牌桌 {{ Math.round(boardScale*100) }}% · 放大窗口可更清楚地查看叠牌。</span></p>
      </template>
    </div>
    <p v-if="interactionNote" class="interaction-note" role="status">{{ interactionNote }}</p>
    <p v-if="blocked && !loading" class="paused-notice" role="status">{{ manualPause ? '已暂停，点击“继续”恢复。' : '窗口暂时离开，已暂停操作。' }}</p>
    <Teleport to="body"><div v-if="drag?.active && game?.toolId==='spider'" class="spider-drag-ghost" :style="{left:`${drag.x-drag.offsetX}px`,top:`${drag.y-drag.offsetY}px`,height:`${108+(game.columns[drag.column].length-drag.index-1)*28}px`,transform:`scale(${boardScale})`}" aria-hidden="true"><span v-for="(card,index) in game.columns[drag.column].slice(drag.index)" :key="card" class="playing-card" :class="{red:spiderSuit(card,game.suits)%2===1}" :style="{top:`${index*28}px`}">{{ cardText(card,game.suits) }}</span></div></Teleport>
  </section>
</template>
<script setup lang="ts">
import {computed,onMounted,onBeforeUnmount,ref,watch} from 'vue';
import {newPuzzle,swapPuzzle,puzzleWon,new2048,move2048,canMove2048,newMines,revealMine,flagMine,adjacentMines,MINES_LEVELS,newSpider,moveSpider,dealSpider,undoSpider,movableSpider,spiderRank,spiderSuit,type ClassicGame,type ClassicGameId} from '@studyroom/contracts';
import {ClassicStorage} from '../../entertainment/classicStorage';
import {sceneAssetCatalog} from '../../scenes/sceneAssetCatalog';
const props=defineProps<{toolId:ClassicGameId;paused:boolean}>();
const titles={puzzle:'风景拼图',game2048:'2048',minesweeper:'扫雷',spider:'蜘蛛纸牌'};
const title=computed(()=>titles[props.toolId]),game=ref<ClassicGame>(),loading=ref(true),notice=ref(''),manualPause=ref(false),confirmNew=ref(false),selectedTile=ref<number|null>(null),selectedCard=ref<[number,number]|null>(null),flagMode=ref(false);
const option=ref(props.toolId==='puzzle'?3:props.toolId==='minesweeper'?0:1),storage=new ClassicStorage(props.toolId);let disposed=false;
const blocked=computed(()=>props.paused || manualPause.value || loading.value);
const fittedBoard=computed(()=>props.toolId==='minesweeper' || props.toolId==='spider');
const fitViewport=ref<HTMLElement>(),viewportSize=ref({width:0,height:0}),mineFocus=ref(0),interactionNote=ref('');
const naturalWidth=computed(()=>game.value?.toolId==='minesweeper'?MINES_LEVELS[game.value.difficulty].width*36-2:932);
const naturalHeight=computed(()=>game.value?.toolId==='minesweeper'?MINES_LEVELS[game.value.difficulty].height*36-2:game.value?.toolId==='spider'?44+108+Math.max(0,...game.value.columns.map(pile=>pile.length-1))*28:330);
const boardMeasured=computed(()=>viewportSize.value.width>0 && viewportSize.value.height>0);
const boardScale=computed(()=>boardMeasured.value?Math.min(1,viewportSize.value.width/naturalWidth.value,viewportSize.value.height/naturalHeight.value):1);
const fitSizeStyle=computed(()=>({width:`${naturalWidth.value*boardScale.value}px`,height:`${naturalHeight.value*boardScale.value}px`,visibility:boardMeasured.value?'visible' as const:'hidden' as const}));
const fitTransformStyle=computed(()=>({width:`${naturalWidth.value}px`,height:`${naturalHeight.value}px`,transform:`scale(${boardScale.value})`,transformOrigin:'top left'}));
let resizeObserver:ResizeObserver|undefined;
function setViewportSize(width:number,height:number){
  if(Math.abs(width-viewportSize.value.width)<.01 && Math.abs(height-viewportSize.value.height)<.01)return;
  cancelDrag();viewportSize.value={width:Math.max(0,width),height:Math.max(0,height)};
}
watch(fitViewport,element=>{
  resizeObserver?.disconnect();if(!element){viewportSize.value={width:0,height:0};return;}
  // Measure the mounted content box immediately: ResizeObserver's first delivery
  // may be late under load and must not expose a tiny, interactive placeholder.
  const bounds=element.getBoundingClientRect(),style=getComputedStyle(element);
  const pixels=(value:string)=>Number.parseFloat(value)||0;
  setViewportSize(bounds.width-pixels(style.borderLeftWidth)-pixels(style.borderRightWidth)-pixels(style.paddingLeft)-pixels(style.paddingRight),
    bounds.height-pixels(style.borderTopWidth)-pixels(style.borderBottomWidth)-pixels(style.paddingTop)-pixels(style.paddingBottom));
  resizeObserver=new ResizeObserver(entries=>{const rect=entries[0]?.contentRect;if(rect)setViewportSize(rect.width,rect.height);});
  resizeObserver.observe(element);
},{flush:'post'});
const puzzleImage=sceneAssetCatalog.mountain.afternoon.standard.jpg;
type Direction='left'|'right'|'up'|'down';const directions:Array<{key:Direction;label:string;symbol:string}>=[{key:'left',label:'左',symbol:'←'},{key:'up',label:'上',symbol:'↑'},{key:'down',label:'下',symbol:'↓'},{key:'right',label:'右',symbol:'→'}];
const status=computed(()=>{const s=game.value;if(!s)return '';if(s.toolId==='puzzle')return puzzleWon(s)?'拼图完成':'交换拼图';if(s.toolId==='game2048')return !canMove2048(s)?'没有可移动方向':s.won?'已达成 2048，可继续':'合成 2048';if(s.toolId==='minesweeper')return {ready:'等待首次揭开',playing:'进行中',won:'全部安全格已揭开',lost:'踩到地雷，本局结束'}[s.status];return s.completed.length===8?'八组全部收齐':'同花色 K → A 自动收牌';});
function factory():ClassicGame{const generation=crypto.randomUUID();switch(props.toolId){case'puzzle':return newPuzzle(option.value===4?4:3,generation);case'game2048':return new2048(generation);case'minesweeper':return newMines(option.value===2?2:option.value===1?1:0,generation);case'spider':return newSpider(option.value===4?4:option.value===2?2:1,generation);}}
function persist(value:ClassicGame){void storage.save(value).catch(()=>{if(!disposed)notice.value=storage.reason;});}
function update(value:ClassicGame){if(blocked.value || value===game.value)return;cancelDrag();game.value=value;interactionNote.value='';persist(value);}
function startNew(){if(blocked.value)return;selectedTile.value=null;selectedCard.value=null;game.value=factory();confirmNew.value=false;persist(game.value);}
function puzzleClick(index:number){if(game.value?.toolId!=='puzzle' || blocked.value)return;if(selectedTile.value===null)selectedTile.value=index;else{update(swapPuzzle(game.value,selectedTile.value,index));selectedTile.value=null;}}
function shift(direction:Direction){if(game.value?.toolId==='game2048')update(move2048(game.value,direction));}
function key2048(event:KeyboardEvent){const map:Record<string,Direction>={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down'};if(map[event.key]){event.preventDefault();shift(map[event.key]!);}}
let pointer:{id:number;x:number;y:number}|null=null;
function swipeStart(event:PointerEvent){if(pointer || event.button!==0 || blocked.value)return;pointer={id:event.pointerId,x:event.clientX,y:event.clientY};(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);}
function swipeEnd(event:PointerEvent){if(!pointer || pointer.id!==event.pointerId)return;const x=event.clientX-pointer.x,y=event.clientY-pointer.y;pointer=null;if(Math.max(Math.abs(x),Math.abs(y))<24)return;shift(Math.abs(x)>Math.abs(y)?x>0?'right':'left':y>0?'down':'up');}
function mineClick(cell:number){if(game.value?.toolId==='minesweeper')update(flagMode.value?flagMine(game.value,cell):revealMine(game.value,cell));}
function mineFlag(cell:number){if(game.value?.toolId==='minesweeper')update(flagMine(game.value,cell));}
function mineKey(event:KeyboardEvent,cell:number){if(game.value?.toolId!=='minesweeper')return;const {width,height}=MINES_LEVELS[game.value.difficulty],steps:Record<string,number>={ArrowLeft:-1,ArrowRight:1,ArrowUp:-width,ArrowDown:width};if(event.key in steps){event.preventDefault();mineFocus.value=Math.max(0,Math.min(width*height-1,cell+steps[event.key]!));fitViewport.value?.querySelectorAll<HTMLButtonElement>('.mines-grid button')[mineFocus.value]?.focus({preventScroll:true});}else if(event.key.toLowerCase()==='f'){event.preventDefault();mineFlag(cell);}else if(event.key==='Enter'){event.preventDefault();if(game.value)update(revealMine(game.value,cell));}}
function mineText(cell:number){const s=game.value;if(s?.toolId!=='minesweeper')return '';if(s.status==='lost' && s.mines.includes(cell))return '✹';if(s.flags.includes(cell))return '⚑';return s.revealed.includes(cell)?adjacentMines(s,cell)||'·':'';}
function mineLabel(cell:number){const s=game.value;if(s?.toolId!=='minesweeper')return '';return `第 ${Math.floor(cell/MINES_LEVELS[s.difficulty].width)+1} 行，第 ${cell%MINES_LEVELS[s.difficulty].width+1} 格，${mineText(cell)||'未揭开'}`;}
function cardText(card:number,suits:1|2|4){const rank=spiderRank(card);return `${['♠','♥','♣','♦'][spiderSuit(card,suits)]}${rank===1?'A':rank===11?'J':rank===12?'Q':rank===13?'K':rank}`;}
let suppressClickUntil=0;
type CardDrag={id:number;element:HTMLElement;column:number;index:number;generation:string;revision:number;startX:number;startY:number;x:number;y:number;offsetX:number;offsetY:number;active:boolean;target:number|null};
const drag=ref<CardDrag|null>(null);
function legalTarget(column:number){const s=game.value,selected=selectedCard.value;if(s?.toolId!=='spider' || !selected)return false;return moveSpider(s,selected[0],selected[1],column)!==s;}
function cardClick(column:number,index:number){if(performance.now()<suppressClickUntil || blocked.value || game.value?.toolId!=='spider')return;if(selectedCard.value && selectedCard.value[0]!==column){placeCard(column);return;}if(movableSpider(game.value,column,index)){selectedCard.value=[column,index];interactionNote.value='已选中牌段，请选择高亮目标列。';}else interactionNote.value='只能移动同花色连续降序的明牌段。';}
function placeCard(column:number){if(performance.now()<suppressClickUntil || game.value?.toolId!=='spider' || !selectedCard.value)return;const next=moveSpider(game.value,selectedCard.value[0],selectedCard.value[1],column);if(next!==game.value){update(next);selectedCard.value=null;}else interactionNote.value='此列不能放置所选牌段，请选择高亮目标或按 Esc 取消。';}
function beginDrag(event:PointerEvent,column:number,index:number){const s=game.value;if(drag.value || blocked.value || event.button!==0 || s?.toolId!=='spider' || !movableSpider(s,column,index))return;const element=event.currentTarget as HTMLElement,rect=element.getBoundingClientRect();drag.value={id:event.pointerId,element,column,index,generation:s.generation,revision:s.revision,startX:event.clientX,startY:event.clientY,x:event.clientX,y:event.clientY,offsetX:event.clientX-rect.left,offsetY:event.clientY-rect.top,active:false,target:null};element.setPointerCapture(event.pointerId);}
function moveDrag(event:PointerEvent){const d=drag.value;if(!d || d.id!==event.pointerId)return;d.x=event.clientX;d.y=event.clientY;if(!d.active && Math.hypot(d.x-d.startX,d.y-d.startY)<6)return;d.active=true;selectedCard.value=[d.column,d.index];event.preventDefault();const target=document.elementFromPoint(d.x,d.y)?.closest<HTMLElement>('.spider-column');d.target=target && fitViewport.value?.contains(target)?Number(target.dataset.column):null;}
function endDrag(event:PointerEvent){const d=drag.value;if(!d || d.id!==event.pointerId)return;const s=game.value;const active=d.active,target=d.target;cancelDrag();if(!active)return;suppressClickUntil=performance.now()+300;if(blocked.value || s?.toolId!=='spider' || s.generation!==d.generation || s.revision!==d.revision)return;if(target!==null){const next=moveSpider(s,d.column,d.index,target);if(next!==s){update(next);selectedCard.value=null;return;}}interactionNote.value='未放入合法目标，牌段已回到原位。';selectedCard.value=null;}
function cancelDrag(){const d=drag.value;drag.value=null;if(d?.active)suppressClickUntil=performance.now()+300;if(d?.element.hasPointerCapture(d.id))d.element.releasePointerCapture(d.id);}
function cancelSelection(){cancelDrag();selectedCard.value=null;selectedTile.value=null;interactionNote.value='';}
function cardKey(event:KeyboardEvent,column:number,index:number){
  const s=game.value;if(s?.toolId!=='spider' || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
  event.preventDefault();let destination=column,targetIndex=index;
  if(event.key==='ArrowLeft' || event.key==='ArrowRight'){destination=Math.max(0,Math.min(9,column+(event.key==='ArrowLeft'?-1:1)));targetIndex=Math.min(index,s.columns[destination]!.length-1);}
  else targetIndex+=event.key==='ArrowUp'?-1:1;
  const pile=s.columns[destination]!;targetIndex=Math.min(targetIndex,pile.length-1);
  if(targetIndex>=0 && pile[targetIndex]!<0){const first=pile.findIndex(card=>card>0);targetIndex=event.key==='ArrowUp'?-1:first;}
  const selector=targetIndex<0?'.column-target':`[data-card-index="${targetIndex}"]`;
  fitViewport.value?.querySelector<HTMLButtonElement>(`[data-column="${destination}"] ${selector}`)?.focus({preventScroll:true});
}
watch(blocked,value=>{if(value){pointer=null;cancelSelection();}});
onMounted(async()=>{const saved=await storage.open();if(disposed){await storage.close();return;}game.value=saved||factory();if(saved){if(saved.toolId==='puzzle')option.value=saved.size;if(saved.toolId==='minesweeper')option.value=saved.difficulty;if(saved.toolId==='spider')option.value=saved.suits;}notice.value=storage.reason;loading.value=false;if(!saved)persist(game.value);});
onMounted(()=>{window.addEventListener('blur',cancelSelection);document.addEventListener('visibilitychange',cancelSelection);window.addEventListener('resize',cancelSelection);});
onBeforeUnmount(()=>{disposed=true;pointer=null;cancelDrag();resizeObserver?.disconnect();window.removeEventListener('blur',cancelSelection);document.removeEventListener('visibilitychange',cancelSelection);window.removeEventListener('resize',cancelSelection);void storage.close();});
</script>
<style scoped>
.classic-game{min-width:0;max-width:100%}.classic-scroll{min-width:0;width:100%;max-width:100%;box-sizing:border-box}.game-toolbar{min-width:0}.game-toolbar label{max-width:100%}.spider-actions>span{font-size:13px}.classic-scroll p{max-width:100%;white-space:normal}
.classic-game{display:flex;flex-direction:column;gap:12px;min-height:0;position:relative}.game-toolbar,.spider-actions,.direction-controls{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.game-toolbar span{margin-left:auto;font-size:13px;color:#d7e4d7}button,select{font:inherit;color:inherit;border:1px solid #ffffff40;background:#ffffff0c;border-radius:8px;min-height:40px;padding:6px 12px;cursor:pointer}button:disabled{opacity:.5;cursor:default}option{background:#17251f}.classic-scroll{overflow:auto;min-height:0;flex:1;padding:4px 4px 18px;overscroll-behavior:contain}.classic-scroll p{font-size:13px;color:#c3d1c6;line-height:1.6}.puzzle-grid{display:grid;gap:3px;max-width:480px;aspect-ratio:1;}.puzzle-grid button{min-width:0;aspect-ratio:1;border-radius:4px;border:2px solid transparent;position:relative}.puzzle-grid button[aria-pressed=true]{border-color:#fff;outline:3px solid #b1d789;z-index:1}.puzzle-grid span{position:absolute;top:4px;left:4px;background:#07110da8;font-size:12px;border-radius:4px;padding:3px}.board-2048{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:10px;max-width:400px;aspect-ratio:1;background:#59615a;border-radius:12px;touch-action:none}.board-2048>div{display:grid;place-items:center;min-width:0;border-radius:7px;background:#313f37;color:#17271b;font:bold clamp(19px,4vw,34px) ui-sans-serif}.board-2048 .numbered{background:#d0d9ba}.board-2048 [data-value="2"]{background:#e4e6d9}.board-2048 [data-value="4"]{background:#dadfc3}.board-2048 [data-value="2048"]{background:#e8c773}.direction-controls{margin-top:12px}.direction-controls button{min-width:60px}.mines-grid{display:grid;gap:2px;width:max-content;margin-top:12px}.mines-grid button{min-height:34px;padding:0;border-radius:4px;font-weight:bold}.mines-grid .revealed{background:#d1dfd0;color:#203e2a;border-color:#d1dfd0}.spider-table{display:grid;grid-template-columns:repeat(10,76px);gap:10px;width:max-content;min-height:330px;padding-bottom:20px}.spider-column{display:flex;flex-direction:column}.column-target{margin-bottom:14px;min-height:44px}.playing-card{height:94px;min-height:94px;background:#eeeede;color:#1b2e23;text-align:left;display:flex;align-items:flex-start;padding:6px;font:bold 18px ui-serif;border-radius:7px;border-color:#d7dcce}.playing-card~.playing-card{margin-top:-65px}.playing-card.hidden{background:repeating-linear-gradient(45deg,#294339,#294339 4px,#365648 4px,#365648 7px);opacity:1;color:#9ebfac;min-height:50px;height:50px}.playing-card.hidden~.playing-card{margin-top:-29px}.playing-card.red{color:#a53a37}.playing-card.selected{outline:3px solid #f2cd68;outline-offset:-3px;background:#fff3cb}.game-notice{margin:0;color:#ffe2ac;font-size:13px}.paused-notice{position:absolute;inset:90px 0 auto;padding:24px;background:#15231feb;border:1px solid #627c6c;text-align:center;z-index:3}button:focus-visible,.board-2048:focus-visible{outline:3px solid #e1c77e;outline-offset:2px}@media(max-width:600px){.game-toolbar{gap:6px}.game-toolbar span{width:100%;margin:0}.classic-scroll{max-width:100%}.classic-game{min-height:500px}.board-2048{gap:5px}.spider-table{grid-template-columns:repeat(10,68px);gap:8px}.playing-card{font-size:16px}}
.classic-game{gap:12px;height:100%}button,select{min-height:44px;border-radius:var(--sr-radius-control,12px);font-size:13px;font-weight:600;white-space:nowrap;transition:background-color 140ms ease,border-color 140ms ease;touch-action:manipulation}.game-toolbar{gap:8px}.game-toolbar label{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--sr-color-text-muted)}.game-toolbar span{font-variant-numeric:tabular-nums}.classic-scroll{padding:0;scrollbar-gutter:stable}.classic-game--fitted .classic-scroll{display:flex;flex-direction:column;overflow:hidden;gap:10px}.board-viewport{display:grid;place-items:center;min-height:100px;min-width:0;flex:1;overflow:hidden;border-radius:var(--sr-radius-panel,20px);background:rgba(4,15,10,.22);contain:layout paint}.fitted-size{position:relative;flex:none}.mines-grid{position:absolute;left:0;top:0;margin:0;gap:2px}.mines-grid button{height:34px;min-height:34px;width:34px;min-width:34px;border-radius:5px;font-size:15px;padding:0;touch-action:manipulation}.board-footer,.spider-actions{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px}.board-footer>span,.spider-actions>span{font-size:12px;font-variant-numeric:tabular-nums;color:var(--sr-color-text-muted)}.mine-mode{display:flex;gap:4px;padding:3px;border-radius:14px;background:rgba(3,11,7,.3);border:1px solid var(--sr-color-line)}.mine-mode button{min-width:90px;border:0;background:transparent}.mine-mode button[aria-pressed=true]{background:#dce7d2;color:#1e2c22}.board-help{margin:0!important;display:flex;flex-wrap:wrap;gap:4px 16px;font-size:11px!important;color:var(--sr-color-text-muted)!important}.board-help span{margin-left:auto}.spider-table{position:absolute;top:0;left:0;display:grid;grid-template-columns:repeat(10,86px);gap:8px;min-height:0;padding:0;box-sizing:border-box}.spider-column{position:relative;display:block;border-radius:8px}.column-target{position:absolute;inset:0 0 auto;width:86px;min-height:36px;height:36px;margin:0;background:rgba(228,240,219,.04);border-style:dashed;font-variant-numeric:tabular-nums}.playing-card{position:absolute;display:block;box-sizing:border-box;width:86px;height:108px;min-height:108px;margin:0!important;padding:5px 7px;text-align:left;vertical-align:top;font:700 19px/1.2 var(--sr-font-sans);border-radius:8px;touch-action:none;user-select:none;cursor:grab;box-shadow:0 1px 3px #07130b55}.playing-card.hidden{height:108px;min-height:108px;opacity:1}.playing-card.dragging{opacity:.25}.spider-column.legal-target .column-target{border-color:#c6ddad;background:#bcd79a20}.spider-column.drop-target.legal-target{box-shadow:inset 0 0 0 2px #c6ddad;background:#bcd79a18}.spider-drag-ghost{position:fixed;z-index:100;pointer-events:none;transform-origin:top left;width:86px;filter:drop-shadow(0 12px 14px #0005)}.spider-drag-ghost .playing-card{cursor:grabbing}.interaction-note{margin:0;font-size:12px;color:#dce7cc;min-height:18px}.paused-notice{inset:70px 12px auto;border-radius:var(--sr-radius-panel,20px);padding:20px;pointer-events:none}.puzzle-grid,.board-2048{margin-inline:auto}.puzzle-grid{width:min(100%,420px)}.board-2048{width:min(100%,380px);box-sizing:border-box}.direction-controls{justify-content:center}.board-2048:focus-visible{outline:2px solid var(--sr-color-accent);outline-offset:3px}
@media(hover:hover) and (pointer:fine){button:hover:not(:disabled){border-color:#dce7cd88;background-color:#dce7cd15}.playing-card:hover:not(:disabled){background-color:#f4f5e9}}
@media(max-width:600px){.classic-game{min-height:0;gap:10px}.game-toolbar{gap:6px}.game-toolbar label{flex:1}.game-toolbar select{min-width:0;max-width:100%}.game-toolbar span{width:100%;font-size:11px}.game-toolbar button{padding-inline:10px;font-size:12px}.board-help{font-size:10px!important}.board-help span{margin-left:0;width:100%}.spider-actions{gap:6px}.spider-actions>span{width:100%}.spider-actions button{font-size:11px;padding-inline:10px}.board-footer{gap:6px}.mine-mode button{min-width:70px}.board-viewport{min-height:90px}.classic-game--fitted .classic-scroll{gap:8px}.interaction-note{font-size:11px}}
.classic-game--fitted .game-toolbar{order:2;padding-top:10px;border-top:1px solid var(--sr-color-line)}.classic-game--fitted .game-notice{order:3}.classic-game--fitted .interaction-note{order:4}
/* Glass belongs to surrounding chrome, never the playing cards or game cells. */
.board-2048{grid-template-columns:repeat(4,minmax(0,1fr));grid-template-rows:repeat(4,minmax(0,1fr))}
.board-2048>div{min-height:0;overflow:hidden}
.game-toolbar span,.classic-scroll p,.interaction-note{color:var(--sr-color-text-muted)}
.game-toolbar button,.game-toolbar select,.spider-actions button,.direction-controls button{color:var(--sr-color-text)}
option{background:var(--sr-color-surface-solid);color:var(--sr-color-text)}
.game-toolbar button[aria-pressed=true]{background:var(--sr-color-accent)!important;color:var(--sr-color-accent-ink)}
.mine-mode{background:rgba(10,15,23,.26);box-shadow:inset 0 1px 3px rgba(0,0,0,.16)}.mine-mode button[aria-pressed=true]{color:var(--sr-color-text)}
.board-viewport{background:rgba(10,15,23,.24);box-shadow:inset 0 1px 0 rgba(255,255,255,.07)}
.paused-notice{background:var(--sr-color-surface-solid);border-color:var(--sr-material-edge);box-shadow:var(--sr-material-shadow);color:var(--sr-color-text)}
</style>

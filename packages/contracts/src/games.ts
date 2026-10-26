/** Pure classic rules. No clocks, DOM, storage or ambient audio; randomness is injectable. */
export const CLASSIC_GAME_IDS=['puzzle','game2048','minesweeper','spider'] as const;
export type ClassicGameId=typeof CLASSIC_GAME_IDS[number];
type Base={version:1;generation:string;revision:number};
export type PuzzleGame=Base&{toolId:'puzzle';size:3|4|6;tiles:number[];moves:number};
export type Game2048=Base&{toolId:'game2048';board:number[];score:number;won:boolean};
export type MinesGame=Base&{toolId:'minesweeper';difficulty:0|1|2;mines:number[];revealed:number[];flags:number[];status:'ready'|'playing'|'won'|'lost'};
export type SpiderCollection=[column:number,cards:number[],flipped:boolean];
export type SpiderAction={kind:'move'|'deal';from:number;to:number;count:number;flipped:boolean;collected:SpiderCollection[]};
export type SpiderGame=Base&{toolId:'spider';suits:1|2|4;initial:number[];columns:number[][];stock:number[];completed:number[][];history:SpiderAction[];moves:number};
export type ClassicGame=PuzzleGame|Game2048|MinesGame|SpiderGame;
export type Random=()=>number;
const clone=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
function index(length:number,random:Random){const value=random();if(!Number.isFinite(value) || value<0 || value>=1)throw new Error('GAME_RANDOM_INVALID');return Math.floor(value*length);}
export function shuffled<T>(items:readonly T[],random:Random):T[]{const result=[...items];for(let i=result.length-1;i>0;i--){const j=index(i+1,random);[result[i],result[j]]=[result[j]!,result[i]!];}return result;}
const base=(generation:string):Base=>({version:1,generation,revision:0});
export function newPuzzle(size:3|4|6,generation:string,random:Random=Math.random):PuzzleGame{
  if(![3,4,6].includes(size))throw new Error('PUZZLE_SIZE_INVALID');
  const tiles=shuffled(Array.from({length:size*size},(_,i)=>i),random);if(tiles.every((n,i)=>n===i))[tiles[0],tiles[1]]=[tiles[1]!,tiles[0]!];
  return{...base(generation),toolId:'puzzle',size,tiles,moves:0};
}
export function puzzleWon(state:PuzzleGame){return state.tiles.every((tile,i)=>tile===i);}
export function swapPuzzle(state:PuzzleGame,a:number,b:number):PuzzleGame{
  if(a===b || !Number.isInteger(a) || !Number.isInteger(b) || a<0 || b<0 || a>=state.tiles.length || b>=state.tiles.length || puzzleWon(state))return state;
  const next=clone(state);[next.tiles[a],next.tiles[b]]=[next.tiles[b]!,next.tiles[a]!];next.moves++;next.revision++;return next;
}
function spawn2048(board:number[],random:Random){const empty=board.map((v,i)=>v===0?i:-1).filter(i=>i>=0);if(empty.length)board[empty[index(empty.length,random)]!]=index(10,random)===0?4:2;}
export function new2048(generation:string,random:Random=Math.random):Game2048{const state:Game2048={...base(generation),toolId:'game2048',board:Array(16).fill(0),score:0,won:false};spawn2048(state.board,random);spawn2048(state.board,random);return state;}
export function canMove2048(state:Game2048){return state.board.some((value,i)=>!value || i%4<3 && state.board[i+1]===value || i<12 && state.board[i+4]===value);}
export function move2048(state:Game2048,direction:'left'|'right'|'up'|'down',random:Random=Math.random):Game2048{
  const next=clone(state);let gained=0;
  for(let line=0;line<4;line++){
    const positions=Array.from({length:4},(_,i)=>direction==='left'?line*4+i:direction==='right'?line*4+3-i:direction==='up'?i*4+line:(3-i)*4+line);
    const values=positions.map(i=>state.board[i]!).filter(Boolean),merged:number[]=[];
    for(let i=0;i<values.length;i++){let value=values[i]!;if(values[i+1]===value){value*=2;gained+=value;i++;}merged.push(value);}
    positions.forEach((position,i)=>next.board[position]=merged[i]||0);
  }
  if(next.board.every((value,i)=>value===state.board[i]))return state;
  next.score+=gained;next.won=state.won || next.board.some(value=>value>=2048);spawn2048(next.board,random);next.revision++;return next;
}
export const MINES_LEVELS=[{width:9,height:9,count:10},{width:16,height:16,count:40},{width:30,height:16,count:99}] as const;
export function mineNeighbors(state:MinesGame,cell:number){const {width,height}=MINES_LEVELS[state.difficulty],x=cell%width,y=Math.floor(cell/width),result:number[]=[];for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if((dx||dy) && x+dx>=0 && x+dx<width && y+dy>=0 && y+dy<height)result.push((y+dy)*width+x+dx);return result;}
export function adjacentMines(state:MinesGame,cell:number){return mineNeighbors(state,cell).filter(i=>state.mines.includes(i)).length;}
export function newMines(difficulty:0|1|2,generation:string):MinesGame{return{...base(generation),toolId:'minesweeper',difficulty,mines:[],revealed:[],flags:[],status:'ready'};}
export function flagMine(state:MinesGame,cell:number):MinesGame{
  const {width,height}=MINES_LEVELS[state.difficulty];if(!Number.isInteger(cell) || cell<0 || cell>=width*height || state.revealed.includes(cell) || ['won','lost'].includes(state.status))return state;
  const next=clone(state);next.flags=next.flags.includes(cell)?next.flags.filter(i=>i!==cell):[...next.flags,cell].sort((a,b)=>a-b);next.revision++;return next;
}
export function revealMine(state:MinesGame,cell:number,random:Random=Math.random):MinesGame{
  const {width,height,count}=MINES_LEVELS[state.difficulty];if(!Number.isInteger(cell) || cell<0 || cell>=width*height || state.flags.includes(cell) || ['won','lost'].includes(state.status))return state;
  const next=clone(state);
  if(next.status==='ready'){
    const safe=new Set([cell,...mineNeighbors(next,cell)]);next.mines=shuffled(Array.from({length:width*height},(_,i)=>i).filter(i=>!safe.has(i)),random).slice(0,count).sort((a,b)=>a-b);next.status='playing';
  }
  let queue=[cell];
  if(next.revealed.includes(cell)){
    const near=mineNeighbors(next,cell);if(near.filter(i=>next.flags.includes(i)).length!==adjacentMines(next,cell))return state;
    queue=near.filter(i=>!next.revealed.includes(i) && !next.flags.includes(i));
  }
  const revealed=new Set(next.revealed);
  while(queue.length){const at=queue.pop()!;if(revealed.has(at) || next.flags.includes(at))continue;revealed.add(at);if(next.mines.includes(at)){next.status='lost';break;}if(adjacentMines(next,at)===0)queue.push(...mineNeighbors(next,at).filter(i=>!revealed.has(i)));}
  next.revealed=[...revealed].sort((a,b)=>a-b);if(next.status!=='lost' && next.revealed.length===width*height-count)next.status='won';
  if(next.revealed.length===state.revealed.length && next.status===state.status)return state;next.revision++;return next;
}
// Cards are signed (identity+1): negative face down, positive face up. Both decks retain unique identity.
export function spiderRank(card:number){return(Math.abs(card)-1)%13+1;}
export function spiderSuit(card:number,suits:1|2|4){return Math.floor((Math.abs(card)-1)/13)%suits;}
export function newSpider(suits:1|2|4,generation:string,random:Random=Math.random):SpiderGame{
  const initial=shuffled(Array.from({length:104},(_,i)=>i+1),random),columns=Array.from({length:10},()=>[] as number[]);
  for(let i=0;i<54;i++)columns[i%10]!.push(-initial[i]!);for(const pile of columns)pile[pile.length-1]=-pile[pile.length-1]!;
  return{...base(generation),toolId:'spider',suits,initial,columns,stock:initial.slice(54),completed:[],history:[],moves:0};
}
export function movableSpider(state:SpiderGame,column:number,start:number){
  const pile=state.columns[column];if(!pile || !Number.isInteger(start) || start<0 || start>=pile.length)return false;
  return pile.slice(start).every((card,i,tail)=>card>0 && (i===0 || spiderRank(tail[i-1]!)===spiderRank(card)+1 && spiderSuit(tail[i-1]!,state.suits)===spiderSuit(card,state.suits)));
}
function flip(pile:number[]){if(pile.length && pile[pile.length-1]!<0){pile[pile.length-1]=-pile[pile.length-1]!;return true;}return false;}
function collectSpider(state:SpiderGame,action:SpiderAction){
  for(let column=0;column<10;column++){
    const pile=state.columns[column]!;
    while(pile.length>=13 && spiderRank(pile[pile.length-13]!)===13 && movableSpider(state,column,pile.length-13)){
      const cards=pile.splice(-13);state.completed.push(cards);action.collected.push([column,cards,flip(pile)]);
    }
  }
}
function finishSpider(state:SpiderGame,action:SpiderAction){collectSpider(state,action);state.history.push(action);if(state.history.length>100)state.history.shift();state.moves++;state.revision++;return state;}
export function moveSpider(state:SpiderGame,from:number,start:number,to:number):SpiderGame{
  if(!Number.isInteger(from) || !Number.isInteger(to) || from===to || to<0 || to>=10 || !movableSpider(state,from,start))return state;
  const target=state.columns[to]!,card=state.columns[from]![start]!;
  if(target.length && spiderRank(target[target.length-1]!)!==spiderRank(card)+1)return state;
  const next=clone(state),moving=next.columns[from]!.splice(start);next.columns[to]!.push(...moving);
  return finishSpider(next,{kind:'move',from,to,count:moving.length,flipped:flip(next.columns[from]!),collected:[]});
}
export function dealSpider(state:SpiderGame):SpiderGame{
  if(state.stock.length<10 || state.columns.some(pile=>!pile.length))return state;
  const next=clone(state),cards=next.stock.splice(-10);next.columns.forEach((pile,i)=>pile.push(cards[i]!));
  return finishSpider(next,{kind:'deal',from:0,to:0,count:10,flipped:false,collected:[]});
}
export function undoSpider(state:SpiderGame):SpiderGame{
  if(!state.history.length)return state;const next=clone(state),action=next.history.pop()!;
  for(const [column,cards,flipped] of [...action.collected].reverse()){
    const pile=next.columns[column]!;if(flipped)pile[pile.length-1]=-pile[pile.length-1]!;
    pile.push(...cards);next.completed.pop();
  }
  if(action.kind==='move'){
    const from=next.columns[action.from]!,to=next.columns[action.to]!;
    if(action.flipped)from[from.length-1]=-from[from.length-1]!;from.push(...to.splice(-action.count));
  }else next.stock.push(...next.columns.map(pile=>pile.pop()!));
  next.moves--;next.revision++;return next;
}

const integer=(value:unknown,min:number,max:number):value is number=>Number.isSafeInteger(value) && Number(value)>=min && Number(value)<=max;
function list(value:unknown,min:number,max:number,limit:number):value is number[]{return Array.isArray(value) && value.length<=limit && value.every(n=>integer(n,min,max));}
function unique(values:number[]){return new Set(values).size===values.length;}
/** Fail closed on bad/unknown saves. Never call a new-game factory to "repair" a persisted record. */
export function isClassicGame(value:unknown):value is ClassicGame{
  try{
    if(!value || typeof value!=='object' || new TextEncoder().encode(JSON.stringify(value)).length>32768)return false;
    const s=value as any;if(s.version!==1 || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s.generation) || !integer(s.revision,0,Number.MAX_SAFE_INTEGER))return false;
    const keys=(names:string[])=>Object.keys(s).every(key=>['version','generation','revision','toolId',...names].includes(key));
    if(s.toolId==='puzzle')return keys(['size','tiles','moves']) && [3,4,6].includes(s.size) && list(s.tiles,0,s.size*s.size-1,s.size*s.size) && s.tiles.length===s.size*s.size && unique(s.tiles) && integer(s.moves,0,s.revision);
    if(s.toolId==='game2048')return keys(['board','score','won']) && list(s.board,0,2**40,16) && s.board.length===16 && s.board.every((v:number)=>v===0 || v>=2 && Number.isInteger(Math.log2(v))) && integer(s.score,0,Number.MAX_SAFE_INTEGER) && typeof s.won==='boolean';
    if(s.toolId==='minesweeper'){
      if(!keys(['difficulty','mines','revealed','flags','status']) || ![0,1,2].includes(s.difficulty))return false;const {width,height,count}=MINES_LEVELS[s.difficulty as 0|1|2],cells=width*height;
      if(!['ready','playing','won','lost'].includes(s.status) || ![s.mines,s.revealed,s.flags].every(v=>list(v,0,cells-1,cells) && unique(v)) || s.revealed.some((i:number)=>s.flags.includes(i)))return false;
      if(s.status==='ready')return s.mines.length===0 && s.revealed.length===0;
      const hit=s.revealed.some((i:number)=>s.mines.includes(i));return s.mines.length===count && (s.status==='lost'?hit:!hit) && (s.status==='won'?s.revealed.length===cells-count:s.status!=='playing' || s.revealed.length<cells-count);
    }
    if(s.toolId==='spider'){
      if(!keys(['suits','initial','columns','stock','completed','history','moves']) || ![1,2,4].includes(s.suits) || !list(s.initial,1,104,104) || s.initial.length!==104 || !unique(s.initial)
        || !Array.isArray(s.columns) || s.columns.length!==10 || !s.columns.every((p:unknown)=>list(p,-104,104,104)) || !list(s.stock,1,104,50) || s.stock.length%10!==0
        || !Array.isArray(s.completed) || s.completed.length>8 || !s.completed.every((p:unknown)=>list(p,1,104,13) && p.length===13) || !Array.isArray(s.history) || s.history.length>100 || !integer(s.moves,s.history.length,s.revision))return false;
      const cards=[...s.columns.flat().map(Math.abs),...s.stock,...s.completed.flat()];if(cards.length!==104 || !unique(cards) || cards.includes(0))return false;
      if(s.columns.some((pile:number[])=>pile.some((card,i)=>card<0 && pile.slice(0,i).some(v=>v>0)) || pile.length && pile[pile.length-1]!<0))return false;
      if(s.completed.some((pile:number[])=>pile.some((card,i)=>spiderRank(card)!==13-i || spiderSuit(card,s.suits)!==spiderSuit(pile[0]!,s.suits))))return false;
      for(const a of s.history){if(!a || !['move','deal'].includes(a.kind) || !integer(a.from,0,9) || !integer(a.to,0,9) || !integer(a.count,1,104) || typeof a.flipped!=='boolean' || !Array.isArray(a.collected) || a.collected.length>8 || a.collected.some((c:any)=>!Array.isArray(c) || c.length!==3 || !integer(c[0],0,9) || !list(c[1],1,104,13) || c[1].length!==13 || typeof c[2]!=='boolean') || Object.keys(a).some(k=>!['kind','from','to','count','flipped','collected'].includes(k)))return false;}
      // A completed run is never removed except by undo, which removes its action too.
      // This also bounds compact history to at most eight 13-card collection deltas.
      if(s.history.reduce((total:number,a:SpiderAction)=>total+a.collected.length,0)>s.completed.length)return false;
      // Validate compact history by undo + legal replay, including every automatic flip/collection.
      let current=clone(s) as SpiderGame;
      for(let i=s.history.length-1;i>=0;i--){const action=current.history[current.history.length-1]!,before=undoSpider(current);
        const replay=action.kind==='deal'?dealSpider(before):moveSpider(before,action.from,before.columns[action.from]!.length-action.count,action.to);
        if(replay===before || JSON.stringify([replay.columns,replay.stock,replay.completed])!==JSON.stringify([current.columns,current.stock,current.completed]) || JSON.stringify(replay.history[replay.history.length-1])!==JSON.stringify(action))return false;current=before;
      }
      return true;
    }
    return false;
  }catch{return false;}
}

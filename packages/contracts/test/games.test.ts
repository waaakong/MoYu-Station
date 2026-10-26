import {describe,it,expect} from 'vitest';
import {newPuzzle,swapPuzzle,puzzleWon,new2048,move2048,newMines,revealMine,flagMine,adjacentMines,mineNeighbors,MINES_LEVELS,newSpider,moveSpider,dealSpider,undoSpider,movableSpider,isClassicGame,spiderRank,type SpiderGame} from '../src/games';
const id='11111111-1111-4111-8111-111111111111';
function random(seed=7){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};}
describe('classic rules',()=>{
  it('preserves all puzzle sizes including 36-piece hard saves and rejects unsupported sizes',()=>{
    for(const size of [3,4,6] as const){
      let game=newPuzzle(size,id,random());
      expect(game.tiles).toHaveLength(size*size);expect(new Set(game.tiles).size).toBe(size*size);
      expect(isClassicGame(JSON.parse(JSON.stringify(game)))).toBe(true);
      for(let i=0;i<game.tiles.length;i++)if(game.tiles[i]!==i)game=swapPuzzle(game,i,game.tiles.indexOf(i));
      expect(puzzleWon(game)).toBe(true);expect(isClassicGame(game)).toBe(true);
    }
    expect(isClassicGame({...newPuzzle(3,id),size:5})).toBe(false);
    expect(()=>newPuzzle(5 as 3,id)).toThrow('PUZZLE_SIZE_INVALID');
  });
  it('swap puzzle is a permutation and solves without slide-only parity constraints',()=>{for(const size of [3,4] as const){let game=newPuzzle(size,id,random());expect(puzzleWon(game)).toBe(false);for(let i=0;i<game.tiles.length;i++)if(game.tiles[i]!==i)game=swapPuzzle(game,i,game.tiles.indexOf(i));expect(puzzleWon(game)).toBe(true);expect(isClassicGame(game)).toBe(true);}});
  it('2048 merges once per move and does not spawn when unchanged',()=>{const base=new2048(id,random());base.board=[2,2,2,2,...Array(12).fill(0)];base.score=0;const next=move2048(base,'left',()=>.99);expect(next.board.slice(0,4)).toEqual([4,4,0,0]);expect(next.score).toBe(8);expect(next.board.filter(Boolean)).toHaveLength(3);base.board=[2,4,8,16,...Array(12).fill(0)];expect(move2048(base,'left')).toBe(base);expect(isClassicGame(next)).toBe(true);});
  it('all mine levels protect the first neighborhood, reject flags and support chord loss/win',()=>{for(const difficulty of [0,1,2] as const){let game=newMines(difficulty,id);game=flagMine(game,0);expect(revealMine(game,0)).toBe(game);game=flagMine(game,0);game=revealMine(game,0,random());expect(game.mines).toHaveLength(MINES_LEVELS[difficulty].count);expect([0,...mineNeighbors(game,0)].some(i=>game.mines.includes(i))).toBe(false);expect(adjacentMines(game,0)).toBe(0);expect(isClassicGame(game)).toBe(true);const {width,height}=MINES_LEVELS[difficulty];for(let i=0;i<width*height;i++)if(!game.mines.includes(i))game=revealMine(game,i);expect(game.status).toBe('won');expect(isClassicGame(game)).toBe(true);}
    let game=newMines(0,id);game.mines=Array.from({length:10},(_,i)=>i);game.status='playing';game.revealed=[18];game=flagMine(game,27);expect(revealMine(game,18).status).toBe('lost');
  });
  it('spider deals 104 unique cards, 54/50 split and atomic deal undo in every suit mode',()=>{for(const suits of [1,2,4] as const){const game=newSpider(suits,id,random());expect(game.columns.map(p=>p.length)).toEqual([6,6,6,6,5,5,5,5,5,5]);expect(game.stock).toHaveLength(50);expect(isClassicGame(game)).toBe(true);const dealt=dealSpider(game);expect(dealt.stock).toHaveLength(40);const undone=undoSpider(dealt);expect(undone.columns).toEqual(game.columns);expect(undone.stock).toEqual(game.stock);expect(isClassicGame(undone)).toBe(true);const empty=structuredClone(game);empty.columns[0]=[];expect(dealSpider(empty)).toBe(empty);}});
  it('spider collection and automatic flip are undone as one action',()=>{
    const game=newSpider(1,id,random());game.columns=Array.from({length:10},()=>[]);game.columns[0]=[-27,13,12,11,10,9,8,7,6,5,4,3,2];game.columns[1]=[1];
    const used=new Set(game.columns.flat().map(Math.abs));game.columns[2]=game.initial.filter(c=>!used.has(c));game.stock=[];
    const done=moveSpider(game,1,0,0);expect(done.completed).toHaveLength(1);expect(done.columns[0]).toEqual([27]);const undone=undoSpider(done);expect(undone.columns).toEqual(game.columns);expect(undone.completed).toEqual([]);
  });
  it('spider compact 100-action history remains below 32 KiB and rejects forged undo records',()=>{
    let game=newSpider(1,id,random(19));
    for(let step=0;step<150;step++){let result:SpiderGame|undefined;for(let a=0;a<10 && !result;a++)for(let b=0;b<10 && !result;b++){const start=game.columns[a]!.length-1;const moved=moveSpider(game,a,start,b);if(moved!==game)result=moved;}if(!result)result=dealSpider(game);if(result===game)break;game=result;}
    expect(game.history).toHaveLength(100);expect(new TextEncoder().encode(JSON.stringify(game)).length).toBeLessThan(32768);expect(isClassicGame(game)).toBe(true);
    const forged=structuredClone(game);forged.history[0]!.count=104;expect(isClassicGame(forged)).toBe(false);
    for(const bad of [{...game,version:9},{...game,stock:[105]},{...game,arbitrary:'field'}])expect(isClassicGame(bad)).toBe(false);
  });
});

import {beforeEach,describe,it,expect} from 'vitest';
import {clearFeedSession,feedSession,mergeFeedEntities,removeFeedEntity} from '../src/feed/session';
describe('account feed session memory',()=>{
  beforeEach(clearFeedSession);
  it('shares entities without letting an older page overwrite a newer interaction',()=>{
    mergeFeedEntities([{id:1,liked:false,likeCount:0}]);const revisions={...feedSession.entityRevision};
    feedSession.pages.square.ids=[1];feedSession.pages.following.ids=[1];
    mergeFeedEntities([{id:1,liked:true,likeCount:1}]);mergeFeedEntities([{id:1,liked:false,likeCount:0}],revisions);
    expect(feedSession.entities[1].liked).toBe(true);
  });
  it('does not resurrect a deleted target when a pending list arrives',()=>{
    mergeFeedEntities([{id:1},{id:2}]);feedSession.pages.square.ids=[1,2];feedSession.pages.following.ids=[1];
    removeFeedEntity(1);mergeFeedEntities([{id:1}]);expect(feedSession.entities[1]).toBeUndefined();expect(feedSession.pages.square.ids).toEqual([2]);expect(feedSession.pages.following.ids).toEqual([]);
  });
  it('clears old reactive draft references and data on logout without persistent outbox',()=>{
    const draft=feedSession.draft;draft.content='private';feedSession.commentDrafts[1]='private reply';mergeFeedEntities([{id:1}]);
    clearFeedSession();expect(draft.content).toBe('');expect(feedSession.commentDrafts).toEqual({});expect(feedSession.entities).toEqual({});expect(feedSession.pages.square.ids).toEqual([]);
  });
});

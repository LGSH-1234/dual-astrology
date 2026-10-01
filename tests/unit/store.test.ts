import { describe, expect, it } from 'vitest';
import { reducer, DEMO_USER, type State } from '../../src/state/store';

const base: State = { user: DEMO_USER, friends: [], threads: [], mode: 'ziwei', recentFriendIds: [] };
const add = (s: State, threadId: string, id: string, question: string) =>
  reducer(s, { type: 'addEntry', threadId, mode: 'ziwei', title: question, entry: { id, question, createdAt: new Date().toISOString() } });

describe('会话 reducer', () => {
  it('不同 threadId 是独立会话', () => {
    let s = add(base, 't1', 'e1', '问题一');
    s = add(s, 't2', 'e2', '问题二');
    expect(s.threads).toHaveLength(2);
    expect(s.threads.find((t) => t.id === 't1')!.entries).toHaveLength(1);
  });

  it('重命名会裁剪空白，空标题不生效', () => {
    let s = add(base, 't1', 'e1', '问题一');
    s = reducer(s, { type: 'renameThread', threadId: 't1', title: '  事业  ' });
    expect(s.threads[0].title).toBe('事业');
    s = reducer(s, { type: 'renameThread', threadId: 't1', title: '   ' });
    expect(s.threads[0].title).toBe('事业');
  });

  it('置顶 / 取消置顶；置顶会话不会被 50 条上限挤掉', () => {
    let s = add(base, 'p', 'e0', '置顶的');
    s = reducer(s, { type: 'pinThread', threadId: 'p', pinned: true });
    expect(s.threads[0].pinnedAt).toBeTruthy();
    for (let i = 0; i < 55; i++) s = add(s, `t${i}`, `x${i}`, `问题${i}`);
    expect(s.threads.some((t) => t.id === 'p')).toBe(true);
    expect(s.threads.filter((t) => !t.pinnedAt)).toHaveLength(50);
    s = reducer(s, { type: 'pinThread', threadId: 'p', pinned: false });
    expect('pinnedAt' in s.threads.find((t) => t.id === 'p')!).toBe(false);
  });

  it('删除后可以撤销恢复', () => {
    const s = add(base, 't1', 'e1', '问题一');
    const t = s.threads[0];
    const d = reducer(s, { type: 'deleteThread', threadId: 't1' });
    expect(d.threads).toHaveLength(0);
    expect(reducer(d, { type: 'restoreThread', thread: t }).threads[0]).toEqual(t);
    expect(reducer(s, { type: 'restoreThread', thread: t }).threads).toHaveLength(1);
  });

  it('编辑提问会清掉回答并丢弃之后的消息', () => {
    let s = add(base, 't1', 'e1', '一');
    s = add(s, 't1', 'e2', '二');
    s = add(s, 't1', 'e3', '三');
    s = reducer(s, { type: 'updateEntry', threadId: 't1', entry: { ...s.threads[0].entries[1], error: 'x' } });
    s = reducer(s, { type: 'editEntry', threadId: 't1', entryId: 'e2', question: ' 改过的二 ' });
    const es = s.threads[0].entries;
    expect(es.map((e) => e.id)).toEqual(['e1', 'e2']);
    expect(es[1]).toMatchObject({ question: '改过的二' });
    expect(es[1].error).toBeUndefined();
  });
});

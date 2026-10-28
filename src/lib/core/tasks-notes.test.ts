import { describe, expect, it } from 'vitest';
import { createTestPlanner } from './testing/harness.js';

describe('Task Notes', () => {
	it('a new Task has empty Notes unless given', () => {
		const { planner } = createTestPlanner();
		expect(planner.createTask('owner', { title: 'a' }).notes).toBe('');
		const t = planner.createTask('claude', { title: 'b', notes: 'Skiena, гл. 3.4\nhttps://x.y' });
		expect(planner.getTask(t.id).notes).toBe('Skiena, гл. 3.4\nhttps://x.y');
	});

	it('update changes, keeps (when absent) and clears Notes', () => {
		const { planner } = createTestPlanner();
		const t = planner.createTask('owner', { title: 'a', notes: 'one' });
		expect(planner.updateTask('owner', t.id, { notes: 'two' }).notes).toBe('two');
		expect(planner.updateTask('owner', t.id, { title: 'a2' }).notes).toBe('two');
		expect(planner.updateTask('owner', t.id, { notes: '' }).notes).toBe('');
	});

	it('is recorded in the change log with the actor, and undo restores the previous Notes', () => {
		const { planner } = createTestPlanner();
		const t = planner.createTask('owner', { title: 'a', notes: 'one' });
		planner.updateTask('claude', t.id, { notes: 'two' });
		const entry = planner.changeLog().at(-1)!;
		expect(entry).toMatchObject({ actor: 'claude', action: 'task.update' });
		expect(entry.before).toMatchObject({ notes: 'one' });
		expect(entry.after).toMatchObject({ notes: 'two' });
		planner.undoChange('owner', entry.id);
		expect(planner.getTask(t.id).notes).toBe('one');
	});

	it('survives Trash and restore', () => {
		const { planner } = createTestPlanner();
		const t = planner.createTask('owner', { title: 'a', notes: 'keep me' });
		planner.deleteItem('owner', 'task', t.id);
		planner.restoreItem('owner', 'task', t.id);
		expect(planner.getTask(t.id).notes).toBe('keep me');
	});
});

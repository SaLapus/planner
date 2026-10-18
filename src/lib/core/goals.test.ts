import { describe, expect, it } from 'vitest';
import { createTestPlanner } from './testing/harness.js';

describe('Goals and Milestones', () => {
	it('creates, edits and lists Goals; milestones keep their order', () => {
		const { planner } = createTestPlanner();
		const g = planner.createGoal('owner', { title: 'Выучить турецкий', description: 'до B1', targetDate: '2026-12-31' });
		expect(g).toMatchObject({ title: 'Выучить турецкий', description: 'до B1', targetDate: '2026-12-31', status: 'active' });

		planner.updateGoal('owner', g.id, { title: 'Турецкий B1', targetDate: null });
		planner.addMilestone('owner', g.id, { title: 'A1' });
		planner.addMilestone('owner', g.id, { title: 'A2', targetDate: '2026-06-01' });

		const full = planner.getGoal(g.id);
		expect(full.title).toBe('Турецкий B1');
		expect(full.targetDate).toBeNull();
		expect(full.milestones.map((m) => [m.title, m.targetDate, m.done])).toEqual([
			['A1', null, false],
			['A2', '2026-06-01', false]
		]);
		expect(planner.listGoals().map((x) => x.id)).toEqual([g.id]);
		expect(() => planner.createGoal('owner', { title: '  ' })).toThrow(/title/);
		expect(() => planner.addMilestone('owner', g.id, { title: 'x', targetDate: 'tomorrow' })).toThrow(/date/);
	});

	it('edits milestones and reorders them (every id exactly once)', () => {
		const { planner } = createTestPlanner();
		const g = planner.createGoal('owner', { title: 'G' });
		const [a, b, c] = ['a', 'b', 'c'].map((title) => planner.addMilestone('owner', g.id, { title }));

		planner.updateMilestone('owner', b.id, { title: 'B!', targetDate: '2026-03-01' });
		planner.reorderMilestones('owner', g.id, [c.id, a.id, b.id]);

		expect(planner.getGoal(g.id).milestones.map((m) => m.title)).toEqual(['c', 'a', 'B!']);
		expect(() => planner.reorderMilestones('owner', g.id, [a.id, b.id])).toThrow(/every/);
		expect(() => planner.reorderMilestones('owner', g.id, [a.id, a.id, b.id])).toThrow(/every/);
	});

	it('status moves between active / paused / achieved / dropped; same status or unknown is refused', () => {
		const { planner } = createTestPlanner();
		const g = planner.createGoal('owner', { title: 'G' });

		expect(planner.setGoalStatus('owner', g.id, 'paused').status).toBe('paused');
		expect(planner.setGoalStatus('owner', g.id, 'active').status).toBe('active');
		expect(planner.setGoalStatus('owner', g.id, 'achieved').status).toBe('achieved');
		expect(planner.setGoalStatus('owner', g.id, 'active').status).toBe('active'); // reopened
		expect(() => planner.setGoalStatus('owner', g.id, 'active')).toThrow(/already/);
		expect(() => planner.setGoalStatus('owner', g.id, 'nope' as never)).toThrow(/status/);

		planner.setGoalStatus('owner', g.id, 'dropped');
		expect(planner.listGoals({ status: 'active' })).toEqual([]);
		expect(planner.listGoals({ status: 'dropped' })).toHaveLength(1);
		expect(planner.changeLog().map((e) => e.action).slice(-1)).toEqual(['goal.set_status']);
	});
});

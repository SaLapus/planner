<script lang="ts">
	// Svelte notes (for learning):
	//  * The charts are plain HTML + CSS: each bar is a <div> whose height is set from a number.
	//    `style:height="{n}%"` sets one CSS property from a value; it updates when the value changes.
	//  * `{@const x = ...}` makes a small helper value inside an {#each} block.
	//  * `const maxWeek = $derived(...)` is a value recomputed whenever `data` changes.
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const maxWeek = $derived(Math.max(1, ...data.stats.tasksPerWeek.map((w) => w.count)));

	/** "2026-01-05" -> "05.01" */
	const short = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
</script>

<svelte:head>
	<title>Статистика</title>
</svelte:head>

<main>
	<nav><a href="/">← Задачи</a></nav>
	<h1>Статистика</h1>

	<section>
		<h2>Привычки</h2>
		<p class="hint">Последние 8 периодов (неделя или месяц), справа - текущий. Процент - доля выполненных из завершённых периодов.</p>
		{#if data.stats.habits.length === 0}<p class="empty">Пока нет привычек.</p>{/if}
		{#each data.stats.habits as h (h.habit.id)}
			<div class="habit">
				<div class="head">
					<strong>{h.habit.title}</strong>
					<span class="rate">{h.hitRate === null ? '-' : `${h.hitRate}%`}</span>
				</div>
				<div class="bars" role="img" aria-label={`${h.habit.title}: ${h.periods.map((p) => `${p.done} из ${p.target}`).join(', ')}`}>
					{#each h.periods as p (p.start)}
						{@const ratio = Math.min(100, Math.round((100 * p.done) / p.target))}
						<div class="col" title={`${short(p.start)}-${short(p.end)}: ${p.done} из ${p.target}`}>
							<div class="track"><div class="fill" class:met={p.met} class:open={p.open} style:height="{ratio}%"></div></div>
							<small>{p.done}/{p.target}</small>
						</div>
					{/each}
				</div>
				<small class="unit">{h.periodType === 'week' ? 'по неделям' : 'по месяцам'}</small>
			</div>
		{/each}
	</section>

	<section>
		<h2>Выполненные задачи по неделям</h2>
		<div class="bars">
			{#each data.stats.tasksPerWeek as w (w.start)}
				<div class="col" title={`${short(w.start)}-${short(w.end)}: ${w.count}`}>
					<small>{w.count}</small>
					<div class="track"><div class="fill met" style:height="{(100 * w.count) / maxWeek}%"></div></div>
					<small>{short(w.start)}</small>
				</div>
			{/each}
		</div>
	</section>

	<section>
		<h2>Цели</h2>
		{#if data.stats.goals.length === 0}<p class="empty">Нет активных целей.</p>{/if}
		{#each data.stats.goals as p (p.goal.id)}
			<a class="goal" href={`/goals/${p.goal.id}`}>
				<span class="head"><strong>{p.goal.title}</strong><span class="rate">{p.milestones.percent}%</span></span>
				<progress value={p.milestones.done} max={Math.max(p.milestones.total, 1)}></progress>
				<small>Этапы: {p.milestones.done}/{p.milestones.total} · задачи: {p.tasks.done}/{p.tasks.total}</small>
			</a>
		{/each}
	</section>
</main>

<style>
	main {
		max-width: 40rem;
		margin: 1rem auto;
		padding: 0 1rem;
		font-family: system-ui, sans-serif;
	}
	section {
		margin-bottom: 2rem;
	}
	.hint,
	.unit {
		opacity: 0.65;
		font-size: 0.85rem;
	}
	.empty {
		opacity: 0.6;
	}
	.head {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
	}
	.rate {
		font-variant-numeric: tabular-nums;
		font-weight: 600;
	}
	.habit,
	.goal {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		border: 1px solid color-mix(in srgb, currentColor 25%, transparent);
		border-radius: 0.75rem;
		padding: 0.75rem;
		margin-bottom: 0.75rem;
		color: inherit;
		text-decoration: none;
	}
	/* a row of equal-width columns: shrinks to fit a phone screen */
	.bars {
		display: flex;
		gap: 0.35rem;
		align-items: stretch;
	}
	.col {
		flex: 1 1 0;
		min-width: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.2rem;
		text-align: center;
	}
	.col small {
		font-size: 0.7rem;
		white-space: nowrap;
	}
	/* colours are mixed from the text colour, so they work in light and dark schemes */
	.track {
		width: 100%;
		height: 4.5rem;
		display: flex;
		align-items: flex-end;
		background: color-mix(in srgb, currentColor 12%, transparent);
		border-radius: 0.3rem;
		overflow: hidden;
	}
	.fill {
		width: 100%;
		background: #d9822b;
	}
	.fill.met {
		background: #2f9e6b;
	}
	.fill.open:not(.met) {
		opacity: 0.55;
	}
	progress {
		width: 100%;
	}
</style>

<script lang="ts">
	// Svelte notes (for learning):
	//  * `let { data, form } = $props()` - `data` is what `load` returned, `form` the last action's result.
	//  * `$derived(...)` is a value that is recomputed automatically when what it depends on changes.
	//  * `<textarea name="draft" value={...}>`: the `name` is what the server reads from the form post.
	//  * `use:enhance` sends the form in the background (no page reload) and then refreshes `data`.
	import { enhance } from '$app/forms';
	import { periodTitle } from '../format';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let r = $derived(data.review);
	let d = $derived(data.data);
</script>

<svelte:head>
	<title>{periodTitle(r.periodType, r.periodStart)}</title>
</svelte:head>

<main>
	<nav><a href="/reviews">← Обзоры</a></nav>
	<h1>{periodTitle(r.periodType, r.periodStart)}</h1>
	{#if form?.error}<p class="error">{form.error}</p>{/if}
	{#if form?.saved}<p class="ok">Сохранено</p>{/if}

	<form method="POST" action="?/save" use:enhance>
		<label>
			Черновик (Markdown)
			<textarea name="draft" rows="14" value={r.draft}></textarea>
		</label>
		<label>
			Мои размышления (Markdown)
			<textarea name="reflection" rows="8" value={r.reflection}></textarea>
		</label>
		<button>Сохранить</button>
	</form>

	<details open>
		<summary>Данные периода ({d.period.start} – {d.period.end})</summary>
		<h3>Задачи</h3>
		<p>Выполнено: {d.tasks.done.length} · Сорвано: {d.tasks.slipped.length}</p>
		{#if d.tasks.done.length}
			<ul>{#each d.tasks.done as t (t.id)}<li>{t.title}</li>{/each}</ul>
		{/if}
		{#if d.tasks.slipped.length}
			<p>Сорвано (срок прошёл, не выполнено):</p>
			<ul>{#each d.tasks.slipped as t (t.id)}<li>{t.title} <small>до {t.dueDate}</small></li>{/each}</ul>
		{/if}

		<h3>Привычки</h3>
		{#if d.habits.length === 0}<p class="empty">Нет привычек.</p>{/if}
		<ul>
			{#each d.habits as h (h.habit.id)}
				<li>
					{h.habit.title}:
					{#if h.hitRate === null}
						отметок {h.checkins.length} (период ещё не завершён)
					{:else}
						{h.hitRate}% периодов выполнено, отметок {h.checkins.length}
					{/if}
					· серия {h.streak}
				</li>
			{/each}
		</ul>

		<h3>Цели</h3>
		{#if d.goals.length === 0}<p class="empty">Нет активных целей.</p>{/if}
		<ul>
			{#each d.goals as g (g.goal.id)}
				<li>
					<a href={`/goals/${g.goal.id}`}>{g.goal.title}</a>: этапы {g.milestones.done}/{g.milestones.total}
					({g.milestones.percent}%)
				</li>
			{/each}
		</ul>
		<p><small>Прогресс целей показан на текущий момент.</small></p>
	</details>

	<form method="POST" action="?/delete">
		<button class="link">Удалить обзор</button>
	</form>
</main>

<style>
	main {
		max-width: 40rem;
		margin: 1rem auto;
		padding: 0 1rem;
		font-family: system-ui, sans-serif;
	}
	form {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	textarea {
		font: inherit;
		width: 100%;
		box-sizing: border-box;
	}
	details {
		margin: 1rem 0;
	}
	.error {
		color: #b00020;
	}
	.ok {
		color: #1b7f3b;
	}
	.empty,
	small {
		color: #888;
	}
	.link {
		background: none;
		border: none;
		color: #b00020;
		cursor: pointer;
		align-self: flex-start;
		padding: 0;
	}
</style>

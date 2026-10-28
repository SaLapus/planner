<script lang="ts">
	// Svelte notes (for learning):
	//  * `data` is what `load` returned in +page.server.ts; `form` is the result of the last form action.
	//  * `use:enhance` submits the form in the background and then refreshes `data`.
	//  * `{#each ... (key)}` repeats markup; the key tells Svelte which row is which.
	import { enhance } from '$app/forms';
	import { STATUS_NAMES } from './status';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head>
	<title>Цели</title>
</svelte:head>

<main>
	<h1>Цели</h1>
	{#if form?.error}<p class="error">{form.error}</p>{/if}

	{#if data.active.length === 0}<p class="empty">Пока нет активных целей.</p>{/if}
	{#each data.active as p (p.goal.id)}
		<a class="card" href={`/goals/${p.goal.id}`}>
			<strong>{p.goal.title}</strong>
			<!-- <progress> is a built-in HTML bar: value out of max. -->
			<progress value={p.milestones.done} max={Math.max(p.milestones.total, 1)}></progress>
			<small>
				Этапы: {p.milestones.done}/{p.milestones.total}
				{#if p.goal.targetDate}· до {p.goal.targetDate}{/if}
			</small>
		</a>
	{/each}

	<form method="POST" action="?/create" class="new" use:enhance>
		<h2>Новая цель</h2>
		<input name="title" placeholder="Название" required />
		<textarea name="description" placeholder="Описание (необязательно)"></textarea>
		<label>Срок <input type="date" name="targetDate" /></label>
		<button class="primary">Создать</button>
	</form>

	{#if data.other.length}
		<h2>Остальные</h2>
		<ul>
			{#each data.other as p (p.goal.id)}
				<li>
					<a href={`/goals/${p.goal.id}`}>{p.goal.title}</a>
					<small>{STATUS_NAMES[p.goal.status]} · {p.milestones.done}/{p.milestones.total}</small>
				</li>
			{/each}
		</ul>
	{/if}
	<p><a href="/trash">Корзина</a></p>
</main>

<style>
	main {
		max-width: 32rem;
		margin: 1rem auto 3rem;
		padding: 0 1rem;
	}
	.card {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: var(--radius-l);
		padding: 0.85rem;
		margin-bottom: 0.75rem;
		color: inherit;
		text-decoration: none;
	}
	progress {
		width: 100%;
	}
	.new {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	ul {
		list-style: none;
		padding: 0;
	}
	li {
		display: flex;
		justify-content: space-between;
		padding: 0.4rem 0;
		border-bottom: 1px solid var(--line);
	}
	.error {
		color: var(--danger);
	}
	.empty {
		color: var(--ink-muted);
	}
</style>

<script lang="ts">
	// Svelte notes (for learning):
	//  * `data` is what `load` returned in +page.server.ts; `form` is the result of the last form action.
	//  * `{#each list as item (item.id)}` repeats markup for every item; the key `(item.id)` tells Svelte which row is which.
	//  * A <form method="POST" action="?/start"> calls the `start` action from +page.server.ts. Without JavaScript
	//    it still works as a normal page post.
	import { periodTitle } from './format';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head>
	<title>Обзоры</title>
</svelte:head>

<main>
	<nav><a href="/">← Задачи</a></nav>
	<h1>Обзоры</h1>
	{#if form?.error}<p class="error">{form.error}</p>{/if}

	<div class="start">
		<form method="POST" action="?/start">
			<input type="hidden" name="period" value="week" />
			<button>{data.current.week ? 'Открыть обзор этой недели' : 'Начать обзор недели'}</button>
		</form>
		<form method="POST" action="?/start">
			<input type="hidden" name="period" value="month" />
			<button>{data.current.month ? 'Открыть обзор этого месяца' : 'Начать обзор месяца'}</button>
		</form>
	</div>
	<p class="hint">Черновик обычно пишет Claude (по расписанию или в разговоре), а размышления добавляете вы.</p>

	{#if data.reviews.length === 0}<p class="empty">Пока нет обзоров.</p>{/if}
	<ul>
		{#each data.reviews as r (r.id)}
			<li>
				<a href={`/reviews/${r.id}`}>{periodTitle(r.periodType, r.periodStart)}</a>
				<small>
					{r.draft ? 'есть черновик' : 'без черновика'} · {r.reflection ? 'есть размышления' : 'без размышлений'}
				</small>
			</li>
		{/each}
	</ul>
	<p><a href="/trash">Корзина</a></p>
</main>

<style>
	main {
		max-width: 32rem;
		margin: 1rem auto;
		padding: 0 1rem;
		font-family: system-ui, sans-serif;
	}
	.start {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	ul {
		list-style: none;
		padding: 0;
	}
	li {
		display: flex;
		flex-direction: column;
		padding: 0.5rem 0;
		border-bottom: 1px solid #ddd;
	}
	small,
	.hint,
	.empty {
		color: #888;
	}
	.error {
		color: #b00020;
	}
</style>

<script lang="ts">
	// Svelte notes (for learning):
	//  * `$props()` is how a component receives data. SvelteKit passes `data`
	//    (what `load` returned in +page.server.ts) and `form` (the result of the
	//    last form action, e.g. a validation error).
	//  * `use:enhance` upgrades a normal <form> so it submits in the background
	//    without a full page reload. Without JavaScript the form still works.
	//  * `{#each ...}` repeats markup per item; `{#if ...}` shows it conditionally.
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head>
	<title>Планировщик</title>
</svelte:head>

<main>
	<form method="POST" action="/auth/logout" class="logout"><button>Выйти</button></form>
	<a href="/events">Расписание</a>
	<h1>Задачи</h1>

	<form method="POST" action="?/add" use:enhance>
		<input
			name="title"
			placeholder="Новая задача…"
			autocomplete="off"
			value={form?.title ?? ''}
			aria-label="Название задачи"
		/>
		<button>Добавить</button>
	</form>
	{#if form?.error}<p class="error">{form.error}</p>{/if}

	{#if data.tasks.length === 0}
		<p class="empty">Пока нет задач.</p>
	{:else}
		<ul>
			{#each data.tasks as task (task.id)}
				<li class:done={task.completedAt !== null}>
					<form method="POST" action="?/toggle" use:enhance>
						<input type="hidden" name="id" value={task.id} />
						<input type="hidden" name="done" value={task.completedAt === null} />
						<button
							class="check"
							aria-label={task.completedAt === null ? 'Выполнить' : 'Вернуть в работу'}
						>
							{task.completedAt === null ? '○' : '✓'}
						</button>
					</form>
					<span>{task.title}</span>
				</li>
			{/each}
		</ul>
	{/if}
</main>

<style>
	.logout {
		text-align: right;
	}
	main {
		max-width: 32rem;
		margin: 2rem auto;
		padding: 0 1rem;
		font-family: system-ui, sans-serif;
	}
	form:first-of-type {
		display: flex;
		gap: 0.5rem;
	}
	form:first-of-type input {
		flex: 1;
		padding: 0.5rem;
	}
	ul {
		list-style: none;
		padding: 0;
	}
	li {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.4rem 0;
		border-bottom: 1px solid #ddd;
	}
	li.done span {
		text-decoration: line-through;
		color: #888;
	}
	.check {
		font-size: 1.2rem;
		background: none;
		border: none;
		cursor: pointer;
	}
	.error {
		color: #b00020;
	}
	.empty {
		color: #888;
	}
</style>

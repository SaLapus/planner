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

	// Plain constants: they never change, so they don't need to be reactive.
	const lists = [
		['today', 'Сегодня'],
		['upcoming', 'Предстоящие'],
		['overdue', 'Просроченные'],
		['inbox', 'Входящие']
	];
	const priorities = [
		['none', 'Без приоритета'],
		['low', 'Низкий'],
		['medium', 'Средний'],
		['high', 'Высокий']
	];
	const priorityLabel = Object.fromEntries(priorities);
</script>

<svelte:head>
	<title>Планировщик</title>
</svelte:head>

<main>
	<form method="POST" action="/auth/logout" class="logout"><button>Выйти</button></form>
	<a href="/events">Расписание</a>
	<h1>Задачи</h1>

	<!-- A plain GET form: submitting it just reloads the page with ?q=..., and `load` does the search. -->
	<form method="GET" class="search">
		<input name="q" value={data.q} placeholder="Поиск…" aria-label="Поиск задач" />
		<button>Найти</button>
	</form>

	<nav>
		<a href="/" class:active={!data.list && !data.q}>Все</a>
		{#each lists as [key, label] (key)}
			<a href="/?list={key}" class:active={data.list === key && !data.q}>{label}</a>
		{/each}
	</nav>

	<form method="POST" action="?/add" use:enhance class="add">
		<input
			name="title"
			placeholder="Новая задача…"
			autocomplete="off"
			value={form?.title ?? ''}
			aria-label="Название задачи"
		/>
		<input type="date" name="dueDate" aria-label="Срок: дата" />
		<input type="time" name="dueTime" aria-label="Срок: время" />
		<select name="priority" aria-label="Приоритет">
			{#each priorities as [key, label] (key)}
				<option value={key}>{label}</option>
			{/each}
		</select>
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
					<span class="title">{task.title}</span>
					{#if task.dueDate}
						<small class="due">{task.dueDate}{task.dueTime ? ` ${task.dueTime}` : ''}</small>
					{/if}
					{#if task.priority !== 'none'}
						<small class="prio {task.priority}">{priorityLabel[task.priority]}</small>
					{/if}
					<!-- <details> is built-in HTML: click the summary to show or hide the form inside. -->
					<details>
						<summary aria-label="Изменить">✎</summary>
						<form method="POST" action="?/edit" use:enhance class="edit">
							<input type="hidden" name="id" value={task.id} />
							<input name="title" value={task.title} aria-label="Название" />
							<input type="date" name="dueDate" value={task.dueDate ?? ''} aria-label="Срок: дата" />
							<input type="time" name="dueTime" value={task.dueTime ?? ''} aria-label="Срок: время" />
							<select name="priority" value={task.priority} aria-label="Приоритет">
								{#each priorities as [key, label] (key)}
									<option value={key}>{label}</option>
								{/each}
							</select>
							<button>Сохранить</button>
						</form>
					</details>
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
	.search,
	.add,
	.edit {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
	}
	.search input,
	.add input[name='title'],
	.edit input[name='title'] {
		flex: 1;
		min-width: 8rem;
	}
	.search input,
	.add input,
	.edit input,
	select {
		padding: 0.5rem;
	}
	nav {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		margin: 0.5rem 0 1rem;
	}
	nav a.active {
		font-weight: bold;
	}
	.title {
		flex: 1;
	}
	.due {
		color: #555;
	}
	.prio {
		padding: 0 0.4rem;
		border-radius: 0.5rem;
		background: #eee;
	}
	.prio.high {
		background: #f8c9c9;
	}
	.prio.medium {
		background: #fde7b0;
	}
	li {
		flex-wrap: wrap;
	}
	details {
		width: 100%;
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

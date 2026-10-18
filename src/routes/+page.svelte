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
	<h1>Задачи</h1>

	<!-- Views: each link is just an address with ?project= or ?tag=; the server's `load` does the filtering. -->
	<nav aria-label="Фильтры">
		<a href="/" class:active={!data.filter.project && !data.filter.tag}>Все</a>
		<a href="/?project=none" class:active={data.filter.project === 'none'}>Без проекта</a>
		{#each data.projects as p (p.id)}
			<a href="/?project={p.id}" class:active={data.filter.project === String(p.id)}>{p.name}</a>
		{/each}
		{#each data.tags as t (t.tag)}
			<a href="/?tag={encodeURIComponent(t.tag)}" class:active={data.filter.tag === t.tag}>
				#{t.tag} <small>{t.count}</small>
			</a>
		{/each}
		<a href="/projects" class="manage">Проекты…</a>
	</nav>

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
					<div class="row">
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
						{#if task.projectId !== null}
							<a class="badge" href="/?project={task.projectId}">
								{data.allProjects.find((p) => p.id === task.projectId)?.name}
							</a>
						{/if}
						{#each task.tags as tag (tag)}
							<a class="badge tag" href="/?tag={encodeURIComponent(tag)}">#{tag}</a>
						{/each}
						{#if task.subtasks.length > 0}
							<small>{task.subtasks.filter((s) => s.done).length}/{task.subtasks.length}</small>
						{/if}
					</div>

					<!-- <details> is a built-in HTML "expand" widget: no JavaScript needed. -->
					<details>
						<summary>Подробнее</summary>

						<ul class="subtasks">
							{#each task.subtasks as sub, i (sub.id)}
								<li class:done={sub.done}>
									<form method="POST" action="?/toggleSubtask" use:enhance>
										<input type="hidden" name="id" value={task.id} />
										<input type="hidden" name="subtaskId" value={sub.id} />
										<input type="hidden" name="done" value={!sub.done} />
										<button class="check" aria-label={sub.done ? 'Снять отметку' : 'Отметить'}>
											{sub.done ? '☑' : '☐'}
										</button>
									</form>
									<span>{sub.title}</span>
									<form method="POST" action="?/moveSubtask" use:enhance>
										<input type="hidden" name="id" value={task.id} />
										<input type="hidden" name="subtaskId" value={sub.id} />
										<button name="dir" value="-1" disabled={i === 0} aria-label="Выше">↑</button>
										<button name="dir" value="1" disabled={i === task.subtasks.length - 1} aria-label="Ниже">↓</button>
									</form>
									<form method="POST" action="?/removeSubtask" use:enhance>
										<input type="hidden" name="id" value={task.id} />
										<input type="hidden" name="subtaskId" value={sub.id} />
										<button aria-label="Удалить подзадачу">✕</button>
									</form>
								</li>
							{/each}
						</ul>
						<form method="POST" action="?/addSubtask" use:enhance class="inline">
							<input type="hidden" name="id" value={task.id} />
							<input name="title" placeholder="Новая подзадача…" autocomplete="off" aria-label="Подзадача" />
							<button>+</button>
						</form>

						<form method="POST" action="?/setProject" use:enhance class="inline">
							<input type="hidden" name="id" value={task.id} />
							<select name="projectId" aria-label="Проект" value={task.projectId ?? ''}>
								<option value="">Без проекта</option>
								{#each data.projects as p (p.id)}
									<option value={p.id}>{p.name}</option>
								{/each}
							</select>
							<button>Сохранить</button>
						</form>

						<form method="POST" action="?/addTag" use:enhance class="inline">
							<input type="hidden" name="id" value={task.id} />
							<input name="tag" placeholder="Новый тег…" autocomplete="off" aria-label="Тег" />
							<button>+</button>
						</form>
						{#each task.tags as tag (tag)}
							<form method="POST" action="?/removeTag" use:enhance class="inline">
								<input type="hidden" name="id" value={task.id} />
								<input type="hidden" name="tag" value={tag} />
								<button aria-label="Убрать тег {tag}">#{tag} ✕</button>
							</form>
						{/each}
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
		padding: 0.4rem 0;
		border-bottom: 1px solid #ddd;
	}
	.row,
	.subtasks li {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.subtasks {
		padding-left: 1.5rem;
	}
	.subtasks li {
		border: none;
	}
	nav {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-bottom: 1rem;
	}
	nav a,
	.badge {
		padding: 0.1rem 0.5rem;
		border: 1px solid #ccc;
		border-radius: 1rem;
		text-decoration: none;
		color: inherit;
		font-size: 0.85rem;
	}
	nav a.active {
		background: #222;
		color: #fff;
	}
	.manage {
		border-style: dashed;
	}
	details {
		margin-left: 2rem;
	}
	.inline {
		display: inline-flex;
		gap: 0.3rem;
		margin: 0.3rem 0.3rem 0 0;
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

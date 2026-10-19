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

	// Builds a link that changes one filter and keeps the others (q is not kept: it is a form).
	// Passing the value that is already active clears that filter.
	function href(change: { list?: string | null; project?: string; tag?: string }) {
		const next = { list: data.list as string | null, project: data.filter.project, tag: data.filter.tag };
		if ('list' in change) next.list = change.list ?? null;
		if (change.project !== undefined) next.project = next.project === change.project ? null : change.project;
		if (change.tag !== undefined) next.tag = next.tag === change.tag ? null : change.tag;
		const params = new URLSearchParams();
		if (next.list) params.set('list', next.list);
		if (next.project !== null) params.set('project', next.project);
		if (next.tag) params.set('tag', next.tag);
		const qs = params.toString();
		return qs ? `/?${qs}` : '/';
	}
</script>

<svelte:head>
	<title>Планировщик</title>
</svelte:head>

<main>
	<form method="POST" action="/auth/logout" class="logout"><button>Выйти</button></form>
	<nav><a href="/habits">Привычки</a> · <a href="/goals">Цели</a> · <a href="/stats">Статистика</a> · <a href="/reviews">Обзоры</a> · <a href="/trash">Корзина</a> · <a href="/changes">Журнал изменений</a> · <a href="/events">Расписание</a></nav>
	<h1>Задачи</h1>

	<!-- A plain GET form: submitting it reloads the page with ?q=..., and `load` does the search. -->
	<form method="GET" class="search">
		{#if data.list}<input type="hidden" name="list" value={data.list} />{/if}
		{#if data.filter.project !== null}<input type="hidden" name="project" value={data.filter.project} />{/if}
		{#if data.filter.tag}<input type="hidden" name="tag" value={data.filter.tag} />{/if}
		<input name="q" value={data.q} placeholder="Поиск…" aria-label="Поиск задач" />
		<button>Найти</button>
	</form>

	<!-- List tabs: each link is just an address; the filters below are kept when switching. -->
	<nav aria-label="Списки">
		<a href={href({ list: null })} class:active={!data.list}>Все</a>
		{#each lists as [key, label] (key)}
			<a href={href({ list: key })} class:active={data.list === key}>{label}</a>
		{/each}
	</nav>

	<!-- Filter chips: by project and by tag. Clicking the active chip again clears it. -->
	<nav aria-label="Фильтры">
		<a href={href({ project: 'none' })} class:active={data.filter.project === 'none'}>Без проекта</a>
		{#each data.projects as p (p.id)}
			<a href={href({ project: String(p.id) })} class:active={data.filter.project === String(p.id)}>{p.name}</a>
		{/each}
		{#each data.tags as t (t.tag)}
			<a href={href({ tag: t.tag })} class:active={data.filter.tag === t.tag}>
				#{t.tag} <small>{t.count}</small>
			</a>
		{/each}
		<a href="/projects" class="manage">Проекты…</a>
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
				<li id="task-{task.id}" class:done={task.completedAt !== null}>
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
						<span class="title">{task.title}</span>
						{#if task.dueDate}
							<small class="due">{task.dueDate}{task.dueTime ? ` ${task.dueTime}` : ''}</small>
						{/if}
						{#if task.block}
							<small class="block" title="Блок времени">⏱ {task.block.label}</small>
						{/if}
						{#if task.repeat}
							<small class="repeat" title="Повторение">🔁 {task.repeatText}</small>
						{/if}
						{#if task.priority !== 'none'}
							<small class="prio {task.priority}">{priorityLabel[task.priority]}</small>
						{/if}
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

					<!-- <details> is built-in HTML: click the summary to show or hide the content inside. -->
					<details>
						<summary aria-label="Подробнее">✎ Подробнее</summary>

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
							<!-- Time block: fill date and time to plan the task into the calendar; empty them to remove the block. -->
							<fieldset class="block-fields">
								<legend>Блок времени (в расписании)</legend>
								<input type="date" name="blockDate" value={task.block?.date ?? ''} aria-label="Блок: дата" />
								<input type="time" name="blockTime" value={task.block?.time ?? ''} aria-label="Блок: начало" />
								<input
									type="number"
									name="blockMinutes"
									min="1"
									max="1440"
									value={task.block?.minutes ?? 60}
									aria-label="Блок: минут"
								/> мин
							</fieldset>
							<button>Сохранить</button>
						</form>

						<!-- Repetition: its own form. "bind:value" is not needed; the select is read when the form is sent. -->
						<form method="POST" action="?/setRepeat" use:enhance class="inline">
							<input type="hidden" name="id" value={task.id} />
							<select name="repeatKind" value={task.repeatForm.kind} aria-label="Повторение">
								<option value="none">Не повторять</option>
								<option value="fixed">По расписанию (от срока)</option>
								<option value="after">После выполнения</option>
								{#if task.repeatForm.kind === 'custom'}
									<option value="custom">Особое правило (не менять)</option>
								{/if}
							</select>
							<input
								type="number"
								name="repeatEvery"
								min="1"
								max="999"
								value={task.repeatForm.every}
								aria-label="Повторять: каждые"
							/>
							<select name="repeatUnit" value={task.repeatForm.unit} aria-label="Единица">
								<option value="day">дней</option>
								<option value="week">недель</option>
								<option value="month">месяцев</option>
								<option value="year">лет</option>
							</select>
							<button>Повторение</button>
						</form>

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
					<form method="POST" action="?/delete" use:enhance class="del">
						<input type="hidden" name="id" value={task.id} />
						<button aria-label="Удалить в корзину" title="В корзину">🗑</button>
					</form>
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
	.block {
		color: #2e7d32;
	}
	.block-fields {
		border: 1px solid #ccc;
		border-radius: 0.5rem;
		width: 100%;
	}
	.block-fields input[type='number'] {
		width: 5rem;
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
	.del {
		margin-left: auto;
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

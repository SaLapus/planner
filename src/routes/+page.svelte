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
	import NotesText from '../lib/NotesText.svelte';

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
	type Task = PageProps['data']['tasks'][number];
</script>

<svelte:head>
	<title>Планировщик</title>
</svelte:head>

<main>
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
	<nav class="subnav" aria-label="Списки">
		<a href={href({ list: null })} class:active={!data.list}>Все</a>
		{#each lists as [key, label] (key)}
			<a href={href({ list: key })} class:active={data.list === key}>{label}</a>
		{/each}
	</nav>

	<!-- Filter chips: by project and by tag. Clicking the active chip again clears it. -->
	<nav class="subnav" aria-label="Фильтры">
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
		<input type="date" name="startDate" aria-label="Начало" title="Начало" />
		<select name="priority" aria-label="Приоритет">
			{#each priorities as [key, label] (key)}
				<option value={key}>{label}</option>
			{/each}
		</select>
		<button class="primary">Добавить</button>
	</form>
	{#if form?.error}<p class="error">{form.error}</p>{/if}

	{#snippet taskItem(task: Task)}
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
					{#if task.startsLater}
						<small class="starts" title="Дата начала">▶ {task.startDate}</small>
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
					{#if task.notes !== ''}
						<small class="notes-mark" title="Есть заметки">📝</small>
					{/if}
				</div>

				<!-- <details> is built-in HTML: click the summary to show or hide the content inside. -->
				<details>
					<summary aria-label="Подробнее">✎ Подробнее</summary>

					<NotesText notes={task.notes} />

					<form method="POST" action="?/edit" use:enhance class="edit">
						<input type="hidden" name="id" value={task.id} />
						<input name="title" value={task.title} aria-label="Название" />
						<input type="date" name="dueDate" value={task.dueDate ?? ''} aria-label="Срок: дата" />
						<input type="time" name="dueTime" value={task.dueTime ?? ''} aria-label="Срок: время" />
						<input type="hidden" name="shownStartDate" value={task.startDate} />
						<input
							type="date"
							name="startDate"
							value={task.startDate}
							aria-label="Начало"
							title="Начало (пусто — по умолчанию)"
						/>
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
						<textarea name="notes" rows="3" aria-label="Заметки" placeholder="Заметки">{task.notes}</textarea>
						<button class="primary">Сохранить</button>
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
					<form method="POST" action="?/duplicate" use:enhance class="inline">
						<input type="hidden" name="id" value={task.id} />
						<button>Дублировать</button>
					</form>
				</details>
				<form method="POST" action="?/delete" use:enhance class="del">
					<input type="hidden" name="id" value={task.id} />
					<button aria-label="Удалить в корзину" title="В корзину">🗑</button>
				</form>
			</li>
	{/snippet}

	{#if data.split}
		{@const { active, notStarted, completed } = data.split}
		{#if active.length + notStarted.length + completed.length === 0}
			<p class="empty">Пока нет задач.</p>
		{/if}
		{#if active.length > 0}
			<h2>Активные</h2>
			<ul>
				{#each active as task (task.id)}
					{@render taskItem(task)}
				{/each}
			</ul>
			<hr class="divider" />
		{/if}
		{#if notStarted.length > 0}
			<ul>
				{#each notStarted as task (task.id)}
					{@render taskItem(task)}
				{/each}
			</ul>
		{/if}
		{#if completed.length > 0}
			<details class="completed">
				<summary>Выполненные ({completed.length})</summary>
				<ul>
					{#each completed as task (task.id)}
						{@render taskItem(task)}
					{/each}
				</ul>
			</details>
		{/if}
	{:else if data.tasks.length === 0}
		<p class="empty">Пока нет задач.</p>
	{:else}
		<ul>
			{#each data.tasks as task (task.id)}
				{@render taskItem(task)}
			{/each}
		</ul>
	{/if}
</main>

<style>
	main {
		max-width: 32rem;
		margin: 1rem auto 3rem;
		padding: 0 1rem;
	}

	/* Search and the new-task form */
	.search,
	.add,
	.edit {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
	}
	.search input,
	.edit input[name='title'] {
		flex: 1;
		min-width: 8rem;
	}
	.add {
		margin: 1.25rem 0 0.5rem;
		padding: 0.75rem;
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: var(--radius-l);
	}
	.add input[name='title'] {
		flex: 1 1 100%;
		font-size: 1.0625rem;
	}
	.add button {
		margin-left: auto;
	}
	.edit textarea {
		flex: 1 1 100%;
	}

	/* Lists and filters: pill links. The current one sits deep. */
	nav {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin: 0.75rem 0;
	}
	nav a {
		padding: 0.2rem 0.65rem;
		border: 1px solid var(--line);
		border-radius: 1rem;
		background: var(--surface);
		color: var(--ink-soft);
		text-decoration: none;
		font-size: 0.875rem;
	}
	nav a:hover {
		border-color: var(--field);
		color: var(--ink);
	}
	nav a.active {
		background: var(--level-5);
		border-color: var(--level-5);
		color: var(--on-level-5);
		font-weight: 600;
	}
	nav a small {
		opacity: 0.7;
		font-variant-numeric: tabular-nums;
	}
	.manage {
		border-style: dashed;
		background: none;
	}

	/* The task list */
	ul {
		list-style: none;
		padding: 0;
		margin: 0;
	}
	/* A task row: [check + title + details] [trash]. The details line spans the full width. */
	li {
		display: grid;
		grid-template-columns: 1fr auto;
		align-items: start;
		padding: 0.55rem 0 0.35rem;
		border-bottom: 1px solid var(--line);
	}
	/* The check circle hangs in the left gutter, so wrapped meta lines up under the title. */
	.row {
		grid-column: 1;
		position: relative;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.2rem 0.5rem;
		padding-left: 2.25rem;
		min-height: 1.6rem;
	}
	.row > form:first-child {
		position: absolute;
		left: 0;
		top: 0;
	}
	/* Negative margins keep the full tap area without making the row taller. */
	.del {
		grid-column: 2;
		grid-row: 1;
		margin: -0.45rem -0.4rem -0.45rem 0;
	}
	li > details {
		grid-column: 1 / -1;
		margin-left: 2.25rem;
	}
	/* The title takes its own line; dates, priority and badges follow on the next. */
	.title {
		flex: 1 1 100%;
		line-height: 1.6rem;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	li.done .title,
	.subtasks li.done span {
		text-decoration: line-through;
		color: var(--ink-muted);
	}

	/* Check circle: empty ring, filled deep when done. */
	.row .check {
		flex: none;
		width: 1.6rem;
		height: 1.6rem;
		min-height: 0;
		padding: 0;
		border: 2px solid var(--field);
		border-radius: 50%;
		background: var(--surface);
		color: transparent;
		font-size: 0.9rem;
		line-height: 1;
	}
	.row .check:hover {
		background: var(--wash);
		color: var(--field);
	}
	li.done > .row .check {
		background: var(--level-4);
		border-color: var(--level-4);
		color: var(--on-level-4);
	}

	/* Meta beside the title */
	.row small {
		color: var(--ink-muted);
		font-size: 0.8125rem;
	}
	.due {
		font-variant-numeric: tabular-nums;
		color: var(--ink-soft);
	}
	.row .due {
		color: var(--ink-soft);
	}
	/* Priority on the depth scale: low is shallow, high is deep. */
	.row .prio {
		padding: 0.05rem 0.5rem;
		border-radius: var(--radius-s);
		font-weight: 550;
	}
	.row .prio.low {
		background: var(--level-1);
		color: var(--on-level-1);
	}
	.row .prio.medium {
		background: var(--level-3);
		color: var(--on-level-3);
	}
	.row .prio.high {
		background: var(--level-5);
		color: var(--on-level-5);
	}
	.badge {
		padding: 0 0.45rem;
		border: 1px solid var(--line);
		border-radius: 1rem;
		color: var(--ink-soft);
		text-decoration: none;
		font-size: 0.8125rem;
	}
	.badge:hover {
		border-color: var(--field);
	}

	/* Trash: a quiet icon button */
	.del button {
		border: none;
		background: none;
		opacity: 0.55;
		padding: 0.3rem 0.5rem;
	}
	.del button:hover {
		opacity: 1;
		background: var(--wash);
	}

	/* Opened details */
	details > summary {
		font-size: 0.8125rem;
		color: var(--ink-muted);
		padding: 0.15rem 0;
	}
	/* Once opened, the editor becomes one panel at full row width. */
	li > details[open] {
		margin: 0.25rem 0 0.4rem;
		padding: 0.25rem 0.65rem 0.65rem;
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: var(--radius-l);
	}
	details[open] > summary {
		color: var(--ink-soft);
		margin-bottom: 0.4rem;
	}
	.block-fields {
		width: 100%;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem;
		color: var(--ink-soft);
	}
	.block-fields input[type='number'] {
		width: 5rem;
	}
	.inline {
		display: inline-flex;
		flex-wrap: wrap;
		gap: 0.3rem;
		margin: 0.4rem 0.3rem 0 0;
	}
	.subtasks {
		margin: 0.5rem 0;
	}
	.subtasks li {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.1rem 0;
		border: none;
	}
	.subtasks li span {
		flex: 1;
	}
	.subtasks .check {
		border: none;
		background: none;
		padding: 0 0.2rem;
		font-size: 1.2rem;
		color: var(--accent);
	}
	.subtasks button:not(.check) {
		min-height: 2rem;
		padding: 0 0.5rem;
	}

	/* Groups */
	h2 {
		margin-top: 1.75rem;
	}
	.divider {
		margin: 1rem 0 0;
		border-top: 2px dashed var(--line);
	}
	.completed {
		margin-top: 1.25rem;
	}
	.completed > summary {
		font-size: 0.9375rem;
		font-weight: 600;
	}
</style>

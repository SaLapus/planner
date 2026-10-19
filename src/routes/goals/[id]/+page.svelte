<script lang="ts">
	// Svelte notes (for learning):
	//  * `let { data, form } = $props()` - `data` is what `load` returned, `form` the last action's result.
	//  * `$derived(...)` is a value that is recomputed automatically when what it depends on changes.
	//  * `use:enhance` sends a form in the background and refreshes `data` afterwards.
	//  * `$state` makes a variable reactive: setting `editing` re-renders the parts that read it.
	//  * Each small button is its own <form method="POST" action="?/name">; the name picks the action in +page.server.ts.
	import { enhance } from '$app/forms';
	import { STATUS_NAMES } from '../status';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let p = $derived(data.progress);
	let editing = $state(false);
	let editingMilestone = $state<number | null>(null);

	const daysShort = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
	type Schedule = PageProps['data']['progress']['habits'][number]['habit']['schedule'];
	const scheduleText = (s: Schedule) =>
		s.type === 'per_week'
			? `${s.count} раз в неделю`
			: s.type === 'per_month'
				? `${s.count} раз в месяц`
				: 'по дням: ' + s.days.map((d) => daysShort[d - 1]).join(', ');
	const milestoneTitle = (id: number) => p.milestoneList.find((m) => m.id === id)?.title ?? '';
</script>

<svelte:head>
	<title>{p.goal.title}</title>
</svelte:head>

<main>
	<nav><a href="/goals">← Цели</a></nav>
	{#if form?.error}<p class="error">{form.error}</p>{/if}

	<header>
		<h1>{p.goal.title}</h1>
		{#if p.goal.description}<p>{p.goal.description}</p>{/if}
		<progress value={p.milestones.done} max={Math.max(p.milestones.total, 1)}></progress>
		<p>
			<b>{p.milestones.percent}%</b> · этапы {p.milestones.done}/{p.milestones.total}
			{#if p.goal.targetDate}· срок {p.goal.targetDate}{/if}
		</p>

		<form method="POST" action="?/status" use:enhance class="inline">
			<label>
				Статус
				<!-- onchange: submit as soon as another option is chosen -->
				<select name="status" onchange={(e) => e.currentTarget.form?.requestSubmit()}>
					{#each Object.entries(STATUS_NAMES) as [value, label] (value)}
						<option {value} selected={value === p.goal.status}>{label}</option>
					{/each}
				</select>
			</label>
		</form>

		<div class="row">
			<button class="link" onclick={() => (editing = !editing)}>{editing ? 'Закрыть' : 'Изменить'}</button>
			<form method="POST" action="?/delete">
				<button class="link">Удалить</button>
			</form>
		</div>
		{#if editing}
			<form
				method="POST"
				action="?/save"
				class="col"
				use:enhance={() =>
					async ({ update }) => {
						await update();
						editing = false;
					}}
			>
				<input name="title" value={p.goal.title} required />
				<textarea name="description">{p.goal.description}</textarea>
				<label>Срок <input type="date" name="targetDate" value={p.goal.targetDate ?? ''} /></label>
				<button>Сохранить</button>
			</form>
		{/if}
	</header>

	<h2>Этапы</h2>
	{#if p.milestoneList.length === 0}<p class="empty">Этапов пока нет.</p>{/if}
	<ol>
		{#each p.milestoneList as m, i (m.id)}
			<li class:done={m.done}>
				<form method="POST" action="?/toggleMilestone" use:enhance>
					<input type="hidden" name="id" value={m.id} />
					<input type="hidden" name="done" value={!m.done} />
					<button class="check" aria-label={m.done ? 'Снять отметку' : 'Отметить выполненным'}>
						{m.done ? '✓' : '○'}
					</button>
				</form>
				{#if editingMilestone === m.id}
					<form
						method="POST"
						action="?/editMilestone"
						class="grow"
						use:enhance={() =>
							async ({ update }) => {
								await update();
								editingMilestone = null;
							}}
					>
						<input type="hidden" name="id" value={m.id} />
						<input name="title" value={m.title} required />
						<input type="date" name="targetDate" value={m.targetDate ?? ''} />
						<button>Ок</button>
					</form>
				{:else}
					<span class="grow">
						{m.title}
						{#if m.targetDate}<small>до {m.targetDate}</small>{/if}
					</span>
					<button class="link" onclick={() => (editingMilestone = m.id)}>Изменить</button>
				{/if}
				<form method="POST" action="?/moveMilestone" use:enhance>
					<input type="hidden" name="id" value={m.id} />
					<input type="hidden" name="dir" value="-1" />
					<button class="link" disabled={i === 0} aria-label="Выше">↑</button>
				</form>
				<form method="POST" action="?/moveMilestone" use:enhance>
					<input type="hidden" name="id" value={m.id} />
					<input type="hidden" name="dir" value="1" />
					<button class="link" disabled={i === p.milestoneList.length - 1} aria-label="Ниже">↓</button>
				</form>
				<form method="POST" action="?/deleteMilestone" use:enhance>
					<input type="hidden" name="id" value={m.id} />
					<button class="link" aria-label="Удалить этап">✕</button>
				</form>
			</li>
		{/each}
	</ol>
	<form method="POST" action="?/addMilestone" class="inline" use:enhance>
		<input name="title" placeholder="Новый этап" required />
		<input type="date" name="targetDate" />
		<button>Добавить</button>
	</form>

	<h2>Задачи ({p.tasks.done}/{p.tasks.total})</h2>
	<ul>
		{#each p.tasks.items as { task, milestoneId } (task.id)}
			<li class:done={task.completedAt !== null}>
				<span class="grow">{task.title} <small>→ {milestoneTitle(milestoneId)}</small></span>
				<form method="POST" action="?/linkTask" use:enhance>
					<input type="hidden" name="taskId" value={task.id} />
					<input type="hidden" name="milestoneId" value="" />
					<button class="link">Отвязать</button>
				</form>
			</li>
		{/each}
	</ul>
	{#if p.milestoneList.length && data.linkableTasks.length}
		<form method="POST" action="?/linkTask" class="inline" use:enhance>
			<select name="taskId">
				{#each data.linkableTasks as t (t.id)}<option value={t.id}>{t.title}</option>{/each}
			</select>
			<select name="milestoneId">
				{#each p.milestoneList as m (m.id)}<option value={m.id}>{m.title}</option>{/each}
			</select>
			<button>Привязать задачу</button>
		</form>
	{/if}

	<h2>Привычки</h2>
	<ul>
		{#each p.habits as s (s.habit.id)}
			<li class:done={s.met}>
				<span class="grow">
					<b>{s.habit.title}</b>
					<small>{scheduleText(s.habit.schedule)}{s.habit.archivedAt ? ' · в архиве' : ''}</small><br />
					{s.done}/{s.target} {s.period.type === 'week' ? 'на этой неделе' : 'в этом месяце'}
					{#if s.streak > 0}· серия: <b>{s.streak}</b>{/if}
				</span>
				<form method="POST" action="?/linkHabit" use:enhance>
					<input type="hidden" name="habitId" value={s.habit.id} />
					<input type="hidden" name="unlink" value="1" />
					<button class="link">Отвязать</button>
				</form>
			</li>
		{/each}
	</ul>
	{#if data.linkableHabits.length}
		<form method="POST" action="?/linkHabit" class="inline" use:enhance>
			<select name="habitId">
				{#each data.linkableHabits as h (h.id)}<option value={h.id}>{h.title}</option>{/each}
			</select>
			<button>Привязать привычку</button>
		</form>
	{/if}
</main>

<style>
	main {
		max-width: 36rem;
		margin: 1rem auto;
		padding: 0 1rem;
		font-family: system-ui, sans-serif;
	}
	progress {
		width: 100%;
	}
	ol,
	ul {
		list-style: none;
		padding: 0;
	}
	li {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		padding: 0.4rem 0;
		border-bottom: 1px solid #ddd;
	}
	li.done .grow {
		text-decoration: line-through;
		color: #888;
	}
	.grow {
		flex: 1;
	}
	.inline,
	.row {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		flex-wrap: wrap;
		margin: 0.5rem 0;
	}
	.col {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.check {
		width: 2.25rem;
		height: 2.25rem;
		border-radius: 50%;
		border: 2px solid #888;
		background: none;
		cursor: pointer;
	}
	li.done .check {
		background: #2e7d32;
		border-color: #2e7d32;
		color: white;
	}
	.link {
		background: none;
		border: none;
		color: #1a56db;
		cursor: pointer;
		padding: 0.25rem;
		font: inherit;
	}
	.link:disabled {
		color: #bbb;
		cursor: default;
	}
	.error {
		color: #b00020;
	}
	.empty {
		color: #888;
	}
</style>

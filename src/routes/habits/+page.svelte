<script lang="ts">
	// Svelte notes (for learning):
	//  * `data` is whatever `load` in +page.server.ts returned; `form` is the result of the last form action
	//    (here: an error message, if the core refused something).
	//  * Every button below is a tiny <form method="POST"> pointing at an action (`?/checkin`, `?/archive`...).
	//    `use:enhance` sends it in the background and then refreshes `data`, so the page updates without reloading.
	//  * `{#each list as item (item.id)}` repeats markup; the `(item.id)` part tells Svelte which row is which.
	//  * `class:done={cond}` adds the CSS class `done` while `cond` is true.
	//  * `$state` is a reactive variable: changing `adding` re-renders whatever depends on it.
	import { enhance } from '$app/forms';
	import HabitForm from './HabitForm.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let adding = $state(false);

	const dayNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
	type Schedule = PageProps['data']['habits'][number]['habit']['schedule'];
	const scheduleText = (s: Schedule) =>
		s.type === 'per_week'
			? `${s.count} раз в неделю`
			: s.type === 'per_month'
				? `${s.count} раз в месяц`
				: 'по дням: ' + s.days.map((d) => dayNames[d - 1]).join(', ');
</script>

<svelte:head>
	<title>Привычки</title>
</svelte:head>

<main>
	<h1>Привычки</h1>
	{#if form?.error}<p class="error">{form.error}</p>{/if}

	{#if data.habits.length === 0}
		<p class="empty">Пока нет привычек.</p>
	{/if}

	{#each data.habits as s (s.habit.id)}
		{@const today = s.days[s.days.length - 1]}
		{@const level = Math.min(100, Math.round((100 * s.done) / s.target))}
		<section class="card" class:met={s.met}>
			<div class="top">
				<!-- Big "today" button: the whole daily check-in is one tap.
				     It fills like water as the period's progress grows (`style:--fill` sets a CSS variable). -->
				<form method="POST" action="?/checkin" use:enhance>
					<input type="hidden" name="id" value={s.habit.id} />
					<input type="hidden" name="date" value={today.date} />
					<input type="hidden" name="on" value={!today.checked} />
					<button
						class="big water"
						class:done={today.checked}
						style:--fill="{level}%"
						aria-label={today.checked ? 'Снять отметку за сегодня' : 'Отметить сегодня'}
					>
						<span class="glyph" aria-hidden="true">{today.checked ? '✓' : '○'}</span>
					</button>
				</form>
				<div class="info">
					<strong>{s.habit.title}</strong>
					<small>{scheduleText(s.habit.schedule)}</small>
					<div class="stats">
						<span class="progress">{s.done}/{s.target}</span>
						{s.period.type === 'week' ? 'на этой неделе' : 'в этом месяце'}
						{#if s.streak > 0}· серия: <b>{s.streak}</b>{/if}
					</div>
				</div>
			</div>

			<!-- Last 7 days: tap a past day to add or remove a forgotten check-in. -->
			<div class="week">
				{#each s.days as day (day.date)}
					<form method="POST" action="?/checkin" use:enhance>
						<input type="hidden" name="id" value={s.habit.id} />
						<input type="hidden" name="date" value={day.date} />
						<input type="hidden" name="on" value={!day.checked} />
						<button
							class="day"
							class:done={day.checked}
							aria-label={`${day.date}: ${day.checked ? 'выполнено' : 'не выполнено'}`}
						>
							<span>{day.label}</span>
							<span>{day.num}</span>
						</button>
					</form>
				{/each}
			</div>

			<div class="row">
				<a href={`/habits/${s.habit.id}`}>Изменить</a>
				<form method="POST" action="?/archive" use:enhance>
					<input type="hidden" name="id" value={s.habit.id} />
					<button class="link">В архив</button>
				</form>
				<form method="POST" action="?/delete" use:enhance>
					<input type="hidden" name="id" value={s.habit.id} />
					<button class="link">Удалить</button>
				</form>
			</div>
		</section>
	{/each}

	{#if adding}
		<!-- `use:enhance` can take a function: after the server answers we run the default update, then close the form. -->
		<form
			method="POST"
			action="?/create"
			class="new"
			use:enhance={() =>
				async ({ update }) => {
					await update();
					adding = false;
				}}
		>
			<HabitForm submit="Создать" />
		</form>
	{:else}
		<button class="add" onclick={() => (adding = true)}>+ Новая привычка</button>
	{/if}

	{#if data.archived.length}
		<h2>Архив</h2>
		<ul>
			{#each data.archived as h (h.id)}
				<li>
					<span>{h.title}</span>
					<form method="POST" action="?/unarchive" use:enhance>
						<input type="hidden" name="id" value={h.id} />
						<button class="link">Вернуть</button>
					</form>
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
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: var(--radius-l);
		padding: 0.85rem;
		margin-bottom: 0.75rem;
	}
	.card.met {
		border-color: var(--level-4);
	}
	.top {
		display: flex;
		gap: 0.85rem;
		align-items: center;
	}
	.info {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.info small {
		color: var(--ink-muted);
	}
	.stats {
		color: var(--ink-soft);
		font-size: 0.9375rem;
	}
	.progress {
		font-weight: 700;
		color: var(--ink);
		font-variant-numeric: tabular-nums;
	}

	/* The big check-in button. Its water level (class "water", see theme.css) is the period's progress. */
	.big {
		width: 3.75rem;
		height: 3.75rem;
		min-height: 0;
		padding: 0;
		border-radius: 50%;
		border: 2px solid var(--field);
		background-color: var(--surface);
		color: var(--field);
		font-size: 1.5rem;
		line-height: 1;
		overflow: hidden;
		position: relative;
	}
	.big:hover:not(:disabled) {
		background-color: var(--wash);
	}
	/* The mark is painted with the same water line: light where it is under water, blue above. */
	.glyph {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		color: transparent;
		background: linear-gradient(to top, var(--on-level-4) var(--fill), var(--field) var(--fill));
		background-clip: text;
		-webkit-background-clip: text;
	}
	.big.done {
		border-color: var(--level-5);
		font-weight: 700;
	}

	/* The last seven days */
	.week {
		display: flex;
		gap: 0.25rem;
		margin: 0.85rem 0 0.35rem;
	}
	.week form {
		flex: 1;
	}
	.day {
		width: 100%;
		min-height: 2.75rem;
		padding: 0.2rem 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		line-height: 1.2;
		font-size: 0.75rem;
		font-variant-numeric: tabular-nums;
		border: 1px solid var(--line);
		border-radius: var(--radius-s);
		background: var(--paper);
		color: var(--ink-soft);
	}
	.day span:last-child {
		font-size: 0.9375rem;
		font-weight: 600;
	}
	.week form:last-child .day {
		border-color: var(--field);
	}
	.day.done,
	.day.done:hover:not(:disabled) {
		background: var(--level-4);
		border-color: var(--level-4);
		color: var(--on-level-4);
	}

	.row {
		display: flex;
		gap: 1rem;
		align-items: center;
		font-size: 0.875rem;
	}
	.row a {
		text-decoration: none;
	}
	.row a:hover {
		text-decoration: underline;
	}
	.link {
		background: none;
		border: none;
		color: var(--accent);
		min-height: 2rem;
		padding: 0;
	}
	.link:hover:not(:disabled) {
		background: none;
		color: var(--accent-hover);
		text-decoration: underline;
	}
	.add {
		width: 100%;
		padding: 0.75rem;
		border-style: dashed;
		background: none;
		color: var(--accent);
		font-weight: 600;
	}
	.new {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.85rem;
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: var(--radius-l);
	}
	ul {
		list-style: none;
		padding: 0;
	}
	li {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.4rem 0;
		border-bottom: 1px solid var(--line);
	}
</style>

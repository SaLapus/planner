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
	<nav><a href="/">← Задачи</a></nav>
	<h1>Привычки</h1>
	{#if form?.error}<p class="error">{form.error}</p>{/if}

	{#if data.habits.length === 0}
		<p class="empty">Пока нет привычек.</p>
	{/if}

	{#each data.habits as s (s.habit.id)}
		{@const today = s.days[s.days.length - 1]}
		<section class="card" class:met={s.met}>
			<div class="top">
				<!-- Big "today" button: the whole daily check-in is one tap. -->
				<form method="POST" action="?/checkin" use:enhance>
					<input type="hidden" name="id" value={s.habit.id} />
					<input type="hidden" name="date" value={today.date} />
					<input type="hidden" name="on" value={!today.checked} />
					<button
						class="big"
						class:done={today.checked}
						aria-label={today.checked ? 'Снять отметку за сегодня' : 'Отметить сегодня'}
					>
						{today.checked ? '✓' : '○'}
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

	{#if data.trashHabits.length || data.trashCheckins.length}
		<h2>Корзина</h2>
		<ul>
			{#each data.trashHabits as h (h.id)}
				<li>
					<span>{h.title}</span>
					<form method="POST" action="?/restoreHabit" use:enhance>
						<input type="hidden" name="id" value={h.id} />
						<button class="link">Восстановить</button>
					</form>
				</li>
			{/each}
			{#each data.trashCheckins as c (c.id)}
				<li>
					<span>Отметка: {c.habitTitle}, {c.date}</span>
					<form method="POST" action="?/restoreCheckin" use:enhance>
						<input type="hidden" name="id" value={c.id} />
						<button class="link">Восстановить</button>
					</form>
				</li>
			{/each}
		</ul>
	{/if}
</main>

<style>
	main {
		max-width: 32rem;
		margin: 1rem auto;
		padding: 0 1rem;
		font-family: system-ui, sans-serif;
	}
	.card {
		border: 1px solid #ddd;
		border-radius: 0.75rem;
		padding: 0.75rem;
		margin-bottom: 0.75rem;
	}
	.card.met {
		border-color: #2e7d32;
	}
	.top {
		display: flex;
		gap: 0.75rem;
		align-items: center;
	}
	.info {
		display: flex;
		flex-direction: column;
	}
	.progress {
		font-weight: bold;
	}
	.big {
		width: 3.5rem;
		height: 3.5rem;
		border-radius: 50%;
		border: 2px solid #888;
		background: none;
		font-size: 1.6rem;
		cursor: pointer;
	}
	.big.done,
	.day.done {
		background: #2e7d32;
		border-color: #2e7d32;
		color: white;
	}
	.week {
		display: flex;
		gap: 0.25rem;
		margin: 0.75rem 0 0.25rem;
	}
	.week form {
		flex: 1;
	}
	.day {
		width: 100%;
		min-height: 2.75rem;
		display: flex;
		flex-direction: column;
		font-size: 0.75rem;
		border: 1px solid #ccc;
		border-radius: 0.5rem;
		background: none;
		cursor: pointer;
	}
	.row {
		display: flex;
		gap: 1rem;
		align-items: center;
		font-size: 0.9rem;
	}
	.link {
		background: none;
		border: none;
		color: #1a56db;
		cursor: pointer;
		padding: 0;
		font: inherit;
	}
	.add {
		width: 100%;
		padding: 0.75rem;
		font-size: 1rem;
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
		border-bottom: 1px solid #ddd;
	}
	.error {
		color: #b00020;
	}
	.empty {
		color: #888;
	}
</style>

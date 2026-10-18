<script lang="ts">
	// Svelte notes:
	//  * `$props()` receives values from the parent. Here: the button label and (when editing) the current habit.
	//  * `$state` makes a variable "reactive": when it changes, the markup that uses it updates by itself.
	//    We use it so the form shows the right fields (a count, or weekday checkboxes) for the chosen schedule.
	import type { Habit } from '#lib/core/index.js';

	let { habit = null, submit }: { habit?: Habit | null; submit: string } = $props();

	// The initial value only matters once (when the form opens); after that the select drives `type`.
	// svelte-ignore state_referenced_locally
	let type = $state(habit?.schedule.type ?? 'per_week');
	const weekdayNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
	// `$derived` recomputes these whenever `habit` changes.
	const count = $derived(habit && habit.schedule.type !== 'weekdays' ? habit.schedule.count : 3);
	const days = $derived(habit?.schedule.type === 'weekdays' ? habit.schedule.days : []);
</script>

<input
	name="title"
	placeholder="Название привычки…"
	autocomplete="off"
	value={habit?.title ?? ''}
	aria-label="Название привычки"
	required
/>
<select name="type" bind:value={type} aria-label="Расписание">
	<option value="per_week">N раз в неделю</option>
	<option value="per_month">N раз в месяц</option>
	<option value="weekdays">По дням недели</option>
</select>
{#if type === 'weekdays'}
	<div class="days">
		{#each weekdayNames as name, i (name)}
			<label><input type="checkbox" name="days" value={i + 1} checked={days.includes(i + 1)} /> {name}</label>
		{/each}
	</div>
{:else}
	<label>
		Раз:
		<input type="number" name="count" min="1" max={type === 'per_week' ? 7 : 31} value={count} />
	</label>
{/if}
<button>{submit}</button>

<style>
	.days {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	input[type='number'] {
		width: 4rem;
	}
</style>

<script lang="ts">
	// The input fields shared by "new" and "edit". The parent page owns the <form>.
	//  * `$state(...)` makes a variable reactive: when it changes, the markup that uses it updates.
	//  * `$bindable` + `bind:value` / `bind:checked` is two-way: typing in the input changes the variable.
	export interface Values {
		title: string;
		notes: string;
		location: string;
		allDay: boolean;
		timeZone: string;
		start: string;
		end: string;
		/** RRULE of the series, or null. */
		recurrence: string | null;
	}

	// `occurrence` = editing a single occurrence: all-day, zone and repeat cannot change then.
	let {
		values,
		zones,
		occurrence = false
	}: { values: Values; zones: string[]; occurrence?: boolean } = $props();

	import RecurrenceFields from './RecurrenceFields.svelte';

	// Copy the starting values once; the user edits the copies.
	// svelte-ignore state_referenced_locally
	let allDay = $state(values.allDay);
	// svelte-ignore state_referenced_locally
	let startDate = $state(values.start.slice(0, 10));
</script>

<label>Название
	<input name="title" value={values.title} required autocomplete="off" />
</label>

{#if occurrence}
	<!-- Single occurrence: keep these as they are, the form still needs to say what they are. -->
	{#if allDay}<input type="hidden" name="allDay" value="on" />{/if}
	<input type="hidden" name="timeZone" value={values.timeZone} />
{:else}
	<label class="row">
		<input type="checkbox" name="allDay" bind:checked={allDay} />
		Весь день
	</label>
{/if}

<!-- The input type depends on allDay, so we render a different pair of inputs. -->
{#if allDay}
	<label>Начало
		<input type="date" name="start" value={values.start.slice(0, 10)} required oninput={(e) => (startDate = e.currentTarget.value)} />
	</label>
	<label>Конец (включительно)
		<input type="date" name="end" value={values.end.slice(0, 10)} />
	</label>
{:else}
	<label>Начало
		<input type="datetime-local" name="start" value={values.start.length > 10 ? values.start : ''} required oninput={(e) => (startDate = e.currentTarget.value.slice(0, 10))} />
	</label>
	<label>Конец
		<input type="datetime-local" name="end" value={values.end.length > 10 ? values.end : ''} />
	</label>
{/if}

{#if !occurrence}
	<label>Часовой пояс
		<input name="timeZone" value={values.timeZone} list="zones" autocomplete="off" />
		<datalist id="zones">
			{#each zones as z (z)}<option value={z}></option>{/each}
		</datalist>
	</label>

	<RecurrenceFields rule={values.recurrence} {startDate} timeZone={values.timeZone} />
{/if}

<label>Место
	<input name="location" value={values.location} autocomplete="off" />
</label>

<label>Заметки
	<textarea name="notes" rows="3">{values.notes}</textarea>
</label>

<style>
	label {
		display: grid;
		gap: 0.25rem;
		margin: 0.75rem 0;
		font-size: 0.9rem;
		color: var(--ink-soft);
	}
	.row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	input:not([type='checkbox']),
	textarea {
		font: inherit;
		padding: 0.5rem;
		min-height: 2.5rem;
		width: 100%;
		box-sizing: border-box;
	}
</style>

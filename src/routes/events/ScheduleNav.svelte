<script lang="ts">
	// The Schedule section's second row, shared by every Schedule page.
	import { page } from '$app/state';
	import { newEventHref, scheduleItems } from './schedule-nav.js';

	let { today, date }: { today: string; date?: string } = $props();

	let items = $derived(scheduleItems(today, page.url.pathname));
</script>

<nav class="subnav" aria-label="Расписание">
	{#each items as item (item.href)}
		<a href={item.href} aria-current={item.current ? 'page' : undefined}>{item.label}</a>
	{/each}
	<a href={newEventHref(date)} class="add">+ Событие</a>
</nav>

<style>
	.add {
		margin-left: auto;
	}
</style>

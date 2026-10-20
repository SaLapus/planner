<script lang="ts">
	// The Schedule section's second row, shared by every Schedule page.
	import { page } from '$app/state';

	let { today }: { today: string } = $props();

	let items = $derived([
		{ href: '/events', label: 'Расписание', current: page.url.pathname === '/events' },
		{ href: `/events/day/${today}`, label: 'День', current: page.url.pathname.startsWith('/events/day/') },
		{ href: `/events/week/${today}`, label: 'Неделя', current: page.url.pathname.startsWith('/events/week/') },
		{ href: '/calendar', label: 'Лента', current: page.url.pathname === '/calendar' }
	]);
</script>

<nav class="subnav" aria-label="Расписание">
	{#each items as item (item.href)}
		<a href={item.href} aria-current={item.current ? 'page' : undefined}>{item.label}</a>
	{/each}
	<a href="/events/new" class="add">+ Событие</a>
</nav>

<style>
	.add {
		margin-left: auto;
	}
</style>

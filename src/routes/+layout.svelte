<script lang="ts">
	import { page } from '$app/state';
	import { NAV_MAIN, NAV_SECONDARY, currentSection, showsNav } from './nav.js';

	let { children } = $props();

	let section = $derived(currentSection(page.url.pathname));
</script>

{#if showsNav(page.url.pathname)}
	<header class="topbar">
		<nav aria-label="Разделы" class="main">
			{#each NAV_MAIN as item (item.href)}
				<a href={item.href} aria-current={section === item.href ? 'page' : undefined}>{item.label}</a>
			{/each}
		</nav>
		<nav aria-label="Служебные" class="secondary">
			{#each NAV_SECONDARY as item (item.href)}
				<a href={item.href} aria-current={section === item.href ? 'page' : undefined}>{item.label}</a>
			{/each}
			<form method="POST" action="/auth/logout"><button>Выйти</button></form>
		</nav>
	</header>
{/if}

{@render children()}

<style>
	.topbar {
		max-width: 32rem;
		margin: 0.5rem auto 0;
		padding: 0 1rem;
		font-family: system-ui, sans-serif;
		border-bottom: 1px solid #ddd;
	}
	.topbar nav {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.25rem 0.9rem;
		padding: 0.3rem 0;
	}
	.topbar a {
		color: inherit;
		text-decoration: none;
		border-bottom: 2px solid transparent;
	}
	.topbar a[aria-current='page'] {
		font-weight: bold;
		border-bottom-color: currentColor;
	}
	.secondary {
		font-size: 0.8rem;
		color: #666;
	}
	.secondary form {
		display: inline;
		margin: 0;
	}
	.secondary button {
		font: inherit;
		padding: 0;
		border: none;
		background: none;
		color: inherit;
		cursor: pointer;
		text-decoration: underline;
	}

	/* The second row: navigation inside a section, shared by every page that has one. */
	:global(nav.subnav) {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem 0.75rem;
		margin: 0.5rem 0 1rem;
		font-size: 0.9rem;
	}
	:global(nav.subnav a) {
		color: inherit;
	}
	:global(nav.subnav a.active),
	:global(nav.subnav a[aria-current='page']) {
		font-weight: bold;
	}
</style>

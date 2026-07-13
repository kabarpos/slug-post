# Svelte 5 + Inertia.js Pages

## Core Rules
- Pages in `resources/js/Pages/`, components in `resources/js/Components/`
- **JavaScript only** — no TypeScript in `.svelte` files
- Use `$state()`, `$props()`, `$derived()` (Svelte 5 runes)
- Import from `@inertiajs/svelte`: `router`, `use:inertia` directive
- Use `DashboardLayout` for protected pages (`@/Components/DashboardLayout.svelte`)
- Icons: Lucide (`import { IconName } from 'lucide-svelte'`)

## Basic Pattern

```svelte
<script>
  import { router } from '@inertiajs/svelte'
  import DashboardLayout from '@/Components/DashboardLayout.svelte'
  let { flash, posts } = $props()
  let isLoading = $state(false)
</script>

<DashboardLayout title="Posts" subtitle="Kelola post">
  {#if flash?.error}
    <div class="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">{flash.error}</div>
  {/if}
  <div class="p-6">{!-- Content --}</div>
</DashboardLayout>
```

## Display Page

```svelte
<script>
  import { fly } from 'svelte/transition'
  import DashboardLayout from '@/Components/DashboardLayout.svelte'
  let { posts } = $props()
</script>

<DashboardLayout title="Posts" subtitle="Daftar post">
  <div class="max-w-7xl mx-auto px-4 py-8">
    <div class="grid gap-4">
      {#each posts as post, i}
        <div class="p-6 bg-white rounded-lg shadow" in:fly={{ y: 20, duration: 800, delay: i * 50 }}>
          <h2 class="text-xl font-bold mb-2">{post.title}</h2>
        </div>
      {/each}
    </div>
  </div>
</DashboardLayout>
```

## Form Page (Create/Edit)

```svelte
<script>
  import { router } from '@inertiajs/svelte'
  import DashboardLayout from '@/Components/DashboardLayout.svelte'
  let { flash, post } = $props()
  let isEdit = !!post
  let form = $state({ title: post?.title || '', content: post?.content || '' })
  let isLoading = $state(false)

  function submitForm() {
    isLoading = true
    const url = isEdit ? `/posts/${post.id}` : '/posts'
    const method = isEdit ? router.put : router.post
    method(url, form, { onFinish: () => isLoading = false })
  }
</script>

<DashboardLayout title={isEdit ? 'Edit Post' : 'Create Post'}>
  <form onsubmit={(e) => { e.preventDefault(); submitForm(); }}>
    <div class="space-y-4">
      <div>
        <label class="block text-sm font-medium mb-2">Title</label>
        <input bind:value={form.title} type="text" class="w-full px-4 py-2 rounded-lg border focus:outline-none" placeholder="Enter title" />
      </div>
      <button type="submit" disabled={isLoading} class="px-6 py-3 bg-blue-600 text-white rounded-lg disabled:opacity-50">
        {#if isLoading}Saving...{:else}{isEdit ? 'Update' : 'Save'}{/if}
      </button>
    </div>
  </form>
</DashboardLayout>
```

## Common Patterns

| Pattern | Code |
|---------|------|
| Form submit | `router.post('/path', form)` |
| Update | `router.put('/path/1', form)` |
| Delete | `router.delete('/path/1')` |
| Inertia link | `<a href="/path" use:inertia>` |
| Flash error | `{#if flash?.error}{flash.error}{/if}` |
| Transition | `<div in:fly={{ y: 20, duration: 800 }}>` |
| Loading state | `disabled={isLoading}` + conditional text |

## Controller to Page Mapping
- `index()` → `posts/index.svelte`
- `create()` → `posts/form.svelte` (no post prop)
- `show()` → `posts/show.svelte`
- `edit()` → `posts/form.svelte` (with post prop)
- `store/update/destroy()` → redirect

## Icons (Lucide)
```svelte
<script>
  import { CheckCircle, AlertCircle, Plus, Edit, Trash2, User, Search, Settings, Menu, X } from 'lucide-svelte'
</script>
<CheckCircle class="w-5 h-5 text-green-500" />
```

Browse icons: [lucide.dev/icons](https://lucide.dev/icons)

## Related
- [[concepts/code-conventions]]

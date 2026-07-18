<script>
    import { router } from '@inertiajs/svelte';
    import { onMount } from 'svelte';
    import { Toast } from '../Components/helper.js';

    let { post, author = null, edit_token, user = null } = $props();

    // ─── Core state ──────────────────────────────────────────────
    let content = $state(post.content);
    let savedContent = $state(post.content);
    let lastSaved = $state(post.updated_at);
    let isSaving = $state(false);

    // ─── UI state ────────────────────────────────────────────────
    let viewMode = $state('split');           // 'code' | 'split' | 'preview'
    let deviceMode = $state('desktop');       // 'desktop' | 'tablet' | 'mobile'
    let splitPercent = $state(50);
    let livePreview = $state(true);
    let wordWrap = $state(true);
    let autosave = $state(false);
    let previewDoc = $state(post.content);
    let cursor = $state({ line: 1, col: 1 });
    let draftOffer = $state(null);
    let isNarrow = $state(typeof window !== 'undefined' ? window.matchMedia('(max-width: 1023px)').matches : false);

    // ─── Editor internals ────────────────────────────────────────
    let editorHost = $state(null);
    let view = null;
    let CM = null;                 // codemirror module (dynamic import)
    let wrapCompartment = null;
    let editorReady = $state(false);
    let editorFailed = $state(false);

    const PREFS_KEY = 'htmleditor:prefs';
    const DRAFT_KEY = `htmleditor:draft:${post.slug}`;

    // ─── Derived ─────────────────────────────────────────────────
    let hasUnsavedChanges = $derived(content !== savedContent);
    let saveState = $derived(isSaving ? 'saving' : hasUnsavedChanges ? 'unsaved' : 'saved');
    let lineCount = $derived(content.split('\n').length);
    let sizeKB = $derived((new TextEncoder().encode(content).length / 1024).toFixed(1));
    let effectiveMode = $derived(isNarrow && viewMode === 'split' ? 'code' : viewMode);
    let showEditor = $derived(effectiveMode === 'code' || effectiveMode === 'split');
    let showPreview = $derived(effectiveMode === 'preview' || effectiveMode === 'split');

    // ─── Helpers ─────────────────────────────────────────────────
    function formatTime(ts) {
        return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    }

    function formatDate(ts) {
        return new Date(ts).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    }

    function savePrefs() {
        try {
            localStorage.setItem(PREFS_KEY, JSON.stringify({
                viewMode, deviceMode, splitPercent, livePreview, wordWrap, autosave
            }));
        } catch {}
    }

    function flushDraft() {
        if (!draftOffer && content !== savedContent) {
            try {
                localStorage.setItem(DRAFT_KEY, JSON.stringify({
                    content, savedAt: new Date().toISOString()
                }));
            } catch {}
        }
    }

    // ─── Save ────────────────────────────────────────────────────
    async function save(isAuto = false) {
        if (isSaving) return;
        isSaving = true;
        const sent = content; // capture — user may keep typing while we save
        try {
            const res = await fetch(`/${post.slug}/edit/${edit_token}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: sent, slug: post.slug, format: 'html' })
            });
            if (!res.ok) throw new Error('Failed to save');
            const data = await res.json().catch(() => ({}));
            savedContent = sent;
            lastSaved = data.updated_at || new Date().toISOString();
            try { localStorage.removeItem(DRAFT_KEY); } catch {}
            if (!isAuto) Toast('Changes saved', 'success');
        } catch {
            Toast(isAuto ? 'Autosave failed — your draft is backed up locally' : 'Failed to save changes. Please try again.', 'error');
        } finally {
            isSaving = false;
        }
    }

    // ─── Navigation guard (unsaved changes) ──────────────────────
    function nav(href) {
        return (e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // let browser open new tab
            e.preventDefault();
            if (!hasUnsavedChanges || confirm('You have unsaved changes. Leave anyway?')) {
                flushDraft();
                router.visit(href);
            }
        };
    }

    function claimPost() {
        if (!hasUnsavedChanges || confirm('You have unsaved changes. Leave anyway?')) {
            flushDraft();
            router.visit(`/claim/${post.slug}?token=${edit_token}`);
        }
    }

    // ─── View controls ───────────────────────────────────────────
    function setViewMode(mode) {
        viewMode = mode;
        if (mode !== 'code') previewDoc = content; // refresh when opening preview
        savePrefs();
    }

    function setDevice(mode) {
        deviceMode = mode;
        savePrefs();
    }

    function toggleLive() {
        livePreview = !livePreview;
        if (livePreview) previewDoc = content;
        savePrefs();
    }

    function refreshPreview() {
        previewDoc = content;
    }

    function toggleAutosave() {
        autosave = !autosave;
        savePrefs();
        Toast(autosave ? 'Autosave on — saves 2s after you stop typing' : 'Autosave off', 'info');
    }

    function toggleWrap() {
        wordWrap = !wordWrap;
        savePrefs();
        if (view && wrapCompartment && CM) {
            view.dispatch({
                effects: wrapCompartment.reconfigure(wordWrap ? CM.EditorView.lineWrapping : [])
            });
        }
    }

    // ─── Split resizer ───────────────────────────────────────────
    let mainEl = $state(null);
    function startResize(e) {
        e.preventDefault();
        const rect = mainEl.getBoundingClientRect();
        const onMove = (ev) => {
            splitPercent = Math.min(80, Math.max(20, ((ev.clientX - rect.left) / rect.width) * 100));
        };
        const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            savePrefs();
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
    }

    function resetSplit() {
        splitPercent = 50;
        savePrefs();
    }

    // ─── Draft restore ───────────────────────────────────────────
    function restoreDraft() {
        const d = draftOffer;
        draftOffer = null;
        try { localStorage.removeItem(DRAFT_KEY); } catch {}
        if (!d) return;
        if (view) {
            view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: d.content } });
        } else {
            content = d.content;
        }
        Toast('Draft restored — remember to save', 'info');
    }

    function discardDraft() {
        draftOffer = null;
        try { localStorage.removeItem(DRAFT_KEY); } catch {}
    }

    // ─── Effects ─────────────────────────────────────────────────
    // Debounced live preview — iframe reloads 700ms after typing stops,
    // not on every keystroke (keeps iframe scroll position & scripts sane)
    $effect(() => {
        const c = content;
        if (!livePreview) return;
        const t = setTimeout(() => { previewDoc = c; }, 700);
        return () => clearTimeout(t);
    });

    // Autosave — 2.5s after typing stops
    $effect(() => {
        if (!autosave || !hasUnsavedChanges || isSaving) return;
        const t = setTimeout(() => save(true), 2500);
        return () => clearTimeout(t);
    });

    // Local draft backup — protects against refresh/crash
    $effect(() => {
        if (draftOffer) return; // don't clobber the draft we're offering to restore
        const c = content;
        const saved = savedContent;
        if (c === saved) {
            try { localStorage.removeItem(DRAFT_KEY); } catch {}
            return;
        }
        const t = setTimeout(() => {
            try {
                localStorage.setItem(DRAFT_KEY, JSON.stringify({ content: c, savedAt: new Date().toISOString() }));
            } catch {}
        }, 800);
        return () => clearTimeout(t);
    });

    // Re-attach the persistent CodeMirror DOM when the editor pane
    // remounts (e.g. after switching code → preview → code)
    $effect(() => {
        if (showEditor && editorHost && view && view.dom.parentNode !== editorHost) {
            editorHost.appendChild(view.dom);
        }
    });

    // ─── Mount ───────────────────────────────────────────────────
    onMount(() => {
        let destroyed = false;

        // Restore prefs
        try {
            const p = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
            if (p.viewMode) viewMode = p.viewMode;
            if (p.deviceMode) deviceMode = p.deviceMode;
            if (typeof p.splitPercent === 'number') splitPercent = p.splitPercent;
            if (typeof p.livePreview === 'boolean') livePreview = p.livePreview;
            if (typeof p.wordWrap === 'boolean') wordWrap = p.wordWrap;
            if (typeof p.autosave === 'boolean') autosave = p.autosave;
        } catch {}

        // Offer local draft recovery if newer than server version
        try {
            const raw = localStorage.getItem(DRAFT_KEY);
            if (raw) {
                const d = JSON.parse(raw);
                if (d.content && d.content !== post.content && new Date(d.savedAt) > new Date(post.updated_at)) {
                    draftOffer = d;
                } else {
                    localStorage.removeItem(DRAFT_KEY);
                }
            }
        } catch {}

        // Responsive: split view needs a wide screen
        const mq = window.matchMedia('(max-width: 1023px)');
        const onMq = (e) => { isNarrow = e.matches; };
        mq.addEventListener('change', onMq);

        // Warn on refresh/close with unsaved work + flush draft
        const onBeforeUnload = (e) => {
            flushDraft();
            if (content !== savedContent) {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', onBeforeUnload);

        // Global shortcut: Cmd/Ctrl+S saves from anywhere on the page
        const onKeydown = (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
                e.preventDefault();
                if (hasUnsavedChanges && !isSaving) save(false);
            }
        };
        window.addEventListener('keydown', onKeydown);

        // CodeMirror — dynamic import so it only loads on this page
        (async () => {
            try {
                const [cm, cmState, cmView, cmCommands, langHtml, themeOneDark] = await Promise.all([
                    import('codemirror'),
                    import('@codemirror/state'),
                    import('@codemirror/view'),
                    import('@codemirror/commands'),
                    import('@codemirror/lang-html'),
                    import('@codemirror/theme-one-dark')
                ]);
                if (destroyed) return;
                CM = cmView;
                wrapCompartment = new cmState.Compartment();

                const editorTheme = cmView.EditorView.theme({
                    '&': {
                        height: '100%',
                        fontSize: '14px',
                        backgroundColor: '#282c34'
                    },
                    '.cm-scroller': {
                        fontFamily: "'JetBrains Mono', 'Fira Code', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                        lineHeight: '1.6'
                    },
                    '.cm-content': { padding: '12px 0' },
                    '.cm-gutters': {
                        backgroundColor: '#282c34',
                        color: '#4b5263',
                        borderRight: '1px solid #3e4451'
                    },
                    '.cm-activeLineGutter': { backgroundColor: '#2c313a' },
                    '.cm-activeLine': { backgroundColor: 'rgba(82, 139, 255, 0.06)' },
                    '&.cm-focused': { outline: 'none' },
                    '.cm-selectionMatch': { backgroundColor: 'rgba(82, 139, 255, 0.15)' },
                    '.cm-searchMatch': {
                        backgroundColor: 'rgba(209, 154, 102, 0.25)',
                        outline: '1px solid rgba(209, 154, 102, 0.4)'
                    },
                    '.cm-searchMatch-selected': { backgroundColor: 'rgba(209, 154, 102, 0.45)' },
                    '.cm-panels': {
                        backgroundColor: '#21252b',
                        color: '#abb2bf',
                        borderColor: '#181a1f'
                    },
                    '.cm-panels input, .cm-panels button': {
                        backgroundColor: '#2c313a',
                        color: '#abb2bf',
                        border: '1px solid #3e4451',
                        borderRadius: '4px'
                    },
                    '.cm-tooltip': {
                        backgroundColor: '#21252b',
                        border: '1px solid #3e4451'
                    },
                    '.cm-tooltip-autocomplete ul li[aria-selected]': {
                        backgroundColor: '#3e4451'
                    }
                }, { dark: true });

                view = new cmView.EditorView({
                    state: cmState.EditorState.create({
                        doc: content,
                        extensions: [
                            cm.basicSetup,
                            cmView.keymap.of([cmCommands.indentWithTab]),
                            langHtml.html(),
                            themeOneDark.oneDark,
                            editorTheme,
                            wrapCompartment.of(wordWrap ? cmView.EditorView.lineWrapping : []),
                            cmView.EditorView.updateListener.of((update) => {
                                if (update.docChanged) {
                                    content = update.state.doc.toString();
                                }
                                if (update.selectionSet || update.docChanged) {
                                    const head = update.state.selection.main.head;
                                    const line = update.state.doc.lineAt(head);
                                    cursor = { line: line.number, col: head - line.from + 1 };
                                }
                            })
                        ]
                    }),
                    parent: editorHost
                });
                editorReady = true;
            } catch (err) {
                console.error('CodeMirror failed to load, falling back to plain textarea:', err);
                if (!destroyed) editorFailed = true;
            }
        })();

        return () => {
            destroyed = true;
            mq.removeEventListener('change', onMq);
            window.removeEventListener('beforeunload', onBeforeUnload);
            window.removeEventListener('keydown', onKeydown);
            view?.destroy();
            view = null;
        };
    });
</script>

<svelte:head>
    <title>Edit: {post.title} - SlugPost</title>
</svelte:head>

<div class="h-screen flex flex-col bg-[#282c34] text-[#abb2bf] overflow-hidden">

    <!-- ══════════ TOP BAR ══════════ -->
    <header class="flex-shrink-0 h-14 bg-[#21252b] border-b border-[#181a1f] flex items-center gap-3 px-3 sm:px-4">

        <!-- Left: back + identity -->
        <div class="flex items-center gap-3 min-w-0">
            <a href="/home" onclick={nav('/home')} class="flex items-center gap-2 text-[#7f848e] hover:text-white transition-colors flex-shrink-0" title="Back to dashboard">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>
                </svg>
                <img src="/public/android-icon-48x48.png" alt="SlugPost" class="w-6 h-6 hidden sm:block">
            </a>

            <div class="h-6 w-px bg-[#3e4451] hidden lg:block"></div>

            <div class="hidden lg:flex flex-col min-w-0">
                <h1 class="text-sm font-medium text-slate-200 truncate max-w-[280px] leading-tight">{post.title || 'Untitled'}</h1>
                <div class="flex items-center gap-1.5 text-[11px] text-[#7f848e]">
                    <span class="truncate max-w-[160px]">/{post.slug}</span>
                    <span class="text-[#3e4451]">•</span>
                    <span class="flex items-center gap-1 whitespace-nowrap">
                        <span class="w-1.5 h-1.5 rounded-full {saveState === 'saved' ? 'bg-emerald-400' : saveState === 'saving' ? 'bg-blue-400 animate-pulse' : 'bg-amber-400'}"></span>
                        {saveState === 'saved' ? 'Saved' : saveState === 'saving' ? 'Saving…' : 'Unsaved changes'}
                    </span>
                </div>
            </div>
        </div>

        <!-- Center: view switcher -->
        <div class="flex-1 flex justify-center">
            <div class="flex items-center bg-[#181a1f] rounded-lg p-1 gap-0.5">
                <button
                    onclick={() => setViewMode('code')}
                    class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all {effectiveMode === 'code' ? 'bg-[#3e4451] text-white shadow-sm' : 'text-[#7f848e] hover:text-[#abb2bf]'}"
                    title="Code only"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline>
                    </svg>
                    <span class="hidden md:inline">Code</span>
                </button>
                {#if !isNarrow}
                    <button
                        onclick={() => setViewMode('split')}
                        class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all {effectiveMode === 'split' ? 'bg-[#3e4451] text-white shadow-sm' : 'text-[#7f848e] hover:text-[#abb2bf]'}"
                        title="Side-by-side"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="3" y="3" width="18" height="18" rx="2"></rect><line x1="12" y1="3" x2="12" y2="21"></line>
                        </svg>
                        <span class="hidden md:inline">Split</span>
                    </button>
                {/if}
                <button
                    onclick={() => setViewMode('preview')}
                    class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all {effectiveMode === 'preview' ? 'bg-[#3e4451] text-white shadow-sm' : 'text-[#7f848e] hover:text-[#abb2bf]'}"
                    title="Preview only"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle>
                    </svg>
                    <span class="hidden md:inline">Preview</span>
                </button>
            </div>
        </div>

        <!-- Right: actions -->
        <div class="flex items-center gap-1.5 sm:gap-2">
            <!-- Autosave toggle -->
            <button
                onclick={toggleAutosave}
                class="hidden xl:flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors {autosave ? 'text-primary-300 bg-primary-500/10' : 'text-[#7f848e] hover:text-[#abb2bf]'}"
                title="Autosave — save automatically 2s after you stop typing"
                role="switch"
                aria-checked={autosave}
            >
                <span class="relative w-7 h-4 rounded-full transition-colors {autosave ? 'bg-primary-500' : 'bg-[#3e4451]'}">
                    <span class="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all {autosave ? 'left-3.5' : 'left-0.5'}"></span>
                </span>
                Autosave
            </button>

            <a
                href="/{post.slug}/visual/{edit_token}"
                onclick={nav(`/${post.slug}/visual/${edit_token}`)}
                class="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 rounded-lg transition-colors"
                title="Visual Builder — edit without code"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 19l7-7 3 3-7 7-3-3z"></path><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path><path d="M2 2l7.586 7.586"></path><circle cx="11" cy="11" r="2"></circle>
                </svg>
                Visual
            </a>

            <a
                href="/{post.slug}/settings/{edit_token}"
                onclick={nav(`/${post.slug}/settings/${edit_token}`)}
                class="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[#abb2bf] hover:text-white hover:bg-[#3e4451] rounded-lg transition-colors"
                title="Post settings"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="3"></circle>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                </svg>
                Settings
            </a>

            {#if !author && user}
                <button
                    onclick={claimPost}
                    class="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-primary-400 border border-primary-500/40 rounded-lg hover:bg-primary-500/10 transition-colors"
                    title="Claim this post to your account"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle>
                        <line x1="19" x2="19" y1="8" y2="14"></line><line x1="22" x2="16" y1="11" y2="11"></line>
                    </svg>
                    Claim
                </button>
            {/if}

            <a
                href="/{post.slug}"
                target="_blank"
                rel="noopener"
                class="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[#abb2bf] border border-[#3e4451] rounded-lg hover:bg-[#3e4451] transition-colors"
                title="Open live page in a new tab"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                    <polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line>
                </svg>
                <span class="hidden sm:inline">View</span>
            </a>

            <button
                onclick={() => save(false)}
                disabled={isSaving || !hasUnsavedChanges}
                class="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-lg transition-all {hasUnsavedChanges && !isSaving ? 'bg-primary-600 text-white hover:bg-primary-500 shadow-sm' : 'bg-[#2c313a] text-[#7f848e] cursor-default'}"
                title="Save (⌘S)"
            >
                {#if isSaving}
                    <svg class="animate-spin h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Saving…</span>
                {:else if hasUnsavedChanges}
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                        <polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline>
                    </svg>
                    <span>Save</span>
                {:else}
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    <span>Saved</span>
                {/if}
            </button>

            {#if user}
                <a href="/home" onclick={nav('/home')} class="w-8 h-8 bg-gradient-to-br from-primary-500 to-primary-600 rounded-full flex items-center justify-center text-white font-semibold text-sm flex-shrink-0" title="Dashboard">
                    {user.name[0].toUpperCase()}
                </a>
            {/if}
        </div>
    </header>

    <!-- ══════════ DRAFT RECOVERY BANNER ══════════ -->
    {#if draftOffer}
        <div class="flex-shrink-0 bg-amber-500/10 border-b border-amber-500/30 px-4 py-2.5 flex items-center gap-3 text-sm z-30">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-amber-400 flex-shrink-0">
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                <line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
            <span class="text-amber-200 flex-1 min-w-0 truncate">
                A local draft from <strong>{formatDate(draftOffer.savedAt)}</strong> is newer than the saved version.
            </span>
            <button onclick={restoreDraft} class="px-3 py-1 text-xs font-semibold bg-amber-500 text-amber-950 rounded-md hover:bg-amber-400 transition-colors flex-shrink-0">
                Restore draft
            </button>
            <button onclick={discardDraft} class="px-3 py-1 text-xs font-medium text-amber-300 hover:text-amber-100 transition-colors flex-shrink-0">
                Discard
            </button>
        </div>
    {/if}

    <!-- ══════════ MAIN AREA ══════════ -->
    <main bind:this={mainEl} class="flex-1 flex overflow-hidden">

        <!-- ── Editor pane ── -->
        {#if showEditor}
            <div class="flex flex-col min-w-0 bg-[#282c34]" style:width={effectiveMode === 'split' ? splitPercent + '%' : '100%'}>
                <div class="flex-1 min-h-0 relative">
                    <!-- Host always rendered so CodeMirror can mount into it;
                         skeleton overlays it until the chunk is ready -->
                    <div bind:this={editorHost} class="absolute inset-0 {editorReady ? '' : 'opacity-0'}"></div>
                    {#if editorFailed}
                        <!-- Graceful fallback if CodeMirror chunk fails to load -->
                        <textarea
                            bind:value={content}
                            spellcheck="false"
                            class="absolute inset-0 w-full h-full p-4 bg-[#282c34] text-[#abb2bf] text-sm leading-relaxed font-mono resize-none focus:outline-none"
                            placeholder="<!DOCTYPE html>&#10;<html>&#10;  <head>&#10;    <title>My Page</title>&#10;  </head>&#10;  <body>&#10;    <h1>Hello World</h1>&#10;  </body>&#10;</html>"
                        ></textarea>
                    {:else if !editorReady}
                        <!-- Loading skeleton -->
                        <div class="absolute inset-0 flex flex-col items-center justify-center gap-3 text-[#5c6370]">
                            <svg class="animate-spin h-6 w-6 text-primary-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            <span class="text-xs">Loading editor…</span>
                        </div>
                    {/if}
                </div>
            </div>
        {/if}

        <!-- ── Resizer ── -->
        {#if effectiveMode === 'split'}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
                onpointerdown={startResize}
                ondblclick={resetSplit}
                class="w-1.5 flex-shrink-0 bg-[#181a1f] hover:bg-primary-500/60 active:bg-primary-500 cursor-col-resize transition-colors"
                title="Drag to resize • double-click to reset 50/50"
            ></div>
        {/if}

        <!-- ── Preview pane ── -->
        {#if showPreview}
            <div class="flex-1 flex flex-col min-w-0 bg-[#1b1e24]">
                <!-- Preview toolbar -->
                <div class="flex-shrink-0 h-10 bg-[#21252b] border-b border-[#181a1f] flex items-center gap-2 px-3">
                    <span class="text-xs font-medium text-[#7f848e] hidden sm:inline">Preview</span>

                    <!-- Device switcher -->
                    <div class="flex items-center bg-[#181a1f] rounded-md p-0.5 gap-0.5">
                        <button
                            onclick={() => setDevice('desktop')}
                            class="p-1.5 rounded transition-colors {deviceMode === 'desktop' ? 'bg-[#3e4451] text-white' : 'text-[#7f848e] hover:text-[#abb2bf]'}"
                            title="Desktop width"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="2" y="3" width="20" height="14" rx="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line>
                            </svg>
                        </button>
                        <button
                            onclick={() => setDevice('tablet')}
                            class="p-1.5 rounded transition-colors {deviceMode === 'tablet' ? 'bg-[#3e4451] text-white' : 'text-[#7f848e] hover:text-[#abb2bf]'}"
                            title="Tablet width (768px)"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="4" y="2" width="16" height="20" rx="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line>
                            </svg>
                        </button>
                        <button
                            onclick={() => setDevice('mobile')}
                            class="p-1.5 rounded transition-colors {deviceMode === 'mobile' ? 'bg-[#3e4451] text-white' : 'text-[#7f848e] hover:text-[#abb2bf]'}"
                            title="Phone width (390px)"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="7" y="2" width="10" height="20" rx="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line>
                            </svg>
                        </button>
                    </div>

                    <div class="flex-1"></div>

                    <!-- Live toggle -->
                    <button
                        onclick={toggleLive}
                        class="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium transition-colors {livePreview ? 'text-emerald-400' : 'text-[#7f848e] hover:text-[#abb2bf]'}"
                        title={livePreview ? 'Live preview on — updates as you type' : 'Live preview paused'}
                        role="switch"
                        aria-checked={livePreview}
                    >
                        <span class="w-1.5 h-1.5 rounded-full {livePreview ? 'bg-emerald-400 animate-pulse' : 'bg-[#5c6370]'}"></span>
                        {livePreview ? 'Live' : 'Paused'}
                    </button>

                    <button
                        onclick={refreshPreview}
                        class="p-1.5 rounded-md text-[#7f848e] hover:text-white hover:bg-[#3e4451] transition-colors"
                        title="Refresh preview now"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M21 12a9 9 0 1 1-2.64-6.36"></path><polyline points="21 3 21 9 15 9"></polyline>
                        </svg>
                    </button>
                </div>

                <!-- Preview surface -->
                <div class="flex-1 min-h-0 overflow-auto {deviceMode === 'desktop' ? 'bg-white' : 'bg-[#16181d] p-4 sm:p-6'}">
                    {#if deviceMode === 'desktop'}
                        <iframe
                            srcdoc={previewDoc}
                            class="w-full h-full border-0 bg-white"
                            title="Page preview"
                            sandbox="allow-scripts"
                        ></iframe>
                    {:else}
                        <div
                            class="mx-auto h-full bg-white rounded-xl shadow-2xl ring-1 ring-white/10 overflow-hidden flex flex-col"
                            style:width={deviceMode === 'tablet' ? '768px' : '390px'}
                            style:max-width="100%"
                        >
                            <!-- Device chrome -->
                            <div class="flex-shrink-0 h-7 bg-[#21252b] flex items-center justify-center gap-2">
                                <span class="w-2 h-2 rounded-full bg-[#3e4451]"></span>
                                <span class="w-16 h-1.5 rounded-full bg-[#3e4451]"></span>
                            </div>
                            <iframe
                                srcdoc={previewDoc}
                                class="w-full flex-1 border-0 bg-white"
                                title="Page preview ({deviceMode})"
                                sandbox="allow-scripts"
                            ></iframe>
                        </div>
                    {/if}
                </div>
            </div>
        {/if}
    </main>

    <!-- ══════════ STATUS BAR ══════════ -->
    <footer class="flex-shrink-0 h-8 bg-[#21252b] border-t border-[#181a1f] flex items-center gap-3 px-3 sm:px-4 text-[11px] text-[#7f848e]">
        {#if showEditor}
            <span class="whitespace-nowrap">Ln {cursor.line}, Col {cursor.col}</span>
            <span class="text-[#3e4451] hidden sm:inline">•</span>
            <span class="hidden sm:inline whitespace-nowrap">{lineCount} lines · {sizeKB} KB</span>
            <span class="text-[#3e4451] hidden md:inline">•</span>
            <span class="hidden md:inline">HTML</span>

            <button
                onclick={toggleWrap}
                class="hidden md:flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors {wordWrap ? 'text-primary-300 bg-primary-500/10' : 'hover:text-[#abb2bf]'}"
                title="Toggle word wrap"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="3" y1="6" x2="21" y2="6"></line><path d="M3 12h15a3 3 0 1 1 0 6h-4"></path>
                    <polyline points="16 16 14 18 16 20"></polyline><line x1="3" y1="18" x2="7" y2="18"></line>
                </svg>
                Wrap
            </button>
        {/if}

        <div class="flex-1"></div>

        <span class="hidden lg:inline whitespace-nowrap">
            <kbd class="px-1 py-0.5 bg-[#2c313a] rounded border border-[#3e4451] text-[10px]">⌘S</kbd> save
            <kbd class="px-1 py-0.5 bg-[#2c313a] rounded border border-[#3e4451] text-[10px] ml-2">⌘F</kbd> find
        </span>
        <span class="text-[#3e4451] hidden lg:inline">•</span>
        <span class="whitespace-nowrap {saveState === 'unsaved' ? 'text-amber-400/80' : ''}">
            {saveState === 'saved' ? `Saved ${formatTime(lastSaved)}` : saveState === 'saving' ? 'Saving…' : 'Unsaved'}
        </span>
    </footer>
</div>

<style>
    /* CodeMirror fills its host */
    :global(.cm-editor) {
        height: 100%;
    }
    :global(.cm-scroller) {
        overflow: auto;
    }

    /* Dark scrollbars inside the editor pane */
    :global(.cm-scroller)::-webkit-scrollbar {
        width: 10px;
        height: 10px;
    }
    :global(.cm-scroller)::-webkit-scrollbar-track {
        background: transparent;
    }
    :global(.cm-scroller)::-webkit-scrollbar-thumb {
        background: #4b5263;
        border-radius: 5px;
        border: 2px solid #282c34;
    }
    :global(.cm-scroller)::-webkit-scrollbar-thumb:hover {
        background: #5c6370;
    }
</style>

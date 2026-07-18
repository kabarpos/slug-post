<script>
    import { onMount } from 'svelte';
    import { Toast } from '../Components/helper.js';

    let { post, edit_token, assets = [], user = null } = $props();

    // ─── Core state ──────────────────────────────────────────────
    // frameDoc is ONLY the initial srcdoc payload — edits happen live in the
    // iframe DOM and are read back via serializeClean(). We never reload the
    // iframe on save (the old builder did, losing scroll + re-running scripts).
    let frameDoc = $state(post.content);
    let savedContent = post.content;
    let lastSaved = $state(post.updated_at);
    let isSaving = $state(false);
    let hasUnsavedChanges = $state(false);
    let dirtyVersion = $state(0); // manual reactivity flag — DOM lives in the iframe, not in $state

    // ─── UI state ────────────────────────────────────────────────
    let deviceMode = $state('desktop');       // 'desktop' | 'tablet' | 'mobile'
    let autosave = $state(false);
    let mode = $state('idle');                // 'idle' | 'selected' | 'editing'
    let selKind = $state('none');             // 'none' | 'text' | 'image'
    let breadcrumb = $state([]);              // [{ el, label }] root → selected
    let draftOffer = $state(null);

    // DOM references into the iframe. selectedEl/anchorEl are $state because
    // the template reads them ({#if anchorEl}, selectedTag derived) — plain
    // vars would silently fail to re-render (svelte non_reactive_update).
    let previewFrame = $state(null);
    let selectedEl = $state(null);
    let anchorEl = $state(null);
    let hoverEl = null;   // never read in template
    let savedRange = null; // cloned Range for "link selected text"

    // ─── Sidebar form state ──────────────────────────────────────
    let imageInfo = $state(null);             // { src, alt } when IMG selected
    let imageUrlInput = $state('');
    let linkForm = $state({ href: '', text: '', newTab: false });
    let linkTextEditable = $state(true);
    let newLinkHref = $state('');
    let userAssets = $state(assets);
    let isUploading = $state(false);
    let altUndoPushed = false;

    // ─── Undo / redo (body.innerHTML snapshots) ──────────────────
    // Note: restoring innerHTML does not re-run <script> tags (safe), but any
    // listeners a page script attached at load time are orphaned by an undo
    // restore. Accepted trade-off — far better than the old full iframe reload.
    const undoStack = [];
    const redoStack = [];
    let canUndo = $state(false);
    let canRedo = $state(false);

    const PREFS_KEY = 'visualbuilder:prefs';
    const DRAFT_KEY = `visualbuilder:draft:${post.slug}`;

    const BLOCKED_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'META', 'LINK', 'TITLE', 'HEAD', 'HTML', 'BR']);
    const TEXT_TAGS = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'P', 'LI', 'TD', 'TH', 'LABEL', 'BUTTON', 'SPAN', 'A',
        'BLOCKQUOTE', 'FIGCAPTION', 'SUMMARY', 'DT', 'DD', 'CAPTION', 'LEGEND', 'STRONG', 'EM', 'SMALL', 'B', 'I', 'U',
        'CITE', 'Q', 'ABBR', 'TIME', 'CODE', 'PRE', 'MARK']);
    const TAG_OPTIONS = ['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'];

    // ─── Derived ─────────────────────────────────────────────────
    let saveState = $derived(isSaving ? 'saving' : hasUnsavedChanges ? 'unsaved' : 'saved');
    let selectedTag = $derived(selKind !== 'none' && selectedEl ? selectedEl.tagName : '');
    let isTypable = $derived(TEXT_TAGS.has(selectedTag) || TAG_OPTIONS.includes(selectedTag));
    let elementCount = $state(0);

    // ─── Helpers ─────────────────────────────────────────────────
    function getDoc() {
        return previewFrame?.contentDocument ?? null;
    }

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
            localStorage.setItem(PREFS_KEY, JSON.stringify({ deviceMode, autosave }));
        } catch {}
    }

    function markChanged() {
        hasUnsavedChanges = true;
        dirtyVersion++;
        const doc = getDoc();
        elementCount = doc ? doc.body.querySelectorAll('*').length : 0;
    }

    function tagLabel(el) {
        let label = el.tagName.toLowerCase();
        if (el.id) return `${label}#${el.id}`;
        if (el.classList.length) {
            const cls = [...el.classList].find(c => !c.startsWith('vb-'));
            if (cls) return `${label}.${cls}`;
        }
        return label;
    }

    // ─── Frame setup ─────────────────────────────────────────────
    function injectStyles(doc) {
        if (doc.getElementById('vb-styles')) return;
        const style = doc.createElement('style');
        style.id = 'vb-styles';
        style.textContent = `
            .vb-hover {
                outline: 2px dashed #60a5fa !important;
                outline-offset: 2px !important;
                cursor: pointer !important;
            }
            .vb-selected {
                outline: 2px solid #3b82f6 !important;
                outline-offset: 2px !important;
            }
            .vb-editing {
                outline: 2px solid #10b981 !important;
                outline-offset: 2px !important;
                cursor: text !important;
            }
        `;
        doc.head.appendChild(style);
    }

    function handleFrameLoad() {
        const doc = getDoc();
        if (!doc) return;

        // Fresh document → reset editing state (also covers draft-restore reloads)
        undoStack.length = 0;
        redoStack.length = 0;
        canUndo = false;
        canRedo = false;
        selectedEl = null;
        anchorEl = null;
        hoverEl = null;
        mode = 'idle';
        selKind = 'none';
        breadcrumb = [];
        elementCount = doc.body ? doc.body.querySelectorAll('*').length : 0;

        injectStyles(doc);

        doc.addEventListener('click', onFrameClick, true);
        doc.addEventListener('dblclick', onFrameDblClick, true);
        doc.addEventListener('auxclick', blockFrameNav, true);
        doc.addEventListener('submit', (e) => e.preventDefault(), true);
        doc.addEventListener('mouseover', onFrameHover);
        doc.addEventListener('mouseout', onFrameOut);
        doc.addEventListener('input', onFrameInput);
        doc.addEventListener('keydown', onFrameKeydown);
        doc.addEventListener('selectionchange', onFrameSelectionChange);
    }

    function blockFrameNav(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    // Walk up from a click target to the nearest editable element.
    // Skips scripts/styles/SVG internals so clicking an icon selects its parent button.
    function resolveSelectable(target) {
        const doc = getDoc();
        let el = target && target.nodeType === 1 ? target : target?.parentElement;
        while (el && el !== doc.body && el !== doc.documentElement) {
            if (BLOCKED_TAGS.has(el.tagName) || el.namespaceURI === 'http://www.w3.org/2000/svg') {
                el = el.parentElement;
                continue;
            }
            return el;
        }
        return null;
    }

    function resolveTextTarget(el) {
        if (!el || el.tagName === 'IMG') return null;
        if (TEXT_TAGS.has(el.tagName)) return el;
        const hasDirectText = [...el.childNodes].some(
            (n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim()
        );
        return hasDirectText ? el : null;
    }

    // ─── Frame event handlers ────────────────────────────────────
    function onFrameClick(e) {
        e.preventDefault();
        e.stopPropagation();

        // Clicking inside the element being edited = caret placement, not reselect
        if (mode === 'editing' && selectedEl && selectedEl.contains(e.target)) return;

        const el = resolveSelectable(e.target);
        if (mode === 'editing') exitTextEdit();
        if (el) selectElement(el);
        else clearSelection();
    }

    function onFrameDblClick(e) {
        e.preventDefault();
        e.stopPropagation();

        const el = resolveSelectable(e.target);
        const textTarget = resolveTextTarget(el);
        if (!textTarget) return;
        if (selectedEl !== textTarget) selectElement(textTarget);
        enterTextEdit();
    }

    function onFrameHover(e) {
        if (mode === 'editing') return;
        const el = resolveSelectable(e.target);
        if (el === hoverEl) return;
        if (hoverEl) hoverEl.classList.remove('vb-hover');
        hoverEl = el;
        if (hoverEl && hoverEl !== selectedEl) hoverEl.classList.add('vb-hover');
    }

    function onFrameOut(e) {
        if (hoverEl && !hoverEl.contains(e.relatedTarget)) {
            hoverEl.classList.remove('vb-hover');
            hoverEl = null;
        }
    }

    function onFrameInput() {
        if (mode === 'editing') markChanged();
    }

    function onFrameSelectionChange() {
        // Keep a clone of the current text selection so the sidebar link form
        // can re-apply it after focus moves out of the iframe.
        if (mode !== 'editing') return;
        const doc = getDoc();
        const sel = doc?.getSelection();
        if (sel && sel.rangeCount && !sel.isCollapsed) {
            savedRange = sel.getRangeAt(0).cloneRange();
        }
    }

    function onFrameKeydown(e) {
        handleGlobalKeys(e);
    }

    // ─── Selection ───────────────────────────────────────────────
    function selectElement(el) {
        clearSelection();
        selectedEl = el;
        mode = 'selected';
        el.classList.add('vb-selected');

        anchorEl = el.closest('a');
        if (el.tagName === 'IMG') {
            selKind = 'image';
            imageInfo = { src: el.getAttribute('src') || '', alt: el.getAttribute('alt') || '' };
            imageUrlInput = '';
        } else {
            selKind = 'text';
            imageInfo = null;
        }

        if (anchorEl) {
            linkTextEditable = anchorEl.children.length === 0;
            linkForm = {
                href: anchorEl.getAttribute('href') || '',
                text: linkTextEditable ? anchorEl.textContent : '',
                newTab: anchorEl.getAttribute('target') === '_blank'
            };
        }

        buildBreadcrumb();
    }

    function clearSelection() {
        if (selectedEl) {
            if (mode === 'editing') {
                selectedEl.removeAttribute('contenteditable');
                selectedEl.classList.remove('vb-editing');
            }
            selectedEl.classList.remove('vb-selected');
        }
        selectedEl = null;
        anchorEl = null;
        imageInfo = null;
        savedRange = null;
        newLinkHref = '';
        mode = 'idle';
        selKind = 'none';
        breadcrumb = [];
    }

    function buildBreadcrumb() {
        const doc = getDoc();
        const crumbs = [];
        let el = selectedEl;
        while (el && el !== doc.body && el !== doc.documentElement) {
            crumbs.unshift({ el, label: tagLabel(el) });
            el = el.parentElement;
        }
        breadcrumb = crumbs;
    }

    // ─── Text editing ────────────────────────────────────────────
    function enterTextEdit() {
        if (!selectedEl) return;
        pushUndo();
        mode = 'editing';
        selectedEl.classList.add('vb-editing');
        selectedEl.setAttribute('contenteditable', 'true');
        selectedEl.focus();
    }

    function exitTextEdit() {
        if (!selectedEl) { mode = 'idle'; return; }
        selectedEl.removeAttribute('contenteditable');
        selectedEl.classList.remove('vb-editing');
        savedRange = null;
        mode = 'selected';
    }

    // execCommand is deprecated but remains the only practical rich-text API
    // for contenteditable across browsers — fine for bold/italic/link basics.
    function formatDoc(cmd, val = null) {
        const doc = getDoc();
        if (!doc || mode !== 'editing') return;
        doc.execCommand(cmd, false, val);
        markChanged();
    }

    function applyNewLink() {
        const doc = getDoc();
        if (!doc || !newLinkHref.trim() || !savedRange) return;
        const sel = doc.getSelection();
        sel.removeAllRanges();
        sel.addRange(savedRange);
        doc.execCommand('createLink', false, newLinkHref.trim());
        newLinkHref = '';
        savedRange = null;
        markChanged();
        Toast('Link added', 'success');
    }

    // ─── Link panel ──────────────────────────────────────────────
    function applyLinkEdit() {
        if (!anchorEl) return;
        pushUndo();
        anchorEl.setAttribute('href', linkForm.href.trim() || '#');
        if (linkForm.newTab) {
            anchorEl.setAttribute('target', '_blank');
            anchorEl.setAttribute('rel', 'noopener');
        } else {
            anchorEl.removeAttribute('target');
            anchorEl.removeAttribute('rel');
        }
        if (linkTextEditable && linkForm.text !== anchorEl.textContent) {
            anchorEl.textContent = linkForm.text;
        }
        markChanged();
        Toast('Link updated', 'success');
    }

    function removeLink() {
        if (!anchorEl) return;
        pushUndo();
        const anchor = anchorEl;
        const wasSelected = selectedEl === anchor;
        while (anchor.firstChild) anchor.parentNode.insertBefore(anchor.firstChild, anchor);
        anchor.remove();
        markChanged();
        if (wasSelected) clearSelection();
        else anchorEl = null;
        Toast('Link removed', 'success');
    }

    // ─── Image panel ─────────────────────────────────────────────
    function setImageSrc(url) {
        if (!selectedEl || selectedEl.tagName !== 'IMG' || !url) return;
        pushUndo();
        selectedEl.setAttribute('src', url);
        selectedEl.removeAttribute('srcset');
        imageInfo = { ...imageInfo, src: url };
        markChanged();
    }

    function applyImageUrl() {
        if (!imageUrlInput.trim()) return;
        setImageSrc(imageUrlInput.trim());
        imageUrlInput = '';
        Toast('Image replaced', 'success');
    }

    function onAltInput(e) {
        if (!selectedEl) return;
        if (!altUndoPushed) { pushUndo(); altUndoPushed = true; }
        selectedEl.setAttribute('alt', e.target.value);
        imageInfo = { ...imageInfo, alt: e.target.value };
        markChanged();
    }

    async function uploadImage(event) {
        const file = event.target.files[0];
        event.target.value = '';
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            Toast('Please select an image file', 'error');
            return;
        }
        isUploading = true;
        const formData = new FormData();
        formData.append('file', file);
        try {
            const res = await fetch('/api/assets/upload', { method: 'POST', body: formData });
            if (!res.ok) throw new Error();
            const data = await res.json();
            userAssets = [data, ...userAssets];
            setImageSrc(data.url);
            Toast('Image uploaded', 'success');
        } catch {
            Toast('Failed to upload image', 'error');
        } finally {
            isUploading = false;
        }
    }

    // ─── Structure actions ───────────────────────────────────────
    function deleteSelected() {
        const doc = getDoc();
        if (!selectedEl || !doc) return;
        if (selectedEl.parentElement === doc.body && doc.body.children.length <= 1) {
            Toast("Can't delete the last element on the page", 'error');
            return;
        }
        pushUndo();
        selectedEl.remove();
        markChanged();
        clearSelection();
        Toast('Element deleted — ⌘Z to undo', 'info');
    }

    function duplicateSelected() {
        if (!selectedEl) return;
        pushUndo();
        const clone = selectedEl.cloneNode(true);
        selectedEl.after(clone);
        markChanged();
        selectElement(clone);
    }

    function moveSelected(dir) {
        if (!selectedEl) return;
        const sibling = dir === 'up' ? selectedEl.previousElementSibling : selectedEl.nextElementSibling;
        if (!sibling) return;
        pushUndo();
        if (dir === 'up') sibling.before(selectedEl);
        else sibling.after(selectedEl);
        markChanged();
        buildBreadcrumb();
    }

    function changeTag(newTag) {
        if (!selectedEl || selectedEl.tagName === newTag) return;
        const doc = getDoc();
        pushUndo();
        const el = doc.createElement(newTag);
        for (const attr of selectedEl.attributes) {
            if (attr.name !== 'contenteditable') el.setAttribute(attr.name, attr.value);
        }
        el.innerHTML = selectedEl.innerHTML;
        selectedEl.replaceWith(el);
        markChanged();
        selectElement(el);
    }

    // ─── Undo / redo ─────────────────────────────────────────────
    function snapshot() {
        return getDoc()?.body.innerHTML ?? null;
    }

    function pushUndo() {
        const s = snapshot();
        if (s == null) return;
        if (undoStack[undoStack.length - 1] !== s) undoStack.push(s);
        if (undoStack.length > 50) undoStack.shift();
        redoStack.length = 0;
        canUndo = true;
        canRedo = false;
    }

    function restoreBody(html) {
        const doc = getDoc();
        if (!doc) return;
        doc.body.innerHTML = html;
        hoverEl = null;
        clearSelection();
        markChanged();
    }

    function undo() {
        if (!undoStack.length) return;
        if (mode === 'editing') exitTextEdit();
        const current = snapshot();
        const prev = undoStack.pop();
        redoStack.push(current);
        restoreBody(prev);
        canUndo = undoStack.length > 0;
        canRedo = true;
    }

    function redo() {
        if (!redoStack.length) return;
        if (mode === 'editing') exitTextEdit();
        const current = snapshot();
        const next = redoStack.pop();
        undoStack.push(current);
        restoreBody(next);
        canUndo = true;
        canRedo = redoStack.length > 0;
    }

    // ─── Serialize & save ────────────────────────────────────────
    // Serialize a CLONE so the live DOM keeps its editing state and the iframe
    // never reloads — scroll position and page scripts survive the save.
    function serializeClean() {
        const doc = getDoc();
        if (!doc) return savedContent;
        const clone = doc.documentElement.cloneNode(true);
        clone.querySelectorAll('#vb-styles').forEach((el) => el.remove());
        clone.querySelectorAll('[contenteditable]').forEach((el) => el.removeAttribute('contenteditable'));
        clone.querySelectorAll('.vb-selected, .vb-editing, .vb-hover').forEach((el) =>
            el.classList.remove('vb-selected', 'vb-editing', 'vb-hover')
        );
        clone.querySelectorAll('[class=""]').forEach((el) => el.removeAttribute('class'));
        return '<!DOCTYPE html>\n' + clone.outerHTML;
    }

    async function save(isAuto = false) {
        if (isSaving) return;
        isSaving = true;
        const content = serializeClean();
        try {
            const res = await fetch(`/${post.slug}/edit/${edit_token}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content, slug: post.slug, format: 'html' })
            });
            if (!res.ok) throw new Error();
            const data = await res.json().catch(() => ({}));
            savedContent = content;
            hasUnsavedChanges = false;
            lastSaved = data.updated_at || new Date().toISOString();
            try { localStorage.removeItem(DRAFT_KEY); } catch {}
            if (!isAuto) Toast('Changes saved', 'success');
        } catch {
            Toast(isAuto ? 'Autosave failed — your draft is backed up locally' : 'Failed to save changes. Please try again.', 'error');
        } finally {
            isSaving = false;
        }
    }

    // ─── View controls ───────────────────────────────────────────
    function setDevice(mode) {
        deviceMode = mode;
        savePrefs();
    }

    function toggleAutosave() {
        autosave = !autosave;
        savePrefs();
        Toast(autosave ? 'Autosave on — saves 3s after you stop editing' : 'Autosave off', 'info');
    }

    // ─── Draft recovery ──────────────────────────────────────────
    function restoreDraft() {
        const d = draftOffer;
        draftOffer = null;
        try { localStorage.removeItem(DRAFT_KEY); } catch {}
        if (!d) return;
        frameDoc = d.content; // triggers one iframe reload → handleFrameLoad resets state
        markChanged();
        Toast('Draft restored — remember to save', 'info');
    }

    function discardDraft() {
        draftOffer = null;
        try { localStorage.removeItem(DRAFT_KEY); } catch {}
    }

    // ─── Keyboard ────────────────────────────────────────────────
    function handleGlobalKeys(e) {
        const mod = e.metaKey || e.ctrlKey;
        const key = e.key.toLowerCase();

        if (mod && key === 's') {
            e.preventDefault();
            if (hasUnsavedChanges && !isSaving) save(false);
            return;
        }

        // While typing in contenteditable, let the browser's native text
        // undo work — snapshot undo only applies in selection/idle mode.
        if (mode !== 'editing') {
            if (mod && !e.shiftKey && key === 'z') { e.preventDefault(); undo(); return; }
            if ((mod && e.shiftKey && key === 'z') || (mod && key === 'y')) { e.preventDefault(); redo(); return; }
        }

        if (e.key === 'Escape') {
            if (mode === 'editing') exitTextEdit();
            else if (mode === 'selected') clearSelection();
            return;
        }

        if ((e.key === 'Delete' || e.key === 'Backspace') && mode === 'selected') {
            // Don't nuke an element while the user is typing in a sidebar input
            const ae = (e.target && e.target.ownerDocument.activeElement) || document.activeElement;
            if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return;
            e.preventDefault();
            deleteSelected();
        }
    }

    // ─── Effects ─────────────────────────────────────────────────
    // Autosave — 3s after the last change
    $effect(() => {
        const v = dirtyVersion; // re-run on every iframe DOM change
        if (!autosave || !hasUnsavedChanges || isSaving) return;
        const t = setTimeout(() => {
            if (v === dirtyVersion) save(true); // skip if something changed since scheduling
        }, 3000);
        return () => clearTimeout(t);
    });

    // Local draft backup — protects against refresh/crash
    $effect(() => {
        if (draftOffer) return;
        const v = dirtyVersion; // re-run on every iframe DOM change
        if (!hasUnsavedChanges) return;
        const t = setTimeout(() => {
            if (v !== dirtyVersion) return;
            try {
                localStorage.setItem(DRAFT_KEY, JSON.stringify({
                    content: serializeClean(),
                    savedAt: new Date().toISOString()
                }));
            } catch {}
        }, 800);
        return () => clearTimeout(t);
    });

    // ─── Mount ───────────────────────────────────────────────────
    onMount(() => {
        // Restore prefs
        try {
            const p = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
            if (p.deviceMode) deviceMode = p.deviceMode;
            if (typeof p.autosave === 'boolean') autosave = p.autosave;
        } catch {}

        // Offer local draft recovery if newer than the server version
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

        const onBeforeUnload = (e) => {
            if (hasUnsavedChanges) {
                try {
                    localStorage.setItem(DRAFT_KEY, JSON.stringify({
                        content: serializeClean(),
                        savedAt: new Date().toISOString()
                    }));
                } catch {}
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', onBeforeUnload);
        window.addEventListener('keydown', handleGlobalKeys);

        return () => {
            window.removeEventListener('beforeunload', onBeforeUnload);
            window.removeEventListener('keydown', handleGlobalKeys);
        };
    });
</script>

<svelte:head>
    <title>Visual Builder: {post.title} - SlugPost</title>
</svelte:head>

<div class="h-screen flex flex-col bg-slate-100 overflow-hidden">

    <!-- ══════════ TOP BAR ══════════ -->
    <header class="flex-shrink-0 h-14 bg-white border-b border-slate-200 flex items-center gap-3 px-3 sm:px-4 shadow-sm z-20">

        <!-- Left: identity -->
        <div class="flex items-center gap-3 min-w-0">
            <a href="/{post.slug}/edit/{edit_token}" class="flex items-center gap-1.5 px-2 py-1.5 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors flex-shrink-0" title="Switch to Code Editor">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline>
                </svg>
                <span class="hidden sm:inline">Code</span>
            </a>

            <div class="h-6 w-px bg-slate-200 hidden lg:block"></div>

            <div class="hidden lg:flex flex-col min-w-0">
                <div class="flex items-center gap-2">
                    <h1 class="text-sm font-semibold text-slate-900 truncate max-w-[220px] leading-tight">{post.title || 'Untitled'}</h1>
                    <span class="inline-flex items-center px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 text-[10px] font-medium flex-shrink-0">Visual</span>
                </div>
                <div class="flex items-center gap-1.5 text-[11px] text-slate-500">
                    <span class="w-1.5 h-1.5 rounded-full {saveState === 'saved' ? 'bg-emerald-500' : saveState === 'saving' ? 'bg-blue-500 animate-pulse' : 'bg-amber-500'}"></span>
                    {saveState === 'saved' ? 'All changes saved' : saveState === 'saving' ? 'Saving…' : 'Unsaved changes'}
                </div>
            </div>
        </div>

        <!-- Center: device switcher -->
        <div class="flex-1 flex justify-center">
            <div class="hidden md:flex items-center bg-slate-100 rounded-lg p-1 gap-0.5">
                <button
                    onclick={() => setDevice('desktop')}
                    class="p-1.5 rounded-md transition-colors {deviceMode === 'desktop' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}"
                    title="Desktop width"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="2" y="3" width="20" height="14" rx="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line>
                    </svg>
                </button>
                <button
                    onclick={() => setDevice('tablet')}
                    class="p-1.5 rounded-md transition-colors {deviceMode === 'tablet' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}"
                    title="Tablet width (768px)"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="4" y="2" width="16" height="20" rx="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line>
                    </svg>
                </button>
                <button
                    onclick={() => setDevice('mobile')}
                    class="p-1.5 rounded-md transition-colors {deviceMode === 'mobile' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}"
                    title="Phone width (390px)"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="7" y="2" width="10" height="20" rx="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line>
                    </svg>
                </button>
            </div>
        </div>

        <!-- Right: actions -->
        <div class="flex items-center gap-1.5">
            <!-- Undo / redo -->
            <div class="flex items-center gap-0.5 mr-1">
                <button
                    onclick={undo}
                    disabled={!canUndo}
                    class="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Undo (⌘Z)"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M3 7v6h6"></path><path d="M21 17a9 9 0 0 0-15-6.7L3 13"></path>
                    </svg>
                </button>
                <button
                    onclick={redo}
                    disabled={!canRedo}
                    class="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Redo (⇧⌘Z)"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 7v6h-6"></path><path d="M3 17a9 9 0 0 1 15-6.7L21 13"></path>
                    </svg>
                </button>
            </div>

            <!-- Autosave toggle -->
            <button
                onclick={toggleAutosave}
                class="hidden xl:flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors {autosave ? 'text-primary-700 bg-primary-50' : 'text-slate-500 hover:text-slate-700'}"
                title="Autosave — save automatically 3s after you stop editing"
                role="switch"
                aria-checked={autosave}
            >
                <span class="relative w-7 h-4 rounded-full transition-colors {autosave ? 'bg-primary-500' : 'bg-slate-300'}">
                    <span class="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all {autosave ? 'left-3.5' : 'left-0.5'}"></span>
                </span>
                Autosave
            </button>

            <a
                href="/{post.slug}/settings/{edit_token}"
                class="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                title="Post settings"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="3"></circle>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                </svg>
                Settings
            </a>

            <a
                href="/{post.slug}"
                target="_blank"
                rel="noopener"
                class="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                title="Open live page in a new tab"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                    <polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line>
                </svg>
                <span class="hidden sm:inline">Preview</span>
            </a>

            <button
                onclick={() => save(false)}
                disabled={isSaving || !hasUnsavedChanges}
                class="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-lg transition-all {hasUnsavedChanges && !isSaving ? 'bg-primary-600 text-white hover:bg-primary-700 shadow-sm' : 'bg-slate-100 text-slate-400 cursor-default'}"
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
        </div>
    </header>

    <!-- ══════════ DRAFT RECOVERY BANNER ══════════ -->
    {#if draftOffer}
        <div class="flex-shrink-0 bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center gap-3 text-sm z-20">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-amber-500 flex-shrink-0">
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                <line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
            <span class="text-amber-800 flex-1 min-w-0 truncate">
                A local draft from <strong>{formatDate(draftOffer.savedAt)}</strong> is newer than the saved version.
            </span>
            <button onclick={restoreDraft} class="px-3 py-1 text-xs font-semibold bg-amber-500 text-white rounded-md hover:bg-amber-600 transition-colors flex-shrink-0">
                Restore draft
            </button>
            <button onclick={discardDraft} class="px-3 py-1 text-xs font-medium text-amber-700 hover:text-amber-900 transition-colors flex-shrink-0">
                Discard
            </button>
        </div>
    {/if}

    <!-- ══════════ MAIN AREA ══════════ -->
    <div class="flex-1 flex min-h-0">

        <!-- ── Canvas column ── -->
        <main class="flex-1 flex flex-col min-w-0">

            <!-- Breadcrumb -->
            {#if breadcrumb.length}
                <div class="flex-shrink-0 h-9 bg-white border-b border-slate-200 flex items-center gap-1 px-3 overflow-x-auto">
                    <span class="text-[11px] text-slate-400 mr-1 flex-shrink-0">Selected:</span>
                    {#each breadcrumb as crumb, i}
                        <button
                            onclick={() => selectElement(crumb.el)}
                            class="px-1.5 py-0.5 rounded text-[11px] font-mono whitespace-nowrap transition-colors {i === breadcrumb.length - 1 ? 'bg-primary-100 text-primary-700 font-semibold' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'}"
                            title="Select {crumb.label}"
                        >
                            {crumb.label}
                        </button>
                        {#if i < breadcrumb.length - 1}
                            <span class="text-slate-300 text-[11px] flex-shrink-0">›</span>
                        {/if}
                    {/each}
                </div>
            {/if}

            <!-- Canvas -->
            <div class="flex-1 min-h-0 overflow-auto bg-slate-200 {deviceMode === 'desktop' ? 'p-4' : 'p-4 sm:p-6'}">
                <div
                    class="mx-auto h-full transition-all duration-300"
                    style:max-width={deviceMode === 'tablet' ? '768px' : deviceMode === 'mobile' ? '390px' : '100%'}
                >
                    <div class="h-full bg-white rounded-lg shadow-lg overflow-hidden {deviceMode !== 'desktop' ? 'ring-1 ring-slate-900/10' : ''}">
                        <iframe
                            bind:this={previewFrame}
                            srcdoc={frameDoc}
                            onload={handleFrameLoad}
                            class="w-full h-full border-0"
                            title="Visual Editor"
                        ></iframe>
                    </div>
                </div>
            </div>
        </main>

        <!-- ── Sidebar ── -->
        <aside class="w-72 xl:w-80 flex-shrink-0 bg-white border-l border-slate-200 flex flex-col min-h-0">

            {#if mode === 'idle'}
                <!-- ═══ Empty state: tips ═══ -->
                <div class="flex-1 overflow-y-auto p-5">
                    <div class="flex items-center gap-2 mb-4">
                        <div class="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-purple-600">
                                <path d="M12 19l7-7 3 3-7 7-3-3z"></path><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path><path d="M2 2l7.586 7.586"></path><circle cx="11" cy="11" r="2"></circle>
                            </svg>
                        </div>
                        <h2 class="text-sm font-semibold text-slate-900">Visual Builder</h2>
                    </div>

                    <div class="space-y-3">
                        <div class="flex gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-blue-500 flex-shrink-0 mt-0.5">
                                <path d="m9 9 5 12 1.8-5.2L21 14Z"></path><path d="M7.2 2.2 8 5.1"></path><path d="m5.1 8-2.9-.8"></path><path d="M14 4.1 12 6"></path><path d="m6 12-1.9 2"></path>
                            </svg>
                            <div>
                                <p class="text-xs font-medium text-slate-800">Click to select</p>
                                <p class="text-[11px] text-slate-500 mt-0.5">Click any element on the page to select it and see its options here.</p>
                            </div>
                        </div>

                        <div class="flex gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-emerald-500 flex-shrink-0 mt-0.5">
                                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path>
                            </svg>
                            <div>
                                <p class="text-xs font-medium text-slate-800">Double-click to edit text</p>
                                <p class="text-[11px] text-slate-500 mt-0.5">Double-click any text to type directly on the page, with bold, italic, and link tools.</p>
                            </div>
                        </div>

                        <div class="flex gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-amber-500 flex-shrink-0 mt-0.5">
                                <rect width="18" height="18" x="3" y="3" rx="2" ry="2"></rect><circle cx="9" cy="9" r="2"></circle><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"></path>
                            </svg>
                            <div>
                                <p class="text-xs font-medium text-slate-800">Click an image to replace it</p>
                                <p class="text-[11px] text-slate-500 mt-0.5">Swap images by URL{#if user}, upload, or your library{/if}, and edit alt text.</p>
                            </div>
                        </div>

                        <div class="flex gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-slate-400 flex-shrink-0 mt-0.5">
                                <path d="M3 7v6h6"></path><path d="M21 17a9 9 0 0 0-15-6.7L3 13"></path>
                            </svg>
                            <div>
                                <p class="text-xs font-medium text-slate-800">Made a mistake?</p>
                                <p class="text-[11px] text-slate-500 mt-0.5">Undo anything with <kbd class="px-1 py-0.5 bg-white rounded border border-slate-200 text-[10px]">⌘Z</kbd> — every change is reversible.</p>
                            </div>
                        </div>
                    </div>

                    <div class="mt-5 pt-4 border-t border-slate-100">
                        <p class="text-[11px] text-slate-400 leading-relaxed">
                            {elementCount} elements on this page · Last saved {formatDate(lastSaved)}
                        </p>
                    </div>
                </div>

            {:else if selKind === 'image' && imageInfo}
                <!-- ═══ Image panel ═══ -->
                <div class="flex-1 overflow-y-auto">
                    <div class="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                        <span class="text-xs font-semibold text-slate-900 uppercase tracking-wide">Image</span>
                        <span class="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 text-[10px] font-mono">img</span>
                    </div>

                    <div class="p-4 space-y-4">
                        <!-- Preview -->
                        <div class="rounded-lg border border-slate-200 overflow-hidden bg-slate-50">
                            <img src={imageInfo.src} alt={imageInfo.alt || 'Selected image'} class="w-full h-32 object-contain" />
                        </div>

                        <!-- Alt text -->
                        <div>
                            <label for="vb-alt" class="block text-xs font-medium text-slate-700 mb-1.5">Alt text</label>
                            <input
                                id="vb-alt"
                                type="text"
                                value={imageInfo.alt}
                                oninput={onAltInput}
                                onblur={() => (altUndoPushed = false)}
                                placeholder="Describe this image"
                                class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
                            />
                            <p class="text-[11px] text-slate-400 mt-1">For accessibility and SEO</p>
                        </div>

                        <!-- Replace by URL -->
                        <div>
                            <label for="vb-imgurl" class="block text-xs font-medium text-slate-700 mb-1.5">Replace image</label>
                            <div class="flex gap-2">
                                <input
                                    id="vb-imgurl"
                                    type="text"
                                    bind:value={imageUrlInput}
                                    placeholder="https://…/image.jpg"
                                    class="flex-1 min-w-0 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm font-mono"
                                />
                                <button
                                    onclick={applyImageUrl}
                                    disabled={!imageUrlInput.trim()}
                                    class="px-3 py-2 text-xs font-medium bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                                >
                                    Apply
                                </button>
                            </div>
                        </div>

                        {#if user}
                            <!-- Upload (auth only — /api/assets requires Auth middleware) -->
                            <label class="relative cursor-pointer block">
                                <div class="flex items-center justify-center w-full h-20 border-2 border-dashed border-slate-300 rounded-lg hover:border-primary-500 hover:bg-primary-50 transition-colors {isUploading ? 'opacity-50 pointer-events-none' : ''}">
                                    {#if isUploading}
                                        <div class="flex items-center gap-2">
                                            <svg class="animate-spin h-4 w-4 text-primary-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                                                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                            </svg>
                                            <span class="text-xs text-slate-600">Uploading…</span>
                                        </div>
                                    {:else}
                                        <div class="flex items-center gap-2 text-slate-500">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" x2="12" y1="3" y2="15"></line>
                                            </svg>
                                            <span class="text-xs font-medium">Upload new image</span>
                                        </div>
                                    {/if}
                                </div>
                                <input type="file" accept="image/*" onchange={uploadImage} class="hidden" disabled={isUploading} />
                            </label>

                            {#if userAssets.length > 0}
                                <div>
                                    <p class="text-xs font-medium text-slate-700 mb-2">Your library</p>
                                    <div class="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-0.5">
                                        {#each userAssets as asset}
                                            <button
                                                onclick={() => setImageSrc(asset.url)}
                                                class="aspect-square rounded-lg overflow-hidden border-2 border-transparent hover:border-primary-500 transition-colors focus:outline-none focus:border-primary-500 bg-slate-100"
                                                title={asset.name || 'Use this image'}
                                            >
                                                <img src={asset.url} alt={asset.name || 'Asset'} class="w-full h-full object-cover" loading="lazy" />
                                            </button>
                                        {/each}
                                    </div>
                                </div>
                            {/if}
                        {:else}
                            <p class="text-[11px] text-slate-400 leading-relaxed bg-slate-50 rounded-lg p-2.5 border border-slate-100">
                                Sign in to upload images and use your media library.
                            </p>
                        {/if}
                    </div>
                </div>

            {:else}
                <!-- ═══ Text / element panel ═══ -->
                <div class="flex-1 overflow-y-auto">
                    <div class="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                        <span class="text-xs font-semibold text-slate-900 uppercase tracking-wide">Element</span>
                        <span class="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 text-[10px] font-mono">{selectedTag.toLowerCase()}</span>
                    </div>

                    <div class="p-4 space-y-5">

                        <!-- Edit text -->
                        {#if mode === 'editing'}
                            <div class="rounded-lg bg-emerald-50 border border-emerald-200 p-3">
                                <div class="flex items-center gap-2 mb-1">
                                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                    <p class="text-xs font-semibold text-emerald-800">Editing text</p>
                                </div>
                                <p class="text-[11px] text-emerald-700 mb-2.5">Type directly on the page. Press <kbd class="px-1 py-0.5 bg-white rounded border border-emerald-200 text-[10px]">Esc</kbd> when done.</p>
                                <button
                                    onclick={exitTextEdit}
                                    class="w-full px-3 py-1.5 text-xs font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
                                >
                                    Done editing
                                </button>
                            </div>

                            <!-- Formatting -->
                            <div>
                                <p class="text-xs font-medium text-slate-700 mb-2">Formatting</p>
                                <div class="flex items-center gap-1">
                                    <button onpointerdown={(e) => e.preventDefault()} onclick={() => formatDoc('bold')} class="w-9 h-9 flex items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 hover:border-slate-300 transition-colors" title="Bold">
                                        <span class="text-sm font-bold">B</span>
                                    </button>
                                    <button onpointerdown={(e) => e.preventDefault()} onclick={() => formatDoc('italic')} class="w-9 h-9 flex items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 hover:border-slate-300 transition-colors" title="Italic">
                                        <span class="text-sm italic font-serif">I</span>
                                    </button>
                                    <button onpointerdown={(e) => e.preventDefault()} onclick={() => formatDoc('underline')} class="w-9 h-9 flex items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 hover:border-slate-300 transition-colors" title="Underline">
                                        <span class="text-sm underline">U</span>
                                    </button>
                                    <button onpointerdown={(e) => e.preventDefault()} onclick={() => formatDoc('strikeThrough')} class="w-9 h-9 flex items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 hover:border-slate-300 transition-colors" title="Strikethrough">
                                        <span class="text-sm line-through">S</span>
                                    </button>
                                    <div class="w-px h-6 bg-slate-200 mx-1"></div>
                                    <button onpointerdown={(e) => e.preventDefault()} onclick={() => formatDoc('removeFormat')} class="h-9 px-2.5 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 hover:border-slate-300 transition-colors" title="Clear formatting">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                            <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"></path><path d="M22 21H7"></path><path d="m5 11 9 9"></path>
                                        </svg>
                                    </button>
                                </div>
                            </div>

                            <!-- Link selected text -->
                            <div>
                                <p class="text-xs font-medium text-slate-700 mb-1.5">Link selected text</p>
                                <div class="flex gap-2">
                                    <input
                                        type="text"
                                        bind:value={newLinkHref}
                                        placeholder="https://example.com"
                                        class="flex-1 min-w-0 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm font-mono"
                                    />
                                    <button
                                        onclick={applyNewLink}
                                        disabled={!newLinkHref.trim()}
                                        class="px-3 py-2 text-xs font-medium bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                                    >
                                        Add
                                    </button>
                                </div>
                                <p class="text-[11px] text-slate-400 mt-1">Select text on the page first, then add a URL</p>
                            </div>
                        {:else if isTypable}
                            <div>
                                <button
                                    onclick={enterTextEdit}
                                    class="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path>
                                    </svg>
                                    Edit text
                                </button>
                                <p class="text-[11px] text-slate-400 mt-1.5 text-center">or double-click the text on the page</p>
                            </div>
                        {/if}

                        <!-- Typography -->
                        {#if TAG_OPTIONS.includes(selectedTag)}
                            <div>
                                <p class="text-xs font-medium text-slate-700 mb-2">Text type</p>
                                <div class="grid grid-cols-7 gap-1">
                                    {#each TAG_OPTIONS as tag}
                                        <button
                                            onclick={() => changeTag(tag)}
                                            class="h-8 flex items-center justify-center rounded-md border text-[11px] font-semibold transition-colors {selectedTag === tag ? 'bg-primary-600 border-primary-600 text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-100 hover:border-slate-300'}"
                                            title={tag === 'P' ? 'Paragraph' : 'Heading ' + tag.slice(1)}
                                        >
                                            {tag}
                                        </button>
                                    {/each}
                                </div>
                            </div>
                        {/if}

                        <!-- Link editor -->
                        {#if anchorEl}
                            <div class="rounded-lg border border-blue-200 bg-blue-50/50 p-3 space-y-3">
                                <div class="flex items-center gap-1.5">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-blue-600">
                                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                                    </svg>
                                    <p class="text-xs font-semibold text-blue-900">Link</p>
                                </div>

                                {#if linkTextEditable}
                                    <div>
                                        <label for="vb-linktext" class="block text-[11px] font-medium text-slate-600 mb-1">Text</label>
                                        <input
                                            id="vb-linktext"
                                            type="text"
                                            bind:value={linkForm.text}
                                            class="w-full px-2.5 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm bg-white"
                                        />
                                    </div>
                                {/if}

                                <div>
                                    <label for="vb-linkhref" class="block text-[11px] font-medium text-slate-600 mb-1">URL</label>
                                    <input
                                        id="vb-linkhref"
                                        type="text"
                                        bind:value={linkForm.href}
                                        placeholder="https://example.com"
                                        class="w-full px-2.5 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm font-mono bg-white"
                                    />
                                </div>

                                <label class="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" bind:checked={linkForm.newTab} class="w-3.5 h-3.5 rounded border-slate-300 text-primary-600 focus:ring-primary-500" />
                                    <span class="text-xs text-slate-700">Open in new tab</span>
                                </label>

                                <div class="flex gap-2">
                                    <button
                                        onclick={applyLinkEdit}
                                        class="flex-1 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                                    >
                                        Apply
                                    </button>
                                    <button
                                        onclick={removeLink}
                                        class="px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-md hover:bg-red-50 transition-colors"
                                        title="Remove link, keep text"
                                    >
                                        Unlink
                                    </button>
                                </div>
                            </div>
                        {/if}

                        <!-- Structure -->
                        <div>
                            <p class="text-xs font-medium text-slate-700 mb-2">Structure</p>
                            <div class="grid grid-cols-2 gap-1.5">
                                <button
                                    onclick={() => moveSelected('up')}
                                    class="flex items-center justify-center gap-1.5 px-2 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"></path></svg>
                                    Move up
                                </button>
                                <button
                                    onclick={() => moveSelected('down')}
                                    class="flex items-center justify-center gap-1.5 px-2 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"></path></svg>
                                    Move down
                                </button>
                                <button
                                    onclick={duplicateSelected}
                                    class="flex items-center justify-center gap-1.5 px-2 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path></svg>
                                    Duplicate
                                </button>
                                <button
                                    onclick={deleteSelected}
                                    class="flex items-center justify-center gap-1.5 px-2 py-2 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                                    Delete
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            {/if}
        </aside>
    </div>

    <!-- ══════════ STATUS BAR ══════════ -->
    <footer class="flex-shrink-0 h-9 bg-white border-t border-slate-200 flex items-center gap-3 px-3 sm:px-4 text-[11px] text-slate-500">
        <span class="hidden sm:flex items-center gap-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-slate-400">
                <path d="m9 9 5 12 1.8-5.2L21 14Z"></path><path d="M7.2 2.2 8 5.1"></path><path d="m5.1 8-2.9-.8"></path><path d="M14 4.1 12 6"></path><path d="m6 12-1.9 2"></path>
            </svg>
            Click to select · Double-click to edit
        </span>
        <span class="text-slate-300 hidden sm:inline">|</span>
        <span class="hidden md:flex items-center gap-1">
            <kbd class="px-1 py-0.5 bg-slate-100 rounded border border-slate-200 text-[10px]">⌘S</kbd> save
            <kbd class="px-1 py-0.5 bg-slate-100 rounded border border-slate-200 text-[10px] ml-1.5">⌘Z</kbd> undo
            <kbd class="px-1 py-0.5 bg-slate-100 rounded border border-slate-200 text-[10px] ml-1.5">Esc</kbd> deselect
            <kbd class="px-1 py-0.5 bg-slate-100 rounded border border-slate-200 text-[10px] ml-1.5">Del</kbd> remove
        </span>

        <div class="flex-1"></div>

        <span class="whitespace-nowrap {saveState === 'unsaved' ? 'text-amber-600 font-medium' : ''}">
            {saveState === 'saved' ? `Saved ${formatTime(lastSaved)}` : saveState === 'saving' ? 'Saving…' : 'Unsaved changes'}
        </span>
    </footer>
</div>

// Event People — design polish PREVIEW: small copy fixes plus a Before / After switch.
// Loaded only with ?preview=polish, alongside polish.css. Text swaps touch visible text nodes
// only, so they never reach the CMS or the Designer.
(function () {
    const fixes = [
        [/We're/g, 'We’re'],                                            // Home hero apostrophe
        [/"Event People"/g, '“Event People”'],                          // About hero quotes
        [/Event People representatives/g, 'Event People Representatives'], // match New York's casing
        [/A La Carte Services/g, 'À La Carte Services'],                // accent
        [/\bContact us\b/g, 'Contact Us'],                              // nav button, to match the menu and footer
        [/European Hub\b/g, 'European hub'],                            // Home hero; the page name "European Hubs" is untouched
    ];

    function fixCopy() {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
            let text = node.nodeValue;
            fixes.forEach(([pattern, replacement]) => { text = text.replace(pattern, replacement); });
            if (text !== node.nodeValue) node.nodeValue = text;
        }
    }

    // Before / After switch. Every rule in polish.css hangs off html[data-ep-preview="polish"],
    // so flipping that attribute swaps the whole layout in place; the scroll animations and
    // sliders are then asked to re-measure.
    function badge() {
        const root = document.documentElement;
        const el = document.createElement('div');
        el.className = 'ep-preview-badge';
        el.innerHTML = 'Design polish'
            + '<div class="ep-preview-badge__seg" role="group" aria-label="Compare">'
            + '<button type="button" data-on="false" aria-pressed="false">Before</button>'
            + '<button type="button" data-on="true" aria-pressed="true">After</button>'
            + '</div>'
            + '<a href="?preview=off">Exit</a>';
        el.querySelectorAll('button').forEach(button => {
            button.addEventListener('click', () => {
                const on = button.dataset.on === 'true';
                if (on) root.setAttribute('data-ep-preview', 'polish');
                else root.removeAttribute('data-ep-preview');
                el.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
                requestAnimationFrame(() => {
                    window.dispatchEvent(new Event('resize'));
                    if (window.ScrollTrigger) window.ScrollTrigger.refresh();
                });
            });
        });
        document.body.appendChild(el);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { fixCopy(); badge(); });
    } else {
        fixCopy();
        badge();
    }
})();

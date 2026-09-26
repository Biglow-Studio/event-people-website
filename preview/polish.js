// Event People — design polish PREVIEW: small copy fixes plus a badge showing preview is on.
// Loaded only with ?preview=polish, alongside polish.css. Text swaps touch visible text nodes
// only, so they never reach the CMS or the Designer.
(function () {
    const fixes = [
        [/We're/g, 'We’re'],                                            // Home hero apostrophe
        [/"Event People"/g, '“Event People”'],                          // About hero quotes
        [/Event People representatives/g, 'Event People Representatives'], // match New York's casing
        [/A La Carte Services/g, 'À La Carte Services'],                // accent
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

    function badge() {
        const el = document.createElement('div');
        el.className = 'ep-preview-badge';
        el.innerHTML = 'Design polish preview <a href="?preview=off">Turn off</a>';
        document.body.appendChild(el);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { fixCopy(); badge(); });
    } else {
        fixCopy();
        badge();
    }
})();

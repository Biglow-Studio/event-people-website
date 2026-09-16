gsap.registerPlugin(SplitText, ScrollTrigger);

document.addEventListener('DOMContentLoaded', () => {

    // ─── Split text config ───────────────────────────────────────────────────
    // Timing values keyed by split type — used by page headings and nav items.
    const splitConfig = {
        lines: { duration: 0.8, stagger: 0.08 },
        words: { duration: 0.6, stagger: 0.06 },
        chars: { duration: 0.4, stagger: 0.01 },
    };

    // Animates any element with [data-split="heading"] using the chosen split type.
    function splitTextAnimation(splitParam = 'lines') {
        const config = splitConfig[splitParam];

        if (!config) {
            console.warn(`splitTextAnimation: unknown split param "${splitParam}"`);
            return;
        }

        document.querySelectorAll('[data-split="heading"]').forEach(heading => {
            SplitText.create(heading, {
                type: splitParam,
                autoSplit: true,
                mask: splitParam,
                onSplit(instance) {
                    const targets = instance[splitParam];

                    if (!targets?.length) return;

                    return gsap.from(targets, {
                        duration: config.duration,
                        yPercent: 110,
                        stagger: config.stagger,
                        ease: 'expo.out',
                    });
                },
            });
        });
    }

    // ─── Nav menu content setup ──────────────────────────────────────────────
    // Finds all nav items and contact lines, creates SplitText instances,
    // and sets their closed/hidden starting states before animation.
    function setupNavMenuElements(navMenuWrapper) {
        const navItems = [...navMenuWrapper.querySelectorAll('.nav-item-wrapper')];
        const contactSection = navMenuWrapper.querySelector('.nav-contact-us');
        const contactLines = contactSection
            ? [...contactSection.querySelectorAll('.contact-details, .nav-line, .nav-socials-wrapper')]
            : [];

        const items = navItems.map(item => {
            const line = item.querySelector('.nav-line');
            const heading = item.querySelector('.h2-nav-item');
            const currentPage = item.querySelector('[nav-indicator="current"]');
            const arrow = item.querySelector('.nav-arrow');
            const isCurrent = item.classList.contains('w--current'); // Webflow current page class

            let split = null;

            // Closed states — reversed automatically when the timeline plays backward
            if (line) gsap.set(line, { scaleX: 0, transformOrigin: 'left center' });
            if (currentPage) gsap.set(currentPage, { autoAlpha: 0, scale: 0 });

            if (heading) {
                split = SplitText.create(heading, {
                    type: 'chars',
                    mask: 'chars',
                    autoSplit: true,
                });
                gsap.set(split.chars, { yPercent: 110 });
            }

            // Arrow only ever appears on hover, and never on the current-page item (which shows the indicator instead)
            if (arrow) {
                if (isCurrent) {
                    gsap.set(arrow, { display: 'none' });
                } else {
                    gsap.set(arrow, { autoAlpha: 0 });

                    item.addEventListener('mouseenter', () => {
                        gsap.to(arrow, { autoAlpha: 1, duration: 0.25, ease: 'cubic-bezier(0.625, 0.05, 0, 1)' });
                    });
                    item.addEventListener('mouseleave', () => {
                        gsap.to(arrow, { autoAlpha: 0, duration: 0.25, ease: 'cubic-bezier(0.625, 0.05, 0, 1)' });
                    });
                }
            }

            return { line, split, currentPage, arrow, isCurrent };
        });

        gsap.set(contactLines, { opacity: 0 });

        return { items, contactLines };
    }

    // Builds the staggered nav item + contact animations and adds them to the main timeline.
    // Runs at the `menuContent` label, starting 0.1s before .nav-full finishes expanding to full height.
    function addNavMenuContentToTimeline(tl, navMenuWrapper, label = 'menuContent') {
        const { items, contactLines } = setupNavMenuElements(navMenuWrapper);
        const charConfig = splitConfig.chars;
        const itemStagger = 0.15;

        tl.addLabel(label, '-=0.1');
        tl.set(navMenuWrapper, { opacity: 1 }, label);

        items.forEach((itemData, i) => {
            // Each item: line grows → chars reveal (current-page indicator handled separately, after everything)
            const itemTl = gsap.timeline();

            if (itemData.line) {
                itemTl.to(itemData.line, {
                    scaleX: 1,
                    duration: 0.5,
                    ease: 'cubic-bezier(0.625, 0.05, 0, 1)',
                });
            }

            if (itemData.split?.chars?.length) {
                itemTl.to(itemData.split.chars, {
                    yPercent: 0,
                    duration: charConfig.duration,
                    stagger: charConfig.stagger,
                    ease: 'cubic-bezier(0.625, 0.05, 0, 1)',
                });
            }

            tl.add(itemTl, `${label}+=${i * itemStagger}`);
        });

        // Contact block fades in line-by-line after all nav items have started
        if (contactLines.length) {
            tl.to(contactLines, {
                opacity: 1,
                duration: 0.5,
                stagger: 0.08,
                ease: 'cubic-bezier(0.625, 0.05, 0, 1)',
            }, `${label}+=${items.length * itemStagger + 0.1}`);
        }

        return { items, contactLines };
    }

    // ─── Navbar open / close ─────────────────────────────────────────────────
    function navbarAnimation() {
        const navWrapper = document.getElementById('nav-wrapper');
        const navFull = document.querySelector('.nav-full');
        const navBar = document.getElementById('nav-bar');
        const navMenuWrapper = document.querySelector('.nav-menu-wrapper');
        const navButton = document.getElementById('nav-button');
        const navDecorationFiller = document.querySelector('.nav-decoration-filler');

        if (!navWrapper || !navFull || !navBar || !navMenuWrapper || !navButton) return;

        // Locks page scroll while the nav is open. overflow:hidden on <html> alone leaves a
        // horizontal shift as the scrollbar disappears — the padding-right compensation keeps
        // layout width stable. Scroll position itself is preserved by the browser across the
        // lock/unlock (overflow:hidden doesn't reset scrollTop), so closing lands back where
        // the user left off.
        const root = document.documentElement;

        function lockScroll() {
            const scrollbarWidth = window.innerWidth - root.clientWidth;
            root.style.overflow = 'hidden';
            if (scrollbarWidth > 0) root.style.paddingRight = scrollbarWidth + 'px';
        }

        function unlockScroll() {
            root.style.overflow = '';
            root.style.paddingRight = '';
        }

        gsap.set(navMenuWrapper, { opacity: 0 });
        // height, not scaleY: a transform would stretch the element the client nested inside
        // the filler instead of revealing it. This is safe now that the filler animates at the
        // very end of the sequence, well after .nav-full's own height tween has settled —
        // percentage height only pops when it resolves against a parent that's still resizing.
        if (navDecorationFiller) gsap.set(navDecorationFiller, { height: 0, overflow: 'hidden' });
        // Border applied only via JS, never in Webflow directly — a permanent 1px border there
        // adds thickness to .nav-menu-wrapper's box even while closed, throwing off the closed layout.
        gsap.set(navMenuWrapper, { borderStyle: 'solid', borderWidth: 0, borderColor: '#640400' });

        // ─── Open: the full, staggered reveal ───
        const openTl = gsap.timeline({
            paused: true,
            defaults: { duration: 0.35, ease: 'cubic-bezier(0.625, 0.05, 0, 1)' }
        });

        // Lock scroll / apply open styles to the outer wrapper immediately on open.
        // Also broadcasts nav:open/nav:close so page-specific scripts can react without
        // global.js knowing about them.
        openTl.eventCallback('onStart', () => {
            navWrapper.classList.add('is-open');
            lockScroll();
            document.dispatchEvent(new CustomEvent('nav:open'));
        });

        openTl.to(navFull, {
            height: '100%',
        });

        const { items: navItems, contactLines } = addNavMenuContentToTimeline(openTl, navMenuWrapper);

        // .nav-menu-wrapper is height:0/overflow:hidden until it gets .is-open (height:auto),
        // so these must land when the staggered reveal starts, not after it finishes —
        // otherwise the whole reveal plays out clipped and invisible, then snaps open all at once.
        openTl.call(() => {
            navFull.classList.add('is-open');
            navMenuWrapper.classList.add('is-open');
        }, [], 'menuContent');

        openTl.set(navMenuWrapper, { borderWidth: 1 }, 'menuContent');

        // Filler animates in last, overlapping the tail end of the staggered content by 0.2s
        if (navDecorationFiller) {
            openTl.to(navDecorationFiller, {
                height: '100%',
            }, '-=0.2');
        }

        // Current-page square indicator(s): hidden on every item except the active one,
        // revealed only once everything above (including the filler) has finished
        const currentPages = navItems.filter(item => item.isCurrent && item.currentPage).map(item => item.currentPage);

        if (currentPages.length) {
            openTl.to(currentPages, {
                autoAlpha: 1,
                scale: 1,
                duration: 0.35,
                stagger: 0.05,
                ease: 'cubic-bezier(0.625, 0.05, 0, 1)',
            });
        }

        // ─── Close: separate, fast, non-staggered — everything collapses together ───
        const allLines = navItems.map(item => item.line).filter(Boolean);
        const allChars = navItems.flatMap(item => item.split?.chars ?? []);

        const closeTl = gsap.timeline({
            paused: true,
            defaults: { duration: 0.3, ease: 'cubic-bezier(0.625, 0.05, 0, 1)' }
        });

        closeTl.eventCallback('onStart', () => {
            document.dispatchEvent(new CustomEvent('nav:close'));
        });

        // #nav-bar's own height doesn't change between the open/closed states (it's a sibling of
        // .nav-menu-wrapper in a column flex layout, sized by its own content, not stretched) —
        // so it's a reliable stand-in for .nav-full's closed height. Measured live here instead
        // of cached once at load, since a cached value goes stale across a font swap-in or a
        // resize past #nav-bar's responsive min-height breakpoints, which was landing the close
        // tween on the wrong pixel value and producing a visible snap once .is-open (which
        // governs the real final layout via CSS) gets stripped on completion.
        closeTl.to(navFull, { height: () => navBar.getBoundingClientRect().height });
        if (navDecorationFiller) closeTl.to(navDecorationFiller, { height: 0 }, '<');
        if (allLines.length) closeTl.to(allLines, { scaleX: 0 }, '<');
        if (allChars.length) closeTl.to(allChars, { yPercent: 110 }, '<');
        if (contactLines.length) closeTl.to(contactLines, { opacity: 0 }, '<');
        if (currentPages.length) closeTl.to(currentPages, { autoAlpha: 0, scale: 0 }, '<');
        closeTl.set(navMenuWrapper, { opacity: 0, borderWidth: 0 });

        // Strip all open classes once closing finishes
        closeTl.eventCallback('onComplete', () => {
            navWrapper.classList.remove('is-open');
            navFull.classList.remove('is-open');
            navMenuWrapper.classList.remove('is-open');
            unlockScroll();
        });

        let isOpen = false;

        function openNav() {
            if (isOpen) return;
            isOpen = true;
            closeTl.pause();
            openTl.play(0);
        }

        function closeNav() {
            if (!isOpen) return;
            isOpen = false;
            openTl.pause();
            closeTl.play(0);
        }

        navButton.addEventListener('click', () => {
            isOpen ? closeNav() : openNav();
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') closeNav();
        });

        return { openTl, closeTl };
    }

    // ─── Hide the nav bar once the footer comes into view ───────────────────
    // #footer crossing the bottom of the viewport slides #nav-wrapper up out of view;
    // scrolling back above that point brings it back down.
    function hideNavAtFooter() {
        const navWrapper = document.getElementById('nav-wrapper');
        const footer = document.getElementById('footer');

        if (!navWrapper || !footer) return;

        ScrollTrigger.create({
            trigger: footer,
            start: 'top bottom',
            // yPercent:-100 only accounts for the element's own height — .nav-outer.home's
            // margin-top:12px pushes it down an extra 12px that yPercent doesn't know about,
            // leaving a sliver on screen. The explicit y:-12 closes that gap.
            onEnter: () => gsap.to(navWrapper, { yPercent: -100, y: -12, duration: 0.4, ease: 'cubic-bezier(0.625, 0.05, 0, 1)' }),
            onLeaveBack: () => gsap.to(navWrapper, { yPercent: 0, y: 0, duration: 0.4, ease: 'cubic-bezier(0.625, 0.05, 0, 1)' }),
        });
    }

    navbarAnimation();
    hideNavAtFooter();

});

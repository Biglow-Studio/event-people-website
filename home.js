gsap.registerPlugin(ScrollTrigger);

function initCascadingSlider() {
    const duration = 0.65;
    const ease = 'power3.inOut';

    const breakpoints = [
        { maxWidth: 479, activeWidth: 0.78, siblingWidth: 0.08 },
        { maxWidth: 767, activeWidth: 0.7, siblingWidth: 0.1 },
        { maxWidth: 991, activeWidth: 0.6, siblingWidth: 0.1 },
        { maxWidth: Infinity, activeWidth: 0.6, siblingWidth: 0.13 },
    ];

    const wrappers = document.querySelectorAll('[data-cascading-slider-wrap]');
    wrappers.forEach(setupInstance);

    function setupInstance(wrapper) {
        const viewport = wrapper.querySelector('[data-cascading-viewport]');
        const prevButton = wrapper.querySelector('[data-cascading-slider-prev]');
        const nextButton = wrapper.querySelector('[data-cascading-slider-next]');
        const slides = Array.from(viewport.querySelectorAll('[data-cascading-slide]'));
        let totalSlides = slides.length;
        const originalSlideCount = totalSlides; // before the below pads it out to a minimum of 9 via clones

        if (totalSlides === 0) return;

        const totalIndexEl = wrapper.querySelector('[data-slider-index-total]');
        const currentIndexEl = wrapper.querySelector('[data-slider-index-current]');
        const setIndexNumber = (el, value) => {
            if (!el) return;
            el.textContent = value < 10 ? '0' + value : String(value);
        };
        setIndexNumber(totalIndexEl, originalSlideCount);

        if (totalSlides < 9) {
            const originalSlides = slides.slice();
            while (slides.length < 9) {
                originalSlides.forEach(function (original) {
                    const clone = original.cloneNode(true);
                    clone.setAttribute('data-clone', '');
                    viewport.appendChild(clone);
                    slides.push(clone);
                });
            }
            totalSlides = slides.length;
        }

        let activeIndex = 0;
        let isAnimating = false;
        let slideWidth = 0;
        let slotCenters = {};
        let slotWidths = {};

        setIndexNumber(currentIndexEl, (activeIndex % originalSlideCount) + 1);

        function readGap() {
            const raw = getComputedStyle(viewport).getPropertyValue('--gap').trim();
            if (!raw) return 0;
            const temp = document.createElement('div');
            temp.style.width = raw;
            temp.style.position = 'absolute';
            temp.style.visibility = 'hidden';
            viewport.appendChild(temp);
            const px = temp.offsetWidth;
            viewport.removeChild(temp);
            return px;
        }

        function getSettings() {
            const windowWidth = window.innerWidth;
            for (let i = 0; i < breakpoints.length; i++) {
                if (windowWidth <= breakpoints[i].maxWidth) return breakpoints[i];
            }
            return breakpoints[breakpoints.length - 1];
        }

        function getOffset(slideIndex, fromIndex) {
            if (fromIndex === undefined) fromIndex = activeIndex;
            let distance = slideIndex - fromIndex;
            const half = totalSlides / 2;
            if (distance > half) distance -= totalSlides;
            if (distance < -half) distance += totalSlides;
            return distance;
        }

        function measure() {
            const settings = getSettings();
            const viewportWidth = viewport.offsetWidth;
            const gap = readGap();

            const activeSlideWidth = viewportWidth * settings.activeWidth;
            const siblingSlideWidth = viewportWidth * settings.siblingWidth;
            const farSlideWidth = Math.max(0, (viewportWidth - activeSlideWidth - 2 * siblingSlideWidth - 4 * gap) / 2);

            slideWidth = activeSlideWidth;

            const visibleSlots = [
                { slot: -2, width: farSlideWidth },
                { slot: -1, width: siblingSlideWidth },
                { slot: 0, width: activeSlideWidth },
                { slot: 1, width: siblingSlideWidth },
                { slot: 2, width: farSlideWidth },
            ];

            let x = 0;
            visibleSlots.forEach(function (def, i) {
                slotCenters[String(def.slot)] = x + def.width / 2;
                slotWidths[String(def.slot)] = def.width;
                if (i < visibleSlots.length - 1) x += def.width + gap;
            });

            slotCenters['-3'] = slotCenters['-2'] - farSlideWidth / 2 - gap - farSlideWidth / 2;
            slotWidths['-3'] = farSlideWidth;
            slotCenters['3'] = slotCenters['2'] + farSlideWidth / 2 + gap + farSlideWidth / 2;
            slotWidths['3'] = farSlideWidth;

            slides.forEach(function (slide) {
                slide.style.width = slideWidth + 'px';
            });
        }

        function getSlideProps(offset) {
            const clamped = Math.max(-3, Math.min(3, offset));
            const slotWidth = slotWidths[String(clamped)];
            const clipAmount = Math.max(0, (slideWidth - slotWidth) / 2);
            const translateX = slotCenters[String(clamped)] - slideWidth / 2;

            return {
                x: translateX,
                '--clip': clipAmount,
                zIndex: 10 - Math.abs(clamped),
            };
        }

        function layout(animate, previousIndex) {
            slides.forEach(function (slide, index) {
                const offset = getOffset(index);

                if (offset < -3 || offset > 3) {
                    if (animate && previousIndex !== undefined) {
                        const previousOffset = getOffset(index, previousIndex);
                        if (previousOffset >= -2 && previousOffset <= 2) {
                            const exitSlot = previousOffset < 0 ? -3 : 3;
                            gsap.to(
                                slide,
                                Object.assign({}, getSlideProps(exitSlot), {
                                    duration: duration,
                                    ease: ease,
                                    overwrite: true,
                                }),
                            );
                            return;
                        }
                    }

                    const parkSlot = offset < 0 ? -3 : 3;
                    gsap.set(slide, getSlideProps(parkSlot));
                    return;
                }

                const props = getSlideProps(offset);
                slide.setAttribute('data-status', offset === 0 ? 'active' : 'inactive');

                if (animate) {
                    gsap.to(
                        slide,
                        Object.assign({}, props, {
                            duration: duration,
                            ease: ease,
                            overwrite: true,
                        }),
                    );
                } else {
                    gsap.set(slide, props);
                }
            });
        }

        function goTo(targetIndex) {
            const normalizedTarget = ((targetIndex % totalSlides) + totalSlides) % totalSlides;
            if (isAnimating || normalizedTarget === activeIndex) return;
            isAnimating = true;

            const previousIndex = activeIndex;
            const travelDirection = getOffset(normalizedTarget, previousIndex) > 0 ? 1 : -1;

            slides.forEach(function (slide, index) {
                const currentOffset = getOffset(index, previousIndex);
                const nextOffset = getOffset(index, normalizedTarget);
                const wasInRange = currentOffset >= -3 && currentOffset <= 3;
                const willBeVisible = nextOffset >= -2 && nextOffset <= 2;

                if (!wasInRange && willBeVisible) {
                    const entrySlot = travelDirection > 0 ? 3 : -3;
                    gsap.set(slide, getSlideProps(entrySlot));
                }

                const wasInvisible = Math.abs(currentOffset) >= 3;
                const willBeStaging = Math.abs(nextOffset) === 3;
                const crossesSides = currentOffset * nextOffset < 0;
                if (wasInvisible && willBeStaging && crossesSides) {
                    gsap.set(slide, getSlideProps(nextOffset > 0 ? 3 : -3));
                }
            });

            activeIndex = normalizedTarget;
            setIndexNumber(currentIndexEl, (activeIndex % originalSlideCount) + 1);
            layout(true, previousIndex);
            gsap.delayedCall(duration + 0.05, function () {
                isAnimating = false;
            });
        }

        // Autoplay: advances every 3s; any manual slide change (prev/next/direct click) resets
        // the timer and backs off to a 5s pause before autoplay resumes at its normal cadence.
        const AUTOPLAY_INTERVAL = 3000;
        const AUTOPLAY_RESET_DELAY = 5000;
        let autoplayTimer;

        function scheduleAutoplay(delay) {
            clearTimeout(autoplayTimer);
            autoplayTimer = setTimeout(function () {
                goTo(activeIndex + 1);
                scheduleAutoplay(AUTOPLAY_INTERVAL);
            }, delay);
        }

        function resetAutoplay() {
            scheduleAutoplay(AUTOPLAY_RESET_DELAY);
        }

        if (prevButton)
            prevButton.addEventListener('click', function () {
                goTo(activeIndex - 1);
                resetAutoplay();
            });
        if (nextButton)
            nextButton.addEventListener('click', function () {
                goTo(activeIndex + 1);
                resetAutoplay();
            });

        if (nextButton) scheduleAutoplay(AUTOPLAY_INTERVAL);

        slides.forEach(function (slide, index) {
            slide.addEventListener('click', function () {
                if (index !== activeIndex) {
                    goTo(index);
                    resetAutoplay();
                }
            });
        });

        document.addEventListener('keydown', function (event) {
            if (event.key === 'ArrowLeft') goTo(activeIndex - 1);
            if (event.key === 'ArrowRight') goTo(activeIndex + 1);
        });

        let resizeTimer;
        window.addEventListener('resize', function () {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(function () {
                measure();
                layout(false);
            }, 100);
        });

        measure();
        layout(false);
    }
}

// Initialize Cascading Slider
document.addEventListener('DOMContentLoaded', function () {
    initCascadingSlider();
});

function init3DCardsTornado() {
    const containers = gsap.utils.toArray('[data-3d-tornado-init]');

    const edgeEase = gsap.parseEase('power2.inOut'); // easing for edge scaling, same at every breakpoint

    // Base values used at every breakpoint unless overridden below.
    const defaultSettings = {
        rotationAngle: 30, // rotation angle (spacing)
        cardYSpacing: 0.3, // vertical card offset
        edgeOffset: 2, // vertical edge offset
        orbitDepth: 35, // width/depth of the tornado orbit
        autoSpeed: 0.00325, // automatic rotation speed
        scrollSpeed: 0.015, // scroll/drag speed
        dragMultiplier: 5, // extra sensitivity for drag gestures
        scrollEase: 0.1, // speed lerp
        maxSpeed: 0.2, // maximum speed
        edgeScale: 0.5, // edge scale distance
        minScale: 1, // smallest scale for distant cards
        backDarkness: 0.75, // darkening applied to cards in back
        backBlur: 0.5, // blur applied to cards in back
    };

    // Webflow's standard breakpoints, smallest to largest — only list the values that need to
    // differ from defaultSettings.
    const breakpoints = [
        { maxWidth: 479, overrides: {
            orbitDepth: 40,
        } },
        { maxWidth: 767, overrides: {} },
        { maxWidth: 991, overrides: {
            orbitDepth: 55,
        } },
        { maxWidth: Infinity, overrides: {} },
    ];

    // Cascade desktop → mobile (matches Webflow's own breakpoint cascade): each breakpoint's
    // overrides layer on top of the next-larger breakpoint's resolved settings, so a change made
    // at a larger breakpoint carries down to smaller ones until a smaller breakpoint overrides it itself.
    (function resolveCascade() {
        let resolved = defaultSettings;
        for (let i = breakpoints.length - 1; i >= 0; i--) {
            resolved = Object.assign({}, resolved, breakpoints[i].overrides);
            breakpoints[i].resolved = resolved;
        }
    })();

    function getSettings() {
        const windowWidth = window.innerWidth;
        for (let i = 0; i < breakpoints.length; i++) {
            if (windowWidth <= breakpoints[i].maxWidth) return breakpoints[i].resolved;
        }
        return breakpoints[breakpoints.length - 1].resolved;
    }

    containers.forEach((container) => {
        const list = container.querySelector('[data-3d-tornado-list]');
        const originalCards = gsap.utils.toArray('[data-3d-tornado-item]', list).map((card) => card.cloneNode(true));
        if (!list || !originalCards.length) return;

        let inputObserver;
        let resizeTimer;
        let lastWidth = window.innerWidth;
        let settings = getSettings();

        const state = {
            amount: 0,
            progress: 0,
            velocity: settings.autoSpeed,
            direction: 1,
            cardHeight: 0,
            cardGap: 0,
            em: 16,
            isActive: false,
            cards: [],
        };

        function getCardAmount() {
            const containerHalfHeight = container.offsetHeight * 0.5;
            const edgeOffsetDistance = state.cardHeight * settings.edgeOffset;
            const fadeDistance = state.cardHeight * settings.edgeScale;
            const neededDistance = containerHalfHeight + edgeOffsetDistance + fadeDistance;
            const cardsPerSide = Math.ceil(neededDistance / state.cardGap) + 1;
            const neededAmount = cardsPerSide * 2 + 1;
            const batchCount = Math.ceil(neededAmount / originalCards.length);

            return originalCards.length * batchCount;
        }

        function buildCards() {
            list.innerHTML = '';

            const measureCard = originalCards[0].cloneNode(true);
            list.appendChild(measureCard);
            state.cardHeight = measureCard.offsetHeight;
            state.cardGap = state.cardHeight * settings.cardYSpacing;
            state.em = parseFloat(getComputedStyle(measureCard).fontSize);
            state.amount = getCardAmount();
            list.innerHTML = '';

            for (let i = 0; i < state.amount; i++) {
                const card = originalCards[i % originalCards.length].cloneNode(true);
                card.dataset.index = i;
                list.appendChild(card);
            }
            state.cards = gsap.utils.toArray('[data-3d-tornado-item]', list);
        }

        function getEdgeScale(y) {
            const containerHalfHeight = container.offsetHeight * 0.5;
            const edgeOffsetDistance = state.cardHeight * settings.edgeOffset;
            const fadeDistance = state.cardHeight * settings.edgeScale;
            const distanceFromCenter = Math.abs(y);
            const fadeStart = containerHalfHeight + edgeOffsetDistance;
            const progress = gsap.utils.clamp(0, 1, (fadeStart - distanceFromCenter) / fadeDistance);
            return edgeEase(progress);
        }

        function render() {
            const radius = settings.orbitDepth * state.em;

            state.cards.forEach((card) => {
                const startIndex = parseFloat(card.dataset.index);
                const loopIndex = (((startIndex + state.progress) % state.amount) + state.amount) % state.amount;
                const index = loopIndex > state.amount * 0.5 ? loopIndex - state.amount : loopIndex;
                const angleDeg = index * settings.rotationAngle;
                const angleRad = (angleDeg * Math.PI) / 180;
                const center = 1 - Math.min(Math.abs(index) / (state.amount * 0.5), 1);
                const y = index * state.cardGap;
                const baseScale = settings.minScale + center * (1 - settings.minScale);
                const scale = baseScale * getEdgeScale(y);
                const backAmount = gsap.utils.clamp(0, 1, (1 - Math.cos(angleRad)) * 0.5);
                const brightness = 1 - backAmount * settings.backDarkness;
                const blur = backAmount * settings.backBlur;

                gsap.set(card, {
                    xPercent: -50,
                    yPercent: -50,
                    x: Math.sin(angleRad) * radius,
                    y,
                    z: (Math.cos(angleRad) - 1) * radius,
                    rotateY: angleDeg,
                    scale,
                    filter: `brightness(${brightness}) blur(${blur}em)`,
                    autoAlpha: 1,
                    zIndex: Math.round(center * 1000),
                });
            });
        }

        function tick() {
            if (!state.isActive) return;
            const targetVelocity = settings.autoSpeed * state.direction;
            state.velocity = gsap.utils.interpolate(state.velocity, targetVelocity, settings.scrollEase);
            state.progress += state.velocity;
            render();
        }

        function handleInput(self) {
            if (!state.isActive) return;
            const delta =
                self.event.type === 'wheel'
                    ? self.deltaY
                    : Math.abs(self.deltaX) > Math.abs(self.deltaY)
                      ? self.deltaX * settings.dragMultiplier
                      : self.deltaY * settings.dragMultiplier;
            if (!delta) return;
            state.direction = delta > 0 ? 1 : -1;
            state.velocity += (delta * settings.scrollSpeed) / 100;
            state.velocity = gsap.utils.clamp(-settings.maxSpeed, settings.maxSpeed, state.velocity);
        }

        function setActive(isActive) {
            state.isActive = isActive;
            if (!inputObserver) return;
            if (isActive) {
                inputObserver.enable();
            } else {
                inputObserver.disable();
            }
        }

        function rebuild() {
            settings = getSettings();
            buildCards();
            render();
        }

        rebuild();

        inputObserver = Observer.create({
            target: window,
            type: 'wheel,touch,pointer',
            preventDefault: false,
            lockAxis: true,
            onChange: handleInput,
            onPress: () => {
                container.style.cursor = 'grabbing';
            },
            onRelease: () => {
                container.style.cursor = 'grab';
            },
        });

        ScrollTrigger.create({
            trigger: container,
            start: 'top bottom',
            end: 'bottom top',
            onEnter: () => setActive(true),
            onEnterBack: () => setActive(true),
            onLeave: () => setActive(false),
            onLeaveBack: () => setActive(false),
        });

        setActive(ScrollTrigger.isInViewport(container));
        gsap.ticker.add(tick);

        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                // Mobile browsers fire resize on scroll-driven address-bar collapse/expand
                // (height-only change) — rebuilding the cards on that is what caused the
                // glitch at scroll-direction changes. Only width changes are breakpoint-relevant.
                if (window.innerWidth === lastWidth) return;
                lastWidth = window.innerWidth;
                rebuild();
                ScrollTrigger.refresh();
            }, 150);
        });
    });
}

// Initalize 3D Cards Tornado
document.addEventListener('DOMContentLoaded', () => {
    init3DCardsTornado();
});

function initStickyStepsBasic() {
    const containers = document.querySelectorAll('[data-sticky-steps-init]');
    if (!containers.length) return;

    containers.forEach((container) => {
        const items = [...container.querySelectorAll('[data-sticky-steps-item]')];
        if (!items.length) return;

        function updateSteps() {
            const viewportCenter = window.innerHeight / 2;

            let closestIndex = 0;
            let closestDistance = Infinity;

            items.forEach((item, index) => {
                const anchor = item.querySelector('[data-sticky-steps-anchor]');
                if (!anchor) return;

                const rect = anchor.getBoundingClientRect();
                const anchorCenter = rect.top + rect.height / 2;
                const distance = Math.abs(viewportCenter - anchorCenter);

                if (distance < closestDistance) {
                    closestDistance = distance;
                    closestIndex = index;
                }
            });

            items.forEach((item, index) => {
                let status = 'active';

                if (index < closestIndex) status = 'before';
                if (index > closestIndex) status = 'after';

                item.setAttribute('data-sticky-steps-item-status', status);
            });
        }

        window.addEventListener('scroll', updateSteps);
        window.addEventListener('resize', updateSteps);

        requestAnimationFrame(updateSteps);
    });
}

// Initialize Sticky Steps (Basic)
document.addEventListener('DOMContentLoaded', function () {
    initStickyStepsBasic();
});

function initHeroVideoObjectPosition() {
    const heroVideo = document.getElementById('hero-video');
    const video = heroVideo && heroVideo.querySelector('.w-background-video video');

    if (!video) return;

    // Base value used at every breakpoint unless overridden below.
    const defaultSettings = {
        objectPosition: '50% 50%',
    };

    // Webflow's standard breakpoints, smallest to largest — only list the values that need to
    // differ from defaultSettings.
    const breakpoints = [
        { maxWidth: 479, overrides: {} },
        { maxWidth: 767, overrides: {} },
        { maxWidth: 991, overrides: {
            objectPosition: '20% 50%',
        } },
        { maxWidth: Infinity, overrides: {} },
    ];

    // Cascade desktop → mobile (matches Webflow's own breakpoint cascade): each breakpoint's
    // overrides layer on top of the next-larger breakpoint's resolved settings, so a change made
    // at a larger breakpoint carries down to smaller ones until a smaller breakpoint overrides it itself.
    (function resolveCascade() {
        let resolved = defaultSettings;
        for (let i = breakpoints.length - 1; i >= 0; i--) {
            resolved = Object.assign({}, resolved, breakpoints[i].overrides);
            breakpoints[i].resolved = resolved;
        }
    })();

    function getSettings() {
        const windowWidth = window.innerWidth;
        for (let i = 0; i < breakpoints.length; i++) {
            if (windowWidth <= breakpoints[i].maxWidth) return breakpoints[i].resolved;
        }
        return breakpoints[breakpoints.length - 1].resolved;
    }

    function applySettings() {
        video.style.objectPosition = getSettings().objectPosition;
    }

    applySettings();

    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(applySettings, 150);
    });
}

// Initialize Hero Video Object Position
document.addEventListener('DOMContentLoaded', () => {
    initHeroVideoObjectPosition();
});

gsap.registerPlugin(SplitText, ScrollTrigger);

document.addEventListener('DOMContentLoaded', () => {

    // ─── Sticky-video service items: scroll-scrubbed SplitText crossfade ────────────────────
    // Only one .video-featured-item is ever meant to be on screen, centered in the pinned card,
    // with the next one's SplitText entrance overlapping the current one's exit. Items are
    // stacked absolutely on top of each other (wrapper height pinned to the tallest item, since
    // absolute children can't otherwise size their parent) and cross-animated on a single
    // scroll-scrubbed timeline built off .section.sticky-video's scroll range.
    //
    // SplitText's split targets aren't guaranteed to exist synchronously right after .create()
    // — the split can defer until web fonts are ready — so targets are collected from the
    // onSplit callback (same convention as global.js) rather than read off the return value
    // directly.
    //
    // Both the heading (service name) and description split by word — a char split on the
    // heading was wrapping badly, so both use the same split type here.
    //
    // Items hidden in Webflow (display:none) are skipped. Each item gets a full slot of the
    // scroll range, so a hidden item left a stretch at the end of the pinned section where
    // scrolling changed nothing on screen — the "stuck mid-scroll" feel.
    function initStickyVideoReveal() {
        const section = document.querySelector('.section.sticky-video');
        const wrapper = section ? section.querySelector('.video-features-wrapper') : null;
        const items = wrapper
            ? Array.from(wrapper.querySelectorAll('.video-featured-item')).filter(item => getComputedStyle(item).display !== 'none')
            : [];
        if (!section || !wrapper || !items.length) return;

        const splitSpecByItem = items.map(item => {
            const heading = item.querySelector('h1');
            const description = item.querySelector('h3');
            const specs = [];
            if (heading) specs.push({ el: heading, type: 'words', stagger: 0.06 });
            if (description) specs.push({ el: description, type: 'words', stagger: 0.06 });
            return specs;
        });
        const splitTargetsByElement = new Map();

        function stackItems() {
            const tallest = Math.max(...items.map(item => item.getBoundingClientRect().height));
            wrapper.style.position = 'relative';
            wrapper.style.height = tallest + 'px';
            items.forEach(item => {
                Object.assign(item.style, { position: 'absolute', top: '0', left: '0', width: '100%' });
            });
        }

        const mediaQueries = gsap.matchMedia();

        mediaQueries.add('(prefers-reduced-motion: no-preference)', () => {
            let scrollTl = null;
            let pendingSplits = splitSpecByItem.reduce((sum, specs) => sum + specs.length, 0);

            // Transition width, as a fraction of one item's scroll slot — how much of the
            // outgoing/incoming items' slots is spent exiting/entering at each boundary.
            const transitionDuration = 0.4;

            function rebuildTimeline() {
                if (scrollTl) {
                    scrollTl.scrollTrigger.kill();
                    scrollTl.kill();
                    scrollTl = null;
                }

                stackItems();

                // Each item keeps its char (heading) and word (description) targets in separate
                // groups — not flattened together — so each group animates at its own stagger
                // pace while both groups still share the same entrance/exit timeline position.
                const itemGroups = splitSpecByItem.map(specs =>
                    specs.map(spec => ({ targets: splitTargetsByElement.get(spec.el) || [], stagger: spec.stagger }))
                );

                itemGroups.forEach((groups, index) => {
                    groups.forEach(group => {
                        gsap.set(group.targets, { yPercent: index === 0 ? 0 : 110, opacity: index === 0 ? 1 : 0 });
                    });
                });

                // Resting points, so the scroll never settles mid-crossfade with two items'
                // words overlapping each other. The timeline runs (count - 1) + transitionDuration
                // units long: item i owns slot [i, i+1], each boundary spending transitionDuration
                // on the outgoing exit and the incoming entrance. That leaves a "settled" window
                // per item where nothing is animating, and we snap to the middle of it:
                //   item 0      → [0, 1 - d]
                //   item i      → [i + d, i + 1 - d]
                //   last item   → its entrance finishes exactly at the end, so its point is 1.
                // Snapping is directional (GSAP's default), so it only ever nudges the way the
                // user is already scrolling and never traps them in the section.
                const totalUnits = (itemGroups.length - 1) + transitionDuration;
                const snapPoints = itemGroups.length > 1 && totalUnits > 0
                    ? itemGroups.map((_, index) => {
                        if (index === 0) return ((1 - transitionDuration) / 2) / totalUnits;
                        if (index === itemGroups.length - 1) return 1;
                        return (index + 0.5) / totalUnits;
                    })
                    : null;

                const tl = gsap.timeline({
                    scrollTrigger: {
                        trigger: section,
                        start: 'top top',
                        end: 'bottom bottom',
                        scrub: true,
                        ...(snapPoints && {
                            snap: {
                                snapTo: snapPoints,
                                duration: { min: 0.15, max: 0.4 },
                                delay: 0.05,
                                ease: 'power1.inOut',
                            },
                        }),
                    },
                });

                itemGroups.forEach((groups, index) => {
                    groups.forEach(group => {
                        if (!group.targets.length) return;

                        // Exit: slides up and out, finishing exactly at the boundary with the
                        // next item (not overlapping it).
                        if (index < itemGroups.length - 1) {
                            tl.to(group.targets, { yPercent: -110, opacity: 0, stagger: group.stagger, ease: 'expo.in', duration: transitionDuration }, index + 1 - transitionDuration);
                        }

                        // Entrance: starts exactly where the previous item's exit above ends.
                        if (index > 0) {
                            tl.fromTo(group.targets, { yPercent: 110, opacity: 0 }, { yPercent: 0, opacity: 1, stagger: group.stagger, ease: 'expo.out', duration: transitionDuration }, index);
                        }
                    });
                });

                scrollTl = tl;
                ScrollTrigger.refresh();
            }

            splitSpecByItem.forEach(specs => {
                specs.forEach(spec => {
                    SplitText.create(spec.el, {
                        type: spec.type,
                        mask: spec.type,
                        autoSplit: true,
                        onSplit(instance) {
                            splitTargetsByElement.set(spec.el, instance[spec.type]);

                            if (pendingSplits > 0) {
                                pendingSplits--;
                                if (pendingSplits === 0) rebuildTimeline();
                            } else {
                                // A resplit after the initial build (resize, font swap) — rebuild
                                // in place so the timeline picks up the current split targets.
                                rebuildTimeline();
                            }
                        },
                    });
                });
            });

            return () => {
                if (scrollTl) {
                    scrollTl.scrollTrigger.kill();
                    scrollTl.kill();
                }
            };
        });

        mediaQueries.add('(prefers-reduced-motion: reduce)', () => {
            stackItems();

            splitSpecByItem.forEach((specs, index) => {
                specs.forEach(spec => {
                    SplitText.create(spec.el, {
                        type: spec.type,
                        mask: spec.type,
                        autoSplit: true,
                        onSplit(instance) {
                            gsap.set(instance[spec.type], { yPercent: index === 0 ? 0 : -110, opacity: index === 0 ? 1 : 0 });
                        },
                    });
                });
            });
        });
    }

    initStickyVideoReveal();

});


gsap.registerPlugin(Draggable, InertiaPlugin, CustomEase);
CustomEase.create("spatial", "0.25, 0.1, 0, 1");

function initSpatialCardsSlider() {
  const slideDuration = 1;
  const clickEase = 'spatial';

  // Original (non-cloned) cards persist across re-inits, so their bio
  // paragraph SplitText instance must be reverted to plain text before
  // re-cloning below — otherwise clones would inherit already-split markup.
  revertCollectiveCardSplits();

  document.querySelectorAll('[data-spatial-slider-init]').forEach(container => {
    if (container._spatialSliderDraggable) container._spatialSliderDraggable.kill();
    if (container._spatialSliderImageObserver) container._spatialSliderImageObserver.disconnect();

    if (container._spatialSliderProxy) {
      gsap.killTweensOf(container._spatialSliderProxy);
      container._spatialSliderProxy.remove();
    }

    const collection = container.querySelector('[data-spatial-slider-collection]');
    const track = container.querySelector('[data-spatial-slider-list]');
    if (!collection || !track) return;

    gsap.set(track, { clearProps: 'transform' });

    container.querySelectorAll('[data-spatial-slider-item]').forEach(item => {
      gsap.set(item, { clearProps: 'transform' });
    });

    container.querySelectorAll('[data-spatial-slider-clone]').forEach(el => el.remove());

    const originalItems = Array.from(track.querySelectorAll(':scope > [data-spatial-slider-item]:not([data-spatial-slider-clone])'));
    if (!originalItems.length) return;

    container.setAttribute('role', 'region');
    container.setAttribute('aria-roledescription', 'carousel');
    container.setAttribute('aria-label', container.getAttribute('aria-label') || 'Spatial Cards Slider');
    track.setAttribute('role', 'group');
    track.setAttribute('aria-label', 'Slides');

    const dotsWrap = container.querySelector('[data-spatial-slider-generate-dots]');

    if (dotsWrap) {
      const dots = Array.from(dotsWrap.querySelectorAll('[data-spatial-slider-control]'));

      if (dots.length) {
        const template = dots[0];
        dots.slice(1).forEach(dot => dot.remove());

        for (let i = 1; i <= originalItems.length; i++) {
          const dot = i === 1 ? template : template.cloneNode(true);
          dot.setAttribute('data-spatial-slider-control', String(i));
          dot.setAttribute('data-spatial-slider-control-status', 'not-active');
          if (i > 1) dotsWrap.appendChild(dot);
        }
      }
    }

    const controls = Array.from(container.querySelectorAll('[data-spatial-slider-control]'));
    const totalEl = container.querySelector('[data-spatial-slider-total-slide]');
    const indicators = Array.from(container.querySelectorAll('[data-spatial-slider-active-slide]'));
    const mod = (value, total) => ((value % total) + total) % total;
    const formatNumber = value => value < 10 ? '0' + value : String(value);

    if (totalEl) totalEl.textContent = formatNumber(originalItems.length);

    originalItems.forEach((item, index) => {
      item.removeAttribute('data-spatial-slider-item-status');
      item.removeAttribute('aria-hidden');
      item.setAttribute('role', 'group');
      item.setAttribute('aria-label', `Slide ${index + 1} of ${originalItems.length}`);
    });

    controls.forEach(btn => {
      const value = btn.getAttribute('data-spatial-slider-control');

      if (value === 'prev') btn.setAttribute('aria-label', 'Previous slide');
      if (value === 'next') btn.setAttribute('aria-label', 'Next slide');

      if (/^\d+$/.test(value)) {
        btn.setAttribute('aria-label', `Go to slide ${value}`);
        btn.setAttribute('aria-current', 'false');
      }
    });

    const containerStyles = getComputedStyle(container);
    const trackStyles = getComputedStyle(track);
    const curve = Math.abs(parseFloat(containerStyles.getPropertyValue('--slider-curve'))) || 12;
    const directionValue = parseFloat(containerStyles.getPropertyValue('--slider-direction'));
    const direction = directionValue < 0 ? -1 : 1;
    const gap = parseFloat(trackStyles.columnGap) || 0;
    const curveRadians = curve * Math.PI / 180;

    const firstRect = originalItems[0].getBoundingClientRect();
    const itemWidth = firstRect.width;
    const itemHeight = firstRect.height;

    const perspectiveValue = parseFloat(getComputedStyle(track).perspective);
    const perspective = Number.isFinite(perspectiveValue) ? perspectiveValue : 1200;

    const getProjectedEdgeX = (radius, angle, side) => {
      const radians = angle * Math.PI / 180;
      const rotation = -direction * radians;
      const localX = side * itemWidth / 2;

      const centerX = Math.sin(radians) * radius;
      const centerZ = direction * radius * (1 - Math.cos(radians));

      const x = centerX + localX * Math.cos(rotation);
      const z = centerZ - localX * Math.sin(rotation);

      return x * perspective / (perspective - z);
    };

    let spatialRadius = itemWidth / Math.sin(curveRadians);

    for (let i = 0; i < 8; i++) {
      const nextLeft = getProjectedEdgeX(spatialRadius, curve, -1);
      const currentRight = itemWidth / 2;
      const currentGap = nextLeft - currentRight;
      const correction = gap - currentGap;

      spatialRadius += correction / Math.sin(curveRadians);
    }

    const stepDistance = Math.sin(curveRadians) * spatialRadius;
    const tangentRatio = (-direction * spatialRadius) / (perspective - direction * spatialRadius);
    const edgeAngle = Math.acos(gsap.utils.clamp(-1, 1, tangentRatio)) * 180 / Math.PI;
    const maxSideItems = Math.ceil(edgeAngle / curve);
    const maxLoopItems = maxSideItems * 2;

    const getSpatialPosition = offset => {
      const angle = gsap.utils.clamp(-edgeAngle, edgeAngle, offset * curve);
      const radians = angle * Math.PI / 180;

      return {
        x: Math.sin(radians) * spatialRadius,
        z: direction * spatialRadius * (1 - Math.cos(radians)),
        rotationY: -direction * angle
      };
    };

    const containerRect = container.getBoundingClientRect();
    const trackRect = track.getBoundingClientRect();
    const originX = trackRect.left + trackRect.width / 2;
    const leftLimit = containerRect.left - originX;
    const rightLimit = containerRect.right - originX;

    const isOffsetInside = offset => {
      if (Math.abs(offset * curve) >= edgeAngle) return false;

      const position = getSpatialPosition(offset);
      const scale = perspective / (perspective - position.z);
      const radians = Math.abs(position.rotationY) * Math.PI / 180;
      const halfWidth = Math.abs(Math.cos(radians)) * itemWidth * scale / 2;
      const x = position.x * scale;

      return x + halfWidth >= leftLimit && x - halfWidth <= rightLimit;
    };

    const getVisibleCount = () => {
      let left = 0;
      let right = 0;

      for (let i = 1; i < maxSideItems && isOffsetInside(i); i++) right = i;
      for (let i = 1; i < maxSideItems && isOffsetInside(-i); i++) left = i;

      return Math.min(maxLoopItems, 1 + left + right + 2);
    };

    const minItemsNeeded = getVisibleCount();
    const neededItems = originalItems.length >= minItemsNeeded
      ? originalItems.length
      : Math.ceil(minItemsNeeded / originalItems.length) * originalItems.length;

    for (let i = originalItems.length; i < neededItems; i++) {
      const clone = originalItems[i % originalItems.length].cloneNode(true);
      clone.setAttribute('data-spatial-slider-clone', '');
      clone.setAttribute('aria-hidden', 'true');
      track.appendChild(clone);
    }

    const items = Array.from(track.querySelectorAll(':scope > [data-spatial-slider-item]'));
    const totalItems = items.length;

    track.style.height = itemHeight + 'px';
    container.setAttribute('data-spatial-slider-drag-status', 'grab');

    items.forEach(item => item.setAttribute('data-spatial-slider-item-status', 'not-active'));

    const proxy = document.createElement('div');
    proxy.setAttribute('data-spatial-slider-proxy', '');

    Object.assign(proxy.style, {
      position: 'absolute',
      width: '1px',
      height: '1px',
      pointerEvents: 'none',
      opacity: '0'
    });

    container.appendChild(proxy);
    container._spatialSliderProxy = proxy;

    gsap.set(proxy, { x: 0 });

    const setX = items.map(item => gsap.quickSetter(item, 'x', 'px'));
    const setZ = items.map(item => gsap.quickSetter(item, 'z', 'px'));
    const setRotationY = items.map(item => gsap.quickSetter(item, 'rotationY', 'deg'));

    const getIndex = () => -gsap.getProperty(proxy, 'x') / stepDistance;

    const nearestDelta = (index, realIndex) => {
      const loop = Math.round((realIndex - index) / totalItems);
      return index - (realIndex - loop * totalItems);
    };

    const getSlideDelta = (target, realIndex) => {
      let bestDelta = 0;
      let bestDistance = Infinity;

      items.forEach((item, index) => {
        if (index % originalItems.length !== target) return;

        const delta = nearestDelta(index, realIndex);
        const distance = Math.abs(delta);

        if (distance < bestDistance) {
          bestDelta = delta;
          bestDistance = distance;
        }
      });

      return bestDelta;
    };

    let lastActiveIndex = null;

    const updateActiveUI = (activeIndex, activeSlideIndex) => {
      if (activeIndex === lastActiveIndex) return;

      items.forEach((item, index) => {
        item.setAttribute('data-spatial-slider-item-status', index === activeIndex ? 'active' : 'inview');
      });

      indicators.forEach(el => el.textContent = formatNumber(activeSlideIndex + 1));

      controls.forEach(btn => {
        const value = btn.getAttribute('data-spatial-slider-control');
        if (!/^\d+$/.test(value)) return;

        const isActive = parseInt(value, 10) - 1 === activeSlideIndex;
        btn.setAttribute('data-spatial-slider-control-status', isActive ? 'active' : 'not-active');
        btn.setAttribute('aria-current', isActive ? 'true' : 'false');
      });

      lastActiveIndex = activeIndex;
    };

    const render = () => {
      const realIndex = getIndex();
      const activeIndex = mod(Math.round(realIndex), totalItems);
      const activeSlideIndex = activeIndex % originalItems.length;

      items.forEach((item, index) => {
        const position = getSpatialPosition(nearestDelta(index, realIndex));

        setX[index](position.x);
        setZ[index](position.z);
        setRotationY[index](position.rotationY);
      });

      updateActiveUI(activeIndex, activeSlideIndex);
    };

    controls.forEach(btn => {
      const value = btn.getAttribute('data-spatial-slider-control');
      btn.disabled = false;

      btn.onclick = () => {
        gsap.killTweensOf(proxy);

        const currentIndex = getIndex();
        let targetIndex;

        if (value === 'next' || value === 'prev') {
          targetIndex = Math.round(currentIndex) + (value === 'next' ? 1 : -1);
        } else if (/^\d+$/.test(value)) {
          const targetSlide = Math.max(0, Math.min(originalItems.length - 1, parseInt(value, 10) - 1));
          targetIndex = currentIndex + getSlideDelta(targetSlide, currentIndex);
        } else {
          return;
        }

        gsap.to(proxy, {
          x: -targetIndex * stepDistance,
          duration: slideDuration,
          ease: clickEase,
          onUpdate: render
        });
      };
    });

    container._spatialSliderDraggable = Draggable.create(proxy, {
      type: 'x',
      trigger: collection,
      inertia: true,
      throwResistance: 2000,
      dragResistance: 0.05,
      maxDuration: 1,
      minDuration: 0.5,
      edgeResistance: 0.75,
      overshootTolerance: 0,
      snap: value => Math.round(value / stepDistance) * stepDistance,
      onDrag: render,
      onThrowUpdate: render,
      onThrowComplete: () => {
        container.setAttribute('data-spatial-slider-drag-status', 'grab');
        render();
      },
      onPress: () => container.setAttribute('data-spatial-slider-drag-status', 'grabbing'),
      onDragStart: () => container.setAttribute('data-spatial-slider-drag-status', 'grabbing'),
      onRelease: () => container.setAttribute('data-spatial-slider-drag-status', 'grab')
    })[0];

    render();

    // Fix for Lazy Loading images on Safari
    container._spatialSliderImageObserver = new IntersectionObserver(([entry], observer) => {
      if (!entry.isIntersecting) return;
      container.querySelectorAll('[data-spatial-slider-item] img[loading="lazy"]').forEach(img => {
        img.loading = 'eager';
      });
      observer.disconnect();
    });
    container._spatialSliderImageObserver.observe(container);
  });

  initCollectiveCardBios();

  if (initSpatialCardsSlider._resize) window.removeEventListener('resize', initSpatialCardsSlider._resize);

  initSpatialCardsSlider._resize = debounceOnWidthChange(initSpatialCardsSlider, 200);
  window.addEventListener('resize', initSpatialCardsSlider._resize);
}

function debounceOnWidthChange(fn, ms) {
  let lastWidth = window.innerWidth;
  let timer;

  return function (...args) {
    clearTimeout(timer);

    timer = setTimeout(() => {
      if (window.innerWidth === lastWidth) return;
      lastWidth = window.innerWidth;
      fn.apply(this, args);
    }, ms);
  };
}

// ─── Collective card bios: read-more toggle ──────────────────────────────────
// .read-more-button and .bio-text-wrapper live under sibling parents inside
// .collective-card, so each card's button and wrapper are matched by looking
// them up independently within the same card rather than via direct nesting.
// Runs after cloning (called at the end of initSpatialCardsSlider) so slider
// clones — whose listeners aren't copied by cloneNode — get bound too; the
// per-card handler is stored on the card itself so re-running on resize
// doesn't double-bind the original (non-cloned) cards.
const bioEase = 'cubic-bezier(0.625, 0.05, 0, 1)';
const bioDuration = 0.25;
const bioLineStagger = 0.042;

function revertCollectiveCardSplits() {
  document.querySelectorAll('.collective-card').forEach(card => {
    if (card._bioSplit) {
      card._bioSplit.revert();
      card._bioSplit = null;
    }
  });
}

function initCollectiveCardBios() {
  document.querySelectorAll('.collective-card').forEach(card => {
    const button = card.querySelector('.read-more-button');
    const bioWrapper = card.querySelector('.bio-text-wrapper');
    const paragraph = bioWrapper ? bioWrapper.querySelector('p') : null;
    if (!button || !bioWrapper) return;

    if (card._bioToggleHandler) button.removeEventListener('click', card._bioToggleHandler);
    if (card._bioSplit) card._bioSplit.revert();

    gsap.set(bioWrapper, { height: 0, overflow: 'hidden' });
    button.setAttribute('aria-expanded', 'false');
    card.setAttribute('data-bio-status', 'closed');

    let isOpen = false;
    let lines = [];

    if (paragraph) {
      card._bioSplit = SplitText.create(paragraph, {
        type: 'lines',
        mask: 'lines',
        autoSplit: true,
        onSplit(instance) {
          lines = instance.lines;
          gsap.set(lines, { yPercent: 110, opacity: 0 });
        }
      });
    }

    const handler = () => {
      isOpen = !isOpen;

      gsap.killTweensOf([bioWrapper, ...lines]);

      const tl = gsap.timeline();

      tl.to(bioWrapper, {
        height: isOpen ? '100%' : 0,
        duration: bioDuration,
        ease: bioEase
      }, 0);

      if (lines.length) {
        tl.to(lines, {
          yPercent: isOpen ? 0 : 110,
          opacity: isOpen ? 1 : 0,
          stagger: bioLineStagger,
          duration: bioDuration,
          ease: bioEase
        }, isOpen ? bioDuration * 0.15 : 0);
      }

      button.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      card.setAttribute('data-bio-status', isOpen ? 'open' : 'closed');
    };

    card._bioToggleHandler = handler;
    button.addEventListener('click', handler);
  });
}

// Initialize Spatial Cards Slider (GSAP)
document.addEventListener('DOMContentLoaded', () => {
  initSpatialCardsSlider();
});

// ─── Representatives: Home-style cascading slider ────────────────────────────
// Opt-in per list: a `.collective-gsap-slider` carrying the `data-rep-slider` attribute
// (European Hubs). The CMS list stays the source of truth, and the Designer keeps showing
// it as the plain card grid. At runtime each card is read and rebuilt as the Home
// case-study slider (same `.cascading-slider*` classes, same slot maths as
// initCascadingSlider in home.js), with a panel under it showing the active person's
// role, name, country and bio. Unlike Home there is no autoplay, so a bio never changes
// under someone who is reading it: prev/next, clicking a neighbouring photo, swiping and
// the arrow keys (while the slider is on screen) move it. The CSS lives in the page's
// own custom code. Home's own slider attributes (data-cascading-*) are deliberately not
// used, so home.js could never pick this one up as well.
function initRepSliders() {
    document.querySelectorAll('[data-rep-slider]').forEach(root => {
        if (root.hasAttribute('data-rep-slider-ready')) return;

        const reps = Array.from(root.querySelectorAll('.w-dyn-item')).map(readRep).filter(rep => rep.name);
        if (reps.length < 2) return;

        const slider = buildRepSlider(reps);
        root.appendChild(slider.el);
        root.setAttribute('data-rep-slider-ready', '');
        setupRepCascade(slider, reps.length);
    });

    function readRep(item) {
        const text = selector => {
            const el = item.querySelector(selector);
            return el ? el.textContent.trim() : '';
        };
        const img = item.querySelector('img');

        return {
            name: text('.team-card__name'),
            role: text('.demo-card__h-2'),
            country: text('.team-card__country'),
            bio: text('.bio-text-content'),
            img: img ? { src: img.getAttribute('src'), srcset: img.getAttribute('srcset') } : null,
        };
    }
}

function buildRepSlider(reps) {
    // CMS text only ever goes in through textContent.
    const make = (tag, className, attrs, text) => {
        const el = document.createElement(tag);
        if (className) el.className = className;
        Object.entries(attrs || {}).forEach(([name, value]) => {
            if (value !== null && value !== undefined) el.setAttribute(name, value);
        });
        if (text) el.textContent = text;
        return el;
    };

    // Same arrow as the Home slider buttons; the prev button mirrors it via .invert-button.
    const arrow = () => {
        const ns = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(ns, 'svg');
        svg.setAttribute('width', '27');
        svg.setAttribute('height', '11');
        svg.setAttribute('viewBox', '0 0 27 11');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('aria-hidden', 'true');
        const path = document.createElementNS(ns, 'path');
        path.setAttribute('d', 'M3.53522e-06 6.39362C7.61822 6.39362 18.3595 6.62812 18.9698 6.84797C19.5802 7.06783 19.8853 8.4037 19.8853 9.23927L19.8853 10.8865C21.1529 9.16765 22.7724 7.63743 26.9817 5.48136C22.7724 2.85285 21.1529 1.71889 19.8853 -3.10192e-07L19.8853 1.64726C19.8853 2.48283 19.5802 3.81871 18.9698 4.03856C18.3595 4.25842 7.61822 4.49292 3.61831e-06 4.49292L3.53522e-06 6.39362Z');
        path.setAttribute('fill', 'currentColor');
        svg.appendChild(path);
        return svg;
    };

    const pad = value => String(value).padStart(2, '0');

    const el = make('div', 'rep-slider');
    const stage = make('div', 'cascading-slider rep-slider__stage', {
        role: 'region',
        'aria-roledescription': 'carousel',
        'aria-label': 'Event People representatives',
    });
    const collection = make('div', 'cascading-slider__collection');
    const viewport = make('div', 'cascading-slider__list');

    const slides = reps.map((rep, index) => {
        const slide = make('div', 'cascading-slider__item', {
            role: 'group',
            'aria-roledescription': 'slide',
            'aria-label': `${rep.name} (${index + 1} of ${reps.length})`,
            'data-status': index === 0 ? 'active' : 'inactive',
        });
        const inner = make('div', 'cascading-slider__item-inner');
        const bg = make('div', 'cascading-slider__item-bg');
        if (rep.img && rep.img.src) {
            bg.appendChild(make('img', 'cascading-slider__img', {
                src: rep.img.src,
                srcset: rep.img.srcset,
                sizes: rep.img.srcset ? '(max-width: 767px) 80vw, 60vw' : null,
                alt: '',
                loading: 'lazy',
                draggable: 'false',
            }));
        }
        const content = make('div', 'cascading-slider__item-content');
        content.appendChild(make('h3', 'cascading-slider__h', null, rep.name));
        inner.append(bg, content);
        slide.appendChild(inner);
        viewport.appendChild(slide);
        return slide;
    });

    collection.appendChild(viewport);
    stage.appendChild(collection);

    const footer = make('div', 'rep-slider__footer');
    const nav = make('nav', 'rep-slider__nav', { 'aria-label': 'Representatives' });
    const counter = make('div', 'rep-slider__count', { 'aria-hidden': 'true' });
    const current = make('span', 'rep-slider__count-current', null, pad(1));
    counter.append(current, make('span', 'rep-slider__count-sep', null, '/'), make('span', null, null, pad(reps.length)));
    const prev = make('button', 'cascading-slider__button invert-button', { type: 'button', 'aria-label': 'Previous representative' });
    prev.appendChild(arrow());
    const next = make('button', 'cascading-slider__button', { type: 'button', 'aria-label': 'Next representative' });
    next.appendChild(arrow());
    nav.append(counter, prev, next);

    // Every bio is rendered and stacked in one grid cell, so the panel is always as tall
    // as the longest bio and the page below never jumps when the slide changes.
    const details = make('div', 'rep-slider__details', { 'aria-live': 'polite' });
    const detailCards = reps.map((rep, index) => {
        const card = make('article', 'rep-slider__detail', { 'data-status': index === 0 ? 'active' : 'inactive' });
        if (rep.role) card.appendChild(make('p', 'rep-slider__role', null, rep.role));
        card.appendChild(make('h3', 'rep-slider__name', null, rep.name));
        if (rep.country) card.appendChild(make('p', 'rep-slider__country', null, rep.country));
        if (rep.bio) card.appendChild(make('p', 'rep-slider__bio', null, rep.bio));
        details.appendChild(card);
        return card;
    });

    footer.append(nav, details);
    el.append(stage, footer);

    return { el, stage, viewport, slides, prev, next, current, detailCards, pad };
}

function setupRepCascade(slider, count) {
    const { stage, viewport, prev, next, current, detailCards, pad } = slider;
    const slides = slider.slides.slice();
    const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 0.65;
    const ease = 'power3.inOut';

    // Slot widths as fractions of the slider width, per Webflow breakpoint — as on Home.
    const breakpoints = [
        { maxWidth: 479, activeWidth: 0.78, siblingWidth: 0.08 },
        { maxWidth: 767, activeWidth: 0.7, siblingWidth: 0.1 },
        { maxWidth: 991, activeWidth: 0.6, siblingWidth: 0.1 },
        { maxWidth: Infinity, activeWidth: 0.6, siblingWidth: 0.13 },
    ];

    // The layout needs at least 9 slides (five visible slots plus parked ones either side),
    // so a short list is padded with clones, as on Home. Slide i shows representative
    // i % count.
    const originals = slides.slice();
    while (slides.length < 9) {
        originals.forEach(original => {
            const clone = original.cloneNode(true);
            clone.setAttribute('data-clone', '');
            clone.setAttribute('aria-hidden', 'true');
            viewport.appendChild(clone);
            slides.push(clone);
        });
    }
    const total = slides.length;

    let activeIndex = 0;
    let isAnimating = false;
    let slideWidth = 0;
    const slotCenters = {};
    const slotWidths = {};

    function getSettings() {
        return breakpoints.find(breakpoint => window.innerWidth <= breakpoint.maxWidth);
    }

    function getOffset(slideIndex, fromIndex = activeIndex) {
        let distance = slideIndex - fromIndex;
        const half = total / 2;
        if (distance > half) distance -= total;
        if (distance < -half) distance += total;
        return distance;
    }

    function measure() {
        const settings = getSettings();
        const viewportWidth = viewport.offsetWidth;
        const gap = parseFloat(getComputedStyle(viewport).columnGap) || 0;

        const activeWidth = viewportWidth * settings.activeWidth;
        const siblingWidth = viewportWidth * settings.siblingWidth;
        const farWidth = Math.max(0, (viewportWidth - activeWidth - 2 * siblingWidth - 4 * gap) / 2);
        slideWidth = activeWidth;

        const visibleSlots = [
            { slot: -2, width: farWidth },
            { slot: -1, width: siblingWidth },
            { slot: 0, width: activeWidth },
            { slot: 1, width: siblingWidth },
            { slot: 2, width: farWidth },
        ];

        let x = 0;
        visibleSlots.forEach((def, i) => {
            slotCenters[def.slot] = x + def.width / 2;
            slotWidths[def.slot] = def.width;
            if (i < visibleSlots.length - 1) x += def.width + gap;
        });

        slotCenters[-3] = slotCenters[-2] - farWidth - gap;
        slotWidths[-3] = farWidth;
        slotCenters[3] = slotCenters[2] + farWidth + gap;
        slotWidths[3] = farWidth;

        slides.forEach(slide => {
            slide.style.width = slideWidth + 'px';
        });
    }

    function getSlideProps(offset) {
        const clamped = Math.max(-3, Math.min(3, offset));
        return {
            x: slotCenters[clamped] - slideWidth / 2,
            '--clip': Math.max(0, (slideWidth - slotWidths[clamped]) / 2),
            zIndex: 10 - Math.abs(clamped),
        };
    }

    function layout(animate, previousIndex) {
        slides.forEach((slide, index) => {
            const offset = getOffset(index);
            slide.setAttribute('data-status', offset === 0 ? 'active' : 'inactive');

            if (offset < -3 || offset > 3) {
                if (animate && previousIndex !== undefined) {
                    const previousOffset = getOffset(index, previousIndex);
                    if (previousOffset >= -2 && previousOffset <= 2) {
                        gsap.to(slide, { ...getSlideProps(previousOffset < 0 ? -3 : 3), duration, ease, overwrite: true });
                        return;
                    }
                }
                gsap.set(slide, getSlideProps(offset < 0 ? -3 : 3));
                return;
            }

            const props = getSlideProps(offset);
            if (animate) gsap.to(slide, { ...props, duration, ease, overwrite: true });
            else gsap.set(slide, props);
        });
    }

    function showActiveDetails() {
        const repIndex = activeIndex % count;
        current.textContent = pad(repIndex + 1);
        detailCards.forEach((card, index) => card.setAttribute('data-status', index === repIndex ? 'active' : 'inactive'));
    }

    function goTo(targetIndex) {
        const target = ((targetIndex % total) + total) % total;
        if (isAnimating || target === activeIndex) return;
        isAnimating = true;

        const previousIndex = activeIndex;
        const direction = getOffset(target, previousIndex) > 0 ? 1 : -1;

        slides.forEach((slide, index) => {
            const currentOffset = getOffset(index, previousIndex);
            const nextOffset = getOffset(index, target);

            // Slides coming into view start from the parked slot on the side they enter from.
            if ((currentOffset < -3 || currentOffset > 3) && nextOffset >= -2 && nextOffset <= 2) {
                gsap.set(slide, getSlideProps(direction > 0 ? 3 : -3));
            }
            // A parked slide switching sides jumps there instead of sliding across the row.
            if (Math.abs(currentOffset) >= 3 && Math.abs(nextOffset) === 3 && currentOffset * nextOffset < 0) {
                gsap.set(slide, getSlideProps(nextOffset > 0 ? 3 : -3));
            }
        });

        activeIndex = target;
        showActiveDetails();
        layout(true, previousIndex);
        gsap.delayedCall(duration + 0.05, () => {
            isAnimating = false;
        });
    }

    prev.addEventListener('click', () => goTo(activeIndex - 1));
    next.addEventListener('click', () => goTo(activeIndex + 1));

    // A swipe that ends over a neighbouring photo also fires that photo's click; ignore it.
    let swipedAt = 0;
    slides.forEach((slide, index) => {
        slide.addEventListener('click', () => {
            if (Date.now() - swipedAt < 400) return;
            if (index !== activeIndex) goTo(index);
        });
    });

    // Touch swipe. The list is touch-action: pan-y, so vertical page scrolling still works
    // (the browser cancels the pointer when it takes over a vertical pan).
    let startX = null;
    let startY = null;
    viewport.addEventListener('pointerdown', event => {
        if (event.pointerType === 'mouse') return;
        startX = event.clientX;
        startY = event.clientY;
    });
    viewport.addEventListener('pointerup', event => {
        if (startX === null) return;
        const dx = event.clientX - startX;
        const dy = event.clientY - startY;
        startX = null;
        if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;
        swipedAt = Date.now();
        goTo(activeIndex + (dx < 0 ? 1 : -1));
    });
    viewport.addEventListener('pointercancel', () => {
        startX = null;
    });

    // Arrow keys, only while the slider is actually on screen.
    let inView = false;
    new IntersectionObserver(entries => {
        inView = entries[0].isIntersecting;
    }, { threshold: 0.35 }).observe(stage);
    document.addEventListener('keydown', event => {
        if (!inView || event.defaultPrevented) return;
        const active = document.activeElement;
        if (active && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)) return;
        if (event.key === 'ArrowLeft') goTo(activeIndex - 1);
        if (event.key === 'ArrowRight') goTo(activeIndex + 1);
    });

    // Parked and clipped slides sit outside the viewport, where lazy images would only start
    // loading mid-transition; load them all once the slider is close.
    new IntersectionObserver((entries, observer) => {
        if (!entries.some(entry => entry.isIntersecting)) return;
        stage.querySelectorAll('img[loading="lazy"]').forEach(img => {
            img.loading = 'eager';
        });
        observer.disconnect();
    }, { rootMargin: '600px 0px' }).observe(stage);

    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            measure();
            layout(false);
        }, 100);
    });

    measure();
    layout(false);
    showActiveDetails();
}

// Initialize Representatives Slider
document.addEventListener('DOMContentLoaded', () => {
    initRepSliders();
});

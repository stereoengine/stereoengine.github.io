(function () {
  'use strict';

  var SPEED = 48;

  function initRolloutMarquee(marquee) {
    var track = marquee.querySelector('.craft-success-rollouts-track');
    var group = marquee.querySelector('.craft-success-rollouts-group');
    if (!track || !group) return;

    var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    var groupWidth = 0;
    var offset = 0;
    var dragging = false;
    var pointerId = null;
    var dragStartX = 0;
    var dragStartOffset = 0;
    var lastTime = performance.now();

    function wrap(value) {
      if (!groupWidth) return value;
      while (value >= 0) value -= groupWidth;
      while (value < -groupWidth) value += groupWidth;
      return value;
    }

    function render() {
      track.style.transform = 'translate3d(' + offset + 'px, 0, 0)';
    }

    function measure() {
      var previousWidth = groupWidth;
      groupWidth = group.getBoundingClientRect().width;
      if (!groupWidth) return;

      if (previousWidth) {
        offset = (offset / previousWidth) * groupWidth;
        offset = wrap(offset);
      } else {
        offset = -groupWidth;
      }
      render();
    }

    function tick(now) {
      var elapsed = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      if (!dragging && !reducedMotion.matches && groupWidth) {
        offset = wrap(offset + SPEED * elapsed);
        render();
      }
      window.requestAnimationFrame(tick);
    }

    function finishDrag(event) {
      if (!dragging || (event && event.pointerId !== pointerId)) return;
      dragging = false;
      marquee.classList.remove('is-dragging');
      if (event && marquee.hasPointerCapture(event.pointerId)) {
        marquee.releasePointerCapture(event.pointerId);
      }
      pointerId = null;
      lastTime = performance.now();
    }

    marquee.querySelectorAll('video').forEach(function (video) {
      video.draggable = false;
    });

    marquee.addEventListener('dragstart', function (event) {
      event.preventDefault();
    });

    marquee.addEventListener('pointerdown', function (event) {
      if (event.button !== 0 || !groupWidth) return;
      dragging = true;
      pointerId = event.pointerId;
      dragStartX = event.clientX;
      dragStartOffset = offset;
      marquee.classList.add('is-dragging');
      marquee.setPointerCapture(event.pointerId);
      event.preventDefault();
    });

    marquee.addEventListener('pointermove', function (event) {
      if (!dragging || event.pointerId !== pointerId) return;
      offset = wrap(dragStartOffset + event.clientX - dragStartX);
      render();
      event.preventDefault();
    });

    marquee.addEventListener('pointerup', finishDrag);
    marquee.addEventListener('pointercancel', finishDrag);

    marquee.addEventListener('keydown', function (event) {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      offset = wrap(offset + (event.key === 'ArrowRight' ? 56 : -56));
      render();
      event.preventDefault();
    });

    document.addEventListener('visibilitychange', function () {
      lastTime = performance.now();
    });

    marquee.classList.add('is-drag-ready');
    measure();

    if ('ResizeObserver' in window) {
      new ResizeObserver(measure).observe(group);
    } else {
      window.addEventListener('resize', measure);
    }

    window.requestAnimationFrame(tick);
  }

  function init() {
    document.querySelectorAll('.craft-success-rollouts-marquee').forEach(initRolloutMarquee);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();

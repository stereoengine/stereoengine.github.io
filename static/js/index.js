window.HELP_IMPROVE_VIDEOJS = false;

var INTERP_BASE = "./static/interpolation/stacked";
var NUM_INTERP_FRAMES = 240;

var interp_images = [];
function preloadInterpolationImages() {
  for (var i = 0; i < NUM_INTERP_FRAMES; i++) {
    var path = INTERP_BASE + '/' + String(i).padStart(6, '0') + '.jpg';
    interp_images[i] = new Image();
    interp_images[i].src = path;
  }
}

function setInterpolationImage(i) {
  var image = interp_images[i];
  image.ondragstart = function() { return false; };
  image.oncontextmenu = function() { return false; };
  $('#interpolation-image-wrapper').empty().append(image);
}


$(document).ready(function() {
    $(".navbar-burger").click(function() {
      $(".navbar-burger").toggleClass("is-active");
      $(".navbar-menu").toggleClass("is-active");
    });

    var options = {
      slidesToScroll: 1,
      slidesToShow: 3,
      loop: true,
      infinite: true,
      autoplay: true,
      autoplaySpeed: 12000,
      pauseOnHover: true,
      pauseOnFocus: true,
      resetProgress: false,
      navigation: true,
    }

    var carousels = bulmaCarousel.attach('.carousel', options);

    for(var i = 0; i < carousels.length; i++) {
      carousels[i].on('before:show', state => {
        console.log(state);
      });

      carousels[i].on('after:show', function() {
        setTimeout(function() {
          if (!carousels[i].isPaused()) {
            carousels[i].start();
          }
        }, 100);
      });
    }

    var element = document.querySelector('#my-element');
    if (element && element.bulmaCarousel) {
      element.bulmaCarousel.on('before-show', function(state) {
        console.log(state);
      });
    }

    // Only request interpolation frames on pages that actually include this widget.
    if (document.getElementById('interpolation-slider') && document.getElementById('interpolation-image-wrapper')) {
      preloadInterpolationImages();
      $('#interpolation-slider').on('input', function() {
        setInterpolationImage(this.value);
      });
      setInterpolationImage(0);
      $('#interpolation-slider').prop('max', NUM_INTERP_FRAMES - 1);
    }

    bulmaSlider.attach();
});

document.addEventListener('DOMContentLoaded', function() {
  const taskSelector = document.getElementById('task-selector');
  const taskImages = document.querySelectorAll('.task-image');

  taskSelector.addEventListener('change', function() {
    taskImages.forEach(image => {
      image.style.display = 'none';
    });

    const selectedImage = document.getElementById(taskSelector.value);
    if (selectedImage) {
      selectedImage.style.display = 'block';
    }
  });
});

document.addEventListener('DOMContentLoaded', function() {
  const selector = document.getElementById('trajectory-selector');
  const iframe = document.getElementById('trajectory-iframe');

  if (selector && iframe) {
    const taskPaths = {
      'coordinated_lift_ball': './static/html/coordinated_lift_ball.html',
      'coordinated_lift_tray': './static/html/coordinated_lift_tray.html',
      'coordinated_push_box': './static/html/coordinated_push_block.html',
    };

    selector.addEventListener('change', function() {
      const selectedValue = selector.value;
      const path = taskPaths[selectedValue];

      if (path) {
        iframe.src = path + '?t=' + new Date().getTime(); // Avoid cache
      }
    });
  }
});

document.addEventListener('DOMContentLoaded', function() {
  const baselineSelector = document.getElementById('baseline-selector');
  if (baselineSelector) {
    baselineSelector.addEventListener('change', function() {
      document.querySelectorAll('.baseline-comparison').forEach(function(el) {
        el.style.display = 'none';
      });

      const selectedId = this.value;
      document.getElementById(selectedId).style.display = 'block';
    });
  }
});

document.addEventListener('DOMContentLoaded', function() {
  const lightingSelector = document.getElementById('lighting-selector');
  if (lightingSelector) {
    lightingSelector.addEventListener('change', function() {
      document.querySelectorAll('.lighting-comparison').forEach(function(el) {
        el.style.display = 'none';
      });

      const selectedId = 'lighting_' + this.value;
      document.getElementById(selectedId).style.display = 'block';
    });
  }
});

document.addEventListener('DOMContentLoaded', function() {
  const objectColorSelector = document.getElementById('object-color-selector');
  if (objectColorSelector) {
    objectColorSelector.addEventListener('change', function() {
      document.querySelectorAll('.object-color-comparison').forEach(function(el) {
        el.style.display = 'none';
      });

      const selectedId = 'object-color_' + this.value;
      document.getElementById(selectedId).style.display = 'block';
    });
  }
});

document.addEventListener('DOMContentLoaded', function() {
  const backgroundSelector = document.getElementById('background-selector');
  if (backgroundSelector) {
    backgroundSelector.addEventListener('change', function() {
      document.querySelectorAll('.background-comparison').forEach(function(el) {
        el.style.display = 'none';
      });

      const selectedId = 'background_' + this.value;
      document.getElementById(selectedId).style.display = 'block';
    });
  }
});

document.addEventListener('DOMContentLoaded', function() {
  const crossembodimentSelector = document.getElementById('crossembodiment-selector');
  if (crossembodimentSelector) {
    crossembodimentSelector.addEventListener('change', function() {
      document.querySelectorAll('.crossembodiment-comparison').forEach(function(el) {
        el.style.display = 'none';
      });

      const selectedId = 'crossembodiment_' + this.value;
      document.getElementById(selectedId).style.display = 'block';
    });
  }
});

document.addEventListener('DOMContentLoaded', function() {
  const wristSelector = document.getElementById('wrist-selector');
  if (wristSelector) {
    wristSelector.addEventListener('change', function() {
      document.querySelectorAll('.wrist-comparison').forEach(function(el) {
        el.style.display = 'none';
      });

      const selectedId = 'wrist_' + this.value;
      document.getElementById(selectedId).style.display = 'block';
    });
  }
});

document.addEventListener('DOMContentLoaded', function() {
  const failureSelector = document.getElementById('failure-selector');
  if (failureSelector) {
    failureSelector.addEventListener('change', function() {
      document.querySelectorAll('.failure-class').forEach(function(el) {
        el.style.display = 'none';
      });

      const selectedId = this.value;
      document.getElementById(selectedId).style.display = 'block';
    });
  }
});

// Method carousel (below hero): auto-advance, dots, play/pause, infinite loop
document.addEventListener('DOMContentLoaded', function() {
  const root = document.getElementById('craft-method-carousel');
  if (!root) return;

  const topRow = root.querySelector('#craft-carousel-row-top');
  const bottomRow = root.querySelector('#craft-carousel-row-bottom');
  const dots = Array.from(root.querySelectorAll('.craft-carousel-dot'));
  const playPauseBtn = root.querySelector('.craft-carousel-playpause');
  const playPauseText = root.querySelector('.craft-carousel-playpause-text');
  const playPauseIcon = root.querySelector('.craft-carousel-playpause i');

  const intervalMs = Number(root.dataset.intervalMs || 5000);
  if (!topRow || !bottomRow) return;

  let timer = null;
  let isPlaying = true;
  let activePos = 0;

  const topCards = Array.from(topRow.querySelectorAll('.craft-carousel-card'));
  const bottomCards = Array.from(bottomRow.querySelectorAll('.craft-carousel-card'));
  const topCount = topCards.length;
  const bottomCount = bottomCards.length;
  const positions = Math.max(1, Math.min(4, Math.max(topCount, bottomCount)));

  function safePlay(v) {
    const p = v.play();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  }

  function stopTimer() {
    if (timer) {
      window.clearInterval(timer);
      timer = null;
    }
  }

  function setPlayPauseUI() {
    if (!playPauseBtn) return;
    const playing = isPlaying;
    playPauseBtn.setAttribute('aria-label', playing ? 'Pause carousel' : 'Play carousel');
    if (playPauseText) playPauseText.textContent = playing ? 'Pause' : 'Play';
    if (playPauseIcon) playPauseIcon.className = playing ? 'fas fa-pause' : 'fas fa-play';
  }

  function scrollRowToIndex(rowEl, cards, idx) {
    const card = cards[idx % cards.length];
    if (!card) return;
    rowEl.scrollTo({ left: card.offsetLeft, behavior: 'smooth' });
  }

  function updateVideosForViewport(rowEl) {
    // Only play videos that are at least partially visible in this row.
    const rowRect = rowEl.getBoundingClientRect();
    rowEl.querySelectorAll('video').forEach((v) => {
      const rect = v.getBoundingClientRect();
      const isVisible = rect.right > rowRect.left && rect.left < rowRect.right;
      if (isVisible) safePlay(v);
      else if (!v.paused) v.pause();
    });
  }

  function render() {
    const pos = ((activePos % positions) + positions) % positions;
    dots.forEach((dot, i) => {
      const isActive = i === pos;
      dot.classList.toggle('is-active', isActive);
      dot.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    // Move each row by one card position (wrapping).
    const topIdx = pos % Math.max(1, topCount);
    const bottomIdx = pos % Math.max(1, bottomCount);
    scrollRowToIndex(topRow, topCards, topIdx);
    scrollRowToIndex(bottomRow, bottomCards, bottomIdx);
    window.requestAnimationFrame(() => {
      updateVideosForViewport(topRow);
      updateVideosForViewport(bottomRow);
    });
  }

  function goTo(pos) {
    activePos = ((pos % positions) + positions) % positions;
    render();
  }

  function next() {
    goTo(activePos + 1);
  }

  function start() {
    isPlaying = true;
    setPlayPauseUI();
    stopTimer();
    timer = window.setInterval(next, intervalMs);
  }

  function pause() {
    isPlaying = false;
    setPlayPauseUI();
    stopTimer();
  }

  // Events
  if (playPauseBtn) {
    playPauseBtn.addEventListener('click', function() {
      if (isPlaying) pause();
      else start();
    });
  }

  dots.forEach((dot, i) => {
    dot.addEventListener('click', function() {
      goTo(i);
      if (isPlaying) start(); // reset interval so next shift is predictable
    });
  });

  // Keyboard controls when focused
  root.addEventListener('keydown', function(e) {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      next();
      if (isPlaying) start();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      goTo(activePos - 1);
      if (isPlaying) start();
    } else if (e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault();
      if (isPlaying) pause();
      else start();
    }
  });

  // Pause timer when tab is hidden (but keep play/pause state)
  document.addEventListener('visibilitychange', function() {
    if (document.hidden) stopTimer();
    else if (isPlaying) start();
  });

  // Init
  setPlayPauseUI();
  render();
  start();
});

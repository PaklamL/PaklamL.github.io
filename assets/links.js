(() => {
  if (typeof Element.prototype.animate !== "function") return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const letterPattern = /\p{L}/u;

  function prepareLetters(link) {
    const walker = document.createTreeWalker(link, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const hidden = node.parentElement.closest("svg, script, style, [hidden], [aria-hidden='true']");
        return !hidden && letterPattern.test(node.data)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      }
    });
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);

    const letters = [];
    for (const node of textNodes) {
      const label = document.createElement("span");
      label.className = "tremble-label";
      label.textContent = node.data;

      const visual = document.createElement("span");
      visual.setAttribute("aria-hidden", "true");
      for (const part of node.data.split(/(\s+)/)) {
        if (!part.trim()) {
          visual.append(part);
          continue;
        }

        const word = document.createElement("span");
        word.className = "tremble-word";
        for (const character of part) {
          if (!letterPattern.test(character)) {
            word.append(character);
            continue;
          }

          const letter = document.createElement("span");
          letter.className = "tremble-letter";
          letter.textContent = character;
          word.append(letter);
          letters.push(letter);
        }
        visual.append(word);
      }
      node.replaceWith(label, visual);
    }
    return letters;
  }

  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  function randomOffset(amplitude = 1) {
    const direction = randomBetween(0, Math.PI * 2);
    const distance = randomBetween(0.018, 0.05) * amplitude;
    return { x: Math.cos(direction) * distance, y: Math.sin(direction) * distance };
  }

  function translate(x, y) {
    return `translate(${x.toFixed(4)}em, ${y.toFixed(4)}em)`;
  }

  function nextHoverPoint() {
    return { ...randomOffset(2), duration: randomBetween(42, 138) / 3 };
  }

  function animateLink(link) {
    const idle = link.hasAttribute("data-idle-tremble");
    const animations = new Map();
    let letters;
    let hovered = false;
    let mode = "still";
    let hoverFrame = null;

    function scheduleIdleTremble(letter, delay) {
      const shakes = Math.floor(randomBetween(3, 6));
      const rest = { transform: "translate(0, 0)" };
      const keyframes = [rest];

      for (let shake = 0; shake < shakes; shake++) {
        const { x, y } = randomOffset();
        keyframes.push({ transform: translate(x, y) });
      }

      keyframes.push(rest);
      const animation = letter.animate(keyframes, { delay, duration: randomBetween(180, 460) });
      animations.set(letter, animation);

      animation.onfinish = () => {
        if (animations.get(letter) === animation) {
          scheduleIdleTremble(letter, randomBetween(450, 2550));
        }
      };
    }

    function startHoverTremble() {
      const start = performance.now();
      const points = letters.map(letter => ({
        letter,
        start,
        from: { x: 0, y: 0 },
        to: nextHoverPoint()
      }));

      function moveLetters(now) {
        for (const point of points) {
          point.start = Math.max(point.start, now - 100);
          while (now - point.start >= point.to.duration) {
            point.start += point.to.duration;
            point.from = point.to;
            point.to = nextHoverPoint();
          }

          const progress = Math.max(0, (now - point.start) / point.to.duration);
          const x = point.from.x + (point.to.x - point.from.x) * progress;
          const y = point.from.y + (point.to.y - point.from.y) * progress;
          point.letter.style.transform = translate(x, y);
        }
        hoverFrame = requestAnimationFrame(moveLetters);
      }

      hoverFrame = requestAnimationFrame(moveLetters);
    }

    function syncMotion() {
      const paused = reducedMotion.matches || document.hidden || link.hasAttribute("data-tremble-hidden");
      const nextMode = paused ? "still" : hovered ? "hover" : idle ? "idle" : "still";
      if (mode === nextMode) return;

      mode = nextMode;
      for (const animation of animations.values()) animation.cancel();
      animations.clear();
      if (hoverFrame !== null) {
        cancelAnimationFrame(hoverFrame);
        hoverFrame = null;
        for (const letter of letters) letter.style.removeProperty("transform");
      }
      if (mode === "still") return;

      letters ??= prepareLetters(link);
      if (!letters.length) return;
      if (mode === "hover") {
        startHoverTremble();
        return;
      }
      for (const letter of letters) {
        scheduleIdleTremble(letter, randomBetween(100, 1900));
      }
    }

    function updateHover(event) {
      if (event.pointerType === "touch") return;
      hovered = event.type === "pointerenter";
      syncMotion();
    }

    link.addEventListener("pointerenter", updateHover);
    link.addEventListener("pointerleave", updateHover);
    if (idle) {
      new MutationObserver(syncMotion).observe(link, { attributeFilter: ["data-tremble-hidden"] });
    }
    syncMotion();
    return syncMotion;
  }

  const updateLinks = Array.from(document.querySelectorAll("a[href]"), animateLink);
  const syncAll = () => updateLinks.forEach(updateLink => updateLink());
  reducedMotion.addEventListener("change", syncAll);
  document.addEventListener("visibilitychange", syncAll);
})();

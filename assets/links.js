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

  function animateLink(link) {
    const idle = link.hasAttribute("data-idle-tremble");
    const animations = new Map();
    let letters;
    let hovered = false;
    let mode = "still";

    function scheduleTremble(letter, delay) {
      const continuous = mode === "hover";
      const amplitude = continuous ? 2 : 1;
      const shakes = Math.floor(randomBetween(3, 6));
      const keyframes = [];

      for (let shake = 0; shake < shakes; shake++) {
        const direction = randomBetween(0, Math.PI * 2);
        const distance = randomBetween(0.018, 0.05) * amplitude;
        const x = (Math.cos(direction) * distance).toFixed(4);
        const y = (Math.sin(direction) * distance).toFixed(4);
        keyframes.push({ transform: `translate(${x}em, ${y}em)` });
      }

      if (!continuous) keyframes.unshift({ transform: "translate(0, 0)" });
      keyframes.push(keyframes[0]);
      const animation = letter.animate(keyframes, {
        delay,
        duration: randomBetween(180, 460),
        iterations: continuous ? Infinity : 1
      });
      animation.playbackRate = continuous ? 3 : 1;
      animations.set(letter, animation);

      if (continuous) return;
      animation.onfinish = () => {
        if (animations.get(letter) === animation) {
          scheduleTremble(letter, randomBetween(450, 2550));
        }
      };
    }

    function syncMotion() {
      const paused = reducedMotion.matches || document.hidden || link.hasAttribute("data-tremble-hidden");
      const nextMode = paused ? "still" : hovered ? "hover" : idle ? "idle" : "still";
      if (mode === nextMode) return;

      mode = nextMode;
      for (const animation of animations.values()) animation.cancel();
      animations.clear();
      if (mode === "still") return;

      letters ??= prepareLetters(link);
      for (const letter of letters) {
        scheduleTremble(letter, mode === "hover" ? 0 : randomBetween(100, 1900));
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

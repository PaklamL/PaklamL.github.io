# PaklamL.github.io

The homepage is `index.html`. Use `notes/ink/index.html` as a starting point for new subpages under `notes/`.

Pages share `assets/site.css` for styling, `assets/ink.js` for the background, and `assets/links.js` for the link animation. Include all three with paths relative to the page and load both scripts with `defer`. The ink script creates its own canvas, and ordinary text links tremble on hover automatically.

Add `data-idle-tremble` to a link if it should also tremble in short bursts while the pointer is away, like the poem on the homepage.

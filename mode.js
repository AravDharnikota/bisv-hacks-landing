// Keep the address bar clean. An old link or bookmark to /schedule.html still loads the page,
// so rewrite the address in place: /schedule.html -> /schedule, /index.html -> /. No reload.
(function () {
  var clean = location.pathname.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
  if (clean !== location.pathname) history.replaceState(null, '', clean + location.search + location.hash);
})();

// Humans | Agents switch. Agents mode shows the exact Markdown an agent reads for this page
// (the file in <link rel="alternate" type="text/markdown">, or llms.txt if the page has none).
// The choice is remembered across pages. Without JavaScript the switch never appears.
(function () {
  var KEY = 'bisv-view';
  var main = document.querySelector('main');
  if (!main) return;

  var alt = document.querySelector('link[rel="alternate"][type="text/markdown"]');
  var src = alt ? alt.getAttribute('href') : '/llms.txt';
  var file = src.replace(/^.*\//, '');

  var view = null;   // the agent view section, built on first use
  var text = null;   // cached Markdown

  function remember(mode) { try { localStorage.setItem(KEY, mode); } catch (e) {} }
  function recall() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }

  function build() {
    view = document.createElement('section');
    view.className = 'agent-view';
    view.innerHTML =
      '<p class="agent-cmd"><span aria-hidden="true">&gt; </span>GET /' + file + '</p>' +
      '<pre tabindex="0" aria-label="Markdown for agents"></pre>' +
      '<p class="agent-note">This is what an AI agent reads on this page. ' +
      '<a href="' + src + '">Open the raw file</a> or read the <a href="/llms.txt">guide for agents</a>.</p>';
    main.appendChild(view);
  }

  function show(mode) {
    var agents = mode === 'agents';
    document.documentElement.classList.toggle('view-agents', agents);
    buttons.forEach(function (b) { b.setAttribute('aria-pressed', String(b.value === mode)); });
    Array.prototype.forEach.call(main.children, function (el) {
      if (el !== view) el.hidden = agents;
    });
    if (!agents) { if (view) view.hidden = true; return; }
    if (!view) build();
    view.hidden = false;
    var pre = view.querySelector('pre');
    if (text !== null) { pre.textContent = text; return; }
    pre.textContent = 'Loading...';
    fetch(src).then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.text();
    }).then(function (t) {
      text = t;
      pre.textContent = t;
    }).catch(function () {
      pre.textContent = 'Could not load ' + file + '. Open it directly: ' + src;
    });
  }

  var bar = document.createElement('div');
  bar.className = 'viewswitch';
  bar.setAttribute('role', 'group');
  bar.setAttribute('aria-label', 'View this site as');
  bar.innerHTML = '<button type="button" value="humans">Humans</button><button type="button" value="agents">Agents</button>';
  var buttons = Array.prototype.slice.call(bar.querySelectorAll('button'));
  buttons.forEach(function (b) {
    b.addEventListener('click', function () { remember(b.value); show(b.value); });
  });
  document.body.appendChild(bar);
  document.documentElement.classList.add('has-switch');

  show(recall() === 'agents' ? 'agents' : 'humans');
})();

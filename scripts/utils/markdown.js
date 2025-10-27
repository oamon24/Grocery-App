/*
  Markdown utilities — Phase 5
  Safe Markdown → HTML with strict sanitization.
  - Supports: **bold**, *italic*, `code`, [text](url), paragraphs, <br>, task boxes [ ] / [x]
  - Exposes: window.renderMarkdownSafe(text)
*/
(function(){
  function escapeHtml(str){
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // Very small Markdown subset → HTML on an escaped base
  function mdToHtml(md){
    if (!md) return "";
    let s = escapeHtml(md);

    // `code`
    s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
    // **bold**
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    // *italic* (non-greedy, avoids **)
    s = s.replace(/(^|[^\*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
    // [text](url) allow only http(s)
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function(_, text, href){
      try {
        const u = new URL(href, location.href);
        const safe = (u.protocol === "http:" || u.protocol === "https:");
        return safe
          ? '<a href="' + escapeHtml(u.href) + '" rel="noopener noreferrer" target="_blank">' + escapeHtml(text) + '</a>'
          : escapeHtml("[" + text + "](" + href + ")");
      } catch {
        return escapeHtml("[" + text + "](" + href + ")");
      }
    });

    // Paragraphs: split by blank lines; single newlines → <br>
    const parts = s.split(/\n{2,}/).map(p => p.replace(/\n/g, "<br>"));
    return parts.map(p => "<p>" + p + "</p>").join("");
  }

  // Strict sanitizer for our limited HTML
  function sanitizeHtml(html){
    const tpl = document.createElement("template");
    tpl.innerHTML = html;

    const ALLOWED_TAGS = new Set(["P","BR","STRONG","EM","CODE","A"]);
    const ALLOWED_ATTR = { "A": new Set(["href","rel","target"]) };

    function isSafeUrl(url){
      try {
        const u = new URL(url, location.href);
        return (u.protocol === "http:" || u.protocol === "https:");
      } catch { return false; }
    }

    (function walk(node){
      if (node.nodeType === 1) {
        const tag = node.tagName;
        if (!ALLOWED_TAGS.has(tag)) {
          const txt = document.createTextNode(node.textContent || "");
          node.replaceWith(txt);
          return;
        }
        for (const attr of Array.from(node.attributes)) {
          const name = attr.name.toLowerCase();
          const allowed = ALLOWED_ATTR[tag] && ALLOWED_ATTR[tag].has(attr.name);
          if (name.startsWith("on")) { node.removeAttribute(attr.name); continue; }
          if (!allowed) { node.removeAttribute(attr.name); continue; }
          if (tag === "A" && name === "href" && !isSafeUrl(attr.value)) {
            node.removeAttribute(attr.name);
          }
        }
      }
      for (const child of Array.from(node.childNodes)) walk(child);
    })(tpl.content);

    return tpl.innerHTML;
  }

  function renderMarkdownSafe(mdText){
    const raw = mdToHtml(mdText || "");
    const safe = sanitizeHtml(raw);
    // Convert [ ] / [x] to checkboxes post-sanitization
    return safe
      .replace(/\[ \]/g, '<input type="checkbox" class="md-task" />')
      .replace(/\[x\]/gi, '<input type="checkbox" class="md-task" checked />');
  }

  window.renderMarkdownSafe = renderMarkdownSafe;
})();

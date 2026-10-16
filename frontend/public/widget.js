/* Mesa Intelligence chat widget loader.
 *
 * Add to any website:
 *   <script src="https://mesaintelligence.ai/widget.js" data-tenant="your-tenant-id" defer></script>
 * Optional attributes:
 *   data-color="#D96B43"   launcher color
 *   data-label="Chat with us"
 *   data-position="right" | "left"
 *   data-open="true"       open on load (desktop only)
 */
(function () {
  if (window.__mesaWidget) return;
  var script = document.currentScript || (function () { var s = document.getElementsByTagName("script"); return s[s.length - 1]; })();
  var tenant = script.getAttribute("data-tenant");
  if (!tenant) { console.warn("[Mesa] data-tenant is required"); return; }
  var origin = (function () { try { return new URL(script.src).origin; } catch (e) { return "https://mesaintelligence.ai"; } })();
  var color = script.getAttribute("data-color") || "#D96B43";
  var label = script.getAttribute("data-label") || "Chat with us";
  var side = script.getAttribute("data-position") === "left" ? "left" : "right";
  var autoOpen = script.getAttribute("data-open") === "true";

  var css = document.createElement("style");
  css.textContent =
    "#mesa-launcher{position:fixed;bottom:20px;" + side + ":20px;z-index:2147483000;display:flex;align-items:center;gap:10px;padding:12px 18px;border:0;border-radius:999px;background:" + color + ";color:#0B0C0E;font:600 14px/1 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.35);cursor:pointer;transition:transform .2s ease}" +
    "#mesa-launcher:hover{transform:translateY(-2px)}" +
    "#mesa-frame-wrap{position:fixed;bottom:84px;" + side + ":20px;z-index:2147483000;width:380px;max-width:calc(100vw - 40px);height:600px;max-height:calc(100vh - 110px);border-radius:14px;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.1);display:none;background:#14161A}" +
    "#mesa-frame-wrap.open{display:block}" +
    "#mesa-frame{width:100%;height:100%;border:0;display:block}" +
    "@media (max-width:480px){#mesa-frame-wrap{bottom:0;" + side + ":0;width:100vw;max-width:100vw;height:100vh;max-height:100vh;border-radius:0}}";
  document.head.appendChild(css);

  var wrap = document.createElement("div");
  wrap.id = "mesa-frame-wrap";
  var frame = document.createElement("iframe");
  frame.id = "mesa-frame";
  frame.title = "Chat assistant";
  frame.setAttribute("allow", "clipboard-write");
  frame.src = origin + "/embed?tenant=" + encodeURIComponent(tenant);
  wrap.appendChild(frame);

  var btn = document.createElement("button");
  btn.id = "mesa-launcher";
  btn.type = "button";
  btn.setAttribute("aria-expanded", "false");
  btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><span>' + label.replace(/[<>&]/g, "") + "</span>";

  var open = false;
  function setOpen(v) {
    open = v;
    wrap.classList.toggle("open", open);
    btn.setAttribute("aria-expanded", String(open));
    btn.querySelector("span").textContent = open ? "Close" : label;
  }
  btn.addEventListener("click", function () { setOpen(!open); });
  window.addEventListener("message", function (e) {
    if (e.origin !== origin || !e.data) return;
    if (e.data.type === "mesa:close") setOpen(false);
  });

  document.body.appendChild(wrap);
  document.body.appendChild(btn);
  if (autoOpen && window.innerWidth > 480) setOpen(true);

  window.__mesaWidget = { open: function () { setOpen(true); }, close: function () { setOpen(false); }, toggle: function () { setOpen(!open); } };
})();

/*
 * Frisør Booking på salonens egen hjemmeside.
 *
 * Indlejret i siden:
 *   <div data-frisor-booking="demo"></div>
 *   <script src="https://.../embed.js" async></script>
 *
 * Knap der åbner bookingen i et vindue oven på siden. Linket virker også uden scriptet:
 *   <a href="https://.../book/demo" data-frisor-booking-popup>Book tid</a>
 */
(function () {
  if (window.__frisorBooking) {
    window.__frisorBooking.scan();
    return;
  }

  // Nogle hjemmesidebyggere indsætter scriptet på en måde, hvor currentScript er tom. Så finder vi det på navnet.
  var script = document.currentScript || document.querySelector('script[src*="/embed.js"]');
  var origin = script ? new URL(script.src, location.href).origin : location.origin;
  var MSG = "frisor-booking";
  var frames = [];

  function bookingUrl(slug) {
    return origin + "/book/" + encodeURIComponent(slug);
  }

  function makeFrame(src, title) {
    var f = document.createElement("iframe");
    f.src = src;
    f.title = title || "Book tid";
    f.setAttribute("allow", "payment; clipboard-write");
    f.style.cssText = "display:block;width:100%;border:0;background:transparent;color-scheme:normal;";
    return f;
  }

  function inline(el) {
    if (el.__frisorBooking) return;
    el.__frisorBooking = true;
    var f = makeFrame(bookingUrl(el.getAttribute("data-frisor-booking")));
    // Højden passes løbende til indholdet. Indtil første besked giver vi plads nok til, at siden ikke hopper meget.
    f.style.height = (el.getAttribute("data-hoejde") || "720") + "px";
    f.setAttribute("scrolling", "no");
    el.appendChild(f);
    frames.push({ frame: f, inline: true });
  }

  var overlay, overlayFrame, opener, pageOverflow;

  function closePopup() {
    if (!overlay) return;
    overlay.remove();
    overlay = overlayFrame = null;
    document.documentElement.style.overflow = pageOverflow;
    frames = frames.filter(function (x) { return x.inline; });
    // Fokus tilbage på knappen, så tastatur- og skærmlæserbrugere står hvor de var.
    if (opener && opener.focus) opener.focus();
    opener = null;
  }

  function openPopup(url) {
    closePopup();
    opener = document.activeElement;
    pageOverflow = document.documentElement.style.overflow;
    overlay = document.createElement("div");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Book tid");
    overlay.style.cssText =
      "position:fixed;inset:0;z-index:2147483646;background:rgba(20,20,20,.55);display:flex;align-items:center;justify-content:center;padding:0;";
    var box = document.createElement("div");
    var wide = window.matchMedia("(min-width: 640px)").matches;
    box.style.cssText =
      "position:relative;background:#fff;width:100%;height:100%;overflow:hidden;" +
      (wide ? "max-width:600px;height:min(860px, calc(100% - 48px));border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.3);" : "");
    var close = document.createElement("button");
    close.type = "button";
    close.setAttribute("aria-label", "Luk");
    close.textContent = "×";
    close.style.cssText =
      "position:absolute;top:8px;right:8px;z-index:1;width:40px;height:40px;border-radius:50%;border:0;background:rgba(255,255,255,.92);" +
      "box-shadow:0 1px 4px rgba(0,0,0,.25);font:400 26px/40px system-ui,sans-serif;color:#222;cursor:pointer;padding:0;";
    close.onclick = closePopup;
    overlayFrame = makeFrame(url);
    overlayFrame.style.height = "100%";
    box.appendChild(close);
    box.appendChild(overlayFrame);
    overlay.appendChild(box);
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) closePopup();
    });
    document.body.appendChild(overlay);
    document.documentElement.style.overflow = "hidden";
    frames.push({ frame: overlayFrame, inline: false });
    close.focus();
  }

  function popupLink(el) {
    if (el.__frisorBooking) return;
    el.__frisorBooking = true;
    el.addEventListener("click", function (e) {
      var slug = el.getAttribute("data-frisor-booking-popup");
      var url = slug ? bookingUrl(slug) : el.href;
      if (!url) return;
      // Ctrl-klik og lignende åbner stadig linket i en ny fane.
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
      e.preventDefault();
      openPopup(url);
    });
  }

  function scan() {
    document.querySelectorAll("[data-frisor-booking]").forEach(inline);
    document.querySelectorAll("[data-frisor-booking-popup]").forEach(popupLink);
  }

  window.addEventListener("message", function (e) {
    if (e.origin !== origin || !e.data || e.data.type !== MSG) return;
    var hit = frames.filter(function (x) { return x.frame.contentWindow === e.source; })[0];
    if (!hit) return;
    if (e.data.escape && !hit.inline) return closePopup();
    if (!hit.inline) return;
    if (e.data.height) hit.frame.style.height = Math.ceil(e.data.height) + "px";
    var top = hit.frame.getBoundingClientRect().top;
    // Et link til et sted i bookingen, fx en kategori. Rammen kan ikke selv rulle, så det gør hjemmesiden.
    if (typeof e.data.anchor === "number") window.scrollBy({ top: top + e.data.anchor - 16, behavior: "smooth" });
    // Kunden er gået et trin videre. Er toppen af bookingen rullet ud af syne, ruller vi tilbage til den.
    else if (e.data.navigated && top < 0) window.scrollBy({ top: top - 16, behavior: "smooth" });
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closePopup();
  });

  window.__frisorBooking = { scan: scan, open: function (slug) { openPopup(bookingUrl(slug)); }, close: closePopup };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", scan);
  else scan();
})();

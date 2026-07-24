(() => {
  const state = { center: null, button: null, panel: null, list: null, count: null, readAll: null, timer: null };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install);
  else install();

  function install() {
    if (document.querySelector(".km-notification-center")) return;
    const host = document.querySelector("header");
    if (!host) return;

    const center = document.createElement("div");
    center.className = "km-notification-center";
    center.hidden = true;
    center.innerHTML = `
      <button class="km-notification-bell" type="button" aria-label="Abrir avisos" aria-expanded="false">
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"></path>
          <path d="M10 21h4"></path>
        </svg>
        <span class="km-notification-count" hidden>0</span>
      </button>
      <section class="km-notification-panel" aria-label="Avisos" hidden>
        <div class="km-notification-head">
          <strong>Avisos</strong>
          <button class="km-notification-read-all" type="button">Marcar todo como leído</button>
        </div>
        <div class="km-notification-list"><div class="km-notification-empty">Cargando avisos…</div></div>
      </section>`;
    host.append(center);

    state.center = center;
    state.button = center.querySelector(".km-notification-bell");
    state.panel = center.querySelector(".km-notification-panel");
    state.list = center.querySelector(".km-notification-list");
    state.count = center.querySelector(".km-notification-count");
    state.readAll = center.querySelector(".km-notification-read-all");

    state.button.addEventListener("click", () => {
      const opening = state.panel.hidden;
      state.panel.hidden = !opening;
      state.button.setAttribute("aria-expanded", String(opening));
      if (opening) refresh();
    });
    state.readAll.addEventListener("click", markAllRead);
    document.addEventListener("click", (event) => {
      if (!state.panel.hidden && !state.center.contains(event.target)) close();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") close();
    });
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) refresh();
    });

    refresh();
    state.timer = window.setInterval(refresh, 30_000);
    window.KMNotifications = { refresh };
  }

  async function refresh() {
    try {
      const response = await fetch("/api/notifications?limit=40", { credentials: "same-origin", cache: "no-store" });
      if (response.status === 401) {
        state.center.hidden = true;
        return;
      }
      if (!response.ok) return;
      const data = await response.json();
      state.center.hidden = false;
      render(data.notifications || [], Number(data.unread || 0));
    } catch {
      // Los avisos nunca deben interrumpir la tarea principal del usuario.
    }
  }

  function render(notifications, unread) {
    state.count.hidden = unread === 0;
    state.count.textContent = unread > 99 ? "99+" : String(unread);
    state.button.setAttribute("aria-label", unread ? `Abrir avisos, ${unread} sin leer` : "Abrir avisos");
    state.readAll.hidden = unread === 0;
    if (!notifications.length) {
      state.list.innerHTML = '<div class="km-notification-empty">No tenés avisos pendientes.</div>';
      return;
    }
    state.list.replaceChildren(...notifications.map(notificationItem));
  }

  function notificationItem(notification) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "km-notification-item";
    button.dataset.priority = notification.priority || "info";
    button.dataset.unread = String(!notification.readAt);

    const title = document.createElement("span");
    title.className = "km-notification-item-title";
    const titleText = document.createElement("span");
    titleText.textContent = notification.title || "Aviso";
    const dot = document.createElement("span");
    dot.className = "km-notification-dot";
    title.append(titleText, dot);

    const body = document.createElement("p");
    body.className = "km-notification-body";
    body.textContent = notification.body || "";
    const time = document.createElement("time");
    time.className = "km-notification-time";
    time.textContent = formatDate(notification.createdAt);
    button.append(title, body, time);
    button.addEventListener("click", () => openNotification(notification));
    return button;
  }

  async function openNotification(notification) {
    if (!notification.readAt) {
      try {
        await fetch(`/api/notifications/${notification.id}/read`, {
          method: "POST",
          credentials: "same-origin"
        });
      } catch {
        // La navegación sigue disponible aunque no se pueda registrar la lectura.
      }
    }
    if (notification.actionUrl) window.location.assign(notification.actionUrl);
    else refresh();
  }

  async function markAllRead() {
    try {
      const response = await fetch("/api/notifications/read-all", { method: "POST", credentials: "same-origin" });
      if (response.ok) await refresh();
    } catch {
      // Mantiene abierta la aplicación si hay una interrupción de red.
    }
  }

  function close() {
    if (!state.panel) return;
    state.panel.hidden = true;
    state.button.setAttribute("aria-expanded", "false");
  }

  function formatDate(value) {
    const parsed = new Date(String(value || "").replace(" ", "T") + (String(value || "").includes("Z") ? "" : "Z"));
    if (Number.isNaN(parsed.getTime())) return "";
    return new Intl.DateTimeFormat("es-AR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(parsed);
  }
})();

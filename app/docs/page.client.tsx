function setupCopyButtons() {
  const cleanups: Array<() => void> = [];
  document
    .querySelectorAll<HTMLButtonElement>(".docs-page .code button[data-c]")
    .forEach((button) => {
      const onClick = async () => {
        const fallback =
          button.closest(".code")?.querySelector("pre")?.textContent ?? "";
        try {
          await navigator.clipboard.writeText(button.dataset.c || fallback);
          button.textContent = "copied";
        } catch {
          button.textContent = "copy failed";
        }
        window.setTimeout(() => {
          button.textContent = "copy";
        }, 1200);
      };
      button.addEventListener("click", onClick);
      cleanups.push(() => button.removeEventListener("click", onClick));
    });
  return () => cleanups.forEach((cleanup) => cleanup());
}

function setupSidebarScrollspy() {
  const links = [
    ...document.querySelectorAll<HTMLAnchorElement>(
      ".docs-page #side a[href^='#']",
    ),
  ];
  const sections = [
    ...document.querySelectorAll<HTMLElement>(".docs-page article section[id]"),
  ];
  if (!links.length || !sections.length) return () => {};
  const linkById = new Map(
    links.map((link) => [link.getAttribute("href")?.slice(1) ?? "", link]),
  );
  const activate = (id: string) =>
    links.forEach((link) => {
      const active = link === linkById.get(id);
      link.classList.toggle("on", active);
      active
        ? link.setAttribute("aria-current", "location")
        : link.removeAttribute("aria-current");
    });
  if (!("IntersectionObserver" in window)) {
    activate(sections[0].id);
    return () => {};
  }
  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter(
          (entry) =>
            entry.isIntersecting && !(entry.target as HTMLElement).hidden,
        )
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible[0]) activate(visible[0].target.id);
    },
    { rootMargin: "-15% 0px -75% 0px", threshold: [0, 0.01] },
  );
  sections.forEach((section) => observer.observe(section));
  activate(
    linkById.has(window.location.hash.slice(1))
      ? window.location.hash.slice(1)
      : sections[0].id,
  );
  return () => observer.disconnect();
}

function setupSearch() {
  const input = document.querySelector<HTMLInputElement>("#docs-search");
  const count = document.querySelector<HTMLElement>("#docs-search-count");
  const empty = document.querySelector<HTMLElement>("#docs-empty");
  const sections = [
    ...document.querySelectorAll<HTMLElement>("[data-doc-section]"),
  ];
  const links = [
    ...document.querySelectorAll<HTMLAnchorElement>("#side a[href^='#']"),
  ];
  if (!input) return () => {};
  const update = () => {
    const query = input.value.trim().toLowerCase();
    let visible = 0;
    sections.forEach((section) => {
      const match =
        !query || (section.textContent ?? "").toLowerCase().includes(query);
      section.hidden = !match;
      if (match) visible += 1;
    });
    links.forEach((link) => {
      const id = link.getAttribute("href")?.slice(1) ?? "";
      const section = document.getElementById(id);
      link.hidden = Boolean(section?.hidden);
    });
    if (count)
      count.textContent = `${visible} section${visible === 1 ? "" : "s"}`;
    if (empty) empty.hidden = visible !== 0;
  };
  const keydown = (event: KeyboardEvent) => {
    if (
      event.key === "/" &&
      document.activeElement !== input &&
      !(document.activeElement instanceof HTMLInputElement) &&
      !(document.activeElement instanceof HTMLTextAreaElement)
    ) {
      event.preventDefault();
      input.focus();
    }
    if (event.key === "Escape" && document.activeElement === input) {
      input.value = "";
      update();
      input.blur();
    }
  };
  input.addEventListener("input", update);
  document.addEventListener("keydown", keydown);
  update();
  return () => {
    input.removeEventListener("input", update);
    document.removeEventListener("keydown", keydown);
  };
}

function setupProgress() {
  const bar = document.querySelector<HTMLElement>("#docs-progress");
  if (!bar) return () => {};
  const update = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const value = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    bar.style.transform = `scaleX(${value})`;
  };
  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update);
  update();
  return () => {
    window.removeEventListener("scroll", update);
    window.removeEventListener("resize", update);
  };
}

function setupMenu() {
  const button = document.querySelector<HTMLButtonElement>("#docs-menu");
  const aside = document.querySelector<HTMLElement>("#side");
  if (!button || !aside) return () => {};
  const toggle = () => {
    const open = !aside.classList.contains("open");
    aside.classList.toggle("open", open);
    button.setAttribute("aria-expanded", String(open));
    button.textContent = open ? "close" : "menu";
  };
  const close = (event: Event) => {
    if ((event.target as HTMLElement).closest("a")) {
      aside.classList.remove("open");
      button.setAttribute("aria-expanded", "false");
      button.textContent = "menu";
    }
  };
  button.addEventListener("click", toggle);
  aside.addEventListener("click", close);
  return () => {
    button.removeEventListener("click", toggle);
    aside.removeEventListener("click", close);
  };
}

function setupHeadingLinks() {
  const cleanups: Array<() => void> = [];
  document
    .querySelectorAll<HTMLElement>(".docs-page section[id] h2")
    .forEach((heading) => {
      const section = heading.closest<HTMLElement>("section[id]");
      if (!section) return;
      const button = document.createElement("button");
      button.className = "heading-link";
      button.type = "button";
      button.title = "Copy section link";
      button.textContent = "#";
      const click = async () => {
        const url = `${location.origin}${location.pathname}#${section.id}`;
        try {
          await navigator.clipboard.writeText(url);
          button.textContent = "✓";
        } catch {
          button.textContent = "!";
        }
        window.setTimeout(() => {
          button.textContent = "#";
        }, 1000);
      };
      button.addEventListener("click", click);
      heading.appendChild(button);
      cleanups.push(() => button.removeEventListener("click", click));
    });
  return () => cleanups.forEach((cleanup) => cleanup());
}

declare global {
  interface Window {
    __solardDocsCleanup__?: () => void;
  }
}

export default function mount() {
  window.__solardDocsCleanup__?.();
  const cleanups = [
    setupCopyButtons(),
    setupSidebarScrollspy(),
    setupSearch(),
    setupProgress(),
    setupMenu(),
    setupHeadingLinks(),
  ];
  let active = true;

  const cleanup = () => {
    if (!active) return;
    active = false;
    cleanups.reverse().forEach((dispose) => dispose());
    if (window.__solardDocsCleanup__ === cleanup)
      delete window.__solardDocsCleanup__;
  };

  window.__solardDocsCleanup__ = cleanup;
  return cleanup;
}

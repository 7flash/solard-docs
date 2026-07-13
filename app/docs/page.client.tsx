function setupCopyButtons() {
  const cleanups: Array<() => void> = [];

  document
    .querySelectorAll<HTMLButtonElement>(".docs-page .code button[data-c]")
    .forEach((button) => {
      const onClick = async () => {
        const block = button.closest(".code");
        const fallback = block?.querySelector("pre")?.textContent ?? "";
        const text = button.dataset.c || fallback;

        try {
          await navigator.clipboard.writeText(text);
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

  const activate = (id: string) => {
    links.forEach((link) => {
      const active = link === linkById.get(id);
      link.classList.toggle("on", active);
      if (active) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    });
  };

  if (!("IntersectionObserver" in window)) {
    activate(sections[0].id);
    return () => {};
  }

  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);

      if (visible[0]) activate(visible[0].target.id);
    },
    { rootMargin: "-15% 0px -75% 0px", threshold: [0, 0.01] },
  );

  sections.forEach((section) => observer.observe(section));

  const current = window.location.hash.slice(1);
  activate(linkById.has(current) ? current : sections[0].id);

  return () => observer.disconnect();
}

export default function mount() {
  const cleanups = [setupCopyButtons(), setupSidebarScrollspy()];

  return () => cleanups.reverse().forEach((cleanup) => cleanup());
}

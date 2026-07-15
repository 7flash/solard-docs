function setupCopyButtons() {
  const cleanups: Array<() => void> = [];
  document.querySelectorAll<HTMLButtonElement>(".cmd button[data-copy]").forEach((button) => {
    const click = async () => {
      try {
        await navigator.clipboard.writeText(button.dataset.copy ?? "");
        button.textContent = "copied";
      } catch {
        button.textContent = "copy failed";
      }
      window.setTimeout(() => { button.textContent = "copy"; }, 1200);
    };
    button.addEventListener("click", click);
    cleanups.push(() => button.removeEventListener("click", click));
  });
  return () => cleanups.forEach((cleanup) => cleanup());
}

function setupObservers() {
  if (!("IntersectionObserver" in window)) {
    document.querySelectorAll(".rv").forEach((node) => node.classList.add("in"));
    return () => {};
  }

  const revealObserver = new IntersectionObserver((entries) => entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add("in");
      revealObserver.unobserve(entry.target);
    }
  }), { threshold: 0.08 });
  document.querySelectorAll(".rv").forEach((node) => revealObserver.observe(node));

  const links = [...document.querySelectorAll<HTMLAnchorElement>(".v3-nav-links a[data-s], .nav-links a[data-s]")];
  const sections = links.map((link) => document.getElementById(link.dataset.s ?? "")).filter(Boolean) as HTMLElement[];
  const navObserver = new IntersectionObserver((entries) => entries.forEach((entry) => {
    if (entry.isIntersecting) links.forEach((link) => link.classList.toggle("on", link.dataset.s === entry.target.id));
  }), { rootMargin: "-30% 0px -60% 0px" });
  sections.forEach((section) => navObserver.observe(section));

  return () => {
    revealObserver.disconnect();
    navObserver.disconnect();
  };
}

declare global {
  interface Window {
    __solardLandingCleanup__?: () => void;
  }
}

export default function mount() {
  window.__solardLandingCleanup__?.();

  const cleanups = [setupCopyButtons(), setupObservers()];
  let active = true;

  const cleanup = () => {
    if (!active) return;
    active = false;
    cleanups.reverse().forEach((dispose) => dispose());
    if (window.__solardLandingCleanup__ === cleanup) delete window.__solardLandingCleanup__;
  };

  window.__solardLandingCleanup__ = cleanup;
  return cleanup;
}

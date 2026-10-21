import { useEffect } from "react";

export default function ScrollEmphasis({ route }) {
  useEffect(() => {
    const main = document.getElementById("main-content");
    if (!main || !window.IntersectionObserver) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let observer;
    let targets = [];

    function refresh() {
      observer?.disconnect();
      targets.forEach(element => element.classList.remove("at-screen-center"));
      targets = [];
      if (preference.matches) return;
      // A narrow band around the viewport's horizontal midpoint.
      const inset = Math.max(0, window.innerHeight / 2 - 16);
      observer = new IntersectionObserver(entries => {
        entries.forEach(entry => entry.target.classList.toggle("at-screen-center", entry.isIntersecting));
      }, { rootMargin: `-${inset}px 0px -${inset}px 0px`, threshold: 0 });
      targets = [...main.querySelectorAll(".card, .daily-overview")]
        .filter(element => !element.closest(".modal-overlay") && !element.parentElement.closest(".card, .daily-overview"));
      targets.forEach(element => observer.observe(element));
    }

    refresh();
    const changes = new MutationObserver(refresh);
    changes.observe(main, { childList: true, subtree: true });
    window.addEventListener("resize", refresh);
    preference.addEventListener("change", refresh);
    return () => {
      changes.disconnect();
      observer?.disconnect();
      targets.forEach(element => element.classList.remove("at-screen-center"));
      window.removeEventListener("resize", refresh);
      preference.removeEventListener("change", refresh);
    };
  }, [route]);
  return null;
}

/*! Intro Splash (auto-injection) - Congelados El Timón */
(() => {
  const SESSION_KEY = "eltimon-saw-splash";
  // ⏱️ DURACIÓN DE LA INTRO (en milisegundos) - MODIFICA ESTE VALOR
  const INTRO_DURATION = 3000; // 2000ms = 2 segundos. Cambia este número según tu preferencia
  
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  
  // Función para mostrar el contenido de la página
  const showPageContent = () => {
    document.body.classList.add("intro-ready");
  };
  
  // Si no se va a mostrar la intro, mostrar el contenido inmediatamente
  if (sessionStorage.getItem(SESSION_KEY) === "1" || prefersReducedMotion) {
    showPageContent();
    return;
  }
  
  const splash = document.createElement("div");
  splash.id = "intro-splash";
  splash.setAttribute("aria-hidden", "true");
  splash.innerHTML = `
    <div class="intro-inner">
      <div class="logo-ring">
        <img class="logo-img" src="timon6.svg" alt="Timón náutico girando">
      </div>
      <div class="logo-text">Congelados El Timón</div>
      <p class="intro-sub">Ahora más cerca de nuestros clientes</p>
      <button class="intro-skip" type="button" aria-label="Saltar introducción">Saltar</button>
    </div>
  `;
  
  const lockScroll = () => {
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
  };
  
  const unlockScroll = () => {
    document.documentElement.style.overflow = "";
    document.body.style.overflow = "";
  };
  
  const hideIntro = () => {
    sessionStorage.setItem(SESSION_KEY, "1");
    splash.classList.add("is-hidden");
    unlockScroll();
    // Mostrar el contenido con un delay más largo para una transición más suave
    setTimeout(() => {
      showPageContent();
    }, 500); // Delay de 500ms para que comience después de que la intro haya comenzado a desvanecerse
    setTimeout(() => splash.remove(), 1100); // Aumentado para coincidir con la transición de 1s
  };
  
  const showIntro = () => {
    if (!document.body.contains(splash)) {
      document.body.appendChild(splash);
      lockScroll();
    }
  };
  
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", showIntro, { once: true });
  } else {
    showIntro();
  }
  
  splash.addEventListener("click", (e) => {
    if (e.target && e.target.matches(".intro-skip")) {
      hideIntro();
    }
  });
  
  let canAutoHide = false;
  
  // Ocultar después de INTRO_DURATION si la página ya está lista
  setTimeout(() => {
    canAutoHide = true;
    if (document.readyState === "complete") {
      hideIntro();
    }
  }, INTRO_DURATION);
  
  // Ocultar cuando la página termine de cargar (si ya pasó el tiempo mínimo)
  window.addEventListener("load", () => {
    if (canAutoHide) {
      hideIntro();
    }
  });
  
  // Timeout máximo de seguridad (5 segundos o INTRO_DURATION + 1.5 segundos, el que sea mayor)
  setTimeout(() => {
    if (document.body.contains(splash)) {
      hideIntro();
    }
  }, Math.max(5000, INTRO_DURATION + 1500));
})();

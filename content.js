// 1. Botón Flotante Global
let downloadBtn = document.createElement("div");
downloadBtn.innerHTML = "⬇️";
downloadBtn.style.position = "fixed";
downloadBtn.style.color = "white";
downloadBtn.style.borderRadius = "50%";
downloadBtn.style.width = "35px";
downloadBtn.style.height = "35px";
downloadBtn.style.display = "none";
downloadBtn.style.alignItems = "center";
downloadBtn.style.justifyContent = "center";
downloadBtn.style.zIndex = "2147483647";
downloadBtn.style.boxShadow = "0 4px 12px rgba(0,0,0,0.4)";
downloadBtn.style.fontSize = "18px";
downloadBtn.style.transition =
  "opacity 0.12s ease-out, transform 0.12s ease-out, filter 0.12s ease-out, box-shadow 0.12s ease-out";
downloadBtn.style.opacity = "0";
downloadBtn.style.filter = "none";
downloadBtn.title = "Clic para descargar (Shift+Clic o Clic Derecho para ocultar)";

// 🔑 CLAVE ANTI-PARPADEO: el botón nunca intercepta eventos del mouse.
// El mousemove "lo atraviesa" y llega directo a la imagen de abajo,
// así que su propia presencia nunca puede confundir la detección.
downloadBtn.style.pointerEvents = "none";

// 🎨 Estilos base para el efecto hover (se aplican/quitan a mano, ver más abajo)
const BUTTON_SHADOW_DEFAULT = "0 4px 12px rgba(0,0,0,0.4)";
const BUTTON_SHADOW_HOVER = "0 6px 18px rgba(0,0,0,0.55)";
const BUTTON_FILTER_HOVER = "brightness(1.18)";

// 🧠 Variables para la lógica de "No Molestar"
let currentTarget = null; // { el, kind: "img" | "bg" | "svg", url }
let suppressTarget = null;

// 🛡️ Anti-clic-accidental: pequeño margen antes de que un clic cuente,
// para no disparar una descarga si el botón acaba de aparecer por una
// acción del usuario que en realidad iba dirigida a otra cosa.
const BUTTON_ARM_DELAY_MS = 150;
let buttonShownAt = 0;

// 🛡️ Evita doble descarga por doble-clic accidental
const DOWNLOAD_COOLDOWN_MS = 500;
let lastDownloadAt = 0;

function initButton() {
  if (document.body) document.body.appendChild(downloadBtn);
}
if (document.readyState === "loading")
  document.addEventListener("DOMContentLoaded", initButton);
else initButton();

// 🧠 Ajuste de URL de X/Twitter para máxima calidad
function upgradeQuality(url) {
  if (!url) return url;

  if (
    (window.location.hostname.includes("twitter.com") ||
      window.location.hostname.includes("x.com")) &&
    url.includes("twimg.com/media")
  ) {
    if (url.includes("name=")) {
      url = url.replace(/name=[a-zA-Z0-9x]+/, "name=orig");
    } else if (url.match(/\.(jpg|jpeg|png|gif|webp):[a-zA-Z0-9x]+/i)) {
      url = url.replace(
        /:(thumb|small|medium|large|900x900|1080x1080|orig)/i,
        ":orig",
      );
    } else if (url.match(/\.(jpg|jpeg|png|gif|webp)(\?|$)/i)) {
      url = url.replace(/(\.(jpg|jpeg|png|gif|webp))/i, "$1:orig");
    }
  }
  return url;
}

// 🧠 ¿Es una URL "placeholder" típica de lazy-loading? (base64 diminuto, 1x1, etc.)
function looksLikePlaceholder(url) {
  if (!url) return true;
  if (url.startsWith("data:") && url.length < 200) return true;
  return false;
}

// 🧠 Extrae la mejor URL de un <img>, incluyendo soporte de lazy-loading
function getBestUrlFromImg(imgNode) {
  let url = imgNode.currentSrc || imgNode.src;

  if (window.location.hostname.includes("instagram.com") && imgNode.srcset) {
    try {
      const parts = imgNode.srcset.split(",").map((s) => s.trim().split(" "));
      parts.sort((a, b) => (parseInt(b[1]) || 0) - (parseInt(a[1]) || 0));
      if (parts.length > 0 && parts[0][0]) url = parts[0][0];
    } catch (e) {}
  }

  // 🌐 Fallback para sitios con lazy-loading (data-src, data-lazy-src, etc.)
  if (looksLikePlaceholder(url)) {
    const lazyAttrs = [
      "data-src",
      "data-lazy-src",
      "data-original",
      "data-srcset",
      "data-actualsrc",
    ];
    for (const attr of lazyAttrs) {
      const val = imgNode.getAttribute(attr);
      if (val && !looksLikePlaceholder(val)) {
        url = val.split(",")[0].trim().split(" ")[0];
        break;
      }
    }
  }

  return upgradeQuality(url);
}

// 🧠 Extrae la URL de una imagen puesta como CSS background-image
function getBackgroundImageUrl(el) {
  const style = window.getComputedStyle(el);
  const bg = style.backgroundImage;
  if (!bg || bg === "none") return null;
  const match = bg.match(/url\(["']?([^"')]+)["']?\)/);
  if (!match || !match[1]) return null;
  if (looksLikePlaceholder(match[1])) return null;
  return upgradeQuality(match[1]);
}

// 🧠 Extrae la URL de un <image> dentro de SVG
function getSvgImageUrl(el) {
  const href = el.getAttribute("href") || el.getAttribute("xlink:href");
  if (!href || looksLikePlaceholder(href)) return null;
  return upgradeQuality(href);
}

// 🎯 Recorre los elementos apilados visualmente bajo el cursor (no la
// cadena de ancestros) y decide cuál es el mejor candidato a "imagen
// descargable". Se usa elementsFromPoint —consulta espacial por pixel—
// en vez de composedPath, porque sitios como Instagram superponen capas
// transparentes de interacción (doble-tap, carrusel) que NO son
// ancestros del <img> real, sino elementos hermanos puestos encima; con
// composedPath esas capas ocultan la imagen casi siempre. En Chrome,
// elementsFromPoint ya aplana el Shadow DOM abierto para hit-testing,
// así que no perdemos ese soporte al usar solo este método. Como
// downloadBtn tiene pointer-events:none, nunca aparece en esta lista,
// así que jamás compite consigo mismo por la detección.
function findImageCandidate(e) {
  let path = document.elementsFromPoint(e.clientX, e.clientY);

  // 1️⃣ Preferencia máxima: un <img> real
  for (let el of path) {
    if (el instanceof Element && el.tagName === "IMG") {
      return { el, kind: "img" };
    }
  }

  // 2️⃣ Un <image> de SVG
  for (let el of path) {
    if (el instanceof Element && el.tagName.toLowerCase() === "image") {
      const url = getSvgImageUrl(el);
      if (url) return { el, kind: "svg", url };
    }
  }

  // 3️⃣ Un elemento cualquiera con background-image de tamaño razonable
  for (let el of path) {
    if (!(el instanceof Element)) continue;
    if (el === document.documentElement || el === document.body) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 30 || rect.height < 30) continue;
    const url = getBackgroundImageUrl(el);
    if (url) return { el, kind: "bg", url };
  }

  return null;
}

function hideButton() {
  downloadBtn.style.display = "none";
  downloadBtn.style.opacity = "0";
  downloadBtn.style.filter = "none";
  downloadBtn.style.boxShadow = BUTTON_SHADOW_DEFAULT;
  currentTarget = null;
}

// 2. MOTOR RAYO X (Atraviesa escudos de IG, X, Shadow DOM y CSS backgrounds)
let lastMove = 0;
document.addEventListener("mousemove", (e) => {
  if (e.timeStamp - lastMove < 50) return;
  lastMove = e.timeStamp;

  const candidate = findImageCandidate(e);
  const targetEl = candidate ? candidate.el : null;

  // 🛡️ LÓGICA "NO MOLESTAR": Si el botón fue ocultado para esta imagen, no lo mostramos
  if (targetEl && targetEl === suppressTarget) {
    hideButton();
    return;
  }
  if (targetEl !== suppressTarget) {
    // El ratón salió de la imagen "castigada": perdonamos y limpiamos el bloqueo
    suppressTarget = null;
  }

  if (candidate) {
    const isNewTarget = !currentTarget || currentTarget.el !== candidate.el;
    currentTarget = candidate;

    let rect = candidate.el.getBoundingClientRect();
    if (rect.width > 30 && rect.height > 30) {
      downloadBtn.style.display = "flex";

      // 🎨 Camaleón de Color según la web
      if (window.location.hostname.includes("instagram.com")) {
        downloadBtn.style.background = "#E1306C";
      } else if (
        window.location.hostname.includes("x.com") ||
        window.location.hostname.includes("twitter.com")
      ) {
        downloadBtn.style.background = "#000000";
      } else {
        downloadBtn.style.background = "#1a73e8";
      }

      // 📍 Centrado sobre la imagen (en vez de la esquina superior derecha)
      const centerX = rect.left + rect.width / 2 - 17.5;
      const centerY = rect.top + rect.height / 2 - 17.5;
      downloadBtn.style.left =
        Math.min(Math.max(5, centerX), window.innerWidth - 40) + "px";
      downloadBtn.style.top =
        Math.min(Math.max(5, centerY), window.innerHeight - 40) + "px";

      downloadBtn.dataset.url = candidate.url || getBestUrlFromImg(candidate.el);

      if (isNewTarget) {
        buttonShownAt = performance.now();
        downloadBtn.style.opacity = "0.55";
        downloadBtn.style.transform = "scale(0.9)";
        requestAnimationFrame(() => {
          downloadBtn.style.opacity = "1";
        });
        setTimeout(() => {
          // 💡 Señal visual de "listo para clic" una vez pasado el margen de seguridad
          if (currentTarget && currentTarget.el === candidate.el) {
            downloadBtn.style.transform = "scale(1)";
          }
        }, BUTTON_ARM_DELAY_MS);
      }

      // ✨ EFECTO HOVER: como el botón tiene pointer-events:none, no puede
      // recibir :hover por CSS de forma nativa (el mouse "lo atraviesa").
      // Se detecta a mano comparando la posición del cursor contra el
      // rectángulo del botón, y se aplica solo brillo + sombra (nunca
      // toca "transform", que ya lo usa la animación de aparición de
      // arriba) para no interferir con la lógica principal.
      if (pointInButtonRect(e.clientX, e.clientY)) {
        downloadBtn.style.filter = BUTTON_FILTER_HOVER;
        downloadBtn.style.boxShadow = BUTTON_SHADOW_HOVER;
      } else {
        downloadBtn.style.filter = "none";
        downloadBtn.style.boxShadow = BUTTON_SHADOW_DEFAULT;
      }
    }
  } else {
    hideButton();
  }
});

// 3. CLIC / CLIC DERECHO — detectados a nivel de documento por coordenadas,
// ya que el botón (pointer-events:none) nunca recibe eventos directamente.
function pointInButtonRect(x, y) {
  if (downloadBtn.style.display !== "flex") return false;
  const rect = downloadBtn.getBoundingClientRect();
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

document.addEventListener(
  "click",
  (e) => {
    if (!pointInButtonRect(e.clientX, e.clientY)) return;
    if (!downloadBtn.dataset.url) return;

    // Esta pulsación es sobre el botón: nunca dejar que llegue al sitio
    // (evita que además se abra el visor de imagen / lightbox del sitio)
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    // 🙈 Shift/Ctrl/Cmd + clic sobre el botón = ocultar sin descargar
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      suppressTarget = currentTarget ? currentTarget.el : null;
      hideButton();
      return;
    }

    // 🛡️ Anti-clic-accidental: ignora clics demasiado pronto tras la aparición
    if (performance.now() - buttonShownAt < BUTTON_ARM_DELAY_MS) return;

    // 🛡️ Anti-doble-descarga
    if (performance.now() - lastDownloadAt < DOWNLOAD_COOLDOWN_MS) return;
    lastDownloadAt = performance.now();

    chrome.runtime.sendMessage({
      accion: "descargar",
      url: downloadBtn.dataset.url,
    });
  },
  true,
);

document.addEventListener(
  "contextmenu",
  (e) => {
    if (!pointInButtonRect(e.clientX, e.clientY)) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    suppressTarget = currentTarget ? currentTarget.el : null;
    hideButton();
  },
  true,
);

// 4. ESCUCHA PARA EL ATAJO DE TECLADO (Alt + D)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getCenterImage") {
    const posts = document.querySelectorAll(
      'article, [role="presentation"], .x1lliihq, [data-testid="tweet"]',
    );
    let bestPost = null;
    let minDistance = Infinity;
    const centerY = window.innerHeight / 2;
    posts.forEach((post) => {
      const rect = post.getBoundingClientRect();
      const postCenter = rect.top + rect.height / 2;
      const distance = Math.abs(postCenter - centerY);
      if (distance < minDistance) {
        minDistance = distance;
        bestPost = post;
      }
    });
    if (bestPost) {
      const imgs = bestPost.querySelectorAll("img");
      let largestImg = null;
      let maxArea = 0;
      imgs.forEach((img) => {
        const area = img.width * img.height;
        if (area > maxArea) {
          maxArea = area;
          largestImg = img;
        }
      });
      if (largestImg) {
        sendResponse({ url: getBestUrlFromImg(largestImg) });
      }
    }
  }
  return true;
});

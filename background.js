// 1. Descargas desde el botón flotante o menú contextual
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.accion === "descargar" && request.url) {
    chrome.downloads.download({
      url: request.url,
      saveAs: false,
      conflictAction: "uniquify",
    });
  }
});

// 2. Menú Contextual (Clic derecho)
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "descargar-imagen",
    title: "Descargar esta imagen",
    contexts: ["image"],
  });
  chrome.contextMenus.create({
    id: "descargar-enlace",
    title: "Descargar imagen enlazada",
    contexts: ["link"],
  });
  chrome.contextMenus.create({
    id: "descargar-pestaña",
    title: "Descargar imagen de esta pestaña",
    contexts: ["page", "frame"],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  let urlToDownload = "";
  if (info.menuItemId === "descargar-imagen" && info.srcUrl)
    urlToDownload = info.srcUrl;
  else if (info.menuItemId === "descargar-enlace" && info.linkUrl)
    urlToDownload = info.linkUrl;
  else if (
    info.menuItemId === "descargar-pestaña" &&
    tab.url &&
    /\.(jpe?g|png|gif|webp|bmp|svg)(\?.*)?$/i.test(tab.url)
  )
    urlToDownload = tab.url;
  if (urlToDownload)
    chrome.downloads.download({
      url: urlToDownload,
      saveAs: false,
      conflictAction: "uniquify",
    });
});

// 3. ¡EL ATAJO DE TECLADO MÁGICO!
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "download-center-post") {
    // Le preguntamos al Content Script qué imagen está en el centro de la pantalla
    chrome.tabs.sendMessage(
      tab.id,
      { action: "getCenterImage" },
      (response) => {
        if (chrome.runtime.lastError) return; // Evita errores si la pestaña no tiene el script cargado
        if (response && response.url) {
          chrome.downloads.download({
            url: response.url,
            saveAs: false,
            conflictAction: "uniquify",
          });
        }
      },
    );
  }
});

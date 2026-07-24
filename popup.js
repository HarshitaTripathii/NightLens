const toggle = document.querySelector("#toggle");
const status = document.querySelector("#status");
const extensionApi = globalThis.chrome;

if (extensionApi?.storage?.local) {
  initialize();
} else {
  // Keeps the popup previewable as a normal web page during development.
  render(true);
}

async function initialize() {
  const { enabled } = await extensionApi.storage.local.get({ enabled: true });
  render(enabled);
  await readPageStatus(enabled);
}

toggle.addEventListener("click", async () => {
  const enabled = toggle.getAttribute("aria-checked") !== "true";
  if (extensionApi?.storage?.local) {
    await extensionApi.storage.local.set({ enabled });
  }
  render(enabled);
  if (extensionApi?.tabs) await readPageStatus(enabled);
});

function render(enabled) {
  toggle.setAttribute("aria-checked", String(enabled));
  status.textContent = enabled ? "Protection is on" : "Protection is off";
}

async function readPageStatus(enabled) {
  if (!enabled) return;

  try {
    const [tab] = await extensionApi.tabs.query({ active: true, currentWindow: true });
    const page = await extensionApi.tabs.sendMessage(tab.id, {
      type: "nightLens:getStatus",
    });

    if (!page.available) status.textContent = "Video analysis unavailable";
    else if (!page.videoDetected) status.textContent = "Waiting for a video";
    else if (!page.videoPlaying) status.textContent = "Video is paused";
    else if (page.protectionActive) status.textContent = "Softening bright scene";
    else status.textContent = "Watching video";
  } catch {
    status.textContent = "Open or reload a YouTube video";
  }
}

(() => {
  "use strict";

  const { calculateFrameMetrics, createDetectorState, evaluateFrame } =
    globalThis.NightLensDetector;
  const SETTINGS = {
    enabled: true,
    brightnessThreshold: 0.62,
    dimLevel: 0.55,
  };
  const ANALYSIS_WIDTH = 48;
  const ANALYSIS_HEIGHT = 27;
  const FALLBACK_FRAME_DELAY = 80;

  let enabled = SETTINGS.enabled;
  let activeVideo = null;
  let scheduledFrame = null;
  let fallbackFrame = null;
  let refreshQueued = false;
  let destroyed = false;
  let lastBrightness = 0;
  let protectionActive = false;

  const videoStates = new WeakMap();
  const canvas = document.createElement("canvas");
  canvas.width = ANALYSIS_WIDTH;
  canvas.height = ANALYSIS_HEIGHT;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  let analysisAvailable = Boolean(context);

  const observer = new MutationObserver(queueActiveVideoRefresh);

  initialize();

  async function initialize() {
    const settings = await chrome.storage.local.get({ enabled: SETTINGS.enabled });
    enabled = settings.enabled;

    chrome.storage.onChanged.addListener(handleStorageChange);
    chrome.runtime.onMessage.addListener(handleMessage);
    document.addEventListener("play", refreshActiveVideo, true);
    document.addEventListener("pause", refreshActiveVideo, true);
    document.addEventListener("emptied", refreshActiveVideo, true);
    document.addEventListener("fullscreenchange", refreshActiveVideo);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    refreshActiveVideo();
  }

  function handleStorageChange(changes, areaName) {
    if (areaName !== "local" || !changes.enabled) return;
    enabled = changes.enabled.newValue;
    refreshActiveVideo();
  }

  function handleMessage(message, _sender, sendResponse) {
    if (message.type !== "nightLens:getStatus") return undefined;
    sendResponse({
      available: analysisAvailable,
      enabled,
      videoDetected: document.querySelector("video") !== null,
      videoPlaying: Boolean(activeVideo && !activeVideo.paused),
      brightness: lastBrightness,
      protectionActive,
    });
    return true;
  }

  function queueActiveVideoRefresh() {
    if (refreshQueued) return;
    refreshQueued = true;
    requestAnimationFrame(() => {
      refreshQueued = false;
      refreshActiveVideo();
    });
  }

  function refreshActiveVideo() {
    if (destroyed) return;
    const nextVideo = enabled ? findDominantVideo() : null;

    if (nextVideo === activeVideo) {
      if (nextVideo && scheduledFrame === null && fallbackFrame === null) {
        scheduleNextFrame();
      }
      return;
    }

    cancelScheduledFrame();
    if (activeVideo) restoreVideo(activeVideo, true);
    activeVideo = nextVideo;
    protectionActive = false;
    if (activeVideo) scheduleNextFrame();
  }

  function findDominantVideo() {
    let winner = null;
    let winnerScore = 0;

    for (const video of document.querySelectorAll("video")) {
      if (video.paused || video.ended || video.readyState < 2) continue;
      const rect = video.getBoundingClientRect();
      const visibleWidth = Math.max(
        0,
        Math.min(rect.right, innerWidth) - Math.max(rect.left, 0),
      );
      const visibleHeight = Math.max(
        0,
        Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0),
      );
      const score = visibleWidth * visibleHeight;
      if (score > winnerScore) {
        winner = video;
        winnerScore = score;
      }
    }

    return winner;
  }

  function scheduleNextFrame() {
    if (!activeVideo || destroyed) return;
    if (typeof activeVideo.requestVideoFrameCallback === "function") {
      scheduledFrame = activeVideo.requestVideoFrameCallback(processFrame);
    } else {
      fallbackFrame = window.setTimeout(processFrame, FALLBACK_FRAME_DELAY);
    }
  }

  function processFrame() {
    scheduledFrame = null;
    fallbackFrame = null;
    const video = activeVideo;

    if (!video || video.paused || video.ended || !context) {
      refreshActiveVideo();
      return;
    }

    try {
      context.drawImage(video, 0, 0, ANALYSIS_WIDTH, ANALYSIS_HEIGHT);
      const pixels = context.getImageData(
        0,
        0,
        ANALYSIS_WIDTH,
        ANALYSIS_HEIGHT,
      ).data;
      const metrics = calculateFrameMetrics(pixels, 2);
      const state = getVideoState(video);
      const detection = evaluateFrame(state.detector, metrics, SETTINGS);
      analysisAvailable = true;
      lastBrightness = detection.brightness;
      protectionActive = detection.protectionActive;
      applyDimLevel(video, state, detection.targetDimLevel);
    } catch {
      // Some protected video sources block canvas reads. Never leave the video dimmed.
      analysisAvailable = false;
      protectionActive = false;
      restoreVideo(video);
    }

    scheduleNextFrame();
  }

  function getVideoState(video) {
    let state = videoStates.get(video);
    if (!state) {
      state = {
        detector: createDetectorState(),
        originalFilter: video.style.filter,
        originalTransition: video.style.transition,
        targetDimLevel: 0,
        restoreTimer: null,
      };
      videoStates.set(video, state);
    }
    return state;
  }

  function applyDimLevel(video, state, target) {
    if (Math.abs(target - state.targetDimLevel) < 0.025) return;
    const isAttack = target > state.targetDimLevel;
    state.targetDimLevel = target;
    if (state.restoreTimer) window.clearTimeout(state.restoreTimer);

    const brightness = Math.max(0.16, 1 - target * 0.88);
    const dimFilter = target > 0 ? `brightness(${brightness.toFixed(3)})` : "";
    video.style.filter = [dimFilter, state.originalFilter]
      .filter(Boolean)
      .join(" ");
    video.style.transition = `filter ${isAttack ? 40 : 620}ms ${
      isAttack ? "linear" : "cubic-bezier(.2,.8,.2,1)"
    }`;

    if (target === 0) {
      state.restoreTimer = window.setTimeout(() => {
        video.style.filter = state.originalFilter;
        video.style.transition = state.originalTransition;
        state.restoreTimer = null;
      }, 650);
    }
  }

  function restoreVideo(video, immediately = false) {
    const state = videoStates.get(video);
    if (!state) return;
    if (state.restoreTimer) window.clearTimeout(state.restoreTimer);
    if (immediately) {
      video.style.filter = state.originalFilter;
      video.style.transition = state.originalTransition;
      state.targetDimLevel = 0;
    } else {
      applyDimLevel(video, state, 0);
    }
  }

  function cancelScheduledFrame() {
    if (
      activeVideo &&
      scheduledFrame !== null &&
      typeof activeVideo.cancelVideoFrameCallback === "function"
    ) {
      activeVideo.cancelVideoFrameCallback(scheduledFrame);
    }
    if (fallbackFrame !== null) window.clearTimeout(fallbackFrame);
    scheduledFrame = null;
    fallbackFrame = null;
  }

  window.addEventListener(
    "pagehide",
    () => {
      destroyed = true;
      cancelScheduledFrame();
      if (activeVideo) restoreVideo(activeVideo, true);
      observer.disconnect();
      chrome.storage.onChanged.removeListener(handleStorageChange);
      chrome.runtime.onMessage.removeListener(handleMessage);
    },
    { once: true },
  );
})();

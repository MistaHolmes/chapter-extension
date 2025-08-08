console.log("YouTube Chapter Extension: content script loaded.");

function parseTimestamp(ts) {
  const parts = ts.split(":").map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

const getChapters = () => {
  console.log("Getting chapters...");
  
  // Clear stored chapters on refresh
  const videoId = getVideoIdFromUrl(location.href);
  if (videoId) {
    chrome.storage.local.remove(`chapters_${videoId}`, () => {
      console.log("Cleared stored chapters for video:", videoId);
    });
  }
  
  // Try multiple selectors for YouTube chapters
  const selectors = [
    "ytd-macro-markers-list-item-renderer",
    "ytd-chapter-renderer",
    "ytd-engagement-panel-section-list-renderer[target-id='engagement-panel-macro-markers-description-chapters'] ytd-macro-markers-list-item-renderer"
  ];
  
  let elements = [];
  for (const selector of selectors) {
    elements = document.querySelectorAll(selector);
    if (elements.length > 0) break;
  }
  
  if (elements.length === 0) return [];
  
  // Deduplicate chapters by timestamp
  const chapterMap = new Map();
  
  [...elements].forEach(item => {
    let titleEl = item.querySelector("#title") || 
                  item.querySelector(".title") ||
                  item.querySelector("[class*='title']");
    
    let timeEl = item.querySelector("#time") || 
                 item.querySelector(".time") ||
                 item.querySelector("[class*='time']");
    
    if (!titleEl || !timeEl) {
      const textContent = item.textContent;
      const timestampMatch = textContent.match(/(\d{1,2}:\d{2}(?::\d{2})?)/);
      if (timestampMatch) {
        const timestamp = timestampMatch[1];
        const title = textContent.replace(timestamp, '').trim();
        if (title && timestamp) {
          chapterMap.set(timestamp, { title, timestamp });
        }
      }
    } else {
      const title = titleEl.textContent.trim();
      const timestamp = timeEl.textContent.trim();
      if (title && timestamp) {
        chapterMap.set(timestamp, { title, timestamp });
      }
    }
  });
  
  return Array.from(chapterMap.values());
};

function getVideoIdFromUrl(url) {
  const urlObj = new URL(url);
  return urlObj.searchParams.get("v");
}

const getVideoPlayer = () => {
  return document.querySelector("video");
};

const seekToTime = (timestamp) => {
  const video = getVideoPlayer();
  if (!video) {
    console.error("Video player not found");
    return false;
  }

  const seconds = parseTimestamp(timestamp);
  video.currentTime = seconds;
  return true;
};

let customPlaylist = [];
let currentChapterIndex = 0;
let isCustomPlayback = false;
let playbackTimeout = null;

const stopPlayback = () => {
  if (playbackTimeout) {
    clearTimeout(playbackTimeout);
    playbackTimeout = null;
  }
  isCustomPlayback = false;
};

const playNextChapter = () => {
  if (!isCustomPlayback || currentChapterIndex >= customPlaylist.length) {
    stopPlayback();
    return;
  }

  const chapter = customPlaylist[currentChapterIndex];
  console.log(`▶️ Now playing chapter ${currentChapterIndex + 1}/${customPlaylist.length}: ${chapter.title}`);
  
  if (!seekToTime(chapter.timestamp)) {
    stopPlayback();
    return;
  }

  currentChapterIndex++;
  
  // Play next chapter if available
  if (currentChapterIndex < customPlaylist.length) {
    const currentSeconds = parseTimestamp(chapter.timestamp);
    const nextSeconds = parseTimestamp(customPlaylist[currentChapterIndex].timestamp);
    const duration = Math.max(100, (nextSeconds - currentSeconds) * 1000);
    
    playbackTimeout = setTimeout(playNextChapter, duration);
  } else {
    stopPlayback();
    console.log("✅ Custom playlist finished");
  }
};

const startCustomPlayback = (chapters) => {
  stopPlayback();
  
  customPlaylist = chapters;
  currentChapterIndex = 0;
  isCustomPlayback = true;
  
  console.log(`🎬 Starting custom playback with ${customPlaylist.length} chapters`);
  
  // Start playing the first chapter
  playNextChapter();
};

// Initialize when page loads
const initializeExtension = () => {
  if (!window.location.href.includes('/watch?v=')) return;
  
  // Clear stored chapters on page load
  const videoId = getVideoIdFromUrl(window.location.href);
  if (videoId) {
    chrome.storage.local.remove(`chapters_${videoId}`);
  }
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeExtension);
} else {
  initializeExtension();
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "GET_CHAPTERS") {
    const chapters = getChapters();
    sendResponse({ chapters });
    return true;
  }
  
  if (msg.type === "PLAY_CUSTOM_ORDER") {
    startCustomPlayback(msg.chapters);
    sendResponse({ success: true });
  }
  
  if (msg.type === "SEEK_TO_CHAPTER") {
    const success = seekToTime(msg.timestamp);
    sendResponse({ success });
  }
  
  if (msg.type === "STOP_PLAYBACK") {
    stopPlayback();
    sendResponse({ success: true });
  }
});
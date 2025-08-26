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

// Custom playlist playback system - completely rewritten
class ChapterPlaybackManager {
  constructor() {
    this.playlist = [];
    this.currentIndex = 0;
    this.isPlaying = false;
    this.timeoutId = null;
    this.videoElement = null;
    this.eventListeners = [];
    
    // Bind methods to maintain context
    this.handleTimeUpdate = this.handleTimeUpdate.bind(this);
    this.handleVideoEnd = this.handleVideoEnd.bind(this);
    this.handleSeeked = this.handleSeeked.bind(this);
  }
  
  start(chapters) {
    this.stop(); // Clean up any existing playback
    
    if (!chapters || chapters.length === 0) {
      console.error("No chapters provided for playback");
      return false;
    }
    
    this.playlist = [...chapters];
    this.currentIndex = 0;
    this.isPlaying = true;
    this.videoElement = getVideoPlayer();
    
    if (!this.videoElement) {
      console.error("Video player not found");
      return false;
    }
    
    console.log(`Starting custom playback with ${this.playlist.length} chapters`);
    
    // Add event listeners
    this.addEventListeners();
    
    // Start playing the first chapter
    this.playCurrentChapter();
    
    return true;
  }
  
  stop() {
    this.isPlaying = false;
    this.currentIndex = 0;
    
    // Clear any pending timeouts
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    
    // Remove event listeners
    this.removeEventListeners();
    
    console.log("Custom playback stopped");
  }
  
  addEventListeners() {
    if (!this.videoElement) return;
    
    // Remove existing listeners first
    this.removeEventListeners();
    
    // Add new listeners
    this.videoElement.addEventListener('timeupdate', this.handleTimeUpdate);
    this.videoElement.addEventListener('ended', this.handleVideoEnd);
    this.videoElement.addEventListener('seeked', this.handleSeeked);
    
    // Store references for cleanup
    this.eventListeners = [
      { event: 'timeupdate', handler: this.handleTimeUpdate },
      { event: 'ended', handler: this.handleVideoEnd },
      { event: 'seeked', handler: this.handleSeeked }
    ];
  }
  
  removeEventListeners() {
    if (this.videoElement && this.eventListeners.length > 0) {
      this.eventListeners.forEach(({ event, handler }) => {
        this.videoElement.removeEventListener(event, handler);
      });
    }
    this.eventListeners = [];
  }
  
  playCurrentChapter() {
    if (!this.isPlaying || this.currentIndex >= this.playlist.length) {
      this.stop();
      return;
    }
    
    const chapter = this.playlist[this.currentIndex];
    console.log(`Playing chapter ${this.currentIndex + 1}/${this.playlist.length}: ${chapter.title} at ${chapter.timestamp}`);
    
    if (!seekToTime(chapter.timestamp)) {
      console.error("Failed to seek to chapter timestamp");
      this.stop();
      return;
    }
    
    // Play the video if it's paused
    if (this.videoElement && this.videoElement.paused) {
      this.videoElement.play().catch(err => {
        console.error("Failed to play video:", err);
      });
    }
  }
  
  handleTimeUpdate() {
    if (!this.isPlaying || !this.videoElement) return;
    
    const currentTime = this.videoElement.currentTime;
    const currentChapter = this.playlist[this.currentIndex];
    
    if (!currentChapter) return;
    
    // Check if we need to move to the next chapter
    const nextChapterIndex = this.currentIndex + 1;
    if (nextChapterIndex < this.playlist.length) {
      const nextChapter = this.playlist[nextChapterIndex];
      const nextChapterTime = parseTimestamp(nextChapter.timestamp);
      
      // If current time has reached or passed the next chapter's start time
      if (currentTime >= nextChapterTime - 0.5) { // Small buffer to account for timing precision
        this.moveToNextChapter();
      }
    } else {
      // This is the last chapter, let it play until the end or user stops
      // We don't need to do anything special here
    }
  }
  
  handleVideoEnd() {
    if (!this.isPlaying) return;
    
    console.log("Video ended during custom playback");
    this.stop();
  }
  
  handleSeeked() {
    // This handles cases where the user manually seeks during playback
    if (!this.isPlaying || !this.videoElement) return;
    
    const currentTime = this.videoElement.currentTime;
    
    // Check if the user has seeked outside the current chapter's bounds
    const currentChapter = this.playlist[this.currentIndex];
    const currentChapterTime = parseTimestamp(currentChapter.timestamp);
    
    // Find which chapter the current time corresponds to
    let newChapterIndex = this.currentIndex;
    for (let i = 0; i < this.playlist.length; i++) {
      const chapterTime = parseTimestamp(this.playlist[i].timestamp);
      const nextChapterTime = i + 1 < this.playlist.length 
        ? parseTimestamp(this.playlist[i + 1].timestamp) 
        : Infinity;
      
      if (currentTime >= chapterTime && currentTime < nextChapterTime) {
        newChapterIndex = i;
        break;
      }
    }
    
    // If user seeked to a different chapter in our playlist
    if (newChapterIndex !== this.currentIndex) {
      this.currentIndex = newChapterIndex;
      console.log(`User seeked to chapter ${this.currentIndex + 1}: ${this.playlist[this.currentIndex].title}`);
    }
  }
  
  moveToNextChapter() {
    this.currentIndex++;
    
    if (this.currentIndex >= this.playlist.length) {
      console.log("All chapters completed");
      this.stop();
      return;
    }
    
    // Small delay to ensure smooth transition
    setTimeout(() => {
      this.playCurrentChapter();
    }, 100);
  }
  
  getCurrentChapterInfo() {
    if (!this.isPlaying || this.currentIndex >= this.playlist.length) {
      return null;
    }
    
    return {
      chapter: this.playlist[this.currentIndex],
      index: this.currentIndex,
      total: this.playlist.length,
      isPlaying: this.isPlaying
    };
  }
}

// Global instance
const playbackManager = new ChapterPlaybackManager();

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

// Handle navigation changes (YouTube is a single-page app)
let currentUrl = window.location.href;
const observer = new MutationObserver(() => {
  if (window.location.href !== currentUrl) {
    currentUrl = window.location.href;
    // Stop any ongoing playback when navigating to a different video
    playbackManager.stop();
    initializeExtension();
  }
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});

// Message handling
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "GET_CHAPTERS") {
    const chapters = getChapters();
    sendResponse({ chapters });
    return true;
  }
  
  if (msg.type === "PLAY_CUSTOM_ORDER") {
    const success = playbackManager.start(msg.chapters);
    sendResponse({ success });
    return true;
  }
  
  if (msg.type === "SEEK_TO_CHAPTER") {
    const success = seekToTime(msg.timestamp);
    sendResponse({ success });
    return true;
  }
  
  if (msg.type === "STOP_PLAYBACK") {
    playbackManager.stop();
    sendResponse({ success: true });
    return true;
  }
  
  if (msg.type === "GET_PLAYBACK_STATUS") {
    const status = playbackManager.getCurrentChapterInfo();
    sendResponse({ status });
    return true;
  }
});
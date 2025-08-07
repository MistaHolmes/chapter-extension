console.log("YouTube Chapter Extension: content script loaded.");

function parseTimestamp(ts) {
  const parts = ts.split(":").map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

const getChapters = () => {
  console.log("Getting chapters...");
  
  // Try multiple selectors for YouTube chapters
  const selectors = [
    "ytd-macro-markers-list-item-renderer",
    "ytd-chapter-renderer",
    "[class*='chapter']",
    "[class*='macro-marker']",
    "ytd-engagement-panel-section-list-renderer[target-id='engagement-panel-macro-markers-description-chapters'] ytd-macro-markers-list-item-renderer"
  ];
  
  let elements = [];
  let foundSelector = null;
  
  for (const selector of selectors) {
    elements = document.querySelectorAll(selector);
    console.log(`Selector "${selector}" found ${elements.length} elements`);
    if (elements.length > 0) {
      foundSelector = selector;
      break;
    }
  }
  
  if (elements.length === 0) {
    console.log("No chapter elements found with any selector");
    
    // Debug: Log all elements that might be chapters
    const allElements = document.querySelectorAll("*");
    let potentialChapters = [];
    allElements.forEach(el => {
      if (el.className && typeof el.className === 'string') {
        if (el.className.includes('chapter') || 
            el.className.includes('marker') || 
            el.className.includes('macro')) {
          potentialChapters.push({
            element: el,
            className: el.className,
            textContent: el.textContent?.substring(0, 100)
          });
        }
      }
    });
    
    console.log("Potential chapter elements found:", potentialChapters);
    return [];
  }

  console.log(`Using selector: ${foundSelector}`);
  
  const chapters = [...elements].map((item, index) => {
    console.log(`Processing element ${index}:`, item);
    
    // Try multiple ways to extract title and time
    let titleEl = item.querySelector("#title") || 
                  item.querySelector(".title") ||
                  item.querySelector("[class*='title']") ||
                  item.querySelector("yt-formatted-string");
    
    let timeEl = item.querySelector("#time") || 
                 item.querySelector(".time") ||
                 item.querySelector("[class*='time']") ||
                 item.querySelector("span");
    
    // If we can't find specific elements, try to extract from text content
    if (!titleEl || !timeEl) {
      const textContent = item.textContent;
      console.log("Full text content:", textContent);
      
      // Look for timestamp pattern (MM:SS or HH:MM:SS)
      const timestampMatch = textContent.match(/(\d{1,2}:\d{2}(?::\d{2})?)/);
      if (timestampMatch) {
        const timestamp = timestampMatch[1];
        const title = textContent.replace(timestamp, '').trim();
        
        if (title && timestamp) {
          console.log("Extracted from text - Title:", title, "Timestamp:", timestamp);
          return { title, timestamp };
        }
      }
    }
    
    const title = titleEl?.textContent?.trim();
    const timestamp = timeEl?.textContent?.trim();
    
    console.log("Extracted - Title:", title, "Timestamp:", timestamp);
    console.log("Title element:", titleEl);
    console.log("Time element:", timeEl);
    
    return { title, timestamp };
  }).filter(ch => {
    const isValid = ch.title && ch.timestamp && ch.timestamp.match(/\d{1,2}:\d{2}/);
    console.log("Chapter valid:", isValid, ch);
    return isValid;
  });
  
  console.log("Final chapters:", chapters);
  return chapters;
};

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
  console.log(`Seeked to ${timestamp} (${seconds} seconds)`);
  return true;
};

let customPlaylist = [];
let currentChapterIndex = 0;
let isCustomPlayback = false;

const playNextChapter = () => {
  if (!isCustomPlayback || customPlaylist.length === 0) return;

  if (currentChapterIndex >= customPlaylist.length) {
    console.log("Custom playlist finished");
    isCustomPlayback = false;
    return;
  }

  const chapter = customPlaylist[currentChapterIndex];
  console.log(`Playing chapter ${currentChapterIndex + 1}/${customPlaylist.length}: ${chapter.title}`);
  
  if (seekToTime(chapter.timestamp)) {
    currentChapterIndex++;
    
    // Calculate when to play next chapter
    if (currentChapterIndex < customPlaylist.length) {
      const currentSeconds = parseTimestamp(chapter.timestamp);
      const nextSeconds = parseTimestamp(customPlaylist[currentChapterIndex].timestamp);
      const duration = nextSeconds - currentSeconds;
      
      if (duration > 0) {
        setTimeout(playNextChapter, duration * 1000);
      } else {
        // If timestamps are out of order or equal, wait 5 seconds
        setTimeout(playNextChapter, 5000);
      }
    }
  }
};

const startCustomPlayback = (chapters) => {
  customPlaylist = chapters;
  currentChapterIndex = 0;
  isCustomPlayback = true;
  
  console.log("Starting custom playback with", chapters.length, "chapters");
  playNextChapter();
};

// Enhanced debugging function
const debugChapterElements = () => {
  console.log("🔍 DEBUG: Scanning entire page for chapter-like elements...");
  
  // Look for any element containing time-like patterns
  const allElements = document.querySelectorAll("*");
  const timePattern = /\d{1,2}:\d{2}(?::\d{2})?/;
  
  let foundElements = [];
  allElements.forEach(el => {
    if (el.textContent && timePattern.test(el.textContent) && el.textContent.length < 200) {
      foundElements.push({
        element: el,
        tagName: el.tagName,
        className: el.className,
        textContent: el.textContent.trim(),
        parent: el.parentElement?.tagName + '.' + el.parentElement?.className
      });
    }
  });
  
  console.log("🕒 Elements containing timestamps:", foundElements);
  
  // Also check for YouTube-specific elements
  const ytElements = document.querySelectorAll("[class*='ytd-']");
  console.log("🎬 YouTube-specific elements count:", ytElements.length);
  
  const chapterLikeElements = [];
  ytElements.forEach(el => {
    if (el.className.includes('macro') || 
        el.className.includes('chapter') || 
        el.className.includes('marker')) {
      chapterLikeElements.push({
        className: el.className,
        textContent: el.textContent?.substring(0, 100)
      });
    }
  });
  
  console.log("📚 Chapter-like YouTube elements:", chapterLikeElements);
};

// Function to check multiple times with enhanced debugging
const checkForChapters = (attempt = 1, maxAttempts = 10) => {
  console.log(`🔍 Checking for chapters - attempt ${attempt}/${maxAttempts}`);
  
  if (attempt === 1) {
    debugChapterElements();
  }
  
  const chapters = getChapters();
  
  if (chapters.length > 0) {
    console.log("✅ Chapters found, sending to popup:", chapters);
    chrome.runtime.sendMessage({ type: "CHAPTERS", chapters }, (response) => {
      if (chrome.runtime.lastError) {
        console.log("Error sending message (this is normal if popup is closed):", chrome.runtime.lastError.message);
      }
    });
    return;
  }
  
  if (attempt < maxAttempts) {
    console.log(`❌ No chapters found on attempt ${attempt}, trying again in 2 seconds...`);
    setTimeout(() => checkForChapters(attempt + 1, maxAttempts), 2000);
  } else {
    console.log("❌ No chapters found after all attempts");
    console.log("💡 Try opening the description panel or chapters panel manually");
  }
};

// Initialize when page loads
const initializeExtension = () => {
  console.log("🚀 Initializing extension...");
  console.log("Current URL:", window.location.href);
  console.log("Document ready state:", document.readyState);
  
  // Check if we're on a video page
  if (!window.location.href.includes('/watch?v=')) {
    console.log("⚠️ Not on a video page, skipping initialization");
    return;
  }
  
  // Start checking for chapters with a longer initial delay
  setTimeout(() => checkForChapters(), 3000);
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeExtension);
} else {
  initializeExtension();
}

// Also try to initialize when navigation happens (YouTube is a SPA)
let lastUrl = location.href;
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    console.log("🔄 YouTube navigation detected to:", url);
    if (url.includes('/watch?v=')) {
      setTimeout(() => checkForChapters(), 3000);
    }
  }
}).observe(document, { subtree: true, childList: true });

// Listen for messages from popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log("📨 Received message:", msg.type);
  
  if (msg.type === "GET_CHAPTERS") {
    const chapters = getChapters();
    console.log("Responding with chapters:", chapters);
    sendResponse({ chapters });
  }
  
  if (msg.type === "PLAY_CUSTOM_ORDER") {
    startCustomPlayback(msg.chapters);
    sendResponse({ success: true });
  }
  
  if (msg.type === "SEEK_TO_CHAPTER") {
    const success = seekToTime(msg.timestamp);
    sendResponse({ success });
  }
});
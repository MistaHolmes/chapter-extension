console.log("Popup script loaded");

let currentChapters = [];
let currentVideoId = null;
let playbackCheckInterval = null;

function renderChapters(chapters) {
  console.log("Rendering chapters:", chapters);
  const list = document.getElementById("chapterList");
  list.innerHTML = "";

  if (chapters && chapters.length > 0) {
    chapters.forEach((ch, index) => {
      const li = document.createElement("li");
      li.className = "chapter-item";
      li.innerHTML = `
        <div class="chapter-details">
            <span class="chapter-timestamp">${ch.timestamp}</span>
            <span class="chapter-title">${ch.title}</span>
        </div>
        <div class="drag-handle"></div>
      `;
      li.dataset.index = index;
      li.dataset.timestamp = ch.timestamp;
      
      // Add click handler to jump to chapter
      li.addEventListener('click', (e) => {
        if (!e.target.classList.contains('drag-handle')) {
          jumpToChapter(ch.timestamp);
        }
      });
      
      list.appendChild(li);
    });

    const sortableList = document.getElementById("chapterList");
    if (sortableList) {
      new Sortable(sortableList, {
        animation: 150,
        ghostClass: "dragging",
        handle: ".drag-handle",
        onEnd: function(evt) {
          console.log("Chapter reordered");
          updateChapterOrder();
          saveChapterOrder();
        }
      });
      console.log("Chapters rendered and sortable initialized");
    }
  } else {
    list.innerHTML = '<li class="empty-state">No chapters found on this video</li>';
  }
}

function updateChapterOrder() {
  const items = document.querySelectorAll("#chapterList .chapter-item");
  const reorderedChapters = [];
  
  items.forEach(item => {
    const originalIndex = item.dataset.index;
    reorderedChapters.push(currentChapters[originalIndex]);
  });
  
  currentChapters = reorderedChapters;
  console.log("New chapter order:", currentChapters);
}

function saveChapterOrder() {
  if (currentVideoId && currentChapters.length > 0) {
    const storageKey = `chapters_${currentVideoId}`;
    chrome.storage.local.set({ [storageKey]: currentChapters }, () => {
      console.log("Chapter order saved");
    });
  }
}

async function loadChapterOrder() {
  if (!currentVideoId) return null;
  
  return new Promise((resolve) => {
    const storageKey = `chapters_${currentVideoId}`;
    chrome.storage.local.get([storageKey], (result) => {
      resolve(result[storageKey]);
    });
  });
}

function getVideoIdFromUrl(url) {
  const urlObj = new URL(url);
  return urlObj.searchParams.get("v");
}

function jumpToChapter(timestamp) {
  console.log("Jumping to chapter:", timestamp);
  
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(
      tabs[0].id,
      { type: "SEEK_TO_CHAPTER", timestamp },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error("Error jumping to chapter:", chrome.runtime.lastError.message);
        } else if (response?.success) {
          console.log("Successfully jumped to chapter");
        }
      }
    );
  });
}

async function requestChapters() {
  console.log("Requesting chapters...");
  
  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    if (!tabs[0]) {
      console.error("No active tab found");
      return;
    }

    const currentUrl = tabs[0].url;
    console.log("Current tab URL:", currentUrl);

    if (!currentUrl.includes("youtube.com/watch")) {
      document.getElementById("chapterList").innerHTML = 
        '<li class="empty-state">Please navigate to a YouTube video page</li>';
      return;
    }

    currentVideoId = getVideoIdFromUrl(currentUrl);
    const storedChapters = await loadChapterOrder();
    
    // Always fetch fresh chapters
    chrome.tabs.sendMessage(
      tabs[0].id,
      { type: "GET_CHAPTERS" },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error("Error:", chrome.runtime.lastError.message);
          document.getElementById("chapterList").innerHTML = 
            '<li class="empty-state">Please refresh the page and try again</li>';
          return;
        }
        
        console.log("Response:", response);
        
        if (response?.chapters?.length > 0) {
          console.log("Chapters received:", response.chapters.length);
          
          // Use stored order if available, otherwise use fresh chapters
          currentChapters = storedChapters || response.chapters;
          renderChapters(currentChapters);
          
          // Start checking playback status
          checkPlaybackStatus();
          
        } else {
          console.log("No chapters found");
          document.getElementById("chapterList").innerHTML = 
            '<li class="empty-state">No chapters found on this video</li>';
        }
      }
    );
  });
}

function playCustomOrder() {
  console.log("Play custom order clicked");
  
  if (currentChapters.length === 0) {
    alert("No chapters available to play!");
    return;
  }

  // Update button state
  updatePlayButton("stopping", "Stopping...");

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(
      tabs[0].id,
      { 
        type: "PLAY_CUSTOM_ORDER", 
        chapters: currentChapters 
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error("Error:", chrome.runtime.lastError.message);
          updatePlayButton("play", "Play Custom Order");
        } else if (response?.success) {
          console.log("Playback started");
          updatePlayButton("stop", "Stop Playback");
          // Don't close popup immediately, let user see the status
          setTimeout(() => {
            if (document.getElementById("play-btn").textContent.includes("Stop")) {
              window.close();
            }
          }, 1000);
        } else {
          updatePlayButton("play", "Play Custom Order");
        }
      }
    );
  });
}

function stopPlayback() {
  console.log("Stop playback clicked");
  
  updatePlayButton("stopping", "Stopping...");

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(
      tabs[0].id,
      { type: "STOP_PLAYBACK" },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error("Error:", chrome.runtime.lastError.message);
        }
        updatePlayButton("play", "Play Custom Order");
      }
    );
  });
}

function updatePlayButton(state, text) {
  const btn = document.getElementById("play-btn");
  btn.textContent = text;
  btn.disabled = state === "stopping";
  
  // Update click handler based on state
  btn.onclick = null; // Remove existing handler
  if (state === "play") {
    btn.onclick = playCustomOrder;
  } else if (state === "stop") {
    btn.onclick = stopPlayback;
  }
}

function checkPlaybackStatus() {
  // Clear existing interval
  if (playbackCheckInterval) {
    clearInterval(playbackCheckInterval);
  }
  
  // Check status every second
  playbackCheckInterval = setInterval(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) return;
      
      chrome.tabs.sendMessage(
        tabs[0].id,
        { type: "GET_PLAYBACK_STATUS" },
        (response) => {
          if (chrome.runtime.lastError) {
            // Content script might not be ready, that's okay
            return;
          }
          
          if (response?.status?.isPlaying) {
            const { chapter, index, total } = response.status;
            updatePlayButton("stop", `Stop (${index + 1}/${total})`);
            
            // Highlight current chapter
            highlightCurrentChapter(index);
          } else {
            updatePlayButton("play", "Play Custom Order");
            clearChapterHighlight();
          }
        }
      );
    });
  }, 1000);
}

function highlightCurrentChapter(index) {
  // Remove existing highlights
  clearChapterHighlight();
  
  // Add highlight to current chapter
  const items = document.querySelectorAll("#chapterList .chapter-item");
  if (items[index]) {
    items[index].style.backgroundColor = "#e3f2fd";
    items[index].style.borderColor = "#1976d2";
  }
}

function clearChapterHighlight() {
  const items = document.querySelectorAll("#chapterList .chapter-item");
  items.forEach(item => {
    item.style.backgroundColor = "";
    item.style.borderColor = "";
  });
}

document.addEventListener("DOMContentLoaded", () => {
  console.log("Popup DOM loaded");
  
  // Add some delay to ensure the page is fully loaded
  setTimeout(() => {
    requestChapters();
  }, 300);

  // Initial button setup
  updatePlayButton("play", "Play Custom Order");
  
  // Clean up interval when popup closes
  window.addEventListener('beforeunload', () => {
    if (playbackCheckInterval) {
      clearInterval(playbackCheckInterval);
    }
  });
});
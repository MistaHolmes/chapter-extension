console.log("🎬 Popup script loaded");

let currentChapters = [];
let currentVideoId = null;

function renderChapters(chapters) {
  console.log("🎨 Rendering chapters:", chapters);
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
      list.appendChild(li);
    });

    const sortableList = document.getElementById("chapterList");
    if (sortableList) {
      new Sortable(sortableList, {
        animation: 150,
        ghostClass: "dragging",
        handle: ".drag-handle",
        onEnd: function(evt) {
          console.log("🔄 Chapter reordered");
          updateChapterOrder();
          saveChapterOrder();
        }
      });
      console.log("✅ Chapters rendered and sortable initialized");
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
  console.log("📝 New chapter order:", currentChapters);
}

function saveChapterOrder() {
  if (currentVideoId && currentChapters.length > 0) {
    const storageKey = `chapters_${currentVideoId}`;
    chrome.storage.local.set({ [storageKey]: currentChapters }, () => {
      console.log("💾 Chapter order saved");
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

async function requestChapters() {
  console.log("📞 Requesting chapters...");
  
  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    if (!tabs[0]) {
      console.error("❌ No active tab found");
      return;
    }

    const currentUrl = tabs[0].url;
    console.log("🌐 Current tab URL:", currentUrl);

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
          console.error("❌ Error:", chrome.runtime.lastError.message);
          document.getElementById("chapterList").innerHTML = 
            '<li class="empty-state">Please refresh the page and try again</li>';
          return;
        }
        
        console.log("📨 Response:", response);
        
        if (response?.chapters?.length > 0) {
          console.log("✅ Chapters received:", response.chapters.length);
          
          // Use stored order if available, otherwise use fresh chapters
          currentChapters = storedChapters || response.chapters;
          renderChapters(currentChapters);
          
          // Save only if we're using stored chapters
          if (storedChapters) {
            saveChapterOrder();
          }
        } else {
          console.log("❌ No chapters found");
          document.getElementById("chapterList").innerHTML = 
            '<li class="empty-state">No chapters found on this video</li>';
        }
      }
    );
  });
}

function playCustomOrder() {
  console.log("▶️ Play custom order clicked");
  
  if (currentChapters.length === 0) {
    alert("No chapters available to play!");
    return;
  }

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(
      tabs[0].id,
      { 
        type: "PLAY_CUSTOM_ORDER", 
        chapters: currentChapters 
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error("❌ Error:", chrome.runtime.lastError.message);
        } else {
          console.log("✅ Playback started");
          window.close();
        }
      }
    );
  });
}

document.addEventListener("DOMContentLoaded", () => {
  console.log("📄 Popup DOM loaded");
  
  setTimeout(() => {
    requestChapters();
  }, 100);

  document.getElementById("play-btn").addEventListener("click", playCustomOrder);
});
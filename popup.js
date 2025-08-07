console.log("🎬 Popup script loaded");

let currentChapters = [];

function renderChapters(chapters) {
  console.log("🎨 Rendering chapters:", chapters);
  const list = document.getElementById("chapterList");
  list.innerHTML = "";

  chapters.forEach((ch, index) => {
    const li = document.createElement("li");
    li.className = "chapter-item";
    li.innerHTML = `
    <div class="chapter-details">
        <span class="chapter-timestamp">${ch.timestamp}</span>
        <span class="chapter-title">${ch.title}</span>
    </div>
    <div class="drag-handle">⋮⋮</div>
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
        saveChapterOrder(); // Save the new order
      }
    });
    console.log("✅ Chapters rendered and sortable initialized");
  } else {
    console.error("❌ Chapter list element not found for Sortable initialization.");
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
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const videoId = getVideoIdFromUrl(tabs[0].url);
    if (videoId) {
      const storageKey = `chapters_${videoId}`;
      chrome.storage.local.set({ [storageKey]: currentChapters }, () => {
        console.log("💾 Chapter order saved successfully.");
      });
    }
  });
}

function loadChapterOrder(videoId) {
  return new Promise((resolve) => {
    const storageKey = `chapters_${videoId}`;
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
  console.log("📞 Requesting chapters from content script...");
  
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

    const videoId = getVideoIdFromUrl(currentUrl);
    let storedChapters = null;
    if (videoId) {
      storedChapters = await loadChapterOrder(videoId);
    }

    if (storedChapters) {
      console.log("✅ Loaded chapters from storage.");
      currentChapters = storedChapters;
      renderChapters(storedChapters);
    } else {
      chrome.tabs.sendMessage(
        tabs[0].id,
        { type: "GET_CHAPTERS" },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error("❌ Error sending message:", chrome.runtime.lastError.message);
            document.getElementById("chapterList").innerHTML = 
              '<li class="empty-state">Please refresh the YouTube page and try again</li>';
            return;
          }
          
          console.log("📨 Response from content script:", response);
          
          if (response?.chapters && response.chapters.length > 0) {
            console.log("✅ Chapters received:", response.chapters.length);
            currentChapters = response.chapters;
            renderChapters(response.chapters);
            saveChapterOrder();
          } else {
            console.log("❌ No chapters in response");
            document.getElementById("chapterList").innerHTML = 
              '<li class="empty-state">No chapters found on this video</li>';
          }
        }
      );
    }
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
          console.error("❌ Error sending play message:", chrome.runtime.lastError.message);
        } else {
          console.log("✅ Custom order sent to content script");
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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("📨 Popup received message:", message.type);
  
  if (message.type === "CHAPTERS") {
    console.log("📘 Chapters received via background message:", message.chapters);
    currentChapters = message.chapters;
    if (currentChapters.length > 0) {
      renderChapters(currentChapters);
      saveChapterOrder();
    } else {
      document.getElementById("chapterList").innerHTML = 
        '<li class="empty-state">No chapters found on this video</li>';
    }
  }
});
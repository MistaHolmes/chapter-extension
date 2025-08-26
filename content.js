// YouTube Chapter Reorder Extension
class ChapterManager {
  constructor() {
    this.chapters = [];
    this.customOrder = [];
    this.currentChapter = 0;
    this.video = null;
    this.ui = null;
    this.init();
  }

  init() {
    this.waitForVideo().then(() => {
      this.extractChapters();
      this.createUI();
      this.setupEventListeners();
    });
  }

  async waitForVideo() {
    return new Promise((resolve) => {
      const checkVideo = () => {
        const video = document.querySelector('video');
        if (video && video.readyState >= 1 && video.duration > 0) {
          this.video = video;
          console.log('Video found with duration:', video.duration);
          
          // Wait for YouTube's data to be fully loaded
          setTimeout(() => {
            resolve();
          }, 3000);
        } else {
          setTimeout(checkVideo, 500);
        }
      };
      checkVideo();
    });
  }

  extractChapters() {
    const chapters = [];
    console.log('Starting chapter extraction...');
    
    // Method 1: Try YouTube's native chapter data from the player
    try {
      // Wait for the page to be fully loaded
      const ytInitialData = window.ytInitialData;
      const ytInitialPlayerResponse = window.ytInitialPlayerResponse;
      
      // Try from player response
      if (ytInitialPlayerResponse?.playerOverlays?.playerOverlayRenderer?.decoratedPlayerBarRenderer?.decoratedPlayerBarRenderer?.playerBar?.multiMarkersPlayerBarRenderer?.markersMap) {
        const markersMap = ytInitialPlayerResponse.playerOverlays.playerOverlayRenderer.decoratedPlayerBarRenderer.decoratedPlayerBarRenderer.playerBar.multiMarkersPlayerBarRenderer.markersMap;
        
        for (const marker of markersMap) {
          if (marker.value?.chapters) {
            marker.value.chapters.forEach((chapter, index) => {
              const timeMs = chapter.chapterRenderer.timeRangeStartMillis;
              const timeSeconds = Math.floor(timeMs / 1000);
              chapters.push({
                time: timeSeconds,
                title: chapter.chapterRenderer.title.simpleText || `Chapter ${index + 1}`,
                timeStr: this.secondsToTime(timeSeconds)
              });
            });
            break;
          }
        }
      }
      
      // Alternative path in ytInitialPlayerResponse
      if (chapters.length === 0 && ytInitialPlayerResponse?.playerOverlays?.playerOverlayRenderer?.decoratedPlayerBarRenderer?.playerBar?.multiMarkersPlayerBarRenderer?.markersMap) {
        const markers = ytInitialPlayerResponse.playerOverlays.playerOverlayRenderer.decoratedPlayerBarRenderer.playerBar.multiMarkersPlayerBarRenderer.markersMap;
        if (markers && markers[0]?.value?.chapters) {
          markers[0].value.chapters.forEach((chapter, index) => {
            const timeMs = chapter.chapterRenderer?.timeRangeStartMillis || 0;
            const timeSeconds = Math.floor(timeMs / 1000);
            chapters.push({
              time: timeSeconds,
              title: chapter.chapterRenderer?.title?.simpleText || `Chapter ${index + 1}`,
              timeStr: this.secondsToTime(timeSeconds)
            });
          });
        }
      }
      
      console.log('Method 1 (API) found:', chapters.length, 'chapters');
    } catch (e) {
      console.log('Chapter API method failed:', e);
    }

    // Method 2: Look for chapter progress bar elements
    if (chapters.length === 0) {
      const progressList = document.querySelector('.ytp-progress-list');
      if (progressList) {
        const markers = progressList.querySelectorAll('.ytp-progress-list-item');
        markers.forEach((marker, index) => {
          const style = marker.getAttribute('style') || '';
          const leftMatch = style.match(/left:\s*(\d+(?:\.\d+)?)%/);
          if (leftMatch && this.video && this.video.duration) {
            const percentage = parseFloat(leftMatch[1]);
            const timeSeconds = Math.floor((percentage / 100) * this.video.duration);
            const title = marker.getAttribute('aria-label') || `Chapter ${index + 1}`;
            
            chapters.push({
              time: timeSeconds,
              title: title,
              timeStr: this.secondsToTime(timeSeconds)
            });
          }
        });
      }
      console.log('Method 2 (progress bar) found:', chapters.length, 'chapters');
    }

    // Method 3: Extract from description with better timestamp detection
    if (chapters.length === 0) {
      const descriptionSelectors = [
        '#description-inline-expander #description-text',
        '#description-text',
        '#content-text',
        '.content-text',
        'ytd-text-inline-expander #plain-snippet-text'
      ];
      
      for (const selector of descriptionSelectors) {
        const description = document.querySelector(selector);
        if (description) {
          const text = description.textContent;
          const lines = text.split('\n');
          
          lines.forEach(line => {
            // Enhanced regex for timestamps: 0:00, 1:23, 12:34, 1:23:45
            const timeMatch = line.match(/(?:^|\s)(\d{1,2}:(?:\d{2}:)?\d{2})(?=\s|$)/);
            if (timeMatch) {
              const timeStr = timeMatch[1];
              const seconds = this.timeToSeconds(timeStr);
              // Get title by removing timestamp and common prefixes
              let title = line.replace(timeMatch[0], '').replace(/^[-\s]*/, '').trim();
              if (!title) title = `Chapter at ${timeStr}`;
              
              // Avoid duplicates
              if (!chapters.find(ch => Math.abs(ch.time - seconds) < 5)) {
                chapters.push({ 
                  time: seconds, 
                  title: title,
                  timeStr: this.secondsToTime(seconds)
                });
              }
            }
          });
          
          if (chapters.length > 0) break;
        }
      }
      console.log('Method 3 (description) found:', chapters.length, 'chapters');
    }

    // Method 4: Look for chapter DOM elements (macro markers)
    if (chapters.length === 0) {
      const chapterElements = document.querySelectorAll('ytd-macro-markers-list-item-renderer');
      chapterElements.forEach((el, index) => {
        const titleEl = el.querySelector('#details #title') || el.querySelector('[id="title"]');
        const timeEl = el.querySelector('#time') || el.querySelector('.ytp-progress-list-item');
        
        let title = titleEl?.textContent?.trim() || `Chapter ${index + 1}`;
        let timeSeconds = 0;
        
        if (timeEl) {
          const timeText = timeEl.textContent || timeEl.getAttribute('aria-label') || '';
          const timeMatch = timeText.match(/(\d{1,2}:(?:\d{2}:)?\d{2})/);
          if (timeMatch) {
            timeSeconds = this.timeToSeconds(timeMatch[1]);
          }
        }
        
        chapters.push({
          time: timeSeconds,
          title: title,
          timeStr: this.secondsToTime(timeSeconds)
        });
      });
      console.log('Method 4 (DOM elements) found:', chapters.length, 'chapters');
    }

    // Sort chapters by time and remove duplicates
    chapters.sort((a, b) => a.time - b.time);
    const uniqueChapters = chapters.filter((chapter, index, arr) => 
      index === 0 || Math.abs(chapter.time - arr[index - 1].time) > 5
    );

    // Fallback: Create chapters if none found and video is long enough
    if (uniqueChapters.length === 0 && this.video && this.video.duration > 300) { // 5+ minutes
      const duration = this.video.duration;
      const numChapters = Math.min(Math.floor(duration / 120), 10); // Max 10 chapters, every 2 minutes
      const chapterLength = duration / numChapters;
      
      for (let i = 0; i < numChapters; i++) {
        const timeSeconds = Math.floor(i * chapterLength);
        uniqueChapters.push({
          time: timeSeconds,
          title: `Chapter ${i + 1}`,
          timeStr: this.secondsToTime(timeSeconds)
        });
      }
      console.log('Method 5 (fallback) created:', uniqueChapters.length, 'chapters');
    }

    console.log('Final chapters extracted:', uniqueChapters);
    this.chapters = uniqueChapters;
    this.customOrder = [...uniqueChapters];
  }

  timeToSeconds(timeStr) {
    const parts = timeStr.split(':').map(Number);
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    } else if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return 0;
  }

  secondsToTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }

  createUI() {
    // Remove existing UI if present
    const existing = document.getElementById('chapter-reorder-ui');
    if (existing) existing.remove();

    // Create main container
    const container = document.createElement('div');
    container.id = 'chapter-reorder-ui';
    container.className = 'chapter-reorder-container';
    
    container.innerHTML = `
      <div class="chapter-header">
        <h3>📹 Chapter Reorder</h3>
        <div class="chapter-controls">
          <button id="toggle-chapters" class="chapter-btn">Show Chapters</button>
          <button id="reset-order" class="chapter-btn">Reset Order</button>
          <button id="debug-chapters" class="chapter-btn">🔍 Debug</button>
          <button id="play-custom" class="chapter-btn primary">▶ Play Custom Order</button>
        </div>
      </div>
      <div id="chapters-panel" class="chapters-panel hidden">
        <div class="chapters-list" id="chapters-list"></div>
      </div>
    `;

    // Insert after video or in sidebar
    const insertPoint = document.querySelector('#secondary') || 
                       document.querySelector('#primary') ||
                       document.querySelector('#page-manager');
    
    if (insertPoint) {
      if (insertPoint.id === 'secondary') {
        insertPoint.insertBefore(container, insertPoint.firstChild);
      } else {
        insertPoint.appendChild(container);
      }
    }

    this.ui = container;
    this.renderChaptersList();
  }

  renderChaptersList() {
    const listContainer = document.getElementById('chapters-list');
    if (!listContainer) return;

    listContainer.innerHTML = '';
    
    this.customOrder.forEach((chapter, index) => {
      const item = document.createElement('div');
      item.className = 'chapter-item';
      item.draggable = true;
      item.dataset.index = index;
      
      item.innerHTML = `
        <div class="chapter-drag-handle">⋮⋮</div>
        <div class="chapter-info">
          <div class="chapter-title">${chapter.title}</div>
          <div class="chapter-time">${chapter.timeStr}</div>
        </div>
        <div class="chapter-actions">
          <button class="chapter-play-btn" data-time="${chapter.time}">▶</button>
          <button class="chapter-move-up" data-index="${index}">↑</button>
          <button class="chapter-move-down" data-index="${index}">↓</button>
        </div>
      `;
      
      // Add drag and drop listeners
      item.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', index);
        item.classList.add('dragging');
      });
      
      item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
      });
      
      item.addEventListener('dragover', (e) => {
        e.preventDefault();
      });
      
      item.addEventListener('drop', (e) => {
        e.preventDefault();
        const draggedIndex = parseInt(e.dataTransfer.getData('text/plain'));
        const targetIndex = parseInt(item.dataset.index);
        this.moveChapter(draggedIndex, targetIndex);
      });
      
      listContainer.appendChild(item);
    });
  }

  setupEventListeners() {
    // Toggle chapters panel
    document.getElementById('toggle-chapters')?.addEventListener('click', () => {
      const panel = document.getElementById('chapters-panel');
      const btn = document.getElementById('toggle-chapters');
      panel.classList.toggle('hidden');
      btn.textContent = panel.classList.contains('hidden') ? 'Show Chapters' : 'Hide Chapters';
    });

    // Reset order
    document.getElementById('reset-order')?.addEventListener('click', () => {
      this.customOrder = [...this.chapters];
      this.renderChaptersList();
    });

    // Play custom order
    document.getElementById('play-custom')?.addEventListener('click', () => {
      this.playCustomOrder();
    });

    // Debug chapters
    document.getElementById('debug-chapters')?.addEventListener('click', () => {
      console.log('=== CHAPTER DEBUG INFO ===');
      console.log('Video duration:', this.video?.duration);
      console.log('Found chapters:', this.chapters);
      
      // Check various selectors
      const selectors = [
        'ytd-macro-markers-list-item-renderer',
        '.ytp-chapter-title-content', 
        '#description-text',
        '.ytp-progress-list .ytp-progress-list-item'
      ];
      
      selectors.forEach(sel => {
        const elements = document.querySelectorAll(sel);
        console.log(`${sel}: ${elements.length} elements found`);
        if (elements.length > 0) {
          console.log('First element:', elements[0]);
        }
      });
      
      // Check for YouTube data
      console.log('ytInitialPlayerResponse:', window.ytInitialPlayerResponse?.playerOverlays);
      
      alert(`Found ${this.chapters.length} chapters. Check console for details.`);
    });

    // Chapter actions (using event delegation)
    document.getElementById('chapters-list')?.addEventListener('click', (e) => {
      if (e.target.classList.contains('chapter-play-btn')) {
        const time = parseFloat(e.target.dataset.time);
        this.video.currentTime = time;
        this.video.play();
      } else if (e.target.classList.contains('chapter-move-up')) {
        const index = parseInt(e.target.dataset.index);
        if (index > 0) this.moveChapter(index, index - 1);
      } else if (e.target.classList.contains('chapter-move-down')) {
        const index = parseInt(e.target.dataset.index);
        if (index < this.customOrder.length - 1) this.moveChapter(index, index + 1);
      }
    });
  }

  moveChapter(fromIndex, toIndex) {
    const item = this.customOrder.splice(fromIndex, 1)[0];
    this.customOrder.splice(toIndex, 0, item);
    this.renderChaptersList();
  }

  async playCustomOrder() {
    if (this.customOrder.length === 0) return;
    
    this.currentChapter = 0;
    await this.playChapter(0);
    
    // Monitor video progress and auto-advance
    this.video.addEventListener('timeupdate', () => {
      this.handleVideoProgress();
    });
  }

  async playChapter(index) {
    if (index >= this.customOrder.length) {
      // Playlist finished
      console.log('Custom chapter order finished!');
      return;
    }

    const chapter = this.customOrder[index];
    this.video.currentTime = chapter.time;
    
    // Highlight current chapter in UI
    document.querySelectorAll('.chapter-item').forEach((item, i) => {
      item.classList.toggle('current', i === index);
    });
    
    if (this.video.paused) {
      this.video.play();
    }
  }

  handleVideoProgress() {
    if (this.customOrder.length === 0) return;
    
    const currentChapter = this.customOrder[this.currentChapter];
    const nextChapter = this.customOrder[this.currentChapter + 1];
    
    // Check if we should advance to next chapter
    if (nextChapter && this.video.currentTime >= 
        (currentChapter.time + this.getChapterDuration(this.currentChapter))) {
      this.currentChapter++;
      this.playChapter(this.currentChapter);
    }
  }

  getChapterDuration(chapterIndex) {
    const current = this.customOrder[chapterIndex];
    const next = this.customOrder[chapterIndex + 1];
    
    if (next) {
      // Find next chapter in original timeline
      const nextOriginal = this.chapters.find(ch => ch.time > current.time);
      return nextOriginal ? nextOriginal.time - current.time : 60; // Default 1 minute
    }
    
    return this.video.duration - current.time;
  }
}

// Initialize when page loads
let chapterManager = null;
let isInitializing = false;

function initChapterManager() {
  // Prevent multiple simultaneous initializations
  if (isInitializing) return;
  isInitializing = true;
  
  // Clean up existing instance
  if (chapterManager) {
    const existingUI = document.getElementById('chapter-reorder-ui');
    if (existingUI) existingUI.remove();
    chapterManager = null;
  }
  
  // Create new instance with delay
  setTimeout(() => {
    chapterManager = new ChapterManager();
    isInitializing = false;
  }, 2000);
}

// Only initialize if we're on a watch page
if (location.href.includes('/watch')) {
  initChapterManager();
}

// Re-initialize when navigating to new video (YouTube SPA)
let currentUrl = location.href;
const observer = new MutationObserver((mutations) => {
  if (location.href !== currentUrl) {
    currentUrl = location.href;
    if (currentUrl.includes('/watch') && !isInitializing) {
      initChapterManager();
    }
  }
});

// Only observe if on YouTube
if (location.hostname === 'www.youtube.com') {
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}
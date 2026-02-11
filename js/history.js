/**
 * History page - display user's pet photos and generated videos
 */

const STYLE_LABELS = {
  'hip-hop': 'Hip Hop',
  'ballet': 'Ballet',
  'disco': 'Disco',
  'breakdance': 'Breakdance',
  'salsa': 'Salsa',
  'robot': 'Robot',
};

async function getImageUrl(path) {
  if (!path || !window.firebaseStorage) return null;
  try {
    const ref = window.firebaseStorage.ref(path);
    return await ref.getDownloadURL();
  } catch {
    return null;
  }
}

async function getVideoUrl(path) {
  if (!path || !window.PetDanceAPI) return null;
  try {
    return await PetDanceAPI.getVideoUrlFromPath(path);
  } catch {
    return null;
  }
}

function formatDate(timestamp) {
  if (!timestamp) return '';
  const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return Math.floor(diff / 60000) + ' min ago';
  if (diff < 86400000) return Math.floor(diff / 3600000) + ' hours ago';
  if (diff < 604800000) return Math.floor(diff / 86400000) + ' days ago';
  return d.toLocaleDateString();
}

function createJobCard(job) {
  const div = document.createElement('div');
  div.className = 'history-card';
  div.dataset.jobId = job.id;
  if (job.videoUrl) div.dataset.videoUrl = job.videoUrl;

  const styleLabel = STYLE_LABELS[job.danceStyle] || job.danceStyle || 'Dance';
  const dateStr = formatDate(job.createdAt);

  let thumbContent = '';
  if (job.imageUrl) {
    thumbContent = `<img src="${job.imageUrl}" alt="Pet photo" loading="lazy">`;
  } else {
    thumbContent = '<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:3rem;opacity:0.4;">📷</div>';
  }

  let mediaHtml = '';
  if (job.status === 'completed' && job.videoUrl) {
    mediaHtml = `
      <video src="${job.videoUrl}" preload="metadata" muted loop playsinline
        onmouseover="this.play()" onmouseout="this.pause()"
        onclick="event.stopPropagation(); this.paused ? this.play() : this.pause();"
        style="cursor:pointer;"></video>
    `;
  } else {
    mediaHtml = thumbContent;
  }

  const statusClass = `status-${job.status}`;

  div.innerHTML = `
    <div class="history-card-thumb">
      ${mediaHtml}
      <span class="status-badge ${statusClass}">${job.status}</span>
    </div>
    <div class="history-card-body">
      <div class="history-card-style">${styleLabel}</div>
      <div class="history-card-date">${dateStr}</div>
      <div class="history-card-actions">
        ${job.status === 'completed' && job.videoUrl ? `
          <button class="btn btn-primary btn-history-action" data-action="play" data-job-id="${job.id}">▶ Play</button>
          <button class="btn btn-secondary btn-history-action" data-action="download" data-job-id="${job.id}">⬇ Download</button>
        ` : ''}
        ${job.status === 'failed' && job.errorMessage ? `
          <span class="history-card-date" style="color:var(--color-error);">${job.errorMessage}</span>
        ` : ''}
      </div>
    </div>
  `;

  return div;
}

async function loadHistory() {
  const loadingEl = document.getElementById('history-loading');
  const emptyEl = document.getElementById('history-empty');
  const gridEl = document.getElementById('history-grid');

  const user = window.firebaseAuth?.currentUser;
  if (!user) {
    loadingEl.style.display = 'none';
    emptyEl.style.display = 'block';
    return;
  }

  const db = window.firebaseDb;
  if (!db) {
    loadingEl.innerHTML = '<p>Database not loaded.</p>';
    return;
  }

  try {
    const snapshot = await db.collection('jobs')
      .where('userId', '==', user.uid)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    loadingEl.style.display = 'none';

    if (snapshot.empty) {
      emptyEl.style.display = 'block';
      return;
    }

    gridEl.style.display = 'grid';
    gridEl.innerHTML = '';

    const jobs = [];
    for (const doc of snapshot.docs) {
      jobs.push({ id: doc.id, ...doc.data() });
    }

    // Load image and video URLs in parallel
    const enriched = await Promise.all(jobs.map(async (job) => {
      const [imageUrl, videoUrl] = await Promise.all([
        getImageUrl(job.inputImagePath),
        job.outputVideoPath ? getVideoUrl(job.outputVideoPath) : null,
      ]);
      return { ...job, imageUrl, videoUrl };
    }));

    enriched.forEach((job) => {
      gridEl.appendChild(createJobCard(job));
    });

    gridEl.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-history-action');
      if (!btn) return;
      const card = btn.closest('.history-card');
      const url = card?.dataset.videoUrl;
      if (!url) return;
      if (btn.dataset.action === 'play') {
        window.open(url, '_blank', 'noopener');
      } else if (btn.dataset.action === 'download') {
        const a = document.createElement('a');
        a.href = url;
        a.download = `petdance-${card.dataset.jobId}.mp4`;
        a.target = '_blank';
        a.click();
      }
    });
  } catch (err) {
    console.error('Load history error:', err);
    loadingEl.style.display = 'none';
    loadingEl.innerHTML = `<p style="color:var(--color-error);">Error loading videos: ${err.message}</p>`;
    loadingEl.style.display = 'block';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const checkAndLoad = () => {
    if (window.authManager?.isAuthenticated()) {
      loadHistory();
    } else {
      setTimeout(checkAndLoad, 200);
    }
  };
  checkAndLoad();
});

/**
 * NFA PASSBOOK — QR Code Scanning & Delivery Recording Workflow
 */
let scanStream = null;
let scanRAF = null;
let scanPaused = false;

SCREEN_RENDERERS.scan = async function (container) {
  container.innerHTML = `
    <div class="content no-pad-bottom">
      <h2 style="font-size:16px;font-weight:800; margin-bottom:12px;">Scan Passbook QR Code</h2>
      <div class="scanner-wrap" id="scanner-wrap">
        <video id="scan-video" playsinline autoplay muted></video>
        <div class="scanner-frame"></div>
        <div class="scanner-line"></div>
      </div>
      <p class="text-sm text-muted center">Align the camera over a printed Passbook ID QR code.</p>
      <div id="scan-status" class="center text-sm mt-8"></div>

      <div class="divider"></div>
      <div class="field">
        <label>Or enter Passbook Serial / RSBSA manually</label>
        <div style="display:flex; gap:8px;">
          <input type="text" id="manual-lookup" placeholder="e.g., NFAV-ALB26-FB-0001">
          <button class="btn btn-primary" id="manual-lookup-btn">Find</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('manual-lookup-btn').onclick = async () => {
    const q = document.getElementById('manual-lookup').value.trim();
    if (!q) return;
    const farmer = await db.farmers.get(q) || await db.farmers.where('rsbsa_no').equals(q).first();
    if (farmer) {
      stopScanner();
      navigate('passbookDetail', { id: farmer.passbook_id });
    } else {
      showToast('No matching Passbook found.', 'error');
    }
  };

  await startScanner();
};

async function startScanner() {
  const video = document.getElementById('scan-video');
  const statusEl = document.getElementById('scan-status');
  scanPaused = false;
  try {
    scanStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    });
    video.srcObject = scanStream;
    // Explicitly start playback — relying on the `autoplay` attribute alone is
    // unreliable on some mobile browsers once getUserMedia resolves asynchronously.
    try { await video.play(); } catch (playErr) { /* some browsers auto-play already */ }
    statusEl.textContent = '';

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const MAX_DIM = 900; // cap resolution for consistent, fast, reliable decoding

    const tick = () => {
      if (!video.videoWidth) { scanRAF = requestAnimationFrame(tick); return; }
      if (scanPaused) { scanRAF = requestAnimationFrame(tick); return; }

      const scale = Math.min(1, MAX_DIM / Math.max(video.videoWidth, video.videoHeight));
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
      if (code && code.data) {
        handleQrDetected(code.data);
      }
      scanRAF = requestAnimationFrame(tick);
    };
    scanRAF = requestAnimationFrame(tick);
  } catch (err) {
    statusEl.innerHTML = `<span style="color:var(--danger);">Camera access unavailable: ${err.message}. Use manual lookup below instead.</span>`;
  }
}

function stopScanner() {
  if (scanRAF) cancelAnimationFrame(scanRAF);
  if (scanStream) {
    scanStream.getTracks().forEach(t => t.stop());
    scanStream = null;
  }
}

async function handleQrDetected(rawText) {
  scanPaused = true;
  let payload;
  try {
    payload = JSON.parse(rawText);
  } catch (e) {
    scanPaused = false;
    return;
  }
  if (!payload.serial) { scanPaused = false; return; }

  const farmer = await db.farmers.get(payload.serial);
  if (!farmer) {
    showToast('QR code recognized, but no matching Passbook record exists locally.', 'error');
    setTimeout(() => { scanPaused = false; }, 1200);
    return;
  }

  playConfirmationTone();
  if (navigator.vibrate) navigator.vibrate([50, 40, 50]);
  stopScanner();
  showToast(`Passbook found: ${buildDisplayName(farmer)}`, 'success');
  navigate('passbookDetail', { id: farmer.passbook_id });
}

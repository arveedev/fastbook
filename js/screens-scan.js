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
      navigate('scanResult', { id: farmer.passbook_id });
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

  scanStream = await acquireCameraStream(statusEl);
  if (!scanStream) return; // acquireCameraStream already showed an error

  try {
    video.srcObject = scanStream;

    // Explicitly start playback — relying on the `autoplay` attribute alone is
    // unreliable on some mobile browsers once getUserMedia resolves asynchronously.
    try {
      await video.play();
    } catch (playErr) {
      statusEl.innerHTML = `<span style="color:var(--danger);">Camera preview could not start (${playErr.message}). Tap the field below to retry, or use manual lookup.</span>`;
      return;
    }
    statusEl.textContent = 'Starting camera feed...';

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const MAX_DIM = 900; // cap resolution for consistent, fast, reliable decoding
    const startedAt = Date.now();
    let stallWarningShown = false;
    let noCodeHintShown = false;
    let framesProcessed = 0;
    let consecutiveFrameErrors = 0;
    let lastErrorMessage = '';

    const tick = () => {
      if (scanPaused) { scanRAF = requestAnimationFrame(tick); return; }

      if (!video.videoWidth) {
        // The camera stream never produced a usable frame. Rather than looping
        // forever in silence, surface this to the user after a short grace period.
        if (!stallWarningShown && Date.now() - startedAt > 6000) {
          stallWarningShown = true;
          statusEl.innerHTML = `<span style="color:var(--warning);">Camera feed hasn't started yet. If your camera light is on but nothing appears, try closing other apps using the camera, or reload this page.</span>`;
        }
        scanRAF = requestAnimationFrame(tick);
        return;
      }

      // Every single frame is wrapped in try/catch. Without this, one thrown
      // error on any frame (e.g. a transient camera resolution change) would
      // silently kill this entire loop forever — the video preview and the
      // purely-decorative CSS scan-line animation both keep looking "alive"
      // with zero indication anything broke. This is almost certainly what
      // was causing scans to hang indefinitely with no data and no error.
      try {
        if (framesProcessed === 0) statusEl.textContent = '';
        framesProcessed++;

        const scale = Math.min(1, MAX_DIM / Math.max(video.videoWidth, video.videoHeight));
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        if (canvas.width > 0 && canvas.height > 0) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
          if (code && code.data) {
            handleQrDetected(code.data);
            scanRAF = requestAnimationFrame(tick);
            return;
          }
        }
        consecutiveFrameErrors = 0;
      } catch (frameErr) {
        consecutiveFrameErrors++;
        lastErrorMessage = frameErr.message;
        if (consecutiveFrameErrors > 20) {
          statusEl.innerHTML = `<span style="color:var(--danger);">Scanning stopped due to a repeated error (${lastErrorMessage}). Please use manual lookup below, or reload the page to retry.</span>`;
          return; // stop the loop rather than spin forever on a broken state
        }
      }

      // Ongoing feedback if the camera is clearly working but nothing has
      // been found for a while — better than leaving the user guessing.
      if (!noCodeHintShown && framesProcessed > 60 && Date.now() - startedAt > 12000) {
        noCodeHintShown = true;
        statusEl.innerHTML = `<span class="text-muted">Still scanning (${framesProcessed} frames analyzed) — try moving closer, improving lighting, or holding the ID flat and steady.</span>`;
      }

      scanRAF = requestAnimationFrame(tick);
    };
    scanRAF = requestAnimationFrame(tick);
  } catch (err) {
    statusEl.innerHTML = `<span style="color:var(--danger);">Camera access unavailable: ${err.message}. Use manual lookup below instead.</span>`;
  }
}

/** Requests the camera with a sensible ideal configuration, falling back to
 *  progressively simpler constraints if the device/browser rejects them —
 *  some browsers throw OverconstrainedError on options like `advanced`. */
async function acquireCameraStream(statusEl) {
  const attempts = [
    { video: { facingMode: { ideal: 'environment' }, advanced: [{ focusMode: 'continuous' }] } },
    { video: { facingMode: { ideal: 'environment' } } },
    { video: true }
  ];
  let lastError = null;
  for (const constraints of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      lastError = err;
    }
  }
  statusEl.innerHTML = `<span style="color:var(--danger);">Camera access unavailable: ${lastError ? lastError.message : 'unknown error'}. Use manual lookup below instead.</span>`;
  return null;
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
  navigate('scanResult', { id: farmer.passbook_id });
}

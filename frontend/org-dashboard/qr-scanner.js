/* ================================================================
   QR TICKET SCANNER — Organizer Dashboard
   Camera-based & manual QR code validation
   ================================================================ */

(function () {
  'use strict';

  let scannerOverlay = null;
  let videoStream = null;
  let scanInterval = null;
  let scanHistory = [];
  let scanStats = { ok: 0, fail: 0 };
  let currentEventId = null;

  // ── Public: open the scanner for an event ──
  window.openQRScanner = function (eventId, eventTitle) {
    currentEventId = eventId;
    scanHistory = [];
    scanStats = { ok: 0, fail: 0 };
    _buildModal(eventTitle);
    requestAnimationFrame(() => {
      scannerOverlay.classList.add('open');
    });
    document.addEventListener('keydown', _onEsc);
  };

  // ── Build DOM ──
  function _buildModal(eventTitle) {
    if (scannerOverlay) scannerOverlay.remove();

    scannerOverlay = document.createElement('div');
    scannerOverlay.className = 'qr-scanner-overlay';
    scannerOverlay.innerHTML = `
      <div class="qr-scanner-modal">
        <div class="qr-scanner-header">
          <h2>📱 Scan Tickets</h2>
          <button class="qr-scanner-close" id="qrScannerClose">&times;</button>
        </div>

        <p style="padding:0 var(--sp-lg);margin:0 0 var(--sp-md);color:var(--muted);font-size:13px;">
          ${eventTitle ? `<strong>${_esc(eventTitle)}</strong> — ` : ''}Scan attendee QR codes to check them in.
        </p>

        <!-- Stats -->
        <div class="qr-scan-stats" style="padding:0 var(--sp-lg);">
          <div class="qr-stat stat-ok">
            <div class="qr-stat-value" id="qrStatOk">0</div>
            <div class="qr-stat-label">Checked In</div>
          </div>
          <div class="qr-stat stat-fail">
            <div class="qr-stat-value" id="qrStatFail">0</div>
            <div class="qr-stat-label">Rejected</div>
          </div>
          <div class="qr-stat">
            <div class="qr-stat-value" id="qrStatTotal">0</div>
            <div class="qr-stat-label">Total Scans</div>
          </div>
        </div>

        <!-- Tab Switcher -->
        <div class="qr-scanner-tabs">
          <button class="qr-tab-btn active" data-tab="camera" id="qrTabCamera">📷 Camera</button>
          <button class="qr-tab-btn" data-tab="manual" id="qrTabManual">⌨️ Manual</button>
        </div>

        <div class="qr-scanner-body">
          <!-- Result -->
          <div class="qr-result" id="qrResult"></div>

          <!-- Camera Section -->
          <div class="qr-camera-section active" id="qrCameraSection">
            <div class="qr-camera-container" id="qrCameraContainer">
              <video id="qrVideo" autoplay playsinline muted></video>
              <canvas id="qrCanvas"></canvas>
              <div class="qr-scan-guide">
                <div class="qr-scan-frame">
                  <div class="qr-scan-line"></div>
                </div>
              </div>
              <div class="qr-camera-placeholder" id="qrCameraPlaceholder">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                  <circle cx="12" cy="13" r="4"/>
                </svg>
                <span>Starting camera...</span>
              </div>
            </div>
          </div>

          <!-- Manual Section -->
          <div class="qr-manual-section" id="qrManualSection">
            <div class="qr-manual-input-group">
              <input type="text" class="qr-manual-input" id="qrManualInput"
                     placeholder="Paste or type ticket QR code..."
                     autocomplete="off" spellcheck="false" />
              <button class="qr-verify-btn" id="qrVerifyBtn">Verify</button>
            </div>
          </div>

          <!-- Scan History -->
          <div id="qrHistorySection" style="margin-top:var(--sp-md);">
            <div class="qr-history-title">Scan History</div>
            <div class="qr-history-list" id="qrHistoryList">
              <div class="qr-history-empty">No scans yet — start scanning!</div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(scannerOverlay);

    // ── Bind events ──
    scannerOverlay.querySelector('#qrScannerClose').onclick = _close;
    scannerOverlay.addEventListener('click', (e) => {
      if (e.target === scannerOverlay) _close();
    });

    // Tab switching
    scannerOverlay.querySelector('#qrTabCamera').onclick = () => _switchTab('camera');
    scannerOverlay.querySelector('#qrTabManual').onclick = () => _switchTab('manual');

    // Manual verify
    scannerOverlay.querySelector('#qrVerifyBtn').onclick = _manualVerify;
    scannerOverlay.querySelector('#qrManualInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') _manualVerify();
    });

    // Start camera
    _startCamera();
  }

  // ── Tab switching ──
  function _switchTab(tab) {
    const camBtn = scannerOverlay.querySelector('#qrTabCamera');
    const manBtn = scannerOverlay.querySelector('#qrTabManual');
    const camSec = scannerOverlay.querySelector('#qrCameraSection');
    const manSec = scannerOverlay.querySelector('#qrManualSection');

    if (tab === 'camera') {
      camBtn.classList.add('active');
      manBtn.classList.remove('active');
      camSec.classList.add('active');
      manSec.classList.remove('active');
      _startCamera();
    } else {
      manBtn.classList.add('active');
      camBtn.classList.remove('active');
      manSec.classList.add('active');
      camSec.classList.remove('active');
      _stopCamera();
      setTimeout(() => scannerOverlay.querySelector('#qrManualInput').focus(), 100);
    }
  }

  // ── Camera ──
  async function _startCamera() {
    const video = scannerOverlay.querySelector('#qrVideo');
    const placeholder = scannerOverlay.querySelector('#qrCameraPlaceholder');

    try {
      videoStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 640 } }
      });
      video.srcObject = videoStream;
      video.style.display = 'block';
      placeholder.style.display = 'none';

      // Start scanning frames
      scanInterval = setInterval(() => _scanFrame(), 250);
    } catch (err) {
      placeholder.querySelector('span').textContent = 'Camera access denied. Use manual input.';
      console.warn('Camera error:', err);
    }
  }

  function _stopCamera() {
    if (scanInterval) { clearInterval(scanInterval); scanInterval = null; }
    if (videoStream) {
      videoStream.getTracks().forEach(t => t.stop());
      videoStream = null;
    }
  }

  function _scanFrame() {
    if (!videoStream || !scannerOverlay) return;
    const video = scannerOverlay.querySelector('#qrVideo');
    const canvas = scannerOverlay.querySelector('#qrCanvas');
    if (!video || video.readyState < 2) return;

    const ctx = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // Use jsQR if available
    if (typeof jsQR !== 'undefined') {
      const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' });
      if (code && code.data) {
        _validateQR(code.data);
        // Pause scanning briefly to avoid duplicate rapid scans
        clearInterval(scanInterval);
        setTimeout(() => {
          if (scannerOverlay) scanInterval = setInterval(() => _scanFrame(), 250);
        }, 2000);
      }
    }
  }

  // ── Manual verify ──
  function _manualVerify() {
    const input = scannerOverlay.querySelector('#qrManualInput');
    const value = input.value.trim();
    if (!value) return;
    _validateQR(value);
    input.value = '';
  }

  // ── Validate QR against backend ──
  async function _validateQR(qrCode) {
    const resultEl = scannerOverlay.querySelector('#qrResult');
    const verifyBtn = scannerOverlay.querySelector('#qrVerifyBtn');

    if (verifyBtn) verifyBtn.disabled = true;
    _showResult(resultEl, 'loading', '⏳', 'Verifying...', 'Checking ticket validity...');

    try {
      const res = await apiFetch('/ticket/validate_ticket', {
        method: 'POST',
        body: JSON.stringify({ qr_code: qrCode }),
      });

      const data = await res.json();

      if (res.ok) {
        // ✅ Entry allowed
        scanStats.ok++;
        const name = data.attendee_name || 'Attendee';
        const event = data.event_title || '';
        _showResult(resultEl, 'success', '✅', `Entry Allowed — ${name}`, event ? `Checked in to "${event}"` : 'Ticket validated successfully');
        _addHistory(true, name, new Date().toLocaleTimeString());

        // Play success sound (subtle vibration on mobile)
        if (navigator.vibrate) navigator.vibrate(200);
      } else {
        // ❌ Rejected
        scanStats.fail++;
        const detail = data.detail || 'Ticket invalid';

        // Pick icon/class based on error type
        let icon = '❌';
        let cls = 'error';
        if (detail.includes('already been used')) { icon = '🔄'; cls = 'warning'; }
        else if (detail.includes('cancelled')) { icon = '🚫'; cls = 'error'; }
        else if (detail.includes('not valid for today')) { icon = '📅'; cls = 'warning'; }

        _showResult(resultEl, cls, icon, 'Entry Denied', detail);
        _addHistory(false, detail, new Date().toLocaleTimeString());

        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
      }
    } catch (err) {
      scanStats.fail++;
      _showResult(resultEl, 'error', '⚠️', 'Network Error', 'Could not reach server. Please try again.');
      _addHistory(false, 'Network error', new Date().toLocaleTimeString());
    }

    _updateStats();
    if (verifyBtn) verifyBtn.disabled = false;
  }

  // ── UI helpers ──
  function _showResult(el, cls, icon, title, msg) {
    el.className = `qr-result show ${cls}`;
    el.innerHTML = `
      <div class="qr-result-icon">${icon}</div>
      <div class="qr-result-body">
        <h4>${_esc(title)}</h4>
        <p>${_esc(msg)}</p>
      </div>
    `;
  }

  function _addHistory(ok, label, time) {
    scanHistory.unshift({ ok, label, time });
    const list = scannerOverlay.querySelector('#qrHistoryList');
    list.innerHTML = scanHistory.map(h => `
      <div class="qr-history-item ${h.ok ? 'hi-ok' : 'hi-fail'}">
        <div class="hi-icon">${h.ok ? '✅' : '❌'}</div>
        <span class="hi-name">${_esc(h.label)}</span>
        <span class="hi-time">${h.time}</span>
      </div>
    `).join('');
  }

  function _updateStats() {
    const okEl = scannerOverlay.querySelector('#qrStatOk');
    const failEl = scannerOverlay.querySelector('#qrStatFail');
    const totalEl = scannerOverlay.querySelector('#qrStatTotal');
    if (okEl) okEl.textContent = scanStats.ok;
    if (failEl) failEl.textContent = scanStats.fail;
    if (totalEl) totalEl.textContent = scanStats.ok + scanStats.fail;
  }

  function _esc(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  // ── Close & cleanup ──
  function _close() {
    _stopCamera();
    if (scannerOverlay) {
      scannerOverlay.classList.remove('open');
      setTimeout(() => {
        if (scannerOverlay) { scannerOverlay.remove(); scannerOverlay = null; }
      }, 300);
    }
    document.removeEventListener('keydown', _onEsc);
  }

  function _onEsc(e) {
    if (e.key === 'Escape') _close();
  }

})();

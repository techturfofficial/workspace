const fs = require('fs');

const updatedModalHtml = `  <!-- Ultra-Modern Record Payment Modal -->
  <div class="pay-modal-overlay" id="record-payment-modal">
    <div class="pay-modal-card">
      <div class="pay-modal-header">
        <div class="pay-modal-title-wrap">
          <div class="pay-modal-icon-badge">
            <i class="fas fa-file-invoice-dollar"></i>
          </div>
          <div class="pay-modal-title-text">Record New Payment / Invoice</div>
        </div>
        <button type="button" class="pay-modal-close-btn" id="close-record-modal-btn" title="Close Modal">
          <i class="fas fa-times"></i>
        </button>
      </div>

      <form id="record-payment-form">
        <div class="pay-modal-body">
          <div class="pay-input-group">
            <label class="pay-input-label"><i class="fas fa-user-tie"></i> SELECT CLIENT *</label>
            <div class="pay-input-wrap">
              <i class="fas fa-building-user pay-input-icon"></i>
              <select class="pay-input" id="pay-client-select" required>
                <option value="">-- Choose Client --</option>
              </select>
            </div>
          </div>

          <div style="display:grid; grid-template-columns:1.5fr 1fr; gap:12px;">
            <div class="pay-input-group">
              <label class="pay-input-label"><i class="fas fa-money-bill-wave"></i> AMOUNT *</label>
              <div class="pay-input-wrap">
                <i class="fas fa-coins pay-input-icon"></i>
                <input type="number" step="0.01" class="pay-input" id="pay-amount-input" placeholder="e.g. 50000" required>
              </div>
            </div>
            <div class="pay-input-group">
              <label class="pay-input-label"><i class="fas fa-globe"></i> CURRENCY</label>
              <div class="pay-input-wrap">
                <i class="fas fa-dollar-sign pay-input-icon"></i>
                <select class="pay-input" id="pay-currency-select">
                  <option value="INR" selected>₹ INR</option>
                  <option value="USD">$ USD</option>
                  <option value="EUR">€ EUR</option>
                  <option value="GBP">£ GBP</option>
                </select>
              </div>
            </div>
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
            <div class="pay-input-group">
              <label class="pay-input-label"><i class="fas fa-credit-card"></i> PAYMENT METHOD</label>
              <div class="pay-input-wrap">
                <i class="fas fa-wallet pay-input-icon"></i>
                <select class="pay-input" id="pay-method-select">
                  <option value="UPI" selected>UPI / QR Scan</option>
                  <option value="Bank Transfer">Bank Wire / NEFT</option>
                  <option value="Credit Card">Credit / Debit Card</option>
                  <option value="Razorpay">Razorpay / Stripe</option>
                  <option value="Cash">Cash / Deposit</option>
                  <option value="Cheque">Cheque</option>
                </select>
              </div>
            </div>
            <div class="pay-input-group">
              <label class="pay-input-label"><i class="fas fa-shield-check"></i> PAYMENT STATUS</label>
              <div class="pay-input-wrap">
                <i class="fas fa-circle-info pay-input-icon"></i>
                <select class="pay-input" id="pay-status-select">
                  <option value="paid" selected>PAID & Settled</option>
                  <option value="pending">PENDING Clearance</option>
                  <option value="overdue">OVERDUE Arrears</option>
                </select>
              </div>
            </div>
          </div>

          <div class="pay-input-group">
            <label class="pay-input-label"><i class="fas fa-calendar-day"></i> PAYMENT DATE</label>
            <div class="pay-input-wrap">
              <i class="fas fa-calendar-alt pay-input-icon"></i>
              <input type="date" class="pay-input" id="pay-date-input">
            </div>
          </div>

          <div class="pay-input-group">
            <label class="pay-input-label"><i class="fas fa-hashtag"></i> NOTES & TRANSACTION REFERENCE</label>
            <div class="pay-input-wrap">
              <i class="fas fa-receipt pay-input-icon"></i>
              <input type="text" class="pay-input" id="pay-notes-input" placeholder="e.g. UTR #9823498234 / Milestone 1 deposit">
            </div>
          </div>

          <div class="pay-modal-footer">
            <button type="button" class="pay-btn-secondary" id="cancel-record-btn">Cancel</button>
            <button type="submit" class="pay-btn-primary">
              <i class="fas fa-check-circle"></i> <span>SAVE & RECORD</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  </div>`;

const modalStyles = `
    /* Ultra-Modern Record Payment Modal */
    .pay-modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(15, 23, 42, 0.65) !important;
      backdrop-filter: blur(12px) !important;
      -webkit-backdrop-filter: blur(12px) !important;
      z-index: 9999 !important;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }

    .pay-modal-overlay.active {
      display: flex !important;
    }

    .pay-modal-card {
      width: 100% !important;
      max-width: 550px !important;
      border-radius: 24px !important;
      background: #ffffff !important;
      border: 1.5px solid rgba(16, 42, 150, 0.12) !important;
      box-shadow: 0 30px 80px -15px rgba(16, 42, 150, 0.25), 0 10px 30px rgba(0, 0, 0, 0.08) !important;
      overflow: hidden !important;
      animation: modalSpringIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) !important;
    }

    body.dark-mode .pay-modal-card {
      background: #0f172a !important;
      border-color: rgba(255, 255, 255, 0.12) !important;
      box-shadow: 0 30px 80px rgba(0, 0, 0, 0.7) !important;
    }

    .pay-modal-header {
      padding: 18px 24px !important;
      border-bottom: 1.5px solid rgba(16, 42, 150, 0.08) !important;
      display: flex !important;
      justify-content: space-between !important;
      align-items: center !important;
      background: linear-gradient(180deg, #f8fafc 0%, #ffffff 100%) !important;
    }

    body.dark-mode .pay-modal-header {
      background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%) !important;
      border-bottom-color: rgba(255, 255, 255, 0.08) !important;
    }

    .pay-modal-title-wrap {
      display: flex !important;
      align-items: center !important;
      gap: 12px !important;
    }

    .pay-modal-icon-badge {
      width: 38px !important;
      height: 38px !important;
      border-radius: 12px !important;
      background: linear-gradient(135deg, rgba(37, 99, 235, 0.15), rgba(16, 42, 150, 0.06)) !important;
      border: 1.5px solid rgba(37, 99, 235, 0.25) !important;
      color: #2563eb !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      font-size: 1.15rem !important;
    }

    .pay-modal-title-text {
      font-family: var(--font-display, 'Orbitron', sans-serif) !important;
      font-weight: 800 !important;
      font-size: 1.08rem !important;
      color: #0f172a !important;
      letter-spacing: 0.3px !important;
    }

    body.dark-mode .pay-modal-title-text {
      color: #f8fafc !important;
    }

    .pay-modal-close-btn {
      width: 34px !important;
      height: 34px !important;
      border-radius: 50% !important;
      border: 1.5px solid rgba(16, 42, 150, 0.15) !important;
      background: #ffffff !important;
      color: #64748b !important;
      cursor: pointer !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      font-size: 0.95rem !important;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
      box-shadow: 0 2px 5px rgba(0, 0, 0, 0.04) !important;
    }

    body.dark-mode .pay-modal-close-btn {
      background: #1e293b !important;
      border-color: rgba(255, 255, 255, 0.12) !important;
      color: #94a3b8 !important;
    }

    .pay-modal-close-btn:hover {
      background: rgba(239, 68, 68, 0.1) !important;
      color: #ef4444 !important;
      border-color: rgba(239, 68, 68, 0.4) !important;
      transform: rotate(90deg) !important;
    }

    .pay-modal-body {
      padding: 22px 24px !important;
      display: flex !important;
      flex-direction: column !important;
      gap: 15px !important;
    }

    .pay-input-group {
      display: flex !important;
      flex-direction: column !important;
      gap: 6px !important;
    }

    .pay-input-label {
      font-size: 0.72rem !important;
      font-weight: 800 !important;
      color: #64748b !important;
      text-transform: uppercase !important;
      letter-spacing: 0.6px !important;
      display: flex !important;
      align-items: center !important;
      gap: 6px !important;
    }

    body.dark-mode .pay-input-label {
      color: #94a3b8 !important;
    }

    .pay-input-label i {
      color: #2563eb !important;
      font-size: 0.75rem !important;
    }

    .pay-input-wrap {
      position: relative !important;
      display: flex !important;
      align-items: center !important;
    }

    .pay-input-icon {
      position: absolute !important;
      left: 14px !important;
      color: #64748b !important;
      font-size: 0.9rem !important;
      pointer-events: none !important;
      z-index: 2 !important;
    }

    .pay-input {
      width: 100% !important;
      border: 1.5px solid rgba(16, 42, 150, 0.15) !important;
      background: #f8fafc !important;
      color: #0f172a !important;
      border-radius: 12px !important;
      padding: 10px 14px 10px 38px !important;
      font-size: 0.9rem !important;
      outline: none !important;
      font-family: inherit !important;
      font-weight: 600 !important;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
      box-sizing: border-box !important;
    }

    body.dark-mode .pay-input {
      background: #1e293b !important;
      border-color: rgba(255, 255, 255, 0.12) !important;
      color: #f8fafc !important;
    }

    .pay-input:focus {
      border-color: #2563eb !important;
      background: #ffffff !important;
      box-shadow: 0 0 0 3.5px rgba(37, 99, 235, 0.15) !important;
    }

    body.dark-mode .pay-input:focus {
      background: #0f172a !important;
      border-color: #38bdf8 !important;
      box-shadow: 0 0 0 3.5px rgba(56, 189, 248, 0.2) !important;
    }

    .pay-modal-footer {
      display: flex !important;
      justify-content: flex-end !important;
      align-items: center !important;
      gap: 12px !important;
      margin-top: 10px !important;
      padding-top: 18px !important;
      border-top: 1.5px solid rgba(16, 42, 150, 0.08) !important;
    }

    body.dark-mode .pay-modal-footer {
      border-top-color: rgba(255, 255, 255, 0.08) !important;
    }

    .pay-btn-secondary {
      height: 44px !important;
      padding: 0 24px !important;
      border-radius: 12px !important;
      border: 1.5px solid rgba(16, 42, 150, 0.15) !important;
      background: #f1f5f9 !important;
      color: #475569 !important;
      font-weight: 800 !important;
      font-size: 0.88rem !important;
      cursor: pointer !important;
      font-family: inherit !important;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
      box-sizing: border-box !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
    }

    .pay-btn-secondary:hover {
      background: #e2e8f0 !important;
      color: #0f172a !important;
      border-color: rgba(16, 42, 150, 0.25) !important;
      transform: translateY(-1px) !important;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06) !important;
    }

    body.dark-mode .pay-btn-secondary {
      background: #1e293b !important;
      border-color: rgba(255, 255, 255, 0.12) !important;
      color: #94a3b8 !important;
    }

    body.dark-mode .pay-btn-secondary:hover {
      background: #334155 !important;
      color: #ffffff !important;
    }

    .pay-btn-primary {
      height: 44px !important;
      padding: 0 28px !important;
      border-radius: 12px !important;
      border: none !important;
      background: linear-gradient(135deg, #102a96 0%, #2563eb 100%) !important;
      color: #ffffff !important;
      font-weight: 800 !important;
      font-size: 0.9rem !important;
      cursor: pointer !important;
      font-family: inherit !important;
      display: inline-flex !important;
      align-items: center !important;
      gap: 8px !important;
      box-shadow: 0 6px 20px rgba(16, 42, 150, 0.3) !important;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
      box-sizing: border-box !important;
    }

    .pay-btn-primary:hover {
      transform: translateY(-2px) !important;
      box-shadow: 0 8px 25px rgba(16, 42, 150, 0.45) !important;
      background: linear-gradient(135deg, #0d227a 0%, #1d4ed8 100%) !important;
    }
`;

['project/frontend/public/payments.html', 'project/frontend/payments.html'].forEach(p => {
  let content = fs.readFileSync(p, 'utf8');

  // Insert styles right before </style>
  if (!content.includes('.pay-modal-icon-badge')) {
    content = content.replace('</style>', modalStyles + '\n  </style>');
  }

  // Replace modal HTML block cleanly
  const modalStartIdx = content.indexOf('<div class="pay-modal-overlay" id="record-payment-modal">');
  if (modalStartIdx !== -1) {
    const modalEndIdx = content.indexOf('</form>\n    </div>\n  </div>', modalStartIdx);
    if (modalEndIdx !== -1) {
      const fullEndIdx = modalEndIdx + '</form>\n    </div>\n  </div>'.length;
      content = content.substring(0, modalStartIdx) + updatedModalHtml.trim() + content.substring(fullEndIdx);
    } else {
      // Fallback find end of modal
      const scriptIdx = content.indexOf('<script src="js/api.js">', modalStartIdx);
      if (scriptIdx !== -1) {
        content = content.substring(0, modalStartIdx) + updatedModalHtml.trim() + '\n\n  ' + content.substring(scriptIdx);
      }
    }
  }

  fs.writeFileSync(p, content, 'utf8');
  console.log('Successfully updated modal in:', p);
});

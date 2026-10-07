// State Management
const state = {
  currentPersona: "alice",
  token: null,
  principal: null,
  vaults: [],
  selectedVaultSlug: "finance-q3",
  activeEvidenceItems: [],
  leaseTimer: null
};

const API_BASE = window.location.origin;

// DOM Elements
const personaSelect = document.getElementById("personaSelect");
const vaultSelect = document.getElementById("vaultSelect");
const queryInput = document.getElementById("queryInput");
const sendQueryBtn = document.getElementById("sendQueryBtn");
const answerBody = document.getElementById("answerBody");
const groundingBadge = document.getElementById("groundingBadge");
const citationsContainer = document.getElementById("citationsContainer");
const timeStatusText = document.getElementById("timeStatusText");
const leaseCountdownText = document.getElementById("leaseCountdownText");
const evidenceDrawer = document.getElementById("evidenceDrawer");
const drawerBody = document.getElementById("drawerBody");
const closeDrawerBtn = document.getElementById("closeDrawerBtn");

// Tab Navigation
document.querySelectorAll(".nav-item").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-pane").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    const target = btn.dataset.tab;
    document.getElementById(target).classList.add("active");
    if (target === "tab-vaults") loadVaultsView();
    if (target === "tab-grants") loadGrantsView();
    if (target === "tab-federation") loadFederationView();
    if (target === "tab-audit") loadAuditView();
    if (target === "tab-tests") runSecurityTestSuite();
  });
});

// Persona Switcher
personaSelect.addEventListener("change", async (e) => {
  state.currentPersona = e.target.value;
  await switchPersona(state.currentPersona);
});

async function switchPersona(username) {
  try {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password: `${username}123` })
    });
    if (!res.ok) {
      console.error("Login failed for persona:", username);
      return;
    }
    const data = await res.json();
    state.token = data.access_token;
    state.principal = data.principal;

    // Update UI Badges
    document.getElementById("sidebarUserName").textContent = data.principal.username.toUpperCase();
    document.getElementById("sidebarAvatar").textContent = data.principal.username[0].toUpperCase();
    document.getElementById("sidebarUserRole").textContent = `${data.principal.department} (${data.principal.roles.join(', ')}) • L${data.principal.clearance}`;

    // Update Trace panel
    document.getElementById("tracePrincipalSub").textContent = `${data.principal.username} • Roles: ${data.principal.roles.join(', ')} • Clearance: ${data.principal.clearance}`;

    await loadVaults();
    await updateTimeAndLeaseStatus();
  } catch (err) {
    console.error("Failed to switch persona:", err);
  }
}

// Load Vaults List
async function loadVaults() {
  try {
    const res = await fetch(`${API_BASE}/api/vaults`, {
      headers: { "Authorization": `Bearer ${state.token}` }
    });
    const vaults = await res.json();
    state.vaults = vaults;

    vaultSelect.innerHTML = "";
    vaults.forEach(v => {
      const opt = document.createElement("option");
      opt.value = v.slug;
      opt.textContent = `${v.display_name} ${v.has_active_grant ? '● Granted' : '○ Locked'}`;
      vaultSelect.appendChild(opt);
    });

    if (vaults.length > 0) {
      state.selectedVaultSlug = vaults[0].slug;
      vaultSelect.value = state.selectedVaultSlug;
    }
  } catch (err) {
    console.error("Error loading vaults:", err);
  }
}

vaultSelect.addEventListener("change", (e) => {
  state.selectedVaultSlug = e.target.value;
});

// Presets Handler
document.querySelectorAll(".preset-chip").forEach(chip => {
  chip.addEventListener("click", () => {
    queryInput.value = chip.dataset.q;
    state.selectedVaultSlug = chip.dataset.v;
    vaultSelect.value = chip.dataset.v;
  });
});

// Execute Secure Query
sendQueryBtn.addEventListener("click", executeQuery);
queryInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    executeQuery();
  }
});

async function executeQuery() {
  const query = queryInput.value.trim();
  if (!query) return;

  sendQueryBtn.disabled = true;
  answerBody.innerHTML = `<div class="empty-state">Running two-gate retrieval firewall evaluation...</div>`;

  try {
    const res = await fetch(`${API_BASE}/api/rag/${state.selectedVaultSlug}/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${state.token}`
      },
      body: JSON.stringify({
        vault_slug: state.selectedVaultSlug,
        query: query
      })
    });

    const data = await res.json();
    state.activeEvidenceItems = data.evidence_items || [];

    // Render Answer
    answerBody.innerHTML = `<p>${escapeHtml(data.answer).replace(/\n\n/g, '</p><p>')}</p>`;

    // Status Badge
    groundingBadge.textContent = data.security_trace.answer_status;
    groundingBadge.className = "badge";
    if (data.security_trace.answer_status === "GROUNDED") {
      groundingBadge.classList.add("badge-grounded");
    } else {
      groundingBadge.classList.add("badge-refused");
    }

    // Render Citations
    citationsContainer.innerHTML = "";
    if (data.citations && data.citations.length > 0) {
      data.citations.forEach(cit => {
        const tag = document.createElement("button");
        tag.className = "citation-tag";
        tag.innerHTML = `<span>[${cit.citation_id}]</span> <span>${cit.locator}</span>`;
        tag.addEventListener("click", () => openEvidenceDrawer(cit.evidence_id, cit));
        citationsContainer.appendChild(tag);
      });
    }

    // Update Retrieval Security Trace Panel (§42, §49.6)
    const trace = data.security_trace;
    document.getElementById("traceGateASub").textContent = `Candidates: ${trace.gate_a_candidates_count} • Vault ID: ${trace.vault_slug}`;
    document.getElementById("traceGateBSub").textContent = `Verified: ${trace.gate_b_canonical_verified_count} • Excluded by SQL ACL: ${trace.excluded_candidates_count}`;
    document.getElementById("traceEvidenceSub").textContent = `Context Envelopes: ${data.evidence_items.length} • Injection Stripped`;
    document.getElementById("traceCitationSub").textContent = `Citations Validated: ${trace.citations_validated_count} / ${trace.citations_total_count}`;
    document.getElementById("traceRawFilter").textContent = JSON.stringify(trace.vector_filter_applied, null, 2);

    updateTimeAndLeaseStatus();
  } catch (err) {
    answerBody.innerHTML = `<div class="empty-state text-error">Query failed: ${err.message}</div>`;
  } finally {
    sendQueryBtn.disabled = false;
  }
}

// Evidence Inspector Drawer
function openEvidenceDrawer(evidenceId, citation) {
  const item = state.activeEvidenceItems.find(ev => ev.evidence_id === evidenceId);
  if (!item) return;

  drawerBody.innerHTML = `
    <div style="margin-bottom: 16px;">
      <div style="font-size: 11px; color: var(--text-dim); text-transform: uppercase; font-weight: 700;">Canonical Source</div>
      <div style="font-size: 14px; font-weight: 700; color: #fff; margin-top: 2px;">${item.provenance.resource_title || 'Document'}</div>
      <div style="font-size: 12px; color: var(--accent-cyan); font-family: var(--font-mono);">${item.provenance.locator}</div>
    </div>

    <div style="margin-bottom: 16px;">
      <div style="font-size: 11px; color: var(--text-dim); text-transform: uppercase; font-weight: 700;">Exact Verified Quote (§26)</div>
      <div style="background: rgba(6,182,212,0.08); border-left: 3px solid var(--accent-cyan); padding: 10px 14px; margin-top: 6px; font-size: 13px; font-style: italic;">
        "${citation.quote}"
      </div>
    </div>

    <div style="margin-bottom: 16px;">
      <div style="font-size: 11px; color: var(--text-dim); text-transform: uppercase; font-weight: 700;">Full Authorized Chunk Text</div>
      <div style="background: rgba(0,0,0,0.3); border: 1px solid var(--card-border); padding: 12px; border-radius: var(--radius-sm); font-size: 13px; color: var(--text-muted); margin-top: 6px;">
        ${escapeHtml(item.content)}
      </div>
    </div>

    <div>
      <div style="font-size: 11px; color: var(--text-dim); text-transform: uppercase; font-weight: 700;">Authorization Proof Object v3 (§A18)</div>
      <pre class="code-box" style="margin-top: 6px;">${JSON.stringify(item.proof, null, 2)}</pre>
    </div>
  `;

  evidenceDrawer.classList.add("open");
}

closeDrawerBtn.addEventListener("click", () => {
  evidenceDrawer.classList.remove("open");
});

// Update Time & Lease Status
async function updateTimeAndLeaseStatus() {
  try {
    const res = await fetch(`${API_BASE}/api/time/status`);
    const timeData = await res.json();
    timeStatusText.textContent = `Time: Monotonic ${timeData.status}`;

    const meRes = await fetch(`${API_BASE}/api/auth/me`, {
      headers: { "Authorization": `Bearer ${state.token}` }
    });
    const meData = await meRes.json();
    if (meData.lease && meData.lease.deadline) {
      const deadline = new Date(meData.lease.deadline);
      const now = new Date();
      const diffSecs = Math.max(0, Math.floor((deadline - now) / 1000));
      const mins = Math.floor(diffSecs / 60);
      const secs = diffSecs % 60;
      leaseCountdownText.textContent = `Lease: Active (${mins}m ${secs}s)`;
    }
  } catch (err) {
    console.error("Time status update error:", err);
  }
}

// ----------------- TAB: VAULTS -----------------
async function loadVaultsView() {
  const container = document.getElementById("vaultsCardsContainer");
  container.innerHTML = "";

  state.vaults.forEach(v => {
    const card = document.createElement("div");
    card.className = "vault-card";
    card.innerHTML = `
      <div class="vault-card-header">
        <span class="vault-name">${v.display_name}</span>
        <span class="badge ${v.has_active_grant ? 'badge-grounded' : 'badge-refused'}">${v.has_active_grant ? 'GRANTED' : 'LOCKED'}</span>
      </div>
      <div class="vault-desc">
        Partition ID: <code>${v.slug}</code><br>
        Classification Ceiling: Level ${v.classification_ceiling} (${v.classification_ceiling === 3 ? 'RESTRICTED' : 'CONFIDENTIAL'})<br>
        Origin: ${v.origin} • Mode: ${v.scope_mode}
      </div>
      <button class="btn-secondary" style="width: 100%;" onclick="selectVaultAndQuery('${v.slug}')">
        Switch Target & Query
      </button>
    `;
    container.appendChild(card);
  });
}

window.selectVaultAndQuery = function(slug) {
  state.selectedVaultSlug = slug;
  vaultSelect.value = slug;
  document.querySelector('.nav-item[data-tab="tab-query"]').click();
};

// ----------------- TAB: GRANTS & JIT ACCESS -----------------
async function loadGrantsView() {
  const tbody = document.querySelector("#myGrantsTable tbody");
  tbody.innerHTML = "";

  try {
    const res = await fetch(`${API_BASE}/api/me/grants`, {
      headers: { "Authorization": `Bearer ${state.token}` }
    });
    const grants = await res.json();
    document.getElementById("myGrantsCountBadge").textContent = `Active Grants: ${grants.length}`;

    grants.forEach(g => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><code>${g.grant_id}</code></td>
        <td><strong>${g.vault_id}</strong></td>
        <td>${g.actions.join(', ')}</td>
        <td>${new Date(g.valid_until).toLocaleDateString()} ${new Date(g.valid_until).toLocaleTimeString()}</td>
        <td>${g.delegable ? '<span class="badge badge-grounded">Yes</span>' : 'No'}</td>
        <td>
          <button class="btn-secondary" style="padding: 4px 8px; font-size: 11px;" onclick="revokeGrant('${g.grant_id}')">Revoke</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    // Load access requests
    const reqRes = await fetch(`${API_BASE}/api/access-requests`, {
      headers: { "Authorization": `Bearer ${state.token}` }
    });
    const requests = await reqRes.json();
    const reqTbody = document.querySelector("#accessRequestsTable tbody");
    reqTbody.innerHTML = "";

    requests.forEach(r => {
      const isPending = r.state === "requested";
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><code>${r.request_id}</code></td>
        <td>${r.requester_name}</td>
        <td>${r.vault_name}</td>
        <td>${r.duration_minutes}m</td>
        <td>${r.purpose}</td>
        <td><span class="badge ${r.state === 'approved' ? 'badge-grounded' : 'badge-trace'}">${r.state}</span></td>
        <td>
          ${isPending ? `<button class="btn-primary" style="padding: 4px 8px; font-size: 11px;" onclick="approveRequest('${r.request_id}')">Approve</button>` : '—'}
        </td>
      `;
      reqTbody.appendChild(tr);
    });
  } catch (err) {
    console.error("Error loading grants:", err);
  }
}

window.approveRequest = async function(reqId) {
  try {
    const res = await fetch(`${API_BASE}/api/access-requests/${reqId}/approve`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${state.token}` }
    });
    if (!res.ok) {
      const err = await res.json();
      alert(`Approval Denied: ${err.detail}`);
      return;
    }
    alert("Request approved successfully! Signed time-bound grant issued.");
    loadGrantsView();
  } catch (err) {
    alert("Error approving request: " + err.message);
  }
};

window.revokeGrant = async function(grantId) {
  try {
    await fetch(`${API_BASE}/api/grants/${grantId}/revoke`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${state.token}` }
    });
    alert("Grant revoked! Cascade revocation processed.");
    loadGrantsView();
  } catch (err) {
    alert("Revoke failed: " + err.message);
  }
};

// JIT Access Modal
const requestModal = document.getElementById("requestModal");
document.getElementById("openRequestModalBtn").addEventListener("click", () => {
  requestModal.classList.add("open");
});
document.getElementById("closeRequestModalBtn").addEventListener("click", () => {
  requestModal.classList.remove("open");
});
document.getElementById("cancelRequestModalBtn").addEventListener("click", () => {
  requestModal.classList.remove("open");
});

document.getElementById("submitRequestBtn").addEventListener("click", async () => {
  const vault_id = document.getElementById("reqVaultSelect").value;
  const duration_minutes = parseInt(document.getElementById("reqDurationSelect").value);
  const purpose = document.getElementById("reqPurposeInput").value;
  const justification = document.getElementById("reqJustificationInput").value;

  try {
    const res = await fetch(`${API_BASE}/api/access-requests`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${state.token}`
      },
      body: JSON.stringify({
        vault_id,
        actions: ["rag_context", "view"],
        duration_minutes,
        purpose,
        justification
      })
    });
    if (!res.ok) {
      const err = await res.json();
      alert(`Request failed: ${err.detail}`);
      return;
    }
    requestModal.classList.remove("open");
    alert("JIT Access Request submitted successfully! Waiting for peer approval (SoD-5).");
    loadGrantsView();
  } catch (err) {
    alert("Error submitting request: " + err.message);
  }
});

// ----------------- TAB: LAN FEDERATION -----------------
async function loadFederationView() {
  const tbody = document.querySelector("#fedNodesTable tbody");
  tbody.innerHTML = "";

  try {
    const res = await fetch(`${API_BASE}/api/federation/nodes`);
    const nodes = await res.json();
    nodes.forEach(n => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><code>${n.node_id}</code></td>
        <td><strong>${n.name}</strong></td>
        <td><code>${n.cert_fp}</code></td>
        <td><span class="badge badge-grounded">${n.state}</span></td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error("Federation load error:", err);
  }
}

document.getElementById("exportBundleBtn").addEventListener("click", async () => {
  const log = document.getElementById("bundleOutputLog");
  log.textContent = "Packaging & AEAD encrypting Finance-Q3 bundle with Ed25519 node signature...";
  try {
    const res = await fetch(`${API_BASE}/api/bundles/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vault_id: "v_fin", recipient_node_id: "node_remote_01" })
    });
    const bundle = await res.json();
    log.textContent = `[SUCCESS] Bundle .rvault exported!\nBundle ID: ${bundle.header.bundle_id}\nReplay Nonce: ${bundle.header.nonce}\nCiphertext Length: ${bundle.ciphertext_b64.length} bytes\nSignature: ${bundle.signature.slice(0, 32)}...`;
  } catch (err) {
    log.textContent = `Export failed: ${err.message}`;
  }
});

document.getElementById("importBundleBtn").addEventListener("click", async () => {
  const log = document.getElementById("bundleOutputLog");
  log.textContent = "Importing remote vault bundle... Verifying signatures, nonce, and time floor...";
  try {
    // Generate valid test bundle and import
    const expRes = await fetch(`${API_BASE}/api/bundles/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vault_id: "v_fin", recipient_node_id: "node_bangalore" })
    });
    const bundle = await expRes.json();
    const impRes = await fetch(`${API_BASE}/api/bundles/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bundle)
    });
    const impData = await impRes.json();
    log.textContent = `[SUCCESS] Remote bundle verified and imported!\nNew Imported Vault ID: ${impData.vault_id}\nOrigin: imported\nRead-only and terms applied.`;
  } catch (err) {
    log.textContent = `Import failed: ${err.message}`;
  }
});

// ----------------- TAB: AUDIT -----------------
async function loadAuditView() {
  const tbody = document.querySelector("#auditTable tbody");
  tbody.innerHTML = "";

  try {
    const res = await fetch(`${API_BASE}/api/audit/events`);
    const events = await res.json();
    events.forEach(e => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${e.event_id}</td>
        <td><strong>${e.action}</strong></td>
        <td><code>${e.actor_id}</code></td>
        <td>${e.object_type}:${e.object_id}</td>
        <td><span class="badge ${e.decision === 'ALLOW' ? 'badge-grounded' : 'badge-refused'}">${e.decision}</span></td>
        <td>${e.reason_code}</td>
        <td><code title="${e.hash}">${e.hash.slice(0, 16)}...</code></td>
        <td><code title="${e.prev_hash}">${e.prev_hash.slice(0, 12)}...</code></td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error("Audit load error:", err);
  }
}

document.getElementById("verifyAuditChainBtn").addEventListener("click", async () => {
  const alertBox = document.getElementById("chainVerificationAlert");
  alertBox.style.display = "block";
  alertBox.textContent = "Verifying cryptographic hash chain across all audit events...";

  try {
    const res = await fetch(`${API_BASE}/api/audit/verify-chain`);
    const data = await res.json();
    if (data.is_valid) {
      alertBox.className = "alert-box alert-success";
      alertBox.textContent = `[CHAIN VERIFIED] All ${data.verified_events_count} sequential audit records verified successfully against SHA-256 hash chain! Zero tampering detected.`;
    } else {
      alertBox.className = "alert-box alert-error";
      alertBox.textContent = `[TAMPER DETECTED] Hash chain broken at event ${data.error}`;
    }
  } catch (err) {
    alertBox.textContent = "Verification request failed: " + err.message;
  }
});

// ----------------- TAB: SECURITY TEST SUITE -----------------
async function runSecurityTestSuite() {
  const container = document.getElementById("testsResultsContainer");
  container.innerHTML = `<div class="empty-state">Executing 15 automated security invariant tests...</div>`;

  try {
    const res = await fetch(`${API_BASE}/api/security-tests/run`, { method: "POST" });
    const data = await res.json();

    document.getElementById("metricTotalTests").textContent = data.total_tests;
    document.getElementById("metricPassedTests").textContent = data.passed_tests;
    document.getElementById("metricFailedTests").textContent = data.total_tests - data.passed_tests;

    container.innerHTML = "";
    data.results.forEach(r => {
      const item = document.createElement("div");
      item.className = "test-card-item";
      item.innerHTML = `
        <div>
          <div style="font-weight: 700; color: #fff; font-size: 13px;">
            <code>${r.test_id}</code> • ${r.title}
          </div>
          <div style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">
            ${r.details}
          </div>
        </div>
        <div>
          <span class="test-badge-pass">${r.passed ? 'PASS' : 'FAIL'}</span>
        </div>
      `;
      container.appendChild(item);
    });
  } catch (err) {
    container.innerHTML = `<div class="empty-state text-error">Failed running test suite: ${err.message}</div>`;
  }
}

document.getElementById("runAllTestsBtn").addEventListener("click", runSecurityTestSuite);

// Helpers
function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Initial Bootstrap
window.addEventListener("DOMContentLoaded", async () => {
  await switchPersona("alice");
  setInterval(updateTimeAndLeaseStatus, 15000);
});

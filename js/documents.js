/* ==========================================================================
   documents.js — Documents page
   ========================================================================== */

(function () {
  "use strict";

  let state = { search: "", type: "" };
  let stagedFile = null;
  let deleteTarget = null; // { renewalId, docId }

  const TYPE_ICONS = { PDF: "file-text", Image: "image", Word: "file-type-2", Spreadsheet: "sheet", File: "file" };

  function fileTypeFromName(name) {
    const ext = (name.split(".").pop() || "").toLowerCase();
    if (ext === "pdf") return "PDF";
    if (["jpg", "jpeg", "png", "gif"].includes(ext)) return "Image";
    if (["doc", "docx"].includes(ext)) return "Word";
    if (["xls", "xlsx", "csv"].includes(ext)) return "Spreadsheet";
    return "File";
  }

  function render() {
    let docs = RTS.data.getAllDocuments();
    const q = state.search.trim().toLowerCase();
    if (q) docs = docs.filter((d) => d.name.toLowerCase().includes(q) || d.renewalName.toLowerCase().includes(q));
    if (state.type) docs = docs.filter((d) => d.type === state.type);

    document.getElementById("docCount").textContent = `${docs.length} document(s)`;

    const tbody = document.getElementById("docsTableBody");
    const empty = document.getElementById("docsEmptyState");
    if (!docs.length) {
      tbody.innerHTML = "";
      empty.classList.remove("hidden");
      return;
    }
    const isViewer = RTS.auth.isViewer();
    const isAdmin = RTS.auth.isAdmin();
    tbody.innerHTML = docs
      .map(
        (d) => {
          const ren = RTS.data.getRenewalById(d.renewalId);
          const canDeleteDoc = !isViewer && (isAdmin || RTS.auth.canEditRenewal(ren));
          return `
      <tr>
        <td><span class="cell-primary"><i data-lucide="${TYPE_ICONS[d.type] || "file"}" class="icon" style="width:14px;height:14px;vertical-align:-2px;margin-right:6px;color:var(--text-mid);"></i>${RTS.escapeHtml(d.name)}</span></td>
        <td><a class="link" href="details.html?id=${d.renewalId}">${RTS.escapeHtml(d.renewalName)}</a></td>
        <td>${d.type}</td>
        <td>${d.size}</td>
        <td>${RTS.formatDate(d.uploadDate)}</td>
        <td>
          <div class="row-actions">
            <button class="icon-btn" title="Download" onclick="DocumentsPage.download('${RTS.escapeHtml(d.name).replace(/'/g, "")}')"><i data-lucide="download" class="icon"></i></button>
            ${canDeleteDoc ? `<button class="icon-btn" title="Delete" onclick="DocumentsPage.openDelete('${d.renewalId}','${d.id}')"><i data-lucide="trash-2" class="icon"></i></button>` : ""}
          </div>
        </td>
      </tr>`;
        }
      )
      .join("");
    RTS.refreshIcons();
  }

  function download(name) {
    RTS.toast(`Downloading ${name}… (connect a backend to serve real files)`, "info");
  }

  function openDelete(renewalId, docId) {
    if (RTS.auth.isViewer()) {
      RTS.toast("Viewer role has read-only access and cannot delete documents.", "error");
      return;
    }
    const ren = RTS.data.getRenewalById(renewalId);
    if (!RTS.auth.isAdmin() && !RTS.auth.canEditRenewal(ren)) {
      RTS.toast("Access denied. You can only delete documents for assigned renewals.", "error");
      return;
    }
    deleteTarget = { renewalId, docId };
    RTS.modal.open("deleteDocModal");
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    if (RTS.auth.isViewer()) return;
    const ren = RTS.data.getRenewalById(deleteTarget.renewalId);
    if (!RTS.auth.isAdmin() && !RTS.auth.canEditRenewal(ren)) return;
    RTS.data.deleteDocumentFromRenewal(deleteTarget.renewalId, deleteTarget.docId);
    RTS.toast("Document deleted.", "success");
    deleteTarget = null;
    RTS.modal.close("deleteDocModal");
    render();
  }

  function populateRenewalSelect() {
    const sel = document.getElementById("uf_renewalSelect");
    sel.innerHTML = '<option value="">Select a record…</option>';
    RTS.data.getRenewals().forEach((r) => {
      sel.insertAdjacentHTML("beforeend", `<option value="${r.id}">${RTS.escapeHtml(r.name)} (${r.code})</option>`);
    });
  }

  function renderStagedFile() {
    const el = document.getElementById("docFileList");
    if (!stagedFile) {
      el.innerHTML = "";
      return;
    }
    el.innerHTML = `
      <div class="upload-file-item">
        <i data-lucide="file-text" class="icon"></i>
        <div class="file-meta"><strong>${RTS.escapeHtml(stagedFile.name)}</strong><span>${stagedFile.type} · ${stagedFile.size}</span></div>
        <button type="button" id="removeStagedFile" aria-label="Remove"><i data-lucide="x" class="icon"></i></button>
      </div>`;
    RTS.refreshIcons();
    document.getElementById("removeStagedFile").addEventListener("click", () => {
      stagedFile = null;
      renderStagedFile();
    });
  }

  function wireUploadModal() {
    const openBtn = document.getElementById("openUploadBtn");
    if (openBtn) {
      if (RTS.auth.isViewer()) {
        openBtn.style.display = "none";
      } else {
        openBtn.addEventListener("click", () => {
          document.getElementById("docUploadForm").reset();
          stagedFile = null;
          renderStagedFile();
          document.querySelectorAll("#docUploadForm .field").forEach((f) => f.classList.remove("has-error"));
          populateRenewalSelect();
          RTS.modal.open("uploadModal");
        });
      }
    }

    const zone = document.getElementById("docUploadZone");
    const input = document.getElementById("docFileInput");
    zone.addEventListener("click", () => input.click());
    input.addEventListener("change", () => {
      const file = input.files[0];
      if (!file) return;
      stagedFile = {
        name: file.name,
        type: fileTypeFromName(file.name),
        size: (file.size / 1024).toFixed(1) + " KB",
      };
      renderStagedFile();
    });

    document.getElementById("docUploadForm").addEventListener("submit", (e) => {
      e.preventDefault();
      let valid = true;
      const renewalId = document.getElementById("uf_renewalSelect").value;
      if (!renewalId) {
        document.getElementById("uf_renewal").classList.add("has-error");
        valid = false;
      } else {
        document.getElementById("uf_renewal").classList.remove("has-error");
      }
      if (!stagedFile) {
        document.getElementById("uf_file").classList.add("has-error");
        valid = false;
      } else {
        document.getElementById("uf_file").classList.remove("has-error");
      }
      if (!valid) return;

      RTS.data.addDocumentToRenewal(renewalId, stagedFile);
      RTS.toast("Document uploaded successfully.", "success");
      RTS.modal.close("uploadModal");
      render();
    });

    document.getElementById("confirmDeleteDocBtn").addEventListener("click", confirmDelete);
  }

  function wireToolbar() {
    document.getElementById("docSearch").addEventListener(
      "input",
      RTS.debounce((e) => {
        state.search = e.target.value;
        render();
      }, 200)
    );
    document.getElementById("filterDocType").addEventListener("change", (e) => {
      state.type = e.target.value;
      render();
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    RTS.initLayout();
    wireToolbar();
    wireUploadModal();
    render();
    if (RTS.data && RTS.data.syncFromBackend) {
      RTS.data.syncFromBackend().then(() => {
        render();
      });
    }
    RTS.refreshIcons();

    window.addEventListener("rts-renewal-updated", () => {
      render();
    });
  });

  window.DocumentsPage = { download, openDelete };
})();

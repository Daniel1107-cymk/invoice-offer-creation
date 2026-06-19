/* Invoice / Penawaran PDF generator — vanilla JS, no build step. */
(function () {
  "use strict";

  // ---------- Constants ----------
  var OPTIONAL_COLS = ["qty", "satuan", "harga", "keterangan"];
  var COL_LABELS = { qty: "Qty", satuan: "Satuan", harga: "Harga", keterangan: "Keterangan" };
  var BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli",
    "Agustus", "September", "Oktober", "November", "Desember"];
  var STORE_KEY = "pdfDraftAutosave_v1";
  var idr = new Intl.NumberFormat("id-ID");

  var DEFAULT_BANK1 = "Bank BCA no. rek 340 368 4887 a/n WIJAYA HALIM";
  var DEFAULT_BANK2 = "Bank Mandiri no. rek 900 003 394 6485 a/n WIJAYA HALIM";
  var DEFAULT_ADDRESS = "Pergudangan Kartika blok B no. 1, Sei Jodoh,\nBatu Ampar, Batam, Kepri - INDONESIA";
  var DEFAULT_INTRO = "Dengan hormat,\nDengan ini kami ingin menyampaikan surat penawaran harga untuk pekerjaan tambahan.\nBerikut perincian pekerjaan :";

  // ---------- Helpers ----------
  function el(id) { return document.getElementById(id); }
  function todayISO() {
    var d = new Date();
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }

  function parseMoney(str) {
    var s = (str == null ? "" : String(str)).trim();
    if (s === "") return { free: false, value: 0, empty: true };
    if (/^free$/i.test(s)) return { free: true, value: 0 };
    var digits = s.replace(/[^0-9]/g, "");
    return { free: false, value: digits ? parseInt(digits, 10) : 0 };
  }
  function parseQty(str) {
    var s = (str == null ? "" : String(str)).trim().replace(",", ".");
    var n = parseFloat(s.replace(/[^0-9.\-]/g, ""));
    return isNaN(n) ? 0 : n;
  }
  function formatRupiah(v) { return "Rp " + idr.format(v); }
  function formatTanggal(iso) {
    if (!iso) return "";
    var p = iso.split("-");
    if (p.length !== 3) return iso;
    return parseInt(p[2], 10) + " " + BULAN[parseInt(p[1], 10) - 1] + " " + p[0];
  }
  function sanitize(s) { return (s || "").replace(/[^a-z0-9\-_ ]/gi, "").trim().replace(/\s+/g, "_"); }

  // ---------- State ----------
  function emptyRow(mode) {
    return { jenis: "", qty: "", satuan: "", harga: "", keterangan: "", total: "", totalMode: mode || "manual" };
  }
  function defaultColumns(docType) {
    return docType === "offer"
      ? { qty: false, satuan: false, harga: false, keterangan: true }
      : { qty: true, satuan: false, harga: true, keterangan: false };
  }
  function defaultState() {
    return {
      docType: "invoice",
      logo: "sikon",
      address: DEFAULT_ADDRESS,
      city: "Batam",
      date: todayISO(),
      to: "",
      loc: "",
      intro: DEFAULT_INTRO,
      columns: defaultColumns("invoice"),
      rows: [emptyRow("auto")],
      termOfPayment: "",
      bank1: DEFAULT_BANK1,
      bank2: DEFAULT_BANK2
    };
  }
  var state = defaultState();

  function autoEligible() { return state.columns.qty && state.columns.harga; }
  function isAutoRow(row) { return row.totalMode === "auto" && autoEligible(); }

  function rowTotal(row) {
    if (isAutoRow(row)) {
      var h = parseMoney(row.harga);
      if (h.free) return { free: true, value: 0 };
      return { free: false, value: Math.round(parseQty(row.qty) * h.value) };
    }
    return parseMoney(row.total);
  }

  // ---------- Persistence ----------
  var saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
    }, 200);
  }
  function loadStored() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return false;
      var parsed = JSON.parse(raw);
      state = mergeState(parsed);
      return true;
    } catch (e) { return false; }
  }
  function mergeState(obj) {
    var s = defaultState();
    if (obj && typeof obj === "object") {
      Object.keys(s).forEach(function (k) {
        if (obj[k] !== undefined && k !== "columns" && k !== "rows") s[k] = obj[k];
      });
      if (obj.columns) OPTIONAL_COLS.forEach(function (c) { s.columns[c] = !!obj.columns[c]; });
      if (Array.isArray(obj.rows) && obj.rows.length) {
        s.rows = obj.rows.map(function (r) {
          var er = emptyRow(r.totalMode);
          ["jenis", "qty", "satuan", "harga", "keterangan", "total", "totalMode"].forEach(function (f) {
            if (r[f] !== undefined) er[f] = r[f];
          });
          return er;
        });
      }
    }
    return s;
  }

  // ---------- Render: top-level form ----------
  var SIMPLE_FIELDS = ["address", "city", "date", "to", "loc", "intro", "termOfPayment", "bank1", "bank2"];

  function populateForm() {
    el("docType").value = state.docType;
    el("logo").value = state.logo;
    SIMPLE_FIELDS.forEach(function (id) { if (el(id)) el(id).value = state[id]; });
    OPTIONAL_COLS.forEach(function (c) {
      document.querySelector('[data-col="' + c + '"]').checked = state.columns[c];
    });
    applyDocTypeClass();
    applyBrand();
    renderRows();
    recalcTotals();
  }
  function applyDocTypeClass() {
    document.body.classList.toggle("is-offer", state.docType === "offer");
    var t = el("appTitle");
    if (t) t.textContent = state.docType === "offer" ? "Penawaran" : "Invoice";
  }
  function applyBrand() {
    document.body.dataset.brand = state.logo;
    var img = el("brandLogo");
    var src = window.LOGOS && window.LOGOS[state.logo];
    if (img) {
      // Never assign "" — under file:// an empty src resolves to the page URL
      // and the browser tries to load index.html as an image (security error).
      if (src) img.src = src; else img.removeAttribute("src");
    }
  }

  // ---------- Render: items table ----------
  function activeColKeys() {
    var keys = ["no", "jenis"];
    OPTIONAL_COLS.forEach(function (c) { if (state.columns[c]) keys.push(c); });
    keys.push("total");
    return keys;
  }

  function colLabel(k) {
    return k === "no" ? "No" : k === "jenis" ? "Jenis Pekerjaan"
      : k === "total" ? "Total" : COL_LABELS[k];
  }

  function renderRows() {
    var head = el("itemsHead");
    var body = el("itemsBody");
    var keys = activeColKeys();
    head.innerHTML = "";
    keys.forEach(function (k) {
      var th = document.createElement("th");
      th.textContent = colLabel(k);
      head.appendChild(th);
    });
    var thA = document.createElement("th"); thA.textContent = ""; head.appendChild(thA);

    body.innerHTML = "";
    state.rows.forEach(function (row, i) {
      body.appendChild(buildRow(row, i, keys));
    });
  }

  function buildRow(row, i, keys) {
    var tr = document.createElement("tr");
    keys.forEach(function (k) {
      var td = document.createElement("td");
      td.className = "col-" + k;
      td.setAttribute("data-label", colLabel(k));
      if (k === "no") {
        td.textContent = i + 1;
      } else if (k === "jenis" || k === "keterangan") {
        td.appendChild(makeInput("textarea", k, i, row[k]));
      } else if (k === "total") {
        td.appendChild(buildTotalCell(row, i));
      } else {
        var type = k === "qty" ? "number" : "text";
        td.appendChild(makeInput(type, k, i, row[k], k === "harga" ? "0 / Free" : ""));
      }
      tr.appendChild(td);
    });
    var tdAct = document.createElement("td");
    tdAct.className = "col-actions";
    tdAct.appendChild(iconBtn("↑", "up", i));
    tdAct.appendChild(iconBtn("↓", "down", i));
    tdAct.appendChild(iconBtn("✕", "del", i));
    tr.appendChild(tdAct);
    return tr;
  }

  function buildTotalCell(row, i) {
    var wrap = document.createElement("div");
    var auto = isAutoRow(row);
    var input = document.createElement("input");
    input.type = "text";
    input.setAttribute("data-total-index", i);
    if (auto) {
      input.readOnly = true;
      input.value = formatRupiah(rowTotal(row).value);
      input.style.background = "#f9fafb";
    } else {
      input.value = row.total;
      input.placeholder = "0 / Free";
      input.setAttribute("data-field", "total");
      input.setAttribute("data-index", i);
    }
    wrap.appendChild(input);

    if (autoEligible()) {
      var mode = document.createElement("label");
      mode.className = "total-mode";
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = row.totalMode === "auto";
      cb.setAttribute("data-totalmode-index", i);
      mode.appendChild(cb);
      mode.appendChild(document.createTextNode("auto"));
      wrap.appendChild(mode);
    }
    return wrap;
  }

  function makeInput(type, field, i, value, placeholder) {
    var inp = document.createElement(type === "textarea" ? "textarea" : "input");
    if (type !== "textarea") inp.type = type;
    if (type === "textarea") inp.rows = 1;
    inp.value = value || "";
    if (placeholder) inp.placeholder = placeholder;
    inp.setAttribute("data-field", field);
    inp.setAttribute("data-index", i);
    return inp;
  }
  function iconBtn(label, action, i) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "btn icon" + (action === "del" ? " del" : "");
    b.textContent = label;
    b.setAttribute("data-action", action);
    b.setAttribute("data-index", i);
    return b;
  }

  // ---------- Totals ----------
  function recalcTotals() {
    var sum = 0;
    state.rows.forEach(function (row, i) {
      var t = rowTotal(row);
      if (!t.free) sum += t.value;
      if (isAutoRow(row)) {
        var cell = document.querySelector('[data-total-index="' + i + '"]');
        if (cell) cell.value = t.free ? "Free" : formatRupiah(t.value);
      }
    });
    el("totalDisplay").textContent = formatRupiah(sum);
    return sum;
  }

  // ---------- Events ----------
  function wire() {
    el("docType").addEventListener("change", function () {
      state.docType = this.value;
      state.logo = this.value === "offer" ? "suitus" : "sikon";
      state.columns = defaultColumns(this.value);
      el("logo").value = state.logo;
      OPTIONAL_COLS.forEach(function (c) {
        document.querySelector('[data-col="' + c + '"]').checked = state.columns[c];
      });
      applyDocTypeClass(); applyBrand(); renderRows(); recalcTotals(); save();
    });
    el("logo").addEventListener("change", function () {
      state.logo = this.value; applyBrand(); save();
    });

    SIMPLE_FIELDS.forEach(function (id) {
      var node = el(id);
      if (!node) return;
      node.addEventListener("input", function () {
        state[id] = this.value;
        save();
      });
    });

    OPTIONAL_COLS.forEach(function (c) {
      document.querySelector('[data-col="' + c + '"]').addEventListener("change", function () {
        state.columns[c] = this.checked;
        renderRows(); recalcTotals(); save();
      });
    });

    document.querySelectorAll("[data-setall]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var mode = this.getAttribute("data-setall");
        state.rows.forEach(function (r) { r.totalMode = mode; });
        renderRows(); recalcTotals(); save();
      });
    });

    el("btnAddRow").addEventListener("click", function () {
      state.rows.push(emptyRow(autoEligible() ? "auto" : "manual"));
      renderRows(); recalcTotals(); save();
    });

    // Delegated input on table body (text fields)
    el("itemsBody").addEventListener("input", function (e) {
      var t = e.target;
      var field = t.getAttribute("data-field");
      var idx = t.getAttribute("data-index");
      if (field == null || idx == null) return;
      state.rows[idx][field] = t.value;
      if (field === "qty" || field === "harga" || field === "total") recalcTotals();
      save();
    });
    // Delegated change for total-mode checkbox
    el("itemsBody").addEventListener("change", function (e) {
      var t = e.target;
      var tmIdx = t.getAttribute("data-totalmode-index");
      if (tmIdx != null) {
        state.rows[tmIdx].totalMode = t.checked ? "auto" : "manual";
        renderRows(); recalcTotals(); save();
      }
    });
    // Delegated click for row actions
    el("itemsBody").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-action]");
      if (!btn) return;
      var i = parseInt(btn.getAttribute("data-index"), 10);
      var action = btn.getAttribute("data-action");
      if (action === "del") {
        state.rows.splice(i, 1);
        if (!state.rows.length) state.rows.push(emptyRow(autoEligible() ? "auto" : "manual"));
      } else if (action === "up" && i > 0) {
        var a = state.rows.splice(i, 1)[0]; state.rows.splice(i - 1, 0, a);
      } else if (action === "down" && i < state.rows.length - 1) {
        var b = state.rows.splice(i, 1)[0]; state.rows.splice(i + 1, 0, b);
      }
      renderRows(); recalcTotals(); save();
    });

    el("btnPreview").addEventListener("click", function () { makePdf("preview"); });
    el("btnDownload").addEventListener("click", function () { makePdf("download"); });
    el("btnClosePreview").addEventListener("click", closePreview);

    el("btnSaveDraft").addEventListener("click", saveDraftFile);
    el("btnLoadDraft").addEventListener("click", function () { el("draftFile").click(); });
    el("draftFile").addEventListener("change", loadDraftFile);
  }

  // ---------- Draft import/export ----------
  function saveDraftFile() {
    var blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = draftName() + ".json";
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    toast("Draft disimpan");
  }
  function loadDraftFile(e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        state = mergeState(JSON.parse(reader.result));
        populateForm(); save(); toast("Draft dimuat");
      } catch (err) { toast("Gagal membaca draft"); }
    };
    reader.readAsText(file);
    e.target.value = "";
  }
  function draftName() {
    return sanitize((state.docType === "offer" ? "Penawaran" : "Invoice") + "_" + (state.to || "draft") + "_" + state.date);
  }

  // ---------- PDF ----------
  // "Rp" sits at the left of the cell, the amount right-aligned (matches originals).
  function rpCell(value, bold) {
    return {
      columns: [
        { text: "Rp", width: "auto" },
        { text: idr.format(value), width: "*", alignment: "right" }
      ],
      columnGap: 4,
      bold: !!bold
    };
  }
  // Bank line: colour the rek number and the name after "a/n" red (bold), like the originals.
  function bankCell(line) {
    var m = /^(.*?\brek\s+)(.+?)(\s+a\/n\s+)(.+)$/i.exec(line);
    if (!m) return { text: line, bold: true, margin: [0, 1, 0, 0] };
    return {
      text: [
        { text: m[1] },
        { text: m[2], color: "#ff0000" },
        { text: m[3] },
        { text: m[4], color: "#ff0000" }
      ],
      bold: true,
      margin: [0, 1, 0, 0]
    };
  }

  function buildDocDefinition() {
    var cols = state.columns;
    var logoData = (window.LOGOS && window.LOGOS[state.logo]) || null;

    // Table columns
    var keys = ["no", "jenis"];
    OPTIONAL_COLS.forEach(function (c) { if (cols[c]) keys.push(c); });
    keys.push("total");
    var ncols = keys.length;

    var widthMap = { no: 24, jenis: "*", qty: 34, satuan: 50, harga: 84, keterangan: "*", total: 102 };
    var widths = keys.map(function (k) { return widthMap[k]; });

    var headerRow = keys.map(function (k) {
      return { text: colLabel(k), bold: true, alignment: "center" };
    });

    var bodyRows = state.rows.map(function (row, i) {
      return keys.map(function (k) {
        if (k === "no") return { text: String(i + 1), alignment: "center" };
        if (k === "jenis") return { text: row.jenis || "", bold: false };
        if (k === "keterangan") return { text: row.keterangan || "", alignment: "center", bold: false };
        if (k === "qty") return { text: row.qty || "", alignment: "center", bold: false };
        if (k === "satuan") return { text: row.satuan || "", alignment: "center", bold: false };
        if (k === "harga") {
          var h = parseMoney(row.harga);
          if (h.free) return { text: "Free", alignment: "center" };
          if (h.empty) return { text: "" };
          return rpCell(h.value, true);
        }
        if (k === "total") {
          var t = rowTotal(row);
          if (t.free) return { text: "Free", alignment: "center" };
          return rpCell(t.value, true);
        }
        return { text: "" };
      });
    });

    // Totals as spanning table rows (matches the originals).
    function spanRow(label, valueCell) {
      var r = [{ text: label, colSpan: ncols - 1, alignment: "center", bold: true }];
      for (var i = 0; i < ncols - 2; i++) r.push({});
      r.push(valueCell);
      return r;
    }
    var sum = 0;
    state.rows.forEach(function (r) { var t = rowTotal(r); if (!t.free) sum += t.value; });
    bodyRows.push(spanRow("TOTAL", rpCell(sum, true)));

    var table = {
      table: { headerRows: 1, widths: widths, body: [headerRow].concat(bodyRows) },
      layout: {
        hLineWidth: function () { return 0.75; },
        vLineWidth: function () { return 0.75; },
        hLineColor: function () { return "#000000"; },
        vLineColor: function () { return "#000000"; },
        paddingTop: function () { return 3; },
        paddingBottom: function () { return 3; }
      },
      margin: [0, 4, 0, 14]
    };

    // Header: large logo left, bold address right
    var addressStack = state.address.split("\n").map(function (line) {
      return { text: line, alignment: "right" };
    });
    var header = {
      columns: [
        logoData ? { image: logoData, fit: [200, 128], width: 200 } : { text: "", width: 200 },
        { stack: addressStack, width: "*", alignment: "right", margin: [0, 6, 0, 0] }
      ],
      columnGap: 8,
      margin: [0, 0, 0, 0]
    };

    var content = [header];
    content.push({ text: state.city + ", " + formatTanggal(state.date), alignment: "right", margin: [0, 28, 0, 18] });
    content.push({ text: "To: " + (state.to || "-") });
    content.push({ text: "Loc: " + (state.loc || "-"), margin: [0, 0, 0, 8] });
    if (state.docType === "offer") {
      if (state.intro.trim()) content.push({ text: state.intro, bold: false, margin: [0, 4, 0, 10] });
    } else {
      content.push({ text: "Invoice", bold: true, fontSize: 14, alignment: "center", margin: [0, 8, 0, 10] });
    }
    content.push(table);

    content.push({ text: "Term of Payment :", bold: true, italics: true, decoration: "underline", margin: [0, 4, 0, 2] });
    if (state.termOfPayment.trim()) content.push({ text: state.termOfPayment, bold: true, margin: [0, 0, 0, 8] });
    content.push({ text: "Payment can be paid to :", bold: true, margin: [0, 8, 0, 2] });
    if (state.bank1) content.push(bankCell(state.bank1));
    if (state.bank2) content.push(bankCell(state.bank2));

    return {
      pageSize: "A4",
      pageMargins: [56, 44, 56, 44],
      defaultStyle: { font: "Tinos", fontSize: 11, bold: true, color: "#000000" },
      content: content
    };
  }

  var previewUrl = null;
  function makePdf(mode) {
    if (!window.pdfMake) { toast("pdfmake belum termuat"); return; }
    var dd;
    try { dd = buildDocDefinition(); } catch (e) { toast("Gagal membuat PDF"); return; }
    var doc = pdfMake.createPdf(dd);
    if (mode === "download") {
      doc.download(draftName() + ".pdf");
    } else {
      // Blob URL is more robust than a data: URL under file:// origins.
      doc.getBlob(function (blob) {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        previewUrl = URL.createObjectURL(blob);
        // Create the iframe only now, always with a valid src. (No iframe exists
        // at page load, so a file:// page can never load itself into an empty frame.)
        var frame = el("previewFrame");
        if (!frame) {
          frame = document.createElement("iframe");
          frame.id = "previewFrame";
          frame.title = "Preview PDF";
          el("previewOverlay").appendChild(frame);
        }
        frame.src = previewUrl;
        el("btnOpenTab").href = previewUrl;
        el("previewOverlay").hidden = false;
      });
    }
  }
  function closePreview() {
    el("previewOverlay").hidden = true;
    var frame = el("previewFrame");
    if (frame) frame.parentNode.removeChild(frame); // remove so no idle frame lingers
    el("btnOpenTab").removeAttribute("href");
    if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
  }

  // ---------- Toast ----------
  var toastTimer = null;
  function toast(msg) {
    var t = el("toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "toast";
      t.className = "toast";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, 1800);
  }

  // ---------- Init ----------
  loadStored();
  document.addEventListener("DOMContentLoaded", function () {
    populateForm();
    wire();
  });
})();

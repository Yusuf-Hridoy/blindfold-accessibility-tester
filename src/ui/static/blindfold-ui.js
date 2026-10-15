// Blindfold web UI: plain JavaScript, no build step. Talks to the local
// server with the session token from the page URL.
"use strict";

(() => {
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const byId = (id) => document.getElementById(id);
  const FINDING_ANNOUNCE_DELAY_MILLISECONDS = 800;

  let eventSource = null;
  let currentRunId = null;
  let currentKind = "scan";
  let findingCount = 0;
  let findingAnnounceTimer = null;

  // ---- Talking to the server ----

  async function callApi(method, path, body) {
    const headers = { "X-Blindfold-Token": token };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    let response;
    try {
      response = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch {
      return { ok: false, status: 0, data: { error: "Can't reach Blindfold. Is `blindfold ui` still running in the terminal?" } };
    }
    let data = {};
    try {
      data = await response.json();
    } catch {
      // Not JSON: keep the empty object.
    }
    return { ok: response.ok, status: response.status, data };
  }

  // ---- Small helpers ----

  function plural(count, singular, pluralForm) {
    return `${count} ${count === 1 ? singular : pluralForm}`;
  }

  const CONFIDENCE_LABELS = { certain: "certain", likely: "likely", "check-by-hand": "check by hand", unknown: "unknown" };

  function kindLabel(kind) {
    return kind === "journey" ? "Journey" : "Scan";
  }

  function readableDate(isoDate) {
    const date = new Date(isoDate);
    return Number.isNaN(date.getTime()) ? isoDate : date.toLocaleString();
  }

  /** `state` colours the status line: running, passed, failed or idle. */
  function announce(text, state) {
    const status = byId("run-status");
    status.textContent = text;
    if (state) status.dataset.state = state;
  }

  const VIEWPORT_LABELS = { desktop: "Desktop", mobile: "Mobile" };

  function listItem(text, className) {
    const item = document.createElement("li");
    item.textContent = text;
    if (className) item.className = className;
    return item;
  }

  // ---- Field errors: shown next to the field, announced when focus moves there ----

  function clearErrors(form) {
    for (const error of form.querySelectorAll(".field-error")) {
      error.textContent = "";
      error.hidden = true;
    }
    for (const field of form.querySelectorAll("[aria-invalid]")) field.removeAttribute("aria-invalid");
  }

  function showFieldError(fieldId, message) {
    const field = byId(fieldId);
    const error = byId(`${fieldId}-error`);
    error.textContent = message;
    error.hidden = false;
    field.setAttribute("aria-invalid", "true");
    field.focus();
  }

  function showFormError(formErrorId, message) {
    const error = byId(formErrorId);
    error.textContent = message;
    error.hidden = false;
    announce(message);
  }

  /** `fields` maps the server's field names to element ids. */
  function showRequestError(result, fields, formErrorId) {
    const message = result.data.error ?? `Request failed (HTTP ${result.status}).`;
    const fieldId = fields[result.data.field];
    if (fieldId) showFieldError(fieldId, message);
    else showFormError(formErrorId, message);
  }

  // ---- Runs and live progress ----

  function setRunning(running) {
    byId("scan-button").disabled = running;
    byId("journey-button").disabled = running;
    byId("cancel-button").hidden = !running;
  }

  function resetProgress() {
    byId("transcript-list").replaceChildren();
    byId("finding-list").replaceChildren();
    byId("finding-empty").hidden = false;
    byId("progress-details").hidden = false;
    byId("result-section").hidden = true;
    findingCount = 0;
    clearTimeout(findingAnnounceTimer);
  }

  function startRun(kind, runId) {
    currentKind = kind;
    currentRunId = runId;
    resetProgress();
    setRunning(true);
    announce(`${kindLabel(kind)} starting…`, "running");
    const url = `/api/runs/${encodeURIComponent(runId)}/events?token=${encodeURIComponent(token)}`;
    eventSource = new EventSource(url);
    eventSource.onmessage = (message) => handleEvent(JSON.parse(message.data));
    eventSource.onerror = () => {
      // EventSource reconnects by itself; it only gives up when the server refuses.
      if (eventSource && eventSource.readyState === EventSource.CLOSED) {
        stopListening();
        showResult({ heading: "Connection lost", verdict: "Lost the connection to Blindfold. Is `blindfold ui` still running?", passed: false });
      }
    };
  }

  function stopListening() {
    if (eventSource) eventSource.close();
    eventSource = null;
    setRunning(false);
    clearTimeout(findingAnnounceTimer);
  }

  /** Announces the barrier count once findings stop arriving (a scan's come in a burst). */
  function scheduleFindingAnnouncement() {
    clearTimeout(findingAnnounceTimer);
    findingAnnounceTimer = setTimeout(() => {
      announce(`${plural(findingCount, "barrier", "barriers")} found so far.`);
    }, FINDING_ANNOUNCE_DELAY_MILLISECONDS);
  }

  function focusStopItem(event) {
    const item = document.createElement("li");
    const step = document.createElement("span");
    step.className = "stop-step";
    step.textContent = event.journeyStep !== undefined ? `${event.journeyStep}.${event.step}` : `Tab ${event.step}`;
    const visible = event.focusVisible === false ? " · focus not visible" : "";
    item.append(step, `${event.element} — heard “${event.announcement}”${visible}`);
    if (event.focusVisible === false) item.classList.add("focus-no");
    return item;
  }

  function handleEvent(event) {
    const transcript = byId("transcript-list");
    switch (event.type) {
      case "run-started":
        announce(`${kindLabel(event.kind)} started: ${event.subject}`, "running");
        break;
      case "page-loaded":
        transcript.append(listItem(`Page loaded: ${event.url}`, "note"));
        break;
      case "focus-stop":
        transcript.append(focusStopItem(event));
        break;
      case "step-started":
        transcript.append(listItem(`Journey step ${event.stepNumber}: ${event.action}`, "note"));
        break;
      case "step-finished":
        transcript.append(listItem(`Step ${event.stepNumber} ${event.status.replaceAll("-", " ")}${event.blockedBecause ? `: ${event.blockedBecause}` : ""}`, "note"));
        break;
      case "finding": {
        findingCount++;
        byId("finding-empty").hidden = true;
        const step = event.journeyStep !== undefined ? ` (step ${event.journeyStep})` : "";
        const confidence = CONFIDENCE_LABELS[event.confidence ?? "unknown"];
        byId("finding-list").append(listItem(`${event.ruleId} [${confidence}] ${event.summary}${step}`));
        scheduleFindingAnnouncement();
        break;
      }
      case "run-finished":
        stopListening();
        announce(
          `${kindLabel(currentKind)} finished: ${event.summary.verdict}.`,
          event.summary.barrierCount === 0 && event.summary.outcome !== "blocked" ? "passed" : "failed",
        );
        showFinishedRun(event);
        loadHistory();
        break;
      case "run-failed":
        stopListening();
        announce(`${kindLabel(currentKind)} failed.`, "failed");
        showResult({ heading: `${kindLabel(currentKind)} failed`, verdict: event.message, passed: false });
        break;
      case "run-cancelled":
        stopListening();
        announce(`${kindLabel(currentKind)} cancelled. No report was written.`, "idle");
        showResult({ heading: `${kindLabel(currentKind)} cancelled`, verdict: "No report was written.", passed: null });
        break;
    }
  }

  // ---- Result panel ----

  /** One chip per confidence level that has findings, e.g. "2 certain". */
  function confidenceChips(counts) {
    return Object.keys(CONFIDENCE_LABELS)
      .filter((level) => (counts?.[level] ?? 0) > 0)
      .map((level) => listItem(`${counts[level]} ${CONFIDENCE_LABELS[level]}`, level));
  }

  function showResult({ heading, verdict, passed, warnings = [], confidenceCounts = null, numbers = [], reportUrl = null, audioUrl = null }) {
    byId("result-heading").textContent = heading;
    const verdictElement = byId("result-verdict");
    verdictElement.textContent = verdict;
    verdictElement.className = passed === null ? "verdict" : passed ? "verdict verdict-pass" : "verdict verdict-fail";
    const warning = byId("result-warning");
    warning.textContent = warnings.map((text) => `Warning: ${text}`).join(" ");
    warning.hidden = warnings.length === 0;
    const confidence = byId("result-confidence");
    const chips = confidenceChips(confidenceCounts);
    confidence.replaceChildren(...chips);
    confidence.hidden = chips.length === 0;

    const numberList = byId("result-numbers");
    numberList.replaceChildren(
      ...numbers.map(([term, value]) => {
        const group = document.createElement("div");
        const termElement = document.createElement("dt");
        const valueElement = document.createElement("dd");
        termElement.textContent = term;
        valueElement.textContent = String(value);
        group.append(termElement, valueElement);
        return group;
      }),
    );
    numberList.hidden = numbers.length === 0;

    byId("result-report").hidden = !reportUrl;
    if (reportUrl) byId("result-report-link").href = reportUrl;
    byId("result-audio").hidden = !audioUrl;
    const player = byId("result-audio-player");
    if (audioUrl) player.src = audioUrl;
    else player.removeAttribute("src");

    byId("result-section").hidden = false;
    byId("result-heading").focus();
  }

  function showFinishedRun(event) {
    const { summary } = event;
    showResult({
      heading: `${kindLabel(summary.kind)} result: ${summary.subject}`,
      verdict: summary.verdict,
      passed: summary.barrierCount === 0 && summary.outcome !== "blocked",
      warnings: summary.warnings ?? [],
      confidenceCounts: summary.confidenceCounts,
      numbers: [
        ["Barriers", summary.barrierCount],
        ["Rules failed", summary.rulesFailed],
        ["Focus stops", summary.focusStops],
        ["Time", `${(summary.durationMilliseconds / 1000).toFixed(1)} s`],
      ],
      reportUrl: event.reportUrl,
      audioUrl: event.audioUrl,
    });
  }

  // ---- Forms ----

  function readViewport(form) {
    const checked = form.querySelector('input[name="viewport"]:checked');
    return checked ? checked.value : "";
  }

  async function submitScan(event) {
    event.preventDefault();
    const form = byId("scan-form");
    clearErrors(form);
    const url = byId("scan-url").value.trim();
    if (url === "") {
      showFieldError("scan-url", "Enter the address of the page to scan, e.g. https://example.com/.");
      return;
    }
    const body = { url, viewport: readViewport(form), audio: form.querySelector('input[name="audio"]').checked };
    const result = await callApi("POST", "/api/scans", body);
    if (!result.ok) {
      showRequestError(result, { url: "scan-url" }, "scan-form-error");
      return;
    }
    startRun("scan", result.data.runId);
  }

  async function submitJourney(event) {
    event.preventDefault();
    const form = byId("journey-form");
    clearErrors(form);
    const body = {
      file: byId("journey-file").value,
      baseUrl: byId("journey-base-url").value.trim(),
      viewport: readViewport(form),
      audio: form.querySelector('input[name="audio"]').checked,
    };
    const result = await callApi("POST", "/api/journeys", body);
    if (!result.ok) {
      showRequestError(result, { file: "journey-file", baseUrl: "journey-base-url" }, "journey-form-error");
      return;
    }
    startRun("journey", result.data.runId);
  }

  async function cancelRun() {
    if (!currentRunId) return;
    announce("Cancelling…");
    const result = await callApi("POST", `/api/runs/${encodeURIComponent(currentRunId)}/cancel`);
    if (!result.ok && result.status !== 409) announce(result.data.error ?? "Couldn't cancel the run.");
  }

  // ---- Journeys ----

  async function loadJourneyFiles() {
    const result = await callApi("GET", "/api/journey-files");
    const note = byId("journey-folder-note");
    const form = byId("journey-form");
    if (!result.ok) {
      note.textContent = result.data.error ?? "Couldn't list the journey files.";
      return;
    }
    const { folder, files } = result.data;
    if (!folder || files.length === 0) {
      note.textContent = folder
        ? `No journey files (*.yaml) in ${folder}.`
        : "No journeys folder. Start the UI with --journeys <folder> to run journeys here.";
      form.hidden = true;
      return;
    }
    note.textContent = `Journey files from ${folder}.`;
    byId("journey-file").replaceChildren(
      ...files.map((file) => {
        const option = document.createElement("option");
        option.value = file;
        option.textContent = file;
        return option;
      }),
    );
    form.hidden = false;
  }

  // ---- History and compare ----

  function historyRow(run) {
    const row = document.createElement("tr");
    const dateCell = document.createElement("td");
    const link = document.createElement("a");
    link.href = run.reportUrl;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = readableDate(run.scannedAt);
    dateCell.append(link);
    row.append(dateCell);
    for (const text of [kindLabel(run.kind), run.subject, VIEWPORT_LABELS[run.viewport] ?? run.viewport]) {
      const cell = document.createElement("td");
      cell.textContent = text;
      row.append(cell);
    }
    const count = document.createElement("td");
    count.textContent = String(run.barrierCount);
    count.className = run.barrierCount === 0 ? "count-zero" : "count-some";
    row.append(count);
    return row;
  }

  function runOption(run) {
    const option = document.createElement("option");
    option.value = run.id;
    option.textContent = `${readableDate(run.scannedAt)} · ${kindLabel(run.kind)} · ${run.subject} · ${plural(run.barrierCount, "barrier", "barriers")}`;
    return option;
  }

  /**
   * The pair Compare starts with: the newest run that has an earlier run of the
   * same kind (scans and journeys can't be compared), preferring an earlier
   * run of the same page or journey. Runs are newest first.
   */
  function defaultComparison(runs) {
    for (const [index, later] of runs.entries()) {
      const sameKind = runs.slice(index + 1).filter((run) => run.kind === later.kind);
      const earlier = sameKind.find((run) => run.subject === later.subject) ?? sameKind[0];
      if (earlier) return [earlier, later];
    }
    return [runs[1], runs[0]];
  }

  async function loadHistory() {
    const result = await callApi("GET", "/api/history");
    if (!result.ok) {
      byId("history-empty").textContent = result.data.error ?? "Couldn't read the history.";
      return;
    }
    const runs = result.data.runs;
    byId("history-empty").hidden = runs.length > 0;
    byId("history-table").hidden = runs.length === 0;
    byId("history-rows").replaceChildren(...runs.map(historyRow));

    const enoughToCompare = runs.length >= 2;
    byId("compare-note").hidden = enoughToCompare;
    byId("compare-form").hidden = !enoughToCompare;
    if (!enoughToCompare) return;
    const oldSelect = byId("compare-old");
    const newSelect = byId("compare-new");
    oldSelect.replaceChildren(...runs.map(runOption));
    newSelect.replaceChildren(...runs.map(runOption));
    const [earlier, later] = defaultComparison(runs);
    oldSelect.value = earlier.id;
    newSelect.value = later.id;
  }

  function findingListBlock(title, items) {
    const block = document.createElement("div");
    const heading = document.createElement("h4");
    heading.textContent = `${title} (${items.length})`;
    block.append(heading);
    if (items.length > 0) {
      const list = document.createElement("ul");
      list.append(...items.map((text) => listItem(text)));
      block.append(list);
    }
    return block;
  }

  async function submitCompare(event) {
    event.preventDefault();
    const form = byId("compare-form");
    clearErrors(form);
    const result = await callApi("POST", "/api/compare", { oldRunId: byId("compare-old").value, newRunId: byId("compare-new").value });
    if (!result.ok) {
      showRequestError(result, { oldRunId: "compare-old", newRunId: "compare-new" }, "compare-new-error");
      byId("compare-result").hidden = true;
      return;
    }
    const comparison = result.data;
    const verdict = byId("compare-verdict");
    verdict.textContent = comparison.journeySummary ? `${comparison.verdict}. Journey ${comparison.journeySummary}.` : `${comparison.verdict}.`;
    verdict.className = comparison.totals.new === 0 ? "verdict verdict-pass" : "verdict verdict-fail";
    const { totals } = comparison;
    byId("compare-totals").textContent = `${totals.fixed} fixed · ${totals.new} new · ${totals.stillPresent} still present`;
    byId("compare-lists").replaceChildren(
      ...comparison.warnings.map((warning) => {
        const paragraph = document.createElement("p");
        paragraph.className = "hint";
        paragraph.textContent = warning;
        return paragraph;
      }),
      findingListBlock("New barriers", comparison.new),
      findingListBlock("Fixed barriers", comparison.fixed),
    );
    byId("compare-link").href = comparison.comparisonUrl;
    byId("compare-result").hidden = false;
    byId("compare-result-heading").focus();
  }

  // ---- Start ----

  document.addEventListener("DOMContentLoaded", () => {
    byId("scan-form").addEventListener("submit", submitScan);
    byId("journey-form").addEventListener("submit", submitJourney);
    byId("compare-form").addEventListener("submit", submitCompare);
    byId("cancel-button").addEventListener("click", cancelRun);
    loadJourneyFiles();
    loadHistory();
  });
})();

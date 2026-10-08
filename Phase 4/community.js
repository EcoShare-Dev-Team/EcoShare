// ==========================================
// EcoShare - Community
// ==========================================

let currentUser = null;

// ==========================================
// DOM
// ==========================================

const reportType = document.getElementById("reportType");

const targetId = document.getElementById("targetId");

const reason = document.getElementById("reason");

const description = document.getElementById("description");

const characterCount = document.getElementById("characterCount");

const submitReportBtn = document.getElementById("submitReportBtn");

const formMessage = document.getElementById("formMessage");

// ==========================================
// INITIALIZE
// ==========================================

document.addEventListener("DOMContentLoaded", initialize);

async function initialize() {
  // --------------------------------------
  // CHECK LOGIN
  // --------------------------------------

  const {
    data: { session },
    error,
  } = await supabaseClient.auth.getSession();

  if (error) {
    console.error("Session error:", error);

    return;
  }

  if (!session) {
    alert("Please login first.");

    window.location.href = "../Phase 1/login.html";

    return;
  }

  currentUser = session.user;

  // --------------------------------------
  // INITIALIZE REPORT TARGET
  // --------------------------------------

  initializeReportTarget();
}

// ==========================================
// LOAD REPORT TARGET FROM URL
// ==========================================

function initializeReportTarget() {
  const params = new URLSearchParams(window.location.search);

  const type = params.get("type");

  const id = params.get("id");

  if (!type || !id) {
    return;
  }

  // --------------------------------------
  // REPORT USER
  // --------------------------------------

  if (type === "user") {
    reportType.value = "user";

    targetId.type = "text";

    targetId.value = id;

    targetId.placeholder = "User ID";
  }

  // --------------------------------------
  // REPORT LISTING
  // --------------------------------------

  if (type === "listing") {
    reportType.value = "listing";

    targetId.type = "number";

    targetId.value = id;

    targetId.placeholder = "Listing ID";
  }
}

// ==========================================
// CHARACTER COUNT
// ==========================================

description.addEventListener("input", () => {
  characterCount.textContent = description.value.length;
});

// ==========================================
// REPORT TYPE CHANGE
// ==========================================

reportType.addEventListener("change", () => {
  targetId.value = "";

  clearMessage();

  if (reportType.value === "user") {
    targetId.type = "text";

    targetId.placeholder = "Enter User ID";
  } else if (reportType.value === "listing") {
    targetId.type = "number";

    targetId.placeholder = "Enter Listing ID";
  } else {
    targetId.type = "text";

    targetId.placeholder = "Enter ID";
  }
});

// ==========================================
// SUBMIT REPORT
// ==========================================

submitReportBtn.addEventListener("click", submitReport);

async function submitReport() {
  clearMessage();

  // --------------------------------------
  // VALIDATE REPORT TYPE
  // --------------------------------------

  if (!reportType.value) {
    showMessage("Please select a report type.", true);

    return;
  }

  // --------------------------------------
  // VALIDATE TARGET
  // --------------------------------------

  if (!targetId.value.trim()) {
    showMessage("Please enter the target ID.", true);

    return;
  }

  // --------------------------------------
  // VALIDATE REASON
  // --------------------------------------

  if (!reason.value) {
    showMessage("Please select a reason.", true);

    return;
  }

  // --------------------------------------
  // PREPARE TARGET
  // --------------------------------------

  const reportedUserId =
    reportType.value === "user" ? targetId.value.trim() : null;

  const reportedResourceId =
    reportType.value === "listing" ? Number(targetId.value) : null;

  // --------------------------------------
  // BUTTON STATE
  // --------------------------------------

  submitReportBtn.disabled = true;

  submitReportBtn.textContent = "Submitting...";

  try {
    // ----------------------------------
    // SECURE RPC
    // ----------------------------------

    const { data, error } = await supabaseClient.rpc("submit_report", {
      p_reported_user_id: reportedUserId,

      p_reported_resource_id: reportedResourceId,

      p_reason: reason.value,

      p_description: description.value.trim() || null,
    });

    // ----------------------------------
    // RPC ERROR
    // ----------------------------------

    if (error) {
      throw error;
    }

    console.log("Report created:", data);

    // ----------------------------------
    // SUCCESS
    // ----------------------------------

    showMessage("Report submitted successfully. Status: Pending.", false);

    // ----------------------------------
    // RESET FORM
    // ----------------------------------

    reportType.value = "";

    targetId.value = "";

    targetId.placeholder = "Enter ID";

    targetId.type = "text";

    reason.value = "";

    description.value = "";

    characterCount.textContent = "0";
  } catch (error) {
    console.error("Report error:", error);

    showMessage(error.message || "Unable to submit report.", true);
  } finally {
    submitReportBtn.disabled = false;

    submitReportBtn.textContent = "Submit Report";
  }
}

// ==========================================
// SHOW MESSAGE
// ==========================================

function showMessage(message, isError) {
  formMessage.textContent = message;

  formMessage.style.color = isError ? "#c62828" : "#16803c";
}

// ==========================================
// CLEAR MESSAGE
// ==========================================

function clearMessage() {
  formMessage.textContent = "";
}

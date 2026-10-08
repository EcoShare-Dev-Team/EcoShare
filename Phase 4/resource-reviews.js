// ==========================================
// ECOSHARE - RESOURCE REVIEWS
// ==========================================

let currentUser = null;
let resourceId = null;
let transactionId = null;
let selectedRating = 0;

// ==========================================
// DOM
// ==========================================

const currentUserName = document.getElementById("currentUserName");

const logoutBtn = document.getElementById("logoutBtn");

const resourceTitle = document.getElementById("resourceTitle");

const resourceDescription = document.getElementById("resourceDescription");

const resourceCategory = document.getElementById("resourceCategory");

const averageRating = document.getElementById("averageRating");

const averageStars = document.getElementById("averageStars");

const reviewCount = document.getElementById("reviewCount");

const reviewsContainer = document.getElementById("reviewsContainer");

const writeReviewSection = document.getElementById("writeReviewSection");

const reviewEligibilityMessage = document.getElementById(
  "reviewEligibilityMessage",
);

const eligibilityTitle = document.getElementById("eligibilityTitle");

const eligibilityText = document.getElementById("eligibilityText");

const reviewText = document.getElementById("reviewText");

const characterCount = document.getElementById("characterCount");

const submitReviewBtn = document.getElementById("submitReviewBtn");

const formMessage = document.getElementById("formMessage");

const selectedRatingText = document.getElementById("selectedRatingText");

// ==========================================
// INITIALIZE
// ==========================================

document.addEventListener("DOMContentLoaded", initialize);

async function initialize() {
  // --------------------------------------
  // Get resource ID
  // --------------------------------------

  const params = new URLSearchParams(window.location.search);

  resourceId = params.get("id");

  if (!resourceId) {
    alert("Resource ID is missing.");

    return;
  }

  resourceId = Number(resourceId);

  const backToResource = document.getElementById("backToResource");

  if (backToResource) {
    backToResource.href = `../Phase 2/resource-details.html?id=${resourceId}`;
  }

  // --------------------------------------
  // Check login
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

    return;
  }

  currentUser = session.user;

  // --------------------------------------
  // Load everything
  // --------------------------------------

  await loadCurrentUser();

  await loadResource();

  await loadResourceReviews();

  await checkReviewEligibility();

  initializeRatingSelector();

  initializeCharacterCounter();
}

// ==========================================
// LOAD CURRENT USER
// ==========================================

async function loadCurrentUser() {
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("full_name")
    .eq("id", currentUser.id)
    .single();

  if (error) {
    console.error("Profile error:", error);

    return;
  }

  // Resource Reviews page does not have
  // a currentUserName element.
  // So only update it if it exists.

  if (currentUserName) {
    currentUserName.textContent = data.full_name || "EcoShare Member";
  }
}

// ==========================================
// LOAD RESOURCE
// ==========================================

async function loadResource() {
  const { data, error } = await supabaseClient
    .from("resources")
    .select(
      `
                id,
                title,
                description,
                category
            `,
    )
    .eq("id", resourceId)
    .single();

  if (error) {
    console.error("Resource error:", error);

    resourceTitle.textContent = "Unable to load resource.";

    return;
  }

  resourceTitle.textContent = data.title || "Untitled Resource";

  resourceDescription.textContent =
    data.description || "No description available.";

  resourceCategory.textContent = data.category || "Resource";
}

// ==========================================
// LOAD RESOURCE REVIEWS
// ==========================================

async function loadResourceReviews() {
  reviewsContainer.innerHTML = `
            <p class="loading-text">
                Loading reviews...
            </p>
        `;

  const { data: reviews, error } = await supabaseClient
    .from("resource_reviews")
    .select(
      `
                id,
                resource_id,
                transaction_id,
                reviewer_id,
                rating,
                review,
                created_at
            `,
    )
    .eq("resource_id", resourceId)
    .order("created_at", {
      ascending: false,
    });

  if (error) {
    console.error("Resource reviews error:", error);

    reviewsContainer.innerHTML = `
                <p class="no-reviews">
                    Unable to load reviews.
                </p>
            `;

    return;
  }

  // --------------------------------------
  // No reviews
  // --------------------------------------

  if (!reviews || reviews.length === 0) {
    setRatingSummary([]);

    reviewsContainer.innerHTML = `
                <p class="no-reviews">
                    No reviews yet.
                    Be the first community member
                    to review this resource.
                </p>
            `;

    return;
  }

  // --------------------------------------
  // Rating summary
  // --------------------------------------

  setRatingSummary(reviews);

  // --------------------------------------
  // Render reviews
  // --------------------------------------

  reviewsContainer.innerHTML = "";

  for (const review of reviews) {
    const reviewerName = await getReviewerName(review.reviewer_id);

    const reviewCard = document.createElement("div");

    reviewCard.className = "review-card";

    reviewCard.innerHTML = `
                <div class="review-top">

                    <span class="reviewer-name">
                        ${escapeHtml(reviewerName)}
                    </span>

                    <span class="review-stars">
                        ${createStars(review.rating)}
                    </span>

                </div>


                <p class="review-text">
                    ${
                      review.review
                        ? escapeHtml(review.review)
                        : "No written review."
                    }
                </p>


                <span class="review-date">
                    ${formatDate(review.created_at)}
                </span>
            `;

    reviewsContainer.appendChild(reviewCard);
  }
}

// ==========================================
// RATING SUMMARY
// ==========================================

function setRatingSummary(reviews) {
  if (!reviews || reviews.length === 0) {
    averageRating.textContent = "0.0";

    averageStars.textContent = "☆☆☆☆☆";

    reviewCount.textContent = "0";

    updateBreakdown([]);

    return;
  }

  const total = reviews.reduce((sum, review) => sum + Number(review.rating), 0);

  const average = total / reviews.length;

  averageRating.textContent = average.toFixed(1);

  averageStars.textContent = createStars(average);

  reviewCount.textContent = reviews.length;

  updateBreakdown(reviews);
}

// ==========================================
// RATING BREAKDOWN
// ==========================================

function updateBreakdown(reviews) {
  const counts = {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
  };

  reviews.forEach((review) => {
    const rating = Number(review.rating);

    if (counts[rating] !== undefined) {
      counts[rating]++;
    }
  });

  const total = reviews.length;

  for (let rating = 1; rating <= 5; rating++) {
    const count = counts[rating];

    const percentage = total === 0 ? 0 : (count / total) * 100;

    const bar = document.getElementById(`bar${rating}`);

    const countElement = document.getElementById(`count${rating}`);

    if (bar) {
      bar.style.width = `${percentage}%`;
    }

    if (countElement) {
      countElement.textContent = count;
    }
  }
}

// ==========================================
// GET REVIEWER NAME
// ==========================================

async function getReviewerName(reviewerId) {
  const { data, error } = await supabaseClient.rpc("get_profile_name", {
    p_user_id: reviewerId,
  });

  if (error) {
    console.error("Reviewer name error:", error);

    return "EcoShare Member";
  }

  return data || "EcoShare Member";
}

// ==========================================
// CHECK REVIEW ELIGIBILITY
// ==========================================
async function checkReviewEligibility() {
  // ------------------------------------------
  // DEFAULT STATE
  // ------------------------------------------

  writeReviewSection.classList.add("hidden");

  reviewEligibilityMessage.classList.add("hidden");

  // ------------------------------------------
  // GET ALL COMPLETED TRANSACTIONS
  // FOR CURRENT BORROWER + RESOURCE
  // ------------------------------------------

  const { data: transactions, error: transactionError } = await supabaseClient
    .from("transactions")
    .select(
      `
                id,
                resource_id,
                borrower_id,
                status,
                completed_at
            `,
    )
    .eq("resource_id", resourceId)
    .eq("borrower_id", currentUser.id)
    .eq("status", "completed")
    .order("completed_at", {
      ascending: false,
    });

  // ------------------------------------------
  // TRANSACTION ERROR
  // ------------------------------------------

  if (transactionError) {
    console.error("Eligibility error:", transactionError);

    eligibilityTitle.textContent = "Unable to check review eligibility";

    eligibilityText.textContent = "Please refresh the page and try again.";

    reviewEligibilityMessage.classList.remove("hidden");

    return;
  }

  // ------------------------------------------
  // NO COMPLETED TRANSACTION
  // ------------------------------------------

  if (!transactions || transactions.length === 0) {
    eligibilityTitle.textContent = "Review unavailable";

    eligibilityText.textContent =
      "You can review this resource after returning it.";

    reviewEligibilityMessage.classList.remove("hidden");

    return;
  }

  // ------------------------------------------
  // GET REVIEWS ALREADY SUBMITTED
  // BY CURRENT USER FOR THIS RESOURCE
  // ------------------------------------------

  const { data: existingReviews, error: reviewError } = await supabaseClient
    .from("resource_reviews")
    .select(
      `
                id,
                transaction_id
            `,
    )
    .eq("resource_id", resourceId)
    .eq("reviewer_id", currentUser.id);

  if (reviewError) {
    console.error("Existing review error:", reviewError);

    eligibilityTitle.textContent = "Unable to check existing reviews";

    eligibilityText.textContent = "Please refresh the page and try again.";

    reviewEligibilityMessage.classList.remove("hidden");

    return;
  }

  // ------------------------------------------
  // CREATE SET OF REVIEWED TRANSACTIONS
  // ------------------------------------------

  const reviewedTransactionIds = new Set(
    (existingReviews || []).map((review) => String(review.transaction_id)),
  );

  // ------------------------------------------
  // FIND A COMPLETED TRANSACTION
  // THAT HAS NOT BEEN REVIEWED
  // ------------------------------------------

  const eligibleTransaction = transactions.find(
    (transaction) => !reviewedTransactionIds.has(String(transaction.id)),
  );

  // ------------------------------------------
  // ALL COMPLETED TRANSACTIONS REVIEWED
  // ------------------------------------------

  if (!eligibleTransaction) {
    eligibilityTitle.textContent = "Review already submitted";

    eligibilityText.textContent =
      "You have already reviewed all your completed transactions for this resource.";

    reviewEligibilityMessage.classList.remove("hidden");

    return;
  }

  // ------------------------------------------
  // USER IS ELIGIBLE
  // ------------------------------------------

  transactionId = eligibleTransaction.id;

  writeReviewSection.classList.remove("hidden");
}

// ==========================================
// STAR SELECTOR
// ==========================================

function initializeRatingSelector() {
  const stars = document.querySelectorAll(".star-selector button");

  stars.forEach((star) => {
    star.addEventListener("click", () => {
      selectedRating = Number(star.dataset.rating);

      stars.forEach((currentStar) => {
        const rating = Number(currentStar.dataset.rating);

        currentStar.classList.toggle("active", rating <= selectedRating);
      });

      selectedRatingText.textContent = `${selectedRating} out of 5 stars`;
    });
  });
}

// ==========================================
// CHARACTER COUNTER
// ==========================================

function initializeCharacterCounter() {
  reviewText.addEventListener("input", () => {
    characterCount.textContent = reviewText.value.length;
  });
}

// ==========================================
// SUBMIT REVIEW
// ==========================================

submitReviewBtn.addEventListener("click", submitResourceReview);

async function submitResourceReview() {
  formMessage.textContent = "";

  // --------------------------------------
  // Validate rating
  // --------------------------------------

  if (selectedRating < 1 || selectedRating > 5) {
    formMessage.textContent = "Please select a rating.";

    formMessage.style.color = "#c62828";

    return;
  }

  submitReviewBtn.disabled = true;

  submitReviewBtn.textContent = "Submitting...";

  try {
    const { data, error } = await supabaseClient.rpc("submit_resource_review", {
      p_transaction_id: transactionId,

      p_resource_id: resourceId,

      p_rating: selectedRating,

      p_review: reviewText.value.trim() || null,
    });

    if (error) {
      throw error;
    }

    console.log("Resource review created:", data);

    formMessage.textContent = "Review submitted successfully!";

    formMessage.style.color = "#16803c";

    // ----------------------------------
    // Hide form
    // ----------------------------------

    writeReviewSection.classList.add("hidden");

    // ----------------------------------
    // Reload reviews
    // ----------------------------------

    await loadResourceReviews();
  } catch (error) {
    console.error("Review submission error:", error);

    formMessage.textContent = error.message || "Unable to submit review.";

    formMessage.style.color = "#c62828";

    submitReviewBtn.disabled = false;

    submitReviewBtn.textContent = "Submit Review";
  }
}

// ==========================================
// CREATE STARS
// ==========================================

function createStars(rating) {
  const rounded = Math.round(Number(rating));

  let stars = "";

  for (let i = 1; i <= 5; i++) {
    stars += i <= rounded ? "★" : "☆";
  }

  return stars;
}

// ==========================================
// FORMAT DATE
// ==========================================

function formatDate(date) {
  if (!date) {
    return "";
  }

  return new Date(date).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ==========================================
// ESCAPE HTML
// ==========================================

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ==========================================
// LOGOUT
// ==========================================

logoutBtn.addEventListener("click", async () => {
  const { error } = await supabaseClient.auth.signOut();

  if (error) {
    console.error("Logout error:", error);

    return;
  }

  window.location.href = "../Phase 1/login.html";
});

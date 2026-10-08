(() => {
  "use strict";

  const PROFILE_TABLE = "profiles";
  const PROFILE_PHOTOS_BUCKET = "profile-photos";

  const MAX_AVATAR_SIZE = 5 * 1024 * 1024;
  const MAX_NAME_LENGTH = 100;
  const MAX_LOCATION_LENGTH = 100;
  const MAX_BIO_LENGTH = 300;

  const ALLOWED_IMAGE_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
  ]);

  const IMAGE_EXTENSIONS = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };

  const LOGIN_URL = "login.html?redirect=profile.html";
  const HOME_URL = "../index.html";

  const profileName = document.getElementById("profileName");
  const profileEmail = document.getElementById("profileEmail");
  const profileRole = document.getElementById("profileRole");

  const profileForm = document.getElementById("profileForm");
  const fullNameInput = document.getElementById("fullName");
  const emailInput = document.getElementById("email");
  const roleInput = document.getElementById("role");
  const genderInput = document.getElementById("gender");

  const profileGender = document.getElementById("profileGender");
  const genderDisplay = document.getElementById("genderDisplay");

  const locationInput = document.getElementById("location");
  const bioInput = document.getElementById("bio");
  const bioCount = document.getElementById("bioCount");

  const profileMessage = document.getElementById("profileMessage");
  const saveProfileButton = document.getElementById("saveProfileButton");
  const logoutButton = document.getElementById("logoutButton");

  const profileAvatar = document.getElementById("profileAvatar");
  const avatarMenuButton = document.getElementById("avatarMenuButton");
  const avatarMenu = document.getElementById("avatarMenu");
  const avatarUpload = document.getElementById("avatarUpload");

  const takePhotoButton = document.getElementById("takePhotoButton");
  const choosePhotoButton = document.getElementById("choosePhotoButton");
  const removePhotoButton = document.getElementById("removePhotoButton");

  const navProfilePhoto = document.getElementById("navProfilePhoto");
  const menuProfilePhoto = document.getElementById("menuProfilePhoto");
  const menuProfileName = document.getElementById("menuProfileName");
  const menuProfileEmail = document.getElementById("menuProfileEmail");

  const cameraModal = document.getElementById("cameraModal");
  const cameraPreview = document.getElementById("cameraPreview");
  const cameraCanvas = document.getElementById("cameraCanvas");
  const capturePhotoButton = document.getElementById("capturePhotoButton");
  const closeCameraButton = document.getElementById("closeCameraButton");
  const cancelCameraButton = document.getElementById("cancelCameraButton");
  const cameraMessage = document.getElementById("cameraMessage");

  const useCurrentLocationButton =
    document.getElementById("useCurrentLocation");

  const locationMessage = document.getElementById("locationMessage");

  let currentUser = null;
  let currentAvatarUrl = null;
  let currentAvatarPath = null;
  let currentGender = "";

  let currentLatitude = null;
  let currentLongitude = null;

  let previewUrl = null;
  let cameraStream = null;

  let cameraRequestId = 0;
  let locationRequestId = 0;
  let profileLoadId = 0;

  let isAvatarProcessing = false;
  let isProfileSaving = false;
  let isLogoutProcessing = false;
  let isCameraOpening = false;

  function getSupabaseClient() {
    const client = window.supabaseClient;

    if (!client || !client.auth || !client.from || !client.storage) {
      console.error("EcoShare: Supabase client is unavailable.");

      showProfileMessage(
        "Unable to connect to EcoShare. Please refresh the page.",
      );

      return null;
    }

    return client;
  }

  function showProfileMessage(message, type = "error") {
    if (!profileMessage) {
      return;
    }

    profileMessage.textContent = String(message);

    profileMessage.className = `profile-message ${type}`;

    profileMessage.hidden = false;

    profileMessage.setAttribute("role", "status");

    profileMessage.setAttribute("aria-live", "polite");
  }

  function hideProfileMessage() {
    if (!profileMessage) {
      return;
    }

    profileMessage.hidden = true;
    profileMessage.textContent = "";
    profileMessage.className = "profile-message";
  }

  function setLocationMessage(message, type = "info") {
    if (!locationMessage) {
      return;
    }

    locationMessage.textContent = String(message);

    locationMessage.className =
      type === "error"
        ? "location-message error"
        : type === "success"
          ? "location-message success"
          : "location-message";
  }

  function setCameraMessage(message) {
    if (!cameraMessage) {
      return;
    }

    cameraMessage.textContent = String(message);
  }

  function normalizeErrorMessage(error) {
    const rawMessage = String(
      error?.message || error?.error_description || error?.details || "",
    ).trim();

    const message = rawMessage.toLowerCase();

    if (
      message.includes("bucket not found") ||
      message.includes("bucket does not exist")
    ) {
      return (
        "The profile-photos Storage bucket was not found. " +
        "Please create the bucket in Supabase Storage."
      );
    }

    if (
      message.includes("row-level security") ||
      message.includes("rls") ||
      message.includes("permission denied") ||
      message.includes("42501")
    ) {
      return (
        "Supabase denied this operation. " +
        "Please check the profiles RLS policy and database permissions."
      );
    }

    if (
      message.includes("jwt") ||
      message.includes("token") ||
      message.includes("unauthorized") ||
      message.includes("401")
    ) {
      return "Your session may have expired. Please log in again.";
    }

    if (message.includes("network") || message.includes("fetch")) {
      return "A network error occurred. Please check your connection and try again.";
    }

    if (message.includes("duplicate key")) {
      return "This profile information conflicts with an existing record.";
    }

    return rawMessage || "Something went wrong. Please try again.";
  }

  function normalizeGender(gender) {
    return String(gender || "")
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_");
  }

  function formatGender(gender) {
    const value = String(gender || "").trim();

    if (!value) {
      return "Not specified";
    }

    const normalized = normalizeGender(value);

    const labels = {
      male: "Male",
      female: "Female",
      other: "Other",
      prefer_not_to_say: "Prefer not to say",
    };

    return labels[normalized] || value.charAt(0).toUpperCase() + value.slice(1);
  }

  function getAvatarService() {
    const avatarService = window.EcoShareAvatar;

    if (
      !avatarService ||
      typeof avatarService.getAvatarURL !== "function" ||
      typeof avatarService.getDefaultAvatar !== "function" ||
      typeof avatarService.isValidSupabaseAvatarURL !== "function" ||
      typeof avatarService.setImageSource !== "function"
    ) {
      console.error(
        "EcoShare: Shared avatar service is unavailable. " +
          "Make sure page.js loads before profile.js.",
      );

      return null;
    }

    return avatarService;
  }

  function displayAvatar(photoUrl = null, gender = currentGender) {
    const avatarService = getAvatarService();

    if (!avatarService) {
      return;
    }

    const normalizedGender = normalizeGender(gender);

    const isTemporaryPreview =
      typeof photoUrl === "string" && photoUrl.startsWith("blob:");

    const avatar = isTemporaryPreview
      ? photoUrl
      : avatarService.getAvatarURL(currentUser, {
          avatar_url: photoUrl || null,

          gender: normalizedGender,
        });

    avatarService.setImageSource(profileAvatar, avatar, normalizedGender);

    avatarService.setImageSource(navProfilePhoto, avatar, normalizedGender);

    avatarService.setImageSource(menuProfilePhoto, avatar, normalizedGender);
  }

  function getOwnedAvatarPath(photoUrl, userId) {
    const avatarService = getAvatarService();

    if (
      !avatarService ||
      typeof photoUrl !== "string" ||
      !photoUrl.trim() ||
      typeof userId !== "string" ||
      !userId
    ) {
      return null;
    }

    if (!avatarService.isValidSupabaseAvatarURL(photoUrl)) {
      return null;
    }

    try {
      const url = new URL(photoUrl.trim());

      const marker = "/storage/v1/object/public/profile-photos/";

      if (!url.pathname.startsWith(marker)) {
        return null;
      }

      const encodedPath = url.pathname.slice(marker.length);

      const segments = encodedPath
        .split("/")
        .map((segment) => decodeURIComponent(segment));

      if (
        segments.length < 2 ||
        segments[0] !== userId ||
        segments.some(
          (segment) =>
            !segment ||
            segment === "." ||
            segment === ".." ||
            segment.includes("/") ||
            segment.includes("\\") ||
            segment.includes(".."),
        )
      ) {
        return null;
      }

      return segments.join("/");
    } catch {
      return null;
    }
  }

  function isOwnedStoragePath(storagePath, userId) {
    if (
      typeof storagePath !== "string" ||
      typeof userId !== "string" ||
      !storagePath ||
      !userId
    ) {
      return false;
    }

    const segments = storagePath.split("/");

    return (
      segments.length >= 2 &&
      segments[0] === userId &&
      !segments.some(
        (segment) =>
          !segment ||
          segment === "." ||
          segment === ".." ||
          segment.includes("/") ||
          segment.includes("\\") ||
          segment.includes(".."),
      )
    );
  }

  function isValidAvatarUrl(photoUrl, userId) {
    return Boolean(getOwnedAvatarPath(photoUrl, userId));
  }

  function getSafeAvatarUrl(photoUrl, userId) {
    return isValidAvatarUrl(photoUrl, userId) ? photoUrl.trim() : null;
  }

  function displayGender(gender) {
    const value = String(gender || "").trim();

    const formatted = formatGender(value);

    if (genderInput) {
      genderInput.value = value;
    }

    if (profileGender) {
      profileGender.textContent = formatted;
    }

    if (genderDisplay) {
      genderDisplay.textContent = formatted;
    }
  }

  function lockGenderField() {
    if (!genderInput) {
      return;
    }

    genderInput.disabled = true;

    genderInput.setAttribute("aria-readonly", "true");
  }

  function unlockGenderField() {
    if (!genderInput) {
      return;
    }

    genderInput.disabled = false;

    genderInput.removeAttribute("aria-readonly");
  }

  function handleGenderChange() {
    if (!genderInput || currentGender) {
      return;
    }

    const selectedGender = normalizeGender(genderInput.value);

    if (!currentAvatarUrl) {
      displayAvatar(null, selectedGender);
    }
  }

  if (genderInput) {
    genderInput.addEventListener("change", handleGenderChange);
  }

  function updateRemovePhotoVisibility() {
    if (!removePhotoButton) {
      return;
    }

    const hasCustomAvatar =
      typeof currentAvatarUrl === "string" && currentAvatarUrl.trim() !== "";

    removePhotoButton.style.removeProperty("display");

    removePhotoButton.hidden = !hasCustomAvatar;
  }

  function updateNavbarProfileDetails(name, email, avatarUrl) {
    if (menuProfileName) {
      menuProfileName.textContent = name || "My Account";
    }

    if (menuProfileEmail) {
      menuProfileEmail.textContent = email || "EcoShare Member";
    }

    displayAvatar(avatarUrl || null, currentGender);
  }

  async function refreshNavbar() {
    if (
      window.EcoSharePage &&
      typeof window.EcoSharePage.refreshAuth === "function"
    ) {
      try {
        await window.EcoSharePage.refreshAuth();

        return;
      } catch (error) {
        console.warn("EcoShare: Shared navbar refresh failed:", error);
      }
    }

    if (typeof window.updateAuthNavigation === "function") {
      try {
        await window.updateAuthNavigation();
      } catch (error) {
        console.warn("EcoShare: Navbar refresh failed:", error);
      }
    }
  }

  async function loadProfile() {
    const loadId = ++profileLoadId;

    hideProfileMessage();

    const supabase = getSupabaseClient();

    if (!supabase) {
      return;
    }

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        throw userError;
      }

      if (!user) {
        window.location.replace(LOGIN_URL);

        return;
      }

      currentUser = user;

      const { data: profile, error: profileError } = await supabase
        .from(PROFILE_TABLE)
        .select(
          `
                        id,
                        full_name,
                        gender,
                        location,
                        latitude,
                        longitude,
                        avatar_url,
                        role,
                        bio,
                        created_at,
                        updated_at
                    `,
        )
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) {
        throw profileError;
      }

      if (loadId !== profileLoadId) {
        return;
      }

      if (!profile) {
        showProfileMessage(
          "Your profile record was not found in the database.",
        );

        return;
      }

      const displayName = profile.full_name || "EcoShare User";

      const displayEmail = user.email || "";

      const displayRole = profile.role || "user";

      if (profileName) {
        profileName.textContent = displayName;
      }

      if (profileEmail) {
        profileEmail.textContent = displayEmail;
      }

      if (profileRole) {
        profileRole.textContent = displayRole;
      }

      if (fullNameInput) {
        fullNameInput.value = profile.full_name || "";
      }

      if (emailInput) {
        emailInput.value = displayEmail;
      }

      if (roleInput) {
        roleInput.value = displayRole;
      }

      if (locationInput) {
        locationInput.value = profile.location || "";
      }

      if (bioInput) {
        bioInput.value = profile.bio || "";
      }

      const latitude = Number(profile.latitude);

      const longitude = Number(profile.longitude);

      currentLatitude = Number.isFinite(latitude) ? latitude : null;

      currentLongitude = Number.isFinite(longitude) ? longitude : null;

      currentGender = normalizeGender(profile.gender);

      displayGender(currentGender);

      if (currentGender) {
        lockGenderField();
      } else {
        unlockGenderField();
      }

      const storedAvatarUrl =
        typeof profile.avatar_url === "string" ? profile.avatar_url.trim() : "";

      currentAvatarUrl = getSafeAvatarUrl(storedAvatarUrl, user.id);

      currentAvatarPath = currentAvatarUrl
        ? getOwnedAvatarPath(currentAvatarUrl, user.id)
        : null;

      displayAvatar(currentAvatarUrl, currentGender);

      updateRemovePhotoVisibility();

      updateNavbarProfileDetails(displayName, displayEmail, currentAvatarUrl);

      updateBioCount();
    } catch (error) {
      console.error("EcoShare: Profile loading error:", error);

      showProfileMessage(normalizeErrorMessage(error));
    }
  }

  function updateBioCount() {
    if (!bioInput || !bioCount) {
      return;
    }

    bioCount.textContent = String(bioInput.value.length);
  }

  if (bioInput) {
    bioInput.addEventListener("input", updateBioCount);
  }

  function toggleAvatarMenu(event) {
    event?.stopPropagation();

    if (!avatarMenu || !avatarMenuButton) {
      return;
    }

    const isOpen = !avatarMenu.hidden;

    avatarMenu.hidden = isOpen;

    avatarMenuButton.setAttribute("aria-expanded", String(!isOpen));
  }

  function closeAvatarMenu() {
    if (!avatarMenu || !avatarMenuButton) {
      return;
    }

    avatarMenu.hidden = true;

    avatarMenuButton.setAttribute("aria-expanded", "false");
  }

  if (avatarMenuButton) {
    avatarMenuButton.addEventListener("click", toggleAvatarMenu);
  }

  document.addEventListener("click", (event) => {
    if (!avatarMenu || !avatarMenuButton) {
      return;
    }

    if (
      !avatarMenu.contains(event.target) &&
      !avatarMenuButton.contains(event.target)
    ) {
      closeAvatarMenu();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeAvatarMenu();
    }
  });

  function stopCamera() {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());

      cameraStream = null;
    }

    if (cameraPreview) {
      try {
        cameraPreview.pause();
      } catch {
        /* intentionally ignored */
      }

      cameraPreview.srcObject = null;
    }
  }

  function closeCamera() {
    cameraRequestId++;

    stopCamera();

    if (cameraModal) {
      cameraModal.hidden = true;
    }

    if (capturePhotoButton) {
      capturePhotoButton.disabled = true;
    }

    setCameraMessage("");
  }

  async function openCamera() {
    if (isCameraOpening || isAvatarProcessing || isLogoutProcessing) {
      return;
    }

    if (!cameraModal || !cameraPreview) {
      showProfileMessage("Camera interface is missing. Check profile.html.");

      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showProfileMessage(
        "Camera access is not supported. Use localhost, HTTPS, or Gallery.",
      );

      return;
    }

    isCameraOpening = true;

    const requestId = ++cameraRequestId;

    cameraModal.hidden = false;

    if (capturePhotoButton) {
      capturePhotoButton.disabled = true;
    }

    setCameraMessage("Waiting for camera permission...");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
        },
        audio: false,
      });

      if (cameraModal.hidden || requestId !== cameraRequestId) {
        stream.getTracks().forEach((track) => track.stop());

        return;
      }

      cameraStream = stream;

      cameraPreview.srcObject = cameraStream;

      await cameraPreview.play();

      if (cameraModal.hidden || requestId !== cameraRequestId) {
        stopCamera();

        return;
      }

      if (capturePhotoButton) {
        capturePhotoButton.disabled = false;
      }

      setCameraMessage("Camera is ready. Take your photo when you are ready.");
    } catch (error) {
      console.error("EcoShare: Camera access error:", error);

      stopCamera();

      if (error.name === "NotAllowedError") {
        setCameraMessage(
          "Camera permission was denied. Allow camera access or use Gallery.",
        );
      } else if (error.name === "NotFoundError") {
        setCameraMessage("No camera was found. Please use Gallery.");
      } else if (error.name === "NotReadableError") {
        setCameraMessage(
          "The camera is already being used by another application.",
        );
      } else {
        setCameraMessage("Unable to access the camera. Please use Gallery.");
      }
    } finally {
      isCameraOpening = false;
    }
  }

  if (takePhotoButton) {
    takePhotoButton.addEventListener("click", () => {
      closeAvatarMenu();
      openCamera();
    });
  }

  if (closeCameraButton) {
    closeCameraButton.addEventListener("click", closeCamera);
  }

  if (cancelCameraButton) {
    cancelCameraButton.addEventListener("click", closeCamera);
  }

  if (cameraModal) {
    cameraModal.addEventListener("click", (event) => {
      if (event.target === cameraModal) {
        closeCamera();
      }
    });
  }

  async function capturePhoto() {
    if (!cameraStream || !cameraPreview || !cameraCanvas) {
      setCameraMessage("Camera is not ready.");

      return;
    }

    if (cameraPreview.videoWidth <= 0 || cameraPreview.videoHeight <= 0) {
      setCameraMessage("Camera image is not ready yet.");

      return;
    }

    try {
      if (capturePhotoButton) {
        capturePhotoButton.disabled = true;
      }

      setCameraMessage("Capturing photo...");

      const width = cameraPreview.videoWidth;

      const height = cameraPreview.videoHeight;

      cameraCanvas.width = width;

      cameraCanvas.height = height;

      const context = cameraCanvas.getContext("2d");

      if (!context) {
        throw new Error("Unable to access camera canvas.");
      }

      context.drawImage(cameraPreview, 0, 0, width, height);

      const blob = await new Promise((resolve) => {
        cameraCanvas.toBlob(resolve, "image/jpeg", 0.9);
      });

      if (!blob) {
        throw new Error("Unable to create image.");
      }

      const file = new File([blob], `camera-${Date.now()}.jpg`, {
        type: "image/jpeg",
      });

      closeCamera();

      await processAvatarFile(file);
    } catch (error) {
      console.error("EcoShare: Photo capture error:", error);

      setCameraMessage("Unable to capture photo. Please try again.");

      if (capturePhotoButton) {
        capturePhotoButton.disabled = false;
      }
    }
  }

  if (capturePhotoButton) {
    capturePhotoButton.addEventListener("click", capturePhoto);
  }

  function validateAvatarFile(file) {
    if (!file) {
      return "Please select an image.";
    }

    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      return "Only JPG, PNG, and WEBP images are allowed.";
    }

    if (!Number.isFinite(file.size) || file.size <= 0) {
      return "The selected image is invalid.";
    }

    if (file.size > MAX_AVATAR_SIZE) {
      return "Profile photo must be 5 MB or smaller.";
    }

    return null;
  }

  function setAvatarControlsDisabled(disabled) {
    if (avatarMenuButton) {
      avatarMenuButton.disabled = disabled;
    }

    if (takePhotoButton) {
      takePhotoButton.disabled = disabled;
    }

    if (choosePhotoButton) {
      choosePhotoButton.disabled = disabled;
    }

    if (avatarUpload) {
      avatarUpload.disabled = disabled;
    }
  }

  async function uploadAvatarToSupabase(file) {
    const supabase = getSupabaseClient();

    if (!supabase) {
      return;
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      throw userError;
    }

    if (!user) {
      window.location.replace(LOGIN_URL);

      return;
    }

    const validationError = validateAvatarFile(file);

    if (validationError) {
      throw new Error(validationError);
    }

    const extension = IMAGE_EXTENSIONS[file.type];

    if (!extension) {
      throw new Error("Unsupported image type.");
    }

    const randomId =
      typeof crypto?.randomUUID === "function"
        ? crypto.randomUUID()
        : Array.from(crypto.getRandomValues(new Uint32Array(4)))
            .map((value) => value.toString(16).padStart(8, "0"))
            .join("");

    const fileName = `${randomId}.${extension}`;

    const uploadedFilePath = `${user.id}/${fileName}`;

    if (!isOwnedStoragePath(uploadedFilePath, user.id)) {
      throw new Error("The uploaded file path could not be verified.");
    }

    const previousAvatarPath = currentAvatarPath;

    const previousAvatarUrl = currentAvatarUrl;

    let uploadCompleted = false;

    try {
      const { error: uploadError } = await supabase.storage
        .from(PROFILE_PHOTOS_BUCKET)
        .upload(uploadedFilePath, file, {
          cacheControl: "3600",

          upsert: false,

          contentType: file.type,
        });

      if (uploadError) {
        throw uploadError;
      }

      uploadCompleted = true;

      const { data: publicUrlData } = supabase.storage
        .from(PROFILE_PHOTOS_BUCKET)
        .getPublicUrl(uploadedFilePath);

      const publicUrl = publicUrlData?.publicUrl;

      if (!publicUrl) {
        throw new Error("Unable to generate the profile photo URL.");
      }

      if (!isValidAvatarUrl(publicUrl, user.id)) {
        throw new Error(
          "The generated profile photo URL could not be verified.",
        );
      }

      const { data: updatedProfile, error: updateError } = await supabase
        .from(PROFILE_TABLE)
        .update({
          avatar_url: publicUrl,

          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id)
        .select(
          `
                        id,
                        full_name,
                        gender,
                        location,
                        latitude,
                        longitude,
                        avatar_url,
                        role,
                        bio,
                        updated_at
                    `,
        )
        .single();

      if (updateError) {
        throw updateError;
      }

      if (!updatedProfile) {
        throw new Error("Your profile could not be updated.");
      }

      currentAvatarUrl = publicUrl;

      currentAvatarPath = uploadedFilePath;

      displayAvatar(currentAvatarUrl, currentGender);

      updateRemovePhotoVisibility();

      updateNavbarProfileDetails(
        updatedProfile.full_name || "EcoShare User",
        currentUser?.email || "",
        currentAvatarUrl,
      );

      if (
        previousAvatarPath &&
        isOwnedStoragePath(previousAvatarPath, user.id) &&
        previousAvatarPath !== uploadedFilePath
      ) {
        const { error: cleanupError } = await supabase.storage
          .from(PROFILE_PHOTOS_BUCKET)
          .remove([previousAvatarPath]);

        if (cleanupError) {
          console.warn("EcoShare: Unable to remove old avatar:", cleanupError);
        }
      }

      showProfileMessage("Profile photo uploaded successfully.", "success");

      await refreshNavbar();
    } catch (error) {
      if (uploadCompleted) {
        const { error: cleanupError } = await supabase.storage
          .from(PROFILE_PHOTOS_BUCKET)
          .remove([uploadedFilePath]);

        if (cleanupError) {
          console.warn(
            "EcoShare: Unable to clean up failed avatar upload:",
            cleanupError,
          );
        }
      }

      currentAvatarUrl = previousAvatarUrl;

      currentAvatarPath = previousAvatarPath;

      displayAvatar(currentAvatarUrl, currentGender);

      updateRemovePhotoVisibility();

      throw error;
    }
  }

  async function processAvatarFile(file) {
    if (isAvatarProcessing || isLogoutProcessing) {
      return;
    }

    const validationError = validateAvatarFile(file);

    if (validationError) {
      showProfileMessage(validationError);

      return;
    }

    isAvatarProcessing = true;

    setAvatarControlsDisabled(true);

    hideProfileMessage();

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);

      previewUrl = null;
    }

    try {
      previewUrl = URL.createObjectURL(file);

      displayAvatar(previewUrl, currentGender);

      showProfileMessage("Uploading profile photo...", "success");

      await uploadAvatarToSupabase(file);
    } catch (error) {
      console.error("EcoShare: Avatar upload error:", error);

      displayAvatar(currentAvatarUrl, currentGender);

      updateRemovePhotoVisibility();

      showProfileMessage(normalizeErrorMessage(error));
    } finally {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);

        previewUrl = null;
      }

      isAvatarProcessing = false;

      setAvatarControlsDisabled(false);

      updateRemovePhotoVisibility();
    }
  }

  if (choosePhotoButton) {
    choosePhotoButton.addEventListener("click", () => {
      if (isAvatarProcessing || isLogoutProcessing) {
        return;
      }

      closeAvatarMenu();

      if (avatarUpload) {
        avatarUpload.value = "";

        avatarUpload.click();
      }
    });
  }

  if (avatarUpload) {
    avatarUpload.addEventListener("change", async () => {
      const file = avatarUpload.files?.[0];

      if (!file) {
        return;
      }

      await processAvatarFile(file);

      avatarUpload.value = "";
    });
  }

  async function removeAvatar() {
    if (isAvatarProcessing || isProfileSaving || isLogoutProcessing) {
      return;
    }

    if (!currentAvatarUrl) {
      updateRemovePhotoVisibility();
      closeAvatarMenu();

      return;
    }

    const supabase = getSupabaseClient();

    if (!supabase) {
      return;
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      showProfileMessage(normalizeErrorMessage(userError));

      return;
    }

    if (!user) {
      window.location.replace(LOGIN_URL);

      return;
    }

    const avatarUrlToRemove = currentAvatarUrl;

    const avatarPathToRemove = currentAvatarPath;

    if (
      !avatarPathToRemove ||
      !isOwnedStoragePath(avatarPathToRemove, user.id)
    ) {
      showProfileMessage("The current profile photo could not be verified.");

      return;
    }

    isAvatarProcessing = true;

    setAvatarControlsDisabled(true);

    closeAvatarMenu();
    hideProfileMessage();

    try {
      const { data: updatedProfile, error: updateError } = await supabase
        .from(PROFILE_TABLE)
        .update({
          avatar_url: null,

          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id)
        .select(
          `
                        id,
                        full_name,
                        gender,
                        location,
                        latitude,
                        longitude,
                        avatar_url,
                        role,
                        bio,
                        updated_at
                    `,
        )
        .single();

      if (updateError) {
        throw updateError;
      }

      if (!updatedProfile) {
        throw new Error("Your profile could not be updated.");
      }

      const { error: storageError } = await supabase.storage
        .from(PROFILE_PHOTOS_BUCKET)
        .remove([avatarPathToRemove]);

      if (storageError) {
        console.warn(
          "EcoShare: Avatar URL removed but Storage cleanup failed:",
          storageError,
        );
      }

      currentAvatarUrl = null;

      currentAvatarPath = null;

      displayAvatar(null, currentGender);

      updateRemovePhotoVisibility();

      updateNavbarProfileDetails(
        updatedProfile.full_name || "EcoShare User",
        currentUser?.email || "",
        null,
      );

      showProfileMessage("Profile photo removed successfully.", "success");

      await refreshNavbar();
    } catch (error) {
      console.error("EcoShare: Remove avatar error:", error);

      currentAvatarUrl = avatarUrlToRemove;

      currentAvatarPath = avatarPathToRemove;

      displayAvatar(currentAvatarUrl, currentGender);

      updateRemovePhotoVisibility();

      showProfileMessage(normalizeErrorMessage(error));
    } finally {
      isAvatarProcessing = false;

      setAvatarControlsDisabled(false);

      updateRemovePhotoVisibility();
    }
  }

  if (removePhotoButton) {
    removePhotoButton.addEventListener("click", removeAvatar);
  }

  function validateProfileForm() {
    const fullName = String(fullNameInput?.value || "").trim();

    const location = String(locationInput?.value || "").trim();

    const bio = String(bioInput?.value || "").trim();

    const selectedGender = normalizeGender(genderInput?.value || "");

    if (!fullName) {
      return {
        valid: false,

        message: "Please enter your full name.",
      };
    }

    if (fullName.length > MAX_NAME_LENGTH) {
      return {
        valid: false,

        message: `Full name must be ${MAX_NAME_LENGTH} characters or fewer.`,
      };
    }

    if (location.length > MAX_LOCATION_LENGTH) {
      return {
        valid: false,

        message: `Location must be ${MAX_LOCATION_LENGTH} characters or fewer.`,
      };
    }

    if (bio.length > MAX_BIO_LENGTH) {
      return {
        valid: false,

        message: `Bio must be ${MAX_BIO_LENGTH} characters or fewer.`,
      };
    }

    if (!currentGender && !selectedGender) {
      return {
        valid: false,

        message: "Please select your gender.",
      };
    }

    if (
      selectedGender &&
      !["male", "female", "other", "prefer_not_to_say"].includes(selectedGender)
    ) {
      return {
        valid: false,

        message: "Please select a valid gender.",
      };
    }

    return {
      valid: true,

      fullName,
      location,
      bio,
      selectedGender,
    };
  }

  async function saveProfile(event) {
    event.preventDefault();

    if (isProfileSaving || isAvatarProcessing || isLogoutProcessing) {
      return;
    }

    const supabase = getSupabaseClient();

    if (!supabase) {
      return;
    }

    const validation = validateProfileForm();

    if (!validation.valid) {
      showProfileMessage(validation.message);

      return;
    }

    const { fullName, location, bio, selectedGender } = validation;

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      showProfileMessage(normalizeErrorMessage(userError));

      return;
    }

    if (!user) {
      window.location.replace(LOGIN_URL);

      return;
    }

    currentUser = user;

    let latitude = Number(currentLatitude);

    let longitude = Number(currentLongitude);

    if (!isValidCoordinates(latitude, longitude)) {
      latitude = null;

      longitude = null;
    }

    const updatePayload = {
      full_name: fullName,

      location: location || null,

      bio: bio || null,

      latitude,

      longitude,

      updated_at: new Date().toISOString(),
    };

    if (!currentGender) {
      updatePayload.gender = selectedGender || null;
    }

    isProfileSaving = true;

    if (saveProfileButton) {
      saveProfileButton.disabled = true;

      saveProfileButton.dataset.originalHtml = saveProfileButton.innerHTML;

      saveProfileButton.innerHTML = `
                <i
                    class="fa-solid fa-spinner fa-spin"
                    aria-hidden="true"
                ></i>
                <span>Saving...</span>
            `;
    }

    hideProfileMessage();

    try {
      const { data: updatedProfile, error: updateError } = await supabase
        .from(PROFILE_TABLE)
        .update(updatePayload)
        .eq("id", user.id)
        .select(
          `
                        id,
                        full_name,
                        gender,
                        location,
                        latitude,
                        longitude,
                        avatar_url,
                        role,
                        bio,
                        created_at,
                        updated_at
                    `,
        )
        .single();

      if (updateError) {
        throw updateError;
      }

      if (!updatedProfile) {
        throw new Error("Your profile could not be updated.");
      }

      currentUser = user;

      currentGender = normalizeGender(updatedProfile.gender);

      currentLatitude = Number.isFinite(Number(updatedProfile.latitude))
        ? Number(updatedProfile.latitude)
        : null;

      currentLongitude = Number.isFinite(Number(updatedProfile.longitude))
        ? Number(updatedProfile.longitude)
        : null;

      const safeAvatarUrl = getSafeAvatarUrl(
        updatedProfile.avatar_url,
        user.id,
      );

      currentAvatarUrl = safeAvatarUrl;

      currentAvatarPath = safeAvatarUrl
        ? getOwnedAvatarPath(safeAvatarUrl, user.id)
        : null;

      displayGender(currentGender);

      if (currentGender) {
        lockGenderField();
      }

      if (profileName) {
        profileName.textContent = updatedProfile.full_name || "EcoShare User";
      }

      if (profileRole) {
        profileRole.textContent = updatedProfile.role || "user";
      }

      if (locationInput) {
        locationInput.value = updatedProfile.location || "";
      }

      if (bioInput) {
        bioInput.value = updatedProfile.bio || "";
      }

      displayAvatar(currentAvatarUrl, currentGender);

      updateRemovePhotoVisibility();

      updateBioCount();

      updateNavbarProfileDetails(
        updatedProfile.full_name || "EcoShare User",
        user.email || "",
        currentAvatarUrl,
      );

      showProfileMessage("Profile updated successfully.", "success");

      await refreshNavbar();
    } catch (error) {
      console.error("EcoShare: Profile save error:", error);

      showProfileMessage(normalizeErrorMessage(error));
    } finally {
      isProfileSaving = false;

      if (saveProfileButton) {
        saveProfileButton.disabled = false;

        saveProfileButton.innerHTML =
          saveProfileButton.dataset.originalHtml ||
          `
                        <i
                            class="fa-solid fa-floppy-disk"
                            aria-hidden="true"
                        ></i>
                        <span>Save Changes</span>
                    `;
      }
    }
  }

  if (profileForm) {
    profileForm.addEventListener("submit", saveProfile);
  }

  function isValidCoordinates(latitude, longitude) {
    return (
      Number.isFinite(latitude) &&
      Number.isFinite(longitude) &&
      latitude >= -90 &&
      latitude <= 90 &&
      longitude >= -180 &&
      longitude <= 180
    );
  }

  function clearStoredCoordinates() {
    currentLatitude = null;

    currentLongitude = null;
  }

  if (locationInput) {
    locationInput.addEventListener("input", () => {
      locationRequestId++;

      clearStoredCoordinates();

      setLocationMessage("Location changed. Save Changes to update it.");
    });
  }

  async function getAddressFromCoordinates(latitude, longitude) {
    if (!isValidCoordinates(latitude, longitude)) {
      throw new Error("Invalid coordinates.");
    }

    const url = new URL("https://nominatim.openstreetmap.org/reverse");

    url.searchParams.set("format", "jsonv2");

    url.searchParams.set("lat", String(latitude));

    url.searchParams.set("lon", String(longitude));

    url.searchParams.set("zoom", "18");

    url.searchParams.set("addressdetails", "1");

    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error("Could not convert coordinates into an address.");
    }

    const data = await response.json();

    if (!data || !data.address) {
      throw new Error("No address was found for your current location.");
    }

    const address = data.address;

    const city =
      address.city ||
      address.town ||
      address.village ||
      address.municipality ||
      address.suburb ||
      address.county ||
      "";

    const state = address.state || "";

    const country = address.country || "";

    const parts = [city, state, country].filter(Boolean);

    if (!parts.length) {
      throw new Error("Could not find a readable address.");
    }

    return [...new Set(parts)].join(", ");
  }

  function handleLocationError(error) {
    let message = "Unable to detect your location.";

    if (error && error.code === 1) {
      message =
        "Location permission was denied. Please allow location access or enter your location manually.";
    } else if (error && error.code === 2) {
      message = "Your location could not be determined. Please try again.";
    } else if (error && error.code === 3) {
      message = "Location request timed out. Please try again.";
    }

    setLocationMessage(message, "error");
  }

  async function useCurrentLocation() {
    if (isProfileSaving || isAvatarProcessing || isLogoutProcessing) {
      return;
    }

    if (!navigator.geolocation) {
      setLocationMessage(
        "Geolocation is not supported by this browser.",
        "error",
      );

      return;
    }

    const requestId = ++locationRequestId;

    if (useCurrentLocationButton) {
      useCurrentLocationButton.disabled = true;

      useCurrentLocationButton.dataset.originalHtml =
        useCurrentLocationButton.innerHTML;

      useCurrentLocationButton.innerHTML = `
                <i
                    class="fa-solid fa-spinner fa-spin"
                    aria-hidden="true"
                ></i>
                <span>Detecting...</span>
            `;
    }

    setLocationMessage("Detecting your current location...");

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        if (requestId !== locationRequestId) {
          return;
        }

        try {
          const latitude = Number(position.coords.latitude);

          const longitude = Number(position.coords.longitude);

          if (!isValidCoordinates(latitude, longitude)) {
            throw new Error("Invalid coordinates returned by the browser.");
          }

          currentLatitude = latitude;

          currentLongitude = longitude;

          const readableLocation = await getAddressFromCoordinates(
            latitude,
            longitude,
          );

          if (requestId !== locationRequestId) {
            return;
          }

          if (locationInput) {
            locationInput.value = readableLocation;
          }

          setLocationMessage(
            "Current location detected. Save Changes to update your profile.",
            "success",
          );
        } catch (error) {
          console.error("EcoShare: Location processing error:", error);

          clearStoredCoordinates();

          setLocationMessage(
            error?.message || "Unable to determine your current location.",
            "error",
          );
        } finally {
          if (useCurrentLocationButton) {
            useCurrentLocationButton.disabled = false;

            useCurrentLocationButton.innerHTML =
              useCurrentLocationButton.dataset.originalHtml ||
              `
                                <i
                                    class="fa-solid fa-location-crosshairs"
                                    aria-hidden="true"
                                ></i>
                                <span>Use Current Location</span>
                            `;
          }
        }
      },

      (error) => {
        if (requestId !== locationRequestId) {
          return;
        }

        console.error("EcoShare: Geolocation error:", error);

        handleLocationError(error);

        if (useCurrentLocationButton) {
          useCurrentLocationButton.disabled = false;

          useCurrentLocationButton.innerHTML =
            useCurrentLocationButton.dataset.originalHtml ||
            `
                            <i
                                class="fa-solid fa-location-crosshairs"
                                aria-hidden="true"
                            ></i>
                            <span>Use Current Location</span>
                        `;
        }
      },

      {
        enableHighAccuracy: true,

        timeout: 15000,

        maximumAge: 0,
      },
    );
  }

  if (useCurrentLocationButton) {
    useCurrentLocationButton.addEventListener("click", useCurrentLocation);
  }

  async function logout() {
    if (isLogoutProcessing) {
      return;
    }

    const supabase = getSupabaseClient();

    if (!supabase) {
      return;
    }

    isLogoutProcessing = true;

    if (logoutButton) {
      logoutButton.disabled = true;

      logoutButton.dataset.originalHtml = logoutButton.innerHTML;

      logoutButton.innerHTML = `
                <i
                    class="fa-solid fa-spinner fa-spin"
                    aria-hidden="true"
                ></i>
                <span>Logging out...</span>
            `;
    }

    try {
      const { error } = await supabase.auth.signOut();

      if (error) {
        throw error;
      }

      currentUser = null;

      currentAvatarUrl = null;

      currentAvatarPath = null;

      cleanupProfileResources();

      window.location.replace(HOME_URL);
    } catch (error) {
      console.error("EcoShare: Logout error:", error);

      showProfileMessage(normalizeErrorMessage(error));

      isLogoutProcessing = false;

      if (logoutButton) {
        logoutButton.disabled = false;

        logoutButton.innerHTML =
          logoutButton.dataset.originalHtml ||
          `
                        <i
                            class="fa-solid fa-right-from-bracket"
                            aria-hidden="true"
                        ></i>
                        <span>Logout</span>
                    `;
      }
    }
  }

  if (logoutButton) {
    logoutButton.addEventListener("click", logout);
  }

  function cleanupProfileResources() {
    locationRequestId++;
    cameraRequestId++;

    stopCamera();

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);

      previewUrl = null;
    }
  }

  window.addEventListener("pagehide", cleanupProfileResources, {
    once: true,
  });

  function setupAuthListener() {
    const supabase = getSupabaseClient();

    if (!supabase) {
      return;
    }

    supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        currentUser = null;

        currentAvatarUrl = null;

        currentAvatarPath = null;

        cleanupProfileResources();

        window.location.replace(HOME_URL);

        return;
      }

      if (
        event === "SIGNED_IN" ||
        event === "INITIAL_SESSION" ||
        event === "USER_UPDATED"
      ) {
        if (session?.user) {
          currentUser = session.user;
        }
      }
    });
  }

  async function initializeProfilePage() {
    setupAuthListener();

    await loadProfile();

    updateRemovePhotoVisibility();

    updateBioCount();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeProfilePage, {
      once: true,
    });
  } else {
    initializeProfilePage();
  }
})();

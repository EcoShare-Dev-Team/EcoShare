/*
=========================================================
  ECOSHARE — SUPABASE CLIENT

  File: supabase.js

  Browser-side Supabase configuration.

  SECURITY:
  - Uses only the publishable key.
  - Never use a secret/service-role key here.
  - Database security is enforced with RLS.
  - Public site assets may use public Storage URLs.
=========================================================
*/

"use strict";

(function () {
  /* ========================================================
       1. PREVENT DUPLICATE INITIALIZATION
    ======================================================== */

  if (window.supabaseClient) {
    console.info("EcoShare: Supabase client is already initialized.");

    return;
  }

  /* ========================================================
       2. SUPABASE CONFIGURATION
    ======================================================== */

  const SUPABASE_URL = "https://cplbvftcbiwgqkeqmrbq.supabase.co";

  const SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_mbOq6IqrCKVe0MpCV1a_1A_PduKLGVh";

  /* ========================================================
       3. SUPABASE STORAGE ASSETS

       Public website assets only.

       Gender-based default avatars are stored in the
       public profile-photos bucket.

       User-uploaded profile photos are handled separately
       by profile.js.
    ======================================================== */

  const ECOSHARE_LOGO_URL = `${SUPABASE_URL}/storage/v1/object/public/site-assets/logo.png`;

  const ECOSHARE_AVATAR_MALE_URL = `${SUPABASE_URL}/storage/v1/object/public/profile-photos/avatar-male.png`;

  const ECOSHARE_AVATAR_FEMALE_URL = `${SUPABASE_URL}/storage/v1/object/public/profile-photos/avatar-female.png`;

  const ECOSHARE_AVATAR_DEFAULT_URL = `${SUPABASE_URL}/storage/v1/object/public/profile-photos/avatar-default.png`;

  /* ========================================================
       4. VALIDATE SUPABASE SDK
    ======================================================== */

  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    console.error("EcoShare: Supabase JavaScript SDK was not loaded.");

    return;
  }

  /* ========================================================
       5. VALIDATE CONFIGURATION
    ======================================================== */

  if (!SUPABASE_URL) {
    console.error("EcoShare: Supabase URL is missing.");

    return;
  }

  if (!SUPABASE_PUBLISHABLE_KEY) {
    console.error("EcoShare: Supabase publishable key is missing.");

    return;
  }

  /* ========================================================
       6. VALIDATE SUPABASE URL
    ======================================================== */

  let parsedURL;

  try {
    parsedURL = new URL(SUPABASE_URL);
  } catch (error) {
    console.error("EcoShare: Invalid Supabase URL.", error);

    return;
  }

  if (parsedURL.protocol !== "https:") {
    console.error("EcoShare: Supabase URL must use HTTPS.");

    return;
  }

  /* ========================================================
       7. CREATE SUPABASE CLIENT
    ======================================================== */

  let client;

  try {
    client = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_PUBLISHABLE_KEY,
      {
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true,
        },
      },
    );
  } catch (error) {
    console.error("EcoShare: Failed to initialize Supabase client.", error);

    return;
  }

  /* ========================================================
       8. EXPOSE SUPABASE CLIENT
    ======================================================== */

  window.supabaseClient = client;

  /* ========================================================
       9. EXPOSE SUPABASE PROJECT URL

       This is public information.

       Other EcoShare JavaScript files should use:

           window.ECOSHARE_SUPABASE_URL

       instead of hardcoding the project URL.
    ======================================================== */

  window.ECOSHARE_SUPABASE_URL = parsedURL.origin;

  /* ========================================================
       10. EXPOSE ECOSHARE PUBLIC ASSETS

       Public assets:
       - EcoShare logo
       - Male default avatar
       - Female default avatar
       - Generic default avatar

       User-uploaded profile photos are handled separately.

       Other EcoShare JavaScript files can use:

           window.ECOSHARE_ASSETS.logo
           window.ECOSHARE_ASSETS.avatarMale
           window.ECOSHARE_ASSETS.avatarFemale
           window.ECOSHARE_ASSETS.avatarDefault
    ======================================================== */

  window.ECOSHARE_ASSETS = Object.freeze({
    logo: ECOSHARE_LOGO_URL,
    avatarMale: ECOSHARE_AVATAR_MALE_URL,
    avatarFemale: ECOSHARE_AVATAR_FEMALE_URL,
    avatarDefault: ECOSHARE_AVATAR_DEFAULT_URL,
  });

  /* ========================================================
       11. INITIALIZATION MESSAGE
    ======================================================== */

  console.info("EcoShare: Supabase client initialized successfully.");
})();

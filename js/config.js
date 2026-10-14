/* ==========================================================================
   RenewalTrack — Frontend Runtime Configuration (Vercel & Production)
   ==========================================================================
   This file configures the production backend API URL when the frontend is
   hosted separately (e.g. on Vercel) from the backend (on Render).

   PRODUCTION BACKEND:
     https://renewaltrack-tyvw.onrender.com

   ENVIRONMENT DETECTION:
     - When running locally (localhost, 127.0.0.1, or file://):
       API_URL automatically defaults to "" (same-origin relative /api calls
       against local Express server http://localhost:3000), preserving local
       development without breaking.
     - When running in production (e.g. on *.vercel.app or custom domain):
       API_URL automatically defaults to "https://renewaltrack-tyvw.onrender.com".
     - In addition, vercel.json rewrites /api/* calls to Render as a secondary proxy layer.
     - You can override the URL anytime via:
       localStorage.setItem("rts_api_url", "https://your-custom-backend.onrender.com");
   ========================================================================== */

(function () {
  const isLocalEnvironment =
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1" ||
      window.location.hostname === "" ||
      window.location.protocol === "file:");

  // Production Render Backend URL
  const PRODUCTION_BACKEND_URL = "https://renewaltrack-tyvw.onrender.com";

  window.RTS_CONFIG = window.RTS_CONFIG || {};

  // If not explicitly predefined, determine API base URL based on runtime host
  if (typeof window.RTS_CONFIG.API_URL === "undefined" || window.RTS_CONFIG.API_URL === null) {
    window.RTS_CONFIG.API_URL = isLocalEnvironment ? "" : PRODUCTION_BACKEND_URL;
  }
})();

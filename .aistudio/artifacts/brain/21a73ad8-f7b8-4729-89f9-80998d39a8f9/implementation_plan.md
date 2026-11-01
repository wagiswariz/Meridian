# Firebase Hosting Configuration Plan (`firebase.json` & `.firebaserc`)

## 1. Overview
Configure Firebase Hosting for the GeoPulse WebGIS & QGIS Cloud Workspace application so that the Vite production build (`dist`) can be deployed directly to Firebase Hosting with full support for client-side navigation (`**` rewritten to `/index.html`).

---

## 2. Configuration Files to Create

### A. `/firebase.json`
- **`hosting.public`**: Set to `"dist"` to match the Vite build output directory (`npm run build`).
- **`hosting.ignore`**: Exclude `"firebase.json"`, `"**/.*"`, and `"**/node_modules/**"` from static uploads.
- **`hosting.rewrites`**:
  - Route all client-side paths (`"source": "**"`) to `"destination": "/index.html"` so deep links, workspace URLs, and SPA navigation work seamlessly without 404 errors.
- **`hosting.headers`**:
  - Configure immutable cache headers (`Cache-Control: public, max-age=31536000, immutable`) for hashed build assets (`/assets/**`) and no-cache headers for `/index.html` so new deployments take effect immediately.

### B. `/.firebaserc`
- **`projects.default`**: Set a default Firebase project alias (`"geopulse-webgis-cloud"`) that can be used immediately with `firebase use` or `firebase deploy --only hosting`.

---

## 3. Verification
- Validate JSON syntax in both `/firebase.json` and `/.firebaserc`.
- Run `compile_applet` to verify the production build outputs cleanly to `dist/index.html`.

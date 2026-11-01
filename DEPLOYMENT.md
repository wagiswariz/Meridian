# Meridian Sync — Firebase Hosting Deployment Guide

This guide covers how to build the **Meridian Sync** application for production and deploy it to **Firebase Hosting** using the preconfigured `firebase.json` and `.firebaserc` files.

---

## 1. Prerequisites

1. **Node.js & npm**: Ensure Node.js (v18+ or v20+) and `npm` are installed:
   ```bash
   node -v
   npm -v
   ```
2. **Firebase Account & Project**:
   - Visit the [Firebase Console](https://console.firebase.google.com/).
   - Click **Add project** (or select an existing Firebase project) and copy your **Project ID**.
3. **Firebase CLI**: Install the Firebase command-line tools globally if you haven't already:
   ```bash
   npm install -g firebase-tools
   ```

---

## 2. Install Project Dependencies

From the root directory of the repository, install all required packages:

```bash
npm install
```

---

## 3. Authenticate & Link Your Firebase Project

1. **Log in to Firebase**:
   ```bash
   firebase login
   ```
   This opens a browser window to authenticate with your Google account.

2. **Point `.firebaserc` to your Firebase Project ID**:
   Run the following command to set your active Firebase project (replace `<your-firebase-project-id>` with your actual Project ID from the Firebase Console):
   ```bash
   firebase use <your-firebase-project-id>
   ```
   *(Alternatively, open `.firebaserc` directly and replace `"geopulse-webgis-cloud"` with your Firebase Project ID.)*

---

## 4. Build the Production Bundle

Compile and bundle the React + TypeScript application into the `dist/` directory:

```bash
npm run build
```

### What `npm run build` does:
- Bundles the application using Vite into the static `dist/` folder.
- Generates `dist/index.html` and hashed static assets under `dist/assets/`.

*(Optional)* Preview the production build locally before deploying:
```bash
npm run preview
```

---

## 5. Deploy to Firebase Hosting

Once the `dist/` directory has been built, deploy the site to Firebase Hosting:

```bash
firebase deploy --only hosting
```

### What happens during deployment:
- Firebase uploads the contents of the `dist/` directory (as configured in `firebase.json`).
- All client-side routes (`**`) are automatically rewritten to `/index.html` so React client-side navigation and deep links load cleanly without 404 errors.
- Static assets under `/assets/**` are served with long-lived immutable cache headers, while `/index.html` is served with `no-cache` headers so future updates take effect immediately.

When deployment completes, the CLI will output your live **Hosting URL**:
```text
✔  Deploy complete!

Project Console: https://console.firebase.google.com/project/<your-firebase-project-id>/overview
Hosting URL: https://<your-firebase-project-id>.web.app
```

---

## 6. Useful Commands Reference

| Task | Command |
| :--- | :--- |
| Install dependencies | `npm install` |
| Run local development server | `npm run dev` |
| Type-check code | `npm run lint` |
| Build production bundle (`dist/`) | `npm run build` |
| Test Firebase Hosting locally | `firebase serve --only hosting` |
| Deploy to a temporary preview channel | `firebase hosting:channel:deploy preview` |
| Deploy to live production | `npm run build && firebase deploy --only hosting` |

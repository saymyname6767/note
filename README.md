# AetherEdit — Online VS Code Look-alike Notepad IDE

A clean, premium, and streamlined web-based Notepad / IDE designed to replicate the exact aesthetics of VS Code without the bloat of AI features or unnecessary panels. Built with standard HTML5, CSS3, and JavaScript, it is ready for deployment on GitHub Pages or Cloudflare Pages.

![Screenshot](https://github.com/saymyname6767/note/workflows/Deploy%20to%20GitHub%20Pages/badge.svg)

---

## ✨ Features

- **VS Code Aesthetic**: Streamlined workspace interface replicating modern VS Code layout (Activity Bar, Sidebar Explorer, Tab Bar, Monaco Editor, Status Bar).
- **Curved Premium UI Styling**: Sleek `border-radius: 12px` rounded edges on primary panes, tab headers, search inputs, dialogs, and panels.
- **Compact Sidebar Controls**: Scaled-down action icons (explorer buttons sized at `20px` with `12px` glyphs) for a modern, clutter-free workspace.
- **Local File & Directory Support**: Real-time import/loading of local files and folders using native File System Access APIs.
- **Manual Save to Download**: Triggers a direct browser file download to your machine when clicking the Save button or pressing `Ctrl + S` inside the editor.
- **GitHub Actions Ready**: Automated deployment pipeline configured to automatically build and host the application to GitHub Pages on every push to the `main` branch.

---

## 🛠️ Technology Stack

- **Core**: Vanilla HTML5 structure and dynamic JavaScript logic.
- **Editor Engine**: Monaco Editor (the code engine behind VS Code) configured with custom VS Code-compliant dark/light themes.
- **Styling**: Harmony-based Vanilla CSS variables supporting responsive layouts.
- **Deployment**: Static build output ready for CDN edge networks.

---

## 🚀 Local Setup & Development

You can run the notepad locally with any static file server:

### Python
```bash
python -m http.server 8080
```
Then navigate to `http://localhost:8080` in your web browser.

### Node.js (via local-web-server or http-server)
```bash
npm install -g http-server
http-server -p 8080
```

---

## 🌐 Cloud Deployment

### 1. GitHub Pages
This repository includes a pre-configured GitHub Action in `.github/workflows/deploy.yml` that will automatically deploy the IDE whenever code is pushed to `main`.
1. Go to your repository settings on GitHub.
2. Navigate to **Pages** (under Code and automation).
3. Under **Build and deployment**, set the source to **GitHub Actions**.
4. Push your changes to `main` to trigger the build.

### 2. Cloudflare Pages
Since the codebase consists of pure static files, it can be linked directly to Cloudflare Pages:
1. Log in to your Cloudflare Dashboard and navigate to **Pages**.
2. Select **Connect to Git** and pick the `note` repository.
3. Keep the build command and output directory empty (default root `.`).
4. Click **Save and Deploy**.

---

## 🎹 Keyboard Shortcuts

- `Ctrl + S` / `Cmd + S` - Manually save and download the active file.
- `Alt + Z` - Toggle word wrap in the editor.

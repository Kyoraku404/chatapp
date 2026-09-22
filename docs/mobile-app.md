# RUSH on phones

RUSH has a standalone web app manifest and Android and iPhone home-screen icons. On Android Chrome, use the browser menu to install RUSH. On iPhone, open the browser Share menu and choose **Add to Home Screen**. The installed app starts at `/app`, with the existing mobile navigation and keyboard-safe chat viewport. RUSH does not cover the chat screen with an install suggestion.

The icon uses the existing RUSH lightning mark. Regenerate its PNG sizes with `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/generate-pwa-icons.ps1` from the project root.

A small service worker displays a branded offline screen when a navigation cannot reach the server. It does not cache private chats, API responses, Firebase data, or credentials. Reconnect to load current conversations; offline message sending is not supported. Microphone calls still require a secure HTTPS origin on phones. Installing the app does not bypass browser microphone permission or make a local HTTP network address secure.

Home-screen installation requires HTTPS on a phone. A desktop `localhost` preview is useful for testing the manifest, but another phone needs the deployed HTTPS address. This pass does not include push notifications or background incoming-call ringing. Those require a separate server-side delivery system and device subscriptions.

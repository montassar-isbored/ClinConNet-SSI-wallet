# ClinConNet-SSI-wallet

## Description
ClinConNet-SSI-wallet is a Self-Sovereign Identity (SSI) wallet browser extension developed for the ClinConNet platform. It is built upon the VERAMO SDK and utilizes a modern SSI architecture with offscreen scripts to securely handle Decentralized Identifier (DID) generation, authentication (did-auth), communication (DID-Comm) and DID services within the browser environment. It allows patients to verify signatures found on consent forms, to fill and sign consent forms and generate consent proofs as hashes of encyrpted consent forms.

## Funding
Traceability for trusted multi-scale data and fight against information leak in daily practices and artificial intelligence systems in healthcare TracIA - ANR-22-PESN-0006 PESN - 2022

## Prerequisites
* Node.js (v18.x or later)
* NPM (Node Package Manager)
* Chromium-based web browser (e.g., Google Chrome, Brave)

## Installation and Build
1. Clone the repository:
   ```bash
   git clone [https://github.com/montassar-isbored/ClinConNet-SSI-wallet.git]
   ```
2. Navigate to the directory:
   ```bash
   cd ClinConNet-SSI-wallet
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Build the extension:
   ```bash
   npm run build
   ```

## Usage (Loading the Extension)
1. Open your Chromium-based browser and navigate to the extensions management page (`chrome://extensions/`).
2. Enable **Developer mode** (typically a toggle in the top right corner).
3. Click the **Load unpacked** button.
4. Navigate to the project directory and select the compiled `dist/` folder.
5. The extension is now active and accessible from the browser toolbar.

## Architecture & Technologies
* **Core:** VERAMO SDK
* **Languages:** JavaScript, CSS, HTML
* **Components:** Popup interface, Background Service Workers, Offscreen scripts for cryptographic operations.

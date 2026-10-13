<div align="center">

# ✨ AORA
### 🌐 The Next-Gen Multimodal 3D AI Companion

**Real-Time 3D Embodiment • Ultra-Fast LLM Inference • Expressive Neural Voice • Precision Lip-Sync**

<br>

[![Repo Stars](https://img.shields.io/github/stars/Yogesh-w7/AORA?style=for-the-badge&logo=github&color=facc15&logoColor=black)](https://github.com/Yogesh-w7/AORA/stargazers)
[![Forks](https://img.shields.io/github/forks/Yogesh-w7/AORA?style=for-the-badge&logo=git&color=38bdf8&logoColor=white)](https://github.com/Yogesh-w7/AORA/network/members)
[![Issues](https://img.shields.io/github/issues/Yogesh-w7/AORA?style=for-the-badge&logo=github&color=ec4899&logoColor=white)](https://github.com/Yogesh-w7/AORA/issues)
[![License: MIT](https://img.shields.io/badge/License-MIT-34d399.svg?style=for-the-badge&logo=balance-scale&logoColor=white)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-Welcome-a855f7?style=for-the-badge&logo=gitpullrequest&logoColor=white)](https://github.com/Yogesh-w7/AORA/pulls)

<br>

<!-- Tech Badges -->
<img src="https://img.shields.io/badge/React-20232A?style=flat-square&logo=react&logoColor=61DAFB" alt="React" />
<img src="https://img.shields.io/badge/Three.js-000000?style=flat-square&logo=threedotjs&logoColor=white" alt="Three.js" />
<img src="https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node.js" />
<img src="https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white" alt="FastAPI" />
<img src="https://img.shields.io/badge/Python_3.10+-3776AB?style=flat-square&logo=python&logoColor=white" alt="Python" />
<img src="https://img.shields.io/badge/Groq_LPU-F55036?style=flat-square&logo=fastlane&logoColor=white" alt="Groq" />
<img src="https://img.shields.io/badge/Kokoro_TTS-8B5CF6?style=flat-square&logo=soundcharts&logoColor=white" alt="Kokoro" />
<img src="https://img.shields.io/badge/Rhubarb_LipSync-EC4899?style=flat-square&logo=waveform&logoColor=white" alt="Rhubarb" />

<br><br>

<img src="https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/rainbow.png" width="100%" />

[✨ Overview](#-overview) • [⚡ Features](#-core-features) • [🚀 Quickstart](#-instant-setup) • [📦 Assets](#-asset-pipeline) • [🩺 Disclaimer](#-medical-disclaimer)

<img src="https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/rainbow.png" width="100%" />

</div>

<br>

## 💡 Overview

**AORA** reimagines human-computer interaction by transforming standard chatbot interfaces into an **interactive, fully embodied 3D virtual assistant**.

By synchronizing real-time phoneme generation with low-latency LLM stream processing, AORA delivers human-like facial expressions, fluid gestural animations, and natural voice dynamics directly in the browser.


## ⚡ Core Features

| Feature | Technology | Highlight |
| --- | --- | --- |
| 🧑‍🚀 **Expressive 3D Avatar** | `Three.js` / `React` | Real-time blendshapes, dynamic lighting, realistic idle breathing, and eye micro-saccades. |
| ⚡ **Sub-Second Intelligence** | `Groq Cloud LPU` | Ultra-fast token generation to eliminate conversation lag and unnatural pauses. |
| 🎙️ **Neural Voice Output** | `Kokoro TTS` | Natural, human-like voice synthesis with high-clarity pronunciation and emotional pacing. |
| 👄 **Phoneme-Driven Visemes** | `Rhubarb Lip-Sync` | Audio-to-viseme phonetic mapping driving frame-accurate mouth morph targets. |
| 🩺 **Clinical Knowledge Agent** | `FastAPI` / `LangChain` | Specialized conversational triage assistant with verified retrieval parameters. |
| 🧩 **Modular Microservices** | `Node.js` + `Python` | Decoupled client, orchestration, and speech services for horizontal scalability. |

---


---

## 🚀 Instant Setup

### Prerequisites

---

### 1️⃣ Clone the Repository

```bash
git clone [https://github.com/Yogesh-w7/AORA.git](https://github.com/Yogesh-w7/AORA.git)
cd AORA

```

---

### 2️⃣ Initialize Services (3-Terminal Setup)

```bash
cd medical-backend
python -m venv .venv

# Activate
source .venv/bin/activate
# Windows:
# .\.venv\Scripts\Activate.ps1

pip install -r requirements.txt
uvicorn medical_api:app \
  --reload --port 8000

```

```bash
cd backend
npm install

# Configure Secrets
echo "PORT=5000" > .env
echo "GROQ_API_KEY=your_key" >> .env
echo "AI_SERVICE_URL=http://localhost:8000" >> .env

npm start

```

```bash
cd frontend
npm install

npm run dev

```

> 🌐 Once running, open **`http://localhost:5173`** in Chrome, Edge, or Brave.

---

## 📦 Asset Pipeline

> [!IMPORTANT]
> Heavy binary runtime dependencies are intentionally kept out of version control to maintain a lightweight repository size.

* 🧑‍🎨 **3D Models**: Place `.glb` or `.gltf` rigged character avatars inside `frontend/public/models/`.
* 🗣️ **Rhubarb Executable**: Download the matching OS build from [Rhubarb Releases](https://github.com/DanielSWolf/rhubarb-lip-sync) and place it under `backend/bin/rhubarb`.
* 🔊 **Kokoro Weights**: Store model checkpoints inside `medical-backend/weights/`.

---

## 🩺 Medical Disclaimer

> [!WARNING]
> AORA is an exploratory research project designed for interactive design testing and conversational prototyping. It does **not** provide clinical diagnosis, medical counsel, or emergency triage. For critical symptoms, seek immediate professional healthcare assistance.

---

## 🤝 Contributing

Contributions make open-source thrive. Check out open issues or follow these steps:

1. **Fork** the project
2. **Branch**: `git checkout -b feature/NewFeature`
3. **Commit**: `git commit -m 'feat: Add NewFeature'`
4. **Push**: `git push origin feature/NewFeature`
5. **Open Pull Request**

---

<div align="center">

---

### Crafted with care by [Yogesh](https://github.com/Yogesh-w7) and the Open-Source Community

Thank you for exploring **AORA**.  
If you found this project interesting, consider giving it a ⭐️ — it really helps!

[⭐ Star the Repo](https://github.com/Yogesh-w7/AORA) · 
[🐛 Report a Bug](https://github.com/Yogesh-w7/AORA/issues) · 
[💡 Request a Feature](https://github.com/Yogesh-w7/AORA/issues) · 
[📖 Documentation](https://github.com/Yogesh-w7/AORA#-overview)

<br>

*Building more expressive and human-centered AI experiences, one commit at a time.*

</div>

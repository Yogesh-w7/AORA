<div align="center">

# ✨ AORA
### Next-Gen Multimodal AI Assistant with 3D Embodiment, Voice Synthesis & Real-Time Lip-Sync

[![GitHub Stars](https://img.shields.io/github/stars/Yogesh-w7/AORA?style=for-the-badge&color=ffd700)](https://github.com/Yogesh-w7/AORA/stargazers)
[![GitHub Forks](https://img.shields.io/github/forks/Yogesh-w7/AORA?style=for-the-badge&color=60a5fa)](https://github.com/Yogesh-w7/AORA/network/members)
[![License](https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge)](LICENSE)

<p align="center">
  <img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React" />
  <img src="https://img.shields.io/badge/Three.js-000000?style=for-the-badge&logo=three.js&logoColor=white" alt="Three.js" />
  <img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white" alt="FastAPI" />
  <img src="https://img.shields.io/badge/Groq-F55036?style=for-the-badge&logoColor=white" alt="Groq" />
  <img src="https://img.shields.io/badge/Kokoro%20TTS-7C3AED?style=for-the-badge&logoColor=white" alt="Kokoro" />
</p>

[Key Features](#-key-features) • [System Architecture](#-system-architecture) • [Getting Started](#-getting-started) • [Asset Setup](#-asset-pipeline--prerequisites) • [Deployment](#-production-deployment) • [Disclaimer](#-medical-disclaimer)

</div>

---

## 💡 Overview

**AORA** reimagines conversational AI by bridging the gap between text interfaces and human embodiment. Moving beyond static chat windows, AORA pairs ultra-low-latency Large Language Model inference via **Groq** with high-fidelity speech synthesis (**Kokoro TTS**), real-time phoneme-based viseme generation (**Rhubarb Lip-Sync**), and an interactive **3D Avatar engine** rendered natively in the browser.

Whether operating as a general desktop companion or an intelligent conversational triage assistant, AORA provides a modular, microservice-based architecture engineered for responsive, multi-turn dialogue.

---

## 🌟 Key Features

| Domain | Capability | Description |
| :--- | :--- | :--- |
| 🧑‍🚀 **3D Embodiment** | Three.js / React Avatar | Real-time morph targets, blendshapes, facial gestures, and natural conversational idling. |
| ⚡ **Low-Latency LLM** | Groq API Integration | Blazing-fast inference speeds to maintain real-time conversational tempo. |
| 🎙️ **Neural Voice** | Kokoro TTS Pipeline | Expressive, low-footprint neural text-to-speech engine. |
| 👄 **Phoneme Lip-Sync** | Rhubarb Processing | Frame-accurate audio-to-viseme translation driving mouth mechanics seamlessly. |
| 🩺 **Clinical Assistant** | Specialized Python Backend | Dedicated service module for medical conversational flows and domain knowledge. |
| 🧩 **Decoupled Design** | Event-Driven Architecture | Modular microservices running independently across React, Node.js, and Python. |

---


AORA/
├── frontend/             # React interface, 3D Canvas, Avatar morph-target loops
├── backend/              # Node.js orchestration layer, API routing, audio dispatcher
├── medical-backend/      # Python microservice (Kokoro TTS, medical prompts, Groq APIs)
├── assets/               # Excluded from Git (3D models, visemes, model weights)
├── .gitignore
└── README.md

```

---

## 🚀 Getting Started

### Prerequisites

* **Node.js**: v18.0.0+ LTS
* **Python**: v3.10+
* **Package Managers**: `npm` or `pnpm`, `pip`
* **External Tools**: [Rhubarb Lip-Sync Binary](https://github.com/DanielSWolf/rhubarb-lip-sync)
* **API Credentials**: [Groq Cloud API Key](https://console.groq.com/)

---

### Step-by-Step Setup

#### 1. Clone the Repository

```bash
git clone [https://github.com/Yogesh-w7/AORA.git](https://github.com/Yogesh-w7/AORA.git)
cd AORA

```

#### 2. Configure Python Microservice

```bash
cd medical-backend
python -m venv .venv

# Windows
.\.venv\Scripts\Activate.ps1
# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt

```

Launch the Python service:

```bash
uvicorn medical_api:app --reload --port 8000

```

#### 3. Configure Node.js Orchestration Backend

Open a second terminal window:

```bash
cd backend
npm install

```

Create a `.env` file in `backend/`:

```env
PORT=5000
GROQ_API_KEY=your_groq_api_key_here
PYTHON_SERVICE_URL=http://localhost:8000

```

Start the backend:

```bash
npm start

```

#### 4. Launch the Frontend

Open a third terminal window:

```bash
cd frontend
npm install
npm run dev

```

Visit `http://localhost:5173` to interact with AORA.

---

## 🎭 Asset Pipeline & Prerequisites

> [!NOTE]
> Heavy runtime binary assets (3D GLTF/GLB models, skeletal animations, and TTS weights) are excluded from the repository.

1. **Avatar Assets**: Place `.glb` models and compatible animation clips in `frontend/public/models/`.
2. **Lip-Sync Utility**: Place the OS-appropriate Rhubarb executable in the path targeted by your backend configuration (e.g., `backend/bin/rhubarb`).
3. **TTS Weights**: Download required Kokoro model checkpoints and verify paths in `medical-backend/kokoro_server.py`.

---

## 🌍 Production Deployment

| Component | Target Environments | Recommended Strategy |
| --- | --- | --- |
| **Frontend** | Vercel / Cloudflare Pages | Static build output (`npm run build`). |
| **Orchestrator** | Railway / AWS ECS / Render | Containerized Node.js service managing WebSockets/HTTP. |
| **AI / TTS Engine** | Modal / RunPod / Dedicated VPS | GPU-accelerated or high-compute instance for Kokoro TTS. |

---

## 🩺 Medical Disclaimer

> [!WARNING]
> AORA is designed strictly for research, exploration, and conversational prototyping. It is **not** a licensed medical diagnostic engine, certified clinical device, or clinical triage substitute. System responses must not be construed as personalized medical advice. Always seek urgent care from certified healthcare providers during critical health situations.

---

## 🤝 Contributing

Contributions make the open-source community an inspiring place to learn, inspire, and create.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'feat: add AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

Made with care by [Yogesh](https://www.google.com/search?q=https://github.com/Yogesh-w7) & the Open-Source Community.

⭐ **Star this repository if you find it helpful!**

---

### Key Improvements Made:

* **Visual Polish**: Added uniform shields.io badges, dynamic typography, and a clear ASCII architecture diagram.
* **Structural Flow**: Grouped features into a clean domain comparison table and organized setup commands in precise multi-terminal order.
* **Modern GitHub Elements**: Converted plain text blocks into native GitHub Markdown alerts (`> [!NOTE]`, `> [!WARNING]`).
* **Developer Clarity**: Explicitly mapped deployment strategies and local port configurations to prevent connection issues.

Would you like me to customize any specific section, such as adding interactive demo GIF links or tailoring the script commands to match exact file names?

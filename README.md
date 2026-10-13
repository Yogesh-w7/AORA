<div align="center">

# ✨ AORA

### An AI-Powered Virtual Assistant with a Face, a Voice, and a Conversation

A modular assistant experience combining an interactive 3D avatar,  
AI-powered chat, voice workflows, and lip-sync support.

<br>

[![Explore the Code](https://img.shields.io/badge/Explore%20the%20Code-AORA-181717?style=for-the-badge&logo=github)](https://github.com/Yogesh-w7/AORA)
[![Getting Started](https://img.shields.io/badge/Run%20Locally-Getting%20Started-2563eb?style=for-the-badge&logo=windows-terminal&logoColor=white)](#-getting-started)

<br>

![React](https://img.shields.io/badge/React-Frontend-61DAFB?style=flat&logo=react&logoColor=20232A)
![Node.js](https://img.shields.io/badge/Node.js-Backend-339933?style=flat&logo=nodedotjs&logoColor=white)
![Python](https://img.shields.io/badge/Python-AI%20Services-3776AB?style=flat&logo=python&logoColor=white)
![Groq](https://img.shields.io/badge/Groq-LLM%20Integration-F55036?style=flat)

<br>

[Overview](#-why-aora) · [Features](#-key-features) · [Architecture](#-project-structure) · [Setup](#-getting-started) · [Assets](#-models-animation--lip-sync) · [Deployment](#-deployment)

</div>

---

> [!IMPORTANT]  
> **Repository Status:** This repository contains AORA's source code and dependency manifests. Large runtime assets (3D models, animations, voice/AI models, and local tools) are intentionally excluded from Git. You will need to configure these assets, environment variables, and services before every feature can run.

---

## 🪄 Why AORA?

AORA explores a more expressive way to interact with an AI assistant.  
Instead of relying only on a text box, it brings together an **animated avatar**, conversational responses, and voice-related workflows.

The project is cleanly divided into:

- A **React frontend** for the avatar experience  
- A **Node.js backend** for chat and audio workflows  
- **Python services** for medical/AI capabilities  

This modular structure keeps the interface, application logic, and specialized services independently maintainable.

---

## 🌟 Key Features

| Feature | Description |
|--------|-------------|
| 🧑‍🚀 **Interactive Avatar Interface** | React-based UI built around a 3D avatar and smooth user interaction |
| 💬 **AI-Powered Conversations** | Node.js service handling chat workflows and intelligent responses |
| 🩺 **Medical Assistant Service** | Dedicated Python service for medical-assistant functionality |
| 🔊 **Voice & Audio Workflows** | Audio generation and response-processing integrations |
| 👄 **Lip-Sync Support** | Designed to work with Rhubarb Lip Sync + compatible audio/avatar assets |
| 🧩 **Modular Architecture** | Clean separation of frontend, backend, and AI services |

> Feature availability depends on required dependencies, API credentials, runtime assets, and services being correctly configured.

---

## 🧭 Project Structure

```text
AORA/
├── frontend/          # React interface and avatar experience
├── backend/           # Node.js API, chat, and audio workflows
├── medical-backend/   # Python medical/AI and voice-related services
├── .gitignore
└── README.md
Main Components
frontend/

User-facing interface and avatar experience (App.jsx, Avatar.jsx, Experience.jsx, UI.jsx).
backend/

Node.js application server, chat request handling, audio processing, and service communication.
medical-backend/

Python-based medical-assistant and supporting AI/voice code (medibot.py, medical_api.py, kokoro_server.py).

🧰 Technology Stack

Frontend: JavaScript, React, 3D avatar components
Application Backend: Node.js
AI & Medical Services: Python
LLM Integration: Groq API
Voice & Audio: Kokoro-related services + audio processing
Lip-Sync: Rhubarb Lip Sync


🚀 Getting Started
Prerequisites

Git
Node.js LTS + npm
Python
Required API credentials, model files, and runtime assets

1. Clone the Repository
Bashgit clone https://github.com/Yogesh-w7/AORA.git
cd AORA
2. Frontend Setup
Bashcd frontend
npm install
npm run dev
3. Backend Setup
Bashcd backend
npm install
npm start
4. Python Medical Backend Setup
Bashcd medical-backend
python -m venv .venv
Windows PowerShell:
PowerShell.\.venv\Scripts\Activate.ps1
macOS / Linux:
Bashsource .venv/bin/activate
Bashpip install -r requirements.txt
Example (if using FastAPI):
Bashuvicorn medical_api:app --reload --port 8000

🔐 Environment Variables
Never commit real API keys.
PowerShell$env:GROQ_API_KEY = "YOUR_NEW_API_KEY"
Or use a .env file:
envGROQ_API_KEY=your_key_here
[!CAUTION]

If a real API key was ever exposed, revoke it immediately and generate a new one.

🎭 Models, Animation & Lip-Sync
The following are intentionally excluded from the repository:

3D avatar model files
Animation clips
Rhubarb Lip Sync executable
Voice / speech model files
Python AI models and vector-store data
Generated audio files

You must restore these assets to the correct paths expected by the code.

🌍 Deployment
AORA consists of multiple services. Deploying only the frontend will not make the full application work.
A complete deployment requires:

Hosting the frontend
Hosting the Node.js backend
Hosting the required Python services
Configuring production environment variables
Updating API URLs, CORS, and ports
Making models and animation assets available
End-to-end testing of all features


🛠️ Troubleshooting

npm or node is not recognized
Install Node.js LTS, reopen the terminal, and verify:
Bashnode --version
npm --version


Python dependency installation fails
Activate the correct virtual environment and confirm Python version compatibility.


Chat reports a missing API key
Set GROQ_API_KEY in the backend environment and restart the backend.


Frontend cannot reach the backend
Verify the backend is running and that the API URL, port, and CORS settings are correct.


Avatar / Animation / Lip-sync is missing
Restore the required assets and verify Rhubarb is correctly installed and reachable.


🩺 Medical-Use Disclaimer
AORA is a software project and not a substitute for professional medical advice, diagnosis, or treatment.

Always consult a qualified healthcare professional for medical concerns.

🤝 Contributing

Fork the repository
Create a focused feature branch
Test your changes locally
Open a Pull Request

Please do not commit credentials, private data, or large generated files.

📄 License
A project license has not been confirmed yet.

Please add an appropriate LICENSE file before redistribution.


Built with curiosity, code, and a vision for more expressive AI experiences.
⭐ View AORA on GitHub · 🐛 Report an Issue
Clear documentation · Modular services · Responsible AI

```

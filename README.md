::: {align="center"}
# ✨ AORA

### An AI-powered virtual assistant with a face, a voice, and a conversation.

**A modular assistant experience combining an interactive 3D avatar,
AI-backed chat, voice workflows, and lip-sync support.**

```{=html}
<p>
```
`<a href="https://github.com/Yogesh-w7/AORA">`{=html}`<img src="https://img.shields.io/badge/Explore%20the%20Code-AORA-181717?style=for-the-badge&logo=github" alt="Explore AORA on GitHub">`{=html}`</a>`{=html}
`<a href="#-getting-started">`{=html}`<img src="https://img.shields.io/badge/Run%20Locally-Getting%20Started-2563eb?style=for-the-badge&logo=windows-terminal&logoColor=white" alt="Getting started">`{=html}`</a>`{=html}
```{=html}
</p>
```
```{=html}
<p>
```
`<img src="https://img.shields.io/badge/React-Frontend-61DAFB?style=flat&logo=react&logoColor=20232A" alt="React">`{=html}
`<img src="https://img.shields.io/badge/Node.js-Backend-339933?style=flat&logo=nodedotjs&logoColor=white" alt="Node.js">`{=html}
`<img src="https://img.shields.io/badge/Python-AI%20Services-3776AB?style=flat&logo=python&logoColor=white" alt="Python">`{=html}
`<img src="https://img.shields.io/badge/Groq-LLM%20Integration-F55036?style=flat" alt="Groq integration">`{=html}
```{=html}
</p>
```
**[Overview](#-why-aora) · [Features](#-what-aora-brings-together) ·
[Architecture](#-how-it-fits-together) · [Setup](#-getting-started) ·
[Assets](#-models-animation--lip-sync) · [Deployment](#-deployment)**
:::

------------------------------------------------------------------------

> \[!IMPORTANT\] **Repository status:** This repository contains AORA's
> source code and dependency manifests. Some large runtime assets---such
> as 3D models, animation files, voice/AI models, and local tools---are
> intentionally kept outside Git. You must configure these assets,
> environment variables, and services before all features can run. A
> public repository does not mean the application is already deployed.

## 🪄 Why AORA?

AORA explores a more expressive way to interact with an AI assistant:
not just a text box, but an experience built around an animated avatar
and conversational responses.

The project is organized into separate frontend, Node.js backend, and
Python-based medical/AI services. This separation makes it easier to
work on the interface, application logic, and specialized services
independently.

### 🌟 What AORA brings together

  -----------------------------------------------------------------------
  Capability                          What it is for
  ----------------------------------- -----------------------------------
  🧑‍⚕️ **Interactive avatar interface** A React UI built around an avatar
                                      and user interaction

  💬 **AI-backed conversations**      A Node.js service that handles chat
                                      workflows and related requests

  🩺 **Medical-assistant service**    Separate Python code for
                                      medical-assistant functionality

  🔊 **Voice and audio workflows**    Audio generation and
                                      response-processing integrations

  👄 **Lip-sync support**             Workflow designed to use Rhubarb
                                      Lip Sync with compatible audio and
                                      avatar assets

  🧩 **Modular codebase**             Separate application areas for
                                      easier development and maintenance
  -----------------------------------------------------------------------

*The availability of each capability depends on its required
dependencies, API credentials, runtime assets, and services.*

## 🧭 Project map

``` text
AORA/
├── frontend/          # React interface and avatar experience
├── backend/           # Node.js API, chat, and audio workflows
├── medical-backend/   # Python medical/AI and voice-related services
├── .gitignore
└── README.md
```

```{=html}
<details>
```
```{=html}
<summary>
```
`<strong>`{=html}📁 Explore the main components`</strong>`{=html}
```{=html}
</summary>
```
### `frontend/`

The user-facing interface and avatar experience. Components in this area
include files such as `App.jsx`, `Avatar.jsx`, `Experience.jsx`, and
`UI.jsx`.

### `backend/`

The Node.js application server, chat request handling, audio processing,
and communication with supporting services.

### `medical-backend/`

Python-based medical-assistant and supporting AI/voice code. Relevant
files may include `medibot.py`, `medical_api.py`, and
`kokoro_server.py`.

```{=html}
</details>
```
## 🧰 Technology at a glance

-   **Frontend:** JavaScript, React, and 3D avatar components
-   **Application backend:** Node.js
-   **AI / medical services:** Python
-   **LLM integration:** Groq API support
-   **Voice / audio:** Kokoro-related service code and audio-processing
    workflows
-   **Lip-sync:** Rhubarb Lip Sync
-   **Runtime assets:** 3D models, animation clips, voice/model files,
    and generated audio

For exact dependency versions, refer to the package manifests and Python
dependency files included in the repository.

------------------------------------------------------------------------

## 🚀 Getting started

### Before you begin

Install the tools needed for the parts you intend to run:

-   [Git](https://git-scm.com/downloads)
-   [Node.js LTS and npm](https://nodejs.org/)
-   [Python](https://www.python.org/downloads/)
-   API credentials, models, and runtime assets for the features you
    want to enable

### 1. Clone the repository

``` bash
git clone https://github.com/Yogesh-w7/AORA.git
cd AORA
```

### 2. Install frontend dependencies

``` bash
cd frontend
npm install
```

Start the frontend with the script defined in `frontend/package.json`.
If the project has a Vite `dev` script, run:

``` bash
npm run dev
```

> If the command is not available, open `frontend/package.json` and
> check the `scripts` section.

### 3. Install backend dependencies

Open a **new terminal** from the repository root:

``` bash
cd backend
npm install
```

Start the server using the script defined in `backend/package.json`. If
it defines a `start` script:

``` bash
npm start
```

Keep the terminal open while testing the application.

### 4. Prepare the Python service

Open another terminal:

``` bash
cd medical-backend
python -m venv .venv
```

Activate the environment on Windows PowerShell:

``` powershell
.\.venv\Scripts\Activate.ps1
```

On macOS/Linux:

``` bash
source .venv/bin/activate
```

If the repository contains `requirements.txt`, install its dependencies:

``` bash
python -m pip install -r requirements.txt
```

Then follow the startup instructions in the relevant Python service. For
example, **only if** `medical_api.py` defines a FastAPI object named
`app` and Uvicorn is installed, the command may be:

``` bash
uvicorn medical_api:app --reload --port 8000
```

The actual entry point, application object, and port must match the code
in your checkout. Some Python services may need to be started
independently.

```{=html}
<details>
```
```{=html}
<summary>
```
`<strong>`{=html}🪟 Windows quick checklist`</strong>`{=html}
```{=html}
</summary>
```
-   Run each service in its own terminal.
-   Activate the intended Python virtual environment before installing
    Python packages.
-   Keep local `.env` files private.
-   Confirm the frontend points to the correct backend URL and port.
-   Restore required models and animation assets before testing avatar
    or voice features.

```{=html}
</details>
```

------------------------------------------------------------------------

## 🔐 Environment variables & secrets

Never commit API keys, passwords, tokens, or private environment files.

The backend code uses `GROQ_API_KEY` for Groq integration. For a local
PowerShell session, set it like this:

``` powershell
$env:GROQ_API_KEY = "YOUR_NEW_API_KEY"
```

Replace the placeholder with your own key. For production, add secrets
through the hosting provider's environment-variable settings.

Example placeholder for a local environment file:

``` env
GROQ_API_KEY=your_key_here
```

This is an example only---do not put a real key in this README or commit
it to Git.

> \[!CAUTION\] If a real API key was ever exposed in public source or a
> shared message, revoke it with the provider and create a replacement.
> Removing a key from the latest version does not invalidate the old
> key.

Also verify any frontend/backend URLs, ports, and service-specific
environment variables required by your local configuration.

## 🎭 Models, animation & lip-sync

Large runtime files are excluded to keep the repository manageable.
Depending on the features you want to run, you may need to restore:

-   3D avatar model files
-   Animation clips and supporting frontend assets
-   Rhubarb Lip Sync executable
-   Voice or speech model files
-   Python AI models, vector-store data, or local datasets
-   Generated audio files used for local testing

### Asset setup checklist

-   [ ] Restore the required files to the paths expected by the source
    code.
-   [ ] Check for hard-coded Windows paths and make them configurable
    where practical.
-   [ ] Confirm the licenses and redistribution terms for third-party
    tools and model files.
-   [ ] Keep virtual environments, `node_modules`, secrets, and
    temporary audio out of Git.
-   [ ] For large assets, consider a dedicated download location or Git
    LFS where appropriate.

If required files are absent, the corresponding avatar, animation,
voice, or lip-sync feature may not work as intended.

## 🌍 Deployment

AORA contains multiple services. Deploying only the frontend does
**not** deploy the complete application.

A typical deployment involves:

1.  Hosting the frontend as a web application.
2.  Hosting the Node.js backend as a separate service.
3.  Hosting the Python services required by the selected features.
4.  Configuring production environment variables securely.
5.  Updating API URLs, CORS settings, and ports for production.
6.  Making required models and animation assets accessible to the
    deployed services.
7.  Testing chat, audio, avatar animation, and medical-service requests
    in the deployed environment.

### ⚙️ Before choosing a host

-   Check CPU, RAM, disk, request-timeout, and background-process
    limits.
-   Large AI/voice models may exceed free-tier memory or storage.
-   A Windows Rhubarb `.exe` will not run directly on a Linux host; use
    a compatible build or an alternative setup.
-   Do not assume a feature is live until its service, environment
    variables, and required assets have been tested.

## 🛠️ Troubleshooting

```{=html}
<details>
```
```{=html}
<summary>
```
`<strong>`{=html}`<code>`{=html}npm`</code>`{=html} or
`<code>`{=html}node`</code>`{=html} is not recognized`</strong>`{=html}
```{=html}
</summary>
```
Install Node.js LTS, reopen the terminal, and check:

``` bash
node --version
npm --version
```

```{=html}
</details>
```
```{=html}
<details>
```
```{=html}
<summary>
```
`<strong>`{=html}Python dependency installation fails`</strong>`{=html}
```{=html}
</summary>
```
Activate the correct virtual environment, confirm the Python version
supported by the dependencies, and install from the appropriate
dependency file if one is present.

```{=html}
</details>
```
```{=html}
<details>
```
```{=html}
<summary>
```
`<strong>`{=html}Chat reports a missing API key`</strong>`{=html}
```{=html}
</summary>
```
Set `GROQ_API_KEY` in the backend environment and restart the backend
process. Do not put the key in frontend code.

```{=html}
</details>
```
```{=html}
<details>
```
```{=html}
<summary>
```
`<strong>`{=html}The frontend cannot reach the backend`</strong>`{=html}
```{=html}
</summary>
```
Check that the backend is running, the API URL and port are correct, and
CORS permits the frontend origin.

```{=html}
</details>
```
```{=html}
<details>
```
```{=html}
<summary>
```
`<strong>`{=html}The avatar, animation, or lip-sync is
missing`</strong>`{=html}
```{=html}
</summary>
```
Restore the relevant assets, verify their paths, and check that Rhubarb
is executable on the operating system where the service runs.

```{=html}
</details>
```
```{=html}
<details>
```
```{=html}
<summary>
```
`<strong>`{=html}The medical or voice service fails`</strong>`{=html}
```{=html}
</summary>
```
Inspect the Python service logs. Verify dependencies, model paths,
service URLs, environment variables, and available memory.

```{=html}
</details>
```
## 🩺 Medical-use disclaimer

AORA is a software project, not a substitute for a qualified healthcare
professional. Medical information generated by the system should be
treated as general information---not as a confirmed diagnosis or
personalized treatment plan. Consult a qualified professional for health
concerns, and seek emergency care for urgent or life-threatening
symptoms.

## 🤝 Contributing

Suggestions, bug reports, and improvements are welcome.

1.  Fork the repository.
2.  Create a focused branch for your change.
3.  Test the relevant component locally.
4.  Open a pull request with a clear summary and any setup or asset
    requirements.

Please do not include credentials, private health information, or large
generated files in commits.

## 📄 License

A project license has not been confirmed in this README. Before
redistributing AORA, add the appropriate `LICENSE` file and verify that
third-party packages, models, and assets permit your intended use.

------------------------------------------------------------------------

::: {align="center"}
### Built with curiosity, code, and a vision for more expressive AI experiences.

**If AORA interests you, explore the code, try it locally, and share
constructive feedback.**

[⭐ View AORA on GitHub](https://github.com/Yogesh-w7/AORA) · [🐛 Report
an issue](https://github.com/Yogesh-w7/AORA/issues)

`<sub>`{=html}Clear documentation · Modular services · Responsible
AI`</sub>`{=html}
:::

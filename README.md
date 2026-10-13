::: {align="center"}
# AORA

### Your AI-powered virtual assistant

**A conversational assistant experience combining an animated 3D avatar,
voice and lip-sync workflows, and AI-powered responses.**

[![Repository](https://img.shields.io/badge/GitHub-Yogesh--w7%2FAORA-181717?logo=github)](https://github.com/Yogesh-w7/AORA)
[![JavaScript](https://img.shields.io/badge/Frontend-JavaScript%20%2F%20React-blue?logo=react)](https://react.dev/)
[![Node.js](https://img.shields.io/badge/Backend-Node.js-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Python](https://img.shields.io/badge/AI%20Services-Python-3776AB?logo=python&logoColor=white)](https://www.python.org/)
:::

------------------------------------------------------------------------

## Overview

**AORA** is a full-stack virtual assistant project built around an
interactive avatar and AI-backed conversations. The codebase separates
the user interface, application server, and Python-based medical/AI
services so each part can be developed and configured independently.

The repository contains the source code and dependency manifests. Some
large runtime assets---such as 3D models, animation files, downloaded AI
models, and local tools---are intentionally not committed to GitHub.
These assets must be restored or configured separately before every
feature can run.

> **Project status:** Source code is available on GitHub. Deployment,
> model availability, API credentials, and asset setup must be
> configured for the target environment.

## Highlights

-   **Interactive avatar UI** --- React-based interface with avatar and
    experience components.
-   **AI conversation backend** --- Node.js service for handling chat
    requests and related application workflows.
-   **Medical AI service** --- Separate Python service files for
    medical-assistant functionality.
-   **Voice and audio workflow** --- Backend code includes
    audio-generation and response-processing logic.
-   **Lip-sync support** --- Designed to work with Rhubarb Lip Sync and
    corresponding animation/audio assets.
-   **Modular structure** --- Frontend, Node.js backend, and Python
    services are separated for easier maintenance.

*Feature availability depends on the required API keys, runtime assets,
models, and services being installed and configured.*

## Architecture

``` text
AORA/
├── frontend/          # React UI, avatar and user interaction
├── backend/           # Node.js application/API and audio workflow
├── medical-backend/   # Python medical/AI services and integrations
├── .gitignore
└── README.md
```

### Main components

  -----------------------------------------------------------------------
  Component                           Responsibility
  ----------------------------------- -----------------------------------
  `frontend/`                         User interface and avatar
                                      experience, including components
                                      such as `App.jsx`, `Avatar.jsx`,
                                      `Experience.jsx`, and `UI.jsx`

  `backend/`                          Node.js server, chat request
                                      handling, audio processing, and
                                      communication with other services

  `medical-backend/`                  Python medical-assistant and
                                      supporting AI/voice services,
                                      including files such as
                                      `medibot.py`, `medical_api.py`, and
                                      `kokoro_server.py`
  -----------------------------------------------------------------------

## Technology

The repository includes code associated with the following technologies
and tools:

-   **Frontend:** JavaScript, React, and 3D avatar components
-   **Application backend:** Node.js
-   **AI / medical services:** Python
-   **LLM integration:** Groq API support
-   **Voice / audio:** Kokoro-related service code and audio-processing
    workflows
-   **Lip-sync:** Rhubarb Lip Sync
-   **Runtime assets:** 3D models, animations, voice/model files, and
    generated audio

The exact dependency versions are defined by the package manifests and
Python dependency files included in the repository.

------------------------------------------------------------------------

## Getting started

### 1. Prerequisites

Install the tools required by the parts of the project you want to run:

-   [Git](https://git-scm.com/downloads)
-   [Node.js LTS](https://nodejs.org/) and npm
-   [Python](https://www.python.org/downloads/) (a version compatible
    with the Python dependencies)
-   Required API credentials, model files, and runtime assets for the
    features you intend to use

### 2. Clone the repository

``` bash
git clone https://github.com/Yogesh-w7/AORA.git
cd AORA
```

### 3. Install frontend dependencies

``` bash
cd frontend
npm install
```

Start the frontend using the development script defined in
`frontend/package.json`. For a project configured with the usual Vite
`dev` script, run:

``` bash
npm run dev
```

If that script is not present, check the `scripts` section of
`package.json` and use the command defined there.

### 4. Install Node.js backend dependencies

Open a second terminal from the repository root:

``` bash
cd backend
npm install
```

Start the server using the script configured in `backend/package.json`.
If a `start` script is defined, run:

``` bash
npm start
```

Keep the terminal open while using the application.

### 5. Set up the Python medical backend

Open another terminal:

``` bash
cd medical-backend
python -m venv .venv
```

Activate the virtual environment on Windows PowerShell:

``` powershell
.\.venv\Scripts\Activate.ps1
```

On macOS or Linux:

``` bash
source .venv/bin/activate
```

Install the dependencies from the repository's Python dependency file,
if present:

``` bash
pip install -r requirements.txt
```

Run the appropriate service entry point according to the framework and
instructions in the Python files. For example, **if** `medical_api.py`
defines a FastAPI application object named `app` and `uvicorn` is
installed, the command may be:

``` bash
uvicorn medical_api:app --reload --port 8000
```

The exact startup command and port should be confirmed from the current
service configuration. Some Python services may need to be started
separately.

------------------------------------------------------------------------

## Environment configuration

Do not commit API keys, passwords, tokens, or private environment files
to GitHub.

The backend code uses a `GROQ_API_KEY` environment variable for Groq
integration. Configure it in your local environment or in the hosting
provider's secret settings.

Example PowerShell session:

``` powershell
$env:GROQ_API_KEY = "YOUR_NEW_API_KEY"
```

Replace the placeholder with your own key. Do not paste real secrets
into source code, README files, screenshots, or public issues.

Also check the frontend and backend source/configuration for any service
URLs or ports that need to match your local setup. If you create example
environment files, use placeholder values only, such as:

``` env
GROQ_API_KEY=your_key_here
```

**Security note:** If a real API key has ever been exposed in a public
repository or shared source, revoke it with the provider and generate a
replacement. Removing it from the latest commit alone does not
invalidate the old key.

------------------------------------------------------------------------

## Models, animations, and Rhubarb assets

Some large files are intentionally excluded from this repository to keep
the Git history small and avoid uploading machine-specific or generated
files.

Depending on the features you run, you may need to restore:

-   3D avatar model files
-   Animation clips and supporting frontend assets
-   Rhubarb Lip Sync executable
-   Voice or speech model files
-   Python AI models, vector-store data, or other local datasets
-   Generated audio files needed only for local testing

### Important

1.  Restore each asset to the path expected by the source code.
2.  Check the code for hard-coded local Windows paths and replace them
    with configurable paths where possible.
3.  Confirm the license and redistribution terms before publishing model
    files or third-party tools.
4.  For large assets, use a suitable release/download location or Git
    LFS when appropriate instead of committing generated files
    repeatedly.
5.  Never upload `.venv/`, `node_modules/`, secrets, or temporary
    generated audio to the repository.

If the assets are not present, the corresponding avatar, voice, or
lip-sync feature may fail or display without its intended behavior.

------------------------------------------------------------------------

## Troubleshooting

  -----------------------------------------------------------------------
  Issue                               What to check
  ----------------------------------- -----------------------------------
  `npm` or `node` is not recognized   Install Node.js LTS and reopen the
                                      terminal.

  Python package installation fails   Activate the intended virtual
                                      environment and check
                                      Python-version compatibility.

  Chat reports a missing API key      Configure `GROQ_API_KEY` in the
                                      backend environment and restart the
                                      backend.

  Frontend cannot reach the backend   Verify that the backend is running
                                      and that the API URL, port, and
                                      CORS settings match.

  Avatar or animation is missing      Restore the excluded
                                      model/animation assets and verify
                                      the file paths used by the
                                      frontend.

  Lip-sync does not run               Confirm that Rhubarb is installed,
                                      executable on the current operating
                                      system, and reachable at the
                                      configured path.

  Medical or voice service fails      Check the Python service logs,
                                      required dependencies, model files,
                                      service URL, and available memory.
  -----------------------------------------------------------------------

------------------------------------------------------------------------

## Deployment notes

AORA consists of multiple services, so deploying the frontend alone will
not deploy the complete application.

A typical deployment requires:

1.  Hosting the frontend as a web application.
2.  Hosting the Node.js backend as a separate service.
3.  Hosting the Python services that are required by the enabled
    features.
4.  Setting production environment variables in the hosting provider's
    dashboard.
5.  Updating API URLs, CORS rules, and service ports for production.
6.  Making required models and animation assets available to the
    deployed services.
7.  Testing chat, voice, avatar animation, and medical-service requests
    after deployment.

Check the hosting platform's limits before deploying AI models or
audio-processing workloads. Some models require more RAM, storage, or
CPU/GPU capacity than free hosting provides. A Windows `.exe` such as a
Windows build of Rhubarb cannot run directly on a Linux host; use a
compatible build or a different deployment strategy.

------------------------------------------------------------------------

## Medical-use disclaimer

AORA is a software project, not a substitute for a qualified healthcare
professional. Any medical information returned by the system should be
treated as general information and not as a confirmed diagnosis or
personalized treatment plan. Seek professional medical care for health
concerns and emergency assistance for urgent or life-threatening
symptoms.

## Contributing

Contributions, bug reports, and suggestions are welcome.

1.  Fork the repository.
2.  Create a focused branch for your change.
3.  Test the relevant component locally.
4.  Open a pull request describing the change and any configuration or
    asset requirements.

Please do not include credentials, private health data, or large
generated files in commits.

## License

A license has not been confirmed in this README. Before redistributing
the project, add the appropriate `LICENSE` file and make sure the
licenses for third-party packages, models, and assets permit your
intended use.

------------------------------------------------------------------------

::: {align="center"}
**Built with curiosity, code, and a vision for more interactive AI
experiences.**

[View repository](https://github.com/Yogesh-w7/AORA) · [Report an
issue](https://github.com/Yogesh-w7/AORA/issues)
:::

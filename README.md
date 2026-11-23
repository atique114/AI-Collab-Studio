# AI Collab Studio

AI Collab Studio is a collaborative coding workspace for teams. Create projects, invite collaborators, talk through ideas in real time, ask an AI assistant for coding help, and edit and preview project files in the browser.

## Features

- Create an account and sign in with JWT-based authentication.
- Create projects and invite other registered users as collaborators.
- Exchange project messages using Socket.IO, with chat history saved to MongoDB.
- Manage project collaborators and delete projects as the project owner.
- Mention `@ai` in chat to request help from OpenAI GPT-6 Luna. It can use readable current project files and recent saved chat as context; secret files, binary assets, lockfiles, and generated folders are omitted. File-generation responses are saved to the current project and appear as clickable file links in the chat.
- Browse and edit project files, save the file tree to the database, and run a browser preview using WebContainer.
- Syntax-highlight code and render formatted AI responses.

## Technology

| Area | Tools |
| --- | --- |
| Frontend | React 18, Vite, Tailwind CSS, React Router, Axios |
| Live collaboration | Socket.IO |
| In-browser code environment | WebContainer API |
| Backend | Node.js, Express |
| Database | MongoDB with Mongoose |
| Authentication | JWT and bcrypt |
| Token revocation | Redis |
| AI | OpenAI Node SDK and Responses API (GPT-6 Luna) |

## How it works

The React application calls the Express REST API for authentication and project operations. MongoDB stores user accounts, project ownership, each project's collaborator list and file tree, and project chat messages. The frontend also connects to a Socket.IO room for the selected project. Messages are saved before they are broadcast to connected collaborators; messages containing `@ai` are sent to OpenAI GPT-6 Luna with readable project files and up to 30 recent chat messages as context. Secret files and obvious secret values are redacted from that context. Valid generated files are merged into the project file tree and saved to MongoDB before the AI response is saved and broadcast.

The project file tree is mounted in WebContainer, which runs the project in the browser and supplies a preview URL. Code changes are sent to the backend and saved to MongoDB. Project pages load the latest 500 saved team and AI messages when they open.

## Prerequisites

- Node.js and npm
- MongoDB
- Redis
- An OpenAI API key with access to GPT-6 Luna
- A browser that supports WebContainer

## Run locally

### 1. Configure the backend

Create a local `backend/.env` file with your service settings:

```env
PORT=3001
MONGODB_URI=mongodb://127.0.0.1:27017/ai-collab-studio
JWT_SECRET=replace-with-a-long-random-secret
GPT_AI_KEY=your-openai-api-key
GPT_AI_MODEL=gpt-6-luna
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=
```

Keep this file private and out of Git. Each developer should configure their own local or hosted backend environment.

Install dependencies and start the API and Socket.IO server:

```bash
cd backend
npm install
npm start
```

### 2. Configure the frontend

Create `frontend/.env.local` and set the backend URL. The same URL is used for REST API requests and Socket.IO:

```env
VITE_API_URL=http://localhost:3001
```

In another terminal, install dependencies and start Vite:

```bash
cd frontend
npm install
npm run dev
```

Open the local URL printed by Vite. Keep MongoDB, Redis, and the backend running while using the app.

## Deploy on Vercel

The Vercel project should use `frontend` as its Root Directory with the Vite framework preset. Deploy the Node/Express backend as a separate service that supports persistent Socket.IO connections, and configure its MongoDB, Redis, and JWT environment variables there.

In the Vercel frontend project's **Settings → Environment Variables**, add:

```env
VITE_API_URL=https://your-deployed-backend.example.com
```

Use the backend's origin only; do not append `/users` or `/projects`. Add the variable to each Vercel environment you use (Production, Preview, and Development), then redeploy the frontend. The backend must be reachable over HTTPS from the deployed site. Do not put `MONGODB_URI`, `JWT_SECRET`, `GPT_AI_KEY`, or Redis credentials in the frontend project; those belong only in the backend service's environment.

If this variable is missing, account registration and login cannot reach the backend. The frontend now displays a configuration error instead of silently posting those requests back to the static Vercel site.

## Main API routes

Most user and project routes require a bearer token in the `Authorization` header.

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/users/register` | Register a user |
| `POST` | `/users/login` | Sign in and receive a JWT |
| `GET` | `/users/profile` | Read the signed-in user's profile |
| `GET` | `/users/all` | List users available for collaboration |
| `GET` | `/projects/all` | List projects for the signed-in user |
| `POST` | `/projects/create` | Create a project |
| `PUT` | `/projects/add-user` | Add collaborators (project owner only) |
| `PUT` | `/projects/remove-user` | Remove a collaborator (project owner only) |
| `DELETE` | `/projects/:projectId` | Delete a project and its chat history (project owner only) |
| `GET` | `/projects/get-project/:projectId` | Read a project and its collaborators |
| `GET` | `/projects/chat-history/:projectId` | Read the most recent 500 project messages |
| `PUT` | `/projects/update-file-tree` | Save a project's file tree |
| `GET` | `/ai/get-result?prompt=...` | Request an AI response |

Project chat uses the Socket.IO `project-message` event and joins a room using the project ID.

## Repository structure

```text
backend/
  controllers/  HTTP request handlers
  db/           MongoDB connection
  middleware/   Authentication middleware
  models/       Mongoose user and project models
  routes/       User, project, and AI routes
  services/     Database, Redis, and AI service logic
  server.js     Express and Socket.IO server entry point
frontend/
  src/screens/  Dashboard, project workspace, login, and registration
  src/config/   API, socket, and WebContainer setup
output/pdf/     Project overview PDF
```

## Project overview PDF

See [`output/pdf/AI-Collab-Studio-Project-Overview.pdf`](output/pdf/AI-Collab-Studio-Project-Overview.pdf) for a concise product and architecture description.

## Creators

- Atique Hussain Rangrej
- Ashish Patidar
- Ashish Nayak

## Current deployment and architecture guides

- [Free deployment guide](output/pdf/AI-Collab-Studio-Free-Deployment.pdf) covers Vercel, Render, MongoDB Atlas, Key Value, OpenAI, and a launch checklist.
- [Frontend guide](output/pdf/AI-Collab-Studio-Frontend.pdf) explains screens, state, collaboration, editing, preview, and hosting.
- [Backend guide](output/pdf/AI-Collab-Studio-Backend.pdf) explains the API, authentication, sockets, services, and environment variables.
- [Database guide](output/pdf/AI-Collab-Studio-Database.pdf) explains collections, relationships, file persistence, and limits.
- [Developer contributions](DEVELOPER_CONTRIBUTIONS.md) describes the frontend and backend responsibilities reflected in the current source.

The backend exposes `GET /health`. HTTP 200 means MongoDB and Redis are connected; HTTP 503 means at least one is unavailable. This endpoint does not test OpenAI. The frontend requires `VITE_API_URL` to be set, and production hosting must serve the COOP/COEP headers defined in `frontend/vercel.json` for WebContainer preview. Project pages use `/project/:projectId` and support direct reloads.

Run `npm run lint` and `npm run build` in `frontend`, and `npm test` in `backend`. Full browser flows require a running MongoDB, Redis, and OpenAI API key with model access and available quota. Chat history is retained in MongoDB and the latest 500 messages are loaded when a project opens.

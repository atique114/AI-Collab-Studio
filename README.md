# AI Collab Studio

AI Collab Studio is a collaborative coding workspace for teams. Create projects, invite collaborators, talk through ideas in real time, ask an AI assistant for coding help, and edit and preview project files in the browser.

## Features

- Create an account and sign in with JWT-based authentication.
- Create projects and invite other registered users as collaborators.
- Exchange live project messages using Socket.IO.
- Mention `@ai` in chat to request help from Google Gemini. AI responses can include a project file tree.
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
| AI | Google Generative AI (Gemini) |

## How it works

The React application calls the Express REST API for authentication and project operations. MongoDB stores user accounts and project records, including each project's collaborator list and file tree. The frontend also connects to a Socket.IO room for the selected project. Chat messages are broadcast to connected collaborators; messages containing `@ai` are sent to Gemini and its response is returned to the room.

The project file tree is mounted in WebContainer, which runs the project in the browser and supplies a preview URL. Code changes are sent to the backend and saved to MongoDB. Chat messages are currently live events and are not stored as chat history.

## Prerequisites

- Node.js and npm
- MongoDB
- Redis
- A Google AI API key for Gemini responses
- A browser that supports WebContainer

## Run locally

### 1. Configure the backend

Copy `backend/.env.example` to `backend/.env` and fill in your own service credentials:

```env
PORT=3000
MONGODB_URI=mongodb://127.0.0.1:27017/ai-collab-studio
JWT_SECRET=replace-with-a-long-random-secret
GOOGLE_AI_KEY=your-google-ai-api-key
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=
```

Install dependencies and start the API and Socket.IO server:

```bash
cd backend
npm install
npm start
```

### 2. Configure the frontend

Create `frontend/.env.local` and set the backend URL. The same URL is used for REST API requests and Socket.IO:

```env
VITE_API_URL=http://localhost:3000
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

Use the backend's origin only; do not append `/users` or `/projects`. Add the variable to each Vercel environment you use (Production, Preview, and Development), then redeploy the frontend. The backend must be reachable over HTTPS from the deployed site. Do not put `MONGODB_URI`, `JWT_SECRET`, `GOOGLE_AI_KEY`, or Redis credentials in the frontend project; those belong only in the backend service's environment.

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
| `PUT` | `/projects/add-user` | Add collaborators to a project |
| `GET` | `/projects/get-project/:projectId` | Read a project and its collaborators |
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

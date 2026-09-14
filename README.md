# CallIQ — AI Conversation Intelligence Dashboard (v2)

Enterprise call-audit dashboard: **React (Vite + Tailwind) frontend** + **FastAPI backend**.
Light cream background, white rounded cards, dark sidebar + top tabs, all data served
live from the API (no hardcoded frontend mock data).

```
calliq/
  backend/     FastAPI app (mock data, all dashboard endpoints)
  frontend/    React app (Vite, Tailwind, Recharts, React Router)
```

## What's included

- **Overview**: Quality Metric KPIs, AI Conversation Metric KPIs (Dead Air, Hold Time,
  Interruptions, Sentiment, Escalation Risk, Abusive/Silent Calls, Compliance Risk),
  Conversation Health Score gauge with 5-dimension breakdown, AI Executive Summary panel,
  weekly score trend chart — every KPI card is clickable and drills into a filtered
  Call Explorer.
- **Conversation Intelligence** (new core tab): behaviour distribution cards with
  sparklines, an interactive team × behaviour heatmap, and a scrollable Top AI Findings
  feed.
- **Call Audit Log / Call Explorer**: searchable, filterable, paginated call table.
- **Call Details**: colour-coded AI conversation timeline, speaker-separated transcript,
  AI Conversation Score panel (8 dimensions), AI Detected Behaviours with confidence and
  timestamp.
- **Red Flags → Incident Management Center**: Critical/Major/Minor incident cards with
  assign/resolve actions, plus an admin **Fatal Behaviour Rules** panel with toggles.
- **Agent Scorecards**: Team Health cards, full leaderboard (conversation/sentiment/
  compliance/risk/trend), AI Coaching Recommendations.
- **Alert Center**: live alert feed with assign/resolve actions and a sample critical-alert
  email preview.
- **Settings**: notification rules (trigger → channel → frequency) with toggles.
- Plus: Score Trends, Process Insights, Sub Parameter Drill, Training Needs (Kanban-style
  coaching pipeline), Weekly Reports, Clients, Prompt Builder, Webhooks.
- Sticky, shared filter bar (project/queue/team/severity/critical/escalated/dead-air) and
  global search by Call ID, Agent, Customer, or phone number.
- Empty states throughout ("No critical incidents detected today.", etc.) instead of blank
  tables.

## Prerequisites

- **Python 3.10+**
- **Node.js 18+** and npm

## 1. Run the backend (FastAPI)

```bash
cd backend
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8811
```

The API is now live at `http://localhost:8811`. Check `http://localhost:8811/api/health`
and interactive docs at `http://localhost:8811/docs`.

Data is generated in-memory on startup (`app/data.py`) and resets whenever you restart
the server; actions you take in the UI (resolve an incident, toggle a rule, assign
coaching) persist only while the server process is running.

## 2. Run the frontend (React)

In a **second terminal**:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. Vite's dev server proxies every `/api/*` request to
`http://localhost:8811` (see `vite.config.js`), so both servers just need to be running —
no `.env` or CORS setup required for local dev.

## 3. Production build

```bash
cd frontend
npm run build       # outputs static files to frontend/dist
npm run preview      # serve the production build locally
```

For a real deployment, serve `frontend/dist` from any static host (or from FastAPI itself
via `StaticFiles`) and point it at your deployed FastAPI URL — update the `baseURL` in
`frontend/src/api/client.js` or set up a reverse-proxy rule equivalent to the Vite proxy.

## Extending it

- **Add a new KPI**: edit `backend/app/routers/kpis.py`, then add a `<KpiCard />` in
  `frontend/src/pages/Overview.jsx`.
- **Add a new page/tab**: create a component in `frontend/src/pages`, register the route
  in `frontend/src/App.jsx`, and add a link in `Sidebar.jsx` or `Tabs.jsx`.
- **Swap mock data for real data**: replace the contents of `backend/app/data.py` with
  calls to your database/call-recording pipeline — the router functions and response
  shapes are already what the frontend expects, so no frontend changes are needed if you
  keep the same field names.
- **Real email/Slack/webhook delivery**: `backend/app/routers/alerts.py` has a
  `sample-email` endpoint you can replace with real SMTP/Slack/webhook calls, triggered
  from `backend/app/routers/incidents.py` when a Fatal Behaviour Rule fires.

## Notes

- This is a fully wired demo build: every drilldown, filter, and status change is real
  (backed by live API calls), but the underlying data is generated mock data, not a
  connection to an actual call-recording system.
- Colours follow the spec's severity convention: green = good, amber = needs attention,
  red = critical, blue = informational.

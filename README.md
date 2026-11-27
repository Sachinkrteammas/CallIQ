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
  sparklines, a process × behaviour heatmap built from dynamically configured client
  processes (configurable campaigns/ingroups such as LPNO or MAPL), with agent and queue
  views, loading/empty states, and cell drill-down into calls filtered by process and
  behaviour. Top AI Findings are derived from real audited calls.
- **Call Audit Log / Call Explorer**: searchable, filterable, paginated call table.
- **Call Details**: colour-coded AI conversation timeline, speaker-separated transcript,
  AI Conversation Score panel (8 dimensions), AI Detected Behaviours with confidence and
  timestamp.
- **Red Flags → Incident Management Center**: Critical/Major/Minor incident cards with
  assign/resolve actions, plus an admin **Fatal Behaviour Rules** panel with toggles.
- **Agent Scorecards**: Team Health cards, full leaderboard (conversation/sentiment/
  compliance/risk/trend), AI Coaching Recommendations with full completion tracking:
  trainer name/ID, coaching type (Assigned Training, Refresher Training, Feedback
  Sessions), resolution remarks, and the authenticated user who completed the activity.
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

- **Python 3.8+** (production runs 3.8 — keep backend code 3.8-compatible)
- **Node.js 18+** and npm

> Backend code must avoid 3.10+ syntax: use `Optional[str]` / `Union[int, str]`
> instead of `str | None` / `int | str`, `List[str]` / `Dict[str, int]` instead of
> `list[str]` / `dict[str, int]`, and no `match` / `case` statements. Files that
> already use PEP 604/585 hints in annotations do so behind
> `from __future__ import annotations`.

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

## Prompt Builder: SOP generation and testing

- The UI guides users through five tracked steps: **Upload documents → Generate
  prompt → Customise & validate → Review & test → Save & activate**. Each step is
  marked complete automatically, and every step is clickable.
- Upload SOP/FAQ/guideline files (PDF, DOCX, TXT, MD, JSON; max 20 MB) for a client;
  the whole document text is extracted and can be previewed in the UI.
- `PATCH /api/settings/ai-prompts/documents/{doc_id}` replaces a document and
  re-extracts its text. `DELETE /api/settings/ai-prompts/documents/{doc_id}`
  removes it. Both require the owning `client_id`.
- `POST /api/settings/ai-prompts/generate-from-docs` turns those documents into a
  prompt name/description/sections/parameters plus `generatedPromptText`, and saves
  a Draft. The generated instructions remain editable and are included in the
  assembled prompt sent to the AI auditor. The response includes `fallback: true`
  when LLM analysis was unavailable and a generic process template was used.
- Activation is blocked until validation passes and a successful test has been run
  against the current prompt configuration.
- `POST /api/settings/ai-prompts/test` audits a pasted transcript with the current
  draft (or the client's active prompt when no draft text is supplied).
- `POST /api/settings/ai-prompts/test-audio` accepts multipart `client_id`, `file`
  (audio, max 50 MB), optional `prompt_text`, `config` (JSON string) and `note`.
  It transcribes the call with the configured STT service, then audits the
  transcript with the same prompt. Response: `{ok, result, transcript, note}`.
  In the UI: **Prompt Builder → Prompt Testing → Upload call audio → Transcribe & Test Audio**.

## Client Settings — audit configuration

`GET /api/client-settings/{client_id}` and `POST /api/client-settings` now round-trip
the full audit configuration: monthly/daily min + max targets, Short/Medium/Long
call counts and thresholds, campaign/ingroup filters, and the sales-category
audit filter (`enable_sales_category_filter`, `sales_interested_values`,
`sales_not_interested_values`). `total` is auto-derived from the configured min
target (Monthly or Daily) and changing the target rebalances the Short/Medium/Long
split; duration counts are only a fallback when no target is set. Filter fields
are returned as arrays and accept any number of comma-separated values in the UI.

The sales-category filter also persists per-category audit allocation:
`sales_interested_audit_count`, `sales_not_interested_audit_count`, and
`sales_prioritize_interested`.

Sales and Service data are strictly separated. A client is Sales when
`clients.ingroups` is empty, Service otherwise. All GET requests carry the
active `client_type`; a `client_id` from the other view is rejected with HTTP
400. Report exports accept `client_type` / `client_id` and omit sales-only
columns in Service exports.

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

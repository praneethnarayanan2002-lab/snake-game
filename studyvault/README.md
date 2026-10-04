# StudyVault

A community-driven academic document library for college students. Upload notes and papers once — PDF, Word, PowerPoint, Excel, OpenDocument, text/Markdown/CSV, RTF or images; everyone can find them, organised **Subject → Unit → Resource type → Year** and ranked by relevance and community signals.

- **Frontend:** React 19 · Vite · Tailwind CSS v4 · framer-motion · cmdk · Radix UI · react-pdf
- **Backend:** FastAPI · SQLAlchemy 2 · Alembic · PostgreSQL 16 (full-text search + pg_trgm) · pypdf
- **Storage:** pluggable file storage (local disk now; S3/Supabase/Cloudinary by adding a backend). File binaries never go into Postgres.

**Live:** https://studyvault-smoky.vercel.app (Vercel + Supabase)

## Quick start

Requirements: Python 3.12+, Node 20+, and either Docker or a local PostgreSQL 16.

```bash
cd studyvault
./dev.sh               # Postgres (docker) → migrations → seed → API :8000 + web :5173
```

Open http://localhost:5173. API docs are at http://localhost:8000/docs.

| Account | Login | Password |
| --- | --- | --- |
| Student | `sanjith` | `sanjith12345` |
| Admin | `admin` | `admin12345` |
| Other seed users | `priya`, `arjun`, `meera`, … | `password123` |

Options: `./dev.sh --reseed` wipes and regenerates the seed data; `./dev.sh --no-docker` uses an existing Postgres from `STUDYVAULT_DATABASE_URL` (see `backend/.env.example`).

### Manual setup

```bash
docker compose up -d --wait db           # or point STUDYVAULT_DATABASE_URL at your own Postgres

cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
python -m scripts.seed                   # --reset to reseed
uvicorn app.main:app --reload --port 8000

cd ../frontend
npm install
npm run dev                              # proxies /api to :8000
```

### Tests

```bash
cd backend && source .venv/bin/activate
pytest -q        # uses the studyvault_test database (created by docker compose)
```

The suite covers auth, upload/storage/text extraction, permissions, stars/ratings/bookmarks (including DB constraints), reports and moderation, the query parser, the ranking engine, and the full "upload → others star/rate → result climbs the ranking" flow.

Frontend type-check and production build: `cd frontend && npm run build`.

## Deploying (Vercel + Supabase)

Production layout: **Vercel** serves the React build and runs FastAPI as a Python serverless function (`api/index.py`, routed by `vercel.json`); **Supabase** provides PostgreSQL and Storage (a public `studyvault-pdfs` bucket). Browsers upload PDFs straight to Supabase through a signed URL (`POST /api/resources/upload-url`), so the 4.5 MB Vercel request limit doesn't cap uploads; the API then downloads the object, validates it and extracts text.

1. **Supabase**: create a project and note
   - the *direct* (or session pooler) connection string, for migrations and seeding;
   - the *transaction pooler* connection string (port 6543), for Vercel;
   - the project URL and the `service_role` key (Project Settings → API).
2. **Migrate and seed** from your machine:
   ```bash
   cd backend && source .venv/bin/activate
   export STUDYVAULT_DATABASE_URL='postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres'
   export STUDYVAULT_STORAGE_BACKEND=supabase STUDYVAULT_SUPABASE_URL=https://<ref>.supabase.co STUDYVAULT_SUPABASE_SERVICE_KEY=<service_role>
   alembic upgrade head
   python -m scripts.seed        # creates the bucket and uploads the generated PDFs
   ```
3. **Vercel**: import the repo with **Root Directory = `studyvault`** (vercel.json takes care of build, output and routing), and set these environment variables:

   | Variable | Value |
   | --- | --- |
   | `STUDYVAULT_DATABASE_URL` | Supabase transaction pooler URL (`…pooler.supabase.com:6543/postgres`) |
   | `STUDYVAULT_SERVERLESS` | `true` (no connection pooling, no prepared statements) |
   | `STUDYVAULT_SECRET_KEY` | long random string |
   | `STUDYVAULT_STORAGE_BACKEND` | `supabase` |
   | `STUDYVAULT_SUPABASE_URL` | `https://<ref>.supabase.co` |
   | `STUDYVAULT_SUPABASE_SERVICE_KEY` | `service_role` key (server-side only) |

   Or with the CLI: `cd studyvault && vercel link && vercel env add … && vercel deploy --prod`.

## Project layout

```
studyvault/
├── docker-compose.yml          Postgres 16 (+ test database)
├── dev.sh                      one-command dev environment
├── backend/
│   ├── app/
│   │   ├── models/             User, Subject, Unit, Resource, ResourceText, Tag, ResourceStar,
│   │   │                       ResourceRating, Bookmark, ResourceView, Report
│   │   ├── schemas/            Pydantic request/response models
│   │   ├── routes/             auth, subjects, resources, search, users/dashboard, admin
│   │   └── services/           storage, pdf_text, query_parser, ranking, search, security
│   ├── alembic/                migrations
│   ├── scripts/seed.py         seed users, curriculum and generated PDFs (reportlab)
│   └── tests/
└── frontend/src/
    ├── components/ui/          design-system primitives (button, card, dialog, badge, effects…)
    ├── components/layout/      app shell, sidebar, mobile nav, ⌘K command palette
    ├── components/resource/    resource cards, star/rating controls, PDF viewer, dialogs
    ├── pages/                  Home, Dashboard, Subjects, Subject, Search, Resource viewer,
    │                           Upload, Bookmarks/My uploads, Profile, Exam Mode, Admin
    ├── services/api.ts         typed REST client
    └── lib/                    auth, theme, types, constants, utils
```

## How it works

### Storage
`app/services/storage.py` defines a `StorageBackend` interface (`save`, `delete`, `exists`, `local_path`, `public_url`). `LocalDiskStorage` writes to `backend/storage/YYYY/MM/<uuid>.pdf`. Postgres stores only `file_key`; `file_url` is derived (`/api/resources/{id}/file`) so swapping backends doesn't touch rows. A remote backend returns a `public_url` and the file endpoint redirects to it.

### Supported formats
`app/services/documents.py` keeps an allowlist: PDF, DOCX/DOC, ODT, RTF, PPTX/PPT, ODP, XLSX/XLS, ODS, CSV, TXT, MD, PNG/JPG/WebP/GIF (20 MB max). Each upload is checked by file signature (a renamed file is rejected), and HTML/SVG/executables are refused because files are served publicly. Text is extracted with pypdf, python-docx, python-pptx, openpyxl, odfpy and striprtf; legacy binary Office files and images are stored without text. In the app, PDFs open in the pdf.js reader, images in a zoomable viewer, text/Markdown/CSV inline, and Office/OpenDocument files in Microsoft's online viewer when served from public storage (deployed site), with an extracted-text tab everywhere.

### Text extraction & search
On upload, `pypdf` extracts text (capped at 400k chars) into `resource_texts` with a generated `tsvector` column (GIN-indexed). Resources also have a generated, weighted `search_vector` over title (A), tags (B) and description (C), plus a trigram index on title for fuzzy matches.

### Query understanding
`query_parser.py` turns `"dbms unit 3 pyq 2024"` into `{subject: DBMS, unit: 3, type: pyq, year: 2024}` using subject codes/names/aliases, `unit N` / roman numerals, type phrases (pyq, previous year, mid, semester, question bank, notes…), exam types (mid 1/2, supplementary) and years. What's left (`"normalization"`) goes to full-text search.

### Ranking
`ranking.py` scores every candidate with independent 0–1 signals and fixed weights:

| Signal | Weight | Source |
| --- | --- | --- |
| Relevance | 40% | `ts_rank_cd` over metadata, PDF text and unit topics + trigram title similarity + keyword coverage; when the query has no topical keywords, the share of detected facets matched |
| Subject / unit match | 20% | parsed subject and unit |
| Resource type match | 15% | parsed type (and year) |
| Popularity | 15% | log-scaled stars (70%) and views (30%), 15% of this signal is recency |
| Rating | 10% | Bayesian average (prior 3.5, weight 3) so one 5★ doesn't beat fifty 4.6★ |

The top result on the first page is flagged `recommended` (shown as **✦ Recommended**). Each result carries its score breakdown. Adding semantic search later means computing one more 0–1 signal (e.g. embedding cosine similarity) and giving it a weight.

### API overview
- `POST /api/auth/signup|login`, `GET/PATCH /api/auth/me`
- `GET /api/subjects`, `GET /api/subjects/{slug}`, `GET /api/meta`
- `GET /api/search?q=&subject=&unit=&type=&year=&exam_type=&sort=best|stars|rating|views|newest`
- `GET /api/trending`, `GET /api/exam-plan?subject=&exam=semester|mid1|mid2`
- `POST /api/resources` (multipart upload), `GET/PATCH/DELETE /api/resources/{id}`, `GET /api/resources/{id}/file[?download=1]`
- `POST /api/resources/{id}/view`, `PUT …/progress`, `POST|DELETE …/star`, `PUT|DELETE …/rating`, `POST|DELETE …/bookmark`, `POST …/report`
- `GET /api/me/dashboard|uploads|bookmarks|recent`, `GET /api/users/{username}` (no email exposed)
- `GET /api/admin/overview|resources|reports`, `PATCH /api/admin/reports/{id}`, `DELETE /api/admin/resources/{id}`, `POST /api/admin/users/{id}/purge`, subject/unit CRUD

### Design system
Tokens live in `frontend/src/index.css`: zinc neutral surfaces, one indigo accent, amber reserved for ratings; Inter + JetBrains Mono; radii 6/8/12/16; four shadow levels; motion uses a single expo-out curve at 150–300 ms. Dark is the default; the light theme swaps the same tokens. Components in `components/ui` (Button variants, Card, Input, Badge, Kbd, Dialog, Tooltip, Skeleton, EmptyState, SpotlightCard, RevealText, AnimatedNumber, FilterMenu) are reused everywhere.

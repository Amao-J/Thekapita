# Deploying Thekapita to Railway

One GitHub repo, three Railway services: **Postgres**, **backend**, **web**.

## 1. Backend service
- New service → Deploy from GitHub repo → this repo.
- Settings → **Root Directory**: `/Backend` (uses `Backend/Dockerfile` + `Backend/railway.toml`).
- Settings → Networking → **Generate Domain**.
- Variables:
  - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`  (add a Postgres service first)
  - `DJANGO_SECRET_KEY` = long random string
  - `JWT_SIGNING_KEY` = a different long random string
  - `CORS_ALLOWED_ORIGINS` = the web service URL, e.g. `https://web-production-xxxx.up.railway.app`
  - (optional) `CSRF_TRUSTED_ORIGINS` = same URL, for the Django admin

Generate secrets with: `python -c "import secrets; print(secrets.token_urlsafe(64))"`

## 2. Web service
- New service → same GitHub repo.
- Settings → **Root Directory**: leave as `/` (repo root).
- Settings → **Config file path**: `/apps/web/railway.toml`.
- Settings → Networking → **Generate Domain**.
- Variables: `VITE_API_BASE_URL` = `https://<backend-domain>/api`
  (baked in at build time — redeploy the web service if you change it).

## 3. Order
Deploy backend → copy its domain → set `VITE_API_BASE_URL` on web → deploy web →
copy web domain → set `CORS_ALLOWED_ORIGINS` on backend.

## Local dev
- Backend: `cd Backend && pip install -r requirements.txt && python src/manage.py migrate && python src/manage.py runserver`
- Web: `cp apps/web/.env.example apps/web/.env && npm install && npm run dev -w @thekapita/web`

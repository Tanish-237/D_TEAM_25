.PHONY: setup models test lint format check guard bundle build web dev api demo

setup:
	uv sync
	cd frontend && pnpm install

models:
	./scripts/download_models.sh

test:
	uv run pytest
	cd web && uv run python manage.py test attendance

lint:
	uv run ruff check .
	uv run ruff format --check .

format:
	uv run ruff check --fix .
	uv run ruff format .

guard:
	./scripts/check_no_faces.sh

check: guard lint test

bundle:
	mkdir -p dist
	git rev-parse --short HEAD > dist/COMMIT
	git archive --format=zip -o dist/quickpic-src.zip HEAD
	cd dist && zip -q quickpic-src.zip COMMIT && rm COMMIT
	@echo "Upload dist/quickpic-src.zip to Google Drive: MyDrive/QuickPic/"

build:
	cd frontend && pnpm install --frozen-lockfile && pnpm build

# The full app on http://127.0.0.1:8000 (built frontend served by Django).
web: build
	cd web && uv run python manage.py migrate --verbosity 0 && uv run python manage.py runserver

# Live-reloading frontend on http://127.0.0.1:5173; run `make api` in another terminal.
dev:
	cd frontend && pnpm dev

api:
	cd web && uv run python manage.py migrate --verbosity 0 && uv run python manage.py runserver

demo:
	cd web && uv run python manage.py migrate --verbosity 0 && uv run python manage.py seed_demo ../data/class/enroll

.DEFAULT_GOAL := help
.PHONY: help setup models web dev api demo test lint format check guard bundle

help:  ## Show this list
	@grep -E '^[a-z]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  make %-8s %s\n", $$1, $$2}'

setup:  ## Install Python (uv) and frontend (pnpm) dependencies
	uv sync
	cd frontend && pnpm install

models:  ## Download the pretrained face models into models/
	./scripts/download_models.sh

web:  ## Build the frontend and run the app on http://127.0.0.1:8000
	cd frontend && pnpm install --frozen-lockfile && pnpm build
	cd web && uv run python manage.py migrate --verbosity 0 && uv run python manage.py runserver

dev:  ## Live-reloading frontend on :5173 (run `make api` alongside)
	cd frontend && pnpm dev

api:  ## Django API on :8000 for frontend development
	cd web && uv run python manage.py migrate --verbosity 0 && uv run python manage.py runserver

demo:  ## Create a demo teacher, course and students from data/class/enroll/
	cd web && uv run python manage.py migrate --verbosity 0 && uv run python manage.py seed_demo ../data/class/enroll

test:  ## Engine and API tests
	uv run pytest
	cd web && uv run python manage.py test attendance

lint:  ## Lint and format checks (Python and TypeScript)
	uv run ruff check .
	uv run ruff format --check .
	cd frontend && pnpm format:check && pnpm typecheck

format:  ## Auto-format Python and TypeScript
	uv run ruff check --fix .
	uv run ruff format .
	cd frontend && pnpm format

guard:  ## Fail if any image would be committed
	./scripts/check_no_faces.sh

check: guard lint test  ## Everything CI runs

bundle:  ## Zip the repo for Colab (upload to Drive: MyDrive/QuickPic/)
	mkdir -p dist
	git rev-parse --short HEAD > dist/COMMIT
	git archive --format=zip -o dist/quickpic-src.zip HEAD
	cd dist && zip -q quickpic-src.zip COMMIT && rm COMMIT

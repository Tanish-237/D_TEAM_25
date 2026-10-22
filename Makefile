.PHONY: setup models test lint format check guard

setup:
	uv sync

models:
	./scripts/download_models.sh

test:
	uv run pytest

lint:
	uv run ruff check .
	uv run ruff format --check .

format:
	uv run ruff check --fix .
	uv run ruff format .

guard:
	./scripts/check_no_faces.sh

check: guard lint test

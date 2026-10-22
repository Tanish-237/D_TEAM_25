.PHONY: setup models test lint format check guard bundle

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

bundle:
	mkdir -p dist
	git rev-parse --short HEAD > dist/COMMIT
	git archive --format=zip -o dist/quickpic-src.zip HEAD
	cd dist && zip -q quickpic-src.zip COMMIT && rm COMMIT
	@echo "Upload dist/quickpic-src.zip to Google Drive: MyDrive/QuickPic/"

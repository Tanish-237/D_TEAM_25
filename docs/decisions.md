# Design decisions

Each entry records what was chosen, why, and what it costs us.

| # | Decision | Date |
|---|---|---|
| 1 | [Frozen pretrained networks plus our own decision layer](#1-frozen-pretrained-networks-plus-our-own-decision-layer) | 2026-10-22 |
| 2 | [Public datasets: LFW, TinyFace, ICFD sample](#2-public-datasets-lfw-tinyface-icfd-sample) | 2026-10-22, revised 10-26 |
| 3 | [Class data stays on the laptop](#3-class-data-stays-on-the-laptop) | 2026-10-22 |
| 4 | [Django API with a React frontend](#4-django-api-with-a-react-frontend) | 2026-10-22, revised 10-27 |
| 5 | [Run offline on one laptop](#5-run-offline-on-one-laptop) | 2026-10-22, revised 10-26 |
| 6 | [Python 3.12 managed by uv](#6-python-312-managed-by-uv) | 2026-10-22 |

## 1. Frozen pretrained networks plus our own decision layer

**Choice.** Use pretrained detectors (SCRFD, YuNet, Haar) and embedders (ArcFace, SFace, LBP) unchanged. Our contribution sits on top of them: tiled detection, degradation-aware enrollment, quality-aware score calibration and photo-level one-to-one assignment. Each part can be switched on or off for the ablation.

**Why.** Fine-tuning a face network needs millions of labelled faces, most of which require access requests, plus GPU time. In nine days it would most likely end up worse than the published weights. A decision layer targets the actual classroom problems (small faces, uneven quality, open-set rejection) and runs on a CPU.

**Cost.** We don't claim a new network. The claim is a better decision layer for this setting, backed by an ablation.

## 2. Public datasets: LFW, TinyFace, ICFD sample

**Choice.** LFW for verification and for building the calibrator's training pairs, TinyFace for open-set identification on natively small faces, and the public ICFD sample (IIT Madras) as an in-domain check on Indian classroom faces. Detection is evaluated on our labelled class photos and a synthetic size sweep.

**Why.** Together they cover each stage, and TinyFace's 1:N protocol with distractors matches the classroom problem. WIDER FACE was planned for detection but dropped for time once our own labelled class photos gave a more relevant detection test.

**Cost.** LFW and TinyFace state no formal licence; ICFD is non-commercial research only. None is redistributed. MS-Celeb-1M and MegaFace are avoided because their creators withdrew them.

## 3. Class data stays on the laptop

**Choice.** Enrollment and class photos live in `data/`, which is gitignored and also blocked by `scripts/check_no_faces.sh` in CI. Experiments on class data run locally. Only aggregate metrics leave the machine.

**Why.** Most people in a class photo are not enrolled and never agreed to anything.

**Cost.** Class-data experiments can't run on Colab, so they are limited to the laptop's CPU. That is enough, because they only run the networks, with no training.

## 4. Django API with a React frontend

**Choice.** Django with Django Ninja as a JSON API, SQLite for storage, and a React + TypeScript single-page app (Vite, Tailwind CSS, TanStack Query) in `frontend/`. Django serves the built frontend, so one process runs everything.

**Why.** Django ships with logins, password hashing, sessions, CSRF protection, an admin panel and migrations, and the recognition engine is Python. The first version used server-rendered templates; the web app is the centre of the demonstration, so it was rebuilt as a React app for interactive review (zoomable photo with editable face boxes, webcam registration with instant checks). A course of 60 students needs no vector database: a matrix product compares a face with every enrolled student in microseconds.

**Cost.** Two toolchains (uv and pnpm), and the frontend must be built before Django can serve it (`make web` does both). SQLite allows one writer at a time, which is fine at this scale.

## 5. Run offline on one laptop

**Choice.** The app is demonstrated on the authors' laptop at `127.0.0.1`, with CPU-only inference. It is not deployed online.

**Why.** The project is shown in person. Free hosting tiers offer too little CPU and RAM for detection on large group photos, and keeping everything local means class photos never leave the machine. An earlier plan to expose the laptop through a tunnel was dropped once a public URL was no longer needed.

**Cost.** Only one machine can use the app. The browser allows webcam access on `localhost` without HTTPS, so registration with the camera still works.

## 6. Python 3.12 managed by uv

**Choice.** Python 3.12 pinned in `.python-version`, with dependencies locked in `uv.lock`.

**Why.** Some libraries in the face and ONNX ecosystem lag behind the newest Python releases, and 3.12 is widely supported. uv keeps the environment reproducible without installing anything globally.

**Cost.** None of note.

# Design decisions

Each entry records what was chosen, why, and what it costs us.

| # | Decision | Date |
|---|---|---|
| 1 | [Frozen pretrained networks plus our own decision layer](#1-frozen-pretrained-networks-plus-our-own-decision-layer) | 2026-10-22 |
| 2 | [Public datasets: WIDER FACE, LFW, TinyFace](#2-public-datasets-wider-face-lfw-tinyface) | 2026-10-22 |
| 3 | [Class data stays on the laptop](#3-class-data-stays-on-the-laptop) | 2026-10-22 |
| 4 | [Django with SQLite for the web app](#4-django-with-sqlite-for-the-web-app) | 2026-10-22 |
| 5 | [Host on the laptop behind a tunnel](#5-host-on-the-laptop-behind-a-tunnel) | 2026-10-22 |
| 6 | [Python 3.12 managed by uv](#6-python-312-managed-by-uv) | 2026-10-22 |

## 1. Frozen pretrained networks plus our own decision layer

**Choice.** Use pretrained detectors (SCRFD, YuNet, Haar) and embedders (ArcFace, SFace, LBP) unchanged. Our contribution sits on top of them: tiled detection, degradation-aware enrollment, quality-aware score calibration and photo-level one-to-one assignment. Each part can be switched on or off for the ablation.

**Why.** Fine-tuning a face network needs millions of labelled faces, most of which require access requests, plus GPU time. In nine days it would most likely end up worse than the published weights. A decision layer targets the actual classroom problems (small faces, uneven quality, open-set rejection) and runs on a CPU.

**Cost.** We don't claim a new network. The claim is a better decision layer for this setting, backed by an ablation.

## 2. Public datasets: WIDER FACE, LFW, TinyFace

**Choice.** WIDER FACE val for detection, LFW for verification and for building the calibrator's training pairs, TinyFace for open-set identification on natively small faces.

**Why.** Together they cover each stage, and TinyFace's 1:N protocol with distractors matches the classroom problem. All three can be downloaded directly.

**Cost.** WIDER FACE is CC BY-NC-ND 4.0. LFW and TinyFace state no formal licence. All three are used for non-commercial research only and never redistributed. MS-Celeb-1M and MegaFace are avoided because their creators withdrew them.

## 3. Class data stays on the laptop

**Choice.** Enrollment and class photos live in `data/`, which is gitignored and also blocked by `scripts/check_no_faces.sh` in CI. Experiments on class data run locally. Only aggregate metrics leave the machine.

**Why.** Most people in a class photo are not enrolled and never agreed to anything.

**Cost.** Class-data experiments can't run on Colab, so they are limited to the laptop's CPU. That is enough, because they only run the networks, with no training.

## 4. Django with SQLite for the web app

**Choice.** Django with server-rendered templates and SQLite.

**Why.** Django ships with logins, password hashing, sessions, CSRF protection, forms, an admin panel and migrations. With FastAPI or Flask we would assemble those by hand, which is slow and easy to get wrong. One process on one machine needs no separate database server, and a course of 60 students needs no vector database, since a matrix product compares a face with every enrolled student in microseconds.

**Cost.** Django has more files and conventions than a micro-framework. SQLite allows only one writer at a time, which is fine at this scale.

## 5. Host on the laptop behind a tunnel

**Choice.** Run the site on the laptop (CPU-only inference) and expose it through Tailscale Funnel, which gives a stable public HTTPS URL. `cloudflared` quick tunnels are the fallback.

**Why.** Hugging Face Spaces now requires a paid plan for Docker and Gradio apps. Free tiers that need no card offer far too little CPU and RAM to run detection on large group photos, and the free cloud databases we checked expire or pause. The laptop is much faster, and class photos never leave it.

**Cost.** The site is only up while the laptop is awake and online. Funnel bandwidth is limited (Tailscale does not publish the figure), and campus networks may block tunnels. A mobile hotspot is the backup.

## 6. Python 3.12 managed by uv

**Choice.** Python 3.12 pinned in `.python-version`, with dependencies locked in `uv.lock`.

**Why.** Some libraries in the face and ONNX ecosystem lag behind the newest Python releases, and 3.12 is widely supported. uv keeps the environment reproducible without installing anything globally.

**Cost.** None of note.

# QuickPic

Attendance from one photograph of a classroom. QuickPic detects every face in the photo, recognises the enrolled students, and marks everyone else as unknown. The teacher then confirms or edits the draft list.

Course project for Image Processing and Computer Vision (Semester VII), MNNIT Allahabad.

Report: [paper/quickpic.pdf](paper/quickpic.pdf) (4 pages, IEEE format).

## Results

On 10 real class photographs (804 hand-labelled faces, 117 appearances of 15 enrolled students), with thresholds chosen leave-one-photo-out:

| Configuration | Attendance F1 | Strangers given a student's name |
|---|---|---|
| Pretrained baseline (SCRFD + ArcFace R50) | 0.954 | 32 |
| + tiled detection | 0.954 | 15 |
| + degradation-aware enrollment | 0.966 | 15 |
| **+ one-to-one assignment (deployed)** | **0.966** | **6** |

The deployed system names 115 of 117 student appearances correctly, and tiling raises detection recall from 0.879 to 0.974. A 4032×3024 photo with 88 faces takes 6.3 s on a laptop CPU. All numbers come from `experiments/results/*.json`.

## How it works

```
class photo ─► detect ─► align ─► embed ─► match ─► assign ─► draft list ─► teacher confirms
```

1. **Detect.** Find each face and its five landmarks (SCRFD, YuNet, or a Haar cascade as the classical baseline).
2. **Align.** Warp each face onto a fixed 112×112 template using its landmarks.
3. **Embed.** Map each face to a fixed-length vector, its embedding, with a frozen network (ArcFace, SFace, or LBP histograms as the classical baseline). Photos of the same person give nearby vectors.
4. **Match.** Compare each face with every enrolled student's stored vectors.
5. **Assign.** Decide all faces in the photo jointly, so each student is matched at most once and weak matches become unknown.

Our contribution is the classroom-aware decision layer in steps 1, 4 and 5, each part of which can be switched off for the ablation:

| Component | Problem it targets |
|---|---|
| Tiled detection | Faces at the back of the room are too small after the photo is downscaled |
| Degradation-aware enrollment | Enrollment selfies are sharp; classroom faces are small and blurred |
| Quality-aware calibration | A single similarity threshold is wrong for low-quality faces |
| One-to-one assignment | Two faces must never be given the same student |

## Quickstart

Requires [uv](https://docs.astral.sh/uv/), Node.js 20+ and [pnpm](https://pnpm.io/).

```bash
make setup      # Python environment from uv.lock + frontend packages
make models     # download pretrained weights into models/
make check      # data guard, lint, engine and API tests
make web        # build the frontend and serve everything on http://127.0.0.1:8000
```

Optional demo data: `make demo` creates a teacher (`teacher` / `quickpic-demo`), a course and one student per folder in `data/class/enroll/`. To start over, delete `web/quickpic.sqlite3` and `web/media/`.

For frontend development, run `make api` and `make dev` in two terminals and open http://127.0.0.1:5173.

## Web application

- **Stack:** Django 6 + Django Ninja (JSON API, session auth with CSRF) and SQLite on the backend; React 19, TypeScript, Vite, Tailwind CSS 4 and TanStack Query on the frontend. Django serves the built frontend, so the whole app runs offline from one process.
- **Students** sign up, join a course by its code, and register their face with four guided photos (webcam or file). Each photo is checked instantly for one face, size, sharpness, light and head turn, and the aligned face is shown back. Only embeddings are stored, and students can delete them.
- **Teachers** create courses, upload a class photo, and review every detected face on the photo with its proposed name. They reassign or reject faces (one face per student is enforced), adjust the register and confirm. The photo is then deleted. Course pages show per-lecture and per-student attendance, students below 75%, and CSV export. Teachers can edit or delete a lecture (and its attendance), correct individual marks, edit a course, issue a new join code, remove students, or delete a course.
- **Students** can leave a course; the attendance already recorded stays with the teacher.
- **Everyone** has a profile page: name and roll number, password change, and account deletion (which removes face data and attendance).

## Repository layout

```
src/quickpic/   recognition engine: importable, typed, tested, no UI code
experiments/    scripts that produce every number in the paper → experiments/results/*.json
notebooks/      Colab and exploration notebooks; nothing imports from here
tools/          local helpers, such as the face labeller that builds the answer key
web/            Django backend: JSON API over the engine, models, tests
frontend/       React + TypeScript single-page app
tests/          unit tests for the engine
paper/          IEEE paper (LaTeX)
docs/           design decisions and figures
data/           local only, never committed
```

## Data and privacy

- No face images are ever committed. `data/` and `models/` are gitignored, and CI fails if an image outside `docs/assets/` is tracked.
- Experiments on class photos run only on the authors' machine, and only aggregate metrics are reported.
- The web app keeps face embeddings, not enrollment photos. A class photo is deleted once the teacher confirms the attendance list, and students can delete their stored data.

## Licences

The code in this repository is released under the MIT licence. Pretrained weights are downloaded separately and keep their own terms. The InsightFace models are for **non-commercial research only**. SFace and YuNet are from the OpenCV Zoo, and SFace is Apache-2.0. The public datasets (LFW, TinyFace, the ICFD sample) are used for non-commercial research and are not redistributed.

## Team 25

Tanish Mittal (20233288) · Shashank Kanaujiya (20233259) · Utkarsh Raj Singh (20233298) · Shinde Ritesh Tirupati (20233350)

See [docs/decisions.md](docs/decisions.md) for the reasoning behind each design choice.

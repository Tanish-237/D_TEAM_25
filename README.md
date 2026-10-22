# QuickPic

Attendance from one photograph of a classroom. QuickPic detects every face in the photo, recognises the enrolled students, and marks everyone else as unknown. The teacher then confirms or edits the draft list.

Course project for Image Processing and Computer Vision (Semester VII), MNNIT Allahabad.

> **Status:** in development, with the project show on 31 October 2026. Results will appear here once the experiments run.

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

Requires [uv](https://docs.astral.sh/uv/).

```bash
make setup      # create the environment from uv.lock
make models     # download pretrained weights into models/
make check      # data guard, lint, tests
```

## Repository layout

```
src/quickpic/   recognition engine: importable, typed, tested, no UI code
experiments/    scripts that produce every number in the paper → experiments/results/*.json
notebooks/      Colab and exploration notebooks; nothing imports from here
web/            Django app, a thin layer over the engine
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

The code in this repository is released under the MIT licence. Pretrained weights are downloaded separately and keep their own terms. The InsightFace models are for **non-commercial research only**. SFace and YuNet are from the OpenCV Zoo, and SFace is Apache-2.0. The public datasets (WIDER FACE, LFW, TinyFace) are used for non-commercial research and are not redistributed.

## Team 25

Shashank Kanaujiya (20233259) · Tanish Mittal (20233288) · Utkarsh Raj Singh (20233298) · Shinde Ritesh Tirupati (20233350)

See [docs/decisions.md](docs/decisions.md) for the reasoning behind each design choice.

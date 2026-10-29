# Datasets

QuickPic was evaluated on four datasets. To protect our classmates' privacy, **no face image is published**.
The files here hold everything except the pixels: the hand-labelled answer key that every class-photo number in the report is scored against.

## 1. Our class photos (collected by the team)

| | |
|---|---|
| Photos | 10 real classroom photographs, 4032 × 3024, phone camera, 69–102 faces each |
| Labelled faces | 804 face boxes with 5 landmarks each (793 real faces after removing 11 `not_face` boxes) |
| Enrolled students | 15 classmates, 2–6 registration selfies each (59 in total) |
| Appearances of enrolled students | 117 |

```
dataset/class/
├── labels/<photo>.json   answer key for one photo
└── students.csv          enrolled students (pseudonymised), selfie count, appearances
```

Each label file looks like this:

```json
{
  "photo": "IMG_6840.JPG",
  "size": [4032, 3024],
  "detector": "scrfd_10g+tiles@0.3",
  "reviewed": true,
  "faces": [
    {"box": [x1, y1, x2, y2], "landmarks": [[x, y] × 5], "score": 0.83, "label": "S07"}
  ],
  "missed": []
}
```

`label` is one of:
- `S01` to `S15`: an enrolled student (real names replaced by codes)
- `unknown`: a person who is not enrolled
- `not_face`: a false detection

`missed` lists faces the detector did not propose, which we added by hand.

The labels were made with our labelling tool ([`tools/label_faces.py`](../tools/label_faces.py)). It proposes boxes with tiled SCRFD, and a person then names, corrects or adds each box.

**The photos themselves.** The photos and selfies stay on the team's laptop. Enrolled classmates agreed to be in the study, but not to be published. The photos can be shown to the course instructor on request.

To rerun the class experiments with the photos, put them in `data/class/` (git-ignored) using this layout:

```
data/class/photos/<photo>.JPG
data/class/labels/<photo>.json
data/class/enroll/<student>/*.jpg
data/class/students.csv
```

Then run:

```bash
uv run python -m experiments.class_detection --data data/class
uv run python -m experiments.class_eval --data data/class
```

The results already produced are in [`experiments/results/`](../experiments/results) (`class_detection.json`, `class_eval.json`).

## 2. Public benchmarks (download from the original sources)

| Dataset | What it is | Used for | Get it |
|---|---|---|---|
| **LFW** | 13,233 web photos of 5,749 people | Face verification; calibration training | http://vis-www.cs.umass.edu/lfw/ (the notebook downloads it automatically) |
| **TinyFace** | Native low-resolution faces (about 20 × 16 px) | Open-set identification on tiny faces | https://qmul-tinyface.github.io/ |
| **ICFD** sample (IIT Madras) | Indian students filmed in real classrooms | Rank-1 identification on Indian faces | Public sample released by the authors: Bhattacharjee and Das, *IEEE T-BIOM* 2020 (reference in the report) |

These datasets are licensed for research and are not redistributed here. The benchmarks ran on a Colab GPU with [`notebooks/`](../notebooks) and [`experiments/public_benchmarks.py`](../experiments/public_benchmarks.py):

```bash
uv run python -m experiments.public_benchmarks --lfw <folder with lfw/ and pairs.txt> --tinyface <tinyface folder>
uv run python -m experiments.icfd_sample --root data/public/icfd/ICFD_Samples
```

## 3. Demo photo for trying the app

InsightFace's public sample photo (6 faces) is installed with the Python environment at `.venv/lib/python3.12/site-packages/insightface/data/images/t1.jpg`. You can use it to try the full app without any private data: register a few faces cropped from it, then upload the photo as a class photo.

"""Evaluation metrics, from pair verification up to attendance lists."""

import numpy as np

from quickpic.match import UNKNOWN


def threshold_at_far(impostor_scores: np.ndarray, far: float) -> float:
    """Smallest threshold at which at most a fraction `far` of impostor scores are accepted."""
    ordered = np.sort(np.asarray(impostor_scores))[::-1]
    allowed = int(np.floor(far * len(ordered)))
    if allowed >= len(ordered):
        return -np.inf
    return float(np.nextafter(ordered[allowed], np.inf))


def tar_at_far(genuine: np.ndarray, impostor: np.ndarray, far: float) -> float:
    """True accept rate on genuine pairs when the false accept rate on impostor pairs is `far`."""
    return float(np.mean(np.asarray(genuine) >= threshold_at_far(impostor, far)))


def verification_accuracy(scores: np.ndarray, same: np.ndarray, folds: np.ndarray) -> float:
    """LFW protocol: for each fold, pick the best threshold on the others and test on it."""
    accuracies = []
    for fold in np.unique(folds):
        train, test = folds != fold, folds == fold
        candidates = np.unique(scores[train])
        train_acc = [np.mean((scores[train] >= t) == same[train]) for t in candidates]
        best = candidates[int(np.argmax(train_acc))]
        accuracies.append(np.mean((scores[test] >= best) == same[test]))
    return float(np.mean(accuracies))


def open_set_identification(scores: np.ndarray, truth: np.ndarray, far: float) -> dict:
    """Detection and identification rate at a false alarm rate.

    scores: (probes, students); truth: the correct student index, or UNKNOWN.
    The threshold is set so that a fraction `far` of unknown probes would be
    wrongly matched to someone. DIR is the fraction of enrolled probes that are
    both ranked to the right student and above that threshold.
    """
    known = truth != UNKNOWN
    best_score = scores.max(axis=1)
    threshold = threshold_at_far(best_score[~known], far)
    correct = scores[known].argmax(axis=1) == truth[known]
    return {
        "far": far,
        "threshold": threshold,
        "dir": float(np.mean(correct & (best_score[known] >= threshold))),
        "rank1": float(np.mean(correct)),
    }


def attendance(predicted: set[str], present: set[str]) -> dict:
    """Compares a draft attendance list with who was really in the photo."""
    hits = len(predicted & present)
    precision = hits / len(predicted) if predicted else 1.0
    recall = hits / len(present) if present else 1.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return {
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "false_present": len(predicted - present),
        "missed": len(present - predicted),
    }

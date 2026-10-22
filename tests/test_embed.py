import numpy as np

from quickpic.embed import LbpEmbedder


def test_lbp_embeddings_are_unit_vectors():
    rng = np.random.default_rng(0)
    crops = [rng.integers(0, 256, (112, 112, 3), dtype=np.uint8) for _ in range(3)]
    embedder = LbpEmbedder()

    vectors = embedder.embed(crops)

    assert vectors.shape == (3, embedder.dim)
    np.testing.assert_allclose(np.linalg.norm(vectors, axis=1), 1.0)


def test_lbp_is_deterministic_and_empty_safe():
    crop = np.random.default_rng(1).integers(0, 256, (112, 112, 3), dtype=np.uint8)
    embedder = LbpEmbedder()

    first, second = embedder.embed([crop]), embedder.embed([crop])

    np.testing.assert_allclose(first, second)
    assert embedder.embed([]).shape == (0, embedder.dim)

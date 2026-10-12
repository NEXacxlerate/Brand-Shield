"""Deterministic force-directed layout (Fruchterman-Reingold with a fixed seed), so a graph looks the same on every load."""
import numpy as np

WIDTH, HEIGHT = 900, 520
BRAND_POS = (450.0, 55.0)


def force_layout(nodes, edges, width=WIDTH, height=HEIGHT, pad=60, seed=7, iterations=300):
    """Return {node_id: (x, y)} in the width x height box. The brand node is pinned at the top centre."""
    ids = [n["id"] for n in nodes]
    n = len(ids)
    if n == 0:
        return {}
    index = {i: k for k, i in enumerate(ids)}
    rng = np.random.RandomState(seed)
    pos = rng.rand(n, 2) * [width - 2 * pad, height - 2 * pad - 80] + [pad, pad + 80]
    pinned = {index[i]: np.array(BRAND_POS) for i in ids if i == "brand"}
    for k, p in pinned.items():
        pos[k] = p
    if n == 1:
        return {ids[0]: (int(pos[0][0]), int(pos[0][1]))}
    pairs = [(index[e["source"]], index[e["target"]]) for e in edges if e["source"] in index and e["target"] in index]
    area = width * height
    k_opt = 0.8 * np.sqrt(area / n)
    t = width / 8
    for _ in range(iterations):
        delta = pos[:, None, :] - pos[None, :, :]
        dist = np.linalg.norm(delta, axis=2)
        np.fill_diagonal(dist, 1.0)
        dist = np.maximum(dist, 0.01)
        rep = (k_opt ** 2 / dist ** 2)[:, :, None] * delta
        disp = rep.sum(axis=1)
        for a, b in pairs:
            d = pos[a] - pos[b]
            L = max(np.linalg.norm(d), 0.01)
            f = (L / k_opt) * d
            disp[a] -= f
            disp[b] += f
        length = np.maximum(np.linalg.norm(disp, axis=1), 0.01)
        pos += disp / length[:, None] * np.minimum(length, t)[:, None]
        for k, p in pinned.items():
            pos[k] = p
        t = max(t * 0.97, 0.5)
    free = [k for k in range(n) if k not in pinned]
    if free:
        sub = pos[free]
        lo, hi = sub.min(axis=0), sub.max(axis=0)
        span = np.maximum(hi - lo, 1e-6)
        y0 = pad + 80 if pinned else pad
        sub = (sub - lo) / span * [width - 2 * pad, height - pad - y0] + [pad, y0]
        pos[free] = sub
    return {ids[k]: (int(round(pos[k][0])), int(round(pos[k][1]))) for k in range(n)}

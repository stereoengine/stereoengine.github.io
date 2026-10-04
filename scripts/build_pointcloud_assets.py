#!/usr/bin/env python3
"""Build compact, browser-loadable point clouds from the source PLY captures."""

from __future__ import annotations

import base64
import math
import struct
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = ROOT / "static" / "pointclouds"
RAW_DIR = OUTPUT_DIR / "raw"
POINT_LIMIT = 32_000
QUANTIZATION = 16_000

SOURCES = (
    ("realsense", RAW_DIR / "realsense.ply", OUTPUT_DIR / "realsense-lite.js"),
    (
        "foundationstereo",
        RAW_DIR / "zed-foundationstereo.ply",
        OUTPUT_DIR / "zed-foundationstereo-lite.js",
    ),
)

# Each capture uses a different camera pose. These bases align the dominant
# tabletop plane to XZ, so looking down the viewer's Z axis shows the table
# edge-on as a thin horizontal line in both panels.
ALIGNMENTS = {
    "realsense": {
        "center": (0.02933387, 0.14606559, 0.63111663),
        "x": (0.99113408, 0.09063048, 0.09715637),
        "y": (0.13286551, -0.67607428, -0.72475535),
        "z": (0.0, 0.73123846, -0.68212192),
    },
    "foundationstereo": {
        "center": (0.05471681, 0.00103287, 0.61998866),
        "x": (0.99996041, -0.00238426, -0.00857326),
        "y": (-0.00889863, -0.26792524, -0.96339861),
        "z": (0.0, 0.96343676, -0.26793585),
    },
}

TYPE_INFO = {
    "char": ("b", 1),
    "int8": ("b", 1),
    "uchar": ("B", 1),
    "uint8": ("B", 1),
    "short": ("h", 2),
    "int16": ("h", 2),
    "ushort": ("H", 2),
    "uint16": ("H", 2),
    "int": ("i", 4),
    "int32": ("i", 4),
    "uint": ("I", 4),
    "uint32": ("I", 4),
    "float": ("f", 4),
    "float32": ("f", 4),
    "double": ("d", 8),
    "float64": ("d", 8),
}


def percentile(values: list[float], ratio: float) -> float:
    values.sort()
    return values[min(len(values) - 1, max(0, int((len(values) - 1) * ratio)))]


def read_ply(path: Path) -> tuple[list[tuple[float, float, float, int, int, int]], int]:
    with path.open("rb") as handle:
        header_lines: list[str] = []
        while True:
            line = handle.readline()
            if not line:
                raise ValueError(f"{path.name}: missing end_header")
            decoded = line.decode("ascii").strip()
            header_lines.append(decoded)
            if decoded == "end_header":
                break
        payload = handle.read()

    if "format binary_little_endian 1.0" not in header_lines:
        raise ValueError(f"{path.name}: only binary little-endian PLY is supported")

    vertex_count = 0
    in_vertex = False
    stride = 0
    properties: dict[str, tuple[int, str]] = {}
    for line in header_lines:
        parts = line.split()
        if not parts:
            continue
        if parts[0] == "element":
            in_vertex = len(parts) >= 3 and parts[1] == "vertex"
            if in_vertex:
                vertex_count = int(parts[2])
        elif in_vertex and parts[0] == "property":
            if parts[1] == "list":
                raise ValueError(f"{path.name}: vertex lists are not supported")
            format_code, byte_size = TYPE_INFO[parts[1]]
            properties[parts[2]] = (stride, format_code)
            stride += byte_size

    for required in ("x", "y", "z"):
        if required not in properties:
            raise ValueError(f"{path.name}: missing {required} property")
    if len(payload) < vertex_count * stride:
        raise ValueError(f"{path.name}: incomplete vertex payload")

    # Inspect every RealSense point before sampling so removing the dark backdrop
    # does not reduce the density of the useful foreground geometry.
    filter_realsense_backdrop = path.name == "realsense.ply"
    target_count = vertex_count if filter_realsense_backdrop else min(vertex_count, POINT_LIMIT)
    sample_step = vertex_count / target_count
    points: list[tuple[float, float, float, int, int, int]] = []

    def read_property(offset: int, name: str, fallback: int | None = None) -> float | int:
        if name not in properties:
            if fallback is None:
                raise ValueError(f"{path.name}: missing {name} property")
            return fallback
        property_offset, format_code = properties[name]
        return struct.unpack_from("<" + format_code, payload, offset + property_offset)[0]

    for sample in range(target_count):
        vertex = min(vertex_count - 1, int(sample * sample_step))
        offset = vertex * stride
        x = float(read_property(offset, "x"))
        y = float(read_property(offset, "y"))
        z = float(read_property(offset, "z"))
        if not all(math.isfinite(value) for value in (x, y, z)):
            continue
        red = int(read_property(offset, "red", 210))
        green = int(read_property(offset, "green", 225))
        blue = int(read_property(offset, "blue", 255))
        luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722
        if filter_realsense_backdrop:
            inside_workspace = (
                -0.65 <= x <= 0.72
                and -0.35 <= y <= 0.31
                and 0.37 <= z <= 0.82
            )
            if not inside_workspace or (y < 0.0 and luminance < 70):
                continue
        points.append((x, y, z, red, green, blue))

    if len(points) > POINT_LIMIT:
        step = len(points) / POINT_LIMIT
        points = [points[min(len(points) - 1, int(index * step))] for index in range(POINT_LIMIT)]

    return points, vertex_count


def normalize_and_pack(
    cloud_id: str,
    points: list[tuple[float, float, float, int, int, int]],
) -> bytes:
    alignment = ALIGNMENTS[cloud_id]
    center = alignment["center"]
    basis_x = alignment["x"]
    basis_y = alignment["y"]
    basis_z = alignment["z"]
    aligned: list[tuple[float, float, float, int, int, int]] = []
    for x, y, z, red, green, blue in points:
        delta = (x - center[0], y - center[1], z - center[2])
        aligned.append(
            (
                sum(delta[index] * basis_x[index] for index in range(3)),
                sum(delta[index] * basis_y[index] for index in range(3)),
                sum(delta[index] * basis_z[index] for index in range(3)),
                red,
                green,
                blue,
            )
        )

    xs = [point[0] for point in aligned]
    ys = [point[1] for point in aligned]
    zs = [point[2] for point in aligned]
    min_x, max_x = percentile(xs, 0.01), percentile(xs, 0.99)
    min_y, max_y = percentile(ys, 0.01), percentile(ys, 0.99)
    min_z, max_z = percentile(zs, 0.01), percentile(zs, 0.99)
    center_x = (min_x + max_x) * 0.5
    center_y = (min_y + max_y) * 0.5
    center_z = (min_z + max_z) * 0.5
    scale = 1.72 / max(max_x - min_x, max_y - min_y, max_z - min_z, 0.0001)

    packed = bytearray(len(aligned) * 9)
    for index, (x, y, z, red, green, blue) in enumerate(aligned):
        normalized = (
            (x - center_x) * scale,
            (y - center_y) * scale,
            (z - center_z) * scale,
        )
        quantized = [
            round(max(-2.0, min(2.0, value)) * QUANTIZATION)
            for value in normalized
        ]
        struct.pack_into(
            "<hhhBBB",
            packed,
            index * 9,
            quantized[0],
            quantized[1],
            quantized[2],
            red,
            green,
            blue,
        )
    return bytes(packed)


def write_asset(
    cloud_id: str,
    source: Path,
    output: Path,
    packed: bytes,
    source_count: int,
) -> None:
    encoded = base64.b64encode(packed).decode("ascii")
    chunks = [encoded[index : index + 120] for index in range(0, len(encoded), 120)]
    data_lines = " +\n".join(f'    "{chunk}"' for chunk in chunks)
    contents = f"""// Generated from {source.name} by scripts/build_pointcloud_assets.py.
(function() {{
  window.CRAFT_POINT_CLOUDS = window.CRAFT_POINT_CLOUDS || {{}};
  window.CRAFT_POINT_CLOUDS[\"{cloud_id}\"] = {{
    count: {len(packed) // 9},
    sourceCount: {source_count},
    quantization: {QUANTIZATION},
    stride: 9,
    data:
{data_lines}
  }};
}})();
"""
    output.write_text(contents, encoding="utf-8")


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for cloud_id, source, output in SOURCES:
        points, source_count = read_ply(source)
        packed = normalize_and_pack(cloud_id, points)
        write_asset(cloud_id, source, output, packed, source_count)
        print(f"{source.name}: {source_count:,} -> {len(points):,} points ({output.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()

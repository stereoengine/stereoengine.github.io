# Stress Testing Video Generation — Where to Put Videos

Place your stress-testing videos in these folders so the website loads them correctly.

## Folder structure

```
static/videos/stress_testing/
├── beyond_franka/          # Generation Beyond Franka (3 videos)
│   ├── example1.mp4
│   ├── example2.mp4
│   └── example3.mp4
├── object_distractor/      # Object Distractor (1 video)
│   └── example.mp4
└── different_reference/    # Different Reference Image (1 video)
    └── example.mp4
```

## Paths used in index.html

| Section | Path | File(s) |
|--------|------|--------|
| **Generation Beyond Franka** | `./static/videos/stress_testing/beyond_franka/` | `example1.mp4`, `example2.mp4`, `example3.mp4` |
| **Object Distractor** | `./static/videos/stress_testing/object_distractor/` | `example.mp4` |
| **Different Reference Image** | `./static/videos/stress_testing/different_reference/` | `example.mp4` |

You can rename the files; if you do, update the corresponding `<source src="...">` in `index.html` for that section.

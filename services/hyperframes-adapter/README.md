# Cap sut × HyperFrames Bridge

This bridge keeps Cap sut's canonical project JSON authoritative while allowing HyperFrames-style HTML compositions to be generated for motion graphics and AI-authored scenes.

## Boundary

- Cap sut Core remains the canonical timeline/project model.
- Cap sut Render/API remains the authoritative MP4 export path for normal media edits.
- HyperFrames is an optional composition backend for HTML/CSS/GSAP scenes, captions, charts, overlays, and agent-authored motion.
- Do not copy HyperFrames Studio wholesale into Cap sut. Integrate stable contracts and keep the Apache-2.0 notices for any reused source.

HyperFrames provides an HTML-to-video stack with Core, Engine, Producer, Studio, Player, SDK, and cloud adapters. Its renderer uses a seekable browser runtime plus FFmpeg. citeturn0search1

## Planned flow

```
Cap sut Project
    |
    +--> normal media clips --> Cap sut Renderer --> MP4
    |
    +--> composition clips --> HyperFrames Adapter --> HTML composition
                                              |
                                              v
                                      HyperFrames Engine
                                              |
                                              v
                                             MP4
```

## Why this split

It prevents the two timeline models from becoming competing sources of truth. HyperFrames is particularly strong for deterministic HTML/CSS/animation rendering and agent-authored compositions, while Cap sut owns the product-level editable project and API contract. HyperFrames documents the same HTML → preview → MP4 workflow. citeturn0search3

## License

The user's HyperFrames fork is Apache-2.0. Any directly reused HyperFrames source must retain its applicable license and notices.

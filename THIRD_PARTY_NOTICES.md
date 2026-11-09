# Third-party notices

The standalone SwarmBuild runtime in `runtime-src/` and
`skills/site-effects-demo-craft/assets/runtime/swarm-build.js` is extracted from
swarm-build-canvas's MIT engine modules. It ports swarm-build by Ha Nguyen:
https://github.com/habom2310/swarm-build.

The extraction preserves the upstream and local contributors' MIT notices below.
The runtime includes its WebGL2 metal cursors, trails, labels, drag boxes, ripples,
band reveals, text carets, page scheduling, palette extraction, and image mode.

The Canvas UI-derived `reveal/html-in-canvas.ts` helper and LiquidObject component
are excluded entirely. The experimental HTML capture, mirror, dissolve, fly-in,
and lift paths, including their renderer shaders and public options, are also
excluded. No Canvas UI source is distributed in this package. This extraction
uses the source repository's license headers and THIRD_PARTY_NOTICES.md to
identify the licensing boundary; it does not relicense excluded components.

## MIT license for the included runtime

```text
MIT License

Copyright (c) 2026 Ha Nguyen
Copyright (c) 2026 swarm-build-canvas contributors
Copyright (c) 2026 53able

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

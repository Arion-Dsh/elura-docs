# Elura Documentation

The English and Simplified Chinese documentation website for Elura, built with
VitePress and deployed with GitHub Pages. English pages live under `docs/` and
their Chinese counterparts live under `docs/zh/`.

## Local development

```bash
npm install
npm run docs:dev
```

VitePress prints the local preview URL, normally <http://localhost:5173>.

## Build and preview

```bash
npm run docs:build
npm run docs:preview
```

GitHub Actions deploys every push to `main`. In the repository settings, set
**Pages → Build and deployment → Source** to **GitHub Actions**.

The documentation is published at:

<https://elura.rustyspottedcat.dev/>

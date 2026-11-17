# Cap sut deployment

The web application is built from `apps/web` by the GitHub Actions workflow `.github/workflows/pages.yml`.

The workflow runs `npm run check` and `npm run build`, uploads `apps/web/dist`, and publishes it to GitHub Pages on every push to `main`.

Expected public URL: https://safwt771754091s-crypto.github.io/cap-sut-/

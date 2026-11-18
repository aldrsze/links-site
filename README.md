# links site

Adds one entry to [aldrsze/links](https://github.com/aldrsze/links) without touching git.

Paste a link -> the page is fetched server side -> Groq writes the description and picks the section -> you review the diff -> the worker opens a pull request.

## Run locally

```
npx wrangler pages dev public
```

Secrets go in `.dev.vars`, same names as below. The file is not tracked.

## Files

- `public/index.html` markup
- `public/style.css` theme, light and dark
- `public/app.js` form logic and api calls
- `public/favicon.svg` link glyph
- `functions/api/preview.js` reads the readme, builds the diff
- `functions/api/pr.js` creates the branch, commit, pull request
- `functions/_lib/links.js` url normalization, page metadata
- `functions/_lib/groq.js` prompts and the groq call
- `functions/_lib/readme.js` markdown parsing, plan, diff
- `functions/_lib/github.js` config, auth, github api

## Endpoints

`POST /api/preview`, body `{ url, manual?, description?, section?, retry?, retrySection? }`

- url only: fetch the page, ask groq for a line and a section
- `retry: true`: ask again for the description at a higher temperature
- `retrySection: true` plus a description: ask for the section only
- description plus section: no ai, just rebuild the diff

Returns `link`, `description`, `section`, `sections`, `ambiguous`, `bullet`, `diff`, `duplicates`, `blocked`.

`POST /api/pr`, body `{ url, description, section }`, returns `{ url, number }`. It reads the file fresh, refuses a duplicate in the same section with 409, then pushes a branch and opens the pull request.

## Sections

The model picks an existing section when one clearly fits. Otherwise it invents a name of one to three words. A duplicate in the same section blocks the pull request; a duplicate in another section is allowed.

## Rate limits

A 429 from Groq becomes `Rate limit reached, try again in Ns`, read from `retry-after` or `x-ratelimit-reset`. Nothing is retried automatically.

## Deploy

Cloudflare Pages, build command empty, output directory `public`.

Secrets:
- `GROQ_API_KEY`
- `GITHUB_TOKEN` fine-grained, `aldrsze/links` only, Contents RW + Pull requests RW
- `SITE_PASSWORD` optional, the page sends it as `x-password`

Plain variables: `REPO` (`aldrsze/links`), `BRANCH` (`main`), `FILE` (`README.md`), `GROQ_MODEL` (`openai/gpt-oss-120b`).

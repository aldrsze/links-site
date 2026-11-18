# trove

Paste a link, review the draft line, and open a pull request against [`aldrsze/links`](https://github.com/aldrsze/links). No git needed.

## How it works

1. Paste a URL. The server fetches the page.
2. Groq writes a one-line description and picks a section.
3. You check the diff and edit if needed.
4. The worker opens the pull request.

## Run locally

```sh
npx wrangler pages dev public
```

Put secrets in an untracked `.dev.vars` file.

## Layout

```
public/              static front end
functions/api/       preview and pr endpoints
functions/_lib/      url handling, prompts, readme parsing, diff, github auth
```

## API

| Endpoint | Does |
| --- | --- |
| `POST /api/preview` | Drafts a description and section for a URL. Also regenerates either one, or rebuilds the diff from your edits without calling the model. |
| `POST /api/pr` | Rechecks the file, rejects duplicates in the same section (409), then creates the branch and pull request. |

## Notes

- The model reuses an existing section when one fits, otherwise it proposes a new one (one to three words).
- A link may appear in several sections, but not twice in the same one.
- Groq rate limits (429) are shown with a wait time. Nothing retries automatically.

## Deploy

Cloudflare Pages, output directory `public`.

| Setting | |
| --- | --- |
| `GROQ_API_KEY` | secret, required |
| `GITHUB_TOKEN` | secret, required |
| `SITE_PASSWORD` | secret, optional |

Repo, branch, file and model are set with variables. Check `functions/` for their names.
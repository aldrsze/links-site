# links site

- [github.com](https://github.com) — code hosting platform for collaborative development projects
Paste a link -> page fetched server side -> Groq writes the description and picks the section -> review -> pull request on aldrsze/links.

Cloudflare Pages: build command empty, output directory `public`.

Secrets (Pages > Settings > Variables and Secrets, type "Secret"):
- GROQ_API_KEY
- GITHUB_TOKEN  (fine-grained, only aldrsze/links, Contents RW + Pull requests RW)
- SITE_PASSWORD (optional, stops strangers using your quota)

Optional plain variables: REPO, BRANCH, FILE, GROQ_MODEL

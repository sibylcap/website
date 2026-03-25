# Deployment Guide: Static Sites on Vercel

Step-by-step process for deploying a webpage with staging previews and production deploys. Written for a Claude instance operating on this server.

---

## Prerequisites

These tools must be installed and authenticated. On this server they already are.

### 1. Git

```bash
git --version
# Should return a version. If not: sudo apt install git
```

### 2. GitHub CLI (gh)

```bash
# Install
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
sudo apt update && sudo apt install gh

# Authenticate
gh auth login
# Select: GitHub.com > HTTPS > Login with a web browser
# Follow the device code flow

# Verify
gh auth status
```

### 3. Vercel CLI

```bash
# Install globally
npm i -g vercel

# Authenticate
vercel login
# Follow the email/browser auth flow

# Verify
vercel whoami
```

---

## One-Time Setup: Link a Project to Vercel

Every site directory needs to be linked to a Vercel project once. After that, the `.vercel/project.json` file persists and you never need to do this again.

```bash
cd /path/to/your-site-directory

# Link to existing Vercel project (or create new one)
vercel link
# It will ask:
#   - Set up project? Y
#   - Which scope? (select your team)
#   - Link to existing project? Y (if it already exists on Vercel)
#   - Or: create new? provide a name
```

This creates `.vercel/project.json`:
```json
{
  "projectId": "prj_xxxx",
  "orgId": "team_xxxx",
  "projectName": "your-project"
}
```

**Add `.vercel` to `.gitignore`** if you don't want it committed (it contains no secrets, just project IDs, so committing it is fine too).

### Current projects on this server

| Site | Directory | Vercel Project | Production URL |
|------|-----------|---------------|----------------|
| Ping | `ping-app/` | `agentmail` | ping.sibylcap.com |
| Website | `website/` | `website` | sibylcap.com |

---

## One-Time Setup: Git Remote

If the repo has no remote configured (check with `git remote -v`):

```bash
# Create a GitHub repo (if it doesn't exist)
gh repo create your-org/your-repo --private --source=. --push

# Or add an existing remote
git remote add origin git@github.com:your-org/your-repo.git

# Push initial code
git push -u origin main
```

If you want Vercel to auto-deploy on git push (instead of CLI deploys), connect the GitHub repo to the Vercel project in the Vercel dashboard. Otherwise, CLI deploys work fine standalone.

---

## The Deployment Process

### Step 1: Make your changes

Edit files. Test locally if possible. Validate syntax:

```bash
# CSS brace check
python3 -c "css=open('style.css').read(); print(f'{{ {css.count(chr(123))} }} {css.count(chr(125))} match={css.count(chr(123))==css.count(chr(125))}')"

# JS syntax check
node -c app.js

# HTML: just open in browser or use a validator
```

### Step 2: Deploy to staging (preview)

This is the critical step most people skip. **Always preview before production.**

```bash
cd /path/to/your-site-directory

# Deploy a preview (NOT production)
npx vercel
```

That's it. No flags. `vercel` without `--prod` creates a preview deployment.

It returns a unique URL like:
```
https://agentmail-abc123-sibylcaps-projects.vercel.app
```

**Open that URL.** Test it. Check mobile. Check desktop. Click through every page. This is your staging environment. It is live on the internet but not connected to your production domain.

### Step 3: Test the preview

Check the preview URL on:
- Desktop browser
- Mobile browser (send URL to your phone, or use browser devtools device emulation)
- Different pages/routes if applicable

If something is broken, fix it locally and run `npx vercel` again. Each run creates a new preview URL. Old previews stay alive for a while but don't matter.

### Step 4: Promote to production

Only after the preview looks good:

```bash
# Option A: Deploy fresh to production
npx vercel --prod

# Option B: Promote an existing preview to production (faster, exact same build)
npx vercel promote <preview-url>
# Example: npx vercel promote https://agentmail-abc123-sibylcaps-projects.vercel.app
```

Option B is better because it guarantees production is identical to what you tested. Option A rebuilds from your local files (should be the same, but Option B removes the variable).

The output will show your production alias:
```
Aliased: https://ping.sibylcap.com
```

### Step 5: Commit and record

After confirming production is live and working:

```bash
# Stage the changed files (be specific, don't use git add .)
git add ping-app/style.css ping-app/app.js ping-app/index.html

# Commit with a descriptive message
git commit -m "$(cat <<'EOF'
Description of what changed and why

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"

# Push to remote (if configured)
git push origin main
```

---

## Quick Reference: Command Cheat Sheet

| Action | Command |
|--------|---------|
| Preview deploy (staging) | `npx vercel` |
| Production deploy | `npx vercel --prod` |
| Promote preview to prod | `npx vercel promote <url>` |
| Check deploy logs | `npx vercel inspect <url> --logs` |
| Redeploy same build | `npx vercel redeploy <url>` |
| List recent deploys | `npx vercel ls` |
| Roll back production | `npx vercel rollback` |
| Check project info | `npx vercel inspect` |
| Remove a deployment | `npx vercel remove <url>` |

---

## The Correct Order (Summary)

```
1. Edit files locally
2. Validate syntax (node -c, brace count, etc.)
3. npx vercel              <-- staging preview
4. Test the preview URL
5. npx vercel --prod       <-- production (or promote the preview)
6. Verify production URL
7. git add + git commit    <-- record the change
8. git push                <-- push to remote
```

**Never go straight to `--prod`.** The preview step costs nothing and catches everything.

---

## Troubleshooting

### "No remote configured"
```bash
git remote -v              # empty means no remote
git remote add origin <url>
```

### Vercel auth expired
```bash
vercel login               # re-authenticate
```

### Wrong Vercel project
```bash
cat .vercel/project.json   # check projectName
vercel link                # re-link to correct project
```

### Deploy shows old files
Vercel caches aggressively. Check the deployment URL (not production URL) to confirm the build is fresh. If production still shows old content:
```bash
npx vercel --prod --force  # force rebuild
```

### Multiple sites in one repo
Each site directory has its own `.vercel/project.json`. Always `cd` into the correct directory before running `vercel`:
```bash
cd ping-app && npx vercel --prod    # deploys ping
cd website && npx vercel --prod     # deploys website
```
These are completely independent Vercel projects that happen to live in the same git repo.

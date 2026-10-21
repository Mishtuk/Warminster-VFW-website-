# Hosting on Azure App Service

The site runs as one Node app (`node server.js`) on Azure App Service for Linux. GitHub deploys it on every push to `main`
(`.github/workflows/azure.yml`), signing in with OpenID Connect, so GitHub holds no Azure password or key.

## What it costs
- **F1 (Free):** $0. Fine for a private preview: the app sleeps after about 20 idle minutes and has a daily CPU limit, and a custom web address can't have HTTPS.
- **B1 (Basic), for launch:** $0.017 an hour, about $12.41 a month in East US (Azure retail price list, October 2026). Always on, HTTPS on the post's own address.
- Moving from F1 to B1 is one setting (Scale up) and keeps everything.

## One-time setup (Azure CLI, signed in with `az login`)
Names used here: resource group `rg-vfw6493`, plan `plan-vfw6493`, app `vfw6493-warminster` (the app name must be unique across Azure).
1. `az group create -n rg-vfw6493 -l eastus`
2. `az appservice plan create -g rg-vfw6493 -n plan-vfw6493 --is-linux --sku F1` (B1 at launch)
3. `az webapp create -g rg-vfw6493 -p plan-vfw6493 -n vfw6493-warminster --runtime "NODE:22-lts"` (check `az webapp list-runtimes --os linux`; Node must be 22.13 or newer)
4. Settings:
   - `az webapp config set -g rg-vfw6493 -n vfw6493-warminster --startup-file "node server.js"`
   - `az webapp update -g rg-vfw6493 -n vfw6493-warminster --https-only true`
   - `az webapp config appsettings set -g rg-vfw6493 -n vfw6493-warminster --settings NODE_ENV=production SCM_DO_BUILD_DURING_DEPLOYMENT=false PUBLIC_URL=https://vfw6493-warminster.azurewebsites.net SITE=https://vfw6493-warminster.azurewebsites.net`
   - Never set `WEBSITE_RUN_FROM_PACKAGE`: staff edits rebuild the site in place (docs/backups.md).
5. GitHub sign-in without a password: an app registration with a federated credential for this repo's `main` branch, allowed to deploy to this one web app only:
   - `az ad app create --display-name vfw6493-github-deploy`, then `az ad sp create --id <appId>`
   - `az ad app federated-credential create --id <appId> --parameters '{"name":"main","issuer":"https://token.actions.githubusercontent.com","subject":"repo:Mishtuk/Warminster-VFW-website-:ref:refs/heads/main","audiences":["api://AzureADTokenExchange"]}'`
   - `az role assignment create --assignee <appId> --role "Website Contributor" --scope <the web app's resource id>`
6. GitHub repository variables (not secrets; they are IDs): `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `AZURE_WEBAPP_NAME`, `SITE_URL`, and `NODE_VERSION` if it isn't 22. Setting `AZURE_WEBAPP_NAME` switches the deploy on.

## Secrets the server makes for itself
- **Session key:** with no `SESSION_SECRET` set, production makes a random one on first start and keeps it in `/home/data/session-secret`.
- **Admin password:** with no `ADMIN_PASSWORD` set, the first start creates the `admin` account with a random password and prints it once in the log stream (App Service > Log stream). Sign in and change it in Admin > Account.

## Before the public launch
- Scale to B1, add the post's web address and its free certificate.
- Mail: set `POST_EMAIL` and `SMTP_URL` as app settings (until then, inquiries are saved and the emails are written to `/home/data/outbox`).
- Cloudflare Access in front of `/admin` and `/api/admin/*`, the nightly backup WebJob, the Blob copy and the down-alert (docs/backups.md).
- Check after the first deploy: the home page loads, sign-in works, and a Post details change shows on the hall page after "Done".

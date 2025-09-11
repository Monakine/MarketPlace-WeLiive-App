import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();


const app = express();
const port = process.env.PORT || 8080;

function html(title, body) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"/>
<title>${title}</title>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
body { font-family: system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Helvetica,Arial,sans-serif; max-width: 860px; margin: 4rem auto; padding: 0 1rem; line-height: 1.5 }
code { background: #f4f4f4; padding: .15rem .35rem; border-radius: .25rem }
</style>
</head><body>
${body}
</body></html>`;
}

async function getPublisherToken() {
  const { TENANT_ID, CLIENT_ID, CLIENT_SECRET } = process.env;
  if (!TENANT_ID || !CLIENT_ID || !CLIENT_SECRET) {
    throw new Error("Variables d'environnement manquantes (TENANT_ID, CLIENT_ID, CLIENT_SECRET)");
  }

  // Try v1.0 with resource
  try {
    const urlV1 = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/token`;
    const paramsV1 = new URLSearchParams();
    paramsV1.append("client_id", CLIENT_ID);
    paramsV1.append("client_secret", CLIENT_SECRET);
    paramsV1.append("grant_type", "client_credentials");
    paramsV1.append("resource", "https://marketplaceapi.microsoft.com");

    const resV1 = await fetch(urlV1, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: paramsV1
    });

    if (resV1.ok) {
      console.log("Token obtenu via endpoint v1.0");
      return (await resV1.json()).access_token;
    } else {
      console.warn(`Échec v1.0 (${resV1.status}) - ${await resV1.text()}`);
    }
  } catch (err) {
    console.warn(`Exception v1.0 : ${err.message}`);
  }

  // Try v2.0 with scope
  const urlV2 = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;
  const paramsV2 = new URLSearchParams();
  paramsV2.append("client_id", CLIENT_ID);
  paramsV2.append("client_secret", CLIENT_SECRET);
  paramsV2.append("grant_type", "client_credentials");
  paramsV2.append("scope", "https://marketplaceapi.microsoft.com/.default");

  const resV2 = await fetch(urlV2, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: paramsV2
  });

  if (!resV2.ok) throw new Error(`Échec génération token éditeur (${resV2.status}) - ${await resV2.text()}`);
  console.log("Token obtenu via endpoint v2.0");
  return (await resV2.json()).access_token;
}

// --- Fonction qui teste plusieurs versions d'une API ---
async function tryVersions(fn, versions = ['2018-08-31', '2023-01-01']) {
  let lastErr = null;
  for (const v of versions) {
    try {
      const result = await fn(v);
      return { version: v, result };
    } catch (err) {
      console.warn(`Échec avec api-version=${v} : ${err.message}`);
      lastErr = err;
    }
  }
  throw lastErr;
}

async function resolveSubscription(publisherBearer, purchaseToken) {
  return tryVersions(async (version) => {
    const url = `https://marketplaceapi.microsoft.com/api/saas/subscriptions/resolve?api-version=${version}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${publisherBearer}`,
        'x-ms-marketplace-token': decodeURIComponent(purchaseToken)
      }
    });
    if (!res.ok) throw new Error(`Échec Resolve (${res.status}) - ${await res.text()}`);
    return res.json();
  });
}

async function activateSubscription(publisherBearer, subscriptionId, planId, quantity) {
  return tryVersions(async (version) => {
    const url = `https://marketplaceapi.microsoft.com/api/saas/subscriptions/${subscriptionId}/activate?api-version=${version}`;
    const payload = { planId, quantity };
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${publisherBearer}`
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(`Échec Activate (${res.status}) - ${await res.text()}`);
    return { version, result: await res.json() };
  });
}

// --- Routes ---
app.get('/', (req, res) => {
  res.status(200).send(html('Trackplan – Landing', `
    <h1>Trackplan – Landing</h1>
    <p>Utilisez le lien <em>Configurer le compte</em> depuis Microsoft pour activer votre abonnement (route <code>/activate</code>).</p>
  `));
});

app.get('/activate', async (req, res) => {
  const token = req.query.token;
  if (!token) return res.status(400).send(html('Token manquant', `
    <h1>Activation en attente</h1>
    <p>Le paramètre <code>token</code> est manquant. Rouvrez l’abonnement depuis le portail Microsoft et cliquez sur <strong>Configurer le compte</strong>.</p>
  `));

  try {
    const bearer = await getPublisherToken();
    const resolvedData = await resolveSubscription(bearer, token);
    console.log(`Resolve réussi avec api-version=${resolvedData.version}`);
    const subscriptionId = resolvedData.result?.id;
    const planId = process.env.OFFER_DEFAULT_PLAN || resolvedData.result?.planId || 'standard';
    const quantity = parseInt(process.env.DEFAULT_QUANTITY || '1', 10);

    const activateData = await activateSubscription(bearer, subscriptionId, planId, quantity);
    console.log(`Activate réussi avec api-version=${activateData.version}`);

    res.status(200).send(html('Activation réussie', `
      <h1>Activation réussie</h1>
      <p>Merci pour votre achat. Votre abonnement (ID: <code>${subscriptionId}</code>) est maintenant activé.</p>
      <p>Versions utilisées : Resolve = <code>${resolvedData.version}</code>, Activate = <code>${activateData.version}</code></p>
      <p><a href="https://make.powerapps.com/" target="_blank" rel="noopener">Accéder à l’application Power Apps</a></p>
    `));
  } catch (err) {
    console.error(err);
    res.status(500).send(html('Activation en attente', `
      <h1>Activation en attente</h1>
      <p>Nous n’avons pas pu finaliser l’activation automatiquement.</p>
      <p>Détails : ${err.message}</p>
      <p>Réessayez depuis Microsoft (« Configurer le compte ») ou contactez le support.</p>
    `));
  }
});

app.listen(port, () => console.log(`Landing en écoute sur port ${port}`));

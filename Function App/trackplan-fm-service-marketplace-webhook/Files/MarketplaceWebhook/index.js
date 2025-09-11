import fetch from 'node-fetch';
import { ClientSecretCredential } from "@azure/identity";

const MARKETPLACE_SCOPE = 'https://marketplaceapi.microsoft.com/.default';

const {
  GRAPH_CLIENT_ID,
  GRAPH_TENANT_ID,
  GRAPH_CLIENT_SECRET,
  GRAPH_SENDER_EMAIL,
  TENANT_ID,
  CLIENT_ID,
  CLIENT_SECRET,
  DATAVERSE_TENANT_ID,
  DATAVERSE_CLIENT_ID,
  DATAVERSE_CLIENT_SECRET,
  DATAVERSE_URL
} = process.env;

const dataverseMapping = {
  crffa_eventtype: "action",
  crffa_subscriptionid: "subscriptionId",
  crffa_planid: "planId",
  crffa_quantity: "quantity",
  crffa_status: "status",
  crffa_timestamp: "timeStamp",
  crffa_beneficiary_tenantid: "beneficiary.tenantId",
  crffa_beneficiary_email: "beneficiary.email",
  crffa_purchaser_email: "purchaser.email",
  crffa_purchaser_tenantid: "purchaser.tenantId",
  crffa_offerid: "offerId",
  crffa_allowedcustomeroperations: "allowedCustomerOperations",
  crffa_term_startdate: "term.startDate",
  crffa_term_enddate: "term.endDate",
  crffa_term_autorenew: "term.autoRenew",
  crffa_isfreetrial: "isFreeTrial",
  crffa_istest: "isTest",
  crffa_saassubscriptionstatus: "saasSubscriptionStatus",
  crffa_operationid: "id",
  crffa_activityid: "activityId",
  crffa_operationrequestsource: "operationRequestSource",
  crffa_subscription_name: "subscription.name",
  crffa_subscription_created: "subscription.created",
  crffa_subscription_lastmodified: "subscription.lastModified",
  crffa_subscription_sessionmode: "subscription.sessionMode",
  crffa_subscription_sandboxtype: "subscription.sandboxType",
  crffa_subscription_termunit: "subscription.term.termUnit",
  crffa_subscription_chargeduration: "subscription.term.chargeDuration",
  crffa_beneficiary_objectid: "beneficiary.objectId",
  crffa_beneficiary_puid: "beneficiary.puid",
  crffa_purchaser_objectid: "purchaser.objectId",
  crffa_purchaser_puid: "purchaser.puid",
  crffa_purchasetoken: "purchaseToken"
};

export async function run(context, req) {
  try {
    const payload = req.body || {};
    const { action, subscriptionId, id: operationId } = payload;

    const credential = new ClientSecretCredential(
      GRAPH_TENANT_ID,
      GRAPH_CLIENT_ID,
      GRAPH_CLIENT_SECRET
    );

    const token = await credential.getToken("https://graph.microsoft.com/.default");

    const message = {
      message: {
        subject: `📬 Événement Marketplace reçu : ${action}`,
        body: {
          contentType: "Text",
          content: `Détails de l'événement :\n\n${JSON.stringify(payload, null, 2)}`
        },
        toRecipients: [
          {
            emailAddress: {
              address: "contact@weliive.com"
            }
          }
        ]
      },
      saveToSentItems: "false"
    };

    const response = await fetch(`https://graph.microsoft.com/v1.0/users/${GRAPH_SENDER_EMAIL}/sendMail`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(message)
    });

    if (response.ok) {
      context.log("Email envoyé avec succès !");
      try {
        context.log("📥 Appel à insertIntoDataverse()...");
        await insertIntoDataverse(payload, context);
        context.log("✅ insertIntoDataverse() terminé !");
      } catch (err) {
        context.log.error("❌ Erreur dans insertIntoDataverse :", err.message);
      }


    } else {
      const error = await response.text();
      context.log.error("Erreur lors de l'envoi de l'email :", error);
    }

    if (['ChangePlan', 'ChangeQuantity', 'Reinstate'].includes(action)) {
      const bearer = await getPublisherToken();
      await getOperationStatus(bearer, subscriptionId, operationId);
      await patchOperation(bearer, subscriptionId, operationId, 'Success');
    }

    context.res = { status: 200, body: 'ACK' };
  } catch (e) {
    context.log('Webhook error:', e.message);
    context.res = { status: 200, body: 'ACK' };
  }
}

async function getPublisherToken() {
  const url = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope: MARKETPLACE_SCOPE,
    grant_type: 'client_credentials'
  });
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  if (!res.ok) throw new Error(`Token error ${res.status}`);
  const data = await res.json();
  return data.access_token;
}

async function getOperationStatus(bearer, subscriptionId, operationId) {
  const url = `https://marketplaceapi.microsoft.com/api/saas/subscriptions/${subscriptionId}/operations/${operationId}?api-version=2018-08-31`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${bearer}` } });
  if (!res.ok) throw new Error(`Get operation error ${res.status}`);
  return res.json();
}

async function patchOperation(bearer, subscriptionId, operationId, status) {
  const url = `https://marketplaceapi.microsoft.com/api/saas/subscriptions/${subscriptionId}/operations/${operationId}?api-version=2018-08-31`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      authorization: `Bearer ${bearer}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ status })
  });
  if (!res.ok) throw new Error(`Patch operation error ${res.status}`);
  return res.text();
}

async function insertIntoDataverse(event, context) {
  context.log("🚀 Entrée dans insertIntoDataverse()");

  context.log("🔧 ENV DATAVERSE_URL =", DATAVERSE_URL);
  context.log("🔧 ENV DATAVERSE_CLIENT_ID =", DATAVERSE_CLIENT_ID);
  context.log("🔧 ENV DATAVERSE_CLIENT_SECRET =", DATAVERSE_CLIENT_SECRET);

  const tokenRes = await fetch(`https://login.microsoftonline.com/${DATAVERSE_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: DATAVERSE_CLIENT_ID,
      client_secret: DATAVERSE_CLIENT_SECRET,
      scope: `${DATAVERSE_URL}/.default`,
      grant_type: 'client_credentials'
    })
  });

  context.log("🔐 Statut HTTP token Dataverse :", tokenRes.status);

  const tokenText = await tokenRes.text();
  context.log("🔐 Réponse brute du token Dataverse :", tokenText);

  if (!tokenText) throw new Error("Réponse vide lors de l'authentification Dataverse");

  let tokenData;
  try {
    tokenData = JSON.parse(tokenText);
  } catch (e) {
    throw new Error(`Erreur de parsing du token JSON : ${e.message}\nRéponse brute : ${tokenText}`);
  }

  const accessToken = tokenData.access_token;

  const payload = {};

  for (const [dataverseKey, eventPath] of Object.entries(dataverseMapping)) {
    const value = eventPath.split('.').reduce((obj, key) => obj?.[key], event);
    if (value !== undefined) {
      payload[dataverseKey] = value;
    }
  }

  // 👉 Ajout manuel de la durée d’abonnement
  payload.crffa_subscription_chargeduration = event?.subscription?.chargeDuration || "Durée inconnue";

  const purchaserEmail = event?.purchaser?.email || "email inconnu";
  const subscriptionName = event?.subscription?.name || "nom inconnu";
  payload.crffa_nomdelevenement = `${purchaserEmail} - ${subscriptionName}`;

  if (Array.isArray(payload.crffa_allowedcustomeroperations)) {
    payload.crffa_allowedcustomeroperations = payload.crffa_allowedcustomeroperations.join(', ');
  }

  context.log("📦 Payload envoyé à Dataverse :", JSON.stringify(payload, null, 2));

  const res = await fetch(`${DATAVERSE_URL}/api/data/v9.2/crffa_weliive_marketplaceeventses`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0',
      'Accept': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  context.log("📡 Statut HTTP Dataverse :", res.status);

  const responseText = await res.text();
  context.log("📨 Réponse Dataverse :", responseText);

  if (res.status === 204) {
    context.log("✅ Enregistrement Dataverse créé sans contenu retourné.");
    return { success: true };
  }

  let responseJson;
  try {
    responseJson = JSON.parse(responseText);
  } catch (e) {
    throw new Error(`Erreur de parsing JSON Dataverse : ${e.message}\nRéponse brute : ${responseText}`);
  }

  return responseJson;
}

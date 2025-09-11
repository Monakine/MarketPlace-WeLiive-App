# Marketplace App – WeLiive Activation Flow

## 🧩 Context

This repository contains the source code and configuration files related to the activation flow of the **WeLiive** app purchased via Microsoft Marketplace.

After a user completes the purchase, they are redirected to a landing page with a token for account setup. However, the page currently returns an error and fails to complete the activation.

## ❗ Issue Description

The landing page throws an authentication error when accessed with the token:

> `AADSTS500011: The resource principal named https://marketplaceapi.microsoft.com was not found in the tenant named WeLiive.`

This may be related to Azure AD configuration, token validation, or resource registration.

### 🔗 Reproduction Links

- 1. [AppSource Offer Page](https://appsource.microsoft.com/fr-fr/marketplace/checkout/weliive1608646678514.trackplan_dimomaintfm_cmms_demand_app-private-test?tab=Overview)
  
  <img width="1188" height="869" alt="image" src="https://github.com/user-attachments/assets/0d319867-cb31-4102-ac3e-f18ea02ab517" />

- 2. Microsoft login popup

- 3. [Landing Page with Token](https://trackplan-fm-service-app-landing.azurewebsites.net/activate?token=MGViMDk4NjEtMzBhYy00YmU4LWM4YWQtNzU4YjQzOTRlMzRkLDE3NTc2ODQxMzY0OTAs...)

  <img width="878" height="344" alt="image" src="https://github.com/user-attachments/assets/268dcd36-d017-447c-b8ec-e96189955ea7" />


## 🛠️ Components

- **Landing Page**  
  Hosted on Azure App Service (`trackplan-fm-service-app-landing`). Handles token parsing and user onboarding.

- **Webhook Function**  
  Azure Function App (`trackplan-fm-service-marketplace-webhook`) connected to Application Insights. Captures telemetry and activation events.

- **Azure Resource Group**  
  Created manually via Azure Portal. Contains the App Service, Function App, and supporting resources.

## 📁 Repository Structure

/App Services/ 
  └─ /trackplan-fm-service-app-landing/ 
    └─ /Files/ 
      ├─ package.json 
      └─ server.js

/Function App/ 
  └─ /trackplan-fm-service-marketplace-webhook/  
    └─ /Files/ 
      ├─ package.json 
      └─ /MarketplaceWebhook/ 
        └─ index.js

## 📬 Notes

This repository is private and shared with Microsoft engineers for debugging purposes.  
Feel free to open issues or suggest changes directly.

import { Logger } from '@azure/functions';
import envUtil from '../utils/envUtil';
import fetch from 'node-fetch';

const getAccessToken = async (log: Logger) => {
    const operationId = '[crmUtil] [getAccessToken]';
    log(operationId, 'getAccessToken started...');
    
    let tenantId = envUtil.AZURE_TENANT_ID();
    let clientId = process.env.AZURE_CLIENT_ID || "";
    let clientSecret = process.env.AZURE_CLIENT_SECRET || "";
    let crmUrl = process.env.CRM_URL || "";

    const tokenResponse = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "client_credentials",
        scope: `${crmUrl}/.default`
      })
    });

    const tokenData = await tokenResponse.json();
    if (!tokenData.access_token) {
      throw new Error(`Token error: ${JSON.stringify(tokenData)}`);
    }

    const accessToken = tokenData.access_token;
    return accessToken;
  };
  
  export default {
    getAccessToken,
  };
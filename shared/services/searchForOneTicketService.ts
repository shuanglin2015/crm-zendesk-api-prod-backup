import { Logger } from '@azure/functions';
import fetchUtil from '../utils/fetchUtil';
import envUtil from '../utils/envUtil';
import util from '../utils/util';
import getJsonByIdService from '../services/getJsonByIdService';

const retrieveData = async (log: Logger, accessToken: string, ticketId: string) => {

    const options = {
        method: 'get',
        headers: {
            'Accept': 'application/json',
            'Authorization': `Basic ${envUtil.ZENDESK_API_KEY()}`,
            'accept-encoding': 'gzip, deflate, br'
        }
    };

    const baseUrl = envUtil.ZENDESK_API_BASEURL();
    let lastErr: any = null;
    let finalResults = [];

    /* 
        Sample apiUrl: 
        https://ingrammicrosupport1700367431.zendesk.com/api/v2/tickets/35116
    */

    let apiUrl = `${baseUrl}/tickets/${ticketId}`;
    try {
        let response = await fetchUtil.fetchData(log, apiUrl, options);
        
        // 200 OK
        if (response.status === 200) {
            finalResults = await getFinalResults(accessToken, log, response, options);
        }
    } catch (err: any) {
        lastErr = err;
        // If API error and response exists, then the status handled above. Otherwise network error.
        console.error(`[searchForOneTicketService] Network error(ticketId: ${ticketId}): ${err.message || err}.`);
    }
    return finalResults;
};

const getFinalResults = async (accessToken, log, response, options) => {
    let finalResults = [];
    let body = await response.json();
    if (body && body.ticket) {
        let result = body.ticket;
        let ticket = await getTicketFromZendeskAPI(accessToken, log, result);
        if (ticket) {
            finalResults.push(ticket);
        }
    }
    return finalResults;
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function computeBackoff(attempt: number): number {
    const BACKOFF_BASE_MS: any = envUtil.BACKOFF_BASE_MS() || 1000;  // Base wait time for exponential backoff (1 second)
    const BACKOFF_CAP_MS: any = envUtil.BACKOFF_CAP_MS() || 60000;   // Maximum wait time between retries (60 seconds)
    // attempt is 1-based
    const exp = BACKOFF_BASE_MS * (2 ** (attempt - 1));
    const capped = Math.min(exp, BACKOFF_CAP_MS);
    // jitter between 0.5*capped and capped
    const low = 0.5 * capped;
    const jitter = Math.random() * (capped - low) + low;
    return Math.floor(jitter);
}

const loopUntil = async (conditionFn, intervalMs = 5000) => {
  while (true) {
    const result = await conditionFn();
    if (result) break;
    await new Promise(resolve => setTimeout(resolve, intervalMs)); // wait before next check
  }
}

const getTicketFromZendeskAPI = async (accessToken, log: Logger, result) => {
    let isStage = false;  // TODO: change this to false when we deploy this Azure Functions to Production

    // TODO: check if the form id is same on Production

    // GBL - Support (30549887549716)
    // GBL - Partner Support (34539140148756)
    // if (result && (result.ticket_form_id == 30549887549716 || result.ticket_form_id == 34539140148756)) {
        let countryFieldId = isStage ? 31959436739604 : 35138178531732;
        const objCountry = result.custom_fields && result.custom_fields.find(item => item.id === countryFieldId);
        const countryValue = objCountry ? objCountry.value : '';
        result.strCountry = await getZendeskConfigNameByValue(accessToken, log, countryValue);
        if (!result.strCountry) {
            result.strCountry = countryValue ? await getCustomFieldValue(log, countryFieldId.toString(), countryValue) : '';
        }
        let bcnFieldId = isStage ? 21077919616660 : 9213900294676;
        const objBCN = result.custom_fields && result.custom_fields.find(item => item.id === bcnFieldId);
        const bcnValue = objBCN ? objBCN.value : '';
        // result.strBCN = await getZendeskConfigNameByValue(accessToken, log, bcnValue);
        // if (!result.strBCN && bcnValue != 'NA' && bcnValue != 'N/A') {
        //     result.strBCN = bcnValue ? await getCustomFieldValue(log, bcnFieldId.toString(), bcnValue) : '';
        // }
        result.strBCN = bcnValue ? bcnValue : '-';
        let jsonPath = 'users';
        let jsonId = result.requester_id;
        result.requesterEmail = await getZendeskConfigEmailByKey(accessToken, log, jsonId);

        if (!result.requesterEmail) {
            let userDataResult = jsonId ? await getJsonByIdService.retrieveData(log, jsonPath, jsonId) : '';
            let userData = userDataResult ? await userDataResult.json() : '';
            result.requesterEmail = userData.user ? userData.user.email : '-';
        }

        // Reseller Name:
        let jsonPathOrg = 'organizations';
        let jsonIdOrg = result.organization_id;
        result.requesterName = await getZendeskResellerNameByKey(accessToken, log, jsonIdOrg);
        if (!result.requesterName) {
            let orgDataResult = jsonIdOrg ? await getJsonByIdService.retrieveData(log, jsonPathOrg, jsonIdOrg) : '';
            let orgData = orgDataResult ? await orgDataResult.json() : '';
            result.requesterName = orgData.organization ? orgData.organization.name : '-';
        }
        
        let domainFieldId = isStage ? 31042462931476 : 34698829065236;
        const objDomain = result.custom_fields && result.custom_fields.find(item => item.id === domainFieldId);
        const domainValue = objDomain ? objDomain.value : '';
        result.strDomain = await getZendeskConfigNameByValue(accessToken, log, domainValue);
        if (!result.strDomain) {
            result.strDomain = domainValue? await getCustomFieldValue(log, domainFieldId.toString(), domainValue) : '';
        }
        //result.strAccountId = await getAccountIdByCountryAndBCN(accessToken, log, result.strCountry, result.strBCN);
        result.strAccountId = result.updated_at;   // save "updated_at" value to strAccountId temporarily to get latest updated_at value in CRM
        //const resolveTimeInfo = await getResolveTimeInfo(log, result);

        /* 
            "im360_name" is same with "im360_ticketsubjectline";
            if "im360_resolved_at" is empty, set its value to "result.created_at" (resolveHours will be 0)
        */
        let ticket = {
            im360_ticketid: result.id ? result.id.toString() : '-',
            im360_name: result.subject ? result.subject : '-',
            im360_country: result.strCountry ? result.strCountry : '-',
            im360_ingrambcn: result.strBCN ? result.strBCN : '-',
            im360_partneremailaddress: result.requesterEmail ? result.requesterEmail : '-',
            im360_resellername: result.requesterName ? result.requesterName : '-',
            im360_ticketsubjectline: result.subject ? result.subject : '-',
            im360_status: result.status ? result.status.charAt(0).toUpperCase() + result.status.slice(1) : '-',
            im360_domain: result.strDomain ? result.strDomain : '-',
            im360_priority: result.priority ? result.priority.charAt(0).toUpperCase() + result.priority.slice(1) : '-',
            im360_accountid: result.strAccountId ? result.strAccountId : '-',
            im360_created_at: result.created_at ? result.created_at : new Date(),
            im360_updated_at: result.updated_at ? result.updated_at : result.created_at,
            // im360_resolved_at:  resolveTimeInfo.solved_at ? resolveTimeInfo.solved_at : result.created_at,
            // im360_resolvehours: resolveTimeInfo.resolveHours ? resolveTimeInfo.resolveHours : 0
        };
        return ticket;
    // } else {
    //     return '';
    // }
}

const getCustomFieldValue = async (log: Logger, fieldId: string, fieldValue: string) => {
    let result = fieldValue;
    let jsonId = fieldId;
    let jsonPath = 'ticket_fields/';
    let fieldDataResult = fieldId ? await getJsonByIdService.retrieveData(log, jsonPath, jsonId) : '';
    let fieldData = fieldDataResult ? await fieldDataResult.json() : '';
    if (fieldData && fieldData.ticket_field && fieldData.ticket_field.custom_field_options) {
        const obj = fieldData.ticket_field.custom_field_options.find(item => item.value === fieldValue);
        result = obj ? obj.name : fieldValue;
    }
    return result && result.trim();
};

const getZendeskResellerNameByKey = async (accessToken: string, log: Logger, configKey: string) => {
    let configName = '';
    if (!configKey) {
        return configName;
    }

    try {
        let crmUrl = process.env.CRM_URL || "";
        // example: https://im360gbldev.crm.dynamics.com/api/data/v9.2/im360_zendeskconfigs?$select=im360_key,im360_name,im360_value&$filter=im360_category eq 'organizations' and im360_key eq '21077843577620' ("CDW")
        const query = `${crmUrl}/api/data/v9.2/im360_zendeskconfigs?$select=im360_key,im360_name,im360_value&$filter=im360_category eq 'users' and im360_key eq '${configKey}'`;
        const getResponse = await fetch(query, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Accept": "application/json"
            }
        });

        const clone = getResponse.clone();
        const getData = clone ? await clone.json() : '';
        if (getData && getData.value && getData.value.length > 0) {
            configName = getData.value[0].im360_name;
        }
    } catch (err) {
        log("❌ Error in getZendeskResellerNameByKey:", err.message);
    }
    return configName;
}

const getZendeskConfigEmailByKey = async (accessToken: string, log: Logger, configKey: string) => {
    let configName = '';
    if (!configKey) {
        return configName;
    }

    try {
        let crmUrl = process.env.CRM_URL || "";
        // example: https://im360gbldev.crm.dynamics.com/api/data/v9.2/im360_zendeskconfigs?$select=im360_key,im360_name,im360_value&$filter=im360_category eq 'users' and im360_key eq '36171835936404'
        const query = `${crmUrl}/api/data/v9.2/im360_zendeskconfigs?$select=im360_key,im360_name,im360_value&$filter=im360_category eq 'users' and im360_key eq '${configKey}'`;
        const getResponse = await fetch(query, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Accept": "application/json"
            }
        });

        const clone = getResponse.clone();
        const getData = clone ? await clone.json() : '';
        if (getData && getData.value && getData.value.length > 0) {
            configName = getData.value[0].im360_name;
        }
    } catch (err) {
        log("❌ Error in getZendeskConfigEmailByKey:", err.message);
    }
    return configName;
}

const getZendeskConfigNameByValue = async (accessToken: string, log: Logger, configValue: string) => {
    let configName = '';
    if (!configValue) {
        return configName;
    }

    try {
        let crmUrl = process.env.CRM_URL || "";
        // example: https://im360gbldev.crm.dynamics.com/api/data/v9.2/im360_zendeskconfigs?$select=im360_key,im360_name,im360_value&$filter=im360_category eq 'ticket_fields' and im360_value eq 'gbl_cs_skill_integration'
        const query = `${crmUrl}/api/data/v9.2/im360_zendeskconfigs?$select=im360_key,im360_name,im360_value&$filter=im360_category eq 'ticket_fields' and im360_value eq '${configValue}'`;
        const getResponse = await fetch(query, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Accept": "application/json"
            }
        });

        const clone = getResponse.clone();
        const getData = clone ? await clone.json() : '';
        if (getData && getData.value && getData.value.length > 0) {
            configName = getData.value[0].im360_name;
        }
    } catch (err) {
        log("❌ Error in getZendeskConfigNameByValue:", err.message);
    }
    return configName;
}

const getLatestUpdatedAtValue = async (accessToken: string, log: Logger) => {
    let latestValue = '';

    try {
        let crmUrl = process.env.CRM_URL || "";
        // example: https://im360gbldev.crm.dynamics.com/api/data/v9.2/im360_zendeskticketses?$select=im360_accountid,modifiedon&$orderby=modifiedon desc&$top=1
        // Note: we cannot sort by "im360_updated_at" field, because it's string field, not datetime field, so we use "modifiedon" field to get the latest record
        const query = `${crmUrl}/api/data/v9.2/im360_zendeskticketses?$select=im360_accountid,modifiedon&$orderby=modifiedon desc&$top=1`;
        const getResponse = await fetch(query, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Accept": "application/json"
            }
        });

        const clone = getResponse.clone();
        const getData = clone ? await clone.json() : '';
        if (getData && getData.value && getData.value.length > 0) {
            latestValue = getData.value[0].im360_accountid;         // im360_accountid temporarily stores the "updated_at" value from Zendesk
        }
    } catch (err) {
        log("❌ Error in getLatestUpdatedAtValue:", err.message);
    }
    return latestValue;
}

export default {
    retrieveData,
    getLatestUpdatedAtValue
};
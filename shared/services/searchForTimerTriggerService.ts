import { Logger } from '@azure/functions';
import fetchUtil from '../utils/fetchUtil';
import envUtil from '../utils/envUtil';
import util from '../utils/util';
import getJsonByIdService from '../services/getJsonByIdService';
import processDataService from "../services/insertZendeskConfigService";
import processTicketDataService from '../services/insertZendeskTicketsService';

const retrieveData = async (log: Logger, accessToken: string, updatedDateStart: string, updatedDateEnd: string, createdDateStart: string, createdDateEnd: string, limit: string = '50', formName: string, endPage: string, ticketId: string = '', withoutUpdatedDate = 'false', zendeskCountry = '') => {
    const processName = 'searchForTimerTriggerService.retrieveData';
    log(`🔎 [${processName}] Start retrieving Zendesk tickets updated between ${updatedDateStart} and ${updatedDateEnd}, created between ${createdDateStart} and ${createdDateEnd}...(withoutUpdatedDate: ${withoutUpdatedDate})`);

    const options = {
        method: 'get',
        headers: {
            'Accept': 'application/json',
            'Authorization': `Basic ${envUtil.ZENDESK_API_KEY()}`,
            'accept-encoding': 'gzip, deflate, br'
        }
    };

    const baseUrl = envUtil.ZENDESK_API_BASEURL();
    if (!formName) {
        formName = "gbl - support";
    }

    /* 
        only search one ticket, sample apiUrl: 
        https://ingrammicrosupport1700367431.zendesk.com/api/v2/tickets/35116
    */
    if (ticketId) {
        let apiUrlForOneTicket = `${baseUrl}/tickets/${ticketId}`;
        let finalResultsForOneTicket = [];
        try {
            let response = await fetchUtil.fetchData(log, apiUrlForOneTicket, options);
            
            // 200 OK
            if (response.status === 200) {
                finalResultsForOneTicket = await getFinalResultsForOneTicket(accessToken, log, response);
            }
        } catch (err: any) {
            log(`❌ [searchForOneTicketService] error(ticketId: ${ticketId}): ${err && err.message}.`);
        }
        return finalResultsForOneTicket;
    }

    // API Request & Retry Configuration
    const MAX_RETRIES = 6;                                                 // Maximum number of retry attempts for failed API calls
    const API_LIMIT_THRESHOLD = 1500                                       // Conservative threshold for API quota checks
    const INCREMENTAL_API_CALL_GAP = envUtil.INCREMENTAL_API_CALL_GAP();   // Delay between incremental API calls (~3 calls/min)
    let incrementalApiCallGapInt = 20;
    if (INCREMENTAL_API_CALL_GAP && !isNaN(parseInt(INCREMENTAL_API_CALL_GAP, 10))) {
        incrementalApiCallGapInt = parseInt(INCREMENTAL_API_CALL_GAP, 10);
    }
    const incrementalApiCallGapIntMs = incrementalApiCallGapInt * 1000;
    const apiCounter = {
            attempted: 0,
            successful: 0,
            incremental_api_calls: 0,
            rate_limit_checks: 0,
            metric_fetch_calls: 0,
            standard_api_calls: 0
        };
    let finalResults = [];

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        apiCounter['attempted'] += 1
        /* 
            Sample apiUrl: 
            'https://ingrammicrosupport.zendesk.com/api/v2/search?query=type:ticket form:"gbl - support" created>"2025-05-17T00:00:00.000Z" created<"2025-11-17"&per_page=50&sort_by=created_at&sort_order=asc'
            https://ingrammicrosupport.zendesk.com/api/v2/search.json?query=((type:ticket custom_field_35138178531732:"gbl_cs_country_united_states") OR (type:ticket custom_field_35138178531732:"gbl_cs_country_united_kingdom")) form:"gbl - support" created>"2025-05-17T00:00:00.000Z"&per_page=50&sort_by=created_at&sort_order=asc
        */
        let apiUrl = `${baseUrl}/search?query=type:ticket form:"${formName}" updated>"${updatedDateStart}" updated<"${updatedDateEnd}" created>"${createdDateStart}" created<"${createdDateEnd}"&per_page=${limit}&sort_by=created_at&sort_order=asc`;
        if (withoutUpdatedDate == 'true') {
            apiUrl = `${baseUrl}/search?query=type:ticket form:"${formName}" created>"${createdDateStart}" created<"${createdDateEnd}"&per_page=${limit}&sort_by=created_at&sort_order=asc`;
            if (zendeskCountry) {
                apiUrl = `${baseUrl}/search?query=type:ticket custom_field_35138178531732:"${zendeskCountry}" form:"${formName}" created>"${createdDateStart}" created<"${createdDateEnd}"&per_page=${limit}&sort_by=created_at&sort_order=asc`;
            }
        }
        try {
            //await waitUntilNextMinute(log);
            let remaining = await getRateLimitStatus(log, baseUrl, options, apiCounter);
            while (true) {
                if (remaining < API_LIMIT_THRESHOLD) {
                    log(`Rate limit low: (${remaining}); waiting...`);
                    await sleep(incrementalApiCallGapIntMs);

                    remaining = await getRateLimitStatus(log, baseUrl, options, apiCounter);
                    log(`New rate limit remaining: ${remaining}`);
                } else {
                    // All good, safe to proceed
                    break;
                }
                // small delay to avoid tight loop spinning
                await sleep(200);
            }

            let response = await fetchUtil.fetchData(log, apiUrl, options);
            
            // 200 OK
            if (response.status === 200) {
                finalResults = await getFinalResults(accessToken, log, response, options, processName, endPage, API_LIMIT_THRESHOLD, baseUrl, apiCounter, getRateLimitStatus, waitUntilNextMinute, incrementalApiCallGapIntMs, zendeskCountry);
                attempt = MAX_RETRIES;
                return finalResults;
            }

            // 429 Rate limited
            if (response.status === 429) {
                let sleepMs = computeBackoff(attempt);
                const retryAfter = response.headers["retry-after"];
                if (retryAfter) {
                    const parsed = parseFloat(retryAfter);
                    if (!isNaN(parsed)) {
                        sleepMs = Math.max(sleepMs, parsed * 1000);
                    }
                }
                log(`❌ [${processName}] 429 rate limited (attempt ${attempt}/${MAX_RETRIES}). Sleeping ${sleepMs}ms.`);
                await sleep(sleepMs);
                continue;
            }

            // Server errors -> retry
            if (response.status >= 500 && response.status < 600) {
                const sleepMs = computeBackoff(attempt);
                log(`❌ [${processName}] Server error ${response.status} (attempt ${attempt}/${MAX_RETRIES}). Sleeping ${sleepMs}ms.`);
                await sleep(sleepMs);
                continue;
            }

            // Other non-recoverable statuses
            throw new Error(`Zendesk API error ${response.status}: ${response.statusText}`);
        } catch (err: any) {
            // If API error and response exists, then the status handled above. Otherwise network error.
            const sleepMs = computeBackoff(attempt);
            log(`❌ [${processName}] Network error on attempt ${attempt}/${MAX_RETRIES}: ${err.message || err}. Backing off ${sleepMs}ms`);
            await sleep(sleepMs);
            continue;
        }
    }

    return finalResults;
};

const unixToIso = (unixSeconds) => {
  return new Date(unixSeconds * 1000).toISOString();
}

/**
 * Align API calls to minute boundaries for consistent rate limiting.
 *
 * This function helps maintain steady API call rates by waiting until the start
 * of the next minute before proceeding. This is useful for incremental endpoints
 * that have strict per-minute rate limits and helps avoid burst traffic patterns.
 *
 * @param {string} processName - Task context for error logging
 */
const waitUntilNextMinute = async (log: Logger, processName = "WAIT_UNTIL_NEXT_MINUTE") => {
  try {
    const now = new Date();
    const seconds = now.getUTCSeconds();

    if (seconds !== 0) {
      const secondsToWait = 60 - seconds;
      log(
        `⏳ Waiting ${secondsToWait.toFixed(
          2
        )}s until the start of the next minute...`
      );
      await new Promise((resolve) => setTimeout(resolve, secondsToWait * 1000));
    } else {
      log("✅ Aligned to minute boundary. Proceeding...");
    }
  } catch (e) {
    log(`❌ Exception in ${processName}: ${e}`);
  }
};

/**
 * Check current API rate limit quota remaining for the Zendesk account.
 * 
 * Makes a lightweight API call to /users/me.json to inspect rate limit headers.
 * This helps the pipeline make informed decisions about when to proceed with
 * bulk API operations vs. when to wait for quota renewal.
 * 
 * @param {Object} session - Axios instance or session with authentication
 * @param {string} baseUrl - Zendesk account baseUrl
 * @param {Object} apiCounter - Global API tracking counters
 * @param {string} [processName="RATE_LIMIT_CHECK"] - Task context for logging
 * @returns {Promise<number>} Number of API calls remaining (0 if unknown)
 */
const getRateLimitStatus = async (log, baseUrl, options, apiCounter, processName = "RATE_LIMIT_CHECK") =>  {
    try {
        const apiUrl = `${baseUrl}/users/me.json`;

        const resp = await fetchUtil.fetchData(log, apiUrl, options);
        let headers = resp.headers;
        let remainingHeader = "0";
        if (headers) {
            remainingHeader = headers.get('x-rate-limit-remaining') || headers.get('X-Rate-Limit-Remaining') || headers.get('ratelimit-remaining');
        }

        let remainingInt = 0;
        if (remainingHeader && !isNaN(parseInt(remainingHeader, 10))) {
            remainingInt = parseInt(remainingHeader, 10);
        }

        log(`🧮 Rate limit remaining (Support pool): ${remainingInt}`);

        return remainingInt;
    } catch (error) {
        log.error(`❌ Exception in ${processName} (apiHits: ${apiCounter?.attempted || 0}): ${error.message}`);
        return 0; // Return conservative value
    }
}

const getFinalResultsForOneTicket = async (accessToken, log, response) => {
    let finalResults = [];
    let body = await response.json();
    if (body && body.ticket) {
        let result = body.ticket;
        let ticket = await getTicketFromZendeskAPIResult(accessToken, log, result);
        if (ticket) {
            finalResults.push(ticket);
        }
    }
    return finalResults;
}

const getFinalResults = async (accessToken, log, response, options, processName, endPage, API_LIMIT_THRESHOLD, baseUrl, apiCounter, getRateLimitStatus, waitUntilNextMinute, incrementalApiCallGapIntMs, zendeskCountry) => {
    const MAX_RETRIES = 6;
    let finalResults = [];
    let body = await response.json();
    if (body && body.results) {
        let items = body.results;
        await util.asyncForEach(items, async result => {
            let ticketId = result.id;
            let ticketExist = await checkTicketByTicketId(ticketId, accessToken, log);
            if (!ticketExist) {
                let ticket = await getTicketFromZendeskAPIResult(accessToken, log, result);
                if (ticket) {
                    finalResults.push(ticket);
                }
            } else {
                const onlyUpdateConfig = true;
                await getTicketFromZendeskAPIResult(accessToken, log, result, onlyUpdateConfig, zendeskCountry);
            }
        });
    }

    let newApiUrl = body.next_page;
    if (newApiUrl) {
        let countQuit = 0;
        await loopUntil(async () => {
            for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
                try {
                    //await waitUntilNextMinute(log);
                    let remaining = await getRateLimitStatus(log, baseUrl, options, apiCounter);
                    while (true) {
                        if (remaining < API_LIMIT_THRESHOLD) {
                            log(`Rate limit low: (${remaining}); waiting...`);
                            await sleep(incrementalApiCallGapIntMs);

                            remaining = await getRateLimitStatus(log, baseUrl, options, apiCounter);
                            log(`New rate limit remaining: ${remaining}`);
                        } else {
                            // All good, safe to proceed
                            break;
                        }
                        // Optional small delay to avoid tight loop spinning
                        await new Promise(resolve => setTimeout(resolve, 200));
                    }
                    let newResponse = await fetchUtil.fetchData(log, newApiUrl, options);
                    
                    // 200 OK
                    if (newResponse.status === 200) {
                        let newBody = await newResponse.json();
                        if (newBody && newBody.results) {
                            let newItems = newBody.results;
                            await util.asyncForEach(newItems, async result => {
                                let ticketId = result.id;
                                let ticketExist = await checkTicketByTicketId(ticketId, accessToken, log);
                                if (!ticketExist) {
                                    let ticket = await getTicketFromZendeskAPIResult(accessToken, log, result);
                                    if (ticket) {
                                        finalResults.push(ticket);
                                    }
                                }   else {
                                    const onlyUpdateConfig = true;
                                    await getTicketFromZendeskAPIResult(accessToken, log, result, onlyUpdateConfig, zendeskCountry);
                                }
                            });
                        }
                        newApiUrl = newBody.next_page;
                        // newApiUrl example: "https://ingrammicrosupport.zendesk.com/api/v2/search.json?page=2&per_page=50&query=type%3Aticket+form%3A%22gbl+-+support%22+updated%3E%222025-11-09T22..."
                        if (newApiUrl) {
                            const params = new URL(newApiUrl).searchParams;
                            const pageNumber = Number(params.get("page"));
                            let endPageStr = endPage ? endPage.trim() : "";
                            if (!endPageStr) {
                                endPageStr = envUtil.TICKETS_SYNC_END_PAGE_NUMBER();
                                if (!endPageStr) {
                                    endPageStr = "10";
                                }
                                const endPageNumber =  Number(endPageStr) ;

                                // it's getting problems when the pageNumber is 21, so stop it when pageNumber is 20:
                                if (pageNumber >= 20 || endPageNumber <= pageNumber) {
                                    return true;  // stop when it reaches the end page number
                                }
                            }
                        }
                        return newApiUrl ? false : true;  // stop when newApiUrl is empty
                    } else {
                        countQuit += 1;
                        if (countQuit > 20) {
                            attempt = MAX_RETRIES;
                            log(`❌ [Stopping...] Tried 20 times, still cannot get 200 response status for ${newApiUrl}`);
                            return true;  // stop after 20 attempts if the status is not 200
                        }
                    }

                    // 429 Rate limited
                    if (newResponse.status === 429) {
                        let sleepMs = computeBackoff(attempt);
                        const retryAfter = newResponse.headers["retry-after"];
                        if (retryAfter) {
                            const parsed = parseFloat(retryAfter);
                            if (!isNaN(parsed)) {
                                sleepMs = Math.max(sleepMs, parsed * 1000);
                            }
                        }
                        log(`❌ [${processName}] 429 rate limited (attempt ${attempt}/${MAX_RETRIES}). Sleeping ${sleepMs}ms.`);
                        await sleep(sleepMs);
                        continue;
                    }

                    // Server errors -> retry
                    if (newResponse.status >= 500 && newResponse.status < 600) {
                        const sleepMs = computeBackoff(attempt);
                        log(`❌ [${processName}] Server error ${newResponse.status} (attempt ${attempt}/${MAX_RETRIES}). Sleeping ${sleepMs}ms.`);
                        await sleep(sleepMs);
                        continue;
                    }

                    // Other non-recoverable statuses
                    throw new Error(`Zendesk API error ${newResponse.status}: ${newResponse.statusText}`);
                } catch (err: any) {
                    // If API error and newResponse exists, then the status handled above. Otherwise network error.
                    const sleepMs = computeBackoff(attempt);
                    log(`❌ [${processName}] Network error on attempt ${attempt}/${MAX_RETRIES}: ${err.message || err}. Backing off ${sleepMs}ms`);
                    await sleep(sleepMs);
                    continue;
                }
            }
            
        });
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

// wait for 10 seconds between each check
const loopUntil = async (conditionFn, intervalMs = 10000) => {
  while (true) {
    const result = await conditionFn();
    if (result) break;
    await new Promise(resolve => setTimeout(resolve, intervalMs)); // wait before next check
  }
}

const getTicketFromZendeskAPIResult = async (accessToken, log: Logger, result, onlyUpdateConfig = false, zendeskCountry = '') => {
    result.strResolveHours = toUnix(result.created_at);   // save "created_at" value to strResolveHours temporarily to get latest created_at value in CRM
    let itemForFastSync = {
        im360_category: zendeskCountry,
        im360_key: 'fastSync_CreatedAt', 
        im360_value: result.strResolveHours && result.strResolveHours.toString(),
        im360_name: result.created_at && result.created_at.toString()
    };
    if (onlyUpdateConfig) {
        await processDataService.upsertZendeskConfig(log, accessToken, itemForFastSync);
        return;
    }

    let isStage = false;  // Production

    // XDUS-8259 - No Response Necessary (NRN) flag
    let isNRN = false;
    if (result && result.tags && Array.isArray(result.tags)) {
        result.tags.forEach(tag => {
            if (isNRNTicket(tag)) {
                isNRN = true;
            }
        });
    }

    if (isNRN) {
        log(`Zendesk - Ticket ID ${result.id} is marked as No Response Necessary (NRN) ticket.`);
        return null;
    }

    // GBL - Support (30549887549716)
    // GBL - Partner Support (34539140148756)
    let countryFieldId = isStage ? 31959436739604 : 35138178531732;
    const objCountry = result.custom_fields && result.custom_fields.find(item => item.id === countryFieldId);
    const countryValue = objCountry ? objCountry.value : '';
    result.strCountry = await getZendeskConfigNameByValue(accessToken, log, countryValue);
    if (!result.strCountry) {
        result.strCountry = countryValue ? await getCustomFieldValue(log, countryFieldId.toString(), countryValue) : '';
        if (countryValue && result.strCountry) {
            const configData = {
                        im360_category: 'ticket_fields',
                        im360_key: countryFieldId.toString(),
                        im360_value: countryValue,
                        im360_name: result.strCountry
                    };
            await processDataService.upsertZendeskConfig(log, accessToken, configData);
        }
    }
    let bcnFieldId = isStage ? 21077919616660 : 9213900294676;
    const objBCN = result.custom_fields && result.custom_fields.find(item => item.id === bcnFieldId);
    const bcnValue = objBCN ? objBCN.value : '';
    result.strBCN = bcnValue ? bcnValue : '-';
    let jsonPath = 'users';
    let jsonId = result.requester_id;
    result.requesterEmail = await getZendeskConfigEmailByKey(accessToken, log, jsonId);
    if (!result.requesterEmail) {
        let userDataResult = jsonId ? await getJsonByIdService.retrieveData(log, jsonPath, jsonId) : '';
        let userData = userDataResult ? await userDataResult.json() : '';
        result.requesterEmail = userData.user ? userData.user.email : '-';
        if (jsonId && result.requesterEmail) {
            // upsert user:
            const configData = {
                    im360_category: 'users',
                    im360_key: jsonId.toString(),
                    im360_value: userData && userData.user && userData.user.role,
                    im360_name: result.requesterEmail,
                    im360_description: userData && userData.user && userData.user.name
                };
            await processDataService.upsertZendeskConfig(log, accessToken, configData);
        }
    }

    // Reseller Name:
    let jsonPathOrg = 'organizations';
    let jsonIdOrg = result.organization_id;
    result.requesterName = await getZendeskResellerNameByKey(accessToken, log, jsonIdOrg);
    if (!result.requesterName) {
        let orgDataResult = jsonIdOrg ? await getJsonByIdService.retrieveData(log, jsonPathOrg, jsonIdOrg) : '';
        let orgData = orgDataResult ? await orgDataResult.json() : '';
        result.requesterName = orgData.organization ? orgData.organization.name : '-';
        if (jsonIdOrg && result.requesterName) {
            // upsert organization:
            const orgData = {
                    im360_category: 'organizations',
                    im360_key: jsonIdOrg.toString(),
                    im360_value: result.requesterName,
                    im360_name: result.requesterName
                };
            await processDataService.upsertZendeskConfig(log, accessToken, orgData);
        }
    }
    
    let domainFieldId = isStage ? 31042462931476 : 34698829065236;
    const objDomain = result.custom_fields && result.custom_fields.find(item => item.id === domainFieldId);
    const domainValue = objDomain ? objDomain.value : '';
    result.strDomain = await getZendeskConfigNameByValue(accessToken, log, domainValue);
    if (!result.strDomain) {
        result.strDomain = domainValue? await getCustomFieldValue(log, domainFieldId.toString(), domainValue) : '';
        if (domainValue && result.strDomain) {
            const configData = {
                        im360_category: 'ticket_fields',
                        im360_key: domainFieldId.toString(),
                        im360_value: domainValue,
                        im360_name: result.strDomain
                    };
            await processDataService.upsertZendeskConfig(log, accessToken, configData);
        }
    }
    if (itemForFastSync.im360_category) {
        await processDataService.upsertZendeskConfig(log, accessToken, itemForFastSync);
    }

    // use "im360_ticketsubjectline" to save Platform value (XDUS-8293)
    let platformFieldId = isStage ? 35415435690388 : 35228789545364;
    const objPlatform = result.custom_fields && result.custom_fields.find(item => item.id === platformFieldId);
    const platformValue = objPlatform ? objPlatform.value : '';
    result.strPlatform = await getZendeskConfigNameByValue(accessToken, log, platformValue);
    if (!result.strPlatform) {
        result.strPlatform = platformValue? await getCustomFieldValue(log, platformFieldId.toString(), platformValue) : '';
    }

    let ticket = {
        im360_ticketid: result.id ? result.id.toString() : '-',
        im360_name: result.subject ? result.subject : '-',
        im360_country: result.strCountry ? result.strCountry : '-',
        im360_ingrambcn: result.strBCN ? result.strBCN : '-',
        im360_partneremailaddress: result.requesterEmail ? result.requesterEmail : '-',
        im360_resellername: result.requesterName ? result.requesterName : '-',
        im360_ticketsubjectline: result.strPlatform ? result.strPlatform : '-',
        im360_status: result.status ? result.status.charAt(0).toUpperCase() + result.status.slice(1) : '-',
        im360_domain: result.strDomain ? result.strDomain : '-',
        im360_priority: result.priority ? result.priority.charAt(0).toUpperCase() + result.priority.slice(1) : '-',
        im360_resolvehours: result.strResolveHours ? result.strResolveHours : '-',
        im360_created_at: result.created_at ? result.created_at : new Date(),
        im360_updated_at: result.updated_at ? result.updated_at : result.created_at,
    };

    await processTicketDataService.upsertZendeskTicket(log, accessToken, ticket);
    
    return ticket;
}

const toUnix = (dateString) => {
  const time = Date.parse(dateString);
  return isNaN(time) ? null : Math.floor(time / 1000);
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

/*
{
    "id": 35138188166804,
    "name": "United States",
    "raw_name": "United States",
    "value": "gbl_cs_country_united_states",
    "default": false
},
*/
const getCustomFieldCountryValue = async (log: Logger, fieldId: string, countryName: string) => {
    let result = '';
    let jsonId = fieldId;
    let jsonPath = 'ticket_fields/';
    let fieldDataResult = fieldId ? await getJsonByIdService.retrieveData(log, jsonPath, jsonId) : '';
    let fieldData = fieldDataResult ? await fieldDataResult.json() : '';
    if (fieldData && fieldData.ticket_field && fieldData.ticket_field.custom_field_options) {
        const obj = fieldData.ticket_field.custom_field_options.find(item => item.name.toLowerCase().trim() === countryName.toLowerCase().trim());
        result = obj ? obj.value : '';
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
        const query = `${crmUrl}/api/data/v9.2/im360_zendeskconfigs?$select=im360_key,im360_name,im360_value&$filter=im360_category eq 'organizations' and im360_key eq '${configKey}'`;
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

const getLatestCreatedAtValue = async (accessToken: string, log: Logger, zendeskCountry) => {
    let latestValue = '';

    try {
        let key = 'fastSync_CreatedAt';
        latestValue = await checkConfigValueByKeyAndCategory(key, zendeskCountry, accessToken, log);
    } catch (err) {
        log("❌ Error in getLatestCreatedAtValue:", err.message);
    }
    const sixMonthAgoTime = '1747440000';
    let isoTime = latestValue ? latestValue : sixMonthAgoTime;

    return unixToIso(isoTime);
}

const checkTicketByTicketId = async (ticketId, accessToken: string, log: Logger) => {

    try {
        let crmUrl = process.env.CRM_URL || "";
        const query = `${crmUrl}/api/data/v9.2/im360_zendeskticketses?$filter=im360_ticketid eq '${ticketId}'`;
        const getResponse = await fetch(query, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Accept": "application/json"
            }
        });

        const getData = await getResponse.json();
        if (getData.value && getData.value.length > 0) {
            return true;
        }
        else {
            return false;
        }
    } catch (err) {
        log("❌ Error in checkTicketByTicketId:", err.message);
        return false;
    }
}

const checkConfigValueByKeyAndCategory = async (im360_key, zendeskCountry, accessToken: string, log: Logger) => {

    try {
        let crmUrl = process.env.CRM_URL || "";
        // example query: https://im360gbldev.crm.dynamics.com/api/data/v9.2/im360_zendeskconfigs?$filter=im360_key eq 'fastSync_CreatedAt' and im360_category eq 'gbl_cs_country_australia'
        const query = `${crmUrl}/api/data/v9.2/im360_zendeskconfigs?$filter=im360_key eq '${im360_key}' and im360_category eq '${zendeskCountry}'`;
        const getResponse = await fetch(query, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Accept": "application/json"
            }
        });

        const getData = await getResponse.json();
        if (getData.value && getData.value.length > 0) {
            const value = getData.value[0].im360_value; 
            return value;
        }
        else {
            return null;
        }
    } catch (err) {
        log("❌ Error in checkConfigValueByKey:", err.message);
        return false;
    }
    
}

const getCapacityReport = async (accessToken) => {
    const params = {
    'api-version': '2020-10-01',
    '$expand': 'properties.capacity,properties.addons',
  };
  const queryString = new URLSearchParams(params).toString();
  const url = `https://api.bap.microsoft.com/providers/Microsoft.BusinessAppPlatform/scopes/admin/environments?${queryString}`;
  
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    }
  });

  const result = await res.json();
  return result;
  // The received access token has been obtained from wrong audience or resource 'https://im360p04.crm6.dynamics.com'
}

const getActiveCountries = async (accessToken: string, log: Logger) => {
    let countryNames = [];

    try {
        let crmUrl = process.env.CRM_URL || "";
        // example: https://im360p04.crm6.dynamics.com/api/data/v9.2/im360_countries?$select=im360_name&$filter=statecode eq 0
        const query = `${crmUrl}/api/data/v9.2/im360_countries?$select=im360_name&$filter=statecode eq 0`;
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
            getData.value.forEach(countryItem => {
                countryNames.push(countryItem.im360_name);
            });
        }
    } catch (err) {
        log("❌ Error in getZendeskResellerNameByKey:", err.message);
    }
    return countryNames;
}

const buildCountrySearchQuery = (fieldId, countries) => {
  const parts = countries.map(c => 
    `(type:ticket custom_field_${fieldId}:"${c}")`
  );
  return parts.join(" OR ");
}

const isNRNTicket = (tag) => {
    if (!tag || tag.length < 3) return false;

    const trueTags = new Set([
        "auto_close_nrn",
        "ca_auto_close_nrn",
        "ca_im_vendor_autoclose_nrn",
        "ca_scc_cisco_categories_nrn_no_response_needed",
        "ca_scc_cisco_nrn",
        "ca_scc_cisco_nrn_sender",
        "ca_support_im360_notifications_acct_10_rma_nrn",
        "ca_support_im360_notifications_acct_40_rma_nrn",
        "cisco_ops_nrn_closed",
        "cisco_ops_nrn_sender",
        "gbl_cat_spec_us_nrn_sql_dba_sender",
        "gbl_cat_specialist_nrn",
        "gbl_cat_specialist_nrn_sender",
        "gbl_mdg_category_nrn",
        "gbl_partner_support_autoclose_nrn",
        "gbl_partner_support_nrn_sender",
        "gbl_support_autoclose_nrn",
        "gbl_support_nrn_closed",
        "gbl_support_autosolve_nrn",
        "gbl_tracking_gde_notification_aq_draft_nrn",
        "gbl_tracking_gde_notification_aq_success_nrn",
        "gbl_x4a_quotes_nrn",
        "global_autoclose_nrn",
        "global_nrn_closed",
        "global_nrn_sender",
        "hpe_cto_nrn_closed",
        "la_cs_apple_nrn_sender",
        "la_cs_nrn",
        "la_cs_nrn_sender",
        "la_la_new_accounts_request_type_nrn",
        "la_request_type_nrn",
        "la_sales_cisco_nrn_sender",
        "la_sales_nrn",
        "macro_la_cs_nrn",
        "macro_la_new_accounts_nrn",
        "macro_la_sales_nrn",
        "macro_miami_la_buops_nrn",
        "na_ar_credit_csam_nrn_sender",
        "na_ar_credit_csam_request_type_nrn",
        "na_ar_credit_drm_nrn_closed",
        "na_ar_credit_drm_request_type_nrn",
        "na_ar_credit_resale_nrn_closed",
        "na_ar_credit_resale_request_type_nrn",
        "nrn__no_response_needed_",
        "pe_smb_sales_nrn_closed",
        "per_categories_no_se_necesita_respuesta__nrn_",
        "peru_smb_nrn_sender",
        "tr_autoclose_nrn",
        "tr_nrn_sender",
        "us_adavanced_solutions_autoclose_nrn",
        "us_advanced_solutions_nrn_sender",
        "us_advanced_solutions_nrn_sender_cisco_commerce",
        "us_advanced_solutions_nrn_sender_global_noreply_fortinet",
        "us_advanced_solutions_nrn_sender_noreplycisco",
        "us_advanced_solutions_nrn_sender_sonicwall_salessupport",
        "us_category_email_nrn",
        "us_cisco_md_hw_autoclose_nrn",
        "us_cisco_md_svcs_cisco_sub_nrn_sender",
        "us_cisco_meraki_autoclose_nrn",
        "us_cisco_sales_cisco_nrn_sender",
        "us_cisco_sales_nrn_sender",
        "us_dell_csg_nrn",
        "us_dell_federal_imedirpt_nrn_sender",
        "us_dell_federal_nrn_sender",
        "us_dellfed_nrn",
        "us_emea_pcg_nrn",
        "us_gohybrid_bid_parsing_nrn_sender",
        "us_gohybrid_nrn_closed",
        "us_hpe_aruba_support_category_nrn",
        "us_hpe_aruba_support_nrn_closed",
        "us_hpe_aruba_support_nrn_sender",
        "us_hpe_cto_sfdc_sender_nrn",
        "us_hpe_dayone_nrn_solved",
        "us_hpe_nrn_sender",
        "us_hpe_nrn_solve_hpeoperation_sender",
        "us_ibm_tss_nrn",
        "us_lenovo_isg_server_lenovo_nrn",
        "us_lenovo_isg_server_nrn",
        "us_modern_workforce_autoclose_nrn",
        "us_modern_workforce_hpi_nrn",
        "us_modern_workforce_hpi_sender_nrn",
        "us_modern_workforce_ignite_sender_nrn",
        "us_modern_workforce_lenovo_lbp_sender_nrn",
        "us_modern_workforce_mssurface_warranties_nrn",
        "us_modern_workforce_nrn_sender",
        "us_modin_vmware_nrn_closed",
        "us_modin_vmware_omnissa_sender_nrn",
        "us_modin_vmware_prod_omnissa_sender_nrn",
        "us_modin_vmware_prod_sender_nrn",
        "us_modin_vmware_uspurchaseorder_sender_nrn",
        "us_modin_x_1_veeam_nrn_closed",
        "us_modin_x1_nrn_closed",
        "us_modin_x1_nrn_sender",
        "us_modin_x1_veeam_no_reply_sender_nrn",
        "us_modin_x2_autoclose_nrn",
        "us_modin_x2_nrn_sender",
        "us_modin_x2_sbo_nrn_sender",
        "us_modin_x3_autoclose_nrn",
        "us_modin_x3_nrn_sender",
        "us_modin_x3_panduit_nrn_sender_panduit"
    ]);

    return trueTags.has(tag) ? true : false;

};

export default {
    retrieveData,
    getLatestCreatedAtValue,
    checkTicketByTicketId,
    checkConfigValueByKeyAndCategory,
    loopUntil,
    getCapacityReport,
    getActiveCountries,
    getCustomFieldCountryValue,
    buildCountrySearchQuery
};
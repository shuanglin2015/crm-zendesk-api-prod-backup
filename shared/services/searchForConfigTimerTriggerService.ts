import { Logger } from '@azure/functions';
import fetchUtil from '../utils/fetchUtil';
import envUtil from '../utils/envUtil';
import util from '../utils/util';

const retrieveData = async (log: Logger, updatedDateStart: string, updatedDateEnd: string) => {

    const options = {
        method: 'get',
        headers: {
            'Accept': 'application/json',
            'Authorization': `Basic ${envUtil.ZENDESK_API_KEY()}`,
            'accept-encoding': 'gzip, deflate, br'
        }
    };

    const baseUrl = envUtil.ZENDESK_API_BASEURL();

    /* 
        Sample apiUrl: 
        https://ingrammicrosupport1700367431.zendesk.com/api/v2/ticket_fields
    */

    let apiUrl = `${baseUrl}/ticket_fields`;
    let response = await fetchUtil.fetchData(log, apiUrl, options);
    let body = await response.json();
    let finalResults = [];

    if (body && body.ticket_fields) {
        let items = body.ticket_fields;
        await util.asyncForEach(items, async item => {
            let result = await getResultFromZendeskAPI(log, item.id, item.updated_at, item.custom_field_options, updatedDateStart, updatedDateEnd);
            if (result && result.length > 0) {
                finalResults.push(...result);
            }
        });
    }

    let newApiUrl = body.next_page;
    if (newApiUrl) {
        await loopUntil(async () => {
            let newResponse = await fetchUtil.fetchData(log, newApiUrl, options);
            let newBody = await newResponse.json();
            if (newBody && newBody.ticket_fields) {
                let newItems = newBody.ticket_fields;
                await util.asyncForEach(newItems, async item => {
                    let result = await getResultFromZendeskAPI(log, item.id, item.updated_at, item.custom_field_options, updatedDateStart, updatedDateEnd);
                    if (result && result.length > 0) {
                        finalResults.push(...result);
                    }
                });
            }
            newApiUrl = newBody.next_page;
            if (newApiUrl) {
                const params = new URL(newApiUrl).searchParams;
                const pageNumber = Number(params.get("page"));
                if (pageNumber > 20) {
                    return true;  // stop when it reaches 20 * 50 = 1000 records (only one page on Production so far)
                }
            }
            return newApiUrl ? false : true;  // stop when newApiUrl is empty
        });
    }

    return finalResults;
};

const loopUntil = async (conditionFn, intervalMs = 5000) => {
  while (true) {
    const result = await conditionFn();
    if (result) break;
    await new Promise(resolve => setTimeout(resolve, intervalMs)); // wait before next check
  }
}

const getResultFromZendeskAPI = async (log: Logger, itemId, itemUpdatedAt,  options, updatedDateStart, updatedDateEnd) => {
    let results = [];
    if (options && options.length > 0) {
        options.forEach(option => {
            if (updatedDateStart) {
                const optionUpdatedAt = new Date(itemUpdatedAt);
                const filterDateStart = new Date(updatedDateStart);
                const filterDateEnd = new Date(updatedDateEnd);
                if (optionUpdatedAt >= filterDateStart && optionUpdatedAt < filterDateEnd) {
                    results.push({
                        im360_category: 'ticket_fields',
                        im360_key: itemId.toString(),
                        im360_value: option.value && option.value.trim(),
                        im360_name: option.name && option.name.trim()
                    });
                }
            }
        });
    } 

    return results;
}

/* Sample record data:
    im360_category: ticket_fields
    im360_key: 31959436739604 ("ticket_fields" id)
        - url": "https://ingrammicrosupport1700367431.zendesk.com/api/v2/ticket_fields/31959436739604.json",
        - "id": 31959436739604
    im360_value: gbl_cs_country_united_kingdom
    im360_name: United Kingdom
*/

export default {
    retrieveData
};
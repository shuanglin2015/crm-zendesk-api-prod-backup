import { Logger } from '@azure/functions';
import fetchUtil from '../utils/fetchUtil';
import envUtil from '../utils/envUtil';
import util from '../utils/util';

const retrieveData = async (log: Logger, updatedDateStart: string, updatedDateEnd: string, organizationId: string, startPage: string, endPage: string) => {

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
        https://ingrammicrosupport1700367431.zendesk.com/api/v2/organizations/40728647411092.json
    */

    let apiUrl = `${baseUrl}/organizations`;
    if (organizationId) {
        apiUrl = `${baseUrl}/organizations/${organizationId}.json`;
    }
    let response = await fetchUtil.fetchData(log, apiUrl, options);
    let body = await response.json();
    let finalResults = [];

    if (body && (organizationId || body.organizations)) {
        let items = organizationId ? [body.organization] : body.organizations;
        await util.asyncForEach(items, async item => {
            let result = await getResultFromZendeskAPI(log, item.id, item.updated_at, item.name, updatedDateStart, updatedDateEnd, organizationId);
            if (result && result.length > 0) {
                finalResults.push(...result);
            }
        });
    }

    let newApiUrl = body.next_page;
    if (newApiUrl) {
        // newApiUrl example: "https://ingrammicrosupport1700367431.zendesk.com/api/v2/organizations.json?page=2"
        const params = new URL(newApiUrl).searchParams;
        const pageNumber = Number(params.get("page"));
        const startPageStr = startPage ? startPage.trim() : "0";
        const startPageNumber =  Number(startPageStr) ;
        if (startPageNumber > pageNumber) {
            newApiUrl = newApiUrl.replace(`page=${pageNumber}`, `page=${startPageNumber}`);
        }
        await loopUntil(async () => {
            const paramsNew = new URL(newApiUrl).searchParams;
            const pageNumberNew = Number(paramsNew.get("page"));
            const endPageStr = endPage ? endPage.trim() : "";
            if (endPageStr) {
                const endPageNumber =  Number(endPageStr) ;
                if (pageNumberNew >= endPageNumber) {
                    return true;  // stop
                }
            }
            let newResponse = await fetchUtil.fetchData(log, newApiUrl, options);
            let newBody = await newResponse.json();
            if (newBody && (organizationId || newBody.organizations)) {
                let newItems = organizationId? [newBody.organization] : newBody.organizations;
                await util.asyncForEach(newItems, async item => {
                    let result = await getResultFromZendeskAPI(log, item.id, item.updated_at, item.name, updatedDateStart, updatedDateEnd, organizationId);
                    if (result && result.length > 0) {
                        finalResults.push(...result);
                    }
                });
            }
            newApiUrl = newBody.next_page;
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

const getResultFromZendeskAPI = async (log: Logger, itemId, itemUpdatedAt,  itemName, updatedDateStart, updatedDateEnd, organizationId) => {
    let results = [];
    if (itemId && itemName) {
            if (updatedDateStart && itemUpdatedAt && updatedDateEnd) {
                const optionUpdatedAt = new Date(itemUpdatedAt);
                const filterDateStart = new Date(updatedDateStart);
                const filterDateEnd = new Date(updatedDateEnd);
                if (organizationId || (optionUpdatedAt >= filterDateStart && optionUpdatedAt < filterDateEnd)) {
                    results.push({
                        im360_category: 'organizations',
                        im360_key: itemId.toString(),
                        im360_value: itemName,
                        im360_name: itemName
                    });
                }
            }
    } 

    return results;
}

/* Sample record data:
    im360_category: organizations
    im360_key: 21079500513556 ("organizations" id)
        - url": "https://ingrammicrosupport1700367431.zendesk.com/api/v2/organizations/21079500513556.json",
        - "id": 21079500513556
    im360_value: !PET handel B.V. ("name")
    im360_name: !PET handel B.V. ("name")
*/

export default {
    retrieveData
};
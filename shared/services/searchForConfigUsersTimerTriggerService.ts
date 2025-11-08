import { Logger } from '@azure/functions';
import fetchUtil from '../utils/fetchUtil';
import envUtil from '../utils/envUtil';
import util from '../utils/util';

const retrieveData = async (log: Logger, updatedDateStart: string, updatedDateEnd: string, userId: string, startPage: string, endPage: string) => {

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
        https://ingrammicrosupport1700367431.zendesk.com/api/v2/users
    */

    let apiUrl = `${baseUrl}/users`;
    if (userId) {
        apiUrl = `${baseUrl}/users/${userId}.json`;
    }
    let response = await fetchUtil.fetchData(log, apiUrl, options);
    let body = await response.json();
    let finalResults = [];

    if (body && (userId || body.users)) {
        let items = userId ? [body.user] : body.users;
        await util.asyncForEach(items, async item => {
            let result = await getResultFromZendeskAPI(log, item.id, item.updated_at, item.role, item.email, item.name, updatedDateStart, updatedDateEnd, userId);
            if (result && result.length > 0) {
                finalResults.push(...result);
            }
        });
    }

    let newApiUrl = body.next_page;
    if (newApiUrl) {
        // newApiUrl example: "https://ingrammicrosupport1700367431.zendesk.com/api/v2/users.json?page=2"
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
            if (newBody && (userId || newBody.users)) {
                let newItems = userId? [newBody.user] : newBody.users;
                await util.asyncForEach(newItems, async item => {
                    let result = await getResultFromZendeskAPI(log, item.id, item.updated_at, item.role, item.email, item.name, updatedDateStart, updatedDateEnd, userId);
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

const getResultFromZendeskAPI = async (log: Logger, itemId, itemUpdatedAt,  itemRole, itemEmail, itemName, updatedDateStart, updatedDateEnd, userId) => {
    let results = [];
    if (itemId && itemRole && itemEmail) {
            if (updatedDateStart && itemUpdatedAt && updatedDateEnd) {
                const optionUpdatedAt = new Date(itemUpdatedAt);
                const filterDateStart = new Date(updatedDateStart);
                const filterDateEnd = new Date(updatedDateEnd);
                if (userId || (optionUpdatedAt >= filterDateStart && optionUpdatedAt < filterDateEnd)) {
                    results.push({
                        im360_category: 'users',
                        im360_key: itemId.toString(),
                        im360_value: itemRole,
                        im360_name: itemEmail,
                        im360_description: itemName
                    });
                }
            }
    } 

    return results;
}

/* Sample record data:
    im360_category: users
    im360_key: 36171835936404 ("users" id)
        - url": "https://ingrammicrosupport1700367431.zendesk.com/api/v2/users/36171835936404.json",
        - "id": 36171835936404
    im360_value: Shuang Lin Qu ("name")
    im360_name: shuanglin.qu@ingrammicro.com ("email")
*/

export default {
    retrieveData
};
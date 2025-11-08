import { Logger } from '@azure/functions';

import fetchUtil from '../utils/fetchUtil';
import envUtil from '../utils/envUtil';

const retrieveData = (log: Logger, jsonPath: string, itemId: string) => {

    const options = {
        method: 'get',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${envUtil.ZENDESK_API_KEY()}`,
            'accept-encoding': 'gzip, deflate, br'
        }
    };

    const baseUrl = envUtil.ZENDESK_API_BASEURL();
    var apiUrl =   `${baseUrl}/${jsonPath}/${itemId}.json`;
    return fetchUtil.fetchData(log, apiUrl, options);
};

export default {
    retrieveData
};
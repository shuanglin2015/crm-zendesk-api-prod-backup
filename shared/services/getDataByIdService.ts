import { Logger } from '@azure/functions';

import fetchUtil from '../utils/fetchUtil';
import envUtil from '../utils/envUtil';

const retrieveData = (log: Logger, itemId: string) => {

    log(`itemId in getDataByIdService: ${itemId}`);
    const options = {
        method: 'get',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${envUtil.ZENDESK_API_KEY()}`,
            'accept-encoding': 'gzip, deflate, br'
        }
    };

    const baseUrl = envUtil.ZENDESK_API_BASEURL();
    var apiUrl =   `${baseUrl}/tickets/${itemId}`;
    log(`apiUrl: ${apiUrl}`);
    try {
        log('Start to get response in getDataByIdService...');
        const response = fetchUtil.fetchData(log, apiUrl, options);
        return response;
    } catch (error) {
        log('Error from getDataByIdService try...catch');
        log.error(error ? error.message : 'Error from fetchUtil.fetchData of getDataByIdService');
        return `Error in fetchUtil.fetchData: ${error && error.message}`
    }
};

export default {
    retrieveData
};
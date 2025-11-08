import { Logger } from '@azure/functions';

import fetchUtil from '../utils/fetchUtil';
import envUtil from '../utils/envUtil';

const retrieveData = (log: Logger, resellerId: string, limit: string = '50') => {

    const options = {
        method: 'get',
        headers: {
            'Accept': 'application/json',
            'Authorization': `Basic ${envUtil.ZENDESK_API_KEY()}`,
            'accept-encoding': 'gzip, deflate, br'
        }
    };

    const baseUrl = envUtil.ZENDESK_API_BASEURL();
    // GBL - Support (30549887549716)
    // GBL - Partner Support (34539140148756)
    let apiUrl = `${baseUrl}/search?query=${resellerId}&(ticket_form_id:30549887549716 OR ticket_form_id:34539140148756)&per_page=${limit}&sort_by=updated_at&sort_order=desc`;

    return fetchUtil.fetchData(log, apiUrl, options);
};

export default {
    retrieveData
};
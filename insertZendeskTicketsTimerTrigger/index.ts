import { AzureFunction, Context, Logger } from "@azure/functions"
import searchService from '../shared/services/searchForTimerTriggerService';
import crmUtil from '../shared/utils/crmUtil';

const timerTrigger: AzureFunction = async function (context: Context, myTimer: any): Promise<void> {
    const log: Logger = context.log;
    let timeStamp = new Date().toISOString(); 
    log('HTTP trigger insertZendeskTicketsTimerTrigger function processed a request.', timeStamp);

    let limit = '50';
    const today = new Date();

    // default value: two days ago
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(today.getDate() - 2);
    let updatedDateStart = twoDaysAgo.toISOString().split('T')[0];
    
    // default value: two days after
    const twoDaysLater = new Date();
    twoDaysLater.setDate(today.getDate() + 2);
    let updatedDateEnd = twoDaysLater.toISOString().split('T')[0];

    // default value: 6 months ago
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(today.getMonth() - 6);
    let createdDateStart = sixMonthsAgo.toISOString().split('T')[0];

    // default value: two days after
    let createdDateEnd = twoDaysLater.toISOString().split('T')[0];

    try {
        let accessToken = await crmUtil.getAccessToken(log);
        // get latest updated at value from CRM
        const latestCreatedAt = await searchService.getLatestCreatedAtValue(accessToken, log);
        if (latestCreatedAt && latestCreatedAt != '-') {
            createdDateStart = latestCreatedAt;
        }
        let formName = '';
        let endPage = '';
        let ticketId = '';
        let withoutUpdatedDate = 'true';
        const items = await searchService.retrieveData(log, accessToken, updatedDateStart, updatedDateEnd, createdDateStart, createdDateEnd, limit, formName, endPage, ticketId, withoutUpdatedDate);
        let totalRecords = items && items.length;
        let result = `Created ${totalRecords} tickets`;
        log(result);
    } catch (error) {
        log("Error occurred in insertZendeskTicketsTimerTrigger API - " + error.message);
    }
};

export default timerTrigger;
